// ingest_all.js (CommonJS) - REST upsert to Pinecone, robust & Railway-friendly
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { parse } = require("csv-parse/sync");
const OpenAI = require("openai");

const BATCH_SIZE = Number(process.env.INGEST_BATCH_SIZE || 20);
const RETRY_MAX = Number(process.env.INGEST_RETRY_MAX || 5);
const BASE_DELAY_MS = Number(process.env.INGEST_BASE_DELAY_MS || 1500);
const OPENAI_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
const NAMESPACE = process.env.PINECONE_NAMESPACE || "verses";

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim(); // e.g. https://<index>-<proj>.svc.us-east-1.pinecone.io

function die(msg) {
  console.error("💥 Fatal ingestion error:", msg);
  process.exit(1);
}

if (!OPENAI_API_KEY) die("OPENAI_API_KEY not set");
if (!PINECONE_API_KEY) die("PINECONE_API_KEY not set");
if (!PINECONE_HOST || !/^https?:\/\//.test(PINECONE_HOST)) die("PINECONE_HOST missing or invalid");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// read CSV (returns array of records as objects if header present)
function readCsvObjectRows(filename) {
  const p = path.join(__dirname, "data", filename);
  if (!fs.existsSync(p)) {
    console.warn(`⚠ File not found: ${p} — skipping`);
    return [];
  }
  const raw = fs.readFileSync(p, "utf8");
  const records = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true });
  return records;
}

function rowToId(row, idx, prefix = "row") {
  const candidate = (row["Source ID"] || row.source_id || row.id || `${prefix}_${idx+1}`).toString();
  return candidate.replace(/\s+/g, "_").slice(0, 100);
}

function rowToTextForEmbedding(row) {
  // Flexible: pick common column names; join into single string
  const parts = [];
  if (row["Sanskrit verse"] || row.sanskrit) parts.push(String(row["Sanskrit verse"] || row.sanskrit));
  if (row["Translation (English)"] || row.translation) parts.push(String(row["Translation (English)"] || row.translation));
  if (row["Hinglish (1)"] || row.hinglish) parts.push(String(row["Hinglish (1)"] || row.hinglish));
  if (row["Hinglish (2)"] || row.hinglish2) parts.push(String(row["Hinglish (2)"] || row.hinglish2));
  if (row.summary || row["Summary"]) parts.push(String(row.summary || row["Summary"]));
  if (row.message) parts.push(String(row.message));
  // fallback: join all columns if nothing found
  if (parts.length === 0) {
    return Object.values(row).join(" | ").slice(0, 2000);
  }
  return parts.join("\n");
}

async function embedTexts(texts) {
  // texts: array of strings
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const resp = await openai.embeddings.create({ model: OPENAI_MODEL, input: texts });
  // resp.data is array
  return resp.data.map(d => d.embedding);
}

async function pineconeUpsert(vectors, namespace) {
  // vectors: array of { id, values, metadata }
  if (!Array.isArray(vectors)) throw new Error("pineconeUpsert expects an array of vectors");
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/vectors/upsert`;
  const body = { vectors, namespace };
  const headers = { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" };

  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      const r = await axios.post(url, body, { headers, timeout: 120000 });
      return r.data;
    } catch (err) {
      const isTransient = err?.code === "ECONNABORTED" || err?.response?.status === 429 || (err?.response?.status >= 500 && err?.response?.status < 600);
      console.warn(`❗ Upsert attempt ${attempt} failed:`, (err?.response?.data || err?.message).toString().slice(0,200));
      if (attempt < RETRY_MAX && isTransient) {
        const wait = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`⏳ retrying in ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      } else {
        // non-retryable or out of attempts
        throw err;
      }
    }
  }
}

async function processCsvFile(filename, sourceName) {
  const rows = readCsvObjectRows(filename);
  if (!rows || rows.length === 0) {
    console.log(`ℹ No rows in ${filename}, skipping`);
    return;
  }
  console.log(`📄 Found ${rows.length} from ${filename}`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const texts = chunk.map(rowToTextForEmbedding);
    // embed
    let embeddings;
    try {
      embeddings = await embedTexts(texts);
    } catch (e) {
      console.error("❌ Embedding error:", e?.response?.data || e?.message || e);
      // if rate-limit, wait and retry this batch
      if (e?.response?.status === 429) {
        console.log("⏳ Rate-limited; sleeping 20s and retrying this batch...");
        await new Promise(r => setTimeout(r, 20000));
        i -= BATCH_SIZE; // retry
        continue;
      }
      throw e;
    }

    // Build vectors ensuring array type
    const vectors = chunk.map((row, idx) => {
      const id = rowToId(row, i + idx, sourceName);
      return {
        id: id,
        values: embeddings[idx],
        metadata: {
          source: sourceName,
          id: id,
          chapter: row["Chapter"] || row.chapter || "",
          verse: row["Verse"] || row.verse || "",
          tags: row.tags || ""
        }
      };
    });

    // Debug check — ensure vectors is array
    if (!Array.isArray(vectors)) throw new Error("Vectors is not an array unexpectedly");

    // Upsert
    try {
      const res = await pineconeUpsert(vectors, NAMESPACE);
      console.log(`✅ Upserted ${vectors.length} vectors (rows ${i+1}-${i+vectors.length})`);
    } catch (e) {
      console.error("❌ Upsert error:", (e?.response?.data || e?.message || e).toString().slice(0,400));
      throw new Error("Pinecone upsert failed");
    }

    // small pause
    await new Promise(r => setTimeout(r, 300));
  }
}

(async () => {
  try {
    console.log("🚀 Starting ingestion (REST upsert)...");
    // process verse, commentary, practices if present
    await processCsvFile("verse.csv", "verse");
    await processCsvFile("commentary.csv", "commentary");
    await processCsvFile("practices.csv", "practices");
    console.log("🎉 Ingestion complete!");
    process.exit(0);
  } catch (err) {
    console.error("💥 Fatal ingestion error:", err?.message || err);
    process.exit(1);
  }
})();
