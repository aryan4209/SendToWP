/**
 * Entry point for hosts that keep a process alive: local development, a VPS,
 * Docker, Render, Railway, Fly. Starts the HTTP listener, the in-process cron,
 * and holds the WhatsApp socket open.
 *
 * Vercel and other serverless hosts use api/index.js instead.
 */
const { app, ready, runtime } = require("./app");
const whatsappService = require("./services/whatsappService");
const startScheduler = require("./scheduler/scheduler");

const port = Number(process.env.PORT || 3000);

const start = async () => {
  await ready();

  const server = app.listen(port, async () => {
    console.log(`SendToWP server running on http://localhost:${port}`);
    console.log(`Mode: ${runtime.mode} | storage: ${runtime.dialect} | session: ${runtime.authStore}`);

    await startScheduler();
    whatsappService
      .connect()
      .catch((error) => console.error("WhatsApp connect failed:", error.message));
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      whatsappService.disconnect().finally(() => process.exit(0));
    });
    // Do not hang forever if a socket refuses to close.
    setTimeout(() => process.exit(0), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((error) => {
  console.error("Failed to start SendToWP:", error.message);
  process.exit(1);
});
