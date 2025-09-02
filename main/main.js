const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const Store = require("electron-store").default;
const store = new Store();

let mainWindow;

const { shell } = require("electron");

// 打开默认文件夹
ipcMain.handle("open-default-dir", async () => {
  const dir = getDefaultDir();
  if (fs.existsSync(dir)) {
    await shell.openPath(dir); // 在系统资源管理器里打开
    return dir;
  }
  return null;
});


function getDefaultDir() {
  // 如果用户设置过，就用用户的
  const customDir = store.get("defaultDir");
  if (customDir && fs.existsSync(customDir)) return customDir;

  // 否则用 文档/LingMD
  const fallback = path.join(app.getPath("documents"), "LingMD");
  if (!fs.existsSync(fallback)) {
    fs.mkdirSync(fallback, { recursive: true });
  }
  return fallback;
}

// 新建文件
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

// 设置默认文件夹
ipcMain.handle("set-default-dir", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (canceled || filePaths.length === 0) return null;

  const dir = filePaths[0];
  store.set("defaultDir", dir);
  return dir;
});

// 获取当前默认文件夹
ipcMain.handle("get-default-dir", async () => {
  return getDefaultDir();
});

ipcMain.handle("open-file", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: "Markdown", extensions: ["md"] }],
    properties: ["openFile"],
  });
  if (canceled || filePaths.length === 0) return null;

  const filePath = filePaths[0];
  const content = fs.readFileSync(filePath, "utf-8");
  return { path: filePath, content };
});

// 新增一个只读文件 API（不会弹框）
ipcMain.handle("read-file", async (event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf-8");
  return { path: filePath, content };
});


// 保存文件
ipcMain.handle("save-file", async (event, content, filePath) => {
  if (filePath) {
    // ✅ 有路径 → 直接保存，不弹对话框
    fs.writeFileSync(filePath, content, "utf-8");
    return { path: filePath };
  }

  // ❌ 没有路径，就直接忽略（不要弹对话框）
  return null;
});


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL("http://localhost:5173");

  // 如果有上次打开的文件，启动时发送给前端
  const lastFile = store.get("lastFile");
  if (lastFile && fs.existsSync(lastFile)) {
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow.webContents.send("load-last-file", lastFile);
    });
  }
}

// 保存最后打开的文件路径
ipcMain.on("set-last-file", (event, filePath) => {
  store.set("lastFile", filePath);
});

// 处理打开 md 文件（用户双击文件启动应用）
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (event, argv) => {
    // argv 里可能有文件路径
    const fileArg = argv.find((arg) => arg.endsWith(".md"));
    if (fileArg && fs.existsSync(fileArg)) {
      if (mainWindow) {
        mainWindow.webContents.send("load-last-file", fileArg);
      }
    }
  });


let previewWindow;

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
    },
  });

  previewWindow.on("closed", () => {
    previewWindow = null;
  });

  // 加载同一个 React 页面，但用参数区分
  previewWindow.loadURL("http://localhost:5173?mode=preview");
});


}

app.whenReady().then(createWindow);
