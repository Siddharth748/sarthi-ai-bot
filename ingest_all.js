{\rtf1\ansi\ansicpg1252\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 // ingest_all.js\
import fs from "fs";\
import Papa from "papaparse";\
import dotenv from "dotenv";\
import OpenAI from "openai";\
import \{ Pinecone \} from "@pinecone-database/pinecone";\
\
dotenv.config();\
\
// --- Setup clients ---\
const openai = new OpenAI(\{ apiKey: process.env.OPENAI_API_KEY \});\
const pc = new Pinecone(\{ apiKey: process.env.PINECONE_API_KEY \});\
const index = pc.index(process.env.PINECONE_INDEX || "gita-ai");\
\
async function embed(text) \{\
  const res = await openai.embeddings.create(\{\
    model: "text-embedding-3-small",\
    input: text,\
  \});\
  return res.data[0].embedding;\
\}\
\
// --- Generic CSV loader ---\
function loadCSV(path) \{\
  const file = fs.readFileSync(path, "utf8");\
  return Papa.parse(file, \{ header: true \}).data.filter((r) => r && r.reference);\
\}\
\
// --- Ingest Verses ---\
async function ingestVerses() \{\
  const rows = loadCSV("verses.csv");\
  console.log(`\uc0\u55357 \u56534  Verses: $\{rows.length\}`);\
  let batch = [];\
  for (let r of rows) \{\
    const text = `$\{r.reference\}: $\{r.sanskrit\} | $\{r.hinglish\} | $\{r.translation\}`;\
    const emb = await embed(text);\
    batch.push(\{\
      id: r.verse_id,\
      values: emb,\
      metadata: \{ type: "verse", ...r \},\
    \});\
    if (batch.length >= 50) \{\
      await index.upsert(batch);\
      console.log(`Upserted $\{batch.length\}`);\
      batch = [];\
    \}\
  \}\
  if (batch.length) await index.upsert(batch);\
\}\
\
// --- Ingest Commentary ---\
async function ingestCommentary() \{\
  const rows = loadCSV("commentary.csv");\
  console.log(`\uc0\u55357 \u56534  Commentary: $\{rows.length\}`);\
  let batch = [];\
  for (let r of rows) \{\
    const text = `$\{r.title\}: $\{r.commentary_long\}`;\
    const emb = await embed(text);\
    batch.push(\{\
      id: r.commentary_id,\
      values: emb,\
      metadata: \{ type: "commentary", ...r \},\
    \});\
    if (batch.length >= 50) \{\
      await index.upsert(batch);\
      console.log(`Upserted $\{batch.length\}`);\
      batch = [];\
    \}\
  \}\
  if (batch.length) await index.upsert(batch);\
\}\
\
// --- Ingest Practices ---\
async function ingestPractices() \{\
  const rows = loadCSV("practices.csv");\
  console.log(`\uc0\u55357 \u56534  Practices: $\{rows.length\}`);\
  let batch = [];\
  for (let r of rows) \{\
    const text = `$\{r.practice_text\}`;\
    const emb = await embed(text);\
    batch.push(\{\
      id: r.practice_id,\
      values: emb,\
      metadata: \{ type: "practice", ...r \},\
    \});\
    if (batch.length >= 50) \{\
      await index.upsert(batch);\
      console.log(`Upserted $\{batch.length\}`);\
      batch = [];\
    \}\
  \}\
  if (batch.length) await index.upsert(batch);\
\}\
\
// --- Master Ingest ---\
(async () => \{\
  console.log("\uc0\u55357 \u56960  Starting ingestion...");\
  await ingestVerses();\
  await ingestCommentary();\
  await ingestPractices();\
  console.log("\uc0\u9989  Ingestion complete.");\
\})();\
}