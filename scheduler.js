// scheduler.js - FINAL Version using Approved Meta Template
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
async function sendDailyMessage(user, content) {
    if (!TWILIO_WHATSAPP_NUMBER) {
        console.warn(`(Simulated Daily Message -> ${user.phone_number})`);
        return;
    }
    try {
        // ✅ USING YOUR APPROVED TEMPLATE SID
        const templateSid = "HXbfe20bd3ac3756dbd9e36988c21a7d90";

        const botNumber = TWILIO_WHATSAPP_NUMBER.replace('whatsapp:+', '');
        const chatLink = `https://api.whatsapp.com/send/?phone=${botNumber}&text=Hi&type=phone_number&app_absent=0`;

        const verseAndPractice = `${content.sanskrit_verse}\n${content.hinglish_verse}\n\n*Morning Practice:*\n${content.practice_text}\n\n---\n*Share this blessing! To get your own daily guidance from SarathiAI, click here:*\n${chatLink}`;

        await twilioClient.messages.create({
            contentSid: templateSid,
            from: TWILIO_WHATSAPP_NUMBER,
            to: user.phone_number,
            contentVariables: JSON.stringify({
                '1': user.profile_name || "friend", // Uses a friendly fallback if name is unknown
                '2': verseAndPractice
            })
        });
        console.log(`✅ Daily message template sent to ${user.phone_number}`);
    } catch (err) {
        console.error(`❌ Error sending daily message template to ${user.phone_number}:`, err.message);
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

async function getSubscribedUsers() {
    try {
        // Fetching the whole user object to potentially use the name later
        const res = await dbPool.query('SELECT * FROM users WHERE subscribed_daily = TRUE');
        return res.rows;
    } catch (err) {
        console.error("❌ Error fetching subscribers from DB:", err);
        return [];
    }
}

/* ---------------- Main Job Logic ---------------- */
async function runDailyMessageJob() {
    console.log('⏰ Firing daily morning message job...');
    const content = loadDailyContent();
    const subscribedUsers = await getSubscribedUsers();
    
    if (content.length === 0 || subscribedUsers.length === 0) {
        console.log("No content or no subscribers. Skipping job.");
        return;
    }
    
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const dayIndex = dayOfYear % content.length;
    const todaysContent = content[dayIndex];
    
    console.log(`Sending content for day ${todaysContent.day_id} to ${subscribedUsers.length} subscriber(s).`);
    
    for (const user of subscribedUsers) {
        await sendDailyMessage(user, todaysContent);
        await new Promise(resolve => setTimeout(resolve, 1000)); 
    }
}

/* ---------------- Scheduler Logic ---------------- */
console.log("Scheduler started.");

// Run the job once immediately on startup for today's message
runDailyMessageJob();

console.log("Waiting for the next scheduled time...");

// Schedule to run at 7:00 AM IST.
cron.schedule('30 1 * * *', runDailyMessageJob, {
    scheduled: true,
    timezone: "UTC"
});
