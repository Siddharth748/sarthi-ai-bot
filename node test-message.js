// test-message.js
import dotenv from "dotenv";
dotenv.config();

import twilio from "twilio";

/* ---------------- Config ---------------- */
const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_WHATSAPP_NUMBER = (process.env.TWILIO_WHATSAPP_NUMBER || "").trim();

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/* ---------------- Test Message Logic ---------------- */
async function sendTestMessage() {
    try {
        // ✅ Use your approved template SID from Meta
        const templateSid = "HXef3147b89c85a30fe235c861270aba2b";

        // ✅ Replace with your test number
        const testNumber = "whatsapp:+918427792857";

        // ✅ Example reflection text for variable {{1}}
        const reflectionText =
            "The Passing Season: When you feel a strong emotion (joy, sadness, praise, blame), pause for 10s. " +
            "Acknowledge it and mentally say, 'This too is a passing season, I will endure it.'";

        const message = await twilioClient.messages.create({
            contentSid: templateSid,
            from: TWILIO_WHATSAPP_NUMBER,
            to: testNumber,
            contentVariables: JSON.stringify({
                '1': reflectionText
            })
        });

        console.log("✅ Test message sent:", message.sid);
    } catch (err) {
        console.error("❌ Error sending test message:", err.message);
    }
}

sendTestMessage();
