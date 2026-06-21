const express = require("express");
const { body, param, validationResult } = require("express-validator");
const { run, get, all } = require("../database/db");
const { success, error } = require("../utils/apiResponse");

const router = express.Router();

// Helper middleware to handle validation results
const handleValidation = (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return error(res, 400, result.array()[0].msg);
  }
  return next();
};

// GET /api/ai/settings
router.get("/settings", async (req, res, next) => {
  try {
    const settings = await get("SELECT * FROM AutoReplySettings ORDER BY Id DESC LIMIT 1");
    return success(res, "AI settings retrieved successfully", settings || {});
  } catch (err) {
    return next(err);
  }
});

// PUT /api/ai/settings
router.put(
  "/settings",
  [
    body("IsEnabled").isInt({ min: 0, max: 1 }).withMessage("IsEnabled must be 0 or 1"),
    body("FixedReplyEnabled").isInt({ min: 0, max: 1 }).withMessage("FixedReplyEnabled must be 0 or 1"),
    body("FixedReplyText").trim().notEmpty().withMessage("FixedReplyText is required"),
    body("AIEnabled").isInt({ min: 0, max: 1 }).withMessage("AIEnabled must be 0 or 1"),
    body("CooldownMinutes").isInt({ min: 0 }).withMessage("CooldownMinutes must be a non-negative integer"),
    body("IgnoreGroups").isInt({ min: 0, max: 1 }).withMessage("IgnoreGroups must be 0 or 1"),
    body("IgnoreCommunities").isInt({ min: 0, max: 1 }).withMessage("IgnoreCommunities must be 0 or 1"),
    body("BusinessHoursEnabled").isInt({ min: 0, max: 1 }).withMessage("BusinessHoursEnabled must be 0 or 1"),
    body("BusinessStartTime").matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage("BusinessStartTime must be in HH:mm format (e.g. 09:00)"),
    body("BusinessEndTime").matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage("BusinessEndTime must be in HH:mm format (e.g. 17:00)"),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const now = new Date().toISOString();
      const existing = await get("SELECT Id FROM AutoReplySettings ORDER BY Id DESC LIMIT 1");

      if (existing) {
        await run(
          `UPDATE AutoReplySettings
           SET IsEnabled = ?, FixedReplyEnabled = ?, FixedReplyText = ?, AIEnabled = ?, CooldownMinutes = ?,
               IgnoreGroups = ?, IgnoreCommunities = ?, BusinessHoursEnabled = ?,
               BusinessStartTime = ?, BusinessEndTime = ?, UpdatedOn = ?
           WHERE Id = ?`,
          [
            req.body.IsEnabled,
            req.body.FixedReplyEnabled,
            req.body.FixedReplyText,
            req.body.AIEnabled,
            req.body.CooldownMinutes,
            req.body.IgnoreGroups,
            req.body.IgnoreCommunities,
            req.body.BusinessHoursEnabled,
            req.body.BusinessStartTime,
            req.body.BusinessEndTime,
            now,
            existing.Id
          ]
        );
      } else {
        await run(
          `INSERT INTO AutoReplySettings
           (IsEnabled, FixedReplyEnabled, FixedReplyText, AIEnabled, CooldownMinutes, IgnoreGroups, IgnoreCommunities, BusinessHoursEnabled, BusinessStartTime, BusinessEndTime, CreatedOn, UpdatedOn)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.body.IsEnabled,
            req.body.FixedReplyEnabled,
            req.body.FixedReplyText,
            req.body.AIEnabled,
            req.body.CooldownMinutes,
            req.body.IgnoreGroups,
            req.body.IgnoreCommunities,
            req.body.BusinessHoursEnabled,
            req.body.BusinessStartTime,
            req.body.BusinessEndTime,
            now,
            now
          ]
        );
      }

      const updated = await get("SELECT * FROM AutoReplySettings ORDER BY Id DESC LIMIT 1");
      return success(res, "AI settings updated successfully", updated);
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/ai/history
router.get("/history", async (req, res, next) => {
  try {
    const history = await all("SELECT * FROM AutoReplyHistory ORDER BY Id DESC LIMIT 100");
    return success(res, "Auto reply history retrieved successfully", history);
  } catch (err) {
    return next(err);
  }
});

// GET /api/ai/history/:phone
router.get(
  "/history/:phone",
  [
    param("phone").trim().notEmpty().withMessage("Phone number is required"),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const history = await all(
        "SELECT * FROM AutoReplyHistory WHERE Phone = ? ORDER BY Id DESC LIMIT 100",
        [req.params.phone]
      );
      return success(res, `Auto reply history for ${req.params.phone} retrieved successfully`, history);
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
