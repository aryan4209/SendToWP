/**
 * Retention purge test.
 *
 * This is the only code in the app that deletes a user's messages without them
 * asking, so the exact boundary matters: only one-off messages, only ones
 * already sent, only ones older than the cutoff. Everything else must survive.
 *
 * Run with: npm run test:retention
 */
const os = require("os");
const path = require("path");
const fs = require("fs");

const usingPostgres = Boolean(process.env.DATABASE_URL);
const tempDir = usingPostgres ? null : fs.mkdtempSync(path.join(os.tmpdir(), "sendtowp-retention-"));
if (tempDir) process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.MESSAGE_RETENTION_DAYS = "90";

const { initialize, run, all, insert, close } = require("../database");
const heartbeat = require("../services/heartbeatService");

let passed = 0;
let failed = 0;

const check = (label, condition) => {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed += 1;
  } else {
    console.log(`  FAIL  ${label}`);
    failed += 1;
  }
};

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

let userId;

const addMessage = async (label, status, repeatType, updatedOn) => {
  const result = await insert(
    `INSERT INTO "ScheduledMessages"
     ("UserId", "Phone", "Message", "ScheduleTime", "RepeatType", "Status", "RetryCount", "CreatedOn", "UpdatedOn")
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [userId, "919999999999", label, updatedOn, repeatType, status, updatedOn, updatedOn]
  );
  return result.id;
};

const survives = async (label) => {
  const rows = await all(`SELECT "Id" FROM "ScheduledMessages" WHERE "Message" = ?`, [label]);
  return rows.length === 1;
};

const main = async () => {
  await initialize();

  // This test empties ScheduledMessages. Against a real deployment that throws
  // away every message the user has queued, so refuse unless it is clearly a
  // scratch database.
  const existing = await all(`SELECT "Id" FROM "ScheduledMessages"`);
  if (existing.length && process.env.ALLOW_DESTRUCTIVE_TEST !== "1") {
    console.error(`\nREFUSING TO RUN: this database holds ${existing.length} scheduled message(s).`);
    console.error("Running would delete all of them.");
    console.error("Point DATABASE_URL at a scratch database, or set");
    console.error("ALLOW_DESTRUCTIVE_TEST=1 if you really mean to wipe it.\n");
    await close();
    process.exit(1);
  }

  await run(`DELETE FROM "ScheduledMessages"`);
  await run(`DELETE FROM "SystemState"`);
  await run(`DELETE FROM "Users" WHERE "Email" = ?`, ["retention@test.local"]);

  const now = new Date().toISOString();
  const owner = await insert(
    `INSERT INTO "Users" ("Name", "Email", "PasswordHash", "CreatedOn", "UpdatedOn")
     VALUES (?, ?, ?, ?, ?)`,
    ["Retention Owner", "retention@test.local", "x", now, now]
  );
  userId = owner.id;

  console.log("\n== seeding ==");
  await addMessage("old-sent-oneoff", "Sent", "None", daysAgo(120));
  await addMessage("recent-sent-oneoff", "Sent", "None", daysAgo(10));
  await addMessage("old-sent-recurring", "Sent", "Daily", daysAgo(120));
  await addMessage("old-pending", "Pending", "None", daysAgo(120));
  await addMessage("old-failed", "Failed", "None", daysAgo(120));
  await addMessage("old-processing", "Processing", "None", daysAgo(120));
  const before = await all(`SELECT "Id" FROM "ScheduledMessages"`);
  check("six messages seeded", before.length === 6);

  console.log("\n== purge ==");
  const result = await heartbeat.purgeOldMessages();
  check("exactly one message purged", result.purged === 1);

  console.log("\n== the right one was removed ==");
  check("old sent one-off is gone", (await survives("old-sent-oneoff")) === false);

  console.log("\n== everything else survived ==");
  check("recent sent one-off survives", await survives("recent-sent-oneoff"));
  check("old sent RECURRING survives", await survives("old-sent-recurring"));
  check("old pending survives", await survives("old-pending"));
  check("old failed survives", await survives("old-failed"));
  check("old processing survives", await survives("old-processing"));

  console.log("\n== runs at most once a day ==");
  await addMessage("another-old-sent", "Sent", "None", daysAgo(200));
  const second = await heartbeat.purgeIfDue();
  check("second run within 24h is skipped", second.purged === 0 && Boolean(second.skipped));
  check("so the new old message is still there", await survives("another-old-sent"));

  console.log("\n== disabled by configuration ==");
  delete require.cache[require.resolve("../services/heartbeatService")];
  process.env.MESSAGE_RETENTION_DAYS = "0";
  const disabled = require("../services/heartbeatService");
  const off = await disabled.purgeOldMessages();
  check("retention 0 purges nothing", off.purged === 0 && off.skipped === "disabled");
  check("message still present with retention off", await survives("another-old-sent"));

  await run(`DELETE FROM "ScheduledMessages"`);
  await run(`DELETE FROM "SystemState"`);
  await run(`DELETE FROM "Users" WHERE "Id" = ?`, [userId]);
  await close();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });

  console.log("\n----------------------------------------");
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  console.log("----------------------------------------");
  process.exit(failed > 0 ? 1 : 0);
};

main().catch((error) => {
  console.error("\nTest crashed:", error);
  process.exit(1);
});
