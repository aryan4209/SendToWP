/**
 * Keeps free-tier infrastructure from going to sleep, and keeps the database
 * from growing without bound.
 *
 * There are two different problems here and they need different fixes:
 *
 *   The database pausing.  Supabase pauses a free project after 7 days of
 *   "insufficient activity" and needs a manual restore from the dashboard. A
 *   periodic write from inside the app is enough to prevent that. Neon instead
 *   auto-suspends and auto-resumes in about a second, so it needs no help - and
 *   keeping it awake would waste its 100 CU-hour monthly allowance, which is
 *   why the default interval here is hours rather than minutes.
 *
 *   The web service spinning down.  Render's free tier stops the process after
 *   15 minutes without inbound traffic. Nothing inside a stopped process can
 *   wake itself, so that one can only be solved from outside, by something
 *   calling GET /api/keepalive. See .github/workflows/keepalive.yml.
 */
const { run, get, all } = require("../database");

const HEARTBEAT_KEY = "heartbeat";
const PURGE_KEY = "last-purge";

const intervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS || 6 * 60 * 60 * 1000);
const retentionDays = Number(process.env.MESSAGE_RETENTION_DAYS || 90);

let timer = null;
let lastWriteAt = 0;

const writeState = (key, value) =>
  run(
    `INSERT INTO "SystemState" ("Key", "Value", "UpdatedOn") VALUES (?, ?, ?)
     ON CONFLICT ("Key") DO UPDATE SET "Value" = excluded."Value", "UpdatedOn" = excluded."UpdatedOn"`,
    [key, value, new Date().toISOString()]
  );

const readState = (key) =>
  get(`SELECT "Value", "UpdatedOn" FROM "SystemState" WHERE "Key" = ?`, [key]);

/**
 * Records a heartbeat. Throttled so a public endpoint cannot be used to hammer
 * the database - reads still confirm liveness, only the write is rate limited.
 *
 * @param {number} minGapMs skip the write if one happened more recently
 */
const touch = async (minGapMs = 60_000) => {
  const now = Date.now();
  const wrote = now - lastWriteAt >= minGapMs;

  if (wrote) {
    await writeState(HEARTBEAT_KEY, new Date(now).toISOString());
    lastWriteAt = now;
  }

  const row = await readState(HEARTBEAT_KEY);
  return { wrote, lastHeartbeat: row?.UpdatedOn || null };
};

/**
 * Deletes one-off messages that were sent long ago, so a 0.5 GB free database
 * cannot slowly fill up. Recurring messages return to Pending after sending and
 * are never touched. Set MESSAGE_RETENTION_DAYS=0 to disable.
 */
const purgeOldMessages = async () => {
  if (!retentionDays || retentionDays <= 0) return { purged: 0, skipped: "disabled" };

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const result = await run(
    `DELETE FROM "ScheduledMessages"
     WHERE "Status" = 'Sent' AND "RepeatType" = 'None' AND "UpdatedOn" < ?`,
    [cutoff]
  );

  await writeState(PURGE_KEY, new Date().toISOString());
  if (result.changes) {
    console.log(`Retention: removed ${result.changes} message(s) sent before ${cutoff}`);
  }
  return { purged: result.changes || 0, cutoff };
};

/** Runs at most once a day, whichever entry point calls it. */
const purgeIfDue = async () => {
  const last = await readState(PURGE_KEY);
  if (last?.UpdatedOn && Date.now() - new Date(last.UpdatedOn).getTime() < 24 * 60 * 60 * 1000) {
    return { purged: 0, skipped: "ran within the last 24h" };
  }
  return purgeOldMessages();
};

/** Starts the in-process heartbeat. Only meaningful on a persistent host. */
const start = () => {
  if (timer) return;

  const tick = () =>
    touch(0)
      .then(() => purgeIfDue())
      .catch((error) => console.error("Heartbeat failed:", error.message));

  tick();
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  console.log(`Heartbeat started (every ${Math.round(intervalMs / 60000)} min, retention ${retentionDays}d)`);
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

/** Snapshot for the keepalive endpoint. */
const status = async () => {
  const rows = await all(`SELECT "Key", "UpdatedOn" FROM "SystemState"`);
  return rows.reduce((acc, row) => ({ ...acc, [row.Key]: row.UpdatedOn }), {});
};

module.exports = { touch, purgeOldMessages, purgeIfDue, start, stop, status };
