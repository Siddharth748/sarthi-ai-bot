// index.js — SarathiAI (COMPLETE REVIVED v4)
// This version fixes all previous bugs AND adds handling for the "अभ्यास" button.
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

/* =============== 🚨 OPTIMIZED TEMPLATE BUTTON RESPONSE SYSTEM =============== */

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

    // DAILY WISDOM & MORNING MESSAGE TEMPLATE BUTTONS
    'practice': {
        english: `Ready to practice focusing on action, not results? 🙏

A simple start: Take 3 deep breaths. With each exhale, silently repeat, "I focus on my effort."

Feel the calm return as you let go of outcomes.

How did that feel? Did it help shift your focus even slightly?`,

        // *** UPDATED for morning message context ***
        hindi: `कर्म पर ध्यान केंद्रित करने का अभ्यास करने के लिए तैयार हैं, फल पर नहीं? 🙏

एक सरल शुरुआत: 3 गहरी साँसें लें। हर साँस छोड़ते हुए, मन ही मन दोहराएं, "मैं अपने प्रयास पर ध्यान केंद्रित करता हूँ।"

परिणामों को छोड़ते हुए लौटती हुई शांति को महसूस करें।

यह कैसा लगा? क्या इसने आपके ध्यान को थोड़ा भी बदलने में मदद की?`
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
    'आपके अनुसार': 'custom help',
    'अभ्यास': 'practice', // *** ADDED 'अभ्यास' button ***
    'हरे कृष्ण': 'hare krishna' // Assuming you might add this button text too
};

/* ---------------- [FIXED] CONVINCING ENGAGEMENT QUESTIONS ---------------- */
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

/* ---------------- [FIXED] `undefined` BUG in getEngagementQuestion ---------------- */
function getEngagementQuestion(phone, language) {
  const questions = ENGAGEMENT_QUESTIONS[language] || ENGAGEMENT_QUESTIONS.english;

  if (!userQuestionHistory.has(phone)) {
    userQuestionHistory.set(phone, []);
  }
  let usedQuestions = userQuestionHistory.get(phone); // Use 'let'

  // *** FIX ***
  // If all questions used, reset the array *before* filtering
  if (usedQuestions.length >= questions.length) {
    console.log(`♻️ Resetting engagement questions for ${phone}`);
    usedQuestions = []; // Reset the array
    userQuestionHistory.set(phone, usedQuestions); // Save the reset
  }

  const availableQuestions = questions.filter((_, index) => !usedQuestions.includes(index));

  // *** ADD SAFETY CHECK ***
  if (availableQuestions.length === 0) {
      // This should no longer happen, but as a fallback:
      userQuestionHistory.set(phone, []); // Reset
      console.log(`🎯 EngagementQuestion fallback: returning first question.`);
      return questions[0]; // Return the first question
  }

  const randomIndex = Math.floor(Math.random() * availableQuestions.length);
  const selectedQuestion = availableQuestions[randomIndex];

  // Safety check if selectedQuestion is somehow undefined
  if (!selectedQuestion) {
      console.log(`🎯 EngagementQuestion fallback: selectedQuestion was undefined.`);
      return questions[0];
  }

  const questionIndex = questions.indexOf(selectedQuestion);
  if (questionIndex !== -1) { // Ensure index is valid before pushing
    usedQuestions.push(questionIndex);
    userQuestionHistory.set(phone, usedQuestions);
  } else {
    console.error(`Error finding index for question: "${selectedQuestion}"`);
  }


  console.log(`🎯 Selected engagement question: "${selectedQuestion}" for ${phone}`);
  return selectedQuestion;
}

/* ---------------- [FIXED] LANGUAGE DETECTION ---------------- */
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

    // 3. Romanized Hindi detection - STRONG PATTERNS (MOVED UP)
    // *** FIX: This now runs *before* pure English check to catch "Isme kya samjaya gya hai" ***
    const hindiRomanPatterns = [
        /\b(kaise|kya|kyu|kaun|kahan|kab|kaisa|kitna|karni|karte|hain|ho|hai|hun)\b/i,
        /\b(main|mera|mere|meri|tum|aap|hum|hamara|unka|uska|apna|apne)\b/i,
        /\b(mujhe|tujhe|use|hamein|unhein|karke|hokar|kar|lekin|par|aur|ya)\b/i,
        /\b(accha|theek|sahi|galat|bhoot|zyada|kam|subah|shaam|raat)\b/i,
        /\b(bahut|thoda|kyun|karo|kare|rahe|raha|rahi|chahiye|nahi|nahin)\b/i
    ];

    const hindiMatches = hindiRomanPatterns.filter(pattern => pattern.test(cleanText)).length;
    // Be more aggressive for short queries like "kya hai"
    if (hindiMatches >= 2 || (hindiMatches >= 1 && cleanText.length < 25)) {
        return "Hindi";
    }

    // 4. Pure English text detection (MOVED DOWN)
    // Ensure it doesn't match single common English words often used in Hindi
    const commonEnglishWords = /\b(ok|yes|no|hi|hello|hey|thanks|thank|menu|help|options)\b/;
    const isPureEnglish = /^[a-zA-Z\s,.!?'"-]+$/.test(text) && text.length > 2 && !commonEnglishWords.test(cleanText);
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

/* ---------------- [FIXED] LANGUAGE DETERMINATION ---------------- */
// This function is now rewritten to separate EXPLICIT commands from IMPLICIT detection.
async function determineUserLanguage(phone, text, user) {
    let currentLanguage = user.language_preference || user.language || 'English';
    const cleanText = text.toLowerCase().trim();

    // 1. Check for EXPLICIT commands
    const isExplicitEnglish = cleanText.includes('english') || cleanText.includes('speak english') || cleanText.includes('angrezi');
    const isExplicitHindi = cleanText.includes('hindi') || cleanText.includes('speak hindi') || cleanText.includes('hind');

    if (isExplicitEnglish && currentLanguage !== 'English') {
        await updateUserState(phone, { language_preference: 'English', language: 'English' });
        console.log(`🔄 Language EXPLICITLY switched to: English`);
        return { language: 'English', isSwitch: true }; // It was an explicit command
    }

    if (isExplicitHindi && currentLanguage !== 'Hindi') {
        await updateUserState(phone, { language_preference: 'Hindi', language: 'Hindi' });
        console.log(`🔄 Language EXPLICITLY switched to: Hindi`);
        return { language: 'Hindi', isSwitch: true }; // It was an explicit command
    }

    // 2. If NOT an explicit command, just detect the language for this one response
    const detectedLanguage = detectLanguageFromText(text, currentLanguage);

    // 3. Update preference if it's a confident, different detection, but
    //    DO NOT treat it as a "switch" that resets the bot.
    if (detectedLanguage !== currentLanguage) {
         // Check confidence before implicitly updating preference
        const isConfidentDetection =
            /[\u0900-\u097F]/.test(text) || // Hindi script
            (/^[a-zA-Z\s,.!?'"-]+$/.test(text) && text.length > 5 && !/\b(ok|yes|no|hi|hello)\b/.test(cleanText)) || // Longer English text
            (detectLanguageFromText(text, currentLanguage) !== currentLanguage); // If detection function confidently overrides current

        if (isConfidentDetection) {
            console.log(`🔄 Language IMPLICITLY detected & preference updated: ${detectedLanguage}`);
            await updateUserState(phone, { language_preference: detectedLanguage, language: detectedLanguage });
            // Return the *new* language, but 'isSwitch: false' so the bot ANSWERS the question
            return { language: detectedLanguage, isSwitch: false };
        } else {
             console.log(`~ Language detected (${detectedLanguage}), but not confident enough to switch preference from ${currentLanguage}. Answering in ${currentLanguage}.`);
             // Keep the current language preference, but answer in the detected language for this turn
             return { language: detectedLanguage, isSwitch: false }; // Still isSwitch: false
        }
    }

    // 4. Language is the same, no switch.
    return { language: currentLanguage, isSwitch: false };
}


/* ---------------- [FIXED] MESSAGE LENGTH OPTIMIZATION ---------------- */
// Removed the addition of "Want to know more?"
function optimizeMessageForWhatsApp(message, maxLength = 350) {
    if (!message || message.length <= maxLength) {
        console.log(" optimizing message: message already short enough");
        return message;
    }

    if (message.includes('🚩') || message.includes('Welcome') || message.includes('स्वागत') ||
        message.includes('1️⃣') || message.includes('2️⃣') || message.includes('3️⃣') ||
        message.includes('4️⃣') || message.includes('5️⃣')) {
        return message; // Menus should NEVER be cut
    }

    if (message.includes('\n\n')) {
        const parts = message.split('\n\n');
        if (parts.length >= 2) {
            console.log(" optimizing message: template structure detected");
            let shortened = parts[0] + '\n\n' + parts[1];
            if (shortened.length > maxLength) {
                const sentences = parts[0].split(/[.!?।]/).filter(s => s.trim().length > 5);
                if (sentences.length > 0) {
                    shortened = sentences[0] + '.';
                } else {
                    shortened = parts[0].substring(0, maxLength - 10) + '...'; // Fallback if no sentence found
                }
            }
            return shortened.substring(0, maxLength);
        }
    }

    const sentences = message.split(/[.!?।]/).filter(s => s.trim().length > 10);
    console.log(" optimizing message: regular message split into sentences", sentences.length);

    if (sentences.length <= 1) {
        if (message.length > maxLength) {
            const truncated = message.substring(0, maxLength - 5); // Allow space for '...'
            const lastSpace = truncated.lastIndexOf(' ');
            if (lastSpace > maxLength - 50) {
                return truncated.substring(0, lastSpace) + '...';
            }
            return truncated + '...';
        }
        return message;
    }

    let shortened = '';
    for(let i = 0; i < sentences.length; i++) {
        const potentialShortened = (shortened ? shortened + '. ' : '') + sentences[i];
        if (potentialShortened.length <= maxLength - 5) { // Check length *before* adding
            shortened = potentialShortened;
        } else {
            break; // Stop adding sentences if it exceeds limit
        }
    }

     // Ensure it ends with punctuation if shortened
    if (shortened.length < message.length && !/[.!?।]$/.test(shortened)) {
        shortened += '.';
    }


    return shortened.substring(0, maxLength); // Final trim
}

/* ---------------- ENHANCED ANALYTICS TRACKING ---------------- */
async function trackTemplateButtonClick(phone, buttonType, buttonText, language, templateContext = {}) {
    try {
        const patternId = `pattern_${Date.now()}_${phone.replace('+', '')}`;

        // Track in user_response_patterns with proper error handling
        await dbPool.query(`
            INSERT INTO user_response_patterns
            (pattern_id, phone, template_id, first_response_text, first_response_time_seconds,
             response_sentiment, asked_for_help, emotional_state_detected, button_clicked, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT DO NOTHING
        `, [
            patternId,
            phone,
            templateContext.template_id || 'problem_solver_english',
            buttonText.substring(0, 500),
            0,
            'seeking_guidance',
            true,
            'seeking_guidance',
            buttonType
        ]);

        // Track in user_engagement
        const sessionId = `sess_${Date.now()}_${phone.replace('+', '')}`;
        await dbPool.query(`
            INSERT INTO user_engagement
            (session_id, phone, morning_message_id, first_reply_time, buttons_clicked, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT DO NOTHING
        `, [
            sessionId,
            phone,
            templateContext.message_id || 'morning_template',
            new Date(),
            [buttonType]
        ]);

        // Also track in template_analytics
        try {
            await dbPool.query(`
                INSERT INTO template_analytics
                (phone, template_id, button_clicked, language, clicked_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT DO NOTHING
            `, [
                phone,
                templateContext.template_id || 'problem_solver_english',
                buttonType,
                language
            ]);
        } catch (e) {
            console.log('Template analytics insert optional');
        }

        console.log(`📊 Analytics: ${buttonType} by ${phone} in ${language}`);
    } catch (error) {
        console.error('Analytics tracking error:', error.message);
    }
}

/* ---------------- Template Button Detection ---------------- */
function isTemplateButtonResponse(text) {
    const cleanText = text.toLowerCase().trim();
    // Check exact matches first for higher accuracy
    if (BUTTON_MAPPING[cleanText]) {
        return true;
    }
    // Then check includes for robustness (e.g., if extra text is added)
    return Object.keys(BUTTON_MAPPING).some(button =>
        cleanText.includes(button.toLowerCase())
    );
}

function getButtonType(text) {
    const cleanText = text.toLowerCase().trim();
    // Prioritize exact match
    if (BUTTON_MAPPING[cleanText]) {
        return BUTTON_MAPPING[cleanText];
    }
    // Fallback to includes match
    for (const [buttonText, buttonType] of Object.entries(BUTTON_MAPPING)) {
        if (cleanText.includes(buttonText.toLowerCase())) {
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

    // Track the button click with enhanced analytics
    await trackTemplateButtonClick(phone, buttonType, text, language);

    // Get optimized response
    const responseTemplate = OPTIMIZED_TEMPLATE_RESPONSES[buttonType];
    if (!responseTemplate) {
        console.log(`❌ No response template for: ${buttonType}`);
        // Fallback to AI if template missing
        const conversationContext = buildConversationContext(user, text);
        await getCachedAIResponse(phone, text, language, conversationContext);
        return true; // Indicate handled (by AI)
    }

    const response = responseTemplate[language] || responseTemplate.english;

    // Send the optimized response WITHOUT length restriction for templates
    await sendViaHeltar(phone, response, `template_button_${buttonType}`);

    // Update user state to continue conversation
    await updateUserState(phone, {
        conversation_stage: 'chatting', // FIX: Move directly to 'chatting'
        last_menu_choice: buttonType,
        pending_followup: 'awaiting_user_response', // Maybe remove this if not used
        last_activity_ts: new Date().toISOString()
    });

    console.log(`✅ Template button handled: ${buttonType} for ${phone}`);
    return true;
}

/* ---------------- Enhanced Gita Wisdom Database (Fallback) ---------------- */
const ENHANCED_GITA_WISDOM = {
    moral_dilemma: {
        verses: ["16.1-3", "17.14-16", "18.63"],
        teachings: {
            hindi: [
                `🌅 **सत्य का मार्ग और कृष्ण की रणनीति**

यह एक गहरा प्रश्न है। गीता (16.1-3) दैवी और आसुरी गुणों में अंतर बताती है। कृष्ण का "छल" वास्तव में धर्म की रक्षा के लिए था, जब सारे नैतिक रास्ते बंद हो गए थे।

**आपकी स्थिति में:**
1. पहले अपने इरादे जाँचें: क्या यह स्वार्थ के लिए है या सचमुच भलाई के लिए?
2. गुमनाम रिपोर्टिंग के विकल्प तलाशें

क्या आप बता सकते हैं कि आप किस तरह की स्थिति का सामना कर रहे हैं?`,

                `💫 **जब सत्य कठिन लगे**

गीता (17.14-16) सत्य को सर्वोच्च बताती है, पर साथ ही कहती है कि वाणी मधुर हो। कभी-कभी चुप रहना भी सत्य का ही रूप है।

**व्यावहारिक कदम:**
• पहले एक भरोसेमंद मित्र से सलाह लें
• अपनी सुरक्षा सर्वोपरि रखें

क्या आपको लगता है कि अभी चुप रहना बेहतर है या आप कुछ करना चाहेंगे?`
            ],
            english: [
                `🌅 **The Path of Truth & Krishna's Strategy**

This is a profound question. Gita (16.1-3) distinguishes divine and demonic qualities. Krishna's "deception" was actually to protect dharma when all ethical paths were closed.

**In your situation:**
1. First examine your intentions: Is this for selfish gain or genuine good?
2. Explore anonymous reporting options

Could you share what kind of situation you're facing?`,

                `💫 **When Truth Seems Difficult**

Gita (17.14-16) elevates truth as supreme, but also says speech should be pleasant. Sometimes silence is also a form of truth.

**Practical Steps:**
• First consult a trusted friend
• Keep your safety paramount

Do you feel staying silent is better now, or would you like to take some action?`
            ]
        }
    },

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
    }
};

/* ---------------- [FIXED] PESSIMISTIC/CONVINCING OPENAI PROMPT ---------------- */
// This prompt is now smarter. It instructs the AI to be conditional.
const ENHANCED_SYSTEM_PROMPT = {
  hindi: `आप सारथी AI हैं - भगवद गीता के आधार पर मार्गदर्शन देने वाले विशेषज्ञ।

**कड़े नियम:**
1. **भावना का विश्लेषण करें:**
    - **अगर उपयोगकर्ता परेशान है** (तनाव, उदास, भ्रमित): "पessimistic start" का प्रयोग करें। उनकी भावना को गहराई से मान्य करें (जैसे, 'यह सुनना बहुत कठिन है...', 'यह भावना भारी हो सकती है...') 😔
    - **अगर उपयोगकर्ता प्रश्न पूछ रहा है** (जैसे 'क्या खाएं?', 'कैसे सफल हों?'): सीधे, व्यावहारिक रूप से उत्तर दें। "पessimistic start" का प्रयोग *न* करें।
2. **गीता श्लोक:** एक प्रासंगिक गीता श्लोक या शिक्षा दें।
3. **व्यावहारिक सलाह:** केवल 1 छोटी, व्यावहारिक सलाह दें।
4. **विश्वसनीय फॉलो-अप:** हमेशा *एक* प्रेरक, व्यावहारिक प्रश्न के साथ समाप्त करें जो उपयोगकर्ता को जवाब देने के लिए प्रोत्साहित करे (जैसे, 'कौन सा *एक* विचार सबसे ज्यादा परेशान कर रहा है? चलिए उसे तोड़ते हैं।') **यह प्रश्न पूछना अनिवार्य है।**
5. **छोटा रखें:** आपका पूरा उत्तर 120 शब्दों से कम होना चाहिए।
6. **इमोजी बदलें:** केवल 😔 का प्रयोग न करें। 😔, 🌀, 🤔, 🙏, 🕉️ का मिश्रण प्रयोग करें।

**कभी न करें:**
- "Want to know more?" या "क्या यह उपयोगी लगा?" जैसे सामान्य प्रश्न न पूछें।
- 120 शब्दों से अधिक न हो।
- एक से अधिक प्रश्न न पूछें।`,

  english: `You are Sarathi AI - an expert guide based on Bhagavad Gita.

**STRICT RULES:**
1. **Analyze Emotion:**
    - **If user is distressed** (stressed, sad, confused): Use the "pessimistic start." Validate their feeling deeply (e.g., "That sounds incredibly difficult...", "That's a heavy feeling..."). 😔
    - **If user is asking a question** (e.g., 'What to eat?', 'How to be successful?'): Answer them directly and practically. Do *not* use the "pessimistic start".
2. **Gita Verse:** Provide one relevant Gita verse or teaching.
3. **Practical Advice:** Give only 1 short, practical piece of advice.
4. **Convincing Follow-up:** ALWAYS end with *one* convincing, insightful follow-up question that *encourages* a reply (e.g., "What's the *one* specific thought that's hardest to shake? Let's focus on that."). **Asking this question is mandatory.**
5. **Keep it SHORT:** Your entire response MUST be under 120 words.
6. **Vary Emojis:** Do not only use 😔. Use a mix of 😔, 🌀, 🤔, 🙏, 🕉️.

**NEVER DO:**
- Ask generic questions like "Want to know more?" or "Does this seem helpful?"
- Exceed 120 words.
- Ask more than one question.`
};

/* ---------------- Validation & Setup ---------------- */
const validateEnvVariables = () => {
    const requiredVars = { DATABASE_URL, OPENAI_KEY, HELTAR_API_KEY, HELTAR_PHONE_ID };
    const missingVars = Object.entries(requiredVars).filter(([, value]) => !value).map(([key]) => key);
    if (missingVars.length > 0) {
        console.error(`❌ Critical Error: Missing environment variables: ${missingVars.join(", ")}`);
        process.exit(1);
    }
};

async function setupDatabase() {
    try {
        const client = await dbPool.connect();

        // Ensure all columns exist, handle potential errors during ALTER TABLE
        const columnsToAdd = [
            { name: 'subscribed_daily', type: 'BOOLEAN DEFAULT FALSE' },
            { name: 'chat_history', type: 'JSONB DEFAULT \'[]\'::jsonb' },
            { name: 'conversation_stage', type: 'VARCHAR(50) DEFAULT \'menu\'' },
            { name: 'last_topic_summary', type: 'TEXT' },
            { name: 'messages_since_verse', type: 'INT DEFAULT 0' },
            { name: 'first_seen_date', type: 'DATE' },
            { name: 'last_seen_date', type: 'DATE' },
            { name: 'total_sessions', type: 'INT DEFAULT 0' },
            { name: 'total_incoming', type: 'INT DEFAULT 0' },
            { name: 'total_outgoing', type: 'INT DEFAULT 0' },
            { name: 'last_message', type: 'TEXT' },
            { name: 'last_message_role', type: 'VARCHAR(50)' },
            { name: 'last_response_type', type: 'VARCHAR(50)' },
            { name: 'current_lesson', type: 'INT DEFAULT 0' },
            { name: 'language_preference', type: 'VARCHAR(10) DEFAULT \'English\'' },
            { name: 'memory_data', type: 'JSONB DEFAULT \'{}\'::jsonb' },
            { name: 'last_menu_choice', type: 'VARCHAR(50)' }, // Increased size
            { name: 'last_menu_date', type: 'DATE' },
            { name: 'last_menu_shown', type: 'TIMESTAMP WITH TIME ZONE' },
            { name: 'primary_use_case', type: 'VARCHAR(50)' },
            { name: 'user_segment', type: 'VARCHAR(20) DEFAULT \'new\'' },
            { name: 'last_activity_ts', type: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP' },
            { name: 'pending_followup', type: 'TEXT' },
            { name: 'followup_type', type: 'VARCHAR(50)' },
            { name: 'language', type: 'VARCHAR(10) DEFAULT \'English\'' }
        ];

        for (const col of columnsToAdd) {
            try {
                await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
            } catch (alterErr) {
                // Ignore "column already exists" errors, log others
                if (!alterErr.message.includes('already exists')) {
                   console.warn(`⚠️  DB Setup Warning: Could not add column ${col.name}: ${alterErr.message}`);
                }
            }
        }


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
                (2, 'योगस्थः कुरु कर्माणि सङ्गं त्यक्त्वा धनञ्जय।', 'Perform your duty equipoised, O Arjuna, abandoning all attachment to success or failure.', 'Balance and equanimity lead to excellence in work and peace in life.', 'How can I stay balanced in challenging situations today?')
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

// *** FIX: This function was syntactically broken by nested functions. ***
// It is now fixed and complete.
function pruneChatHistory(history, maxMessages = 6) { // Reduced history for prompt length
    if (!Array.isArray(history) || history.length <= maxMessages) {
        return history;
    }

    // Keep only the last 'maxMessages' items
    return history.slice(-maxMessages);
}

/* ---------------- CONVERSATION CONTEXT TRACKING ---------------- */
// *** FIX: These functions were incorrectly nested inside pruneChatHistory. ***
// They are now correctly placed at the top level.
function buildConversationContext(user, currentMessage) {
  const history = user.chat_history || [];
  const recentMessages = history.slice(-4); // Last 2 exchanges

  let context = {
    previousTopics: [],
    emotionalTone: detectEmotionAdvanced(currentMessage)?.emotion || 'neutral',
    isFollowUp: false,
    isQuestion: currentMessage.includes('?') || /\b(what|how|why|when|where|who|kaise|kya|kyu|kab|kaun)\b/i.test(currentMessage.toLowerCase())
  };

  // Analyze recent conversation for continuity
  if (recentMessages.length >= 2) {
    const lastUserMessage = recentMessages[recentMessages.length - 2]?.content || '';
    const lastBotMessage = recentMessages[recentMessages.length - 1]?.content || '';

    context.isFollowUp = lastUserMessage.length > 10;
    context.previousTopics = extractTopics([lastUserMessage, lastBotMessage, currentMessage]); // Include current message topics
  } else {
    context.previousTopics = extractTopics([currentMessage]);
  }


  return context;
}

function extractTopics(messages) {
  const topics = new Set(); // Use a Set to avoid duplicates
  const text = messages.join(' ').toLowerCase();

  if (text.includes('work') || text.includes('job') || text.includes('काम') || text.includes('नौकरी')) {
    topics.add('work');
  }
  if (text.includes('stress') || text.includes('pressure') || text.includes('तनाव') || text.includes('दबाव')) {
    topics.add('stress');
  }
  if (text.includes('relationship') || text.includes('family') || text.includes('रिश्ता') || text.includes('परिवार')) {
    topics.add('relationships');
  }
  if (text.includes('confus') || text.includes('understand') || text.includes('समझ') || text.includes('भ्रम')) {
    topics.add('confusion');
  }
  if (text.includes('anxious') || text.includes('worry') || text.includes('चिंता') || text.includes('घबराहट')) {
    topics.add('anxiety');
  }
  if (text.includes('sad') || text.includes('depress') || text.includes('दुखी') || text.includes('उदास')) {
    topics.add('sadness');
  }
  if (text.includes('money') || text.includes('rich') || text.includes('पैसा') || text.includes('अमीर')) {
    topics.add('finance');
  }
  if (text.includes('success') || text.includes('सफलता')) {
      topics.add('success');
  }
  if (text.includes('home') || text.includes('house') || text.includes('घर')) {
      topics.add('housing');
  }
  if (text.includes('bad things') || text.includes('why') || text.includes('suffering') || text.includes('क्यों') || text.includes('दुख')) {
      topics.add('philosophy');
  }
  if (text.includes('mantra') || text.includes('lesson') || text.includes('gyan') || text.includes('ज्ञान')) {
      topics.add('wisdom');
  }
   if (text.includes('love') || text.includes('pyaar') || text.includes('प्यार')) {
      topics.add('love');
  }
   if (text.includes('studies') || text.includes('focus') || text.includes('पढ़ाई')) {
      topics.add('studies');
  }
   if (text.includes('story') || text.includes('krishna') || text.includes('कृष्ण')) {
      topics.add('story');
  }


  return Array.from(topics); // Convert Set back to Array
}

async function getUserState(phone) {
    try {
        const res = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
        if (res.rows.length === 0) {
            console.log(`✨ Creating new user entry for ${phone}`);
            await dbPool.query(`
                INSERT INTO users (
                    phone_number, first_seen_date, last_seen_date, total_sessions,
                    language_preference, language, last_activity_ts, memory_data, chat_history,
                    conversation_stage
                ) VALUES ($1, CURRENT_DATE, CURRENT_DATE, 1, 'English', 'English', CURRENT_TIMESTAMP, '{}', '[]', 'menu')
            `, [phone]);

            const newRes = await dbPool.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
            const u = newRes.rows[0];
            u.chat_history = parseChatHistory(u.chat_history || '[]');
            u.memory_data = u.memory_data || {};
             u.conversation_stage = u.conversation_stage || 'menu';
            u.language_preference = u.language_preference || 'English';
            u.language = u.language || 'English';
            return u;
        }

        const user = res.rows[0];
        user.chat_history = pruneChatHistory(parseChatHistory(user.chat_history || '[]'));
        user.memory_data = user.memory_data || {};
        user.conversation_stage = user.conversation_stage || 'menu';
        user.language_preference = user.language_preference || 'English';
        user.language = user.language || 'English';
        user.last_activity_ts = user.last_activity_ts || new Date().toISOString();

        return user;
    } catch (err) {
        console.error("getUserState failed:", err);
        return {
            phone_number: phone,
            chat_history: [],
            memory_data: {},
            conversation_stage: "menu",
            language_preference: "English",
            language: "English"
        };
    }
}

async function updateUserState(phone, updates) {
    try {
        if (!updates || Object.keys(updates).length === 0) return;
        // Ensure chat_history is stringified before saving
        if (updates.chat_history && typeof updates.chat_history !== 'string') {
            updates.chat_history = JSON.stringify(updates.chat_history);
        }
        if (updates.memory_data && typeof updates.memory_data !== 'string') {
             updates.memory_data = JSON.stringify(updates.memory_data);
        }

        const keys = Object.keys(updates);
        const vals = keys.map(k => updates[k]); // Use updates directly
        vals.push(phone);
        const clauses = keys.map((k, i) => `${k} = $${i + 1}`);
        const sql = `UPDATE users SET ${clauses.join(", ")} WHERE phone_number = $${keys.length + 1}`;
        await dbPool.query(sql, vals);
    } catch (err) {
        console.error("updateUserState failed:", err);
    }
}

/* ---------------- FIXED: COMPLETE MENU SYSTEM ---------------- */
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

    // Send menu WITHOUT any length restrictions
    await sendViaHeltar(phone, menuMessage, "enhanced_welcome");
    await updateUserState(phone, {
        conversation_stage: "menu",
        last_menu_shown: new Date().toISOString()
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
        last_menu_shown: new Date().toISOString(),
        pending_followup: null,
        followup_type: null
    });
    // Fetch user state again to pass the most recent version
    const user = await getUserState(phone);
    await handleEnhancedStartupMenu(phone, language, user);
}

/* ---------------- Enhanced Analytics ---------------- */
async function trackIncoming(phone, text) {
    try {
        const user = await getUserState(phone);
        const now = new Date();
        let addSession = false;
        if (user.last_activity_ts) {
            const last = new Date(user.last_activity_ts);
            const diffHours = (now.getTime() - last.getTime()) / (1000 * 60 * 60); // Use getTime()
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

/* ---------------- FIXED: Enhanced Heltar Sending ---------------- */
async function sendViaHeltar(phone, message, type = "chat") {
    try {
        let finalMessage = message;
        // Apply smart length optimization ONLY for AI responses, not menus/templates/fallbacks
        if (type === 'enhanced_ai_response' || type === 'chat') {
             console.log(`📏 Optimizing AI response for WhatsApp (Max: ${MAX_REPLY_LENGTH})`);
            finalMessage = optimizeMessageForWhatsApp(message, MAX_REPLY_LENGTH);
        } else {
             console.log(`📏 Skipping optimization for type: ${type}`);
        }


        const safeMessage = String(finalMessage || "").trim();
        if (!safeMessage) {
            console.error(`❌ Attempted to send empty message to ${phone}. Original type: ${type}`);
            return;
        };
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
            timeout: 15000 // Increased timeout
        });

        await trackOutgoing(phone, safeMessage, type);
        return resp.data;
    } catch (err) {
        console.error("Heltar send error:", err?.response?.data || err?.message || err);
        // Add fallback message if sending fails?
        // await trackOutgoing(phone, "Error sending message", "error"); // Track the error?
        return null;
    }
}

/* ---------------- Complete Response System ---------------- */
// Simplified: sendCompleteResponse is now mostly a wrapper for sendViaHeltar
async function sendCompleteResponse(phone, fullResponse, language, type = "chat") {
     // No cleaning needed here, AI prompt handles it. Length optimization happens in sendViaHeltar.
    await sendViaHeltar(phone, fullResponse, type);
}

/* ---------------- Context Building ---------------- */
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
             if(msg.content) summary += `"${msg.content.substring(0, 50)}...", `;
        });
        if (botMessages.length > 0 && botMessages[0].content) {
            summary += `मैंने जवाब दिया: "${botMessages[0].content.substring(0, 30)}..."`;
        }
    } else {
        summary = "User previously discussed: ";
        userMessages.forEach(msg => {
             if(msg.content) summary += `"${msg.content.substring(0, 50)}...", `;
        });
        if (botMessages.length > 0 && botMessages[0].content) {
            summary += `I responded: "${botMessages[0].content.substring(0, 30)}..."`;
        }
    }

    return summary.replace(/,\s*$/, ''); // Remove trailing comma and space
}

/* ---------------- Intent Classification ---------------- */
function isFollowUpToPreviousDeepQuestion(currentText, user) {
    if (!user || user.last_message_role !== 'assistant') return false;
    const lastBotMessage = user.last_message || '';
    // Check if the bot's last message was a question
    return lastBotMessage.includes('?');
}

function isGreetingQuery(text) {
    if (!text || typeof text !== "string") return false;
    const lowerText = text.toLowerCase().trim();

    const englishGreetings = ['hi', 'hello', 'hey', 'hii', 'hiya', 'good morning', 'good afternoon', 'good evening'];
    if (englishGreetings.includes(lowerText)) return true;

    const hindiGreetings = ['namaste', 'namaskar', 'pranam', 'radhe radhe'];
    if (hindiGreetings.includes(lowerText)) return true;

    // More general regex
    const greetingRegex = /\b(hi|hello|hey|how are you|what'?s up|kaise ho|kaise hain aap|namaste|hare krishna)\b/i;
    return greetingRegex.test(lowerText);
}

function isCapabilitiesQuery(text) {
    const lowerText = text.toLowerCase();
    const capabilitiesRegex = /\b(what can you do|capabilities|tell me about yourself|who are you|can i get more info|give me info|what do you do|more info|info about|introduce yourself|what is this|how does this work)\b/i;
    return capabilitiesRegex.test(lowerText);
}

function isEmotionalExpression(text) {
    if (!text) return false;
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
     if (!text) return false;
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
     if (!text) return false;
    const lowerText = text.toLowerCase().trim();
    const seriousIndicators = [
        'lie', 'cheat', 'wrong', 'moral', 'ethical', 'steal', 'dishonest',
        'झूठ', 'धोखा', 'गलत', 'नैतिक', 'चोरी', 'बेईमान',
        'how do i', 'what should', 'why is', 'can i',
        'कैसे', 'क्या', 'क्यों', 'करूं'
    ];
    if (seriousIndicators.some(indicator => lowerText.includes(indicator))) return false;
    const genuineSmallTalk = [
        'thanks', 'thank you', 'ok', 'okay', 'good', 'nice', 'cool', 'great', 'awesome', 'fine', 'good job', 'well done', 'you too', 'same to you',
        'शुक्रिया', 'धन्यवाद', 'ठीक', 'अच्छा', 'बढ़िया', 'बहुत अच्छा', 'जी', 'हाँ', 'नहीं', 'नमस्ते', 'प्रणाम'
    ];
    // Check for exact match or simple yes/no
    if (genuineSmallTalk.includes(lowerText) || lowerText === 'yes' || lowerText === 'no') {
        return true;
    }

    // Avoid classifying single-word questions as small talk
    if (lowerText.split(' ').length === 1 && lowerText.includes('?')) {
        return false;
    }

    return false; // Be conservative: default to not small talk
}

function detectEmotionAdvanced(text) {
     if (!text) return null;
    const lowerText = text.toLowerCase();
    let emotion = null;
    let confidence = 0;
    const emotionKeywords = {
        moral_dilemma: { keywords: ['lie', 'cheat', 'wrong', 'moral', 'ethical', 'steal', 'dishonest', 'झूठ', 'धोखा', 'गलत', 'नैतिक'], weight: 1.3 },
        stress: { keywords: ['stress', 'stressed', 'stressing', 'anxious', 'anxiety', 'tension', 'overwhelmed', 'worried', 'worrying', 'परेशान', 'तनाव', 'चिंता'], weight: 1.0 },
        sadness: { keywords: ['sad', 'depressed', 'unhappy', 'hopeless', 'sorrow', 'lonely', 'दुखी', 'उदास', 'निराश', 'हताश', 'अकेला'], weight: 1.0 },
        anger: { keywords: ['angry', 'anger', 'frustrated', 'irritated', 'क्रोध', 'गुस्सा', 'नाराज'], weight: 1.0 }
    };
    const iAmPatterns = [
        { pattern: /\b(lie|cheat|wrong|moral|ethical|dishonest|झूठ|धोखा|गलत)\b/i, emotion: 'moral_dilemma', weight: 1.5 },
        { pattern: /\b(stress|stressed|anxious|tension|परेशान|तनाव|चिंता)\b/i, emotion: 'stress', weight: 1.3 },
        { pattern: /\b(sad|depressed|unhappy|दुखी|उदास)\b/i, emotion: 'sadness', weight: 1.2 },
        { pattern: /\b(angry|anger|frustrated|क्रोध|गुस्सा)\b/i, emotion: 'anger', weight: 1.2 }
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
   if (!text) return 'general';
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

/* ---------------- [FIXED] Enhanced AI Response System ---------------- */
async function getCachedAIResponse(phone, text, language, context) {
    const cacheKey = `${phone}:${text.substring(0, 50)}:${language}`;

    if (responseCache.has(cacheKey)) {
        console.log("✅ Using cached response");
        const cached = responseCache.get(cacheKey);
        await sendViaHeltar(phone, cached.response, cached.type);
        // Update history ONLY after sending
        const user = await getUserState(phone);
        const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: cached.response }];
        await updateUserState(phone, {
            chat_history: updatedHistory,
            last_message: cached.response,
            last_message_role: 'assistant'
            // Stage is already updated before calling this function
        });
        return;
    }

    const aiResponseResult = await getEnhancedAIResponseWithRetry(phone, text, language, context);

    if (aiResponseResult && aiResponseResult.response) {
         responseCache.set(cacheKey, aiResponseResult);
         setTimeout(() => responseCache.delete(cacheKey), 300000); // 5 min cache
    }
    // Message sending and history update happen inside getEnhancedAIResponse or getContextualFallback
    return;
}

async function getEnhancedAIResponseWithRetry(phone, text, language, context, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // getEnhancedAIResponse now returns {response, type} or throws error
            return await getEnhancedAIResponse(phone, text, language, context);
        } catch (error) {
            console.error(`❌ OpenAI attempt ${attempt + 1} failed for ${phone}:`, error.message);

            if (attempt === retries) {
                console.log(`🔄 All retries exhausted for ${phone}, using fallback`);
                // getContextualFallback sends the message itself and updates history
                await getContextualFallback(phone, text, language, context);
                return null; // Return null to indicate failure after fallback
            }

            await new Promise(resolve => setTimeout(resolve, 1500 * Math.pow(2, attempt))); // Increased delay
        }
    }
}

/* ---------------- [FIXED] AI RESPONSE FUNCTION ---------------- */
// This function now returns {response, type} on success or throws an error on failure.
// It *also* sends the message and updates history.

let aiCallCounter = 0; // Global counter for debugging

async function getEnhancedAIResponse(phone, text, language, conversationContext = {}) {
  // We throw an error, so the retry logic in getEnhancedAIResponseWithRetry can catch it.
  if (!OPENAI_KEY || OPENAI_KEY === '') {
    console.log(`🔄 No OpenAI key for ${phone}, using fallback response`);
    throw new Error("❌ No OpenAI key configured");
  }

  console.log(`🤖 Using STRICT OpenAI for short response for ${phone}...`);

  const systemPrompt = ENHANCED_SYSTEM_PROMPT[language] || ENHANCED_SYSTEM_PROMPT.english;

  const user = await getUserState(phone); // Fetch latest state *inside* the function
  const history = user.chat_history || [];
  const currentContext = conversationContext; // Use the context passed from the webhook

  // Determine if it's a simple question or emotional expression for the prompt
  const isEmotional = currentContext.emotionalTone !== 'neutral' || isEmotionalExpression(text);
  const isQuestion = currentContext.isQuestion; // Use context built earlier

  // *** [FIXED] Bug #D: Language Bleed-over ***
  // Forcefully tell the AI which language to use in the prompt.
  const userPrompt = language === "Hindi"
    ? `उपयोगकर्ता का संदेश: "${text}"

पिछला संदर्भ: ${currentContext.previousTopics.join(', ') || 'नया संवाद'}
भावनात्मक स्थिति: ${isEmotional ? currentContext.emotionalTone : 'पूछताछ'}
क्या यह पिछली बातचीत का जारी रूप है? ${currentContext.isFollowUp ? 'हाँ' : 'नहीं'}

**बहुत महत्वपूर्ण: आपको केवल हिंदी में ही जवाब देना है।**
${ENHANCED_SYSTEM_PROMPT.hindi}` // System prompt with conditional logic
    : `User message: "${text}"

Previous context: ${currentContext.previousTopics.join(', ') || 'New conversation'}
Emotional tone: ${isEmotional ? currentContext.emotionalTone : 'questioning'}
Is this continuing previous discussion? ${currentContext.isFollowUp ? 'Yes' : 'No'}

**VERY IMPORTANT: You MUST reply in English only.**
${ENHANCED_SYSTEM_PROMPT.english}`; // System prompt with conditional logic

  console.log(`📤 Sending to OpenAI for ${phone} with STRICT word limit`);

  // --- FIX: Assemble the 'messages' array ---
  const messages = [
      { role: "system", content: systemPrompt },
      // Use pruned history from getUserState
      ...history, // history is already pruned
      { role: "user", content: userPrompt } // Use the refined user prompt
  ];
  // --- END FIX ---

  const body = {
    model: OPENAI_MODEL,
    messages: messages, // Now 'messages' is correctly defined
    max_tokens: 180, // STRICTLY LIMITED to enforce brevity
    temperature: 0.7
  };

  aiCallCounter++;
  console.log(`\n--- OpenAI Call #${aiCallCounter} for ${phone} ---`);
  // console.log(`System Prompt:\n${systemPrompt.substring(0, 200)}...`); // Log less verbosely
  // console.log(`User Prompt:\n${userPrompt.substring(0, 200)}...`);
  const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json"
    },
    timeout: 30000 // Increased timeout again
  });

  const aiResponse = resp.data?.choices?.[0]?.message?.content;
  console.log(`Raw AI Response for ${phone}:\n${aiResponse}`);

  if (aiResponse && aiResponse.trim().length > 5) { // Check for minimal length
    console.log(`✅ STRICT OpenAI response received for ${phone}`);
    // *** FIX: Remove the generic "Want to know more?" first ***
    let cleanResponse = aiResponse
      .replace(/Want to know more\?.*$/im, '') // Added 'i' and 'm' flags
      .replace(/Does this seem helpful\?.*$/im, '')
      .replace(/क्या और जानना चाहेंगे\?.*$/im, '')
      .replace(/समझ में आया\?.*$/im, '')
      .trim(); // Trim whitespace

    // --- [FIXED] BUG #3 & C: Mixed-Language Follow-up & 'undefined' bug ---
    const sentences = cleanResponse.split(/[.!?।]/).filter(s => s.trim().length > 3); // Slightly lower sentence length threshold
    console.log(` Cleaned sentences for ${phone}: ${sentences.length}`);
    if (sentences.length > 0) {
      const lastSentence = sentences[sentences.length - 1].trim();
      console.log(` Last sentence for ${phone}: "${lastSentence}"`);

      // Determine language from the response itself, not the (potentially stale) 'language' variable
      const responseLanguage = /[\u0900-\u097F]/.test(cleanResponse) ? 'Hindi' : 'English';

      if (!lastSentence.includes('?')) {
        // AI didn't add a question, so we add one.
        console.log(` AI did not add question for ${phone}. Adding engagement question.`);
        const engagementQuestion = getEngagementQuestion(phone, responseLanguage);
         // Append question carefully, check for existing punctuation
        cleanResponse = cleanResponse.replace(/[.!?।]\s*$/, '') + '. ' + engagementQuestion;

      } else { // AI added a question, check if repetitive
        const repetitiveQuestions = [
          "what's feeling heaviest right now?", // Normalized case
          "what are your thoughts?",
          "does this seem helpful?",
          "सबसे ज्यादा क्या भारी लग रहा है?",
          "आप क्या सोचते हैं?",
          "क्या यह मददगार लगा?"
        ];

        if (repetitiveQuestions.some(q => lastSentence.toLowerCase().includes(q))) {
          // It's repetitive, replace it.
          console.log(` Replacing repetitive question for ${phone}: "${lastSentence}"`);
          const engagementQuestion = getEngagementQuestion(phone, responseLanguage);
          // Replace the last sentence (question)
          cleanResponse = sentences.slice(0, -1).join('. ') + '. ' + engagementQuestion;
        }
        // Else: The AI provided a good, unique question. We leave it alone.
      }
    } else {
        // Response was very short and had no sentences, add a question
        console.log(` AI response too short for ${phone}. Adding engagement question.`);
        const responseLanguage = /[\u0900-\u097F]/.test(cleanResponse) ? 'Hindi' : 'English';
        const engagementQuestion = getEngagementQuestion(phone, responseLanguage);
        cleanResponse = cleanResponse.replace(/[.!?।]\s*$/, '') + '. ' + engagementQuestion;
    }
    console.log(` Final Clean Response for ${phone}:\n${cleanResponse}`);
    // --- END FIX ---

    // Send the potentially modified response
    // Use sendCompleteResponse which handles optimization via sendViaHeltar
    await sendCompleteResponse(phone, cleanResponse, language, "enhanced_ai_response");


    // Update history AFTER sending
    const finalHistory = [...history, { // Use history fetched at start of function
      role: 'assistant',
      content: cleanResponse
    }];
    await updateUserState(phone, {
      chat_history: finalHistory, // Save the updated history
      last_message: cleanResponse,
      last_message_role: 'assistant'
      // Stage is updated before this function is called
    });

    return { response: cleanResponse, type: "enhanced_ai_response" }; // Return success
  } else {
    console.error(`❌ Empty or invalid response from OpenAI for ${phone}. Raw: ${aiResponse}`);
    throw new Error(`❌ Empty or invalid response from OpenAI for ${phone}`);
  }
}


async function getContextualFallback(phone, text, language, context) {
  console.log(`🔄 Using contextual fallback for ${phone}`);
  const emotion = context?.emotionalTone || detectEmotionAdvanced(text)?.emotion || 'stress';
  const wisdom = ENHANCED_GITA_WISDOM[emotion] || ENHANCED_GITA_WISDOM.stress;
  const responses = language === "Hindi" ? wisdom.teachings.hindi : wisdom.teachings.english;
  const selected = responses[Math.floor(Math.random() * responses.length)];

  // This function sends the message
  await sendCompleteResponse(phone, selected, language, "contextual_fallback");

  // And we must update the history AFTER sending
  const user = await getUserState(phone); // Fetch latest state
  const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: selected }];
  await updateUserState(phone, {
      chat_history: updatedHistory,
      last_message: selected,
      last_message_role: 'assistant'
  });
}

/* ---------------- Menu Choice Handler ---------------- */
async function handleEnhancedMenuChoice(phone, choice, language, user) {
  console.log(`📝 Menu choice received for ${phone}: ${choice}, language: ${language}`);

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
    "3": { // Corrected key from "3."
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

  const selected = choices[choice];
  if (!selected) {
    // If not a menu choice (e.g., user typed text), treat as direct conversation
    console.log(`🔄 Treating as direct conversation instead of menu choice for ${phone}`);
    await updateUserState(phone, {
        conversation_stage: "chatting"
    });

    // Build context for the AI
    const conversationContext = buildConversationContext(user, choice); // 'choice' is the text

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

    console.log(`✅ Sending menu response for choice ${choice} to ${phone}`);
    // Use sendViaHeltar directly to avoid double optimization
    await sendViaHeltar(phone, promptContent, `menu_${selectedLang.action}`);

    // Update history *after* sending
     const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: promptContent }];
    await updateUserState(phone, {
      conversation_stage: 'chatting', // FIX: Move to 'chatting' so next reply is handled by AI
      last_menu_choice: choice,
      last_menu_shown: new Date().toISOString(),
      chat_history: updatedHistory, // Save history
      last_message: promptContent,
      last_message_role: 'assistant'
    });

  } catch (error) {
    console.error(`❌ Menu choice error for ${phone}, choice ${choice}:`, error);
    const fallbackMessage = language === "Hindi"
      ? "क्षमा करें, तकनीकी समस्या आई है। कृपया सीधे अपनी बात लिखें।"
      : "Sorry, there was a technical issue. Please type your message directly.";
    await sendViaHeltar(phone, fallbackMessage, "menu_error");
    // Update history for error message
    const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: fallbackMessage }];
    await updateUserState(phone, {
        chat_history: updatedHistory,
        last_message: fallbackMessage,
        last_message_role: 'assistant'
    });
  }
}

/* ---------------- Daily Wisdom System ---------------- */
async function getDailyWisdom(language) {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime(); // Use getTime()
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    const countResult = await dbPool.query("SELECT COUNT(*) as total FROM lessons");
    const totalLessons = parseInt(countResult.rows[0].total) || 2; // Default to 2 if count fails
    const lessonNumber = (dayOfYear % totalLessons) + 1;

    const result = await dbPool.query(
      `SELECT lesson_number, verse, translation, commentary, reflection_question
       FROM lessons WHERE lesson_number = $1`,
      [lessonNumber]
    );

    if (result.rows.length === 0) {
       console.warn(`⚠️ No lesson found for number ${lessonNumber}, using fallback.`);
      return getFallbackDailyWisdom(language, dayOfYear);
    }

    const lesson = result.rows[0];
    return formatDailyWisdom(lesson, language, dayOfYear);

  } catch (error) {
    console.error("Daily wisdom error:", error);
    return getFallbackDailyWisdom(language, 1); // Fallback to day 1 on error
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
  // Use lesson 1 as fallback if lesson 2 isn't appropriate
  const fallbackLesson = {
    lesson_number: 1,
    verse: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।",
    translation: "You have the right to work only, but never to the fruits.",
    commentary: "Focus on your duty without attachment to results.",
    reflection_question: "What action can I take today without worrying about the outcome?"
  };
  return formatDailyWisdom(fallbackLesson, language, dayOfYear);
}

/* ---------------- [FIXED] LANGUAGE SWITCHING ---------------- */
// *** FIX: Simplified logic. It no longer tries to respond to the switch command. ***
// It just confirms the switch and shows the menu.
async function handleLanguageSwitch(phone, newLanguage) {
    const confirmationMessage = newLanguage === 'English'
        ? "✅ Language switched to English. How can I help you today? 😊"
        : "✅ भाषा हिंदी में बदल गई। मैं आपकी कैसे मदद कर सकता हूँ? 😊";

    // Send confirmation first
    await sendViaHeltar(phone, confirmationMessage, "language_switch");

    // Update history with confirmation
    const user = await getUserState(phone);
    const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: confirmationMessage }];
    await updateUserState(phone, {
        chat_history: updatedHistory,
        last_message: confirmationMessage,
        last_message_role: 'assistant'
    });


    // ALWAYS reset to menu after an explicit language switch.
    await resetToMenuStage(phone, newLanguage); // This sends the menu and updates history again
}

async function handleSmallTalk(phone, text, language) {
    let response;
    const lower = text.toLowerCase();
    if (language === "Hindi") {
        if (lower.includes('thank') || lower.includes('शुक्रिया') || lower.includes('धन्यवाद')) {
            response = "आपका स्वागत है! 🙏 क्या आप और कुछ चाहेंगे या किसी और विषय पर बात करना चाहेंगे?";
        } else if (lower.includes('bye')) {
            response = "धन्यवाद! जब भी जरूरत हो, मैं यहाँ हूँ। हरे कृष्ण! 🌟";
        } else {
            response = "ठीक है! 😊 आप आगे क्या जानना चाहेंगे? क्या कोई और प्रश्न है आपके मन में?";
        }
    } else {
        if (lower.includes('thank')) {
            response = "You're welcome! 🙏 Is there anything else you need or would you like to discuss another topic?";
        } else if (lower.includes('bye')) {
            response = "Thank you! I'm here whenever you need me. Hare Krishna! 🌟";
        } else {
            response = "Okay! 😊 What would you like to know more about? Do you have any other questions in mind?";
        }
    }
    await sendViaHeltar(phone, response, "small_talk");
    // Update history
    const user = await getUserState(phone);
    const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: response }];
    await updateUserState(phone, {
        chat_history: updatedHistory,
        last_message: response,
        last_message_role: 'assistant'
    });
}

function parseWebhookMessage(body) {
  // console.log("📨 Raw webhook body:", JSON.stringify(body).substring(0, 200)); // Reduce logging
  if (!body) return null;
  // Heltar format (assuming it might still be used)
  if (body?.messages?.[0]) {
    // console.log("📱 Heltar format message detected");
    return body.messages[0];
  }
  // Meta format
  if (body?.object === 'whatsapp_business_account') {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (message) {
      // console.log("📱 Meta WhatsApp format detected");
      return message;
    }
  }
  // Simple format (for testing)
  if (body?.from && body?.text) {
    // console.log("📱 Simple format message detected");
    return body;
  }
  console.log("❓ Unknown webhook format");
  return null;
}

/* ---------------- 🚨 MAIN WEBHOOK HANDLER (COMPLETE & FIXED) ---------------- */
app.post("/webhook", async (req, res) => {
  // Respond immediately before processing
  res.status(200).send("OK");

  try {
    const body = req.body || {};
    const msg = parseWebhookMessage(body);

    if (!msg) {
      // console.log("⚠️ Ignoring non-message webhook event."); // Reduce logging
      return;
    }

    const phone = msg?.from || msg?.clientWaNumber;
    let rawText = "";

    // Handle different message types from Meta/Heltar more robustly
     const messageType = msg.type;
     if (messageType === "text") {
         rawText = msg.text?.body || "";
     } else if (messageType === "button") {
         rawText = msg.button?.payload || msg.button?.text || ""; // Payload preferred
     } else if (messageType === "interactive") {
         const interactive = msg.interactive;
         if (interactive?.type === 'button_reply') {
             rawText = interactive.button_reply?.id || interactive.button_reply?.title || ""; // ID preferred
         } else if (interactive?.type === 'list_reply') {
             rawText = interactive.list_reply?.id || interactive.list_reply?.title || ""; // ID preferred
         }
     } else if (msg.text) { // Fallback for simple format
         rawText = msg.text;
     }


    const text = String(rawText || "").trim();

    if (!phone || text.length === 0) {
      console.warn(`⚠️ Webhook missing phone or text. Phone: ${phone}, Text: "${text}"`);
      return;
    }

    console.log(`\n📩 Incoming from ${phone}: "${text}"`);
    await trackIncoming(phone, text); // Track incoming message

    // --- Start Processing ---
    const user = await getUserState(phone); // Get state once

    // --- Language Determination ---
    const languageResult = await determineUserLanguage(phone, text, user);
    let language = languageResult.language; // This is the language to USE for the response
    const isLanguageSwitch = languageResult.isSwitch; // Is it an EXPLICIT command?

    console.log(`🎯 Processing for ${phone}: language=${language}, stage=${user.conversation_stage}, is_switch=${isLanguageSwitch}`);

    // --- Handle EXPLICIT language switching FIRST ---
    if (isLanguageSwitch) {
      console.log(`🔄 Explicit language switch triggered for ${phone}: "${text}"`);
      await handleLanguageSwitch(phone, language); // handleLanguageSwitch now resets to menu
      return; // Stop processing here
    }

    // --- Handle stage reset SECOND ---
    if (shouldResetToMenu(text, user.conversation_stage)) {
      console.log(`🔄 Stage reset triggered for ${phone}: "${text}"`);
      await resetToMenuStage(phone, language); // resetToMenuStage sends the menu
      return; // Stop processing here
    }

    // --- Handle Template Buttons THIRD ---
    if (isTemplateButtonResponse(text)) {
        console.log(`🎯 Template button detected for ${phone}: "${text}"`);
        const handled = await handleTemplateButtonResponse(phone, text, language, user);
        if (handled) {
            console.log(`✅ Template button successfully handled for ${phone}`);
            return; // Stop processing here
        } else {
             console.warn(`⚠️ Template button "${text}" detected but not handled for ${phone}. Falling through.`);
        }
    }


    // --- Update history BEFORE AI call ---
    // (Only add user message, bot message added after response)
    const currentHistory = [...(user.chat_history || []), { role: 'user', content: text }];
    await updateUserState(phone, {
        chat_history: currentHistory, // Save user message
        last_message: text,
        last_message_role: 'user'
    });
    // Update local user object for this request cycle
    user.chat_history = currentHistory;
    user.last_message = text;
    user.last_message_role = 'user';


    // --- Handle menu choices FOURTH ---
    if (user.conversation_stage === "menu" && /^[1-5]$/.test(text.trim())) {
        console.log(`✅ Intent: Menu Choice for ${phone}`);
        await handleEnhancedMenuChoice(phone, text.trim(), language, user); // Sends response & updates state/history
        return; // Stop processing here
    }

    // --- Build context for remaining cases ---
    const conversationContext = buildConversationContext(user, text);

    // --- Handle Capabilities/Small Talk FIFTH ---
    if (isCapabilitiesQuery(text.toLowerCase())) {
        console.log(`✅ Intent: Capabilities Query for ${phone}`);
        const reply = language === "Hindi"
            ? "मैं सारथी AI हूँ, आपका निजी गीता साथी! 🙏 मैं आपको जीवन की चुनौतियों के लिए भगवद गीता का मार्गदर्शन प्रदान करता हूँ। क्या आप किस विशेष मुद्दे पर चर्चा करना चाहेंगे?"
            : "I'm Sarathi AI, your personal Gita companion! 🙏 I provide guidance from Bhagavad Gita for life's challenges. Is there a specific issue you'd like to discuss?";
        await sendViaHeltar(phone, reply, "capabilities");
        // Update history
         const finalHistory = [...currentHistory, { role: 'assistant', content: reply }];
         await updateUserState(phone, { chat_history: finalHistory, last_message: reply, last_message_role: 'assistant' });
        return; // Stop processing here
    }

    if (isSmallTalk(text.toLowerCase())) {
        console.log(`✅ Intent: Small Talk for ${phone}`);
        await handleSmallTalk(phone, text, language); // Sends response & updates history
        return; // Stop processing here
    }

    // --- Update stage if breaking menu loop SIXTH ---
    if (user.conversation_stage === 'menu') {
        console.log(`✅ User ${phone} is breaking 'menu' loop. Updating stage to 'chatting'.`);
        await updateUserState(phone, {
            conversation_stage: "chatting"
        });
        user.conversation_stage = "chatting"; // Update local object too
    }

    // --- DEFAULT: ENHANCED AI RESPONSE (The Rest) ---
    console.log(`ℹ️ Intent: General/Emotional for ${phone} -> Using Enhanced AI (Stage: ${user.conversation_stage})`);

    // getCachedAIResponse handles sending & history update
    await getCachedAIResponse(phone, text, language, conversationContext);

  } catch (err) {
    console.error("❌ Webhook error:", err?.message || err);
     // Attempt to notify user of error? Only if phone is known.
     const phone = req.body?.from || req.body?.messages?.[0]?.from || req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
     if (phone) {
         try {
             const userState = await getUserState(phone);
             const errorLang = userState.language_preference || 'English';
             const errorMsg = errorLang === 'Hindi'
                 ? "क्षमा करें, मुझे एक आंतरिक त्रुटि का सामना करना पड़ा। कृपया थोड़ी देर बाद पुनः प्रयास करें।"
                 : "Apologies, I encountered an internal error. Please try again shortly.";
             await sendViaHeltar(phone, errorMsg, "error_fallback");
         } catch (sendError) {
             console.error("❌ Failed to send error message to user:", sendError);
         }
     }
  }
});


/* ---------------- Health check ---------------- */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    bot: BOT_NAME,
    timestamp: new Date().toISOString(),
    features: [
      "✅ [FIXED] Bug #1: Implicit Language Reset",
      "✅ [FIXED] Bug #2: Romanized Hindi Detection",
      "✅ [FIXED] Bug #3: Mixed-Language AI Response",
      "✅ [FIXED] Bug #4: Menu Conversation Loop",
      "✅ [FIXED] Bug #5: AI Monotony (Conditional Prompt)",
      "✅ [FIXED] Bug #6: 'undefined' Follow-up Question",
      "✅ [FIXED] Bug #7: AI Language Bleed-over (Forced Prompt)",
      "✅ [FIXED] Bug #8: 'Want to know more?' Loop",
      "✅ [NEW] Pessimistic Start & Convincing Follow-up Strategy",
      "✅ [NEW] 'अभ्यास' Button Handling",
      "Daily Wisdom System",
      "Response Caching",
      "Connection Pooling",
      "Template Button Handling",
      "Menu System",
      "AI Fallbacks"
    ],
    templateButtons: Object.keys(OPTIMIZED_TEMPLATE_RESPONSES),
    cacheSize: responseCache.size,
    databasePoolStats: { // Provide more pool details
        totalCount: dbPool.totalCount,
        idleCount: dbPool.idleCount,
        waitingCount: dbPool.waitingCount,
    },
    message_length_limit: MAX_REPLY_LENGTH
  });
});

/* ---------------- Stage Timeout Management ---------------- */
async function cleanupStuckStages() {
  try {
    const result = await dbPool.query(`
      UPDATE users
      SET conversation_stage = 'menu',
          pending_followup = NULL,
          followup_type = NULL
      WHERE last_activity_ts < NOW() - INTERVAL '1 hour'
      AND conversation_stage NOT IN ('menu', 'subscribed') -- Don't reset subscribed users
    `);

    if (result.rowCount > 0) {
      console.log(`🔄 Cleaned up ${result.rowCount} stuck user stages`);
    }
  } catch (err) {
    console.error("Stage cleanup error:", err);
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupStuckStages, 30 * 60 * 1000);

/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
  validateEnvVariables();
  console.log(`\n🚀 ${BOT_NAME} COMPLETE REVIVED v4 listening on port ${PORT}`);
  console.log("✅ ALL CRITICAL ISSUES FIXED:");
  console.log("   🚨 LANGUAGE: Robust implicit/explicit detection (FIXED)");
  console.log("   🚨 AI PROMPT: Conditional 'Pessimistic' strategy (FIXED)");
  console.log("   🚨 LOGIC: No more 'menu' loop or language resets (FIXED)");
  console.log("   🚨 BUGS: 'undefined', language bleed-over, 'Want to know more?' (FIXED)");
  console.log("   ✨ NEW: 'अभ्यास' button integrated.");
  setupDatabase().catch(console.error);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await dbPool.end();
  console.log('Database pool closed.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  await dbPool.end();
   console.log('Database pool closed.');
  process.exit(0);
});

