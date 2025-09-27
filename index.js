// index.js — SarathiAI (Fixed Version - Database + Language + RAG)
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

/* ---------------- FIXED Database Setup ---------------- */
async function setupDatabase() {
  try {
    const client = await dbPool.connect();
    
    // FIXED: Always ensure all columns exist (remove conditional check)
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
      ADD COLUMN IF NOT EXISTS last_menu_shown TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS primary_use_case VARCHAR(20),
      ADD COLUMN IF NOT EXISTS user_segment VARCHAR(20) DEFAULT 'new',
      ADD COLUMN IF NOT EXISTS last_activity_ts TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    `);
    console.log("✅ Ensured all columns exist in users table");

    // Ensure lessons table exists
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
      // Create a new user with all required fields
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
    
    const user = res.rows[0];
    user.chat_history = parseChatHistory(user.chat_history || '[]');
    user.memory_data = user.memory_data || {};
    user.conversation_stage = user.conversation_stage || 'new_topic';
    user.language_preference = user.language_preference || 'English';
    user.last_activity_ts = user.last_activity_ts || new Date().toISOString();
    
    return user;
  } catch (err) {
    console.error("getUserState failed:", err);
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
    
    // FIXED: Safe column updates - only update existing columns
    const safeUpdates = {};
    const validColumns = [
      'subscribed_daily', 'chat_history', 'conversation_stage', 'last_topic_summary',
      'messages_since_verse', 'first_seen_date', 'last_seen_date', 'total_sessions',
      'total_incoming', 'total_outgoing', 'last_message', 'last_message_role',
      'last_response_type', 'current_lesson', 'language_preference', 'memory_data',
      'last_menu_choice', 'last_menu_date', 'last_menu_shown', 'primary_use_case',
      'user_segment', 'last_activity_ts'
    ];
    
    Object.keys(updates).forEach(key => {
      if (validColumns.includes(key)) {
        safeUpdates[key] = updates[key];
      }
    });
    
    if (Object.keys(safeUpdates).length === 0) return;
    
    const keys = Object.keys(safeUpdates);
    const vals = keys.map(k => {
      const v = safeUpdates[k];
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
    return capabilitiesRegex.test(lowerText);
}

function isEmotionalExpression(text) {
    const lowerText = text.toLowerCase();
    const emotionalPatterns = [
        /\b(stress|stressed|stressing|anxious|anxiety|tension|overwhelmed|pressure|worried|worrying)\b/i,
        /\b(परेशान|तनाव|चिंता|घबराहट|दबाव|उलझन)\b/,
        /\b(sad|sadness|depressed|depression|unhappy|miserable|hopeless|down|low|sorrow)\b/i,
        /\b(दुखी|उदास|निराश|हताश|दुख|उदासी)\b/,
        /\b(my life|married life|relationship|husband|wife|family|job|work|career).*(problem|issue|difficult|hard|trouble|disturb|bad)\b/i,
        /\b(जीवन|शादी|रिश्ता|पति|पत्नी|परिवार|नौकरी|काम).*(समस्या|परेशानी|मुश्किल|बुरा|खराब)\b/,
        /\b(not good|not well|feeling bad|going through|facing problem|having issue)\b/i,
        /\b(अच्छा नहीं|ठीक नहीं|बुरा लग|मुश्किल हो|परेशानी हो)\b/,
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

function detectEmotionAdvanced(text) {
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

    return confidence > 0.5 ? { emotion, confidence } : null;
}

/* ========== FIXED LANGUAGE DETECTION ========== */
function detectLanguageFromText(text) {
  if (!text || typeof text !== "string") return "English";
  
  // First check for actual Hindi characters (Unicode range)
  if (/[\u0900-\u097F]/.test(text)) {
    return "Hindi";
  }
  
  const lowered = text.toLowerCase().trim();
  
  // Common English greetings and patterns that should NEVER be detected as Hindi
  const englishPatterns = [
    /^hi+$/i, /^hello$/i, /^hey$/i, /^how are u\??$/i, /^what's up\??$/i,
    /^good morning$/i, /^good afternoon$/i, /^good evening$/i,
    /^thanks?$/i, /^thank you$/i, /^ok$/i, /^okay$/i, /^bye$/i
  ];
  
  for (const pattern of englishPatterns) {
    if (pattern.test(lowered)) {
      return "English";
    }
  }
  
  // If it contains only English letters and common English words, it's English
  if (/^[a-z\s\?\!\.\,]+$/.test(lowered)) {
    const commonEnglishWords = ['the', 'and', 'for', 'are', 'you', 'how', 'what', 'when', 'where', 'why', 'this', 'that', 'with', 'have', 'has', 'had', 'was', 'were', 'been', 'being'];
    const words = lowered.split(/\s+/);
    let englishWordCount = 0;
    
    for (const word of words) {
      if (commonEnglishWords.includes(word) || word.length > 10) { // Long words are likely English
        englishWordCount++;
      }
    }
    
    if (englishWordCount >= 1 || words.some(w => w.length > 8)) {
      return "English";
    }
  }
  
  // Check for Romanized Hindi words (only if no clear English indicators)
  const hindiRomanWords = ['hai', 'hain', 'ho', 'main', 'aap', 'kyu', 'kya', 'kaise', 'karo', 'kiya', 'nahi', 'par', 'aur', 'lekin', 'agar', 'toh', 'tha', 'thi', 'the', 'mera', 'tera', 'apna'];
  let hindiScore = 0;
  
  for (const word of hindiRomanWords) {
    if (new RegExp(`\\b${word}\\b`).test(lowered)) {
      hindiScore++;
    }
  }
  
  // Only return Hindi if there's strong evidence (multiple Hindi words)
  return hindiScore >= 2 ? "Hindi" : "English";
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
        conversation_stage: "awaiting_menu_choice"
    });
}

async function handleEnhancedMenuChoice(phone, choice, language, user) {
    const choices = {
        "1": {
            hindi: "🌅 आपकी वर्तमान चुनौती के लिए सही मार्गदर्शन। कृपया संक्षेप में बताएं कि आप किस परिस्थिति में हैं?",
            english: "🌅 Right guidance for your current challenge. Please briefly describe your situation?",
            action: "immediate_guidance"
        },
        "2": {
            hindi: "📖 आइए आज की विशेष गीता शिक्षा से दिन की शुरुआत करें!",
            english: "📖 Let's start the day with today's special Gita teaching!",
            action: "daily_wisdom"
        },
        "3": {
            hindi: "💬 मैं सुनने के लिए यहाँ हूँ। कृपया बताएं आप कैसा महसूस कर रहे हैं?",
            english: "💬 I'm here to listen. Please share how you're feeling?",
            action: "conversation"
        },
        "4": {
            hindi: "🎓 ज्ञान की यात्रा शुरू करें! आप गीता के बारे में क्या जानना चाहते हैं?",
            english: "🎓 Begin your knowledge journey! What would you like to know about Gita?",
            action: "knowledge_seeker"
        }
    };

    const selected = choices[choice];
    if (selected) {
        const message = language === "Hindi" ? selected.hindi : selected.english;
        await sendViaHeltar(phone, message, `menu_${selected.action}`);
        
        await updateUserState(phone, { 
            conversation_stage: selected.action,
            last_menu_choice: choice
        });
    }
}

/* ========== SIMPLE MEMORY SYSTEM ========== */
async function storeUserMemory(phone, memoryKey, memoryValue) {
    try {
        const user = await getUserState(phone);
        const currentMemory = user.memory_data || {};
        currentMemory[memoryKey] = {
            value: memoryValue,
            expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
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

/* ========== IMPROVED RAG SYSTEM ========== */
const RAG_SYSTEM_PROMPT = `You are SarathiAI, a compassionate Bhagavad-Gita guide. Respond in a warm, helpful tone.

Key guidelines:
- Be concise (2-3 sentences maximum)
- Show empathy and understanding
- Provide practical wisdom from Gita teachings
- Use simple, clear language
- End with a caring question to continue conversation

User language: {{LANGUAGE}}
User message: "{{USER_QUERY}}"`;

/* ---------------- OpenAI & Pinecone helpers ---------------- */
async function openaiChat(messages, maxTokens = 400) {
  if (!OPENAI_KEY) {
    console.log("⚠️ OpenAI key missing - using fallback");
    return null;
  }
  try {
    const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.7 };
    const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      timeout: 25000
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
    const resp = await axios.post("https://api.openai.com/v1/embeddings", 
      { model: EMBED_MODEL, input: text }, 
      { headers: { Authorization: `Bearer ${OPENAI_KEY}` }, timeout: 30000 }
    );
    return resp.data?.data?.[0]?.embedding;
  } catch (err) {
    console.error("getEmbedding error:", err);
    throw err;
  }
}

async function pineconeQuery(vector, topK = 5, namespace) {
  if (!PINECONE_HOST || !PINECONE_API_KEY) {
    console.log("⚠️ Pinecone config missing - using fallback");
    return { matches: [] };
  }
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/query`;
  const body = { vector, topK, includeMetadata: true };
  if (namespace) body.namespace = namespace;
  try {
    const resp = await axios.post(url, body, {
      headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" },
      timeout: 20000
    });
    return resp.data;
  } catch (err) {
    console.error("Pinecone query error:", err);
    return { matches: [] };
  }
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

/* ---------------- IMPROVED RAG Response Function ---------------- */
async function getRAGResponse(phone, text, language, emotionLabel = null) {
  try {
    // Try to get relevant verses from Pinecone
    let verseMatch = null;
    try {
      const qVec = await getEmbedding(text);
      const matches = await multiNamespaceQuery(qVec, 5);
      verseMatch = matches.find(m => m.score > 0.25);
    } catch (err) {
      console.log("⚠️ RAG search failed, using direct AI response:", err.message);
    }

    let systemPrompt = RAG_SYSTEM_PROMPT
      .replace("{{LANGUAGE}}", language)
      .replace("{{USER_QUERY}}", text);

    let userContent = `User's message: "${text}"`;
    
    if (verseMatch && verseMatch.metadata) {
      const md = verseMatch.metadata;
      userContent += `\n\nRelevant Gita verse:\nSanskrit: ${md.sanskrit || md.verse || ""}\nTranslation: ${md.translation || md.english || ""}\nReference: ${md.reference || md.verse_ref || ""}`;
    }

    const aiResp = await openaiChat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ], 500);

    if (aiResp) {
      const cleanResp = String(aiResp).trim().slice(0, MAX_REPLY_LENGTH);
      await sendViaHeltar(phone, cleanResp, "ai_response");
      return { assistantResponse: cleanResp, stage: "chatting" };
    } else {
      // Fallback responses when AI fails
      const fallback = language === "Hindi" 
        ? "मैं आपकी बात समझ रहा हूँ। क्या आप इसके बारे में थोड़ा और बता सकते हैं? 🙏"
        : "I understand what you're sharing. Could you tell me a bit more about this? 🙏";
      await sendViaHeltar(phone, fallback, "fallback");
      return { assistantResponse: fallback, stage: "chatting" };
    }

  } catch (err) {
    console.error("getRAGResponse failed:", err);
    const fallback = language === "Hindi" 
      ? "मैं यहाँ हूँ आपके लिए। आप कैसा महसूस कर रहे हैं? 💫"
      : "I'm here for you. How are you feeling today? 💫";
    await sendViaHeltar(phone, fallback, "error_fallback");
    return { assistantResponse: fallback, stage: "chatting" };
  }
}

/* ========== IMPROVED WEBHOOK PARSING ========== */
function parseWebhookMessage(body) {
  if (!body) return null;
  
  // Try different webhook formats
  if (body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
    return body.entry[0].changes[0].value.messages[0];
  }
  if (body?.messages?.[0]) {
    return body.messages[0];
  }
  if (body?.from && body?.text) {
    return body;
  }
  
  return null;
}

/* ========== FIXED LANGUAGE HANDLING ========== */
async function determineUserLanguage(phone, text, user) {
    // Always start with user's saved preference
    let language = user.language_preference || 'English';
    
    // For new users (first 3 messages), detect language more aggressively
    const isNewUser = (user.total_incoming || 0) <= 3;
    
    if (isNewUser) {
        const detectedLang = detectLanguageFromText(text);
        if (detectedLang === "Hindi" && language === "English") {
            // New user typing in Hindi - switch preference
            language = "Hindi";
            await updateUserState(phone, { language_preference: "Hindi" });
            console.log(`🔄 New user language switched to: ${language}`);
        }
    }
    
    return language;
}

/* ========== MAIN WEBHOOK HANDLER ========== */
app.post("/webhook", async (req, res) => {
  try {
    // Send immediate response
    res.status(200).send("OK");

    const body = req.body || {};
    const msg = parseWebhookMessage(body);
    
    if (!msg) {
      console.log("⚠️ Ignoring non-message webhook event");
      return;
    }

    const phone = msg?.from || msg?.clientWaNumber;
    const rawText = msg?.text?.body || msg?.button?.payload || "";
    const text = String(rawText || "").trim();
    
    if (!phone || text.length === 0) {
      console.warn("⚠️ Webhook missing phone/text");
      return;
    }

    console.log(`📩 Incoming from ${phone}: "${text}"`);
    await trackIncoming(phone, text);

    // Get user state and determine language
    const user = await getUserState(phone);
    const language = await determineUserLanguage(phone, text, user);
    
    const lower = text.toLowerCase();
    
    console.log(`🎯 Processing: language=${language}, stage=${user.conversation_stage}`);

    // 1. GREETINGS (Highest Priority)
    if (isGreetingQuery(lower)) {
        console.log(`✅ Intent: Greeting`);
        await handleEnhancedStartupMenu(phone, language, user);
        return;
    }

    // 2. MENU CHOICE HANDLING
    if (user.conversation_stage === "awaiting_menu_choice" && /^[1-4]$/.test(text.trim())) {
        console.log(`✅ Intent: Menu Choice`);
        await handleEnhancedMenuChoice(phone, text.trim(), language, user);
        return;
    }

    // 3. CAPABILITIES QUERIES
    if (isCapabilitiesQuery(lower)) {
        console.log(`✅ Intent: Capabilities Query`);
        const reply = language === "Hindi"
            ? "मैं सारथी AI हूँ, आपका निजी गीता साथी! 🙏 मैं आपको जीवन की चुनौतियों के लिए भगवद गीता का मार्गदर्शन प्रदान करता हूँ। आप कैसे मदद चाहते हैं?"
            : "I'm Sarathi AI, your personal Gita companion! 🙏 I provide guidance from Bhagavad Gita for life's challenges. How can I help you today?";
        await sendViaHeltar(phone, reply, "capabilities");
        return;
    }

    // 4. EMOTIONAL EXPRESSIONS
    if (isEmotionalExpression(lower)) {
        console.log(`✅ Intent: Emotional Expression`);
        const emotionDetection = detectEmotionAdvanced(text);
        
        const empatheticResponse = language === "Hindi"
            ? "मैं समझ रहा हूँ कि आप कुछ परेशान हैं। कृपया मुझे बताएं, मैं आपकी मदद करना चाहता हूँ। 🙏"
            : "I understand you're going through something difficult. Please share with me, I'm here to help. 🙏";
        
        await sendViaHeltar(phone, empatheticResponse, "empathy");
        await updateUserState(phone, { conversation_stage: "emotional_support" });
        
        if (emotionDetection) {
            await storeUserMemory(phone, 'last_emotion', emotionDetection.emotion);
        }
        return;
    }

    // 5. SMALL TALK
    if (isSmallTalk(lower)) {
        console.log(`✅ Intent: Small Talk`);
        let response;
        if (language === "Hindi") {
            if (lower.includes('thank') || lower.includes('धन्यवाद') || lower.includes('शुक्रिया')) {
                response = "आपका स्वागत है! 🙏 क्या आप और कुछ बात करना चाहेंगे?";
            } else if (lower.includes('bye') || lower.includes('बाय')) {
                response = "धन्यवाद! जब भी जरूरत हो, मैं यहाँ हूँ। हरे कृष्ण! 🌟";
            } else {
                response = "ठीक है! 😊 आप आगे क्या जानना चाहेंगे?";
            }
        } else {
            if (lower.includes('thank')) {
                response = "You're welcome! 🙏 Is there anything else you'd like to talk about?";
            } else if (lower.includes('bye')) {
                response = "Thank you! I'm here whenever you need me. Hare Krishna! 🌟";
            } else {
                response = "Okay! 😊 What would you like to know more about?";
            }
        }
        await sendViaHeltar(phone, response, "small_talk");
        return;
    }

    // 6. FALLBACK: Use RAG for everything else
    console.log(`ℹ️  Intent: General -> Using RAG`);
    await getRAGResponse(phone, text, language);

  } catch (err) {
    console.error("❌ Webhook error:", err?.message || err);
  }
});

/* ---------------- Health check endpoint ---------------- */
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    bot: BOT_NAME, 
    timestamp: new Date().toISOString()
  });
});

/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
  console.log(`\n🚀 ${BOT_NAME} listening on port ${PORT}`);
  setupDatabase().catch(console.error);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await dbPool.end();
  process.exit(0);
});
