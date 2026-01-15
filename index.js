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

/* ---------------- ARCHITECTURAL PROMPT: TRIAGE & RESPOND ---------------- */
const ENHANCED_SYSTEM_PROMPT = {
  hindi: `आप सारथी AI हैं। आपका काम सीधे जवाब देना नहीं, बल्कि पहले *समझना* है।

निर्देश (INSTRUCTIONS):
1. **पहचान (IDENTIFY):** यूजर के *ताज़ा संदेश* को देखें (टाइपो/इमोजी सहित)। यह क्या है?
   - **अभिवादन (Greeting):** (Hi, Hlo, Heya, Namaste, 👋).
     -> **जवाब:** केवल गर्मजोशी से स्वागत करें। ज्ञान न दें। (उदा: "नमस्ते! आज आप कैसे हैं?")
   - **विषय बदलाव (Topic Change):** (New topic, kuch aur baat, stop this).
     -> **जवाब:** तुरंत पिछला विषय छोड़ दें। पूछें: "ज़रूर। अब हम किस बारे में बात करें?"
   - **समस्या/दुख (Problem):** (Sad, Angry, Stressed, Help).
     -> **जवाब:** अब **'सारथी विधि'** (ठहराव -> दृष्टिकोण -> कर्म) का प्रयोग करें।

2. **संदर्भ नियम (CONTEXT RULE):**
   - अगर यूजर "Hello" कहे, तो इतिहास में चाहे कितना भी "पैनिक" हो, उसे इग्नोर करें। बस "Hello" का जवाब दें।

3. **स्टाइल (STYLE):**
   - छोटा उत्तर (Max 60 शब्द)।
   - हिंग्लिश (Mann, Shanti)।`,

  english: `You are Sarathi AI. Your Architecture is: **IDENTIFY -> THEN RESPOND.**

STEP 1: CLASSIFY THE CURRENT MESSAGE (Ignore History for this step):
Look at the latest input (accounting for typos like 'hlo', 'hii' or emojis).
   - **CATEGORY A: GREETING** ('Hi', 'Hello', 'Heya', 'Namaste', '👋')
     -> **ACTION:** Ignore previous trauma/panic in history. Just be a warm friend.
     -> **OUTPUT:** "Namaste! It is good to see you. How is your 'Mann' (mind) right now?"
   
   - **CATEGORY B: TOPIC CHANGE** ('Change topic', 'Something else', 'Bor')
     -> **ACTION:** Drop the previous therapy session immediately.
     -> **OUTPUT:** "Understood. Let's shift gears. What is on your mind?"

   - **CATEGORY C: PROBLEM/CONTINUATION** ('I am sad', 'Still hurting', 'Help')
     -> **ACTION:** Activate the **SARATHI FLOW**:
        1. **Pause:** "Stop. Breathe."
        2. **Perspective:** Brief Gita wisdom.
        3. **Action:** Micro-task.
        4. **Check:** Question.

STEP 2: EXECUTE:
- Keep it SHORT (Max 60 words).
- Use Hinglish naturally.`
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

async function getEnhancedAIResponse(phone, text, language, conversationContext = {}) {
  try {
    if (!OPENAI_KEY) {
      console.log("🔄 No OpenAI key, using fallback");
      return; 
    }

    console.log("🤖 Sarathi is analyzing intent...");

    const recentHistory = conversationContext.previousMessages || [];
    const contextSummary = buildContextSummary(recentHistory, language);
    const systemPrompt = ENHANCED_SYSTEM_PROMPT[language] || ENHANCED_SYSTEM_PROMPT.english;
    
    // ARCHITECTURAL CHANGE: Clearly separate History from Current Input
    const userPrompt = language === "Hindi" 
      ? `📜 **चैट इतिहास (संदर्भ):** ${contextSummary}

📍 **वर्तमान संदेश (अभी आया):** "${text}"

🤖 **निर्देश:** ऊपर दिए गए 'पहचान' नियमों का पालन करें। अगर 'वर्तमान संदेश' केवल एक 'अभिवादन' (Greeting) है, तो इतिहास के तनाव को नजरअंदाज करें और सामान्य बात करें।`
      : `📜 **CHAT HISTORY (Context):** ${contextSummary}

📍 **CURRENT MESSAGE (Just now):** "${text}"

🤖 **INSTRUCTION:** Apply the CLASSIFICATION rules from the System Prompt. 
- If 'CURRENT MESSAGE' is a Greeting/Small Talk -> Ignore the History's emotional weight. Just greet.
- If 'CURRENT MESSAGE' is a Problem -> Use the Sarathi Flow.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const resp = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: OPENAI_MODEL, 
      messages, 
      max_tokens: 150, // Strict limit for brevity
      temperature: 0.6 // Slightly lower to force adherence to rules
    }, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      timeout: 15000
    });

    const aiResponse = resp.data?.choices?.[0]?.message?.content;
    
    if (aiResponse) {
      await sendViaHeltar(phone, aiResponse);
      
      const user = await getUserState(phone);
      // We still save everything to history for the next turn
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
