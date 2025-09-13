// index.js — SarathiAI (Heltar - resilient webhook + state machine)
// Replace your existing index.js with this file. Keep your .env values as listed below.

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import pg from "pg";

const { Pool } = pg;
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* ----------------- Config / ENV ----------------- */
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

const HELTAR_API_KEY = process.env.HELTAR_API_KEY;
const HELTAR_PHONE_ID = process.env.HELTAR_PHONE_ID;
const HELTAR_VERIFY_TOKEN = process.env.HELTAR_VERIFY_TOKEN || ""; // optional
const TRAIN_SECRET = process.env.TRAIN_SECRET || null;

/* -------------- DB pool & simple logger ------------- */
const dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

function appendLog(file, text) {
  try {
    fs.appendFileSync(path.join(process.cwd(), file), text + "\n");
  } catch (e) {
    console.error("Failed to write log", file, e.message);
  }
}

/* -------------- DB setup: users, logs, conversations, processed ------------- */
async function setupDatabase() {
  try {
    const client = await dbPool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        phone_number VARCHAR(255) PRIMARY KEY,
        subscribed_daily BOOLEAN DEFAULT FALSE,
        last_activity_ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        cooldown_message_sent BOOLEAN DEFAULT FALSE,
        chat_history JSONB DEFAULT '[]'::jsonb,
        conversation_stage VARCHAR(50) DEFAULT 'new_topic',
        last_topic_summary TEXT,
        messages_since_verse INT DEFAULT 0
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_logs (
        id serial PRIMARY KEY,
        phone varchar(64),
        direction varchar(8), -- 'in' or 'out'
        event_type varchar(64),
        payload jsonb,
        created_at timestamptz DEFAULT now()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id serial PRIMARY KEY,
        phone varchar(64),
        user_message text,
        bot_message text,
        openai_payload jsonb,
        created_at timestamptz DEFAULT now()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS processed_messages (
        msg_id varchar(255) PRIMARY KEY,
        phone varchar(64),
        processed_at timestamptz DEFAULT now()
      );
    `);
    client.release();
    console.log("✅ Database tables ready.");
  } catch (err) {
    console.error("❌ DB setup error:", err.message);
    appendLog("heltar-error.log", `DB setup error: ${err.message}`);
  }
}

/* ------------------- Helpers: DB operations ------------------- */
async function logMessageToDb(phone, direction, eventType, payload) {
  try {
    await dbPool.query(
      `INSERT INTO message_logs (phone, direction, event_type, payload) VALUES ($1,$2,$3,$4)`,
      [phone, direction, eventType, payload ? JSON.stringify(payload) : null]
    );
  } catch (e) {
    console.warn("logMessageToDb failed:", e.message);
  }
}

async function markProcessed(msgId, phone) {
  if (!msgId) return;
  try {
    await dbPool.query(`INSERT INTO processed_messages (msg_id, phone) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [msgId, phone]);
  } catch (e) {
    console.warn("markProcessed failed:", e.message);
  }
}

async function isAlreadyProcessed(msgId) {
  if (!msgId) return false;
  try {
    const r = await dbPool.query(`SELECT 1 FROM processed_messages WHERE msg_id = $1`, [msgId]);
    return r.rows.length > 0;
  } catch (e) {
    console.warn("isAlreadyProcessed failed:", e.message);
    return false;
  }
}

async function saveConversation(phone, userMsg, botMsg, openaiPayload) {
  try {
    await dbPool.query(`INSERT INTO conversations (phone, user_message, bot_message, openai_payload) VALUES ($1,$2,$3,$4)`, [phone, userMsg, botMsg, openaiPayload ? JSON.stringify(openaiPayload) : null]);
  } catch (e) {
    console.warn("saveConversation failed:", e.message);
  }
}

/* ------------------- Heltar send with retry/backoff ------------------- */
async function sendViaHeltar(phone, message, opts = {}) {
  const maxAttempts = opts.maxAttempts || 3;
  let attempt = 0;
  const payload = {
    messages: [{
      clientWaNumber: phone,
      message: message,
      messageType: "text"
    }]
  };

  while (attempt < maxAttempts) {
    attempt++;
    try {
      if (!HELTAR_API_KEY) {
        console.warn("(Simulated send) ->", phone, message);
        await logMessageToDb(phone, "out", "simulated_send", { message });
        return { simulated: true };
      }
      const resp = await axios.post(
        `https://api.heltar.com/v1/messages/send`,
        payload,
        { headers: { Authorization: `Bearer ${HELTAR_API_KEY}`, "Content-Type": "application/json" }, timeout: 20000 }
      );
      await logMessageToDb(phone, "out", "send_result", resp.data);
      return resp.data;
    } catch (err) {
      const errText = err.response?.data || err.message || String(err);
      appendLog("heltar-error.log", `${new Date().toISOString()} | send-error | attempt=${attempt} | ${phone} | ${errText}`);
      await logMessageToDb(phone, "out", "send_error", { attempt, error: errText });
      if (attempt >= maxAttempts) {
        throw err;
      }
      // backoff
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
    }
  }
}

/* ------------------- OpenAI & Pinecone helpers (unchanged logic but defensive) ------------------- */
async function openaiChat(messages, maxTokens = 400) {
  if (!OPENAI_KEY) return null;
  try {
    const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.7 };
    const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 25000 });
    return resp.data?.choices?.[0]?.message?.content;
  } catch (e) {
    appendLog("heltar-error.log", `OpenAI chat error: ${e.message}`);
    throw e;
  }
}

async function getEmbedding(text) {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY missing");
  const resp = await axios.post("https://api.openai.com/v1/embeddings", { model: EMBED_MODEL, input: text }, { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 30000 });
  return resp.data.data[0].embedding;
}

async function pineconeQuery(vector, topK = 5, namespace, filter) {
  if (!PINECONE_HOST || !PINECONE_API_KEY) throw new Error("Pinecone config missing");
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/query`;
  const body = { vector, topK, includeMetadata: true };
  if (namespace) body.namespace = namespace;
  if (filter) body.filter = filter;
  const resp = await axios.post(url, body, { headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" }, timeout: 20000 });
  return resp.data;
}

function getNamespacesArray() {
  if (PINECONE_NAMESPACES) return PINECONE_NAMESPACES.split(",").map(s => s.trim()).filter(Boolean);
  return [PINECONE_NAMESPACE || "verse"];
}

async function multiNamespaceQuery(vector, topK = 8, filter) {
  const ns = getNamespacesArray();
  const promises = ns.map(async (n) => {
    try {
      const r = await pineconeQuery(vector, topK, n, filter);
      return (r?.matches || []).map(m => ({ ...m, _namespace: n }));
    } catch (e) {
      console.warn("Pinecone query failed for namespace", n, e?.message || e);
      return [];
    }
  });
  const arr = await Promise.all(promises);
  const allMatches = arr.flat();
  allMatches.sort((a, b) => (b.score || 0) - (a.score || 0));
  return allMatches;
}

/* ------------------- Small talk / state helpers (copied & preserved) ------------------- */
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

const CONCERN_KEYWORDS = ["stress", "anxiety", "depressed", "depression", "angry", "anger", "sleep", "insomnia", "panic", "suicidal", "sad", "lonely", "frustrated", "hurt", "confused"];

function isSmallTalk(text) {
  if (!text) return false;
  const t = normalizeTextForSmallTalk(text);
  for (const keyword of CONCERN_KEYWORDS) {
    if (t.includes(keyword)) return false;
  }
  const smalls = new Set(["how are you", "how are you doing", "how do you do", "how r you", "how ru", "how are u", "thanks", "thank you", "thx", "ok", "okay", "good", "nice", "cool", "bye", "see you", "k"]);
  if (smalls.has(t)) return true;
  return false;
}

/* ------------------- Prompts ------------------- */
const RAG_SYSTEM_PROMPT = `You are SarathiAI...`;
// (copy your existing long prompt here) - for brevity truncated in this snippet
const CHAT_SYSTEM_PROMPT = `You are SarathiAI, a compassionate Gita guide...`;

/* ------------------- RAG flow (keeps your behaviour) ------------------- */
async function getRAGResponse(phone, text, language, chatHistory) {
  // same logic as before, but keep defensive try/catch
  try {
    const transformedQuery = await transformQueryForRetrieval(text);
    const qVec = await getEmbedding(transformedQuery);
    const matches = await multiNamespaceQuery(qVec);
    const verseMatch = matches.find(m => m.metadata?.sanskrit);
    console.log(`[Pinecone Match] Best match score: ${verseMatch?.score}`);

    if (!verseMatch || verseMatch.score < 0.25) {
      const betterFallback = "I hear your concern. Could you please share a little more about what is on your mind so I can offer the best guidance?";
      await sendViaHeltar(phone, betterFallback);
      return { assistantResponse: betterFallback, stage: 'chatting', topic: text };
    }

    const verseSanskrit = (verseMatch.metadata && verseMatch.metadata.sanskrit) || "";
    const verseHinglish = (verseMatch.metadata && (verseMatch.metadata.hinglish1 || verseMatch.metadata.hinglish)) || "";
    const verseContext = `Sanskrit: ${verseSanskrit}\nHinglish: ${verseHinglish}`;
    const ragPromptWithLang = RAG_SYSTEM_PROMPT.replace('{{LANGUAGE}}', language);
    const modelUser = `User's problem: "${text}"\n\nContext from Gita:\n${verseContext}`;

    const aiResponse = await openaiChat([{ role: "system", content: ragPromptWithLang }, { role: "user", content: modelUser }]);

    if (aiResponse) {
      const messageParts = aiResponse.split("||").map(p => p.trim()).filter(Boolean);
      for (const part of messageParts) {
        await sendViaHeltar(phone, part);
        await new Promise(r => setTimeout(r, 1200));
      }
      return { assistantResponse: aiResponse.replace(/\|\|/g, '\n'), stage: 'chatting', topic: text };
    }
    return { assistantResponse: "I am here to listen.", stage: 'chatting', topic: text };
  } catch (e) {
    appendLog("heltar-error.log", `getRAGResponse error: ${e.message}`);
    return { assistantResponse: "I am here to listen.", stage: 'chatting', topic: text };
  }
}

/* ---------- Transform Query helper (same as your previous) ---------- */
async function transformQueryForRetrieval(userQuery) {
  // reuse your prompt-based transformer
  const systemPrompt = `You are an expert in the Bhagavad Gita. Transform a user's query into a concise search term describing the underlying spiritual concept. Examples:\n- User: "I am angry at my husband" -> "overcoming anger in relationships"\n- User: "He is so narcissistic" -> "dealing with ego and arrogance"\nOnly return the transformed query.`;
  try {
    const response = await openaiChat([{ role: "system", content: systemPrompt }, { role: "user", content: userQuery }], 50);
    const transformed = response ? response.replace(/"/g, "").trim() : userQuery;
    console.log(`ℹ️ Transformed Query: "${userQuery}" -> "${transformed}"`);
    return transformed;
  } catch (e) {
    console.warn("transformQueryForRetrieval failed:", e.message);
    return userQuery;
  }
}

/* ------------------- Robust webhook parsing ------------------- */
function extractMessagesFromPayload(body) {
  // Handles multiple shapes: Meta Cloud API, Heltar wrapper, or custom
  // Returns array of objects: { msgId, phone, text, raw }
  const out = [];

  // 1) Meta-style: body.entry[].changes[].value.messages[]
  try {
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const val = change.value || {};
        const msgs = val.messages || [];
        for (const m of msgs) {
          const msgId = m.id || m.mid || m.message_id || null;
          const phone = m.from || val.metadata?.phone_number || m.to || null;
          const text = (m.text && m.text.body) || (m.message && m.message.text) || m.body || null;
          out.push({ msgId, phone, text, raw: m });
        }
      }
    }
  } catch (e) {
    // ignore
  }

  // 2) Heltar minimal wrapper: body.messages[]
  try {
    if (Array.isArray(body.messages) && body.messages.length) {
      for (const m of body.messages) {
        const msgId = m.id || m.messageId || null;
        const phone = m.from || m.clientWaNumber || m.to || null;
        const text = m.text?.body || m.message || m.body || null;
        out.push({ msgId, phone, text, raw: m });
      }
    }
  } catch (e) { /* ignore */ }

  // 3) Top-level convenience (fallback)
  if (body.from && body.text) {
    out.push({ msgId: body.message_id || null, phone: body.from, text: body.text?.body || body.text || null, raw: body });
  }

  return out.filter(m => m && (m.text || m.raw));
}

/* ------------------- Webhook handler ------------------- */
app.get("/webhook", (req, res) => {
  // Standard verification (if provider sends hub.challenge)
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token) {
    if (token === HELTAR_VERIFY_TOKEN || token === process.env.HELTAR_VERIFY_TOKEN) {
      console.log("Webhook verified via GET.");
      return res.status(200).send(challenge || "OK");
    } else {
      console.warn("Webhook GET verification failed - invalid token.");
      return res.sendStatus(403);
    }
  }
  res.sendStatus(200);
});

app.post("/webhook", async (req, res) => {
  // respond quickly so provider thinks we're live
  res.status(200).send("OK");

  try {
    const body = req.body;
    appendLog("webhook.log", `${new Date().toISOString()} | webhook-hit | ${JSON.stringify(body).slice(0, 1000)}`);
    // parse messages
    const messages = extractMessagesFromPayload(body);

    if (!messages || messages.length === 0) {
      console.log("⚠️ Ignoring webhook payload as it does not contain a new user message.");
      await logMessageToDb(null, "in", "non_message_event", body);
      return;
    }

    // process each incoming message (sequential to preserve order)
    for (const m of messages) {
      const msgId = m.msgId || `${m.phone}::${Date.now()}::${Math.random().toString(36).slice(2,8)}`;
      const phone = m.phone?.toString();
      const text = m.text && String(m.text).trim();

      if (!phone || !text) {
        console.warn("Webhook payload missing phone or text. raw:", JSON.stringify(m.raw).slice(0,500));
        await logMessageToDb(phone || null, "in", "bad_payload", m.raw);
        continue;
      }

      // dedupe
      const dup = await isAlreadyProcessed(msgId);
      if (dup) {
        console.log(`Duplicate message ${msgId} ignored for ${phone}`);
        await logMessageToDb(phone, "in", "duplicate", { msgId });
        continue;
      }

      // mark processed early to avoid duplicates when retried
      await markProcessed(msgId, phone);
      await logMessageToDb(phone, "in", "message_received", m.raw);

      // Hand off to main flow (non-blocking)
      (async () => {
        try {
          const userState = await getUserState(phone);
          await updateUserState(phone, { last_activity_ts: new Date().toISOString() });

          let chatHistory = userState.chat_history || [];
          chatHistory.push({ role: 'user', content: text });
          if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

          // Greeting quick reply
          if (isGreeting(text)) {
            const greeting = `Hare Krishna 🙏\n\nI am Sarathi, your companion on this journey.\nHow can I help you today?`;
            await sendViaHeltar(phone, greeting);
            await updateUserState(phone, { conversation_stage: 'new_topic', chat_history: JSON.stringify([]) });
            await saveConversation(phone, text, greeting, null);
            return;
          }

          // small talk
          if (isSmallTalk(text)) {
            const smallTalkReply = `Hare Krishna 🙏 I am here to listen and offer guidance from the Gita. How can I help you today?`;
            await sendViaHeltar(phone, smallTalkReply);
            chatHistory.push({ role: 'assistant', content: smallTalkReply });
            await updateUserState(phone, { chat_history: chatHistory });
            await saveConversation(phone, text, smallTalkReply, null);
            return;
          }

          // Determine language
          let language = 'English';
          try { language = await detectLanguage(text); } catch(e){}

          let currentStage = userState.conversation_stage || 'new_topic';

          if (currentStage === 'chatting') {
            const chatPromptWithLang = CHAT_SYSTEM_PROMPT.replace('{{LANGUAGE}}', language);
            const aiChatResponse = await openaiChat([{ role: "system", content: chatPromptWithLang }, ...chatHistory]);
            if (aiChatResponse && aiChatResponse.includes("[NEW_TOPIC]")) {
              const cleanResponse = aiChatResponse.replace("[NEW_TOPIC]", "").trim();
              if (cleanResponse) await sendViaHeltar(phone, cleanResponse);
              currentStage = "new_topic";
              await saveConversation(phone, text, cleanResponse, null);
            } else if (aiChatResponse) {
              await sendViaHeltar(phone, aiChatResponse);
              chatHistory.push({ role: 'assistant', content: aiChatResponse });
              await updateUserState(phone, { chat_history: chatHistory });
              await saveConversation(phone, text, aiChatResponse, null);
            }
            return;
          }

          if (currentStage === 'new_topic') {
            const ragResult = await getRAGResponse(phone, text, language, chatHistory);
            const assistantText = ragResult.assistantResponse || "I am here to listen.";
            chatHistory.push({ role: 'assistant', content: assistantText });
            await updateUserState(phone, { last_topic_summary: ragResult.topic, conversation_stage: 'chatting', chat_history: chatHistory });
            await saveConversation(phone, text, assistantText, null);
            return;
          }
        } catch (innerErr) {
          appendLog("heltar-error.log", `${new Date().toISOString()} | processing-error | ${innerErr.message}`);
          console.error("Processing inner err:", innerErr);
        }
      })(); // fire-and-forget
    }
  } catch (err) {
    console.error("❌ Webhook processing error:", err.message);
    appendLog("heltar-error.log", `${new Date().toISOString()} | webhook-error | ${err.message}`);
  }
});

/* ---------------- health and test endpoints ---------------- */
app.get("/health", (req, res) => res.status(200).send({ status: "ok", bot: BOT_NAME }));

// Quick send-test (requires HELTAR_API_KEY). Use only for manual testing.
app.post("/send-test", async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).send({ error: "phone & message required" });
    const r = await sendViaHeltar(phone, message);
    res.send({ ok: true, result: r });
  } catch (e) {
    res.status(500).send({ error: e.message });
  }
});

/* ---------------- Global error handling (avoid app crash) ---------------- */
process.on('unhandledRejection', (r) => {
  appendLog("heltar-error.log", `unhandledRejection: ${String(r)}`);
  console.error("unhandledRejection:", r);
});
process.on('uncaughtException', (err) => {
  appendLog("heltar-error.log", `uncaughtException: ${err?.stack || err?.message || err}`);
  console.error("uncaughtException:", err);
});

/* ---------------- Start server ---------------- */
app.listen(PORT, async () => {
  console.log(`\n🚀 ${BOT_NAME} is listening on port ${PORT}`);
  await setupDatabase();
});
