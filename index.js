// index.js — RAG-enabled SarathiAI (ESM) with greeting/small-talk handling
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import express from "express";
import axios from "axios";
import { spawn } from "child_process";
import path from "path";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------------- Config / env ---------------------- */
const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;

// Gupshup
const GS_API_KEY = (process.env.GS_API_KEY || "").trim();
const GS_SOURCE = (process.env.GS_SOURCE || "").trim();
const SEND_URL = (process.env.GUPSHUP_SEND_URL || "https://api.gupshup.io/wa/api/v1/msg").trim();

// OpenAI
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();

// Pinecone (REST)
const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim();
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || "verses";

// Admin secret
const TRAIN_SECRET = process.env.TRAIN_SECRET || null;

/* ---------------------- Startup logs ---------------------- */
console.log("\n🚀", BOT_NAME, "starting...");
console.log("📦 GS_SOURCE:", GS_SOURCE || "[MISSING]");
console.log("📦 OPENAI_MODEL:", OPENAI_MODEL, " EMBED_MODEL:", EMBED_MODEL);
console.log("📦 PINECONE_HOST:", PINECONE_HOST ? "[LOADED]" : "[MISSING]");
console.log("📦 TRAIN_SECRET:", TRAIN_SECRET ? "[LOADED]" : "[MISSING]");
console.log();

/* ---------------------- Helpers ---------------------- */

async function sendViaGupshup(destination, replyText) {
  if (!GS_API_KEY || !GS_SOURCE) {
    console.warn("⚠ Gupshup key/source missing — simulating send:");
    console.log(`(Simulated -> ${destination}): ${replyText}`);
    return { simulated: true };
  }
  const form = new URLSearchParams();
  form.append("channel", "whatsapp");
  form.append("source", String(GS_SOURCE));
  form.append("destination", String(destination));
  form.append("message", JSON.stringify({ type: "text", text: replyText }));
  form.append("src.name", BOT_NAME);

  try {
    const resp = await axios.post(SEND_URL, form.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded", apikey: GS_API_KEY },
      timeout: 20000
    });
    console.log("✅ Gupshup send status:", resp.status);
    return { ok: true, resp: resp.data };
  } catch (err) {
    console.error("❌ Error sending to Gupshup:", err?.response?.status, err?.response?.data || err.message);
    return { ok: false, status: err?.response?.status, body: err?.response?.data || err.message };
  }
}

async function openaiEmbedding(text) {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY missing");
  const resp = await axios.post("https://api.openai.com/v1/embeddings",
    { model: EMBED_MODEL, input: Array.isArray(text) ? text : [text] },
    { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 30000 }
  );
  // If input array, return array of embeddings; else first embedding
  if (Array.isArray(text)) return resp.data.data.map(d => d.embedding);
  return resp.data.data[0].embedding;
}

async function openaiChat(messages, maxTokens = 600) {
  if (!OPENAI_KEY) {
    console.warn("⚠ OPENAI_API_KEY not set — skipping OpenAI call.");
    return null;
  }
  const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.65 };
  const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
    headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 20000
  });
  return resp.data?.choices?.[0]?.message?.content || resp.data?.choices?.[0]?.text || null;
}

// Pinecone REST query
async function pineconeQuery(vector, topK = 3, namespace = PINECONE_NAMESPACE) {
  if (!PINECONE_HOST || !PINECONE_API_KEY) throw new Error("Pinecone config missing");
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/query`;
  const body = {
    vector,
    topK,
    includeMetadata: true,
    namespace
  };
  const resp = await axios.post(url, body, {
    headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" },
    timeout: 20000
  });
  return resp.data;
}

/* ---------------------- Payload extraction ---------------------- */
function extractPhoneAndText(body) {
  if (!body) return { phone: null, text: null, rawType: null };
  let phone = null, text = null;
  const rawType = body.type || null;

  if (body.type === "message" && body.payload) {
    phone = body.payload?.sender?.phone || body.payload?.source || null;
    text = body.payload?.payload?.text || body.payload?.text || (typeof body.payload?.payload === "string" ? body.payload.payload : null);
    if (!text && body.payload?.payload?.caption) text = body.payload.payload.caption;
  }
  if (!phone) phone = body.sender?.phone || body.source || body.from || null;
  if (!text) text = body.payload?.text || body.text || body.message?.text || null;
  if (phone) phone = String(phone).replace(/\D/g, "");
  return { phone, text, rawType };
}

/* ---------------------- Greeting & small-talk detection ---------------------- */
function isGreeting(text) {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  const simple = ["hi","hii","hello","hey","namaste","hare krishna","harekrishna","good morning","good evening","gm","greetings"];
  if (simple.includes(t)) return true;
  if (/^h+i+!*$/.test(t)) return true;
  if (t.length <= 8 && /\b(hello|hi|hey|namaste|hare)\b/.test(t)) return true;
  return false;
}
function isSmallTalk(text) {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  const smalls = [
    "how are you","how r u","how ru","how are u","how's it going","whats up","what's up",
    "thanks","thank you","thx","ok","okay","good","nice","cool","bye","see you","k"
  ];
  if (smalls.includes(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 3 && !t.includes("?") && !t.includes("please") && !t.includes("need") && !t.includes("help")) return true;
  if (/\b(how|what|why|where)\b/.test(t) && t.length < 30 && t.includes("how")) return true;
  return false;
}

/* ---------------------- Message templates ---------------------- */
const WELCOME_TEMPLATE = `Hare Krishna 🙏

I am Sarathi, your companion on this journey.
Think of me as a link between your mann ki baat and the Gita's timeless gyaan.

Feeling confused, lost, facing a duvidha, searching for your raasta, or just need a saathi to listen? Let's talk and find the Gita's roshni together. ✨

You can say things like:
• "I'm stressed about exams"
• "I am angry with someone"
• "I need help sleeping"

How can I help you today?`;

const SMALLTALK_REPLY = `Hare Krishna 🙏 — I'm Sarathi, happy to meet you.

If you'd like, pick one:
1) Stress / Anxiety
2) Anger / Relationships
3) Sleep / Calm
4) Daily practice

Reply with the number or type your concern (for example: "I'm stressed about exams").`;

/* ---------------------- Format retrieved items ---------------------- */
function formatRetrievedItems(matches) {
  return (matches || []).map(m => {
    const md = m?.metadata || {};
    const ref = md.reference || md.ref || md.id || m.id || "unknown";
    const sanskrit = (md.sanskrit || md.Sanskrit || "").trim();
    const hinglish = (md.hinglish1 || md.hinglish || md.Hinglish || md.hinglish2 || "").trim();
    const translation = (md.translation || md["Translation (English)"] || md.english || "").trim();
    const summary = (md.summary || md["Summary"] || "").trim();
    const preview = md.preview || "";

    // Compose a short block that’s safe if some fields are empty
    const parts = [];
    parts.push(`Ref:${ref}`);
    if (sanskrit) parts.push(`Sanskrit: ${sanskrit}`);
    if (hinglish) parts.push(`Hinglish: ${hinglish}`);
    if (translation) parts.push(`Translation: ${translation}`);
    if (summary) parts.push(`Summary: ${summary}`);
    if (!sanskrit && !translation && preview) parts.push(`Preview: ${preview}`);

    return parts.join("\n");
  }).join("\n\n---\n\n");
}

/* ---------------------- System prompt ---------------------- */
const SYSTEM_PROMPT = `You are SarathiAI — a friendly, compassionate guide inspired by Shri Krishna (Bhagavad Gita).
Tone: Modern, empathetic, short paragraphs.
IMPORTANT: Use ONLY the provided Retrieved Contexts (below) to answer. Do NOT make up or hallucinate verses.

Behavior:
1) Begin response with: "Shri Krishna kehte hain:" followed by a one-line essence.
2) If a retrieved verse includes Sanskrit/Hinglish, quote up to two short lines of Sanskrit (if present) and provide the Hinglish line.
3) Give a short (2-4 sentence) applied explanation tailored to the user's message.
4) If a short practice is available, suggest it (<= 90s).
5) End with "Ref: <id1>, <id2>" listing used references.
If the retrieved contexts are insufficient, say so gently and offer a short practice or ask a clarifying question.`;

/* ---------------------- Webhook ---------------------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound raw payload:", JSON.stringify(req.body));
    // ACK immediately
    res.status(200).send("OK");

    const { phone, text } = extractPhoneAndText(req.body);
    console.log("Detected userPhone:", phone, "userText:", text);

    if (!phone || !text) {
      console.log("ℹ No actionable user message — skipping AI reply.");
      return;
    }

    const incoming = String(text).trim();

    // 1) Greeting -> welcome
    if (isGreeting(incoming)) {
      console.log("ℹ Detected greeting — sending welcome.");
      await sendViaGupshup(phone, WELCOME_TEMPLATE);
      return;
    }

    // 2) Small talk -> short menu
    if (isSmallTalk(incoming)) {
      console.log("ℹ Detected small-talk — sending menu.");
      await sendViaGupshup(phone, SMALLTALK_REPLY);
      return;
    }

    // 3) Substantive query -> RAG flow
    // 3a) embed
    let qVec;
    try {
      qVec = await openaiEmbedding(incoming);
    } catch (e) {
      console.error("❌ Embedding failed:", e?.message || e);
      const ai = await openaiChat([{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: incoming }]);
      const fallback = ai || `Hare Krishna — I heard: "${incoming}". Could you tell me more?`;
      await sendViaGupshup(phone, fallback);
      return;
    }

    // 3b) query Pinecone (topK=3)
    let pineResp;
    try {
      pineResp = await pineconeQuery(qVec, 3);
    } catch (e) {
      console.error("❌ Pinecone query failed:", e?.message || e);
      const ai = await openaiChat([{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: incoming }]);
      const fallback = ai || `Hare Krishna — I heard: "${incoming}". Could you tell me more?`;
      await sendViaGupshup(phone, fallback);
      return;
    }

    const matches = pineResp?.matches || [];
    console.log("ℹ Retrieved matches count:", matches.length, matches.map(m => m.id));

    // 3c) If retrieval is weak, fallback to practice or clarifying Q
    const topScore = matches[0]?.score ?? 0;
    if (!matches.length || topScore < 0.12) {
      console.log("⚠ Retrieval weak or empty (score:", topScore, ") — sending gentle fallback practice.");
      // pick a small practice from index if possible (we'll search metadata for "practices" first)
      const practice = (matches.find(m => (m.metadata||{}).source === "practices") || {}).metadata;
      const practiceText = practice?.text || practice?.practice_text || "Try this 90s calming breath: inhale 4s, hold 7s, exhale 8s — repeat 3 times.";
      const fallbackMsg = `Hare Krishna 🙏 — I don't have a direct verse for that right now. ${practiceText}\n\nIf you'd like, can you say a little more about what's troubling you?`;
      await sendViaGupshup(phone, fallbackMsg);
      return;
    }

    // 3d) Build prompt with retrieved contexts
    const contextText = formatRetrievedItems(matches);
    const userPrompt = `User message: ${incoming}

Retrieved Contexts:
${contextText}

Follow these rules: Use ONLY the retrieved contexts above to answer. Quote verse lines if present, then give applied advice, then cite references.`;

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ];

    // 4) Call OpenAI chat for final reply
    let finalReply = null;
    try {
      const aiReply = await openaiChat(messages, 700);
      finalReply = aiReply && aiReply.trim().length ? aiReply.trim() : null;
    } catch (e) {
      console.error("❌ OpenAI chat failed:", e?.message || e);
    }

    if (!finalReply) {
      finalReply = `Hare Krishna 🙏 — I heard: "${incoming}". I am here to help. Could you tell me a little more?`;
    }

    // 5) Send reply
    const sendResult = await sendViaGupshup(phone, finalReply);
    if (!sendResult.ok && !sendResult.simulated) {
      console.error("❗ Problem sending reply:", sendResult);
    }

  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    try { res.status(200).send("OK"); } catch (_) {}
  }
});

/* ---------------------- Root & Admin ---------------------- */
app.get("/", (_req, res) => res.send(`${BOT_NAME} with RAG is running ✅`));

// choose ingest command: prefer ingest_all.cjs if present else ingest_all.js
function findIngestScript() {
  const cjs = path.join(process.cwd(), "ingest_all.cjs");
  const js = path.join(process.cwd(), "ingest_all.js");
  if (fs.existsSync(cjs)) return "ingest_all.cjs";
  if (fs.existsSync(js)) return "ingest_all.js";
  return null;
}

function runCommand(cmd, args = [], onOutput, onExit) {
  const proc = spawn(cmd, args, { shell: true });
  proc.stdout.on("data", (d) => onOutput && onOutput(d.toString()));
  proc.stderr.on("data", (d) => onOutput && onOutput(d.toString()));
  proc.on("close", (code) => onExit && onExit(code));
  return proc;
}

app.get("/train", (req, res) => {
  const secret = req.query.secret;
  if (!TRAIN_SECRET || secret !== TRAIN_SECRET) return res.status(403).send("Forbidden");
  const script = findIngestScript();
  if (!script) return res.status(500).send("No ingest script found (ingest_all.cjs or ingest_all.js)");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.write(`Starting ingestion using ${script}...\n\n`);
  runCommand("node", [script],
    (line) => { try { res.write(line); } catch (e) {} },
    (code) => { res.write(`\nProcess exited with code ${code}\n`); res.end(); }
  );
});

app.get("/test-retrieval", async (req, res) => {
  const secret = req.query.secret;
  if (!TRAIN_SECRET || secret !== TRAIN_SECRET) return res.status(403).send("Forbidden");
  const query = req.query.query || "I am stressed about exams";
  try {
    const vec = await openaiEmbedding(query);
    const pine = await pineconeQuery(vec, 3);
    const matches = pine?.matches || [];
    const ctx = formatRetrievedItems(matches);
    const userPrompt = `User message: ${query}\n\nRetrieved Contexts:\n${ctx || "(none)"}\n\nRespond as SarathiAI using ONLY the contexts.`;
    const aiReply = await openaiChat([{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }], 700);
    return res.status(200).json({ query, retrieved: matches, reply: aiReply });
  } catch (e) {
    return res.status(500).json({ error: e?.message || e });
  }
});

/* ---------------------- Start server ---------------------- */
app.listen(PORT, () => console.log(`${BOT_NAME} listening on port ${PORT}`));
