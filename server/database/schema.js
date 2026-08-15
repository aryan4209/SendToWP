/**
 * Schema definitions per SQL dialect.
 *
 * Every identifier is double quoted. SQLite and Postgres both read that as a
 * case-preserving identifier, which is what lets a single set of queries run on
 * both - unquoted PascalCase would be folded to lowercase by Postgres and break
 * every `row.ScheduleTime` in the codebase.
 *
 * Timestamps are stored as ISO-8601 TEXT in both dialects so values round-trip
 * identically and no timezone conversion ever happens in the driver.
 */

const tables = {
  sqlite: [
    `CREATE TABLE IF NOT EXISTS "Users" (
      "Id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "Name" TEXT NOT NULL,
      "Email" TEXT NOT NULL UNIQUE,
      "PasswordHash" TEXT NOT NULL,
      "CreatedOn" TEXT NOT NULL,
      "UpdatedOn" TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "ScheduledMessages" (
      "Id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "UserId" INTEGER REFERENCES "Users"("Id") ON DELETE CASCADE,
      "Phone" TEXT NOT NULL,
      "Message" TEXT NOT NULL,
      "ScheduleTime" TEXT NOT NULL,
      "RepeatType" TEXT NOT NULL DEFAULT 'None',
      "Status" TEXT NOT NULL DEFAULT 'Pending',
      "RetryCount" INTEGER NOT NULL DEFAULT 0,
      "ErrorMessage" TEXT,
      "CreatedOn" TEXT NOT NULL,
      "UpdatedOn" TEXT NOT NULL,
      "LastExecutionTime" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "WhatsAppAuth" (
      "Key" TEXT PRIMARY KEY,
      "Value" TEXT NOT NULL,
      "UpdatedOn" TEXT NOT NULL
    )`,
    // Heartbeat and last-run bookkeeping. Writing here is also what keeps a
    // free-tier database from being judged inactive.
    `CREATE TABLE IF NOT EXISTS "SystemState" (
      "Key" TEXT PRIMARY KEY,
      "Value" TEXT,
      "UpdatedOn" TEXT NOT NULL
    )`,
  ],
  postgres: [
    `CREATE TABLE IF NOT EXISTS "Users" (
      "Id" SERIAL PRIMARY KEY,
      "Name" TEXT NOT NULL,
      "Email" TEXT NOT NULL UNIQUE,
      "PasswordHash" TEXT NOT NULL,
      "CreatedOn" TEXT NOT NULL,
      "UpdatedOn" TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "ScheduledMessages" (
      "Id" SERIAL PRIMARY KEY,
      "UserId" INTEGER REFERENCES "Users"("Id") ON DELETE CASCADE,
      "Phone" TEXT NOT NULL,
      "Message" TEXT NOT NULL,
      "ScheduleTime" TEXT NOT NULL,
      "RepeatType" TEXT NOT NULL DEFAULT 'None',
      "Status" TEXT NOT NULL DEFAULT 'Pending',
      "RetryCount" INTEGER NOT NULL DEFAULT 0,
      "ErrorMessage" TEXT,
      "CreatedOn" TEXT NOT NULL,
      "UpdatedOn" TEXT NOT NULL,
      "LastExecutionTime" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "WhatsAppAuth" (
      "Key" TEXT PRIMARY KEY,
      "Value" TEXT NOT NULL,
      "UpdatedOn" TEXT NOT NULL
    )`,
    // Heartbeat and last-run bookkeeping. Writing here is also what keeps a
    // free-tier database from being judged inactive.
    `CREATE TABLE IF NOT EXISTS "SystemState" (
      "Key" TEXT PRIMARY KEY,
      "Value" TEXT,
      "UpdatedOn" TEXT NOT NULL
    )`,
  ],
};

const indexes = [
  `CREATE INDEX IF NOT EXISTS "IX_ScheduledMessages_Status_ScheduleTime"
     ON "ScheduledMessages" ("Status", "ScheduleTime")`,
  `CREATE INDEX IF NOT EXISTS "IX_ScheduledMessages_UserId"
     ON "ScheduledMessages" ("UserId")`,
  `CREATE INDEX IF NOT EXISTS "IX_ScheduledMessages_Phone"
     ON "ScheduledMessages" ("Phone")`,
];

// The AI auto reply feature was removed; drop its tables from older databases.
const drops = [
  `DROP TABLE IF EXISTS "AutoReplySettings"`,
  `DROP TABLE IF EXISTS "AutoReplyHistory"`,
];

module.exports = { tables, indexes, drops };
