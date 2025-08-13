// index.js (CommonJS) — SarathiAI webhook for Gupshup + Railway
require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BOT_NAME = "SarathiAI";
const PORT = process.env.PORT || 8080;

// Load & trim env vars
const API_KEY = (process.env.GS_API_KEY || "").trim();
const SOURCE  = (process.env.GS_SOURCE  || "").trim();
const SEND_URL = (process.env.GUPSHUP_SEND_URL || "https://api.gupshup.io/wa/api/v1/msg").trim();

// Startup debug (safe: mask key)
console.log(`\n🚀 ${BOT_NAME} starting...`);
console.log("📦 GS_API_KEY:", API_KEY ? `[LOADED first4=${API_KEY.slice(0,4)} last4=${API_KEY.slice(-4)}]` : "[MISSING]");
console.log("📦 GS_SOURCE :", SOURCE || "[MISSING]");
console.log("📦 SEND_URL  :", SEND_URL, "\n");

// Helper: safe send to Gupshup, logs full response/error
async function sendViaGupshup(destination, replyText) {
  if (!API_KEY || !SOURCE) {
    console.warn("⚠ API key or source missing — not sending to Gupshup. Simulating send below:");
    console.log(`(Simulated -> ${destination}): ${replyText}`);
    return { simulated: true };
  }

  const form = new URLSearchParams();
  form.append("channel", "whatsapp");
  form.append("source", String(SOURCE));
  form.append("destination", String(destination));
  form.append("message", JSON.stringify({ type: "text", text: replyText }));
  form.append("src.name", BOT_NAME);

  try {
    const resp = await axios.post(SEND_URL, form.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: API_KEY
      },
      timeout: 15000
    });

    // Log useful bits
    console.log("✅ Gupshup send status:", resp.status);
    console.log("Gupshup response body:", typeof resp.data === "object" ? JSON.stringify(resp.data) : resp.data);
    return { ok: true, resp: resp.data };
  } catch (err) {
    // Provide as much info as available without exposing key
    console.error("❌ Error sending to Gupshup:", err?.response?.status, err?.response?.data || err.message);
    return { ok: false, status: err?.response?.status, body: err?.response?.data || err.message };
  }
}

// Robust extraction of phone/text covering common Gupshup shapes
function extractPhoneAndText(body) {
  if (!body) return { phone: null, text: null, raw: null };

  // Many payloads show message data at body.payload...
  const raw = body;
  let phone = null;
  let text = null;

  // Common structure observed in logs:
  // body.payload.sender.phone
  // body.payload.payload.text
  if (body.payload) {
    phone = body.payload?.sender?.phone || body.payload?.source || phone;
    text  = body.payload?.payload?.text || body.payload?.text || text;
  }

  // Fallbacks: top-level fields
  phone = phone || body.sender?.phone || body.from || body.source || null;
  text  = text  || body.text || body.message?.text || null;

  // Final sanitise: strip non-digits from phone (Gupshup usually gives digits)
  if (phone) phone = String(phone).replace(/\D/g, "");

  return { phone, text, raw };
}

// Webhook endpoint
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound payload:", JSON.stringify(req.body, null, 2));
    const { phone, text } = extractPhoneAndText(req.body);

    console.log("Detected userPhone:", phone, " userText:", text);

    // Always ACK quickly so Gupshup won't retry
    res.status(200).send("OK");

    // If no text (e.g., sandbox-start) do nothing further
    if (!text) {
      console.log("ℹ No text found (likely sandbox-start or non-text event). Waiting for real message.");
      return;
    }

    // Compose friendly Krishna-style reply
    const reply = `🙏 Hare Krishna!\n\nYou said: "${text}"\nThis is ${BOT_NAME} — how can I help?`;

    // Send (or simulate) and log outcome
    const sendResult = await sendViaGupshup(phone, reply);
    if (sendResult.simulated) {
      // nothing else
    } else if (!sendResult.ok) {
      console.error("❗ Send failed:", sendResult);
    } else {
      console.log("✅ Send OK");
    }
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    // Try to ack if not already
    try { res.status(200).send("OK"); } catch (_) {}
  }
});

// Health
app.get("/", (_req, res) => {
  res.send(`${BOT_NAME} running ✅`);
});

// Start
app.listen(PORT, () => {
  console.log(`${BOT_NAME} listening on port ${PORT}`);
});
