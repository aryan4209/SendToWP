const cron = require("node-cron");
const { processDueMessages, recoverInterruptedMessages } = require("../services/schedulerService");

const startScheduler = async () => {
  await recoverInterruptedMessages();
  cron.schedule("* * * * *", () => processDueMessages().catch(console.error));
  processDueMessages().catch(console.error);
  console.log("Message scheduler started");
};

module.exports = startScheduler;
