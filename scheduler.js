// scheduler.js - FINAL DIAGNOSTIC TEST (Extremely Short Content)
import dotenv from "dotenv";
dotenv.config();

import twilio from "twilio";
import pg from "pg";

const { Pool } = pg;

/* ---------------- Config ---------------- */
const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_WHATSAPP_NUMBER = (process.env.TWILIO_WHATSAPP_NUMBER || "").trim();
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

/* ---------------- Main Job Logic ---------------- */
async function runTestMessageJob() {
    console.log('⏰ Firing a single, very short test message...');

    const testUser = {
        phone_number: "whatsapp:+918427792857", // Your personal WhatsApp number
        profile_name: "Siddharth"
    };

    // Hardcoded, extremely short content
    const testContent = {
        sanskrit_verse: "कर्मण्येवाधिकारस्ते।",
        hinglish_verse: "Focus on your actions.",
        practice_text: "Breathe deeply for one minute."
    };

    try {
        const templateSid = "HXd9a2d4dcd3b22cf925233c45b2b595c1";

        await twilioClient.messages.create({
            contentSid: templateSid,
            from: TWILIO_WHATSAPP_NUMBER,
            to: testUser.phone_number,
            mediaUrl: ["https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/images/Gemini_Generated_Image_fswgn0fswgn0fswg.png"],
            contentVariables: JSON.stringify({
                '1': testUser.profile_name,
                '2': testContent.practice_text,
                '3': testContent.sanskrit_verse,
                '4': testContent.hinglish_verse
            })
        });
        console.log(`✅ Test message template sent to ${testUser.phone_number}`);
    } catch (err) {
        console.error(`❌ Error sending test message template to ${testUser.phone_number}:`, err.message);
    }
}

/* ---------------- Scheduler Logic ---------------- */
console.log("Scheduler started for a one-time test.");
runTestMessageJob();
