/**
 * Storage entry point.
 *
 * Picks a driver from the environment and exposes one query API to the rest of
 * the server. Nothing above this layer knows or cares which database is behind
 * it, which is what lets the same build run on a VPS and on Vercel.
 */
const runtime = require("../config/runtime");
const { tables, indexes, drops } = require("./schema");

const driver =
  runtime.dialect === "postgres"
    ? require("./drivers/postgres")()
    : require("./drivers/sqlite")();

const run = (sql, params) => driver.run(sql, params);
const get = (sql, params) => driver.get(sql, params);
const all = (sql, params) => driver.all(sql, params);
const insert = (sql, params) => driver.insert(sql, params);

/**
 * Creates the schema and applies migrations. Must finish before the API serves
 * requests, so both entry points await it.
 */
const initialize = async () => {
  await driver.applyPragmas();

  for (const statement of tables[driver.dialect]) {
    await driver.run(statement);
  }

  // Databases created before accounts existed have no UserId column.
  if (!(await driver.columnExists("ScheduledMessages", "UserId"))) {
    await driver.run(`ALTER TABLE "ScheduledMessages" ADD COLUMN "UserId" INTEGER`);
    console.log("Migration: added UserId column to ScheduledMessages");
  }

  for (const statement of indexes) {
    await driver.run(statement);
  }
  for (const statement of drops) {
    await driver.run(statement);
  }

  console.log(`Database ready: ${driver.describe()}`);
};

module.exports = { run, get, all, insert, initialize, close: driver.close, dialect: driver.dialect };
