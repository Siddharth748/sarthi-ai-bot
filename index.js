// index.js — SarathiAI (v8.2 - Small Talk & Fallback Fix)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import twilio from "twilio";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Config / env ---------------- */
const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;
const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_SANDBOX_NUMBER = "whatsapp:+14155238886";
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();
const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim();
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/* ---------------- Session & Memory ---------------- */
const sessions = new Map();
function getSession(phone) {
  const now = Date.now();
  let s = sessions.get(phone);
  if (!s) {
    s = { 
      chat_history: [], 
      conversation_stage: "new_topic", 
      last_verse_id: null,
      last_topic_summary: null,
      last_seen_ts: now,
      last_checkin_sent_ts: 0
    };
    sessions.set(phone, s);
  }
  s.last_seen_ts = now;
  return s;
}

/* ---------------- Startup logs ---------------- */
console.log("\n🚀", BOT_NAME, "starting with Advanced Conversational Engine...");
console.log("📦 TWILIO_ACCOUNT_SID:", TWILIO_ACCOUNT_SID ? "[LOADED]" : "[MISSING]");
console.log();


/* ---------------- Provider & AI Helpers ---------------- */
async function sendViaTwilio(destination, replyText) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        console.warn(`(Simulated -> ${destination}): ${replyText}`);
        return;
    }
    try {
        await twilioClient.messages.create({ from: TWILIO_SANDBOX_NUMBER, to: destination, body: replyText });
        console.log(`✅ Twilio message sent to ${destination}`);
    } catch (err) {
        console.error("❌ Error sending to Twilio:", err.message);
    }
}

async function openaiChat(messages, maxTokens = 400) {
  if (!OPENAI_KEY) return null;
  const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.7 };
  const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 25000 });
  return resp.data?.choices?.[0]?.message?.content;
}

async function transformQueryForRetrieval(userQuery) {
  const systemPrompt = `You are an expert in the Bhagavad Gita. Transform a user's query into a concise search term describing the underlying spiritual concept. Examples:\n- User: "I am angry at my husband" -> "overcoming anger in relationships"\n- User: "He is so narcissistic" -> "dealing with ego and arrogance"\nOnly return the transformed query.`;
  const response = await openaiChat([{ role: "system", content: systemPrompt }, { role: "user", content: userQuery }], 50);
  const transformed = response ? response.replace(/"/g, "").trim() : userQuery;
  console.log(`ℹ Transformed Query: "${userQuery}" -> "${transformed}"`);
  return transformed;
}

/* ---------------- Pinecone Helpers ---------------- */
async function pineconeQuery(vector, topK = 1) {
  if (!PINECONE_HOST || !PINECONE_API_KEY) throw new Error("Pinecone config missing");
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/query`;
  const body = { vector, topK, includeMetadata: true, namespace: "verse" };
  const resp = await axios.post(url, body, { headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" }, timeout: 20000 });
  return resp.data;
}
async function getEmbedding(text) {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY missing");
  const resp = await axios.post("https://api.openai.com/v1/embeddings", { model: EMBED_MODEL, input: text }, { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 30000 });
  return resp.data.data[0].embedding;
}

/* ---------------- Payload Extraction & Greeting/Small Talk Logic ---------------- */
function extractPhoneAndText(body) {
    return { phone: body.From, text: body.Body };
}

function normalizeTextForSmallTalk(s) {
  if (!s) return "";
  return String(s).trim().toLowerCase().replace(/[^\w\s]/g," ").replace(/\s+/g," ").trim();
}

function isGreeting(text) {
  if (!text) return false;
  const t = normalizeTextForSmallTalk(text);
  const greetings = new Set(["hi","hii","hello","hey","namaste","hare krishna","harekrishna"]);
  return greetings.has(t);
}

// ✅ FIX #1: Restored the isSmallTalk function
const CONCERN_KEYWORDS = ["stress", "anxiety", "depressed", "depression", "angry", "anger", "sleep", "insomnia", "panic", "suicidal", "sad", "lonely"];

function isSmallTalk(text) {
    if (!text) return false;
    const t = normalizeTextForSmallTalk(text);

    // If it includes a major concern, it's NOT small talk.
    for (const keyword of CONCERN_KEYWORDS) {
        if (t.includes(keyword)) return false;
    }
    
    // Check for specific small talk phrases.
    const smalls = new Set([
      "how are you", "how are you doing", "how r you", "how ru", "how are u",
      "thanks", "thank you", "thx", "ok", "okay", "good", "nice",
      "cool", "bye", "see you", "k"
    ]);
    if (smalls.has(t)) return true;

    return false;
}


/* ---------------- NEW: State-Aware AI Prompts ---------------- */
const RAG_SYSTEM_PROMPT = `You are SarathiAI. A user is starting a new conversation. You have a relevant Gita verse as context. Your task is to introduce this verse and its core teaching.
- Your entire response MUST use "||" as a separator for each message bubble.
- Part 1: The Sanskrit verse.
- Part 2: The Hinglish translation.
- Part 3: Start with "Shri Krishna kehte hain:", a one-sentence essence in Hinglish, then a 2-3 sentence explanation.
- Part 4: A simple follow-up question.
- Example: "[Sanskrit]" || "[Hinglish]" || "Shri Krishna kehte hain: [Essence]. [Explanation]." || "[Follow-up?]"`;

const CHAT_SYSTEM_PROMPT = `You are SarathiAI, a compassionate Gita guide, in the middle of a conversation. The user's chat history is provided.
- Listen, be empathetic, and continue the conversation naturally.
- Offer wisdom based on Gita's principles (detachment, duty, self-control) IN YOUR OWN WORDS. Do NOT quote new verses.
- Keep replies very short (1-3 sentences).
- If you detect the user is introducing a completely new problem, end your response with the special token: [NEW_TOPIC]`;

/* ---------------- Other Small Helpers ---------------- */
function safeText(md, key) {
  return (md && md[key] && String(md[key]).trim()) || "";
}

/* ---------------- Webhook - The New State Machine ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound raw payload:", JSON.stringify(req.body, null, 2));
    res.status(200).send(); 

    const { phone, text } = extractPhoneAndText(req.body);
    if (!phone || !text) return console.log("ℹ No actionable message — skip.");

    const session = getSession(phone);
    
    const welcomeMessage = `Hare Krishna 🙏\n\nI am Sarathi, your companion on this journey.\nHow can I help you today?`;
    
    if (isGreeting(text)) {
        console.log(`[Action: Greeting] for ${phone}`);
        session.conversation_stage = "new_topic";
        session.chat_history = [];
        await sendViaTwilio(phone, welcomeMessage);
        return;
    }

    // ✅ FIX #1: Added the isSmallTalk check back into the logic
    if (isSmallTalk(text)) {
        console.log(`[Action: Small Talk] for ${phone}`);
        const smallTalkReply = `Hare Krishna 🙏 I am here to listen and offer guidance from the Gita. How can I help you today?`;
        await sendViaTwilio(phone, smallTalkReply);
        // We add to history but don't change the conversation stage
        session.chat_history.push({ role: 'user', content: text });
        session.chat_history.push({ role: 'assistant', content: smallTalkReply });
        return;
    }

    session.chat_history.push({ role: 'user', content: text });
    if (session.chat_history.length > 8) {
        session.chat_history = session.chat_history.slice(-8);
    }
    
    // --- STATE MACHINE LOGIC ---
    if (session.conversation_stage === "new_topic") {
        console.log(`[State: new_topic] for ${phone}`);
        const transformedQuery = await transformQueryForRetrieval(text);
        const qVec = await getEmbedding(transformedQuery);
        const matches = await pineconeQuery(qVec);

        const verseMatch = matches?.matches?.[0];
        // ✅ FIX #2: Improved the fallback message
        if (!verseMatch || verseMatch.score < 0.75) {
            const betterFallback = "I hear your concern. Could you please share a little more about what is on your mind so I can offer the best guidance?";
            await sendViaTwilio(phone, betterFallback);
            return;
        }

        const verseSanskrit = safeText(verseMatch.metadata, "sanskrit");
        const verseHinglish = safeText(verseMatch.metadata, "hinglish1");
        const verseContext = `Sanskrit: ${verseSanskrit}\nHinglish: ${verseHinglish}`;
        
        const modelUser = `User's problem: "${text}"\n\nContext from Gita:\n${verseContext}`;
        const aiResponse = await openaiChat([{ role: "system", content: RAG_SYSTEM_PROMPT }, { role: "user", content: modelUser }]);

        if (aiResponse) {
            const messageParts = aiResponse.split("||").map(p => p.trim());
            for (const part of messageParts) {
                if (part) {
                    await sendViaTwilio(phone, part);
                    await new Promise(resolve => setTimeout(resolve, 1500)); 
                }
            }
            
            session.chat_history.push({ role: 'assistant', content: aiResponse.replace(/\|\|/g, '\n') });
            session.last_verse_id = verseMatch.id;
            session.last_topic_summary = text;
            session.conversation_stage = "chatting"; 
        }

    } else if (session.conversation_stage === "chatting") {
        console.log(`[State: chatting] for ${phone}`);
        const aiResponse = await openaiChat([
            { role: "system", content: CHAT_SYSTEM_PROMPT },
            ...session.chat_history
        ]);

        if (aiResponse) {
            if (aiResponse.includes("[NEW_TOPIC]")) {
                const cleanResponse = aiResponse.replace("[NEW_TOPIC]", "").trim();
                if (cleanResponse) await sendViaTwilio(phone, cleanResponse);
                await sendViaTwilio(phone, "It sounds like we're moving to a new topic. Let me find a teaching for that...");
                session.conversation_stage = "new_topic";
            } else {
                await sendViaTwilio(phone, aiResponse);
                session.chat_history.push({ role: 'assistant', content: aiResponse });
            }
        }
    }

  } catch (err) {
    console.error("❌ Webhook processing error:", err.message);
  }
});

/* ---------------- Root, Admin, Proactive Check-in ---------------- */
app.get("/", (_req, res) => res.send(`${BOT_NAME} is running with Advanced Conversational Engine ✅`));

async function proactiveCheckin() {
  const now = Date.now();
  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

  for (const [phone, session] of sessions) {
    if (now - session.last_seen_ts > FORTY_EIGHT_HOURS_MS && now - (session.last_checkin_sent_ts || 0) > FORTY_EIGHT_HOURS_MS && session.last_topic_summary) {
      console.log(`Sending proactive check-in to ${phone} about "${session.last_topic_summary}"`);
      
      const prompt = `A user was previously concerned about "${session.last_topic_summary}". Write a single, short, gentle check-in message (in English) asking how they are doing with that specific issue. Be warm and encouraging.`;
      const careMessage = await openaiChat([{ role: "system", content: "You are a caring companion." }, { role: "user", content: prompt }], 100);

      if (careMessage) {
        await sendViaTwilio(phone, careMessage);
        session.last_checkin_sent_ts = now;
      }
    }
  }
}
setInterval(proactiveCheckin, 6 * 60 * 60 * 1000); 


/* ---------------- Start server ---------------- */
app.listen(PORT, () => console.log(`${BOT_NAME} listening on port ${PORT}`));
