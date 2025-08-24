// index.js — SarathiAI (v7.4 - FINAL COMPLETE Twilio Version)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import twilio from "twilio";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Config / env ---------------- */
const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;
const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_SANDBOX_NUMBER = "whatsapp:+14155238886";
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();
const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim();
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const PINECONE_NAMESPACE = (process.env.PINECONE_NAMESPACE || "verse").trim();
const PINECONE_NAMESPACES = (process.env.PINECONE_NAMESPACES || "").trim();
const TRAIN_SECRET = process.env.TRAIN_SECRET || null;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/* ---------------- Caching ---------------- */
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
  return s;
}

/* ---------------- Startup logs ---------------- */
console.log("\n🚀", BOT_NAME, "starting with FINAL COMPLETE Twilio Integration...");
console.log("📦 TWILIO_ACCOUNT_SID:", TWILIO_ACCOUNT_SID ? "[LOADED]" : "[MISSING]");
console.log();

/* ---------------- Provider & AI Helpers ---------------- */
async function sendViaTwilio(destination, replyText) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        console.warn(`(Simulated -> ${destination}): ${replyText}`);
        return { simulated: true };
    }
    try {
        await twilioClient.messages.create({ from: TWILIO_SANDBOX_NUMBER, to: destination, body: replyText });
        console.log(`✅ Twilio message sent to ${destination}`);
        return { ok: true };
    } catch (err) {
        console.error("❌ Error sending to Twilio:", err.message);
        return { ok: false, error: err };
    }
}

async function sendImageViaTwilio(destination, imageUrl, caption) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        console.warn(`(Simulated Image -> ${destination}): ${imageUrl} | Caption: ${caption}`);
        return { simulated: true };
    }
    try {
        await twilioClient.messages.create({ from: TWILIO_SANDBOX_NUMBER, to: destination, body: caption, mediaUrl: [imageUrl] });
        console.log(`✅ Twilio image sent to ${destination}`);
        return { ok: true };
    } catch (err) {
        console.error("❌ Error sending image to Twilio:", err.message);
        return { ok: false, error: err };
    }
}

async function openaiEmbedding(textOrArray) {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY missing");
  const input = Array.isArray(textOrArray) ? textOrArray : [String(textOrArray)];
  try {
    const resp = await axios.post("https://api.openai.com/v1/embeddings", { model: EMBED_MODEL, input }, { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 30000 });
    return Array.isArray(textOrArray) ? resp.data.data.map(d => d.embedding) : resp.data.data[0].embedding;
  } catch (error) {
    console.error("❌❌❌ DETAILED OPENAI EMBEDDING ERROR ❌❌❌");
    if (error.response) {
      console.error("Error Data:", JSON.stringify(error.response.data, null, 2));
      console.error("Error Status:", error.response.status);
    } else {
      console.error("General Error Message:", error.message);
    }
    return null;
  }
}

async function openaiChat(messages, maxTokens = 400) {
  if (!OPENAI_KEY) return null;
  const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.6 };
  const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 20000 });
  return resp.data?.choices?.[0]?.message?.content;
}

async function transformQueryForRetrieval(userQuery) {
  const systemPrompt = `You are an expert in the Bhagavad Gita. Transform a user's query into a concise search term describing the underlying spiritual concept. Examples:\n- User: "I am angry at my husband" -> "overcoming anger in relationships"\n- User: "He is so narcissistic" -> "dealing with ego and arrogance"\n- User: "I am stressed about my exams" -> "finding peace and focus during challenges"\nOnly return the transformed query.`;
  try {
    const response = await openaiChat([{ role: "system", content: systemPrompt }, { role: "user", content: userQuery }], 50);
    const transformed = response.replace(/"/g, "").trim();
    console.log(`ℹ Transformed Query: "${userQuery}" -> "${transformed}"`);
    return transformed || userQuery;
  } catch (error) {
    console.warn("⚠️ Query transformation failed, using original query.", error.message);
    return userQuery;
  }
}

/* ---------------- Pinecone REST query Helpers ---------------- */
async function pineconeQuery(vector, topK = 5, namespace, filter) {
  if (!PINECONE_HOST || !PINECONE_API_KEY) throw new Error("Pinecone config missing");
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/query`;
  const body = { vector, topK, includeMetadata: true };
  if (namespace) body.namespace = namespace;
  if (filter) body.filter = filter;
  const resp = await axios.post(url, body, { headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" }, timeout: 20000 });
  return resp.data;
}

// ✅ THIS FUNCTION WAS MISSING
function getNamespacesArray() {
  if (PINECONE_NAMESPACES) return PINECONE_NAMESPACES.split(",").map(s => s.trim()).filter(Boolean);
  return [PINECONE_NAMESPACE || "verse"];
}

// ✅ THIS FUNCTION WAS MISSING
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
  allMatches.sort((a,b) => (b.score || 0) - (a.score || 0));
  return allMatches;
}

/* ---------------- Twilio Payload Extraction & Small Talk Logic ---------------- */
function extractPhoneAndText(body) {
    const phone = body.From;
    const text = body.Body;
    return { phone, text };
}

function normalizeTextForSmallTalk(s) {
  if (!s) return "";
  let t = String(s).trim().toLowerCase().replace(/[^\w'\s]/g, " ").replace(/\s+/g, " ").trim();
  return t;
}

const CONCERN_KEYWORDS = ["stress", "anxiety", "depressed", "depression", "angry", "anger", "sleep", "insomnia", "panic", "suicidal", "sad", "lonely"];

function isGreeting(text) {
  if (!text) return false;
  const t = normalizeTextForSmallTalk(text);
  if (/^\d{1,2}$/.test(t)) return false;
  const greetings = new Set(["hi","hii","hello","hey","namaste","hare krishna","harekrishna"]);
  if (greetings.has(t)) return true;
  return false;
}

function isSmallTalk(text) {
    if (!text) return false;
    const t = normalizeTextForSmallTalk(text);
    if (/^\d{1,2}$/.test(t)) return false;
    for (const keyword of CONCERN_KEYWORDS) {
        if (t.includes(keyword)) return false;
    }
    const smalls = new Set(["how are you", "thanks", "thx", "ok", "okay", "good", "nice", "cool", "bye", "see you"]);
    if (smalls.has(t)) return true;
    return false;
}

/* ---------------- Templates & Prompts ---------------- */
const WELCOME_TEMPLATE = `Hare Krishna 🙏\n\nI am Sarathi, your companion on this journey.\nThink of me as a link between your mann ki baat and the Gita's timeless gyaan.\n\nHow can I help you today?`;
const SMALLTALK_REPLY = `Hare Krishna 🙏 — I'm Sarathi, happy to meet you.\nHow can I help you today?`;
const SYSTEM_PROMPT = `You are SarathiAI — a compassionate guide inspired by the Bhagavad Gita. Tone: Modern, empathetic, and very concise. The EXPLANATION must be a maximum of 2-3 short sentences. The entire reply MUST be brief and easy to read on a phone without expanding. STRICTLY match the user's primary language. If their last message was mostly Hinglish, the EXPLANATION and FOLLOWUP must be in Hinglish. Otherwise, reply in English. Critically evaluate if the retrieved Context verse offers a solution. If the verse is merely descriptive of the problem (e.g., describing an arrogant person to someone complaining about ego), you must frame your explanation by stating "The Gita describes this mindset to warn against it..." and then provide Krishna's actual guidance on how to deal with the situation. REQUIRED OUTPUT FORMAT: ESSENCE: <one-line essence of Krishna's guidance, max 20 words>\nEXPLANATION: <max 2-3 short sentences applying the essence>\nOPTIONAL_PRACTICE: <one short practice (<=90s) if helpful>\nFOLLOWUP: <one brief clarifying question (opt)>\nImportant: DO NOT quote or repeat the provided verses. End with no extra commentary.`;

/* ---------------- Other Small Helpers ---------------- */
// ✅ THESE FUNCTIONS WERE MISSING
function safeText(md, ...keys) {
  if (!md) return "";
  for (const k of keys) {
    const v = md[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

function inferSpeakerFromSanskrit(san) {
  if (!san) return null;
  if (/\bअर्जुन\s*उवाच\b|\bArjuna\b/i.test(String(san))) return "Arjuna";
  if (/\bकृष्ण\s*उवाच\b|\bश्रीभगवान्\s*उवाच\b|\bKrishna\b/i.test(String(san))) return "Shri Krishna";
  return null;
}

function parseStructuredAI(aiText) {
  if (!aiText) return {};
  const out = {};
  const ess = aiText.match(/ESSENCE:\s*([^\n\r]*)/i);
  const exp = aiText.match(/EXPLANATION:\s*([\s\S]*?)(?:OPTIONAL_PRACTICE:|FOLLOWUP:|$)/i);
  const prac = aiText.match(/OPTIONAL_PRACTICE:\s*([^\n\r]*)/i);
  const follow = aiText.match(/FOLLOWUP:\s*([^\n\r]*)/i);
  if (ess) out.essence = ess[1].trim();
  if (exp) out.explanation = exp[1].trim();
  if (prac) out.practice = prac[1].trim();
  if (follow) out.followup = follow[1].trim();
  return out;
}

/* ---------------- Webhook/main flow ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound raw payload from Twilio:", JSON.stringify(req.body, null, 2));
    
    const { phone, text } = extractPhoneAndText(req.body);
    if (!phone || !text) {
        console.log("ℹ No actionable message — skip.");
        return res.status(200).send();
    }

    const incoming = String(text).trim();
    if (isGreeting(incoming)) {
      await sendViaTwilio(phone, WELCOME_TEMPLATE);
      return res.status(200).send();
    }
    
    if (isSmallTalk(incoming)) {
      await sendViaTwilio(phone, SMALLTALK_REPLY);
      return res.status(200).send();
    }
    
    const transformedQuery = await transformQueryForRetrieval(incoming);
    const norm = normalizeQuery(transformedQuery);
    let qVec = cacheGet(embedCache, norm);
    if (!qVec) {
      qVec = await openaiEmbedding(transformedQuery);
      if (!qVec) throw new Error("Failed to generate embedding vector.");
      cacheSet(embedCache, norm, qVec);
    }

    let matches = cacheGet(retrCache, norm);
    if (!matches) {
        matches = await multiNamespaceQuery(qVec, 5);
        cacheSet(retrCache, norm, matches);
    }

    const verseMatch = matches.find(m => m._namespace === "verse") || matches[0];
    if (!verseMatch) {
        await sendViaTwilio(phone, `I hear your concern about "${incoming}". Could you tell me more?`);
        return res.status(200).send();
    }

    const verseSanskrit = safeText(verseMatch.metadata, "sanskrit");
    const verseHinglish = safeText(verseMatch.metadata, "hinglish1");
    
    const contextText = `Reference: ${verseMatch.metadata?.reference}\nSanskrit: ${verseSanskrit}\nHinglish: ${verseHinglish}\nTranslation: ${safeText(verseMatch.metadata, "translation")}`;
    const modelSystem = SYSTEM_PROMPT;
    const modelUser = `User message: "${incoming}"\n\nContext:\n${contextText}`;
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
    return res.status(500).send();
  }
});

/* ---------------- Root, Admin, etc. ---------------- */
app.get("/", (_req, res) => res.send(`${BOT_NAME} is running with Twilio ✅`));

// ✅ PROACTIVE CHECK-IN AND OTHER ADMIN ROUTES ARE RESTORED
async function proactiveCheckin() {
  const now = Date.now();
  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
  for (const [phone, session] of sessions) {
    if (now - session.last_seen_ts > FORTY_EIGHT_HOURS_MS && now - (session.last_checkin_sent_ts || 0) > FORTY_EIGHT_HOURS_MS) {
      console.log(`Sending proactive check-in to ${phone}`);
      const reflective_questions = [
        "Hare Krishna. Just a gentle thought for your day: Reflect on one small action you took today where you focused on your effort, not the outcome. 🙏",
        "Hare Krishna. A gentle reminder for your day: Take a moment to notice the stillness between your breaths. 🙏",
        "Hare Krishna. A thought for you today: What is one thing you can let go of, just for this moment? 🙏"
      ];
      const question = reflective_questions[Math.floor(Math.random() * reflective_questions.length)];
      await sendViaTwilio(phone, question); // Using Twilio function
      session.last_checkin_sent_ts = now;
      session.last_seen_ts = now;
    }
  }
}
setInterval(proactiveCheckin, 6 * 60 * 60 * 1000);


/* ---------------- Start server ---------------- */
app.listen(PORT, () => console.log(`${BOT_NAME} listening on port ${PORT}`));
