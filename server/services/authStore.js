const path = require("path");
const fs = require("fs");

const { loadBaileys } = require("./baileys");
const { run, get, all } = require("../database");
const runtime = require("../config/runtime");

const authDirectory = process.env.WHATSAPP_AUTH_PATH
  ? path.resolve(process.env.WHATSAPP_AUTH_PATH)
  : path.join(__dirname, "..", "whatsapp-auth");

// ---------------------------------------------------------------- database ---

// Both dialects accept a large parameter list, but chunking keeps individual
// statements small and stays well inside SQLite's variable limit.
const CHUNK = 100;

const chunked = (items) => {
  const out = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
};

const writeRow = async (key, value) => {
  const { BufferJSON } = await loadBaileys();
  return run(
    `INSERT INTO "WhatsAppAuth" ("Key", "Value", "UpdatedOn") VALUES (?, ?, ?)
     ON CONFLICT ("Key") DO UPDATE SET "Value" = excluded."Value", "UpdatedOn" = excluded."UpdatedOn"`,
    [key, JSON.stringify(value, BufferJSON.replacer), new Date().toISOString()]
  );
};

const readRow = async (key) => {
  const rows = await readRows([key]);
  return rows.get(key) ?? null;
};

/**
 * Reads many keys in one statement.
 *
 * Baileys asks for signal keys in batches during the handshake. Querying them
 * one at a time meant hundreds of round trips, which on a serverless host with
 * a small connection pool serialised into a connection timeout.
 *
 * @returns {Promise<Map<string, any>>} present keys only
 */
async function readRows(keys) {
  const found = new Map();
  if (!keys.length) return found;

  const { BufferJSON } = await loadBaileys();

  for (const group of chunked(keys)) {
    const placeholders = group.map(() => "?").join(",");
    const rows = await all(
      `SELECT "Key", "Value" FROM "WhatsAppAuth" WHERE "Key" IN (${placeholders})`,
      group
    );
    for (const row of rows) {
      try {
        found.set(row.Key, JSON.parse(row.Value, BufferJSON.reviver));
      } catch (error) {
        console.error(`Corrupt WhatsApp auth row "${row.Key}":`, error.message);
      }
    }
  }
  return found;
}

/** Upserts many keys per statement, for the same reason as readRows. */
async function writeRows(entries) {
  if (!entries.length) return;
  const { BufferJSON } = await loadBaileys();
  const now = new Date().toISOString();

  for (const group of chunked(entries)) {
    const values = group.map(() => "(?, ?, ?)").join(", ");
    const params = [];
    for (const [key, value] of group) {
      params.push(key, JSON.stringify(value, BufferJSON.replacer), now);
    }
    await run(
      `INSERT INTO "WhatsAppAuth" ("Key", "Value", "UpdatedOn") VALUES ${values}
       ON CONFLICT ("Key") DO UPDATE SET "Value" = excluded."Value", "UpdatedOn" = excluded."UpdatedOn"`,
      params
    );
  }
}

const deleteRow = (key) => deleteRows([key]);

async function deleteRows(keys) {
  if (!keys.length) return;
  for (const group of chunked(keys)) {
    const placeholders = group.map(() => "?").join(",");
    await run(`DELETE FROM "WhatsAppAuth" WHERE "Key" IN (${placeholders})`, group);
  }
}

/**
 * Baileys auth state kept in the database instead of on disk, so the WhatsApp
 * session survives on hosts with an ephemeral filesystem.
 *
 * Mirrors the contract of Baileys' own useMultiFileAuthState: one `creds`
 * record plus one record per signal key, serialised with BufferJSON so the
 * Uint8Arrays survive the round trip.
 */
const useDatabaseAuthState = async () => {
  const { initAuthCreds, proto } = await loadBaileys();
  const creds = (await readRow("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        async get(type, ids) {
          const data = {};
          const found = await readRows(ids.map((id) => `${type}-${id}`));
          for (const id of ids) {
            let value = found.get(`${type}-${id}`) ?? null;
            // Baileys expects this one type as a protobuf instance, not a
            // plain object, or session decryption fails.
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }
          return data;
        },
        async set(data) {
          const upserts = [];
          const removals = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) upserts.push([key, value]);
              else removals.push(key);
            }
          }
          await writeRows(upserts);
          await deleteRows(removals);
        },
      },
    },
    saveCreds: () => writeRow("creds", creds),
  };
};

// -------------------------------------------------------------------- file ---

const removeCorruptCredentials = () => {
  const credentialsFile = path.join(authDirectory, "creds.json");
  if (fs.existsSync(credentialsFile) && fs.statSync(credentialsFile).size === 0) {
    fs.rmSync(authDirectory, { recursive: true, force: true });
    console.warn("Removed incomplete WhatsApp credentials from an interrupted pairing attempt");
  }
};

// ------------------------------------------------------------------ public ---

const usingDatabase = runtime.authStore === "database";

const loadAuthState = async () => {
  if (usingDatabase) return useDatabaseAuthState();
  removeCorruptCredentials();
  const { useMultiFileAuthState } = await loadBaileys();
  return useMultiFileAuthState(authDirectory);
};

/** Wipes the stored session so the next connection produces a fresh pairing QR. */
const clearAuthState = async () => {
  if (usingDatabase) {
    await run(`DELETE FROM "WhatsAppAuth"`);
    return;
  }
  fs.rmSync(authDirectory, { recursive: true, force: true });
};

/** True when a session already exists, so we know whether to expect a QR. */
const hasAuthState = async () => {
  if (usingDatabase) {
    const row = await get(`SELECT "Key" FROM "WhatsAppAuth" WHERE "Key" = 'creds'`);
    return Boolean(row);
  }
  return fs.existsSync(path.join(authDirectory, "creds.json"));
};

const describe = () =>
  usingDatabase ? "database" : `files (${authDirectory})`;

module.exports = { loadAuthState, clearAuthState, hasAuthState, describe, usingDatabase };
