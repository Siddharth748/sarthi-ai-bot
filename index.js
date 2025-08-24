// index.js — SarathiAI (v7 - Twilio Integration)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
// ✅ TWILIO: Import the Twilio helper library
import twilio from "twilio";

const app = express();
// ✅ TWILIO: Twilio sends data in a different format, so we need urlencoded middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Config / env ---------------- */
const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;

// ✅ TWILIO: New variables for Twilio credentials
const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_SANDBOX_NUMBER = "whatsapp:+14155238886"; // This is the standard Twilio Sandbox number

const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();
const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim();
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const PINECONE_NAMESPACE = (process.env.PINECONE_NAMESPACE || "verse").trim();
const PINECONE_NAMESPACES = (process.env.PINECONE_NAMESPACES || "").trim();
const TRAIN_SECRET = process.env.TRAIN_SECRET || null;

// ✅ TWILIO: Initialize the Twilio client
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/* ---------------- Performance knobs & caches ---------------- */
const CACHE_TTL_MS = 5 * 60 * 1000;
const embedCache = new Map();
const retrCache  = new Map();

function cacheGet(map, key) {
  const rec = map.get(key);
  if (!rec || (Date.now() - rec.ts > CACHE_TTL_MS)) {
    if (rec) map.delete(key);
    return null;
  }
  return rec.value;
}
function cacheSet(map, key, value) {
  map.set(key, { ts: Date.now(), value });
}
function normalizeQuery(s) {
  return String(s || "").trim().toLowerCase().replace(/[^\w\s]/g," ").replace(/\s+/g," ").trim();
}

/* ---------------- Session & Memory ---------------- */
const sessions = new Map();
function getSession(phone) {
  const now = Date.now();
  let s = sessions.get(phone);
  if (!s) {
    s = { last_bot_prompt: "NONE", practice_subscribed: false, next_checkin_ts: 0, last_checkin_sent_ts: 0, last_seen_ts: now, recent_topics: [] };
    sessions.set(phone, s);
  }
  for (const [k, v] of sessions) {
    if (now - (v.last_seen_ts || now) > 4 * 24 * 60 * 60 * 1000) sessions.delete(k);
  }
  s.last_seen_ts = now;
  return s;
}

/* ---------------- Startup logs ---------------- */
console.log("\n🚀", BOT_NAME, "starting with Twilio Integration...");
console.log("📦 TWILIO_ACCOUNT_SID:", TWILIO_ACCOUNT_SID ? "[LOADED]" : "[MISSING]");
console.log("📦 OPENAI_MODEL:", OPENAI_MODEL, " EMBED_MODEL:", EMBED_MODEL);
console.log("📦 PINECONE_HOST:", PINECONE_HOST ? "[LOADED]" : "[MISSING]");
console.log();

/* ---------------- OpenAI & Provider Helpers ---------------- */

// ✅ TWILIO: New function to send messages via Twilio
async function sendViaTwilio(destination, replyText) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        console.warn(`(Simulated -> ${destination}): ${replyText}`);
        return { simulated: true };
    }
    try {
        await twilioClient.messages.create({
            from: TWILIO_SANDBOX_NUMBER,
            to: destination,
            body: replyText
        });
        console.log(`✅ Twilio message sent to ${destination}`);
        return { ok: true };
    } catch (err) {
        console.error("❌ Error sending to Twilio:", err.message);
        return { ok: false, error: err };
    }
}

// ✅ TWILIO: New function to send an image via Twilio
async function sendImageViaTwilio(destination, imageUrl, caption) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        console.warn(`(Simulated Image -> ${destination}): ${imageUrl} | Caption: ${caption}`);
        return { simulated: true };
    }
    try {
        await twilioClient.messages.create({
            from: TWILIO_SANDBOX_NUMBER,
            to: destination,
            body: caption,
            mediaUrl: [imageUrl]
        });
        console.log(`✅ Twilio image sent to ${destination}`);
        return { ok: true };
    } catch (err) {
        console.error("❌ Error sending image to Twilio:", err.message);
        return { ok: false, error: err };
    }
}


async function openaiEmbedding(textOrArray) { /* ... remains the same ... */ }
async function openaiChat(messages, maxTokens = 400) { /* ... remains the same ... */ }
async function pineconeQuery(vector, topK = 5, namespace, filter) { /* ... remains the same ... */ }
async function multiNamespaceQuery(vector, topK = 5, filter) { /* ... remains the same ... */ }
async function transformQueryForRetrieval(userQuery) { /* ... remains the same ... */ }

/* ---------------- ✅ TWILIO: Updated Payload extraction function ---------------- */
function extractPhoneAndText(body) {
    // Twilio's payload is much simpler
    const phone = body.From; // e.g., "whatsapp:+1234567890"
    const text = body.Body;
    return { phone, text, rawType: 'text' }; // rawType is less important with Twilio
}

function normalizeTextForSmallTalk(s) { /* ... remains the same ... */ }
const CONCERN_KEYWORDS = ["stress", "anxiety", "depressed", "depression", "angry", "anger", "sleep", "insomnia", "panic", "suicidal", "sad", "lonely"];
function isGreeting(text) { /* ... remains the same ... */ }
function isSmallTalk(text) { /* ... remains the same ... */ }
const WELCOME_TEMPLATE = `Hare Krishna 🙏\n\nI am Sarathi, your companion on this journey...`;
const SMALLTALK_REPLY = `Hare Krishna 🙏 — I'm Sarathi, happy to meet you...\nHow can I help you today?`;
const SYSTEM_PROMPT = `You are SarathiAI — a compassionate guide inspired by the Bhagavad Gita...`; // This remains the same
function safeText(md, ...keys) { /* ... remains the same ... */ }
function inferSpeakerFromSanskrit(san) { /* ... remains the same ... */ }
function parseStructuredAI(aiText) { /* ... remains the same ... */ }


/* ---------------- Webhook/main flow ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound raw payload from Twilio:", JSON.stringify(req.body, null, 2));
    
    // With Twilio, we don't need to send an immediate OK status. We respond at the end.
    
    const { phone, text } = extractPhoneAndText(req.body);
    if (!phone || !text) {
        console.log("ℹ No actionable message — skip.");
        return res.status(200).send(); // End the request
    }

    const incoming = String(text).trim();
    const session = getSession(phone);

    if (isGreeting(incoming)) {
      const welcomeImageUrl = "https://i.imgur.com/8f22W4n.jpeg";
      // ✅ TWILIO: Note the text is the 'body' and image is 'mediaUrl' in the new function
      await sendImageViaTwilio(phone, welcomeImageUrl, WELCOME_TEMPLATE);
      return res.status(200).send();
    }
    
    if (isSmallTalk(incoming)) {
      await sendViaTwilio(phone, SMALLTALK_REPLY);
      return res.status(200).send();
    }

    const transformedQuery = await transformQueryForRetrieval(incoming);
    const norm = normalizeQuery(transformedQuery);
    let qVec;
    const cachedVec = cacheGet(embedCache, norm);
    if (cachedVec) { qVec = cachedVec; } 
    else { qVec = await openaiEmbedding(transformedQuery); cacheSet(embedCache, norm, qVec); }
    if (!qVec) throw new Error("Failed to generate embedding vector.");

    let matches;
    const cachedMatches = cacheGet(retrCache, norm);
    if (cachedMatches) { matches = cachedMatches; } 
    else { matches = await multiNamespaceQuery(qVec, 5); cacheSet(retrCache, norm, matches); }

    const verseMatch = matches.find(m => m._namespace === "verse") || matches[0];
    const verseSanskrit = verseMatch ? safeText(verseMatch.metadata, "sanskrit", "Sanskrit") : "";
    const verseHinglish = verseMatch ? safeText(verseMatch.metadata, "hinglish1", "hinglish") : "";
    
    if (!verseSanskrit && !verseHinglish) {
        console.warn("⚠️ No relevant verse found. Sending fallback.");
        await sendViaTwilio(phone, `I hear your concern about "${incoming}". Could you tell me a little more about what's happening?`);
        return res.status(200).send();
    }
    
    const contextText = `Reference: ${verseMatch.metadata?.reference}...`;
    const modelSystem = SYSTEM_PROMPT;
    const modelUser = `User message: "${incoming}"\n\nContext:\n${contextText}\n\nProduce a short reply...`;
    const aiStructured = await openaiChat([{ role: "system", content: modelSystem }, { role: "user", content: modelUser }]);
    if (!aiStructured) throw new Error("OpenAI chat call failed.");
    
    const parsed = parseStructuredAI(aiStructured);
    
    const finalParts = [];
    if (verseSanskrit) finalParts.push(`"${verseSanskrit}"`);
    if (verseHinglish) finalParts.push(`${verseHinglish}`);
    finalParts.push("", `*${parsed.essence || "Focus on your effort..."}*`, "");
    finalParts.push(parsed.explanation || "I hear you...");
    if (parsed.practice) finalParts.push("", `*Practice:* ${parsed.practice}`);
    if (parsed.followup) finalParts.push("", parsed.followup);

    await sendViaTwilio(phone, finalParts.join("\n"));
    return res.status(200).send();

  } catch (err) {
    console.error("❌ Webhook processing error:", err.message);
    return res.status(500).send(); // Send an error status
  }
});

/* ---------------- Root, Admin, Proactive Check-in ---------------- */
app.get("/", (_req, res) => res.send(`${BOT_NAME} is running with Twilio ✅`));
// ... Proactive check-in and other admin routes remain the same, but will use sendViaTwilio ...
async function proactiveCheckin() {
    // ... logic remains the same
    // await sendViaGupshup(phone, question); becomes:
    // await sendViaTwilio(phone, question);
}
setInterval(proactiveCheckin, 6 * 60 * 60 * 1000);

/* ---------------- Start server ---------------- */
app.listen(PORT, () => console.log(`${BOT_NAME} listening on port ${PORT}`));
