const themeLink = document.getElementById("theme-css");
const themeMenu = document.getElementById("theme-menu");
const content = document.getElementById("content");
const statusLeft = document.getElementById("status-left");
const statusUrl = document.getElementById("status-url");
const statusTheme = document.getElementById("status-theme");

let themes = [];
let activeTheme = null;

init();

async function init() {
  const state = await claudeui.getState();
  themes = state.themes;
  activeTheme = state.theme;
  applyChromeTheme(activeTheme);
  buildThemeMenu();

  setupMenus();
  setupWindowButtons();
  setupBoundsReporting();

  claudeui.onUrl((url) => {
    try {
      const u = new URL(url);
      statusUrl.textContent = u.hostname + (u.pathname !== "/" ? u.pathname : "");
    } catch {
      statusUrl.textContent = url;
    }
  });
  claudeui.onLoading((loading) => {
    statusLeft.textContent = loading ? "loading…" : "ready";
  });
}

/* ---------- themes ---------- */

function applyChromeTheme(id) {
  const theme = themes.find((t) => t.id === id) || themes[0];
  if (!theme) return;
  activeTheme = theme.id;
  themeLink.href = `../themes/${theme.id}/chrome.css`;
  document.documentElement.dataset.theme = theme.id;
  statusTheme.textContent = theme.name;
  buildThemeMenu();
  // theme fonts/sizes shift the layout — re-report bounds once settled
  setTimeout(reportBounds, 60);
  setTimeout(reportBounds, 400);
}

function buildThemeMenu() {
  themeMenu.innerHTML = "";
  for (const theme of themes) {
    const btn = document.createElement("button");
    btn.className = "menu-item" + (theme.id === activeTheme ? " checked" : "");
    btn.textContent = theme.name;
    btn.addEventListener("click", async () => {
      const applied = await claudeui.setTheme(theme.id);
      applyChromeTheme(applied);
      closeMenus();
    });
    themeMenu.appendChild(btn);
  }
}

/* ---------- menus ---------- */

function setupMenus() {
  document.querySelectorAll(".menu > .menu-label").forEach((label) => {
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = label.parentElement;
      const wasOpen = menu.classList.contains("open");
      closeMenus();
      if (!wasOpen) {
        menu.classList.add("open");
        claudeui.menuOpen(true);
      }
    });
  });
  document.addEventListener("click", closeMenus);

  document.querySelectorAll(".menu-item[data-nav]").forEach((item) => {
    item.addEventListener("click", () => {
      claudeui.nav(item.dataset.nav);
      closeMenus();
    });
  });
  document.getElementById("menu-quit").addEventListener("click", () => claudeui.winAction("close"));
  document.getElementById("menu-max").addEventListener("click", () => {
    claudeui.winAction("max");
    closeMenus();
  });
}

function closeMenus() {
  const open = document.querySelectorAll(".menu.open");
  if (open.length === 0) return;
  open.forEach((m) => m.classList.remove("open"));
  claudeui.menuOpen(false);
}

/* ---------- window buttons ---------- */

function setupWindowButtons() {
  document.getElementById("btn-min").addEventListener("click", () => claudeui.winAction("min"));
  document.getElementById("btn-max").addEventListener("click", () => claudeui.winAction("max"));
  document.getElementById("btn-close").addEventListener("click", () => claudeui.winAction("close"));
}

/* ---------- keep the claude.ai view glued to the content area ---------- */

function reportBounds() {
  const r = content.getBoundingClientRect();
  claudeui.reportBounds({ x: r.x, y: r.y, width: r.width, height: r.height });
}

function setupBoundsReporting() {
  new ResizeObserver(reportBounds).observe(content);
  window.addEventListener("resize", reportBounds);
  themeLink.addEventListener("load", reportBounds);
  reportBounds();
}
