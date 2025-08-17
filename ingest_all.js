// ingest_all.js — works with Pinecone CommonJS SDK (v0.x) & OpenAI embeddings (small)
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import OpenAI from 'openai';

// ⬇️ IMPORTANT: use default import for Pinecone (older CommonJS build)
import pinePkg from '@pinecone-database/pinecone';
const { PineconeClient } = pinePkg; // <-- this is the key change

// ---------- Config ----------
const OPENAI_MODEL = 'text-embedding-3-small'; // cheap & good
const DATA_DIR = path.join(process.cwd(), 'data');
const FILE_VERSES = path.join(DATA_DIR, 'verse.csv');        // required
const BATCH_SIZE = 50;                                       // tune if needed
const NAMESPACE = 'verses';                                  // optional

// ---------- Helpers ----------
function readCsv(filepath) {
  const csv = fs.readFileSync(filepath, 'utf8');
  const { data, errors } = Papa.parse(csv, { header: true, skipEmptyLines: true });
  if (errors && errors.length) {
    console.warn('CSV parse warnings:', errors.slice(0, 3));
  }
  return data;
}

function buildDocFromRow(r) {
  // Be tolerant to varying column names; normalize common ones.
  const chap = r.Chapter || r.chapter || '';
  const verse = r.Verse || r.verse || '';
  const sanskrit = r['Sanskrit verse'] || r.sanskrit || r.Sanskrit || '';
  const eng = r['Translation (English)'] || r.translation || r.English || '';
  const hing1 = r['Hinglish (1)'] || r.hinglish || r.Hinglish || r.transliteration_hinglish || '';
  const hing2 = r['Hinglish (2)'] || '';
  const summary = r.Summary || r.summary || '';
  const tags = r.tags || r.Tags || '';
  const sourceId = r['Source ID'] || r.source_id || r.id || `AUTO_${chap}_${verse}`;
  const ref = r.Reference || r.reference || '';

  const id = String(sourceId || `${chap}_${verse}`).replace(/\s+/g, '_');

  // The text we embed: include key fields so retrieval is strong
  const text = [
    `Chapter ${chap} Verse ${verse}`.trim(),
    sanskrit,
    eng,
    hing1,
    hing2,
    summary,
    tags ? `Tags: ${tags}` : '',
    ref ? `Ref: ${ref}` : ''
  ].filter(Boolean).join('\n');

  const metadata = {
    chapter: String(chap || ''),
    verse: String(verse || ''),
    sanskrit: sanskrit || '',
    english: eng || '',
    hinglish1: hing1 || '',
    hinglish2: hing2 || '',
    summary: summary || '',
    tags: String(tags || ''),
    ref: String(ref || ''),
    source_id: String(sourceId || ''),
    kind: 'verse'
  };

  return { id, text, metadata };
}

// ---------- Main ----------
async function main() {
  console.log('🚀 Starting ingestion...');
  // Basic file presence check
  if (!fs.existsSync(FILE_VERSES)) {
    console.error(`❌ Missing file: ${FILE_VERSES}. Put verse.csv into ./data/`);
    process.exit(1);
  }

  // Init OpenAI
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY missing in Railway variables.');
    process.exit(1);
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Init Pinecone (v0.x)
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_ENV || !process.env.PINECONE_INDEX) {
    console.error('❌ Set PINECONE_API_KEY, PINECONE_ENV, PINECONE_INDEX in Railway variables.');
    process.exit(1);
  }
  const pc = new PineconeClient();
  await pc.init({
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENV
  });
  const index = pc.Index(process.env.PINECONE_INDEX);

  // Load CSV rows
  const verses = readCsv(FILE_VERSES);
  console.log(`📄 Found verses: ${verses.length}`);

  // Prepare docs
  const docs = verses.map(buildDocFromRow);
  console.log(`🧩 Prepared docs: ${docs.length}`);

  // Embed + upsert in batches
  let processed = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);

    // 1) Create embeddings for this batch
    const inputs = batch.map(d => d.text);
    let embeddingResp;
    try {
      embeddingResp = await openai.embeddings.create({
        model: OPENAI_MODEL,
        input: inputs
      });
    } catch (e) {
      console.error('❌ OpenAI embedding error:', e?.status || '', e?.message || e);
      throw e;
    }

    // 2) Build vectors for Pinecone
    const vectors = batch.map((d, idx) => ({
      id: d.id,
      values: embeddingResp.data[idx].embedding,
      metadata: d.metadata
    }));

    // 3) Upsert to Pinecone
    try {
      await index.upsert({
        upsertRequest: {
          vectors,
          namespace: NAMESPACE
        }
      });
    } catch (e) {
      console.error('❌ Pinecone upsert error:', e?.status || '', e?.message || e);
      throw e;
    }

    processed += batch.length;
    console.log(`✅ Upserted ${processed}/${docs.length}`);
  }

  console.log('🎉 Ingestion complete.');
}

main().catch(err => {
  console.error('💥 Fatal ingestion error:', err);
  process.exit(1);
});
