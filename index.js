// index.js — SarathiAI (Heltar Integration & Full Logic)
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

/* Heltar Config */
const HELTAR_API_KEY = process.env.HELTAR_API_KEY;
const HELTAR_PHONE_ID = process.env.HELTAR_PHONE_ID;
const HELTAR_WEBHOOK_URL = process.env.HELTAR_WEBHOOK_URL;

/* ---------------- Database Setup ---------------- */
const dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

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
        messages_since_verse INT DEFAULT 0
      );
    `);
    client.release();
    console.log("✅ Database table 'users' is ready.");
  } catch (err) {
    console.error("❌ Error setting up database:", err);
  }
}

/* ---------------- Database User State Helpers ---------------- */
async function getUserState(phone) {
  try {
    let result = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
    if (result.rows.length === 0) {
      await dbPool.query("INSERT INTO users (phone_number) VALUES ($1)", [phone]);
      result = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
    }
    const user = result.rows[0];
    user.chat_history = user.chat_history || [];
    return user;
  } catch (e) {
    console.error("getUserState failed:", e.message);
    return { phone_number: phone, chat_history: [], conversation_stage: "new_topic" };
  }
}

async function updateUserState(phone, updates) {
  try {
    const setClauses = [];
    const values = [];
    let valueCount = 1;
    for (const key in updates) {
      setClauses.push(`${key} = $${valueCount++}`);
      const value = typeof updates[key] === "object" ? JSON.stringify(updates[key]) : updates[key];
      values.push(value);
    }
    if (setClauses.length === 0) return;
    const query = `UPDATE users SET ${setClauses.join(", ")} WHERE phone_number = $${valueCount}`;
    values.push(phone);
    await dbPool.query(query, values);
  } catch (e) {
    console.error("updateUserState failed:", e.message);
  }
}

/* ---------------- Heltar send ---------------- */
async function sendViaHeltar(phone, message) {
  try {
    if (!HELTAR_API_KEY) {
      console.warn(`(Simulated -> ${phone}): ${message}`);
      return;
    }

    const resp = await axios.post(
      `https://api.heltar.com/v1/messages/send`,
      {
        messages: [
          {
            clientWaNumber: phone,
            message: message,
            messageType: "text",
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${HELTAR_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Heltar message sent to ${phone}`);
    return resp.data;
  } catch (err) {
    console.error("❌ Heltar send error:", err.response?.data || err.message);
    fs.appendFileSync(
      "heltar-error.log",
      `${new Date().toISOString()} | ${phone} | Send Failed | ${JSON.stringify(err.response?.data || err.message)}\n`
    );
  }
}

/* ---------------- OpenAI Helpers ---------------- */
async function openaiChat(messages, maxTokens = 400) {
  if (!OPENAI_KEY) return null;
  const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.7 };
  const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    timeout: 25000,
  });
  return resp.data?.choices?.[0]?.message?.content;
}

async function detectLanguage(text) {
  const prompt = `Is the following text primarily in English or Hinglish? Respond with only one word: "English" or "Hinglish".\n\nText: "${text}"`;
  try {
    const response = await openaiChat([{ role: "user", content: prompt }], 5);
    return response?.toLowerCase().includes("hinglish") ? "Hinglish" : "English";
  } catch {
    console.warn("⚠️ Language detection failed, defaulting to English.");
    return "English";
  }
}

/* ---------------- Pinecone ---------------- */
async function getEmbedding(text) {
  const resp = await axios.post(
    "https://api.openai.com/v1/embeddings",
    { model: EMBED_MODEL, input: text },
    { headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 30000 }
  );
  return resp.data.data[0].embedding;
}

async function pineconeQuery(vector, topK = 5, namespace, filter) {
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/query`;
  const body = { vector, topK, includeMetadata: true };
  if (namespace) body.namespace = namespace;
  if (filter) body.filter = filter;
  const resp = await axios.post(url, body, {
    headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" },
    timeout: 20000,
  });
  return resp.data;
}

function getNamespacesArray() {
  return PINECONE_NAMESPACES
    ? PINECONE_NAMESPACES.split(",").map((s) => s.trim()).filter(Boolean)
    : [PINECONE_NAMESPACE || "verse"];
}

async function multiNamespaceQuery(vector, topK = 8, filter) {
  const ns = getNamespacesArray();
  const arr = await Promise.all(
    ns.map(async (n) => {
      try {
        const r = await pineconeQuery(vector, topK, n, filter);
        return (r?.matches || []).map((m) => ({ ...m, _namespace: n }));
      } catch (e) {
        console.warn("⚠ Pinecone query failed:", e?.message || e);
        return [];
      }
    })
  );
  const allMatches = arr.flat();
  allMatches.sort((a, b) => (b.score || 0) - (a.score || 0));
  return allMatches;
}

/* ---------------- Small Talk Helpers ---------------- */
function normalizeTextForSmallTalk(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bu\b/g, "you")
    .replace(/\br\b/g, "are");
}
function isGreeting(text) {
  const t = normalizeTextForSmallTalk(text);
  return ["hi", "hii", "hello", "hey", "namaste", "hare krishna", "harekrishna"].includes(t);
}
const CONCERN_KEYWORDS = ["stress", "anxiety", "depressed", "anger", "sleep", "panic", "sad", "lonely"];
function isSmallTalk(text) {
  const t = normalizeTextForSmallTalk(text);
  return !CONCERN_KEYWORDS.some((k) => t.includes(k)) &&
    ["how are you", "thanks", "ok", "bye", "good", "nice", "cool"].includes(t);
}

/* ---------------- System Prompts ---------------- */
const RAG_SYSTEM_PROMPT = `You are SarathiAI. A user is starting a new conversation... (same as before)`;
const CHAT_SYSTEM_PROMPT = `You are SarathiAI... (same as before)`;

/* ---------------- Main RAG ---------------- */
async function getRAGResponse(phone, text, language, chatHistory) {
  const qVec = await getEmbedding(text);
  const matches = await multiNamespaceQuery(qVec);
  const verseMatch = matches.find((m) => m.metadata?.sanskrit);
  if (!verseMatch || verseMatch.score < 0.25) {
    const fallback = "I hear your concern. Could you share more?";
    await sendViaHeltar(phone, fallback);
    return { assistantResponse: fallback, stage: "chatting", topic: text };
  }
  const verseSanskrit = verseMatch.metadata?.sanskrit || "";
  const verseHinglish = verseMatch.metadata?.hinglish1 || "";
  const ragPromptWithLang = RAG_SYSTEM_PROMPT.replace("{{LANGUAGE}}", language);
  const modelUser = `User's problem: "${text}"\n\nContext from Gita:\nSanskrit: ${verseSanskrit}\nHinglish: ${verseHinglish}`;
  const aiResponse = await openaiChat([{ role: "system", content: ragPromptWithLang }, { role: "user", content: modelUser }]);
  if (aiResponse) {
    for (const part of aiResponse.split("||")) {
      if (part.trim()) await sendViaHeltar(phone, part.trim());
    }
    return { assistantResponse: aiResponse, stage: "chatting", topic: text };
  }
  return { assistantResponse: "I am here to listen.", stage: "chatting", topic: text };
}

/* ---------------- Webhook ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    res.sendStatus(200);
    const body = req.body;
    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) {
      console.log("⚠️ Ignoring webhook payload (not a user message).");
      return;
    }
    const phone = msg.from;
    const text = msg.text?.body;
    if (!phone || !text) return;

    const userState = await getUserState(phone);
    await updateUserState(phone, { last_activity_ts: "NOW()" });

    let chatHistory = userState.chat_history || [];
    chatHistory.push({ role: "user", content: text });
    if (chatHistory.length > 8) chatHistory = chatHistory.slice(-8);

    const incoming = String(text).trim();
    if (isGreeting(incoming)) {
      await sendViaHeltar(phone, "Hare Krishna 🙏\nI am Sarathi. How can I help?");
      await updateUserState(phone, { conversation_stage: "new_topic", chat_history: [] });
      return;
    }
    const language = await detectLanguage(text);
    let currentStage = userState.conversation_stage;

    if (isSmallTalk(incoming)) {
      const reply = "Hare Krishna 🙏 I am here to listen. How can I help you today?";
      await sendViaHeltar(phone, reply);
      chatHistory.push({ role: "assistant", content: reply });
      await updateUserState(phone, { chat_history: chatHistory });
      return;
    }

    if (currentStage === "chatting") {
      const chatPrompt = CHAT_SYSTEM_PROMPT.replace("{{LANGUAGE}}", language);
      const aiChatResponse = await openaiChat([{ role: "system", content: chatPrompt }, ...chatHistory]);
      if (aiChatResponse?.includes("[NEW_TOPIC]")) {
        const clean = aiChatResponse.replace("[NEW_TOPIC]", "").trim();
        if (clean) await sendViaHeltar(phone, clean);
        currentStage = "new_topic";
      } else if (aiChatResponse) {
        await sendViaHeltar(phone, aiChatResponse);
        chatHistory.push({ role: "assistant", content: aiChatResponse });
        await updateUserState(phone, { chat_history: chatHistory });
        return;
      }
    }

    if (currentStage === "new_topic") {
      const ragResult = await getRAGResponse(phone, text, language, chatHistory);
      chatHistory.push({ role: "assistant", content: ragResult.assistantResponse });
      await updateUserState(phone, { last_topic_summary: ragResult.topic, conversation_stage: "chatting", chat_history: chatHistory });
    }
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | Webhook Error | ${err.message}\n`);
  }
});

/* ---------------- Start Server ---------------- */
app.listen(PORT, () => {
  console.log(`🚀 ${BOT_NAME} is live on port ${PORT}`);
  setupDatabase();
});
