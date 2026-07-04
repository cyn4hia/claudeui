import { app, BrowserWindow, WebContentsView, ipcMain, shell, Menu } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.join(__dirname, "themes");
const CLAUDE_URL = "https://claude.ai";
const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&family=VT323&display=swap";

// Domains allowed to open as real windows (login popups); everything else
// goes to the system browser.
const POPUP_DOMAINS = ["claude.ai", "anthropic.com", "accounts.google.com", "appleid.apple.com"];

const settingsPath = () => path.join(app.getPath("userData"), "settings.json");

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2));
  } catch {}
}

function loadThemes() {
  try {
    return JSON.parse(fs.readFileSync(path.join(THEMES_DIR, "themes.json"), "utf8"));
  } catch {
    return [];
  }
}

let win = null;
let view = null;
let cssKey = null;
let themes = [];
let currentTheme = null;

async function applyClaudeCss(themeId) {
  if (!view) return;
  if (cssKey) {
    try {
      await view.webContents.removeInsertedCSS(cssKey);
    } catch {}
    cssKey = null;
  }
  let css = "";
  try {
    css = fs.readFileSync(path.join(THEMES_DIR, themeId, "claude.css"), "utf8");
  } catch {}
  if (css) {
    try {
      cssKey = await view.webContents.insertCSS(css);
    } catch {}
  }
}

function injectFonts() {
  if (!view) return;
  view.webContents
    .executeJavaScript(
      `(function () {
        if (document.getElementById("claudeui-fonts")) return;
        var l = document.createElement("link");
        l.id = "claudeui-fonts";
        l.rel = "stylesheet";
        l.href = ${JSON.stringify(FONTS_URL)};
        document.head.appendChild(l);
      })();`
    )
    .catch(() => {});
}

function createWindow() {
  themes = loadThemes();
  const saved = loadSettings().theme;
  currentTheme = themes.some((t) => t.id === saved) ? saved : themes[0]?.id;

  win = new BrowserWindow({
    width: 1150,
    height: 820,
    minWidth: 700,
    minHeight: 480,
    frame: false,
    backgroundColor: "#f6bcd8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  win.loadFile(path.join(__dirname, "chrome", "index.html"));

  view = new WebContentsView();
  win.contentView.addChildView(view);
  view.setBounds({ x: 8, y: 70, width: 1000, height: 640 }); // placeholder; renderer reports real bounds
  view.webContents.loadURL(CLAUDE_URL);

  const wc = view.webContents;

  wc.on("did-finish-load", () => {
    cssKey = null; // fresh document — old key is gone
    applyClaudeCss(currentTheme);
    injectFonts();
  });
  wc.on("did-start-loading", () => win?.webContents.send("claudeui:loading", true));
  wc.on("did-stop-loading", () => win?.webContents.send("claudeui:loading", false));
  const sendUrl = () => win?.webContents.send("claudeui:url", wc.getURL());
  wc.on("did-navigate", sendUrl);
  wc.on("did-navigate-in-page", sendUrl);

  wc.setWindowOpenHandler(({ url }) => {
    try {
      const host = new URL(url).hostname;
      if (POPUP_DOMAINS.some((d) => host === d || host.endsWith("." + d))) {
        return { action: "allow" };
      }
    } catch {}
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => {
    win = null;
    view = null;
  });
}

/* ---------- IPC ---------- */

ipcMain.handle("claudeui:state", () => ({ themes, theme: currentTheme }));

ipcMain.handle("claudeui:set-theme", async (_e, id) => {
  if (!themes.some((t) => t.id === id)) return currentTheme;
  currentTheme = id;
  saveSettings({ theme: id });
  await applyClaudeCss(id);
  return currentTheme;
});

ipcMain.on("claudeui:bounds", (_e, r) => {
  if (!view || !r) return;
  view.setBounds({
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.max(0, Math.round(r.width)),
    height: Math.max(0, Math.round(r.height)),
  });
});

ipcMain.on("claudeui:menu-open", (_e, open) => {
  // Custom dropdowns render in the chrome layer, underneath the site view —
  // hide the view while a menu is open so the dropdown is visible.
  view?.setVisible(!open);
});

ipcMain.on("claudeui:win", (_e, action) => {
  if (!win) return;
  if (action === "min") win.minimize();
  else if (action === "max") (win.isMaximized() ? win.unmaximize() : win.maximize());
  else if (action === "close") win.close();
});

ipcMain.on("claudeui:nav", (_e, action) => {
  const wc = view?.webContents;
  if (!wc) return;
  if (action === "new-chat") wc.loadURL(CLAUDE_URL + "/new");
  else if (action === "reload") wc.reload();
  else if (action === "back") (wc.navigationHistory?.canGoBack() ? wc.navigationHistory.goBack() : wc.goBack?.());
  else if (action === "forward") (wc.navigationHistory?.canGoForward() ? wc.navigationHistory.goForward() : wc.goForward?.());
  else if (action === "devtools") wc.openDevTools({ mode: "detach" });
});

/* ---------- debug screenshots (used for automated visual checks) ---------- */

async function debugShot(dir) {
  await new Promise((r) => setTimeout(r, 6000));
  try {
    fs.mkdirSync(dir, { recursive: true });
    const chromeImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, "shot-chrome.png"), chromeImg.toPNG());
    const claudeImg = await view.webContents.capturePage();
    fs.writeFileSync(path.join(dir, "shot-claude.png"), claudeImg.toPNG());
    console.log("debug shots written to", dir);
  } catch (err) {
    console.error("debug shot failed:", err.message);
  }
  app.quit();
}

/* ---------- app lifecycle ---------- */

// Some login providers block "embedded" user agents — present as plain Chrome.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/[\d.]+/, "")
  .replace(/\sclaudeui\/[\d.]+/, "");

app.whenReady().then(() => {
  const template = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
    { role: "editMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  createWindow();

  const shotArg = process.argv.find((a) => a.startsWith("--debug-shot"));
  if (shotArg) debugShot(shotArg.split("=")[1] || process.cwd());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => app.quit());
