// index.js (CommonJS) — SarathiAI WhatsApp webhook for Gupshup + Railway
require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const BOT_NAME = "SarathiAI";
const PORT = process.env.PORT || 8080;

// Debug env on startup (masked)
console.log("🚀 SarathiAI starting…");
console.log("📦 GS_API_KEY:", process.env.GS_API_KEY ? "[LOADED]" : "[MISSING]");
console.log("📦 GS_SOURCE:", process.env.GS_SOURCE || "[MISSING]");

// Webhook for incoming messages
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound payload:", JSON.stringify(req.body, null, 2));

    const payload = req.body?.payload || {};
    const userPhone = payload?.sender?.phone || req.body?.source || null;
    const userText = payload?.payload?.text || null;

    console.log(`Detected userPhone: ${userPhone}  userText: ${userText}`);

    // Always ACK first so Gupshup doesn't retry
    res.sendStatus(200);

    // Compose reply
    const replyText = `Hare Krishna 🙏\n\nYou said: "${userText}"\nThis is ${BOT_NAME} here to assist you.`;

    const apiKey = process.env.GS_API_KEY;
    const source = process.env.GS_SOURCE;

    if (!apiKey || !source) {
      console.warn("⚠ GS_API_KEY or GS_SOURCE missing. Simulating send…");
      console.log(`(Simulated reply to ${userPhone}): ${replyText}`);
      return;
    }

    if (!userPhone || !userText) {
      console.log("ℹ No phone or no text — skipping reply.");
      return;
    }

    // Send via Gupshup (form-encoded). Note: 'src.name' is valid as a form key.
    const form = new URLSearchParams();
    form.append("channel", "whatsapp");
    form.append("source", String(source));
    form.append("destination", String(userPhone));
    form.append("message", JSON.stringify({ type: "text", text: replyText }));
    form.append("src.name", BOT_NAME);

    const resp = await axios.post(
      "https://api.gupshup.io/sm/api/v1/msg",
      form.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          apikey: apiKey,
        },
        timeout: 15000,
      }
    );

    console.log("✅ Gupshup send response:", resp.data || "(no body)");
  } catch (err) {
    console.error("❌ Error in webhook:", err.response?.data || err.message || err);
  }
});

// Health check
app.get("/", (_req, res) => res.send(`${BOT_NAME} Webhook is running ✅`));

app.listen(PORT, () => console.log(`🟢 ${BOT_NAME} server on port ${PORT}`));
