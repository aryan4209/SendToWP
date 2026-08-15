const express = require("express");
const whatsappService = require("../services/whatsappService");
const authStore = require("../services/authStore");
const runtime = require("../config/runtime");
const requireAuth = require("../middleware/requireAuth");
const { success, error } = require("../utils/apiResponse");

const router = express.Router();

// The pairing QR grants full control of the linked WhatsApp account, so none of
// these endpoints may be reachable without signing in.
router.use(requireAuth);

/**
 * `status` describes the live socket, which on a serverless host is almost
 * always "Disconnected" because each invocation starts cold. `paired` is the
 * useful signal there: it says a session exists and sending will work, so the
 * UI can avoid reporting a healthy deployment as broken.
 */
router.get("/status", async (req, res, next) => {
  try {
    const paired = await authStore.hasAuthState();
    return success(res, "WhatsApp status retrieved", {
      ...whatsappService.getStatus(),
      paired,
      // Where a socket cannot be held open, the browser cannot complete a QR
      // scan either - pairing has to be done with scripts/pair-whatsapp.js.
      canPairInBrowser: runtime.isPersistent,
    });
  } catch (err) {
    return next(err);
  }
});

router.get("/qr", (req, res) => {
  const qr = whatsappService.getQr();
  if (!qr) return error(res, 404, "QR code is not available");
  return success(res, "QR code retrieved", { qr });
});

// `reset: true` throws away the stored session and starts a fresh pairing.
// Anything else simply reopens the socket using the session already saved.
router.post("/reconnect", async (req, res, next) => {
  try {
    const reset = req.body?.reset === true;
    await whatsappService.reconnect({ reset });
    return success(
      res,
      reset ? "WhatsApp session cleared, scan the new QR code" : "WhatsApp reconnect started",
      whatsappService.getStatus()
    );
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
