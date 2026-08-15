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
const { app, ready } = require("../server/app");

module.exports = async (req, res) => {
  try {
    await ready();
  } catch (error) {
    console.error("Database initialisation failed:", error.message);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, message: "Database unavailable" }));
    return;
  }
  return app(req, res);
};
