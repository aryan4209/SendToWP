const crypto = require("crypto");

const resolveSecret = () => {
  const configured = process.env.JWT_SECRET;
  if (configured && configured.length >= 32) return configured;

  if (configured) {
    throw new Error("JWT_SECRET must be at least 32 characters long");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set when NODE_ENV=production");
  }

  console.warn(
    "JWT_SECRET is not set. Generating a temporary development secret - every restart will sign users out."
  );
  return crypto.randomBytes(48).toString("hex");
};

module.exports = {
  jwtSecret: resolveSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  // Set ALLOW_REGISTRATION=false once your account exists to close sign-ups.
  // The very first account is always allowed so the app is never locked out.
  allowRegistration: process.env.ALLOW_REGISTRATION !== "false",
};
