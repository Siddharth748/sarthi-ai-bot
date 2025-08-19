// index.js — SarathiAI (ESM) — RAG flow with exact output format for substantive queries
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import express from "express";
import axios from "axios";
import { spawn } from "child_process";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Config / env ---------------- */
const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;

const GS_API_KEY = (process.env.GS_API_KEY || "").trim();
const GS_SOURCE = (process.env.GS_SOURCE || "").trim();
const SEND_URL = (process.env.GUPSHUP_SEND_URL || "https://api.gupshup.io/wa/api/v1/msg").trim();

const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();

const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim();
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || "verses";

const TRAIN_SECRET = process.env.TRAIN_SECRET || null;

/* ---------------- Startup logs ---------------- */
console.log("\n🚀", BOT_NAME, "starting...");
console.log("📦 GS_SOURCE:", GS_SOURCE || "[MISSING]");
console.log("📦 OPENAI_MODEL:", OPENAI_MODEL, " EMBED_MODEL:", EMBED_MODEL);
console.log("📦 PINECONE_HOST:", PINECONE_HOST ? "[LOADED]" : "[MISSING]");
console.log("📦 TRAIN_SECRET:", TRAIN_SECRET ? "[LOADED]" : "[MISSING]");
console.log();

/* ---------------- Helpers ---------------- */
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

async function openaiEmbedding(textOrArray) {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY missing");
  const input = Array.isArray(textOrArray) ? textOrArray : [String(textOrArray)];
  const resp = await axios.post("https://api.openai.com/v1/embeddings",
    { model: EMBED_MODEL, input },
    { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 30000 }
  );
  return Array.isArray(textOrArray) ? resp.data.data.map(d => d.embedding) : resp.data.data[0].embedding;
}

async function openaiChat(messages, maxTokens = 600) {
  if (!OPENAI_KEY) {
    console.warn("⚠ OPENAI_API_KEY not set — skipping OpenAI call.");
    return null;
  }
  const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.65 };
  const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
    headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    timeout: 20000
  });
  return resp.data?.choices?.[0]?.message?.content || resp.data?.choices?.[0]?.text || null;
}

async function pineconeQuery(vector, topK = 4, namespace = PINECONE_NAMESPACE) {
  if (!PINECONE_HOST || !PINECONE_API_KEY) throw new Error("Pinecone config missing");
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/query`;
  const body = { vector, topK, includeMetadata: true, namespace };
  const resp = await axios.post(url, body, {
    headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" },
    timeout: 20000
  });
  return resp.data;
}

/* ---------------- Payload extraction ---------------- */
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

/* ---------------- Greeting & small-talk detection ---------------- */
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

/* ---------------- Message templates ---------------- */
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

/* ---------------- Format helpers ---------------- */
function pickBestVerseMatch(matches = []) {
  // prefer items with sanskrit or hinglish; then by score
  const scored = (matches || []).map(m => {
    const md = m.metadata || {};
    const hasSanskrit = !!(md.sanskrit && String(md.sanskrit).trim());
    const hasHinglish = !!((md.hinglish1 && String(md.hinglish1).trim()) || (md.hinglish && String(md.hinglish).trim()));
    const hasTranslation = !!((md.translation || md["Translation (English)"]) && String(md.translation || md["Translation (English)"]).trim());
    return { m, hasSanskrit, hasHinglish, hasTranslation, score: m.score || 0 };
  });
  // sort: presence of text first, then score
  scored.sort((a,b) => {
    const aScore = (a.hasSanskrit?4:0) + (a.hasHinglish?2:0) + (a.hasTranslation?1:0) + a.score;
    const bScore = (b.hasSanskrit?4:0) + (b.hasHinglish?2:0) + (b.hasTranslation?1:0) + b.score;
    return bScore - aScore;
  });
  return scored.length ? scored[0].m : null;
}

function findFirstBySource(matches = [], sourceTag) {
  for (const m of (matches || [])) {
    const md = m.metadata || {};
    if (String(md.source || md.type || "").toLowerCase() === sourceTag.toLowerCase()) return m;
    // also look for identifier patterns in id
    if ((m.id || "").toString().toLowerCase().startsWith(sourceTag.toLowerCase())) return m;
  }
  return null;
}

/* ---------------- System prompt used for grounded guidance ---------------- */
const SYSTEM_PROMPT = `You are SarathiAI — a friendly, compassionate guide inspired by Shri Krishna (Bhagavad Gita).
Tone: empathetic, practical, concise (2-4 short paragraphs).
Rules:
- Use ONLY the provided verse/commentary/practice content supplied to you in the "Context" part below. Do NOT invent new verses or Sanskrit lines.
- If a Sanskrit or Hinglish line is present in the context, you may quote it verbatim (up to two short lines).
- Always start the user-facing answer with: Shri Krishna kehte hain: followed by the one-line essence or the quoted verse.
- After quoting the verse (if present), give a kind/helpful explanation tailored to the user's message.
- If a practice is provided in context, suggest it (<= 90s).
- End with a short "Ref: ..." listing reference IDs used.
- If context is insufficient (no verse/hinglish/translation), say so gently and use commentary/practice instead, or ask a clarifying question.`;

/* ---------------- Sanitizer (minimal, only whitelist fields) ---------------- */
function safeTextField(md, ...keys) {
  for (const k of keys) {
    if (md[k] && String(md[k]).trim()) return String(md[k]).trim();
  }
  return "";
}

/* ---------------- Webhook handler ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound raw payload:", JSON.stringify(req.body));
    // ACK early
    res.status(200).send("OK");

    const { phone, text } = extractPhoneAndText(req.body);
    console.log("Detected userPhone:", phone, "userText:", text);
    if (!phone || !text) { console.log("ℹ No actionable message — skip."); return; }

    const incoming = String(text).trim();

    // 1. greetings and small talk
    if (isGreeting(incoming)) {
      console.log("ℹ Greeting detected — welcome.");
      await sendViaGupshup(phone, WELCOME_TEMPLATE);
      return;
    }
    if (isSmallTalk(incoming)) {
      console.log("ℹ Small-talk detected — menu.");
      await sendViaGupshup(phone, SMALLTALK_REPLY);
      return;
    }

    // 2. substantive query -> RAG flow
    // 2a. embed
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

    // 2b. query Pinecone
    let pineResp;
    try {
      pineResp = await pineconeQuery(qVec, 5);
    } catch (e) {
      console.error("❌ Pinecone query failed:", e?.message || e);
      const ai = await openaiChat([{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: incoming }]);
      const fallback = ai || `Hare Krishna — I heard: "${incoming}". Could you tell me more?`;
      await sendViaGupshup(phone, fallback);
      return;
    }

    const matches = pineResp?.matches || [];
    console.log("ℹ Retrieved matches:", matches.map(m => ({ id: m.id, score: m.score })));

    // 2c. pick best verse (if present) and find commentary/practice
    const bestVerse = pickBestVerseMatch(matches); // prioritized by having sanskrit/hinglish
    const commentary = findFirstBySource(matches, "commentary") || findFirstBySource(matches, "comment");
    const practice = findFirstBySource(matches, "practices") || findFirstBySource(matches, "practice") || findFirstBySource(matches, "practices_");

    // gather refs for transparency
    const refs = [];
    if (bestVerse) refs.push(bestVerse.metadata?.reference || bestVerse.id);
    if (commentary) refs.push(commentary.metadata?.reference || commentary.id);
    if (practice) refs.push(practice.metadata?.reference || practice.id);

    // 2d. If we have a verse with Sanskrit/Hinglish -> show them then ask OpenAI to produce guidance grounded in that verse
    const verseSanskrit = bestVerse ? safeTextField(bestVerse.metadata, "sanskrit", "Sanskrit", "Sanskrit verse") : "";
    const verseHinglish = bestVerse ? safeTextField(bestVerse.metadata, "hinglish1", "hinglish", "Hinglish (1)", "transliteration_hinglish") : "";
    const verseTranslation = bestVerse ? safeTextField(bestVerse.metadata, "translation", "Translation (English)", "english") : "";

    // If no verse texts exist in top matches, fallback to commentary/practice safe reply (no hallucination)
    if (!verseSanskrit && !verseHinglish) {
      console.log("⚠ No verse text present in top matches — fallback to commentary/practice or gentle fallback.");

      // Prefer commentary summary -> then practice -> generic
      const commentText = commentary ? (safeTextField(commentary.metadata, "commentary_summary", "commentary_long", "commentary", "summary") || "") : "";
      const practiceText = practice ? (safeTextField(practice.metadata, "practice_text", "text", "description", "practice") || "") : "";

      const essence = commentText || "Focus on your effort and steady calm, not on the outcome.";
      const practiceSuggest = practiceText || "Try a short calming breath: inhale 4s, hold 7s, exhale 8s — repeat 3 times.";

      const safeReply = [
        `Shri Krishna kehte hain: "${essence.length>160 ? essence.slice(0,157)+'...' : essence}"`,
        ``,
        `I hear you — exams can make the mind anxious. Instead of focusing on outcomes, try focusing on the next small step.`,
        ``,
        `Short practice (≈90s): ${practiceSuggest}`,
        ``,
        `Note: The original Sanskrit/Hinglish text isn't available for these references; I'm sharing guidance from commentary/practice notes instead.`,
        ``,
        `Ref: ${refs.length ? refs.join(", ") : "none"}`,
        ``,
        `Would you like a short 3-day morning practice I can send every morning? Reply YES to try it.`
      ].join("\n");

      await sendViaGupshup(phone, safeReply);
      return;
    }

    // 2e. Build prompt for OpenAI grounded to the chosen verse + any commentary/practice text
    // We'll include the verse text (Sanskrit/Hinglish/translation) as context, plus a concise instruction to the assistant.
    const contextParts = [];
    contextParts.push(`Reference: ${bestVerse.metadata?.reference || bestVerse.id}`);
    if (verseSanskrit) contextParts.push(`Sanskrit: ${verseSanskrit}`);
    if (verseHinglish) contextParts.push(`Hinglish: ${verseHinglish}`);
    if (verseTranslation) contextParts.push(`Translation: ${verseTranslation}`);
    if (commentary) {
      const ctext = safeTextField(commentary.metadata, "commentary_summary", "commentary_long", "summary", "commentary");
      if (ctext) contextParts.push(`Commentary (${commentary.id}): ${ctext}`);
    }
    if (practice) {
      const ptext = safeTextField(practice.metadata, "practice_text", "text", "description", "practice");
      if (ptext) contextParts.push(`Practice (${practice.id}): ${ptext}`);
    }

    const contextText = contextParts.join("\n\n");

    // Build the system and user prompt for OpenAI
    const systemMsg = SYSTEM_PROMPT + "\n\nContext follows below. Use ONLY that context to produce the applied guidance.\n";
    const userMsg = `User message: "${incoming}"\n\nContext:\n${contextText}\n\nTask: Provide a kind, practical, modern explanation or guidance tailored to the user's message. Keep it empathetic and concise (2-4 short paragraphs). If a practice is present, recommend it. End with "Ref: <id1>, <id2>" listing references actually used.`;

    const messages = [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg }
    ];

    // 3) Call OpenAI to get the explanation
    let aiReply = null;
    try {
      aiReply = await openaiChat(messages, 700);
    } catch (e) {
      console.error("❌ OpenAI chat failed:", e?.message || e);
    }

    // 4) Compose final outgoing message:
    // - Start with Shri Krishna kehte hain: optionally show Sanskrit and Hinglish if present (Sanskrit preferred)
    // - Then paste AI guidance (ensuring it doesn't invent new Sanskrit — AI prompt restricts it to context)
    // - Add practice if not already included by AI (safe fallback)
    // - Add Ref line and a short follow-up question

    let outgoingParts = [];

    // Intro: show verse lines (prefer Sanskrit, then Hinglish)
    if (verseSanskrit) outgoingParts.push(`Shri Krishna kehte hain: "${verseSanskrit}"`);
    else if (verseHinglish) outgoingParts.push(`Shri Krishna kehte hain: "${verseHinglish}"`);
    // show hinglish under the Sanskrit if both exist
    if (verseHinglish) outgoingParts.push(`"${verseHinglish}"`);

    outgoingParts.push(""); // blank line

    // AI guidance (prefer aiReply if available)
    if (aiReply && aiReply.trim()) {
      outgoingParts.push(aiReply.trim());
    } else {
      // fallback explanation (very conservative)
      outgoingParts.push(`I hear you — exams can be stressful. Focus on the next small step you can take, and practice short breathing to calm the mind.`);
    }

    // If practice exists and AI did not mention it, append it
    const practiceText = practice ? (safeTextField(practice.metadata, "practice_text", "text", "description", "practice") || "") : "";
    if (practiceText && !(aiReply || "").includes(practiceText.slice(0,20))) {
      outgoingParts.push("");
      outgoingParts.push(`Practice: ${practiceText}`);
    }

    // Ref & followup
    outgoingParts.push("");
    outgoingParts.push(`Ref: ${refs.length ? refs.join(", ") : (bestVerse.id || "none")}`);
    outgoingParts.push("");
    outgoingParts.push("Would you like me to send a short 3-day morning practice to help with exam stress? Reply YES to try it.");

    const finalReply = outgoingParts.join("\n");

    // 5) Send
    const sendResult = await sendViaGupshup(phone, finalReply);
    if (!sendResult.ok && !sendResult.simulated) {
      console.error("❗ Problem sending reply:", sendResult);
    }

  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    try { res.status(200).send("OK"); } catch (_) {}
  }
});

/* ---------------- Root & Admin ---------------- */
app.get("/", (_req, res) => res.send(`${BOT_NAME} with RAG is running ✅`));

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
    const pine = await pineconeQuery(vec, 5);
    const matches = pine?.matches || [];
    const ctx = matches.map(m => ({ id: m.id, metadata: m.metadata, score: m.score }));
    return res.status(200).json({ query, retrieved: ctx });
  } catch (e) {
    return res.status(500).json({ error: e?.message || e });
  }
});

/* ---------------- Start server ---------------- */
app.listen(PORT, () => console.log(`${BOT_NAME} listening on port ${PORT}`));
