/**
 * Runs the Vercel entry point (api/index.js) behind a plain HTTP server, so the
 * serverless code path can be exercised without deploying.
 *
 * This is not a perfect emulation - a real deployment gives every request a
 * cold, isolated instance - but it does verify the parts most likely to be
 * wrong: that the handler is exported correctly, that database initialisation
 * is awaited before the first request, that serverless mode is detected, and
 * that the cron trigger and on-demand WhatsApp connect behave.
 *
 *   node scripts/vercel-local.js
 */
process.env.VERCEL = process.env.VERCEL || "1";

const http = require("http");
const handler = require("../api/index.js");

const port = Number(process.env.PORT || 3100);

http
  .createServer((req, res) => {
    // Vercel invokes the handler per request; mirror that, including surfacing
    // a rejected promise as a 500 rather than an unhandled rejection.
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error("Handler threw:", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: false, message: "Handler error" }));
      }
    });
  })
  .listen(port, () => {
    console.log(`Vercel handler emulated on http://127.0.0.1:${port}`);
  });
