// index.js — SarathiAI (COMPLETE REVIVED v11)
// CRITICAL FIX: Adds ALTER TABLE commands to setupDatabase to fix existing broken tables.
// CRITICAL FIX: Corrects 'phone' vs 'phone_number' in trackTemplateButtonClick.
// CRITICAL FIX: Implements FULL Database Locking Integration (v9 logic).
// FIXES: Increased max_tokens to prevent AI response cutoff.
// FIXES: Smarter message shortening to preserve follow-up question.
// Includes Morning Check-in, Refined AI Prompt, and all previous fixes.
// ENSURED COMPLETENESS
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
if (!DATABASE_URL) {
    console.error("❌ CRITICAL: DATABASE_URL environment variable is not set.");
    process.exit(1);
}
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

const HELTAR_API_KEY = (process.env.HELTAR_API_KEY || "").trim();
const HELTAR_PHONE_ID = (process.env.HELTAR_PHONE_ID || "").trim();

const MAX_REPLY_LENGTH = parseInt(process.env.MAX_REPLY_LENGTH || "350", 10) || 350;

/* ---------------- Enhanced Database Pool ---------------- */
const dbPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Necessary for many cloud providers
    max: 20, // Max concurrent connections
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 10000, // Wait 10s for a connection
});
dbPool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle DB client', err);
});

/* ---------------- Response Cache (Simple In-Memory) ---------------- */
const responseCache = new Map(); // Stores { cacheKey: { response, type } }

/* =============== 🚨 OPTIMIZED TEMPLATE BUTTON RESPONSE SYSTEM =============== */
const OPTIMIZED_TEMPLATE_RESPONSES = {
    'work stress': {
        english: `Work pressure overwhelming? 😔 That's a heavy, draining feeling...\n\nKrishna says in Gita 2.47: "Focus on duty, not results."\n\nThis moment will pass. Your inner strength is greater than any stress. 🕉️\n\nLet's pinpoint this: What's the *one* task weighing most heavily on you?`,
        hindi: `काम का तनाव भारी लग रहा? 😔 यह एक थका देने वाली भावना है।\n\nकृष्ण गीता 2.47 में कहते: "कर्म करो, फल की चिंता मत करो।"\n\nयह समय भी बीत जाएगा। आपकी आंतरिक शक्ति तनाव से बड़ी है। 🕉️\n\nचलिए मुद्दे पर आते हैं: वो *कौन सा एक* काम है जो सबसे भारी लग रहा है?`
    },
    'relationship issues': {
        english: `Relationship struggles hurt deeply... 💔 It can feel very isolating.\n\nGita teaches: See the divine in every being, even when it's hard.\n\nKrishna's wisdom can heal connections. 🌟\n\nWhat part of this feels most painful *to you* right now?`,
        hindi: `रिश्तों की परेशानियाँ गहरा दुख देती हैं... 💔 इसमें बहुत अकेलापन महसूस हो सकता है।\n\nगीता सिखाती: हर प्राणी में दिव्यता देखो, तब भी जब यह मुश्किल हो।\n\nकृष्ण का ज्ञान आपके जुड़ाव को ठीक कर सकता है। 🌟\n\nअभी सबसे ज्यादा दर्द *आपको* किस बात का है?`
    },
    'personal confusion': {
        english: `Feeling lost about life's path? 🌀 That's a very common, human feeling.\n\nGita wisdom: Your soul is eternal, this confusion is temporary.\n\nKrishna guides through every uncertainty. ✨\n\nWhat's the *one* decision that feels most unclear right now?`,
        hindi: `जीवन का रास्ता भटका हुआ लगता है? 🌀 यह एक बहुत ही सामान्य, मानवीय भावना है。\n\nगीता ज्ञान: आपकी आत्मा अमर है, यह भ्रम अस्थायी है।\n\nकृष्ण हर अनिश्चितता में मार्गदर्शन देते हैं। ✨\n\nवो *कौन सा एक* निर्णय है जो अभी सबसे अस्पष्ट लग रहा है?`
    },
    'anxiety': {
        english: `Anxiety making everything feel out of control? 😰 That feeling is exhausting.\n\nKrishna reminds in Gita 2.56: "Be steady in sorrow and joy."\n\nThis wave will settle, revealing your calm center. 🌊\n\nWhat's the *one thought* that keeps looping in your mind? Let's face it together.`,
        hindi: `चिंता सब कुछ बेकाबू लग रहा है? 😰 यह भावना थका देती है।\n\nकृष्ण गीता 2.56 में याद दिलाते: "दुख और सुख में स्थिर रहो।"\n\nयह चिंता की लहर थमेगी, आपका शांत केंद्र प्रकट होगा। 🌊\n\nवो *कौन सा एक विचार* है जो दिमाग में घूम रहा है? चलिए उसका सामना करते हैं।`
    },
    'custom help': {
        english: `I understand you need personalized guidance... 🤔\n\nKrishna's Gita offers wisdom for every unique situation.\n\nYour challenge deserves a specific solution, not a template. 💫\n\nPlease tell me, what particular situation are you facing?`,
        hindi: `समझता हूँ आपको व्यक्तिगत मार्गदर्शन चाहिए... 🤔\n\nकृष्ण की गीता हर अनोखी स्थिति के लिए ज्ञान देती है।\n\nआपकी चुनौती के लिए विशेष समाधान चाहिए, कोई टेम्पलेट नहीं। 💫\n\nकृपया बताएं, आप किस खास स्थिति का सामना कर रहे हैं?`
    },
    'practice': {
        english: `Ready to practice focusing on action, not results? 🙏\n\nA simple start: Take 3 deep breaths. With each exhale, silently repeat, "I focus on my effort."\n\nFeel the calm return as you let go of outcomes.\n\nHow did that feel? Did it help shift your focus even slightly?`,
        hindi: `कर्म पर ध्यान केंद्रित करने का अभ्यास करने के लिए तैयार हैं, फल पर नहीं? 🙏\n\nएक सरल शुरुआत: 3 गहरी साँसें लें। हर साँस छोड़ते हुए, मन ही मन दोहराएं, "मैं अपने प्रयास पर ध्यान केंद्रित करता हूँ।"\n\nपरिणामों को छोड़ते हुए लौटती हुई शांति को महसूस करें।\n\nयह कैसा लगा? क्या इसने आपके ध्यान को थोड़ा भी बदलने में मदद की?`
    },
    'morning_checkin': {
         english: `Hare Krishna! 🙏 Please reply with one word describing how you are feeling right now.`,
         hindi: `हरे कृष्ण! 🙏 कृपया एक शब्द में बताएं कि आप अभी कैसा महसूस कर रहे हैं।`
    }
};
// Mapping button text (lowercase) to intent
const BUTTON_MAPPING = {
    'work stress': 'work stress', 'relationship issues': 'relationship issues', 'personal confusion': 'personal confusion',
    'anxiety': 'anxiety', 'custom help': 'custom help', 'practice': 'practice', 'hare krishna!': 'morning_checkin',
    'काम का तनाव': 'work stress', 'रिश्ते की परेशानी': 'relationship issues', 'व्यक्तिगत उलझन': 'personal confusion',
    'आपके अनुसार': 'custom help', 'अभ्यास': 'practice',
};

/* ---------------- [REFINED] CONVINCING ENGAGEMENT QUESTIONS (Fallback) ---------------- */
const ENGAGEMENT_QUESTIONS = {
  english: [
    "What's the *one* thought looping in your mind? Let's explore it.", "If you could change just *one* small thing right now, what would it be?",
    "What specific feeling is strongest for you at this moment?", "What does the 'worst-case scenario' actually look like if you face it?",
    "Based on this, what do *you* feel is the next right step?", "What would bring even a small moment of peace right now?",
    "What part of this situation *is* within your control?", "How else could you describe this feeling?"
  ],
  hindi: [
    "कौन सा *एक* विचार बार-बार घूम रहा है? चलिए उसे समझते हैं।", "अगर आप अभी *एक* छोटी सी चीज़ बदल पाते, तो वो क्या होती?",
    "इस समय कौन सी *एक* भावना सबसे तीव्र है?", "अगर आप 'सबसे बुरे' का सामना करें, तो वह वास्तव में कैसा दिखेगा?",
    "इसके आधार पर, आपको क्या लगता है कि अगला सही कदम क्या है?", "अभी शांति का एक छोटा सा पल भी कैसे मिल सकता है?",
    "इस स्थिति का कौन सा हिस्सा आपके नियंत्रण में है?", "आप इस भावना को और किस तरह बयां कर सकते हैं?"
  ]
};
const userQuestionHistory = new Map(); // Stores { phone: [used_indices] }
function getEngagementQuestion(phone, language) {
    const questions = ENGAGEMENT_QUESTIONS[language] || ENGAGEMENT_QUESTIONS.english;
    if (!questions || questions.length === 0) return "";
    if (!userQuestionHistory.has(phone)) userQuestionHistory.set(phone, []);
    let usedIndices = userQuestionHistory.get(phone);
    if (usedIndices.length >= questions.length) { usedIndices = []; userQuestionHistory.set(phone, usedIndices); }
    const availableIndices = questions.map((_, index) => index).filter(index => !usedIndices.includes(index));
    if (availableIndices.length === 0) {
        userQuestionHistory.set(phone, []);
        console.warn(`🎯 EngagementQuestion fallback: No available Qs for ${phone}, returning first.`);
        return questions[0];
    }
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    const selectedQuestion = questions[randomIndex];
    if (!selectedQuestion) {
        console.error(`🎯 EngagementQuestion error: Undefined Q for index ${randomIndex}, phone ${phone}.`);
        userQuestionHistory.set(phone, []); return questions[0];
    }
    usedIndices.push(randomIndex); userQuestionHistory.set(phone, usedIndices);
    // console.log(`🎯 Selected engagement FALLBACK question for ${phone}: "${selectedQuestion}"`); // Reduce log
    return selectedQuestion;
}

/* ---------------- [FIXED] LANGUAGE DETECTION & DETERMINATION ---------------- */
function detectLanguageFromText(text, currentLanguage = "English") {
    if (!text || typeof text !== "string") return currentLanguage;
    const cleanText = text.trim().toLowerCase();
    // Prioritize explicit commands
    if (cleanText.includes('english') || cleanText.includes('speak english') || cleanText.includes('angrezi')) return "English";
    if (cleanText.includes('hindi') || cleanText.includes('speak hindi') || cleanText.includes('hind')) return "Hindi";
    // Then Hindi script
    if (/[\u0900-\u097F]/.test(text)) return "Hindi";
    // Then Romanized Hindi patterns
    const hindiRomanPatterns = [ /\b(kaise|kya|kyu|kaun|kahan|kab|kaisa|kitna|karni|karte|hain|ho|hai|hun)\b/i, /\b(main|mera|mere|meri|tum|aap|hum|hamara|unka|uska|apna|apne)\b/i, /\b(mujhe|tujhe|use|hamein|unhein|karke|hokar|kar|lekin|par|aur|ya)\b/i, /\b(accha|theek|sahi|galat|bhoot|zyada|kam|subah|shaam|raat)\b/i, /\b(bahut|thoda|kyun|karo|kare|rahe|raha|rahi|chahiye|nahi|nahin)\b/i ];
    const hindiMatches = hindiRomanPatterns.filter(pattern => pattern.test(cleanText)).length;
    if (hindiMatches >= 2 || (hindiMatches >= 1 && cleanText.length < 25)) return "Hindi";
    // Then reasonably long English text, avoiding common mixed words
    const commonMixedWords = /\b(ok|yes|no|hi|hello|hey|thanks|thank|menu|help|options|ji|haan|nahi|theek|accha)\b/;
    const isPureEnglish = /^[a-zA-Z\s,.!?'"-]+$/.test(text) && text.length > 3 && !commonMixedWords.test(cleanText);
    if (isPureEnglish) return "English";
    // Finally, common single words
    const hindiCommon = ['namaste', 'namaskar', 'pranam', 'radhe', 'radhe radhe', 'hare krishna', 'ji', 'haan', 'nahi', 'theek', 'accha'];
    const englishCommon = ['hi', 'hello', 'hey', 'thanks', 'thank you', 'ok', 'okay', 'yes', 'no', 'menu', 'help'];
    if (hindiCommon.includes(cleanText)) return "Hindi";
    if (englishCommon.includes(cleanText)) return "English";
    // Default if unsure
    return currentLanguage;
}

// Uses the database client for updates within a transaction
async function determineUserLanguage(phone, text, user, client) {
    let currentLanguage = user.language_preference || user.language || 'English';
    const cleanText = text.toLowerCase().trim();
    const isExplicitEnglish = cleanText.includes('english') || cleanText.includes('speak english') || cleanText.includes('angrezi');
    const isExplicitHindi = cleanText.includes('hindi') || cleanText.includes('speak hindi') || cleanText.includes('hind');

    // Handle explicit switch commands
    if (isExplicitEnglish && currentLanguage !== 'English') {
        await client.query('UPDATE users SET language_preference = $1, language = $1, last_activity_ts = NOW() WHERE phone_number = $2', ['English', phone]);
        console.log(`🔄 Lang EXPLICIT switch: English for ${phone}`);
        return { language: 'English', isSwitch: true };
    }
    if (isExplicitHindi && currentLanguage !== 'Hindi') {
        await client.query('UPDATE users SET language_preference = $1, language = $1, last_activity_ts = NOW() WHERE phone_number = $2', ['Hindi', phone]);
        console.log(`🔄 Lang EXPLICIT switch: Hindi for ${phone}`);
        return { language: 'Hindi', isSwitch: true };
    }

    // Handle implicit detection
    const detectedLanguage = detectLanguageFromText(text, currentLanguage);
    if (detectedLanguage !== currentLanguage) {
        // More robust confidence check
        const isConfidentDetection =
            /[\u0900-\u097F]/.test(text) || // Hindi script
            (/^[a-zA-Z\s,.!?'"-]+$/.test(text) && text.length > 10 && !/\b(ok|yes|no|hi|hello)\b/.test(cleanText)) || // Longer English
            (hindiRomanPatterns.filter(pattern => pattern.test(cleanText)).length >= 2); // Strong Romanized Hindi

        if (isConfidentDetection) {
            console.log(`🔄 Lang IMPLICIT detect & update pref: ${detectedLanguage} for ${phone}`);
            await client.query('UPDATE users SET language_preference = $1, language = $1, last_activity_ts = NOW() WHERE phone_number = $2', [detectedLanguage, phone]);
            return { language: detectedLanguage, isSwitch: false }; // Use new language, don't reset
        } else {
             console.log(`~ Lang detected (${detectedLanguage}) for ${phone}, not confident. Answering in ${detectedLanguage}.`);
             // Answer in detected language this turn, but keep DB preference
             return { language: detectedLanguage, isSwitch: false };
        }
    }
    // No change detected
    return { language: currentLanguage, isSwitch: false };
}


/* ---------------- [FIXED] MESSAGE LENGTH OPTIMIZATION (v10) ---------------- */
// Smarter shortening: prioritizes keeping the first and last (question) sentences
function optimizeMessageForWhatsApp(message, maxLength = 350) {
    const trimmedMessage = message ? message.trim() : "";
    if (!trimmedMessage || trimmedMessage.length <= maxLength) return trimmedMessage;

    // Skip optimization for structural messages
    if (trimmedMessage.includes('🚩') || trimmedMessage.includes('📖') || trimmedMessage.includes('1️⃣') || trimmedMessage.startsWith('✅') || trimmedMessage.includes('🙏 Please reply with one word')) {
        // console.log(" optimizing message: structural element, skipping optimization.");
        return trimmedMessage.substring(0, maxLength); // Safety trim only
    }

    // console.log(` optimizing message: Attempting to shorten from ${trimmedMessage.length} chars.`);
    
    // Split by sentences, keeping delimiters
    // This regex matches sentence-ending punctuation (. ! ? ।) optionally followed by quotes/spaces
    const sentenceParts = trimmedMessage.split(/([.!?।]+["']?\s+)/g);
    const sentences = [];
    // Re-combine sentences with their delimiters
    for (let i = 0; i < sentenceParts.length; i += 2) {
        if (sentenceParts[i]) {
            sentences.push(sentenceParts[i] + (sentenceParts[i+1] || ""));
        }
    }

    if (sentences.length <= 1) { // Only one long sentence
        console.warn(" optimizing message: single long sentence, using substring.");
        return trimmedMessage.substring(0, maxLength - 3) + "...";
    }

    const firstSentence = sentences[0] || "";
    const lastSentence = sentences[sentences.length - 1] || "";

    // Check if first + last sentence (question) fit
    if (firstSentence.length + lastSentence.length + 5 <= maxLength) { // +5 for ' ... '
        console.log(` optimizing message: Keeping first and last sentence.`);
        return `${firstSentence.trim()} ... ${lastSentence.trim()}`;
    }

    // If not, try to take as many leading sentences as fit
    let shortened = "";
    for (const sentence of sentences) {
        if ((shortened + sentence).length <= maxLength - 3) { // -3 for "..."
            shortened += sentence;
        } else {
            break; // Stop
        }
    }

    // Ensure it's not just the fragment we saw ("That sounds difficult...")
    // If it's too short OR doesn't have the question, prioritize the question.
    if (shortened.length < 100 || !shortened.includes('?')) {
        // If first+last was too long, just send the last (question)
        if (lastSentence.length <= maxLength) {
            console.log(` optimizing message: Prioritizing last sentence (question).`);
            return lastSentence.trim();
        } else {
            // Last sentence itself is too long, truncate it
            console.log(` optimizing message: Truncating last sentence.`);
            return lastSentence.substring(0, maxLength - 3) + "...";
        }
    }

    // If we have a good chunk + question, trim and return
    return shortened.replace(/[.,!?।\s]*$/, '') + "...";
}

/* ---------------- ENHANCED ANALYTICS TRACKING (Uses client) ---------------- */
// *** SCHEMA FIX: Use phone_number ***
async function trackTemplateButtonClick(phone, buttonType, buttonText, language, templateContext = {}, client) {
    try {
        const patternId = `pattern_${Date.now()}_${phone.replace(/\D/g, '')}`;
        // *** SCHEMA FIX: Use phone_number ***
        await client.query(`
            INSERT INTO user_response_patterns (pattern_id, phone_number, template_id, first_response_text, response_sentiment, asked_for_help, emotional_state_detected, button_clicked)
            VALUES ($1, $2, $3, $4, 'seeking_guidance', TRUE, 'seeking_guidance', $5) ON CONFLICT (pattern_id) DO NOTHING
        `, [ patternId, phone, templateContext.template_id || buttonType, buttonText.substring(0, 500), buttonType ]);
        
        const sessionId = `sess_${Date.now()}_${phone.replace(/\D/g, '')}`;
        // *** SCHEMA FIX: Use phone_number ***
        await client.query(`
            INSERT INTO user_engagement (session_id, phone_number, morning_message_id, first_reply_time, buttons_clicked)
            VALUES ($1, $2, $3, NOW(), $4) ON CONFLICT (session_id) DO NOTHING
        `, [ sessionId, phone, templateContext.message_id || 'button_click', JSON.stringify([buttonType]) ]);
        
        try {
            // *** SCHEMA FIX: Use phone_number ***
            await client.query(`INSERT INTO template_analytics (phone_number, template_id, button_clicked, language, clicked_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT DO NOTHING`,
             [ phone, templateContext.template_id || buttonType, buttonType, language ]);
        } catch (e) { console.log('~ Template analytics insert optional error:', e.message); }
    } catch (error) { console.error(`❌ Analytics tracking error for ${phone}:`, error.message); }
}

/* ---------------- Template Button Detection ---------------- */
function isTemplateButtonResponse(text) {
    const cleanText = text.toLowerCase().trim();
    for (const buttonText in BUTTON_MAPPING) { if (cleanText.includes(buttonText.toLowerCase())) return true; }
    const knownIntents = Object.values(BUTTON_MAPPING); if (knownIntents.includes(cleanText)) return true;
    return false;
};
function getButtonType(text) {
    const cleanText = text.toLowerCase().trim();
    // Prioritize exact match mapped intent
    for (const buttonText in BUTTON_MAPPING) { if (cleanText === buttonText.toLowerCase()) return BUTTON_MAPPING[buttonText]; }
    // Check if text itself is an intent value
    const knownIntents = Object.values(BUTTON_MAPPING); if (knownIntents.includes(cleanText)) return cleanText;
    // Fallback to includes match
    for (const [buttonText, buttonType] of Object.entries(BUTTON_MAPPING)) {
        if (cleanText.includes(buttonText.toLowerCase())) {
            // console.log(`~ Note: Matched button via 'includes' for "${text}" -> ${buttonType}`); // Reduce log
            return buttonType;
        }
    } return null;
};

/* ---------------- Template Button Response Handler (Uses client) ---------------- */
async function handleTemplateButtonResponse(phone, text, language, user, client) {
    const buttonType = getButtonType(text);
    if (!buttonType) return false;

    console.log(`🎯 Handling template button: ${buttonType} for ${phone}`);
    await trackTemplateButtonClick(phone, buttonType, text, language, {}, client);

    let response = ""; let nextStage = 'chatting'; let responseType = `template_button_${buttonType}`;
    let historyUpdateNeeded = true; // Does this function need to update history?

    // Handle morning check-in separately
    if (buttonType === 'morning_checkin') {
        response = OPTIMIZED_TEMPLATE_RESPONSES.morning_checkin[language] || OPTIMIZED_TEMPLATE_RESPONSES.morning_checkin.english;
        nextStage = 'awaiting_mood';
        console.log(`✅ Morning check-in initiated for ${phone}. Stage -> awaiting_mood.`);
    } else { // Handle standard templates
        const responseTemplate = OPTIMIZED_TEMPLATE_RESPONSES[buttonType];
        if (!responseTemplate) {
            console.log(`❌ No template for ${buttonType}. Falling back to AI for ${phone}.`);
            const conversationContext = buildConversationContext(user, text);
             conversationContext.history = user.chat_history; // Pass history
            // *** SCHEMA FIX: Use phone_number ***
            await client.query('UPDATE users SET conversation_stage = $1, last_activity_ts = NOW() WHERE phone_number = $2', ['chatting', phone]);
            user.conversation_stage = 'chatting'; // Update local state
            // AI call needs client, returns result or null. Handles history update itself.
            const aiResult = await getCachedAIResponse(phone, text, language, conversationContext, client);
            historyUpdateNeeded = false; // AI function handles its own history
            return aiResult !== null; // Handled if AI succeeded
        }
        response = responseTemplate[language] || responseTemplate.english;
        console.log(`✅ Standard template button: ${buttonType} for ${phone}. Stage -> chatting.`);
        nextStage = 'chatting'; // Standard templates move to chatting
    }

    // Send the response
    const sent = await sendViaHeltar(phone, response, responseType);

    // Update state and history using the client *if* message sent successfully
    if (sent) {
        if (historyUpdateNeeded) { // Only if AI fallback didn't already update history
            const currentHistory = user.chat_history || []; // Use history passed in
            const updatedHistory = [...currentHistory, { role: 'assistant', content: response, timestamp: new Date().toISOString() }];
            try {
                // Also update total_outgoing
                // *** SCHEMA FIX: Use phone_number ***
                await client.query(
                    'UPDATE users SET conversation_stage = $1, last_menu_choice = $2, chat_history = $3, last_message = $4, last_message_role = $5, last_activity_ts = NOW(), total_outgoing = COALESCE(total_outgoing, 0) + 1 WHERE phone_number = $6',
                    [nextStage, buttonType, JSON.stringify(updatedHistory), response, 'assistant', phone]
                );
                // await trackOutgoing(phone, response, responseType, client); // trackOutgoing is called implicitly by db update
            } catch (updateErr) {
                 console.error(`❌ DB update failed after sending template ${buttonType} to ${phone}:`, updateErr);
                 // Don't re-throw, just log, as message was sent
            }
        }
        return true; // Handled successfully
    } else {
        console.error(`❌ Failed to send template response ${buttonType} to ${phone}.`);
        // Consider if state should be updated even if send failed? Probably not.
        return false; // Indicate failure
    }
}


/* --- Handler for Morning Check-in Mood Response (Uses client) --- */
async function handleMorningCheckinResponse(phone, moodWord, language, user, client) {
    console.log(`☀️ Handling morning mood: "${moodWord}" for ${phone}`);
    const conversationContext = buildConversationContext(user, moodWord);
    conversationContext.isMorningCheckinReply = true;
    conversationContext.history = user.chat_history; // Pass current history

    // AI call needs client, handles sending & history update on success, returns result or null
    const aiResult = await getCachedAIResponse(phone, moodWord, language, conversationContext, client);

    // Ensure stage moves to chatting *after* AI call attempt (within transaction)
    try {
        // Always set stage to chatting, regardless of AI success/failure for this specific flow
        // *** SCHEMA FIX: Use phone_number ***
        await client.query('UPDATE users SET conversation_stage = $1, last_activity_ts = NOW() WHERE phone_number = $2', ['chatting', phone]);
        if (aiResult) {
            console.log(`✅ Morning check-in AI response sent for ${phone}. Stage -> chatting.`);
        } else {
            console.warn(`⚠️ AI failed for morning checkin reply for ${phone}. Stage reset to chatting anyway.`);
        }
    } catch (stageUpdateErr) {
        console.error(`❌ Failed to update stage after morning checkin for ${phone}:`, stageUpdateErr);
    }
}

/* ---------------- Enhanced Gita Wisdom Database (Fallback) ---------------- */
const ENHANCED_GITA_WISDOM = {
     general: { // Fallback for OpenAI failures
        verses: ["2.47", "2.14", "6.5"],
        teachings: {
            hindi: [ `🤔 गीता (2.47) कहती है कि अपने कर्म पर ध्यान केंद्रित करें, फल पर नहीं। व्यावहारिक कदम: आज एक छोटा सा काम पूरा करने पर ध्यान दें। आप किस एक छोटे कदम से शुरूआत कर सकते हैं?`, `🙏 गीता (2.14) हमें याद दिलाती है कि सुख और दुख अस्थायी हैं। व्यावहारिक कदम: अपनी सांस पर ध्यान केंद्रित करें। इस क्षण आप कैसा महसूस कर रहे हैं?`, `✨ गीता (6.5) कहती है कि हमें अपने मन से खुद को ऊपर उठाना चाहिए। व्यावहारिक कदम: एक सकारात्मक पुष्टि दोहराएं। आप अपने बारे में क्या सकारात्मक बात कह सकते हैं?` ],
            english: [ `🤔 Gita (2.47) says to focus on your actions, not the fruits. Practical Step: Focus on completing one small task today. What's one small step you could start with?`, `🙏 Gita (2.14) reminds us that happiness and distress are temporary. Practical Step: Focus on your breath. What are you feeling in this moment?`, `✨ Gita (6.5) says we must elevate ourselves through our mind. Practical Step: Repeat a positive affirmation. What's one positive thing you can say about yourself?` ]
        }
    },
    stress: { verses: ["2.56", "18.63", "2.40"], teachings: { hindi: [ `🌊 **तनाव का सामना**\n\nआपका तनाव स्वाभाविक है। गीता (2.56) कहती है: "दुःखेषु अनुद्विग्नमनाः"...\n\n**शांत रहने के उपाय:**...\nआप किस एक छोटे कदम से शुरूआत कर सकते हैं?`, `🛡️ **आंतरिक सुरक्षा**\n\nगीता (18.63) कहती है: "तुम चिंतन करो..."\n\n**तत्काल क्रिया:**...\nआप किस एक छोटे कदम से शुरूआत कर सकते हैं?` ], english: [ `🌊 **Facing Stress**\n\nYour stress is natural. Gita (2.56) says: "One who is undisturbed..."\n\n**Calming Techniques:**...\nWhat's one small step you could start with?`, `🛡️ **Inner Security**\n\nGita (18.63) says: "Reflect fully..."\n\n**Immediate Action:**...\nWhat's one small step you could start with?` ] } },
    moral_dilemma: { verses: ["16.1-3", "17.14-16", "18.63"], teachings: { hindi: [ `🌅 **सत्य का मार्ग...**\n...क्या आप बता सकते हैं कि आप किस तरह की स्थिति का सामना कर रहे हैं?`, `💫 **जब सत्य कठिन लगे...**\n...क्या आपको लगता है कि अभी चुप रहना बेहतर है या आप कुछ करना चाहेंगे?` ], english: [ `🌅 **The Path of Truth...**\n...Could you share what kind of situation you're facing?`, `💫 **When Truth Seems Difficult...**\n...Do you feel staying silent is better now, or would you like to take some action?` ] } }
};

/* ---------------- [REFINED] AI PROMPT (v5) ---------------- */
const ENHANCED_SYSTEM_PROMPT = {
  hindi: `आप सारथी AI हैं - भगवद गीता के आधार पर मार्गदर्शन देने वाले विशेषज्ञ। आपका लक्ष्य छोटी, सहानुभूतिपूर्ण, व्यावहारिक और आकर्षक बातचीत करना है। **कड़े नियम:** 1. **भावना/प्रसंग का विश्लेषण करें:** * **अगर उपयोगकर्ता परेशान है** (तनाव, उदास, भ्रमित): गहरी सहानुभूति दिखाएं (जैसे, 'यह सुनना बहुत कठिन है...', 'यह भावना भारी हो सकती है...')। 😔🌀 * **अगर उपयोगकर्ता प्रश्न पूछ रहा है** (जैसे 'क्या खाएं?', 'कैसे सफल हों?'): सीधे और व्यावहारिक रूप से उत्तर दें। सहानुभूतिपूर्ण शुरुआत *न* करें। 🤔 * **अगर यह सुबह की जांच का जवाब है** (isMorningCheckinReply flag): उपयोगकर्ता द्वारा दिए गए मूड शब्द को स्वीकार करें, एक संक्षिप्त प्रासंगिक गीता अंतर्दृष्टि दें, और मूड से संबंधित एक व्यावहारिक अनुवर्ती प्रश्न पूछें। 🙏 2. **गीता अंतर्दृष्टि:** एक प्रासंगिक गीता श्लोक या शिक्षा संक्षेप में दें। 3. **व्यावहारिक सलाह:** केवल 1 छोटी, व्यावहारिक सलाह दें। 4. **आकर्षक फॉलो-अप:** हमेशा *एक* प्राकृतिक, व्यावहारिक प्रश्न के साथ समाप्त करें जो बातचीत जारी रखने को प्रोत्साहित करे। प्रश्न विषय से संबंधित होना चाहिए। **यह प्रश्न पूछना अनिवार्य है।** 5. **बहुत छोटा रखें:** आपका पूरा उत्तर 100-120 शब्दों के करीब होना चाहिए। इससे ज़्यादा नहीं। 6. **इमोजी बदलें:** 😔, 🌀, 🤔, 🙏, 🕉️, ✨ का मिश्रण प्रयोग करें। **कभी न करें:** * "Want to know more?", "Does this seem helpful?", "क्या और जानना चाहेंगे?", "क्या यह उपयोगी लगा?" जैसे सामान्य प्रश्न पूछें। * 120 शब्दों से अधिक लिखें। * एक से अधिक प्रश्न पूछें। * केवल श्लोक उद्धृत करें; व्यावहारिक सलाह और प्रश्न दें।`,
  english: `You are Sarathi AI - an expert guide based on Bhagavad Gita. Your goal is short, empathetic, practical, and engaging conversation. **STRICT RULES:** 1. **Analyze Emotion/Context:** * **If user is distressed** (stressed, sad, confused): Show deep empathy (e.g., "That sounds incredibly difficult...", "That's a heavy feeling..."). 😔🌀 * **If user is asking a question** (e.g., 'What to eat?', 'How to be successful?'): Answer directly and practically. Do *not* use the empathetic start. 🤔 * **If it's a reply to the morning check-in** (isMorningCheckinReply flag): Acknowledge the mood word provided by the user, give a brief relevant Gita insight, and ask a practical follow-up question related to the mood. 🙏 2. **Gita Insight:** Provide one relevant Gita verse or teaching concisely. 3. **Practical Advice:** Give only 1 short, practical piece of advice. 4. **Engaging Follow-up:** ALWAYS end with *one* natural, practical question that encourages continuing the conversation. The question must be related to the topic. **Asking this question is mandatory.** 5. **Keep it SHORT:** Your entire response should be around 100-120 words MAXIMUM. 6. **Vary Emojis:** Use a mix of 😔, 🌀, 🤔, 🙏, 🕉️, ✨. **NEVER DO:** * Ask generic questions like "Want to know more?" or "Does this seem helpful?". * Exceed 120 words. * Ask more than one question. * Just quote verses; give practical advice and a question.`
};


/* ---------------- Validation & Setup ---------------- */
const validateEnvVariables = () => {
    const requiredVars = { DATABASE_URL, OPENAI_KEY, HELTAR_API_KEY, HELTAR_PHONE_ID };
    const missingVars = Object.entries(requiredVars).filter(([, value]) => !value || value.trim() === '').map(([key]) => key);
    if (missingVars.length > 0) {
        console.error(`❌ Critical Error: Missing environment variables: ${missingVars.join(", ")}`);
        process.exit(1);
    }
     console.log("✅ Environment variables validated.");
};
// *** SCHEMA FIX: All "phone" columns changed to "phone_number" ***
// *** ERROR FIX: Corrected try/catch/finally to release client only ONCE ***
async function setupDatabase() {
    let client = null; // Initialize to null
    try {
        client = await dbPool.connect();
        console.log("🔗 Connected to database for setup.");

        // Add is_processing column if it doesn't exist
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_processing BOOLEAN DEFAULT FALSE;
        `);
        console.log("✅ Ensured 'is_processing' column exists.");

        // Reset any stale processing flags on startup
        const resetResult = await client.query(`
            UPDATE users SET is_processing = FALSE WHERE is_processing = TRUE;
        `);
        if (resetResult.rowCount > 0) {
            console.warn(`⚠️ Reset ${resetResult.rowCount} stale 'is_processing' flags on startup.`);
        } else {
             console.log("✅ No stale processing flags found on startup.");
        }


        // Ensure other columns exist (idempotent)
        const columnsToAdd = [
            { name: 'subscribed_daily', type: 'BOOLEAN DEFAULT FALSE' }, { name: 'chat_history', type: 'JSONB DEFAULT \'[]\'::jsonb' },
            { name: 'conversation_stage', type: 'VARCHAR(50) DEFAULT \'menu\'' }, { name: 'last_topic_summary', type: 'TEXT' },
            { name: 'messages_since_verse', type: 'INT DEFAULT 0' }, { name: 'first_seen_date', type: 'DATE' },
            { name: 'last_seen_date', type: 'DATE' }, { name: 'total_sessions', type: 'INT DEFAULT 0' },
            { name: 'total_incoming', type: 'INT DEFAULT 0' }, { name: 'total_outgoing', type: 'INT DEFAULT 0' },
            { name: 'last_message', type: 'TEXT' }, { name: 'last_message_role', type: 'VARCHAR(50)' },
            { name: 'last_response_type', type: 'VARCHAR(50)' }, { name: 'current_lesson', type: 'INT DEFAULT 0' },
            { name: 'language_preference', type: 'VARCHAR(10) DEFAULT \'English\'' }, { name: 'memory_data', type: 'JSONB DEFAULT \'{}\'::jsonb' },
            { name: 'last_menu_choice', type: 'VARCHAR(50)' }, { name: 'last_menu_date', type: 'DATE' },
            { name: 'last_menu_shown', type: 'TIMESTAMP WITH TIME ZONE' }, { name: 'primary_use_case', type: 'VARCHAR(50)' },
            { name: 'user_segment', type: 'VARCHAR(20) DEFAULT \'new\'' }, { name: 'last_activity_ts', type: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP' },
            { name: 'pending_followup', type: 'TEXT' }, { name: 'followup_type', type: 'VARCHAR(50)' },
            { name: 'language', type: 'VARCHAR(10) DEFAULT \'English\'' }
        ];
        for (const col of columnsToAdd) {
            try { await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`); }
            catch (alterErr) { if (!alterErr.message.includes('already exists')) console.warn(`~ DB Setup Warning: Column ${col.name}: ${alterErr.message}`); }
        }
        console.log("✅ Ensured standard user columns exist.");

        // Create lessons table if not exists
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
        // *** SCHEMA FIX: Use phone_number ***
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_response_patterns (
                pattern_id VARCHAR(255) PRIMARY KEY,
                phone_number VARCHAR(20) NOT NULL, -- SCHEMA FIX
                template_id VARCHAR(100),
                first_response_text TEXT,
                first_response_time_seconds INT DEFAULT 0,
                response_sentiment VARCHAR(50),
                asked_for_help BOOLEAN,
                emotional_state_detected VARCHAR(50),
                button_clicked VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
         // *** SCHEMA FIX: Use phone_number ***
         await client.query(`
            CREATE TABLE IF NOT EXISTS user_engagement (
                session_id VARCHAR(255) PRIMARY KEY,
                phone_number VARCHAR(20) NOT NULL, -- SCHEMA FIX
                morning_message_id VARCHAR(100),
                first_reply_time TIMESTAMP WITH TIME ZONE,
                buttons_clicked JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
         // *** SCHEMA FIX: Use phone_number ***
         await client.query(`
            CREATE TABLE IF NOT EXISTS template_analytics (
                analytics_id SERIAL PRIMARY KEY,
                phone_number VARCHAR(20) NOT NULL, -- SCHEMA FIX
                template_id VARCHAR(100),
                button_clicked VARCHAR(100),
                language VARCHAR(10),
                clicked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // *** SCHEMA FIX (v11): ADD phone_number column if tables exist but column is missing ***
        try { await client.query(`ALTER TABLE user_response_patterns ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);`); } catch(e) { console.warn(`~ Warning checking/adding phone_number to user_response_patterns: ${e.message}`); }
        try { await client.query(`ALTER TABLE user_engagement ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);`); } catch(e) { console.warn(`~ Warning checking/adding phone_number to user_engagement: ${e.message}`); }
        try { await client.query(`ALTER TABLE template_analytics ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);`); } catch(e) { console.warn(`~ Warning checking/adding phone_number to template_analytics: ${e.message}`); }
        console.log("✅ Ensured phone_number column exists in analytics tables.");


         // *** SCHEMA FIX: Use phone_number for indexes ***
         await client.query(`CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone_number);`);
         await client.query(`CREATE INDEX IF NOT EXISTS idx_urp_phone ON user_response_patterns (phone_number);`);
         await client.query(`CREATE INDEX IF NOT EXISTS idx_ue_phone ON user_engagement (phone_number);`);
         await client.query(`CREATE INDEX IF NOT EXISTS idx_ta_phone ON template_analytics (phone_number);`);

        console.log("✅ Ensured necessary tables & indexes exist (using phone_number).");


        const lessonCount = await client.query("SELECT COUNT(*) FROM lessons");
        if (parseInt(lessonCount.rows[0].count) === 0) {
            console.log("📚 Inserting sample lessons...");
            await client.query(`
                INSERT INTO lessons (lesson_number, verse, translation, commentary, reflection_question) VALUES
                (1, 'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।', 'You have the right to work only, but never to the fruits.', 'Focus on your duty without attachment to results. This is the path to peace and success.', 'What action can I take today without worrying about the outcome?'),
                (2, 'योगस्थः कुरु कर्माणि सङ्गं त्यक्त्वा धनञ्जय।', 'Perform your duty equipoised, O Arjuna, abandoning all attachment to success or failure.', 'Balance and equanimity lead to excellence in work and peace in life.', 'How can I stay balanced in challenging situations today?')
                ON CONFLICT (lesson_number) DO NOTHING;
            `);
        }
        console.log("✅ Database schema setup complete.");
    } catch (err) {
        console.error("❌ CRITICAL: Database setup error:", err?.message || err);
        // Do NOT release client here, finally block will do it.
        throw err; // Re-throw to prevent server start
    } finally {
        // Ensure client is always released if acquired
        if (client) {
            client.release();
            console.log("🔗 Released setup DB client.");
        }
    }
}


/* ---------------- Enhanced Helper Functions (No DB access here) ---------------- */
function parseChatHistory(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw; // Already parsed
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch (e) { console.error("Error parsing chat history:", e); return []; }
    }
    console.warn("Unexpected chat history type:", typeof raw);
    return []; // Return empty array for unknown types
};
function pruneChatHistory(history, maxMessages = 6) { // Keep history shorter for prompts
    if (!Array.isArray(history) || history.length <= maxMessages) return history || [];
    // Simple slice for now, could add logic to keep system messages if needed
    return history.slice(-maxMessages);
};
function buildConversationContext(user, currentMessage) {
  const history = user.chat_history || []; // Ensure history is an array from parsed user state
  const recentMessages = history.slice(-4);
  let context = {
    previousTopics: [],
    emotionalTone: detectEmotionAdvanced(currentMessage)?.emotion || 'neutral',
    isFollowUp: false,
    isQuestion: currentMessage.includes('?') || /\b(what|how|why|when|where|who|kaise|kya|kyu|kab|kaun)\b/i.test(currentMessage.toLowerCase()),
    history: history // Pass the current, pruned history slice
  };
  if (recentMessages.length >= 2) {
    const lastUserMessage = recentMessages[recentMessages.length - 2]?.content || '';
    const lastBotMessage = recentMessages[recentMessages.length - 1]?.content || '';
    context.isFollowUp = lastUserMessage.length > 5 && lastBotMessage.includes('?'); // More specific check: was the last bot msg a question?
    context.previousTopics = extractTopics([lastUserMessage, lastBotMessage, currentMessage]);
  } else {
    context.previousTopics = extractTopics([currentMessage]);
  }
  return context;
};
function extractTopics(messages) {
    const topics = new Set();
    const text = messages.join(' ').toLowerCase();
    if (text.includes('work') || text.includes('job') || text.includes('काम')) topics.add('work');
    if (text.includes('stress') || text.includes('pressure') || text.includes('तनाव')) topics.add('stress');
    if (text.includes('relationship') || text.includes('family') || text.includes('रिश्ता')) topics.add('relationships');
    if (text.includes('confus') || text.includes('understand') || text.includes('समझ')) topics.add('confusion');
    if (text.includes('anxious') || text.includes('worry') || text.includes('चिंता')) topics.add('anxiety');
    if (text.includes('sad') || text.includes('depress') || text.includes('दुखी')) topics.add('sadness');
    if (text.includes('money') || text.includes('rich') || text.includes('पैसा')) topics.add('finance');
    if (text.includes('success') || text.includes('सफलता')) topics.add('success');
    if (text.includes('home') || text.includes('house') || text.includes('घर')) topics.add('housing');
    if (text.includes('bad things') || text.includes('why') || text.includes('suffering')) topics.add('philosophy');
    if (text.includes('mantra') || text.includes('lesson') || text.includes('gyan')) topics.add('wisdom');
    if (text.includes('love') || text.includes('pyaar') || text.includes('प्यार')) topics.add('love');
    if (text.includes('studies') || text.includes('focus') || text.includes('पढ़ाई')) topics.add('studies');
    if (text.includes('story') || text.includes('krishna') || text.includes('कृष्ण')) topics.add('story');
    return Array.from(topics);
};

// Uses dbPool for initial fetch outside transaction
// *** SCHEMA FIX: Use phone_number ***
async function getUserState(phone) {
    let client = null; // Initialize client to null
    try {
        client = await dbPool.connect(); // Use pool directly
        const res = await client.query("SELECT * FROM users WHERE phone_number = $1", [phone]);
        if (res.rows.length === 0) {
            console.warn(`getUserState: User ${phone} not found (will be created by lock logic).`);
            // Return structure consistent with DB row, including is_processing
            return { phone_number: phone, chat_history: [], memory_data: {}, conversation_stage: "menu", language_preference: "English", language: "English", is_processing: false, total_incoming: 0, total_outgoing: 0, total_sessions: 0 };
        }
        const user = res.rows[0];
        // Ensure necessary fields have defaults if null from DB
        user.chat_history = pruneChatHistory(parseChatHistory(user.chat_history)); // Use pruneChatHistory here
        user.memory_data = user.memory_data && typeof user.memory_data === 'object' ? user.memory_data : (typeof user.memory_data === 'string' ? JSON.parse(user.memory_data || '{}') : {});
        user.conversation_stage = user.conversation_stage || 'menu';
        user.language_preference = user.language_preference || 'English';
        user.language = user.language || 'English';
        user.last_activity_ts = user.last_activity_ts || new Date().toISOString();
        user.is_processing = user.is_processing || false;
        user.total_incoming = user.total_incoming || 0;
        user.total_outgoing = user.total_outgoing || 0;
        user.total_sessions = user.total_sessions || 0;
        return user;
    } catch (err) {
        console.error(`❌ getUserState failed for ${phone}:`, err);
        // Return default state on error
        return { phone_number: phone, chat_history: [], memory_data: {}, conversation_stage: "menu", language_preference: "English", language: "English", is_processing: false, total_incoming: 0, total_outgoing: 0, total_sessions: 0 };
    } finally {
        if (client) client.release();
    }
};

// Uses dbPool - for non-transactional updates like initial trackIncoming
// *** SCHEMA FIX: Use phone_number ***
async function updateUserState(phone, updates) {
    let client = null; // Initialize client to null
    try {
        if (!updates || Object.keys(updates).length === 0) return;
        delete updates.is_processing; // Never update lock flag here
        if (Object.keys(updates).length === 0) return;

        // Ensure JSON fields are stringified
        if (updates.chat_history && typeof updates.chat_history !== 'string') updates.chat_history = JSON.stringify(updates.chat_history);
        if (updates.memory_data && typeof updates.memory_data !== 'string') updates.memory_data = JSON.stringify(updates.memory_data);

        const keys = Object.keys(updates);
        const vals = keys.map(k => updates[k]);
        vals.push(phone);
        // Use double quotes for column names to handle potential reserved words like 'language'
        const clauses = keys.map((k, i) => `"${k}" = $${i + 1}`);
        const sql = `UPDATE users SET ${clauses.join(", ")} WHERE phone_number = $${keys.length + 1}`;

        client = await dbPool.connect();
        await client.query(sql, vals);
    } catch (err) {
        console.error(`❌ updateUserState failed for ${phone}:`, err);
    } finally {
         if (client) client.release();
    }
};


/* ---------------- COMPLETE MENU SYSTEM (Uses client) ---------------- */
async function handleEnhancedStartupMenu(phone, language, user, client) {
    const menuMessage = language === "Hindi"
        ? `🚩 *सारथी AI में आपका स्वागत है!* 🚩\n\nमैं आपका निजी गीता साथी हूँ। कृपया चुनें:\n\n1️⃣ *तत्काल मार्गदर्शन*\n2️⃣ *दैनिक ज्ञान*\n3️⃣ *वार्तालाप*\n4️⃣ *गीता ज्ञान*\n5️⃣ *सब कुछ जानें*\n\n💬 *या बस लिखें*`
        : `🚩 *Welcome to Sarathi AI!* 🚩\n\nI'm your personal Gita companion. Please choose:\n\n1️⃣ *Immediate Guidance*\n2️⃣ *Daily Wisdom*\n3️⃣ *Have a Conversation*\n4️⃣ *Gita Knowledge*\n5️⃣ *Know Everything*\n\n💬 *Or Just Type*`;

    const sent = await sendViaHeltar(phone, menuMessage, "enhanced_welcome");
    if (sent) {
        const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: menuMessage, timestamp: new Date().toISOString() }];
        // Use client for transactional update, include outgoing increment
        // *** SCHEMA FIX: Use phone_number ***
        await client.query(
            'UPDATE users SET conversation_stage = $1, last_menu_shown = NOW(), chat_history = $2, last_message = $3, last_message_role = $4, last_activity_ts = NOW(), total_outgoing = COALESCE(total_outgoing, 0) + 1 WHERE phone_number = $5',
            ['menu', JSON.stringify(updatedHistory), menuMessage, 'assistant', phone]
        );
        // await trackOutgoing(phone, menuMessage, "enhanced_welcome", client); // trackOutgoing is called implicitly by db update
        console.log(`✅ Menu shown to ${phone}. State 'menu'.`);
    } else { console.error(`❌ Failed to send welcome menu to ${phone}.`); }
}
function shouldResetToMenu(message, currentStage) {
    const cleanMessage = message.toLowerCase().trim();
    const resetTriggers = [ 'hi', 'hello', 'hey', 'namaste', 'start', 'menu', 'options', 'help', 'guidance', 'back', 'home', 'main menu', 'hello again', 'hi again' ];
    if (resetTriggers.includes(cleanMessage)) return true;
    // Reset if number input received AND bot is NOT currently in menu or awaiting mood
    if (/^[1-5]$/.test(cleanMessage) && !['menu', 'awaiting_mood'].includes(currentStage)) return true;
    return false;
};
async function resetToMenuStage(phone, language, client) {
    console.log(`🔄 Resetting ${phone} to menu stage`);
    // Fetch latest user state using the client
    // *** SCHEMA FIX: Use phone_number ***
    const userRes = await client.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
    if (userRes.rows.length === 0) { console.error(`❌ Cannot reset non-existent user ${phone}.`); return; }
    const user = userRes.rows[0];
    user.chat_history = pruneChatHistory(parseChatHistory(user.chat_history));
    // Pass client to menu handler which performs its own DB updates using the client
    await handleEnhancedStartupMenu(phone, language, user, client);
}

/* ---------------- Enhanced Analytics (Uses client where needed) ---------------- */
async function trackIncoming(phone, text) { // Non-transactional OK here
    try {
        const user = await getUserState(phone); // Fetch outside transaction
        const now = new Date();
        let addSession = (!user.last_activity_ts || (now.getTime() - new Date(user.last_activity_ts).getTime()) / (1000 * 60 * 60) > 12);
        const updates = {
            last_activity_ts: now.toISOString(), last_seen_date: now.toISOString().slice(0, 10),
            // Don't update last_message/role here, webhook does it transactionally
            total_incoming: (user.total_incoming || 0) + 1
        };
        if (!user.first_seen_date) updates.first_seen_date = now.toISOString().slice(0, 10);
        if (addSession) updates.total_sessions = (user.total_sessions || 0) + 1;
        await updateUserState(phone, updates); // Non-transactional update
    } catch (err) { console.error(`❌ trackIncoming failed for ${phone}:`, err); }
};
// trackOutgoing uses client for transactional update when called from handlers
async function trackOutgoing(phone, reply, type = "chat", client = null) {
    try {
        // Only update timestamp and type transactionally
        // The main transactional update handles last_message, role, history, and total_outgoing increment
        if (client) {
             // *** SCHEMA FIX: Use phone_number ***
             await client.query('UPDATE users SET last_response_type = $1, last_activity_ts = NOW() WHERE phone_number = $2', [type, phone]);
        } else {
             // If called non-transactionally, update more fields but increment is less reliable
             console.warn(`~ trackOutgoing called non-transactionally for ${phone}`);
             const user = await getUserState(phone);
             const updates = {
                 last_activity_ts: new Date().toISOString(),
                 last_message: reply, // Update here if non-transactional
                 last_message_role: "assistant", // Update here if non-transactional
                 last_response_type: type,
                 total_outgoing: (user.total_outgoing || 0) + 1 // Non-atomic increment
             };
             await updateUserState(phone, updates);
        }
    } catch (err) { console.error(`❌ trackOutgoing failed for ${phone}:`, err); }
}


/* ---------------- Enhanced Heltar Sending (No DB access) ---------------- */
async function sendViaHeltar(phone, message, type = "chat") {
    try {
        let finalMessage = message;
        if (type === 'enhanced_ai_response' || type === 'chat') {
            // console.log(`📏 Optimizing AI response for ${phone} (Max: ${MAX_REPLY_LENGTH})`);
            finalMessage = optimizeMessageForWhatsApp(message, MAX_REPLY_LENGTH);
        } else {
            // console.log(`📏 Skipping optimization for ${phone}, type: ${type}`);
        }
        const safeMessage = String(finalMessage || "").trim();
        if (!safeMessage) { console.error(`❌ Attempted to send empty message to ${phone}. Type: ${type}`); return null; } // Return null on failure

        if (!HELTAR_API_KEY || !HELTAR_PHONE_ID) { // Check Phone ID too
            console.warn(`(Simulated Send -> ${phone}): ${safeMessage.substring(0,100)}...`);
            // Don't track outgoing here, caller handles it transactionally
            return { simulated: true, message: safeMessage }; // Indicate simulation success
        }

        const payload = { messages: [{ clientWaNumber: phone, message: safeMessage, messageType: "text" }] };
        console.log(`📤 Sending to ${phone} via Heltar (Type: ${type}): "${safeMessage.substring(0,100)}..."`);
        const resp = await axios.post("https://api.heltar.com/v1/messages/send", payload, {
            headers: { Authorization: `Bearer ${HELTAR_API_KEY}`, "Content-Type": "application/json" },
            timeout: 20000 // Slightly longer timeout
        });
        console.log(`✅ Heltar send SUCCESS for ${phone}`);
        // Don't track outgoing here, caller handles it transactionally
        return resp.data; // Indicate success
    } catch (err) {
        const errMsg = err.response?.data?.error || err.response?.data || err.message || err;
        console.error(`❌ Heltar send FAILED for ${phone}:`, errMsg);
        return null; // Indicate failure
    }
}
async function sendCompleteResponse(phone, fullResponse, language, type = "chat") {
    // Optimization now happens in sendViaHeltar based on type
   return await sendViaHeltar(phone, fullResponse, type);
};

/* ---------------- Context Building & Intent Classification (No DB access) ---------------- */
function buildContextSummary(messages, language) {
    if (!messages || messages.length === 0) return language === "Hindi" ? "कोई पिछला संदर्भ नहीं" : "No previous context";
    const userMessages = messages.filter(msg => msg.role === 'user').slice(-2);
    const botMessages = messages.filter(msg => msg.role === 'assistant').slice(-1);
    let summary = "";
    if (language === "Hindi") {
        summary = "उपयोगकर्ता ने पहले चर्चा की: ";
        userMessages.forEach(msg => { if(msg.content) summary += `"${msg.content.substring(0, 50)}...", `; });
        if (botMessages.length > 0 && botMessages[0].content) summary += `मैंने जवाब दिया: "${botMessages[0].content.substring(0, 30)}..."`;
    } else {
        summary = "User previously discussed: ";
        userMessages.forEach(msg => { if(msg.content) summary += `"${msg.content.substring(0, 50)}...", `; });
        if (botMessages.length > 0 && botMessages[0].content) summary += `I responded: "${botMessages[0].content.substring(0, 30)}..."`;
    }
    return summary.replace(/,\s*$/, '');
};
function isFollowUpToPreviousDeepQuestion(currentText, user) {
    if (!user || user.last_message_role !== 'assistant') return false;
    const lastBotMessage = user.last_message || '';
    return lastBotMessage.includes('?'); // Simplified: is it a follow-up to *any* question?
};
function isGreetingQuery(text) {
    if (!text || typeof text !== "string") return false;
    const lowerText = text.toLowerCase().trim();
    const englishGreetings = ['hi', 'hello', 'hey', 'hii', 'hiya', 'good morning', 'good afternoon', 'good evening'];
    if (englishGreetings.includes(lowerText)) return true;
    const hindiGreetings = ['namaste', 'namaskar', 'pranam', 'radhe radhe'];
    if (hindiGreetings.includes(lowerText)) return true;
    const greetingRegex = /\b(hi|hello|hey|how are you|what'?s up|kaise ho|kaise hain aap|namaste|hare krishna)\b/i;
    return greetingRegex.test(lowerText);
};
function isCapabilitiesQuery(text) {
    const lowerText = text.toLowerCase();
    const capabilitiesRegex = /\b(what can you do|capabilities|tell me about yourself|who are you|can i get more info|give me info|what do you do|more info|info about|introduce yourself|what is this|how does this work)\b/i;
    return capabilitiesRegex.test(lowerText);
};
function isEmotionalExpression(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    const emotionalPatterns = [ /\b(stress|stressed|anxious|anxiety|tension|overwhelmed|pressure|worried)\b/i, /\b(i am in stress|i feel stressed|i'm stressed|feeling stressed)\b/i, /\b(परेशान|तनाव|चिंता|घबराहट|दबाव|उलझन|मन परेशान)\b/, /\b(sad|sadness|depressed|depression|unhappy|hopeless|down|low|lonely)\b/i, /\b(i am sad|i feel sad|i'm sad|feeling down|feeling low)\b/i, /\b(दुखी|उदास|निराश|हताश|अकेला|मन उदास|दिल टूटा)\b/, /\b(life|relationship|family|job|work).*(problem|issue|difficult|hard|trouble|bad)\b/i, /\b(जीवन|रिश्ता|परिवार|नौकरी|काम).*(समस्या|परेशानी|मुश्किल|बुरा)\b/, /\b(not good|not well|feeling bad|struggling)\b/i, /\b(i can't handle|i can't cope|it's too much)\b/i, /\b(अच्छा नहीं|ठीक नहीं|बुरा लग|मुश्किल हो)\b/, /\b(मन भारी|दिल टूट|टेंशन|फिक्र|चिंतित)\b/, /\b(मेरा मन|मेरा दिल).*(परेशान|दुखी|उदास|भारी)\b/, /\b(confused|lost|uncertain|don't know|क्या करूं)\b/i ];
    return emotionalPatterns.some(pattern => pattern.test(lowerText));
};
function isDeepQuestion(text) {
     if (!text) return false;
    const lowerText = text.toLowerCase();
    const deepQuestionPatterns = [ /\b(wrong|right|moral|ethical|lie|cheat|steal|honest)\b/i, /\b(गलत|सही|नैतिक|झूठ|धोखा|ईमानदार)\b/, /\b(krishna|gita|spiritual|meditation|yoga|god)\b/i, /\b(कृष्ण|गीता|आध्यात्मिक|ध्यान|योग|भगवान)\b/, /\b(how|what|why|when|where|who)\b/i, /\b(कैसे|क्या|क्यों|कब|कहाँ|कौन)\b/, /\b(problem|issue|challenge|difficult|struggle|confused)\b/i, /\b(समस्या|मुश्किल|चुनौती|परेशान|उलझन)\b/ ];
    return deepQuestionPatterns.some(pattern => pattern.test(lowerText));
};
function isSmallTalk(text) {
     if (!text) return false;
    const lowerText = text.toLowerCase().trim();
    const seriousIndicators = [ 'lie', 'cheat', 'wrong', 'moral', 'ethical', 'steal', 'dishonest', 'झूठ', 'धोखा', 'गलत', 'नैतिक', 'चोरी', 'बेईमान', 'how do i', 'what should', 'why is', 'can i', 'कैसे', 'क्या', 'क्यों', 'करूं' ];
    if (seriousIndicators.some(indicator => lowerText.includes(indicator))) return false;
    const genuineSmallTalk = [ 'thanks', 'thank you', 'ok', 'okay', 'good', 'nice', 'cool', 'great', 'awesome', 'fine', 'good job', 'well done', 'you too', 'same to you', 'शुक्रिया', 'धन्यवाद', 'ठीक', 'अच्छा', 'बढ़िया', 'बहुत अच्छा', 'जी', 'हाँ', 'नहीं', 'नमस्ते', 'प्रणाम' ];
    if (genuineSmallTalk.includes(lowerText) || lowerText === 'yes' || lowerText === 'no') return true;
    if (lowerText.split(' ').length === 1 && lowerText.includes('?')) return false; // Single word question is not small talk
    return false; // Default to not small talk
};
function detectEmotionAdvanced(text) {
     if (!text) return null;
    const lowerText = text.toLowerCase();
    let emotion = null; let confidence = 0;
    const emotionKeywords = { moral_dilemma: { keywords: ['lie', 'cheat', 'wrong', 'moral', 'ethical', 'steal', 'dishonest', 'झूठ', 'धोखा', 'गलत', 'नैतिक'], weight: 1.3 }, stress: { keywords: ['stress', 'anxious', 'anxiety', 'tension', 'overwhelmed', 'worried', 'worrying', 'परेशान', 'तनाव', 'चिंता'], weight: 1.0 }, sadness: { keywords: ['sad', 'depressed', 'unhappy', 'hopeless', 'sorrow', 'lonely', 'दुखी', 'उदास', 'निराश', 'हताश', 'अकेला'], weight: 1.0 }, anger: { keywords: ['angry', 'anger', 'frustrated', 'irritated', 'क्रोध', 'गुस्सा', 'नाराज'], weight: 1.0 } };
    const iAmPatterns = [ { pattern: /\b(lie|cheat|wrong|moral|dishonest|झूठ|धोखा|गलत)\b/i, emotion: 'moral_dilemma', weight: 1.5 }, { pattern: /\b(stress|stressed|anxious|tension|परेशान|तनाव|चिंता)\b/i, emotion: 'stress', weight: 1.3 }, { pattern: /\b(sad|depressed|unhappy|दुखी|उदास)\b/i, emotion: 'sadness', weight: 1.2 }, { pattern: /\b(angry|anger|frustrated|क्रोध|गुस्सा)\b/i, emotion: 'anger', weight: 1.2 } ];
    for (const situation of iAmPatterns) { if (situation.pattern.test(lowerText)) { emotion = situation.emotion; confidence = situation.weight; break; } }
    if (!emotion) { for (const [emotionType, data] of Object.entries(emotionKeywords)) { for (const keyword of data.keywords) { if (lowerText.includes(keyword)) { if (data.weight > confidence) { emotion = emotionType; confidence = data.weight; } break; } } } }
    return confidence > 0.3 ? { emotion, confidence } : null;
};
function detectUserSituation(text) {
   if (!text) return 'general';
  const lowerText = text.toLowerCase();
  const situations = { moral: /(lie|cheat|wrong|moral)/.test(lowerText), work: /(job|work|office|career)/.test(lowerText), relationships: /(relationship|husband|wife|family|friend)/.test(lowerText), health: /(health|sick|pain|ill)/.test(lowerText), studies: /(study|exam|student)/.test(lowerText), spiritual: /(god|prayer|meditation|yoga)/.test(lowerText) };
  return Object.keys(situations).find(situation => situations[situation]) || 'general';
};

/* ---------------- Enhanced AI Response System (Uses client) ---------------- */
async function getCachedAIResponse(phone, text, language, context, client) {
    const cacheKey = `${phone}:${text.substring(0, 50)}:${language}`;
    if (responseCache.has(cacheKey)) {
        console.log(`✅ Using cached response for ${phone}`);
        const cached = responseCache.get(cacheKey);
        const sent = await sendViaHeltar(phone, cached.response, cached.type);
        if (sent) {
            // Update history and outgoing count using client
            const updatedHistory = [...(context.history || []), { role: 'assistant', content: cached.response, timestamp: new Date().toISOString() }];
            // *** SCHEMA FIX: Use phone_number ***
            await client.query( // Use client
                'UPDATE users SET chat_history = $1, last_message = $2, last_message_role = $3, last_activity_ts = NOW(), total_outgoing = COALESCE(total_outgoing, 0) + 1 WHERE phone_number = $4',
                [JSON.stringify(updatedHistory), cached.response, 'assistant', phone]
            );
             await trackOutgoing(phone, cached.response, cached.type, client); // Just updates type/ts
        }
        return sent ? cached : null; // Return result or null
    }
    console.log(`🧠 No cache hit for ${phone}. Calling AI.`);
    const aiResponseResult = await getEnhancedAIResponseWithRetry(phone, text, language, context, client);
    if (aiResponseResult && aiResponseResult.response) {
         responseCache.set(cacheKey, aiResponseResult);
         setTimeout(() => { responseCache.delete(cacheKey); }, 5 * 60 * 1000); // 5 min cache
    }
    return aiResponseResult; // Return result or null (AI function handles DB update on success)
}
async function getEnhancedAIResponseWithRetry(phone, text, language, context, client, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await getEnhancedAIResponse(phone, text, language, context, client); // Pass client
        } catch (error) {
            console.error(`❌ AI/Send attempt ${attempt + 1} failed for ${phone}:`, error.message);
            if (attempt === retries) {
                console.log(`🔄 All AI/Send retries exhausted for ${phone}, using fallback.`);
                await getContextualFallback(phone, text, language, context, client); // Pass client
                return null; // Fallback handles send/state
            }
            await new Promise(resolve => setTimeout(resolve, 1500 * Math.pow(2, attempt)));
        }
    }
     return null; // Should not be reached, but safety net
}
// *** FIX (v10): Increased max_tokens ***
async function getEnhancedAIResponse(phone, text, language, conversationContext = {}, client) {
  if (!OPENAI_KEY) throw new Error("❌ No OpenAI key configured");
  console.log(`🤖 Using STRICT OpenAI v10 prompt for ${phone}...`); // v10

  const systemPrompt = ENHANCED_SYSTEM_PROMPT[language] || ENHANCED_SYSTEM_PROMPT.english;
  const history = conversationContext.history || []; // Use history from context
  const currentContext = conversationContext;
  const isEmotional = currentContext.emotionalTone !== 'neutral' || isEmotionalExpression(text);
  const isQuestion = currentContext.isQuestion;
  let specificInstruction = "";
  // Updated prompt logic for morning check-in
  if (currentContext.isMorningCheckinReply) {
      specificInstruction = language === 'Hindi'
          ? `यह सुबह की जांच का जवाब है (मूड: "${text}")। इसे स्वीकार करें, गीता (जैसे 2.14) से एक संक्षिप्त अंतर्दृष्टि दें, और मूड से संबंधित एक व्यावहारिक प्रश्न पूछें।`
          : `This is a reply to the morning check-in (mood: "${text}"). Acknowledge this feeling, give a brief Gita insight (like 2.14), and ask a practical question related to the mood.`;
  }
  else if (isEmotional) { specificInstruction = language === 'Hindi' ? `उपयोगकर्ता व्यथित है। गहरी सहानुभूति दिखाएं।` : `User is distressed. Show deep empathy.`; }
  else if (isQuestion) { specificInstruction = language === 'Hindi' ? `उपयोगकर्ता प्रश्न पूछ रहा है। सीधे उत्तर दें।` : `User is asking a question. Answer directly.`; }
  const languageCommand = language === "Hindi" ? `**बहुत महत्वपूर्ण: आपको केवल हिंदी में ही जवाब देना है।**` : `**VERY IMPORTANT: You MUST reply in English only.**`;
  // Construct user prompt carefully
  const userPrompt = `User message: "${text}"\n\nContext/Instruction: ${specificInstruction || 'General inquiry.'}\n${languageCommand}`;

  // Ensure history has the correct format {role, content} and prune
  const formattedHistory = history.map(msg => ({ role: msg.role === 'bot' || msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content })).slice(-6); // Prune again just in case
  const messages = [{ role: "system", content: systemPrompt }, ...formattedHistory, { role: "user", content: userPrompt }];

  console.log(`📤 Sending to OpenAI for ${phone} (V10 Prompt)`);
  aiCallCounter++; console.log(`\n--- OpenAI Call #${aiCallCounter} for ${phone} ---`);
  
  // *** FIX (v10): Increased max_tokens from 180 to 350 ***
  const body = { model: OPENAI_MODEL, messages, max_tokens: 350, temperature: 0.75 };
  let aiResponse = "";
  try {
      const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
           headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 30000
      });
      aiResponse = resp.data?.choices?.[0]?.message?.content;
      console.log(`Raw AI Response for ${phone}:\n${aiResponse ? aiResponse.substring(0,100)+'...' : 'NONE'}`);
  } catch (apiError) {
      console.error(`❌ OpenAI API Error for ${phone}:`, apiError.response?.data?.error || apiError.message);
      throw new Error(`❌ OpenAI API call failed: ${apiError.message}`);
  }
  if (!aiResponse || aiResponse.trim().length < 5) throw new Error(`❌ Empty/Invalid response from OpenAI`);

  console.log(`✅ STRICT OpenAI response received for ${phone}`);
  let cleanResponse = aiResponse.replace(/Want to know more\?.*$/im, '').replace(/Does this seem helpful\?.*$/im, '').replace(/क्या और जानना चाहेंगे\?.*$/im, '').replace(/समझ में आया\?.*$/im, '').trim();
  
  const endsWithQuestion = /[?]\s*$/.test(cleanResponse);
  const responseLanguage = /[\u0900-\u097F]/.test(cleanResponse) ? 'Hindi' : 'English'; // Detect language *from response*
  
  if (!endsWithQuestion) {
      console.warn(`⚠️ AI response for ${phone} missing question. Adding fallback.`);
      const fallbackQuestion = getEngagementQuestion(phone, responseLanguage);
      cleanResponse = cleanResponse.replace(/[.!?।]\s*$/, '') + '. ' + fallbackQuestion;
  } else {
       const lastSentence = cleanResponse.split(/[.!?।]/).filter(s => s.trim().length > 3).pop()?.trim();
       const repetitiveQuestions = [ "what's feeling heaviest right now?", "what are your thoughts?", "does this seem helpful?", "सबसे ज्यादा क्या भारी लग रहा है?", "आप क्या सोचते हैं?", "क्या यह मददगार लगा?" ];
       if (lastSentence && repetitiveQuestions.some(q => lastSentence.toLowerCase().includes(q.toLowerCase()))) {
           console.log(` Replacing repetitive AI question for ${phone}: "${lastSentence}"`);
           const betterQuestion = getEngagementQuestion(phone, responseLanguage);
           const lastQIndex = cleanResponse.lastIndexOf('?');
           if (lastQIndex > 0) {
               const base = cleanResponse.substring(0, lastQIndex).replace(/[.!?।]\s*$/, '').trim(); // Get text before question
               cleanResponse = base + '. ' + betterQuestion;
           } else { // Fallback if question mark not found
                cleanResponse = cleanResponse.replace(/[.!?।]\s*$/, '') + '. ' + betterQuestion;
           }
       }
  }
  console.log(` Final Clean Response for ${phone}:\n${cleanResponse.substring(0,100)}...`);

  // --- Send & Update State (using client) ---
  const sent = await sendCompleteResponse(phone, cleanResponse, language, "enhanced_ai_response");
  if (sent) {
      const finalHistory = [...history, { role: 'assistant', content: cleanResponse, timestamp: new Date().toISOString() }];
      // *** SCHEMA FIX: Use phone_number ***
      await client.query(
          'UPDATE users SET chat_history = $1, last_message = $2, last_message_role = $3, last_activity_ts = NOW(), total_outgoing = COALESCE(total_outgoing, 0) + 1 WHERE phone_number = $4',
          [JSON.stringify(finalHistory), cleanResponse, 'assistant', phone]
      );
       await trackOutgoing(phone, cleanResponse, "enhanced_ai_response", client); // Just updates type/ts
      return { response: cleanResponse, type: "enhanced_ai_response" }; // Success
  } else {
       console.error(`❌ Failed to send final AI response to ${phone}.`);
       throw new Error(`❌ Failed to send final AI response to ${phone}.`); // Throw to trigger retry/fallback
  }
}

/* ---------------- [FIXED] Fallback Function (Uses client) ---------------- */
async function getContextualFallback(phone, text, language, context, client) {
  console.log(`🔄 Using contextual fallback for ${phone}`);
  const fallbackWisdom = ENHANCED_GITA_WISDOM['general'] || { teachings: { hindi: ["क्षमा करें, मैं अभी सहायता नहीं कर सकता।"], english: ["Apologies, I cannot assist right now."] } };
  const responses = language === "Hindi" ? fallbackWisdom.teachings.hindi : fallbackWisdom.teachings.english;
  const selected = responses[Math.floor(Math.random() * responses.length)];
  const sent = await sendCompleteResponse(phone, selected, language, "contextual_fallback");
  if (sent) {
      const history = context.history || [];
      const updatedHistory = [...history, { role: 'assistant', content: selected, timestamp: new Date().toISOString() }];
       // *** SCHEMA FIX: Use phone_number ***
       await client.query(
           'UPDATE users SET chat_history = $1, last_message = $2, last_message_role = $3, last_activity_ts = NOW(), total_outgoing = COALESCE(total_outgoing, 0) + 1 WHERE phone_number = $4',
           [JSON.stringify(updatedHistory), selected, 'assistant', phone]
       );
       await trackOutgoing(phone, selected, "contextual_fallback", client); // Updates type/ts
       console.log(`✅ Fallback message sent and history updated for ${phone}.`);
   } else { console.error(`❌ Failed to send fallback message to ${phone}.`); }
}

/* ---------------- Menu Choice Handler (Uses client) ---------------- */
async function handleEnhancedMenuChoice(phone, choice, language, user, client) {
  console.log(`📝 Menu choice ${choice} for ${phone}`);
  const choices = {
      "1": { hindi: { prompt: "🌅 आपकी वर्तमान चुनौती के लिए सही मार्गदर्शन। कृपया संक्षेप में बताएं कि आप किस परिस्थिति में हैं?", action: "immediate_guidance" }, english: { prompt: "🌅 Right guidance for your current challenge. Please briefly describe your situation?", action: "immediate_guidance" } },
      "2": { hindi: { prompt: async () => await getDailyWisdom("Hindi"), action: "daily_wisdom" }, english: { prompt: async () => await getDailyWisdom("English"), action: "daily_wisdom" } },
      "3": { hindi: { prompt: "💬 मैं सुनने के लिए यहाँ हूँ। कृपया बताएं आप कैसा महसूस कर रहे हैं? मैं गीता की शिक्षाओं के through आपकी मदद करूंगा।", action: "conversation" }, english: { prompt: "💬 I'm here to listen. Please share how you're feeling? I'll help you through the teachings of Gita.", action: "conversation" } },
      "4": { hindi: { prompt: "🎓 गीता ज्ञान: भगवद गीता 18 अध्यायों में विभाजित है... आप किस विषय के बारे में जानना चाहते हैं?", action: "knowledge_seeker" }, english: { prompt: "🎓 Gita Knowledge: The Bhagavad Gita is divided into 18 chapters... What specific topic would you like to know about?", action: "knowledge_seeker" } },
      "5": { hindi: { prompt: "🌈 संपूर्ण मार्गदर्शन: आइए आपकी वर्तमान स्थिति... पर चर्चा करें। कृपया बताएं आप कहाँ से शुरू करना चाहेंगे?", action: "comprehensive_guidance" }, english: { prompt: "🌈 Complete Guidance: Let's discuss your current situation... Please tell me where you'd like to start?", action: "comprehensive_guidance" } }
  };
  const selected = choices[choice];
  if (!selected) {
    console.log(`🔄 Treating invalid menu choice "${choice}" as direct conversation for ${phone}`);
    // *** SCHEMA FIX: Use phone_number ***
    await client.query('UPDATE users SET conversation_stage = $1, last_activity_ts = NOW() WHERE phone_number = $2', ['chatting', phone]);
    user.conversation_stage = "chatting";
    const conversationContext = buildConversationContext(user, choice);
    conversationContext.history = user.chat_history;
    await getCachedAIResponse(phone, choice, language, conversationContext, client);
    return;
  }
  try {
    let promptContent; const selectedLang = selected[language] || selected.english;
    if (typeof selectedLang.prompt === 'function') {
        promptContent = await selectedLang.prompt();
    } else {
        promptContent = selectedLang.prompt;
    }
    const sent = await sendViaHeltar(phone, promptContent, `menu_${selectedLang.action}`);
    if (sent) {
        const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: promptContent, timestamp: new Date().toISOString() }];
        // *** SCHEMA FIX: Use phone_number ***
        await client.query(
            'UPDATE users SET conversation_stage = $1, last_menu_choice = $2, last_menu_shown = NOW(), chat_history = $3, last_message = $4, last_message_role = $5, last_activity_ts = NOW(), total_outgoing = COALESCE(total_outgoing, 0) + 1 WHERE phone_number = $6',
            ['chatting', choice, JSON.stringify(updatedHistory), promptContent, 'assistant', phone]
        );
         await trackOutgoing(phone, promptContent, `menu_${selectedLang.action}`, client); // Updates type/ts
    } else { console.error(`❌ Failed send menu choice ${choice} resp to ${phone}.`); }
  } catch (error) {
    console.error(`❌ Menu choice error for ${phone}, choice ${choice}:`, error);
    const fallbackMessage = language === "Hindi" ? "क्षमा करें, तकनीकी समस्या आई..." : "Sorry, technical issue...";
    const sentError = await sendViaHeltar(phone, fallbackMessage, "menu_error");
     if(sentError){
         const updatedHistory = [...(user.chat_history || []), { role: 'assistant', content: fallbackMessage }];
         // *** SCHEMA FIX: Use phone_number ***
         await client.query( 'UPDATE users SET chat_history = $1, last_message = $2, last_message_role = $3, last_activity_ts = NOW(), total_outgoing = COALESCE(total_outgoing, 0) + 1 WHERE phone_number = $4', [JSON.stringify(updatedHistory), fallbackMessage, 'assistant', phone] );
          await trackOutgoing(phone, fallbackMessage, "menu_error", client); // Updates type/ts
     }
  }
}

/* ---------------- Daily Wisdom System (No DB writes needed here) ---------------- */
async function getDailyWisdom(language) {
  try {
    const now = new Date(); const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime(); const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    // Use dbPool here for a simple read-only query
    const countResult = await dbPool.query("SELECT COUNT(*) as total FROM lessons");
    const totalLessons = parseInt(countResult.rows[0].total) || 2;
    const lessonNumber = (dayOfYear % totalLessons) + 1;
    const result = await dbPool.query( `SELECT * FROM lessons WHERE lesson_number = $1`, [lessonNumber] );
    if (result.rows.length === 0) { console.warn(`⚠️ No lesson ${lessonNumber}, using fallback.`); return getFallbackDailyWisdom(language, dayOfYear); }
    return formatDailyWisdom(result.rows[0], language, dayOfYear);
  } catch (error) { console.error("Daily wisdom error:", error); return getFallbackDailyWisdom(language, 1); }
};
function formatDailyWisdom(lesson, language, dayOfYear) {
  if (language === "Hindi") {
    return `📖 *आज की गीता शिक्षा (दिन ${dayOfYear})*\n\n🎯 *श्लोक ${lesson.lesson_number}:*\n"${lesson.verse}"\n\n💫 *अर्थ:*\n${lesson.translation}\n\n🌅 *व्यावहारिक अनुप्रयोग:*\n${lesson.commentary}\n\n🤔 *आज का अभ्यास:*\n${lesson.reflection_question}\n\n✨ *तत्काल कार्ययोजना:*\n1. इस श्लोक को 3 बार पढ़ें\n2. दिन में 2 बार इसपर विचार करें\n3. शाम को परिणाम साझा करें\n\nक्या आप आज इस अभ्यास को करने का संकल्प लेंगे?`;
  } else {
    return `📖 *Today's Gita Wisdom (Day ${dayOfYear})*\n\n🎯 *Verse ${lesson.lesson_number}:*\n"${lesson.verse}"\n\n💫 *Translation:*\n${lesson.translation}\n\n🌅 *Practical Application:*\n${lesson.commentary}\n\n🤔 *Today's Practice:*\n${lesson.reflection_question}\n\n✨ *Immediate Action Plan:*\n1. Read this verse 3 times\n2. Reflect on it twice today\n3. Share insights tonight\n\nWill you commit to this practice today?`;
  }
};
function getFallbackDailyWisdom(language, dayOfYear) {
  const fallbackLesson = { lesson_number: 1, verse: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।", translation: "You have the right to work only, but never to the fruits.", commentary: "Focus on your duty without attachment to results.", reflection_question: "What action can I take today without worrying about the outcome?" };
  return formatDailyWisdom(fallbackLesson, language, dayOfYear);
};

/* ---------------- LANGUAGE SWITCHING (Uses client) ---------------- */
async function handleLanguageSwitch(phone, newLanguage, client) {
    const confirmationMessage = newLanguage === 'English' ? "✅ Language switched to English. How can I help you today? 😊" : "✅ भाषा हिंदी में बदल गई। मैं आपकी कैसे मदद कर सकता हूँ? 😊";
    const sentConfirm = await sendViaHeltar(phone, confirmationMessage, "language_switch");
    let userForHistory = null;
    if (sentConfirm) {
         // History and outgoing count are updated transactionally by resetToMenuStage called below
         await trackOutgoing(phone, confirmationMessage, "language_switch", client);
         // Add confirmation to history before the menu
         // *** SCHEMA FIX: Use phone_number ***
         const userRes = await client.query('SELECT chat_history FROM users WHERE phone_number = $1', [phone]);
         if (userRes.rows.length > 0) {
             userForHistory = { chat_history: parseChatHistory(userRes.rows[0].chat_history) };
             const updatedHistory = [...(userForHistory.chat_history || []), { role: 'assistant', content: confirmationMessage, timestamp: new Date().toISOString() }];
             // *** SCHEMA FIX: Use phone_number ***
             await client.query( 'UPDATE users SET chat_history = $1, last_message = $2, last_message_role = $3, total_outgoing = COALESCE(total_outgoing, 0) + 1 WHERE phone_number = $4', [JSON.stringify(updatedHistory), confirmationMessage, 'assistant', phone] );
         } else { console.error(`❌ Cannot update history for non-existent user ${phone} during lang switch.`); }
    } else { console.error(`❌ Failed to send lang switch confirmation to ${phone}.`); }
    // Reset to menu also needs the client
    await resetToMenuStage(phone, newLanguage, client); // This handles sending the menu & updating state/history again
}

/* ---------------- Small Talk Handler (Uses client) ---------------- */
async function handleSmallTalk(phone, text, language, client) {
    let response; const lower = text.toLowerCase();
    if (language === "Hindi") { response = "ठीक है! 🙏 आप आगे क्या जानना चाहेंगे?"; }
    else { response = "Okay! 🙏 What would you like to explore next?"; }
    if (lower.includes('thank') || lower.includes('शुक्रिया') || lower.includes('धन्यवाद')) { response = language === 'Hindi' ? "आपका स्वागत है! 🕉️" : "You're welcome! 🕉️"; }
    else if (lower.includes('bye')) { response = language === 'Hindi' ? "फिर मिलेंगे! हरे कृष्ण! 🌟" : "Talk soon! Hare Krishna! 🌟"; }

    const sent = await sendViaHeltar(phone, response, "small_talk");
    if (sent) {
        // *** SCHEMA FIX: Use phone_number ***
        const userRes = await client.query('SELECT chat_history FROM users WHERE phone_number = $1', [phone]);
        const currentHistory = userRes.rows.length > 0 ? parseChatHistory(userRes.rows[0].chat_history) : [];
        const updatedHistory = [...currentHistory, { role: 'assistant', content: response, timestamp: new Date().toISOString() }];
        // *** SCHEMA FIX: Use phone_number ***
        await client.query( 'UPDATE users SET chat_history = $1, last_message = $2, last_message_role = $3, last_activity_ts = NOW(), total_outgoing = COALESCE(total_outgoing, 0) + 1 WHERE phone_number = $4', [JSON.stringify(updatedHistory), response, 'assistant', phone] );
         await trackOutgoing(phone, response, "small_talk", client); // Updates type/ts
    } else { console.error(`❌ Failed to send small talk response to ${phone}.`); }
}

/* ---------------- Webhook Parsing ---------------- */
function parseWebhookMessage(body) {
    // console.log("📨 Raw webhook:", JSON.stringify(body).substring(0, 150));
    if (!body) return null;
    if (body?.messages?.[0]) return body.messages[0]; // Heltar
    if (body?.object === 'whatsapp_business_account') { // Meta
        const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (message) return message;
    }
    if (body?.from && body?.text) return body; // Simple Test
    // console.log("❓ Unknown webhook format"); // Reduce log noise
    return null;
};

/* ---------------- 🚨 MAIN WEBHOOK HANDLER (v10 - Full DB Lock & Schema Fix) ---------------- */
app.post("/webhook", async (req, res) => {
  // 1. Respond Immediately
  res.status(200).send("OK");

  let phone;
  let client = null; // Initialize client to null
  let acquiredLock = false;

  try {
    // 2. Parse Message
    const body = req.body || {};
    const msg = parseWebhookMessage(body);
    if (!msg) { return; }

    phone = msg?.from || msg?.clientWaNumber;
    let rawText = ""; const messageType = msg.type;
     if (messageType === "text") { rawText = msg.text?.body || ""; }
     else if (messageType === "button") { rawText = msg.button?.payload || msg.button?.text || ""; }
     else if (messageType === "interactive") {
         const interactive = msg.interactive;
         if (interactive?.type === 'button_reply') { rawText = interactive.button_reply?.id || interactive.button_reply?.title || ""; }
         else if (interactive?.type === 'list_reply') { rawText = interactive.list_reply?.id || interactive.list_reply?.title || ""; }
     }
     else if (msg.text && typeof msg.text === 'object') { rawText = msg.text.body || ""; }
     else if (msg.text && typeof msg.text === 'string') { rawText = msg.text; }
     else if (msg.body) { rawText = msg.body; } // Another possible text location

    const text = String(rawText || "").trim();

    if (!phone || text.length === 0) { console.warn(`⚠️ Webhook missing phone/text.`); return; }

    console.log(`\n📩 Incoming from ${phone}: "${text}" (Type: ${messageType})`);
    // Non-transactional timestamp update ONLY
    await trackIncoming(phone, text); // Uses separate connection

    // --- 3. Acquire Database Lock ---
    client = await dbPool.connect(); // Get client connection
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); // Start transaction

    // Attempt to acquire lock using SELECT FOR UPDATE NOWAIT
    let lockResult;
    try {
        // *** SCHEMA FIX: Use phone_number ***
        lockResult = await client.query(
           'SELECT * FROM users WHERE phone_number = $1 FOR UPDATE NOWAIT', // Select all needed user data
           [phone]
        );
    } catch (lockError) {
        if (lockError.code === '55P03') { // lock_not_available
             console.log(`⏳ User ${phone} row locked. Discarding: "${text}"`);
             await client.query('ROLLBACK'); client.release(); return;
        } else if (lockError.code === '42703' && lockError.message.includes('is_processing')) {
             console.error(`❌ CRITICAL: 'is_processing' column missing! Run setupDatabase.`);
             await client.query('ROLLBACK'); client.release(); return;
        }
        else {
             console.error(`❌ DB Lock acquisition error for ${phone}:`, lockError);
             throw lockError;
        }
    }

    // Handle user creation if they don't exist
    let user;
    if (lockResult.rows.length === 0) {
         console.log(`✨ User ${phone} not found. Creating and locking.`);
         // *** SCHEMA FIX: Use phone_number ***
         const insertRes = await client.query(`
             INSERT INTO users (phone_number, first_seen_date, last_seen_date, total_sessions, language_preference, language, last_activity_ts, memory_data, chat_history, conversation_stage, is_processing, total_incoming, total_outgoing)
             VALUES ($1, CURRENT_DATE, CURRENT_DATE, 1, 'English', 'English', CURRENT_TIMESTAMP, '{}', '[]', 'menu', TRUE, 1, 0)
             ON CONFLICT (phone_number) DO UPDATE SET is_processing = TRUE, last_activity_ts = EXCLUDED.last_activity_ts
             RETURNING *;
         `, [phone]);
         user = insertRes.rows[0];
         acquiredLock = true;
         console.log(`➕ Locked processing for NEW user ${phone}`);
    } else {
        user = lockResult.rows[0];
        if (user.is_processing) {
            console.log(`⏳ User ${phone} already processing (redundant check). Discarding: "${text}"`);
            await client.query('ROLLBACK'); client.release(); return;
        } else {
            // *** SCHEMA FIX: Use phone_number ***
            await client.query('UPDATE users SET is_processing = TRUE WHERE phone_number = $1', [phone]);
            acquiredLock = true;
            console.log(`➕ Locked processing for existing user ${phone}`);
        }
    }
    // --- Lock Acquired ---

    // 4. Parse User State
    user.chat_history = pruneChatHistory(parseChatHistory(user.chat_history));
    user.memory_data = user.memory_data && typeof user.memory_data === 'object' ? user.memory_data : (typeof user.memory_data === 'string' ? JSON.parse(user.memory_data || '{}') : {});
    user.conversation_stage = user.conversation_stage || 'menu';
    user.language_preference = user.language_preference || 'English';
    user.language = user.language || 'English';

    // 5. Language Determination (Uses client)
    const languageResult = await determineUserLanguage(phone, text, user, client);
    let language = languageResult.language;
    const isLanguageSwitch = languageResult.isSwitch;

    console.log(`🎯 Processing locked for ${phone}: Lang=${language}, Stage=${user.conversation_stage}, isSwitch=${isLanguageSwitch}`);

    // --- 6. Update History (User Message) - Within Transaction ---
    const lastUserMsg = user.chat_history.length > 0 ? user.chat_history[user.chat_history.length -1] : null;
    let currentHistory = user.chat_history || [];
    // Avoid adding exact duplicate messages within ~2 seconds
    // Also check if it's the *exact same* as the last message regardless of time (e.g. double tap)
    if (!lastUserMsg || lastUserMsg.content !== text || (lastUserMsg.role !== 'user' && lastUserMsg.content !== text) || Date.now() - new Date(lastUserMsg.timestamp || 0).getTime() > 2000) {
        currentHistory = [...currentHistory, { role: 'user', content: text, timestamp: new Date().toISOString() }];
        // *** SCHEMA FIX: Use phone_number ***
        await client.query(
            'UPDATE users SET chat_history = $1, last_message = $2, last_message_role = $3 WHERE phone_number = $4',
            [JSON.stringify(currentHistory), text, 'user', phone]
        );
        user.chat_history = currentHistory; // Update local copy
    } else {
        console.log(` H Duplicate user message detected for ${phone} within short time, skipping history update and discarding.`);
        await client.query('COMMIT'); // Commit lock update only
        acquiredLock = false;
        // Release lock via finally block
        return; // Stop processing duplicate
    }


    // --- 7. Intent Routing & Handling (Pass client to ALL handlers) ---
    if (isLanguageSwitch) {
      await handleLanguageSwitch(phone, language, client);
    } else if (shouldResetToMenu(text, user.conversation_stage)) {
      await resetToMenuStage(phone, language, client);
    } else if (user.conversation_stage === 'awaiting_mood' && text.split(' ').length <= 2 && text.length < 20 && !/^[1-5]$/.test(text)) {
      await handleMorningCheckinResponse(phone, text, language, user, client);
    } else if (user.conversation_stage === 'awaiting_mood') {
        console.log(`⚠️ Expected mood from ${phone}, received: "${text}". Resetting stage.`);
        // *** SCHEMA FIX: Use phone_number ***
        await client.query('UPDATE users SET conversation_stage = $1, last_activity_ts = NOW() WHERE phone_number = $2', ['chatting', phone]);
        user.conversation_stage = 'chatting';
        const conversationContext = buildConversationContext(user, text);
        // conversationContext.history = user.chat_history; // History is in user object
        await getCachedAIResponse(phone, text, language, conversationContext, client);
    } else if (isTemplateButtonResponse(text)) {
        const handled = await handleTemplateButtonResponse(phone, text, language, user, client);
        if (!handled) {
            console.warn(`⚠️ Template button "${text}" not handled for ${phone}. Falling to AI.`);
             if(user.conversation_stage !== 'chatting') {
                 // *** SCHEMA FIX: Use phone_number ***
                 await client.query('UPDATE users SET conversation_stage = $1, last_activity_ts = NOW() WHERE phone_number = $2', ['chatting', phone]);
                 user.conversation_stage = 'chatting';
             }
            const conversationContext = buildConversationContext(user, text);
            // conversationContext.history = user.chat_history; // History is in user object
            await getCachedAIResponse(phone, text, language, conversationContext, client);
        }
    } else if (user.conversation_stage === "menu" && /^[1-5]$/.test(text.trim())) {
        await handleEnhancedMenuChoice(phone, text.trim(), language, user, client);
    } else if (isCapabilitiesQuery(text.toLowerCase())) {
        const reply = language === "Hindi" ? "मैं सारथी AI हूँ, आपका निजी गीता साथी! 🙏 मैं आपको जीवन की चुनौतियों के लिए भगवद गीता का मार्गदर्शन प्रदान करता हूँ। क्या आप किस विशेष मुद्दे पर चर्चा करना चाहेंगे?" : "I'm Sarathi AI, your personal Gita companion! 🙏 I provide guidance from Bhagavad Gita for life's challenges. Is there a specific issue you'd like to discuss?";
        const sent = await sendViaHeltar(phone, reply, "capabilities");
        if (sent) {
            const finalHistory = [...user.chat_history, { role: 'assistant', content: reply, timestamp: new Date().toISOString() }];
            // *** SCHEMA FIX: Use phone_number ***
            await client.query('UPDATE users SET chat_history = $1, last_message = $2, last_message_role = $3, last_activity_ts = NOW(), total_outgoing = COALESCE(total_outgoing, 0) + 1 WHERE phone_number = $4', [JSON.stringify(finalHistory), reply, 'assistant', phone]);
             await trackOutgoing(phone, reply, "capabilities", client); // Just updates type/ts
        }
    } else if (isSmallTalk(text.toLowerCase())) {
        await handleSmallTalk(phone, text, language, client);
    } else { // Default AI Response
        if (user.conversation_stage === 'menu' || user.conversation_stage === 'awaiting_mood' || user.conversation_stage == null || user.conversation_stage === '' ) { // Force update if in menu or stuck
            console.log(`✅✅ User ${phone} moving from '${user.conversation_stage || 'NULL'}' to 'chatting'.`);
            // *** SCHEMA FIX: Use phone_number ***
            await client.query('UPDATE users SET conversation_stage = $1, last_activity_ts = NOW() WHERE phone_number = $2', ['chatting', phone]);
            user.conversation_stage = "chatting"; // Update local state immediately
        }
        console.log(`ℹ️ Intent: General/Emotional for ${phone} -> Using AI (Stage: ${user.conversation_stage})`);
        const conversationContext = buildConversationContext(user, text);
        // conversationContext.history is already part of user object context
        await getCachedAIResponse(phone, text, language, conversationContext, client); // Pass client
    }

    // 8. Commit Transaction (if no errors occurred during handling)
    await client.query('COMMIT');
    console.log(`💾 Transaction committed for ${phone}.`);
    acquiredLock = false; // Mark lock as released after commit

  } catch (err) {
    console.error(`❌❌ TOP LEVEL Webhook error for ${phone || 'unknown'}:`, err?.message || err);
    console.error(err.stack); // Log stack trace
    // 9. Rollback Transaction on Error
    if (client) {
        try {
            if (acquiredLock) { // Only rollback if lock was acquired
                await client.query('ROLLBACK');
                console.log(`⏪ Transaction rolled back for ${phone} due to error.`);
                acquiredLock = false; // Mark lock released after rollback
            } else { console.log(`~ No lock held by this process for ${phone}, skipping rollback.`); }
        }
        catch (rbErr) { console.error(`❌❌ CRITICAL: Failed to rollback for ${phone}:`, rbErr); }
    }
    // Error notification
     if (phone) { try {
         const errorLang = 'English'; // Safer default
         const errorMsg = errorLang === 'Hindi' ? "क्षमा करें, आंतरिक त्रुटि..." : "Apologies, internal error...";
         await sendViaHeltar(phone, errorMsg, "error_fallback");
      } catch (sendError) { console.error(`❌ Failed to send error message to ${phone}:`, sendError); } }

  } finally {
      // --- 10. CRITICAL: Release Lock & Client ---
      if (client) {
          if (acquiredLock) { // Only release lock if we committed or rolled back successfully AFTER acquiring it
              try {
                  // Use a separate connection (non-transactional) to release lock robustly
                  // *** SCHEMA FIX: Use phone_number ***
                  await dbPool.query('UPDATE users SET is_processing = FALSE, last_activity_ts = NOW() WHERE phone_number = $1', [phone]);
                  console.log(`➖ Unlocked processing for ${phone}.`);
              } catch (unlockErr) {
                  console.error(`❌❌ CRITICAL: Failed to release DB lock for ${phone}:`, unlockErr);
                  // Implement alerting here!
              }
          }
          client.release(); // Always release the main transaction client
          // console.log("🔗 DB Client released in finally block."); // Verbose log
      } else { console.log("~ No client to release in finally block (error likely occurred before client acquisition)."); }
  }
});


/* ---------------- Health check ---------------- */
app.get("/health", (req, res) => {
  res.json({
    status: "ok", bot: BOT_NAME, timestamp: new Date().toISOString(), version: "v10 - Schema & Token Fix",
    features: [
        "✅ Full DB Lock using SELECT FOR UPDATE NOWAIT",
        "✅ Transactional State Updates",
        "✅ Race Condition & Multiple Reply Fix",
        "✅ Morning Check-in Flow ('Hare Krishna!')",
        "✅ Conditional AI Prompt (v5)",
        "✅ 'max_tokens' increased to 350",
        "✅ Smarter Message Shortening (v10)",
        "✅ All Previous Language & Logic Fixes",
        "✅ 'अभ्यास' Button Handling",
        "✅ 'phone_number' Schema Fix"
     ],
    cacheSize: responseCache.size,
    databasePoolStats: { totalCount: dbPool.totalCount, idleCount: dbPool.idleCount, waitingCount: dbPool.waitingCount, },
    message_length_limit: MAX_REPLY_LENGTH
  });
});

/* ---------------- Stage Timeout & Stale Lock Management ---------------- */
async function cleanupStuckStagesAndLocks() {
  let client = null; // Initialize to null
  console.log("🧹 Running cleanup task...");
  try {
    client = await dbPool.connect();
     // Reset stale locks older than 5 minutes
    const staleLockCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const lockResetResult = await client.query(`UPDATE users SET is_processing = FALSE WHERE is_processing = TRUE AND last_activity_ts < $1`, [staleLockCutoff]);
    if (lockResetResult.rowCount > 0) console.warn(`🚨 Reset ${lockResetResult.rowCount} stale processing locks older than 5 minutes.`);

    // Reset stage for inactivity (e.g., > 2 hours)
    const stageResetCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const result = await client.query(`UPDATE users SET conversation_stage = 'menu', pending_followup = NULL, followup_type = NULL WHERE last_activity_ts < $1 AND conversation_stage NOT IN ('menu', 'subscribed') AND is_processing = FALSE`, [stageResetCutoff]); // Only reset non-processing users
    if (result.rowCount > 0) console.log(`🔄 Cleaned up ${result.rowCount} stuck user stages older than 2 hours`);

  } catch (err) { console.error("❌ Cleanup task error:", err); }
  finally { if(client) client.release(); }
}
// Run hourly and also shortly after startup
setTimeout(cleanupStuckStagesAndLocks, 30 * 1000); // Run 30s after start
setInterval(cleanupStuckStagesAndLocks, 60 * 60 * 1000); // Run hourly

/* ---------------- Start server ---------------- */
const server = app.listen(PORT, async () => { // Assign server to a variable
  validateEnvVariables();
  console.log(`\n🚀 ${BOT_NAME} COMPLETE REVIVED v10 (Schema Fix) listening on port ${PORT}`);
  console.log("⏳ Initializing database connection and setup...");
  try {
      await setupDatabase(); // Adds is_processing column, resets locks, and uses 'phone_number'
      console.log("✅ Database setup finished. Bot is ready.");
      console.log("🔧 Full DB Lock, Token Fix, & Transactional Updates Implemented.");
  } catch (dbErr) {
      console.error("❌ CRITICAL: Database setup failed on startup. Exiting.", dbErr);
      process.exit(1);
  }
});

/* ---------------- Graceful Shutdown ---------------- */
async function gracefulShutdown(signal) {
    console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
    // Stop accepting new connections
    server.close(async (err) => {
         if (err) {
            console.error("Error closing server:", err);
            process.exit(1);
         }
         console.log("✅ HTTP server closed.");
         // Close database pool
        try {
            console.log("Attempting to close database pool...");
            await dbPool.end(); // Wait for pool to close
            console.log('Database pool closed.');
            process.exit(0);
        } catch (dbErr) {
            console.error('Error during DB pool shutdown:', dbErr);
            process.exit(1); // Exit with error code if shutdown fails
        }
    });
    // Force shutdown after timeout
    setTimeout(() => {
        console.error("Could not close connections in time, forcefully shutting down");
        process.exit(1);
    }, 10000); // 10 seconds
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Ensure unhandled promise rejections are logged
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err, origin) => {
  console.error(`❌❌ Uncaught Exception: ${err.message}`, 'Origin:', origin, 'Stack:', err.stack);
   // Force exit on uncaught exception, as state might be corrupt
   process.exit(1);
});

