// index.js — SarathiAI (v4 - Query Transformation & Final Fixes)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Config / env ---------------- */
const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;
const GS_API_KEY = (process.env.GS_API_KEY || "").trim();
const GS_SOURCE = (process.env.GS_SOURCE || "").trim();
const SEND_URL = (process.env.GUPSHUP_SEND_URL || "https://api.gupshup.io/wa/api/v1/msg").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();
const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim();
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const PINECONE_NAMESPACE = (process.env.PINECONE_NAMESPACE || "verse").trim();
const PINECONE_NAMESPACES = (process.env.PINECONE_NAMESPACES || "").trim();
const TRAIN_SECRET = process.env.TRAIN_SECRET || null;

/* ---------------- Performance knobs & caches ---------------- */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
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
console.log("\n🚀", BOT_NAME, "starting with Query Transformation logic...");
// ... [other console.logs for config remain the same] ...
console.log();

/* ---------------- OpenAI & Gupshup Helpers ---------------- */
// ... [sendViaGupshup, openaiEmbedding, openaiChat, pineconeQuery, etc. remain the same as the last version] ...
async function sendViaGupshup(destination, replyText) {
  if (!GS_API_KEY || !GS_SOURCE) {
    console.warn(`(Simulated -> ${destination}): ${replyText}`);
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
      headers: { "Content-Type": "application/x-www-form-urlencoded", apikey: GS_API_KEY },
      timeout: 20000
    });
    console.log("✅ Gupshup send status:", resp.status);
    return { ok: true, resp: resp.data };
  } catch (err) {
    console.error("❌ Error sending to Gupshup:", err?.response?.status, err?.response?.data || err.message);
    return { ok: false, status: err?.response?.status, body: err?.response?.data || err.message };
  }
}
async function openaiEmbedding(textOrArray) {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY missing");
  const input = Array.isArray(textOrArray) ? textOrArray : [String(textOrArray)];
  const resp = await axios.post("https://api.openai.com/v1/embeddings",
    { model: EMBED_MODEL, input },
    { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 30000 }
  );
  return Array.isArray(textOrArray) ? resp.data.data.map(d => d.embedding) : resp.data.data[0].embedding;
}
async function openaiChat(messages, maxTokens = 400) {
  if (!OPENAI_KEY) {
    console.warn("⚠ OPENAI_API_KEY not set.");
    return null;
  }
  const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.6 };
  const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
    headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    timeout: 20000
  });
  return resp.data?.choices?.[0]?.message?.content;
}
async function pineconeQuery(vector, topK = 5, namespace, filter) {
  if (!PINECONE_HOST || !PINECONE_API_KEY) throw new Error("Pinecone config missing");
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/query`;
  const body = { vector, topK, includeMetadata: true };
  if (namespace) body.namespace = namespace;
  if (filter) body.filter = filter;
  const resp = await axios.post(url, body, {
    headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" },
    timeout: 20000
  });
  return resp.data;
}
function getNamespacesArray() {
  if (PINECONE_NAMESPACES) return PINECONE_NAMESPACES.split(",").map(s => s.trim()).filter(Boolean);
  return [PINECONE_NAMESPACE || "verse"];
}
async function multiNamespaceQuery(vector, topK = 5, filter) {
  const ns = getNamespacesArray();
  const promises = ns.map(async (n) => {
    try {
      const r = await pineconeQuery(vector, topK, n, filter);
      return (r?.matches || []).map(m => ({ ...m, _namespace: n }));
    } catch (e) {
      console.warn(`⚠ Pinecone query failed for namespace ${n}:`, e.message);
      return [];
    }
  });
  const arr = await Promise.all(promises);
  const allMatches = arr.flat();
  allMatches.sort((a,b) => (b.score || 0) - (a.score || 0)); // Simple sort by score
  return allMatches;
}
async function findVerseByReference(reference, queryVector) {
  // ... [this function remains the same] ...
}

/* ---------------- ✅ FIX #2: The new Query Transformation function ---------------- */
async function transformQueryForRetrieval(userQuery) {
  const systemPrompt = `You are an expert in the Bhagavad Gita. Your task is to transform a user's emotional or situational query into a concise, ideal search query that describes the underlying spiritual concept. This transformed query will be used to find the most relevant Gita verse.

Examples:
- User: "I am angry at my husband" -> "overcoming anger in relationships"
- User: "He is so narcissistic" -> "dealing with ego and arrogance"
- User: "I am stressed about my exams" -> "finding peace and focus during challenges"
- User: "Mughe bahut jyada gussa aara hai" -> "managing intense anger"
- User: "What should I do with my life?" -> "understanding dharma and one's duty"

Only return the transformed query text and nothing else.`;
  
  try {
    const response = await openaiChat([{ role: "system", content: systemPrompt }, { role: "user", content: userQuery }], 50);
    const transformed = response.replace(/"/g, "").trim();
    console.log(`ℹ Transformed Query: "${userQuery}" -> "${transformed}"`);
    return transformed || userQuery; // Fallback to original query if transform fails
  } catch (error) {
    console.warn("⚠️ Query transformation failed, using original query.", error.message);
    return userQuery;
  }
}

/* ---------------- Payload extraction & Small talk detection ---------------- */
// ... [These functions remain the same as the last version] ...
function extractPhoneAndText(body) {
    if (!body) return { phone: null, text: null, rawType: null };
    let phone = null, text = null;
    const rawType = body.type || 'unknown';
    try {
        if (body.type === 'message' && body.payload?.payload) {
            phone = body.payload.sender?.phone;
            text = body.payload.payload.text;
        } else if (body.type === 'user-event' && body.payload?.phone) {
            phone = body.payload.phone;
        }
        if (!phone && body.payload?.source) phone = body.payload.source;
    } catch (e) { console.error("Caught error during payload extraction:", e.message); }
    if (phone) phone = String(phone).replace(/\D/g, "");
    return { phone, text, rawType };
}
function isGreeting(text) { /* ... */ }
function isSmallTalk(text) { /* ... */ }

/* ---------------- Templates & Prompts ---------------- */
const WELCOME_TEMPLATE = `Hare Krishna 🙏\n\nI am Sarathi, your companion on this journey...\nHow can I help you today?`;
// ✅ FIX: Updated SMALLTALK_REPLY
const SMALLTALK_REPLY = `Hare Krishna 🙏 — I'm Sarathi, happy to meet you.\nHow can I help you today? You can tell me about what's causing you stress, anger, or any other concern.`;

// ✅ FIX: The final, strictest SYSTEM_PROMPT for the main response
const SYSTEM_PROMPT = `You are SarathiAI — a compassionate guide inspired by the Bhagavad Gita.
Tone: Modern, empathetic, and very concise. The EXPLANATION must be a maximum of 2-3 short sentences. The entire reply MUST be brief and easy to read on a phone without expanding.

STRICTLY match the user's primary language. If their last message was mostly Hinglish, the EXPLANATION and FOLLOWUP must be in Hinglish. Otherwise, reply in English.

Critically evaluate if the retrieved Context verse offers a solution. If the verse is merely descriptive of the problem (e.g., describing an arrogant person to someone complaining about ego), you must frame your explanation by stating "The Gita describes this mindset to warn against it..." and then provide Krishna's actual guidance on how to deal with the situation.

REQUIRED OUTPUT FORMAT:
ESSENCE: <one-line essence of Krishna's guidance, max 20 words>
EXPLANATION: <max 2-3 short sentences applying the essence>
OPTIONAL_PRACTICE: <one short practice (<=90s) if helpful>
FOLLOWUP: <one brief clarifying question (opt)>

Important: DO NOT quote or repeat the provided verses. End with no extra commentary.`;

// ... [Other helpers like safeText, inferSpeakerFromSanskrit, parseStructuredAI remain the same] ...
function safeText(md, ...keys) { /* ... */ }
function inferSpeakerFromSanskrit(san) { /* ... */ }
function parseStructuredAI(aiText) { /* ... */ }


/* ---------------- Webhook/main flow ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound raw payload:", JSON.stringify(req.body, null, 2));
    res.status(200).send("OK");

    const { phone, text } = extractPhoneAndText(req.body);
    if (!phone || !text) {
        console.log("ℹ No actionable message — skip.");
        return;
    }

    const incoming = String(text).trim();
    const session = getSession(phone);

    // Handle profanity or stop words safely
    if (normalizeQuery(incoming) === "just fuck off" || normalizeQuery(incoming) === "stop") {
        await sendViaGupshup(phone, SMALLTALK_REPLY);
        return;
    }

    if (isGreeting(incoming)) {
      await sendViaGupshup(phone, WELCOME_TEMPLATE);
      return;
    }
    if (isSmallTalk(incoming)) {
      await sendViaGupshup(phone, SMALLTALK_REPLY);
      return;
    }

    // ✅ FIX #2: Integrate Query Transformation
    const transformedQuery = await transformQueryForRetrieval(incoming);
    
    // Use the transformed query for embedding and caching
    const norm = normalizeQuery(transformedQuery);
    let qVec;
    const cachedVec = cacheGet(embedCache, norm);
    if (cachedVec) {
      qVec = cachedVec;
    } else {
      qVec = await openaiEmbedding(transformedQuery);
      cacheSet(embedCache, norm, qVec);
    }
    if (!qVec) throw new Error("Failed to generate embedding vector.");

    // Retrieve using the new vector
    let matches;
    const cachedMatches = cacheGet(retrCache, norm);
    if (cachedMatches) {
        matches = cachedMatches;
    } else {
        matches = await multiNamespaceQuery(qVec, 5);
        cacheSet(retrCache, norm, matches);
    }

    // ... [Verse matching and metadata extraction logic remains the same] ...
    const verseMatch = matches.find(m => m._namespace === "verse") || matches[0]; // Simplified fallback
    const verseSanskrit = verseMatch ? safeText(verseMatch.metadata, "sanskrit", "Sanskrit") : "";
    const verseHinglish = verseMatch ? safeText(verseMatch.metadata, "hinglish1", "hinglish") : "";
    const verseTranslation = verseMatch ? safeText(verseMatch.metadata, "translation", "english") : "";
    
    if (!verseSanskrit && !verseHinglish) {
        console.warn("⚠️ No relevant verse found after transformation. Sending fallback.");
        await sendViaGupshup(phone, `I hear your concern about "${incoming}". Could you tell me a little more about what's happening?`);
        return;
    }
    
    const contextText = `Reference: ${verseMatch.metadata?.reference}\nSanskrit: ${verseSanskrit}\nHinglish: ${verseHinglish}\nTranslation: ${verseTranslation}`;

    const modelSystem = SYSTEM_PROMPT;
    const modelUser = `User message: "${incoming}"\n\nContext:\n${contextText}\n\nProduce a short reply using the required labels exactly.`;

    const aiStructured = await openaiChat([{ role: "system", content: modelSystem }, { role: "user", content: modelUser }]);
    if (!aiStructured) throw new Error("OpenAI chat call failed to produce a response.");
    
    const parsed = parseStructuredAI(aiStructured);
    
    const finalParts = [];
    if (verseSanskrit) finalParts.push(`"${verseSanskrit}"`);
    if (verseHinglish) finalParts.push(`${verseHinglish}`);
    finalParts.push("", `*${parsed.essence || "Focus on your effort, not the result."}*`, "");
    finalParts.push(parsed.explanation || "I hear you. Try to take one small step and breathe.");
    if (parsed.practice) finalParts.push("", `*Practice:* ${parsed.practice}`);
    if (parsed.followup) finalParts.push("", parsed.followup);

    await sendViaGupshup(phone, finalParts.join("\n"));

  } catch (err) {
    console.error("❌ Webhook processing error:", err.message, err.stack);
    // Silent fail for the user, no error message sent.
  }
});

/* ---------------- Root, Admin, Proactive Check-in ---------------- */
// ... [These sections remain the same] ...
app.get("/", (_req, res) => res.send(`${BOT_NAME} with RAG is running ✅`));

async function proactiveCheckin() { /* ... */ }
setInterval(proactiveCheckin, 6 * 60 * 60 * 1000);

/* ---------------- Start server ---------------- */
app.listen(PORT, () => console.log(`${BOT_NAME} listening on port ${PORT}`));
