const express = require("express");
const crypto = require("crypto");
const runtime = require("../config/runtime");
const { processDueMessages, recoverInterruptedMessages } = require("../services/schedulerService");
const whatsappService = require("../services/whatsappService");
const { success, error } = require("../utils/apiResponse");

const router = express.Router();

/**
 * Constant-time comparison so the secret cannot be recovered by timing the
 * endpoint.
 */
const secretMatches = (candidate) => {
  const expected = Buffer.from(runtime.cronSecret);
  const actual = Buffer.from(candidate || "");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
};

/**
 * Trigger for hosts that cannot run an in-process cron.
 *
 * Accepts either `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends)
 * or `?secret=<CRON_SECRET>` for pingers that cannot set headers.
 */
router.all("/run", async (req, res, next) => {
  if (!runtime.cronSecret) {
    return error(res, 503, "CRON_SECRET is not configured on this server");
  }

  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secretMatches(bearer) && !secretMatches(req.query.secret)) {
    return error(res, 401, "Invalid cron secret");
  }

  try {
    await recoverInterruptedMessages();
    const result = await processDueMessages();

    // A serverless invocation must not leave the socket dangling, or the next
    // one inherits a half-open connection.
    if (!runtime.isPersistent) await whatsappService.disconnect();

    return success(res, "Scheduler run complete", result);
  } catch (err) {
    if (!runtime.isPersistent) await whatsappService.disconnect().catch(() => {});
    return next(err);
  }
});

module.exports = router;
