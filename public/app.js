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

// Sliding Sidebar DOM Elements
const sourceSidebar      = document.getElementById("source-sidebar");
const sidebarBackdrop    = document.getElementById("sidebar-backdrop");
const closeSidebarBtn    = document.getElementById("close-sidebar-btn");
const sidebarPageNum     = document.getElementById("sidebar-page-num");
const sidebarGradingReason = document.getElementById("sidebar-grading-reason");
const sidebarChunkText   = document.getElementById("sidebar-chunk-text");

// ── State ────────────────────────────────────────────────────────────────────
let currentCollection = null;
let isProcessing = false;
const responseRegistry = new Map();
let messageCounter = 0;

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

// Render dynamic AI-generated document suggestion chips
function renderSuggestions(suggestions) {
  const container = document.getElementById("welcome-msg");
  if (!container) return;
  const chipsContainer = container.querySelector(".chips");
  if (!chipsContainer) return;
  
  if (suggestions && suggestions.length > 0) {
    chipsContainer.innerHTML = suggestions.map(s => 
      `<button class="chip" data-query="${escapeHtml(s)}">${escapeHtml(s)}</button>`
    ).join("");
  } else {
    chipsContainer.innerHTML = `
      <button class="chip" data-query="What is the main topic of this document?">Summarize the main topic</button>
      <button class="chip" data-query="What are the key takeaways?">List key takeaways</button>
    `;
  }
}

function resetWelcomeScreen(suggestions) {
  chatMessages.innerHTML = `
    <div class="welcome-msg" id="welcome-msg">
      <div class="welcome-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      </div>
      <h3>Knowledge Base Ready</h3>
      <p>Ask anything. Our Corrective RAG ensures answers are strictly grounded in your document.</p>
      <div class="chips"></div>
    </div>
  `;
  renderSuggestions(suggestions);
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

    // Update suggestions dynamically
    resetWelcomeScreen(data.suggestions);

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
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: "Chat failed" }));
      throw new Error(errData.error || "Chat failed");
    }
    
    // Decode SSE Stream from Server
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      
      for (const line of lines) {
        const cleanLine = line.trim();
        if (cleanLine.startsWith("data: ")) {
          try {
            const payload = JSON.parse(cleanLine.substring(6));
            if (payload.type === "progress") {
              // Update live status text
              updateTypingStatus(typing, payload.message);
            } else if (payload.type === "result") {
              typing.remove();
              addAiMessage(payload.data);
              scrollBottom();
            } else if (payload.type === "error") {
              throw new Error(payload.error);
            }
          } catch (e) {
            console.error("Stream parse error:", e);
          }
        }
      }
    }
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

function addTyping() {
  const wrap = document.createElement("div");
  wrap.className = "message msg-ai typing-indicator-wrap";
  wrap.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
    <div class="crag-live-progress hidden">
      <span class="spinner-tiny"></span>
      <span class="progress-text"></span>
    </div>
  `;
  chatMessages.appendChild(wrap);
  return wrap;
}

function updateTypingStatus(typingEl, message) {
  const progressEl = typingEl.querySelector(".crag-live-progress");
  const textEl = typingEl.querySelector(".progress-text");
  if (progressEl && textEl) {
    textEl.textContent = message;
    progressEl.classList.remove("hidden");
  }
}

function addAiMessage(data) {
  const wrap = document.createElement("div");
  wrap.className = `message msg-ai`;
  
  // Register message ID for globally mapped sidebar lookups
  const msgId = `msg-ai-${messageCounter++}`;
  wrap.id = msgId;
  responseRegistry.set(msgId, data);
  
  let html = "";
  
  // Render CRAG Pipeline Trace (expanded by default)
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
          <div class="crag-eval-title">Local Source Evaluation (Click card to explore):</div>
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
          <div class="crag-source-card crag-source-card-clickable" data-chunk-index="${ec.index - 1}">
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
  
  // Replace citations [Source Document Chunk X | Page Y] with interactive source links
  let answerHtml = data.answer;
  answerHtml = answerHtml.replace(/\[Source Document Chunk (\d+) \| Page ([^\]]+)\]/g, (match, chunkIdxStr, pageStr) => {
    const chunkIdx = parseInt(chunkIdxStr) - 1;
    return `<span class="doc-citation-link" data-chunk-index="${chunkIdx}" data-page="${escapeHtml(pageStr)}">[Doc Page ${escapeHtml(pageStr)}]</span>`;
  });

  // Render Answer
  html += formatAnswer(answerHtml);
  
  // Render Local Sources Used (clickable)
  if (data.sources && data.sources.length) {
    html += `<div class="sources-list"><strong>Local document sources used (Click to explore):</strong>`;
    data.sources.forEach((s, idx) => {
      html += `<div class="source-item crag-source-card-clickable" data-chunk-index="${idx}" data-source-type="source">Page ${escapeHtml(String(s.page))}: ${escapeHtml(s.preview)}</div>`;
    });
    html += `</div>`;
  }
  
  wrap.innerHTML = html;
  chatMessages.appendChild(wrap);
}

// ── Sliding Sidebar Citation Viewer ──────────────────────────────────────────
function openSidebar(page, text, reason, grade = "CORRECT") {
  sidebarPageNum.textContent = page;
  sidebarGradingReason.textContent = reason;
  sidebarChunkText.textContent = text;
  
  sidebarGradingReason.className = `reason-box ${grade.toLowerCase()}`;
  
  sourceSidebar.classList.remove("hidden");
  sidebarBackdrop.classList.remove("hidden");
  // Reflow
  void sourceSidebar.offsetWidth;
  
  sourceSidebar.classList.add("active");
  sidebarBackdrop.classList.add("active");
}

function closeSidebar() {
  sourceSidebar.classList.remove("active");
  sidebarBackdrop.classList.remove("active");
  setTimeout(() => {
    sourceSidebar.classList.add("hidden");
    sidebarBackdrop.classList.add("hidden");
  }, 400);
}

closeSidebarBtn.addEventListener("click", closeSidebar);
sidebarBackdrop.addEventListener("click", closeSidebar);

// Click listeners for inline citations, trace cards, and source list items
document.addEventListener("click", e => {
  // 1. Inline Citation Links
  if (e.target.classList.contains("doc-citation-link")) {
    const citation = e.target;
    const chunkIdx = parseInt(citation.dataset.chunkIndex);
    const msgEl = citation.closest(".message");
    if (!msgEl) return;
    
    const data = responseRegistry.get(msgEl.id);
    if (!data || !data.sources || !data.sources[chunkIdx]) return;
    
    const source = data.sources[chunkIdx];
    // Find corresponding grader reasoning from evaluations
    const matchingEval = data.evaluations && data.evaluations.find(ec => ec.page === source.page && source.text.includes(ec.text.substring(0, 50)));
    const reason = matchingEval ? matchingEval.reason : "Verified local document source chunk.";
    const grade = matchingEval ? matchingEval.grade : "CORRECT";
    
    openSidebar(source.page, source.text, reason, grade);
  }
  
  // 2. Clickable evaluations trace cards or sources list items
  const card = e.target.closest(".crag-source-card-clickable");
  if (card) {
    const idx = parseInt(card.dataset.chunkIndex);
    const msgEl = card.closest(".message");
    if (!msgEl) return;
    
    const data = responseRegistry.get(msgEl.id);
    if (!data) return;
    
    const isSourceType = card.dataset.sourceType === "source";
    if (isSourceType) {
      // Local source list click
      const source = data.sources && data.sources[idx];
      if (!source) return;
      const matchingEval = data.evaluations && data.evaluations.find(ec => ec.page === source.page && source.text.includes(ec.text.substring(0, 50)));
      const reason = matchingEval ? matchingEval.reason : "Verified local document source chunk.";
      const grade = matchingEval ? matchingEval.grade : "CORRECT";
      openSidebar(source.page, source.text, reason, grade);
    } else {
      // Evaluations trace card click
      const evaluation = data.evaluations && data.evaluations[idx];
      if (!evaluation) return;
      // Get full text from sources if matched, otherwise show snippet
      const matchingSource = data.sources && data.sources.find(s => s.page === evaluation.page && s.text.includes(evaluation.text.substring(0, 50)));
      const textToDisplay = matchingSource ? matchingSource.text : evaluation.text;
      openSidebar(evaluation.page, textToDisplay, evaluation.reason, evaluation.grade);
    }
  }
});

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
