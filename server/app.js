require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");

const runtime = require("./config/runtime");
const { initialize } = require("./database");
const authRoutes = require("./routes/authRoutes");
const messageRoutes = require("./routes/messageRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");
const cronRoutes = require("./routes/cronRoutes");
const keepaliveRoutes = require("./routes/keepaliveRoutes");
const requestLogger = require("./middleware/requestLogger");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();
app.disable("etag");
app.disable("x-powered-by");

const clientDist = path.join(__dirname, "..", "client", "dist");
const servesClient = fs.existsSync(clientDist);

// Needed for correct client IPs (and therefore rate limiting) behind a proxy.
// Express reads a string as a list of trusted IPs, so a hop count like "1" has
// to be converted to a number or it would be parsed as an address.
const trustProxy = process.env.TRUST_PROXY || (runtime.isServerless ? "1" : "");
if (trustProxy) {
  const hops = Number(trustProxy);
  app.set("trust proxy", Number.isFinite(hops) ? hops : trustProxy);
}

app.use(
  helmet({
    // Emotion/MUI injects styles at runtime, and the pairing QR is a data URL.
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:"],
        "upgrade-insecure-requests": null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// When the API also serves the built client there is no cross-origin request to
// allow. Otherwise only the origins listed in CLIENT_ORIGIN may call the API.
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // curl, same-origin, health checks
      if (!allowedOrigins.length) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
  })
);

app.use(express.json({ limit: "50kb" }));
app.use(requestLogger);

app.get("/api/health", (req, res) =>
  res.json({
    success: true,
    message: "SendToWP API is running",
    data: { mode: runtime.mode, dialect: runtime.dialect, authStore: runtime.authStore },
  })
);

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT || 1200),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please slow down." },
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/keepalive", keepaliveRoutes);
app.use("/api", notFound);

if (servesClient) {
  app.use(
    express.static(clientDist, {
      setHeaders(res, filePath) {
        // Vite asset filenames are content hashed, so they can be cached hard.
        // The shell and the service worker must always be revalidated or a
        // deploy would never reach an installed PWA.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    })
  );
  app.get("*", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  app.use(notFound);
}

app.use(errorHandler);

// Run the schema exactly once per process, and let every entry point await the
// same promise so no request is served against an uninitialised database.
let readyPromise = null;
const ready = () => {
  if (!readyPromise) readyPromise = initialize();
  return readyPromise;
};

module.exports = { app, ready, runtime, servesClient };
