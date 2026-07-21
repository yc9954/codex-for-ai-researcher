import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("codexDesktop", {
  getInfo: () => ipcRenderer.invoke("desktop:get-info"),
  signInCodex: () => ipcRenderer.invoke("desktop:codex-login"),
  buildRunner: () => ipcRenderer.invoke("desktop:build-runner"),
  showDataFolder: () => ipcRenderer.invoke("desktop:show-data"),
});
