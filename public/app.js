/**
 * CRAG — Frontend Logic
 */

// ── DOM Elements ─────────────────────────────────────────────────────────────
const uploadSection     = document.getElementById("upload-section");
const processingSection = document.getElementById("processing-section");
const chatSection       = document.getElementById("chat-section");

const uploadForm = document.getElementById("upload-form");
const fileInput  = document.getElementById("file-input");
const fileLabel  = document.getElementById("file-label");
const dropZone   = document.getElementById("drop-zone");
const uploadBtn  = document.getElementById("upload-btn");
const btnText    = document.getElementById("btn-text");
const btnLoader  = document.getElementById("btn-loader");

const chatForm     = document.getElementById("chat-form");
const chatInput    = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");
const sendBtn      = document.getElementById("send-btn");
const newDocBtn    = document.getElementById("new-doc-btn");
const docName      = document.getElementById("doc-name");
const docMeta      = document.getElementById("doc-meta");

// ── State ────────────────────────────────────────────────────────────────────
let currentCollection = null;
let isProcessing = false;

// ── Helpers ──────────────────────────────────────────────────────────────────
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function formatAnswer(text) {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" class="web-citation-link">$1</a>')
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^/, "<p>").replace(/$/, "</p>");
}

function escapeHtml(s) { 
  const d = document.createElement("div"); 
  d.textContent = s; 
  return d.innerHTML; 
}
function scrollBottom() { 
  chatMessages.scrollTop = chatMessages.scrollHeight; 
}

// ── File Input ───────────────────────────────────────────────────────────────
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) {
    fileLabel.innerHTML = `Selected: <strong>${fileInput.files[0].name}</strong>`;
    dropZone.classList.add("has-file");
    uploadBtn.disabled = false;
  }
});

dropZone.addEventListener("dragover", e => { 
  e.preventDefault(); 
  dropZone.classList.add("dragover"); 
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", e => {
  e.preventDefault(); 
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    fileLabel.innerHTML = `Selected: <strong>${e.dataTransfer.files[0].name}</strong>`;
    dropZone.classList.add("has-file");
    uploadBtn.disabled = false;
  }
});

// ── Upload ───────────────────────────────────────────────────────────────────
uploadForm.addEventListener("submit", async e => {
  e.preventDefault();
  if (!fileInput.files.length || isProcessing) return;

  isProcessing = true;
  hide(btnText); show(btnLoader);
  uploadBtn.disabled = true;

  // Switch to processing view
  uploadSection.classList.remove("active-section");
  hide(uploadSection);
  show(processingSection);

  // Animate pipeline steps
  const steps = ["step-load", "step-chunk", "step-embed", "step-store"];
  let cur = 0;
  const iv = setInterval(() => {
    if (cur > 0) { 
      const prev = document.getElementById(steps[cur-1]); 
      prev.classList.remove("active"); 
      prev.classList.add("done"); 
    }
    if (cur < steps.length) { 
      document.getElementById(steps[cur]).classList.add("active"); 
      cur++; 
    } else {
      clearInterval(iv);
    }
  }, 800);

  try {
    const fd = new FormData();
    fd.append("file", fileInput.files[0]);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");

    // Finish all steps
    clearInterval(iv);
    steps.forEach(id => { 
      const el = document.getElementById(id); 
      el.classList.remove("active"); 
      el.classList.add("done"); 
    });

    await new Promise(r => setTimeout(r, 600));

    currentCollection = data.collectionName;
    docName.textContent = data.originalName;
    docMeta.textContent = `${data.chunkCount} chunks • ${data.pageCount} page(s)`;

    hide(processingSection);
    show(chatSection);
    chatInput.focus();
  } catch (err) {
    alert(err.message);
    hide(processingSection);
    show(uploadSection);
    uploadSection.classList.add("active-section");
  } finally {
    isProcessing = false;
    show(btnText); hide(btnLoader);
    uploadBtn.disabled = false;
    steps.forEach(id => { 
      const el = document.getElementById(id); 
      el.classList.remove("active", "done"); 
    });
  }
});

// ── Chat ─────────────────────────────────────────────────────────────────────
chatForm.addEventListener("submit", async e => {
  e.preventDefault();
  const query = chatInput.value.trim();
  if (!query || !currentCollection) return;

  const welcome = document.getElementById("welcome-msg");
  if (welcome) welcome.remove();

  addMessage(query, "user");
  chatInput.value = "";
  chatInput.disabled = true;
  sendBtn.disabled = true;
  
  const typing = addTyping();
  scrollBottom();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, collectionName: currentCollection }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Chat failed");
    
    typing.remove();
    addAiMessage(data);
    scrollBottom();
  } catch (err) {
    typing.remove();
    alert("Error: " + err.message);
  } finally {
    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
});

function addMessage(text, role) {
  const wrap = document.createElement("div");
  wrap.className = `message msg-role`;
  if (role === "user") {
    wrap.classList.add("msg-user");
    wrap.innerHTML = escapeHtml(text);
  } else {
    wrap.classList.add("msg-ai");
    wrap.innerHTML = formatAnswer(text);
  }
  chatMessages.appendChild(wrap);
}

function addAiMessage(data) {
  const wrap = document.createElement("div");
  wrap.className = `message msg-ai`;
  
  let html = "";
  
  // Render CRAG Pipeline Trace (if path is provided)
  if (data.path) {
    let pathLabel = "";
    let pathClass = "";
    switch (data.path) {
      case "DOCUMENT_ONLY":
        pathLabel = "Document Only • Grounded Response";
        pathClass = "path-document-only";
        break;
      case "DOCUMENT_AND_SEARCH":
        pathLabel = "Document & Web Search • Complementary";
        pathClass = "path-document-and-search";
        break;
      case "SEARCH_ONLY":
        pathLabel = "Web Search • Corrective Fallback";
        pathClass = "path-search-only";
        break;
    }

    html += `
      <details class="crag-trace-details" open>
        <summary class="crag-trace-summary">
          <span>🔍 CRAG Trace: ${escapeHtml(data.path)}</span>
        </summary>
        <div class="crag-trace-content">
          <div class="crag-pathway-section">
            <span class="crag-pathway-title">Execution Pathway:</span>
            <span class="crag-path-badge ${pathClass}">${escapeHtml(pathLabel)}</span>
          </div>
    `;

    // Render evaluated chunks
    if (data.evaluations && data.evaluations.length > 0) {
      html += `
        <div>
          <div class="crag-eval-title">Local Source Evaluation:</div>
          <div class="crag-source-grid">
      `;
      data.evaluations.forEach((ec) => {
        let gradeClass = "";
        switch (ec.grade) {
          case "CORRECT": gradeClass = "grade-correct"; break;
          case "AMBIGUOUS": gradeClass = "grade-ambiguous"; break;
          case "INCORRECT": gradeClass = "grade-incorrect"; break;
        }
        html += `
          <div class="crag-source-card">
            <div class="crag-source-header">
              <span class="crag-source-meta">Chunk ${ec.index} (Page ${escapeHtml(String(ec.page))})</span>
              <span class="grade-badge ${gradeClass}">${escapeHtml(ec.grade)}</span>
            </div>
            <div class="crag-source-reason">${escapeHtml(ec.reason)}</div>
            <div class="crag-source-snippet">${escapeHtml(ec.text)}</div>
          </div>
        `;
      });
      html += `
          </div>
        </div>
      `;
    }

    // Render rewritten search query
    if (data.searchQuery) {
      html += `
        <div class="crag-query-section">
          <div class="crag-query-title">Query Generator (Search Engine Optimized):</div>
          <div class="crag-query-value">"${escapeHtml(data.searchQuery)}"</div>
        </div>
      `;
    }

    // Render web search results
    if (data.webResults && data.webResults.length > 0) {
      html += `
        <div class="crag-web-results">
          <div class="crag-web-title">Web Retrieval Snippets:</div>
      `;
      data.webResults.forEach((r) => {
        html += `
          <div class="crag-web-item">
            <div class="crag-web-header">
              <a href="${escapeHtml(r.url)}" target="_blank" class="crag-web-link">${escapeHtml(r.title)}</a>
            </div>
            <div class="crag-web-snippet">${escapeHtml(r.snippet)}</div>
          </div>
        `;
      });
      html += `</div>`;
    }

    html += `
        </div>
      </details>
    `;
  }
  
  // Render Answer
  html += formatAnswer(data.answer);
  
  // Render Local Sources Used
  if (data.sources && data.sources.length) {
    html += `<div class="sources-list"><strong>Local document sources used:</strong>`;
    data.sources.forEach(s => {
      html += `<div class="source-item">Page ${escapeHtml(String(s.page))}: ${escapeHtml(s.preview)}</div>`;
    });
    html += `</div>`;
  }
  
  wrap.innerHTML = html;
  chatMessages.appendChild(wrap);
}

function addTyping() {
  const wrap = document.createElement("div");
  wrap.className = "message msg-ai typing-indicator";
  wrap.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
  chatMessages.appendChild(wrap);
  return wrap;
}

// ── Suggestion Chips ─────────────────────────────────────────────────────────
document.addEventListener("click", e => {
  if (e.target.classList.contains("chip")) {
    chatInput.value = e.target.dataset.query;
    chatForm.dispatchEvent(new Event("submit"));
  }
});

// ── New Document ─────────────────────────────────────────────────────────────
newDocBtn.addEventListener("click", () => {
  currentCollection = null;
  hide(chatSection);
  show(uploadSection);
  uploadSection.classList.add("active-section");
  
  fileInput.value = "";
  fileLabel.innerHTML = 'Drag & drop your file or <span class="browse-link">browse</span>';
  dropZone.classList.remove("has-file");
  uploadBtn.disabled = true;
  
  chatMessages.innerHTML = `
    <div class="welcome-msg" id="welcome-msg">
      <div class="welcome-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      </div>
      <h3>Knowledge Base Ready</h3>
      <p>Ask anything. Our Corrective RAG ensures answers are strictly grounded in your document.</p>
      <div class="chips">
        <button class="chip" data-query="What is the main topic of this document?">Summarize the main topic</button>
        <button class="chip" data-query="What are the key takeaways?">List key takeaways</button>
      </div>
    </div>`;
});
