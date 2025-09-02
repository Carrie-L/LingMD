// preload.js

const { contextBridge, ipcRenderer } = require("electron");
const path = require("path"); // 在 preload 脚本内部引入 path

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: () => ipcRenderer.invoke("open-file"),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath), // 参数名统一为 filePath
  saveFile: (content, filePath) => ipcRenderer.invoke("save-file", content, filePath), // 参数名统一
  newFile: () => ipcRenderer.invoke("new-file"),
  setDefaultDir: () => ipcRenderer.invoke("set-default-dir"),
  getDefaultDir: () => ipcRenderer.invoke("get-default-dir"),
  openDefaultDir: () => ipcRenderer.invoke("open-default-dir"),
  // togglePin: () => ipcRenderer.invoke("toggle-pin"), // 你的 main.js 中没有这个，先注释掉
  setLastFile: (filePath) => ipcRenderer.send("set-last-file", filePath),
  openPreview: () => ipcRenderer.send("open-preview"),
  convertFileSrc: (filePath) => ipcRenderer.invoke('convert-file-src', filePath),
  onLoadLastFile: (callback) =>
    ipcRenderer.on("load-last-file", (event, filePath) => callback(filePath)),
  path: {
    dirname: (p) => path.dirname(p),
    resolve: (...paths) => path.resolve(...paths),
  },
  setAttachmentFolder: () => ipcRenderer.invoke("set-attachment-folder"),
  getAttachmentFolder: () => ipcRenderer.invoke("get-attachment-folder"),
  resolveImagePath: (args) => {
    console.log("[Preload] 调用 resolveImagePath:", args);
    return ipcRenderer.invoke("resolve-image-path", args);
  },
  dirname: (filePath) => {
    return path.dirname(filePath);
  },
  convertHtmlForClipboard: (html) => ipcRenderer.invoke("convert-html-for-clipboard", html),
});