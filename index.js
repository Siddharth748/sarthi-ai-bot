// index.js — SarathiAI (Heltar Integration)
// This file is a complete rewrite to handle Heltar's webhook payload and API calls.

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

const DATABASE_URL = process.env.DATABASE_URL || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

const PINECONE_HOST = process.env.PINECONE_HOST || "";
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || "verse";
const PINECONE_NAMESPACES = process.env.PINECONE_NAMESPACES || "";

const TRAIN_SECRET = process.env.TRAIN_SECRET || null;

/* Heltar Config */
const HELTAR_API_KEY = process.env.HELTAR_API_KEY;
const HELTAR_PHONE_ID = process.env.HELTAR_PHONE_ID;
const HELTAR_WEBHOOK_URL = process.env.HELTAR_WEBHOOK_URL;

/* ---------------- Database ---------------- */
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
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS messages_since_verse INT DEFAULT 0;`);
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
    const user = result.rows[0];
    user.chat_history = user.chat_history || [];
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

/* ---------------- Heltar send ---------------- */
async function sendViaHeltar(phone, message) {
    try {
        if (!HELTAR_API_KEY || !HELTAR_PHONE_ID) {
            console.warn(`(Simulated -> ${phone}): ${message}`);
            return;
        }

        const resp = await axios.post(
            "https://api.heltar.com/v1/messages",
            { 
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: phone,
                type: "text",
                text: { body: message }
            },
            { headers: { Authorization: `Bearer ${HELTAR_API_KEY}`, "Content-Type": "application/json" } }
        );

        console.log(`✅ Heltar message sent to ${phone}`);
        return resp.data;
    } catch (err) {
        console.error("❌ Heltar send error:", err.response?.data || err.message);
        fs.appendFileSync('heltar-error.log', `${new Date().toISOString()} | ${phone} | Send Failed | ${JSON.stringify(err.response?.data || err.message)}\n`);
        throw err;
    }
}

/* ---------------- OpenAI Helpers ---------------- */
async function openaiChat(messages, maxTokens = 400) {
    if (!OPENAI_KEY) return null;
    const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.7 };
    const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 25000 });
    return resp.data?.choices?.[0]?.message?.content;
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
            console.warn("⚠ Pinecone query failed for namespace", n, e?.message || e);
            return [];
        }
    });
    const arr = await Promise.all(promises);
    const allMatches = arr.flat();
    allMatches.sort((a,b) => (b.score || 0) - (a.score || 0));
    return allMatches;
}

/* ---------------- Webhook ---------------- */
app.post("/webhook", async (req, res) => {
    try {
        res.status(200).send("OK"); // Respond immediately with 200 OK

        const body = req.body;
        console.log("📥 Incoming Heltar Webhook Payload:", JSON.stringify(body, null, 2));

        const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        const phone = msg?.from;
        const text = msg?.text?.body;

        if (!phone || !text) {
            console.warn("⚠️ Webhook payload did not contain a valid phone number or text message. Ignoring.");
            return;
        }

        console.log(`✅ Message received from ${phone}: "${text}"`);
        
        const userState = await getUserState(phone);
        await updateUserState(phone, { last_activity_ts: 'NOW()' });

        // Chat history
        let chatHistory = userState.chat_history || [];
        chatHistory.push({ role: 'user', content: text });
        if (chatHistory.length > 8) chatHistory = chatHistory.slice(-8);

        // Greeting
        const lower = text.trim().toLowerCase();
        if (["hi","hii","hello","hey","namaste","hare krishna"].includes(lower)) {
            await sendViaHeltar(phone, `Hare Krishna 🙏\nI am Sarathi, your companion on this journey.\nHow can I help you today?`);
            await updateUserState(phone, { conversation_stage: 'new_topic', chat_history: '[]' });
            return;
        }

        // AI response using Pinecone + OpenAI
        const qVec = await getEmbedding(text);
        const matches = await multiNamespaceQuery(qVec);
        const verseMatch = matches.find(m => m.metadata?.sanskrit);
        let reply = "I am here to listen.";

        if (verseMatch && (verseMatch.score || 0) > 0.25) {
            const verseSanskrit = verseMatch.metadata.sanskrit || "";
            const verseHinglish = verseMatch.metadata.hinglish1 || "";
            reply = `Sanskrit: ${verseSanskrit}\nHinglish: ${verseHinglish}\nShri Krishna kehte hain: Follow the essence of this verse in daily life.`;
        }

        await sendViaHeltar(phone, reply);
        chatHistory.push({ role: 'assistant', content: reply });
        await updateUserState(phone, { chat_history: chatHistory, conversation_stage: 'chatting' });

    } catch (err) {
        console.error("❌ Webhook processing error:", err.message);
        fs.appendFileSync('heltar-error.log', `${new Date().toISOString()} | Webhook Error | ${err.message}\n`);
    }
});

/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
    console.log(`\n🚀 ${BOT_NAME} is listening on port ${PORT}`);
    setupDatabase();
});
