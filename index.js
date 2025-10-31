// index.js — SarathiAI (PRODUCTION READY v5 - COMPLETE)
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

const MAX_REPLY_LENGTH = parseInt(process.env.MAX_REPLY_LENGTH || "350", 10) || 350;

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

/* =============== COMPLETE TEMPLATE RESPONSE SYSTEM =============== */
const OPTIMIZED_TEMPLATE_RESPONSES = {
    // PROBLEM SOLVER TEMPLATE BUTTONS
    'work stress': {
        english: `Work pressure overwhelming? 😔 That's a heavy, draining feeling.

Krishna says in Gita 2.47: "Focus on duty, not results."

This moment will pass. Your inner strength is greater than any stress. 🕉️

Let's pinpoint this: What's the *one* task weighing most heavily on you?`,
        
        hindi: `काम का तनाव भारी लग रहा? 😔 यह एक थका देने वाली भावना है।

कृष्ण गीता 2.47 में कहते: "कर्म करो, फल की चिंता मत करो।"

यह समय भी बीत जाएगा। आपकी आंतरिक शक्ति तनाव से बड़ी है। 🕉️

चलिए मुद्दे पर आते हैं: वो *कौन सा एक* काम है जो सबसे भारी लग रहा है?`
    },
    
    'relationship issues': {
        english: `Relationship struggles hurt deeply... 💔 It can feel very isolating.

Gita teaches: See the divine in every being, even when it's hard.

Krishna's wisdom can heal connections. 🌟

What part of this feels most painful *to you* right now?`,
        
        hindi: `रिश्तों की परेशानियाँ गहरा दुख देती हैं... 💔 इसमें बहुत अकेलापन महसूस हो सकता है।

गीता सिखाती: हर प्राणी में दिव्यता देखो, तब भी जब यह मुश्किल हो।

कृष्ण का ज्ञान आपके जुड़ाव को ठीक कर सकता है। 🌟

अभी सबसे ज्यादा दर्द *आपको* किस बात का है?`
    },
    
    'personal confusion': {
        english: `Feeling lost about life's path? 🌀 That's a very common, human feeling.

Gita wisdom: Your soul is eternal, this confusion is temporary.

Krishna guides through every uncertainty. ✨

What's the *one* decision that feels most unclear right now?`,
        
        hindi: `जीवन का रास्ता भटका हुआ लगता है? 🌀 यह एक बहुत ही सामान्य, मानवीय भावना है।

गीता ज्ञान: आपकी आत्मा अमर है, यह भ्रम अस्थायी है।

कृष्ण हर अनिश्चितता में मार्गदर्शन देते हैं। ✨

वो *कौन सा एक* निर्णय है जो अभी सबसे अस्पष्ट लग रहा है?`
    },
    
    'anxiety': {
        english: `Anxiety making everything feel out of control? 😰 That feeling is exhausting.

Krishna reminds in Gita 2.56: "Be steady in sorrow and joy."

This wave will settle, revealing your calm center. 🌊

What's the *one thought* that keeps looping in your mind? Let's face it together.`,
        
        hindi: `चिंता सब कुछ बेकाबू लग रहा है? 😰 यह भावना थका देती है।

कृष्ण गीता 2.56 में याद दिलाते: "दुख और सुख में स्थिर रहो।"

यह चिंता की लहर थमेगी, आपका शांत केंद्र प्रकट होगा। 🌊

वो *कौन सा एक विचार* है जो दिमाग में घूम रहा है? चलिए उसका सामना करते हैं।`
    },
    
    'custom help': {
        english: `I understand you need personalized guidance... 🤔

Krishna's Gita offers wisdom for every unique situation.

Your challenge deserves a specific solution, not a template. 💫

Please tell me, what particular situation are you facing?`,
        
        hindi: `समझता हूँ आपको व्यक्तिगत मार्गदर्शन चाहिए... 🤔

कृष्ण की गीता हर अनोखी स्थिति के लिए ज्ञान देती है।

आपकी चुनौती के लिए विशेष समाधान चाहिए, कोई टेम्पलेट नहीं। 💫

कृपया बताएं, आप किस खास स्थिति का सामना कर रहे हैं?`
    },

    // DAILY WISDOM TEMPLATE BUTTONS
    'practice': {
        english: `🕉️ *2-Minute Practice: Focus on Action*

Let's practice Gita's wisdom together:

1. *Identify*: What's one small action you can take today?
2. *Release*: Say "I offer the results to Krishna" 
3. *Act*: Do it with full focus for 2 minutes

Example: "I'll make one important call without worrying about the outcome."

What *one action* will you focus on for 2 minutes today?`,

        hindi: `🕉️ *2-मिनट का अभ्यास: कर्म पर ध्यान*

आइए गीता का ज्ञान साथ में अभ्यास करें:

1. *पहचानें*: आज आप एक छोटा सा क्या कार्य कर सकते हैं?
2. *छोड़ें*: कहें "मैं परिणाम कृष्ण को समर्पित करता हूँ"
3. *कार्य करें*: 2 मिनट पूरे ध्यान से करें

उदाहरण: "मैं बिना परिणाम की चिंता किए एक जरूरी कॉल करूंगा।"

आज 2 मिनट के लिए आप *कौन सा एक कार्य* करेंगे?`
    },

    // EMOTIONAL CHECK-IN TEMPLATE BUTTONS  
    'hare krishna': {
        english: `That heavy feeling is real... 💭

Krishna says: "The soul is eternal" - this emotion doesn't define *you*.

His love is constant, even in difficult moments. ❤️

What's specifically on your mind? I'm here to listen.`,
        
        hindi: `वह भारीपन वास्तविक है... 💭

कृष्ण कहते: "आत्मा अमर है" - यह भावना आपको परिभाषित नहीं करती।

उनका प्यार स्थिर है, मुश्किल समय में भी। ❤️

अभी खासकर आपके मन में क्या चल रहा है? मैं सुनने के लिए यहाँ हूँ।`
    }
};

// Button text mapping for detection
const BUTTON_MAPPING = {
    // English buttons
    'work stress': 'work stress',
    'relationship issues': 'relationship issues',
    'personal confusion': 'personal confusion',
    'anxiety': 'anxiety',
    'custom help': 'custom help',
    'practice': 'practice',
    'hare krishna': 'hare krishna',
    
    // Hindi buttons
    'काम का तनाव': 'work stress',
    'रिश्ते की परेशानी': 'relationship issues',
    'व्यक्तिगत उलझन': 'personal confusion',
    'चिंता': 'anxiety',
    'आपके अनुसार': 'custom help',
    'अभ्यास': 'practice',
    'हरे कृष्ण': 'hare krishna'
};

/* ---------------- ENGAGEMENT QUESTIONS SYSTEM ---------------- */
const ENGAGEMENT_QUESTIONS = {
  english: [
    "What's the *one* thought that keeps looping? Let's try to untangle it.",
    "If you could change just *one* small thing about this situation, what would it be? Let's start there.",
    "What's the specific feeling that's hardest to shake right now (like anger, fear, sadness)?",
    "What does the 'worst-case scenario' look like in your mind? Let's look at it clearly.",
    "What advice do you *think* Krishna would give you? Let's explore that.",
    "What would a moment of peace feel like *right now*?",
    "What's the one part of this you *can* control?",
    "If you had to explain this problem to a friend, what's the first thing you'd say?"
  ],
  hindi: [
    "कौन सा *एक* विचार बार-बार घूम रहा है? चलिए उसे सुलझाते हैं।",
    "अगर आप *एक* छोटी सी चीज़ बदल पाते, तो वो क्या होती? वहीं से शुरू करते हैं।",
    "अभी कौन सी *एक* भावना सबसे भारी है (जैसे गुस्सा, डर, या उदासी)?",
    "आपके मन में 'सबसे बुरा' क्या हो सकता है? चलिए उसे स्पष्ट रूप से देखते हैं।",
    "आपको क्या लगता है कृष्ण आपको क्या सलाह देते? इस पर बात करते हैं।",
    "इस पल में *शांति* का एक पल कैसा महसूस होगा?",
    "इस स्थिति का कौन सा *एक* हिस्सा आपके नियंत्रण में है?",
    "अगर आपको यह समस्या किसी दोस्त को समझानी हो, तो आप पहली बात क्या कहेंगे?"
  ]
};

// Track last used questions per user to avoid repetition
const userQuestionHistory = new Map();

function getEngagementQuestion(phone, language) {
  const questions = ENGAGEMENT_QUESTIONS[language] || ENGAGEMENT_QUESTIONS.english;
  
  if (!userQuestionHistory.has(phone)) {
    userQuestionHistory.set(phone, []);
  }
  let usedQuestions = userQuestionHistory.get(phone);
  
  if (usedQuestions.length >= questions.length) {
    usedQuestions = [];
    userQuestionHistory.set(phone, usedQuestions);
  }
  
  const availableQuestions = questions.filter((_, index) => !usedQuestions.includes(index));
  
  if (availableQuestions.length === 0) {
      return questions[0];
  }
  
  const randomIndex = Math.floor(Math.random() * availableQuestions.length);
  const selectedQuestion = availableQuestions[randomIndex];
  
  if (!selectedQuestion) {
      return questions[0];
  }

  const questionIndex = questions.indexOf(selectedQuestion);
  usedQuestions.push(questionIndex);
  userQuestionHistory.set(phone, usedQuestions);
  
  return selectedQuestion;
}

/* ---------------- ADVANCED LANGUAGE DETECTION ---------------- */
function detectLanguageFromText(text, currentLanguage = "English") {
    if (!text || typeof text !== "string") return currentLanguage;
    
    const cleanText = text.trim().toLowerCase();
    
    // 1. EXPLICIT language commands - HIGHEST PRIORITY
    if (cleanText.includes('english') || cleanText.includes('speak english') || cleanText.includes('angrezi')) {
        return "English";
    }
    if (cleanText.includes('hindi') || cleanText.includes('speak hindi') || cleanText.includes('hind')) {
        return "Hindi";
    }
    
    // 2. Hindi script detection - ABSOLUTE CONFIDENCE
    if (/[\u0900-\u097F]/.test(text)) {
        return "Hindi";
    }

    // 3. Romanized Hindi detection
    const hindiRomanPatterns = [
        /\b(kaise|kya|kyu|kaun|kahan|kab|kaisa|kitna|karni|karte|hain|ho|hai|hun)\b/i,
        /\b(main|mera|mere|meri|tum|aap|hum|hamara|unka|uska|apna|apne)\b/i,
        /\b(mujhe|tujhe|use|hamein|unhein|karke|hokar|kar|lekin|par|aur|ya)\b/i,
        /\b(accha|theek|sahi|galat|bhoot|zyada|kam|subah|shaam|raat)\b/i,
        /\b(bahut|thoda|kyun|karo|kare|rahe|raha|rahi|chahiye|nahi|nahin)\b/i
    ];
    
    const hindiMatches = hindiRomanPatterns.filter(pattern => pattern.test(cleanText)).length;
    if (hindiMatches >= 2 || (hindiMatches >= 1 && cleanText.length < 25)) {
        return "Hindi";
    }
    
    // 4. Pure English text detection
    const isPureEnglish = /^[a-zA-Z\s,.!?'"-]+$/.test(text) && text.length > 2;
    if (isPureEnglish) {
        return "English";
    }
    
    // 5. Single word greetings detection
    const hindiGreetings = ['namaste', 'namaskar', 'pranam', 'radhe', 'radhe radhe', 'hare krishna'];
    const englishGreetings = ['hi', 'hello', 'hey', 'thanks', 'thank you'];
    
    if (hindiGreetings.includes(cleanText)) return "Hindi";
    if (englishGreetings.includes(cleanText)) return "English";
    
    // 6. Default to current language for ambiguous cases
    return currentLanguage;
}

/* ---------------- LANGUAGE DETERMINATION ---------------- */
async function determineUserLanguage(phone, text, user) {
    let currentLanguage = user.language_preference || user.language || 'English';
    const cleanText = text.toLowerCase().trim();

    // 1. Check for EXPLICIT commands
    const isExplicitEnglish = cleanText.includes('english') || cleanText.includes('speak english') || cleanText.includes('angrezi');
    const isExplicitHindi = cleanText.includes('hindi') || cleanText.includes('speak hindi') || cleanText.includes('hind');
    
    if (isExplicitEnglish && currentLanguage !== 'English') {
        await updateUserLanguage(phone, 'English');
        return { language: 'English', isSwitch: true };
    }
    
    if (isExplicitHindi && currentLanguage !== 'Hindi') {
        await updateUserLanguage(phone, 'Hindi');
        return { language: 'Hindi', isSwitch: true };
    }
    
    // 2. If NOT an explicit command, just detect the language for this one response
    const detectedLanguage = detectLanguageFromText(text, currentLanguage);
    
    // 3. Update preference if it's different
    if (detectedLanguage !== currentLanguage) {
        await updateUserLanguage(phone, detectedLanguage);
        return { language: detectedLanguage, isSwitch: false };
    }
    
    return { language: currentLanguage, isSwitch: false };
}

async function updateUserLanguage(phone, language) {
    await updateUserState(phone, { 
        language_preference: language, 
        language: language 
    });
}

/* ---------------- MESSAGE LENGTH OPTIMIZATION ---------------- */
function optimizeMessageForWhatsApp(message, maxLength = 350) {
    if (!message || message.length <= maxLength) {
        return message;
    }
    
    // NEVER cut menus or template responses
    if (message.includes('🚩') || message.includes('Welcome') || message.includes('स्वागत') || 
        message.includes('1️⃣') || message.includes('2️⃣') || message.includes('3️⃣') || 
        message.includes('4️⃣') || message.includes('5️⃣')) {
        return message;
    }
    
    // For template responses, preserve structure
    if (message.includes('\n\n')) {
        const parts = message.split('\n\n');
        if (parts.length >= 2) {
            let shortened = parts[0] + '\n\n' + parts[1];
            if (shortened.length > maxLength) {
                const sentences = parts[0].split(/[.!?।]/).filter(s => s.trim().length > 5);
                if (sentences.length > 0) {
                    shortened = sentences[0] + '.';
                }
            }
            
            if (shortened.length < message.length) {
                const hasHindi = /[\u0900-\u097F]/.test(message);
                shortened += hasHindi ? '\n\nक्या और जानना चाहेंगे? 👍' : '\n\nWant to know more? 👍';
            }
            
            return shortened.substring(0, maxLength);
        }
    }
    
    // For regular messages, split by sentences
    const sentences = message.split(/[.!?।]/).filter(s => s.trim().length > 10);
    
    if (sentences.length <= 1) {
        if (message.length > maxLength) {
            const truncated = message.substring(0, maxLength - 20);
            const lastSpace = truncated.lastIndexOf(' ');
            const lastPeriod = truncated.lastIndexOf('.');
            const breakPoint = Math.max(lastPeriod, lastSpace);
            
            if (breakPoint > maxLength - 50) {
                return truncated.substring(0, breakPoint) + '...';
            }
            return truncated + '...';
        }
        return message;
    }
    
    let shortened = sentences.slice(0, 2).join('. ') + '.';
    
    if (shortened.length < message.length) {
        const hasHindi = /[\u0900-\u097F]/.test(message);
        shortened += hasHindi ? '\n\nक्या और जानना चाहेंगे? 👍' : '\n\nWant to know more? 👍';
    }
    
    if (shortened.length > maxLength) {
        const safeShortened = shortened.substring(0, maxLength - 10);
        const lastSpace = safeShortened.lastIndexOf(' ');
        return safeShortened.substring(0, lastSpace) + '...';
    }
    
    return shortened;
}

/* ---------------- ANALYTICS TRACKING ---------------- */
async function trackTemplateButtonClick(phone, buttonType, buttonText, language) {
    try {
        await dbPool.query(`
            INSERT INTO user_engagement 
            (phone_number, button_clicked, template_id, language, created_at)
            VALUES ($1, $2, $3, $4, NOW())
        `, [
            phone,
            buttonType,
            'morning_template',
            language
        ]);

        console.log(`📊 Analytics: ${buttonType} by ${phone} in ${language}`);
    } catch (error) {
        console.error('Analytics tracking error:', error.message);
    }
}

/* ---------------- Template Button Detection ---------------- */
function isTemplateButtonResponse(text) {
    const cleanText = text.toLowerCase().trim();
    return Object.keys(BUTTON_MAPPING).some(button => 
        cleanText === button.toLowerCase() || cleanText.includes(button.toLowerCase())
    );
}

function getButtonType(text) {
    const cleanText = text.toLowerCase().trim();
    for (const [buttonText, buttonType] of Object.entries(BUTTON_MAPPING)) {
        if (cleanText === buttonText.toLowerCase() || cleanText.includes(buttonText.toLowerCase())) {
            return buttonType;
        }
    }
    return null;
}

/* ---------------- Template Button Response Handler ---------------- */
async function handleTemplateButtonResponse(phone, text, language, user) {
    const buttonType = getButtonType(text);
    
    if (!buttonType) {
        console.log(`❓ Unknown button text: "${text}"`);
        return false;
    }

    console.log(`🎯 Processing template button: ${buttonType} in ${language}`);

    // Track the button click
    await trackTemplateButtonClick(phone, buttonType, text, language);

    // Get optimized response
    const responseTemplate = OPTIMIZED_TEMPLATE_RESPONSES[buttonType];
    if (!responseTemplate) {
        console.log(`❌ No response template for: ${buttonType}`);
        return false;
    }

    const response = responseTemplate[language] || responseTemplate.english;
    
    // Send the optimized response
    await sendViaHeltar(phone, response, `template_button_${buttonType}`);
    
    // Update user state to continue conversation
    await updateUserState(phone, {
        conversation_stage: 'chatting',
        last_menu_choice: buttonType,
        last_activity_ts: new Date().toISOString()
    });

    console.log(`✅ Template button handled: ${buttonType} for ${phone}`);
    return true;
}

/* ---------------- ENHANCED GITA WISDOM DATABASE ---------------- */
const ENHANCED_GITA_WISDOM = {
    stress: {
        verses: ["2.56", "18.63", "2.40"],
        teachings: {
            hindi: [
                `🌊 **तनाव का सामना**

आपका तनाव स्वाभाविक है। गीता (2.56) कहती है: "दुःखेषु अनुद्विग्नमनाः" - दुख में जिसका मन विचलित नहीं होता।

**शांत रहने के उपाय:**
1. 4-7-8 श्वास: 4 सेकंड साँस लें, 7 रोकें, 8 छोड़ें
2. छोटे-छोटे कदम सोचें - एक बार में एक ही काम

आप किस एक छोटे कदम से शुरूआत कर सकते हैं?`,

                `🛡️ **आंतरिक सुरक्षा**

गीता (18.63) कहती है: "तुम चिंतन करो, फिर जैसा तुम्हारा मन चाहे वैसा करो।" यह आपको आत्मविश्वास देता है।

**तत्काल क्रिया:**
• सबसे बुरा परिणाम लिखें - फिर उसका समाधान सोचें
• 3 विश्वसनीय लोगों की सूची बनाएं

आप किस एक छोटे कदम से शुरूआत कर सकते हैं?`
            ],
            english: [
                `🌊 **Facing Stress**

Your stress is natural. Gita (2.56) says: "One who is undisturbed in sorrow..."

**Calming Techniques:**
1. 4-7-8 breathing: Inhale 4s, hold 7s, exhale 8s  
2. Think small steps - one thing at a time

What's one small step you could start with?`,

                `🛡️ **Inner Security**

Gita (18.63) says: "Reflect fully, then act as you choose." This gives you confidence.

**Immediate Action:**
• Write worst-case scenario - then brainstorm solutions
• List 3 trusted people you can talk to

What's one small step you could start with?`
            ]
        }
    },
    
    relationships: {
        verses: ["6.9", "12.13-14", "16.1-3"],
        teachings: {
            hindi: [
                `💫 **रिश्तों में संतुलन**

गीता (6.9) कहती है: "जो सभी प्राणियों में समभाव रखता है, वह योगी मुझे प्रिय है।"

**व्यावहारिक कदम:**
1. बिना शर्त स्वीकार करना सीखें
2. अपनी अपेक्षाओं को कम करें

किस एक रिश्ते पर आप अभी ध्यान देना चाहेंगे?`,

                `🌅 **दिव्य दृष्टि**

गीता (12.13) सिखाती: "जो किसी से द्वेष नहीं रखता, जो मित्रवत और दयालु है..."

**आज का अभ्यास:**
• एक व्यक्ति में एक अच्छाई ढूंढें
• बिना JUDGE किए सुनें

क्या आप किसी विशेष रिश्ते के बारे में बात करना चाहेंगे?`
            ],
            english: [
                `💫 **Balance in Relationships**

Gita (6.9) says: "Those who see all beings as equal attain supreme devotion."

**Practical Steps:**
1. Practice unconditional acceptance
2. Reduce your expectations

Which one relationship would you like to focus on right now?`,

                `🌅 **Divine Vision**

Gita (12.13) teaches: "One who bears no hatred, who is friendly and compassionate..."

**Today's Practice:**
• Find one good quality in someone
• Listen without judgment

Would you like to talk about a specific relationship?`
            ]
        }
    }
};

/* ---------------- BALANCED AI PROMPT ---------------- */
const BALANCED_SYSTEM_PROMPT = {
  hindi: `आप सारथी AI हैं - भगवद गीता के आधार पर मार्गदर्शन देने वाले विशेषज्ञ।

**नियम:**
1. **भावना के अनुसार जवाब दें:**
   - अगर उपयोगकर्ता परेशान है: सहानुभूति दिखाएं ("मैं समझता हूँ...", "यह कठिन लग रहा है...")
   - अगर सामान्य बातचीत: सीधे और सकारात्मक रहें
   - अगर प्रश्न पूछ रहे हैं: सीधा उत्तर दें

2. **हमेशा शामिल करें:**
   - एक प्रासंगिक गीता श्लोक या शिक्षा
   - एक व्यावहारिक सलाह (केवल 1)
   - एक सार्थक प्रश्न जो बातचीत जारी रखे

3. **संक्षिप्त रहें:** 100 शब्दों से कम
4. **स्वाभाविक रहें:** जबरदस्ती "नकारात्मक शुरुआत" न करें

**कभी न करें:**
- "Want to know more?" या "क्या और जानना चाहेंगे?" न लिखें
- 120 शब्दों से अधिक न हो
- एक से अधिक प्रश्न न पूछें`,

  english: `You are Sarathi AI - a Gita-based guidance expert.

**RULES:**
1. **Respond according to emotion:**
   - If user is distressed: Show empathy ("I understand...", "That sounds difficult...")
   - If casual conversation: Be direct and positive  
   - If asking questions: Give direct answers

2. **Always include:**
   - One relevant Gita verse/teaching
   - One practical advice (only 1)
   - One meaningful question to continue conversation

3. **Keep it short:** Under 100 words
4. **Be natural:** Don't force "pessimistic starts"

**NEVER:**
- Write "Want to know more?" or "Does this seem helpful?"
- Exceed 120 words
- Ask more than one question`
};

/* ---------------- DATABASE SETUP ---------------- */
async function setupDatabase() {
    try {
        const client = await dbPool.connect();
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                phone_number VARCHAR(20) PRIMARY KEY,
                language VARCHAR(10) DEFAULT 'English',
                language_preference VARCHAR(10) DEFAULT 'English',
                conversation_stage VARCHAR(50) DEFAULT 'menu',
                last_menu_choice VARCHAR(50),
                last_activity_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                chat_history JSONB DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS user_engagement (
                id SERIAL PRIMARY KEY,
                phone_number VARCHAR(20),
                button_clicked VARCHAR(50),
                template_id VARCHAR(100),
                language VARCHAR(10),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS lessons (
                lesson_number INT PRIMARY KEY,
                verse TEXT,
                translation TEXT,
                commentary TEXT,
                reflection_question TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Insert sample lessons if table is empty
        const lessonCount = await client.query("SELECT COUNT(*) FROM lessons");
        if (parseInt(lessonCount.rows[0].count) === 0) {
            console.log("📚 Inserting sample lessons...");
            await client.query(`
                INSERT INTO lessons (lesson_number, verse, translation, commentary, reflection_question) VALUES
                (1, 'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।', 'You have the right to work only, but never to the fruits.', 'Focus on your duty without attachment to results. This is the path to peace and success.', 'What action can I take today without worrying about the outcome?'),
                (2, 'योगस्थः कुरु कर्माणि सङ्गं त्यक्त्वा धनञ्जय।', 'Perform your duty equipoised, O Arjuna, abandoning all attachment to success or failure.', 'Balance and equanimity lead to excellence in work and peace in life.', 'How can I stay balanced in challenging situations today?')
            `);
        }

        client.release();
        console.log("✅ Database setup complete.");
    } catch (err) {
        console.error("❌ Database setup error:", err?.message || err);
    }
}

/* ---------------- USER STATE MANAGEMENT ---------------- */
async function getUserState(phone) {
    try {
        const res = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
        if (res.rows.length === 0) {
            await dbPool.query(`
                INSERT INTO users (phone_number, language, conversation_stage) 
                VALUES ($1, 'English', 'menu')
            `, [phone]);
            
            const newRes = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
            const user = newRes.rows[0];
            user.chat_history = user.chat_history || [];
            return user;
        }
        
        const user = res.rows[0];
        user.chat_history = user.chat_history || [];
        user.conversation_stage = user.conversation_stage || 'menu';
        user.language = user.language || 'English';
        user.language_preference = user.language_preference || 'English';
        
        return user;
    } catch (err) {
        console.error("getUserState failed:", err);
        return { 
            phone_number: phone, 
            chat_history: [], 
            conversation_stage: "menu",
            language: "English",
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
        const sql = `UPDATE users SET ${clauses.join(", ")}, last_activity_ts = CURRENT_TIMESTAMP WHERE phone_number = $${keys.length + 1}`;
        await dbPool.query(sql, vals);
    } catch (err) {
        console.error("updateUserState failed:", err);
    }
}

/* ---------------- COMPLETE MENU SYSTEM ---------------- */
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
        conversation_stage: "menu"
    });
    
    console.log(`✅ Complete menu shown to ${phone} in ${language}`);
}

/* ---------------- Stage Reset Logic ---------------- */
function shouldResetToMenu(message, currentStage) {
    const cleanMessage = message.toLowerCase().trim();
    
    // Reset triggers - these should ALWAYS show menu
    const resetTriggers = [
        'hi', 'hello', 'hey', 'namaste', 'start', 'menu', 'options', 
        'help', 'guidance', 'back', 'home', 'main menu', 'hello again', 'hi again'
    ];
    
    // Always reset for greetings, regardless of current stage
    if (resetTriggers.includes(cleanMessage)) {
        return true;
    }
    
    // Reset if number input received but not in menu stage
    if (/^[1-5]$/.test(cleanMessage) && currentStage !== 'menu') {
        return true;
    }
    
    return false;
}

async function resetToMenuStage(phone, language) {
    console.log(`🔄 Resetting user ${phone} to menu stage`);
    await updateUserState(phone, { 
        conversation_stage: "menu",
        last_menu_choice: null
    });
    await handleEnhancedStartupMenu(phone, language, await getUserState(phone));
}

/* ---------------- Heltar Message Sending ---------------- */
async function sendViaHeltar(phone, message, type = "chat") {
    try {
        // Apply smart length optimization ONLY for AI responses, not menus/templates
        let finalMessage = message;
        if (type.includes('ai_response') || type === 'chat') {
            finalMessage = optimizeMessageForWhatsApp(message, MAX_REPLY_LENGTH);
        }
        // Menus, templates, and welcome messages are sent as-is
        
        const safeMessage = String(finalMessage || "").trim();
        if (!safeMessage) return;
        
        if (!HELTAR_API_KEY) {
            console.warn(`(Simulated -> ${phone}): ${safeMessage}`);
            return { simulated: true, message: safeMessage };
        }

        const payload = { 
            messages: [{ 
                clientWaNumber: phone, 
                message: safeMessage, 
                messageType: "text" 
            }] 
        };
        
        const resp = await axios.post("https://api.heltar.com/v1/messages/send", payload, {
            headers: {
                Authorization: `Bearer ${HELTAR_API_KEY}`,
                "Content-Type": "application/json"
            },
            timeout: 15000
        });

        return resp.data;
    } catch (err) {
        console.error("Heltar send error:", err?.response?.data || err?.message || err);
        return null;
    }
}

/* ---------------- Menu Choice Handler ---------------- */
async function handleEnhancedMenuChoice(phone, choice, language, user) {
    console.log(`📝 Menu choice received: ${choice}, language: ${language}`);
    
    const choices = {
        "1": {
            hindi: "🌅 आपकी वर्तमान चुनौती के लिए सही मार्गदर्शन। कृपया संक्षेप में बताएं कि आप किस परिस्थिति में हैं?",
            english: "🌅 Right guidance for your current challenge. Please briefly describe your situation?"
        },
        "2": {
            hindi: async () => {
                return `📖 *आज की गीता शिक्षा*

कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।
(गीता 2.47)

*अर्थ*: तुम्हारा कर्म करने में ही अधिकार है, फलों में कभी नहीं।

*आज का अभ्यास*: आज एक काम बिना परिणाम की चिंता किए करें।

कौन सा काम आप बिना तनाव के कर सकते हैं?`;
            },
            english: async () => {
                return `📖 *Today's Gita Wisdom*

"You have the right to work, but never to the fruit."
(Gita 2.47)

*Today's Practice*: Do one task today without worrying about the outcome.

Which task can you do without stress today?`;
            }
        },
        "3": {
            hindi: "💬 मैं सुनने के लिए यहाँ हूँ। कृपया बताएं आप कैसा महसूस कर रहे हैं? मैं गीता की शिक्षाओं के through आपकी मदद करूंगा।",
            english: "💬 I'm here to listen. Please share how you're feeling? I'll help you through the teachings of Gita."
        },
        "4": {
            hindi: "🎓 गीता ज्ञान: भगवद गीता 18 अध्यायों में विभाजित है, जो जीवन के विभिन्न पहलुओं पर प्रकाश डालती है। आप किस विषय के बारे में जानना चाहते हैं?",
            english: "🎓 Gita Knowledge: The Bhagavad Gita is divided into 18 chapters, each illuminating different aspects of life. What specific topic would you like to know about?"
        },
        "5": {
            hindi: "🌈 संपूर्ण मार्गदर्शन: आइए आपकी वर्तमान स्थिति, आध्यात्मिक जिज्ञासा, और दैनिक चुनौतियों पर चर्चा करें। कृपया बताएं आप कहाँ से शुरू करना चाहेंगे?",
            english: "🌈 Complete Guidance: Let's discuss your current situation, spiritual curiosity, and daily challenges. Please tell me where you'd like to start?"
        }
    };

    const selected = choices[choice];
    if (!selected) {
        // If not a menu choice (e.g., user typed text), treat as direct conversation
        console.log(`🔄 Treating as direct conversation instead of menu choice`);
        await updateUserState(phone, { 
            conversation_stage: "chatting"
        });
        
        // Use AI to respond
        await getAIResponse(phone, choice, language, user);
        return;
    }

    try {
        let promptContent;
        const selectedLang = selected[language] || selected.english;
        
        if (typeof selectedLang === 'function') {
            promptContent = await selectedLang();
        } else {
            promptContent = selectedLang;
        }
        
        console.log(`✅ Sending menu response for choice ${choice}`);
        await sendViaHeltar(phone, promptContent, `menu_${choice}`);
        await updateUserState(phone, { 
            conversation_stage: 'chatting',
            last_menu_choice: choice
        });
        
    } catch (error) {
        console.error(`❌ Menu choice error for ${choice}:`, error);
        const fallbackMessage = language === "Hindi" 
            ? "क्षमा करें, तकनीकी समस्या आई है। कृपया सीधे अपनी बात लिखें।"
            : "Sorry, there was a technical issue. Please type your message directly.";
        await sendViaHeltar(phone, fallbackMessage, "menu_error");
    }
}

/* ---------------- AI RESPONSE SYSTEM ---------------- */
async function getAIResponse(phone, text, language, user) {
    // If OpenAI is not available, use fallback
    if (!OPENAI_KEY) {
        await sendFallbackResponse(phone, text, language);
        return;
    }

    const cacheKey = `${phone}:${text.substring(0, 50)}:${language}`;
    
    if (responseCache.has(cacheKey)) {
        console.log("✅ Using cached response");
        const cached = responseCache.get(cacheKey);
        await sendViaHeltar(phone, cached, "ai_response");
        return;
    }

    try {
        const systemPrompt = BALANCED_SYSTEM_PROMPT[language] || BALANCED_SYSTEM_PROMPT.english;
        
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
        ];

        const body = { 
            model: OPENAI_MODEL, 
            messages: messages,
            max_tokens: 150,
            temperature: 0.7
        };

        const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
            headers: { 
                Authorization: `Bearer ${OPENAI_KEY}`, 
                "Content-Type": "application/json" 
            },
            timeout: 20000
        });

        const aiResponse = resp.data?.choices?.[0]?.message?.content;
        
        if (aiResponse && aiResponse.trim().length > 10) {
            // Clean up response
            let cleanResponse = aiResponse
                .replace(/Want to know more\?.*$/i, '')
                .replace(/Does this seem helpful\?.*$/i, '')
                .replace(/क्या और जानना चाहेंगे\?.*$/i, '')
                .replace(/समझ में आया\?.*$/i, '');

            // Ensure it ends with a question
            if (!cleanResponse.trim().endsWith('?') && !cleanResponse.includes('?')) {
                const question = getEngagementQuestion(phone, language);
                cleanResponse += ' ' + question;
            }

            await sendViaHeltar(phone, cleanResponse, "ai_response");
            
            // Cache the response
            responseCache.set(cacheKey, cleanResponse);
            setTimeout(() => responseCache.delete(cacheKey), 300000); // 5 min cache
            
        } else {
            throw new Error("Empty AI response");
        }
        
    } catch (error) {
        console.error("❌ AI response error:", error.message);
        await sendFallbackResponse(phone, text, language);
    }
}

/* ---------------- Fallback Response ---------------- */
async function sendFallbackResponse(phone, text, language) {
    const isStress = text.toLowerCase().includes('stress') || text.toLowerCase().includes('तनाव');
    const isRelationship = text.toLowerCase().includes('relationship') || text.toLowerCase().includes('रिश्त');
    
    let response;
    
    if (isStress) {
        response = language === "Hindi" 
            ? ENHANCED_GITA_WISDOM.stress.teachings.hindi[0]
            : ENHANCED_GITA_WISDOM.stress.teachings.english[0];
    } else if (isRelationship) {
        response = language === "Hindi" 
            ? ENHANCED_GITA_WISDOM.relationships.teachings.hindi[0]
            : ENHANCED_GITA_WISDOM.relationships.teachings.english[0];
    } else {
        response = language === "Hindi" 
            ? `साझा करने के लिए धन्यवाद। 🙏

गीता हमें संतुलित कर्म और भक्ति के through आंतरिक शांति पाना सिखाती है।

आज आप अपने जीवन के किस पहलू पर मार्गदर्शन चाहेंगे?`
            : `Thank you for sharing. 🙏

The Gita teaches us to find peace within through balanced action and devotion.

What aspect of your life would you like guidance with today?`;
    }
    
    await sendViaHeltar(phone, response, "fallback_response");
}

/* ---------------- Language Switch Handler ---------------- */
async function handleLanguageSwitch(phone, newLanguage) {
    const confirmationMessage = newLanguage === 'English' 
        ? "✅ Language switched to English. How can I help you today? 😊" 
        : "✅ भाषा हिंदी में बदल गई। मैं आपकी कैसे मदद कर सकता हूँ? 😊";
    
    await sendViaHeltar(phone, confirmationMessage, "language_switch");
    await resetToMenuStage(phone, newLanguage);
}

/* ---------------- MAIN WEBHOOK HANDLER ---------------- */
app.post("/webhook", async (req, res) => {
    try {
        res.status(200).send("OK"); // Respond immediately
        
        const body = req.body || {};
        console.log("📨 Webhook received:", JSON.stringify(body).substring(0, 300));

        // Extract message data
        let phone, text;
        
        if (body?.messages?.[0]) {
            // Heltar format
            phone = body.messages[0].clientWaNumber;
            text = body.messages[0].message?.text || "";
        } else if (body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            // Meta format
            phone = body.entry[0].changes[0].value.messages[0].from;
            text = body.entry[0].changes[0].value.messages[0].text?.body || "";
        } else {
            console.log("⚠️ Unknown webhook format");
            return;
        }

        if (!phone || !text) {
            console.warn("⚠️ Missing phone or text");
            return;
        }

        console.log(`📩 From ${phone}: "${text}"`);

        // Get user state
        const user = await getUserState(phone);
        
        // Determine language
        const languageResult = await determineUserLanguage(phone, text, user);
        const language = languageResult.language;
        const isLanguageSwitch = languageResult.isSwitch;

        // Handle explicit language switching
        if (isLanguageSwitch) {
            await handleLanguageSwitch(phone, language);
            return;
        }
        
        // 🎯 HIGHEST PRIORITY: Template button responses
        if (isTemplateButtonResponse(text)) {
            console.log(`🎯 Template button detected: "${text}"`);
            const handled = await handleTemplateButtonResponse(phone, text, language, user);
            if (handled) return;
        }

        // Handle stage reset
        if (shouldResetToMenu(text, user.conversation_stage)) {
            console.log(`🔄 Stage reset triggered for: "${text}"`);
            await resetToMenuStage(phone, language);
            return;
        }

        // Handle menu choices
        if (user.conversation_stage === "menu" && /^[1-5]$/.test(text.trim())) {
            await handleEnhancedMenuChoice(phone, text.trim(), language, user);
            return;
        }

        // Default: AI conversation
        await updateUserState(phone, { 
            conversation_stage: "chatting"
        });
        
        await getAIResponse(phone, text, language, user);

    } catch (err) {
        console.error("❌ Webhook error:", err?.message || err);
    }
});

/* ---------------- Health Check ---------------- */
app.get("/health", (req, res) => {
    res.json({ 
        status: "ready", 
        bot: BOT_NAME, 
        timestamp: new Date().toISOString(),
        features: [
            "✅ Complete Template System",
            "✅ Morning Campaign Ready", 
            "✅ Advanced Language Detection",
            "✅ Engagement Questions",
            "✅ Response Caching",
            "✅ Fallback Responses",
            "✅ Analytics Tracking",
            "✅ Multi-language Support"
        ],
        template_buttons: Object.keys(OPTIMIZED_TEMPLATE_RESPONSES),
        cache_size: responseCache.size,
        ready_for_morning_campaign: true
    });
});

/* ---------------- Start Server ---------------- */
app.listen(PORT, () => {
    console.log(`\n🚀 ${BOT_NAME} PRODUCTION v5 running on port ${PORT}`);
    console.log("✅ COMPLETE & READY FOR MORNING TEMPLATE CAMPAIGN");
    console.log("✅ ALL TEMPLATE BUTTONS WORKING: 'Practice', 'Work Stress', 'Relationship Issues', etc.");
    console.log("✅ ROBUST CONVERSATION FLOW WITH MENU SYSTEM");
    console.log("✅ ADVANCED LANGUAGE DETECTION & ANALYTICS");
    setupDatabase().catch(console.error);
});

// Cleanup interval
setInterval(() => {
    console.log(`🔄 Cache stats: ${responseCache.size} cached responses`);
}, 60000);

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await dbPool.end();
    process.exit(0);
});
