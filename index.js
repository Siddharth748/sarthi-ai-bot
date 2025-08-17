// index.js — SarathiAI with OpenAI integration (ESM)
import dotenv from "dotenv";
import express from "express";
import axios from "axios";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BOT_NAME = "SarathiAI";
const PORT = process.env.PORT || 8080;

// Env vars (trimmed)
const GS_API_KEY = (process.env.GS_API_KEY || "").trim();
const GS_SOURCE  = (process.env.GS_SOURCE  || "").trim();
const SEND_URL   = (process.env.GUPSHUP_SEND_URL || "https://api.gupshup.io/wa/api/v1/msg").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim(); // change if you prefer another model

// Startup debug (safe: masked)
console.log(`\n🚀 ${BOT_NAME} starting...`);
console.log("📦 GS_API_KEY:", GS_API_KEY ? `[LOADED first4=${GS_API_KEY.slice(0,4)} last4=${GS_API_KEY.slice(-4)}]` : "[MISSING]");
console.log("📦 GS_SOURCE :", GS_SOURCE || "[MISSING]");
console.log("📦 SEND_URL  :", SEND_URL);
console.log("📦 OPENAI_KEY:", OPENAI_KEY ? "[LOADED]" : "[MISSING]");
console.log("📦 OPENAI_MODEL:", OPENAI_MODEL, "\n");

// Helper: send via Gupshup (form-encoded)
async function sendViaGupshup(destination, replyText) {
  if (!GS_API_KEY || !GS_SOURCE) {
    console.warn("⚠ Gupshup key/source missing — simulating send:");
    console.log(`(Simulated -> ${destination}): ${replyText}`);
    return { simulated: true };
  }

  const form = new URLSearchParams();
  form.append("channel", "whatsapp");
  form.append("source", String(GS_SOURCE));
  form.append("destination", String(destination));
  form.append("message", JSON.stringify({ type: "text", text: replyText }));
  form.append("src.name", BOT_NAME);

  try {
    const resp = await axios.post(SEND_URL, form.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: GS_API_KEY
      },
      timeout: 15000
    });
    console.log("✅ Gupshup send status:", resp.status);
    console.log("Gupshup response body:", typeof resp.data === "object" ? JSON.stringify(resp.data) : resp.data);
    return { ok: true, resp: resp.data };
  } catch (err) {
    console.error("❌ Error sending to Gupshup:", err?.response?.status, err?.response?.data || err.message);
    return { ok: false, status: err?.response?.status, body: err?.response?.data || err.message };
  }
}

// Helper: call OpenAI Chat Completions
async function callOpenAI(promptMessages) {
  if (!OPENAI_KEY) {
    console.warn("⚠ OPENAI_API_KEY not set — skipping OpenAI call.");
    return null;
  }

  try {
    const body = {
      model: OPENAI_MODEL,
      messages: promptMessages,
      temperature: 0.7,
      max_tokens: 600
    };

    const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 20000
    });

    // safe access to AI answer
    const content = resp.data?.choices?.[0]?.message?.content || resp.data?.choices?.[0]?.text || null;
    console.log("✅ OpenAI raw response (trim):", typeof content === "string" ? content.slice(0,200) : content);
    return content;
  } catch (err) {
    console.error("❌ OpenAI call error:", err?.response?.status, err?.response?.data || err.message);
    return null;
  }
}

// Robust extractor for phone & text (works with Gupshup shapes)
function extractPhoneAndText(body) {
  if (!body) return { phone: null, text: null };
  let phone = null, text = null;
  if (body.payload) {
    phone = body.payload?.sender?.phone || body.payload?.source || phone;
    text  = body.payload?.payload?.text || body.payload?.text || text;
  }
  phone = phone || body.sender?.phone || body.from || body.source || null;
  text  = text  || body.text || body.message?.text || null;
  if (phone) phone = String(phone).replace(/\D/g, "");
  return { phone, text };
}

// System prompt: Krishna teachings, friendly & compassionate, modern tone
const SYSTEM_PROMPT = `You are SarathiAI — a friendly, compassionate self-help assistant inspired by the teachings of Lord Krishna (Bhagavad Gita).
Answer in a modern, empathetic, and practical way. Use short paragraphs, gentle encouragement, and sometimes a small verse-like sentence for comfort.
Do NOT give medical, legal, or financial instructions; if the user needs those, advise consulting a qualified professional.
Be respectful of diverse beliefs; do not preach or coerce. Keep responses concise (around 2-4 short paragraphs) unless user asks for more detail.`;

// Webhook
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound payload:", JSON.stringify(req.body, null, 2));
    const { phone, text } = extractPhoneAndText(req.body);
    console.log("Detected userPhone:", phone, " userText:", text);

    // ACK quickly
    res.status(200).send("OK");

    if (!text || !phone) {
      console.log("ℹ No text or phone — skipping AI reply.");
      return;
    }

    // Build messages for OpenAI
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text }
    ];

    // Call OpenAI
    const aiReply = await callOpenAI(messages);

    // If OpenAI failed, fallback to a gentle default reply
    const finalReply = aiReply && aiReply.trim().length > 0
      ? aiReply.trim()
      : `Hare Krishna 🙏 — I heard: "${text}". I'm here to help. Could you tell me a little more so I can respond better?`;

    // Send via Gupshup
    const sendResult = await sendViaGupshup(phone, finalReply);
    if (!sendResult.ok && !sendResult.simulated) {
      console.error("❗ Problem sending reply:", sendResult);
    }
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    try { res.status(200).send("OK"); } catch (_) {}
  }
});

app.get("/", (_req, res) => res.send(`${BOT_NAME} with AI is running ✅`));

app.listen(PORT, () => console.log(`${BOT_NAME} listening on port ${PORT}`));
