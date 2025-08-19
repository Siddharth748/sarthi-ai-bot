// index.js — SarathiAI (final) — RAG-enabled, ESM, verse-preferring
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
const PINECONE_NAMESPACE = (process.env.PINECONE_NAMESPACE || "verse").trim();
const PINECONE_NAMESPACES = (process.env.PINECONE_NAMESPACES || "").trim(); // optional comma-separated

const TRAIN_SECRET = process.env.TRAIN_SECRET || null;

/* ---------------- Startup logs ---------------- */
console.log("\n🚀", BOT_NAME, "starting...");
console.log("📦 GS_SOURCE:", GS_SOURCE || "[MISSING]");
console.log("📦 OPENAI_MODEL:", OPENAI_MODEL, " EMBED_MODEL:", EMBED_MODEL);
console.log("📦 PINECONE_HOST:", PINECONE_HOST ? "[LOADED]" : "[MISSING]");
console.log("📦 PINECONE_NAMESPACE(s):", PINECONE_NAMESPACES ? PINECONE_NAMESPACES : PINECONE_NAMESPACE);
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
  const body = { model: OPENAI_MODEL, messages, max_tokens: maxTokens, temperature: 0.6 };
  const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
    headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    timeout: 20000
  });
  return resp.data?.choices?.[0]?.message?.content || resp.data?.choices?.[0]?.text || null;
}

/* ---------------- Pinecone REST query ---------------- */
async function pineconeQuery(vector, topK = 5, namespace = undefined, filter = undefined) {
  if (!PINECONE_HOST || !PINECONE_API_KEY) throw new Error("Pinecone config missing");
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/query`;
  const body = {
    vector,
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
      const matches = (r?.matches || []).map(m => ({ ...m, _namespace: n }));
      return matches;
    } catch (e) {
      console.warn("⚠ Pinecone query failed for namespace", n, e?.message || e);
      return [];
    }
  });
  const arr = await Promise.all(promises);
  const allMatches = arr.flat();
  // prioritize: any item with metadata.sanskrit or namespace 'verse' should come first
  allMatches.sort((a,b) => {
    const scoreA = a.score || 0, scoreB = b.score || 0;
    const va = ((a.metadata||{}).sanskrit ? 1000 : 0) + ((a._namespace === "verse") ? 500 : 0) + scoreA;
    const vb = ((b.metadata||{}).sanskrit ? 1000 : 0) + ((b._namespace === "verse") ? 500 : 0) + scoreB;
    return vb - va;
  });
  return allMatches;
}

/* ---------------- Find verse by commentary reference ---------------- */
async function findVerseByReference(reference, queryVector = null) {
  if (!reference) return null;
  // normalize a few common formats to search in the verse namespace
  const tries = [
    reference,
    reference.trim(),
    reference.trim().replace(/\s+/g, " "),
    reference.trim().replace(/\s+/g, "_"),
    reference.trim().toUpperCase(),
    reference.trim().toLowerCase(),
    reference.replace(/\./g, ""),
    reference.replace(/\./g,"").replace(/\s+/g,"_"),
    reference.replace(/Gita\s*/i, "Gita ")
  ].filter((v,i,a) => v && a.indexOf(v)===i);

  const verseNs = getNamespacesArray().find(n => n.toLowerCase().includes("verse")) || getNamespacesArray()[0];

  for (const t of tries) {
    try {
      const vec = queryVector || await openaiEmbedding(t);
      const filter = { reference: { "$eq": t } };
      const res = await pineconeQuery(vec, 1, verseNs, filter);
      const matches = res?.matches || [];
      if (matches.length) return { ...matches[0], _namespace: verseNs };
    } catch (e) {
      // ignore & continue tries
    }
  }
  return null;
}

/* ---------------- Payload extraction (Gupshup shapes) ---------------- */
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

/* ---------------- Greeting & Small talk detection ---------------- */
function normalizeTextForSmallTalk(s) {
  if (!s) return "";
  let t = String(s).trim().toLowerCase();
  t = t.replace(/\bu\b/g, "you");
  t = t.replace(/\br\b/g, "are");
  t = t.replace(/\bpls\b/g, "please");
  t = t.replace(/[^\w'\s]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
const CONCERN_KEYWORDS = new Set(["stress","anxiety","depressed","depression","angry","anger","sleep","insomnia","panic","sad","lonely","stressed"]);
function isGreeting(text) {
  if (!text) return false;
  const t = normalizeTextForSmallTalk(text);
  const greetings = new Set(["hi","hii","hello","hey","namaste","hare krishna","harekrishna","good morning","good afternoon","good evening","gm","greetings"]);
  if (greetings.has(t)) return true;
  if (/^(h+i+|hey+)$/.test(t)) return true;
  if (t.length <= 8 && /\b(hello|hi|hey|namaste|hare)\b/.test(t)) return true;
  return false;
}
function isSmallTalk(text) {
  if (!text) return false;
  const t = normalizeTextForSmallTalk(text);
  if (CONCERN_KEYWORDS.has(t)) return false;
  const smalls = new Set(["how are you","how are you doing","how r you","how ru","how are u","how is it going","whats up","thank you","thanks","ok","okay","good","nice","cool","bye","see you","k"]);
  if (smalls.has(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 3 && !/\b(help|need|please|advice|how to|why|what|when|where|stress|anxiety|angry|sleep|depressed)\b/.test(t)) return true;
  if (/\bhow\b/.test(t) && t.length < 40 && !/\b(problem|stress|anxious|angry|help|need)\b/.test(t)) return true;
  return false;
}

/* ---------------- Templates & prompts ---------------- */
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

const SYSTEM_PROMPT = `You are SarathiAI — a friendly, compassionate guide inspired by Shri Krishna (Bhagavad Gita).
Tone: Modern, empathetic, concise (2-4 short paragraphs).
Rules:
- Use ONLY the provided "Context" below. Do NOT invent or hallucinate verses.
- If Sanskrit/Hinglish lines are present, quote up to two short lines.
- Begin reply with: Shri Krishna kehte hain: "<one-line essence or quoted verse>"
- Give a short applied explanation tailored to the user's message.
- If a short practice is present, suggest it (<= 90s).
- End with "Ref: <ids>" listing references used (only include if present).`;

/* ---------------- small helpers ---------------- */
function safeText(md, ...keys) {
  if (!md) return "";
  for (const k of keys) {
    if (!k) continue;
    const v = md[k] || md[k.toLowerCase?.()] || md[k.toUpperCase?.()];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

/* ---------------- Webhook/main flow ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("Inbound raw payload:", JSON.stringify(req.body));
    res.status(200).send("OK"); // ACK early

    const { phone, text } = extractPhoneAndText(req.body);
    console.log("Detected userPhone:", phone, "userText:", text);
    if (!phone || !text) { console.log("ℹ No actionable message — skip."); return; }

    const incoming = String(text).trim();

    // greetings/small talk
    if (isGreeting(incoming)) {
      await sendViaGupshup(phone, WELCOME_TEMPLATE);
      return;
    }
    if (isSmallTalk(incoming)) {
      await sendViaGupshup(phone, SMALLTALK_REPLY);
      return;
    }

    // 1) embed
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

    // 2) retrieval (multi-namespace, verse-prioritized)
    let matches = [];
    try {
      matches = await multiNamespaceQuery(qVec, 8);
      console.log("ℹ Retrieved matches (top 8):", matches.map(m => ({ id: m.id, score: m.score, ns: m._namespace })));
    } catch (e) {
      console.error("❌ Pinecone query failed:", e?.message || e);
      const ai = await openaiChat([{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: incoming }]);
      const fallback = ai || `Hare Krishna — I heard: "${incoming}". Could you tell me more?`;
      await sendViaGupshup(phone, fallback);
      return;
    }

    // 3) prefer verse match (with content) or attempt to fetch verse by commentary.reference
    let verseMatch = matches.find(m => (m.metadata||{}).sanskrit || (m.metadata||{}).hinglish1 || (m.metadata||{}).hinglish) ||
                     matches.find(m => (m._namespace === "verse") && (m.metadata && (m.metadata.sanskrit || m.metadata.hinglish1 || m.metadata.translation)));

    // find commentary/practice
    const commentaryMatch = matches.find(m => (m._namespace === "commentary") || ((m.metadata||{}).source && String((m.metadata||{}).source).toLowerCase().includes("comment")));
    const practiceMatch = matches.find(m => (m._namespace === "practices") || ((m.metadata||{}).source && String((m.metadata||{}).source).toLowerCase().includes("practice")));

    // if no verse but commentary provides a reference, attempt to fetch verse by that reference
    if (!verseMatch && commentaryMatch) {
      const commentaryRef = safeText(commentaryMatch.metadata, "reference", "Reference", "ref");
      if (commentaryRef) {
        try {
          const found = await findVerseByReference(commentaryRef, qVec);
          if (found) {
            verseMatch = found;
            console.log("ℹ Found verse by commentary reference:", found.id);
          }
        } catch (e) {
          console.warn("⚠ findVerseByReference error:", e?.message || e);
        }
      }
    }

    // prepare refs and texts
    const refs = [];
    if (verseMatch) refs.push(verseMatch.metadata?.reference || verseMatch.id);
    if (commentaryMatch) refs.push(commentaryMatch.metadata?.reference || commentaryMatch.id);
    if (practiceMatch) refs.push(practiceMatch.metadata?.reference || practiceMatch.id);

    const verseSanskrit = verseMatch ? safeText(verseMatch.metadata, "sanskrit", "Sanskrit", "Sanskrit verse") : "";
    const verseHinglish = verseMatch ? safeText(verseMatch.metadata, "hinglish1", "hinglish", "transliteration_hinglish") : "";
    const verseTranslation = verseMatch ? safeText(verseMatch.metadata, "translation", "Translation (English)", "english") : "";

    const commentaryText = commentaryMatch ? (safeText(commentaryMatch.metadata, "commentary_summary", "commentary_long", "summary", "commentary") || "") : "";
    const practiceText = practiceMatch ? (safeText(practiceMatch.metadata, "practice_text", "text", "description", "practice") || "") : "";

    // 4) if no verse content found -> use commentary/practice-only response or ask clarifying question
    if (!verseSanskrit && !verseHinglish) {
      // if commentary or practice exists, build a grounded reply using them (without notarizing "not found")
      if (commentaryText || practiceText) {
        const ctxParts = [];
        if (commentaryText) ctxParts.push(`Commentary: ${commentaryText}`);
        if (practiceText) ctxParts.push(`Practice: ${practiceText}`);
        const systemMsg = `You are SarathiAI. Use ONLY the context below to craft a concise compassionate reply (2-4 short paragraphs). If a practice is present, recommend it. End with "Ref: <ids>" when available.`;
        const userMsg = `Context:\n${ctxParts.join("\n\n")}\n\nUser said: "${incoming}"\n\nRespond kindly and practically.`;
        let aiResp = null;
        try {
          aiResp = await openaiChat([{ role: "system", content: systemMsg }, { role: "user", content: userMsg }], 400);
        } catch (e) {
          console.warn("OpenAI fallback failed:", e?.message || e);
        }
        const replyLines = [];
        replyLines.push(aiResp && aiResp.trim() ? aiResp.trim() : `I hear you — thank you for sharing. Could you say one sentence more about what's happening?`);
        if (practiceText && !(aiResp || "").includes(practiceText.slice(0,20))) replyLines.push("", `Practice: ${practiceText}`);
        if (refs.length) replyLines.push("", `Ref: ${refs.join(", ")}`);
        replyLines.push("", "If you'd like, tell me one sentence more about when this started or how often it happens.");
        await sendViaGupshup(phone, replyLines.join("\n"));
        return;
      }

      // no context at all -> ask clarifying question + short practice
      const practiceNow = "Short calming breath: inhale 4s, hold 7s, exhale 8s — repeat 3 times.";
      const safeSystem = `You are SarathiAI — empathetic. Ask one brief clarifying question and offer a short breathing practice.`;
      const safeUser = `User said: "${incoming}". Ask one clarifying question and offer practice.`;
      let safeAI = null;
      try { safeAI = await openaiChat([{ role: "system", content: safeSystem }, { role: "user", content: safeUser }], 200); } catch(e) {}
      const safeReply = (safeAI && safeAI.trim()) ? `${safeAI.trim()}\n\nPractice: ${practiceNow}` : `I hear you — could you say a bit more (one short sentence)?\n\nPractice: ${practiceNow}`;
      await sendViaGupshup(phone, safeReply);
      return;
    }

    // 5) we have verse content -> build context and ask OpenAI for an applied reply
    const contextParts = [];
    contextParts.push(`Reference: ${verseMatch.metadata?.reference || verseMatch.id}`);
    if (verseSanskrit) contextParts.push(`Sanskrit: ${verseSanskrit}`);
    if (verseHinglish) contextParts.push(`Hinglish: ${verseHinglish}`);
    if (verseTranslation) contextParts.push(`Translation: ${verseTranslation}`);
    if (commentaryText) contextParts.push(`Commentary: ${commentaryText}`);
    if (practiceText) contextParts.push(`Practice: ${practiceText}`);
    const contextText = contextParts.join("\n\n");

    const systemMsg = SYSTEM_PROMPT + `\n\nContext follows below. Use ONLY that context to produce the applied guidance.\n`;
    const userMsg = `User message: "${incoming}"\n\nContext:\n${contextText}\n\nTask: Provide a kind, practical, modern explanation tailored to the user's message. Keep it empathetic and concise (2-4 short paragraphs). If a practice is present, recommend it. End with "Ref: <ids>" listing references used.`;

    const messages = [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg }
    ];

    let aiReply = null;
    try {
      aiReply = await openaiChat(messages, 700);
    } catch (e) {
      console.error("❌ OpenAI chat failed:", e?.message || e);
    }

    const out = [];
    if (verseSanskrit) out.push(`Shri Krishna kehte hain: "${verseSanskrit}"`);
    if (verseHinglish) out.push(`${verseHinglish}`);
    out.push("");
    out.push(aiReply && aiReply.trim() ? aiReply.trim() : "I hear you — thank you for sharing. Could you say a little more so I can help better?");
    if (practiceText && !(aiReply || "").includes(practiceText.slice(0,20))) out.push("", `Practice: ${practiceText}`);
    if (refs.length) out.push("", `Ref: ${refs.join(", ")}`);
    out.push("", "Would you like a short 3-day morning practice I can send? Reply YES to try it.");

    const finalReply = out.join("\n");
    console.log("ℹ finalReply preview:", (finalReply || "").slice(0,400));
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
    const matches = await multiNamespaceQuery(vec, 8);
    const ctx = matches.map(m => ({ id: m.id, score: m.score, metadata: m.metadata, namespace: m._namespace }));
    return res.status(200).json({ query, retrieved: ctx });
  } catch (e) {
    return res.status(500).json({ error: e?.message || e });
  }
});

/* ---------------- Start server ---------------- */
app.listen(PORT, () => console.log(`${BOT_NAME} listening on port ${PORT}`));
