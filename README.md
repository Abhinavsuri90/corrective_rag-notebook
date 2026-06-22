# NexusRAG: Corrective RAG & World-Class Document Chat

NexusRAG is a highly advanced, intelligent document analysis platform powered by **Corrective Retrieval-Augmented Generation (CRAG)**. It allows users to upload documents (PDF/TXT) and interact with them in real-time. 

Unlike standard RAG pipelines, NexusRAG evaluates every retrieved chunk of information to ensure absolute relevance, drastically reducing hallucinations and ensuring the AI only answers strictly based on the provided context.

![NexusRAG Interface](https://img.shields.io/badge/UI-Glassmorphism-blue?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Stack-Node.js%20|%20Express%20|%20Qdrant%20|%20Langchain-success?style=for-the-badge)
![AI Models](https://img.shields.io/badge/Models-DeepSeek_V3_Flash-orange?style=for-the-badge)

## 🌟 Key Features

*   **Corrective RAG (CRAG) Pipeline:**
    *   **Intelligent Retrieval:** Uses `OpenAIEmbeddings` to semantically match your query with indexed document chunks.
    *   **LLM-Powered Grading Step:** Before generating an answer, a fast evaluator LLM grades each retrieved chunk. Irrelevant chunks are discarded immediately.
    *   **Strict Grounding:** If no chunks are relevant, the system gracefully falls back without hallucinating.
*   **World-Class Premium UI:** 
    *   Designed with zero external frameworks (Pure HTML/CSS/JS).
    *   Deep **Glassmorphism** effects, animated mesh gradients, and a sleek dark-mode aesthetic.
    *   Live visualizations of the CRAG Evaluation step directly in the chat interface.
*   **Cutting-Edge Models:** Fully integrated with OpenRouter to utilize advanced reasoning models like **DeepSeek V4/Flash** or **Claude 3.5 Sonnet**.
*   **Vector Storage:** High-performance vector indexing using **Qdrant Cloud**.

## 🚀 Quick Start

### Prerequisites
*   Node.js (v18+)
*   An OpenRouter API Key
*   A Qdrant Cloud Cluster URL and API Key

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Abhinavsuri90/corrective_rag-notebook.git
   cd corrective_rag-notebook
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Rename `.env.example` to `.env` and fill in your details:
   ```env
   # OpenRouter Configuration
   OPENAI_API_KEY=your_openrouter_api_key
   OPENAI_BASE_URL=https://openrouter.ai/api/v1

   # Qdrant Vector Database
   QDRANT_URL=your_qdrant_cluster_url
   QDRANT_API_KEY=your_qdrant_api_key

   # Server
   PORT=3000
   ```

4. **Start the application:**
   ```bash
   npm start
   ```

5. **Open your browser:** Navigate to `http://localhost:3000`

## 🧠 Architecture Overview

1.  **Ingestion & Chunking:** Uploaded files are parsed and split using `RecursiveCharacterTextSplitter`.
2.  **Embedding:** Text chunks are embedded and pushed to Qdrant for fast similarity search.
3.  **Retrieval:** The system retrieves the top-k chunks matching the user's query.
4.  **Evaluation (The CRAG Step):** An LLM grades each chunk (`"yes"` or `"no"` for relevance).
5.  **Generation:** The final answer is synthesized using *only* the chunks that passed the evaluation step.

## 📄 License
ISC License.
