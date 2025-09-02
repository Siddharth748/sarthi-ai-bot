// scheduler.js - FINAL Version (Sends Approved Template to ALL Users with immediate trigger)
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
        const templateSid = "HXbfe20bd3ac3756dbd9e36988c21a7d90"; // Your approved Template SID

        // This text will be inserted into the {{2}} variable of your template
        const guidanceText = `${content.sanskrit_verse}\n\n*Morning Practice:*\n${content.practice_text}`;

        await twilioClient.messages.create({
            contentSid: templateSid,
            from: TWILIO_WHATSAPP_NUMBER,
            to: user.phone_number,
            contentVariables: JSON.stringify({
                '1': user.profile_name || "friend", // Variable {{1}}
                '2': guidanceText                  // Variable {{2}}
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

async function getAllUsers() {
    try {
        const res = await dbPool.query('SELECT * FROM users');
        return res.rows;
    } catch (err) {
        console.error("❌ Error fetching users from DB:", err);
        return [];
    }
}

/* ---------------- Main Job Logic ---------------- */
async function runDailyMessageJob() {
    console.log('⏰ Firing daily morning message job...');
    const content = loadDailyContent();
    const allUsers = await getAllUsers();
    
    if (content.length === 0 || allUsers.length === 0) {
        console.log("No content or no users in the database. Skipping job.");
        return;
    }
    
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const dayIndex = dayOfYear % content.length;
    const todaysContent = content[dayIndex];
    
    console.log(`Sending content for day ${todaysContent.day_id} to ${allUsers.length} user(s).`);
    
    for (const user of allUsers) {
        await sendDailyMessage(user, todaysContent);
        await new Promise(resolve => setTimeout(resolve, 1000)); 
    }
}

/* ---------------- Scheduler Logic ---------------- */
console.log("Scheduler started.");

// ✅ NEW: Run the job once immediately on startup for today's message
runDailyMessageJob();

console.log("Waiting for the next scheduled time...");

// Schedule to run at 7:00 AM IST (1:30 AM UTC).
cron.schedule('30 1 * * *', runDailyMessageJob, {
    scheduled: true,
    timezone: "UTC"
});
