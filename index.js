// index.js — SarathiAI (DIRECT API MODE - BULLETPROOF)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import pg from "pg";

const { Pool } = pg;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Config / env ---------------- */
const PORT = process.env.PORT || 8080;
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const HELTAR_API_KEY = (process.env.HELTAR_API_KEY || "").trim();

/* ---------------- SYSTEM INSTRUCTIONS ---------------- */
const SARATHI_INSTRUCTION = `
You are Sarathi AI, a Vedic Psychological Guide (The Digital Charioteer).
User = "Arjuna".

GOAL: Move user from "Vishada" (Grief) to "Prasad" (Peace) using Gita wisdom.

STRICT FLOW:
1. PAUSE: Validate emotion. "Stop the chariot."
2. PERSPECTIVE: Quote Gita concept (Identity vs Ego).
3. ACTION: One small micro-task.
4. CHECK: One engaging question.

TONE: Compassionate, firm, Hinglish allowed. Keep it SHORT (max 100 words).
SAFETY: If self-harm mentioned, refer to doctor immediately.
`;

/* ---------------- Database Connection ---------------- */
const dbPool = new Pool({ 
    connectionString: DATABASE_URL, 
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

/* ---------------- Helper Functions ---------------- */
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

/* ---------------- THE BRAIN: DIRECT AXIOS CALL (No SDK) ---------------- */
async function getSarathiResponse(phone, userText, history) {
    try {
        console.log("🧠 Sarathi is thinking (Direct Mode)...");

        // 1. Construct the history payload manually
        let contents = [{
            role: "user",
            parts: [{ text: `SYSTEM_INSTRUCTION: ${SARATHI_INSTRUCTION}` }]
        }, {
            role: "model",
            parts: [{ text: "Understood. I am Sarathi. I am ready." }]
        }];

        // Add recent chat history (last 6 messages to keep it fast)
        if (Array.isArray(history)) {
            history.slice(-6).forEach(msg => {
                contents.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                });
            });
        }

        // Add current message
        contents.push({
            role: "user",
            parts: [{ text: userText }]
        });

        // 2. Direct HTTP Post to Google API
        // We use the most standard endpoint that doesn't change often
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await axios.post(url, {
            contents: contents,
            generationConfig: {
                maxOutputTokens: 150,
                temperature: 0.7
            }
        });

        // 3. Extract the answer
        const replyText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!replyText) throw new Error("Empty response from Google");

        console.log("💡 Idea generated:", replyText.substring(0, 50) + "...");
        return replyText;

    } catch (error) {
        console.error("❌ Gemini Direct Error:", error?.response?.data || error.message);
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
    console.log(`\n🚀 Sarathi AI (Direct Mode) is running on port ${PORT}`);
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
