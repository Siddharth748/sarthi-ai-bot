// scheduler.js - Sends Daily Morning Messages to ALL Users
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import twilio from "twilio";
import { parse } from "csv-parse/sync";
import cron from "node-cron";
import pg from "pg";

const { Pool } = pg;

/* ---------------- Config ---------------- */
const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_WHATSAPP_NUMBER = (process.env.TWILIO_WHATSAPP_NUMBER || "").trim();
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

/* ---------------- Helpers ---------------- */
async function sendDailyMessage(destination, content) {
    if (!TWILIO_WHATSAPP_NUMBER) {
        console.warn(`(Simulated Daily Message -> ${destination})`);
        return;
    }
    try {
        const messageBody = `Hare Krishna 🙏\n\n${content.sanskrit_verse}\n${content.hinglish_verse}\n\n*Morning Practice:*\n${content.practice_text}\n\n---\n*Share this blessing! To get your own daily guidance from SarathiAI, click here:*\nhttps://wa.me/${TWILIO_WHATSAPP_NUMBER.replace('whatsapp:+', '')}?text=Hi`;
        
        await twilioClient.messages.create({
            from: TWILIO_WHATSAPP_NUMBER,
            to: destination,
            body: messageBody,
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

async function getAllUsers() {
    try {
        const res = await dbPool.query('SELECT phone_number FROM users');
        return res.rows.map(row => row.phone_number);
    } catch (err) {
        console.error("❌ Error fetching users from DB:", err);
        return [];
    }
}

/* ---------------- Scheduler Logic ---------------- */
console.log("Scheduler started. Waiting for the scheduled time...");

// Schedule to run at 7:00 AM IST.
// IST is UTC+5:30, so 7:00 AM IST is 1:30 AM UTC.
cron.schedule('30 1 * * *', async () => {
    console.log('⏰ Firing daily morning message job...');
    const content = loadDailyContent();
    const allUsers = await getAllUsers();
    
    if (content.length === 0 || allUsers.length === 0) {
        console.log("No content or no users. Skipping job.");
        return;
    }
    
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const dayIndex = dayOfYear % content.length;
    const todaysContent = content[dayIndex];
    
    console.log(`Sending content for day ${todaysContent.day_id} to ${allUsers.length} user(s).`);
    
    for (const phone of allUsers) {
        await sendDailyMessage(phone, todaysContent);
        await new Promise(resolve => setTimeout(resolve, 1000)); 
    }

}, {
    scheduled: true,
    timezone: "UTC"
});
