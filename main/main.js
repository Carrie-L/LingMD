// main.js - 完整修复版

const { app, BrowserWindow, ipcMain, dialog, protocol, shell, net } = require("electron");
const path = require("path");
const fs = require("fs");
const Store = require("electron-store").default;
const store = new Store();
const { pathToFileURL, fileURLToPath } = require("url"); 

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
      // ✅ 关键修复：同样为预览窗口禁用 webSecurity
      webSecurity: false,
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
 // ✅ 修复后的 safe-file 协议
// ✅ 2. 使用更健壮的 protocol.handle 实现
protocol.handle("safe-file", (request) => {
    try {
      // Swap our custom protocol for the standard 'file:' protocol
      const standardFileUrl = request.url.replace("safe-file:", "file:");
      
      console.log(`[safe-file] Forwarding to net.fetch with URL: ${standardFileUrl}`);
      
      // Let Electron's built-in, powerful fetch handler do the work.
      // It knows how to correctly handle valid file:// URLs.
      return net.fetch(standardFileUrl);

    } catch (err) {
      console.error(`[safe-file] Failed to handle request for ${request.url}:`, err);
      return new Response("Not Found", { status: 404 });
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

// ✅ 新增：设置附件文件夹
ipcMain.handle("set-attachment-folder", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "选择 Obsidian 附件文件夹",
    properties: ["openDirectory"],
  });
  if (canceled || !filePaths.length) return null;
  const folderPath = filePaths[0];
  store.set("attachmentFolder", folderPath); // 保存到 electron-store
  return folderPath;
});

// ✅ 新增：获取附件文件夹
ipcMain.handle("get-attachment-folder", () => {
  return store.get("attachmentFolder", null); // 读取设置，如果没有则返回 null
});


ipcMain.handle("resolve-image-path", (event, { fileDir, src }) => {
  let finalPath = null;

  // 1. Try relative path
  if (fileDir) {
    const relativePath = path.resolve(fileDir, src);
    if (fs.existsSync(relativePath)) {
      finalPath = relativePath;
    }
  }

  console.log("-- 接收： fileDir：",fileDir);
  console.log("-- 接收： finalPath：",finalPath);

  // 2. If not found, try attachment folder
  if (!finalPath) {
    const attachmentFolder = store.get("attachmentFolder");
    if (attachmentFolder) {
      const imageName = path.basename(src);
      const attachmentPath = path.resolve(attachmentFolder, imageName);
      if (fs.existsSync(attachmentPath)) {
        finalPath = attachmentPath;
      }
    }
  }

  console.log("-- 接收： finalPath2：",finalPath);

  // ✅ 3. If a path was found, convert it to a standard URL and then swap the protocol
  if (finalPath) {
    // pathToFileURL will create a perfectly formatted URL, e.g., 'file:///I:/path/to/image.png'
    const fileUrl = pathToFileURL(finalPath).href;
    console.log(`[resolve-image-path] Found file at '${finalPath}', converted to URL: '${fileUrl}'`);

    // Replace 'file:' with 'safe-file:' to use our custom protocol
    return fileUrl.replace('file:', 'safe-file:');
  }

  console.log(`[resolve-image-path] Could not find image for src: '${src}'`);
  return null;
});



// === 状态 & 窗口管理 ===
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
      // ✅ 关键修复：允许 http://localhost 加载本地资源
      // 这对于在开发服务器(vite)环境下显示 safe-file:// 协议的图片至关重要
      webSecurity: false, 
    },
  });
  previewWindow.on("closed", () => { previewWindow = null; });
  previewWindow.loadURL("http://localhost:5173?mode=preview");
});

// ===================================================================
// ✅ 新增：为公众号复制功能转换 HTML 中的图片
// ===================================================================
ipcMain.handle("convert-html-for-clipboard", async (event, htmlContent) => {
  if (!htmlContent) return "";

  const imageTagsRegex = /<img src="(safe-file:\/\/[^"]+)"/g;
  
  // 使用 Promise.all 来并行处理所有图片的转换
  const replacedContent = await Promise.all(
    [...htmlContent.matchAll(imageTagsRegex)].map(async (match) => {
      const originalSrc = match[1]; // e.g., "safe-file:///I:/path/to/image.png"
      const originalTag = match[0]; // e.g., '<img src="...png"'

      try {
        // 1. 将 URL 转换回本地文件系统路径
        const standardFileUrl = originalSrc.replace("safe-file:", "file:");
        const filePath = fileURLToPath(standardFileUrl);

        // 2. 异步读取图片文件
        const fileBuffer = await fs.promises.readFile(filePath);
        
        // 3. 确定图片的 MIME 类型
        let mimeType;
        const extension = path.extname(filePath).toLowerCase();
        if (extension === ".png") mimeType = "image/png";
        else if (extension === ".jpg" || extension === ".jpeg") mimeType = "image/jpeg";
        else if (extension === ".gif") mimeType = "image/gif";
        else if (extension === ".svg") mimeType = "image/svg+xml";
        else mimeType = "application/octet-stream"; // Fallback

        // 4. 创建 Base64 Data URL
        const base64String = fileBuffer.toString("base64");
        const dataUrl = `data:${mimeType};base64,${base64String}`;

        // 5. 返回替换对：[原始标签, 带有 Data URL 的新标签]
        const newTag = originalTag.replace(originalSrc, dataUrl);
        return { originalTag, newTag };

      } catch (error) {
        console.error(`Failed to convert image to Base64: ${originalSrc}`, error);
        // 如果转换失败，保持原样
        return { originalTag, newTag: originalTag };
      }
    })
  );
  // 执行所有替换操作
  let finalHtml = htmlContent;
  for (const { originalTag, newTag } of replacedContent) {
    finalHtml = finalHtml.replace(originalTag, newTag);
  }

  return finalHtml;
});