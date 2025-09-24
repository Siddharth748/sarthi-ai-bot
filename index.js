// index.js — SarathiAI (Production-ready: Heltar + RAG + Lessons + Analytics + Language-aware)
// Paste/replace this entire file in your project.

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

const MAX_OUTGOING_MESSAGES = parseInt(process.env.MAX_OUTGOING_MESSAGES || "2", 10) || 2;
const MAX_REPLY_LENGTH = parseInt(process.env.MAX_REPLY_LENGTH || "420", 10) || 420; // safety cap

const dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

/* ---------------- Database Setup ---------------- */
async function setupDatabase() {
  try {
    const client = await dbPool.connect();
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
    const safeMessage = String(message || "").trim().slice(0, 4096); // avoid insane sizes
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

/* ---------------- Lessons ---------------- */
async function sendLesson(phone, lessonNumber) {
  try {
    const res = await dbPool.query("SELECT * FROM lessons WHERE lesson_number = $1", [lessonNumber]);
    if (!res.rows || res.rows.length === 0) {
      await sendViaHeltar(phone, "🌸 You've completed all lessons in this course!", "lesson");
      return;
    }
    const lesson = res.rows[0];
    // Keep short, send in little bites
    if (lesson.verse) await sendViaHeltar(phone, lesson.verse, "lesson");
    await new Promise(r => setTimeout(r, 800));
    if (lesson.translation) await sendViaHeltar(phone, lesson.translation, "lesson");
    await new Promise(r => setTimeout(r, 800));
    if (lesson.commentary) await sendViaHeltar(phone, `Shri Krishna kehte hain: ${lesson.commentary}`, "lesson");
    await new Promise(r => setTimeout(r, 800));
    if (lesson.reflection_question) await sendViaHeltar(phone, `🤔 ${lesson.reflection_question}`, "lesson");
    await new Promise(r => setTimeout(r, 600));
    await sendViaHeltar(phone, `Reply "Hare Krishna" or "Next" to receive the next lesson when you're ready. Reply "Exit" to leave lessons.`, "lesson_prompt");
  } catch (err) {
    console.error("sendLesson failed:", err?.message || err);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | sendLesson Error | ${JSON.stringify(err?.message || err)}\n`);
  }
}

/* ---------------- Text classification / intents ---------------- */
function normalizeText(s) { try { return String(s || "").trim(); } catch { return ""; } }
function isGreeting(t) { return /\b(hi|hello|hey|hii|namaste|hare\s*krishna)\b/i.test(t); }
function isHowAreYou(t) { return /\b(how\s*are\s*(you|u)|how\s*r\s*u|kaise\s+ho|kaise\s+hain)\b/i.test(t); }
function isSmallTalk(t) { return /\b(thanks|thank you|ok|okay|good|nice|cool|bye|fine|im fine|i am fine|i'm fine|i am happy|i'm happy|i am well|i'm well|good morning|good night)\b/i.test(t); }
function isLessonRequest(t) { return /\b(teach|lesson|gita|bhagavad|bhagavad gita)\b/i.test(t); }
function isEnglishRequest(t) { return /\benglish\b/i.test(t); }
function isHindiRequest(t) { return /\b(hindi|हिन्दी|हिंदी)\b/i.test(t); }
function isExitLessons(t) { return /\b(exit|stop lessons|stop|leave)\b/i.test(t); }
function isRestartLesson(t) { return /\b(restart|start again)\b/i.test(t); }

/* ---------------- Language detection ----------------
   Lightweight: Detect Devanagari characters OR Hindi function words.
   If Devanagari present or heavy Hindi tokens -> Hindi. Else English.
*/
function detectLanguageFromText(text) {
  if (!text || typeof text !== "string") return "English";
  const trimmed = text.trim();
  // Devanagari Unicode range detection
  if (/[ऀ-ॿ]/.test(trimmed)) return "Hindi";
  // common Hindi words tokens detection
  const hindiKeywords = ["है", "मैं", "और", "क्या", "कर", "किया", "हूँ", "हैं", "नहीं", "आप", "क्यों", "कितना", "किस", "कहाँ"];
  const lowered = trimmed.toLowerCase();
  let hindiCount = 0;
  for (const k of hindiKeywords) if (lowered.includes(k)) hindiCount++;
  if (hindiCount >= 1) return "Hindi";
  return "English";
}

/* ---------------- System prompts (tightened) ---------------- */
const RAG_SYSTEM_PROMPT = `You are SarathiAI, a compassionate Bhagavad Gita guide. Respond concisely and practically.
- OUTPUT FORMAT: Use "||" to separate message bubbles; the assistant will output multiple bubbles separated by "||".
- Part 1: Sanskrit verse (one short line or reference).
- Part 2: One short Hinglish translation (or English if user language is English). Max 1 sentence.
- Part 3: "Shri Krishna kehte hain:" + 1-2 sentence essence/explanation tailored to the user's concern. Maximum 2 sentences.
- Part 4: A single short, compassionate follow-up question inviting action/reflection (exactly one question sentence).
- STRICT RULES: Each bubble must be ≤ 60 words. Do NOT write more than 3 sentences total across all bubbles. Always end the entire response with a clear question (the last bubble must be a question). Strictly reply in {{LANGUAGE}}.
`;

const CHAT_SYSTEM_PROMPT = `You are SarathiAI, a compassionate Gita guide. Continue the conversation empathetically and briefly.
- Use the user's chat history for context.
- Keep replies to 1-3 sentences and under 60 words total.
- If the user expresses strong negative emotions (anger, suicidal ideation, intense anxiety), append the token [NEW_TOPIC] to your reply (so the system will send a new teaching).
- Do NOT include any new Sanskrit verses here. Provide short, practical guidance and end with a question to invite a reply.
- Strictly reply in {{LANGUAGE}}.
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

/* ---------------- Post-processing of model output ---------------- */
function ensureResponseBrevity(text, language = "English") {
  if (!text) return text;
  let t = String(text).trim();
  // truncate to safety cap
  if (t.length > MAX_REPLY_LENGTH) t = t.slice(0, MAX_REPLY_LENGTH).trim();
  // reduce multiple spaces/newlines
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function ensureEndsWithQuestion(text, language = "English") {
  if (!text) return text;
  let t = String(text).trim();
  // If already ends with question mark, keep.
  if (/[?؟]$/.test(t)) return t;
  // If ends with exclamation or period, replace with question phrasing
  const questionPrompt = language === "Hindi" ? "क्या आप इसे आज आज़माना चाहेंगे?" : "Would you like to try this now?";
  // If last sentence is long, append short question separated by space
  return (t + " " + questionPrompt).trim();
}

/* ---------------- Utility for RAG ---------------- */
function safeText(md, key) { return md && md[key] ? String(md[key]).trim() : ""; }

async function transformQueryForRetrieval(userQuery) {
  try {
    const prompt = `You are an expert in the Bhagavad Gita. Transform the user's query into a concise search phrase for retrieval of related verses.\nUser: "${userQuery}"\nReturn just a short search phrase.`;
    const resp = await openaiChat([{ role: "user", content: prompt }], 40);
    if (!resp) return userQuery;
    const t = resp.replace(/["']/g, "").trim();
    console.log(`ℹ️ Transformed query: "${userQuery}" -> "${t}"`);
    return t;
  } catch (err) {
    console.warn("transformQueryForRetrieval failed — using original query");
    return userQuery;
  }
}

/* ---------------- Main RAG + sending logic ---------------- */
async function getRAGResponse(phone, text, language, chatHistory) {
  try {
    const transformed = await transformQueryForRetrieval(text);
    const qVec = await getEmbedding(transformed);
    const matches = await multiNamespaceQuery(qVec, 8);

    const verseMatch = matches.find(m => (m.metadata && (m.metadata.sanskrit || m.metadata.verse || m.metadata.sanskrit_text)));
    console.log(`[Pinecone] matches: ${matches.length}; best score: ${verseMatch?.score}`);

    if (!verseMatch || (verseMatch.score || 0) < 0.25) {
      const fallback = language === "Hindi" ? "Main aapki baat sun raha hoon. Thoda aur bataayiye taki main behtar madad kar sakun?" : "I hear your concern. Could you please share a little more about what is on your mind so I can offer the best guidance?";
      await sendViaHeltar(phone, fallback, "fallback");
      return { assistantResponse: fallback, stage: "chatting", topic: text };
    }

    const verseSanskrit = safeText(verseMatch.metadata, "sanskrit") || safeText(verseMatch.metadata, "verse") || "";
    const verseHinglish = safeText(verseMatch.metadata, "hinglish1") || safeText(verseMatch.metadata, "translation") || "";
    const verseContext = `Sanskrit: ${verseSanskrit}\nTranslation: ${verseHinglish}`;

    const ragPrompt = RAG_SYSTEM_PROMPT.replace("{{LANGUAGE}}", language || "English");
    const modelUser = `User's problem: "${text}"\n\nContext from Gita:\n${verseContext}`;

    let aiResp = await openaiChat([{ role: "system", content: ragPrompt }, { role: "user", content: modelUser }], 600);
    if (!aiResp) {
      const fallback2 = language === "Hindi" ? "Main yahan hoon, agar aap share karen toh main madad kar sakta hoon." : "I am here to listen.";
      await sendViaHeltar(phone, fallback2, "fallback");
      return { assistantResponse: fallback2, stage: "chatting", topic: text };
    }

    // Post-process aiResp: ensure brevity & question ending
    aiResp = ensureResponseBrevity(aiResp, language);
    aiResp = ensureEndsWithQuestion(aiResp, language);

    // split into parts by "||"
    const partsRaw = aiResp.split("||").map(p => p.trim()).filter(Boolean);
    // limit outgoing messages: if >MAX, send first MAX-1 then combine rest
    const parts = partsRaw;
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

    return { assistantResponse: aiResp.replace(/\|\|/g, "\n"), stage: "chatting", topic: text };
  } catch (err) {
    console.error("getRAGResponse failed:", err?.message || err);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | getRAGResponse Error | ${JSON.stringify(err?.message || err)}\n`);
    const fallback = language === "Hindi" ? "Main sun raha hoon." : "I am here to listen.";
    try { await sendViaHeltar(phone, fallback, "fallback"); } catch (e) {}
    return { assistantResponse: fallback, stage: "chatting", topic: text };
  }
}

/* ---------------- Webhook handler ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    // Acknowledge quickly
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

    // fetch user state
    const user = await getUserState(phone);

    // detect language automatically based on incoming text, but prefer stored preference if user explicitly set
    const autoLang = detectLanguageFromText(text);
    let language = user.language_preference || "English";
    // If stored preference is default "English" but text indicates Hindi, switch automatically
    if (!user.language_preference || user.language_preference === "English") {
      if (autoLang === "Hindi") {
        language = "Hindi";
        await updateUserState(phone, { language_preference: "Hindi" });
      } else {
        language = "English";
        // we don't force setting English flag here to avoid overriding deliberate user choice
      }
    } else {
      language = user.language_preference;
    }

    const lower = text.toLowerCase();

    // Manual Language switch commands still accepted
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

    // Greetings
    if (isGreeting(lower)) {
      const welcome = language === "Hindi"
        ? "Hare Krishna 🙏\nMain Sarathi hoon — aapka saathi. Kya main ek chhota sandesh ya ek chhota abhyas bhejun?"
        : "Hare Krishna 🙏\nI am Sarathi, your companion. Would you like a short teaching from Krishna for today, or want to talk about something on your mind?";
      await sendViaHeltar(phone, welcome, "welcome");
      await updateUserState(phone, { conversation_stage: "new_topic", chat_history: JSON.stringify([]), language_preference: language });
      return;
    }

    // How are you
    if (isHowAreYou(lower)) {
      const reply = language === "Hindi"
        ? "Main theek hoon, dhanyavaad! Aap kaise mehsoos kar rahe hain aaj?"
        : "I'm well, thank you! How are you feeling today?";
      await sendViaHeltar(phone, reply, "small_talk");
      return;
    }

    // Small-talk
    if (isSmallTalk(lower)) {
      const reply = language === "Hindi"
        ? "Dhanyavaad 🙏 Kya aapko aaj kisi vishesh baat par sahayata chahiye?"
        : "Thanks! Would you like a short thought for the day or would you like to share what's on your mind?";
      await sendViaHeltar(phone, reply, "small_talk");
      return;
    }

    // Lesson explicit request (start/continue)
    if (isLessonRequest(lower) || lower === "teach me" || lower === "teach me gita") {
      let nextLesson = (user.current_lesson || 0) + 1;
      await updateUserState(phone, { current_lesson: nextLesson, conversation_stage: "lesson_mode", language_preference: language });
      await sendLesson(phone, nextLesson);
      return;
    }

    // If in lesson_mode: navigation commands, exit, restart, or free queries (RAG) but keep them in lessons
    if (user.conversation_stage === "lesson_mode") {
      if (lower === "next" || lower.includes("hare krishna") || lower === "harekrishna") {
        const nextLesson = (user.current_lesson || 0) + 1;
        await updateUserState(phone, { current_lesson: nextLesson, conversation_stage: "lesson_mode" });
        await sendLesson(phone, nextLesson);
        return;
      }
      if (isRestartLesson(lower) || lower === "restart") {
        await updateUserState(phone, { current_lesson: 0 });
        await sendViaHeltar(phone, language === "Hindi" ? "🌸 Course progress reset. 'teach me gita' likh kar dubara shuru karein." : "🌸 Course progress reset. Reply 'teach me gita' to start again.", "lesson");
        return;
      }
      if (isExitLessons(lower)) {
        await updateUserState(phone, { conversation_stage: "new_topic" });
        await sendViaHeltar(phone, language === "Hindi" ? "Lessons se baahar aa gaye. Ab kaise madad karun?" : "Exited lessons. How can I help you now?", "lesson_exit");
        return;
      }

      // Greeting inside lessons: short prompt
      if (isGreeting(lower) || isSmallTalk(lower)) {
        await sendViaHeltar(phone, language === "Hindi" ? `Reply "Next" jab aap agla lesson chahen.` : `Reply "Next" when you'd like the next lesson.`, "lesson_prompt");
        return;
      }

      // Free query inside lesson_mode => route to RAG but keep them in lesson_mode
      console.log("📖 Lesson mode but free query → route to RAG");
      let chatHistory = parseChatHistory(user.chat_history);
      chatHistory.push({ role: "user", content: text });
      if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);

      const ragResult = await getRAGResponse(phone, text, language, chatHistory);
      chatHistory.push({ role: "assistant", content: ragResult.assistantResponse });

      await updateUserState(phone, {
        chat_history: JSON.stringify(chatHistory),
        last_topic_summary: ragResult.topic || text,
        conversation_stage: "lesson_mode",
        language_preference: language
      });
      return;
    }

    // Normal flow — prepare chat history
    let chatHistory = parseChatHistory(user.chat_history || []);
    chatHistory.push({ role: "user", content: text });
    if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);

    // Chatting stage: call OpenAI short replies and detect [NEW_TOPIC]
    if (user.conversation_stage === "chatting") {
      console.log("🤝 Stage = chatting");
      const chatPrompt = CHAT_SYSTEM_PROMPT.replace("{{LANGUAGE}}", language);
      let aiChatResponse = await openaiChat([{ role: "system", content: chatPrompt }, ...chatHistory], 300);

      if (!aiChatResponse) {
        console.warn("openaiChat returned null — falling back to RAG");
      } else {
        // post-process: brevity and ensure it ends with a question
        aiChatResponse = ensureResponseBrevity(aiChatResponse, language);
        aiChatResponse = ensureEndsWithQuestion(aiChatResponse, language);

        // If model signalled new topic token, branch
        if (aiChatResponse.includes("[NEW_TOPIC]")) {
          const cleanResp = aiChatResponse.replace("[NEW_TOPIC]", "").trim();
          if (cleanResp) await sendViaHeltar(phone, cleanResp, "chat");
          await updateUserState(phone, { conversation_stage: "new_topic", chat_history: JSON.stringify(chatHistory), language_preference: language });
          return;
        } else {
          await sendViaHeltar(phone, aiChatResponse, "chat");
          chatHistory.push({ role: "assistant", content: aiChatResponse });
          await updateUserState(phone, { chat_history: JSON.stringify(chatHistory), language_preference: language });
          return;
        }
      }
    }

    // New-topic (or fallback) stage: use RAG to fetch verse & commentary, then switch to 'chatting'
    console.log("📖 Stage = new_topic → RAG");
    const ragResult = await getRAGResponse(phone, text, language, chatHistory);
    chatHistory.push({ role: "assistant", content: ragResult.assistantResponse });
    await updateUserState(phone, {
      last_topic_summary: ragResult.topic || text,
      conversation_stage: "chatting",
      chat_history: JSON.stringify(chatHistory),
      language_preference: language
    });
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
