const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const configuredPath = process.env.DB_PATH || "./database/sendtowp.db";
const dbPath = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(__dirname, "..", configuredPath.replace(/^\.\/database[\\/]/, "database/"));

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath, (error) => {
  if (error) console.error("Unable to open database:", error.message);
});

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });

const columnExists = async (table, column) => {
  const columns = await all(`PRAGMA table_info(${table})`);
  return columns.some((entry) => entry.name === column);
};

/**
 * Creates the schema and applies migrations. Must finish before the API starts
 * serving requests, so app.js awaits it.
 */
const initialize = async () => {
  await run("PRAGMA journal_mode = WAL");
  await run("PRAGMA busy_timeout = 5000");
  await run("PRAGMA foreign_keys = ON");

  await run(`
    CREATE TABLE IF NOT EXISTS Users (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Name TEXT NOT NULL,
      Email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      PasswordHash TEXT NOT NULL,
      CreatedOn TEXT NOT NULL,
      UpdatedOn TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS ScheduledMessages (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      UserId INTEGER REFERENCES Users(Id) ON DELETE CASCADE,
      Phone TEXT NOT NULL,
      Message TEXT NOT NULL,
      ScheduleTime TEXT NOT NULL,
      RepeatType TEXT NOT NULL DEFAULT 'None',
      Status TEXT NOT NULL DEFAULT 'Pending',
      RetryCount INTEGER NOT NULL DEFAULT 0,
      ErrorMessage TEXT,
      CreatedOn TEXT NOT NULL,
      UpdatedOn TEXT NOT NULL,
      LastExecutionTime TEXT
    )
  `);

  // Databases created before accounts existed have no UserId column.
  if (!(await columnExists("ScheduledMessages", "UserId"))) {
    await run("ALTER TABLE ScheduledMessages ADD COLUMN UserId INTEGER");
    console.log("Migration: added UserId column to ScheduledMessages");
  }

  await run(
    "CREATE INDEX IF NOT EXISTS IX_ScheduledMessages_Status_ScheduleTime ON ScheduledMessages(Status, ScheduleTime)"
  );
  await run("CREATE INDEX IF NOT EXISTS IX_ScheduledMessages_UserId ON ScheduledMessages(UserId)");
  await run("CREATE INDEX IF NOT EXISTS IX_ScheduledMessages_Phone ON ScheduledMessages(Phone)");

  // The AI auto reply feature was removed; drop its tables so old databases
  // do not keep dead data around.
  await run("DROP TABLE IF EXISTS AutoReplySettings");
  await run("DROP TABLE IF EXISTS AutoReplyHistory");
};

module.exports = { db, run, get, all, initialize };
