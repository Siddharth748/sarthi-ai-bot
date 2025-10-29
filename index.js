// index.js — SarathiAI (COMPLETE REVIVED v5)
// This version fixes the critical menu loop state bug, integrates the new morning template,
// and refines the AI prompt for better engagement.
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
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim(); // Using a capable model

const HELTAR_API_KEY = (process.env.HELTAR_API_KEY || "").trim();
const HELTAR_PHONE_ID = (process.env.HELTAR_PHONE_ID || "").trim();

const MAX_REPLY_LENGTH = parseInt(process.env.MAX_REPLY_LENGTH || "350", 10) || 350; // Max length for WhatsApp optimization

/* ---------------- Enhanced Database Pool ---------------- */
const dbPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Common setting for cloud DBs like Heroku/Railway
    max: 20, // Max number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30s
    connectionTimeoutMillis: 5000, // Abort connection attempt after 5s
    // maxUses: 7500, // Removed, often causes issues with long-running apps
});

/* ---------------- Response Cache (Simple In-Memory) ---------------- */
const responseCache = new Map(); // Cache AI responses for short period

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

        hindi: `कर्म पर ध्यान केंद्रित करने का अभ्यास करने के लिए तैयार हैं, फल पर नहीं? 🙏

एक सरल शुरुआत: 3 गहरी साँसें लें। हर साँस छोड़ते हुए, मन ही मन दोहराएं, "मैं अपने प्रयास पर ध्यान केंद्रित करता हूँ।"

परिणामों को छोड़ते हुए लौटती हुई शांति को महसूस करें।

यह कैसा लगा? क्या इसने आपके ध्यान को थोड़ा भी बदलने में मदद की?`
    },

    // *** NEW: Morning Check-in specific response ***
    'morning_checkin': {
         english: `Hare Krishna! 🙏 Please reply with one word describing how you are feeling right now.`,
         hindi: `हरे कृष्ण! 🙏 कृपया एक शब्द में बताएं कि आप अभी कैसा महसूस कर रहे हैं।`
    }
};

// Button text mapping for detection (Case Insensitive)
const BUTTON_MAPPING = {
    // English buttons (lowercase for matching)
    'work stress': 'work stress',
    'relationship issues': 'relationship issues',
    'personal confusion': 'personal confusion',
    'anxiety': 'anxiety',
    'custom help': 'custom help',
    'practice': 'practice',
    'hare krishna!': 'morning_checkin', // *** ADDED: New button text -> intent ***

    // Hindi buttons (exact text for matching)
    'काम का तनाव': 'work stress',
    'रिश्ते की परेशानी': 'relationship issues',
    'व्यक्तिगत उलझन': 'personal confusion',
    'आपके अनुसार': 'custom help',
    'अभ्यास': 'practice',
    // We might need other Hindi button texts if they exist
};

/* ---------------- [REFINED] CONVINCING ENGAGEMENT QUESTIONS (Fallback) ---------------- */
const ENGAGEMENT_QUESTIONS = {
  english: [
    "What's the *one* thought looping in your mind? Let's explore it.",
    "If you could change just *one* small thing right now, what would it be?",
    "What specific feeling is strongest for you at this moment?",
    "What does the 'worst-case scenario' actually look like if you face it?",
    "Based on this, what do *you* feel is the next right step?",
    "What would bring even a small moment of peace right now?",
    "What part of this situation *is* within your control?",
    "How else could you describe this feeling?"
  ],
  hindi: [
    "कौन सा *एक* विचार बार-बार घूम रहा है? चलिए उसे समझते हैं।",
    "अगर आप अभी *एक* छोटी सी चीज़ बदल पाते, तो वो क्या होती?",
    "इस समय कौन सी *एक* भावना सबसे तीव्र है?",
    "अगर आप 'सबसे बुरे' का सामना करें, तो वह वास्तव में कैसा दिखेगा?",
    "इसके आधार पर, आपको क्या लगता है कि अगला सही कदम क्या है?",
    "अभी शांति का एक छोटा सा पल भी कैसे मिल सकता है?",
    "इस स्थिति का कौन सा हिस्सा आपके नियंत्रण में है?",
    "आप इस भावना को और किस तरह बयां कर सकते हैं?"
  ]
};

const userQuestionHistory = new Map(); // Stores { phone: [used_indices] }

/* ---------------- [FIXED] `undefined` BUG in getEngagementQuestion ---------------- */
function getEngagementQuestion(phone, language) {
  const questions = ENGAGEMENT_QUESTIONS[language] || ENGAGEMENT_QUESTIONS.english;
  if (!questions || questions.length === 0) return ""; // Safety net

  if (!userQuestionHistory.has(phone)) {
    userQuestionHistory.set(phone, []);
  }
  let usedIndices = userQuestionHistory.get(phone);

  if (usedIndices.length >= questions.length) {
    console.log(`♻️ Resetting engagement questions for ${phone}`);
    usedIndices = [];
    userQuestionHistory.set(phone, usedIndices);
  }

  const availableIndices = questions
      .map((_, index) => index)
      .filter(index => !usedIndices.includes(index));

  if (availableIndices.length === 0) {
      // Should not happen with reset logic, but safety net
      userQuestionHistory.set(phone, []); // Reset anyway
      console.warn(`🎯 EngagementQuestion fallback: No available questions left for ${phone}, returning first.`);
      return questions[0];
  }

  const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
  const selectedQuestion = questions[randomIndex];

  if (!selectedQuestion) {
      console.error(`🎯 EngagementQuestion error: selectedQuestion undefined for index ${randomIndex}, phone ${phone}.`);
      // Fallback if question is somehow undefined (e.g., array issue)
      userQuestionHistory.set(phone, []);
      return questions[0];
  }

  usedIndices.push(randomIndex);
  userQuestionHistory.set(phone, usedIndices);

  console.log(`🎯 Selected engagement FALLBACK question for ${phone}: "${selectedQuestion}"`);
  return selectedQuestion;
}

/* ---------------- [FIXED] LANGUAGE DETECTION (Order & Confidence) ---------------- */
function detectLanguageFromText(text, currentLanguage = "English") {
    if (!text || typeof text !== "string") return currentLanguage;

    const cleanText = text.trim().toLowerCase();

    // 1. Explicit commands FIRST
    if (cleanText.includes('english') || cleanText.includes('speak english') || cleanText.includes('angrezi')) return "English";
    if (cleanText.includes('hindi') || cleanText.includes('speak hindi') || cleanText.includes('hind')) return "Hindi";

    // 2. Hindi script SECOND (High Confidence)
    if (/[\u0900-\u097F]/.test(text)) return "Hindi";

    // 3. Romanized Hindi THIRD (Medium Confidence)
    const hindiRomanPatterns = [
        /\b(kaise|kya|kyu|kaun|kahan|kab|kaisa|kitna|karni|karte|hain|ho|hai|hun)\b/i,
        /\b(main|mera|mere|meri|tum|aap|hum|hamara|unka|uska|apna|apne)\b/i,
        /\b(mujhe|tujhe|use|hamein|unhein|karke|hokar|kar|lekin|par|aur|ya)\b/i,
        /\b(accha|theek|sahi|galat|bhoot|zyada|kam|subah|shaam|raat)\b/i,
        /\b(bahut|thoda|kyun|karo|kare|rahe|raha|rahi|chahiye|nahi|nahin)\b/i
    ];
    const hindiMatches = hindiRomanPatterns.filter(pattern => pattern.test(cleanText)).length;
    if (hindiMatches >= 2 || (hindiMatches >= 1 && cleanText.length < 25)) return "Hindi";

    // 4. Pure English FOURTH (Medium Confidence - avoids common mixed words)
    const commonMixedWords = /\b(ok|yes|no|hi|hello|hey|thanks|thank|menu|help|options|ji|haan|nahi|theek|accha)\b/;
    const isPureEnglish = /^[a-zA-Z\s,.!?'"-]+$/.test(text) && text.length > 3 && !commonMixedWords.test(cleanText); // Min length 4
    if (isPureEnglish) return "English";

    // 5. Common single words LAST (Lower Confidence)
    const hindiCommon = ['namaste', 'namaskar', 'pranam', 'radhe', 'radhe radhe', 'hare krishna', 'ji', 'haan', 'nahi', 'theek', 'accha'];
    const englishCommon = ['hi', 'hello', 'hey', 'thanks', 'thank you', 'ok', 'okay', 'yes', 'no', 'menu', 'help']; // Added menu/help
    if (hindiCommon.includes(cleanText)) return "Hindi";
    if (englishCommon.includes(cleanText)) return "English";

    // 6. Default to current language for ambiguity
    return currentLanguage;
}

/* ---------------- [FIXED] LANGUAGE DETERMINATION (Explicit vs Implicit) ---------------- */
async function determineUserLanguage(phone, text, user) {
    let currentLanguage = user.language_preference || user.language || 'English';
    const cleanText = text.toLowerCase().trim();

    // 1. Check for EXPLICIT commands
    const isExplicitEnglish = cleanText.includes('english') || cleanText.includes('speak english') || cleanText.includes('angrezi');
    const isExplicitHindi = cleanText.includes('hindi') || cleanText.includes('speak hindi') || cleanText.includes('hind');

    if (isExplicitEnglish && currentLanguage !== 'English') {
        await updateUserState(phone, { language_preference: 'English', language: 'English' });
        console.log(`🔄 Language EXPLICITLY switched to: English for ${phone}`);
        return { language: 'English', isSwitch: true };
    }
    if (isExplicitHindi && currentLanguage !== 'Hindi') {
        await updateUserState(phone, { language_preference: 'Hindi', language: 'Hindi' });
        console.log(`🔄 Language EXPLICITLY switched to: Hindi for ${phone}`);
        return { language: 'Hindi', isSwitch: true };
    }

    // 2. If NOT an explicit command, detect language for this response turn
    const detectedLanguage = detectLanguageFromText(text, currentLanguage);

    // 3. Update preference ONLY if detection differs AND seems confident, but DON'T treat as a reset switch.
    if (detectedLanguage !== currentLanguage) {
        const isConfidentDetection =
            /[\u0900-\u097F]/.test(text) || // Hindi script is confident
            (/^[a-zA-Z\s,.!?'"-]+$/.test(text) && text.length > 10 && !/\b(ok|yes|no|hi|hello)\b/.test(cleanText)); // Longer English is more confident

        if (isConfidentDetection) {
            console.log(`🔄 Language IMPLICITLY detected & preference updated: ${detectedLanguage} for ${phone}`);
            await updateUserState(phone, { language_preference: detectedLanguage, language: detectedLanguage });
            return { language: detectedLanguage, isSwitch: false }; // Use new language, DO NOT reset
        } else {
             console.log(`~ Language detected (${detectedLanguage}) for ${phone}, but not confident enough to switch preference from ${currentLanguage}. Answering in ${detectedLanguage}.`);
             // Answer in detected language for this turn, but keep preference
             return { language: detectedLanguage, isSwitch: false }; // Still isSwitch: false
        }
    }

    // 4. Language is the same, no switch.
    return { language: currentLanguage, isSwitch: false };
}


/* ---------------- [FIXED] MESSAGE LENGTH OPTIMIZATION (No generic follow-up) ---------------- */
function optimizeMessageForWhatsApp(message, maxLength = 350) {
    const trimmedMessage = message ? message.trim() : "";
    if (!trimmedMessage || trimmedMessage.length <= maxLength) return trimmedMessage;

    // Never cut specific structural elements
    if (trimmedMessage.includes('🚩') || trimmedMessage.includes('📖') ||
        trimmedMessage.includes('1️⃣') || trimmedMessage.includes('2️⃣') ||
        trimmedMessage.includes('3️⃣') || trimmedMessage.includes('4️⃣') ||
        trimmedMessage.includes('5️⃣') || trimmedMessage.startsWith('✅')) {
        // console.log(" optimizing message: structural element detected, skipping.");
        return trimmedMessage.substring(0, maxLength); // Safety trim
    }

    // console.log(` optimizing message: Attempting to shorten from ${trimmedMessage.length} chars.`);
    const sentences = trimmedMessage.split(/([.!?।]+["']?\s+)/g); // Keep delimiters
    let shortened = "";
    let currentLength = 0;

    for (let i = 0; i < sentences.length; i++) {
        const part = sentences[i];
        if (!part) continue;

        if (currentLength + part.length <= maxLength) {
            shortened += part;
            currentLength += part.length;
        } else {
            const remainingSpace = maxLength - currentLength;
            if (remainingSpace > 10) { // Only add partial if enough space
                const partialSentence = part.substring(0, remainingSpace);
                const lastSpace = partialSentence.lastIndexOf(' ');
                if (lastSpace > 0) {
                    shortened += partialSentence.substring(0, lastSpace) + "...";
                } else {
                    shortened += "..."; // Failsafe
                }
            } else if (!shortened.endsWith("...")) {
                 shortened = shortened.replace(/[.,!?।\s]*$/, '') + "..."; // Ensure ellipsis
            }
            currentLength = maxLength; // Mark as full
            break; // Stop adding
        }
    }

     // Final checks
     if (shortened.length > maxLength) {
         shortened = shortened.substring(0, maxLength - 3) + "...";
     } else if (shortened.length === 0) { // Failsafe
         console.warn(" optimizing message: shortening failed, using substring.");
         shortened = trimmedMessage.substring(0, maxLength - 3) + "...";
     } else if (shortened.length < trimmedMessage.length && !shortened.endsWith("...")) {
         // Ensure ellipsis if sentences were cut
          shortened = shortened.replace(/[.,!?।\s]*$/, '') + "...";
     }

    // console.log(` optimizing message: Shortened to ${shortened.length} chars.`);
    return shortened;
}


/* ---------------- ENHANCED ANALYTICS TRACKING ---------------- */
async function trackTemplateButtonClick(phone, buttonType, buttonText, language, templateContext = {}) {
    try {
        const patternId = `pattern_${Date.now()}_${phone.replace('+', '')}`;

        await dbPool.query(`
            INSERT INTO user_response_patterns
            (pattern_id, phone, template_id, first_response_text, first_response_time_seconds,
             response_sentiment, asked_for_help, emotional_state_detected, button_clicked, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT DO NOTHING
        `, [
            patternId, phone, templateContext.template_id || buttonType, // Use buttonType as fallback template_id
            buttonText.substring(0, 500), 0, 'seeking_guidance', true, 'seeking_guidance', buttonType
        ]);

        const sessionId = `sess_${Date.now()}_${phone.replace('+', '')}`;
        await dbPool.query(`
            INSERT INTO user_engagement
            (session_id, phone, morning_message_id, first_reply_time, buttons_clicked, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT DO NOTHING
        `, [
            sessionId, phone, templateContext.message_id || 'button_click', new Date(), JSON.stringify([buttonType]) // Store as JSON array
        ]);

        try {
            await dbPool.query(`
                INSERT INTO template_analytics
                (phone, template_id, button_clicked, language, clicked_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT DO NOTHING
            `, [
                phone, templateContext.template_id || buttonType, buttonType, language
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
    for (const buttonText in BUTTON_MAPPING) {
        // Use includes for flexibility (e.g., button titles might have extra chars)
        if (cleanText.includes(buttonText.toLowerCase())) {
            return true;
        }
    }
    // Fallback: Check if the text matches any known button intent values directly
    const knownIntents = Object.values(BUTTON_MAPPING);
     if (knownIntents.includes(cleanText)) {
         return true;
     }
    return false;
}

function getButtonType(text) {
    const cleanText = text.toLowerCase().trim();
     // Prioritize exact match first
     for (const buttonText in BUTTON_MAPPING) {
        if (cleanText === buttonText.toLowerCase()) {
            return BUTTON_MAPPING[buttonText];
        }
    }
     // Check if the text *is* an intent value (e.g., payload is the intent)
     const knownIntents = Object.values(BUTTON_MAPPING);
     if (knownIntents.includes(cleanText)) {
          return cleanText;
     }
    // Fallback: Use 'includes' for broader matching (e.g., button titles)
    for (const [buttonText, buttonType] of Object.entries(BUTTON_MAPPING)) {
        if (cleanText.includes(buttonText.toLowerCase())) {
             console.log(`~ Note: Matched button via 'includes' for "${text}" -> ${buttonType}`);
            return buttonType;
        }
    }
    return null;
}

/* ---------------- Template Button Response Handler (Handles Morning Checkin) ---------------- */
async function handleTemplateButtonResponse(phone, text, language, user) {
    const buttonType = getButtonType(text); // Gets the intent, e.g., 'morning_checkin'

    if (!buttonType) {
        console.log(`❓ Unknown button text: "${text}" for ${phone}`);
        return false; // Let it fall through to AI
    }

    console.log(`🎯 Processing template button: ${buttonType} in ${language} for ${phone}`);
    await trackTemplateButtonClick(phone, buttonType, text, language); // Track click

    let response = "";
    let nextStage = 'chatting'; // Default stage after handling a button
    let responseType = `template_button_${buttonType}`;

    // Check if it's the new morning check-in button
    if (buttonType === 'morning_checkin') {
        response = OPTIMIZED_TEMPLATE_RESPONSES.morning_checkin[language] || OPTIMIZED_TEMPLATE_RESPONSES.morning_checkin.english;
        nextStage = 'awaiting_mood'; // Set stage to expect the mood word
        console.log(`✅ Morning check-in initiated for ${phone}. Stage set to awaiting_mood.`);
    } else {
        // Handle other standard template buttons
        const responseTemplate = OPTIMIZED_TEMPLATE_RESPONSES[buttonType];
        if (!responseTemplate) {
            console.log(`❌ No response template found for: ${buttonType}. Falling back to AI.`);
            const conversationContext = buildConversationContext(user, text);
            await updateUserState(phone, { conversation_stage: 'chatting', last_activity_ts: new Date().toISOString() });
            user.conversation_stage = 'chatting';
            await getCachedAIResponse(phone, text, language, conversationContext);
            return true; // Handled (by AI fallback)
        }
        response = responseTemplate[language] || responseTemplate.english;
        console.log(`✅ Standard template button handled: ${buttonType} for ${phone}`);
    }

    // Send the determined response
    const sent = await sendViaHeltar(phone, response, responseType);

    // Update state AFTER sending, only if sending was successful
    if (sent) {
        // Add bot response to history
        const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: response }];
        await updateUserState(phone, {
            conversation_stage: nextStage,
            last_menu_choice: buttonType, // Record the choice/intent
            chat_history: updatedHistory, // Save history
            last_message: response,
            last_message_role: 'assistant'
            // last_activity_ts updated automatically by updateUserState
        });
        return true; // Indicate handled
    } else {
        console.error(`❌ Failed to send template response for ${buttonType} to ${phone}.`);
        return false; // Indicate not handled due to send failure
    }
}


/* --- [NEW] Handler for Morning Check-in Mood Response --- */
async function handleMorningCheckinResponse(phone, moodWord, language, user) {
    console.log(`☀️ Handling morning check-in mood: "${moodWord}" for ${phone} in ${language}`);

    // Build a specific context for the AI
    const conversationContext = buildConversationContext(user, moodWord); // Use standard context builder
    conversationContext.isMorningCheckinReply = true; // Add the flag

    // Call the AI with this specific context
    // getCachedAIResponse handles sending and history update
    await getCachedAIResponse(phone, moodWord, language, conversationContext);

    // Ensure stage is moved to chatting after handling the mood
    // updateUserState happens inside getEnhancedAIResponse/getContextualFallback,
    // but we can ensure it here too for robustness.
     await updateUserState(phone, {
        conversation_stage: 'chatting',
        // last_activity_ts updated automatically
    });
     console.log(`✅ Morning check-in response handled for ${phone}. Stage set to chatting.`);
}


/* ---------------- Enhanced Gita Wisdom Database (Fallback) ---------------- */
const ENHANCED_GITA_WISDOM = {
    moral_dilemma: {
        verses: ["16.1-3", "17.14-16", "18.63"],
        teachings: {
            hindi: [
                `🌅 **सत्य का मार्ग:** यह एक गहरा प्रश्न है। गीता (16.1-3) सत्य और ईमानदारी जैसे गुणों पर जोर देती है। व्यावहारिक कदम: पहले अपने इरादे जाँचें। क्या आप किसी विश्वसनीय मित्र से सलाह ले सकते हैं?`,
                `💫 **कठिन सत्य:** गीता (17.14-16) सत्य बोलने को प्रोत्साहित करती है, लेकिन धीरे से। व्यावहारिक कदम: स्थिति का सावधानीपूर्वक मूल्यांकन करें। क्या आपकी सुरक्षा को खतरा है?`
            ],
            english: [
                `🌅 **Path of Truth:** That's a deep question. Gita (16.1-3) emphasizes divine qualities like truthfulness. Practical step: Examine your intentions first. Can you consult a trusted friend?`,
                `💫 **Difficult Truth:** Gita (17.14-16) encourages speaking truth, but gently. Practical step: Assess the situation carefully. Is your safety at risk?`
            ]
        }
    },
    stress: {
        verses: ["2.56", "18.63", "2.40"],
        teachings: {
            hindi: [
                `🌊 **तनाव का सामना:** आपका तनाव स्वाभाविक है। गीता (2.56) दुख में अविचलित रहने की सलाह देती है। व्यावहारिक कदम: गहरी सांस लेने का अभ्यास करें (4-7-8)। आप किस एक छोटे कदम से शुरूआत कर सकते हैं?`,
                `🛡️ **आंतरिक सुरक्षा:** गीता (18.63) कहती है, "चिंतन करो, फिर जैसा मन चाहे वैसा करो।" व्यावहारिक कदम: सबसे बुरे परिणाम के बारे में सोचें और उसका समाधान निकालें। आप किस एक छोटे कदम से शुरूआत कर सकते हैं?`
            ],
            english: [
                `🌊 **Facing Stress:** Your stress is natural. Gita (2.56) advises being undisturbed in sorrow. Practical step: Practice deep breathing (4-7-8). What's one small step you could start with?`,
                `🛡️ **Inner Security:** Gita (18.63) says: "Reflect fully, then act as you choose." Practical step: Brainstorm solutions for the worst-case scenario. What's one small step you could start with?`
            ]
        }
    },
    general: { // Generic fallback
        verses: ["2.47", "3.5"],
         teachings: {
             hindi: [`🤔 गीता (2.47) कहती है कि अपने कर्म पर ध्यान केंद्रित करें, फल पर नहीं। व्यावहारिक कदम: आज एक छोटा सा काम पूरा करने पर ध्यान दें। आप किस एक छोटे कदम से शुरूआत कर सकते हैं?`],
             english: [`🤔 Gita (2.47) advises focusing on your action, not the results. Practical step: Focus on completing one small task today. What's one small step you could start with?`]
         }
    }
};


/* ---------------- [REFINED] AI PROMPT (v5) ---------------- */
const ENHANCED_SYSTEM_PROMPT = {
  hindi: `आप सारथी AI हैं - भगवद गीता के आधार पर मार्गदर्शन देने वाले विशेषज्ञ। आपका लक्ष्य छोटी, सहानुभूतिपूर्ण, व्यावहारिक और आकर्षक बातचीत करना है।

**कड़े नियम:**
1.  **भावना/प्रसंग का विश्लेषण करें:**
    * **अगर उपयोगकर्ता परेशान है** (तनाव, उदास, भ्रमित): गहरी सहानुभूति दिखाएं (जैसे, 'यह सुनना बहुत कठिन है...', 'यह भावना भारी हो सकती है...')। 😔🌀
    * **अगर उपयोगकर्ता प्रश्न पूछ रहा है** (जैसे 'क्या खाएं?', 'कैसे सफल हों?'): सीधे और व्यावहारिक रूप से उत्तर दें। सहानुभूतिपूर्ण शुरुआत *न* करें। 🤔
    * **अगर यह सुबह की जांच का जवाब है** (isMorningCheckinReply flag): उपयोगकर्ता द्वारा दिए गए मूड शब्द को स्वीकार करें, एक संक्षिप्त प्रासंगिक गीता अंतर्दृष्टि दें, और मूड से संबंधित एक व्यावहारिक अनुवर्ती प्रश्न पूछें। 🙏
2.  **गीता अंतर्दृष्टि:** एक प्रासंगिक गीता श्लोक या शिक्षा संक्षेप में दें।
3.  **व्यावहारिक सलाह:** केवल 1 छोटी, व्यावहारिक सलाह दें।
4.  **आकर्षक फॉलो-अप:** हमेशा *एक* प्राकृतिक, व्यावहारिक प्रश्न के साथ समाप्त करें जो बातचीत जारी रखने को प्रोत्साहित करे। प्रश्न विषय से संबंधित होना चाहिए। **यह प्रश्न पूछना अनिवार्य है।**
5.  **बहुत छोटा रखें:** आपका पूरा उत्तर 100-120 शब्दों के करीब होना चाहिए। इससे ज़्यादा नहीं।
6.  **इमोजी बदलें:** 😔, 🌀, 🤔, 🙏, 🕉️, ✨ का मिश्रण प्रयोग करें।

**कभी न करें:**
* "Want to know more?", "Does this seem helpful?", "क्या और जानना चाहेंगे?", "क्या यह उपयोगी लगा?" जैसे सामान्य प्रश्न पूछें।
* 120 शब्दों से अधिक लिखें।
* एक से अधिक प्रश्न पूछें।
* केवल श्लोक उद्धृत करें; व्यावहारिक सलाह और प्रश्न दें।`,

  english: `You are Sarathi AI - an expert guide based on Bhagavad Gita. Your goal is short, empathetic, practical, and engaging conversation.

**STRICT RULES:**
1.  **Analyze Emotion/Context:**
    * **If user is distressed** (stressed, sad, confused): Show deep empathy (e.g., "That sounds incredibly difficult...", "That's a heavy feeling..."). 😔🌀
    * **If user is asking a question** (e.g., 'What to eat?', 'How to be successful?'): Answer directly and practically. Do *not* use the empathetic start. 🤔
    * **If it's a reply to the morning check-in** (isMorningCheckinReply flag): Acknowledge the mood word provided by the user, give a brief relevant Gita insight, and ask a practical follow-up question related to the mood. 🙏
2.  **Gita Insight:** Provide one relevant Gita verse or teaching concisely.
3.  **Practical Advice:** Give only 1 short, practical piece of advice.
4.  **Engaging Follow-up:** ALWAYS end with *one* natural, practical question that encourages continuing the conversation. The question must be related to the topic. **Asking this question is mandatory.**
5.  **Keep it SHORT:** Your entire response should be around 100-120 words MAXIMUM.
6.  **Vary Emojis:** Use a mix of 😔, 🌀, 🤔, 🙏, 🕉️, ✨.

**NEVER DO:**
* Ask generic questions like "Want to know more?" or "Does this seem helpful?".
* Exceed 120 words.
* Ask more than one question.
* Just quote verses; give practical advice and a question.`
};


/* ---------------- Validation & Setup ---------------- */
const validateEnvVariables = () => {
    const requiredVars = { DATABASE_URL, OPENAI_KEY, HELTAR_API_KEY, HELTAR_PHONE_ID };
    const missingVars = Object.entries(requiredVars).filter(([, value]) => !value).map(([key]) => key);
    if (missingVars.length > 0) {
        console.error(`❌ Critical Error: Missing environment variables: ${missingVars.join(", ")}`);
        process.exit(1);
    }
     console.log("✅ Environment variables validated.");
};

async function setupDatabase() {
    let client; // Define client outside try block for release in finally
    try {
        client = await dbPool.connect();
        console.log("🔗 Connected to database for setup.");

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
            { name: 'last_menu_choice', type: 'VARCHAR(50)' },
            { name: 'last_menu_date', type: 'DATE' },
            { name: 'last_menu_shown', type: 'TIMESTAMP WITH TIME ZONE' },
            { name: 'primary_use_case', type: 'VARCHAR(50)' },
            { name: 'user_segment', type: 'VARCHAR(20) DEFAULT \'new\'' },
            { name: 'last_activity_ts', type: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP' },
            { name: 'pending_followup', type: 'TEXT' },
            { name: 'followup_type', type: 'VARCHAR(50)' },
            { name: 'language', type: 'VARCHAR(10) DEFAULT \'English\'' }
        ];

        console.log("🔧 Checking/Adding necessary columns in 'users' table...");
        for (const col of columnsToAdd) {
            try {
                await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
            } catch (alterErr) {
                if (!alterErr.message.includes('already exists') && !alterErr.message.includes('already has a default')) { // Ignore default errors too
                   console.warn(`⚠️ DB Setup Warning: Could not add column ${col.name}: ${alterErr.message}`);
                }
            }
        }
        console.log("🔧 'users' table columns checked/added.");

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
        console.log("🔧 'lessons' table checked/created.");

        // Insert sample lessons if table is empty
        const lessonCountRes = await client.query("SELECT COUNT(*) FROM lessons");
        const lessonCount = parseInt(lessonCountRes.rows[0].count);
        if (lessonCount === 0) {
            console.log("📚 Inserting sample lessons...");
            await client.query(`
                INSERT INTO lessons (lesson_number, verse, translation, commentary, reflection_question) VALUES
                (1, 'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।', 'You have the right to work only, but never to the fruits.', 'Focus on your duty without attachment to results. This is the path to peace and success.', 'What action can I take today without worrying about the outcome?'),
                (2, 'योगस्थः कुरु कर्माणि सङ्गं त्यक्त्वा धनञ्जय।', 'Perform your duty equipoised, O Arjuna, abandoning all attachment to success or failure.', 'Balance and equanimity lead to excellence in work and peace in life.', 'How can I stay balanced in challenging situations today?')
                ON CONFLICT (lesson_number) DO NOTHING;
            `);
             console.log("📚 Sample lessons inserted.");
        } else {
            console.log(`📚 Found ${lessonCount} existing lessons.`);
        }

        console.log("✅ Database setup complete.");
    } catch (err) {
        console.error("❌ Database setup error:", err?.message || err);
        // Optionally exit if setup fails critically
        // process.exit(1);
    } finally {
        if (client) {
            client.release(); // Ensure client is released
            console.log("🔗 Released database client after setup.");
        }
    }
}

/* ---------------- Enhanced Helper Functions ---------------- */
function parseChatHistory(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw; // Already an array
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : []; // Ensure it's an array
        } catch (e) {
            console.error("Error parsing chat history JSON:", e);
            return []; // Return empty on error
        }
    }
    console.warn("Unexpected chat history type:", typeof raw);
    return []; // Return empty for other types
}

function pruneChatHistory(history, maxMessages = 6) { // Reduced history for prompt length
    if (!Array.isArray(history)) {
        console.warn("pruneChatHistory received non-array:", history);
        return []; // Return empty array if input is not an array
    }
    if (history.length <= maxMessages) {
        return history;
    }
    // Simple slice from the end
    return history.slice(-maxMessages);
}

/* ---------------- CONVERSATION CONTEXT TRACKING ---------------- */
function buildConversationContext(user, currentMessage) {
  const history = user.chat_history || []; // Ensure history is an array
  const recentMessages = history.slice(-4);

  const isQuestion = currentMessage.includes('?') || /\b(what|how|why|when|where|who|kaise|kya|kyu|kab|kaun)\b/i.test(currentMessage.toLowerCase());

  let context = {
    previousTopics: [],
    emotionalTone: detectEmotionAdvanced(currentMessage)?.emotion || 'neutral',
    isFollowUp: false,
    isQuestion: isQuestion,
    isMorningCheckinReply: false // Default to false, set true only in specific handler
  };

  if (recentMessages.length >= 2) {
    const lastUserMsg = recentMessages.findLast(m => m.role === 'user')?.content || '';
    const lastBotMsg = recentMessages.findLast(m => m.role === 'assistant')?.content || '';
    // Follow-up if last bot message was a question or last user message was substantial
    context.isFollowUp = lastBotMsg.includes('?') || lastUserMsg.length > 15;
    context.previousTopics = extractTopics([lastUserMsg, lastBotMsg, currentMessage]);
  } else {
    context.previousTopics = extractTopics([currentMessage]);
  }

  // Refine emotional tone if context suggests otherwise
  if (!isEmotionalExpression(currentMessage) && isQuestion) {
      context.emotionalTone = 'questioning'; // Override if it looks like a question
  }


  return context;
}

function extractTopics(messages) {
  const topics = new Set(); // Use a Set to avoid duplicates
  const text = messages.join(' ').toLowerCase();

  if (text.includes('work') || text.includes('job') || text.includes('काम') || text.includes('नौकरी')) { topics.add('work'); }
  if (text.includes('stress') || text.includes('pressure') || text.includes('तनाव') || text.includes('दबाव')) { topics.add('stress'); }
  if (text.includes('relationship') || text.includes('family') || text.includes('रिश्ता') || text.includes('परिवार')) { topics.add('relationships'); }
  if (text.includes('confus') || text.includes('understand') || text.includes('समझ') || text.includes('भ्रम')) { topics.add('confusion'); }
  if (text.includes('anxious') || text.includes('worry') || text.includes('चिंता') || text.includes('घबराहट')) { topics.add('anxiety'); }
  if (text.includes('sad') || text.includes('depress') || text.includes('दुखी') || text.includes('उदास')) { topics.add('sadness'); }
  if (text.includes('money') || text.includes('rich') || text.includes('पैसा') || text.includes('अमीर')) { topics.add('finance'); }
  if (text.includes('success') || text.includes('सफलता')) { topics.add('success'); }
  if (text.includes('home') || text.includes('house') || text.includes('घर')) { topics.add('housing'); }
  if (text.includes('bad things') || text.includes('why') || text.includes('suffering') || text.includes('क्यों') || text.includes('दुख')) { topics.add('philosophy'); }
  if (text.includes('mantra') || text.includes('lesson') || text.includes('gyan') || text.includes('ज्ञान')) { topics.add('wisdom'); }
  if (text.includes('love') || text.includes('pyaar') || text.includes('प्यार')) { topics.add('love'); }
  if (text.includes('studies') || text.includes('focus') || text.includes('पढ़ाई')) { topics.add('studies'); }
  if (text.includes('story') || text.includes('krishna') || text.includes('कृष्ण')) { topics.add('story'); }
  if (text.includes('mood') || text.includes('feeling') || text.includes('महसूस')) { topics.add('checkin'); } // Added for morning checkin

  return Array.from(topics); // Convert Set back to Array
}

async function getUserState(phone) {
    let client;
    try {
        client = await dbPool.connect();
        const res = await client.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
        let user;
        if (res.rows.length === 0) {
            console.log(`✨ Creating new user entry for ${phone}`);
            // Use RETURNING * to get the newly inserted row with defaults
            const insertRes = await client.query(`
                INSERT INTO users (phone_number, first_seen_date, last_seen_date, total_sessions, language_preference, language, last_activity_ts, memory_data, chat_history, conversation_stage)
                VALUES ($1, CURRENT_DATE, CURRENT_DATE, 1, 'English', 'English', CURRENT_TIMESTAMP, '{}', '[]', 'menu')
                RETURNING *;
            `, [phone]);
            user = insertRes.rows[0];

        } else {
             user = res.rows[0];
        }

        // Ensure defaults and parse JSON fields safely
        user.chat_history = pruneChatHistory(parseChatHistory(user.chat_history)); // Prune and parse
        user.memory_data = user.memory_data && typeof user.memory_data === 'object' ? user.memory_data : (typeof user.memory_data === 'string' ? JSON.parse(user.memory_data || '{}') : {});
        user.conversation_stage = user.conversation_stage || 'menu';
        user.language_preference = user.language_preference || 'English';
        user.language = user.language || 'English';
        user.last_activity_ts = user.last_activity_ts || new Date().toISOString();

        return user;

    } catch (err) {
        console.error(`❌ getUserState failed for ${phone}:`, err);
        // Return a default structure on error to prevent crashes
        return {
            phone_number: phone, chat_history: [], memory_data: {},
            conversation_stage: "menu", language_preference: "English", language: "English"
        };
    } finally {
        if (client) client.release();
    }
}


async function updateUserState(phone, updates) {
    let client;
    try {
        if (!updates || Object.keys(updates).length === 0) {
            // console.log(`~ updateUserState called with no updates for ${phone}.`); // Reduce logging
            return;
        }

        // Ensure JSON fields are stringified BEFORE building query parts
        if (updates.chat_history && typeof updates.chat_history !== 'string') {
            updates.chat_history = JSON.stringify(updates.chat_history);
        }
        if (updates.memory_data && typeof updates.memory_data !== 'string') {
             updates.memory_data = JSON.stringify(updates.memory_data);
        }

        // Always update last_activity_ts
        updates.last_activity_ts = new Date().toISOString();

        const keys = Object.keys(updates);
        const vals = keys.map(k => updates[k]); // Use updates directly
        const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", "); // Quote column names
        const sql = `UPDATE users SET ${setClauses} WHERE phone_number = $${keys.length + 1}`;

        console.log(`💾 Attempting DB update for ${phone}: Stage=${updates.conversation_stage || '(no change)'}, LangPref=${updates.language_preference || '(no change)'}`);

        client = await dbPool.connect();
        const result = await client.query(sql, [...vals, phone]);

        if (result.rowCount === 0) {
             console.warn(`⚠️ updateUserState: No rows updated for ${phone}. User might not exist yet? Updates:`, JSON.stringify(updates).substring(0,200) + "...");
        } else {
            // console.log(`💾✅ DB update successful for ${phone}.`); // Reduce log verbosity
        }

    } catch (err) {
        console.error(`❌ updateUserState failed for ${phone}:`, err);
        console.error("   Failed updates object:", JSON.stringify(updates).substring(0,200) + "..."); // Log the updates that failed
    } finally {
        if (client) client.release();
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

    const sent = await sendViaHeltar(phone, menuMessage, "enhanced_welcome");
    if (sent) {
        // Update state *after* sending
        const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: menuMessage }];
        await updateUserState(phone, {
            conversation_stage: "menu",
            last_menu_shown: new Date().toISOString(),
            chat_history: updatedHistory, // Add menu to history
            last_message: menuMessage,
            last_message_role: 'assistant'
        });
        console.log(`✅ Complete menu shown to ${phone} in ${language}. State set to 'menu'.`);
    } else {
        console.error(`❌ Failed to send welcome menu to ${phone}.`);
    }
}

/* ---------------- Stage Reset Logic ---------------- */
function shouldResetToMenu(message, currentStage) {
    const cleanMessage = message.toLowerCase().trim();
    const resetTriggers = [
        'hi', 'hello', 'hey', 'namaste', 'start', 'menu', 'options',
        'help', 'guidance', 'back', 'home', 'main menu', 'hello again', 'hi again',
        'नमस्ते', 'शुरू', 'मेनू', 'मदद', 'वापस'
    ];
    if (resetTriggers.includes(cleanMessage)) return true;
    // Reset if number 1-5 received *outside* menu stage
    if (/^[1-5]$/.test(cleanMessage) && currentStage !== 'menu') return true;
    return false;
}

async function resetToMenuStage(phone, language) {
    console.log(`🔄 Resetting user ${phone} to menu stage`);
    // Fetch user state again to pass the most recent version to handleEnhancedStartupMenu
    const user = await getUserState(phone);
    await handleEnhancedStartupMenu(phone, language, user); // Sends menu & updates state/history
}

/* ---------------- Enhanced Analytics ---------------- */
async function trackIncoming(phone, text) {
    try {
        const user = await getUserState(phone); // Get latest state
        const now = new Date();
        let addSession = !user.last_activity_ts || (now.getTime() - new Date(user.last_activity_ts).getTime()) > 12 * 60 * 60 * 1000; // 12 hours check

        const updates = {
            last_activity_ts: now.toISOString(),
            last_seen_date: now.toISOString().slice(0, 10),
            // Don't update last_message/role here, webhook handler does it
            total_incoming: (user.total_incoming || 0) + 1
        };
        if (!user.first_seen_date) updates.first_seen_date = now.toISOString().slice(0, 10);
        if (addSession) updates.total_sessions = (user.total_sessions || 0) + 1;

        await updateUserState(phone, updates); // Use the dedicated update function
    } catch (err) {
        console.error(`❌ trackIncoming failed for ${phone}:`, err);
    }
}

// trackOutgoing is called implicitly by sendViaHeltar, no separate call needed in main logic
async function trackOutgoing(phone, reply, type = "chat") {
    try {
        const user = await getUserState(phone); // Get latest state
        const updates = {
            // last_activity_ts updated by updateUserState automatically
             // Don't update last_message/role here, handled AFTER sending by callers
            last_response_type: type,
            total_outgoing: (user.total_outgoing || 0) + 1
        };
        await updateUserState(phone, updates); // Use the dedicated update function
    } catch (err) {
        console.error(`❌ trackOutgoing failed for ${phone}:`, err);
    }
}

/* ---------------- FIXED: Enhanced Heltar Sending ---------------- */
async function sendViaHeltar(phone, message, type = "chat") {
    let finalMessage = "";
    try {
        // Apply smart length optimization ONLY for AI responses
        if (type === 'enhanced_ai_response' || type === 'chat') {
            finalMessage = optimizeMessageForWhatsApp(message, MAX_REPLY_LENGTH);
        } else {
            finalMessage = message ? message.trim() : ""; // Trim other messages too
        }

        const safeMessage = finalMessage; // Already trimmed
        if (!safeMessage) {
            console.error(`❌ Attempted to send empty message to ${phone}. Original type: ${type}`);
            return null; // Return null on failure
        }

        console.log(`📤 Sending to ${phone} (Type: ${type}): "${safeMessage.substring(0, 100)}..."`);

        if (!HELTAR_API_KEY || !HELTAR_PHONE_ID) {
            console.warn(`(Simulated -> ${phone}): ${safeMessage}`);
            await trackOutgoing(phone, safeMessage, type);
            return { simulated: true, message: safeMessage }; // Simulate success
        }

        const payload = { messages: [{ clientWaNumber: phone, message: safeMessage, messageType: "text" }] };
        const resp = await axios.post("https://api.heltar.com/v1/messages/send", payload, {
            headers: { Authorization: `Bearer ${HELTAR_API_KEY}`, "Content-Type": "application/json" },
            timeout: 20000
        });

        await trackOutgoing(phone, safeMessage, type); // Track AFTER successful send
        // console.log(`✅ Message sent successfully to ${phone}.`); // Reduce log verbosity
        return resp.data; // Return API response

    } catch (err) {
        console.error(`❌ Heltar send error for ${phone}:`, err?.response?.data || err?.message || err);
        await trackOutgoing(phone, finalMessage || message, `error_sending_${type}`);
        return null; // Return null on failure
    }
}

/* ---------------- Complete Response System ---------------- */
async function sendCompleteResponse(phone, fullResponse, language, type = "chat") {
    // Optimization happens within sendViaHeltar based on type
    await sendViaHeltar(phone, fullResponse, type);
}

/* ---------------- Context Building ---------------- */
function buildContextSummary(messages, language) {
    if (!Array.isArray(messages) || messages.length === 0) { // Added array check
        return language === "Hindi" ? "कोई पिछला संदर्भ नहीं" : "No previous context";
    }

    const userMessages = messages.filter(msg => msg.role === 'user').slice(-2);
    const botMessages = messages.filter(msg => msg.role === 'assistant').slice(-1);
    let summary = "";

    if (language === "Hindi") {
        summary = "उपयोगकर्ता ने पहले चर्चा की: ";
        userMessages.forEach(msg => { if(msg.content) summary += `"${msg.content.substring(0, 50)}...", `; });
        if (botMessages.length > 0 && botMessages[0].content) {
            summary += `मैंने जवाब दिया: "${botMessages[0].content.substring(0, 30)}..."`;
        }
    } else {
        summary = "User previously discussed: ";
        userMessages.forEach(msg => { if(msg.content) summary += `"${msg.content.substring(0, 50)}...", `; });
        if (botMessages.length > 0 && botMessages[0].content) {
            summary += `I responded: "${botMessages[0].content.substring(0, 30)}..."`;
        }
    }
    return summary.replace(/,\s*$/, ''); // Remove trailing comma/space
}

/* ---------------- Intent Classification ---------------- */
function isFollowUpToPreviousDeepQuestion(currentText, user) {
    if (!user || user.last_message_role !== 'assistant') return false;
    const lastBotMessage = user.last_message || '';
    return lastBotMessage.includes('?'); // Simpler check: Was the bot asking a question?
}
function isGreetingQuery(text) { /* ... keep existing code ... */ };
function isCapabilitiesQuery(text) { /* ... keep existing code ... */ };
function isEmotionalExpression(text) { /* ... keep existing code ... */ };
function isDeepQuestion(text) { /* ... keep existing code ... */ };
function isSmallTalk(text) { /* ... keep existing code ... */ };
function detectEmotionAdvanced(text) { /* ... keep existing code ... */ };
function detectUserSituation(text) { /* ... keep existing code ... */ };


/* ---------------- [FIXED] Enhanced AI Response System ---------------- */
async function getCachedAIResponse(phone, text, language, context) {
    const cacheKey = `${phone}:${text.substring(0, 50)}:${language}`;

    if (responseCache.has(cacheKey)) {
        console.log(`✅ Using cached response for ${phone}`);
        const cached = responseCache.get(cacheKey);
        const sent = await sendViaHeltar(phone, cached.response, cached.type);
        if (sent) {
            // Update history AFTER sending cached response
            const user = await getUserState(phone);
            const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: cached.response }];
            await updateUserState(phone, {
                chat_history: updatedHistory,
                last_message: cached.response,
                last_message_role: 'assistant'
            });
        }
        return; // Exit after sending cached response
    }

    console.log(`🧠 No cache hit for ${phone}. Calling AI.`);
    const aiResponseResult = await getEnhancedAIResponseWithRetry(phone, text, language, context);

    if (aiResponseResult && aiResponseResult.response) {
         responseCache.set(cacheKey, aiResponseResult);
         setTimeout(() => {
             console.log(`⏱️ Clearing cache for key: ${cacheKey}`);
             responseCache.delete(cacheKey);
         }, 5 * 60 * 1000); // 5 min cache
    }
    // Message sending and history update happen inside getEnhancedAIResponse or getContextualFallback
    return;
}

async function getEnhancedAIResponseWithRetry(phone, text, language, context, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // getEnhancedAIResponse sends message and updates history on success
            return await getEnhancedAIResponse(phone, text, language, context);
        } catch (error) {
            console.error(`❌ OpenAI attempt ${attempt + 1} failed for ${phone}:`, error.message);
            if (attempt === retries) {
                console.log(`🔄 All AI retries exhausted for ${phone}, using fallback.`);
                await getContextualFallback(phone, text, language, context); // Sends fallback & updates history
                return null; // Indicate failure after fallback
            }
            await new Promise(resolve => setTimeout(resolve, 1500 * Math.pow(2, attempt))); // Exponential backoff
        }
    }
}

/* ---------------- [FIXED & REFINED] AI RESPONSE FUNCTION (v5) ---------------- */
let aiCallCounter = 0;
async function getEnhancedAIResponse(phone, text, language, conversationContext = {}) {
  // --- Check for OpenAI Key ---
  if (!OPENAI_KEY || OPENAI_KEY === '') {
    console.log(`🔄 No OpenAI key for ${phone}, throwing error for retry/fallback.`);
    throw new Error("❌ No OpenAI key configured");
  }

  console.log(`🤖 Using STRICT OpenAI v5 prompt for ${phone}...`);

  // --- Prepare Prompts & History ---
  const systemPrompt = ENHANCED_SYSTEM_PROMPT[language] || ENHANCED_SYSTEM_PROMPT.english;
  const user = await getUserState(phone); // Fetch latest state *including history*
  const history = user.chat_history || []; // Already pruned by getUserState
  const currentContext = conversationContext;

  const isEmotional = currentContext.emotionalTone !== 'neutral' || isEmotionalExpression(text);
  const isQuestion = currentContext.isQuestion;

  let specificInstruction = "";
  if (currentContext.isMorningCheckinReply) {
      specificInstruction = language === 'Hindi'
          ? `यह सुबह की जांच का जवाब है। मूड शब्द है: "${text}". इस भावना को स्वीकार करें, एक संक्षिप्त प्रासंगिक गीता अंतर्दृष्टि दें, और मूड से संबंधित एक व्यावहारिक प्रश्न पूछें।`
          : `This is a reply to the morning check-in. The mood word is: "${text}". Acknowledge this feeling, give a relevant Gita insight, and ask a practical question related to the mood.`;
  } else if (isEmotional) {
       specificInstruction = language === 'Hindi' ? "उपयोगकर्ता व्यथित लग रहा है। गहरी सहानुभूति दिखाएं।" : "User seems distressed. Show deep empathy.";
  } else if (isQuestion) {
       specificInstruction = language === 'Hindi' ? "उपयोगकर्ता एक प्रश्न पूछ रहा है। सीधे और व्यावहारिक रूप से उत्तर दें।" : "User is asking a question. Answer directly and practically.";
  }

  // --- Language Enforcement ---
  const languageCommand = language === "Hindi"
    ? `**बहुत महत्वपूर्ण: आपको केवल हिंदी में ही जवाब देना है।**`
    : `**VERY IMPORTANT: You MUST reply in English only.**`;

  const userPrompt = `User message: "${text}"
${specificInstruction}
${languageCommand}`;

  const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6), // Send last 3 exchanges
      { role: "user", content: userPrompt }
  ];

  // --- Call OpenAI API ---
  console.log(`📤 Sending to OpenAI for ${phone} (V5 Prompt)`);
  aiCallCounter++;
  console.log(`\n--- OpenAI Call #${aiCallCounter} for ${phone} ---`);
  // console.log(`System Prompt Preview: ${systemPrompt.substring(0,100)}...`);
  // console.log(`User Prompt Preview: ${userPrompt.substring(0,100)}...`);

  const body = {
    model: OPENAI_MODEL, messages, max_tokens: 180, temperature: 0.75
  };

  let aiResponse = "";
  try {
      const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        timeout: 30000
      });
      aiResponse = resp.data?.choices?.[0]?.message?.content;
      console.log(`Raw AI Response for ${phone}:\n${aiResponse}`);
  } catch (apiError) {
      console.error(`❌ OpenAI API Error for ${phone}:`, apiError.response?.data?.error || apiError.message);
      throw new Error(`❌ OpenAI API call failed for ${phone}: ${apiError.message}`); // Re-throw for retry
  }


  // --- Process & Refine AI Response ---
  if (!aiResponse || aiResponse.trim().length < 5) {
    console.error(`❌ Empty or invalid response from OpenAI for ${phone}. Raw: ${aiResponse}`);
    throw new Error(`❌ Empty/Invalid response from OpenAI for ${phone}`); // Trigger retry/fallback
  }

  console.log(`✅ STRICT OpenAI response received for ${phone}`);
  let cleanResponse = aiResponse
    .replace(/Want to know more\?.*$/im, '')
    .replace(/Does this seem helpful\?.*$/im, '')
    .replace(/क्या और जानना चाहेंगे\?.*$/im, '')
    .replace(/समझ में आया\?.*$/im, '')
    .trim();

  // Ensure mandatory follow-up question exists
  const endsWithQuestion = /[?]\s*$/.test(cleanResponse);
  const responseLanguage = /[\u0900-\u097F]/.test(cleanResponse) ? 'Hindi' : 'English'; // Detect language *from response*

  if (!endsWithQuestion) {
      console.warn(`⚠️ AI response for ${phone} did NOT end with a question. Adding fallback.`);
      const fallbackQuestion = getEngagementQuestion(phone, responseLanguage);
      cleanResponse = cleanResponse.replace(/[.!?।]\s*$/, '') + '. ' + fallbackQuestion; // Append question
  } else {
       // Check if the AI's question is generic and replace if needed
       const sentences = cleanResponse.split(/[.!?।]/).filter(s => s.trim().length > 3);
       const lastSentence = sentences.pop()?.trim(); // Get last sentence
       const repetitiveQuestions = [
          "what's feeling heaviest right now?", "what are your thoughts?", "does this seem helpful?",
          "सबसे ज्यादा क्या भारी लग रहा है?", "आप क्या सोचते हैं?", "क्या यह मददगार लगा?"
        ];
        if (lastSentence && repetitiveQuestions.some(q => lastSentence.toLowerCase().includes(q))) {
           console.log(` Replacing repetitive AI question for ${phone}: "${lastSentence}"`);
           const betterQuestion = getEngagementQuestion(phone, responseLanguage);
           // Rebuild response without the last sentence/question
           const baseResponse = sentences.join('. ') + '.';
           cleanResponse = baseResponse + ' ' + betterQuestion;
       }
  }
  console.log(` Final Clean Response for ${phone}:\n${cleanResponse}`);

  // --- Send Response & Update State ---
  // Send the final, cleaned, and optimized response
  const sent = await sendCompleteResponse(phone, cleanResponse, language, "enhanced_ai_response");

  if (sent) {
      // Update history AFTER successful sending
      const finalHistory = [...history, { role: 'assistant', content: cleanResponse }];
      await updateUserState(phone, {
        chat_history: finalHistory,
        last_message: cleanResponse,
        last_message_role: 'assistant'
      });
      return { response: cleanResponse, type: "enhanced_ai_response" }; // Return success object
  } else {
       // Throw error if sending failed, so retry logic can potentially trigger fallback
       console.error(`❌ Failed to send final AI response to ${phone}.`);
       throw new Error(`❌ Failed to send final AI response to ${phone}.`);
  }
}

/* ---------------- [FIXED] Fallback Function ---------------- */
async function getContextualFallback(phone, text, language, context) {
  console.log(`🔄 Using contextual fallback for ${phone}`);
  const fallbackWisdom = ENHANCED_GITA_WISDOM['general'] || { // Ensure 'general' exists
        teachings: {
             hindi: [`🤔 गीता (2.47) कहती है कि अपने कर्म पर ध्यान केंद्रित करें, फल पर नहीं। व्यावहारिक कदम: आज एक छोटा सा काम पूरा करने पर ध्यान दें। आप किस एक छोटे कदम से शुरूआत कर सकते हैं?`],
             english: [`🤔 Gita (2.47) advises focusing on your action, not the results. Practical step: Focus on completing one small task today. What's one small step you could start with?`]
         }
  };
  const responses = language === "Hindi" ? fallbackWisdom.teachings.hindi : fallbackWisdom.teachings.english;
  const selected = responses[Math.floor(Math.random() * responses.length)];

  const sent = await sendCompleteResponse(phone, selected, language, "contextual_fallback");

  if (sent) {
      // Update history AFTER sending
      const user = await getUserState(phone);
      const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: selected }];
      await updateUserState(phone, {
          chat_history: updatedHistory,
          last_message: selected,
          last_message_role: 'assistant'
      });
       console.log(`✅ Fallback message sent and history updated for ${phone}.`);
   } else {
        console.error(`❌ Failed to send fallback message to ${phone}.`);
   }
}

/* ---------------- Menu Choice Handler ---------------- */
async function handleEnhancedMenuChoice(phone, choice, language, user) {
  console.log(`📝 Menu choice received for ${phone}: ${choice}, language: ${language}`);

  const choices = {
    "1": { /* ... */ }, "2": { /* ... */ }, "3": { /* ... */ }, "4": { /* ... */ }, "5": { /* ... */ } // Keep existing choices
  };
   // Ensure '3.' key is corrected to '3' if needed
   if (choices['3.']) { choices['3'] = choices['3.']; delete choices['3.']; }

  const selected = choices[choice];
  if (!selected) {
    console.log(`🔄 Treating as direct conversation instead of menu choice for ${phone}`);
     // --- CRITICAL STATE FIX ---
    console.log(`✅✅ User ${phone} is breaking 'menu' loop via non-menu input. Updating stage to 'chatting' BEFORE AI call.`);
    await updateUserState(phone, { conversation_stage: "chatting" });
    user.conversation_stage = "chatting"; // Update local object
    // --- END FIX ---
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
    const sent = await sendViaHeltar(phone, promptContent, `menu_${selectedLang.action}`);

    if (sent) {
        // Update history *after* sending
         const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: promptContent }];
        await updateUserState(phone, {
          conversation_stage: 'chatting', // Move to 'chatting' so next reply is handled by AI
          last_menu_choice: choice,
          // last_menu_shown: new Date().toISOString(), // No need to update shown time here
          chat_history: updatedHistory,
          last_message: promptContent,
          last_message_role: 'assistant'
        });
    } else {
         console.error(`❌ Failed to send menu choice ${choice} response to ${phone}.`);
         // Consider sending an error message
         throw new Error("Failed to send menu response");
    }

  } catch (error) {
    console.error(`❌ Menu choice error for ${phone}, choice ${choice}:`, error);
    const fallbackMessage = language === "Hindi"
      ? "क्षमा करें, तकनीकी समस्या आई है। कृपया सीधे अपनी बात लिखें।"
      : "Sorry, there was a technical issue. Please type your message directly.";
    const sentError = await sendViaHeltar(phone, fallbackMessage, "menu_error");
    // Update history for error message if sent
    if (sentError) {
        const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: fallbackMessage }];
        await updateUserState(phone, { chat_history: updatedHistory, last_message: fallbackMessage, last_message_role: 'assistant' });
    }
  }
}

/* ---------------- Daily Wisdom System ---------------- */
async function getDailyWisdom(language) { /* ... keep existing code ... */ };
function formatDailyWisdom(lesson, language, dayOfYear) { /* ... keep existing code ... */ };
function getFallbackDailyWisdom(language, dayOfYear) { /* ... keep existing code ... */ };

/* ---------------- [FIXED] LANGUAGE SWITCHING ---------------- */
async function handleLanguageSwitch(phone, newLanguage) {
    const confirmationMessage = newLanguage === 'English'
        ? "✅ Language switched to English. How can I help you today? 😊"
        : "✅ भाषा हिंदी में बदल गई। मैं आपकी कैसे मदद कर सकता हूँ? 😊";

    // Send confirmation first
    const sentConfirm = await sendViaHeltar(phone, confirmationMessage, "language_switch");

    if (sentConfirm) {
        // Update history with confirmation *before* sending menu
        const user = await getUserState(phone);
        const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: confirmationMessage }];
        await updateUserState(phone, {
            chat_history: updatedHistory,
            last_message: confirmationMessage,
            last_message_role: 'assistant'
            // Stage update happens in resetToMenuStage
        });
        // Reset to menu (sends menu and updates state/history again)
        await resetToMenuStage(phone, newLanguage);
    } else {
        console.error(`❌ Failed to send language switch confirmation to ${phone}.`);
    }
}

/* ---------------- Small Talk Handler ---------------- */
async function handleSmallTalk(phone, text, language) {
    let response;
    const lower = text.toLowerCase();
    // Simplified responses, always asking an open question to re-engage
    if (language === "Hindi") {
        if (lower.includes('thank') || lower.includes('शुक्रिया') || lower.includes('धन्यवाद')) {
            response = "आपका स्वागत है! 🙏 क्या कोई और विषय है जिस पर आप चर्चा करना चाहेंगे?";
        } else if (lower.includes('bye')) {
            response = "अलविदा! आपका दिन शुभ हो। हरे कृष्ण! 🌟"; // End conversation simply
            // Optionally set stage to menu? Or just let timeout handle it.
        } else { // For 'ok', 'yes', 'no' etc.
            response = "ठीक है। 😊 क्या आपके मन में कोई विशेष प्रश्न या चिंता है जिस पर आप बात करना चाहेंगे?";
        }
    } else {
        if (lower.includes('thank')) {
            response = "You're welcome! 🙏 Is there anything else on your mind you'd like to discuss?";
        } else if (lower.includes('bye')) {
            response = "Goodbye! Have a blessed day. Hare Krishna! 🌟";
        } else {
            response = "Okay. 😊 Do you have any specific questions or concerns you'd like to talk about?";
        }
    }
    const sent = await sendViaHeltar(phone, response, "small_talk");
    if (sent) {
        // Update history
        const user = await getUserState(phone);
        const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: response }];
        await updateUserState(phone, {
            chat_history: updatedHistory,
            last_message: response,
            last_message_role: 'assistant'
        });
    } else {
         console.error(`❌ Failed to send small talk response to ${phone}.`);
    }
}

/* ---------------- Webhook Parsing ---------------- */
function parseWebhookMessage(body) {
  // console.log("📨 Raw webhook body:", JSON.stringify(body).substring(0, 200));
  if (!body) return null;
  // Meta format (priority)
  if (body?.object === 'whatsapp_business_account') {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (message) return message; // Return the full message object
  }
  // Heltar format
  if (body?.messages?.[0]) {
    return body.messages[0];
  }
  // Simple format (for testing)
  if (body?.from && body?.text) {
    // Construct a similar structure for consistency
    return { from: body.from, text: { body: body.text }, type: 'text', timestamp: String(Date.now()).slice(0, 10) };
  }
  // console.log("❓ Unknown webhook format"); // Reduce logging
  return null;
}

/* ---------------- 🚨 MAIN WEBHOOK HANDLER (v5 - State Fix & Morning Checkin) ---------------- */
app.post("/webhook", async (req, res) => {
  // Respond immediately before processing
  res.status(200).send("OK");

  let phone; // Define phone number variable early for error handling
  try {
    const body = req.body || {};
    const msg = parseWebhookMessage(body); // Gets the full message object

    if (!msg) { return; } // Ignore non-message events silently

    phone = msg?.from || msg?.clientWaNumber; // Assign phone number
    let rawText = "";
    const messageType = msg.type;

     // Extract text based on type
     if (messageType === "text") { rawText = msg.text?.body || ""; }
     else if (messageType === "button") { rawText = msg.button?.payload || msg.button?.text || ""; } // Payload preferred
     else if (messageType === "interactive") {
         const interactive = msg.interactive;
         if (interactive?.type === 'button_reply') { rawText = interactive.button_reply?.id || interactive.button_reply?.title || ""; } // ID preferred
         else if (interactive?.type === 'list_reply') { rawText = interactive.list_reply?.id || interactive.list_reply?.title || ""; } // ID preferred
     }
     // Add handling for simple text format if needed
     else if (msg.text && typeof msg.text === 'string') { rawText = msg.text; }

    const text = String(rawText || "").trim();

    if (!phone || text.length === 0) {
      console.warn(`⚠️ Webhook missing phone or text. Phone: ${phone}, Text: "${text}"`);
      return;
    }

    console.log(`\n📩 Incoming from ${phone}: "${text}" (Type: ${messageType})`);
    await trackIncoming(phone, text); // Track incoming message first

    // --- Start Processing ---
    const user = await getUserState(phone); // Get state once

    // --- Language Determination ---
    const languageResult = await determineUserLanguage(phone, text, user);
    let language = languageResult.language; // Language to USE for response
    const isLanguageSwitch = languageResult.isSwitch; // Is it an EXPLICIT command?

    console.log(`🎯 Processing for ${phone}: Lang=${language}, Stage=${user.conversation_stage}, isSwitch=${isLanguageSwitch}`);

    // --- Handle EXPLICIT language switching FIRST ---
    if (isLanguageSwitch) {
      console.log(`🔄 Explicit language switch triggered for ${phone}: "${text}"`);
      await handleLanguageSwitch(phone, language); // Resets to menu & updates history
      return; // Stop processing
    }

    // --- Handle stage reset SECOND ---
    if (shouldResetToMenu(text, user.conversation_stage)) {
      console.log(`🔄 Stage reset triggered for ${phone}: "${text}"`);
      await resetToMenuStage(phone, language); // Sends menu & updates history
      return; // Stop processing
    }

     // --- [NEW] Handle Morning Check-in Mood Response THIRD ---
     // Check stage and if message looks like a mood word
     if (user.conversation_stage === 'awaiting_mood' && text.split(' ').length <= 2 && text.length < 20 && !/^[1-5]$/.test(text)) { // Added checks
         console.log(`☀️ Morning check-in mood received for ${phone}: "${text}"`);
         // Add user message to history *before* calling handler
         const moodHistory = [...(user.chat_history || []), { role: 'user', content: text }];
         await updateUserState(phone, { chat_history: moodHistory, last_message: text, last_message_role: 'user' });
         user.chat_history = moodHistory; // Update local copy

         await handleMorningCheckinResponse(phone, text, language, user); // Handles AI call & state/history update
         return; // Stop processing
     } else if (user.conversation_stage === 'awaiting_mood') {
         console.log(`⚠️ Expected mood word from ${phone}, but received: "${text}". Resetting stage to chatting.`);
         await updateUserState(phone, { conversation_stage: 'chatting' });
         user.conversation_stage = 'chatting';
         // Fall through to general AI handling
     }


    // --- Handle Template Buttons FOURTH ---
    if (isTemplateButtonResponse(text)) {
        console.log(`🎯 Template button detected for ${phone}: "${text}"`);
        // Add user message (button click) to history *before* calling handler
        const buttonHistory = [...(user.chat_history || []), { role: 'user', content: text }];
        await updateUserState(phone, { chat_history: buttonHistory, last_message: text, last_message_role: 'user' });
        user.chat_history = buttonHistory; // Update local copy

        const handled = await handleTemplateButtonResponse(phone, text, language, user); // Handles sending & state/history update
        if (handled) {
            console.log(`✅ Template button successfully handled for ${phone}`);
            return; // Stop processing
        } else {
             console.warn(`⚠️ Template button "${text}" detected but not handled for ${phone}. Falling through.`);
             // If not handled (e.g., send failure), still update stage to chatting maybe?
             if(user.conversation_stage !== 'chatting') {
                 await updateUserState(phone, { conversation_stage: 'chatting' });
                 user.conversation_stage = 'chatting';
             }
        }
    }

    // --- Update history BEFORE AI call for general messages ---
    // (Only add if it wasn't added above by button/mood handlers)
    const historyExists = user.chat_history.some(m => m.role === 'user' && m.content === text && Date.now() - new Date(m.timestamp || 0).getTime() < 5000); // Check recent history
    if (!historyExists) {
        const currentHistory = [...(user.chat_history || []), { role: 'user', content: text, timestamp: new Date().toISOString() }]; // Add timestamp
        await updateUserState(phone, {
            chat_history: currentHistory,
            last_message: text,
            last_message_role: 'user'
            // Keep existing stage for now
        });
        user.chat_history = currentHistory; // Update local copy
    }


    // --- Handle menu choices FIFTH ---
    if (user.conversation_stage === "menu" && /^[1-5]$/.test(text.trim())) {
        console.log(`✅ Intent: Menu Choice for ${phone}`);
        await handleEnhancedMenuChoice(phone, text.trim(), language, user); // Sends response & updates state/history
        return; // Stop processing
    }

    // --- Build context for remaining cases ---
    const conversationContext = buildConversationContext(user, text);

    // --- Handle Capabilities/Small Talk SIXTH ---
    if (isCapabilitiesQuery(text.toLowerCase())) {
        console.log(`✅ Intent: Capabilities Query for ${phone}`);
        const reply = language === "Hindi"
            ? "मैं सारथी AI हूँ, आपका निजी गीता साथी! 🙏 मैं आपको जीवन की चुनौतियों के लिए भगवद गीता का मार्गदर्शन प्रदान करता हूँ। क्या आप किस विशेष मुद्दे पर चर्चा करना चाहेंगे?"
            : "I'm Sarathi AI, your personal Gita companion! 🙏 I provide guidance from Bhagavad Gita for life's challenges. Is there a specific issue you'd like to discuss?";
        const sent = await sendViaHeltar(phone, reply, "capabilities");
        if (sent) {
            // Update history AFTER sending
             const finalHistory = [...user.chat_history, { role: 'assistant', content: reply }];
             await updateUserState(phone, { chat_history: finalHistory, last_message: reply, last_message_role: 'assistant' });
        }
        return; // Stop processing here
    }
    if (isSmallTalk(text.toLowerCase())) {
        console.log(`✅ Intent: Small Talk for ${phone}`);
        await handleSmallTalk(phone, text, language); // Sends response & updates history
        return; // Stop processing here
    }

    // --- [CRITICAL FIX for Menu Loop] Update stage if breaking menu loop SEVENTH ---
    if (user.conversation_stage === 'menu') {
        console.log(`✅✅ User ${phone} is breaking 'menu' loop with general input. Updating stage to 'chatting' BEFORE AI call.`);
        await updateUserState(phone, {
            conversation_stage: "chatting"
            // last_activity_ts updated automatically
        });
        user.conversation_stage = "chatting"; // Update local object immediately
    } else if (user.conversation_stage !== 'chatting') {
         // Ensure stage is 'chatting' if it wasn't menu or awaiting_mood (e.g., leftover from old states like 'template_followup')
          console.log(`⚙️ Ensuring stage is 'chatting' for ${phone} (was ${user.conversation_stage})`);
          await updateUserState(phone, { conversation_stage: 'chatting' });
          user.conversation_stage = 'chatting';
    }


    // --- DEFAULT: ENHANCED AI RESPONSE (The Rest) ---
    console.log(`ℹ️ Intent: General/Emotional for ${phone} -> Using Enhanced AI (Stage: ${user.conversation_stage})`);

    // getCachedAIResponse handles sending & history update
    await getCachedAIResponse(phone, text, language, conversationContext);

  } catch (err) {
    console.error(`❌❌ TOP LEVEL Webhook error for ${phone || 'unknown'}:`, err?.message || err);
     // Attempt to notify user of error
     if (phone) {
         try {
             // Avoid complex state fetching in error handler, use default lang
             const errorLang = 'English'; // Default to English for error message
             const errorMsg = errorLang === 'Hindi'
                 ? "क्षमा करें, मुझे एक आंतरिक त्रुटि का सामना करना पड़ा। कृपया थोड़ी देर बाद पुनः प्रयास करें।"
                 : "Apologies, I encountered an internal error. Please try again shortly.";
             await sendViaHeltar(phone, errorMsg, "error_fallback");
             // Add error to history? Maybe not, could confuse user later.
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
    version: "v5 - Engagement & State Fixes", // Added version
    features: [
      "✅ [FIXED] Critical Menu Loop State Bug",
      "✅ [FIXED] Implicit/Explicit Language Handling",
      "✅ [FIXED] Romanized Hindi Detection Order",
      "✅ [FIXED] AI Language Bleed-over",
      "✅ [FIXED] AI Monotony (Conditional Prompt v5)",
      "✅ [FIXED] 'undefined' Fallback Question",
      "✅ [FIXED] 'Want to know more?' Loop Removed",
      "✨ [NEW] Morning Check-in Flow ('Hare Krishna!' button & mood handling)",
      "✨ [NEW] Pessimistic Start & Convincing Follow-up Strategy (Refined)",
      "✨ [NEW] 'अभ्यास' Button Handling",
      "Daily Wisdom System",
      "Response Caching",
      "Connection Pooling",
      "Template Button Handling (Refined)",
      "Menu System",
      "AI Fallbacks (Gita Wisdom DB)",
      "WhatsApp Message Optimization"
    ],
    templateButtons: Object.keys(OPTIMIZED_TEMPLATE_RESPONSES),
    cacheSize: responseCache.size,
    databasePoolStats: {
        totalCount: dbPool.totalCount,
        idleCount: dbPool.idleCount,
        waitingCount: dbPool.waitingCount,
    },
    message_length_limit: MAX_REPLY_LENGTH
  });
});

/* ---------------- Stage Timeout Management ---------------- */
async function cleanupStuckStages() {
  let client;
  try {
    client = await dbPool.connect();
    const result = await client.query(`
      UPDATE users
      SET conversation_stage = 'menu',
          pending_followup = NULL,
          followup_type = NULL
      WHERE last_activity_ts < NOW() - INTERVAL '2 hour' -- Increased timeout to 2 hours
      AND conversation_stage NOT IN ('menu', 'subscribed') -- Don't reset subscribed users
    `);

    if (result.rowCount > 0) {
      console.log(`🔄 Cleaned up ${result.rowCount} stuck user stages older than 2 hours`);
    }
  } catch (err) {
    console.error("Stage cleanup error:", err);
  } finally {
      if(client) client.release();
  }
}
setInterval(cleanupStuckStages, 60 * 60 * 1000); // Run cleanup every hour

/* ---------------- Start server ---------------- */
app.listen(PORT, async () => { // Make async to await setup
  validateEnvVariables();
  console.log(`\n🚀 ${BOT_NAME} COMPLETE REVIVED v5 listening on port ${PORT}`);
  console.log("⏳ Initializing database connection and setup...");
  try {
      await setupDatabase(); // Wait for DB setup before fully ready
      console.log("✅ Database setup finished. Bot is ready.");
      console.log("✨ Morning Check-in flow integrated.");
      console.log("🔧 State Management & Engagement Fixes Applied.");
  } catch (dbErr) {
      console.error("❌ CRITICAL: Database setup failed on startup. Exiting.", dbErr);
      process.exit(1); // Exit if DB setup fails
  }
});

/* ---------------- Graceful Shutdown ---------------- */
async function gracefulShutdown(signal) {
    console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
    // Add server closing if needed: server.close(() => { ... });
    try {
        await dbPool.end();
        console.log('Database pool closed.');
        process.exit(0);
    } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
    }
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

