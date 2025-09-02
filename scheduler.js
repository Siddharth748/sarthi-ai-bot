// scheduler.js - FINAL Version (Correct Two-Message Template Usage)
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
        // --- Step 1: Send the approved template to open the conversation window ---
        const templateSid = "HXbfe20bd3ac3756dbd9e36988c21a7d90"; // Your approved SID
        const templateBody = `Hare Krishna, ${user.profile_name || "friend"}. 🙏\n\nYour SarathiAI guidance for today is here:\n\n${content.practice_text}\n\nTo reflect on this teaching, reply to this message.`;

        await twilioClient.messages.create({
            contentSid: templateSid,
            from: TWILIO_WHATSAPP_NUMBER,
            to: user.phone_number,
            contentVariables: JSON.stringify({
                '1': user.profile_name || "friend",
                '2': content.practice_text // Filling the second variable as required by the template
            })
        });
        console.log(`✅ Daily template message sent to ${user.phone_number}`);

        // --- Step 2: Send the rich content message (image, verse, footer) ---
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second pause for better flow

        const botNumber = TWILIO_WHATSAPP_NUMBER.replace('whatsapp:+', '');
        const chatLink = `https://wa.me/${botNumber}?text=Hi`;
        const messageBody = `${content.sanskrit_verse}\n${content.hinglish_verse}\n\n---\n*Share this blessing! New users can start here:*\n${chatLink}`;
        
        await twilioClient.messages.create({
            from: TWILIO_WHATSAPP_NUMBER,
            to: user.phone_number,
            body: messageBody,
            mediaUrl: [content.image_url]
        });
        console.log(`✅ Daily content (image/verse) sent to ${user.phone_number}`);

    } catch (err) {
        console.error(`❌ Error sending daily message to ${user.phone_number}:`, err.message);
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
        await new Promise(resolve => setTimeout(resolve, 2000)); 
    }
}

/* ---------------- Scheduler Logic ---------------- */
console.log("Scheduler started. Waiting for the scheduled time...");

// Schedule to run at 7:00 AM IST (1:30 AM UTC).
cron.schedule('30 1 * * *', runDailyMessageJob, {
    scheduled: true,
    timezone: "UTC"
});
