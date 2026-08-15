const express = require("express");
const heartbeatService = require("../services/heartbeatService");
const whatsappService = require("../services/whatsappService");
const runtime = require("../config/runtime");
const { success } = require("../utils/apiResponse");

const router = express.Router();

/**
 * Public endpoint for an external uptime pinger.
 *
 * Hitting it does two things at once: the inbound request stops a free web
 * service from spinning down, and the database write stops a free database from
 * being judged inactive.
 *
 * Deliberately unauthenticated - every free pinger can do a plain GET, and it
 * exposes nothing beyond timestamps. The write is throttled inside the
 * heartbeat service so repeated calls cannot be used to hammer the database.
 */
router.get("/", async (req, res, next) => {
  try {
    const { wrote, lastHeartbeat } = await heartbeatService.touch();
    return success(res, "Alive", {
      alive: true,
      wroteHeartbeat: wrote,
      lastHeartbeat,
      mode: runtime.mode,
      database: runtime.dialect,
      whatsapp: whatsappService.getStatus().status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

/** Fuller view of the bookkeeping timestamps, for debugging. */
router.get("/state", async (req, res, next) => {
  try {
    return success(res, "System state", await heartbeatService.status());
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
