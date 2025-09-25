// index.js — SarathiAI (Production-ready: Heltar + RAG + Speaker-check + Emotion mapping + Final Patches)
// Paste/replace this entire file in your project. This is a full and complete replacement.

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import fs from "fs";
import pg from "pg";

const { Pool } = pg;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Config / env ---------------- */
const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;

const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();

const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim();
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const PINECONE_NAMESPACE = (process.env.PINECONE_NAMESPACE || "verse").trim();
const PINECONE_NAMESPACES = (process.env.PINECONE_NAMESPACES || "").trim();

const HELTAR_API_KEY = (process.env.HELTAR_API_KEY || "").trim();
const HELTAR_PHONE_ID = (process.env.HELTAR_PHONE_ID || "").trim();

const MAX_OUTGOING_MESSAGES = parseInt(process.env.MAX_OUTGOING_MESSAGES || "3", 10) || 3; // Allowing 3 for better verse flow
const MAX_REPLY_LENGTH = parseInt(process.env.MAX_REPLY_LENGTH || "420", 10) || 420;

const dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

/* ---------------- Database Setup ---------------- */
async function setupDatabase() {
  try {
    const client = await dbPool.connect();
    // users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        phone_number VARCHAR(255) PRIMARY KEY,
        subscribed_daily BOOLEAN DEFAULT FALSE,
        last_activity_ts TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        chat_history JSONB DEFAULT '[]'::jsonb,
        conversation_stage VARCHAR(50) DEFAULT 'new_topic',
        last_topic_summary TEXT,
        messages_since_verse INT DEFAULT 0,
        first_seen_date DATE,
        last_seen_date DATE,
        total_sessions INT DEFAULT 0,
        total_incoming INT DEFAULT 0,
        total_outgoing INT DEFAULT 0,
        last_message TEXT,
        last_message_role VARCHAR(20),
        last_response_type VARCHAR(20),
        current_lesson INT DEFAULT 0,
        language_preference VARCHAR(10) DEFAULT 'English'
      );
    `);
    // keep lessons table definition in DB in case you re-enable later
    await client.query(`
      CREATE TABLE IF NOT EXISTS lessons (
        lesson_number INT PRIMARY KEY,
        verse TEXT,
        translation TEXT,
        commentary TEXT,
        reflection_question TEXT
      );
    `);
    client.release();
    console.log("✅ Database tables 'users' & 'lessons' are ready.");
  } catch (err) {
    console.error("❌ Error setting up database tables:", err?.message || err);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | DB Setup Error | ${JSON.stringify(err?.message || err)}\n`);
  }
}

/* ---------------- Helpers ---------------- */
function parseChatHistory(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

async function getUserState(phone) {
  try {
    const res = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
    if (res.rows.length === 0) {
      // create a new user row with sensible defaults
      await dbPool.query(
        "INSERT INTO users (phone_number, first_seen_date, last_seen_date, total_sessions, language_preference) VALUES ($1, CURRENT_DATE, CURRENT_DATE, 1, 'English')",
        [phone]
      );
      const newRes = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
      const u = newRes.rows[0];
      u.chat_history = parseChatHistory(u.chat_history);
      return u;
    }
    const user = res.rows[0];
    user.chat_history = parseChatHistory(user.chat_history);
    return user;
  } catch (err) {
    console.error("getUserState failed:", err?.message || err);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | getUserState Error | ${JSON.stringify(err?.message || err)}\n`);
    return { phone_number: phone, chat_history: [], conversation_stage: "new_topic", current_lesson: 0, language_preference: "English" };
  }
}

async function updateUserState(phone, updates) {
  try {
    if (!updates || Object.keys(updates).length === 0) return;
    if (updates.last_activity_ts === "NOW()") updates.last_activity_ts = new Date().toISOString();
    const keys = Object.keys(updates);
    const vals = keys.map(k => {
      const v = updates[k];
      if (Array.isArray(v) || (typeof v === "object" && v !== null)) return JSON.stringify(v);
      return v;
    });
    vals.push(phone);
    const clauses = keys.map((k, i) => `${k} = $${i + 1}`);
    const sql = `UPDATE users SET ${clauses.join(", ")} WHERE phone_number = $${keys.length + 1}`;
    await dbPool.query(sql, vals);
  } catch (err) {
    console.error("updateUserState failed:", err?.message || err);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | updateUserState Error | ${JSON.stringify(err?.message || err)}\n`);
  }
}

/* ---------------- Analytics ---------------- */
async function trackIncoming(phone, text) {
  try {
    const user = await getUserState(phone);
    const now = new Date();
    let addSession = false;
    if (user.last_activity_ts) {
      const last = new Date(user.last_activity_ts);
      const diffHours = (now - last) / (1000 * 60 * 60);
      if (diffHours > 12) addSession = true;
    } else {
      addSession = true;
    }

    const updates = {
      last_activity_ts: now.toISOString(),
      last_seen_date: now.toISOString().slice(0, 10),
      last_message: text,
      last_message_role: "user",
      total_incoming: (user.total_incoming || 0) + 1
    };
    if (!user.first_seen_date) updates.first_seen_date = now.toISOString().slice(0, 10);
    if (addSession) updates.total_sessions = (user.total_sessions || 0) + 1;

    await updateUserState(phone, updates);
    console.log(`📊 Incoming tracked: ${phone}`);
  } catch (err) {
    console.error("trackIncoming failed:", err?.message || err);
  }
}

async function trackOutgoing(phone, reply, type = "chat") {
  try {
    const user = await getUserState(phone);
    const updates = {
      last_activity_ts: new Date().toISOString(),
      last_message: reply,
      last_message_role: "assistant",
      last_response_type: type,
      total_outgoing: (user.total_outgoing || 0) + 1
    };
    await updateUserState(phone, updates);
    console.log(`📊 Outgoing tracked: ${phone} (${type})`);
  } catch (err) {
    console.error("trackOutgoing failed:", err?.message || err);
  }
}

/* ---------------- Heltar sending ---------------- */
async function sendViaHeltar(phone, message, type = "chat") {
  try {
    const safeMessage = String(message || "").trim().slice(0, 4096);
    if (!safeMessage) return; // Do not send empty messages
    if (!HELTAR_API_KEY) {
      console.warn(`(Simulated -> ${phone}): ${safeMessage}`);
      await trackOutgoing(phone, safeMessage, type);
      return { simulated: true, message: safeMessage };
    }

    const payload = { messages: [{ clientWaNumber: phone, message: safeMessage, messageType: "text" }] };
    const resp = await axios.post("https://api.heltar.com/v1/messages/send", payload, {
      headers: {
        Authorization: `Bearer ${HELTAR_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 20000
    });

    await trackOutgoing(phone, safeMessage, type);
    console.log(`✅ Heltar message sent to ${phone}: ${String(safeMessage).slice(0, 140).replace(/\n/g, " ")}`);
    return resp.data;
  } catch (err) {
    console.error("Heltar send error:", err?.response?.data || err?.message || err);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | Heltar Send Error | ${JSON.stringify(err?.response?.data || err?.message || err)}\n`);
    return null;
  }
}

/* ---------------- Text classification / intents (Patched) ---------------- */
function isGreetingQuery(text) {
    const lowerText = text.toLowerCase();
    const greetingRegex = /\b(hi|hello|hey|hii|hiya|yo|good morning|good afternoon|good evening|how are you|what's up|how's it going|kaise ho|kaise hain aap|namaste|hare krishna)\b/;
    return greetingRegex.test(lowerText);
}

function isCapabilitiesQuery(text) {
    const lowerText = text.toLowerCase();
    const capabilitiesRegex = /\b(what can you do|what are your capabilities|tell me about yourself|who are you|can i get more info|give me info|what do you do)\b/;
    return capabilitiesRegex.test(lowerText);
}

function isSmallTalk(t) { return /\b(thanks|thank you|ok|okay|good|nice|cool|bye|fine|im fine|i am fine|i'm fine|i am happy|i'm happy|i am well|i'm well)\b/i.test(t); }
function isEnglishRequest(t) { return /\benglish\b/i.test(t); }
function isHindiRequest(t) { return /\b(hindi|हिन्दी|हिंदी)\b/i.test(t); }

/* ---------------- Emotion detection (keyword-based) ---------------- */
const EMOTION_KEYWORDS = {
  stressed: ["stress", "stressed", "stressing", "anxious", "anxiety", "tension", "overwhelmed", "panic"],
  sadness: ["sad", "depressed", "depression", "lonely", "sorrow", "low", "down", "tired", "mnn nhi krta"],
  anger: ["angry", "rage", "annoyed", "irritated", "frustrated"],
  confusion: ["confused", "lost", "uncertain", "uncertainty", "doubt", "what to do"],
  fear: ["afraid", "scared", "fear", "fearful", "terror"]
};

function detectEmotion(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const [label, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    for (const k of keywords) {
      if (t.includes(k)) return label;
    }
  }
  return null;
}

/* ---------------- Language detection (lightweight) ---------------- */
function detectLanguageFromText(text) {
  if (!text || typeof text !== "string") return "English";
  if (/[ऀ-ॿ]/.test(text)) return "Hindi";
  const hindiKeywords = ["है", "मैं", "और", "क्या", "कर", "किया", "हूँ", "हैं", "नहीं", "आप", "क्यों"];
  const lowered = text.toLowerCase();
  for (const k of hindiKeywords) if (lowered.includes(k)) return "Hindi";
  return "English";
}

/* ---------------- System prompts (tightened) ---------------- */
const RAG_SYSTEM_PROMPT = `You are SarathiAI, a compassionate Bhagavad-Gita guide. Produce a short, structured reply using the following parts separated by "||".
Parts:
1) Sanskrit verse (one short line or verse reference). 
2) A one-sentence translation (Hinglish if user language is Hindi, otherwise English). 
3) "Shri Krishna kehte hain:" + a 1-2 sentence essence/explanation tailored to the user's concern (only Krishna's teaching content here).
4) A single short reflection question (exactly one question sentence) inviting action.

STRICT: Entire reply <= 3 sentences, each bubble <= 60 words. Last bubble MUST be a question. Reply in {{LANGUAGE}}.
`;

const CHAT_SYSTEM_PROMPT = `You are SarathiAI, a compassionate Gita guide. Reply briefly (1-3 sentences, under 60 words), empathetically, and end with a question to invite a reply. Use user's chat history for context. If the user expresses severe distress, signal [NEW_TOPIC]. Do not quote new Sanskrit verses here. Reply in {{LANGUAGE}}.
`;

/* ---------------- OpenAI & Pinecone helpers ---------------- */
async function openaiChat(messages, maxTokens = 400) {
  if (!OPENAI_KEY) {
    console.warn("OPENAI_API_KEY missing — openaiChat returning null");
    return null;
  }
  try {
    const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.6 };
    const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 25000
    });
    return resp.data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("openaiChat error:", err?.response?.data || err?.message || err);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | openaiChat Error | ${JSON.stringify(err?.response?.data || err?.message)}\n`);
    return null;
  }
}

async function getEmbedding(text) {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY missing");
  try {
    const resp = await axios.post("https://api.openai.com/v1/embeddings", { model: EMBED_MODEL, input: text }, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 30000
    });
    return resp.data?.data?.[0]?.embedding;
  } catch (err) {
    console.error("getEmbedding error:", err?.response?.data || err?.message || err);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | getEmbedding Error | ${JSON.stringify(err?.response?.data || err?.message)}\n`);
    throw err;
  }
}

async function pineconeQuery(vector, topK = 5, namespace) {
  if (!PINECONE_HOST || !PINECONE_API_KEY) throw new Error("Pinecone config missing");
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/query`;
  const body = { vector, topK, includeMetadata: true };
  if (namespace) body.namespace = namespace;
  const resp = await axios.post(url, body, {
    headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" }, timeout: 20000
  });
  return resp.data;
}

function getNamespacesArray() {
  if (PINECONE_NAMESPACES) return PINECONE_NAMESPACES.split(",").map(s => s.trim()).filter(Boolean);
  return [PINECONE_NAMESPACE || "verse"];
}

async function multiNamespaceQuery(vector, topK = 8) {
  const namespaces = getNamespacesArray();
  const promises = namespaces.map(async ns => {
    try {
      const r = await pineconeQuery(vector, topK, ns);
      return (r?.matches || []).map(m => ({ ...m, _namespace: ns }));
    } catch (err) {
      console.warn("Pinecone namespace query failed:", ns, err?.message || err);
      return [];
    }
  });
  const arr = await Promise.all(promises);
  const merged = arr.flat();
  merged.sort((a, b) => (b.score || 0) - (a.score || 0));
  return merged;
}

/* ---------------- Utilities for response processing ---------------- */
function ensureResponseBrevity(text) {
  if (!text) return text;
  let t = String(text).trim();
  if (t.length > MAX_REPLY_LENGTH) t = t.slice(0, MAX_REPLY_LENGTH).trim();
  // Don't replace all whitespace, just multiple newlines to one, and trim spaces
  t = t.replace(/\n\s*\n/g, '\n').trim();
  return t;
}

function ensureEndsWithQuestion(text, language = "English") {
    if (!text) return text;
    let t = String(text).trim();
    if (/[?？]\s*$/.test(t)) return t;
    if (t.includes("||")) return t;
    
    const questionPrompt = language === "Hindi" ? "क्या आप इस पर और जानना चाहेंगे?" : "Would you like to explore this further?";
    return `${t} ${questionPrompt}`.trim();
}

/* ---------------- Verse speaker detection & reframing ---------------- */
function identifySpeakerFromMetadata(metadata = {}) {
  const possible = (metadata.speaker || metadata.author || metadata.role || metadata.source || "").toString().toLowerCase();
  if (possible.includes("krishna") || possible.includes("śrī bhagavān") || possible.includes("shri krishna") || possible.includes("bhagavan")) return "krishna";
  if (possible.includes("arjuna")) return "arjuna";
  if (possible.includes("sanjaya")) return "sanjaya";
  if (possible.includes("dhritarashtra") || possible.includes("dhritarashtra")) return "dhritarashtra";
  const text = (metadata.sanskrit || metadata.verse || metadata.sanskrit_text || "").toString();
  if (/श्रीभगवानुवाच|श्रीभगवान् उवाच|śrī bhagavān uvāca/i.test(text)) return "krishna";
  if (/अर्जुन उवाच|arjuna uvacha|arjuna said/i.test(text)) return "arjuna";
  if (/सञ्जय उवाच|sanjaya uvacha|sanjaya said/i.test(text)) return "sanjaya";
  return "unknown";
}

/* Helper: fetch a strong Krishna verse for a mapped emotion (fallback list) - MODIFIED */
const KRISHNA_FALLBACK_BY_EMOTION = {
  stressed: { 
    verseRef: "2.47", 
    sanskrit: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन", 
    translation: "You have a right to perform your actions, but not to the fruits of them.",
    reflection_question: "What is one task today where you can focus only on your effort, not the result?"
  },
  sadness: { 
    verseRef: "2.13", 
    sanskrit: "देहिनोऽस्मिन्यथा देहे", 
    translation: "Just as the embodied soul passes through childhood, youth, and old age, it similarly passes into another body at death. The wise are not bewildered by this.",
    reflection_question: "Remembering that feelings, like seasons, pass, what is one constant truth you can hold onto today?"
  },
  anger: { 
    verseRef: "2.63", 
    sanskrit: "क्रोधाद्भवति संमोहः", 
    translation: "From anger comes delusion, and from delusion, the bewilderment of memory. When memory is bewildered, intelligence is lost.",
    reflection_question: "What is one thing you can do to create a moment of pause before you react today?"
  },
  confusion: { 
    verseRef: "18.66", 
    sanskrit: "सर्वधर्मान्परित्यज्य मामेकं शरणं व्रज", 
    translation: "Abandon all varieties of duties and just surrender unto Me. I shall deliver you from all sinful reactions; do not fear.",
    reflection_question: "What is one worry you can try to let go of and trust in a higher plan for?"
  },
  fear: { 
    verseRef: "2.40", 
    sanskrit: "नेहाभिक्रमनाशोऽस्ति", 
    translation: "In this endeavor, there is no loss or diminution, and even a little advancement on this path can protect one from the most dangerous type of fear.",
    reflection_question: "What is one small step forward, no matter how tiny, you can take right now?"
  }
};

/* ---------------- RAG & response assembly (Patched) ---------------- */
async function transformQueryForRetrieval(userQuery) {
  try {
    const prompt = `You are an expert in the Bhagavad Gita. Transform the user's query into a concise search phrase for retrieval of related verses.\nUser: "${userQuery}"\nReturn just a short search phrase.`;
    const resp = await openaiChat([{ role: "user", content: prompt }], 40);
    if (!resp) return userQuery;
    return resp.replace(/["']/g, "").trim();
  } catch (err) {
    console.warn("transformQueryForRetrieval failed — using original query");
    return userQuery;
  }
}

function safeText(md, key) { return md && md[key] ? String(md[key]).trim() : ""; }

async function fetchKrishnaVerseByEmotion(emotionLabel) {
  const fallback = KRISHNA_FALLBACK_BY_EMOTION[emotionLabel];
  if (!fallback) return null;
  
  const part1 = `${fallback.sanskrit} (${fallback.verseRef})`;
  const part2 = `Shri Krishna says: "${fallback.translation}"`;
  const part3 = fallback.reflection_question;
  
  return { combined: `${part1}\n\n${part2}\n\n${part3}`, parts: [part1, part2, part3] };
}

async function getRAGResponse(phone, text, language, chatHistory, emotionLabel = null) {
  try {
    if (emotionLabel) {
      const fallback = await fetchKrishnaVerseByEmotion(emotionLabel);
      if (fallback) {
        for (const part of fallback.parts) {
          await sendViaHeltar(phone, part, "verse");
          await new Promise(r => setTimeout(r, 900));
        }
        return { assistantResponse: fallback.combined, stage: "chatting", topic: text };
      }
    }

    const transformed = await transformQueryForRetrieval(text);
    const qVec = await getEmbedding(transformed);
    const matches = await multiNamespaceQuery(qVec, 8);

    const verseMatch = matches.find(m => (m.metadata && (m.metadata.sanskrit || m.metadata.verse || m.metadata.sanskrit_text)));
    console.log(`[Pinecone] matches: ${matches.length}; best score: ${verseMatch?.score}`);

    if (!verseMatch || (verseMatch.score || 0) < 0.25) {
      const fallback = language === "Hindi" ? "मैं आपकी बात सुन रहा हूँ। थोड़ा और बताइये ताकि मैं बेहतर मदद कर सकूँ?" : "I hear your concern. Could you please share a little more so I can offer the best guidance?";
      await sendViaHeltar(phone, fallback, "fallback");
      return { assistantResponse: fallback, stage: "chatting", topic: text };
    }

    const md = verseMatch.metadata || {};
    const speaker = identifySpeakerFromMetadata(md);
    
    let aiResp;

    if (speaker === "krishna") {
      const sanskritText = safeText(md, "sanskrit") || safeText(md, "verse") || safeText(md, "sanskrit_text");
      const translation = safeText(md, "translation") || safeText(md, "hinglish1") || safeText(md, "english") || "";
      const verseRef = safeText(md, "reference") || safeText(md, "verse_ref") || safeText(md, "id") || "";
      const ragPrompt = RAG_SYSTEM_PROMPT.replace("{{LANGUAGE}}", language || "English");
      const modelUser = `User's problem: "${text}"\n\nVerse Context:\nSanskrit: ${sanskritText}\nTranslation: ${translation}\nReference: ${verseRef}`;
      aiResp = await openaiChat([{ role: "system", content: ragPrompt }, { role: "user", content: modelUser }], 600);
    } else {
      const validationText = safeText(md, "translation") || safeText(md, "sanskrit");
      const reframePrompt = `A user feels "${text}". A related but non-Krishna Gita passage says: "${validationText}". Reframe this by acknowledging the feeling (e.g., "Even Arjuna felt this way..."), then provide a relevant teaching directly from Krishna to offer guidance. Formulate a response based on Krishna's words.`;
      const messages = [{ role: "system", content: CHAT_SYSTEM_PROMPT.replace("{{LANGUAGE}}", language) }, { role: "user", content: reframePrompt }];
      aiResp = await openaiChat(messages, 600);
    }

    if (!aiResp) {
        const fallback2 = language === "Hindi" ? "मैं यहाँ हूँ, अगर आप साझा करें तो मैं मदद कर सकता हूँ।" : "I am here to listen.";
        await sendViaHeltar(phone, fallback2, "fallback");
        return { assistantResponse: fallback2, stage: "chatting", topic: text };
    }
    
    const cleanResp = ensureResponseBrevity(aiResp);
    const finalResp = ensureEndsWithQuestion(cleanResp, language);
    const parts = finalResp.split("||").map(p => p.trim()).filter(Boolean);

    if (parts.length > 1) { // It's a structured RAG response
        if (parts.length <= MAX_OUTGOING_MESSAGES) {
            for (const part of parts) {
                await sendViaHeltar(phone, part, "verse");
                await new Promise(r => setTimeout(r, 900));
            }
        } else {
            const toSendIndividually = Math.max(0, MAX_OUTGOING_MESSAGES - 1);
            for (let i = 0; i < toSendIndividually; i++) {
                await sendViaHeltar(phone, parts[i], "verse");
                await new Promise(r => setTimeout(r, 900));
            }
            const remaining = parts.slice(toSendIndividually).join("\n\n");
            await sendViaHeltar(phone, remaining, "verse");
        }
        return { assistantResponse: finalResp.replace(/\|\|/g, "\n"), stage: "chatting", topic: text };
    } else { // It's a single bubble (likely a reframed response)
        await sendViaHeltar(phone, finalResp, "chat");
        return { assistantResponse: finalResp, stage: "chatting", topic: text };
    }

  } catch (err) {
    console.error("getRAGResponse failed:", err?.message || err);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | getRAGResponse Error | ${JSON.stringify(err?.message || err)}\n`);
    const fallback = language === "Hindi" ? "मैं सुन रहा हूँ।" : "I am here to listen.";
    try { await sendViaHeltar(phone, fallback, "fallback"); } catch (e) {}
    return { assistantResponse: fallback, stage: "chatting", topic: text };
  }
}

/* ---------------- Webhook handler ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    res.status(200).send("OK");

    const body = req.body || {};
    let msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || body?.messages?.[0] || body;
    if (!msg || typeof msg !== "object") {
      console.log("⚠️ Ignoring non-message webhook event.");
      return;
    }

    const phone = msg?.from;
    const rawText = msg?.text?.body || msg?.button?.payload || msg?.interactive?.button_reply?.id || msg?.interactive?.list_reply?.id || "";
    const text = String(rawText || "").trim();
    if (!phone || text.length === 0) {
      console.warn("⚠️ Webhook missing phone/text.");
      return;
    }

    console.log(`📩 Incoming from ${phone}: "${text}"`);
    await trackIncoming(phone, text);

    const user = await getUserState(phone);

    const autoLang = detectLanguageFromText(text);
    let language = user.language_preference || "English";
    if ((!user.language_preference || user.language_preference === "English") && autoLang === "Hindi") {
      language = "Hindi";
      await updateUserState(phone, { language_preference: "Hindi" });
    } else {
      language = user.language_preference || autoLang;
    }

    const lower = text.toLowerCase();
    
    // --- Patched Intent Handling ---
    if (isCapabilitiesQuery(lower)) {
        console.log(`✅ Intent detected: Capabilities Query`);
        const reply = language === "Hindi"
            ? "मैं सारथी हूँ, आपका साथी। मैं आपको गीता के श्लोक समझा सकता हूँ, आपके सवालों का जवाब दे सकता हूँ, और आपकी बातें सुन सकता हूँ।"
            : "I am Sarathi, your companion. I can help you by explaining Gita verses, answering your questions, and listening to what's on your mind.";
        await sendViaHeltar(phone, reply, "capabilities");
        return;
    }
    
    if (isGreetingQuery(lower)) {
        console.log(`✅ Intent detected: Greeting`);
        const welcome = language === "Hindi"
            ? "Hare Krishna 🙏\nमैं सारथी हूँ, आपका साथी। क्या आप चाहेंगे: (1) एक छोटा उपदेश, या (2) अपनी बात साझा करें? कृपया 1 या 2 में जवाब दें।"
            : "Hare Krishna 🙏\nI am Sarathi, your companion. Would you like: (1) a short teaching from Krishna, or (2) to share what's on your mind? Please reply with 1 or 2.";
        await sendViaHeltar(phone, welcome, "welcome");
        await updateUserState(phone, { conversation_stage: "new_topic", chat_history: JSON.stringify([]) });
        return;
    }
    // --- End Patched Intent Handling ---

    if (isEnglishRequest(lower)) {
      await updateUserState(phone, { language_preference: "English" });
      await sendViaHeltar(phone, "Language switched to English. How can I help you today?", "language");
      return;
    }
    if (isHindiRequest(lower)) {
      await updateUserState(phone, { language_preference: "Hindi" });
      await sendViaHeltar(phone, "भाषा बदल दी गई है — अब उत्तर हिन्दी में मिलेंगे।", "language");
      return;
    }
    
    if (["1", "2", "one", "two"].includes(lower.trim())) {
      if (["1", "one"].includes(lower.trim())) {
        const fallback = await fetchKrishnaVerseByEmotion("stressed");
        if (fallback) {
          for (const part of fallback.parts) {
            await sendViaHeltar(phone, part, "verse");
            await new Promise(r => setTimeout(r, 900));
          }
          await updateUserState(phone, { conversation_stage: "chatting" });
          return;
        }
      } else {
        const prompt = language === "Hindi" ? "कृपया बताइये — अभी आपके मन में क्या चल रहा है?" : "Please share — what is on your mind right now?";
        await sendViaHeltar(phone, prompt, "prompt");
        await updateUserState(phone, { conversation_stage: "chatting" });
        return;
      }
    }

    if (isSmallTalk(lower)) {
      const reply = language === "Hindi"
        ? "धन्यवाद 🙏 क्या आप आज किसी विशेष विषय पर बात करना चाहेंगे?"
        : "Thanks! Would you like a short thought for the day or to share what you're feeling?";
      await sendViaHeltar(phone, reply, "small_talk");
      return;
    }

    const emotionLabel = detectEmotion(text);
    console.log(`Detected emotion: ${emotionLabel}`);

    let chatHistory = parseChatHistory(user.chat_history || []);
    chatHistory.push({ role: "user", content: text });
    if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);

    const ragResult = await getRAGResponse(phone, text, language, chatHistory, emotionLabel);
    if (ragResult && ragResult.assistantResponse) {
        chatHistory.push({ role: "assistant", content: ragResult.assistantResponse });
        await updateUserState(phone, {
          last_topic_summary: ragResult.topic || text,
          conversation_stage: "chatting",
          chat_history: JSON.stringify(chatHistory),
          language_preference: language
        });
    }
    return;

  } catch (err) {
    console.error("❌ Webhook error:", err?.message || err);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | Webhook Error | ${JSON.stringify(err?.message || err)}\n`);
  }
});

/* ---------------- Health check endpoint ---------------- */
app.get("/health", (req, res) => {
  res.json({ status: "ok", bot: BOT_NAME, timestamp: new Date().toISOString() });
});

/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
  console.log(`\n🚀 ${BOT_NAME} listening on port ${PORT}`);
  setupDatabase();
});
