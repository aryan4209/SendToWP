const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const { run, get } = require("../database/db");
const { jwtSecret, jwtExpiresIn, bcryptRounds, allowRegistration } = require("../config/auth");
const requireAuth = require("../middleware/requireAuth");
const { created, success, error } = require("../utils/apiResponse");

const router = express.Router();

// Sign-in and sign-up are the only unauthenticated write endpoints, so they get
// a much tighter limit than the rest of the API.
const credentialsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: "Too many attempts. Please try again in 15 minutes." },
});

const handleValidation = (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) return error(res, 400, result.array()[0].msg);
  return next();
};

const validateEmail = body("email")
  .trim()
  .customSanitizer((value) => String(value || "").toLowerCase())
  .notEmpty().withMessage("Email is required")
  .isEmail().withMessage("Enter a valid email address")
  .isLength({ max: 200 }).withMessage("Email is too long");

// A real hash to compare against when the email is unknown, so a missing
// account and a wrong password cost the same amount of time.
const decoyHash = bcrypt.hashSync("sendtowp-unknown-account", bcryptRounds);

const publicUser = (user) => ({
  id: user.Id,
  name: user.Name,
  email: user.Email,
  createdOn: user.CreatedOn,
});

const issueToken = (user) =>
  jwt.sign({ sub: user.Id, email: user.Email }, jwtSecret, { expiresIn: jwtExpiresIn });

// POST /api/auth/register
router.post(
  "/register",
  credentialsLimiter,
  [
    body("name")
      .trim()
      .notEmpty().withMessage("Name is required")
      .isLength({ min: 2, max: 80 }).withMessage("Name must be between 2 and 80 characters"),
    validateEmail,
    body("password")
      .isLength({ min: 8, max: 128 }).withMessage("Password must be at least 8 characters"),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const { name, email, password } = req.body;

      const userCount = await get("SELECT COUNT(*) AS count FROM Users");
      const isFirstAccount = userCount.count === 0;
      if (!allowRegistration && !isFirstAccount) {
        return error(res, 403, "Registration is disabled on this server");
      }

      const existing = await get("SELECT Id FROM Users WHERE Email = ?", [email]);
      if (existing) return error(res, 409, "An account with this email already exists");

      const now = new Date().toISOString();
      const passwordHash = await bcrypt.hash(password, bcryptRounds);
      const result = await run(
        "INSERT INTO Users (Name, Email, PasswordHash, CreatedOn, UpdatedOn) VALUES (?, ?, ?, ?, ?)",
        [name, email, passwordHash, now, now]
      );

      // Messages scheduled before accounts existed have no owner; hand them to
      // the first account so upgrading does not hide existing data.
      if (isFirstAccount) {
        const adopted = await run("UPDATE ScheduledMessages SET UserId = ? WHERE UserId IS NULL", [result.id]);
        if (adopted.changes) {
          console.log(`Assigned ${adopted.changes} pre-existing scheduled message(s) to the first account`);
        }
      }

      const user = await get("SELECT Id, Name, Email, CreatedOn FROM Users WHERE Id = ?", [result.id]);
      return created(res, "Account created successfully", { token: issueToken(user), user: publicUser(user) });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/auth/login
router.post(
  "/login",
  credentialsLimiter,
  [validateEmail, body("password").notEmpty().withMessage("Password is required"), handleValidation],
  async (req, res, next) => {
    try {
      const user = await get("SELECT * FROM Users WHERE Email = ?", [req.body.email]);

      const matches = await bcrypt.compare(req.body.password, user?.PasswordHash || decoyHash);
      if (!user || !matches) return error(res, 401, "Invalid email or password");

      return success(res, "Signed in successfully", { token: issueToken(user), user: publicUser(user) });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) =>
  success(res, "Current user retrieved", { user: publicUser(req.user) })
);

// GET /api/auth/config - lets the sign-in screen hide the sign-up link
router.get("/config", async (req, res, next) => {
  try {
    const userCount = await get("SELECT COUNT(*) AS count FROM Users");
    return success(res, "Auth configuration retrieved", {
      registrationOpen: allowRegistration || userCount.count === 0,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
