// index.js — SarathiAI (Heltar Integration + State Machine + Analytics)
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
        last_response_type VARCHAR(20)
      );
    `);
    client.release();
    console.log("✅ Database table 'users' is ready with analytics columns.");
  } catch (err) {
    console.error("❌ Error setting up database table:", err);
  }
}

async function getUserState(phone) {
  try {
    let result = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
    if (result.rows.length === 0) {
      await dbPool.query("INSERT INTO users (phone_number, first_seen_date, last_seen_date, total_sessions) VALUES ($1, CURRENT_DATE, CURRENT_DATE, 1)", [phone]);
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
      const value =
        typeof updates[key] === "object" ? JSON.stringify(updates[key]) : updates[key];
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

/* ---------------- Analytics Helpers ---------------- */
async function trackIncoming(phone, text) {
  try {
    const user = await getUserState(phone);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    let addSession = false;
    if (user.last_activity_ts) {
      const last = new Date(user.last_activity_ts);
      const diffHours = (now - last) / (1000 * 60 * 60);
      if (diffHours > 12) addSession = true;
    } else {
      addSession = true;
    }

    const updates = {
      last_activity_ts: "NOW()",
      last_seen_date: today,
      last_message: text,
      last_message_role: "user",
      total_incoming: (user.total_incoming || 0) + 1,
    };

    if (!user.first_seen_date) {
      updates.first_seen_date = today;
    }
    if (addSession) {
      updates.total_sessions = (user.total_sessions || 0) + 1;
    }

    await updateUserState(phone, updates);
    console.log(`📊 Incoming tracked: ${phone}`);
  } catch (e) {
    console.error("❌ trackIncoming failed:", e.message);
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
  } catch (e) {
    console.error("❌ trackOutgoing failed:", e.message);
  }
}

/* ---------------- Heltar Send ---------------- */
async function sendViaHeltar(phone, message, type = "chat") {
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

    console.log(`✅ Heltar message sent to ${phone}: ${message}`);
    await trackOutgoing(phone, message, type);
    return resp.data;
  } catch (err) {
    console.error("❌ Heltar send error:", err.response?.data || err.message);
    fs.appendFileSync(
      "heltar-error.log",
      `${new Date().toISOString()} | ${phone} | Send Failed | ${JSON.stringify(
        err.response?.data || err.message
      )}\n`
    );
  }
}

/* ---------------- OpenAI + Pinecone Helpers ---------------- */
async function openaiChat(messages, maxTokens = 400) {
  if (!OPENAI_KEY) return null;
  const body = {
    model: OPENAI_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7,
  };
  const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    timeout: 25000,
  });
  return resp.data?.choices?.[0]?.message?.content;
}

async function getEmbedding(text) {
  const resp = await axios.post(
    "https://api.openai.com/v1/embeddings",
    { model: EMBED_MODEL, input: text },
    {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      timeout: 30000,
    }
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
  if (PINECONE_NAMESPACES) {
    return PINECONE_NAMESPACES.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [PINECONE_NAMESPACE || "verse"];
}

async function multiNamespaceQuery(vector, topK = 8, filter) {
  const ns = getNamespacesArray();
  const promises = ns.map(async (n) => {
    try {
      const r = await pineconeQuery(vector, topK, n, filter);
      return (r?.matches || []).map((m) => ({ ...m, _namespace: n }));
    } catch (e) {
      console.warn("⚠ Pinecone query failed for namespace", n, e?.message || e);
      return [];
    }
  });
  const arr = await Promise.all(promises);
  const allMatches = arr.flat();
  allMatches.sort((a, b) => (b.score || 0) - (a.score || 0));
  return allMatches;
}

/* ---------------- Text Classification ---------------- */
function normalizeTextForSmallTalk(s) {
  if (!s) return "";
  let t = String(s).trim().toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/\bu\b/g, "you");
  t = t.replace(/\br\b/g, "are");
  return t;
}

function isGreeting(text) {
  if (!text) return false;
  const t = normalizeTextForSmallTalk(text);
  const greetings = new Set(["hi", "hii", "hello", "hey", "namaste", "hare krishna", "harekrishna"]);
  return greetings.has(t);
}

const CONCERN_KEYWORDS = [
  "stress",
  "anxiety",
  "depressed",
  "depression",
  "angry",
  "anger",
  "sleep",
  "insomnia",
  "panic",
  "suicidal",
  "sad",
  "lonely",
  "frustrated",
  "hurt",
  "confused",
];

function isSmallTalk(text) {
  if (!text) return false;
  const t = normalizeTextForSmallTalk(text);
  for (const keyword of CONCERN_KEYWORDS) {
    if (t.includes(keyword)) return false;
  }
  const smalls = new Set([
    "how are you",
    "how are you doing",
    "how do you do",
    "how r you",
    "how ru",
    "how are u",
    "thanks",
    "thank you",
    "thx",
    "ok",
    "okay",
    "good",
    "nice",
    "cool",
    "bye",
    "see you",
    "k",
  ]);
  return smalls.has(t);
}

/* ---------------- System Prompts ---------------- */
const RAG_SYSTEM_PROMPT = `You are SarathiAI. A user is starting a new conversation. You have a relevant Gita verse as context.
- Use "||" to separate each message bubble.
- Part 1: The Sanskrit verse.
- Part 2: Hinglish translation.
- Part 3: "Shri Krishna kehte hain:" + 2-3 sentence essence/explanation.
- Part 4: A simple follow-up question.
- Strictly and exclusively reply in {{LANGUAGE}}.`;

const CHAT_SYSTEM_PROMPT = `You are SarathiAI, a compassionate Gita guide. Continue the conversation empathetically.
- Use user's chat history for context.
- DO NOT quote new verses here.
- Keep replies very short (1-3 sentences).
- If strong emotional need is expressed, end with [NEW_TOPIC].
- Strictly and exclusively reply in {{LANGUAGE}}.`;

/* ---------------- Main RAG ---------------- */
function safeText(md, key) {
  return (md && md[key] && String(md[key]).trim()) || "";
}

async function getRAGResponse(phone, text, language, chatHistory) {
  const qVec = await getEmbedding(text);
  const matches = await multiNamespaceQuery(qVec);
  const verseMatch = matches.find((m) => m.metadata?.sanskrit);

  if (!verseMatch || verseMatch.score < 0.25) {
    const fallback = "I hear your concern. Could you share more so I can guide you better?";
    await sendViaHeltar(phone, fallback, "fallback");
    return { assistantResponse: fallback, stage: "chatting", topic: text };
  }

  const verseSanskrit = safeText(verseMatch.metadata, "sanskrit");
  const verseHinglish = safeText(verseMatch.metadata, "hinglish1");
  const verseContext = `Sanskrit: ${verseSanskrit}\nHinglish: ${verseHinglish}`;
  const ragPrompt = RAG_SYSTEM_PROMPT.replace("{{LANGUAGE}}", language);

  const aiResponse = await openaiChat([
    { role: "system", content: ragPrompt },
    { role: "user", content: `User's concern: "${text}"\n\nContext:\n${verseContext}` },
  ]);

  if (aiResponse) {
    const messageParts = aiResponse.split("||").map((p) => p.trim());
    for (const part of messageParts) {
      if (part) {
        await sendViaHeltar(phone, part, "verse");
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    return { assistantResponse: aiResponse.replace(/\|\|/g, "\n"), stage: "chatting", topic: text };
  }

  return { assistantResponse: "I am here to listen.", stage: "chatting", topic: text };
}

/* ---------------- Webhook ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    res.status(200).send("OK");
    const body = req.body;
    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!msg) {
      console.log("⚠️ Ignoring non-message webhook event.");
      return;
    }

    const phone = msg?.from;
    const text = msg?.text?.body;

    if (!phone || !text) {
      console.warn("⚠️ Webhook missing phone/text.");
      return;
    }

    console.log(`📩 Incoming from ${phone}: "${text}"`);
    await trackIncoming(phone, text);

    const userState = await getUserState(phone);
    await updateUserState(phone, { last_activity_ts: "NOW()" });

    let chatHistory = userState.chat_history || [];
    chatHistory.push({ role: "user", content: text });
    if (chatHistory.length > 8) chatHistory = chatHistory.slice(-8);

    const incoming = text.trim();

    // 1. Greeting / small talk
    if (isGreeting(incoming) || isSmallTalk(incoming)) {
      console.log("💬 Detected greeting/small talk");
      await sendViaHeltar(
        phone,
        `Hare Krishna 🙏\n\nI am Sarathi, your companion on this journey.\nHow can I help you today?`,
        "welcome"
      );
      await updateUserState(phone, { conversation_stage: "new_topic", chat_history: "[]" });
      return;
    }

    // 2. Stage-based flow
    let currentStage = userState.conversation_stage;

    if (currentStage === "chatting") {
      console.log("🤝 Stage = chatting");
      const chatPrompt = CHAT_SYSTEM_PROMPT.replace("{{LANGUAGE}}", "Hinglish");
      const aiChatResponse = await openaiChat([{ role: "system", content: chatPrompt }, ...chatHistory]);

      if (aiChatResponse && aiChatResponse.includes("[NEW_TOPIC]")) {
        const clean = aiChatResponse.replace("[NEW_TOPIC]", "").trim();
        if (clean) await sendViaHeltar(phone, clean, "chat");
        currentStage = "new_topic";
      } else if (aiChatResponse) {
        await sendViaHeltar(phone, aiChatResponse, "chat");
        chatHistory.push({ role: "assistant", content: aiChatResponse });
        await updateUserState(phone, { chat_history: chatHistory });
        return;
      }
    }

    if (currentStage === "new_topic") {
      console.log("📖 Stage = new_topic → Fetching verse");
      const ragResult = await getRAGResponse(phone, text, "Hinglish", chatHistory);
      chatHistory.push({ role: "assistant", content: ragResult.assistantResponse });
      await updateUserState(phone, {
        last_topic_summary: ragResult.topic,
        conversation_stage: "chatting",
        chat_history: chatHistory,
      });
    }
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | Webhook Error | ${err.message}\n`);
  }
});

/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
  console.log(`\n🚀 ${BOT_NAME} is live on port ${PORT}`);
  setupDatabase();
});
