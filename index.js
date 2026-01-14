// index.js — SarathiAI (Enhanced Version with Menu Stagnation Fix)
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

const MAX_REPLY_LENGTH = parseInt(process.env.MAX_REPLY_LENGTH || "1200", 10) || 1200;

/* ---------------- Enhanced Database Pool ---------------- */
const dbPool = new Pool({ 
    connectionString: DATABASE_URL, 
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    maxUses: 7500,
});

/* ---------------- Response Cache ---------------- */
const responseCache = new Map();

/* ---------------- Enhanced Gita Wisdom Database ---------------- */
const ENHANCED_GITA_WISDOM = {
    moral_dilemma: {
        verses: ["16.1-3", "17.14-16", "18.63"],
        teachings: {
            hindi: [
                `🌅 **सत्य का मार्ग और कृष्ण की रणनीति**

आपने पूछा कि कृष्ण ने युद्ध में छल क्यों किया - यह गहरा प्रश्न है। गीता (16.1-3) दैवी और आसुरी गुणों में अंतर बताती है। कृष्ण का "छल" वास्तव में धर्म की रक्षा के लिए था, जब सारे नैतिक रास्ते बंद हो गए थे।

**आपकी स्थिति में:**
1. पहले अपने इरादे जाँचें: क्या यह स्वार्थ के लिए है या सचमुच भलाई के लिए?
2. गुमनाम रिपोर्टिंग के विकल्प तलाशें
3. सबूत एकत्र करें - लिखित रिकॉर्ड रखें

क्या आप बता सकते हैं कि आप किस तरह की स्थिति का सामना कर रहे हैं?`,

                `💫 **जब सत्य कठिन लगे**

गीता (17.14-16) सत्य को सर्वोच्च बताती है, पर साथ ही कहती है कि वाणी मधुर हो। कभी-कभी चुप रहना भी सत्य का ही रूप है।

**व्यावहारिक कदम:**
• पहले एक भरोसेमंद मित्र से सलाह लें
• कंपनी की व्हिसलब्लोअर पॉलिसी चेक करें
• अपनी सुरक्षा सर्वोपरि रखें

क्या आपको लगता है कि अभी चुप रहना बेहतर है या आप कुछ करना चाहेंगे?`
            ],
            english: [
                `🌅 **The Path of Truth & Krishna's Strategy**

You asked why Krishna used deception in war - this is a profound question. Gita (16.1-3) distinguishes divine and demonic qualities. Krishna's "deception" was actually to protect dharma when all ethical paths were closed.

**In your situation:**
1. First examine your intentions: Is this for selfish gain or genuine good?
2. Explore anonymous reporting options  
3. Gather evidence - keep written records

Could you share what kind of situation you're facing?`,

                `💫 **When Truth Seems Difficult**

Gita (17.14-16) elevates truth as supreme, but also says speech should be pleasant. Sometimes silence is also a form of truth.

**Practical Steps:**
• First consult a trusted friend
• Check company whistleblower policy
• Keep your safety paramount

Do you feel staying silent is better now, or would you like to take some action?`
            ]
        }
    },
    
    fear: {
        verses: ["2.56", "18.63", "2.40"],
        teachings: {
            hindi: [
                `🌊 **डर का सामना**

आपका डर स्वाभाविक है - जब हम सत्य बोलते हैं, तो प्रतिक्रिया का डर होता ही है। गीता (2.56) कहती है: "दुःखेषु अनुद्विग्नमनाः" - दुख में जिसका मन विचलित नहीं होता।

**शांत रहने के उपाय:**
1. 4-7-8 श्वास: 4 सेकंड साँस लें, 7 रोकें, 8 से छोड़ें
2. अपनी तैयारी पर ध्यान दें: तथ्य, दस्तावेज़, समर्थन
3. छोटे-छोटे कदम सोचें - एक बार में एक ही काम

कल्पना करें आप एक पहाड़ हैं और डर बादलों की तरह गुजर रहा है...`,

                `🛡️ **आंतरिक सुरक्षा**

गीता (18.63) कहती है: "तुम चिंतन करो, फिर जैसा तुम्हारा मन चाहे वैसा करो।" यह आपको आत्मविश्वास देता है।

**तत्काल क्रिया:**
• सबसे बुरा परिणाम लिखें - फिर उसका समाधान सोचें
• 3 विश्वसनीय लोगों की सूची बनाएं जिनसे बात कर सकते हैं
• रोज 5 मिनट शांत बैठें - बस साँसों को देखें

आप किस एक छोटे कदम से शुरुआत कर सकते हैं?`
            ],
            english: [
                `🌊 **Facing Fear**

Your fear is natural - when we speak truth, fear of backlash is inevitable. Gita (2.56) says: "One who is undisturbed in sorrow..."

**Calming Techniques:**
1. 4-7-8 breathing: Inhale 4s, hold 7s, exhale 8s  
2. Focus on preparation: facts, documents, support
3. Think small steps - one thing at a time

Imagine you're a mountain and fear is clouds passing by...`,

                `🛡️ **Inner Security**

Gita (18.63) says: "Reflect fully, then act as you choose." This gives you confidence.

**Immediate Action:**
• Write worst-case scenario - then brainstorm solutions
• List 3 trusted people you can talk to
• Sit quietly 5 min daily - just watch your breath

What's one small step you could start with?`
            ]
        }
    }
};

// Enhanced system prompt for complete responses
// Enhanced system prompt for SHORT, DIRECT Sarathi responses
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
            ADD COLUMN IF NOT EXISTS last_activity_ts TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS pending_followup TEXT,
            ADD COLUMN IF NOT EXISTS followup_type VARCHAR(50)
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

/* ---------------- Enhanced Helper Functions ---------------- */
function parseChatHistory(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return []; }
}

function pruneChatHistory(history, maxMessages = 20) {
    if (!Array.isArray(history) || history.length <= maxMessages) {
        return history;
    }
    
    // Keep system messages and recent conversation
    const importantMessages = history.filter(msg => 
        msg.role === 'system' || 
        msg.content.includes('कृष्ण') || 
        msg.content.includes('Krishna') ||
        msg.content.length > 100 // Substantial messages
    );
    
    const recentMessages = history.slice(-maxMessages + importantMessages.length);
    return [...importantMessages, ...recentMessages].slice(-maxMessages);
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
        user.chat_history = pruneChatHistory(parseChatHistory(user.chat_history || '[]'));
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

/* ---------------- Enhanced Conversation Stage Management ---------------- */
async function updateConversationStage(phone, userMessage, language) {
    const user = await getUserState(phone);
    
    // If user sends substantive message after menu, move to chatting
    const isSubstantiveMessage = userMessage && 
        userMessage.length > 3 && 
        !isGreetingQuery(userMessage) &&
        !isSmallTalk(userMessage) &&
        !/^[1-4\s,]+$/.test(userMessage); // Not just menu numbers
    
    if (user.conversation_stage === "awaiting_menu_choice" && isSubstantiveMessage) {
        console.log(`🔄 Auto-advancing user from menu to chatting stage`);
        await updateUserState(phone, { 
            conversation_stage: "chatting",
            last_response_type: "auto_advanced_chat"
        });
        return true;
    }
    
    return false;
}

// Add auto-advance timeout for engaged users
async function setupMenuAutoAdvance(phone) {
    setTimeout(async () => {
        const user = await getUserState(phone);
        if (user.conversation_stage === "awaiting_menu_choice" && 
            (user.total_incoming || 0) >= 2) {
            
            console.log(`⏰ Auto-advancing engaged user from menu`);
            await updateUserState(phone, { 
                conversation_stage: "chatting",
                last_response_type: "timeout_advanced"
            });
            
            const language = user.language_preference || 'English';
            const message = language === "Hindi" 
                ? "मैं देख रहा हूँ आप गहरी बातचीत में रुचि रखते हैं! अब आप सीधे बात कर सकते हैं। कृपया बताएं आप किस बारे में चर्चा करना चाहेंगे? 🙏"
                : "I see you're interested in deeper conversation! You can now chat directly. What would you like to discuss? 🙏";
            
            await sendViaHeltar(phone, message, "auto_advance");
        }
    }, 300000); // 5 minutes
}

/* ---------------- Enhanced Analytics & User Segmentation ---------------- */
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
        await updateUserSegment(phone); // Update segmentation
    } catch (err) {
        console.error("trackIncoming failed:", err);
    }
}

async function updateUserSegment(phone) {
    try {
        const user = await getUserState(phone);
        const totalMessages = (user.total_incoming || 0) + (user.total_outgoing || 0);
        
        let segment = 'new';
        if (totalMessages > 50) segment = 'power_user';
        else if (totalMessages > 10) segment = 'active';
        else if (user.total_sessions > 1) segment = 'returning';
        
        if (segment !== user.user_segment) {
            await updateUserState(phone, { user_segment: segment });
        }
        
        return segment;
    } catch (err) {
        console.error("updateUserSegment failed:", err);
        return 'new';
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

/* ---------------- Enhanced Heltar Sending with Layered Responses ---------------- */
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

// Overwritten to disable "Type More" functionality globally
async function sendLayeredResponse(phone, fullResponse, language, type = "chat") {
    // We now send EVERYTHING directly. No more hiding text.
    await sendViaHeltar(phone, fullResponse, type);
}

/* ---------------- FIXED Language Detection ---------------- */
function detectLanguageFromText(text) {
    if (!text || typeof text !== "string") return "English";
    
    const cleanText = text.trim().toLowerCase();
    
    // 1. Hindi characters (Devanagari Unicode range) - STRONG SIGNAL
    if (/[\u0900-\u097F]/.test(text)) {
        return "Hindi";
    }
    
    // 2. Explicit language commands
    if (cleanText.includes('english') || cleanText.includes('speak english') || cleanText.includes('angrezi')) {
        return "English";
    }
    if (cleanText.includes('hindi') || cleanText.includes('speak hindi') || cleanText.includes('hind')) {
        return "Hindi";
    }
    
    // 3. English greetings - FIXED: Simple greetings should stay English
    const englishGreetings = ['hi', 'hello', 'hey', 'hii', 'hiya', 'good morning', 'good afternoon', 'good evening'];
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
    
    // 6. Romanized Hindi indicators - STRONGER SIGNAL REQUIRED
    const strongHindiIndicators = [
        'kyu', 'kya', 'kaise', 'karo', 'kiya', 'mera', 'tera', 'apna', 'hai', 'ho', 'hun',
        'main', 'tum', 'aap', 'ko', 'ka', 'ki', 'ke', 'se', 'mein', 'par', 'aur', 'lekin'
    ];
    
    const hindiWordCount = strongHindiIndicators.filter(word => 
        new RegExp(`\\b${word}\\b`).test(cleanText)
    ).length;
    
    // Require at least 3 Hindi words to switch from English
    if (hindiWordCount >= 3) {
        return "Hindi";
    }
    
    // 7. Default to English for safety - FIXED: No aggressive switching
    return "English";
}

async function determineUserLanguage(phone, text, user) {
    let currentLanguage = user.language_preference || 'English';
    const detectedLanguage = detectLanguageFromText(text);
    const cleanText = text.toLowerCase().trim();
    
    // Check for explicit language commands first
    const isLanguageSwitchCommand = 
        cleanText.includes('english') || 
        cleanText.includes('hindi') ||
        cleanText.includes('speak english') ||
        cleanText.includes('speak hindi');
    
    if (isLanguageSwitchCommand) {
        let newLanguage = currentLanguage;
        
        if (cleanText.includes('english')) {
            newLanguage = 'English';
        } else if (cleanText.includes('hindi')) {
            newLanguage = 'Hindi';
        }
        
        if (newLanguage !== currentLanguage) {
            await updateUserState(phone, { 
                language_preference: newLanguage,
                conversation_stage: 'new_topic'
            });
            return { language: newLanguage, isSwitch: true, switchTo: newLanguage };
        }
    }
    
    // FIXED: Remove aggressive language switching for new users
    // This was causing "Hi" to switch to Hindi incorrectly
    
    return { language: currentLanguage, isSwitch: false };
}

/* ---------------- Enhanced Context Building ---------------- */
function buildEnhancedContext(user, currentMessage) {
    const recentMessages = user.chat_history?.slice(-6) || [];
    const summary = recentMessages.map(msg => 
        `${msg.role}: ${msg.content.substring(0, 80)}...`
    ).join('\n');
    
    return {
        userProfile: {
            primaryUseCase: user.primary_use_case,
            languagePreference: user.language_preference,
            userSegment: user.user_segment,
            totalSessions: user.total_sessions
        },
        recentConversation: summary,
        currentEmotion: detectEmotionAdvanced(currentMessage)?.emotion,
        currentSituation: detectUserSituation(currentMessage),
        isReturningUser: (user.total_sessions || 0) > 1
    };
}

function buildContextSummary(messages, language) {
    if (!messages || messages.length === 0) {
        return language === "Hindi" ? "कोई पिछला संदर्भ नहीं" : "No previous context";
    }
    
    const userMessages = messages.filter(msg => msg.role === 'user').slice(-2);
    const botMessages = messages.filter(msg => msg.role === 'assistant').slice(-1);
    
    let summary = "";
    
    if (language === "Hindi") {
        summary = "उपयोगकर्ता ने पहले चर्चा की: ";
        userMessages.forEach(msg => {
            summary += `"${msg.content.substring(0, 50)}...", `;
        });
        if (botMessages.length > 0) {
            summary += `मैंने जवाब दिया: "${botMessages[0].content.substring(0, 30)}..."`;
        }
    } else {
        summary = "User previously discussed: ";
        userMessages.forEach(msg => {
            summary += `"${msg.content.substring(0, 50)}...", `;
        });
        if (botMessages.length > 0) {
            summary += `I responded: "${botMessages[0].content.substring(0, 30)}..."`;
        }
    }
    
    return summary;
}

/* ---------------- Intent Classification (Existing) ---------------- */
function isFollowUpToPreviousDeepQuestion(currentText, user) {
    if (user.last_message_role !== 'assistant') return false;
    const lastBotMessage = user.last_message || '';
    const wasDeepExchange = 
        isEmotionalExpression(currentText) || 
        isDeepQuestion(currentText) ||
        lastBotMessage.includes('?') ||
        lastBotMessage.length > 100;
    return wasDeepExchange;
}

function isGreetingQuery(text) {
    if (!text || typeof text !== "string") return false;
    const lowerText = text.toLowerCase().trim();
    
    // Explicit English greetings should stay in English
    const englishGreetings = ['hi', 'hello', 'hey', 'hii', 'hiya', 'good morning', 'good afternoon', 'good evening'];
    if (englishGreetings.includes(lowerText)) {
        return true;
    }
    
    // Hindi greetings in Roman script
    const hindiGreetings = ['namaste', 'namaskar', 'pranam', 'radhe radhe'];
    if (hindiGreetings.includes(lowerText)) {
        return true;
    }
    
    const greetingRegex = /\b(hi|hello|hey|how are you|what's up|kaise ho|kaise hain aap|namaste|hare krishna)\b/i;
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
        /\b(i am in stress|i feel stressed|i'm stressed|i have stress|feeling stressed|under stress)\b/i,
        /\b(परेशान|तनाव|चिंता|घबराहट|दबाव|उलझन|मन परेशान|दिल परेशान|मन भारी)\b/,
        /\b(sad|sadness|depressed|depression|unhappy|miserable|hopeless|down|low|sorrow|lonely)\b/i,
        /\b(i am sad|i feel sad|i'm sad|feeling down|feeling low|feeling lonely)\b/i,
        /\b(दुखी|उदास|निराश|हताश|दुख|उदासी|अकेला|अकेलापन|तन्हाई|मन उदास|दिल टूटा)\b/,
        /\b(my life|married life|relationship|husband|wife|family|job|work|career).*(problem|issue|difficult|hard|trouble|disturb|bad)\b/i,
        /\b(जीवन|शादी|रिश्ता|पति|पत्नी|परिवार|नौकरी|काम).*(समस्या|परेशानी|मुश्किल|बुरा|खराब)\b/,
        /\b(not good|not well|feeling bad|going through|facing problem|having issue|i am struggling)\b/i,
        /\b(i can't handle|i can't cope|it's too much|too much pressure)\b/i,
        /\b(अच्छा नहीं|ठीक नहीं|बुरा लग|मुश्किल हो|परेशानी हो|संघर्ष कर|मुश्किल में|परेशानी में)\b/,
        /\b(मन भारी|दिल टूट|टेंशन|फिक्र|चिंतित|घबराया|निराशाजनक|तंग आ गया|हार मान ली)\b/,
        /\b(मेरा मन|मेरा दिल).*(परेशान|दुखी|उदास|भारी|टूट|बेचैन)\b/,
        /\b(confused|lost|uncertain|don't know|what to do|which way|कंफ्यूज|उलझन|पता नहीं|क्या करूं|रास्ता नहीं)\b/i
    ];
    return emotionalPatterns.some(pattern => pattern.test(lowerText));
}

function isDeepQuestion(text) {
    const lowerText = text.toLowerCase();
    const deepQuestionPatterns = [
        /\b(is.*wrong|right.*wrong|moral|ethical|lie|cheat|steal|honest)\b/i,
        /\b(गलत|सही|नैतिक|झूठ|धोखा|ईमानदार)\b/,
        /\b(krishna.*say|gita.*teach|spiritual|meditation|yoga|god)\b/i,
        /\b(कृष्ण.*कह|गीता.*सिख|आध्यात्मिक|ध्यान|योग|भगवान)\b/,
        /\b(how.*start|what.*do|why.*happen|when.*know)\b/i,
        /\b(कैसे.*शुरू|क्या.*करू|क्यों.*हो|कब.*पता)\b/,
        /\b(problem|issue|challenge|difficult|struggle|confused)\b/i,
        /\b(समस्या|मुश्किल|चुनौती|परेशान|उलझन)\b/
    ];
    return deepQuestionPatterns.some(pattern => pattern.test(lowerText));
}

function isSmallTalk(text) {
    const lowerText = text.toLowerCase().trim();
    const seriousIndicators = [
        'lie', 'cheat', 'wrong', 'moral', 'ethical', 'steal', 'dishonest',
        'झूठ', 'धोखा', 'गलत', 'नैतिक', 'चोरी', 'बेईमान',
        'how do i', 'what should', 'why is', 'can i',
        'कैसे', 'क्या', 'क्यों', 'करूं'
    ];
    if (seriousIndicators.some(indicator => lowerText.includes(indicator))) return false;
    const genuineSmallTalk = [
        'thanks', 'thank you', 'ok', 'okay', 'good', 'nice', 'cool', 'great', 'awesome', 'fine', 'good job', 'well done',
        'शुक्रिया', 'धन्यवाद', 'ठीक', 'अच्छा', 'बढ़िया', 'बहुत अच्छा'
    ].some(pattern => lowerText === pattern);
    return genuineSmallTalk;
}

function detectEmotionAdvanced(text) {
    const lowerText = text.toLowerCase();
    let emotion = null;
    let confidence = 0;
    const emotionKeywords = {
        moral_dilemma: { keywords: ['lie', 'cheat', 'wrong', 'moral', 'ethical', 'steal', 'dishonest', 'झूठ', 'धोखा', 'गलत', 'नैतिक'], weight: 1.3 },
        purpose: { keywords: ['purpose', 'meaning', 'why am i here', 'what is my life', 'reason to live', 'उद्देश्य', 'मकसद', 'जीवन का मतलब'], weight: 1.2 },
        stressed: { keywords: ['stress', 'stressed', 'stressing', 'anxious', 'anxiety', 'tension', 'overwhelmed', 'worried', 'worrying', 'परेशान', 'तनाव', 'चिंता'], weight: 1.0 },
        sadness: { keywords: ['sad', 'depressed', 'unhappy', 'hopeless', 'sorrow', 'lonely', 'दुखी', 'उदास', 'निराश', 'हताश', 'अकेला'], weight: 1.0 },
        anger: { keywords: ['angry', 'anger', 'frustrated', 'irritated', 'क्रोध', 'गुस्सा', 'नाराज'], weight: 1.0 }
    };
    const iAmPatterns = [
        { pattern: /\b(lie|cheat|wrong|moral|ethical|dishonest|झूठ|धोखा|गलत)\b/i, emotion: 'moral_dilemma', weight: 1.5 },
        { pattern: /\b(krishna.*deception|krishna.*cheat|कृष्ण.*छल)\b/i, emotion: 'moral_dilemma', weight: 1.5 },
        { pattern: /\b(fear|afraid|scared|डर|डर लग)\b/i, emotion: 'stressed', weight: 1.3 },
        { pattern: /\b(sad|depressed|unhappy|दुखी|उदास)\b/i, emotion: 'sadness', weight: 1.2 }
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

function detectUserSituation(text) {
  const lowerText = text.toLowerCase();
  const situations = {
    moral: /(lie|cheat|wrong|moral|ethical|steal|dishonest|झूठ|धोखा|गलत|नैतिक)/.test(lowerText),
    work: /(job|work|office|career|boss|colleague|नौकरी|काम|कार्यालय|सहकर्मी)/.test(lowerText),
    relationships: /(relationship|husband|wife|family|friend|partner|love|पति|पत्नी|परिवार|दोस्त|प्रेम)/.test(lowerText),
    health: /(health|sick|pain|ill|hospital|doctor|स्वास्थ्य|बीमार|दर्द|तबीयत|डॉक्टर)/.test(lowerText),
    studies: /(study|exam|student|school|college|education|पढ़ाई|परीक्षा|विद्यार्थी|शिक्षा)/.test(lowerText),
    spiritual: /(god|prayer|meditation|yoga|spiritual|भगवान|प्रार्थना|ध्यान|योग|आध्यात्मिक)/.test(lowerText)
  };
  return Object.keys(situations).find(situation => situations[situation]) || 'general';
}

/* ---------------- Enhanced AI Response System with Caching & Retry ---------------- */
async function getCachedAIResponse(phone, text, language, context) {
    const cacheKey = `${phone}:${text.substring(0, 50)}:${language}`;
    
    if (responseCache.has(cacheKey)) {
        console.log("✅ Using cached response");
        return responseCache.get(cacheKey);
    }
    
    const response = await getEnhancedAIResponseWithRetry(phone, text, language, context);
    
    // Cache for 5 minutes
    responseCache.set(cacheKey, response);
    setTimeout(() => responseCache.delete(cacheKey), 300000);
    
    return response;
}

async function getEnhancedAIResponseWithRetry(phone, text, language, context, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await getEnhancedAIResponse(phone, text, language, context);
        } catch (error) {
            console.error(`❌ OpenAI attempt ${attempt + 1} failed:`, error.message);
            
            if (attempt === retries) {
                console.log("🔄 All retries exhausted, using fallback");
                return await getContextualFallback(phone, text, language, context);
            }
            
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
    }
}

async function getEnhancedAIResponse(phone, text, language, conversationContext = {}) {
  try {
    if (!OPENAI_KEY) {
      console.log("🔄 No OpenAI key, using fallback");
      return await getContextualFallback(phone, text, language, conversationContext);
    }

    console.log("🤖 Sarathi is thinking (Short & Direct)...");

    const recentHistory = conversationContext.previousMessages?.slice(-3) || [];
    const contextSummary = buildContextSummary(recentHistory, language);
    
    const systemPrompt = ENHANCED_SYSTEM_PROMPT[language] || ENHANCED_SYSTEM_PROMPT.english;
    
    // Simplified User Prompt to force brevity
    const userPrompt = language === "Hindi" 
      ? `उपयोगकर्ता: "${text}"
संदर्भ: ${contextSummary}
भावना: ${conversationContext.emotion || 'unknown'}

निर्देश: कृपया 4-चरणीय ढांचे (ठहराव, दृष्टिकोण, कर्म, प्रश्न) का पालन करें। उत्तर छोटा और सीधा रखें (Max 80 words).`
      : `User: "${text}"
Context: ${contextSummary}
Emotion: ${conversationContext.emotion || 'unknown'}

INSTRUCTION: Follow the 4-step structure (Pause, Perspective, Action, Check). Keep it SHORT and DIRECT (Max 80 words).`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const body = { 
      model: OPENAI_MODEL, 
      messages, 
      max_tokens: 200, // Reduced to prevent essays
      temperature: 0.7
    };

    const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      timeout: 15000
    });

    const aiResponse = resp.data?.choices?.[0]?.message?.content;
    
    if (aiResponse) {
      console.log("✅ Sarathi Response Generated");
      
      // DIRECT SEND - No "Layered" logic, No "Type More"
      await sendViaHeltar(phone, aiResponse, "enhanced_ai_response");
      
      // Update history
      const user = await getUserState(phone);
      const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: aiResponse }];
      await updateUserState(phone, { 
        chat_history: updatedHistory,
        last_message: aiResponse,
        last_message_role: 'assistant'
      });
    } else {
      throw new Error("Empty OpenAI response");
    }

  } catch (err) {
    console.error("❌ AI Error:", err.message);
    await getContextualFallback(phone, text, language, conversationContext);
  }
}

// ENHANCED RESPONSE COMPLETION DETECTION
function ensureCompleteStructuredResponse(response, language) {
    const trimmed = response.trim();
    const isTruncated = 
        (!/[.!?।]\s*$/.test(trimmed)) ||
        (/\s[a-zA-Zअ-ज]{1,5}$/.test(trimmed)) ||
        (trimmed.split(/[.!?।]/).length < 6);
    
    if (isTruncated) {
        console.log("⚠️ Detected truncated response, adding completion");
        const completions = language === "Hindi" 
            ? [
                "\n\nइस स्थिति में आपके लिए कुछ संरचित कदम:\n1. आज रात शांत बैठकर अपनी भावनाओं को लिखें\n2. कल सुबह एक भरोसेमंद सलाहकार से बात करने का समय निर्धारित करें\n3. सप्ताह के अंत तक एक छोटा सा कदम उठाने का लक्ष्य रखें\n\nआप इनमें से किस कदम पर पहले कार्य करना चाहेंगे?",
                "\n\nआगे बढ़ने के लिए तीन व्यावहारिक सुझाव:\n• इस सप्ताह के लिए एक छोटा सा निर्णय लें\n• अपने भाई से पहले गैर-व्यवसायिक विषय पर बात करें\n• एक मार्गदर्शक श्लोक को दैनिक पढ़ें\n\nक्या इनमें से कोई एक सुझाव आपको सही लगता है?"
              ]
            : [
                "\n\nHere are some structured steps for your situation:\n1. Write down your feelings tonight when you're calm\n2. Schedule time tomorrow to speak with a trusted advisor\n3. Set a goal to take one small step by week's end\n\nWhich of these steps would you like to focus on first?",
                "\n\nThree practical suggestions to move forward:\n• Make one small decision for this week only\n• Talk to your brother about non-business topics first\n• Read one guiding verse daily for reflection\n\nDoes any of these suggestions resonate with you?"
              ];
        return trimmed + completions[Math.floor(Math.random() * completions.length)];
    }
    
    if (!/[?？]\s*$/.test(trimmed)) {
        const questions = language === "Hindi" 
            ? ["\n\nइस पर आपकी क्या प्रतिक्रिया है?", "\n\nआप क्या सोचते हैं?", "\n\nक्या यह सही दिशा में लगता है?"]
            : ["\n\nWhat are your thoughts on this?", "\n\nHow does this land with you?", "\n\nDoes this feel like the right direction?"];
        return trimmed + questions[Math.floor(Math.random() * questions.length)];
    }
    
    return trimmed;
}

async function getContextualFallback(phone, text, language, context) {
  console.log("🔄 Using contextual fallback");
  const emotion = detectEmotionAdvanced(text)?.emotion || 'moral_dilemma';
  const wisdom = ENHANCED_GITA_WISDOM[emotion] || ENHANCED_GITA_WISDOM.moral_dilemma;
  const responses = language === "Hindi" ? wisdom.teachings.hindi : wisdom.teachings.english;
  const selected = responses[Math.floor(Math.random() * responses.length)];
  await sendLayeredResponse(phone, selected, language, "contextual_fallback");
}

/* ---------------- Enhanced Startup Menu System ---------------- */
async function handleEnhancedStartupMenu(phone, language, user) {
    const menuMessage = language === "Hindi" 
        ? `🚩 *सारथी AI में आपका स्वागत है!* 🚩

मैं आपका निजी गीता साथी हूँ। कृपया चुनें:

1️⃣ *तत्काल मार्गदर्शन* - वर्तमान चुनौती के लिए
2️⃣ *दैनिक ज्ञान* - आज की विशेष शिक्षा  
3️⃣ *वार्तालाप* - अपनी भावनाओं को साझा करें
4️⃣ *गीता ज्ञान* - विशिष्ट प्रश्न पूछें
5️⃣ *सब कुछ जानें* - संपूर्ण मार्गदर्शन
💬 *या बस लिखें* - सीधे बातचीत शुरू करें

कृपया 1-5 का चयन करें या सीधे लिखें 🙏`
        : `🚩 *Welcome to Sarathi AI!* 🚩

I'm your personal Gita companion. Please choose:

1️⃣ *Immediate Guidance* - For current challenge
2️⃣ *Daily Wisdom* - Today's special teaching  
3️⃣ *Have a Conversation* - Share your feelings
4️⃣ *Gita Knowledge* - Ask specific questions
5️⃣ *Know Everything* - Complete guidance
💬 *Or Just Type* - Start conversation directly

Please choose 1-5 or just type your thoughts 🙏`;

    await sendViaHeltar(phone, menuMessage, "enhanced_welcome");
    await updateUserState(phone, { 
        conversation_stage: "awaiting_menu_choice",
        last_menu_shown: new Date().toISOString()
    });
    
    // Setup auto-advance for this user
    await setupMenuAutoAdvance(phone);
}

/* ---------------- Menu Choice Handler ---------------- */
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
    },
    "5": {
      hindi: {
        prompt: "🌈 संपूर्ण मार्गदर्शन: आइए आपकी वर्तमान स्थिति, आध्यात्मिक जिज्ञासा, और दैनिक चुनौतियों पर चर्चा करें। कृपया बताएं आप कहाँ से शुरू करना चाहेंगे?",
        action: "comprehensive_guidance"
      },
      english: {
        prompt: "🌈 Complete Guidance: Let's discuss your current situation, spiritual curiosity, and daily challenges. Please tell me where you'd like to start?",
        action: "comprehensive_guidance"
      }
    }
  };

  // Handle "all options" or multiple choices
  if (choice.includes(',') || choice === '1234' || choice === '12345' || choice.toLowerCase().includes('all')) {
    const comprehensiveMessage = language === "Hindi" 
        ? "🌈 आपने सभी विकल्प चुने हैं! आइए संपूर्ण मार्गदर्शन के साथ शुरू करें। कृपया बताएं:\n\n• आपकी वर्तमान चुनौती क्या है?\n• आप किस विषय में ज्ञान चाहते हैं?\n• आप कैसा महसूस कर रहे हैं?\n\nआप कहाँ से शुरू करना चाहेंगे? 🙏"
        : "🌈 You've chosen all options! Let's start with comprehensive guidance. Please tell me:\n\n• What is your current challenge?\n• What knowledge are you seeking?\n• How are you feeling?\n\nWhere would you like to start? 🙏";
    
    await sendViaHeltar(phone, comprehensiveMessage, "comprehensive_start");
    await updateUserState(phone, { 
        conversation_stage: "comprehensive_guidance",
        last_menu_choice: "all_options"
    });
    return;
  }

  const selected = choices[choice];
  if (!selected) {
    // If not a menu choice, treat as direct conversation
    console.log(`🔄 Treating as direct conversation instead of menu choice`);
    await updateUserState(phone, { 
        conversation_stage: "chatting"
    });
    
    // Process the message normally
    const conversationContext = {
        stage: "chatting",
        emotion: detectEmotionAdvanced(choice)?.emotion,
        situation: detectUserSituation(choice),
        previousMessages: user.chat_history?.slice(-4) || [],
        language: language,
        isFollowUp: false
    };
    
    await getCachedAIResponse(phone, choice, language, conversationContext);
    return;
  }

  try {
    let promptContent;
    const selectedLang = selected[language] || selected.english;
    
    if (typeof selectedLang.prompt === 'function') {
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
      ? "क्षमा करें, तकनीकी समस्या आई है। कृपया सीधे अपनी बात लिखें।"
      : "Sorry, there was a technical issue. Please type your message directly.";
    await sendViaHeltar(phone, fallbackMessage, "menu_error");
  }
}

/* ---------------- Daily Wisdom System ---------------- */
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

/* ---------------- Simple Handlers ---------------- */
async function handleLanguageSwitch(phone, newLanguage) {
    const confirmationMessage = newLanguage === 'English' 
        ? "Sure! I'll speak in English. Remember, I provide Gita-based guidance with practical steps. How can I help you today? 😊" 
        : "जरूर! मैं हिंदी में बात करूंगा। याद रखें, मैं गीता-आधारित मार्गदर्शन व्यावहारिक कदमों के साथ देता हूँ। मैं आपकी कैसे मदद कर सकता हूँ? 😊";
    
    await sendViaHeltar(phone, confirmationMessage, "language_switch");
}

async function handleSmallTalk(phone, text, language) {
    let response;
    const lower = text.toLowerCase();
    if (language === "Hindi") {
        if (lower.includes('thank') || lower.includes('शुक्रिया')) {
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
}

function parseWebhookMessage(body) {
  console.log("📨 Raw webhook body:", JSON.stringify(body).substring(0, 200));
  if (!body) return null;
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

/* ---------------- COMPLETELY FIXED: Main Webhook Handler ---------------- */
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
    let language = languageResult.language;
    const isLanguageSwitch = languageResult.isSwitch;

    // 🚨 CRITICAL FIX 1: Force language consistency for greetings
    const simpleEnglishGreetings = ['hi', 'hello', 'hey', 'hii', 'hiya', 'good morning', 'good afternoon', 'good evening'];
    const romanHindiGreetings = ['namaste', 'namaskar', 'pranam', 'radhe radhe'];
    
    if (simpleEnglishGreetings.includes(text.toLowerCase().trim())) {
        language = 'English';
        if (user.language_preference !== 'English') {
            await updateUserState(phone, { language_preference: 'English' });
        }
        console.log(`🔧 FORCED English for greeting: "${text}"`);
    } else if (romanHindiGreetings.includes(text.toLowerCase().trim())) {
        language = 'Hindi';
        if (user.language_preference !== 'Hindi') {
            await updateUserState(phone, { language_preference: 'Hindi' });
        }
        console.log(`🔧 FORCED Hindi for Roman greeting: "${text}"`);
    }

    console.log(`🎯 Processing: language=${language}, stage=${user.conversation_stage}, is_switch=${isLanguageSwitch}`);

    // Handle "More" command for layered responses
    if (text.toLowerCase().trim() === 'more' && user.pending_followup) {
        console.log("📖 Sending pending follow-up response");
        await sendViaHeltar(phone, user.pending_followup, user.followup_type || "followup");
        await updateUserState(phone, { 
            pending_followup: null,
            followup_type: null
        });
        return;
    }

    // 🚨 CRITICAL FIX 2: Handle stage continuity for daily_wisdom
    if (user.conversation_stage === "daily_wisdom" && text.toLowerCase().trim() !== 'more') {
        console.log(`🔄 Continuing daily wisdom session`);
        
        const conversationContext = {
            stage: "daily_wisdom",
            emotion: null,
            situation: "wisdom_continuation", 
            previousMessages: user.chat_history?.slice(-4) || [],
            language: language,
            isFollowUp: true
        };
        
        await getCachedAIResponse(phone, text, language, conversationContext);
        return;
    }

    // If it's a language switch command, send confirmation and STOP processing
    if (isLanguageSwitch) {
      await handleLanguageSwitch(phone, languageResult.switchTo);
      return;
    }

    const lower = text.toLowerCase();

    // Check if this is follow-up to deep conversation
    const isFollowUp = isFollowUpToPreviousDeepQuestion(text, user);

    // Update chat history BEFORE processing
    const updatedHistory = [...(user.chat_history || []), { role: 'user', content: text }];
    await updateUserState(phone, { 
      chat_history: updatedHistory,
      last_message: text,
      last_message_role: 'user'
    });
    
    // Refresh user object with latest history for this request cycle
    user.chat_history = updatedHistory;
    user.last_message = text;
    user.last_message_role = 'user';

    // 🚨 CRITICAL FIX 3: ALWAYS show menu for greetings (removed returning user skip logic)
    if (isGreetingQuery(lower)) {
        console.log(`✅ Intent: User Greeting - Showing Menu`);
        await handleEnhancedStartupMenu(phone, language, user);
        return;
    }

    // 2. MENU CHOICE HANDLING (Enhanced to handle all options)
    if (user.conversation_stage === "awaiting_menu_choice" && /^[1-5]|1234|12345|all$/i.test(text.trim())) {
        console.log(`✅ Intent: Menu Choice`);
        await handleEnhancedMenuChoice(phone, text.trim(), language, user);
        return;
    }

    // Update conversation stage if user is engaged but stuck at menu
    const stageUpdated = await updateConversationStage(phone, text, language);
    if (stageUpdated) {
        console.log(`✅ Auto-advanced user from menu to chatting`);
    }

    // 3. EMOTIONAL EXPRESSIONS (Empathy first)
    const emotionDetection = detectEmotionAdvanced(text);
    const detectedEmotion = emotionDetection?.emotion;
    
    if (isEmotionalExpression(lower) || detectedEmotion) {
        console.log(`✅ Intent: Emotional Expression - ${detectedEmotion}`);
        
        const conversationContext = {
            stage: user.conversation_stage,
            emotion: detectedEmotion,
            situation: detectUserSituation(text),
            previousMessages: user.chat_history?.slice(-4) || [],
            language: language,
            isFollowUp: isFollowUp
        };

        await getCachedAIResponse(phone, text, language, conversationContext);
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
        await handleSmallTalk(phone, text, language);
        return;
    }

    // 6. DEFAULT: ENHANCED AI RESPONSE
    console.log(`ℹ️  Intent: General -> Using Enhanced AI`);
    const conversationContext = {
        stage: user.conversation_stage,
        emotion: null,
        situation: detectUserSituation(text),
        previousMessages: user.chat_history?.slice(-4) || [],
        language: language,
        isFollowUp: isFollowUp
    };
    
    await getCachedAIResponse(phone, text, language, conversationContext);

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
    features: [
      "Enhanced Layered Responses", 
      "Response Caching", 
      "Connection Pooling", 
      "User Segmentation",
      "Chat History Pruning",
      "Retry Logic",
      "WhatsApp Optimized",
      "Menu Stagnation Fix",
      "Auto-Advance Conversations",
      "🚨 FIXED: Language Detection for Greetings",
      "🚨 FIXED: Menu Always Shows for Greetings",
      "🚨 FIXED: Stage Continuity"
    ],
    cacheSize: responseCache.size,
    databasePool: dbPool.totalCount
  });
});

/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
  validateEnvVariables();
  console.log(`\n🚀 ${BOT_NAME} Enhanced Version with COMPLETE FIXES listening on port ${PORT}`);
  console.log("✅ Critical Fixes Applied:");
  console.log("   🎯 Auto-advance from menu for engaged users");
  console.log("   📝 Enhanced menu with 'All Options' choice");
  console.log("   ⏰ 5-minute timeout for stuck users");
  console.log("   🔄 Better returning user handling");
  console.log("   💬 Direct conversation for non-menu inputs");
  console.log("   🚨 FIXED: Language consistency for ALL greetings");
  console.log("   🚨 FIXED: Menu always shows for greetings (no skipping)");
  console.log("   🚨 FIXED: Stage continuity for daily_wisdom sessions");
  setupDatabase().catch(console.error);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await dbPool.end();
  process.exit(0);
});
