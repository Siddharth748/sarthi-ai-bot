// index.js — SarathiAI (ESM) — RAG pipeline:
// - prefer verse text (sanskrit/hinglish) for quoting
// - if commentary matched, use commentary.reference to fetch verse
// - include practice if available
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Config ---------------- */
const BOT_NAME = process.env.BOT_NAME || "SarathiAI";
const PORT = process.env.PORT || 8080;

const GS_API_KEY = (process.env.GS_API_KEY || "").trim();
const GS_SOURCE = (process.env.GS_SOURCE || "").trim();
const SEND_URL = (process.env.GUPSHUP_SEND_URL || "https://api.gupshup.io/wa/api/v1/msg").trim();

const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();

// Pinecone config
const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim(); // e.g. https://<index>-<proj>.svc.us-east-1.pinecone.io
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
// Single default namespace OR a CSV of namespaces to query across
const PINECONE_NAMESPACE = (process.env.PINECONE_NAMESPACE || "verse").trim();
const PINECONE_NAMESPACES = (process.env.PINECONE_NAMESPACES || "").trim(); // comma-separated optional

const TRAIN_SECRET = process.env.TRAIN_SECRET || null;

/* ---------------- Startup logs ---------------- */
console.log("\n🚀", BOT_NAME, "starting...");
console.log("📦 GS_SOURCE:", GS_SOURCE || "[MISSING]");
console.log("📦 OPENAI_MODEL:", OPENAI_MODEL, " EMBED_MODEL:", EMBED_MODEL);
console.log("📦 PINECONE_HOST:", PINECONE_HOST ? "[LOADED]" : "[MISSING]");
console.log("📦 PINECONE_NAMESPACE(s):", PINECONE_NAMESPACES ? PINECONE_NAMESPACES : PINECONE_NAMESPACE);
console.log("📦 TRAIN_SECRET:", TRAIN_SECRET ? "[LOADED]" : "[MISSING]");
console.log();

/* ---------------- Helpers: Gupshup & OpenAI ---------------- */
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
  const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.6 };
  const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
    headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    timeout: 20000
  });
  return resp.data?.choices?.[0]?.message?.content || resp.data?.choices?.[0]?.text || null;
}

/* ---------------- Pinecone query wrapper (REST) ---------------- */
/**
 * vector: embedding vector (array)
 * topK: number
 * namespace: string or undefined
 * filter: object or undefined (metadata filter)
 */
async function pineconeQuery(vector, topK = 5, namespace = undefined, filter = undefined) {
  if (!PINECONE_HOST || !PINECONE_API_KEY) throw new Error("Pinecone config missing");
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/query`;

  const body = {
    vector: vector,
    topK,
    includeMetadata: true
  };
  if (namespace) body.namespace = namespace;
  if (filter) body.filter = filter;

  const resp = await axios.post(url, body, {
    headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" },
    timeout: 20000
  });
  return resp.data;
}

/* ---------------- Utility: query across namespaces ---------------- */
function getNamespacesArray() {
  if (PINECONE_NAMESPACES) {
    return PINECONE_NAMESPACES.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [PINECONE_NAMESPACE || "verse"];
}

async function multiNamespaceQuery(vector, topK = 5, filter = undefined) {
  const ns = getNamespacesArray();
  const promises = ns.map(async (n) => {
    try {
      const r = await pineconeQuery(vector, topK, n, filter);
      // add namespace to each match for debugging
      const matches = (r?.matches || []).map(m => ({ ...m, _namespace: n }));
      return matches;
    } catch (e) {
      console.warn("⚠ Pinecone query failed for namespace", n, e?.message || e);
      return [];
    }
  });
  const arr = await Promise.all(promises);
  // flatten and sort by score descending
  const allMatches = arr.flat();
  allMatches.sort((a,b) => (b.score || 0) - (a.score || 0));
  return allMatches;
}

/* ---------------- Find verse by commentary reference ---------------- */
async function findVerseByReference(reference, queryVector = null) {
  if (!reference) return null;
  // Try several normalizations
  const tries = [
    reference,
    reference.trim(),
    reference.trim().replace(/\s+/g, " "),
    reference.trim().replace(/\s+/g, "_"),
    reference.trim().toUpperCase(),
    reference.trim().toLowerCase(),
    reference.replace(/\./g, ""),
    reference.replace(/\./g,"").replace(/\s+/g,"_")
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  // We'll use the verse namespace ideally
  const nsList = getNamespacesArray();
  // Prefer namespace named "verse" if available
  let verseNs = nsList.find(n => n.toLowerCase().includes("verse")) || nsList[0];

  for (const t of tries) {
    try {
      // vector required by Pinecone query; if no queryVector provided, embed the reference string
      const vec = queryVector || await openaiEmbedding(t);
      const filter = { reference: { "$eq": t } };
      const res = await pineconeQuery(vec, 1, verseNs, filter);
      const matches = res?.matches || [];
      if (matches.length) {
        // return first match (has metadata)
        return matches[0];
      }
      // if none, continue trying next normalization
    } catch (e) {
      console.warn("❗ findVerseByReference failed for", t, e?.message || e);
    }
  }
  return null;
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

/* ---------------- Greeting / Small talk detection ---------------- */
/* ---------------- Greeting / Small talk detection (improved) ---------------- */

// normalize: lowercase, remove punctuation (except apostrophes), convert " u " to " you ", collapse spaces
function normalizeTextForSmallTalk(s) {
  if (!s) return "";
  let t = String(s).trim().toLowerCase();
  // replace common texting contractions
  t = t.replace(/\bu\b/g, "you");           // u -> you
  t = t.replace(/\br\b/g, "are");           // r -> are
  t = t.replace(/\bpls\b/g, "please");
  t = t.replace(/[^\w'\s]/g, " ");          // remove punctuation except apostrophes
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function isGreeting(text) {
  if (!text) return false;
  const t = normalizeTextForSmallTalk(text);
  const greetings = new Set([
    "hi","hii","hello","hey","namaste","hare krishna","harekrishna",
    "good morning","good afternoon","good evening","gm","greetings"
  ]);
  if (greetings.has(t)) return true;
  // quick heuristics
  if (/^(h+i+|hey+)$/.test(t)) return true;
  if (t.length <= 8 && /\b(hello|hi|hey|namaste|hare)\b/.test(t)) return true;
  return false;
}

function isSmallTalk(text) {
  if (!text) return false;
  const t = normalizeTextForSmallTalk(text);

  // exact short phrases to treat as small-talk
  const smalls = new Set([
    "how are you", "how are you doing", "how are you doing today",
    "how r you", "how r u", "how ru", "how are u",
    "how is it going", "how is it going", "hows it going", "whats up", "what is up",
    "thank you", "thanks", "thx", "ok", "okay", "good", "nice", "cool",
    "bye", "see you", "k", "morning", "good night"
  ]);

  if (smalls.has(t)) return true;

  // short sentences with no "help/need/please" or "?" treated as small talk
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 4 && !/\b(help|need|please|advice|how to|why|what|when|where)\b/.test(t)) return true;

  // questions like "how are you" variant
  if (/\bhow\b/.test(t) && t.length < 40 && !/\b(problem|stress|anxious|angry|help|need)\b/.test(t)) return true;

  return false;
}

/* ---------------- Templates ---------------- */
const WELCOME_TEMPLATE = `Hare Krishna 🙏

I am Sarathi, your companion on this journey.
Think of me as a link between your mann ki baat and the Gita's timeless gyaan.

If you'd like help, say for example:
• "I'm stressed about exams"
• "I am angry with someone"
• "I need help sleeping"

How can I help you today?`;

const SMALLTALK_REPLY = `Hare Krishna 🙏 — I'm Sarathi, happy to meet you.
Reply with your concern or pick a number:
1) Stress / Anxiety
2) Anger / Relationships
3) Sleep / Calm
4) Daily practice`;

/* ---------------- System prompt for OpenAI ---------------- */
const SYSTEM_PROMPT = `You are SarathiAI — a friendly, compassionate guide inspired by Shri Krishna (Bhagavad Gita).
Tone: Modern, empathetic, concise (2-4 short paragraphs).
Rules:
- Use ONLY the "Context" provided below. Do NOT invent or hallucinate verses.
- If a Sanskrit or Hinglish line is present, quote it (up to two short lines).
- Always start the user-facing answer with: Shri Krishna kehte hain: "<one-line essence or quoted verse>"
- After quoting, give a kind, practical explanation tailored to the user's message.
- If a short practice is present, recommend it (<= 90s).
- End with "Ref: <ids>" listing the references used.`;

/* ---------------- small utility ---------------- */
function safeText(md, ...keys) {
  for (const k of keys) {
    if (!md) continue;
    const v = md[k] || md[k.toLowerCase?.()] || md[k.toUpperCase?.()];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

/* ---------------- Webhook: main flow ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound raw payload:", JSON.stringify(req.body));
    res.status(200).send("OK"); // early ACK

    const { phone, text } = extractPhoneAndText(req.body);
    console.log("Detected userPhone:", phone, "userText:", text);
    if (!phone || !text) { console.log("ℹ No actionable message — skip."); return; }

    const incoming = String(text).trim();

    // greetings / small talk
    if (isGreeting(incoming)) {
      await sendViaGupshup(phone, WELCOME_TEMPLATE);
      return;
    }
    if (isSmallTalk(incoming)) {
      await sendViaGupshup(phone, SMALLTALK_REPLY);
      return;
    }

    // 1) embedding
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

    // 2) multi-namespace retrieval (top 5 each)
    const matches = await multiNamespaceQuery(qVec, 5);
    console.log("ℹ Retrieved matches:", matches.map(m => ({ id: m.id, score: m.score, ns: m._namespace })));

    // 3) pick best verse match if any (prefer metadata.sanskrit or hinglish)
    const verseMatch = matches.find(m => {
      const md = m.metadata || {};
      return (md && ((md.sanskrit && md.sanskrit.trim()) || (md.hinglish1 && md.hinglish1.trim()) || (md.hinglish && md.hinglish.trim())));
    }) || matches.find(m => (m.id || "").toString().toLowerCase().startsWith("gita") || (String(m.metadata?.reference || "").toLowerCase().startsWith("gita")));

    // 4) find commentary & practice matches
    const commentaryMatch = matches.find(m => ((m.metadata||{}).source || "").toString().toLowerCase().includes("comment") || (m.id||"").toString().toLowerCase().startsWith("comm")) || null;
    const practiceMatch = matches.find(m => ((m.metadata||{}).source || "").toString().toLowerCase().includes("practice") || (m.id||"").toString().toLowerCase().startsWith("practice") || (m.id||"").toString().toLowerCase().startsWith("breath")) || null;

    // 5) If no verse text, but commentary matched with a reference, try to fetch verse by reference
    let usedVerse = verseMatch || null;
    if (!usedVerse && commentaryMatch) {
      const commentaryRef = safeText(commentaryMatch.metadata, "reference", "Reference", "ref");
      if (commentaryRef) {
        try {
          const found = await findVerseByReference(commentaryRef, qVec);
          if (found) {
            usedVerse = found;
            console.log("ℹ Found verse by commentary reference:", found.id);
          }
        } catch (e) {
          console.warn("⚠ findVerseByReference error:", e?.message || e);
        }
      }
    }

    // gather refs
    const refs = [];
    if (usedVerse) refs.push(usedVerse.metadata?.reference || usedVerse.id);
    if (commentaryMatch) refs.push(commentaryMatch.metadata?.reference || commentaryMatch.id);
    if (practiceMatch) refs.push(practiceMatch.metadata?.reference || practiceMatch.id);

    // extract texts
    const verseSanskrit = usedVerse ? safeText(usedVerse.metadata, "sanskrit", "Sanskrit", "Sanskrit verse") : "";
    const verseHinglish = usedVerse ? safeText(usedVerse.metadata, "hinglish1", "hinglish", "Hinglish (1)", "transliteration_hinglish") : "";
    const verseTranslation = usedVerse ? safeText(usedVerse.metadata, "translation", "Translation (English)", "english") : "";

    const commentaryText = commentaryMatch ? (safeText(commentaryMatch.metadata, "commentary_summary", "commentary_long", "summary", "commentary") || "") : "";
    const practiceText = practiceMatch ? (safeText(practiceMatch.metadata, "practice_text", "text", "description", "practice") || "") : "";

    // 6) decide fallback vs grounded flow
    if (!verseSanskrit && !verseHinglish) {
      // fallback: use commentary/practice if available
      const essence = commentaryText || "Focus on your effort and steady calm, not on the outcome.";
      const practiceSuggest = practiceText || "Try a short calming breath: inhale 4s, hold 7s, exhale 8s — repeat 3 times.";

      const safeReply = [
        `Shri Krishna kehte hain: "${essence.length > 160 ? essence.slice(0,157) + '...' : essence}"`,
        ``,
        `I hear you — I can help. Instead of focusing on results, try focusing on one small next step.`,
        ``,
        `Short practice (≈90s): ${practiceSuggest}`,
        ``,
        `Note: Original Sanskrit/Hinglish not found for the top matches; I'm sharing guidance from commentary/practice notes.`,
        ``,
        `Ref: ${refs.length ? refs.join(", ") : "none"}`,
        ``,
        `Would you like a short 3-day morning practice I can send every morning? Reply YES to try it.`
      ].join("\n");

      await sendViaGupshup(phone, safeReply);
      return;
    }

    // 7) build context for OpenAI
    const contextParts = [];
    contextParts.push(`Reference: ${usedVerse.metadata?.reference || usedVerse.id}`);
    if (verseSanskrit) contextParts.push(`Sanskrit: ${verseSanskrit}`);
    if (verseHinglish) contextParts.push(`Hinglish: ${verseHinglish}`);
    if (verseTranslation) contextParts.push(`Translation: ${verseTranslation}`);
    if (commentaryText) contextParts.push(`Commentary: ${commentaryText}`);
    if (practiceText) contextParts.push(`Practice: ${practiceText}`);

    const contextText = contextParts.join("\n\n");

    const systemMsg = SYSTEM_PROMPT + "\n\nContext follows below. Use ONLY that context to produce the applied guidance.\n";
    const userMsg = `User message: "${incoming}"\n\nContext:\n${contextText}\n\nTask: Provide a kind, practical, modern explanation tailored to the user's message. Keep it empathetic and concise (2-4 short paragraphs). If a practice is present, recommend it. End with "Ref: <ids>" listing references used.`;

    const messages = [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg }
    ];

    let aiReply = null;
    try {
      aiReply = await openaiChat(messages, 700);
    } catch (e) {
      console.warn("❌ OpenAI chat failed:", e?.message || e);
    }

    // 8) compose final message
    const out = [];
    if (verseSanskrit) out.push(`Shri Krishna kehte hain: "${verseSanskrit}"`);
    if (verseHinglish) out.push(`"${verseHinglish}"`);
    out.push("");
    if (aiReply && aiReply.trim()) out.push(aiReply.trim());
    else out.push("I hear you — exams and life can make the mind anxious. Take one small step and try a short breathing practice now.");
    if (practiceText && !(aiReply || "").includes(practiceText.slice(0,20))) {
      out.push("");
      out.push(`Practice: ${practiceText}`);
    }
    out.push("");
    out.push(`Ref: ${refs.length ? refs.join(", ") : (usedVerse.id || "none")}`);
    out.push("");
    out.push("Would you like me to send a short 3-day morning practice to help? Reply YES.");

    const finalReply = out.join("\n");

    const sendResult = await sendViaGupshup(phone, finalReply);
    if (!sendResult.ok && !sendResult.simulated) {
      console.error("❗ Problem sending reply:", sendResult);
    }

  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    try { res.status(200).send("OK"); } catch (_) {}
  }
});

/* ---------------- Root / Admin / Train endpoint ---------------- */
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
    const matches = await multiNamespaceQuery(vec, 5);
    const ctx = matches.map(m => ({ id: m.id, score: m.score, metadata: m.metadata, namespace: m._namespace }));
    return res.status(200).json({ query, retrieved: ctx });
  } catch (e) {
    return res.status(500).json({ error: e?.message || e });
  }
});

/* ---------------- Start server ---------------- */
app.listen(PORT, () => console.log(`${BOT_NAME} listening on port ${PORT}`));
