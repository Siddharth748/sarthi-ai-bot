// ingest_all.js (plain-text, ESM)
import fs from "fs";
import Papa from "papaparse";
import dotenv from "dotenv";
import OpenAI from "openai";
import { PineconeClient } from "@pinecone-database/pinecone";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function embed(text) {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return res.data[0].embedding;
}

function loadCSV(path) {
  if (!fs.existsSync(path)) {
    console.error(`CSV not found: ${path}`);
    return [];
  }
  const raw = fs.readFileSync(path, "utf8");
  return Papa.parse(raw, { header: true, skipEmptyLines: true }).data;
}

async function upsertToPinecone(vectors) {
  const client = new PineconeClient();
  await client.init({ apiKey: process.env.PINECONE_API_KEY, environment: process.env.PINECONE_ENV });
  const indexName = process.env.PINECONE_INDEX || "gita-bot";
  const index = client.Index(indexName);

  const BATCH = 50;
  for (let i = 0; i < vectors.length; i += BATCH) {
    const chunk = vectors.slice(i, i + BATCH);
    await index.upsert({ upsertRequest: { vectors: chunk } });
    console.log(`Upserted ${Math.min(i + BATCH, vectors.length)}/${vectors.length}`);
  }
}

(async function main() {
  console.log("🚀 Starting ingestion...");

  const verses = loadCSV("verses.csv");
  const commentary = loadCSV("commentary.csv");
  const practices = loadCSV("practices.csv");

  const vectors = [];

  // Verses
  console.log(`Found verses: ${verses.length}`);
  for (const r of verses) {
    const id = (r["Source ID"] || r.source_id || `VERSE_${r.Chapter || "?"}_${r.Verse || "?"}`).toString();
    const sanskrit = r["Sanskrit verse"] || r.sanskrit || "";
    const hinglish = r["Hinglish (1)"] || r.transliteration_hinglish || r.hinglish || "";
    const translation = r["Translation (English)"] || r.translation || "";
    const textForEmbedding = [sanskrit, hinglish, translation].filter(Boolean).join("\n");
    const emb = await embed(textForEmbedding);
    const metadata = {
      type: "verse",
      id,
      chapter: r.Chapter || "",
      verse: r.Verse || "",
      reference: r.Reference || r.reference || "",
      source_id: id,
      sanskrit,
      hinglish,
      translation,
      tags: (r.tags || r.Tags || "").toString()
    };
    vectors.push({ id, values: emb, metadata });
  }

  // Commentary
  console.log(`Found commentary chunks: ${commentary.length}`);
  for (const r of commentary) {
    const id = (r.commentary_id || r.id || `COMM_${Math.random().toString(36).slice(2,9)}`).toString();
    const text = (r.commentary_long || r.commentary || r.comment || "").toString();
    if (!text) continue;
    const emb = await embed(text);
    const metadata = {
      type: "commentary",
      id,
      title: r.title || "",
      reference: r.reference || "",
      summary: r.commentary_summary || "",
      tags: r.tags || ""
    };
    vectors.push({ id, values: emb, metadata });
  }

  // Practices
  console.log(`Found practices: ${practices.length}`);
  for (const r of practices) {
    const id = (r.practice_id || r.id || `PRAC_${Math.random().toString(36).slice(2,9)}`).toString();
    const text = (r.practice_text || r.practice || "").toString();
    if (!text) continue;
    const emb = await embed(text);
    const metadata = {
      type: "practice",
      id,
      text,
      tags: r.tags || "",
      duration_sec: r.duration_sec || r.duration || ""
    };
    vectors.push({ id, values: emb, metadata });
  }

  console.log("Total vectors prepared:", vectors.length);

  if (vectors.length === 0) {
    console.error("No vectors to upsert. Check CSVs.");
    process.exit(1);
  }

  await upsertToPinecone(vectors);

  // save crosslinks.json if exists
  if (fs.existsSync("crosslinks.csv")) {
    const raw = fs.readFileSync("crosslinks.csv", "utf8");
    const cross = Papa.parse(raw, { header: true, skipEmptyLines: true }).data;
    fs.writeFileSync("crosslinks.json", JSON.stringify(cross, null, 2));
    console.log("Saved crosslinks.json");
  }

  console.log("✅ Ingestion complete.");
  process.exit(0);
})();
