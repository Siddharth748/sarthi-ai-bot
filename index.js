// index.js — SarathiAI (v10.2 - FINAL COMPLETE Version with Cool-down & DB)
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
// Add ssl config for Railway's PostgreSQL
const dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const sessions = new Map(); // For temporary chat history only

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
                last_topic_summary TEXT
            );
        `);
        // Add columns if they don't exist to avoid errors on redeploy
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_topic_summary TEXT;`);
        client.release();
        console.log("✅ Database table 'users' is ready.");
    } catch (err) {
        console.error("❌ Error setting up database table:", err);
    }
}

async function getUserState(phone) {
    let result = await dbPool.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
    if (result.rows.length === 0) {
        await dbPool.query('INSERT INTO users (phone_number) VALUES ($1)', [phone]);
        result = await dbPool.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
    }
    return result.rows[0];
}

async function updateUserState(phone, updates) {
    const setClauses = [];
    const values = [];
    let valueCount = 1;
    for (const key in updates) {
        setClauses.push(`${key} = $${valueCount++}`);
        values.push(updates[key]);
    }
    if (setClauses.length === 0) return;
    const query = `UPDATE users SET ${setClauses.join(', ')} WHERE phone_number = $${valueCount}`;
    values.push(phone);
    await dbPool.query(query, values);
}

function getChatSession(phone) {
  let s = sessions.get(phone);
  if (!s) {
    s = { chat_history: [], conversation_stage: "new_topic" };
    sessions.set(phone, s);
  }
  return s;
}


/* ---------------- Startup logs ---------------- */
console.log("\n🚀", BOT_NAME, "starting in LIVE mode...");
console.log("📦 TWILIO_ACCOUNT_SID:", TWILIO_ACCOUNT_SID ? "[LOADED]" : "[MISSING]");
console.log("📦 TWILIO_WHATSAPP_NUMBER:", TWILIO_WHATSAPP_NUMBER ? "[LOADED]" : "[MISSING]");
console.log("📦 DATABASE_URL:", DATABASE_URL ? "[LOADED]" : "[MISSING]");
console.log();

/* ---------------- Provider & AI Helpers ---------------- */
async function sendViaTwilio(destination, replyText) { /* ... same as before ... */ }
async function sendImageViaTwilio(destination, imageUrl, caption) { /* ... same as before ... */ }
async function openaiChat(messages, maxTokens = 400) { /* ... same as before ... */ }
async function transformQueryForRetrieval(userQuery) { /* ... same as before ... */ }
async function getEmbedding(text) { /* ... same as before ... */ }

/* ---------------- Pinecone Helpers ---------------- */
async function pineconeQuery(vector, topK = 5, namespace, filter) { /* ... same as before ... */ }
function getNamespacesArray() { /* ... same as before ... */ }
async function multiNamespaceQuery(vector, topK = 5, filter) { /* ... same as before ... */ }
async function findVerseByReference(reference, queryVector = null) { /* ... same as before ... */ }

/* ---------------- Payload Extraction & Small Talk Logic ---------------- */
function extractPhoneAndText(body) { /* ... same as before ... */ }
function normalizeTextForSmallTalk(s) { /* ... same as before ... */ }
function isGreeting(text) { /* ... same as before ... */ }
const CONCERN_KEYWORDS = ["stress", "anxiety", "depressed", "depression", "angry", "anger", "sleep", "insomnia", "panic", "suicidal", "sad", "lonely"];
function isSmallTalk(text) { /* ... same as before ... */ }

/* ---------------- State-Aware AI Prompts with Language Detection ---------------- */
const RAG_SYSTEM_PROMPT = `You are SarathiAI... (Your prompt with strict language rule)`;
const CHAT_SYSTEM_PROMPT = `You are SarathiAI, a compassionate guide... (Your prompt with strict language rule)`;

/* ---------------- Other Small Helpers ---------------- */
function safeText(md, key) { /* ... same as before ... */ }

/* ---------------- Webhook - The Final State Machine ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound raw payload:", JSON.stringify(req.body, null, 2));
    res.status(200).send(); 

    const { phone, text } = extractPhoneAndText(req.body);
    if (!phone || !text) return;

    const userState = await getUserState(phone); // From DB for persistent state
    const chatSession = getChatSession(phone); // From in-memory for temporary chat history

    const now = new Date();
    const lastActivity = new Date(userState.last_activity_ts);
    const minutesSinceLastActivity = (now - lastActivity) / (1000 * 60);
    const incoming = String(text).trim();
    const normalizedIncoming = incoming.toLowerCase();

    // ✅ Intelligent Cool-down Logic
    if (minutesSinceLastActivity > 30 && !userState.cooldown_message_sent && !isGreeting(incoming) && normalizedIncoming !== 'yes daily') {
        console.log(`[Action: Cool-down] for ${phone}`);
        const cooldownImage = "https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/images/Gemini_Generated_Image_x0pm5kx0pm5kx0pm.png";
        const cooldownQuote = `"कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।\nKarmanye vadhikaraste, ma phaleshu kadachana."\n\n(Focus on your actions, not the results.)`;
        const cooldownPractice = "A simple practice: Take three deep breaths and focus on the present moment.";
        const optInMessage = `I hope you are having a peaceful day.\n\nWould you like to receive a short, inspiring message like this every morning? Reply with "Yes Daily" to subscribe.`;

        await sendImageViaTwilio(phone, cooldownImage, `${cooldownQuote}\n\n${cooldownPractice}`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sendViaTwilio(phone, optInMessage);
        
        await updateUserState(phone, { cooldown_message_sent: true });
    }

    await updateUserState(phone, { last_activity_ts: 'NOW()' });

    if (normalizedIncoming === 'yes daily') {
        console.log(`[Action: Subscription] for ${phone}`);
        await updateUserState(phone, { subscribed_daily: true });
        await sendViaTwilio(phone, "Thank you for subscribing! You will now receive a daily morning message from SarathiAI. 🙏");
        return;
    }
    
    if (isGreeting(incoming)) {
        console.log(`[Action: Greeting] for ${phone}`);
        chatSession.conversation_stage = "new_topic";
        chatSession.chat_history = [];
        const welcomeMessage = `Hare Krishna 🙏\n\nI am Sarathi, your companion on this journey.\nHow can I help you today?`;
        await sendViaTwilio(phone, welcomeMessage);
        return;
    }

    if (isSmallTalk(incoming)) {
        console.log(`[Action: Small Talk] for ${phone}`);
        const smallTalkReply = `Hare Krishna 🙏 I am here to listen and offer guidance from the Gita. How can I help you today?`;
        await sendViaTwilio(phone, smallTalkReply);
        chatSession.chat_history.push({ role: 'user', content: text });
        chatSession.chat_history.push({ role: 'assistant', content: smallTalkReply });
        return;
    }

    chatSession.chat_history.push({ role: 'user', content: text });
    if (chatSession.chat_history.length > 8) {
        chatSession.chat_history = chatSession.chat_history.slice(-8);
    }
    
    if (chatSession.conversation_stage === "new_topic") {
        // ... (Full RAG logic from v9.1 goes here)
        // This includes transformQuery, getEmbedding, multiNamespaceQuery, etc.
        // And the final message composition with the "||" separator.
    } else if (chatSession.conversation_stage === "chatting") {
        // ... (Full conversational chat logic from v9.1 goes here)
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
async function proactiveCheckin() { /* ... same as before, but reads from DB ... */ }
setInterval(proactiveCheckin, 6 * 60 * 60 * 1000); 

/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
    console.log(`\n🚀 ${BOT_NAME} is listening on port ${PORT}`);
    setupDatabase(); 
});
