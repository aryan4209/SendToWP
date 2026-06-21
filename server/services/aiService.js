/**
 * aiService.js
 * Uses Pollinations.ai — 100% free, no API key required.
 * Docs: https://text.pollinations.ai
 */

/**
 * Generates an AI reply using Pollinations.ai (free, no API key needed).
 * @param {string} message - Incoming user message text.
 * @returns {Promise<string>} AI reply text.
 */
const generateReply = async (message) => {
  const systemPrompt = `You are Aryan's personal assistant on WhatsApp.

Persona & Rules:
- You reply formally and professionally on behalf of Aryan.
- Always greet the contact politely.
- Respond only in English.
- Be helpful, clear, and concise (maximum 100 words per reply).
- If you do not have specific information, politely let the contact know that Aryan will get back to them shortly.
- Never reveal that you are an AI, a bot, or an automated system.
- Never use slang, emojis, or informal language.
- Sign off replies naturally without mentioning your name.`;

  const body = {
    model: "openai",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: message },
    ],
    seed: Math.floor(Math.random() * 10000),
  };

  console.log(`[AI] 🚀 Sending to Pollinations.ai: "${message}"`);

  const response = await fetch("https://text.pollinations.ai/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Pollinations.ai HTTP ${response.status}: ${errText}`);
  }

  const text = (await response.text()).trim();
  console.log(`[AI] ✅ Reply received: "${text.substring(0, 80)}${text.length > 80 ? "..." : ""}"`);
  return text;
};

module.exports = { generateReply };
