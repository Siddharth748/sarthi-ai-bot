{\rtf1\ansi\ansicpg1252\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 // retrieve_and_answer.js\
import dotenv from "dotenv";\
import OpenAI from "openai";\
import \{ Pinecone \} from "@pinecone-database/pinecone";\
\
dotenv.config();\
\
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
async function retrieve(userQuery, concern, subtopic) \{\
  const vector = await embed(userQuery);\
  const results = await index.query(\{\
    vector,\
    topK: 4,\
    includeMetadata: true,\
  \});\
  return results.matches.map((m) => m.metadata);\
\}\
\
async function generateAnswer(userQuery, concern, subtopic) \{\
  const contexts = await retrieve(userQuery, concern, subtopic);\
  const systemPrompt = `\
You are SarathiAI, a compassionate guide inspired by Shri Krishna\'92s wisdom.\
Blend Bhagavad Gita verses, commentary, and practices to address modern concerns.\
\
Reply format (always):\
Shri Krishna kehte hain:\
[Sanskrit Verse]  \
Hinglish: ...  \
Summary: ...\
\
Practical Insight: ...\
Try This: ...\
References: ...\
`;\
\
  const userPrompt = `User concern: $\{concern\} / $\{subtopic\}\\nQuery: $\{userQuery\}\\nRelevant Contexts: $\{JSON.stringify(\
    contexts\
  )\}`;\
\
  const res = await openai.chat.completions.create(\{\
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",\
    messages: [\
      \{ role: "system", content: systemPrompt \},\
      \{ role: "user", content: userPrompt \},\
    ],\
  \});\
\
  return res.choices[0].message.content;\
\}\
\
// CLI run\
const [,, userQuery, concern, subtopic] = process.argv;\
\
if (!userQuery) \{\
  console.log("Usage: node retrieve_and_answer.js \\"your query\\" concern subtopic");\
  process.exit(1);\
\}\
\
generateAnswer(userQuery, concern || "general", subtopic || "general")\
  .then((ans) => console.log("\\n\\n\uc0\u55357 \u56492  SarathiAI Reply:\\n", ans))\
  .catch((err) => console.error("Error:", err));\
}