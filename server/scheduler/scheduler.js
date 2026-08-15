const cron = require("node-cron");
const runtime = require("../config/runtime");
const { processDueMessages, recoverInterruptedMessages } = require("../services/schedulerService");

/**
 * Starts the in-process scheduler.
 *
 * Only meaningful where the process outlives a single request. On serverless
 * hosts nothing is started here - an external trigger calls POST /api/cron/run
 * instead (Vercel Cron, cron-job.org, UptimeRobot...).
 */
const startScheduler = async () => {
  if (!runtime.isPersistent) {
    console.log("Serverless mode: in-process cron disabled, use POST /api/cron/run to trigger sends");
    return;
  }

  await recoverInterruptedMessages();
  cron.schedule("* * * * *", () => processDueMessages().catch(console.error));
  processDueMessages().catch(console.error);
  console.log("Message scheduler started (every minute)");
};

module.exports = startScheduler;
