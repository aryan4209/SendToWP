const { get, run, all } = require("../database/db");
const whatsappService = require("./whatsappService");
const aiService = require("./aiService");

/**
 * Extracts plain text from a Baileys message object.
 * @param {object} msg - The Baileys message object.
 * @returns {string} The text content of the message.
 */
const getMessageText = (msg) => {
  if (!msg || !msg.message) return "";
  if (msg.message.conversation) return msg.message.conversation;
  if (msg.message.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
  if (msg.message.imageMessage?.caption) return msg.message.imageMessage.caption;
  if (msg.message.videoMessage?.caption) return msg.message.videoMessage.caption;
  return "";
};

/**
 * Checks if the current time is within business hours.
 * Supports overnight hours (e.g. 22:00 to 06:00).
 * @param {string} startTime - Format "HH:mm"
 * @param {string} endTime - Format "HH:mm"
 * @returns {boolean} True if within hours, false otherwise.
 */
const isWithinBusinessHours = (startTime, endTime) => {
  if (!startTime || !endTime) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
};

/**
 * Determines if a JID represents an individual person (not a group, broadcast, etc).
 * Handles both @s.whatsapp.net (standard) and @lid (Linked Device ID) formats.
 * @param {string} jid
 * @returns {boolean}
 */
const isIndividualJid = (jid) => {
  if (!jid) return false;
  // @s.whatsapp.net = standard individual
  if (jid.endsWith("@s.whatsapp.net")) return true;
  // @lid = Linked Device ID (newer Baileys/WhatsApp format for individuals)
  if (jid.endsWith("@lid")) return true;
  return false;
};

/**
 * Handles incoming messages to perform automatic replies.
 * @param {object} msg - Baileys raw message upsert message object.
 */
const handleIncomingMessage = async (msg) => {
  try {

    // ── [1] MESSAGE RECEIVED ────────────────────────────────────────────────
    console.log("─────────────────────────────────────────");
    console.log("[AutoReply] 📨 Message upsert received");
    console.log(`[AutoReply]    fromMe     : ${msg.key?.fromMe}`);
    console.log(`[AutoReply]    remoteJid  : ${msg.key?.remoteJid}`);
    console.log(`[AutoReply]    msgTypes   : ${Object.keys(msg.message || {}).join(", ") || "none"}`);

    // ── [1] Basic Filters ──────────────────────────────────────────────────
    if (!msg.key) {
      console.log("[AutoReply] ⛔ Rejected: No message key.");
      return;
    }
    if (msg.key.fromMe) {
      console.log("[AutoReply] ⛔ Rejected: Message is from me (fromMe=true). Ignoring to prevent loops.");
      return;
    }

    const remoteJid = msg.key.remoteJid;

    // ── [2] Group / Personal filtering ────────────────────────────────────
    if (!remoteJid) {
      console.log("[AutoReply] ⛔ Rejected: No remoteJid.");
      return;
    }
    if (remoteJid.endsWith("@g.us")) {
      console.log(`[AutoReply] ⛔ Rejected: Group chat detected (${remoteJid})`);
      return;
    }
    if (remoteJid.endsWith("@broadcast")) {
      console.log(`[AutoReply] ⛔ Rejected: Broadcast list detected (${remoteJid})`);
      return;
    }
    if (remoteJid === "status@broadcast") {
      console.log("[AutoReply] ⛔ Rejected: WhatsApp Status update. Ignoring.");
      return;
    }
    if (remoteJid.endsWith("@newsletter")) {
      console.log(`[AutoReply] ⛔ Rejected: Newsletter/Channel detected (${remoteJid})`);
      return;
    }
    if (!isIndividualJid(remoteJid)) {
      console.log(`[AutoReply] ⛔ Rejected: Unknown JID format "${remoteJid}". Not a recognised individual chat.`);
      return;
    }
    console.log(`[AutoReply] ✅ [2] Personal chat confirmed. JID format: ${remoteJid.includes("@lid") ? "@lid (Linked Device)" : "@s.whatsapp.net (Standard)"}`);

    // ── Text extraction ────────────────────────────────────────────────────
    const incomingText = getMessageText(msg).trim();
    if (!incomingText) {
      console.log("[AutoReply] ⛔ Rejected: No text content (media-only or empty message).");
      return;
    }
    const phone = remoteJid.split("@")[0];
    console.log(`[AutoReply]    Phone      : ${phone}`);
    console.log(`[AutoReply]    Text       : "${incomingText}"`);

    // ── [4] Load Settings ─────────────────────────────────────────────────
    console.log("[AutoReply] ⏳ [4] Loading AutoReplySettings from database...");
    const settings = await get("SELECT * FROM AutoReplySettings ORDER BY Id DESC LIMIT 1");
    if (!settings) {
      console.log("[AutoReply] ⛔ Rejected: No AutoReplySettings row found in database.");
      return;
    }
    console.log("[AutoReply] ✅ [4] Settings loaded:");
    console.log(`[AutoReply]    IsEnabled          : ${settings.IsEnabled}`);
    console.log(`[AutoReply]    AIEnabled          : ${settings.AIEnabled}`);
    console.log(`[AutoReply]    FixedReplyEnabled  : ${settings.FixedReplyEnabled}`);
    console.log(`[AutoReply]    CooldownMinutes    : ${settings.CooldownMinutes}`);
    console.log(`[AutoReply]    BusinessHoursEnabled: ${settings.BusinessHoursEnabled}`);
    console.log(`[AutoReply]    BusinessStartTime  : ${settings.BusinessStartTime}`);
    console.log(`[AutoReply]    BusinessEndTime    : ${settings.BusinessEndTime}`);

    if (settings.IsEnabled !== 1) {
      console.log("[AutoReply] ⛔ Rejected: AutoReply is disabled (IsEnabled=0).");
      return;
    }

    // ── [5] Cooldown check ────────────────────────────────────────────────
    console.log("[AutoReply] ⏳ [5] Checking cooldown...");
    const lastReply = await get(
      "SELECT CreatedOn FROM AutoReplyHistory WHERE Phone = ? ORDER BY Id DESC LIMIT 1",
      [phone]
    );
    if (lastReply) {
      const cooldownMs = settings.CooldownMinutes * 60 * 1000;
      const lastReplyTime = new Date(lastReply.CreatedOn).getTime();
      const elapsed = Date.now() - lastReplyTime;
      const elapsedMin = (elapsed / 60000).toFixed(1);
      console.log(`[AutoReply]    Last reply at   : ${lastReply.CreatedOn}`);
      console.log(`[AutoReply]    Elapsed         : ${elapsedMin}m / Cooldown: ${settings.CooldownMinutes}m`);
      if (elapsed < cooldownMs) {
        console.log(`[AutoReply] ⛔ Rejected: Cooldown active for ${phone}. Must wait ${(settings.CooldownMinutes - elapsed / 60000).toFixed(1)} more minutes.`);
        return;
      }
    } else {
      console.log("[AutoReply] ✅ [5] No previous reply found. Cooldown not active.");
    }

    // ── [6] Business hours check ──────────────────────────────────────────
    if (settings.BusinessHoursEnabled === 1) {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      console.log(`[AutoReply] ⏳ [6] Business hours check. Server time: ${currentTime}, Start: ${settings.BusinessStartTime}, End: ${settings.BusinessEndTime}`);

      const insideHours = isWithinBusinessHours(settings.BusinessStartTime, settings.BusinessEndTime);
      if (!insideHours) {
        const offlineMessage = "Thank you for your message.\n\nWe are currently unavailable.\n\nWe will respond during business hours.";
        console.log(`[AutoReply] ⛔ [6] Outside business hours. Sending out-of-office message to ${phone}.`);
        try {
          await whatsappService.sendMessage(phone, offlineMessage);
          console.log(`[AutoReply] ✅ [8] Out-of-office message sent successfully to ${phone}.`);
        } catch (sendErr) {
          console.error(`[AutoReply] ❌ [8] Failed to send out-of-office message to ${phone}:`, sendErr.message);
        }
        try {
          const nowStr = new Date().toISOString();
          await run(
            "INSERT INTO AutoReplyHistory (Phone, IncomingMessage, AIResponse, CreatedOn) VALUES (?, ?, ?, ?)",
            [phone, incomingText, offlineMessage, nowStr]
          );
          console.log(`[AutoReply] ✅ [9] Out-of-office history saved for ${phone}.`);
        } catch (dbErr) {
          console.error(`[AutoReply] ❌ [9] Failed to save out-of-office history:`, dbErr.message);
        }
        return;
      }
      console.log(`[AutoReply] ✅ [6] Within business hours.`);
    } else {
      console.log("[AutoReply] ℹ️  [6] Business hours check disabled. Proceeding.");
    }

    // ── [5] Fixed welcome reply ───────────────────────────────────────────
    let fixedReplySent = false;
    if (settings.FixedReplyEnabled === 1 && settings.FixedReplyText) {
      console.log(`[AutoReply] ⏳ [8] Sending fixed welcome reply to ${phone}...`);
      console.log(`[AutoReply]    Fixed text: "${settings.FixedReplyText.substring(0, 60)}..."`);
      try {
        await whatsappService.sendMessage(phone, settings.FixedReplyText);
        fixedReplySent = true;
        console.log(`[AutoReply] ✅ [8] Fixed reply sent successfully to ${phone}.`);
      } catch (sendErr) {
        console.error(`[AutoReply] ❌ [8] Failed to send fixed reply to ${phone}:`, sendErr.message);
      }
    }

    // ── [7] Gemini AI reply ───────────────────────────────────────────────
    if (settings.AIEnabled === 1) {
      console.log(`[AutoReply] ⏳ [7] AI is enabled. Fetching conversation history for ${phone}...`);
      try {
        const historyRows = await all(
          "SELECT IncomingMessage, AIResponse FROM AutoReplyHistory WHERE Phone = ? ORDER BY Id DESC LIMIT 10",
          [phone]
        );
        console.log(`[AutoReply]    History rows found: ${historyRows.length}`);

        const history = [];
        for (let i = historyRows.length - 1; i >= 0; i--) {
          const row = historyRows[i];
          if (row.IncomingMessage) {
            history.push({ role: "user", parts: [{ text: row.IncomingMessage }] });
          }
          if (row.AIResponse && !row.AIResponse.startsWith("[") && !row.AIResponse.includes("currently unavailable")) {
            history.push({ role: "model", parts: [{ text: row.AIResponse }] });
          }
        }

        const aiResponse = await aiService.generateReply(incomingText, history);

        if (aiResponse) {
          console.log(`[AutoReply] ⏳ [8] Sending AI reply to ${phone}...`);
          console.log(`[AutoReply]    AI text: "${aiResponse.substring(0, 80)}${aiResponse.length > 80 ? "..." : ""}"`);
          try {
            await whatsappService.sendMessage(phone, aiResponse);
            console.log(`[AutoReply] ✅ [8] AI reply sent successfully to ${phone}.`);
          } catch (sendErr) {
            console.error(`[AutoReply] ❌ [8] Failed to send AI reply to ${phone}:`, sendErr.message);
          }

          try {
            const nowStr = new Date().toISOString();
            await run(
              "INSERT INTO AutoReplyHistory (Phone, IncomingMessage, AIResponse, CreatedOn) VALUES (?, ?, ?, ?)",
              [phone, incomingText, aiResponse, nowStr]
            );
            console.log(`[AutoReply] ✅ [9] AI reply history saved for ${phone}.`);
          } catch (dbErr) {
            console.error(`[AutoReply] ❌ [9] Failed to save AI reply history:`, dbErr.message);
          }
        } else {
          throw new Error("Received empty response from Gemini");
        }
      } catch (aiErr) {
        console.error(`[AutoReply] ❌ [7] Gemini AI failed for ${phone}:`, aiErr.message);
        console.error(`[AutoReply] ❌ [7] Full stack:`, aiErr.stack);

        if (!fixedReplySent && settings.FixedReplyText) {
          console.log(`[AutoReply] ⚠️  [8] Falling back to fixed reply for ${phone}...`);
          try {
            await whatsappService.sendMessage(phone, settings.FixedReplyText);
            console.log(`[AutoReply] ✅ [8] Fallback fixed reply sent to ${phone}.`);
          } catch (sendErr) {
            console.error(`[AutoReply] ❌ [8] Fallback fixed reply also failed for ${phone}:`, sendErr.message);
          }
        }

        try {
          const nowStr = new Date().toISOString();
          await run(
            "INSERT INTO AutoReplyHistory (Phone, IncomingMessage, AIResponse, CreatedOn) VALUES (?, ?, ?, ?)",
            [phone, incomingText, "[AI Generation Failed - Fallback sent]", nowStr]
          );
          console.log(`[AutoReply] ✅ [9] Failure history saved for ${phone}.`);
        } catch (dbErr) {
          console.error(`[AutoReply] ❌ [9] Failed to save failure history:`, dbErr.message);
        }
      }
    } else {
      console.log("[AutoReply] ℹ️  AI is disabled. Only fixed reply was sent.");
      try {
        const nowStr = new Date().toISOString();
        await run(
          "INSERT INTO AutoReplyHistory (Phone, IncomingMessage, AIResponse, CreatedOn) VALUES (?, ?, ?, ?)",
          [phone, incomingText, "[Fixed Reply Only]", nowStr]
        );
        console.log(`[AutoReply] ✅ [9] Fixed-only history saved for ${phone}.`);
      } catch (dbErr) {
        console.error(`[AutoReply] ❌ [9] Failed to save fixed-only history:`, dbErr.message);
      }
    }

    console.log(`[AutoReply] ✅ ─── Done processing message from ${phone} ───`);

  } catch (err) {
    // Catch-all: never crash the application
    console.error("[AutoReply] ❌ CRITICAL unhandled error in autoReplyService:", err.message);
    console.error("[AutoReply] ❌ Stack:", err.stack);
  }
};

module.exports = { handleIncomingMessage };
