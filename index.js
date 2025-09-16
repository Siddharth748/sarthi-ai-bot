// index.js — SarathiAI (Production Ready with RAG, Lessons, Language Awareness, and HowAreYou intent)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import pg from "pg";

const { Pool } = pg;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Config ---------------- */
const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;

const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();

const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim();
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const PINECONE_NAMESPACE = (process.env.PINECONE_NAMESPACE || "verse").trim();

const HELTAR_API_KEY = (process.env.HELTAR_API_KEY || "").trim();

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
    console.log("✅ Database tables ready.");
  } catch (err) {
    console.error("❌ DB Setup Error:", err);
  }
}

/* ---------------- User helpers ---------------- */
async function getUserState(phone) {
  try {
    const res = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
    if (res.rows.length === 0) {
      await dbPool.query(
        "INSERT INTO users (phone_number, last_activity_ts, language_preference) VALUES ($1, CURRENT_TIMESTAMP, 'English')",
        [phone]
      );
      return (await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone])).rows[0];
    }
    return res.rows[0];
  } catch (err) {
    console.error("getUserState failed:", err.message);
    return { phone_number: phone, chat_history: [], conversation_stage: "new_topic", current_lesson: 0, language_preference: "English" };
  }
}

async function updateUserState(phone, updates) {
  try {
    if (updates.last_activity_ts === "NOW()") updates.last_activity_ts = new Date().toISOString();
    const setClauses = [];
    const values = [];
    let i = 1;
    for (const key in updates) {
      setClauses.push(`${key} = $${i}`);
      const val = typeof updates[key] === "object" ? JSON.stringify(updates[key]) : updates[key];
      values.push(val);
      i++;
    }
    if (!setClauses.length) return;
    values.push(phone);
    await dbPool.query(`UPDATE users SET ${setClauses.join(", ")} WHERE phone_number = $${i}`, values);
  } catch (err) {
    console.error("updateUserState failed:", err.message);
  }
}

/* ---------------- Analytics ---------------- */
async function trackIncoming(phone, text) {
  try {
    const user = await getUserState(phone);
    await updateUserState(phone, { last_activity_ts: "NOW()" });
  } catch (err) {
    console.error("trackIncoming failed:", err.message);
  }
}

async function trackOutgoing(phone, reply, type = "chat") {
  try {
    await updateUserState(phone, { last_message_role: "assistant", last_message: reply, last_response_type: type, last_activity_ts: "NOW()" });
  } catch (err) {
    console.error("trackOutgoing failed:", err.message);
  }
}

/* ---------------- Heltar send ---------------- */
async function sendViaHeltar(phone, message, type = "chat") {
  try {
    if (!HELTAR_API_KEY) {
      console.warn(`(Simulated -> ${phone}): ${message}`);
      await trackOutgoing(phone, message, type);
      return { simulated: true, message };
    }
    const resp = await axios.post(
      "https://api.heltar.com/v1/messages/send",
      { messages: [{ clientWaNumber: phone, message, messageType: "text" }] },
      { headers: { Authorization: `Bearer ${HELTAR_API_KEY}` } }
    );
    await trackOutgoing(phone, message, type);
    return resp.data;
  } catch (err) {
    console.error("Heltar send error:", err?.response?.data || err?.message);
  }
}

/* ---------------- Lessons ---------------- */
async function sendLesson(phone, lessonNumber, lang) {
  try {
    const res = await dbPool.query("SELECT * FROM lessons WHERE lesson_number = $1", [lessonNumber]);
    if (!res.rows.length) {
      await sendViaHeltar(phone, lang === "Hindi" ? "🌸 Aapne saare lessons complete kar liye!" : "🌸 You've completed all lessons!", "lesson");
      return;
    }
    const l = res.rows[0];
    await sendViaHeltar(phone, l.verse, "lesson");
    await sendViaHeltar(phone, l.translation, "lesson");
    await sendViaHeltar(phone, lang === "Hindi" ? `Shri Krishna kehte hain: ${l.commentary}` : `Shri Krishna says: ${l.commentary}`, "lesson");
    await sendViaHeltar(phone, `🤔 ${l.reflection_question}`, "lesson");
    await sendViaHeltar(phone, lang === "Hindi" ? `Reply "Hare Krishna" ya "Next" to continue.` : `Reply "Hare Krishna" or "Next" to continue.`, "lesson_prompt");
  } catch (err) {
    console.error("sendLesson failed:", err.message);
  }
}

/* ---------------- Text Classification / Intent ---------------- */
function normalizeText(s) { return String(s).trim().toLowerCase(); }
function isGreeting(t) { return /(hi|hello|hey|hii|namaste|hare\s*krishna)/i.test(t); }
function isHowAreYou(t) { return /(how\s*are\s*(you|u)|how\s*r\s*u|kaise ho)/i.test(t); }
function isSmallTalk(t) { return /(thanks|thank you|ok|okay|good|nice|cool|bye|fine|good morning|good night)/i.test(t); }
function isLessonRequest(t) { return /(teach|lesson|gita)/i.test(t); }
function isEnglishRequest(t) { return /english/i.test(t); }
function isHindiRequest(t) { return /(hindi|हिन्दी)/i.test(t); }

/* ---------------- OpenAI + Pinecone ---------------- */
async function openaiChat(messages, maxTokens = 400) {
  if (!OPENAI_KEY) return null;
  try {
    const resp = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.7
    }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` } });
    return resp.data?.choices?.[0]?.message?.content;
  } catch (err) {
    console.error("openaiChat error:", err?.message);
    return null;
  }
}

async function getEmbedding(text) {
  const resp = await axios.post("https://api.openai.com/v1/embeddings", {
    model: EMBED_MODEL, input: text
  }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` } });
  return resp.data.data[0].embedding;
}

async function pineconeQuery(vector, topK = 3, namespace) {
  const resp = await axios.post(
    `${PINECONE_HOST.replace(/\/$/, "")}/query`,
    { vector, topK, includeMetadata: true, namespace },
    { headers: { "Api-Key": PINECONE_API_KEY } }
  );
  return resp.data;
}

/* ---------------- RAG Response ---------------- */
async function getRAGResponse(phone, text, user) {
  try {
    const vec = await getEmbedding(text);
    const results = await pineconeQuery(vec, 5, PINECONE_NAMESPACE);

    const validMatches = results.matches.filter(m => m.metadata?.sanskrit || m.metadata?.verse);
    const historyMessages = (user.chat_history || []).slice(-10).map(m => ({ role: m.role, content: m.content }));

    if (!validMatches.length) {
      const prompt = [
        { role: "system", content: `You are SarathiAI, a friendly and wise companion. Answer in ${user.language_preference}.` },
        ...historyMessages,
        { role: "user", content: text }
      ];
      const resp = await openaiChat(prompt, 400);
      if (resp) await sendViaHeltar(phone, resp, "chat");
      return { assistantResponse: resp || "I am here to listen.", topic: text };
    }

    const context = validMatches.slice(0, 3).map(m => {
      const verse = m.metadata?.sanskrit || m.metadata?.verse || "";
      const translation = m.metadata?.hinglish1 || m.metadata?.translation || "";
      return `Sanskrit: ${verse}\nHinglish: ${translation}`;
    }).join("\n\n");

    const prompt = [
      { role: "system", content: `You are SarathiAI, a friendly and wise companion. Answer in ${user.language_preference}.` },
      ...historyMessages,
      { role: "user", content: text },
      { role: "system", content: `Context from verses:\n${context}` }
    ];

    const resp = await openaiChat(prompt, 400);
    if (resp) await sendViaHeltar(phone, resp, "verse");
    return { assistantResponse: resp || "I am here to listen.", topic: text };
  } catch (err) {
    console.error("getRAGResponse failed:", err.message);
    return { assistantResponse: "I am here to listen.", topic: text };
  }
}

/* ---------------- Webhook ---------------- */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return console.log("⚠️ Ignoring non-message event");

  const phone = msg?.from;
  const text = msg?.text?.body || "";
  console.log(`📩 Incoming from ${phone}: "${text}"`);
  await trackIncoming(phone, text);

  const user = await getUserState(phone);
  const lower = normalizeText(text);

  // ----- Language switch -----
  if (isEnglishRequest(text)) {
    await updateUserState(phone, { language_preference: "English" });
    await sendViaHeltar(phone, "Language switched to English.", "language");
    return;
  }
  if (isHindiRequest(text)) {
    await updateUserState(phone, { language_preference: "Hindi" });
    await sendViaHeltar(phone, "भाषा बदल दी गई है, अब उत्तर हिन्दी में मिलेंगे।", "language");
    return;
  }

  // ----- Greetings -----
  if (isGreeting(lower)) {
    await sendViaHeltar(phone,
      user.language_preference === "Hindi"
        ? "Hare Krishna 🙏\nMain Sarathi hoon, aapka saathi.\nKaise madad kar sakta hoon?"
        : "Hare Krishna 🙏\nI am Sarathi, your companion.\nHow can I help you today?",
      "welcome"
    );
    await updateUserState(phone, { conversation_stage: "new_topic" });
    return;
  }

  // ----- How are you -----
  if (isHowAreYou(lower)) {
    await sendViaHeltar(phone,
      user.language_preference === "Hindi"
        ? "Main bilkul theek hoon! 🙏 Aap kaise hain?"
        : "I'm doing well, thank you! 🙏 How are you?",
      "small_talk"
    );
    return;
  }

  // ----- Small talk -----
  if (isSmallTalk(lower)) {
    await sendViaHeltar(phone,
      user.language_preference === "Hindi"
        ? "Shukriya! Aap aur kya jaanna chahte hain?"
        : "Thanks! What else would you like to know?",
      "small_talk"
    );
    return;
  }

  // ----- Lesson request -----
  if (isLessonRequest(lower)) {
    const nextLesson = (user.current_lesson || 0) + 1;
    await updateUserState(phone, { current_lesson: nextLesson, conversation_stage: "lesson_mode" });
    await sendLesson(phone, nextLesson, user.language_preference);
    return;
  }

  // ----- Lesson continuation -----
  if (user.conversation_stage === "lesson_mode") {
    if (lower === "next" || lower.includes("hare krishna")) {
      const nextLesson = (user.current_lesson || 0) + 1;
      await updateUserState(phone, { current_lesson: nextLesson });
      await sendLesson(phone, nextLesson, user.language_preference);
      return;
    }
  }

  // ----- RAG / fallback -----
  const ragResult = await getRAGResponse(phone, text, user);
  const updatedHistory = [...(user.chat_history || []), { role: "user", content: text }, { role: "assistant", content: ragResult.assistantResponse }];
  await updateUserState(phone, {
    conversation_stage: "chatting",
    chat_history: updatedHistory.slice(-15),
    last_topic_summary: ragResult.topic
  });
});

/* ---------------- Start ---------------- */
app.listen(PORT, () => {
  console.log(`🚀 ${BOT_NAME} running on port ${PORT}`);
  setupDatabase();
});
