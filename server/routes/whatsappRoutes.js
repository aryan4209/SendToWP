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

router.post("/reconnect", async (req, res, next) => {
  try {
    await whatsappService.reconnect();
    return success(res, "WhatsApp reconnect started", whatsappService.getStatus());
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
