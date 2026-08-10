const jwt = require("jsonwebtoken");
const { get } = require("../database/db");
const { jwtSecret } = require("../config/auth");
const { error } = require("../utils/apiResponse");

/**
 * Verifies the bearer token and attaches the matching user to req.user.
 * The user is re-read from the database so deleted accounts cannot keep
 * using a token that has not expired yet.
 */
const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return error(res, 401, "Authentication required");
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await get("SELECT Id, Name, Email, CreatedOn FROM Users WHERE Id = ?", [payload.sub]);
    if (!user) return error(res, 401, "Account no longer exists");

    req.user = user;
    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") return error(res, 401, "Session expired, please sign in again");
    if (err.name === "JsonWebTokenError") return error(res, 401, "Invalid authentication token");
    return next(err);
  }
};

module.exports = requireAuth;
