// index.js — SarathiAI (Production Ready: Enhanced Intents + Menu + Memory + Robust DB)
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

const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();

const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim();
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const PINECONE_NAMESPACE = (process.env.PINECONE_NAMESPACE || "verse").trim();
const PINECONE_NAMESPACES = (process.env.PINECONE_NAMESPACES || "").trim();

const HELTAR_API_KEY = (process.env.HELTAR_API_KEY || "").trim();
const HELTAR_PHONE_ID = (process.env.HELTAR_PHONE_ID || "").trim();

const MAX_OUTGOING_MESSAGES = parseInt(process.env.MAX_OUTGOING_MESSAGES || "3", 10) || 3;
const MAX_REPLY_LENGTH = parseInt(process.env.MAX_REPLY_LENGTH || "420", 10) || 420;

const dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

/* ---------------- Database Setup ---------------- */
async function setupDatabase() {
  try {
    const client = await dbPool.connect();
    
    // Check if we need to alter users table (robust migration)
    const checkUsersTable = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'memory_data'
    `);
    
    if (checkUsersTable.rows.length === 0) {
      // Add missing columns to an existing users table
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS subscribed_daily BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS chat_history JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS conversation_stage VARCHAR(50) DEFAULT 'new_topic',
        ADD COLUMN IF NOT EXISTS last_topic_summary TEXT,
        ADD COLUMN IF NOT EXISTS messages_since_verse INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS first_seen_date DATE,
        ADD COLUMN IF NOT EXISTS last_seen_date DATE,
        ADD COLUMN IF NOT EXISTS total_sessions INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_incoming INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_outgoing INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_message TEXT,
        ADD COLUMN IF NOT EXISTS last_message_role VARCHAR(20),
        ADD COLUMN IF NOT EXISTS last_response_type VARCHAR(20),
        ADD COLUMN IF NOT EXISTS current_lesson INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS language_preference VARCHAR(10) DEFAULT 'English',
        ADD COLUMN IF NOT EXISTS memory_data JSONB DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS last_menu_choice VARCHAR(5),
        ADD COLUMN IF NOT EXISTS last_menu_date DATE,
        ADD COLUMN IF NOT EXISTS primary_use_case VARCHAR(20),
        ADD COLUMN IF NOT EXISTS user_segment VARCHAR(20) DEFAULT 'new',
        ADD COLUMN IF NOT EXISTS last_activity_ts TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      `);
      console.log("✅ Added new columns to existing users table.");
    }

    // Ensure lessons table exists (for future use or compatibility)
    await client.query(`
      CREATE TABLE IF NOT EXISTS lessons (
        lesson_number INT PRIMARY KEY,
        verse TEXT,
        translation TEXT,
        commentary TEXT,
        reflection_question TEXT
      );
    `);

    client.release();
    console.log("✅ Database setup complete.");
  } catch (err) {
    console.error("❌ Database setup error:", err?.message || err);
  }
}

/* ---------------- Helpers ---------------- */
function parseChatHistory(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

async function getUserState(phone) {
  try {
    const res = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
    if (res.rows.length === 0) {
      // Create a new user with all required fields for robust operation
      await dbPool.query(`
        INSERT INTO users (
          phone_number, first_seen_date, last_seen_date, total_sessions, 
          language_preference, last_activity_ts, memory_data, chat_history,
          conversation_stage
        ) VALUES ($1, CURRENT_DATE, CURRENT_DATE, 1, 'English', CURRENT_TIMESTAMP, '{}', '[]', 'new_topic')
      `, [phone]);
      
      const newRes = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
      const u = newRes.rows[0];
      u.chat_history = parseChatHistory(u.chat_history || '[]');
      u.memory_data = u.memory_data || {};
      return u;
    }
    
    // For existing users, ensure critical fields are not null to prevent crashes
    const user = res.rows[0];
    user.chat_history = parseChatHistory(user.chat_history || '[]');
    user.memory_data = user.memory_data || {};
    user.conversation_stage = user.conversation_stage || 'new_topic';
    user.language_preference = user.language_preference || 'English';
    user.last_activity_ts = user.last_activity_ts || new Date().toISOString();
    
    return user;
  } catch (err) {
    console.error("getUserState failed:", err);
    // Return a safe default object in case of error
    return { 
      phone_number: phone, 
      chat_history: [], 
      memory_data: {}, 
      conversation_stage: "new_topic",
      language_preference: "English"
    };
  }
}

async function updateUserState(phone, updates) {
  try {
    if (!updates || Object.keys(updates).length === 0) return;
    const keys = Object.keys(updates);
    const vals = keys.map(k => {
      const v = updates[k];
      if (Array.isArray(v) || (typeof v === "object" && v !== null)) return JSON.stringify(v);
      return v;
    });
    vals.push(phone);
    const clauses = keys.map((k, i) => `${k} = $${i + 1}`);
    const sql = `UPDATE users SET ${clauses.join(", ")} WHERE phone_number = $${keys.length + 1}`;
    await dbPool.query(sql, vals);
  } catch (err) {
    console.error("updateUserState failed:", err);
  }
}

/* ---------------- Analytics ---------------- */
async function trackIncoming(phone, text) {
  try {
    const user = await getUserState(phone);
    const now = new Date();
    let addSession = false;
    if (user.last_activity_ts) {
      const last = new Date(user.last_activity_ts);
      const diffHours = (now - last) / (1000 * 60 * 60);
      if (diffHours > 12) addSession = true;
    } else {
      addSession = true;
    }

    const updates = {
      last_activity_ts: now.toISOString(),
      last_seen_date: now.toISOString().slice(0, 10),
      last_message: text,
      last_message_role: "user",
      total_incoming: (user.total_incoming || 0) + 1
    };
    if (!user.first_seen_date) updates.first_seen_date = now.toISOString().slice(0, 10);
    if (addSession) updates.total_sessions = (user.total_sessions || 0) + 1;

    await updateUserState(phone, updates);
  } catch (err) {
    console.error("trackIncoming failed:", err);
  }
}

async function trackOutgoing(phone, reply, type = "chat") {
  try {
    const user = await getUserState(phone);
    const updates = {
      last_activity_ts: new Date().toISOString(),
      last_message: reply,
      last_message_role: "assistant",
      last_response_type: type,
      total_outgoing: (user.total_outgoing || 0) + 1
    };
    await updateUserState(phone, updates);
  } catch (err) {
    console.error("trackOutgoing failed:", err);
  }
}

/* ---------------- Heltar sending ---------------- */
async function sendViaHeltar(phone, message, type = "chat") {
  try {
    const safeMessage = String(message || "").trim().slice(0, 4096);
    if (!safeMessage) return;
    if (!HELTAR_API_KEY) {
      console.warn(`(Simulated -> ${phone}): ${safeMessage}`);
      await trackOutgoing(phone, safeMessage, type);
      return { simulated: true, message: safeMessage };
    }

    const payload = { messages: [{ clientWaNumber: phone, message: safeMessage, messageType: "text" }] };
    const resp = await axios.post("https://api.heltar.com/v1/messages/send", payload, {
      headers: {
        Authorization: `Bearer ${HELTAR_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 20000
    });

    await trackOutgoing(phone, safeMessage, type);
    return resp.data;
  } catch (err) {
    console.error("Heltar send error:", err?.response?.data || err?.message || err);
    return null;
  }
}

/* ========== ENHANCED INTENT CLASSIFICATION SYSTEM ========== */
function isGreetingQuery(text) {
    const lowerText = text.toLowerCase();
    const greetingRegex = /\b(hi|hello|hey|hii|hiya|yo|good morning|good afternoon|good evening|how are you|what's up|how's it going|kaise ho|kaise hain aap|namaste|hare krishna|hola|sup)\b/i;
    return greetingRegex.test(lowerText);
}

function isCapabilitiesQuery(text) {
    const lowerText = text.toLowerCase();
    const capabilitiesRegex = /\b(what can you do|what are your capabilities|tell me about yourself|who are you|can i get more info|give me info|what do you do|more info|info about|introduce yourself|what is this|how does this work)\b/i;
    
    return capabilitiesRegex.test(lowerText) || 
           lowerText.includes("more info") || 
           lowerText.includes("what is this") ||
           lowerText.includes("introduce yourself") ||
           lowerText.includes("can i get more info");
}

function isEmotionalExpression(text) {
    const lowerText = text.toLowerCase();
    const emotionalPatterns = [
        // Stress/Anxiety
        /\b(stress|stressed|stressing|anxious|anxiety|tension|overwhelmed|pressure|worried|worrying)\b/i,
        /\b(परेशान|तनाव|चिंता|घबराहट|दबाव|उलझन)\b/,
        // Sadness/Depression
        /\b(sad|sadness|depressed|depression|unhappy|miserable|hopeless|down|low|sorrow)\b/i,
        /\b(दुखी|उदास|निराश|हताश|दुख|उदासी)\b/,
        // Life problems (nuanced detection)
        /\b(my life|married life|relationship|husband|wife|family|job|work|career).*(problem|issue|difficult|hard|trouble|disturb|bad)\b/i,
        /\b(जीवन|शादी|रिश्ता|पति|पत्नी|परिवार|नौकरी|काम).*(समस्या|परेशानी|मुश्किल|बुरा|खराब)\b/,
        // General distress
        /\b(not good|not well|feeling bad|going through|facing problem|having issue)\b/i,
        /\b(अच्छा नहीं|ठीक नहीं|बुरा लग|मुश्किल हो|परेशानी हो)\b/,
        // Confusion/Uncertainty
        /\b(confused|lost|uncertain|don't know|what to do|which way|कंफ्यूज|उलझन|पता नहीं|क्या करूं)\b/i
    ];
    return emotionalPatterns.some(pattern => pattern.test(lowerText));
}

function isFactualQuery(text) {
    const lowerText = text.toLowerCase();
    const factualPatterns = [
        /\b(what is|who is|how old|when was|where was|explain|meaning of|verse about|chapter|shlok|अर्थ|श्लोक|अध्याय|कितने साल|कौन था|क्या है)\b/i,
        /\b(arjuna|krishna|radha|gita|bhagavad|mahabharat|pandava|kaurava|अर्जुन|कृष्ण|राधा|गीता|महाभारत)\b/i
    ];
    return factualPatterns.some(pattern => pattern.test(lowerText));
}

function isSmallTalk(text) {
    const lowerText = text.toLowerCase();
    const smallTalkPatterns = [
        /\b(thanks|thank you|ok|okay|good|nice|cool|great|awesome|fine|good job|well done|शुक्रिया|धन्यवाद|ठीक|अच्छा|बढ़िया)\b/i,
        /\b(bye|goodbye|see you|talk later|stop|end|बाय|अलविदा|फिर मिलेंगे|रुकिए)\b/i,
        /\b(haha|hehe|lol|hihi|😂|😊|🙏|❤️|✨)\b/i
    ];
    return smallTalkPatterns.some(pattern => pattern.test(lowerText));
}

function detectEmotionAdvanced(text, chatHistory = []) {
    const lowerText = text.toLowerCase();
    let emotion = null;
    let confidence = 0;

    const emotionKeywords = {
        stressed: { keywords: ['stress', 'stressed', 'tension', 'pressure', 'overwhelmed', 'worried', 'anxious', 'परेशान', 'तनाव', 'चिंता'], weight: 1.0 },
        sadness: { keywords: ['sad', 'depressed', 'unhappy', 'hopeless', 'sorrow', 'crying', 'tears', 'दुखी', 'उदास', 'निराश'], weight: 1.0 },
        anger: { keywords: ['angry', 'frustrated', 'irritated', 'annoyed', 'mad', 'hate', 'गुस्सा', 'नाराज', 'क्रोध'], weight: 0.9 },
        confusion: { keywords: ['confused', 'lost', 'uncertain', 'doubt', 'unsure', 'what to do', 'कंफ्यूज', 'उलझन', 'असमंजस'], weight: 0.8 },
        fear: { keywords: ['scared', 'afraid', 'fear', 'nervous', 'anxious', 'worry', 'डर', 'भय', 'घबराहट'], weight: 0.9 }
    };

    const lifeSituationPatterns = [
        { pattern: /\b(married life|relationship|husband|wife).*(problem|issue|difficult|disturb|bad)\b/i, emotion: 'stressed', weight: 1.5 },
        { pattern: /\b(job|work|career|office).*(problem|issue|stress|pressure|difficult)\b/i, emotion: 'stressed', weight: 1.3 },
        { pattern: /\b(family|parents|children|kids).*(problem|issue|tension|worry)\b/i, emotion: 'stressed', weight: 1.3 },
        { pattern: /\b(शादी|रिश्ता|पति|पत्नी).*(समस्या|परेशानी|मुश्किल|खराब)\b/, emotion: 'stressed', weight: 1.5 },
        { pattern: /\b(नौकरी|काम|ऑफिस).*(समस्या|तनाव|दबाव|मुश्किल)\b/, emotion: 'stressed', weight: 1.3 }
    ];

    for (const situation of lifeSituationPatterns) {
        if (situation.pattern.test(lowerText)) {
            emotion = situation.emotion;
            confidence = situation.weight;
            break;
        }
    }

    if (!emotion) {
        for (const [emotionType, data] of Object.entries(emotionKeywords)) {
            for (const keyword of data.keywords) {
                if (lowerText.includes(keyword)) {
                    if (data.weight > confidence) {
                        emotion = emotionType;
                        confidence = data.weight;
                    }
                    break;
                }
            }
        }
    }

    return confidence > 0.5 ? { emotion, confidence } : null;
}

/* ========== ENHANCED STARTUP MENU SYSTEM ========== */
async function handleEnhancedStartupMenu(phone, language, user) {
    const menuMessage = language === "Hindi" 
        ? `🚩 *सारथी AI में आपका स्वागत है!* 🚩

मैं आपका निजी गीता साथी हूँ। कृपया चुनें:

1️⃣ *तत्काल मार्गदर्शन* - वर्तमान चुनौती के लिए श्लोक
2️⃣ *दैनिक ज्ञान* - आज की विशेष शिक्षा  
3️⃣ *वार्तालाप* - अपनी भावनाओं को साझा करें
4️⃣ *गीता ज्ञान* - विशिष्ट प्रश्न पूछें

कृपया 1-4 का चयन करें 🙏`
        : `🚩 *Welcome to Sarathi AI!* 🚩

I'm your personal Gita companion. Please choose:

1️⃣ *Immediate Guidance* - Verse for current challenge
2️⃣ *Daily Wisdom* - Today's special teaching  
3️⃣ *Have a Conversation* - Share your feelings
4️⃣ *Gita Knowledge* - Ask specific questions

Please choose 1-4 🙏`;

    await sendViaHeltar(phone, menuMessage, "enhanced_welcome");
    await updateUserState(phone, { 
        conversation_stage: "awaiting_menu_choice",
        last_menu_shown: new Date().toISOString()
    });
}

async function handleEnhancedMenuChoice(phone, choice, language, user) {
    const choices = {
        "1": {
            hindi: "🌅 आपकी वर्तमान चुनौती के लिए सही मार्गदर्शन। कृपया संक्षेप में बताएं कि आप किस परिस्थिति में हैं?",
            english: "🌅 Right guidance for your current challenge. Please briefly describe your situation?",
            action: "immediate_guidance",
            tracking: "guidance_seeker"
        },
        "2": {
            hindi: "📖 आइए आज की विशेष गीता शिक्षा से दिन की शुरुआत करें!",
            english: "📖 Let's start the day with today's special Gita teaching!",
            action: "daily_wisdom",
            tracking: "daily_learner"
        },
        "3": {
            hindi: "💬 मैं सुनने के लिए यहाँ हूँ। कृपया बताएं आप कैसा महसूस कर रहे हैं?",
            english: "💬 I'm here to listen. Please share how you're feeling?",
            action: "conversation",
            tracking: "emotional_support"
        },
        "4": {
            hindi: "🎓 ज्ञान की यात्रा शुरू करें! आप गीता के बारे में क्या जानना चाहते हैं?",
            english: "🎓 Begin your knowledge journey! What would you like to know about Gita?",
            action: "knowledge_seeker",
            tracking: "factual_learner"
        }
    };

    const selected = choices[choice];
    if (selected) {
        const message = language === "Hindi" ? selected.hindi : selected.english;
        await sendViaHeltar(phone, message, `menu_${selected.action}`);
        
        await updateUserState(phone, { 
            conversation_stage: selected.action,
            last_menu_choice: choice,
            primary_use_case: selected.tracking,
            last_menu_date: new Date().toISOString().slice(0, 10)
        });
    }
}

/* ========== SIMPLE MEMORY SYSTEM FOR FOLLOW-UPS ========== */
async function storeUserMemory(phone, memoryKey, memoryValue, ttlHours = 8) {
    try {
        const user = await getUserState(phone);
        const currentMemory = user.memory_data || {};
        currentMemory[memoryKey] = {
            value: memoryValue,
            expires_at: new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()
        };
        await updateUserState(phone, { memory_data: currentMemory });
    } catch (err) {
        console.error("Memory storage error:", err);
    }
}

async function getUserMemory(phone, memoryKey) {
    try {
        const user = await getUserState(phone);
        const memory = user.memory_data || {};
        const memoryItem = memory[memoryKey];
        if (memoryItem && new Date(memoryItem.expires_at) > new Date()) {
            return memoryItem.value;
        }
        return null;
    } catch (err) {
        return null;
    }
}

async function checkAndSendFollowup(phone, user) {
    try {
        const lastEmotion = await getUserMemory(phone, 'last_emotion');
        const emotionTime = await getUserMemory(phone, 'emotion_detected_time');
        
        if (lastEmotion && emotionTime) {
            const hoursSinceEmotion = (new Date() - new Date(emotionTime)) / (1000 * 60 * 60);
            if (hoursSinceEmotion >= 7 && hoursSinceEmotion <= 8) {
                await sendEmotionalFollowup(phone, lastEmotion, user.language_preference);
                // Clear memory after sending to avoid re-sending
                await storeUserMemory(phone, 'last_emotion', '', 1); 
            }
        }
    } catch (err) {
        console.error("Follow-up check error:", err);
    }
}

async function sendEmotionalFollowup(phone, previousEmotion, language) {
    const followupMessages = {
        stressed: {
            hindi: "🌅 7-8 घंटे पहले आपने तनाव की बात की थी। क्या अब आपको थोड़ा बेहतर महसूस हो रहा है? 🙏",
            english: "🌅 You mentioned feeling stressed 7-8 hours ago. Are you feeling a bit better now? 🙏"
        },
        sadness: {
            hindi: "💫 कुछ घंटे पहले आप उदास महसूस कर रहे थे। क्या अब आपके मन को थोड़ी शांति मिली है?",
            english: "💫 You were feeling sad a few hours ago. Has your mind found some peace now?"
        },
        anger: {
            hindi: "☁️ पहले की बातचीत में आप नाराज़गी महसूस कर रहे थे। क्या अब स्थिति बेहतर है?",
            english: "☁️ You mentioned feeling angry earlier. Has the situation improved?"
        }
    };

    const message = followupMessages[previousEmotion] || {
        hindi: "🌼 कुछ घंटे पहले की हमारी बातचीत के बाद, क्या आप अब बेहतर महसूस कर रहे हैं?",
        english: "🌼 Since our conversation a few hours ago, are you feeling better now?"
    };

    const text = language === "Hindi" ? message.hindi : message.english;
    await sendViaHeltar(phone, text, "emotional_followup");
}

/* ========== IMPROVED RAG SYSTEM ========== */
const RAG_SYSTEM_PROMPT = `You are SarathiAI, a compassionate Bhagavad-Gita guide. Respond appropriately:

FOR EMOTIONAL SUPPORT:
- First acknowledge their feeling with empathy
- Provide relevant verse ONLY if it directly helps
- Keep explanation practical and comforting
- End with a caring question

FOR FACTUAL QUERIES:
- Provide clear, concise information
- Include relevant verse references
- Stick to factual accuracy

FOR GENERAL GUIDANCE:
- Use verse structure only if highly relevant
- Focus on practical wisdom from Krishna's teachings

ALWAYS:
- Be concise (2-3 sentences maximum)
- Speak in warm, compassionate tone
- Use {{LANGUAGE}} appropriately
- Avoid preaching or overwhelming with philosophy

User concern: "{{USER_QUERY}}"
`;

const CHAT_SYSTEM_PROMPT = `You are SarathiAI, a compassionate listener. Respond based on situation:

If emotional distress:
- Show empathy first
- Ask gentle questions to understand
- Offer support without immediately jumping to verses

If simple questions:
- Give direct, friendly answers
- Keep it conversational

If general guidance:
- Provide thoughtful, practical advice
- Reference Gita wisdom naturally if relevant

Always: Be warm, concise (1-2 sentences), and end with inviting question. Use {{LANGUAGE}}.
`;

/* ---------------- OpenAI & Pinecone helpers ---------------- */
async function openaiChat(messages, maxTokens = 400) {
  if (!OPENAI_KEY) return null;
  try {
    const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.6 };
    const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 25000
    });
    return resp.data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("openaiChat error:", err?.response?.data || err?.message || err);
    return null;
  }
}

async function getEmbedding(text) {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY missing");
  try {
    const resp = await axios.post("https://api.openai.com/v1/embeddings", { model: EMBED_MODEL, input: text }, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 30000
    });
    return resp.data?.data?.[0]?.embedding;
  } catch (err) {
    console.error("getEmbedding error:", err);
    throw err;
  }
}

async function pineconeQuery(vector, topK = 5, namespace) {
  if (!PINECONE_HOST || !PINECONE_API_KEY) throw new Error("Pinecone config missing");
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/query`;
  const body = { vector, topK, includeMetadata: true };
  if (namespace) body.namespace = namespace;
  const resp = await axios.post(url, body, {
    headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" }, timeout: 20000
  });
  return resp.data;
}

function getNamespacesArray() {
  if (PINECONE_NAMESPACES) return PINECONE_NAMESPACES.split(",").map(s => s.trim()).filter(Boolean);
  return [PINECONE_NAMESPACE || "verse"];
}

async function multiNamespaceQuery(vector, topK = 8) {
  const namespaces = getNamespacesArray();
  const promises = namespaces.map(async ns => {
    try {
      const r = await pineconeQuery(vector, topK, ns);
      return (r?.matches || []).map(m => ({ ...m, _namespace: ns }));
    } catch (err) {
      return [];
    }
  });
  const arr = await Promise.all(promises);
  const merged = arr.flat();
  merged.sort((a, b) => (b.score || 0) - (a.score || 0));
  return merged;
}

/* ---------------- RAG Response Function ---------------- */
async function getRAGResponse(phone, text, language, chatHistory, emotionLabel = null) {
  try {
    const qVec = await getEmbedding(text);
    const matches = await multiNamespaceQuery(qVec, 8);
    const verseMatch = matches.find(m => (m.metadata && (m.metadata.sanskrit || m.metadata.verse)));

    if (!verseMatch || (verseMatch.score || 0) < 0.25) {
      const fallback = language === "Hindi" ? "मैं आपकी बात सुन रहा हूँ। थोड़ा और बताइये?" : "I hear your concern. Could you share a little more?";
      await sendViaHeltar(phone, fallback, "fallback");
      return { assistantResponse: fallback, stage: "chatting" };
    }

    const md = verseMatch.metadata || {};
    const user = await getUserState(phone);
    
    // Use appropriate prompt based on context
    let systemPrompt = RAG_SYSTEM_PROMPT;
    if (user.conversation_stage === "factual_query" || user.conversation_stage === 'knowledge_seeker') {
        systemPrompt = RAG_SYSTEM_PROMPT.replace("{{USER_QUERY}}", `Factual question: ${text}`);
    } else if (emotionLabel || user.conversation_stage === "emotional_support" || user.conversation_stage === 'conversation') {
        systemPrompt = RAG_SYSTEM_PROMPT.replace("{{USER_QUERY}}", `Emotional concern: ${text}`);
    } else {
        systemPrompt = RAG_SYSTEM_PROMPT.replace("{{USER_QUERY}}", text);
    }
    
    systemPrompt = systemPrompt.replace("{{LANGUAGE}}", language || "English");

    const sanskritText = (md.sanskrit || md.verse || "").toString();
    const translation = (md.translation || md.hinglish1 || md.english || "").toString();
    const verseRef = (md.reference || md.verse_ref || md.id || "").toString();
    
    const modelUser = `User's query: "${text}"\n\nVerse Context:\nSanskrit: ${sanskritText}\nTranslation: ${translation}\nReference: ${verseRef}`;
    
    const aiResp = await openaiChat([{ role: "system", content: systemPrompt }, { role: "user", content: modelUser }], 600);
    
    if (!aiResp) {
        const fallback2 = language === "Hindi" ? "मैं यहाँ हूँ, अगर आप साझा करें तो मैं मदद कर सकता हूँ।" : "I am here to listen.";
        await sendViaHeltar(phone, fallback2, "fallback");
        return { assistantResponse: fallback2, stage: "chatting" };
    }
    
    const cleanResp = String(aiResp).trim().slice(0, MAX_REPLY_LENGTH);
    await sendViaHeltar(phone, cleanResp, "verse");
    return { assistantResponse: cleanResp, stage: "chatting" };

  } catch (err) {
    console.error("getRAGResponse failed:", err);
    const fallback = language === "Hindi" ? "मैं सुन रहा हूँ।" : "I am here to listen.";
    try { await sendViaHeltar(phone, fallback, "fallback"); } catch (e) {}
    return { assistantResponse: fallback, stage: "chatting" };
  }
}

/* ========== LANGUAGE DETECTION ========== */
function detectLanguageFromText(text) {
  if (!text || typeof text !== "string") return "English";
  if (/[ऀ-ॿ]/.test(text)) return "Hindi";
  const hindiKeywords = ["है", "मैं", "और", "क्या", "कर", "किया", "हूँ", "हैं", "नहीं", "आप", "क्यों"];
  const lowered = text.toLowerCase();
  for (const k of hindiKeywords) if (lowered.includes(k)) return "Hindi";
  return "English";
}

/* ========== MAIN WEBHOOK HANDLER ========== */
app.post("/webhook", async (req, res) => {
  try {
    res.status(200).send("OK");

    const body = req.body || {};
    let msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || body?.messages?.[0] || body;
    if (!msg || typeof msg !== "object") {
      console.log("⚠️ Ignoring non-message webhook event.");
      return;
    }

    const phone = msg?.from;
    const rawText = msg?.text?.body || msg?.button?.payload || msg?.interactive?.button_reply?.id || msg?.interactive?.list_reply?.id || "";
    const text = String(rawText || "").trim();
    if (!phone || text.length === 0) {
      console.warn("⚠️ Webhook missing phone/text.");
      return;
    }

    console.log(`📩 Incoming from ${phone}: "${text}"`);
    await trackIncoming(phone, text);

    // This is the new, correct block
    const user = await getUserState(phone);
    
    // 1. Start with the user's saved preference, or default to English.
    let language = user.language_preference || 'English';

    // 2. Detect language from the current message.
    const detectedLang = detectLanguageFromText(text);

    // 3. ONLY if the user's preference is English AND they typed in Hindi, switch to Hindi.
    if (language === 'English' && detectedLang === 'Hindi') {
        language = 'Hindi';
        // Also, update their preference for future conversations.
        await updateUserState(phone, { language_preference: 'Hindi' });
    }

    const lower = text.toLowerCase();
    
    // ========== ENHANCED INTENT HANDLING HIERARCHY ==========
    
    // Check for emotional follow-ups (runs once per session ideally)
    await checkAndSendFollowup(phone, user);

    // Advanced emotion detection for current message
    const chatHistory = parseChatHistory(user.chat_history || []);
    const emotionDetection = detectEmotionAdvanced(text, chatHistory);
    const detectedEmotion = emotionDetection ? emotionDetection.emotion : null;

    console.log(`🎯 Detected: emotion=${detectedEmotion}, confidence=${emotionDetection?.confidence || 0}`);

    // 1. GREETINGS (Highest Priority)
    if (isGreetingQuery(lower)) {
        console.log(`✅ Intent: Greeting`);
        await handleEnhancedStartupMenu(phone, language, user);
        return;
    }

    // 2. CAPABILITIES QUERIES
    if (isCapabilitiesQuery(lower)) {
        console.log(`✅ Intent: Capabilities Query`);
        const reply = language === "Hindi"
            ? "मैं सारथी हूँ, आपका निजी गीता साथी। मैं आपको जीवन की चुनौतियों में कृष्ण का मार्गदर्शन प्रदान करता हूँ। आप किस तरह की सहायता चाहते हैं?"
            : "I'm Sarathi, your personal Gita companion. I provide Krishna's guidance for life's challenges. What kind of assistance would you like?";
        await sendViaHeltar(phone, reply, "capabilities");
        return;
    }

    // 3. MENU CHOICE HANDLING
    if (user.conversation_stage === "awaiting_menu_choice" && /^[1-4]$/.test(text.trim())) {
        console.log(`✅ Intent: Menu Choice`);
        await handleEnhancedMenuChoice(phone, text.trim(), language, user);
        return;
    }

    // 4. EMOTIONAL EXPRESSIONS (Empathy first, not immediate RAG)
    if (isEmotionalExpression(lower) || detectedEmotion) {
        console.log(`✅ Intent: Emotional Expression`);
        
        const empatheticResponses = {
            hindi: [
                "मैं समझ रहा हूँ कि आप कुछ परेशान हैं। क्या आप थोड़ा और बता सकते हैं कि आप कैसा महसूस कर रहे हैं?",
                "यह सुनकर दुख हुआ कि आप मुश्किल दौर से गुजर रहे हैं। क्या आप अपनी भावनाओं के बारे में और साझा करेंगे?"
            ],
            english: [
                "I understand you're going through something difficult. Could you share a bit more about how you're feeling?",
                "I'm sorry to hear you're facing challenges. Would you like to talk more about what's on your mind?"
            ]
        };

        const responses = language === "Hindi" ? empatheticResponses.hindi : empatheticResponses.english;
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        
        await sendViaHeltar(phone, randomResponse, "empathy_first");
        await updateUserState(phone, { conversation_stage: "emotional_support" });
        
        if (detectedEmotion) {
            await storeUserMemory(phone, 'last_emotion', detectedEmotion, 8);
            await storeUserMemory(phone, 'emotion_detected_time', new Date().toISOString(), 8);
        }
        return;
    }

    // 5. FACTUAL QUERIES
    if (isFactualQuery(lower)) {
        console.log(`✅ Intent: Factual Query`);
        await updateUserState(phone, { conversation_stage: "factual_query" });
        // Let it continue to RAG below
    }

    // 6. SMALL TALK (No RAG)
    if (isSmallTalk(lower)) {
        console.log(`✅ Intent: Small Talk`);
        const responses = {
            hindi: {
                thanks: "आपका स्वागत है! 🙏 क्या आप आज कुछ और साझा करना चाहेंगे?",
                okay: "ठीक है! क्या आप आगे बातचीत जारी रखना चाहेंगे?",
                bye: "धन्यवाद! जब भी आपको जरूरत हो, मैं यहाँ हूँ। हरे कृष्ण! 🙏"
            },
            english: {
                thanks: "You're welcome! 🙏 Would you like to share anything else today?",
                okay: "Okay! Would you like to continue our conversation?",
                bye: "Thank you! I'm here whenever you need me. Hare Krishna! 🙏"
            }
        };

        let response;
        const respDict = language === "Hindi" ? responses.hindi : responses.english;
        
        if (lower.includes('thank') || lower.includes('धन्यवाद') || lower.includes('शुक्रिया')) {
            response = respDict.thanks;
        } else if (lower.includes('bye') || lower.includes('बाय') || lower.includes('stop')) {
            response = respDict.bye;
        } else {
            response = respDict.okay;
        }
        
        await sendViaHeltar(phone, response, "small_talk");
        return;
    }

    // 7. FALLBACK: Only unmatched intents go to RAG
    console.log(`ℹ️  Intent: General/Unmatched -> Proceeding to RAG`);

    const ragResult = await getRAGResponse(phone, text, language, chatHistory, detectedEmotion);
    if (ragResult && ragResult.assistantResponse) {
        chatHistory.push({ role: "user", content: text });
        chatHistory.push({ role: "assistant", content: ragResult.assistantResponse });
        if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);
        
        await updateUserState(phone, {
          conversation_stage: ragResult.stage || "chatting",
          chat_history: JSON.stringify(chatHistory),
          language_preference: language
        });
    }

  } catch (err) {
    console.error("❌ Webhook error:", err?.message || err);
  }
});

/* ---------------- Health check endpoint ---------------- */
app.get("/health", (req, res) => {
  res.json({ status: "ok", bot: BOT_NAME, timestamp: new Date().toISOString() });
});

/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
  console.log(`\n🚀 ${BOT_NAME} listening on port ${PORT}`);
  setupDatabase();
});
