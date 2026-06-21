const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const pino = require("pino");
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const authDirectory = path.join(__dirname, "..", "whatsapp-auth");
const logger = pino({ level: "silent" });

let socket = null;
let status = "Disconnected";
let latestQr = null;
let reconnectTimer = null;
let manualReconnect = false;
let connectingPromise = null;
let lastError = null;

const setStatus = (nextStatus) => {
  status = nextStatus;
  console.log(`WhatsApp status: ${status}`);
};

const removeCorruptCredentials = () => {
  const credentialsFile = path.join(authDirectory, "creds.json");
  if (fs.existsSync(credentialsFile) && fs.statSync(credentialsFile).size === 0) {
    fs.rmSync(authDirectory, { recursive: true, force: true });
    console.warn("Removed incomplete WhatsApp credentials from an interrupted pairing attempt");
  }
};

const createConnection = async () => {
  clearTimeout(reconnectTimer);
  setStatus("Connecting");
  latestQr = null;
  lastError = null;

  removeCorruptCredentials();
  const { state, saveCreds } = await useMultiFileAuthState(authDirectory);
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  socket.ev.on("creds.update", saveCreds);

  // AI Auto Reply: Minimal flow
  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg || !msg.message) return;

    const jid = msg.key.remoteJid;

    // Ignore groups
    if (jid.endsWith("@g.us")) return;

    // Ignore status broadcasts
    if (jid === "status@broadcast") return;

    // Ignore own messages
    if (msg.key.fromMe) return;

    // Extract text
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption;

    if (!text) return;

    // Resolve the correct JID for sending.
    // Baileys cannot send to @lid JIDs — convert to @s.whatsapp.net.
    // Use remoteJidAlt (the real phone JID) if available, otherwise strip @lid.
    let sendJid = jid;
    if (jid.endsWith("@lid")) {
      sendJid = msg.key.remoteJidAlt ||
                `${jid.split("@")[0]}@s.whatsapp.net`;
    }

    const phone = sendJid.split("@")[0];
    const FIXED_REPLY = "Hi! I'm currently away or may be busy right now, but I have received your message.";

    console.log(`[AutoReply] 📨 Message from ${jid} → send to ${sendJid}: "${text}"`);

    try {
      const { run } = require("../database/db");

      await socket.sendMessage(sendJid, { text: FIXED_REPLY });
      console.log(`[AutoReply] ✅ Fixed reply sent to ${sendJid}`);

      // Save to history so it shows in dashboard
      await run(
        "INSERT INTO AutoReplyHistory (Phone, IncomingMessage, AIResponse, CreatedOn) VALUES (?, ?, ?, ?)",
        [phone, text, FIXED_REPLY, new Date().toISOString()]
      );
      console.log(`[AutoReply] ✅ History saved for ${phone}`);
    } catch (err) {
      console.error(`[AutoReply] ❌ Failed to reply to ${sendJid}:`, err.message);
    }
  });

  socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      latestQr = await QRCode.toDataURL(qr);
      setStatus("QR Available");
    }

    if (connection === "open") {
      latestQr = null;
      manualReconnect = false;
      lastError = null;
      setStatus("Connected");
    }

    if (connection === "close") {
      latestQr = null;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const reason = lastDisconnect?.error?.message || "Unknown connection error";
      lastError = statusCode ? `${reason} (${statusCode})` : reason;
      console.warn(`WhatsApp connection closed${statusCode ? ` (${statusCode})` : ""}: ${reason}`);
      setStatus(loggedOut ? "Logged Out" : "Disconnected");

      if (!loggedOut || manualReconnect) {
        reconnectTimer = setTimeout(() => connect().catch(console.error), 5000);
      }
    }
  });
};

const connect = async () => {
  if (status === "Connected") return;
  if (connectingPromise) return connectingPromise;

  connectingPromise = createConnection().finally(() => {
    connectingPromise = null;
  });
  return connectingPromise;
};

const reconnect = async () => {
  manualReconnect = true;
  const resetPairing = status !== "Connected";
  if (socket) {
    try {
      socket.end(new Error("Manual reconnect"));
    } catch (error) {
      console.warn("Unable to close existing WhatsApp socket:", error.message);
    }
  }
  if (resetPairing) {
    fs.rmSync(authDirectory, { recursive: true, force: true });
    console.log("Cleared incomplete WhatsApp session for fresh QR pairing");
  }
  setStatus("Disconnected");
  await connect();
};

const sendMessage = async (phone, message) => {
  if (!socket || status !== "Connected") {
    const error = new Error("WhatsApp is not connected");
    error.statusCode = 503;
    console.error(`[WhatsApp] ❌ sendMessage failed: WhatsApp not connected. Status: ${status}`);
    throw error;
  }
  const jid = `${phone.replace(/\D/g, "")}@s.whatsapp.net`;
  console.log(`[WhatsApp] ⏳ sendMessage → JID: ${jid}, Text: "${message.substring(0, 60)}${message.length > 60 ? "..." : ""}"`);
  try {
    const result = await socket.sendMessage(jid, { text: message });
    console.log(`[WhatsApp] ✅ sendMessage success → JID: ${jid}`);
    return result;
  } catch (err) {
    console.error(`[WhatsApp] ❌ sendMessage failed for JID ${jid}:`, err.message);
    throw err;
  }
};

const getStatus = () => ({ status, hasQr: Boolean(latestQr), lastError });
const getQr = () => latestQr;

module.exports = { connect, reconnect, sendMessage, getStatus, getQr };
