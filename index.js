// index.js — SarathiAI (FINAL STABLE & SHORT VERSION)
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

/* ---------------- CRITICAL FIX: Validation Function ---------------- */
// This function was missing before, causing the crash.
const validateEnvVariables = () => {
    const requiredVars = { DATABASE_URL, OPENAI_KEY };
    const missingVars = Object.entries(requiredVars).filter(([, value]) => !value).map(([key]) => key);
    
    if (missingVars.length > 0) {
        console.error(`❌ Critical Error: Missing environment variables: ${missingVars.join(", ")}`);
    }
    
    if (!HELTAR_API_KEY) {
        console.warn("⚠️ HELTAR_API_KEY is missing. Messages will be printed to console only.");
    }
};

/* ---------------- Database Connection ---------------- */
const dbPool = new Pool({ 
    connectionString: DATABASE_URL, 
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

/* ---------------- Enhanced System Prompt (SHORT & DIRECT) ---------------- */
const ENHANCED_SYSTEM_PROMPT = {
  hindi: `आप सारथी AI हैं - एक वैदिक मनोवैज्ञानिक गाइड (डिजिटल सारथी)।
आपका लक्ष्य: उपयोगकर्ता को "विषाद" (दुख) से "प्रसाद" (शांति) की ओर ले जाना।

कड़े नियम (Strict Rules):
1. संक्षिप्त रहें: उत्तर अधिकतम 60-80 शब्द हो। "निबंध" न लिखें।
2. संरचना (Structure):
   - ठहराव (The Pause): पहले वाक्य में भावना को स्वीकार करें और उन्हें रुकने को कहें। (उदा: "रुकिए। लंबी सांस लें।")
   - दृष्टिकोण (Perspective): गीता का एक *छोटा* सिद्धांत (श्लोक संख्या जरूरी नहीं) जो नजरिया बदले।
   - कर्म (Action): एक बहुत छोटा, व्यावहारिक कार्य दें जो अभी किया जा सके।
   - प्रश्न (Check): अंत में केवल एक प्रश्न पूछें।
3. टोन (Tone): सहानुभूतिपूर्ण लेकिन दृढ़ (कृष्ण की तरह)। हिंग्लिश (Hinglish) का प्रयोग करें।
4. रूपक (Metaphors): कम करें। सीधी बात करें।`,

  english: `You are Sarathi AI - a Vedic Psychological Guide (The Digital Charioteer).
Your Goal: Move the user from "Vishada" (Grief) to "Prasad" (Peace).

STRICT RULES:
1. BE SHORT: Max 60-80 words. WhatsApp users do not read essays.
2. STRUCTURE:
   - THE PAUSE: First sentence MUST validate emotion and command a pause. (e.g., "Stop. Breathe.")
   - THE PERSPECTIVE: One brief Gita concept to reframe the Identity vs Ego.
   - THE ACTION: One micro-task they can do RIGHT NOW.
   - THE CHECK: End with exactly one question.
3. TONE: Compassionate but firm. Use Hinglish if appropriate.
4. METAPHORS: Limit them. Be direct and grounded.`
};

/* ---------------- Helper Functions ---------------- */

async function sendViaHeltar(phone, message) {
    try {
        const safeMessage = message.substring(0, 4000); 
        console.log(`📤 Sending to ${phone}:`, safeMessage);
        
        if (!HELTAR_API_KEY) return; 

        await axios.post("https://api.heltar.com/v1/messages/send", 
            { messages: [{ clientWaNumber: phone, message: safeMessage, messageType: "text" }] }, 
            { headers: { Authorization: `Bearer ${HELTAR_API_KEY}` } }
        );
    } catch (err) {
        console.error("Heltar Error:", err.message);
    }
}

// Global "More" button disabler - Just sends the text directly
async function sendLayeredResponse(phone, fullResponse, language) {
    await sendViaHeltar(phone, fullResponse);
}

function buildContextSummary(messages, language) {
    if (!messages || messages.length === 0) return "No previous context";
    return messages.map(m => `${m.role}: ${m.content.substring(0, 50)}...`).join('\n');
}

async function getUserState(phone) {
    try {
        const res = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
        if (res.rows.length === 0) {
            await dbPool.query(`
                INSERT INTO users (phone_number, chat_history, language_preference) 
                VALUES ($1, '[]', 'English')
            `, [phone]);
            return { phone_number: phone, chat_history: [], language_preference: 'English' };
        }
        return res.rows[0];
    } catch (err) {
        console.error("DB Error:", err.message);
        return { phone_number: phone, chat_history: [], language_preference: 'English' };
    }
}

async function updateUserState(phone, updates) {
    try {
        if (!updates) return;
        const keys = Object.keys(updates);
        const vals = keys.map(k => {
            const v = updates[k];
            return (typeof v === 'object') ? JSON.stringify(v) : v;
        });
        vals.push(phone);
        const setString = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
        await dbPool.query(`UPDATE users SET ${setString} WHERE phone_number = $${keys.length + 1}`, vals);
    } catch (e) { console.error("Update Error:", e.message); }
}

/* ---------------- AI Logic (SHORT & DIRECT) ---------------- */
async function getEnhancedAIResponse(phone, text, language, conversationContext = {}) {
  try {
    if (!OPENAI_KEY) {
      console.log("🔄 No OpenAI key, using fallback");
      return; 
    }

    console.log("🤖 Sarathi is thinking (Short & Direct)...");

    const recentHistory = conversationContext.previousMessages || [];
    const contextSummary = buildContextSummary(recentHistory, language);
    const systemPrompt = ENHANCED_SYSTEM_PROMPT[language] || ENHANCED_SYSTEM_PROMPT.english;
    
    // Simplified User Prompt to force brevity
    const userPrompt = language === "Hindi" 
      ? `उपयोगकर्ता: "${text}"
संदर्भ: ${contextSummary}
निर्देश: कृपया 4-चरणीय ढांचे (ठहराव, दृष्टिकोण, कर्म, प्रश्न) का पालन करें। उत्तर छोटा और सीधा रखें (Max 80 words).`
      : `User: "${text}"
Context: ${contextSummary}
INSTRUCTION: Follow the 4-step structure (Pause, Perspective, Action, Check). Keep it SHORT and DIRECT (Max 80 words).`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const resp = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: OPENAI_MODEL, 
      messages, 
      max_tokens: 200, 
      temperature: 0.7
    }, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      timeout: 15000
    });

    const aiResponse = resp.data?.choices?.[0]?.message?.content;
    
    if (aiResponse) {
      await sendViaHeltar(phone, aiResponse);
      
      const user = await getUserState(phone);
      const updatedHistory = [...(user.chat_history || []), 
          { role: 'user', content: text }, 
          { role: 'assistant', content: aiResponse }
      ].slice(-10);
      
      await updateUserState(phone, { 
        chat_history: updatedHistory,
        last_message: aiResponse,
        last_message_role: 'assistant'
      });
    }

  } catch (err) {
    console.error("❌ AI Error:", err.message);
  }
}

/* ---------------- Webhook Handler ---------------- */
app.post("/webhook", async (req, res) => {
    res.status(200).send("OK");
    
    try {
        const body = req.body;
        const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || body.messages?.[0];
        
        if (!msg) return;

        const phone = msg.from || msg.clientWaNumber;
        const text = (msg.text?.body || msg.button?.payload || "").trim();

        if (!phone || text.length === 0) return;
        
        console.log(`📩 Incoming from ${phone}: "${text}"`);

        const user = await getUserState(phone);
        const isHindi = /[\u0900-\u097F]/.test(text) || text.toLowerCase().includes('hindi');
        const language = (user.language_preference === 'Hindi' || isHindi) ? "Hindi" : "English";

        const context = { previousMessages: user.chat_history };
        await getEnhancedAIResponse(phone, text, language, context);

    } catch (err) {
        console.error("Webhook Logic Error:", err.message);
    }
});

/* ---------------- Start Server ---------------- */
app.listen(PORT, async () => {
    validateEnvVariables(); // 🟢 THIS IS THE CRASH FIX
    console.log(`\n🚀 Sarathi AI (Stable & Short) is running on port ${PORT}`);
    
    try {
        const client = await dbPool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                phone_number VARCHAR(20) PRIMARY KEY,
                chat_history JSONB DEFAULT '[]'::jsonb,
                language_preference VARCHAR(20) DEFAULT 'English',
                total_sessions INT DEFAULT 0,
                total_incoming INT DEFAULT 0,
                total_outgoing INT DEFAULT 0,
                last_message TEXT,
                last_message_role VARCHAR(50),
                last_activity_ts TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                user_segment VARCHAR(50)
            );
        `);
        client.release();
        console.log("✅ Database connected.");
    } catch (e) {
        console.log("⚠️ Database warning: Check your URL.");
    }
});
