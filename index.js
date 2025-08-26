// index.js — SarathiAI (v10.0 - FINAL with Intelligent Cool-down)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import twilio from "twilio";
import pg from "pg";

const { Pool } = pg;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Config / env ---------------- */
const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;
const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_WHATSAPP_NUMBER = (process.env.TWILIO_WHATSAPP_NUMBER || "").trim();
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();
const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim();
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const PINECONE_NAMESPACE = (process.env.PINECONE_NAMESPACE || "verse").trim();
const PINECONE_NAMESPACES = (process.env.PINECONE_NAMESPACES || "").trim();
const TRAIN_SECRET = process.env.TRAIN_SECRET || null;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

/* ---------------- Database & Session Memory ---------------- */
async function setupDatabase() {
    try {
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS users (
                phone_number VARCHAR(255) PRIMARY KEY,
                subscribed_daily BOOLEAN DEFAULT FALSE,
                last_activity_ts TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                cooldown_message_sent BOOLEAN DEFAULT FALSE
            );
        `);
        console.log("✅ Database table 'users' is ready.");
    } catch (err) {
        console.error("❌ Error setting up database table:", err);
    }
}

async function getUserSession(phone) {
    let result = await dbPool.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
    if (result.rows.length === 0) {
        await dbPool.query('INSERT INTO users (phone_number) VALUES ($1)', [phone]);
        result = await dbPool.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
    }
    return result.rows[0];
}

async function updateUserActivity(phone) {
    // Reset the cooldown flag on any new message and update the timestamp
    await dbPool.query('UPDATE users SET last_activity_ts = CURRENT_TIMESTAMP, cooldown_message_sent = FALSE WHERE phone_number = $1', [phone]);
}


/* ---------------- Provider & AI Helpers (sendViaTwilio, openaiChat, etc.) ---------------- */
// These functions (sendViaTwilio, openaiChat, transformQuery, pineconeQuery, etc.)
// remain the same as our last fully functional version.
async function sendViaTwilio(destination, replyText) { /* ... same as before ... */ }
async function openaiChat(messages, maxTokens = 400) { /* ... same as before ... */ }
async function getEmbedding(text) { /* ... same as before ... */ }
// ... and so on for all helpers.

/* ---------------- Webhook - The Final State Machine ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound raw payload:", JSON.stringify(req.body, null, 2));
    res.status(200).send(); 

    const { phone, text } = extractPhoneAndText(req.body);
    if (!phone || !text) return;

    const session = await getUserSession(phone);
    const now = new Date();
    const lastActivity = new Date(session.last_activity_ts);
    const minutesSinceLastActivity = (now - lastActivity) / (1000 * 60);

    // ✅ NEW: Intelligent Cool-down Logic
    if (minutesSinceLastActivity > 30 && !session.cooldown_message_sent) {
        console.log(`[Action: Cool-down] for ${phone}`);
        const cooldownImage = "https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/images/Gemini_Generated_Image_x0pm5kx0pm5kx0pm.png";
        const cooldownQuote = `"कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।\nKarmanye vadhikaraste, ma phaleshu kadachana."\n\n(Focus on your actions, not the results.)`;
        const cooldownPractice = "A simple practice: Take three deep breaths and focus on the present moment.";
        const optInMessage = `I hope you are having a peaceful day.\n\nWould you like to receive a short, inspiring message like this every morning? Reply with "Yes Daily" to subscribe.`;

        // Using a text-only message for the cool-down to ensure deliverability
        await sendViaTwilio(phone, `${cooldownQuote}\n\n${cooldownPractice}`);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Pause
        await sendViaTwilio(phone, optInMessage);
        
        await dbPool.query('UPDATE users SET cooldown_message_sent = TRUE WHERE phone_number = $1', [phone]);
        return; // End processing for this turn
    }

    await updateUserActivity(phone); // Update the activity timestamp for every new message

    const incoming = String(text).trim().toLowerCase();

    if (incoming === 'yes daily') {
        console.log(`[Action: Subscription] for ${phone}`);
        await dbPool.query('UPDATE users SET subscribed_daily = TRUE WHERE phone_number = $1', [phone]);
        await sendViaTwilio(phone, "Thank you for subscribing! You will now receive a daily morning message from SarathiAI. 🙏");
        return;
    }

    // ... (Your existing isGreeting, isSmallTalk, and RAG query logic goes here) ...
    
    // Example default reply for now
    await sendViaTwilio(phone, "I am listening. Please share what is on your mind.");


  } catch (err) {
    console.error("❌ Webhook processing error:", err.message);
  }
});

/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
    console.log(`\n🚀 ${BOT_NAME} is listening on port ${PORT}`);
    setupDatabase(); 
});
