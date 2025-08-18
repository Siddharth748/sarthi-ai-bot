// ingest_all.js
import fs from "fs";
import path from "path";
import csvParse from "csv-parse/sync";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

const BATCH_SIZE = 20;
const RETRY_MAX = 6;
const BASE_DELAY_MS = 2000;
const TIMEOUT_MS = 180000;

const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
const NAMESPACE = process.env.PINECONE_NAMESPACE || "verses";

const client = new OpenAI({ apiKey: process.env.OPENAI_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pinecone.index(process.env.PINECONE_INDEX);

// Retry wrapper for Pinecone upsert
async function upsertWithRetry(vectors, namespace) {
  let attempt = 0;
  while (true) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await index.upsert(
        { vectors, namespace },
        { signal: controller.signal }
      );
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      const status = err?.status || err?.response?.status;
      const isTransient =
        err?.name === "AbortError" ||
        status === 408 || status === 409 || status === 429 ||
        (status >= 500 && status < 600);

      if (attempt <= RETRY_MAX && isTransient) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `⚠ Upsert retry ${attempt}/${RETRY_MAX} in ${delay}ms — reason:`,
          err?.message || status || err
        );
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

// Read CSV into rows
function readCsv(filename) {
  const filepath = path.join("./data", filename);
  if (!fs.existsSync(filepath)) return [];
  const raw = fs.readFileSync(filepath, "utf8");
  return csvParse.parse(raw, {
    columns: false,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true
  });
}

async function embedAndUpsert(rows, sourceName) {
  console.log(`📄 Found ${rows.length} from ${sourceName}`);

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, rows.length);
    const slice = rows.slice(start, end);

    const texts = slice.map(r => r[0]); // assumes text is in col 0
    const embeddings = await client.embeddings.create({
      model: EMBED_MODEL,
      input: texts
    });

    const vectors = embeddings.data.map((e, i) => ({
      id: `${sourceName}_${start + i}`,
      values: e.embedding,
      metadata: {
        text: texts[i],
        source: sourceName
      }
    }));

    const res = await upsertWithRetry(vectors, NAMESPACE);
    console.log(
      `✅ Upserted ${vectors.length} vectors (rows ${start + 1}-${end}) from ${sourceName}`
    );

    await new Promise(r => setTimeout(r, 500)); // throttle a bit
  }
}

async function main() {
  console.log("🚀 Starting ingestion...");

  const verseRows = readCsv("verse.csv");
  const commentaryRows = readCsv("commentary.csv");
  const practiceRows = readCsv("practices.csv");

  if (verseRows.length) await embedAndUpsert(verseRows, "verse");
  if (commentaryRows.length) await embedAndUpsert(commentaryRows, "commentary");
  if (practiceRows.length) await embedAndUpsert(practiceRows, "practices");

  console.log("🎉 Ingestion completed successfully!");
}

main().catch(err => {
  console.error("💥 Fatal ingestion error:", err);
  process.exit(1);
});
