const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("claudeui", {
  getState: () => ipcRenderer.invoke("claudeui:state"),
  setTheme: (id) => ipcRenderer.invoke("claudeui:set-theme", id),
  winAction: (action) => ipcRenderer.send("claudeui:win", action),
  nav: (action) => ipcRenderer.send("claudeui:nav", action),
  reportBounds: (rect) => ipcRenderer.send("claudeui:bounds", rect),
  menuOpen: (open) => ipcRenderer.send("claudeui:menu-open", open),
  onUrl: (cb) => ipcRenderer.on("claudeui:url", (_e, url) => cb(url)),
  onLoading: (cb) => ipcRenderer.on("claudeui:loading", (_e, v) => cb(v)),
});
