// scheduler.js - Handles sending daily morning messages
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
async function sendDailyMessage(destination, content) {
    if (!TWILIO_WHATSAPP_NUMBER) {
        console.warn(`(Simulated Daily Message -> ${destination})`);
        return;
    }
    try {
        // Send the image with the verse and practice as the caption
        await twilioClient.messages.create({
            from: TWILIO_WHATSAPP_NUMBER,
            to: destination,
            body: `${content.sanskrit_verse}\n${content.hinglish_verse}\n\n*Morning Practice:*\n${content.practice_text}`,
            mediaUrl: [content.image_url]
        });
        console.log(`✅ Daily message sent to ${destination}`);
    } catch (err) {
        console.error(`❌ Error sending daily message to ${destination}:`, err.message);
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

function getSubscribers() {
    const subsPath = path.join(process.cwd(), "subscribers.txt");
    if (!fs.existsSync(subsPath)) {
        return [];
    }
    return fs.readFileSync(subsPath, 'utf-8').split('\n').filter(Boolean);
}

/* ---------------- Scheduler Logic ---------------- */
console.log("Scheduler started. Waiting for the scheduled time...");

// Schedule to run at 6:30 AM IST every day.
// IST is UTC+5:30, so 6:30 AM IST is 1:00 AM UTC.
cron.schedule('30 1 * * *', () => {
    console.log('⏰ Firing daily morning message job...');
    const content = loadDailyContent();
    const subscribers = getSubscribers();
    
    if (content.length === 0 || subscribers.length === 0) {
        console.log("No content or no subscribers. Skipping job.");
        return;
    }
    
    // Rotate content daily
    const dayIndex = new Date().getDate() % content.length;
    const todaysContent = content[dayIndex];
    
    console.log(`Sending content for day ${todaysContent.day_id} to ${subscribers.length} subscribers.`);
    
    subscribers.forEach(phone => {
        sendDailyMessage(phone, todaysContent);
    });

}, {
    scheduled: true,
    timezone: "UTC"
});
