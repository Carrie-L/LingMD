// main.js - 完整修复版

const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const Store = require("electron-store").default;
const store = new Store();

let mainWindow;
let previewWindow;

// -------------------------------------------------------------------
// 单例锁：确保应用只有一个实例
// -------------------------------------------------------------------
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const fileArg = argv.find(arg => arg.endsWith(".md"));
      if (fileArg && fs.existsSync(fileArg)) {
        mainWindow.webContents.send("load-last-file", fileArg);
      }
    }
  });
}

// -------------------------------------------------------------------
// 主窗口创建
// -------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      
      // ✅ 关键修复：允许 preload 脚本使用 Node.js 的 'require'
      contextIsolation: true,
      sandbox: false, 
    },
  });

  // 默认打开开发者工具，方便调试
  mainWindow.webContents.openDevTools();

  mainWindow.loadURL("http://localhost:5173");

  mainWindow.webContents.once("did-finish-load", () => {
    const lastFile = store.get("lastFile");
    if (lastFile && fs.existsSync(lastFile)) {
      mainWindow.webContents.send("load-last-file", lastFile);
    }
  });
}

// -------------------------------------------------------------------
// 应用生命周期
// -------------------------------------------------------------------
app.whenReady().then(() => {
  // 注册自定义协议，用于安全加载本地图片
  protocol.registerFileProtocol("safe-file", (request, callback) => {
    const url = request.url.substring("safe-file://".length);
    try {
      callback({ path: path.normalize(decodeURI(url)) });
    } catch (error) {
      console.error("Failed to load file with safe-file protocol:", error);
      callback({ error: -1 });
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// -------------------------------------------------------------------
// IPC (渲染进程 <-> 主进程) 通信处理
// -------------------------------------------------------------------

function getDefaultDir() {
  const customDir = store.get("defaultDir");
  if (customDir && fs.existsSync(customDir)) return customDir;
  const fallback = path.join(app.getPath("documents"), "LingMD");
  if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

// 文件 & 目录操作
ipcMain.handle("open-file", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (canceled || !filePaths.length) return null;
  const filePath = filePaths[0];
  const content = fs.readFileSync(filePath, "utf-8");
  return { path: filePath, content };
});

ipcMain.handle("read-file", (event, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
        return { path: filePath, content: fs.readFileSync(filePath, "utf-8") };
    }
    return null;
});

ipcMain.handle("save-file", async (event, content, filePath) => {
  if (filePath) fs.writeFileSync(filePath, content, "utf-8");
  return { path: filePath };
});

ipcMain.handle("new-file", async () => {
  const defaultDir = getDefaultDir();
  let baseName = "未命名";
  let index = 0;
  let filePath;
  do {
    const suffix = index === 0 ? "" : `-${index}`;
    filePath = path.join(defaultDir, `${baseName}${suffix}.md`);
    index++;
  } while (fs.existsSync(filePath));
  fs.writeFileSync(filePath, "", "utf-8");
  return { path: filePath, content: "" };
});

ipcMain.handle("set-default-dir", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (canceled || !filePaths.length) return null;
  const dir = filePaths[0];
  store.set("defaultDir", dir);
  return dir;
});

ipcMain.handle("get-default-dir", async () => getDefaultDir());

ipcMain.handle("open-default-dir", async () => {
  const dir = getDefaultDir();
  if (fs.existsSync(dir)) await shell.openPath(dir);
  return dir;
});

// 状态 & 窗口管理
ipcMain.on("set-last-file", (event, filePath) => store.set("lastFile", filePath));

ipcMain.handle('convert-file-src', (event, filePath) => `safe-file://${path.normalize(filePath)}`);

ipcMain.on("open-preview", () => {
  if (previewWindow) {
    previewWindow.focus();
    return;
  }
  previewWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: false,
    },
  });
  previewWindow.on("closed", () => { previewWindow = null; });
  previewWindow.loadURL("http://localhost:5173?mode=preview");
});