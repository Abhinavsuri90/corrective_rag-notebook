/**
 * NotebookLM RAG — Frontend
 */

// ── DOM ──────────────────────────────────────────────────────────────────────
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

function showToast(msg, type = "error") {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 4000);
}

function formatAnswer(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^/, "<p>").replace(/$/, "</p>");
}

function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function scrollBottom() { chatMessages.scrollTop = chatMessages.scrollHeight; }

// ── File Input ───────────────────────────────────────────────────────────────
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) {
    fileLabel.innerHTML = `<strong style="color:var(--green)">${fileInput.files[0].name}</strong>`;
    dropZone.classList.add("has-file");
    uploadBtn.disabled = false;
  }
});

dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", e => {
  e.preventDefault(); dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    fileLabel.innerHTML = `<strong style="color:var(--green)">${e.dataTransfer.files[0].name}</strong>`;
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
  hide(uploadSection);
  show(processingSection);

  // Animate pipeline steps
  const steps = ["step-load", "step-chunk", "step-embed", "step-store"];
  let cur = 0;
  const iv = setInterval(() => {
    if (cur > 0) { const prev = document.getElementById(steps[cur-1]); prev.classList.remove("active"); prev.classList.add("done"); }
    if (cur < steps.length) { document.getElementById(steps[cur]).classList.add("active"); cur++; }
    else clearInterval(iv);
  }, 700);

  try {
    const fd = new FormData();
    fd.append("file", fileInput.files[0]);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");

    // Finish all steps
    clearInterval(iv);
    steps.forEach(id => { const el = document.getElementById(id); el.classList.remove("active"); el.classList.add("done"); });

    await new Promise(r => setTimeout(r, 600));

    currentCollection = data.collectionName;
    docName.textContent = data.originalName;
    docMeta.textContent = `${data.chunkCount} chunks • ${data.pageCount} page(s)`;

    hide(processingSection);
    show(chatSection);
    chatInput.focus();
    showToast("Document processed successfully!", "success");
  } catch (err) {
    showToast(err.message);
    hide(processingSection);
    show(uploadSection);
  } finally {
    isProcessing = false;
    show(btnText); hide(btnLoader);
    uploadBtn.disabled = false;
    steps.forEach(id => { const el = document.getElementById(id); el.classList.remove("active", "done"); });
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
    addMessage(data.answer, "ai", data.sources);
    scrollBottom();
  } catch (err) {
    typing.remove();
    showToast(err.message);
  }
});

function addMessage(text, role, sources = null) {
  const wrap = document.createElement("div");
  wrap.className = `message message-${role}`;

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = role === "user" ? "You" : "AI";

  const body = document.createElement("div");
  body.className = "msg-body";

  if (role === "user") {
    body.innerHTML = `<p>${escapeHtml(text)}</p>`;
  } else {
    body.innerHTML = formatAnswer(text);
    if (sources && sources.length) {
      const sd = document.createElement("div");
      sd.className = "sources";
      sd.innerHTML = `<div class="sources-label">📄 Sources</div>`;
      sources.forEach(s => {
        const si = document.createElement("div");
        si.className = "source-item";
        si.textContent = `Page ${s.page}: ${s.preview}`;
        sd.appendChild(si);
      });
      body.appendChild(sd);
    }
  }

  wrap.appendChild(avatar);
  wrap.appendChild(body);
  chatMessages.appendChild(wrap);
}

function addTyping() {
  const wrap = document.createElement("div");
  wrap.className = "message message-ai";
  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = "AI";
  const body = document.createElement("div");
  body.className = "msg-body";
  body.innerHTML = `<div class="typing-dots"><span class="t-dot"></span><span class="t-dot"></span><span class="t-dot"></span></div>`;
  wrap.appendChild(avatar);
  wrap.appendChild(body);
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
  fileInput.value = "";
  fileLabel.innerHTML = 'Drop your file here or <strong>browse</strong>';
  dropZone.classList.remove("has-file");
  uploadBtn.disabled = true;
  chatMessages.innerHTML = `
    <div class="welcome-msg" id="welcome-msg">
      <div class="welcome-icon-wrap"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
      <h3>Your document is ready!</h3>
      <p>Ask any question — answers come only from your uploaded document.</p>
      <div class="chips">
        <button class="chip" data-query="What is this document about?">📄 What is this about?</button>
        <button class="chip" data-query="Summarize the key points">📝 Key points</button>
        <button class="chip" data-query="What are the main topics covered?">🔍 Main topics</button>
      </div>
    </div>`;
});
