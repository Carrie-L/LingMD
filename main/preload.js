// preload.js

const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: () => ipcRenderer.invoke("open-file"),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  saveFile: (content, filePath) => ipcRenderer.invoke("save-file", content, filePath),
  newFile: () => ipcRenderer.invoke("new-file"),
  showSaveDialog: (opts) => ipcRenderer.invoke("show-save-dialog", opts || {}),
  setDefaultDir: () => ipcRenderer.invoke("set-default-dir"),
  getDefaultDir: () => ipcRenderer.invoke("get-default-dir"),
  openDefaultDir: () => ipcRenderer.invoke("open-default-dir"),
  openInFolder: (targetPath) => ipcRenderer.invoke("open-in-folder", targetPath),
  setLastFile: (filePath) => ipcRenderer.send("set-last-file", filePath),
  openPreview: () => ipcRenderer.send("open-preview"),
  convertFileSrc: (filePath) => ipcRenderer.invoke("convert-file-src", filePath),
  onLoadLastFile: (callback) =>
    ipcRenderer.on("load-last-file", (_event, filePath) => callback(filePath)),
  path: {
    dirname: (p) => path.dirname(p),
    resolve: (...paths) => path.resolve(...paths),
  },
  setAttachmentFolder: (folderPath) => ipcRenderer.invoke("set-attachment-folder", folderPath),
  getAttachmentFolder: () => ipcRenderer.invoke("get-attachment-folder"),
  chooseAttachmentFolder: () => ipcRenderer.invoke("choose-attachment-folder"),
  resolveImagePath: (args) => {
    console.log("[Preload] 调用 resolveImagePath:", args);
    return ipcRenderer.invoke("resolve-image-path", args);
  },
  dirname: (filePath) => path.dirname(filePath),
  convertHtmlForClipboard: (html) => ipcRenderer.invoke("convert-html-for-clipboard", html),

  saveImage: (data) => ipcRenderer.invoke("save-image", data),
  getImageDir: () => ipcRenderer.invoke("get-image-dir"),
  openImageDir: () => ipcRenderer.invoke("open-image-dir"),
  cleanupUnusedImages: (data) => ipcRenderer.invoke("cleanup-unused-images", data),
  exitFullScreen: () => ipcRenderer.invoke("exit-fullscreen"),

  exportToPdf: (payload) => ipcRenderer.invoke("export-to-pdf", payload),
  exportToImage: (payload) => ipcRenderer.invoke("export-to-image", payload),
  onExportProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("export-progress", listener);
    return () => ipcRenderer.removeListener("export-progress", listener);
  },

  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("window-toggle-maximize"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  showNativeFileMenu: (payload) => ipcRenderer.invoke("show-native-file-menu", payload || {}),
  onFileMenuCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("file-menu-command", listener);
    return () => ipcRenderer.removeListener("file-menu-command", listener);
  },

  getCustomThemes: () => ipcRenderer.invoke("get-custom-themes"),
  saveCustomThemes: (themes) => ipcRenderer.invoke("save-custom-themes", themes),

  pickBookDirectory: () => ipcRenderer.invoke("pick-book-directory"),
  /** 在打开封面文件选择器前显示说明（避免用户困惑） */
  epubCoverHint: () => ipcRenderer.invoke("epub-cover-hint"),
  pickCoverImage: () => ipcRenderer.invoke("pick-cover-image"),
  scanMarkdownBook: (rootDir) => ipcRenderer.invoke("scan-markdown-book", rootDir),
  exportEpubBook: (payload) => ipcRenderer.invoke("export-epub-book", payload),
});
