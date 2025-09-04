// scheduler.js - Test WhatsApp Message with Fixed Header Image

import dotenv from "dotenv";
dotenv.config();

import twilio from "twilio";

/* ---------------- Config ---------------- */
const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_WHATSAPP_NUMBER = (process.env.TWILIO_WHATSAPP_NUMBER || "").trim();

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/* ---------------- Main Job Logic ---------------- */
async function runTestMessageJob() {
  console.log("⏰ Firing a single test message with fixed media header...");

  const testUser = {
    phone_number: "whatsapp:+918427792857", // your number
    profile_name: "Siddharth",
  };

  const testContent = {
    sanskrit_verse: "कर्मण्येवाधिकारस्ते।",
    hinglish_verse: "Focus on your actions.",
    practice_text: "Breathe deeply for one minute.",
  };

  try {
    const templateSid = "HXd9a2d4dcd3b22cf925233c45b2b595c1";

    await twilioClient.messages.create({
      contentSid: templateSid,
      from: TWILIO_WHATSAPP_NUMBER,
      to: testUser.phone_number,
      contentVariables: JSON.stringify({
        "1": testUser.profile_name,      // maps to {{1}} in body
        "2": testContent.practice_text,  // maps to {{2}}
        "3": testContent.sanskrit_verse, // maps to {{3}}
        "4": testContent.hinglish_verse  // maps to {{4}}
      }),
    });

    console.log(`✅ Test message sent to ${testUser.phone_number}`);
  } catch (err) {
    console.error(
      `❌ Error sending test message to ${testUser.phone_number}:`,
      err.message
    );
  }
}

/* ---------------- Run ---------------- */
console.log("Scheduler started for a one-time test.");
runTestMessageJob();
