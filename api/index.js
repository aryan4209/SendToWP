/**
 * Vercel serverless entry point.
 *
 * Vercel imports this module and calls the exported handler per request, so
 * there is no listener and no in-process cron here. Sending is driven by
 * Vercel Cron calling POST /api/cron/run (see vercel.json).
 *
 * Requires DATABASE_URL - a serverless filesystem cannot hold the SQLite file
 * or the WhatsApp session between invocations.
 */

// Loading the app can fail before any request is handled - a missing
// JWT_SECRET throws by design under NODE_ENV=production, for example. Without
// this guard the platform returns an empty 500 and the cause is invisible
// unless you can read the function logs.
let appModule = null;
let loadError = null;
try {
  appModule = require("../server/app");
} catch (error) {
  loadError = error;
  console.error("Failed to load the server:", error);
}

/** Strips anything resembling credentials before echoing an error outward. */
const safeMessage = (error) =>
  String(error?.message || "Unknown error")
    .replace(/[a-zA-Z]+:\/\/[^\s]*@[^\s]*/g, "<redacted-connection-string>")
    .slice(0, 300);

const fail = (res, status, message, detail) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ success: false, message, detail }));
};

module.exports = async (req, res) => {
  if (loadError) {
    return fail(res, 500, "Server failed to start", safeMessage(loadError));
  }

  try {
    await appModule.ready();
  } catch (error) {
    console.error("Database initialisation failed:", error);
    return fail(res, 500, "Database unavailable", safeMessage(error));
  }

  return appModule.app(req, res);
};
