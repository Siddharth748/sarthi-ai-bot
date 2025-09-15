// index.js — SarathiAI (Heltar Integration + Lessons + Full RAG + Analytics)
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
        cooldown_message_sent BOOLEAN DEFAULT FALSE,
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
        current_lesson INT DEFAULT 0
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
    console.error("❌ DB Setup Error:", err);
  }
}

/* ---------------- User helpers ---------------- */
async function getUserState(phone) {
  try {
    const res = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
    if (res.rows.length === 0) {
      await dbPool.query(
        "INSERT INTO users (phone_number, first_seen_date, last_seen_date, total_sessions) VALUES ($1, CURRENT_DATE, CURRENT_DATE, 1)",
        [phone]
      );
      return (await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone])).rows[0];
    }
    return res.rows[0];
  } catch (err) {
    console.error("getUserState failed:", err.message);
    return { phone_number: phone, chat_history: [], conversation_stage: "new_topic", current_lesson: 0 };
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
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    let addSession = false;
    if (user.last_activity_ts) {
      const diff = (now - new Date(user.last_activity_ts)) / (1000 * 60 * 60);
      if (diff > 12) addSession = true;
    } else addSession = true;

    const updates = {
      last_activity_ts: "NOW()",
      last_seen_date: today,
      last_message: text,
      last_message_role: "user",
      total_incoming: (user.total_incoming || 0) + 1,
    };
    if (!user.first_seen_date) updates.first_seen_date = today;
    if (addSession) updates.total_sessions = (user.total_sessions || 0) + 1;

    await updateUserState(phone, updates);
    console.log(`📊 Incoming tracked: ${phone}`);
  } catch (err) {
    console.error("trackIncoming failed:", err.message);
  }
}

async function trackOutgoing(phone, reply, type = "chat") {
  try {
    const user = await getUserState(phone);
    const updates = {
      last_activity_ts: "NOW()",
      last_message: reply,
      last_message_role: "assistant",
      last_response_type: type,
      total_outgoing: (user.total_outgoing || 0) + 1,
    };
    await updateUserState(phone, updates);
    console.log(`📊 Outgoing tracked: ${phone} (${type})`);
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
    console.log(`✅ Heltar message sent to ${phone}: ${message}`);
    await trackOutgoing(phone, message, type);
    return resp.data;
  } catch (err) {
    console.error("Heltar send error:", err?.response?.data || err?.message);
  }
}

/* ---------------- Lessons ---------------- */
async function sendLesson(phone, lessonNumber) {
  try {
    const res = await dbPool.query("SELECT * FROM lessons WHERE lesson_number = $1", [lessonNumber]);
    if (!res.rows.length) {
      await sendViaHeltar(phone, "🌸 You've completed all lessons!", "lesson");
      return;
    }
    const l = res.rows[0];
    await sendViaHeltar(phone, l.verse, "lesson");
    await sendViaHeltar(phone, l.translation, "lesson");
    await sendViaHeltar(phone, `Shri Krishna kehte hain: ${l.commentary}`, "lesson");
    await sendViaHeltar(phone, `🤔 ${l.reflection_question}`, "lesson");
    await sendViaHeltar(phone, `Reply "Hare Krishna" or "Next" to continue.`, "lesson_prompt");
  } catch (err) {
    console.error("sendLesson failed:", err.message);
  }
}

/* ---------------- Text classification ---------------- */
function normalizeText(s) {
  return String(s).trim().toLowerCase();
}
function isGreeting(t) {
  return ["hi","hii","hello","hey","namaste","hare krishna","harekrishna"].includes(normalizeText(t));
}
function isSmallTalk(t) {
  return ["thanks","thank you","ok","okay","good","nice","cool","bye"].includes(normalizeText(t));
}

/* ---------------- OpenAI & Pinecone ---------------- */
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

async function pineconeQuery(vector, topK = 5, namespace) {
  const resp = await axios.post(
    `${PINECONE_HOST.replace(/\/$/, "")}/query`,
    { vector, topK, includeMetadata: true, namespace },
    { headers: { "Api-Key": PINECONE_API_KEY } }
  );
  return resp.data;
}

/* ---------------- RAG flow ---------------- */
async function getRAGResponse(phone, text) {
  try {
    const vec = await getEmbedding(text);
    const results = await pineconeQuery(vec, 5, PINECONE_NAMESPACE);
    const best = results?.matches?.[0];
    if (!best) {
      await sendViaHeltar(phone, "I hear you. Please share more 🙏", "fallback");
      return { assistantResponse: "I hear you.", topic: text };
    }
    const verse = best.metadata?.sanskrit || best.metadata?.verse || "";
    const translation = best.metadata?.hinglish1 || best.metadata?.translation || "";
    const context = `Sanskrit: ${verse}\nHinglish: ${translation}`;
    const prompt = `User: ${text}\n\nContext:\n${context}`;
    const resp = await openaiChat([{ role: "system", content: "You are SarathiAI." }, { role: "user", content: prompt }], 400);
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
  const lower = text.toLowerCase();

  // Lessons
  if (lower.includes("teach") || lower.includes("gita")) {
    const next = (user.current_lesson || 0) + 1;
    await updateUserState(phone, { current_lesson: next, conversation_stage: "lesson_mode" });
    await sendLesson(phone, next);
    return;
  }
  if (user.conversation_stage === "lesson_mode") {
    if (lower === "next" || lower.includes("hare krishna")) {
      const next = (user.current_lesson || 0) + 1;
      await updateUserState(phone, { current_lesson: next });
      await sendLesson(phone, next);
      return;
    }
  }

  // Greetings
  if (isGreeting(lower) || isSmallTalk(lower)) {
    await sendViaHeltar(phone, `Hare Krishna 🙏\nI am Sarathi, your companion.\nHow can I help you today?`, "welcome");
    await updateUserState(phone, { conversation_stage: "new_topic", chat_history: [] });
    return;
  }

  // RAG
  const ragResult = await getRAGResponse(phone, text);
  await updateUserState(phone, {
    conversation_stage: "chatting",
    chat_history: JSON.stringify([{ role: "user", content: text }, { role: "assistant", content: ragResult.assistantResponse }]),
    last_topic_summary: ragResult.topic
  });
});

/* ---------------- Start ---------------- */
app.listen(PORT, () => {
  console.log(`🚀 ${BOT_NAME} running on port ${PORT}`);
  setupDatabase();
});
