// scheduler.js - Test Mode (Send to Only One Number)
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import twilio from "twilio";
import { parse } from "csv-parse/sync";
import cron from "node-cron";

/* ---------------- Config ---------------- */
const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_WHATSAPP_NUMBER = (process.env.TWILIO_WHATSAPP_NUMBER || "").trim();

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/* ---------------- Helpers ---------------- */
async function sendDailyMessageToMe(content) {
    try {
        // ✅ Your approved template SID
        const templateSid = "HXef3147b89c85a30fe235c861270aba2b";

        // ✅ Your test number
        const myNumber = "whatsapp:+918427792857";

        // ✅ Variable {{1}} content
        const reflectionText = content.practice_text || "Today’s reflection goes here.";

        const message = await twilioClient.messages.create({
            from: TWILIO_WHATSAPP_NUMBER,
            to: myNumber,
            contentSid: templateSid,
            contentVariables: JSON.stringify({
                "1": reflectionText
            })
        });

        console.log("✅ Test message sent to me:", message.sid);
    } catch (err) {
        console.error("❌ Error sending test message:", err.message);
    }
}

function loadDailyContent() {
    const csvPath = path.join(process.cwd(), "data", "daily_content.csv");
    if (!fs.existsSync(csvPath)) {
        console.error("❌ daily_content.csv not found in /data folder.");
        return [];
    }
    const fileContent = fs.readFileSync(csvPath);
    return parse(fileContent, { columns: true, skip_empty_lines: true });
}

/* ---------------- Main Job Logic ---------------- */
async function runDailyMessageJob() {
    console.log("⏰ Firing daily morning message job (Test Mode)...");

    const content = loadDailyContent();
    if (content.length === 0) {
        console.log("No content in CSV. Skipping job.");
        return;
    }

    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const dayIndex = dayOfYear % content.length;
    const todaysContent = content[dayIndex];

    console.log(`Sending content for day ${todaysContent.day_id} to ONLY my number (test mode).`);
    await sendDailyMessageToMe(todaysContent);
}

/* ---------------- Scheduler Logic ---------------- */
console.log("Scheduler started. Waiting for the scheduled time...");

// Schedule to run at 7:00 AM IST (1:30 AM UTC).
cron.schedule("30 1 * * *", runDailyMessageJob, {
    scheduled: true,
    timezone: "UTC"
});

// Run immediately for quick testing
runDailyMessageJob();
