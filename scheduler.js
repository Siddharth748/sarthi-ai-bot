// scheduler.js - Test Krishna Media Template via Twilio

import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

/* ---------------- Config ---------------- */
const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_WHATSAPP_NUMBER = (process.env.TWILIO_WHATSAPP_NUMBER || "").trim();

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/* ---------------- Main Job Logic ---------------- */
async function runTestMessageJob() {
  console.log("⏰ Sending Krishna test message...");

  // ✅ Your personal number
  const testUser = {
    phone_number: "whatsapp:+918427792857",
    profile_name: "Siddharth"
  };

  // ✅ Sample content
  const testContent = {
    image_url:
      "https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/images/Gemini_Generated_Image_fswgn0fswgn0fswg.png",
    practice_text:
      "Two-Minute Mantra: Sit quietly and softly repeat 'Om Shanti'.",
    sanskrit_verse:
      "उद्धरेदात्मनात्मानं नात्मानमवसादयेत्। ... (Bhagavad Gita 6.5)",
    hinglish_verse:
      "Lift yourself by yourself; don’t let yourself down."
  };

  try {
    await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to: testUser.phone_number,
      contentSid: "HXd9a2d4dcd3b22cf925233c45b2b595c1", // ✅ Your Twilio template SID
      contentVariables: JSON.stringify({
        "1": testContent.image_url,       // Header Image
        "2": testUser.profile_name,       // Name
        "3": testContent.practice_text,   // Practice
        "4": testContent.sanskrit_verse,  // Sanskrit Verse
        "5": testContent.hinglish_verse   // Hinglish Verse
      })
    });

    console.log(`✅ Krishna message sent to ${testUser.phone_number}`);
  } catch (err) {
    console.error(`❌ Error sending message:`, err.message);
  }
}

/* ---------------- Fire Once ---------------- */
console.log("Scheduler started for one-time Krishna test.");
runTestMessageJob();
