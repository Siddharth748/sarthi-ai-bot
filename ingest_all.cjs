// ingest_all.cjs
"use strict";

/**
 * ingest_all.cjs
 * - Reads ./data/verse.csv, ./data/commentary.csv, ./data/practices.csv
 * - Produces OpenAI embeddings in batches
 * - Upserts to Pinecone REST API into namespaces: verse, commentary, practices
 *
 * Usage: node ingest_all.cjs
 *
 * Required env vars:
 * OPENAI_API_KEY, OPENAI_EMBED_MODEL (default: text-embedding-3-small)
 * PINECONE_HOST, PINECONE_API_KEY
 *
 * NOTE: run `npm install axios csv-parse` before running this script.
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { parse } = require("csv-parse/sync");

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const EMBED_MODEL = (process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small").trim();

const PINECONE_HOST = (process.env.PINECONE_HOST || "").trim(); // e.g. https://<index>-<proj>.svc.aped-4627-b74a.pinecone.io
const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || "").trim();
const BATCH_SIZE = 50; // embeddings & upsert batch size (safe)

if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}
if (!PINECONE_HOST || !PINECONE_API_KEY) {
  console.error("❌ Missing PINECONE_HOST or PINECONE_API_KEY");
  process.exit(1);
}

function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  // csv-parse sync with relax to accept quotes and embedded newlines
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  return records;
}

function ensureFileExists(p) {
  if (!fs.existsSync(p)) {
    console.warn(`⚠ Missing file: ${p}`);
    return false;
  }
  return true;
}

function chunkArray(arr, n) {
  const res = [];
  for (let i = 0; i < arr.length; i += n) res.push(arr.slice(i, i + n));
  return res;
}

async function embedTexts(texts) {
  // texts: string[]
  // returns: array of embeddings
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const url = "https://api.openai.com/v1/embeddings";
  const body = {
    model: EMBED_MODEL,
    input: texts,
  };
  try {
    const resp = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    });
    return resp.data.data.map((d) => d.embedding);
  } catch (err) {
    // surface a helpful error
    console.error("❌ OpenAI embedding error:", err?.response?.status, err?.response?.data || err?.message);
    throw err;
  }
}

async function pineconeUpsert(vectors, namespace) {
  // vectors: [{ id, values, metadata }]
  const url = `${PINECONE_HOST.replace(/\/$/, "")}/vectors/upsert`;
  try {
    const resp = await axios.post(
      url,
      { vectors, namespace },
      { headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" }, timeout: 60000 }
    );
    return resp.data;
  } catch (err) {
    console.error("❌ Pinecone upsert error:", err?.response?.status, err?.response?.data || err?.message);
    throw err;
  }
}

function buildVerseDoc(row, idx) {
  // normalize row keys (CSV columns may vary). We'll try to map common names.
  const r = {};
  for (const k of Object.keys(row)) {
    r[k.trim().toLowerCase()] = row[k];
  }
  const chapter = r.chapter || "";
  const verse = r.verse || "";
  const reference = r.reference || r["source id"] || r["source_id"] || r["source id".trim()] || r["reference"] || "";
  const sourceId = r["source id"] || r["source_id"] || r["sourceid"] || r["source id".trim()] || r["sourceid"];
  const sanskrit = r["sanskrit verse"] || r.sanskrit || r["sanskrit"] || "";
  const hinglish = r["hinglish (1)"] || r.hinglish1 || r.hinglish || r["transliteration_hinglish"] || "";
  const translation = r["translation (english)"] || r.translation || r["translation (english)"] || r.english || "";
  const summary = r.summary || r["message"] || r["commentary_summary"] || "";
  const tags = r.tags || "";
  const id = (r["source id"] || r["source_id"] || r["sourceid"] || r.reference || `verse_${chapter}_${verse}` || `verse_${idx}`).toString().replace(/\s+/g, "_");

  const textForEmbed = [sanskrit, hinglish, translation, summary].filter(Boolean).join(" \n ");
  return {
    id,
    reference,
    chapter,
    verse,
    sanskrit,
    hinglish,
    translation,
    summary,
    tags,
    textForEmbed: textForEmbed || reference || id,
  };
}

function buildCommentaryDoc(row, idx) {
  const r = {};
  for (const k of Object.keys(row)) r[k.trim().toLowerCase()] = row[k];
  const commentary_id = r.commentary_id || r.id || `commentary_${idx}`;
  const reference = r.reference || "";
  const title = r.title || "";
  const commentary_long = r.commentary_long || r.commentary || r.commentary_long || "";
  const commentary_summary = r.commentary_summary || r.summary || "";
  const tags = r.tags || "";
  const textForEmbed = [commentary_long, commentary_summary, title, reference].filter(Boolean).join(" \n ");
  const id = (commentary_id || `commentary_${idx}`).toString().replace(/\s+/g, "_");
  return {
    id,
    reference,
    title,
    commentary_long,
    commentary_summary,
    tags,
    textForEmbed: textForEmbed || reference || id,
  };
}

function buildPracticeDoc(row, idx) {
  const r = {};
  for (const k of Object.keys(row)) r[k.trim().toLowerCase()] = row[k];
  const practice_id = r.practice_id || r.id || `practice_${idx}`;
  const practice_text = r.practice_text || r.text || r.description || r.practice || "";
  const duration_sec = r.duration_sec || r.duration || "";
  const level = r.level || "";
  const tags = r.tags || "";
  const textForEmbed = [practice_text, tags].filter(Boolean).join(" \n ");
  const id = (practice_id || `practice_${idx}`).toString().replace(/\s+/g, "_");
  return {
    id,
    practice_text,
    duration_sec,
    level,
    tags,
    textForEmbed: textForEmbed || id,
  };
}

async function ingestFile(filePath, kind, namespace, builderFn) {
  if (!ensureFileExists(filePath)) {
    console.warn(`Skipping ${kind} because file missing: ${filePath}`);
    return;
  }
  console.log(`\n📄 Ingesting ${kind} from ${filePath} -> namespace=${namespace}`);
  const rows = readCsv(filePath);
  console.log(`📄 Found ${rows.length} rows in ${filePath}`);

  const docs = rows.map((r, i) => builderFn(r, i + 1));
  // Build batches
  const batches = chunkArray(docs, BATCH_SIZE);

  let total = 0;
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    console.log(`\n🔁 Processing batch ${bi + 1}/${batches.length} (${batch.length} items)`);

    // prepare texts for embedding
    const inputs = batch.map((d) => d.textForEmbed);

    // embed in one call (batch)
    let embeddings;
    let attempt = 0;
    while (true) {
      try {
        attempt++;
        embeddings = await embedTexts(inputs);
        break;
      } catch (err) {
        console.warn(`⚠ Embedding attempt ${attempt} failed. Retrying in ${attempt * 2}s...`);
        if (attempt >= 5) throw new Error("Embeddings failing after retries: " + (err?.message || err));
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }

    // build pinecone vectors
    const vectors = batch.map((d, i) => {
      const md = Object.assign({}, d);
      delete md.textForEmbed;
      // keep minimal metadata (useful fields)
      const metadata = {
        id: d.id,
        reference: md.reference || "",
        chapter: md.chapter || "",
        verse: md.verse || "",
        sanskrit: md.sanskrit || md.Sanskrit || "",
        hinglish1: md.hinglish || "",
        translation: md.translation || "",
        summary: md.summary || md.commentary_summary || "",
        source: kind,
        tags: md.tags || "",
      };
      return { id: d.id, values: embeddings[i], metadata };
    });

    // upsert in pinecone
    let upsertResp;
    attempt = 0;
    while (true) {
      try {
        attempt++;
        upsertResp = await pineconeUpsert(vectors, namespace);
        break;
      } catch (err) {
        console.warn(`⚠ Pinecone upsert attempt ${attempt} failed. Retrying in ${attempt * 2}s...`);
        if (attempt >= 5) throw new Error("Pinecone upsert failing after retries: " + (err?.message || err));
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }

    total += vectors.length;
    console.log(`✅ Upserted ${vectors.length} vectors (batch ${bi + 1}). total so far=${total}`);
  }

  console.log(`🎉 Completed ingestion for ${kind}. Total upserted: ${total}`);
}

async function main() {
  try {
    const dataDir = path.join(process.cwd(), "data");
    const verseFile = path.join(dataDir, "verse.csv");
    const commentaryFile = path.join(dataDir, "commentary.csv");
    const practicesFile = path.join(dataDir, "practices.csv");

    // ingest in order: verse, commentary, practices
    await ingestFile(verseFile, "verse", "verse", buildVerseDoc);
    await ingestFile(commentaryFile, "commentary", "commentary", buildCommentaryDoc);
    await ingestFile(practicesFile, "practices", "practices", buildPracticeDoc);

    console.log("\n🚀 All ingestion finished successfully.");
    process.exit(0);
  } catch (err) {
    console.error("💥 Fatal ingestion error:", err?.message || err);
    process.exit(1);
  }
}

main();
