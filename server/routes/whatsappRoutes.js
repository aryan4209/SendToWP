const express = require("express");
const whatsappService = require("../services/whatsappService");
const requireAuth = require("../middleware/requireAuth");
const { success, error } = require("../utils/apiResponse");

const router = express.Router();

// The pairing QR grants full control of the linked WhatsApp account, so none of
// these endpoints may be reachable without signing in.
router.use(requireAuth);

router.get("/status", (req, res) =>
  success(res, "WhatsApp status retrieved", whatsappService.getStatus())
);

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
