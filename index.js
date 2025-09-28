// index.js — SarathiAI (Complete Fixed Version with Context-Aware Intent Logic)
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

const validateEnvVariables = () => {
    const requiredVars = { DATABASE_URL, OPENAI_KEY, HELTAR_API_KEY, HELTAR_PHONE_ID };
    const missingVars = Object.entries(requiredVars).filter(([, value]) => !value).map(([key]) => key);
    if (missingVars.length > 0) {
        console.error(`❌ Critical Error: Missing environment variables: ${missingVars.join(", ")}`);
        process.exit(1);
    }
};

const dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

/* ========== GITA WISDOM DATABASE ========== */
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
    },
    moral_dilemma: {
        verses: ["16.1-3", "17.14-16", "18.42"],
        teachings: {
            hindi: [
                "🌅 **सत्य और नैतिकता पर गीता का दृष्टिकोण:**\n\nश्रीकृष्ण गीता (16.1-3) में दैवी संपदा के गुणों का वर्णन करते हैं, जिसमें सत्य, अहिंसा और ईमानदारी शामिल हैं। 'सत्य' दैवी गुण है जबकि 'असत्य' आसुरी प्रवृत्ति है।\n\n**व्यावहारिक मार्गदर्शन:**\n1. हमेशा सत्य बोलें, क्योंकि सत्य ही धर्म का आधार है\n2. 'अच्छे कारण' के लिए झूठ भी अंततः दुख लाता है\n3. कठिन परिस्थितियों में मौन रहना भी एक विकल्प है\n\nक्या आप कोई विशिष्ट स्थिति साझा करना चाहेंगे जहाँ आपको नैतिक दुविधा हो रही है?",
                "💫 **धोखे के परिणाम:**\n\nगीता (17.14-16) शारीरिक, वाचिक और मानसिक तप का वर्णन करती है। वाचिक तप में मधुर और सत्य भाषण शामिल है।\n\n**सही मार्ग:**\n• सत्य बोलें, पर कठोर न हों\n• अगर सत्य चोट पहुँचाए, तो मौन रहें\n• कभी भी धोखा न दें, चाहे लाभ कितना भी बड़ा क्यों न हो\n\nआप किस प्रकार की नैतिक चुनौती का सामना कर रहे हैं?"
            ],
            english: [
                "🌅 **Gita's Perspective on Truth and Morality:**\n\nKrishna describes divine qualities in Gita (16.1-3), which include truthfulness, non-violence and honesty. 'Truth' is divine while 'falsehood' is demonic.\n\n**Practical Guidance:**\n1. Always speak truth, as truth is the foundation of dharma\n2. Even 'white lies' for good reasons ultimately bring suffering\n3. In difficult situations, silence is also an option\n\nWould you like to share a specific situation where you're facing moral dilemma?",
                "💫 **Consequences of Deception:**\n\nGita (17.14-16) describes austerity of body, speech and mind. Verbal austerity includes speaking truthfully and pleasantly.\n\n**Right Path:**\n• Speak truth, but not harshly\n• If truth hurts, maintain silence\n• Never cheat, no matter how great the benefit appears\n\nWhat kind of ethical challenge are you facing currently?"
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
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function getUserState(phone) {
    try {
        let res = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
        if (res.rows.length === 0) {
            await dbPool.query(`
                INSERT INTO users (
                    phone_number, first_seen_date, last_seen_date, total_sessions,
                    language_preference, last_activity_ts, memory_data, chat_history,
                    conversation_stage
                ) VALUES ($1, CURRENT_DATE, CURRENT_DATE, 1, 'English', CURRENT_TIMESTAMP, '{}', '[]', 'new_topic')
            `, [phone]);
            res = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
        }
        const user = res.rows[0];
        user.chat_history = parseChatHistory(user.chat_history);
        user.memory_data = user.memory_data || {};
        user.conversation_stage = user.conversation_stage || 'new_topic';
        user.language_preference = user.language_preference || 'English';
        return user;
    } catch (err) {
        console.error("getUserState failed:", err);
        return {
            phone_number: phone, chat_history: [], memory_data: {},
            conversation_stage: "new_topic", language_preference: "English"
        };
    }
}

async function updateUserState(phone, updates) {
    try {
        if (!updates || Object.keys(updates).length === 0) return;
        const keys = Object.keys(updates);
        const values = keys.map(k => {
            const v = updates[k];
            return (typeof v === "object" && v !== null) ? JSON.stringify(v) : v;
        });
        const clauses = keys.map((k, i) => `${k} = $${i + 1}`);
        const sql = `UPDATE users SET ${clauses.join(", ")}, last_activity_ts = CURRENT_TIMESTAMP WHERE phone_number = $${keys.length + 1}`;
        await dbPool.query(sql, [...values, phone]);
    } catch (err) {
        console.error("updateUserState failed:", err);
    }
}

/* ---------------- Analytics ---------------- */
async function trackIncoming(phone, text) {
    try {
        const user = await getUserState(phone);
        const now = new Date();
        const lastActivity = user.last_activity_ts ? new Date(user.last_activity_ts) : new Date(0);
        const diffHours = (now - lastActivity) / (1000 * 60 * 60);
        const updates = {
            last_seen_date: now.toISOString().slice(0, 10),
            total_incoming: (user.total_incoming || 0) + 1,
            ...(diffHours > 12 && { total_sessions: (user.total_sessions || 0) + 1 }),
            ...(!user.first_seen_date && { first_seen_date: now.toISOString().slice(0, 10) })
        };
        await updateUserState(phone, updates);
    } catch (err) {
        console.error("trackIncoming failed:", err);
    }
}

async function trackOutgoing(phone, reply, type = "chat") {
    try {
        const user = await getUserState(phone);
        const updates = {
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
        await trackOutgoing(phone, safeMessage, type);
        if (!HELTAR_API_KEY) {
            console.warn(`(Simulated -> ${phone}): ${safeMessage}`);
            return { simulated: true, message: safeMessage };
        }
        const payload = { messages: [{ clientWaNumber: phone, message: safeMessage, messageType: "text" }] };
        const resp = await axios.post("https://api.heltar.com/v1/messages/send", payload, {
            headers: { Authorization: `Bearer ${HELTAR_API_KEY}`, "Content-Type": "application/json" },
            timeout: 20000
        });
        return resp.data;
    } catch (err) {
        console.error("Heltar send error:", err?.response?.data || err?.message || err);
        return null;
    }
}

/* ========== Language & Intent Detection ========== */
function detectLanguageFromText(text) {
    if (!text || typeof text !== "string") return "English";
    const cleanText = text.trim().toLowerCase();
    if (/[\u0900-\u097F]/.test(text)) return "Hindi";
    if (/\b(english|speak english|angrezi)\b/i.test(cleanText)) return "English";
    if (/\b(hindi|speak hindi|hind)\b/i.test(cleanText)) return "Hindi";
    const englishGreetings = ['hi', 'hello', 'hey', 'hii', 'good morning', 'good afternoon', 'good evening'];
    if (englishGreetings.some(g => cleanText.startsWith(g))) return "English";
    const hindiGreetings = ['namaste', 'namaskar', 'pranam', 'radhe radhe', 'hare krishna', 'jai shri krishna'];
    if (hindiGreetings.some(g => cleanText.startsWith(g))) return "Hindi";
    if (/^[a-zA-Z\s\d'.,!?]+$/.test(text)) return "English";
    const hindiIndicators = ['kyu', 'kya', 'kaise', 'karo', 'kiya', 'mera', 'tera', 'apna', 'hai', 'ho', 'hun', 'main', 'tum', 'aap', 'ko', 'ka', 'ki', 'ke', 'se', 'mein', 'par', 'aur', 'lekin'];
    const hindiWordCount = hindiIndicators.filter(word => new RegExp(`\\b${word}\\b`).test(cleanText)).length;
    return hindiWordCount >= 2 ? "Hindi" : "English";
}

async function determineUserLanguage(phone, text, user) {
    const currentLanguage = user.language_preference || 'English';
    const detectedLanguage = detectLanguageFromText(text);
    const cleanText = text.toLowerCase().trim();
    const isLanguageSwitchCommand = /\b(english|hindi|speak english|speak hindi)\b/i.test(cleanText);
    if (isLanguageSwitchCommand) {
        const newLanguage = /\b(english|speak english)\b/i.test(cleanText) ? 'English' : 'Hindi';
        if (newLanguage !== currentLanguage) {
            await updateUserState(phone, { language_preference: newLanguage, conversation_stage: 'new_topic' });
            return { language: newLanguage, isSwitch: true, switchTo: newLanguage };
        }
    }
    if ((user.total_incoming || 0) <= 2 && detectedLanguage === 'Hindi' && currentLanguage === 'English') {
        await updateUserState(phone, { language_preference: 'Hindi' });
        return { language: 'Hindi', isSwitch: false };
    }
    return { language: currentLanguage, isSwitch: false };
}

/* ========== CRITICAL FIX: Enhanced Intent Detection ========== */
function isFollowUpToPreviousDeepQuestion(currentText, user) {
    if (user.last_message_role !== 'assistant') return false;

    const lastBotMessage = user.last_message || '';
    const lastUserMessage = user.chat_history?.slice(-2, -1)?.[0]?.content || '';

    // If last exchange was deep, current is likely follow-up
    const wasDeepExchange =
        isEmotionalExpression(lastUserMessage) ||
        isDeepQuestion(lastUserMessage) ||
        lastBotMessage.includes('?') || // Bot asked a question
        lastBotMessage.length > 100;      // Bot gave substantial response

    return wasDeepExchange;
}

function detectEmotionAdvanced(text) {
    const lowerText = text.toLowerCase();
    let emotion = null;
    let confidence = 0;

    const emotionKeywords = {
        purpose: { 
            keywords: ['purpose', 'meaning', 'why am i here', 'what is my life', 'उद्देश्य', 'मकसद', 'जीवन का मतलब'], 
            weight: 1.2 
        },
        moral_dilemma: {
            keywords: ['lie', 'cheat', 'wrong', 'moral', 'ethical', 'steal', 'dishonest', 'झूठ', 'धोखा', 'गलत', 'नैतिक', 'चोरी', 'बेईमान'],
            weight: 1.3
        },
        stressed: { 
            keywords: ['stress', 'stressed', 'anxious', 'tension', 'overwhelmed', 'worried', 'तनाव', 'चिंता', 'परेशान', 'घबराहट'], 
            weight: 1.0 
        },
        sadness: { 
            keywords: ['sad', 'depressed', 'unhappy', 'hopeless', 'sorrow', 'lonely', 'दुखी', 'उदास', 'निराश', 'हताश', 'अकेला'], 
            weight: 1.0 
        },
        anger: {
            keywords: ['angry', 'anger', 'frustrated', 'irritated', 'क्रोध', 'गुस्सा', 'नाराज', 'चिढ़'],
            weight: 1.0
        }
    };

    // Check patterns first (higher priority)
    const patterns = [
        { pattern: /\b(lie|cheat|wrong|moral|ethical|steal|dishonest|झूठ|धोखा|गलत|नैतिक)\b/i, emotion: 'moral_dilemma', weight: 1.5 },
        { pattern: /\b(stress|stressed|anxious|tension|overwhelmed|तनाव|चिंता|परेशान)\b/i, emotion: 'stressed', weight: 1.2 },
        { pattern: /\b(sad|depressed|unhappy|hopeless|sorrow|दुखी|उदास|निराश)\b/i, emotion: 'sadness', weight: 1.2 },
        { pattern: /\b(angry|anger|frustrated|irritated|क्रोध|गुस्सा|नाराज)\b/i, emotion: 'anger', weight: 1.2 }
    ];

    for (const { pattern, emotion: detected, weight } of patterns) {
        if (pattern.test(lowerText)) {
            emotion = detected;
            confidence = weight;
            break;
        }
    }

    // Fallback to keyword matching
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
        health: /(health|sick|pain|ill|hospital|doctor|स्वास्थ्य|बीमार|दर्द|तबीयत)/.test(lowerText),
        spiritual: /(god|prayer|meditation|yoga|spiritual|भगवान|प्रार्थना|ध्यान|योग|आध्यात्मिक)/.test(lowerText)
    };
    
    return Object.keys(situations).find(situation => situations[situation]) || 'general';
}

function isGreetingQuery(text) {
    const lowerText = text.toLowerCase().trim();
    const greetingRegex = /\b(hi|hello|hey|hii|good morning|good afternoon|good evening|how are you|kaise ho|namaste|hare krishna)\b/i;
    const simpleGreetings = ['hi', 'hello', 'hey', 'hii', 'namaste'];
    return simpleGreetings.includes(lowerText) || greetingRegex.test(lowerText);
}

function isCapabilitiesQuery(text) {
    const capabilitiesRegex = /\b(what can you do|capabilities|tell me about yourself|who are you|what do you do|how does this work)\b/i;
    return capabilitiesRegex.test(text.toLowerCase());
}

function isEmotionalExpression(text) {
    const emotionalPatterns = [
        /\b(stress|anxious|tension|overwhelmed|worried|परेशान|तनाव|चिंता)\b/i,
        /\b(sad|depressed|unhappy|hopeless|lonely|दुखी|उदास|निराश|अकेला)\b/i,
        /\b(life|relationship|family|job).*(problem|issue|difficult|trouble|समस्या|परेशानी)\b/i,
        /\b(not good|not well|feeling bad|struggling|अच्छा नहीं|ठीक नहीं|मुश्किल हो)\b/i,
        /\b(confused|lost|uncertain|don't know|what to do|कंफ्यूज|उलझन|पता नहीं)\b/i,
    ];
    return emotionalPatterns.some(pattern => pattern.test(text.toLowerCase()));
}

function isDeepQuestion(text) {
    const lowerText = text.toLowerCase();
    const deepQuestionPatterns = [
        // Moral/ethical questions
        /\b(is.*wrong|right.*wrong|moral|ethical|lie|cheat|steal|honest)\b/i,
        /\b(गलत|सही|नैतिक|झूठ|धोखा|ईमानदार)\b/,
        // Spiritual questions
        /\b(krishna.*say|gita.*teach|spiritual|meditation|yoga|god)\b/i,
        /\b(कृष्ण.*कह|गीता.*सिख|आध्यात्मिक|ध्यान|योग|भगवान)\b/,
        // Life guidance
        /\b(how.*start|what.*do|why.*happen|when.*know)\b/i,
        /\b(कैसे.*शुरू|क्या.*करू|क्यों.*हो|कब.*पता)\b/,
        // Problem questions
        /\b(problem|issue|challenge|difficult|struggle|confused)\b/i,
        /\b(समस्या|मुश्किल|चुनौती|परेशान|उलझन)\b/
    ];
    return deepQuestionPatterns.some(pattern => pattern.test(lowerText));
}

function isSmallTalk(text) {
    const lowerText = text.toLowerCase().trim();
    // DON'T classify these as small talk:
    const seriousIndicators = [
        'lie', 'cheat', 'wrong', 'moral', 'ethical', 'steal', 'dishonest',
        'झूठ', 'धोखा', 'गलत', 'नैतिक', 'चोरी', 'बेईमान',
        'how do i', 'what should', 'why is', 'can i',
        'कैसे', 'क्या', 'क्यों', 'करूं'
    ];
    if (seriousIndicators.some(indicator => lowerText.includes(indicator))) {
        return false; // This is a serious question!
    }
    // Only real small talk patterns
    const genuineSmallTalk = [
        'thanks', 'thank you', 'ok', 'okay', 'good', 'nice', 'cool',
        'शुक्रिया', 'धन्यवाद', 'ठीक', 'अच्छा', 'बढ़िया'
    ].some(pattern => lowerText === pattern);
    return genuineSmallTalk;
}

/* ========== Memory & Follow-up Systems ========== */
async function storeUserMemory(phone, key, value, ttlHours = 8) {
    try {
        const user = await getUserState(phone);
        const currentMemory = user.memory_data || {};
        currentMemory[key] = {
            value: value,
            expires_at: new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()
        };
        await updateUserState(phone, { memory_data: currentMemory });
    } catch (err) {
        console.error("Memory storage error:", err);
    }
}

async function getUserMemory(phone, key) {
    try {
        const user = await getUserState(phone);
        const memory = user.memory_data || {};
        const memoryItem = memory[key];
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

/* ========== Core Response Handlers ========== */
async function handleEmotionalExpression(phone, text, language, user, detectedEmotion) {
    console.log(`💔 Handling emotional expression: ${detectedEmotion}`);
    
    const conversationContext = {
        stage: "emotional_support",
        emotion: detectedEmotion,
        situation: detectUserSituation(text),
        previousMessages: user.chat_history?.slice(-4) || [],
        language: language
    };

    await getAIResponse(phone, text, language, conversationContext);
    await updateUserState(phone, { conversation_stage: "emotional_support" });
    await storeUserMemory(phone, 'last_emotion', detectedEmotion, 8);
    await storeUserMemory(phone, 'emotion_detected_time', new Date().toISOString(), 8);
}

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

async function getAIResponse(phone, text, language, conversationContext = {}) {
    try {
        if (!OPENAI_KEY || OPENAI_KEY === '') {
            console.log("🔄 No OpenAI key, using fallback response");
            return await getFallbackResponse(phone, text, language, conversationContext);
        }

        console.log("🤖 Using OpenAI for dynamic response...");

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
            max_tokens: 600,
            temperature: 0.8,
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
            
            const completeResponse = ensureCompleteResponse(aiResponse, language);
            const finalResponse = completeResponse.slice(0, MAX_REPLY_LENGTH);
            
            await sendViaHeltar(phone, finalResponse, "ai_response");
            
            // Update chat history with bot response
            const user = await getUserState(phone);
            const updatedHistory = [...(user.chat_history || []), { 
                role: 'assistant', 
                content: finalResponse 
            }];
            await updateUserState(phone, { 
                chat_history: updatedHistory,
                last_message: finalResponse,
                last_message_role: 'assistant'
            });
            
            return;
        } else {
            throw new Error("Empty or invalid response from OpenAI");
        }

    } catch (err) {
        console.error("❌ AI response error:", err.message);
        console.log("🔄 Falling back to fixed response due to OpenAI error");
        await getFallbackResponse(phone, text, language, conversationContext);
    }
}

function ensureCompleteResponse(response, language) {
    const trimmedResponse = response.trim();
    
    if (!/[.!?।]\s*$/.test(trimmedResponse)) {
        if (language === "Hindi") {
            return trimmedResponse + " क्या यह उत्तर आपकी जिज्ञासा को शांत करता है?";
        } else {
            return trimmedResponse + " Does this answer help clarify your question?";
        }
    }
    
    // If ends with sentence but not a question, add engaging question
    if (/[.!।]\s*$/.test(trimmedResponse) && !/[?？]\s*$/.test(trimmedResponse)) {
        if (language === "Hindi") {
            return trimmedResponse + " क्या यह उपयोगी लगा?";
        } else {
            return trimmedResponse + " Does this resonate with you?";
        }
    }
    
    return response;
}

async function getFallbackResponse(phone, text, language, conversationContext = {}) {
    console.log("🔄 Using enhanced fallback response");
    
    const emotion = detectEmotionAdvanced(text)?.emotion || 'purpose';
    console.log(`🎯 Detected emotion for fallback: ${emotion}`);
    
    const gitaWisdom = GITA_WISDOM_DATABASE[emotion] || GITA_WISDOM_DATABASE.purpose;
    
    const responses = language === "Hindi" 
        ? gitaWisdom.teachings.hindi 
        : gitaWisdom.teachings.english;
    
    const selectedResponse = responses[Math.floor(Math.random() * responses.length)];
    
    console.log(`📤 Sending fallback response for emotion: ${emotion}`);
    await sendViaHeltar(phone, selectedResponse, "fallback_wisdom");
}

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

async function handleLanguageSwitch(phone, newLanguage) {
    const confirmationMessage = newLanguage === 'English'
        ? "Of course! I will now communicate in English. How can I assist you with the wisdom of the Gita today? 😊"
        : "ज़रूर! अब मैं आपसे हिंदी में बात करूँगा। मैं आज गीता के ज्ञान से आपकी क्या सहायता कर सकता हूँ? 😊";
    await sendViaHeltar(phone, confirmationMessage, "language_switch");
}

// Simple handler for genuine small talk
async function handleSmallTalk(phone, text, language) {
    let response;
    const lower = text.toLowerCase();
    if (language === "Hindi") {
        if (lower.includes('thank') || lower.includes('शुक्रिया')) {
            response = "आपका स्वागत है! 🙏 क्या आप और कुछ चाहेंगे?";
        } else {
            response = "ठीक है! 😊 आप आगे क्या जानना चाहेंगे?";
        }
    } else {
        if (lower.includes('thank')) {
            response = "You're welcome! 🙏 Is there anything else you need?";
        } else {
            response = "Okay! 😊 What would you like to know more about?";
        }
    }
    await sendViaHeltar(phone, response, "small_talk");
}

/* ========== MAIN WEBHOOK HANDLER (FIXED VERSION) ========== */
app.post("/webhook", async (req, res) => {
    try {
        res.status(200).send("OK");
        const body = req.body || {};
        const msg = parseWebhookMessage(body);

        if (!msg) return;

        const phone = msg?.from || msg?.clientWaNumber;
        const rawText = msg?.text?.body || msg?.button?.payload || "";
        const text = String(rawText || "").trim();

        if (!phone || text.length === 0) return;

        console.log(`📩 Incoming from ${phone}: "${text}"`);
        await trackIncoming(phone, text);

        // Get user state FIRST
        const user = await getUserState(phone);
        const languageResult = await determineUserLanguage(phone, text, user);
        const language = languageResult.language;

        // CRITICAL FIX: Check if this is follow-up to deep conversation
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

        // 1. LANGUAGE SWITCH - Highest priority
        if (languageResult.isSwitch) {
            await handleLanguageSwitch(phone, languageResult.switchTo);
            return;
        }

        // 2. GREETINGS - Only if not a follow-up
        if (!isFollowUp && isGreetingQuery(text)) {
            console.log("✅ Intent: Greeting");
            await handleEnhancedStartupMenu(phone, language, user);
            return;
        }

        // 3. MENU CHOICES
        if (user.conversation_stage === "awaiting_menu_choice" && /^[1-4]$/.test(text.trim())) {
            console.log("✅ Intent: Menu Choice");
            await handleEnhancedMenuChoice(phone, text.trim(), language, user);
            return;
        }

        // 4. EMOTIONAL/DEEP QUESTIONS - Process these before small talk
        const emotionDetection = detectEmotionAdvanced(text);
        const detectedEmotion = emotionDetection?.emotion;

        if (detectedEmotion || isDeepQuestion(text) || isFollowUp) {
            console.log(`🎯 Deep/Follow-up question detected. Emotion: ${detectedEmotion}, Follow-up: ${isFollowUp}`);

            const conversationContext = {
                stage: user.conversation_stage,
                emotion: detectedEmotion,
                situation: detectUserSituation(text),
                previousMessages: user.chat_history?.slice(-4) || [],
                language: language,
                isFollowUp: isFollowUp
            };

            await getAIResponse(phone, text, language, conversationContext);
            return;
        }

        // 5. GENUINE SMALL TALK - Only after all serious checks have failed
        if (isSmallTalk(text)) {
            console.log(`💬 Intent: Genuine small talk`);
            await handleSmallTalk(phone, text, language);
            return;
        }

        // 6. DEFAULT: All other cases go to the AI for a meaningful response
        console.log(`🤖 Intent: Default to AI response`);
        const defaultContext = {
            stage: user.conversation_stage,
            emotion: null,
            situation: 'general',
            previousMessages: user.chat_history?.slice(-4) || [],
            language: language
        };
        await getAIResponse(phone, text, language, defaultContext);

    } catch (err) {
        console.error("❌ Webhook error:", err?.message || err);
    }
});

/* ---------------- Health & Server Start ---------------- */
app.get("/health", (req, res) => {
    res.json({
        status: "ok", bot: BOT_NAME, timestamp: new Date().toISOString(),
        features: ["Context-Aware Intent", "Gita-Grounded Responses", "Practical Action Steps"]
    });
});

app.use((err, req, res, next) => {
    console.error("❌ Unhandled Error:", err);
    res.status(500).send("Internal Server Error");
});

app.listen(PORT, () => {
    validateEnvVariables();
    console.log(`\n🚀 ${BOT_NAME} listening on port ${PORT}`);
    console.log("✅ CONTEXT-AWARE logic applied successfully.");
    console.log("🎯 Critical fixes implemented:");
    console.log("   • Enhanced emotion detection");
    console.log("   • Context-aware conversation flow");
    console.log("   • No more misclassified small talk");
    console.log("   • Complete response handling");
    setupDatabase().catch(console.error);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await dbPool.end();
    process.exit(0);
});
