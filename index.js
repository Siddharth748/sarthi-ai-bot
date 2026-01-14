// index.js — SarathiAI (GEMINI EDITION - FIXED SYSTEM INSTRUCTION)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import pg from "pg";
import { GoogleGenerativeAI } from "@google/generative-ai"; 

const { Pool } = pg;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Config / env ---------------- */
const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;

const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const HELTAR_API_KEY = (process.env.HELTAR_API_KEY || "").trim();

/* ---------------- Setup Google Gemini ---------------- */
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/* ---------------- Database Connection ---------------- */
const dbPool = new Pool({ 
    connectionString: DATABASE_URL, 
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

/* ---------------- THE SARATHI SYSTEM PROMPT (THE SOUL) ---------------- */
const SARATHI_SYSTEM_INSTRUCTION = `
You are Sarathi AI. You are not a generic chatbot; you are a Vedic Psychological Guide (The Digital Charioteer).
Your user is "Arjuna" (a modern human facing life's battles).

YOUR GOAL:
To move the user from "Vishada" (Confusion/Grief) to "Prasad" (Clarity/Peace) using the wisdom of the Bhagavad Gita.

YOUR CONVERSATION FLOW (STRICT):
1. THE PAUSE (Pranayama): First, validate their emotion. Tell them to breathe or step back. "Stop the chariot."
2. THE PERSPECTIVE (Gyan): Quote a relevant CONCEPT from the Gita (Chapter/Verse) that reframes their problem. Focus on Identity vs. Ego, or Duty vs. Result.
3. THE ACTION (Karma): Give ONE small, practical micro-task they can do right now.
4. THE CHECK (Question): End with ONE engaging question to keep them talking.

TONE:
- Compassionate but firm (like Krishna).
- Use "Hinglish" logic (mix of English and simple Sanskrit concepts like Dharma, Karma, Guna).
- Keep responses SHORT (under 120 words). WhatsApp users do not read essays.

SAFETY:
If the user mentions self-harm or suicide, DROP the persona immediately and tell them to seek professional medical help.
`;

/* ---------------- Helper Functions ---------------- */

function convertHistoryForGemini(dbHistory) {
    if (!Array.isArray(dbHistory)) return [];
    return dbHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    }));
}

function optimizeMessageForWhatsApp(message, maxLength = 350) {
    if (!message || message.length <= maxLength) return message;
    if (message.includes('1️⃣')) return message;

    const sentences = message.split(/[.!?।]/).filter(s => s.trim().length > 10);
    let shortened = sentences.slice(0, 3).join('. ') + '.'; 
    
    if (shortened.length > maxLength) {
        return shortened.substring(0, maxLength - 10) + '...';
    }
    return shortened;
}

async function sendViaHeltar(phone, message) {
    try {
        const optimized = optimizeMessageForWhatsApp(message);
        console.log(`📤 Sending to ${phone}:`, optimized);
        
        if (!HELTAR_API_KEY) return; 

        await axios.post("https://api.heltar.com/v1/messages/send", 
            { messages: [{ clientWaNumber: phone, message: optimized, messageType: "text" }] }, 
            { headers: { Authorization: `Bearer ${HELTAR_API_KEY}` } }
        );
    } catch (err) {
        console.error("Heltar Error:", err.message);
    }
}

async function getUserState(phone) {
    try {
        const res = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
        if (res.rows.length === 0) {
            await dbPool.query("INSERT INTO users (phone_number, chat_history) VALUES ($1, '[]')", [phone]);
            return { phone_number: phone, chat_history: [] };
        }
        return res.rows[0];
    } catch (err) {
        console.error("DB Error:", err.message);
        return { phone_number: phone, chat_history: [] }; 
    }
}

async function updateUserHistory(phone, history) {
    try {
        await dbPool.query("UPDATE users SET chat_history = $1 WHERE phone_number = $2", [JSON.stringify(history), phone]);
    } catch (e) { console.error("Update Error:", e.message); }
}

/* ---------------- THE NEW BRAIN: GEMINI LOGIC (FIXED) ---------------- */
async function getSarathiResponse(phone, userText, history) {
    try {
        console.log("🧠 Sarathi (Gemini) is thinking...");

        // 👇 FIXED: System Instruction is now an Object, not a String
        const chatSession = model.startChat({
            history: convertHistoryForGemini(history),
            systemInstruction: {
                role: "system",
                parts: [{ text: SARATHI_SYSTEM_INSTRUCTION }]
            }
        });

        const result = await chatSession.sendMessage(userText);
        const responseText = result.response.text();

        console.log("💡 Idea generated:", responseText.substring(0, 50) + "...");
        return responseText;

    } catch (error) {
        console.error("❌ Gemini Error:", error.message);
        return "Brother, the chariot wheel is stuck (Technical Error). Breathe, and try asking again in a moment. 🙏";
    }
}

/* ---------------- MAIN WEBHOOK ---------------- */
app.post("/webhook", async (req, res) => {
    res.status(200).send("OK");
    
    try {
        const body = req.body;
        const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || body.messages?.[0];
        
        if (!msg) return;

        const phone = msg.from || msg.clientWaNumber;
        const text = (msg.text?.body || msg.button?.payload || "").trim();

        if (!phone || !text) return;
        
        console.log(`📩 Message from ${phone}: ${text}`);

        const user = await getUserState(phone);
        let history = user.chat_history || [];

        const reply = await getSarathiResponse(phone, text, history);

        await sendViaHeltar(phone, reply);

        const newHistory = [...history, { role: 'user', content: text }, { role: 'assistant', content: reply }].slice(-10);
        await updateUserHistory(phone, newHistory);

    } catch (err) {
        console.error("Webhook Logic Error:", err.message);
    }
});

/* ---------------- Start Server ---------------- */
app.listen(PORT, async () => {
    console.log(`\n🚀 Sarathi AI (Gemini Edition) is running on port ${PORT}`);
    try {
        const client = await dbPool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                phone_number VARCHAR(20) PRIMARY KEY,
                chat_history JSONB DEFAULT '[]'::jsonb
            );
        `);
        client.release();
        console.log("✅ Database connected.");
    } catch (e) {
        console.log("⚠️ Database warning: Check your URL.");
    }
});
