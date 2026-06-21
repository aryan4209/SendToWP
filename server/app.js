require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const messageRoutes = require("./routes/messageRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");
const aiRoutes = require("./routes/aiRoutes");
const requestLogger = require("./middleware/requestLogger");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const whatsappService = require("./services/whatsappService");
const startScheduler = require("./scheduler/scheduler");

const app = express();
app.disable("etag");
const port = Number(process.env.PORT || 3000);

app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: "50kb" }));
app.use(requestLogger);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 500, standardHeaders: "draft-7", legacyHeaders: false }));

app.get("/api/health", (req, res) =>
  res.json({ success: true, message: "SendToWP API is running", data: {} })
);
app.use("/api/messages", messageRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api", notFound);

const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res) => res.sendFile(path.join(clientDist, "index.html")));
} else {
  app.use(notFound);
}

app.use(errorHandler);

app.listen(port, async () => {
  console.log(`SendToWP server running on http://localhost:${port}`);
  await startScheduler();
  whatsappService.connect().catch(console.error);
});
