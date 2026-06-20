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
    throw error;
  }
  const jid = `${phone.replace(/\D/g, "")}@s.whatsapp.net`;
  return socket.sendMessage(jid, { text: message });
};

const getStatus = () => ({ status, hasQr: Boolean(latestQr), lastError });
const getQr = () => latestQr;

module.exports = { connect, reconnect, sendMessage, getStatus, getQr };
