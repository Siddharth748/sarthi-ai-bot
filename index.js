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

const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim(); // e.g. https://controller.your-pinecone-endpoint
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const PINECONE_NAMESPACE = (process.env.PINECONE_NAMESPACE || "verse").trim();
const PINECONE_NAMESPACES = (process.env.PINECONE_NAMESPACES || "").trim();

const HELTAR_API_KEY = (process.env.HELTAR_API_KEY || "").trim();
const HELTAR_PHONE_ID = (process.env.HELTAR_PHONE_ID || "").trim();

const dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

/* ---------------- Database Setup ---------------- */
async function setupDatabase() {
  try {
    const client = await dbPool.connect();
    // users table (with analytics + lesson columns)
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
    // lessons table
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
    console.error("❌ Error setting up database tables:", err);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | DB Setup Error | ${err.message}\n`);
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
      const newRes = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
      const user = newRes.rows[0];
      user.chat_history = user.chat_history || [];
      return user;
    }
    const user = res.rows[0];
    user.chat_history = user.chat_history || [];
    return user;
  } catch (err) {
    console.error("getUserState failed:", err.message);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | getUserState Error | ${err.message}\n`);
    return { phone_number: phone, chat_history: [], conversation_stage: "new_topic", current_lesson: 0 };
  }
}

async function updateUserState(phone, updates) {
  try {
    // convert 'NOW()' sentinel to actual timestamp if present
    if (updates.last_activity_ts === "NOW()") {
      updates.last_activity_ts = new Date().toISOString();
    }

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
  } catch (err) {
    console.error("updateUserState failed:", err.message);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | updateUserState Error | ${err.message}\n`);
  }
}

/* ---------------- Analytics helpers ---------------- */
async function trackIncoming(phone, text) {
  try {
    const user = await getUserState(phone);
    const now = new Date();
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

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

    if (!user.first_seen_date) updates.first_seen_date = today;
    if (addSession) updates.total_sessions = (user.total_sessions || 0) + 1;

    await updateUserState(phone, updates);
    console.log(`📊 Incoming tracked: ${phone}`);
  } catch (err) {
    console.error("trackIncoming failed:", err.message);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | trackIncoming Error | ${err.message}\n`);
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
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | trackOutgoing Error | ${err.message}\n`);
  }
}

/* ---------------- Heltar send ---------------- */
async function sendViaHeltar(phone, message, type = "chat") {
  try {
    if (!HELTAR_API_KEY) {
      console.warn(`(Simulated -> ${phone}): ${message}`);
      // Still track outgoing in simulated mode
      await trackOutgoing(phone, message, type);
      return { simulated: true, message };
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
        timeout: 20000,
      }
    );

    console.log(`✅ Heltar message sent to ${phone}: ${message}`);
    await trackOutgoing(phone, message, type);
    return resp.data;
  } catch (err) {
    console.error("Heltar send error:", err?.response?.data || err?.message || err);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | ${phone} | Send Failed | ${JSON.stringify(err?.response?.data || err?.message)}\n`);
    throw err;
  }
}

/* ---------------- Lessons helpers ---------------- */
async function sendLesson(phone, lessonNumber) {
  try {
    const res = await dbPool.query("SELECT * FROM lessons WHERE lesson_number = $1", [lessonNumber]);
    if (!res.rows || res.rows.length === 0) {
      await sendViaHeltar(phone, "🌸 You've completed all lessons in this course!", "lesson");
      return;
    }
    const lesson = res.rows[0];
    await sendViaHeltar(phone, lesson.verse, "lesson");
    await new Promise((r) => setTimeout(r, 1200));
    await sendViaHeltar(phone, lesson.translation, "lesson");
    await new Promise((r) => setTimeout(r, 1200));
    await sendViaHeltar(phone, `Shri Krishna kehte hain: ${lesson.commentary}`, "lesson");
    await new Promise((r) => setTimeout(r, 1200));
    await sendViaHeltar(phone, `🤔 ${lesson.reflection_question}`, "lesson");
    // prompt to continue next day by replying
    await new Promise((r) => setTimeout(r, 600));
    await sendViaHeltar(phone, `Reply "Hare Krishna" or "Next" to receive the next lesson when you're ready.`, "lesson_prompt");
  } catch (err) {
    console.error("sendLesson failed:", err.message);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | sendLesson Error | ${err.message}\n`);
  }
}

/* ---------------- Text classification ---------------- */
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

const CONCERN_KEYWORDS = ["stress","anxiety","depressed","depression","angry","anger","sleep","insomnia","panic","suicidal","sad","lonely","frustrated","hurt","confused"];

function isSmallTalk(text) {
  if (!text) return false;
  const t = normalizeTextForSmallTalk(text);
  for (const keyword of CONCERN_KEYWORDS) {
    if (t.includes(keyword)) return false;
  }
  const smalls = new Set(["how are you","how are you doing","how do you do","how r you","how ru","how are u","thanks","thank you","ok","okay","good","nice","cool","bye"]);
  return smalls.has(t);
}

/* ---------------- System prompts ---------------- */
const RAG_SYSTEM_PROMPT = `You are SarathiAI. A user is starting a new conversation. You have a relevant Gita verse as context.
- Use "||" to separate each message bubble.
- Part 1: The Sanskrit verse.
- Part 2: Hinglish translation.
- Part 3: "Shri Krishna kehte hain:" + 1-3 sentence essence/explanation.
- Part 4: A simple follow-up question.
- Strictly and exclusively reply in {{LANGUAGE}}.`;

const CHAT_SYSTEM_PROMPT = `You are SarathiAI, a compassionate Gita guide. Continue the conversation empathetically.
- Use user's chat history for context.
- DO NOT quote new verses here.
- Keep replies very short (1-3 sentences).
- If strong emotional need is expressed, end with [NEW_TOPIC].
- Strictly and exclusively reply in {{LANGUAGE}}.`;

/* ---------------- OpenAI & Pinecone helpers ---------------- */
async function openaiChat(messages, maxTokens = 400) {
  if (!OPENAI_KEY) {
    console.warn("OPENAI_API_KEY missing — openaiChat returning null");
    return null;
  }
  try {
    const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.7 };
    const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      timeout: 25000,
    });
    return resp.data?.choices?.[0]?.message?.content;
  } catch (err) {
    console.error("openaiChat error:", err?.response?.data || err?.message);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | openaiChat Error | ${JSON.stringify(err?.response?.data || err?.message)}\n`);
    return null;
  }
}

async function getEmbedding(text) {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY missing");
  try {
    const resp = await axios.post("https://api.openai.com/v1/embeddings", { model: EMBED_MODEL, input: text }, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      timeout: 30000,
    });
    return resp.data.data[0].embedding;
  } catch (err) {
    console.error("getEmbedding error:", err?.response?.data || err?.message);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | getEmbedding Error | ${JSON.stringify(err?.response?.data || err?.message)}\n`);
    throw err;
  }
}

async function pineconeQuery(vector, topK = 5, namespace) {
  if (!PINECONE_HOST || !PINECONE_API_KEY) throw new Error("Pinecone config missing");
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/query`;
  const body = { vector, topK, includeMetadata: true };
  if (namespace) body.namespace = namespace;
  try {
    const resp = await axios.post(url, body, { headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" }, timeout: 20000 });
    return resp.data;
  } catch (err) {
    console.error("pineconeQuery error:", err?.response?.data || err?.message);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | pineconeQuery Error | ${JSON.stringify(err?.response?.data || err?.message)}\n`);
    throw err;
  }
}

function getNamespacesArray() {
  if (PINECONE_NAMESPACES) return PINECONE_NAMESPACES.split(",").map(s => s.trim()).filter(Boolean);
  return [PINECONE_NAMESPACE || "verse"];
}

async function multiNamespaceQuery(vector, topK = 8, filter) {
  const ns = getNamespacesArray();
  const promises = ns.map(async (n) => {
    try {
      const r = await pineconeQuery(vector, topK, n);
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

/* ---------------- Utility & RAG ---------------- */
function safeText(md, key) {
  return (md && md[key] && String(md[key]).trim()) || "";
}

async function transformQueryForRetrieval(userQuery) {
  try {
    const prompt = `You are an expert in the Bhagavad Gita. Transform a user's query into a concise search term describing the underlying spiritual concept.\nUser: "${userQuery}"\nOnly return a short search phrase.`;
    const resp = await openaiChat([{role:"user", content: prompt}], 40);
    if (!resp) return userQuery;
    const t = resp.replace(/["']/g, "").trim();
    console.log(`ℹ️ Transformed query: "${userQuery}" -> "${t}"`);
    return t;
  } catch (err) {
    console.warn("transformQueryForRetrieval failed, using original query");
    return userQuery;
  }
}

async function detectLanguage(text) {
  // lightweight detection via OpenAI
  try {
    const prompt = `Is the following text primarily in English or Hinglish? Reply with only one word: English or Hinglish.\n\nText: "${text}"`;
    const resp = await openaiChat([{role:"user", content: prompt}], 10);
    if (!resp) return "English";
    if (resp.toLowerCase().includes("hinglish")) return "Hinglish";
    return "English";
  } catch (err) {
    return "English";
  }
}

async function getRAGResponse(phone, text, language, chatHistory) {
  try {
    // 1) transform query
    const transformed = await transformQueryForRetrieval(text);
    // 2) embed
    const qVec = await getEmbedding(transformed);
    // 3) query pinecone
    const matches = await multiNamespaceQuery(qVec, 6);
    const verseMatch = matches.find(m => m.metadata?.sanskrit || m.metadata?.verse || m.metadata?.sanskrit_text);
    console.log(`[Pinecone] matches: ${matches.length}; best score: ${verseMatch?.score}`);
    if (!verseMatch || (verseMatch.score || 0) < 0.25) {
      // fallback: ask for more info
      const fallback = "I hear your concern. Could you please share a little more about what is on your mind so I can offer the best guidance?";
      await sendViaHeltar(phone, fallback, "fallback");
      return { assistantResponse: fallback, stage: 'chatting', topic: text };
    }

    const verseSanskrit = safeText(verseMatch.metadata, "sanskrit") || safeText(verseMatch.metadata, "verse") || "";
    const verseHinglish = safeText(verseMatch.metadata, "hinglish1") || safeText(verseMatch.metadata, "translation") || "";
    const verseContext = `Sanskrit: ${verseSanskrit}\nHinglish: ${verseHinglish}`;

    const ragPromptWithLang = RAG_SYSTEM_PROMPT.replace("{{LANGUAGE}}", language || "English");
    const modelUser = `User's problem: "${text}"\n\nContext from Gita:\n${verseContext}`;
    const aiResponse = await openaiChat([{role:"system", content: ragPromptWithLang}, {role:"user", content: modelUser}], 500);

    if (!aiResponse) {
      const fallback = "I am here to listen.";
      await sendViaHeltar(phone, fallback, "fallback");
      return { assistantResponse: fallback, stage: 'chatting', topic: text };
    }

    // Expecting "||" separated bubbles per your RAG System prompt
    const messageParts = aiResponse.split("||").map(p => p.trim()).filter(Boolean);
    for (const part of messageParts) {
      await sendViaHeltar(phone, part, "verse");
      // small pause
      await new Promise(r => setTimeout(r, 1200));
    }

    return { assistantResponse: aiResponse.replace(/\|\|/g, "\n"), stage: 'chatting', topic: text };
  } catch (err) {
    console.error("getRAGResponse failed:", err?.message || err);
    fs.appendFileSync("heltar-error.log", `${new Date().toISOString()} | getRAGResponse Error | ${err?.message || err}\n`);
    const fallback = "I am here to listen.";
    try { await sendViaHeltar(phone, fallback, "fallback"); } catch(e){}
    return { assistantResponse: fallback, stage: 'chatting', topic: text };
  }
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
    const rawText =
      msg?.text?.body ||
      msg?.button?.payload ||
      msg?.interactive?.button_reply?.id ||
      "";
    const text = String(rawText || "").trim();
    if (!phone || !text) {
      console.warn("⚠️ Webhook missing phone/text.");
      return;
    }

    console.log(`📩 Incoming from ${phone}: "${text}"`);
    await trackIncoming(phone, text);

    const userState = await getUserState(phone);
    const lower = text.toLowerCase();

    /* ---------- Lesson flow ---------- */
    if (
      lower.includes("teach me") ||
      lower.includes("bhagavad gita") ||
      lower === "teach gita" ||
      lower.includes("gita")
    ) {
      let nextLesson = (userState.current_lesson || 0) + 1;
      if (nextLesson > 7) {
        await sendViaHeltar(
          phone,
          "🌸 You’ve already completed the 7-day course! Reply 'restart' to do it again.",
          "lesson"
        );
        return;
      }
      await updateUserState(phone, {
        current_lesson: nextLesson,
        conversation_stage: "lesson_mode",
      });
      await sendLesson(phone, nextLesson);
      return;
    }

    if (userState.conversation_stage === "lesson_mode") {
      if (
        lower === "next" ||
        lower.includes("hare krishna") ||
        lower === "harekrishna"
      ) {
        let nextLesson = (userState.current_lesson || 0) + 1;
        if (nextLesson > 7) {
          await sendViaHeltar(
            phone,
            "🌸 You’ve already completed the 7-day course! Reply 'restart' to do it again.",
            "lesson"
          );
          return;
        }
        await updateUserState(phone, {
          current_lesson: nextLesson,
          conversation_stage: "lesson_mode",
        });
        await sendLesson(phone, nextLesson);
        return;
      }

      if (lower === "restart") {
        await updateUserState(phone, { current_lesson: 0 });
        await sendViaHeltar(
          phone,
          "🌸 Course progress reset. Reply 'teach me gita' to start again.",
          "lesson"
        );
        return;
      }

      if (isGreeting(lower) || isSmallTalk(lower)) {
        await sendViaHeltar(
          phone,
          `Hare Krishna 🙏\nI am Sarathi, your companion on this journey.\nReply 'Next' anytime to continue your Gita lessons.`,
          "welcome"
        );
        return;
      }

      // 👉 Any other query in lesson mode → RAG
      let chatHistory = userState.chat_history || [];
      if (typeof chatHistory === "string") {
        try {
          chatHistory = JSON.parse(chatHistory);
        } catch {
          chatHistory = [];
        }
      }
      chatHistory.push({ role: "user", content: text });
      if (chatHistory.length > 8) chatHistory = chatHistory.slice(-8);

      const language = await detectLanguage(text);
      const ragResult = await getRAGResponse(phone, text, language, chatHistory);
      chatHistory.push({ role: "assistant", content: ragResult.assistantResponse });

      await updateUserState(phone, {
        chat_history: JSON.stringify(chatHistory),
        last_topic_summary: ragResult.topic || text,
        conversation_stage: "lesson_mode",
      });
      return;
    }

    /* ---------- Greeting / small talk ---------- */
    if (isGreeting(lower) || isSmallTalk(lower)) {
      await sendViaHeltar(
        phone,
        `Hare Krishna 🙏\n\nI am Sarathi, your companion on this journey.\nHow can I help you today?`,
        "welcome"
      );
      await updateUserState(phone, {
        conversation_stage: "new_topic",
        chat_history: JSON.stringify([]),
      });
      return;
    }

    /* ---------- Main stateful flow ---------- */
    let currentStage = userState.conversation_stage || "new_topic";
    let chatHistory = userState.chat_history || [];
    if (typeof chatHistory === "string") {
      try {
        chatHistory = JSON.parse(chatHistory);
      } catch {
        chatHistory = [];
      }
    }
    chatHistory.push({ role: "user", content: text });
    if (chatHistory.length > 8) chatHistory = chatHistory.slice(-8);

    if (currentStage === "chatting") {
      const language = await detectLanguage(text);
      const chatPrompt = CHAT_SYSTEM_PROMPT.replace(
        "{{LANGUAGE}}",
        language || "Hinglish"
      );
      const aiChatResponse = await openaiChat(
        [{ role: "system", content: chatPrompt }, ...chatHistory],
        300
      );

      if (aiChatResponse && aiChatResponse.includes("[NEW_TOPIC]")) {
        const clean = aiChatResponse.replace("[NEW_TOPIC]", "").trim();
        if (clean) await sendViaHeltar(phone, clean, "chat");
        await updateUserState(phone, {
          conversation_stage: "new_topic",
          chat_history: JSON.stringify(chatHistory),
        });
        return;
      } else if (aiChatResponse) {
        await sendViaHeltar(phone, aiChatResponse, "chat");
        chatHistory.push({ role: "assistant", content: aiChatResponse });
        await updateUserState(phone, { chat_history: JSON.stringify(chatHistory) });
        return;
      } else {
        currentStage = "new_topic";
      }
    }

    if (currentStage === "new_topic") {
      const language = await detectLanguage(text);
      const ragResult = await getRAGResponse(
        phone,
        text,
        language || "Hinglish",
        chatHistory
      );
      chatHistory.push({ role: "assistant", content: ragResult.assistantResponse });
      await updateUserState(phone, {
        last_topic_summary: ragResult.topic || text,
        conversation_stage: "chatting",
        chat_history: JSON.stringify(chatHistory),
      });
    }
  } catch (err) {
    console.error("❌ Webhook error:", err?.message || err);
    fs.appendFileSync(
      "heltar-error.log",
      `${new Date().toISOString()} | Webhook Error | ${JSON.stringify(
        err?.message || err
      )}\n`
    );
  }
});
