const path = require("path");
const fs = require("fs");

const { loadBaileys } = require("./baileys");
const { run, get } = require("../database");
const runtime = require("../config/runtime");

const authDirectory = process.env.WHATSAPP_AUTH_PATH
  ? path.resolve(process.env.WHATSAPP_AUTH_PATH)
  : path.join(__dirname, "..", "whatsapp-auth");

// ---------------------------------------------------------------- database ---

const writeRow = async (key, value) => {
  const { BufferJSON } = await loadBaileys();
  return run(
    `INSERT INTO "WhatsAppAuth" ("Key", "Value", "UpdatedOn") VALUES (?, ?, ?)
     ON CONFLICT ("Key") DO UPDATE SET "Value" = excluded."Value", "UpdatedOn" = excluded."UpdatedOn"`,
    [key, JSON.stringify(value, BufferJSON.replacer), new Date().toISOString()]
  );
};

const readRow = async (key) => {
  const row = await get(`SELECT "Value" FROM "WhatsAppAuth" WHERE "Key" = ?`, [key]);
  if (!row) return null;
  try {
    const { BufferJSON } = await loadBaileys();
    return JSON.parse(row.Value, BufferJSON.reviver);
  } catch (error) {
    console.error(`Corrupt WhatsApp auth row "${key}":`, error.message);
    return null;
  }
};

const deleteRow = (key) => run(`DELETE FROM "WhatsAppAuth" WHERE "Key" = ?`, [key]);

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
          await Promise.all(
            ids.map(async (id) => {
              let value = await readRow(`${type}-${id}`);
              // Baileys expects this one type as a protobuf instance, not a
              // plain object, or session decryption fails.
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        async set(data) {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeRow(key, value) : deleteRow(key));
            }
          }
          await Promise.all(tasks);
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
