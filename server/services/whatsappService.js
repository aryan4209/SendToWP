const QRCode = require("qrcode");
const pino = require("pino");
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const runtime = require("../config/runtime");
const authStore = require("./authStore");

const logger = pino({ level: "silent" });

let socket = null;
let status = "Disconnected";
let latestQr = null;
let reconnectTimer = null;
let manualReconnect = false;
let connectingPromise = null;
let lastError = null;
let openWaiters = [];

const setStatus = (nextStatus) => {
  status = nextStatus;
  console.log(`WhatsApp status: ${status}`);
  if (nextStatus === "Connected") {
    openWaiters.forEach(({ resolve }) => resolve());
    openWaiters = [];
  }
};

const failWaiters = (message) => {
  openWaiters.forEach(({ reject }) => reject(new Error(message)));
  openWaiters = [];
};

const createConnection = async () => {
  clearTimeout(reconnectTimer);
  setStatus("Connecting");
  latestQr = null;
  lastError = null;

  const { state, saveCreds } = await authStore.loadAuthState();
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
      failWaiters(lastError);

      // Only a long-lived process should chase the connection back up. In
      // serverless mode the next invocation reconnects on demand instead.
      if (runtime.keepWhatsappConnected && (!loggedOut || manualReconnect)) {
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

const isConnected = () => status === "Connected" && Boolean(socket);

/**
 * Brings the socket up and waits for it to be usable.
 *
 * On a persistent host the socket is normally already open and this returns
 * immediately. On a serverless host every invocation starts cold, so this
 * restores the session from the database and waits for the handshake.
 */
const ensureConnected = async (timeoutMs = Number(process.env.WA_CONNECT_TIMEOUT_MS || 30000)) => {
  if (isConnected()) return;

  if (!(await authStore.hasAuthState())) {
    const error = new Error("WhatsApp is not paired yet. Scan the QR code in Settings first.");
    error.statusCode = 503;
    throw error;
  }

  await connect();
  if (isConnected()) return;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      openWaiters = openWaiters.filter((waiter) => waiter.resolve !== resolve);
      const error = new Error(`WhatsApp did not connect within ${timeoutMs}ms`);
      error.statusCode = 503;
      reject(error);
    }, timeoutMs);

    openWaiters.push({
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: (error) => {
        clearTimeout(timer);
        error.statusCode = error.statusCode || 503;
        reject(error);
      },
    });
  });
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
    await authStore.clearAuthState();
    console.log("Cleared incomplete WhatsApp session for fresh QR pairing");
  }
  setStatus("Disconnected");
  await connect();
};

/** Closes the socket cleanly. Serverless invocations call this when finished. */
const disconnect = async () => {
  clearTimeout(reconnectTimer);
  if (!socket) return;
  try {
    socket.end(undefined);
  } catch (error) {
    console.warn("Error closing WhatsApp socket:", error.message);
  }
  socket = null;
  setStatus("Disconnected");
};

const sendMessage = async (phone, message) => {
  await ensureConnected();

  const digits = String(phone).replace(/\D/g, "");
  const jid = `${digits}@s.whatsapp.net`;

  // Baileys resolves an unknown number to an empty result instead of throwing,
  // which would otherwise look like a successful send.
  try {
    const [contact] = await socket.onWhatsApp(jid);
    if (!contact?.exists) {
      const error = new Error(`${digits} is not registered on WhatsApp`);
      error.statusCode = 400;
      throw error;
    }
  } catch (lookupError) {
    if (lookupError.statusCode === 400) throw lookupError;
    console.warn(`Could not verify ${digits} on WhatsApp, sending anyway:`, lookupError.message);
  }

  return socket.sendMessage(jid, { text: message });
};

const getStatus = () => ({
  status,
  hasQr: Boolean(latestQr),
  lastError,
  mode: runtime.mode,
  authStore: authStore.describe(),
});

const getQr = () => latestQr;

module.exports = {
  connect,
  ensureConnected,
  reconnect,
  disconnect,
  sendMessage,
  getStatus,
  getQr,
  isConnected,
};
