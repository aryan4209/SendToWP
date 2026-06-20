const { all, get, run } = require("../database/db");
const whatsappService = require("./whatsappService");

let processing = false;

const nextScheduleTime = (current, repeatType) => {
  const next = new Date(current);
  if (repeatType === "Daily") next.setDate(next.getDate() + 1);
  if (repeatType === "Weekly") next.setDate(next.getDate() + 7);
  if (repeatType === "Monthly") next.setMonth(next.getMonth() + 1);
  return next.toISOString();
};

const claimMessage = async (id) => {
  const now = new Date().toISOString();
  const result = await run(
    `UPDATE ScheduledMessages
     SET Status = 'Processing', UpdatedOn = ?, LastExecutionTime = ?
     WHERE Id = ? AND Status IN ('Pending', 'Failed')`,
    [now, now, id]
  );
  return result.changes === 1;
};

const processOne = async (message) => {
  if (!(await claimMessage(message.Id))) return;

  try {
    await whatsappService.sendMessage(message.Phone, message.Message);
    const now = new Date().toISOString();
    if (message.RepeatType === "None") {
      await run(
        `UPDATE ScheduledMessages
         SET Status = 'Sent', ErrorMessage = NULL, UpdatedOn = ?
         WHERE Id = ?`,
        [now, message.Id]
      );
    } else {
      await run(
        `UPDATE ScheduledMessages
         SET Status = 'Pending', ScheduleTime = ?, RetryCount = 0,
             ErrorMessage = NULL, UpdatedOn = ?
         WHERE Id = ?`,
        [nextScheduleTime(message.ScheduleTime, message.RepeatType), now, message.Id]
      );
    }
  } catch (error) {
    const retryLimit = Number(process.env.RETRY_LIMIT || 3);
    const retryCount = message.RetryCount + 1;
    const retryTime = new Date(Date.now() + 60_000).toISOString();
    await run(
      `UPDATE ScheduledMessages
       SET Status = 'Failed', RetryCount = ?, ErrorMessage = ?,
           ScheduleTime = ?, UpdatedOn = ?
       WHERE Id = ?`,
      [retryCount, error.message, retryTime, new Date().toISOString(), message.Id]
    );
    if (retryCount >= retryLimit) {
      console.error(`Message ${message.Id} reached retry limit: ${error.message}`);
    }
  }
};

const recoverInterruptedMessages = () =>
  run(
    `UPDATE ScheduledMessages
     SET Status = 'Pending', UpdatedOn = ?
     WHERE Status = 'Processing'`,
    [new Date().toISOString()]
  );

const processDueMessages = async () => {
  if (processing) return;
  processing = true;
  try {
    const retryLimit = Number(process.env.RETRY_LIMIT || 3);
    const dueMessages = await all(
      `SELECT * FROM ScheduledMessages
       WHERE ScheduleTime <= ?
       AND (Status = 'Pending' OR (Status = 'Failed' AND RetryCount < ?))
       ORDER BY ScheduleTime ASC`,
      [new Date().toISOString(), retryLimit]
    );
    for (const message of dueMessages) await processOne(message);
  } finally {
    processing = false;
  }
};

const getMessage = (id) => get("SELECT * FROM ScheduledMessages WHERE Id = ?", [id]);

module.exports = { processDueMessages, recoverInterruptedMessages, getMessage };
