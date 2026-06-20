const express = require("express");
const whatsappService = require("../services/whatsappService");
const { success, error } = require("../utils/apiResponse");

const router = express.Router();

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
