/**
 * Detects how and where this process is running, so the rest of the server can
 * pick the right storage and scheduling strategy without any per-host code.
 *
 *   dialect        "postgres" when DATABASE_URL is set, otherwise "sqlite"
 *   mode           "serverless" on Vercel/Lambda, otherwise "persistent"
 *   authStore      "database" when there is no writable disk, otherwise "file"
 */
const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY
);

const dialect = process.env.DATABASE_URL ? "postgres" : "sqlite";

const mode = process.env.RUNTIME_MODE || (isServerless ? "serverless" : "persistent");

// A serverless filesystem is wiped between invocations, so the WhatsApp session
// has to live in the database there. Anywhere else a plain directory is simpler
// and is what Baileys expects out of the box.
const authStore =
  process.env.AUTH_STORE || (mode === "serverless" ? "database" : "file");

if (mode === "serverless" && dialect === "sqlite") {
  console.warn(
    "Running serverless with SQLite. The database lives on an ephemeral disk and " +
      "will be lost between invocations - set DATABASE_URL to a hosted Postgres."
  );
}

module.exports = {
  dialect,
  mode,
  authStore,
  isServerless,
  isPersistent: mode === "persistent",
  // Long-lived socket on a real server; connect only when there is work to do
  // when we cannot keep a process alive.
  keepWhatsappConnected: mode === "persistent",
  cronSecret: process.env.CRON_SECRET || "",
};
