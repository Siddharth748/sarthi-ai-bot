// index.js — RAG-enabled SarathiAI (ESM)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import { spawn } from "child_process";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;

// Gupshup / OpenAI / Pinecone envs
const GS_API_KEY = (process.env.GS_API_KEY || "").trim();
const GS_SOURCE  = (process.env.GS_SOURCE || "").trim();
const SEND_URL   = (process.env.GUPSHUP_SEND_URL || "https://api.gupshup.io/wa/api/v1/msg").trim();

const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();

const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim(); // e.g. https://<index>-<proj>.svc.us-east-1.pinecone.io
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || "verses";

const TRAIN_SECRET = process.env.TRAIN_SECRET || null;

// Basic startup logs
console.log("\n🚀", BOT_NAME, "starting...");
console.log("📦 GS_SOURCE:", GS_SOURCE || "[MISSING]");
console.log("📦 OPENAI_MODEL:", OPENAI_MODEL, " EMBED_MODEL:", EMBED_MODEL);
console.log("📦 PINECONE_HOST:", PINECONE_HOST ? "[LOADED]" : "[MISSING]");

// ---------------- Helpers ----------------

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
      timeout: 15000
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
    { model: EMBED_MODEL, input: text },
    { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 20000 }
  );
  return resp.data.data[0].embedding;
}

async function openaiChat(messages, maxTokens = 600) {
  if (!OPENAI_KEY) {
    console.warn("⚠ OPENAI_API_KEY not set — returning fallback.");
    return null;
  }
  const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.7 };
  const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
    headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 20000
  });
  const content = resp.data?.choices?.[0]?.message?.content || resp.data?.choices?.[0]?.text || null;
  return content;
}

// Query Pinecone (REST)
async function pineconeQuery(vector, topK = 4, namespace = PINECONE_NAMESPACE) {
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

// Robust extractor (Gupshup shapes)
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

// Format retrieved Pinecone items into a context string
function formatRetrievedItems(matches) {
  // matches: array of { id, score, metadata }
  return matches.map((m, i) => {
    const md = m?.metadata || {};
    const san = md.sanskrit || md.Sanskrit || "";
    const hing = md.hinglish1 || md.hinglish || md.Hinglish || "";
    const eng = md.english || md["Translation (English)"] || "";
    const ref = md.ref || md.reference || md.source_id || md.id || "";
    const summ = md.summary || "";
    return `REF:${ref}\nSanskrit: ${san}\nHinglish: ${hing}\nEnglish: ${eng}\nSummary: ${summ}`;
  }).join("\n\n---\n\n");
}

// System prompt that enforces use of retrieved context & style
const SYSTEM_PROMPT = `You are SarathiAI — a friendly, compassionate guide inspired by Shri Krishna (Bhagavad Gita).
Tone: Modern, empathetic, short paragraphs. Always ground advice ONLY ON THE PROVIDED CONTEXTS (verses/commentary/practices) below. 
Do NOT hallucinate new verses. Begin the response with: "Shri Krishna kehte hain:" followed by a one-line essence. 
Then give a 2-4 sentence applied explanation tailored to the user's message. If a short practice is available, suggest it (<= 90s). 
Finish with citation lines listing the reference IDs used (like "Ref: GITA_02_47"). 
If the context is insufficient, say so gently and offer a short practice instead.`;

// ---------------- Webhook ----------------
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound raw payload:", JSON.stringify(req.body));
    res.status(200).send("OK"); // ACK quickly

    const { phone, text } = extractPhoneAndText(req.body);
    console.log("Detected userPhone:", phone, "userText:", text);
    if (!phone || !text) { console.log("ℹ No actionable user message — skip."); return; }

    // 1) embed query
    let qVec;
    try {
      qVec = await openaiEmbedding(text);
    } catch (e) {
      console.error("❌ Embedding failed:", e?.message || e);
      // fallback to direct chat
      const ai = await openaiChat([{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: text }]);
      const fallback = ai || `Hare Krishna — I heard: "${text}" — can you tell me more?`;
      await sendViaGupshup(phone, fallback);
      return;
    }

    // 2) query Pinecone
    let pine;
    try {
      pine = await pineconeQuery(qVec, 5); // top 5
    } catch (e) {
      console.error("❌ Pinecone query failed:", e?.message || e);
      const ai = await openaiChat([{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: text }]);
      const fallback = ai || `Hare Krishna — I heard: "${text}" — can you tell me more?`;
      await sendViaGupshup(phone, fallback);
      return;
    }

    // 3) build prompt using retrieved items
    const matches = pine?.matches || [];
    const contextText = formatRetrievedItems(matches);
    const userPrompt = `User message: ${text}

Retrieved Contexts:
${contextText || "(none)"}

Respond as SarathiAI using ONLY the retrieved contexts.`;

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ];

    // 4) call OpenAI for final reply
    let finalReply = null;
    try {
      const aiReply = await openaiChat(messages, 700);
      finalReply = aiReply && aiReply.trim().length ? aiReply.trim() : null;
    } catch (e) {
      console.error("❌ OpenAI chat failed:", e?.message || e);
    }

    if (!finalReply) finalReply = `Hare Krishna 🙏 — I heard: "${text}". I am here to help. Could you say a bit more?`;

    // 5) send via Gupshup
    const sendResult = await sendViaGupshup(phone, finalReply);
    if (!sendResult.ok && !sendResult.simulated) {
      console.error("❗ Problem sending reply:", sendResult);
    }
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    try { res.status(200).send("OK"); } catch (_) {}
  }
});

// Simple root
app.get("/", (_req, res) => res.send(`${BOT_NAME} with RAG is running ✅`));

// Admin /train endpoint (existing — keep the same background runner)
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
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.write("Starting ingestion...\n");
  runCommand("node", ["ingest_all.js"],
    (line) => { try { res.write(line); } catch(e){} },
    (code) => { res.write(`\nProcess exited with code ${code}\n`); res.end(); }
  );
});

// Admin retrieval test endpoint — uses same pipeline (embedding -> pinecone -> openai)
app.get("/test-retrieval", async (req, res) => {
  const secret = req.query.secret;
  if (!TRAIN_SECRET || secret !== TRAIN_SECRET) return res.status(403).send("Forbidden");
  const query = req.query.query || "I am stressed about exams";
  try {
    const vec = await openaiEmbedding(query);
    const pine = await pineconeQuery(vec, 5);
    const matches = pine?.matches || [];
    const ctx = formatRetrievedItems(matches);
    const userPrompt = `User message: ${query}\n\nRetrieved Contexts:\n${ctx || "(none)"}\n\nRespond as SarathiAI using ONLY the contexts.`;
    const aiReply = await openaiChat([{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }], 700);
    return res.status(200).json({ query, retrieved: matches, reply: aiReply });
  } catch (e) {
    return res.status(500).json({ error: e?.message || e });
  }
});

// Start server
app.listen(PORT, () => console.log(`${BOT_NAME} listening on port ${PORT}`));
