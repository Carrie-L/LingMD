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
  
  // ✅ 关键修改：不再暴露整个 path 模块
  // 只暴露我们需要在渲染进程中用到的具体函数
  path: {
    dirname: (p) => path.dirname(p),
    resolve: (...paths) => path.resolve(...paths),
  },
});