const express = require("express");
const { body, param, query, validationResult } = require("express-validator");
const { run, get, all } = require("../database/db");
const whatsappService = require("../services/whatsappService");
const { created, success, error } = require("../utils/apiResponse");

const router = express.Router();
const repeatTypes = ["None", "Daily", "Weekly", "Monthly"];
const statuses = ["Pending", "Processing", "Sent", "Failed"];

const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
};

const validatePhone = body("phone")
  .customSanitizer(normalizePhone)
  .notEmpty().withMessage("Phone number is required")
  .isLength({ min: 11, max: 15 }).withMessage("Phone number must include a valid country code");

const validateMessage = body("message")
  .trim()
  .notEmpty().withMessage("Message is required")
  .isLength({ max: 1000 }).withMessage("Message cannot exceed 1000 characters");

const handleValidation = (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) return error(res, 400, result.array()[0].msg);
  return next();
};

router.post(
  "/send",
  [validatePhone, validateMessage, handleValidation],
  async (req, res, next) => {
    try {
      await whatsappService.sendMessage(req.body.phone, req.body.message);
      return success(res, "Message sent successfully");
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  "/schedule",
  [
    validatePhone,
    validateMessage,
    body("scheduleTime")
      .isISO8601().withMessage("A valid schedule time is required")
      .custom((value) => new Date(value) > new Date()).withMessage("Schedule time must be in the future"),
    body("repeatType").isIn(repeatTypes).withMessage("Invalid repeat type"),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const now = new Date().toISOString();
      const result = await run(
        `INSERT INTO ScheduledMessages
         (Phone, Message, ScheduleTime, RepeatType, Status, RetryCount, CreatedOn, UpdatedOn)
         VALUES (?, ?, ?, ?, 'Pending', 0, ?, ?)`,
        [req.body.phone, req.body.message, new Date(req.body.scheduleTime).toISOString(), req.body.repeatType, now, now]
      );
      const message = await get("SELECT * FROM ScheduledMessages WHERE Id = ?", [result.id]);
      return created(res, "Message scheduled successfully", message);
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  "/scheduled",
  [
    query("status").optional().isIn(statuses).withMessage("Invalid status"),
    query("search").optional().trim().isLength({ max: 100 }).withMessage("Search is too long"),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const where = [];
      const params = [];
      if (req.query.status) {
        where.push("Status = ?");
        params.push(req.query.status);
      }
      if (req.query.search) {
        where.push("(Phone LIKE ? OR Message LIKE ?)");
        params.push(`%${req.query.search}%`, `%${req.query.search}%`);
      }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const messages = await all(`SELECT * FROM ScheduledMessages ${clause} ORDER BY ScheduleTime DESC`, params);
      return success(res, "Scheduled messages retrieved", messages);
    } catch (err) {
      return next(err);
    }
  }
);

router.get("/stats", async (req, res, next) => {
  try {
    const rows = await all("SELECT Status, COUNT(*) AS Count FROM ScheduledMessages GROUP BY Status");
    const stats = { total: 0, pending: 0, sent: 0, failed: 0 };
    rows.forEach((row) => {
      stats.total += row.Count;
      if (row.Status === "Pending") stats.pending = row.Count;
      if (row.Status === "Sent") stats.sent = row.Count;
      if (row.Status === "Failed") stats.failed = row.Count;
    });
    return success(res, "Message statistics retrieved", stats);
  } catch (err) {
    return next(err);
  }
});

router.put(
  "/:id",
  [
    param("id").isInt({ min: 1 }).withMessage("Invalid message ID"),
    validatePhone,
    validateMessage,
    body("scheduleTime")
      .isISO8601().withMessage("A valid schedule time is required")
      .custom((value) => new Date(value) > new Date()).withMessage("Schedule time must be in the future"),
    body("repeatType").isIn(repeatTypes).withMessage("Invalid repeat type"),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const existing = await get("SELECT * FROM ScheduledMessages WHERE Id = ?", [req.params.id]);
      if (!existing) return error(res, 404, "Scheduled message not found");
      if (existing.Status === "Processing") return error(res, 409, "A processing message cannot be edited");

      await run(
        `UPDATE ScheduledMessages
         SET Phone = ?, Message = ?, ScheduleTime = ?, RepeatType = ?,
             Status = 'Pending', RetryCount = 0, ErrorMessage = NULL, UpdatedOn = ?
         WHERE Id = ?`,
        [req.body.phone, req.body.message, new Date(req.body.scheduleTime).toISOString(), req.body.repeatType, new Date().toISOString(), req.params.id]
      );
      const updated = await get("SELECT * FROM ScheduledMessages WHERE Id = ?", [req.params.id]);
      return success(res, "Scheduled message updated", updated);
    } catch (err) {
      return next(err);
    }
  }
);

router.delete(
  "/:id",
  [param("id").isInt({ min: 1 }).withMessage("Invalid message ID"), handleValidation],
  async (req, res, next) => {
    try {
      const result = await run("DELETE FROM ScheduledMessages WHERE Id = ? AND Status != 'Processing'", [req.params.id]);
      if (!result.changes) return error(res, 404, "Message not found or currently processing");
      return success(res, "Scheduled message deleted");
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
