const { all, get, run } = require("../database/db");
const whatsappService = require("./whatsappService");

let processing = false;

const retryLimit = () => Number(process.env.RETRY_LIMIT || 3);

/**
 * Advances a recurring schedule past "now". If the server was offline for a
 * while, stepping only once would leave the message due again immediately and
 * fire a burst of catch-up sends.
 */
const nextScheduleTime = (current, repeatType) => {
  const next = new Date(current);
  const now = Date.now();
  let guard = 0;

  do {
    if (repeatType === "Daily") next.setDate(next.getDate() + 1);
    else if (repeatType === "Weekly") next.setDate(next.getDate() + 7);
    else if (repeatType === "Monthly") next.setMonth(next.getMonth() + 1);
    else return next.toISOString();
    guard += 1;
  } while (next.getTime() <= now && guard < 1000);

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
    const limit = retryLimit();
    const retryCount = message.RetryCount + 1;
    // Back off further on each attempt: 1, 2, 4... minutes.
    const backoffMs = Math.min(2 ** (retryCount - 1), 30) * 60_000;
    const now = new Date().toISOString();

    await run(
      `UPDATE ScheduledMessages
       SET Status = 'Failed', RetryCount = ?, ErrorMessage = ?,
           ScheduleTime = ?, UpdatedOn = ?
       WHERE Id = ?`,
      [retryCount, error.message, new Date(Date.now() + backoffMs).toISOString(), now, message.Id]
    );

    if (retryCount >= limit) {
      console.error(`Message ${message.Id} gave up after ${retryCount} attempts: ${error.message}`);
    } else {
      console.warn(`Message ${message.Id} failed (attempt ${retryCount}/${limit}): ${error.message}`);
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

  // Attempting a send while the socket is down would fail every due message and
  // burn its retry budget for a reason that has nothing to do with the message.
  if (!whatsappService.isConnected()) return;

  processing = true;
  try {
    const dueMessages = await all(
      `SELECT * FROM ScheduledMessages
       WHERE ScheduleTime <= ?
       AND (Status = 'Pending' OR (Status = 'Failed' AND RetryCount < ?))
       ORDER BY ScheduleTime ASC`,
      [new Date().toISOString(), retryLimit()]
    );

    for (const message of dueMessages) {
      if (!whatsappService.isConnected()) break;
      await processOne(message);
    }
  } catch (error) {
    console.error("Scheduler run failed:", error.message);
  } finally {
    processing = false;
  }
};

const getMessage = (id) => get("SELECT * FROM ScheduledMessages WHERE Id = ?", [id]);

module.exports = { processDueMessages, recoverInterruptedMessages, getMessage, nextScheduleTime };
