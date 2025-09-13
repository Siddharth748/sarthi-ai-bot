// index.js — SarathiAI (Heltar Integration & Full Logic)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
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

const TRAIN_SECRET = process.env.TRAIN_SECRET || null;

/* Heltar Config */
const HELTAR_API_KEY = process.env.HELTAR_API_KEY;
const HELTAR_PHONE_ID = process.env.HELTAR_PHONE_ID;
const HELTAR_WEBHOOK_URL = process.env.HELTAR_WEBHOOK_URL;

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
        if (!HELTAR_API_KEY) {
            console.warn(`(Simulated -> ${phone}): ${message}`);
            return;
        }
        
        const resp = await axios.post(
            `https://api.heltar.com/v1/messages/send`,
            { 
                messages: [{
                    clientWaNumber: phone,
                    message: message,
                    messageType: "text"
                }]
            },
            { 
                headers: { 
                    Authorization: `Bearer ${HELTAR_API_KEY}`,
                    "Content-Type": "application/json"
                } 
            }
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
    console.log(`ℹ️ Transformed Query: "${userQuery}" -> "${transformed}"`);
    return transformed;
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
    if (PINECONE_NAMESPACES) {
        return PINECONE_NAMESPACES.split(",").map(s => s.trim()).filter(Boolean);
    }
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

/* ---------------- Payload Extraction & Small Talk Logic ---------------- */
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

/* ---------------- State-Aware AI Prompts ---------------- */
const RAG_SYSTEM_PROMPT = `You are SarathiAI. A user is starting a new conversation. You have a relevant Gita verse as context. Your task is to introduce this verse and its core teaching.\n- Your entire response MUST use "||" as a separator for each message bubble.\n- Part 1: The Sanskrit verse.\n- Part 2: The Hinglish translation.\n- Part 3: Start with "Shri Krishna kehte hain:", a one-sentence essence, then a 2-3 sentence explanation.\n- Part 4: A simple follow-up question.\n- **Strictly and exclusively reply in {{LANGUAGE}}.**`;
const CHAT_SYSTEM_PROMPT = `You are SarathiAI, a compassionate Gita guide, in the middle of a conversation. The user's chat history is provided.\n- Listen, be empathetic, and continue the conversation naturally.\n- Offer wisdom based on Gita's principles in YOUR OWN WORDS. Do NOT quote new verses.\n- Keep replies very short (1-3 sentences).\n- **Crucially, if the user expresses a clear emotional need (like "I am sad," "I'm feeling angry," "I'm so confused"), you MUST end your response with the special token [NEW_TOPIC] to trigger a new teaching.**\n- **Strictly and exclusively reply in {{LANGUAGE}}.**`;

/* ---------------- Other Small Helpers ---------------- */
function safeText(md, key) {
    return (md && md[key] && String(md[key]).trim()) || "";
}

/* ---------------- Main RAG Function ---------------- */
async function getRAGResponse(phone, text, language, chatHistory) {
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
                await sendViaHeltar(phone, part);
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
        return { assistantResponse: aiResponse.replace(/\|\|/g, '\n'), stage: 'chatting', topic: text };
    }
    return { assistantResponse: "I am here to listen.", stage: 'chatting', topic: text };
}

/* ---------------- Webhook - The Final State Machine ---------------- */
app.post("/webhook", async (req, res) => {
    try {
        res.status(200).send("OK");

        const body = req.body;
        const entry = body?.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const messages = value?.messages;

        if (!messages) {
            console.log("⚠️ Ignoring webhook payload as it does not contain a new user message.");
            return;
        }

        const msg = messages?.[0];
        const phone = msg?.from;
        const text = msg?.text?.body;

        if (!phone || !text) {
            console.warn("⚠️ Webhook payload did not contain a valid phone number or text message. Ignoring.");
            return;
        }

        const userState = await getUserState(phone);
        await updateUserState(phone, { last_activity_ts: 'NOW()' });

        let chatHistory = userState.chat_history || [];
        chatHistory.push({ role: 'user', content: text });
        if (chatHistory.length > 8) chatHistory = chatHistory.slice(-8);

        const incoming = String(text).trim();

        if (isGreeting(incoming)) {
            await sendViaHeltar(phone, `Hare Krishna 🙏\n\nI am Sarathi, your companion on this journey.\nHow can I help you today?`);
            await updateUserState(phone, { conversation_stage: 'new_topic', chat_history: '[]' });
            return;
        }

        const language = await detectLanguage(text);
        let currentStage = userState.conversation_stage;

        if (isSmallTalk(incoming)) {
            const smallTalkReply = `Hare Krishna 🙏 I am here to listen and offer guidance from the Gita. How can I help you today?`;
            await sendViaHeltar(phone, smallTalkReply);
            chatHistory.push({ role: 'assistant', content: smallTalkReply });
            await updateUserState(phone, { chat_history: chatHistory });
            return;
        }

        if (currentStage === "chatting") {
            const chatPromptWithLang = CHAT_SYSTEM_PROMPT.replace('{{LANGUAGE}}', language);
            const aiChatResponse = await openaiChat([
                { role: "system", content: chatPromptWithLang },
                ...chatHistory
            ]);
            
            if (aiChatResponse && aiChatResponse.includes("[NEW_TOPIC]")) {
                const cleanResponse = aiChatResponse.replace("[NEW_TOPIC]", "").trim();
                if (cleanResponse) await sendViaHeltar(phone, cleanResponse);
                currentStage = "new_topic";
            } else if (aiChatResponse) {
                await sendViaHeltar(phone, aiChatResponse);
                chatHistory.push({ role: 'assistant', content: aiChatResponse });
                await updateUserState(phone, { chat_history: chatHistory });
                return;
            }
        }

        if (currentStage === "new_topic") {
            const ragResult = await getRAGResponse(phone, text, language, chatHistory);
            chatHistory.push({ role: 'assistant', content: ragResult.assistantResponse });
            await updateUserState(phone, { last_topic_summary: ragResult.topic, conversation_stage: 'chatting', chat_history: chatHistory });
        }
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
