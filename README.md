# 📚 NotebookLM RAG — Chat with Your Documents

A **RAG-powered** (Retrieval-Augmented Generation) application inspired by Google NotebookLM. Upload any PDF or text document and have a natural-language conversation with it — answers are **grounded in the document's content**, not hallucinated by the LLM.

![Node.js](https://img.shields.io/badge/Node.js-v18+-green)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4.1--mini-blue)
![Qdrant](https://img.shields.io/badge/Vector_DB-Qdrant-red)
![LangChain](https://img.shields.io/badge/LangChain-JS-yellow)

---

## 🎯 Features

- **Upload Documents** — Supports PDF and plain text files (up to 20 MB)
- **Full RAG Pipeline** — Ingestion → Chunking → Embedding → Storage → Retrieval → Generation
- **Intelligent Chunking** — Recursive Character Text Splitter with configurable chunk size & overlap
- **Vector Search** — Qdrant vector database for fast, semantic similarity retrieval
- **Grounded Answers** — LLM answers strictly from document context with page citations
- **Beautiful Web UI** — Dark-mode glassmorphism design with animations
- **Real-time Pipeline Visualization** — Watch each RAG step as it processes

---

## 🏗️ Architecture & RAG Pipeline

```
┌──────────┐    ┌──────────┐    ┌────────────┐    ┌────────┐    ┌───────────┐    ┌────────────┐
│  Upload  │ →  │  Parse   │ →  │   Chunk    │ →  │ Embed  │ →  │   Store   │ →  │  Retrieve  │
│  PDF/TXT │    │  Document│    │  (RecChar) │    │ (OpenAI│    │  (Qdrant) │    │  + Generate│
└──────────┘    └──────────┘    └────────────┘    └────────┘    └───────────┘    └────────────┘
```

### Pipeline Steps

1. **Ingestion** — User uploads a PDF or TXT file via the web interface
2. **Parsing** — PDF files are parsed with `pdf-parse` (via LangChain's `PDFLoader`); TXT files are read directly
3. **Chunking** — Documents are split using the **Recursive Character Text Splitter**
4. **Embedding** — Each chunk is embedded using OpenAI's `text-embedding-3-large` model (3072 dimensions)
5. **Storage** — Embeddings are stored in a **Qdrant** vector database (each document gets its own collection)
6. **Retrieval** — User queries are embedded and the top-5 most similar chunks are retrieved via cosine similarity
7. **Generation** — Retrieved chunks are injected as context into **GPT-4.1-mini**, which generates a grounded answer

---

## 📐 Chunking Strategy — Recursive Character Text Splitter

We use the **Recursive Character Text Splitter** from LangChain, which is the recommended general-purpose text splitter.

### How It Works

The splitter attempts to split text by trying a list of separators in order of priority:

1. `\n\n` — Double newline (paragraph breaks)
2. `\n` — Single newline
3. ` ` — Space (word boundary)
4. `""` — Character-by-character (last resort)

It starts with the most semantically meaningful boundary and falls back to smaller ones only if a chunk exceeds the target size.

### Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `chunkSize` | 1000 chars | Balances context richness with retrieval precision |
| `chunkOverlap` | 200 chars | Ensures no information is lost at chunk boundaries |

### Why This Strategy?

- **Preserves meaning** — Splits on natural text boundaries (paragraphs, sentences)
- **Handles varied content** — Works well with structured and unstructured documents
- **Overlap prevents loss** — 200-char overlap ensures continuous context across chunks
- **Metadata preserved** — Each chunk retains its source page number for citation

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18+
- **OpenAI API Key** — [Get one here](https://platform.openai.com/api-keys)
- **Qdrant** — Either:
  - [Qdrant Cloud](https://cloud.qdrant.io/) (free tier available, recommended for deployment)
  - Local Qdrant via Docker: `docker run -p 6333:6333 qdrant/qdrant`

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/notebooklm-rag.git
cd notebooklm-rag

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your API keys

# 4. Start the server
npm start
```

### Environment Variables

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=sk-your-openai-api-key
QDRANT_URL=https://your-cluster.cloud.qdrant.io:6333
QDRANT_API_KEY=your-qdrant-api-key
PORT=3000
```

### Run Locally

```bash
# Production
npm start

# Development (auto-reload on changes)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌐 Deployment

The app is designed to be deployed on any Node.js hosting platform. Recommended options:

- **Render** — Free tier, auto-deploy from GitHub
- **Railway** — Easy Node.js deploys
- **Vercel** (Serverless) — Requires adaptation

Make sure to set all environment variables in your hosting platform's dashboard.

---

## 📁 Project Structure

```
notebooklm-rag/
├── server.js           # Express server — full RAG backend
├── public/
│   ├── index.html      # Web UI — semantic HTML
│   ├── style.css       # Premium dark-mode styles
│   └── app.js          # Frontend logic
├── package.json        # Dependencies & scripts
├── .env.example        # Environment variable template
├── .gitignore          # Ignored files
└── README.md           # Documentation (this file)
```

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| **Runtime** | Node.js |
| **Server** | Express.js |
| **LLM** | OpenAI GPT-4.1-mini |
| **Embeddings** | OpenAI text-embedding-3-large |
| **Vector DB** | Qdrant |
| **Orchestration** | LangChain.js |
| **PDF Parsing** | pdf-parse |
| **Frontend** | Vanilla HTML/CSS/JS |

---

## 📝 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload and process a document |
| `POST` | `/api/chat` | Ask a question about the document |
| `GET` | `/api/documents` | List all uploaded documents |
| `GET` | `/health` | Health check |

---

## 📄 License

ISC
