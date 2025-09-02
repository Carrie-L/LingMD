const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: () => ipcRenderer.invoke("open-file"),
  readFile: (path) => ipcRenderer.invoke("read-file", path),
  saveFile: (content, path) => ipcRenderer.invoke("save-file", content, path),
  newFile: () => ipcRenderer.invoke("new-file"),
  setDefaultDir: () => ipcRenderer.invoke("set-default-dir"),
  getDefaultDir: () => ipcRenderer.invoke("get-default-dir"),
  openDefaultDir: () => ipcRenderer.invoke("open-default-dir"),
  togglePin: () => ipcRenderer.invoke("toggle-pin"),
  setLastFile: (filePath) => ipcRenderer.send("set-last-file", filePath),
  openPreview: () => ipcRenderer.send("open-preview"),
  onLoadLastFile: (callback) =>
    ipcRenderer.on("load-last-file", (event, filePath) => callback(filePath)),
});
