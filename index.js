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
    const GS_API_KEY = process.env.GS_API_KEY;
const GS_SOURCE = process.env.GS_SOURCE;

console.log("🚀 SarathiAI starting…");
console.log("📦 GS_API_KEY:", GS_API_KEY ? "[LOADED]" : "[MISSING]");
console.log("📦 GS_SOURCE:", GS_SOURCE || "[MISSING]");

// Example sendMessage function
async function sendMessage(to, message) {
  const response = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
    method: "POST",
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/x-www-form-urlencoded",
      "apikey": GS_API_KEY
    },
    body: new URLSearchParams({
      channel: "whatsapp",
      source: GS_SOURCE,
      destination: to,
      message: JSON.stringify({ type: "text", text: message }),
      "src.name": "SarathiAI"
    })
  });

  const data = await response.text();
  console.log("📨 Gupshup Response:", data);
}

// Health check
app.get("/", (_req, res) => res.send(`${BOT_NAME} Webhook is running ✅`));

app.listen(PORT, () => console.log(`🟢 ${BOT_NAME} server on port ${PORT}`));
