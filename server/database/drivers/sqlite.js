const path = require("path");
const fs = require("fs");

/**
 * SQLite driver. Used whenever DATABASE_URL is absent, which covers local
 * development, a VPS, Docker, and any host with a persistent disk.
 */
const createSqliteDriver = () => {
  // Required lazily so a Postgres-only deployment never has to install the
  // native sqlite3 binding.
  const sqlite3 = require("sqlite3").verbose();

  const configured = process.env.DB_PATH || "./database/sendtowp.db";
  const dbPath = path.isAbsolute(configured)
    ? configured
    : path.resolve(__dirname, "..", "..", configured.replace(/^\.\/database[\\/]/, "database/"));

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
      db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
    });

  const all = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows || [])));
    });

  return {
    dialect: "sqlite",
    describe: () => `sqlite (${dbPath})`,
    run,
    get,
    all,
    // SQLite hands back the row id on the statement itself, so no RETURNING.
    insert: (sql, params = []) => run(sql, params),
    async applyPragmas() {
      await run("PRAGMA journal_mode = WAL");
      await run("PRAGMA busy_timeout = 5000");
      await run("PRAGMA foreign_keys = ON");
    },
    async columnExists(table, column) {
      const columns = await all(`PRAGMA table_info("${table}")`);
      return columns.some((entry) => entry.name === column);
    },
    close: () =>
      new Promise((resolve) => {
        db.close(() => resolve());
      }),
  };
};

module.exports = createSqliteDriver;
