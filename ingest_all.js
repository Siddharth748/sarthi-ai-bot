// ingest_all.js — CommonJS, REST-only (no Pinecone SDK), Railway-friendly
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { parse } = require("csv-parse/sync");

const OPENAI_API_KEY     = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();
const PINECONE_HOST      = (process.env.PINECONE_HOST || "").trim(); // e.g., https://<index>-<proj>.svc.<region>.pinecone.io
const PINECONE_API_KEY   = (process.env.PINECONE_API_KEY || "").trim();

function die(msg) {
  console.error("💥 Fatal ingestion error:", msg);
  process.exit(1);
}

(async () => {
  console.log("🚀 Starting ingestion...");

  if (!OPENAI_API_KEY) die("OPENAI_API_KEY missing");
  if (!PINECONE_API_KEY) die("PINECONE_API_KEY missing");
  if (!PINECONE_HOST || !/^https:\/\/.+\.pinecone\.io/.test(PINECONE_HOST)) {
    die("PINECONE_HOST missing or invalid. Example: https://yourindex-yourproj.svc.us-east-1.pinecone.io");
  }

  // --- 1) Load verse.csv ---
  const versePath = path.join(__dirname, "data", "verse.csv");
  if (!fs.existsSync(versePath)) die(`Missing file: ${versePath}. Put verse.csv into ./data/`);

  const csvBuf = fs.readFileSync(versePath);
  const records = parse(csvBuf, { columns: true, skip_empty_lines: true });

  if (!Array.isArray(records) || records.length === 0) die("verse.csv parsed but no rows found");

  console.log(`📄 Found verses: ${records.length}`);

  // --- 2) Prepare texts for embedding ---
  // Expected verse.csv columns (your sample): Chapter, Verse, Sanskrit verse, Translation (English),
  // Hinglish (1), Hinglish (2), Summary, Source ID, Reference, message, tags
  function rowToId(row, idx) {
    const id = (row["Source ID"] || row["Reference"] || `ROW_${idx + 1}`).toString().trim();
    return id.replace(/\s+/g, "_").slice(0, 96);
  }

  function rowToText(row) {
    const parts = [];
    const sv = row["Sanskrit verse"] || row["Sanskrit"] || "";
    const tr = row["Translation (English)"] || row["translation_hinglish"] || row["Translation"] || "";
    const h1 = row["Hinglish (1)"] || "";
    const h2 = row["Hinglish (2)"] || "";
    const sum = row["Summary"] || "";
    const msg = row["message"] || "";
    parts.push(`Sanskrit: ${sv}`);
    if (tr) parts.push(`English: ${tr}`);
    if (h1) parts.push(`Hinglish1: ${h1}`);
    if (h2) parts.push(`Hinglish2: ${h2}`);
    if (sum) parts.push(`Summary: ${sum}`);
    if (msg) parts.push(`Message: ${msg}`);
    return parts.join("\n");
  }

  const items = records.map((row, idx) => ({
    id: rowToId(row, idx),
    chapter: (row["Chapter"] || "").toString().trim(),
    verse: (row["Verse"] || "").toString().trim(),
    tags: (row["tags"] || "").toString().trim(),
    text: rowToText(row)
  }));

  // --- 3) Embed with OpenAI (batched) ---
  async function embedBatch(texts) {
    const resp = await axios.post(
      "https://api.openai.com/v1/embeddings",
      { model: OPENAI_EMBED_MODEL, input: texts },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout: 60000 }
    );
    return resp.data.data.map(d => d.embedding);
  }

  // --- 4) Upsert to Pinecone REST ---
  async function upsertBatch(vectors) {
    // POST {host}/vectors/upsert  (index host already targets index)
    const url = `${PINECONE_HOST}/vectors/upsert`;
    const resp = await axios.post(
      url,
      { vectors, namespace: "default" },
      { headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" }, timeout: 60000 }
    );
    return resp.data;
  }

  // --- 5) Process in small chunks ---
  const BATCH = 50; // keep small & safe
  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH);
    const texts = slice.map(s => s.text);

    // Embed
    let embeddings;
    try {
      embeddings = await embedBatch(texts);
    } catch (e) {
      console.error("❌ Embedding error at batch", i / BATCH, e?.response?.data || e.message);
      if (e?.response?.status === 429) {
        console.log("⏳ Rate limited. Sleeping 20s then retrying this batch...");
        await new Promise(r => setTimeout(r, 20000));
        i -= BATCH; // retry same batch
        continue;
      }
      die(e?.message || "Embedding failed");
    }

    // Build Pinecone vectors
    const vectors = slice.map((s, idx) => ({
      id: s.id,
      values: embeddings[idx],
      metadata: {
        chapter: s.chapter,
        verse: s.verse,
        tags: s.tags,
        text: s.text
      }
    }));

    // Upsert
    try {
      const res = await upsertBatch(vectors);
      console.log(`✅ Upserted ${vectors.length} vectors (rows ${i + 1}-${i + vectors.length})`, res?.upsertedCount ? `upsertedCount=${res.upsertedCount}` : "");
    } catch (e) {
      console.error("❌ Upsert error:", e?.response?.status, e?.response?.data || e.message);
      die("Pinecone upsert failed");
    }

    // Gentle pacing
    await new Promise(r => setTimeout(r, 500));
  }

  console.log("🎉 Ingestion complete!");
  process.exit(0);
})().catch(err => die(err?.message || err));
