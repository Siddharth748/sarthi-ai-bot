// index.js — SarathiAI (WEBHOOK FIX v7)
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
const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;

const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

const HELTAR_API_KEY = (process.env.HELTAR_API_KEY || "").trim();
const HELTAR_PHONE_ID = (process.env.HELTAR_PHONE_ID || "").trim();

/* ---------------- Database Pool ---------------- */
const dbPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

/* ---------------- Response Cache ---------------- */
const responseCache = new Map();

/* =============== SIMPLE TEMPLATE RESPONSES =============== */
const TEMPLATE_RESPONSES = {
    'practice': {
        english: `🕉️ *2-Minute Practice: Focus on Action*

Let's practice Gita's wisdom together:

1. *Identify*: What's one small action you can take today?
2. *Release*: Say "I offer the results to Krishna" 
3. *Act*: Do it with full focus for 2 minutes

What specific action will you focus on for 2 minutes today?`,

        hindi: `🕉️ *2-मिनट का अभ्यास: कर्म पर ध्यान*

आइए गीता का ज्ञान साथ में अभ्यास करें:

1. *पहचानें*: आज आप एक छोटा सा क्या कार्य कर सकते हैं?
2. *छोड़ें*: कहें "मैं परिणाम कृष्ण को समर्पित करता हूँ"
3. *कार्य करें*: 2 मिनट पूरे ध्यान से करें

आज 2 मिनट के लिए आप कौन सा विशेष कार्य करेंगे?`
    }
};

/* ---------------- SIMPLE LANGUAGE DETECTION ---------------- */
function detectLanguage(text) {
    if (!text) return "English";
    
    // Hindi script detection
    if (/[\u0900-\u097F]/.test(text)) {
        return "Hindi";
    }
    
    // Romanized Hindi patterns
    const lowerText = text.toLowerCase();
    const hindiPatterns = [
        /\b(mujhe|mereko|mera|meri|mere|tujhe|tera|teri|tere|apka|apki|apke|hain|hai|ho|hun)\b/,
        /\b(kaise|kya|kyu|kaun|kahan|kab|kitna|karna|karte|karo|kare|kar)\b/,
        /\b(main|hum|tum|aap|woh|unka|uska|hamara|tumhara|apna)\b/
    ];
    
    if (hindiPatterns.some(pattern => pattern.test(lowerText))) {
        return "Hindi";
    }
    
    return "English";
}

/* ---------------- SIMPLE AI PROMPT ---------------- */
const SYSTEM_PROMPT = {
  hindi: `आप सारथी AI हैं - एक गीता मार्गदर्शक। स्वाभाविक, संवेदनशील बातचीत करें। हर जवाब में गीता शिक्षा और एक प्रैक्टिकल सलाह दें। कभी "Want to know more?" न पूछें।`,

  english: `You are Sarathi AI - a Gita guide. Have natural, empathetic conversations. Include Gita wisdom and practical advice in every response. NEVER ask "Want to know more?"`
};

/* ---------------- SIMPLE DATABASE ---------------- */
async function setupDatabase() {
    try {
        const client = await dbPool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                phone_number VARCHAR(20) PRIMARY KEY,
                language VARCHAR(10) DEFAULT 'English',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        client.release();
        console.log("✅ Database ready");
    } catch (err) {
        console.error("Database setup error:", err.message);
    }
}

async function getUser(phone) {
    try {
        const res = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
        if (res.rows.length === 0) {
            await dbPool.query("INSERT INTO users (phone_number) VALUES ($1)", [phone]);
            return { phone_number: phone, language: "English" };
        }
        return res.rows[0];
    } catch (err) {
        return { phone_number: phone, language: "English" };
    }
}

/* ---------------- MESSAGE SENDING ---------------- */
async function sendMessage(phone, message) {
    try {
        console.log(`📤 SENDING to ${phone}: ${message.substring(0, 100)}...`);
        
        if (!HELTAR_API_KEY) {
            console.log(`💬 SIMULATED to ${phone}: ${message}`);
            return { simulated: true };
        }

        const payload = { 
            messages: [{ 
                clientWaNumber: phone, 
                message: message, 
                messageType: "text" 
            }] 
        };
        
        const response = await axios.post("https://api.heltar.com/v1/messages/send", payload, {
            headers: {
                Authorization: `Bearer ${HELTAR_API_KEY}`,
                "Content-Type": "application/json"
            },
            timeout: 10000
        });

        console.log(`✅ Message sent successfully to ${phone}`);
        return response.data;
    } catch (err) {
        console.error("❌ Send error:", err.response?.data || err.message);
        return null;
    }
}

/* ---------------- SIMPLE MESSAGE PARSING ---------------- */
function parseMessage(body) {
    console.log("🔍 RAW WEBHOOK BODY:", JSON.stringify(body));
    
    // Try Heltar format first
    if (body?.messages?.[0]) {
        const msg = body.messages[0];
        return {
            phone: msg.clientWaNumber,
            text: msg.message?.text || ""
        };
    }
    
    // Try Meta format
    if (body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const msg = body.entry[0].changes[0].value.messages[0];
        return {
            phone: msg.from,
            text: msg.text?.body || ""
        };
    }
    
    // Try simple format
    if (body?.from && body?.text) {
        return {
            phone: body.from,
            text: body.text
        };
    }
    
    console.log("❓ UNKNOWN WEBHOOK FORMAT");
    return null;
}

/* ---------------- SIMPLE AI RESPONSE ---------------- */
async function getAIResponse(phone, text, language) {
    if (!OPENAI_KEY) {
        const fallback = language === "Hindi" 
            ? "नमस्ते! मैं सारथी AI हूँ। आप कैसे हैं? 🙏"
            : "Hello! I'm Sarathi AI. How are you? 🙏";
        await sendMessage(phone, fallback);
        return;
    }

    try {
        const prompt = SYSTEM_PROMPT[language] || SYSTEM_PROMPT.english;
        
        const response = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: OPENAI_MODEL,
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: text }
            ],
            max_tokens: 300,
            temperature: 0.7
        }, {
            headers: { 
                Authorization: `Bearer ${OPENAI_KEY}`, 
                "Content-Type": "application/json" 
            },
            timeout: 15000
        });

        let aiResponse = response.data?.choices?.[0]?.message?.content;
        
        if (aiResponse) {
            // Remove unwanted phrases
            aiResponse = aiResponse
                .replace(/Want to know more\?.*$/i, '')
                .replace(/क्या और जानना चाहेंगे\?.*$/i, '')
                .trim();
                
            await sendMessage(phone, aiResponse);
        } else {
            throw new Error("Empty response");
        }
        
    } catch (error) {
        console.error("AI error:", error.message);
        const fallback = language === "Hindi" 
            ? "क्षमा करें, तकनीकी समस्या आई है। कृपया थोड़ी देर बाद पुनः प्रयास करें। 🙏"
            : "Sorry, technical issue. Please try again in a moment. 🙏";
        await sendMessage(phone, fallback);
    }
}

/* ---------------- MAIN WEBHOOK - FIXED & SIMPLIFIED ---------------- */
app.post("/webhook", async (req, res) => {
    console.log("🎯 WEBHOOK RECEIVED - PROCESSING...");
    
    try {
        // IMMEDIATE response to WhatsApp
        res.status(200).json({ status: "received" });
        
        const body = req.body;
        if (!body) {
            console.log("❌ Empty webhook body");
            return;
        }

        const messageData = parseMessage(body);
        if (!messageData || !messageData.phone || !messageData.text) {
            console.log("❌ Invalid message data");
            return;
        }

        const { phone, text } = messageData;
        console.log(`📩 PROCESSING: ${phone} -> "${text}"`);

        // Get user and detect language
        const user = await getUser(phone);
        const language = detectLanguage(text);
        
        // Update language if changed
        if (user.language !== language) {
            await dbPool.query("UPDATE users SET language = $1 WHERE phone_number = $2", [language, phone]);
        }

        // Handle template buttons
        if (text.toLowerCase().trim() === 'practice') {
            const response = TEMPLATE_RESPONSES.practice[language] || TEMPLATE_RESPONSES.practice.english;
            await sendMessage(phone, response);
            return;
        }

        // Handle greetings
        const cleanText = text.toLowerCase().trim();
        if (['hi', 'hello', 'hey', 'namaste', 'start'].includes(cleanText)) {
            const welcome = language === "Hindi" 
                ? `🚩 *सारथी AI में आपका स्वागत है!* 🚩

मैं आपका गीता साथी हूँ। आप कैसा महसूस कर रहे हैं या किस चुनौती का सामना कर रहे हैं? 🙏`
                : `🚩 *Welcome to Sarathi AI!* 🚩

I'm your Gita companion. How are you feeling or what challenge are you facing? 🙏`;
            
            await sendMessage(phone, welcome);
            return;
        }

        // Use AI for everything else
        await getAIResponse(phone, text, language);

    } catch (err) {
        console.error("💥 WEBHOOK ERROR:", err.message);
    }
});

/* ---------------- HEALTH CHECK ---------------- */
app.get("/health", (req, res) => {
    res.json({ 
        status: "active", 
        bot: BOT_NAME,
        timestamp: new Date().toISOString(),
        webhook_active: true,
        message: "Webhook is ready to receive messages"
    });
});

/* ---------------- WEBHOOK VERIFICATION (for Meta) ---------------- */
app.get("/webhook", (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log(`🔐 Webhook verification attempt: mode=${mode}, token=${token}`);
    
    if (mode === 'subscribe') {
        res.status(200).send(challenge);
        console.log("✅ Webhook verified successfully");
    } else {
        res.sendStatus(403);
    }
});

/* ---------------- START SERVER ---------------- */
app.listen(PORT, () => {
    console.log(`\n🚀 ${BOT_NAME} WEBHOOK FIX v7 running on port ${PORT}`);
    console.log("✅ Webhook endpoints:");
    console.log("   POST /webhook - for receiving messages");
    console.log("   GET  /webhook - for verification");
    console.log("   GET  /health  - for health checks");
    console.log("\n📱 Ready to receive WhatsApp messages!");
    setupDatabase();
});

// Remove cache stats spam
console.log("🔕 Cache stats spam removed - clean logs");
