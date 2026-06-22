/**
 * NotebookLM RAG — Server
 *
 * Full RAG pipeline:
 *   Ingestion → Chunking → Embedding → Storage → Retrieval → Generation
 *
 * Chunking Strategy: Recursive Character Text Splitter
 *   - Splits text on natural boundaries (paragraphs → sentences → words)
 *   - Uses a chunk size of 1000 characters with 200 character overlap
 *   - Overlap ensures context is not lost at chunk boundaries
 *   - Each chunk retains metadata (page number, source file) for citation
 */

import "dotenv/config";
import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { OpenAI } from "openai";

// ── Paths ────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Express setup ────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── File upload setup ────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".txt"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and TXT files are supported."));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ── Shared instances (lazy-loaded) ───────────────────────────────────────────
let _embeddings = null;
let _openai = null;

function getEmbeddings() {
  if (!_embeddings) {
    const config = { model: "openai/text-embedding-3-large" };
    // Support OpenRouter or any custom OpenAI-compatible endpoint
    if (process.env.OPENAI_BASE_URL) {
      config.configuration = { baseURL: process.env.OPENAI_BASE_URL };
    }
    _embeddings = new OpenAIEmbeddings(config);
  }
  return _embeddings;
}

function getOpenAI() {
  if (!_openai) {
    const config = {};
    if (process.env.OPENAI_BASE_URL) {
      config.baseURL = process.env.OPENAI_BASE_URL;
    }
    _openai = new OpenAI(config);
  }
  return _openai;
}

// ── In-memory document registry ─────────────────────────────────────────────
// Maps collectionName → { originalName, uploadedAt, chunkCount }
const documentRegistry = new Map();

// ═══════════════════════════════════════════════════════════════════════════════
//  CHUNKING STRATEGY — Recursive Character Text Splitter
// ═══════════════════════════════════════════════════════════════════════════════
//
//  Why Recursive Character Text Splitter?
//  1. It tries to split on the most semantically meaningful boundary first
//     (double newline → single newline → sentence-ending punctuation → space).
//  2. If a chunk is still too large it falls back to smaller boundaries.
//  3. Overlap ensures no information is lost between adjacent chunks.
//
//  Parameters:
//    chunkSize   = 1000  — each chunk ≤ 1000 characters
//    chunkOverlap = 200  — consecutive chunks share 200 characters of context
// ═══════════════════════════════════════════════════════════════════════════════

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Load a file and return raw LangChain Document objects.
 */
async function loadFile(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === ".pdf") {
    const loader = new PDFLoader(filePath);
    return loader.load();
  }

  // Plain text
  const text = fs.readFileSync(filePath, "utf-8");
  return [
    {
      pageContent: text,
      metadata: { source: originalName, page: 1 },
    },
  ];
}

/**
 * Chunk documents using the Recursive Character Text Splitter.
 */
async function chunkDocuments(docs) {
  const chunks = await textSplitter.splitDocuments(docs);
  // Add a sequential chunk index to each chunk's metadata
  return chunks.map((chunk, i) => {
    chunk.metadata.chunkIndex = i;
    return chunk;
  });
}

/**
 * Perform a web search using Tavily API (if key is set) or fallback to DuckDuckGo HTML scraping.
 */
async function searchWeb(query) {
  console.log(`🌐 Performing web search for: "${query}"`);
  
  // 1. Try Tavily search if API key is present
  if (process.env.TAVILY_API_KEY) {
    try {
      console.log("   → Using Tavily API...");
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query,
          search_depth: "basic",
          max_results: 5,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          return data.results.map((r) => ({
            title: r.title || "No Title",
            url: r.url || "#",
            snippet: r.content || r.snippet || "",
          }));
        }
      }
      console.warn(`   ⚠ Tavily API returned status ${res.status}, falling back to DDG scraping...`);
    } catch (err) {
      console.error("   ⚠ Tavily search error, falling back to DDG scraping:", err);
    }
  }

  // 2. Fallback to DuckDuckGo HTML Scraper
  try {
    console.log("   → Using DuckDuckGo scraping...");
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
      }
    });
    
    if (!response.ok) {
      throw new Error(`DDG response status ${response.status}`);
    }
    
    const html = await response.text();
    const results = [];
    const parts = html.split('<h2 class="result__title">');
    
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const titleLinkMatch = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(part);
      if (!titleLinkMatch) continue;
      
      let rawHref = titleLinkMatch[1];
      let title = titleLinkMatch[2].replace(/<[^>]*>/g, "").trim();
      
      const snippetMatch = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(part);
      let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, "").trim() : "";
      
      let actualUrl = rawHref;
      if (rawHref.includes("uddg=")) {
        const match = /uddg=([^&]+)/.exec(rawHref);
        if (match) {
          try {
            actualUrl = decodeURIComponent(match[1]);
          } catch (e) {
            // ignore
          }
        }
      }
      
      if (!actualUrl.startsWith("http")) {
        if (actualUrl.startsWith("//")) {
          actualUrl = "https:" + actualUrl;
        } else {
          continue;
        }
      }
      
      results.push({
        title,
        url: actualUrl,
        snippet,
      });
      
      if (results.length >= 5) break;
    }
    
    console.log(`   ✔ Scraped ${results.length} results from DDG`);
    return results;
  } catch (err) {
    console.error("   ❌ Web search completely failed:", err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  API ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/upload
 * Ingestion endpoint — accepts a PDF or TXT file, chunks it, embeds it,
 * and stores the vectors in Qdrant.
 */
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    // Unique collection per document so multiple docs don't collide
    const collectionName = `doc-${uuidv4()}`;

    console.log(`📄 Ingesting: ${originalName}`);

    // Step 1 — Load
    const docs = await loadFile(filePath, originalName);
    console.log(`   ✔ Loaded ${docs.length} page(s)`);

    // Step 2 — Chunk
    const chunks = await chunkDocuments(docs);
    console.log(`   ✔ Created ${chunks.length} chunk(s)`);

    // Step 3 & 4 — Embed + Store in Qdrant
    const qdrantConfig = {
      collectionName,
    };
    // Support both local Qdrant and Qdrant Cloud
    if (process.env.QDRANT_URL) {
      qdrantConfig.url = process.env.QDRANT_URL;
    }
    if (process.env.QDRANT_API_KEY) {
      qdrantConfig.apiKey = process.env.QDRANT_API_KEY;
    }

    await QdrantVectorStore.fromDocuments(chunks, getEmbeddings(), qdrantConfig);
    console.log(`   ✔ Stored in Qdrant collection "${collectionName}"`);

    // Register the document
    documentRegistry.set(collectionName, {
      originalName,
      uploadedAt: new Date().toISOString(),
      chunkCount: chunks.length,
    });

    // Clean up the uploaded file from disk
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      collectionName,
      originalName,
      chunkCount: chunks.length,
      pageCount: docs.length,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/chat
 * Retrieval + Generation endpoint — takes a user query and a collectionName,
 * retrieves the most relevant chunks, and generates a grounded answer.
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { query, collectionName } = req.body;

    if (!query || !collectionName) {
      return res
        .status(400)
        .json({ error: "Both 'query' and 'collectionName' are required." });
    }

    console.log(`💬 Query: "${query}" → collection: ${collectionName}`);

    // Step 1 — Retrieval: find the top-k most relevant chunks
    const qdrantConfig = {
      collectionName,
    };
    if (process.env.QDRANT_URL) {
      qdrantConfig.url = process.env.QDRANT_URL;
    }
    if (process.env.QDRANT_API_KEY) {
      qdrantConfig.apiKey = process.env.QDRANT_API_KEY;
    }

    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      getEmbeddings(),
      qdrantConfig
    );

    const retriever = vectorStore.asRetriever({ k: 5 });
    const relevantChunks = await retriever.invoke(query);

    console.log(`   ✔ Retrieved ${relevantChunks.length} chunk(s), starting CRAG evaluation...`);

    // Step 2 — 3-State Grader Step
    const evaluationPromises = relevantChunks.map(async (chunk) => {
      const gradingPrompt = `You are a professional assessor grading the relevance of a retrieved document to a user question.
User question: "${query}"
Retrieved document content:
"${chunk.pageContent}"

Grade the document based on its relevance:
1. "CORRECT" - The document contains direct information, facts, or answers that are highly relevant to the question.
2. "AMBIGUOUS" - The document contains some related keywords or context, but does not fully answer the question, or has missing details that need external search.
3. "INCORRECT" - The document is completely irrelevant to the question.

You MUST respond ONLY with a JSON object. Do not include markdown code block syntax (like \`\`\`json). The JSON format must be:
{
  "grade": "CORRECT" | "AMBIGUOUS" | "INCORRECT",
  "reason": "A one-sentence explanation of why this grade was assigned."
}`;

      try {
        const evalResponse = await getOpenAI().chat.completions.create({
          model: "minimax/minimax-m3",
          messages: [{ role: "user", content: gradingPrompt }],
          temperature: 0,
        });
        
        let content = evalResponse.choices[0].message.content.trim();
        if (content.startsWith("```")) {
          content = content.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
        }
        
        const parsed = JSON.parse(content);
        let grade = "INCORRECT";
        if (parsed.grade && ["CORRECT", "AMBIGUOUS", "INCORRECT"].includes(parsed.grade.toUpperCase())) {
          grade = parsed.grade.toUpperCase();
        }
        return {
          chunk,
          grade,
          reason: parsed.reason || "Evaluated chunk successfully."
        };
      } catch (err) {
        console.error("Evaluation parsing error, defaulting to AMBIGUOUS:", err);
        return {
          chunk,
          grade: "AMBIGUOUS",
          reason: "Evaluation parsing failed; defaulted to ambiguous for safety."
        };
      }
    });

    const evaluatedChunks = await Promise.all(evaluationPromises);
    
    const correctChunks = evaluatedChunks.filter(c => c.grade === "CORRECT").map(c => c.chunk);
    const ambiguousChunks = evaluatedChunks.filter(c => c.grade === "AMBIGUOUS").map(c => c.chunk);
    const incorrectChunks = evaluatedChunks.filter(c => c.grade === "INCORRECT").map(c => c.chunk);

    console.log(`   ✔ Evaluation: ${correctChunks.length} CORRECT, ${ambiguousChunks.length} AMBIGUOUS, ${incorrectChunks.length} INCORRECT`);

    // Step 3 — Route Decision
    let path = "DOCUMENT_ONLY";
    if (evaluatedChunks.length === 0) {
      path = "SEARCH_ONLY";
    } else if (correctChunks.length > 0 && ambiguousChunks.length === 0) {
      path = "DOCUMENT_ONLY";
    } else if ((correctChunks.length > 0 || ambiguousChunks.length > 0) && ambiguousChunks.length > 0) {
      path = "DOCUMENT_AND_SEARCH";
    } else {
      path = "SEARCH_ONLY";
    }

    console.log(`   ✔ Decision Pathway Selected: ${path}`);

    // Step 4 — Search Query Generation (if needed)
    let searchQuery = "";
    let webResults = [];
    if (path === "DOCUMENT_AND_SEARCH" || path === "SEARCH_ONLY") {
      const queryGenPrompt = `You are a search query generator. Analyze the user's question and generate a single search query optimized for search engines (like Google or DuckDuckGo) to find the missing or complementary information. Do not add search operators (like site: or OR).
  
User question: "${query}"

Return ONLY the raw search query string. Do not wrap it in quotes, do not add introductory text, and do not add any explanation.`;

      try {
        const queryResponse = await getOpenAI().chat.completions.create({
          model: "minimax/minimax-m3",
          messages: [{ role: "user", content: queryGenPrompt }],
          temperature: 0,
        });
        searchQuery = queryResponse.choices[0].message.content.trim().replace(/^["']|["']$/g, "");
        console.log(`   ✔ Generated Web Search Query: "${searchQuery}"`);
        
        // Step 5 — Execute Web Search
        webResults = await searchWeb(searchQuery);
      } catch (err) {
        console.error("Query generation or search error:", err);
      }
    }

    // Step 6 — Context Assembly
    let context = "";
    if (path === "DOCUMENT_ONLY") {
      context = correctChunks.map((chunk, i) => `[Source Document Chunk ${i + 1} | Page ${chunk.metadata?.loc?.pageNumber ?? chunk.metadata?.page ?? "N/A"}]\n${chunk.pageContent}`).join("\n\n---\n\n");
    } else if (path === "DOCUMENT_AND_SEARCH") {
      const docContext = [...correctChunks, ...ambiguousChunks].map((chunk, i) => `[Source Document Chunk ${i + 1} | Page ${chunk.metadata?.loc?.pageNumber ?? chunk.metadata?.page ?? "N/A"}]\n${chunk.pageContent}`).join("\n\n---\n\n");
      const webContext = webResults.map((r, i) => `[Web Search Result ${i + 1} | Title: ${r.title} | Link: ${r.url}]\n${r.snippet}`).join("\n\n---\n\n");
      context = `=== LOCAL DOCUMENT CONTEXT ===\n${docContext}\n\n=== WEB SEARCH CONTEXT ===\n${webContext}`;
    } else {
      // SEARCH_ONLY
      const webContext = webResults.map((r, i) => `[Web Search Result ${i + 1} | Title: ${r.title} | Link: ${r.url}]\n${r.snippet}`).join("\n\n---\n\n");
      context = `=== WEB SEARCH CONTEXT (No relevant local document found) ===\n${webContext}`;
    }

    // Step 7 — Generation: send context + query to the LLM
    const systemPrompt = `You are a helpful AI assistant that answers questions based on the provided context.
    
RULES:
1. Synthesize a comprehensive answer using the context provided.
2. For any information retrieved from a local document, cite the page number (e.g., "[Source Document Chunk 1 | Page 3]" or "According to page 3...").
3. For any information retrieved from web search results, cite the source using the exact title of the web search result inline as a clickable markdown hyperlink, using syntax: [Web Result Title](Link) (e.g., "...as discussed in [OpenAI Blog](https://openai.com/blog)...").
4. Keep the answer structured, clear, and grounded. Do not extrapolate or hallucinate beyond the provided facts.
5. If the answer cannot be found in either context, say "I couldn't find relevant information in either the document or web search."

CONTEXT:
${context}`;

    const response = await getOpenAI().chat.completions.create({
      model: "minimax/minimax-m3",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0.3,
    });

    const answer = response.choices[0].message.content;
    console.log(`   ✔ Generated answer`);

    // Prepare response packet
    const evaluations = evaluatedChunks.map((ec, idx) => ({
      index: idx + 1,
      text: ec.chunk.pageContent.substring(0, 200) + (ec.chunk.pageContent.length > 200 ? "..." : ""),
      page: ec.chunk.metadata?.loc?.pageNumber ?? ec.chunk.metadata?.page ?? "N/A",
      grade: ec.grade,
      reason: ec.reason
    }));

    const sources = [...correctChunks, ...ambiguousChunks].map((chunk) => ({
      page: chunk.metadata?.loc?.pageNumber ?? chunk.metadata?.page ?? "N/A",
      preview: chunk.pageContent.substring(0, 150) + "…",
    }));

    res.json({
      answer,
      path,
      searchQuery,
      webResults,
      evaluations,
      sources
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/documents
 * Returns a list of all uploaded documents for the current session.
 */
app.get("/api/documents", (_req, res) => {
  const docs = [];
  for (const [collectionName, meta] of documentRegistry) {
    docs.push({ collectionName, ...meta });
  }
  res.json(docs);
});

/**
 * GET /health
 * Health-check endpoint.
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 NotebookLM RAG server running on http://localhost:${PORT}\n`);
});
