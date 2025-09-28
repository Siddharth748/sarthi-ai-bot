// index.js — SarathiAI (Complete Enhanced Version with User Fixes)
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

const MAX_REPLY_LENGTH = parseInt(process.env.MAX_REPLY_LENGTH || "800", 10) || 800;

const dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

/* ========== [CHANGE] ENHANCED GITA WISDOM DATABASE ========== */
const GITA_WISDOM_DATABASE = {
    anger: {
        verses: ["2.63", "2.62", "2.56"],
        teachings: {
            hindi: [
                "🌊 **क्रोध पर गीता का दृष्टिकोण:**\n\nकृष्ण कहते हैं: 'क्रोध से भ्रम पैदा होता है, भ्रम से बुद्धि नष्ट होती है' (2.63)।\n\n**व्यावहारिक उपाय:**\n1. श्वास पर ध्यान: 3 गहरी साँसें लें\n2. पूछें: 'क्या यह मेरे नियंत्रण में है?'\n3. 10 मिनट टहलें या जप करें\n\nक्या आप इनमें से कोई उपाय आज आज़माना चाहेंगे?",
                "⚡ **गुस्से का समाधान:**\n\nगीता (2.56) कहती है: 'दुःखेषु अनुद्विग्नमनाः' - दुख में जिसका मन विचलित नहीं होता।\n\n**तत्काल क्रिया:**\n• गिनती करें: 10 से 1 तक उल्टी\n• ठंडा पानी पिएं\n• 'ॐ शांति' का जप करें\n\nइनमें से कौन सा तरीका आपके लिए काम करेगा?"
            ],
            english: [
                "🌊 **Gita's Perspective on Anger:**\n\nKrishna says: 'From anger comes delusion; from delusion, confusion of memory' (2.63).\n\n**Practical Steps:**\n1. Breath awareness: Take 3 deep breaths\n2. Ask: 'Is this within my control?'\n3. Walk for 10 minutes or chant\n\nWould you like to try any of these techniques today?",
                "⚡ **Managing Anger Effectively:**\n\nThe Gita (2.56) teaches: 'Be undisturbed in sorrow.'\n\n**Immediate Actions:**\n• Count backwards from 10 to 1\n• Drink cool water\n• Chant 'Om Shanti'\n\nWhich of these approaches might work for you?"
            ]
        }
    },
    stress: {
        verses: ["2.47", "2.48", "2.50"],
        teachings: {
            hindi: [
                "🧘 **तनाव प्रबंधन गीता से:**\n\n'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन' (2.47) - कर्तव्य पर ध्यान दें, परिणाम पर नहीं।\n\n**व्यावहारिक अभ्यास:**\n1. प्रतिदिन 5 मिनट ध्यान\n2. एक समय में एक काम\n3. शाम को तनाव मुक्त समय\n\nक्या आप इनमें से किसी अभ्यास को शुरू कर सकते हैं?",
                "🌅 **तनाव से मुक्ति:**\n\n'योगस्थः कुरु कर्माणि' (2.48) - संतुलित मन से कर्म करो।\n\n**दैनिक रूपरेखा:**\n• सुबह 10 मिनट प्राणायाम\n• काम के बीच में छोटे ब्रेक\n• रात को कृतज्ञता पत्रिका\n\nआज से कौन सा अभ्यास शुरू करेंगे?"
            ],
            english: [
                "🧘 **Stress Management from Gita:**\n\n'You have right to work only, never to its fruits' (2.47).\n\n**Practical Practices:**\n1. 5-minute daily meditation\n2. One task at a time\n3. Stress-free evening time\n\nCould you start any of these practices today?",
                "🌅 **Freedom from Stress:**\n\n'Perform action, O Arjuna, being steadfast in yoga' (2.48).\n\n**Daily Framework:**\n• 10 min morning pranayama\n• Short breaks between work\n• Evening gratitude journal\n\nWhich practice would you like to start with?"
            ]
        }
    },
    sadness: {
        verses: ["2.14", "2.22", "2.27"],
        teachings: {
            hindi: [
                "💫 **दुख का गीता समाधान:**\n\n'दुःखेषु अनुद्विग्नमनाः' (2.14) - दुख में अविचलित रहें।\n\n**उपचार योजना:**\n1. प्रकृति में समय बिताएं\n2. सेवा कार्य में भाग लें\n3. प्रेरणादायक पाठ पढ़ें\n\nक्या आप आज किसी एक गतिविधि का चयन कर सकते हैं?",
                "✨ **उदासी से उबरने के उपाय:**\n\n'जातस्य हि ध्रुवो मृत्युः' (2.27) - जो जन्मा है उसकी मृत्यु निश्चित है।\n\n**सकारात्मक कदम:**\n• किसी मित्र से बात करें\n• हल्का व्यायाम करें\n• संगीत सुनें या भजन गाएं\n\nआपके लिए सबसे उपयुक्त विकल्प कौन सा है?"
            ],
            english: [
                "💫 **Gita's Solution for Sadness:**\n\n'Be undisturbed in sorrow' (2.14).\n\n**Healing Plan:**\n1. Spend time in nature\n2. Engage in service work\n3. Read inspiring texts\n\nCan you choose one activity for today?",
                "✨ **Overcoming Sadness:**\n\n'Death is certain for one who is born' (2.27).\n\n**Positive Steps:**\n• Talk to a friend\n• Light exercise\n• Listen to music or bhajans\n\nWhich option seems most suitable for you?"
            ]
        }
    },
    purpose: {
        verses: ["2.47", "3.35", "18.46"],
        teachings: {
            hindi: [
                "🌅 **जीवन के उद्देश्य की खोज:**\n\nगीता (3.35) कहती है: 'स्वधर्मे निधनं श्रेय:' - अपने धर्म में रहते हुए मरना भी श्रेयस्कर है।\n\nजब आप खोया हुआ महसूस कर रहे हों, तो याद रखें:\n• आपका उद्देश्य बाहर नहीं, आपके भीतर है\n• छोटे-छोटे कर्मों से शुरुआत करें\n• प्रतिदिन स्वयं से पूछें: 'आज मैं किसकी सेवा कर सकता हूँ?'\n\nक्या आप आज एक छोटा सा कर्म करने का संकल्प लेंगे?",
                "💫 **अर्थ की खोज:**\n\n'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन' (2.47) - कर्तव्य पर ध्यान दें, परिणाम पर नहीं।\n\n**खोज के चरण:**\n1. अपनी प्रतिभाओं की सूची बनाएं\n2. देखें समाज को किसकी आवश्यकता है\n3. वहां सेवा करें जहां दोनों मिलते हैं\n\nआपकी कौन सी प्रतिभा आज किसी की मदद कर सकती है?"
            ],
            english: [
                "🌅 **Finding Life's Purpose:**\n\nGita (3.35) teaches: 'Better is one's own duty though imperfect' - Your unique path matters most.\n\nWhen feeling lost, remember:\n• Your purpose isn't out there, it's within you\n• Start with small, meaningful actions\n• Ask daily: 'Who can I serve today?'\n\nWould you like to commit to one small purposeful action today?",
                "💫 **The Search for Meaning:**\n\n'You have right to work only, never to its fruits' (2.47).\n\n**Discovery Steps:**\n1. List your natural talents and joys\n2. Observe where society needs help\n3. Serve where your gifts meet others' needs\n\nWhich of your talents could help someone today?"
            ]
        }
    },
    dharma: {
        verses: ["3.35", "18.45", "18.47"],
        teachings: {
            hindi: [
                "🎯 **स्वधर्म की पहचान:**\n\nगीता (3.35) कहती है: 'स्वधर्मे निधनं श्रेय:' - अपना धर्म दूसरे के धर्म से बेहतर है।\n\n**पहचान के तरीके:**\n1. बचपन में क्या करना पसंद था?\n2. लोग आपसे किस लिए सहायता मांगते हैं?\n3. कौन सा काम करते समय समय का पता नहीं चलता?\n\nइनमें से कौन सा प्रश्न आपके लिए सबसे सार्थक लगता है?",
                "🌟 **कर्तव्य का मार्ग:**\n\n'स्वे स्वे कर्मण्यभिरतः' (18.45) - अपने कर्म में तल्लीन रहें।\n\n**आत्म-खोज के प्रश्न:**\n• किस काम को करने में आपको ऊर्जा मिलती है?\n• आपकी कौन सी विशेषता लोगों को आकर्षित करती है?\n• किस सेवा में आपको आनंद आता है?\n\nआज आप किस एक प्रश्न पर विचार करना चाहेंगे?"
            ],
            english: [
                "🎯 **Discovering Your Dharma:**\n\nGita (3.35): 'Better is one's own duty though imperfect' - Your unique path is your perfection.\n\n**Self-Discovery Questions:**\n1. What did you love doing as a child?\n2. What do people naturally ask your help for?\n3. What work makes you lose track of time?\n\nWhich question resonates most with you right now?",
                "🌟 **The Path of Right Action:**\n\n'By devotion to one's own duty' (18.45) - Excellence comes from embracing your nature.\n\n**Reflection Points:**\n• What activities give you energy rather than drain you?\n• What unique perspective do you bring to challenges?\n• Where does your compassion naturally flow?\n\nWould you like to explore any of these reflection points further?"
            ]
        }
    },
    motivation: {
        verses: ["2.47", "2.50", "6.5"],
        teachings: {
            hindi: [
                "💪 **निरंतर प्रेरणा:**\n\nगीता (2.50) कहती है: 'योगः कर्मसु कौशलम्' - कर्म में कुशलता ही योग है।\n\n**प्रेरणा बनाए रखने के उपाय:**\n1. छोटे-छोटे लक्ष्य बनाएं\n2. प्रतिदिन की सफलताओं को लिखें\n3. अपने 'क्यों' को याद रखें\n\nआज आप कौन सा छोटा कदम उठा सकते हैं?",
                "🚀 **मुश्किल समय में आगे बढ़ें:**\n\n'कर्मण्येवाधिकारस्ते' (2.47) - कर्तव्य पर ध्यान दें, परिणाम पर नहीं।\n\n**तत्काल कार्ययोजना:**\n• आज का एक छोटा सा काम पूरा करें\n• खुद को एक छोटा इनाम दें\n• कल के बारे में सोचें, सालों बाद के बारे में नहीं\n\nआज आप किस एक काम पर फोकस करना चाहेंगे?"
            ],
            english: [
                "💪 **Sustaining Motivation:**\n\nGita (2.50): 'Yoga is skill in action' - Excellence comes from focused effort.\n\n**Motivation Boosters:**\n1. Set tiny, achievable goals\n2. Celebrate daily micro-wins\n3. Reconnect with your 'why'\n\nWhat's one small step you can take today?",
                "🚀 **Moving Forward in Tough Times:**\n\n'You have right to work only' (2.47) - Focus on action, not outcomes.\n\n**Immediate Action Plan:**\n• Complete one small task right now\n• Give yourself a mini-reward\n• Think about tomorrow, not years ahead\n\nWhat's one thing you'd like to focus on completing today?"
            ]
        }
    }
};

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
        reflection_question TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert sample lessons if table is empty
    const lessonCount = await client.query("SELECT COUNT(*) FROM lessons");
    if (parseInt(lessonCount.rows[0].count) === 0) {
      console.log("📚 Inserting sample lessons...");
      await client.query(`
        INSERT INTO lessons (lesson_number, verse, translation, commentary, reflection_question) VALUES
        (1, 'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।', 'You have the right to work only, but never to the fruits.', 'Focus on your duty without attachment to results. This is the path to peace and success.', 'What action can I take today without worrying about the outcome?'),
        (2, 'योगस्थः कुरु कर्माणि सङ्गं त्यक्त्वा धनञ्जय।', 'Perform your duty equipoised, O Arjuna, abandoning all attachment to success or failure.', 'Balance and equanimity lead to excellence in work and peace in life.', 'How can I stay balanced in challenging situations today?'),
        (3, 'श्रेयो हि ज्ञानमभ्यासाज्ज्ञानाद्ध्यानं विशिष्यते।', 'Better than practice is knowledge, better than knowledge is meditation.', 'True wisdom comes from deep contemplation and self-awareness.', 'What can I meditate on today to gain deeper understanding?'),
        (4, 'उद्धरेदात्मनात्मानं नात्मानमवसादयेत्।', 'Elevate yourself by yourself; do not degrade yourself.', 'You are your own best friend and worst enemy. Choose to uplift yourself.', 'How can I encourage myself today?'),
        (5, 'समत्वं योग उच्यते।', 'Equanimity is called yoga.', 'True yoga is maintaining mental balance in all circumstances.', 'Where can I practice equanimity in my life today?')
      `);
    }

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

/* ========== ENHANCED HINDI LANGUAGE DETECTION ========== */
function detectLanguageFromText(text) {
  if (!text || typeof text !== "string") return "English";
  
  const cleanText = text.trim().toLowerCase();
  
  // 1. ABSOLUTE PRIORITY: Hindi characters (Devanagari Unicode range)
  if (/[\u0900-\u097F]/.test(text)) {
    console.log("🔤 Hindi detected: Devanagari characters found");
    return "Hindi";
  }
  
  // 2. EXPLICIT language commands (HIGHEST PRIORITY - fix this)
  if (cleanText.includes('english') || cleanText.includes('speak english') || cleanText.includes('angrezi')) {
    return "English";
  }
  if (cleanText.includes('hindi') || cleanText.includes('speak hindi') || cleanText.includes('hind')) {
    return "Hindi";
  }
  
  // 3. Fix: Common English greetings should be English
  const englishGreetings = ['hi', 'hello', 'hey', 'hii', 'hiya', 'hola', 'sup', 'good morning', 'good afternoon', 'good evening'];
  if (englishGreetings.some(greeting => cleanText === greeting || cleanText.startsWith(greeting))) {
    return "English";
  }
  
  // 4. Hindi greetings in Roman script
  const hindiGreetings = ['namaste', 'namaskar', 'pranam', 'radhe radhe', 'hare krishna', 'jai shri krishna'];
  if (hindiGreetings.some(greeting => cleanText === greeting || cleanText.startsWith(greeting))) {
    return "Hindi";
  }
  
  // 5. If it contains only English letters and common punctuation, it's English
  if (/^[a-zA-Z\s\?\!\.\,\']+$/.test(text)) {
    return "English";
  }
  
  // 6. Romanized Hindi indicators
  const strongHindiIndicators = [
    'kyu', 'kya', 'kaise', 'karo', 'kiya', 'mera', 'tera', 'apna', 'hai', 'ho', 'hun',
    'main', 'tum', 'aap', 'ko', 'ka', 'ki', 'ke', 'se', 'mein', 'par', 'aur', 'lekin'
  ];
  
  const hindiWordCount = strongHindiIndicators.filter(word => 
    new RegExp(`\\b${word}\\b`).test(cleanText)
  ).length;
  
  if (hindiWordCount >= 2) {
    return "Hindi";
  }
  
  // 7. Default to English for safety
  return "English";
}

/* ========== IMPROVED LANGUAGE MANAGEMENT ========== */
async function determineUserLanguage(phone, text, user) {
  let currentLanguage = user.language_preference || 'English';
  const detectedLanguage = detectLanguageFromText(text);
  const cleanText = text.toLowerCase().trim();
  
  // FIX: Check for explicit language commands first
  const isLanguageSwitchCommand = 
    cleanText.includes('english') || 
    cleanText.includes('hindi') ||
    cleanText.includes('speak english') ||
    cleanText.includes('speak hindi');
  
  console.log(`🔤 Language: user_pref=${currentLanguage}, detected=${detectedLanguage}, is_switch=${isLanguageSwitchCommand}, text="${text}"`);
  
  // If it's a language switch command, handle it immediately
  if (isLanguageSwitchCommand) {
    let newLanguage = currentLanguage; // default to current
    
    if (cleanText.includes('english')) {
      newLanguage = 'English';
    } else if (cleanText.includes('hindi')) {
      newLanguage = 'Hindi';
    }
    
    // Only update if language actually changed
    if (newLanguage !== currentLanguage) {
      await updateUserState(phone, { 
        language_preference: newLanguage,
        conversation_stage: 'new_topic'
      });
      console.log(`🔄 Language switched to ${newLanguage}`);
      return { language: newLanguage, isSwitch: true, switchTo: newLanguage };
    }
  }
  
  // For new users or when detection strongly suggests a change
  const isNewUser = (user.total_incoming || 0) <= 2;
  
  if (isNewUser && detectedLanguage === 'Hindi' && currentLanguage === 'English') {
    currentLanguage = 'Hindi';
    await updateUserState(phone, { language_preference: 'Hindi' });
    console.log(`🔄 New user language switched to Hindi based on detection`);
  }
  
  // If user consistently uses a language, adapt
  if (detectedLanguage !== currentLanguage && (user.total_incoming || 0) > 3) {
    const recentMessages = user.chat_history?.slice(-3) || [];
    const detectedLanguageCount = recentMessages.filter(msg => 
      msg.role === 'user' && detectLanguageFromText(msg.content) === detectedLanguage
    ).length;
    
    if (detectedLanguageCount >= 2) {
      currentLanguage = detectedLanguage;
      await updateUserState(phone, { language_preference: detectedLanguage });
      console.log(`🔄 Adaptive language switch to ${detectedLanguage} based on recent usage`);
    }
  }
  
  return { language: currentLanguage, isSwitch: false };
}

/* ========== INTENT CLASSIFICATION ========== */
/* ========== GREETING DETECTION FUNCTION ========== */
function isGreetingQuery(text) {
    if (!text || typeof text !== "string") return false;
    
    const lowerText = text.toLowerCase().trim();
    const greetingRegex = /\b(hi|hello|hey|hii|hiya|yo|good morning|good afternoon|good evening|how are you|what's up|how's it going|kaise ho|kaise hain aap|namaste|hare krishna|hola|sup)\b/i;
    
    // Fix: Also check for simple greetings without word boundaries
    const simpleGreetings = ['hi', 'hello', 'hey', 'hii', 'namaste', 'hola', 'sup'];
    if (simpleGreetings.includes(lowerText)) {
        return true;
    }
    
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
        /\b(परेशान|तनाव|चिंता|घबराहट|दबाव|उलझन|मन परेशान|दिल परेशान|मन भारी)\b/,
        
        // Sadness/Depression - ENHANCED HINDI PATTERNS
        /\b(sad|sadness|depressed|depression|unhappy|miserable|hopeless|down|low|sorrow|lonely)\b/i,
        /\b(i am sad|i feel sad|i'm sad|feeling down|feeling low|feeling lonely)\b/i,
        /\b(दुखी|उदास|निराश|हताश|दुख|उदासी|अकेला|अकेलापन|तन्हाई|मन उदास|दिल टूटा)\b/,
        
        // Life problems (enhanced detection)
        /\b(my life|married life|relationship|husband|wife|family|job|work|career).*(problem|issue|difficult|hard|trouble|disturb|bad)\b/i,
        /\b(जीवन|शादी|रिश्ता|पति|पत्नी|परिवार|नौकरी|काम).*(समस्या|परेशानी|मुश्किल|बुरा|खराब)\b/,
        
        // General distress - IMPROVED PATTERNS
        /\b(not good|not well|feeling bad|going through|facing problem|having issue|i am struggling)\b/i,
        /\b(i can't handle|i can't cope|it's too much|too much pressure)\b/i,
        /\b(अच्छा नहीं|ठीक नहीं|बुरा लग|मुश्किल हो|परेशानी हो|संघर्ष कर|मुश्किल में|परेशानी में)\b/,
        
        // Hindi-specific emotional expressions
        /\b(मन भारी|दिल टूट|टेंशन|फिक्र|चिंतित|घबराया|निराशाजनक|तंग आ गया|हार मान ली)\b/,
        /\b(मेरा मन|मेरा दिल).*(परेशान|दुखी|उदास|भारी|टूट|बेचैन)\b/,
        
        // Confusion/Uncertainty
        /\b(confused|lost|uncertain|don't know|what to do|which way|कंफ्यूज|उलझन|पता नहीं|क्या करूं|रास्ता नहीं)\b/i,
        
        // Physical symptoms of stress
        /\b(can't sleep|sleep problems|headache|tired|exhausted|fatigue|can't focus)\b/i,
        /\b(नींद नहीं|सिर दर्द|थकान|कमजोरी|बेचैनी|चैन नहीं)\b/
    ];
    
    return emotionalPatterns.some(pattern => pattern.test(lowerText));
}

function isOutOfScopeQuery(text) {
    const lowerText = text.toLowerCase();
    const outOfScopePatterns = [
        /\b(restaurant|hotel|food|eat|drink|coffee|tea|menu|price|cost|location|address|phone|number)\b/i,
        /\b(रेस्तरां|होटल|खाना|पीना|कॉफी|चाय|मेनू|दाम|लोकेशन|पता|फोन|नंबर)\b/,
        /\b(weather|movie|music|game|sports|news|politics|stock|market|shopping|buy|sell)\b/i,
        /\b(मौसम|फिल्म|संगीत|खेल|खबर|राजनीति|शेयर|बाजार|खरीद|बेच)\b/
    ];
    
    return outOfScopePatterns.some(pattern => pattern.test(lowerText));
}

/* ========== [CHANGE] ENHANCED EMOTION DETECTION FOR PURPOSE/MEANING ========== */
function detectEmotionAdvanced(text) {
    const lowerText = text.toLowerCase();
    let emotion = null;
    let confidence = 0;

    const emotionKeywords = {
        purpose: { 
            keywords: [
                'purpose', 'meaning', 'why am i here', 'what is my life', 'reason to live',
                'lost purpose', 'no purpose', 'empty', 'aimless', 'directionless',
                'what should i do with my life', 'life purpose', 'existential',
                'उद्देश्य', 'मकसद', 'जीवन का मतलब', 'क्यों हूँ', 'रास्ता नहीं', 'दिशा नहीं',
                'ज़िंदगी का मकसद', 'कोई उद्देश्य नहीं', 'खालीपन', 'निरर्थक', 'जीवन सार्थक नहीं'
            ], 
            weight: 1.2 
        },
        dharma: { 
            keywords: [
                'dharma', 'duty', 'calling', 'vocation', 'life purpose', 'swadharma',
                'career path', 'what should i do', 'which path', 'right path',
                'धर्म', 'कर्तव्य', 'स्वधर्म', 'जीवन का धर्म', 'क्या करूं', 'कैसे पहचानूं',
                'अपना काम', 'सही रास्ता', 'जीवन का उद्देश्य', 'करियर', 'पेशा'
            ], 
            weight: 1.1 
        },
        motivation: {
            keywords: [
                'motivated', 'motivation', 'stay motivated', 'keep going', 'demotivated',
                'things not going my way', 'stuck', 'not progressing', 'frustrated',
                'प्रेरणा', 'मोटिवेशन', 'हिम्मत', 'जोश', 'अटका हुआ', 'आगे नहीं बढ़ रहा',
                'निराश', 'हार मान ली', 'जारी रखें'
            ],
            weight: 1.0
        },
        stressed: { 
            keywords: [
                'stress', 'stressed', 'stressing', 'anxious', 'anxiety', 'tension', 'overwhelmed', 
                'worried', 'worrying', 'pressure', 'can\'t handle', 'too much', 'overwhelming', 
                'परेशान', 'तनाव', 'चिंता', 'घबराहट', 'दबाव', 'टेंशन'
            ], 
            weight: 1.0 
        },
        sadness: { 
            keywords: [
                'sad', 'depressed', 'unhappy', 'hopeless', 'sorrow', 'crying', 'tears',
                'empty', 'down', 'low', 'lonely', 'lost', 'confused about life',
                'दुखी', 'उदास', 'निराश', 'हताश', 'दुख', 'उदासी', 'अकेला', 'अकेलापन'
            ], 
            weight: 1.0 
        }
    };

    // Enhanced patterns with better context
    const iAmPatterns = [
        // Purpose patterns
        { pattern: /\b(i am|i'm|feeling).*(lost|empty|aimless|directionless|purposeless)\b/i, emotion: 'purpose', weight: 1.5 },
        { pattern: /\b(what is|what's).*(purpose|meaning).*(life|my life)\b/i, emotion: 'purpose', weight: 1.5 },
        { pattern: /\b(मैं|मुझे).*(खोया|खोया हुआ|खाली|निरर्थक|उद्देश्यहीन)\b/i, emotion: 'purpose', weight: 1.5 },
        
        // Dharma patterns
        { pattern: /\b(how do i know|how to find).*(dharma|duty|calling|purpose)\b/i, emotion: 'dharma', weight: 1.4 },
        { pattern: /\b(what is|what should be).*(my duty|my dharma|my calling)\b/i, emotion: 'dharma', weight: 1.4 },
        { pattern: /\b(कैसे पहचानूं|क्या है).*(मेरा धर्म|मेरा कर्तव्य|मेरा स्वधर्म)\b/i, emotion: 'dharma', weight: 1.4 },
        
        // Motivation patterns
        { pattern: /\b(stay|keep).*motivated\b/i, emotion: 'motivation', weight: 1.3 },
        { pattern: /\b(things|life).*(not going|not working)\b/i, emotion: 'motivation', weight: 1.3 },
        { pattern: /\b(कैसे बनाएं|कैसे रखें).*(प्रेरणा|मोटिवेशन|हिम्मत)\b/i, emotion: 'motivation', weight: 1.3 }
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
        /\b(thanks|thank you|ok|okay|good|nice|cool|great|awesome|fine|good job|well done|शुक्रिया|धन्यवाद|ठीक|अच्छा|बढ़िया|बहुत अच्छा)\b/i,
        /\b(bye|goodbye|see you|talk later|stop|end|बाय|अलविदा|फिर मिलेंगे|रुकिए|बंद करो)\b/i,
        /\b(haha|hehe|lol|hihi|😂|😊|🙏|❤️|✨|👍)\b/i
    ];
    return smallTalkPatterns.some(pattern => pattern.test(lowerText));
}

function detectUserSituation(text) {
  const lowerText = text.toLowerCase();
  
  const situations = {
    work: /(job|work|office|career|boss|colleague|नौकरी|काम|कार्यालय|सहकर्मी)/.test(lowerText),
    relationships: /(relationship|husband|wife|family|friend|partner|love|पति|पत्नी|परिवार|दोस्त|प्रेम)/.test(lowerText),
    health: /(health|sick|pain|ill|hospital|doctor|स्वास्थ्य|बीमार|दर्द|तबीयत|डॉक्टर)/.test(lowerText),
    finance: /(money|finance|debt|rich|poor|salary|income|पैसा|वित्त|कर्ज|अमीर|गरीब|वेतन)/.test(lowerText),
    studies: /(study|exam|student|school|college|education|पढ़ाई|परीक्षा|विद्यार्थी|शिक्षा)/.test(lowerText),
    spiritual: /(god|prayer|meditation|yoga|spiritual|भगवान|प्रार्थना|ध्यान|योग|आध्यात्मिक)/.test(lowerText)
  };
  
  return Object.keys(situations).find(situation => situations[situation]) || 'general';
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
            hindi: "🌅 7-8 घंटे पहले आपने तनाव की बात की थी। क्या अब आपको थोड़ा बेहतर महसूस हो रहा है? अगर अभी भी परेशानी हो तो बात कर सकते हैं। 🙏",
            english: "🌅 You mentioned feeling stressed 7-8 hours ago. Are you feeling a bit better now? If you're still troubled, we can talk about it. 🙏"
        },
        sadness: {
            hindi: "💫 कुछ घंटे पहले आप उदास महसूस कर रहे थे। क्या अब आपके मन को थोड़ी शांति मिली है? कैसा महसूस हो रहा है अब?",
            english: "💫 You were feeling sad a few hours ago. Has your mind found some peace now? How are you feeling currently?"
        },
        anger: {
            hindi: "☁️ पहले की बातचीत में आप नाराज़गी महसूस कर रहे थे। क्या अब स्थिति बेहतर है? कोई नई बात साझा करना चाहेंगे?",
            english: "☁️ You mentioned feeling angry earlier. Has the situation improved? Would you like to share any updates?"
        }
    };

    const message = followupMessages[previousEmotion] || {
        hindi: "🌼 कुछ घंटे पहले की हमारी बातचीत के बाद, क्या आप अब बेहतर महसूस कर रहे हैं? आपकी भावनाओं में कोई बदलाव आया है?",
        english: "🌼 Since our conversation a few hours ago, are you feeling better now? Has there been any change in how you feel?"
    };

    const text = language === "Hindi" ? message.hindi : message.english;
    await sendViaHeltar(phone, text, "emotional_followup");
}

/* ========== [CHANGE] FIXED: EMOTIONAL RESPONSE HANDLER ========== */
async function handleEmotionalExpression(phone, text, language, user, detectedEmotion) {
  console.log(`💔 Handling emotional expression: ${detectedEmotion}`);
  
  // Enhanced context for emotional responses
  const conversationContext = {
    stage: "emotional_support",
    emotion: detectedEmotion,
    situation: detectUserSituation(text),
    previousMessage: user.last_message,
    language: language
  };

  // Use AI for emotional responses instead of fixed responses
  await getAIResponse(phone, text, language, conversationContext);
  
  // Update user state
  await updateUserState(phone, { conversation_stage: "emotional_support" });
  
  // Store emotion for follow-up
  await storeUserMemory(phone, 'last_emotion', detectedEmotion, 8);
  await storeUserMemory(phone, 'emotion_detected_time', new Date().toISOString(), 8);
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

/* ========== MENU CHOICE HANDLER ========== */
async function handleEnhancedMenuChoice(phone, choice, language, user) {
  console.log(`📝 Menu choice received: ${choice}, language: ${language}`);
  
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
        prompt: async () => {
          const wisdom = await getDailyWisdom("Hindi");
          return wisdom;
        },
        action: "daily_wisdom"
      },
      english: {
        prompt: async () => {
          const wisdom = await getDailyWisdom("English");
          return wisdom;
        },
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
  if (!selected) {
    console.error(`❌ Invalid menu choice: ${choice}`);
    const errorMessage = language === "Hindi" 
      ? "कृपया 1, 2, 3 या 4 में से चुनें।"
      : "Please choose 1, 2, 3, or 4.";
    await sendViaHeltar(phone, errorMessage, "menu_error");
    return;
  }

  try {
    let promptContent;
    const selectedLang = selected[language] || selected.english;
    
    if (typeof selectedLang.prompt === 'function') {
      // Handle async functions for daily wisdom
      promptContent = await selectedLang.prompt();
    } else {
      promptContent = selectedLang.prompt;
    }
    
    console.log(`✅ Sending menu response for choice ${choice}`);
    await sendViaHeltar(phone, promptContent, `menu_${selectedLang.action}`);
    await updateUserState(phone, { 
      conversation_stage: selectedLang.action,
      last_menu_choice: choice,
      last_menu_shown: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Menu choice error for ${choice}:`, error);
    const fallbackMessage = language === "Hindi" 
      ? "क्षमा करें, तकनीकी समस्या आई है। कृपया पुनः प्रयास करें।"
      : "Sorry, there was a technical issue. Please try again.";
    await sendViaHeltar(phone, fallbackMessage, "menu_error");
  }
}

/* ========== ENHANCED DAILY WISDOM WITH PRACTICAL STEPS ========== */
async function getDailyWisdom(language) {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    
    const countResult = await dbPool.query("SELECT COUNT(*) as total FROM lessons");
    const totalLessons = parseInt(countResult.rows[0].total) || 5;
    const lessonNumber = (dayOfYear % totalLessons) + 1;
    
    const result = await dbPool.query(
      `SELECT lesson_number, verse, translation, commentary, reflection_question 
       FROM lessons WHERE lesson_number = $1`,
      [lessonNumber]
    );
    
    if (result.rows.length === 0) {
      return getFallbackDailyWisdom(language, dayOfYear);
    }
    
    const lesson = result.rows[0];
    return formatDailyWisdom(lesson, language, dayOfYear);
    
  } catch (error) {
    console.error("Daily wisdom error:", error);
    return getFallbackDailyWisdom(language, 1);
  }
}

function formatDailyWisdom(lesson, language, dayOfYear) {
  if (language === "Hindi") {
    return `📖 *आज की गीता शिक्षा (दिन ${dayOfYear})*

🎯 *श्लोक ${lesson.lesson_number}:*
"${lesson.verse}"

💫 *अर्थ:*
${lesson.translation}

🌅 *व्यावहारिक अनुप्रयोग:*
${lesson.commentary}

🤔 *आज का अभ्यास:*
${lesson.reflection_question}

✨ *तत्काल कार्ययोजना:*
1. इस श्लोक को 3 बार पढ़ें
2. दिन में 2 बार इसपर विचार करें
3. शाम को परिणाम साझा करें

क्या आप आज इस अभ्यास को करने का संकल्प लेंगे?`;
  } else {
    return `📖 *Today's Gita Wisdom (Day ${dayOfYear})*

🎯 *Verse ${lesson.lesson_number}:*
"${lesson.verse}"

💫 *Translation:*
${lesson.translation}

🌅 *Practical Application:*
${lesson.commentary}

🤔 *Today's Practice:*
${lesson.reflection_question}

✨ *Immediate Action Plan:*
1. Read this verse 3 times
2. Reflect on it twice today
3. Share insights tonight

Will you commit to this practice today?`;
  }
}

function getFallbackDailyWisdom(language, dayOfYear) {
  const fallbackLesson = {
    lesson_number: 2,
    verse: "योगस्थः कुरु कर्माणि सङ्गं त्यक्त्वा धनञ्जय।",
    translation: "Perform your duty equipoised, O Arjuna, abandoning all attachment to success or failure.",
    commentary: "Practice working with balanced mind amidst challenges.",
    reflection_question: "How can I maintain balance in my work today?"
  };
  
  return formatDailyWisdom(fallbackLesson, language, dayOfYear);
}

/* ========== [CHANGE] FIXED: PROPER AI RESPONSE FLOW ========== */
async function getAIResponse(phone, text, language, conversationContext = {}) {
  try {
    // Only use fallback if OpenAI is completely unavailable
    if (!OPENAI_KEY || OPENAI_KEY === '') {
      console.log("🔄 No OpenAI key, using fallback response");
      return await getFallbackResponse(phone, text, language, conversationContext);
    }

    console.log("🤖 Using OpenAI for dynamic response...");

    // Enhanced system prompt with empathy and context awareness
    const systemPrompt = language === "Hindi" 
      ? `आप सारथी AI हैं, भगवद गीता के विशेषज्ञ मार्गदर्शक। निम्नलिखित नियमों का सख्ती से पालन करें:

1. पहले उपयोगकर्ता की भावना को समझें और सहानुभूति दिखाएं
2. SPECIFIC गीता श्लोक संदर्भ दें (जैसे "2.47", "3.35")
3. व्यावहारिक क्रिया-योजना प्रदान करें (2-3 चरणों में)
4. उत्तर 4-6 वाक्यों में पूरा करें, कभी भी अधूरा न छोड़ें
5. उत्तर के अंत में एक सार्थक प्रश्न पूछें
6. उपयोगकर्ता की विशिष्ट स्थिति से जोड़ें

उदाहरण संरचना:
"मैं समझता हूँ कि आप [भावना] महसूस कर रहे हैं... गीता [श्लोक] में कहती है... आपकी स्थिति में यह इस प्रकार लागू होता है... [व्यावहारिक सलाह]... क्या आप [प्रश्न]?"

कभी भी सामान्य थेरेपी जैसी बातें न करें। सीधे गीता की शिक्षाओं से जोड़ें।`
      : `You are Sarathi AI, an expert Bhagavad Gita guide. Strictly follow these rules:

1. First acknowledge and empathize with user's emotion
2. Include SPECIFIC Gita verse references (e.g., "2.47", "3.35")
3. Provide practical action plans (2-3 steps)
4. Complete answers in 4-6 sentences, NEVER leave incomplete
5. End with a meaningful question
6. Connect to user's specific situation

Example structure:
"I understand you're feeling [emotion]... The Gita [verse] teaches... This applies to your situation by... [practical advice]... Would you like to [question]?"

Never use generic therapy language. Directly connect to Gita teachings.`;

    // Enhanced user prompt with better context
    const userContext = {
      emotion: conversationContext.emotion || 'uncertain',
      situation: conversationContext.situation || 'general',
      stage: conversationContext.stage || 'general',
      language: language
    };

    const userPrompt = language === "Hindi" 
      ? `उपयोगकर्ता: "${text}"
भावना: ${userContext.emotion}
स्थिति: ${userContext.situation}
संदर्भ: ${userContext.stage}

कृपया एक संपूर्ण, सहानुभूतिपूर्ण उत्तर दें जो भगवद गीता की शिक्षाओं से सीधे जुड़ा हो। उपयोगकर्ता की विशिष्ट स्थिति को ध्यान में रखें:`
      : `User: "${text}"
Emotion: ${userContext.emotion}
Situation: ${userContext.situation}
Context: ${userContext.stage}

Please provide a complete, empathetic response directly connected to Bhagavad Gita teachings. Consider the user's specific situation:`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    console.log("📤 Sending to OpenAI with context:", userContext);

    const body = { 
      model: OPENAI_MODEL, 
      messages, 
      max_tokens: 600,  // Increased to prevent truncation
      temperature: 0.8, // Slightly higher for more varied responses
      top_p: 0.9
    };

    const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
      headers: { 
        Authorization: `Bearer ${OPENAI_KEY}`, 
        "Content-Type": "application/json" 
      },
      timeout: 30000
    });

    const aiResponse = resp.data?.choices?.[0]?.message?.content;
    
    if (aiResponse && aiResponse.trim().length > 10) {
      console.log("✅ OpenAI response received:", aiResponse.substring(0, 100) + "...");
      
      // Ensure response is complete and not truncated
      const completeResponse = ensureCompleteResponse(aiResponse, language);
      const finalResponse = completeResponse.slice(0, MAX_REPLY_LENGTH);
      
      await sendViaHeltar(phone, finalResponse, "ai_response");
      return;
    } else {
      throw new Error("Empty or invalid response from OpenAI");
    }

  } catch (err) {
    console.error("❌ AI response error:", err.message);
    
    // Only fallback to fixed responses if OpenAI completely fails
    console.log("🔄 Falling back to fixed response due to OpenAI error");
    await getFallbackResponse(phone, text, language, conversationContext);
  }
}

/* ========== [CHANGE] ENHANCED FALLBACK RESPONSES ========== */
async function getFallbackResponse(phone, text, language, conversationContext = {}) {
  console.log("🔄 Using enhanced fallback response");
  
  const emotion = detectEmotionAdvanced(text)?.emotion;
  console.log(`🎯 Detected emotion for fallback: ${emotion}`);
  
  const gitaWisdom = GITA_WISDOM_DATABASE[emotion] || GITA_WISDOM_DATABASE.purpose;
  
  const responses = language === "Hindi" 
    ? gitaWisdom.teachings.hindi 
    : gitaWisdom.teachings.english;
  
  const selectedResponse = responses[Math.floor(Math.random() * responses.length)];
  
  console.log(`📤 Sending fallback response for emotion: ${emotion}`);
  await sendViaHeltar(phone, selectedResponse, "fallback_wisdom");
}

/* ========== [CHANGE] ENSURE COMPLETE RESPONSES ========== */
function ensureCompleteResponse(response, language) {
  const trimmedResponse = response.trim();
  
  // Check if response ends with complete sentence
  const endsWithCompleteSentence = /[.!?।][^.!?।]*$/.test(trimmedResponse);
  const endsWithQuestion = /[?؟][^?؟]*$/.test(trimmedResponse);
  
  if (!endsWithCompleteSentence) {
    // If response is truncated, add appropriate ending
    if (language === "Hindi") {
      return trimmedResponse + " क्या आप इस पर और चर्चा करना चाहेंगे?";
    } else {
      return trimmedResponse + " Would you like to discuss this further?";
    }
  }
  
  // If ends with sentence but not a question, add engaging question
  if (endsWithCompleteSentence && !endsWithQuestion) {
    if (language === "Hindi") {
      return trimmedResponse + " क्या यह उपयोगी लगा?";
    } else {
      return trimmedResponse + " Does this resonate with you?";
    }
  }
  
  return response;
}

/* ========== WEBHOOK PARSING ========== */
function parseWebhookMessage(body) {
  console.log("📨 Raw webhook body:", JSON.stringify(body).substring(0, 200));
  
  if (!body) return null;
  
  // Try different webhook formats
  if (body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
    const msg = body.entry[0].changes[0].value.messages[0];
    console.log("📱 Heltar format message:", msg);
    return msg;
  }
  
  if (body?.messages?.[0]) {
    console.log("📱 Direct messages format:", body.messages[0]);
    return body.messages[0];
  }
  
  if (body?.from && body?.text) {
    console.log("📱 Simple format message:", body);
    return body;
  }
  
  // Fix: Also check for Meta webhook format
  if (body?.object === 'whatsapp_business_account') {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    
    if (message) {
      console.log("📱 Meta WhatsApp format:", message);
      return message;
    }
  }
  
  console.log("❓ Unknown webhook format");
  return null;
}

/* ========== LANGUAGE SWITCH HANDLER ========== */
async function handleLanguageSwitch(phone, newLanguage, currentLanguage) {
  const confirmationMessage = newLanguage === 'English' 
    ? "Sure! I'll speak in English. Remember, I provide Gita-based guidance with practical steps. How can I help you today? 😊" 
    : "जरूर! मैं हिंदी में बात करूंगा। याद रखें, मैं गीता-आधारित मार्गदर्शन व्यावहारिक कदमों के साथ देता हूँ। मैं आपकी कैसे मदद कर सकता हूँ? 😊";
  
  await sendViaHeltar(phone, confirmationMessage, "language_switch");
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
      await handleLanguageSwitch(phone, languageResult.switchTo, language);
      return;
    }

    const lower = text.toLowerCase();

    // Emotion detection and follow-up check
    const emotionDetection = detectEmotionAdvanced(text);
    const detectedEmotion = emotionDetection ? emotionDetection.emotion : null;
    const userSituation = detectUserSituation(text);
    
    await checkAndSendFollowup(phone, user);

    console.log(`💭 Emotion detected: ${detectedEmotion}, Situation: ${userSituation}`);

    // [CHANGE] Enhanced context for AI responses
    const conversationContext = {
      stage: user.conversation_stage,
      emotion: detectedEmotion,
      situation: userSituation,
      previousMessage: user.last_message,
      language: language,
      userHistory: user.chat_history?.slice(-2) || [] // Last 2 messages for context
    };

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
            ? "मैं सारथी AI हूँ, आपका निजी गीता साथी! 🙏 मैं आपको जीवन की चुनौतियों के लिए भगवद गीता का मार्गदर्शन प्रदान करता हूँ। क्या आप किस विशेष मुद्दे पर चर्चा करना चाहेंगे?"
            : "I'm Sarathi AI, your personal Gita companion! 🙏 I provide guidance from Bhagavad Gita for life's challenges. Is there a specific issue you'd like to discuss?";
        await sendViaHeltar(phone, reply, "capabilities");
        return;
    }

    // 5. SMALL TALK
    if (isSmallTalk(lower)) {
        console.log(`✅ Intent: Small Talk`);
        let response;
        if (language === "Hindi") {
            if (lower.includes('thank')) {
                response = "आपका स्वागत है! 🙏 क्या आप और कुछ चाहेंगे या किसी और विषय पर बात करना चाहेंगे?";
            } else if (lower.includes('bye')) {
                response = "धन्यवाद! जब भी जरूरत हो, मैं यहाँ हूँ। हरे कृष्ण! 🌟 क्या आप कल फिर बात करेंगे?";
            } else {
                response = "ठीक है! 😊 आप आगे क्या जानना चाहेंगे? क्या कोई और प्रश्न है आपके मन में?";
            }
        } else {
            if (lower.includes('thank')) {
                response = "You're welcome! 🙏 Is there anything else you need or would you like to discuss another topic?";
            } else if (lower.includes('bye')) {
                response = "Thank you! I'm here whenever you need me. Hare Krishna! 🌟 Will we talk again tomorrow?";
            } else {
                response = "Okay! 😊 What would you like to know more about? Do you have any other questions in mind?";
            }
        }
        await sendViaHeltar(phone, response, "small_talk");
        return;
    }

    // 6. OUT OF SCOPE QUERIES
    if (isOutOfScopeQuery(lower)) {
        console.log(`🚫 Intent: Out of Scope`);
        const response = language === "Hindi" 
            ? "मैं विशेष रूप से भगवद गीता और आध्यात्मिक मार्गदर्शन के लिए बना हूँ। कृपया गीता, जीवन की चुनौतियों, या आध्यात्मिक विषयों के बारे में पूछें। 🙏 क्या आप इनमें से किसी विषय पर चर्चा करना चाहेंगे?"
            : "I'm specifically designed for Bhagavad Gita and spiritual guidance. Please ask about Gita, life challenges, or spiritual topics. 🙏 Would you like to discuss any of these subjects?";
        await sendViaHeltar(phone, response, "out_of_scope");
        return;
    }

    // 7. DEFAULT: ENHANCED AI RESPONSE
    console.log(`ℹ️  Intent: General -> Using Enhanced AI`);
    await getAIResponse(phone, text, language, conversationContext);

  } catch (err) {
    console.error("❌ Webhook error:", err?.message || err);
  }
});


/* ---------------- Health check ---------------- */
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    bot: BOT_NAME, 
    timestamp: new Date().toISOString(),
    features: ["Enhanced Hindi Detection", "Gita-Grounded Responses", "Practical Action Steps", "Complete Answers"]
  });
});

/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
  console.log(`\n🚀 ${BOT_NAME} Enhanced Version listening on port ${PORT}`);
  console.log("✅ Critical Fixes Applied:");
  console.log("   📝 Complete, non-truncated responses");
  console.log("   📚 Deep Gita grounding with verse references");
  console.log("   🛠️ Practical action steps in every answer");
  console.log("   🎯 Personalized situation detection");
  console.log("   💬 Natural conversation flow");
  setupDatabase().catch(console.error);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await dbPool.end();
  process.exit(0);
});
