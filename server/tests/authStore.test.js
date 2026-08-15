/**
 * Round-trip test for the database-backed WhatsApp auth store.
 *
 * Baileys only persists credentials once pairing completes, so simply booting
 * the app never exercises the write path. This drives the store directly with
 * the same shapes Baileys uses - Uint8Array keys, nested signal records and
 * deletions - and asserts everything survives serialisation.
 *
 * Run with: npm run test:authstore
 */
process.env.AUTH_STORE = "database";

const os = require("os");
const path = require("path");
const fs = require("fs");

// Honours DATABASE_URL when it is set, so CI runs this same file against a real
// Postgres as well as SQLite. Only the SQLite run needs a scratch file.
const usingPostgres = Boolean(process.env.DATABASE_URL);
const tempDir = usingPostgres ? null : fs.mkdtempSync(path.join(os.tmpdir(), "sendtowp-authstore-"));
if (tempDir) process.env.DB_PATH = path.join(tempDir, "test.db");

const { initialize, get, close } = require("../database");
const authStore = require("../services/authStore");

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

const sameBytes = (a, b) =>
  a instanceof Uint8Array &&
  b instanceof Uint8Array &&
  a.length === b.length &&
  Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

const main = async () => {
  await initialize();

  // This test wipes the session table. Against a real deployment's database
  // that unlinks WhatsApp and forces a re-pair, so refuse to run when a live
  // session is present unless the caller insists.
  const live = await get(`SELECT "Key" FROM "WhatsAppAuth" WHERE "Key" = 'creds'`);
  if (live && process.env.ALLOW_DESTRUCTIVE_TEST !== "1") {
    console.error("\nREFUSING TO RUN: this database holds a paired WhatsApp session.");
    console.error("Running would delete it and force you to scan a new QR code.");
    console.error("Point DATABASE_URL at a scratch database, or set");
    console.error("ALLOW_DESTRUCTIVE_TEST=1 if you really mean to wipe it.\n");
    await close();
    process.exit(1);
  }

  // A shared scratch database may carry rows from an earlier run.
  await authStore.clearAuthState();

  console.log("\n== fresh state ==");
  const first = await authStore.loadAuthState();
  check("generates credentials when the store is empty", Boolean(first.state.creds));
  check("registrationId is a number", typeof first.state.creds.registrationId === "number");
  check("nothing is paired yet", (await authStore.hasAuthState()) === false);

  console.log("\n== saveCreds writes ==");
  const registrationId = first.state.creds.registrationId;
  const noisePrivate = first.state.creds.noiseKey.private;
  first.state.creds.me = { id: "911234567890:1@s.whatsapp.net", name: "Test Device" };
  await first.saveCreds();

  const row = await get('SELECT "Value" FROM "WhatsAppAuth" WHERE "Key" = ?', ["creds"]);
  check("a creds row exists after saveCreds", Boolean(row));
  check("hasAuthState now reports paired", (await authStore.hasAuthState()) === true);

  console.log("\n== reload round-trip ==");
  const second = await authStore.loadAuthState();
  check("registrationId survives", second.state.creds.registrationId === registrationId);
  check("me.id survives", second.state.creds.me?.id === "911234567890:1@s.whatsapp.net");
  check(
    "noiseKey.private is still a Uint8Array of the same bytes",
    sameBytes(second.state.creds.noiseKey.private, noisePrivate)
  );
  check(
    "signedIdentityKey survives as bytes",
    second.state.creds.signedIdentityKey.private instanceof Uint8Array
  );
  check(
    "signedPreKey.signature survives as bytes",
    second.state.creds.signedPreKey.signature instanceof Uint8Array
  );

  console.log("\n== signal key storage ==");
  const preKey = {
    public: new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252]),
    private: new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]),
  };
  await second.state.keys.set({ "pre-key": { 1: preKey } });

  const fetched = await second.state.keys.get("pre-key", ["1"]);
  check("stored pre-key comes back", Boolean(fetched["1"]));
  check("pre-key public bytes match", sameBytes(fetched["1"]?.public, preKey.public));
  check("pre-key private bytes match", sameBytes(fetched["1"]?.private, preKey.private));

  console.log("\n== multiple keys and misses ==");
  await second.state.keys.set({
    session: { "a@s.whatsapp.net": { record: "session-a" }, "b@s.whatsapp.net": { record: "session-b" } },
  });
  const sessions = await second.state.keys.get("session", [
    "a@s.whatsapp.net",
    "b@s.whatsapp.net",
    "missing@s.whatsapp.net",
  ]);
  check("first session returned", sessions["a@s.whatsapp.net"]?.record === "session-a");
  check("second session returned", sessions["b@s.whatsapp.net"]?.record === "session-b");
  check("unknown id resolves to null", sessions["missing@s.whatsapp.net"] === null);

  console.log("\n== deletion ==");
  await second.state.keys.set({ "pre-key": { 1: null } });
  const afterDelete = await second.state.keys.get("pre-key", ["1"]);
  check("null value removes the key", afterDelete["1"] === null);

  console.log("\n== clearAuthState ==");
  await authStore.clearAuthState();
  check("store is empty again", (await authStore.hasAuthState()) === false);
  const third = await authStore.loadAuthState();
  check(
    "a brand new identity is generated after clearing",
    third.state.creds.registrationId !== registrationId || third.state.creds.me === undefined
  );

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
