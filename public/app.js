const chatEl = document.getElementById("chat");
const composer = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const themeLink = document.getElementById("theme-css");
const themeMenu = document.getElementById("theme-menu");
const windowEl = document.getElementById("window");
const statusLeft = document.getElementById("status-left");
const statusUsage = document.getElementById("status-usage");
const statusModel = document.getElementById("status-model");
const statusTheme = document.getElementById("status-theme");

const GREETING = "hi!! i'm claude ♥ what are we chatting about today?";

let themes = [];
let messages = []; // kept for export only — the server tracks the conversation
let sessionId = null;
let busy = false;

init();

async function init() {
  fetch("/api/config")
    .then((r) => r.json())
    .then((cfg) => (statusModel.textContent = cfg.model))
    .catch(() => {});

  try {
    themes = await fetch("/themes/themes.json").then((r) => r.json());
  } catch {
    themes = [];
  }
  const saved = localStorage.getItem("claudeui-theme");
  applyTheme(themes.some((t) => t.id === saved) ? saved : themes[0]?.id);

  setupMenus();
  setupWindowButtons();
  setupComposer();
  greet();
  input.focus();
}

/* ---------- themes ---------- */

function applyTheme(id) {
  const theme = themes.find((t) => t.id === id) || themes[0];
  if (!theme) return;
  themeLink.href = `/themes/${theme.id}/theme.css`;
  document.documentElement.dataset.theme = theme.id;
  localStorage.setItem("claudeui-theme", theme.id);
  statusTheme.textContent = theme.name;
  buildThemeMenu(theme.id);
}

function buildThemeMenu(activeId) {
  themeMenu.innerHTML = "";
  for (const theme of themes) {
    const btn = document.createElement("button");
    btn.className = "menu-item" + (theme.id === activeId ? " checked" : "");
    btn.textContent = theme.name;
    btn.addEventListener("click", () => {
      applyTheme(theme.id);
      closeMenus();
    });
    themeMenu.appendChild(btn);
  }
}

/* ---------- menus & window chrome ---------- */

function setupMenus() {
  document.querySelectorAll(".menu > .menu-label").forEach((label) => {
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = label.parentElement;
      const wasOpen = menu.classList.contains("open");
      closeMenus();
      if (!wasOpen) menu.classList.add("open");
    });
  });
  document.addEventListener("click", closeMenus);

  document.getElementById("menu-new").addEventListener("click", () => {
    newChat();
    closeMenus();
  });
  document.getElementById("menu-export").addEventListener("click", () => {
    exportChat();
    closeMenus();
  });
  document.getElementById("menu-fullscreen").addEventListener("click", () => {
    windowEl.classList.toggle("maximized");
    closeMenus();
  });
}

function closeMenus() {
  document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
}

function setupWindowButtons() {
  document.getElementById("btn-min").addEventListener("click", () => {
    windowEl.classList.toggle("collapsed");
  });
  document.getElementById("btn-max").addEventListener("click", () => {
    windowEl.classList.toggle("maximized");
  });
  document.getElementById("btn-close").addEventListener("click", () => {
    windowEl.classList.remove("shake");
    void windowEl.offsetWidth; // restart animation
    windowEl.classList.add("shake");
    setStatus("nice try ♥");
    setTimeout(() => setStatus("ready"), 2000);
  });
}

/* ---------- chat ---------- */

function setupComposer() {
  composer.addEventListener("submit", (e) => {
    e.preventDefault();
    send();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
}

function greet() {
  renderMessage("assistant", GREETING);
}

function newChat() {
  messages = [];
  sessionId = null;
  chatEl.innerHTML = "";
  statusUsage.textContent = "";
  greet();
  setStatus("ready");
  input.focus();
}

function exportChat() {
  if (messages.length === 0) {
    setStatus("nothing to export yet ♥");
    setTimeout(() => setStatus("ready"), 2000);
    return;
  }
  const text = messages.map((m) => `${m.role === "user" ? "you" : "claude"}:\n${m.content}\n`).join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "claude-chat.txt";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function send() {
  const text = input.value.trim();
  if (!text || busy) return;

  busy = true;
  sendBtn.disabled = true;
  setStatus("sending…");

  messages.push({ role: "user", content: text });
  renderMessage("user", text);
  input.value = "";

  const aiEl = renderMessage("assistant", null); // typing indicator
  let acc = "";

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId }),
    });
    if (!resp.ok || !resp.body) throw new Error(`server error (${resp.status})`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "thinking") {
            setStatus("claude is thinking…");
          } else if (evt.type === "text") {
            acc += evt.text;
            updateMessage(aiEl, acc);
            setStatus("claude is typing…");
          } else if (evt.type === "done") {
            if (evt.sessionId) sessionId = evt.sessionId;
            if (evt.usage) {
              statusUsage.textContent = `tokens: ${evt.usage.input} in / ${evt.usage.output} out`;
            }
          } else if (evt.type === "error") {
            throw new Error(evt.message);
          }
        }
      }
    }

    if (acc) {
      messages.push({ role: "assistant", content: acc });
    } else {
      aiEl.remove();
    }
  } catch (err) {
    aiEl.classList.add("error");
    updateMessage(aiEl, `**error:** ${err.message}`);
  } finally {
    busy = false;
    sendBtn.disabled = false;
    setStatus("ready");
    input.focus();
  }
}

/* ---------- rendering ---------- */

function renderMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;

  const author = document.createElement("div");
  author.className = "msg-author";
  author.textContent = role === "user" ? "you" : "claude";

  const body = document.createElement("div");
  body.className = "msg-body";
  if (text === null) {
    body.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
  } else {
    body.innerHTML = renderMarkdown(text);
  }

  el.append(author, body);
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  return el;
}

function updateMessage(el, text) {
  const nearBottom = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 80;
  el.querySelector(".msg-body").innerHTML = renderMarkdown(text);
  if (nearBottom) chatEl.scrollTop = chatEl.scrollHeight;
}

function setStatus(text) {
  statusLeft.textContent = text;
}

/* ---------- tiny markdown renderer ---------- */

const FENCE_MARK = String.fromCharCode(0); // sentinel that never appears in chat text
const FENCE_TOKEN_RE = new RegExp(`${FENCE_MARK}(\\d+)${FENCE_MARK}`, "g");
const FENCE_ONLY_RE = new RegExp(`^${FENCE_MARK}\\d+${FENCE_MARK}$`);

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMarkdown(src) {
  const fences = [];
  src = src.replace(/```(\w*)\n?([\s\S]*?)(?:```|$)/g, (m, lang, code) => {
    fences.push(code);
    return `${FENCE_MARK}${fences.length - 1}${FENCE_MARK}`;
  });

  let html = escapeHtml(src);

  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  html = html.replace(/(^|\n)((?:[-*] .+(?:\n|$))+)/g, (m, pre, group) => {
    const items = group
      .trim()
      .split("\n")
      .map((l) => `<li>${l.replace(/^[-*] /, "")}</li>`)
      .join("");
    return `${pre}<ul>${items}</ul>`;
  });
  html = html.replace(/(^|\n)((?:\d+\. .+(?:\n|$))+)/g, (m, pre, group) => {
    const items = group
      .trim()
      .split("\n")
      .map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`)
      .join("");
    return `${pre}<ol>${items}</ol>`;
  });

  html = html
    .split(/\n{2,}/)
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return "";
      if (FENCE_ONLY_RE.test(trimmed)) return trimmed;
      if (/^<(h\d|ul|ol)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");

  html = html.replace(FENCE_TOKEN_RE, (m, i) => `<pre><code>${escapeHtml(fences[+i])}</code></pre>`);

  return html;
}
