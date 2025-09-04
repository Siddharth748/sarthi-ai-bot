// scheduler.js - Minimal Test for Twilio WhatsApp Template

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
  console.log("⏰ Sending test message with exactly 4 variables...");

  try {
    await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to: "whatsapp:+918427792857", // your number
      contentSid: "HXd9a2d4dcd3b22cf925233c45b2b595c1",
      contentVariables: JSON.stringify({
        "1": "Siddharth", 
        "2": "Morning practice: Take 3 deep breaths.",
        "3": "You are stronger than you think.",
        "4": "Keep faith, act with focus."
      }),
    });

    console.log("✅ Test message sent successfully!");
  } catch (err) {
    console.error("❌ Error sending test message:", err.message);
  }
}

/* ---------------- Run ---------------- */
console.log("Scheduler started for one-time test.");
runTestMessageJob();
