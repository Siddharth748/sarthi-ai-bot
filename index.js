// index.js — Sarathi AI v3.0 (The "Two-Brain" Architecture)
// REFACTORED FOR STABILITY: Uses direct Axios calls (No SDKs) to prevent crashes.

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import pg from "pg";

const { Pool } = pg;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Config ---------------- */
const PORT = process.env.PORT || 8080;
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const HELTAR_API_KEY = (process.env.HELTAR_API_KEY || "").trim();

/* ---------------- Database ---------------- */
const dbPool = new Pool({ 
    connectionString: DATABASE_URL, 
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
});

/* ---------------- BRAIN 1: THE TRIAGE ROUTER ---------------- */
// This function decides WHAT the user wants before we try to help.
async function categorizeUserIntent(text, historySummary) {
    console.log("🧠 Brain 1 (Triage) is working...");
    
    const triagePrompt = `
    You are the 'Triage Brain' for an AI bot. Your ONLY job is to classify the user's latest message.
    
    CONTEXT (Previous Chat): ${historySummary}
    CURRENT MESSAGE: "${text}"
    
    Classify the CURRENT MESSAGE into exactly one of these categories:
    1. GREETING (Hi, Hello, Namaste, Kya haal, Good morning) -> Ignore previous history context.
    2. CASUAL_FLOW (I'm good, You tell me, Mast, Weather, Jokes) -> Casual chit-chat.
    3. TOPIC_CHANGE (Change topic, something else, stop this) -> Explicit request to switch.
    4. THERAPY_NEEDED (Sad, Stress, Panic, Anxiety, Help, Grief) -> Emotional distress.
    5. KNOWLEDGE_QUERY (Who is Krishna, What is Karma, Quote Gita) -> Factual question.
    
    OUTPUT FORMAT: Return ONLY the category name (e.g., "GREETING"). Do not write anything else.
    `;

    try {
        const resp = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: triagePrompt }],
            max_tokens: 10,
            temperature: 0
        }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` } });

        const intent = resp.data.choices[0].message.content.trim();
        console.log(`🎯 Triage Result: ${intent}`);
        return intent;
    } catch (e) {
        console.error("Triage Failed:", e.message);
        return "CASUAL_FLOW"; // Fallback
    }
}

/* ---------------- BRAIN 2: THE RESPONDER ---------------- */
// This function generates the actual reply based on the Triage result.
async function generateResponse(intent, text, historySummary) {
    console.log(`🧠 Brain 2 (Responder) activating for: ${intent}`);
    
    let systemPrompt = "";
    
    // DYNAMIC SYSTEM PROMPT GENERATION
    switch (intent) {
        case "GREETING":
            systemPrompt = `You are Sarathi. The user just greeted you.
            ACTION: Greet them back warmly (Namaste/Hello). 
            RULE: Do NOT give advice. Do NOT be a therapist yet. Just be welcoming.
            TONE: Warm, Friend-like.`;
            break;
            
        case "CASUAL_FLOW":
            systemPrompt = `You are Sarathi. The user is chatting casually.
            ACTION: Respond naturally to their statement.
            RULE: Do NOT say "Namaste" again. Do NOT give heavy advice unless asked.
            TONE: Relaxed, conversational.`;
            break;
            
        case "TOPIC_CHANGE":
            systemPrompt = `The user wants to change the topic.
            ACTION: Acknowledge the shift. Ask "What is on your mind now?"
            RULE: Drop all previous context/baggage.`;
            break;
            
        case "THERAPY_NEEDED":
            systemPrompt = `You are Sarathi, a Vedic Guide (Digital Charioteer).
            User is in DISTRESS.
            STRICT FLOW:
            1. PAUSE: "Stop. Breathe." (Vary this phrase).
            2. PERSPECTIVE: Brief Gita wisdom (Identity vs Ego).
            3. ACTION: Small micro-task.
            4. CHECK: One question.
            TONE: Compassionate but firm.`;
            break;
            
        case "KNOWLEDGE_QUERY":
            systemPrompt = `You are Sarathi, a Teacher.
            ACTION: Answer the question about Gita/Spirituality clearly.
            TONE: Wise, educational.`;
            break;
            
        default:
            systemPrompt = "You are a helpful assistant named Sarathi.";
    }

    try {
        const resp = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                // We only inject history if it's NOT a greeting/topic change to keep it fresh
                ...(intent === 'THERAPY_NEEDED' ? [{ role: "user", content: `CONTEXT: ${historySummary}` }] : []),
                { role: "user", content: text }
            ],
            max_tokens: 150,
            temperature: 0.7
        }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` } });

        return resp.data.choices[0].message.content.trim();
    } catch (e) {
        console.error("Responder Failed:", e.message);
        return "My mind is wandering (Technical Error). Please ask again.";
    }
}

/* ---------------- Helper Functions ---------------- */
async function sendViaHeltar(phone, message) {
    if (!HELTAR_API_KEY) return console.log(`[Simulated Send] -> ${phone}: ${message}`);
    try {
        await axios.post("https://api.heltar.com/v1/messages/send", 
            { messages: [{ clientWaNumber: phone, message: message, messageType: "text" }] }, 
            { headers: { Authorization: `Bearer ${HELTAR_API_KEY}` } }
        );
    } catch (e) { console.error("Heltar Error:", e.message); }
}

async function getUserData(phone) {
    try {
        const res = await dbPool.query("SELECT chat_history FROM users WHERE phone_number = $1", [phone]);
        if (res.rows.length === 0) {
            await dbPool.query("INSERT INTO users (phone_number, chat_history) VALUES ($1, '[]')", [phone]);
            return [];
        }
        return res.rows[0].chat_history || [];
    } catch (e) { return []; }
}

async function saveChat(phone, history, userMsg, botMsg) {
    const newHistory = [...history, { role: 'user', content: userMsg }, { role: 'assistant', content: botMsg }].slice(-6);
    try {
        await dbPool.query("UPDATE users SET chat_history = $1 WHERE phone_number = $2", [JSON.stringify(newHistory), phone]);
    } catch (e) { console.error("Save Error:", e.message); }
}

/* ---------------- Main Webhook ---------------- */
app.post("/webhook", async (req, res) => {
    res.status(200).send("OK");
    const body = req.body;
    const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || body.messages?.[0];
    if (!msg) return;

    const phone = msg.from || msg.clientWaNumber;
    const text = (msg.text?.body || msg.button?.payload || "").trim();
    if (!text) return;

    console.log(`📩 Incoming: "${text}"`);

    // 1. Load History
    const history = await getUserData(phone);
    const historySummary = history.map(m => `${m.role}: ${m.content}`).join("\n");

    // 2. Brain 1: Categorize
    const intent = await categorizeUserIntent(text, historySummary);

    // 3. Brain 2: Respond
    const reply = await generateResponse(intent, text, historySummary);

    // 4. Send & Save
    await sendViaHeltar(phone, reply);
    await saveChat(phone, history, text, reply);
});

/* ---------------- Server Init ---------------- */
app.listen(PORT, async () => {
    console.log(`🚀 Sarathi AI v3.0 (Two-Brain Arch) running on ${PORT}`);
    try {
        const client = await dbPool.connect();
        await client.query("CREATE TABLE IF NOT EXISTS users (phone_number VARCHAR(20) PRIMARY KEY, chat_history JSONB)");
        client.release();
        console.log("✅ DB Connected");
    } catch(e) { console.error("DB Init Error:", e.message); }
});
