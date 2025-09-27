// index.js — SarathiAI (Complete Fixed Version)
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

/* ---------------- Database Setup ---------------- */
async function setupDatabase() {
  try {
    const client = await dbPool.connect();
    
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
      ADD COLUMN IF NOT EXISTS last_message_role VARCHAR(50),
      ADD COLUMN IF NOT EXISTS last_response_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS current_lesson INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS language_preference VARCHAR(10) DEFAULT 'English',
      ADD COLUMN IF NOT EXISTS memory_data JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS last_menu_choice VARCHAR(5),
      ADD COLUMN IF NOT EXISTS last_menu_date DATE,
      ADD COLUMN IF NOT EXISTS last_menu_shown TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS primary_use_case VARCHAR(50),
      ADD COLUMN IF NOT EXISTS user_segment VARCHAR(20) DEFAULT 'new',
      ADD COLUMN IF NOT EXISTS last_activity_ts TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    `);

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

/* ========== FIXED LANGUAGE DETECTION ========== */
function detectLanguageFromText(text) {
  if (!text || typeof text !== "string") return "English";
  
  const cleanText = text.trim().toLowerCase();
  
  // 1. EXPLICIT language commands (HIGHEST PRIORITY)
  if (cleanText.includes('english') || cleanText.includes('speak english')) {
    return "English";
  }
  if (cleanText.includes('hindi') || cleanText.includes('speak hindi')) {
    return "Hindi";
  }
  
  // 2. Actual Hindi characters (definitive)
  if (/[\u0900-\u097F]/.test(text)) {
    return "Hindi";
  }
  
  // 3. Common English phrases that should NEVER be detected as Hindi
  const englishPatterns = [
    /^hi+$/i, /^hello$/i, /^hey$/i, /^how are you\??$/i, /^what'?s up\??$/i,
    /^good morning$/i, /^good afternoon$/i, /^good evening$/i,
    /^thanks?$/i, /^thank you$/i, /^ok$/i, /^okay$/i, /^bye$/i,
    /^yes$/i, /^no$/i, /^please$/i, /^sorry$/i, /^what$/i, /^when$/i, 
    /^where$/i, /^why$/i, /^how$/i, /^help$/i, /^stop$/i, /^start$/i,
    /^menu$/i, /^[1-4]$/, /^whats happening$/i, /^what's happening$/i
  ];
  
  for (const pattern of englishPatterns) {
    if (pattern.test(cleanText)) {
      return "English";
    }
  }
  
  // 4. If it contains only English letters and common punctuation, it's English
  if (/^[a-zA-Z\s\?\!\.\,\']+$/.test(text)) {
    return "English";
  }
  
  // 5. Strong Romanized Hindi indicators
  const strongHindiIndicators = ['kyu', 'kya', 'kaise', 'karo', 'kiya', 'mera', 'tera', 'apna'];
  for (const word of strongHindiIndicators) {
    if (new RegExp(`\\b${word}\\b`).test(cleanText)) {
      return "Hindi";
    }
  }
  
  // 6. Default to English
  return "English";
}

/* ========== IMPROVED LANGUAGE MANAGEMENT ========== */
async function determineUserLanguage(phone, text, user) {
  let currentLanguage = user.language_preference || 'English';
  const detectedLanguage = detectLanguageFromText(text);
  const isLanguageSwitchCommand = text.toLowerCase().includes('english') || text.toLowerCase().includes('hindi');
  
  console.log(`🔤 Language: user_pref=${currentLanguage}, detected=${detectedLanguage}, is_switch=${isLanguageSwitchCommand}`);
  
  // If it's a language switch command, handle it immediately and return the new language
  if (isLanguageSwitchCommand) {
    if (text.toLowerCase().includes('english')) {
      currentLanguage = 'English';
      await updateUserState(phone, { 
        language_preference: 'English',
        conversation_stage: 'new_topic'
      });
      console.log(`🔄 Language switched to English`);
      return { language: currentLanguage, isSwitch: true, switchTo: 'English' };
    }
    if (text.toLowerCase().includes('hindi')) {
      currentLanguage = 'Hindi';
      await updateUserState(phone, { 
        language_preference: 'Hindi',
        conversation_stage: 'new_topic'
      });
      console.log(`🔄 Language switched to Hindi`);
      return { language: currentLanguage, isSwitch: true, switchTo: 'Hindi' };
    }
  }
  
  // For new users, be more responsive to language detection
  const isNewUser = (user.total_incoming || 0) <= 2;
  if (isNewUser && detectedLanguage === 'Hindi' && currentLanguage === 'English') {
    currentLanguage = 'Hindi';
    await updateUserState(phone, { language_preference: 'Hindi' });
    console.log(`🔄 New user language switched to Hindi`);
  }
  
  return { language: currentLanguage, isSwitch: false };
}

/* ========== INTENT CLASSIFICATION ========== */
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
        // Stress/Anxiety - EXPANDED PATTERNS
        /\b(stress|stressed|stressing|anxious|anxiety|tension|overwhelmed|pressure|worried|worrying)\b/i,
        /\b(i am in stress|i feel stressed|i'm stressed|i have stress|feeling stressed|under stress)\b/i,
        /\b(परेशान|तनाव|चिंता|घबराहट|दबाव|उलझन)\b/,
        
        // Sadness/Depression
        /\b(sad|sadness|depressed|depression|unhappy|miserable|hopeless|down|low|sorrow)\b/i,
        /\b(i am sad|i feel sad|i'm sad|feeling down|feeling low)\b/i,
        /\b(दुखी|उदास|निराश|हताश|दुख|उदासी)\b/,
        
        // Life problems (nuanced detection)
        /\b(my life|married life|relationship|husband|wife|family|job|work|career).*(problem|issue|difficult|hard|trouble|disturb|bad)\b/i,
        /\b(जीवन|शादी|रिश्ता|पति|पत्नी|परिवार|नौकरी|काम).*(समस्या|परेशानी|मुश्किल|बुरा|खराब)\b/,
        
        // General distress - IMPROVED PATTERNS
        /\b(not good|not well|feeling bad|going through|facing problem|having issue|i am struggling)\b/i,
        /\b(i can't handle|i can't cope|it's too much|too much pressure)\b/i,
        /\b(अच्छा नहीं|ठीक नहीं|बुरा लग|मुश्किल हो|परेशानी हो|संघर्ष कर)\b/,
        
        // Confusion/Uncertainty
        /\b(confused|lost|uncertain|don't know|what to do|which way|कंफ्यूज|उलझन|पता नहीं|क्या करूं)\b/i,
        
        // Physical symptoms of stress
        /\b(can't sleep|sleep problems|headache|tired|exhausted|fatigue|can't focus)\b/i
    ];
    
    return emotionalPatterns.some(pattern => pattern.test(lowerText));
}

function detectEmotionAdvanced(text) {
    const lowerText = text.toLowerCase();
    let emotion = null;
    let confidence = 0;

    const emotionKeywords = {
        stressed: { 
            keywords: [
                'stress', 'stressed', 'stressing', 'tension', 'pressure', 'overwhelmed', 
                'worried', 'worrying', 'anxious', 'anxiety', 'pressure', 'can\'t handle',
                'too much', 'overwhelming', 'परेशान', 'तनाव', 'चिंता', 'घबराहट', 'दबाव'
            ], 
            weight: 1.0 
        },
        sadness: { 
            keywords: [
                'sad', 'depressed', 'unhappy', 'hopeless', 'sorrow', 'crying', 'tears',
                'empty', 'down', 'low', 'दुखी', 'उदास', 'निराश', 'हताश', 'दुख'
            ], 
            weight: 1.0 
        },
        anger: { 
            keywords: [
                'angry', 'frustrated', 'irritated', 'annoyed', 'mad', 'hate', 'furious',
                'गुस्सा', 'नाराज', 'क्रोध', 'चिढ़'
            ], 
            weight: 0.9 
        },
        confusion: { 
            keywords: [
                'confused', 'lost', 'uncertain', 'doubt', 'unsure', 'what to do', 
                'don\'t know', 'कंफ्यूज', 'उलझन', 'असमंजस', 'पता नहीं'
            ], 
            weight: 0.8 
        },
        fear: { 
            keywords: [
                'scared', 'afraid', 'fear', 'nervous', 'anxious', 'worry', 'panic',
                'डर', 'भय', 'घबराहट', 'आशंका'
            ], 
            weight: 0.9 
        }
    };

    // Check for "I am in [emotion]" patterns
    const iAmPatterns = [
        { pattern: /\b(i am|i'm|feeling) (stressed|stress|anxious|overwhelmed)\b/i, emotion: 'stressed', weight: 1.5 },
        { pattern: /\b(i am|i'm|feeling) (sad|depressed|unhappy|hopeless)\b/i, emotion: 'sadness', weight: 1.5 },
        { pattern: /\b(i am|i'm|feeling) (angry|mad|frustrated)\b/i, emotion: 'anger', weight: 1.3 },
        { pattern: /\b(i am|i'm|feeling) (confused|lost|uncertain)\b/i, emotion: 'confusion', weight: 1.2 },
        { pattern: /\b(i am|i'm|feeling) (scared|afraid|nervous)\b/i, emotion: 'fear', weight: 1.3 }
    ];

    for (const situation of iAmPatterns) {
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

    return confidence > 0.3 ? { emotion, confidence } : null;
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

/* ========== MEMORY SYSTEM FOR FOLLOW-UPS ========== */
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

/* ========== EMOTIONAL RESPONSE HANDLER ========== */
async function handleEmotionalExpression(phone, text, language, user, detectedEmotion) {
    console.log(`💔 Handling emotional expression: ${detectedEmotion}`);
    
    const empatheticResponses = {
        stressed: {
            hindi: [
                "मैं समझ रहा हूँ कि आप तनाव महसूस कर रहे हैं। तनाव की स्थिति में गीता हमें सिखाती है कि शांत रहें और अपने भीतर की शक्ति को पहचानें। क्या आप इस बारे में थोड़ा और बता सकते हैं?",
                "तनाव होना स्वाभाविक है। कृष्ण अर्जुन से कहते हैं: 'योगस्थः कुरु कर्माणि' - मन को स्थिर रखकर कर्म करो। आप किस बात से सबसे ज्यादा तनाव महसूस कर रहे हैं?"
            ],
            english: [
                "I understand you're feeling stressed. In stressful times, the Gita teaches us to remain calm and recognize our inner strength. Could you share a bit more about what's causing this stress?",
                "It's natural to feel stressed. Krishna tells Arjuna: 'Perform your duty equipoised' - act with a balanced mind. What's causing you the most stress right now?"
            ]
        },
        sadness: {
            hindi: [
                "मैं देख रहा हूँ कि आप दुखी महसूस कर रहे हैं। गीता हमें सिखाती है कि दुख और सुख जीवन के अंग हैं, पर हम उनसे परे हैं। क्या आप अपनी भावनाओं के बारे में बात करना चाहेंगे?",
                "दुख की घड़ी में, याद रखें कि यह समय भी बीतेगा। कृष्ण कहते हैं: 'दुःखेष्वनुद्विग्नमनाः' - दुख में जिसका मन विचलित नहीं होता। आप कैसा महसूस कर रहे हैं?"
            ],
            english: [
                "I see you're feeling sad. The Gita teaches us that sorrow and happiness are part of life, but we are beyond them. Would you like to talk about your feelings?",
                "In moments of sadness, remember this too shall pass. Krishna says: 'Be undisturbed in sorrow.' How are you feeling right now?"
            ]
        }
    };

    const responses = empatheticResponses[detectedEmotion] || {
        hindi: [
            "मैं समझ रहा हूँ कि आप कुछ परेशान हैं। कृपया मुझे बताएं, मैं गीता की शिक्षाओं के through आपकी मदद करना चाहता हूँ।",
            "यह सुनकर दुख हुआ कि आप मुश्किल दौर से गुजर रहे हैं। क्या आप अपनी भावनाओं के बारे में और साझा करेंगे?"
        ],
        english: [
            "I understand you're going through something difficult. Please share with me, I'd like to help you through Gita's teachings.",
            "I'm sorry to hear you're facing challenges. Would you like to talk more about what's on your mind?"
        ]
    };

    const languageResponses = language === "Hindi" ? responses.hindi : responses.english;
    const randomResponse = languageResponses[Math.floor(Math.random() * languageResponses.length)];
    
    await sendViaHeltar(phone, randomResponse, "emotional_response");
    await updateUserState(phone, { conversation_stage: "emotional_support" });
    
    // Store emotion for follow-up
    await storeUserMemory(phone, 'last_emotion', detectedEmotion, 8);
    await storeUserMemory(phone, 'emotion_detected_time', new Date().toISOString(), 8);
    
    console.log(`✅ Emotional response sent and memory stored for ${detectedEmotion}`);
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
            hindi: {
                prompt: "🌅 आपकी वर्तमान चुनौती के लिए सही मार्गदर्शन। कृपया संक्षेप में बताएं कि आप किस परिस्थिति में हैं?",
                action: "immediate_guidance"
            },
            english: {
                prompt: "🌅 Right guidance for your current challenge. Please briefly describe your situation?",
                action: "immediate_guidance"
            }
        },
        "2": {
            hindi: {
                prompt: "📖 आज की विशेष गीता शिक्षा: 'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।' (2.47) - तुम्हारा अधिकार सिर्फ कर्म पर है, फल पर नहीं। आज बिना परिणाम की चिंता किए, अपना कर्तव्य निभाएं। 🙏",
                action: "daily_wisdom"
            },
            english: {
                prompt: "📖 Today's special Gita teaching: 'You have the right to work, but never to the fruit of work.' (2.47) - Focus on your duty without attachment to results. Perform your actions with dedication today. 🙏",
                action: "daily_wisdom"
            }
        },
        "3": {
            hindi: {
                prompt: "💬 मैं सुनने के लिए यहाँ हूँ। कृपया बताएं आप कैसा महसूस कर रहे हैं? मैं गीता की शिक्षाओं के through आपकी मदद करूंगा।",
                action: "conversation"
            },
            english: {
                prompt: "💬 I'm here to listen. Please share how you're feeling? I'll help you through the teachings of Gita.",
                action: "conversation"
            }
        },
        "4": {
            hindi: {
                prompt: "🎓 गीता ज्ञान: भगवद गीता 18 अध्यायों में विभाजित है, जो जीवन के विभिन्न पहलुओं पर प्रकाश डालती है। आप किस विषय के बारे में जानना चाहते हैं?",
                action: "knowledge_seeker"
            },
            english: {
                prompt: "🎓 Gita Knowledge: The Bhagavad Gita is divided into 18 chapters, each illuminating different aspects of life. What specific topic would you like to know about?",
                action: "knowledge_seeker"
            }
        }
    };

    const selected = choices[choice];
    if (selected) {
        const content = language === "Hindi" ? selected.hindi : selected.english;
        await sendViaHeltar(phone, content.prompt, `menu_${content.action}`);
        await updateUserState(phone, { 
            conversation_stage: content.action,
            last_menu_choice: choice
        });
    }
}

/* ========== IMPROVED AI RESPONSE SYSTEM ========== */
async function getAIResponse(phone, text, language, conversationContext = {}) {
  try {
    if (!OPENAI_KEY) {
      const fallbackResponses = {
        hindi: {
          greeting: "नमस्ते! मैं सारथी AI हूँ। आपकी कैसे मदद कर सकता हूँ?",
          general: "मैं आपकी बात समझ रहा हूँ। कृपया थोड़ा और विस्तार से बताएं।",
          question: "यह एक अच्छा प्रश्न है! मैं गीता के ज्ञान से आपकी मदद करना चाहूंगा।"
        },
        english: {
          greeting: "Hello! I'm Sarathi AI. How can I help you today?",
          general: "I understand what you're saying. Please share a bit more details.",
          question: "That's a good question! I'd love to help you with Gita wisdom."
        }
      };

      const responses = language === "Hindi" ? fallbackResponses.hindi : fallbackResponses.english;
      let response = responses.general;
      
      if (isGreetingQuery(text)) response = responses.greeting;
      if (text.includes('?')) response = responses.question;
      
      await sendViaHeltar(phone, response, "fallback");
      return;
    }

    const systemPrompt = language === "Hindi" 
      ? `आप सारथी AI हैं, एक दयालु भगवद गीता मार्गदर्शक। 2-3 वाक्यों में संक्षिप्त, उपयोगी उत्तर दें। गीता की शिक्षाओं से practical wisdom दें। गर्मजोशी और देखभाल दिखाएं। हिंदी में उत्तर दें।`
      : `You are Sarathi AI, a compassionate Bhagavad Gita guide. Give brief, helpful responses in 2-3 sentences. Provide practical wisdom from Gita teachings. Show warmth and care. Respond in English.`;

    const userPrompt = language === "Hindi" 
      ? `उपयोगकर्ता: "${text}"\n\nसंदर्भ: ${conversationContext.stage || 'सामान्य'}\n\nकृपया एक दयालु, संक्षिप्त उत्तर दें जो भगवद गीता की शिक्षाओं से जुड़ा हो:`
      : `User: "${text}"\n\nContext: ${conversationContext.stage || 'general'}\n\nPlease provide a kind, brief response connected to Bhagavad Gita teachings:`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const body = { 
      model: OPENAI_MODEL, 
      messages, 
      max_tokens: 300, 
      temperature: 0.7 
    };

    const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
      headers: { 
        Authorization: `Bearer ${OPENAI_KEY}`, 
        "Content-Type": "application/json" 
      },
      timeout: 25000
    });

    const aiResponse = resp.data?.choices?.[0]?.message?.content;
    if (aiResponse) {
      await sendViaHeltar(phone, aiResponse.slice(0, MAX_REPLY_LENGTH), "ai_response");
    } else {
      throw new Error("No response from AI");
    }

  } catch (err) {
    console.error("AI response error:", err.message);
    const fallback = language === "Hindi" 
      ? "मैं यहाँ आपके लिए हूँ। क्या आप अपनी बात थोड़ा और समझा सकते हैं? 💫"
      : "I'm here for you. Could you explain a bit more about what you need? 💫";
    await sendViaHeltar(phone, fallback, "error_fallback");
  }
}

/* ========== WEBHOOK PARSING ========== */
function parseWebhookMessage(body) {
  if (!body) return null;
  
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

/* ========== MAIN WEBHOOK HANDLER ========== */
app.post("/webhook", async (req, res) => {
  try {
    res.status(200).send("OK");

    const body = req.body || {};
    const msg = parseWebhookMessage(body);
    
    if (!msg) {
      console.log("⚠️ Ignoring non-message webhook event.");
      return;
    }

    const phone = msg?.from || msg?.clientWaNumber;
    const rawText = msg?.text?.body || msg?.button?.payload || "";
    const text = String(rawText || "").trim();
    
    if (!phone || text.length === 0) {
      console.warn("⚠️ Webhook missing phone/text.");
      return;
    }

    console.log(`📩 Incoming from ${phone}: "${text}"`);
    await trackIncoming(phone, text);

    // Get user state and determine language
    const user = await getUserState(phone);
    const languageResult = await determineUserLanguage(phone, text, user);
    const language = languageResult.language;
    const isLanguageSwitch = languageResult.isSwitch;

    console.log(`🎯 Processing: language=${language}, stage=${user.conversation_stage}, is_switch=${isLanguageSwitch}`);

    // If it's a language switch command, send confirmation and STOP processing
    if (isLanguageSwitch) {
      const confirmationMessage = languageResult.switchTo === 'English' 
        ? "Sure! I'll speak in English. How can I help you? 😊" 
        : "जरूर! मैं हिंदी में बात करूंगा। मैं आपकी कैसे मदद कर सकता हूँ? 😊";
      
      await sendViaHeltar(phone, confirmationMessage, "language_switch");
      return;
    }

    const lower = text.toLowerCase();

    // Emotion detection and follow-up check
    const emotionDetection = detectEmotionAdvanced(text);
    const detectedEmotion = emotionDetection ? emotionDetection.emotion : null;
    await checkAndSendFollowup(phone, user);

    console.log(`💭 Emotion detected: ${detectedEmotion}`);

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

    // 3. EMOTIONAL EXPRESSIONS (Empathy first)
    if (isEmotionalExpression(lower) || detectedEmotion) {
        console.log(`✅ Intent: Emotional Expression - ${detectedEmotion}`);
        const emotionToHandle = detectedEmotion || 'stressed';
        await handleEmotionalExpression(phone, text, language, user, emotionToHandle);
        return;
    }

    // 4. CAPABILITIES QUERIES
    if (isCapabilitiesQuery(lower)) {
        console.log(`✅ Intent: Capabilities Query`);
        const reply = language === "Hindi"
            ? "मैं सारथी AI हूँ, आपका निजी गीता साथी! 🙏 मैं आपको जीवन की चुनौतियों के लिए भगवद गीता का मार्गदर्शन प्रदान करता हूँ।"
            : "I'm Sarathi AI, your personal Gita companion! 🙏 I provide guidance from Bhagavad Gita for life's challenges.";
        await sendViaHeltar(phone, reply, "capabilities");
        return;
    }

    // 5. SMALL TALK
    if (isSmallTalk(lower)) {
        console.log(`✅ Intent: Small Talk`);
        let response;
        if (language === "Hindi") {
            if (lower.includes('thank')) {
                response = "आपका स्वागत है! 🙏 क्या आप और कुछ चाहेंगे?";
            } else if (lower.includes('bye')) {
                response = "धन्यवाद! जब भी जरूरत हो, मैं यहाँ हूँ। हरे कृष्ण! 🌟";
            } else {
                response = "ठीक है! 😊 आप आगे क्या जानना चाहेंगे?";
            }
        } else {
            if (lower.includes('thank')) {
                response = "You're welcome! 🙏 Is there anything else you need?";
            } else if (lower.includes('bye')) {
                response = "Thank you! I'm here whenever you need me. Hare Krishna! 🌟";
            } else {
                response = "Okay! 😊 What would you like to know more about?";
            }
        }
        await sendViaHeltar(phone, response, "small_talk");
        return;
    }

    // 6. DEFAULT: AI RESPONSE
    console.log(`ℹ️  Intent: General -> Using AI`);
    await getAIResponse(phone, text, language, {
        stage: user.conversation_stage,
        previousMessage: user.last_message
    });

  } catch (err) {
    console.error("❌ Webhook error:", err?.message || err);
  }
});

/* ---------------- Health check ---------------- */
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
