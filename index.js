// index.js — SarathiAI (v10.4 - FINAL COMPLETE Version with All Fixes)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import twilio from "twilio";
import pg from "pg";

const { Pool } = pg;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Config / env ---------------- */
const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;
const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_WHATSAPP_NUMBER = (process.env.TWILIO_WHATSAPP_NUMBER || "").trim();
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();
const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim();
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const PINECONE_NAMESPACE = (process.env.PINECONE_NAMESPACE || "verse").trim();
const PINECONE_NAMESPACES = (process.env.PINECONE_NAMESPACES || "").trim();
const TRAIN_SECRET = process.env.TRAIN_SECRET || null;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

/* ---------------- Database & Session Setup ---------------- */
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
                last_topic_summary TEXT
            );
        `);
        // Add columns if they don't exist to avoid errors on redeploy
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_history JSONB DEFAULT '[]'::jsonb;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS conversation_stage VARCHAR(50) DEFAULT 'new_topic';`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_topic_summary TEXT;`);
        client.release();
        console.log("✅ Database table 'users' is ready.");
    } catch (err) {
        console.error("❌ Error setting up database table:", err);
    }
}

async function getUserSession(phone) {
    let result = await dbPool.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
    if (result.rows.length === 0) {
        await dbPool.query('INSERT INTO users (phone_number) VALUES ($1)', [phone]);
        result = await dbPool.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
    }
    const user = result.rows[0];
    if (typeof user.chat_history === 'string') {
        user.chat_history = JSON.parse(user.chat_history);
    }
    return user;
}

async function updateUserState(phone, updates) {
    const setClauses = [];
    const values = [];
    let valueCount = 1;
    for (const key in updates) {
        setClauses.push(`${key} = $${valueCount++}`);
        const value = typeof updates[key] === 'object' ? JSON.stringify(updates[key]) : updates[key];
        values.push(value);
    }
    if (setClauses.length === 0) return;
    const query = `UPDATE users SET ${setClauses.join(', ')} WHERE phone_number = $${valueCount}`;
    values.push(phone);
    await dbPool.query(query, values);
}

/* ---------------- Startup logs ---------------- */
console.log("\n🚀", BOT_NAME, "starting in LIVE mode...");
console.log("📦 TWILIO_ACCOUNT_SID:", TWILIO_ACCOUNT_SID ? "[LOADED]" : "[MISSING]");
console.log("📦 TWILIO_WHATSAPP_NUMBER:", TWILIO_WHATSAPP_NUMBER ? "[LOADED]" : "[MISSING]");
console.log("📦 DATABASE_URL:", DATABASE_URL ? "[LOADED]" : "[MISSING]");
console.log();

/* ---------------- Provider & AI Helpers ---------------- */
async function sendViaTwilio(destination, replyText) {
  if (!TWILIO_WHATSAPP_NUMBER) {
    console.warn(`(Simulated -> ${destination}): ${replyText}`);
    return;
  }
  try {
    await twilioClient.messages.create({ from: TWILIO_WHATSAPP_NUMBER, to: destination, body: replyText });
    console.log(`✅ Twilio message sent to ${destination}`);
  } catch (err) {
    console.error("❌ Error sending to Twilio:", err.message);
  }
}

async function sendImageViaTwilio(destination, imageUrl, caption) {
    if (!TWILIO_WHATSAPP_NUMBER) {
        console.warn(`(Simulated Image -> ${destination}): ${imageUrl}`);
        return;
    }
    try {
        await twilioClient.messages.create({ from: TWILIO_WHATSAPP_NUMBER, to: destination, body: caption, mediaUrl: [imageUrl] });
        console.log(`✅ Twilio image sent to ${destination}`);
    } catch (err) {
        console.error("❌ Error sending image to Twilio:", err.message);
    }
}

async function openaiChat(messages, maxTokens = 400) {
  if (!OPENAI_KEY) return null;
  const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.7 };
  const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 25000 });
  return resp.data?.choices?.[0]?.message?.content;
}

async function detectLanguage(text) {
    const prompt = `Is the following text primarily in English or Hinglish? Respond with only one word: "English" or "Hinglish".\n\nText: "${text}"`;
    try {
        const response = await openaiChat([{ role: 'user', content: prompt }], 5);
        if (response?.toLowerCase().includes('hinglish')) {
            return 'Hinglish';
        }
        return 'English';
    } catch (error) {
        console.warn("⚠️ Language detection failed, defaulting to English.");
        return 'English';
    }
}


async function transformQueryForRetrieval(userQuery) {
  const systemPrompt = `You are an expert in the Bhagavad Gita. Transform a user's query into a concise search term describing the underlying spiritual concept. Examples:\n- User: "I am angry at my husband" -> "overcoming anger in relationships"\n- User: "He is so narcissistic" -> "dealing with ego and arrogance"\nOnly return the transformed query.`;
  const response = await openaiChat([{ role: "system", content: systemPrompt }, { role: "user", content: userQuery }], 50);
  const transformed = response ? response.replace(/"/g, "").trim() : userQuery;
  console.log(`ℹ Transformed Query: "${userQuery}" -> "${transformed}"`);
  return transformed;
}

async function getEmbedding(text) {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY missing");
  const resp = await axios.post("https://api.openai.com/v1/embeddings", { model: EMBED_MODEL, input: text }, { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 30000 });
  return resp.data.data[0].embedding;
}

/* ---------------- Pinecone Helpers ---------------- */
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
    if (PINECONE_NAMESPACES) {
        return PINECONE_NAMESPACES.split(",").map(s => s.trim()).filter(Boolean);
    }
    return [PINECONE_NAMESPACE || "verse"];
}

async function multiNamespaceQuery(vector, topK = 8, filter = undefined) {
    const ns = getNamespacesArray();
    const promises = ns.map(async (n) => {
        try {
            const r = await pineconeQuery(vector, topK, n, filter);
            return (r?.matches || []).map(m => ({ ...m, _namespace: n }));
        } catch (e) {
            console.warn("⚠ Pinecone query failed for namespace", n, e?.message || e);
            return [];
        }
    });
    const arr = await Promise.all(promises);
    const allMatches = arr.flat();
    allMatches.sort((a,b) => (b.score || 0) - (a.score || 0));
    return allMatches;
}

async function findVerseByReference(reference, queryVector = null) {
    if (!reference) return null;
    const tries = [ reference, reference.trim(), reference.trim().replace(/\s+/g, "_") ];
    const verseNs = getNamespacesArray().find(n => n.toLowerCase().includes("verse")) || getNamespacesArray()[0];
    for (const t of tries) {
        try {
            const vec = queryVector || await getEmbedding(t);
            const filter = { reference: { "$eq": t } };
            const res = await pineconeQuery(vec, 1, verseNs, filter);
            if (res?.matches?.length) return res.matches[0];
        } catch (e) {
            console.warn(`❗ findVerseByReference failed for "${t}":`, e.message);
        }
    }
    return null;
}

/* ---------------- Payload Extraction & Small Talk Logic ---------------- */
function extractPhoneAndText(body) {
    return { phone: body.From, text: body.Body };
}

function normalizeTextForSmallTalk(s) {
  if (!s) return "";
  let t = String(s).trim().toLowerCase().replace(/[^\w\s]/g," ").replace(/\s+/g," ").trim();
  t = t.replace(/\bu\b/g, "you");
  t = t.replace(/\br\b/g, "are");
  return t;
}

function isGreeting(text) {
  if (!text) return false;
  const t = normalizeTextForSmallTalk(text);
  const greetings = new Set(["hi","hii","hello","hey","namaste","hare krishna","harekrishna"]);
  return greetings.has(t);
}

const CONCERN_KEYWORDS = ["stress", "anxiety", "depressed", "depression", "angry", "anger", "sleep", "insomnia", "panic", "suicidal", "sad", "lonely"];

function isSmallTalk(text) {
    if (!text) return false;
    const t = normalizeTextForSmallTalk(text);
    for (const keyword of CONCERN_KEYWORDS) {
        if (t.includes(keyword)) return false;
    }
    const smalls = new Set([
      "how are you", "how are you doing", "how do you do", "how r you", "how ru", "how are u",
      "thanks", "thank you", "thx", "ok", "okay", "good", "nice",
      "cool", "bye", "see you", "k"
    ]);
    if (smalls.has(t)) return true;
    return false;
}

/* ---------------- State-Aware AI Prompts ---------------- */
const RAG_SYSTEM_PROMPT = `You are SarathiAI. A user is starting a new conversation. You have a relevant Gita verse as context. Your task is to introduce this verse and its core teaching.\n- Your entire response MUST use "||" as a separator for each message bubble.\n- Part 1: The Sanskrit verse.\n- Part 2: The Hinglish translation.\n- Part 3: Start with "Shri Krishna kehte hain:", a one-sentence essence, then a 2-3 sentence explanation.\n- Part 4: A simple follow-up question.\n- STRICTLY respond in {{LANGUAGE}}.`;

const CHAT_SYSTEM_PROMPT = `You are SarathiAI, a compassionate Gita guide, in the middle of a conversation. The user's chat history is provided.\n- Listen, be empathetic, and continue the conversation naturally.\n- Offer wisdom based on Gita's principles in YOUR OWN WORDS. Do NOT quote new verses.\n- Keep replies very short (1-3 sentences).\n- If you detect the user is introducing a completely new problem, end your response with the special token: [NEW_TOPIC]\n- STRICTLY respond in {{LANGUAGE}}.`;

/* ---------------- Other Small Helpers ---------------- */
function safeText(md, key) {
  return (md && md[key] && String(md[key]).trim()) || "";
}

/* ---------------- Webhook - The Final State Machine ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound raw payload:", JSON.stringify(req.body, null, 2));
    res.status(200).send(); 

    const { phone, text } = extractPhoneAndText(req.body);
    if (!phone || !text) return;

    const incoming = String(text).trim();
    const normalizedIncoming = incoming.toLowerCase();

    // --- Stateless commands handled FIRST ---
    if (isGreeting(incoming)) {
        console.log(`[Action: Greeting] for ${phone}`);
        const welcomeMessage = `Hare Krishna 🙏\n\nI am Sarathi, your companion on this journey.\nHow can I help you today?`;
        await sendViaTwilio(phone, welcomeMessage);
        // Reset user state for a new conversation
        await updateUserState(phone, { 
            last_activity_ts: 'NOW()', 
            cooldown_message_sent: false,
            chat_history: '[]',
            conversation_stage: 'new_topic'
        });
        return;
    }

    if (normalizedIncoming === 'yes daily') {
        console.log(`[Action: Subscription] for ${phone}`);
        await updateUserState(phone, { subscribed_daily: true, last_activity_ts: 'NOW()' });
        await sendViaTwilio(phone, "Thank you for subscribing! You will now receive a daily morning message from SarathiAI. 🙏");
        return;
    }

    // --- Stateful logic begins now ---
    const userState = await getUserState(phone);
    const now = new Date();
    const lastActivity = new Date(userState.last_activity_ts);
    const minutesSinceLastActivity = (now - lastActivity) / (1000 * 60);

    // Intelligent Cool-down Logic
    if (minutesSinceLastActivity > 30 && !userState.cooldown_message_sent) {
        console.log(`[Action: Cool-down] for ${phone}`);
        const cooldownImage = "https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/images/Gemini_Generated_Image_x0pm5kx0pm5kx0pm.png";
        const cooldownQuote = `"कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।\nKarmanye vadhikaraste, ma phaleshu kadachana."\n\n(Focus on your actions, not the results.)`;
        const cooldownPractice = "A simple practice: Take three deep breaths and focus on the present moment.";
        const optInMessage = `I hope you are having a peaceful day.\n\nWould you like to receive a short, inspiring message like this every morning? Reply with "Yes Daily" to subscribe.`;

        await sendImageViaTwilio(phone, cooldownImage, `${cooldownQuote}\n\n${cooldownPractice}`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sendViaTwilio(phone, optInMessage);
        
        await updateUserState(phone, { cooldown_message_sent: true, last_activity_ts: 'NOW()' });
        return; 
    }

    await updateUserState(phone, { last_activity_ts: 'NOW()' });
    
    let chatHistory = userState.chat_history || [];
    chatHistory.push({ role: 'user', content: text });
    if (chatHistory.length > 8) chatHistory = chatHistory.slice(-8);

    if (isSmallTalk(incoming)) {
        console.log(`[Action: Small Talk] for ${phone}`);
        const smallTalkReply = `Hare Krishna 🙏 I am here to listen and offer guidance from the Gita. How can I help you today?`;
        await sendViaTwilio(phone, smallTalkReply);
        chatHistory.push({ role: 'assistant', content: smallTalkReply });
        await updateUserState(phone, { chat_history: chatHistory });
        return;
    }
    
    const language = await detectLanguage(text);
    console.log(`[Language Detected]: ${language}`);

    if (userState.conversation_stage === "new_topic") {
        console.log(`[State: new_topic] for ${phone}`);
        const transformedQuery = await transformQueryForRetrieval(text);
        const qVec = await getEmbedding(transformedQuery);
        const matches = await multiNamespaceQuery(qVec);
        const verseMatch = matches.find(m => m.metadata?.sanskrit);
        
        console.log(`[Pinecone Match] Best match score: ${verseMatch?.score}`);

        if (!verseMatch || verseMatch.score < 0.25) {
            const betterFallback = "I hear your concern. Could you please share a little more about what is on your mind so I can offer the best guidance?";
            await sendViaTwilio(phone, betterFallback);
            await updateUserState(phone, { chat_history: chatHistory }); // Save history even on fallback
            return;
        }

        const verseSanskrit = safeText(verseMatch.metadata, "sanskrit");
        const verseHinglish = safeText(verseMatch.metadata, "hinglish1");
        const verseContext = `Sanskrit: ${verseSanskrit}\nHinglish: ${verseHinglish}`;
        
        const ragPromptWithLang = RAG_SYSTEM_PROMPT.replace('{{LANGUAGE}}', language);
        const modelUser = `User's problem: "${text}"\n\nContext from Gita:\n${verseContext}`;
        const aiResponse = await openaiChat([{ role: "system", content: ragPromptWithLang }, { role: "user", content: modelUser }]);

        if (aiResponse) {
            const messageParts = aiResponse.split("||").map(p => p.trim());
            for (const part of messageParts) {
                if (part) {
                    await sendViaTwilio(phone, part);
                    await new Promise(resolve => setTimeout(resolve, 1500)); 
                }
            }
            chatHistory.push({ role: 'assistant', content: aiResponse.replace(/\|\|/g, '\n') });
            await updateUserState(phone, {
                last_topic_summary: text,
                conversation_stage: "chatting",
                chat_history: chatHistory
            });
        }

    } else if (userState.conversation_stage === "chatting") {
        console.log(`[State: chatting] for ${phone}`);
        const chatPromptWithLang = CHAT_SYSTEM_PROMPT.replace('{{LANGUAGE}}', language);
        const aiResponse = await openaiChat([
            { role: "system", content: chatPromptWithLang },
            ...chatHistory
        ]);

        if (aiResponse) {
            if (aiResponse.includes("[NEW_TOPIC]")) {
                const cleanResponse = aiResponse.replace("[NEW_TOPIC]", "").trim();
                if (cleanResponse) await sendViaTwilio(phone, cleanResponse);
                await sendViaTwilio(phone, "It sounds like we're moving to a new topic. Let me find a teaching for that...");
                await updateUserState(phone, { conversation_stage: 'new_topic' });
            } else {
                await sendViaTwilio(phone, aiResponse);
                chatHistory.push({ role: 'assistant', content: aiResponse });
                await updateUserState(phone, { chat_history: chatHistory });
            }
        }
    }
  } catch (err) {
    console.error("❌ Webhook processing error:", err.message);
  }
});

/* ---------------- Root, Admin, Proactive Check-in ---------------- */
app.get("/", (_req, res) => res.send(`${BOT_NAME} is running with Advanced Conversational Engine ✅`));

function findIngestScript() { /* ... same as before ... */ }
function runCommand(cmd, args = [], onOutput, onExit) { /* ... same as before ... */ }
app.get("/train", (req, res) => { /* ... same as before ... */ });
app.get("/test-retrieval", async (req, res) => { /* ... same as before ... */ });

async function proactiveCheckin() {
    console.log("Running proactive check-in...");
    const usersResult = await dbPool.query('SELECT phone_number, last_topic_summary, last_activity_ts FROM users');
    const now = new Date();
    const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

    for (const user of usersResult.rows) {
        const lastSeen = new Date(user.last_activity_ts);

        if (now - lastSeen > FORTY_EIGHT_HOURS_MS && user.last_topic_summary) {
            console.log(`Sending proactive check-in to ${user.phone_number} about "${user.last_topic_summary}"`);
            
            const prompt = `A user was previously concerned about "${user.last_topic_summary}". Write a single, short, gentle check-in message in English asking how they are doing with that specific issue. Be warm and encouraging.`;
            const careMessage = await openaiChat([{ role: "system", content: "You are a caring companion." }, { role: "user", content: prompt }], 100);

            if (careMessage) {
                await sendViaTwilio(user.phone_number, careMessage);
                await updateUserState(user.phone_number, { last_topic_summary: null }); // Clear summary after check-in
            }
        }
    }
}
setInterval(proactiveCheckin, 6 * 60 * 60 * 1000); 

/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
    console.log(`\n🚀 ${BOT_NAME} is listening on port ${PORT}`);
    setupDatabase(); 
});
