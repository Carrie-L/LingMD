// main.js - 完整修复版

const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  dialog,
  protocol,
  shell,
  net,
  clipboard,
  nativeImage
} = require("electron");
const path = require("path");
const fs = require("fs");
const Store = require("electron-store").default;
const store = new Store();
const { pathToFileURL, fileURLToPath } = require("url");
const juice = require("juice");
const { log } = require("console");
const os = require('os');
const { buildEpubZipBuffer } = require("./epubPack");

const IMAGE_EXPORT_MAX_PIXELS = 80_000_000; // 约 320MB RGBA，防止超长截图内存爆炸
const IMAGE_EXPORT_FORCE_COMPAT_MODE = true; // 兼容模式更稳定，默认跳过 CDP 主截图


let mainWindow;
let pendingFileToOpen = null; // 外部传入的文件路径优先级最高

function openFileInWindow(filePath) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("load-last-file", filePath);
  }
}

// helper: 判定是否是 markdown 文件（按需扩展）
function isMarkdownFile(p) {
  if (!p || typeof p !== 'string') return false;
  const ext = path.extname(p).toLowerCase();
  return ['.md', '.markdown'].includes(ext) && fs.existsSync(p);
}

// helper: 从 argv 数组中找第一个 markdown 文件路径
function getFileFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (const a of argv) {
    // skip electron exe path / app path
    if (!a) continue;
    // 在 Windows 下 args 有可能包裹 "C:\path\to\file.md"
    if (isMarkdownFile(a)) return path.resolve(a);
  }
  return null;
}

// -------------------------------------------------------------------
// 单例锁：确保应用只有一个实例
// -------------------------------------------------------------------
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, argv) => {
    // if (mainWindow) {
    //   if (mainWindow.isMinimized()) mainWindow.restore();
    //   mainWindow.focus();
    //   const fileArg = argv.find((arg) => arg.endsWith(".md"));
    //   if (fileArg && fs.existsSync(fileArg)) {
    //     mainWindow.webContents.send("load-last-file", fileArg);
    //   }
    // }

    // argv 在 Windows/Linux 下包含新打开的文件路径
    const file = getFileFromArgv(argv);
    if (file) {
      // 如果窗口已经存在，立刻打开并激活窗口
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        openFileInWindow(file);
      } else {
        // 否则放到 pending，窗口创建时会处理
        pendingFileToOpen = file;
      }
    } else {
      // 没有外部文件，也可以把已有窗口激活
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    }
  });
}

// -------------------------------------------------------------------
// 编辑区粘贴图片，IPC: 保存图片
// -------------------------------------------------------------------
// 1) 定义一个计算/返回默认附件目录的函数（可按需修改逻辑）
function getDefaultImageDir() {
  let folder = store.get('attachmentFolder');
  if (!folder) {
    return getDefaultDir();
  }
  return folder;
}

ipcMain.handle('choose-attachment-folder', async (event) => {
  try {
    // 获取调用该 IPC 的窗口（用于将 dialog 置于该窗口之上；如果没有，传 null）
    const win = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;

    // 默认路径优先使用 store 中的值
    const defaultPath = store.get('attachmentFolder') || getDefaultDir();

    const result = await dialog.showOpenDialog(win, {
      title: '选择附件保存文件夹',
      properties: ['openDirectory'],
      defaultPath
    });

    if (result.canceled) {
      return { canceled: true };
    }

    const chosen = result.filePaths && result.filePaths[0];
    if (!chosen) {
      return { canceled: true };
    }

    // 确保目录存在并持久化到 store
    try {
      fs.mkdirSync(chosen, { recursive: true });
    } catch (err) {
      // mkdir 失败也不应阻止保存 store（但记录日志）
      console.error('创建选择目录失败：', err);
    }

    store.set('attachmentFolder', chosen);

    return { canceled: false, folder: chosen };
  } catch (err) {
    console.error('choose-attachment-folder 出错：', err);
    return { canceled: true, error: err.message || String(err) };
  }
});


// 设置附件目录（接收一个路径字符串）
ipcMain.handle('set-attachment-folder', async (event, newFolder) => {
  try {
    if (!newFolder) throw new Error('路径为空');
    // 确保目录存在
    fs.mkdirSync(newFolder, { recursive: true });
    // 持久化到 store
    store.set('attachmentFolder', newFolder);
    return { success: true, folder: newFolder };
  } catch (err) {
    console.error('set-attachment-folder failed:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// 返回当前附件目录（store 优先，否则回退到 getDefaultDir）
ipcMain.handle('get-attachment-folder', async () => {
  try {
    // 如果 store 中有用户设置的 attachmentFolder，直接返回
    const folder = store.get('attachmentFolder') || getDefaultDir();
    // 确保目录存在
    try { fs.mkdirSync(folder, { recursive: true }); } catch (e) { /* ignore */ }
    return folder;
  } catch (err) {
    console.error('get-attachment-folder failed:', err);
    return null;
  }
});


ipcMain.handle('save-image', async (event, { fileName, buffer, originalName }) => {
  try {
    // 确保图片目录存在
    const imageDir = await getDefaultImageDir();
    console.log("-imageDir-", imageDir);

    const fullPath = path.join(imageDir, fileName);
    console.log("-fullPath-", fullPath);

    // 将数组转换回Buffer并保存文件
    const fileBuffer = Buffer.from(buffer);
    await fs.promises.writeFile(fullPath, fileBuffer);

    // 返回相对路径（用于Markdown）
    const relativePath = `${fileName}`;
    console.log("-relativePath-", relativePath);

    console.log(`图片已保存: ${fullPath}`);

    return {
      success: true,
      fullPath,
      relativePath,
      fileName
    };
  } catch (error) {
    console.error('保存图片失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// IPC: 获取图片目录路径
ipcMain.handle('get-image-dir', async () => {
  try {
    const imageDir = await getDefaultImageDir();
    console.log("imageDir", imageDir);

    return { success: true, path: imageDir };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC: 打开图片目录
ipcMain.handle('open-image-dir', async () => {
  try {
    const imageDir = await getDefaultImageDir();
    const { shell } = require('electron');
    await shell.openPath(imageDir);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 退出窗口级别的 fullscreen
ipcMain.handle('exit-fullscreen', (event) => {
  try {
    const win = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
    if (win) {
      win.setFullScreen(false);
      return { success: true };
    }
    return { success: false, error: 'no-window' };
  } catch (err) {
    console.error('exit-fullscreen error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle("window-minimize", (event) => {
  const win = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
  if (!win) return { success: false, error: "no-window" };
  win.minimize();
  return { success: true };
});

ipcMain.handle("window-toggle-maximize", (event) => {
  const win = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
  if (!win) return { success: false, error: "no-window", isMaximized: false };
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
  return { success: true, isMaximized: win.isMaximized() };
});

ipcMain.handle("window-is-maximized", (event) => {
  const win = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
  if (!win) return false;
  return win.isMaximized();
});

ipcMain.handle("window-close", (event) => {
  const win = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
  if (!win) return { success: false, error: "no-window" };
  win.close();
  return { success: true };
});

ipcMain.handle("show-native-file-menu", (event, payload = {}) => {
  const win = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
  if (!win) return { success: false, error: "no-window" };

  const sender = event.sender;
  const emitCommand = (command) => {
    try {
      if (sender && !sender.isDestroyed()) {
        sender.send("file-menu-command", command);
      }
    } catch (err) {
      console.warn("file-menu-command send failed:", err);
    }
  };

  const menu = Menu.buildFromTemplate([
    { label: "新建", click: () => emitCommand("new") },
    { label: "打开", click: () => emitCommand("open") },
    { label: "保存", click: () => emitCommand("save") },
    { type: "separator" },
    { label: "导出 HTML", click: () => emitCommand("export-html") },
    { label: "导出 PDF", click: () => emitCommand("export-pdf") },
    { label: "导出图片", click: () => emitCommand("export-image") },
  ]);

  const x = Number(payload.x);
  const y = Number(payload.y);
  const popupOptions = { window: win };
  if (Number.isFinite(x) && Number.isFinite(y)) {
    popupOptions.x = Math.max(0, Math.round(x));
    popupOptions.y = Math.max(0, Math.round(y));
  }

  menu.popup(popupOptions);
  return { success: true };
});

const LOGFILE = path.join(app.getPath('userData'), 'electron.log');
function safeLog(...args) {
  try {
    const line = `[${new Date().toISOString()}] ${args.map(a => {
      try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); }
    }).join(' ')}\n`;
    fs.appendFileSync(LOGFILE, line);
  } catch (e) { console.error('写日志失败', e); }
  try { console.log(...args); } catch (e) { }
}

function sendExportProgress(sender, payload) {
  try {
    if (!sender || sender.isDestroyed()) return;
    sender.send('export-progress', {
      type: 'unknown',
      progress: 0,
      message: '',
      done: false,
      ts: Date.now(),
      ...payload,
    });
  } catch (err) {
    console.warn('[Export Progress] 发送失败:', err);
  }
}

function createNativeImageFromRawBitmap(rawBuffer, width, height) {
  if (!rawBuffer || !Buffer.isBuffer(rawBuffer)) {
    throw new Error("无效的位图缓冲区");
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`无效的位图尺寸: ${width}x${height}`);
  }

  // Electron API 在不同版本上可能对 createFromBitmap 参数签名有差异
  // 先尝试官方常见签名 (buffer, options)，失败后回退旧签名 ({buffer,...})
  try {
    const img = nativeImage.createFromBitmap(rawBuffer, {
      width,
      height,
      scaleFactor: 1,
    });
    if (img && !img.isEmpty()) return img;
  } catch (_e) { }

  try {
    const img = nativeImage.createFromBitmap({
      buffer: rawBuffer,
      width,
      height,
      scaleFactor: 1,
    });
    if (img && !img.isEmpty()) return img;
  } catch (_e) { }

  throw new Error(`createFromBitmap 失败: ${width}x${height}`);
}

// 一次性保护，避免重复声明
if (!globalThis.__ling_logger_defined) {
  globalThis.__ling_logger_defined = true;
  globalThis.appLog = safeLog;
}
const log0 = globalThis.appLog;

// -------------------------------------------------------------------
// 主窗口创建
// -------------------------------------------------------------------
function createWindow() {
  log0('createWindow enter. app.isPackaged=', app.isPackaged, ' __dirname=', __dirname, ' resourcesPath=', process.resourcesPath);

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),

      // ✅ 关键修复：允许 preload 脚本使用 Node.js 的 'require'
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // ✅ 关键修复：同样为预览窗口禁用 webSecurity
      webSecurity: false,
    },
  });


  // 将渲染器 console 输出写入日志（方便定位前端错误）
  if (process.platform !== "darwin") {
    try {
      mainWindow.setAutoHideMenuBar(true);
      mainWindow.setMenuBarVisibility(false);
    } catch (err) {
      log("setMenuBarVisibility failed:", err && (err.message || err));
    }
  }

  mainWindow.webContents.on('console-message', (e, level, message, line, sourceId) => {
    log('Renderer console:', { level, message, line, sourceId });
  });

  // 监听加载失败
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    log('did-fail-load', { errorCode, errorDescription, validatedURL, isMainFrame });
  });

  // 页面加载完
  mainWindow.webContents.on('did-finish-load', () => {
    log('did-finish-load ok, url=', mainWindow.webContents.getURL());
  });

  // 打开 DevTools：开发时自动打开，生产环境默认不打开
  // if (!app.isPackaged) {
  // mainWindow.webContents.openDevTools({ mode: 'detach' });
  // }
  // 根据是否打包加载不同资源
  if (app.isPackaged) {
    // 注意：__dirname 在打包后指向 .../resources/app.asar/main
    // dist 在 app.asar/dist，因此使用 ../dist/index.html
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    log('Production mode: loading file', indexPath);
    mainWindow
      .loadFile(indexPath)
      .then(() => {
        log('loadFile ok', indexPath);
      })
      .catch((err) => {
        log('loadFile error', err && (err.stack || err.message || err));
        // 失败时打开 devtools 以便人工排查（改成 true 可在生产调试）
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
      });
  } else {
    const devUrl = 'http://127.0.0.1:5173';
    log('Dev mode: loading url', devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    mainWindow
      .loadURL(devUrl)
      .then(() => {
        log('loadURL ok', devUrl);
      })
      .catch((err) => {
        log('loadURL error', err && (err.stack || err.message || err));
      });
  }

  mainWindow.once('ready-to-show', () => {
    // 显示窗口
    mainWindow.show();

    // 优先处理来自外部（双击等）的文件请求
    if (pendingFileToOpen) {
      const fileToOpen = pendingFileToOpen;
      pendingFileToOpen = null;
      openFileInWindow(fileToOpen);
    } else {
      // 没有外部文件，按你原来的逻辑恢复上一次打开的文件
      // loadLastOpenedFileIfAny && loadLastOpenedFileIfAny();
    }
  });

  mainWindow.webContents.once("did-finish-load", () => {
    const lastFile = store.get("lastFile");
    if (isMarkdownFile(lastFile)) {
      mainWindow.webContents.send("load-last-file", lastFile);
    } else if (lastFile) {
      try { store.delete("lastFile"); } catch (e) { }
    }
  });

  // 窗口关闭处理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// -------------------------------------------------------------------
// 应用生命周期
// -------------------------------------------------------------------
app.whenReady().then(() => {

  // 注册自定义协议，用于安全加载本地图片（保留你原有实现）
  protocol.handle("safe-file", (request) => {
    try {
      const standardFileUrl = request.url.replace("safe-file:", "file:");
      console.log(`[safe-file] Forwarding to net.fetch with URL: ${standardFileUrl}`);
      return net.fetch(standardFileUrl);
    } catch (err) {
      console.error(`[safe-file] Failed to handle request for ${request.url}:`, err);
      return new Response("Not Found", { status: 404 });
    }
  });

  // 如果第一次启动时命令行参数里带有文件（例如双击启动），优先记录
  const startFile = getFileFromArgv(process.argv);
  if (startFile) pendingFileToOpen = startFile;

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
  const customDir = store.get('defaultDir');
  if (customDir && fs.existsSync(customDir)) return customDir;
  const fallback = path.join(app.getPath('documents'), 'LingMD');
  if (!fs.existsSync(fallback)) {
    try { fs.mkdirSync(fallback, { recursive: true }); }
    catch (e) { /* 若没有权限或其他问题，返回 fallback 路径字符串但不抛 */ }
  }
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

// ---- 新增：在 main.js 中添加 show-save-dialog handler ----
ipcMain.handle("show-save-dialog", async (event, { defaultPath }) => {
  // 在窗口上弹出保存对话框并返回用户选择的路径（或 null）
  try {
    const win = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
    const options = {
      title: "保存文件",
      defaultPath: defaultPath || getDefaultDir(),
      buttonLabel: "保存",
      filters: [{ name: "Markdown", extensions: ["md"] }],
    };
    const res = await dialog.showSaveDialog(win, options);
    if (res.canceled || !res.filePath) return { canceled: true, filePath: null };
    return { canceled: false, filePath: res.filePath };
  } catch (err) {
    console.error("show-save-dialog error:", err);
    return { canceled: true, filePath: null, error: err.message || String(err) };
  }
});


// 更稳健的 save-file handler（会处理 filePath 为目录 / 空值 的情况）
ipcMain.handle("save-file", async (event, content, filePath) => {
  try {
    let finalPath = filePath;
    console.log("save-file: finalPath", finalPath);


    // 1) 如果没有传入 filePath，创建一个新文件（使用 new-file 的逻辑）
    if (!finalPath) {
      // 生成一个未命名文件放到默认目录
      const defaultDir = getDefaultDir();
      const fileName = `未命名_${Date.now()}.md`;
      finalPath = path.join(defaultDir, fileName);
      console.log("save-file: !finalPath", finalPath);
    } else {
      // 2) 如果传入的是存在的目录，在目录内创建新文件
      try {
        if (fs.existsSync(finalPath) && fs.statSync(finalPath).isDirectory()) {
          const fileName = `未命名_${Date.now()}.md`;
          finalPath = path.join(finalPath, fileName);
          console.log("save-file: 传入目录> finalPath", finalPath);
        } else {
          // 确保目标文件所在目录存在
          fs.mkdirSync(path.dirname(finalPath), { recursive: true });
        }
      } catch (err) {
        console.warn('save-file: 检查 filePath 时出错，将继续尝试写入', err);
      }
    }

    // 3) 写入文件（使用 promises 版本）
    await fs.promises.writeFile(finalPath, content || '', 'utf-8');

    // 仅把 Markdown 文档记录为 lastFile，避免导出 html/pdf 等覆盖启动文件
    try {
      const ext = path.extname(finalPath || '').toLowerCase();
      if (ext === '.md' || ext === '.markdown') {
        store.set('lastFile', finalPath);
      }
    } catch (e) { /* ignore */ }

    return { path: finalPath, success: true };
  } catch (err) {
    console.error('save-file failed:', err);
    return { success: false, error: err.message || String(err) };
  }
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
  // const { canceled, filePaths } = await dialog.showOpenDialog({
  //   properties: ["openDirectory"],
  // });
  // if (canceled || !filePaths.length) return null;
  // const dir = filePaths[0];
  // store.set("defaultDir", dir);
  // return dir;

  // 弹出目录选择对话框，返回所选路径或 null
  const win = BrowserWindow.getFocusedWindow();
  const res = await require('electron').dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return null;
  const selected = res.filePaths[0];
  try {
    store.set('defaultDir', selected);
  } catch (e) {
    console.error('保存 defaultDir 失败', e);
  }
  return selected;
});

ipcMain.handle("get-default-dir", async () => getDefaultDir());

// === 自定义主题管理 ===
ipcMain.handle("get-custom-themes", async () => {
  return store.get("customThemes") || {};
});

ipcMain.handle("save-custom-themes", async (event, themes) => {
  store.set("customThemes", themes);
  return true;
});

ipcMain.handle("open-default-dir", async () => {
  const dir = getDefaultDir();
  if (fs.existsSync(dir)) await shell.openPath(dir);
  return dir;
});

ipcMain.handle("open-in-folder", async (_event, targetPath) => {
  try {
    if (!targetPath || typeof targetPath !== "string") {
      return { success: false, error: "路径无效" };
    }

    const normalizedPath = path.normalize(targetPath);
    let dirToOpen = path.dirname(normalizedPath);

    if (fs.existsSync(normalizedPath)) {
      const stats = fs.statSync(normalizedPath);
      if (stats.isFile()) {
        shell.showItemInFolder(normalizedPath);
        return { success: true, path: path.dirname(normalizedPath) };
      }
      if (stats.isDirectory()) {
        dirToOpen = normalizedPath;
      }
    }

    if (!dirToOpen || !fs.existsSync(dirToOpen)) {
      return { success: false, error: "目录不存在" };
    }

    await shell.openPath(dirToOpen);
    return { success: true, path: dirToOpen };
  } catch (error) {
    console.error("open-in-folder error:", error);
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.on('renderer-ready', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    let lastFile = store.get('lastFile'); // 从 store 读取上次打开的文件路径

    // 如果 store 有 markdown lastFile，则直接读取并返回
    if (isMarkdownFile(lastFile)) {
      let initialContent = '';
      try {
        initialContent = await fs.promises.readFile(lastFile, 'utf8');
      } catch (err) {
        console.warn('读取 lastFile 失败，使用空内容：', err);
        initialContent = '';
      }
      win.webContents.send('initial-data', { lastFile, initialContent });
      return;
    } else if (lastFile) {
      try { store.delete('lastFile'); } catch (e) { }
    }

    // 否则：在 **默认目录（getDefaultDir）** 创建一个未命名文件（只在这里创建一次）
    const dir = getDefaultDir(); // <-- 使用默认目录而不是附件目录
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error('确保默认目录存在失败：', err);
    }

    const fileName = `未命名_${Date.now()}.md`;
    const fullPath = path.join(dir, fileName);

    try {
      // 创建空文件（若需要可以写入模板内容）
      await fs.promises.writeFile(fullPath, '', 'utf8');
      // 持久化为 lastFile，保证下次启动直接使用同一文件
      store.set('lastFile', fullPath);
    } catch (err) {
      console.error('在默认目录创建默认文件失败：', err);
      // 仍然向渲染进程发送空内容，避免卡住
      win.webContents.send('initial-data', { lastFile: null, initialContent: '' });
      return;
    }

    // 读取刚创建的文件内容（通常为空）
    let initialContent = '';
    try {
      initialContent = await fs.promises.readFile(fullPath, 'utf8');
    } catch (err) {
      initialContent = '';
    }

    win.webContents.send('initial-data', { lastFile: fullPath, initialContent });
  } catch (err) {
    console.error('renderer-ready handler error:', err);
    try { win.webContents.send('initial-data', { lastFile: null, initialContent: '' }); } catch (e) { }
  }
});



ipcMain.handle("resolve-image-path", (event, { fileDir, src }) => {
  let finalPath = null;

  // 1. Try relative path
  if (fileDir) {
    const relativePath = path.resolve(fileDir, src);
    if (fs.existsSync(relativePath)) {
      finalPath = relativePath;
      console.log("resolve-image-path finalPath", finalPath);

    }
  }

  console.log("-- 接收： fileDir：", fileDir);
  console.log("-- 接收： finalPath：", finalPath);

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

  console.log("-- 接收： finalPath2：", finalPath);

  // ✅ 3. If a path was found, convert it to a standard URL and then swap the protocol
  if (finalPath) {
    // pathToFileURL will create a perfectly formatted URL, e.g., 'file:///I:/path/to/image.png'
    const fileUrl = pathToFileURL(finalPath).href;
    console.log(
      `[resolve-image-path] Found file at '${finalPath}', converted to URL: '${fileUrl}'`
    );

    // Replace 'file:' with 'safe-file:' to use our custom protocol
    return fileUrl.replace("file:", "safe-file:");
  }

  console.log(`[resolve-image-path] Could not find image for src: '${src}'`);
  return null;
});

// === 状态 & 窗口管理 ===
ipcMain.on("set-last-file", (event, filePath) =>
  (isMarkdownFile(filePath) ? store.set("lastFile", filePath) : null)
);

ipcMain.handle(
  "convert-file-src",
  (event, filePath) => `safe-file://${path.normalize(filePath)}`
);



// ===================================================================
// ✅ (终极版) 为公众号复制功能转换 HTML
// ===================================================================
ipcMain.handle("convert-html-for-clipboard", async (event, payload) => {
  const { html: rawHtml, codeThemeKey, css, themeCssValues, skipJuice } = payload;
  // 2. 预先检查输入
  if (typeof rawHtml !== "string") {
    console.error(
      "convertHtmlForClipboard received non-string html content:",
      rawHtml
    );
    return ""; // 如果 html 部分不是字符串，返回空
  }
  console.error(
    "convertHtmlForClipboard rawHtml length:",
    rawHtml.length
  );
  if (!rawHtml) return "";

  // 如果 skipJuice 为 true，themeCssValues 不是必须的（可能只是为了图片转换）
  if (!skipJuice && !themeCssValues) {
    console.error("Theme CSS values are missing!");
    return ""; // 关键数据缺失，直接返回
  }

  try {
    // === Step 1: 转换图片为 Base64 ===
    // let pHtml = await sanitizeForWechat(rawHtml);
    // console.log("pHtml",pHtml);

    let htmlWithBase64Images = rawHtml;
    // 注意：我们现在的 img 标签 src 属性可能被 DOMPurify 绕过后变成了 data-safe-src
    // 但在你最新的 useMarkdownRenderer.js 中，它被换回来了。我们假设它是 src
    // 改进正则表达式：支持单引号和双引号，匹配 safe-file:// 或 file:// 协议
    const imageTagsRegex = /<img\s+[^>]*src=["']((?:safe-file|file):\/\/[^"']+)["'][^>]*>/gi;

    // 使用一个异步的 replace 方法
    const replacements = [];
    let match;
    // 重置正则表达式的 lastIndex，确保从头开始匹配
    imageTagsRegex.lastIndex = 0;
    while ((match = imageTagsRegex.exec(htmlWithBase64Images)) !== null) {
      const fullMatch = match[0]; // 完整的 <img> 标签
      const src = match[1]; // src 属性的值
      const matchIndex = match.index; // 匹配位置
      replacements.push({ fullMatch, src, index: matchIndex });
    }

    // 从后往前替换，避免索引变化问题
    for (let i = replacements.length - 1; i >= 0; i--) {
      const item = replacements[i];
      try {
        const standardFileUrl = item.src.replace("safe-file:", "file:");
        const filePath = fileURLToPath(standardFileUrl);
        const fileBuffer = await fs.promises.readFile(filePath);

        const extension = path.extname(filePath).toLowerCase();
        let mimeType = "image/png"; // 默认
        if (extension === ".jpg" || extension === ".jpeg")
          mimeType = "image/jpeg";
        else if (extension === ".gif") mimeType = "image/gif";
        else if (extension === ".svg") mimeType = "image/svg+xml";
        else if (extension === ".webp") mimeType = "image/webp";

        const base64String = fileBuffer.toString("base64");
        const dataUrl = `data:${mimeType};base64,${base64String}`;

        // 替换整个 img 标签中的 src 属性值
        const newImgTag = item.fullMatch.replace(
          /src=["'][^"']+["']/i,
          `src="${dataUrl}"`
        );

        // 使用索引位置进行精确替换
        htmlWithBase64Images =
          htmlWithBase64Images.substring(0, item.index) +
          newImgTag +
          htmlWithBase64Images.substring(item.index + item.fullMatch.length);
      } catch (e) {
        console.error(`Failed to convert image to Base64: ${item.src}`, e);
      }
    }

    // 如果跳过 juice，直接返回带 base64 图片的 html
    if (skipJuice) {
      console.log("Skipping CSS generation and juice inlining...");
      return htmlWithBase64Images;
    }

    // === Step 2: ✅ 动态生成文章主题的 CSS 字符串 ===
    const markdownThemeCss0 = `
      /* 1. 总容器样式 (我们的“画板”) */
      .markdown-body{
        background: ${themeCssValues.bg};
        color: ${themeCssValues.fg};
        font-family: 'LXGW WenKai', -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
        font-size: 16px;
        line-height: 1.8;
        font-weight: 300;
        padding: 20px;
      }
      p{
        margin: 0.8em 0;
      }
      li {
        margin: 0.8em 0;
        display: flex;
        align-items: baseline;
      }
      h1, h2, h3, h4, h5, h6 {
        color: ${themeCssValues.fg};
      }
      h6 {
        color: ${themeCssValues.muted};
      }
      a {
        color: ${themeCssValues.accent};
        text-decoration: none;
      }
      blockquote {
        padding: 0.6em 1em;
        background: ${themeCssValues.quoteBg};
        border-left: 4px solid ${themeCssValues.quoteBar};
      }
      hr {
        border: 0;
        height: 1px;
        background: ${themeCssValues.border};
      }
      table {
        border-collapse: collapse;
        width: 100%;
        border: 1px solid ${themeCssValues.border};
      }
      th, td {
        border: 1px solid ${themeCssValues.border};
        padding: .6em .8em;
      }
      thead th {
        background: ${themeCssValues.quoteBg};
      }
      tbody tr:nth-child(odd) {
        background: ${themeCssValues.tableStripe};
      }
      code:not(.hljs) {
        background: ${themeCssValues.codeBg};
        color: ${themeCssValues.codeFg};
        border: 1px solid ${themeCssValues.border};
        padding: .1em .4em;
        border-radius: 4px;
        font-size: 0.9em;
      }
      pre {
        background: ${themeCssValues.codeBg};
        border: 1px solid ${themeCssValues.border};
      }
    `;

    const markdownThemeCss = `
  .markdown-body {
      background: #fff;
      color: ${themeCssValues.fg};
      font-size: 16px;
      line-height: 1.8;
      font-weight: 300;
      padding: 0;
      margin:0;
      font-family: 'LXGW WenKai', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, serif;
  }
  .markdown-body h1, .markdown-body h2, .markdown-body h3 {
    font-weight: 600; margin: 1.2em 0 .6em; line-height: 1.7;
  }
  .markdown-body h1 { font-size: 1.8rem; }
.markdown-body h2 { font-size: 1.6rem; }
.markdown-body h3 { font-size: 1.35rem; }
.markdown-body h4 { font-size: 1.2rem; line-height: 1.7;}
.markdown-body h5 { font-size: 1.05rem; }
.markdown-body h6 { font-size: .95rem; color: ${themeCssValues.muted}; }
  .markdown-body a { color: ${themeCssValues.accent}; text-decoration: none; }
  .markdown-body blockquote {
    margin: 1em 0; padding: .6em 1em; background: ${themeCssValues.quoteBg};
    border-left: 4px solid ${themeCssValues.quoteBar}; color: ${themeCssValues.fg};
  }
  .markdown-body code:not(.hljs) {
    background: ${themeCssValues.codeBg}; color: ${themeCssValues.codeFg};
    border: 1px solid ${themeCssValues.border}; padding: .1em .4em;
    border-radius: 4px; font-size: 0.9em;
  }
    .markdown-body p { margin: 0 0; 
    }

    .markdown-body li { margin: .3em 0; 
      word-break:break-word;
}

    `;

    // ✅ 2. 根据 codeThemeKey 动态读取对应的 CSS 文件
    // 注意：这里需要一个安全检查，防止路径遍历攻击
    const safeThemeKey = codeThemeKey.replace(/[^a-z0-9-]/g, ""); // 简单的安全过滤
    const themeFileName = `${safeThemeKey}.min.css`;
    const codeThemePath = path.join(
      __dirname,
      "..",
      "public",
      "hljs",
      themeFileName
    );
    console.log("__themePath", codeThemePath);
    console.log("__themeFileName:", themeFileName);

    if (!fs.existsSync(codeThemePath)) {
      throw new Error(`Theme file not found: ${themeFileName}`);
    }

    const highlightCss = fs.readFileSync(codeThemePath, "utf-8");

    //  借鉴开源库，定义一个适配微信的“主题”
    const extraCss = `
  
      pre {
        margin: 0 !important;
        padding: 1em !important;
        border-radius: 8px !important;
        /* 核心滚动样式 */
        white-space: pre !important;
        overflow-x: auto !important;
        font-family: 'LXGW WenKai';
      }
      code {
        /* 强制 nowrap，配合 pre 的 overflow-x: auto */
        white-space: nowrap !important; 
        font-family:  Menlo, Operator Mono, Consolas, Monaco, monospace;
        border-radius: 8px;
        line-height: 1.5;
        font-size: 90%;
      }
    `;

    // 将HTML内容复制到剪贴板
    // clipboard.writeHTML(rawHtml);

    let inlinedHtml = htmlWithBase64Images;

    if (!skipJuice) {
      inlinedHtml = juice(
        htmlWithBase64Images,
        {
          extraCss: highlightCss + extraCss,
        }
      );
      console.log("extraCSS:", highlightCss + extraCss);
    } else {
      console.log("Skipping juice (CSS inlining)...");
    }

    // 可选：保存CSS到文件或进行其他处理
    // console.log(`复制了主题 ${theme} 的样式内容`);


    // const inlinedHtml = juice(
    //   // 必须用 .markdown-body 包裹，让 CSS 规则能正确匹配
    //   `<section class="markdown-body">${htmlWithBase64Images}</section>`,
    //   {
    //     extraCss: markdownThemeCss + highlightCss + extraCss, // ✅ 合并了三种 CSS
    //   }
    // );

    console.log("extraCSS:", highlightCss + extraCss);

    // ✅ 5. (可选但推荐) 对标题进行最后的降级处理，以获得最佳兼容性
    let finalHtml = inlinedHtml;

    // ✅ 6. (可选) 图片处理 - 从分析文档中借鉴
    // 这个正则会找到所有<img>标签，移除 width/height 属性，并转为 style
    finalHtml = finalHtml.replace(/<img[^>]*>/g, (match) => {
      if (!match.includes("style=")) {
        match = match.replace(">", ' style="">');
      }
      const width = match.match(/width="([^"]*)"/);
      const height = match.match(/height="([^"]*)"/);
      if (width) {
        match = match
          .replace(width[0], "")
          .replace(/style="/, `style="width: ${width[1]}px;`);
      }
      if (height) {
        match = match
          .replace(height[0], "")
          .replace(/style="/, `style="height: ${height[1]}px;`);
      }
      return match;
    });

    finalHtml = finalHtml.replace(
      /<pre[^>]*>([\s\S]*?)<\/pre>/g,
      (match, preContent) => {
        const processedContent = preContent.replace(
          /(>[^<]+)|(^[^<]+)/g,
          (str) => str.replace(/ /g, `&nbsp;`)
        );
        return match.replace(preContent, processedContent);
      }
    );

    console.log("////finalHtml", finalHtml);

    return finalHtml;
  } catch (error) {
    console.error("Failed to process HTML for clipboard:", error);
    return "";
  }
});



// 从编辑器拿到的 HTML 字符串
// function sanitizeForWechat(html) {
//   // 1. 用 DOMParser 解析成 DOM
//   const parser = new DOMParser();
//   const doc = parser.parseFromString(html, 'text/html');

//   // 2. 删除 ProseMirror 特殊类的 <br>
//   doc.querySelectorAll('br.ProseMirror-trailingBreak').forEach(n => n.remove());

//   // 3. 删除所有带 leaf="" 的 span（或其它编辑器专用 wrapper）
//   doc.querySelectorAll('span[leaf]').forEach(n => {
//     // 用子节点替换该 span，避免丢内容
//     const parent = n.parentNode;
//     while (n.firstChild) parent.insertBefore(n.firstChild, n);
//     parent.removeChild(n);
//   });

//   // 4. 去掉紧跟在某些闭合标签后面的 &nbsp;（比如 </strong>, </b>, </em> 等）
//   //    这里把所有 &nbsp; 转成普通空格，但对位于行首多余的空格会被去除
//   let out = doc.body.innerHTML;
//   // 如果你只想去除在标签后紧跟的 &nbsp;：
//   out = out.replace(/(<\/(?:strong|b|em|span)>)(\s|&nbsp;)+/gi, '$1');
//   // 再把其它孤立的 &nbsp; 统一为普通空格（可选）
//   out = out.replace(/&nbsp;/g, ' ');

//   // 5. 合并多个空格为一个（可选）
//   out = out.replace(/ {2,}/g, ' ');

//   return out;
// }

// ===================================================================
// ✅ 导出为 PDF 功能
// ===================================================================
ipcMain.handle("export-to-pdf", async (event, payload) => {
  const sender = event && event.sender ? event.sender : null;
  const { html, filePath } = payload;
  console.log("[PDF Export] 收到导出请求, filePath:", filePath);

  if (!html || typeof html !== "string") {
    console.error("export-to-pdf: Invalid HTML content");
    return { success: false, error: "无效的 HTML 内容" };
  }

  try {
    // 创建一个临时的隐藏窗口用于生成 PDF
    const pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // 将 HTML 内容写入临时文件
    const tempHtmlPath = path.join(os.tmpdir(), `lingmd-pdf-${Date.now()}.html`);
    console.log("[PDF Export] 临时 HTML 路径:", tempHtmlPath);
    await fs.promises.writeFile(tempHtmlPath, html, 'utf-8');

    // 确定最终保存路径
    let finalPath = filePath;
    if (!finalPath) {
      console.log("[PDF Export] 未提供 filePath，准备弹出保存对话框...");
      const win = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
      try {
        const result = await dialog.showSaveDialog(win, {
          title: "导出 PDF",
          defaultPath: path.join(getDefaultDir(), "untitled.pdf"),
          buttonLabel: "保存",
          filters: [
            { name: "PDF", extensions: ["pdf"] },
            { name: "所有文件", extensions: ["*"] },
          ],
        });
        console.log("[PDF Export] 保存对话框结果:", result);

        if (result.canceled || !result.filePath) {
          console.log("[PDF Export] 用户取消了保存对话框");
          pdfWindow.close();
          // 删除临时 HTML 文件
          try {
            await fs.promises.unlink(tempHtmlPath);
          } catch (e) { }
          sendExportProgress(sender, { type: 'pdf', progress: 100, message: '已取消导出', done: true, canceled: true });
          return { success: false, canceled: true };
        }
        finalPath = result.filePath;
        console.log("[PDF Export] 用户选择的路径:", finalPath);
      } catch (dialogError) {
        console.error("[PDF Export] 保存对话框出错:", dialogError);
        pdfWindow.close();
        try {
          await fs.promises.unlink(tempHtmlPath);
        } catch (e) { }
        sendExportProgress(sender, { type: 'pdf', progress: 100, message: `导出失败：${dialogError.message || String(dialogError)}`, done: true, error: true });
        return { success: false, error: `保存对话框失败: ${dialogError.message || String(dialogError)}` };
      }
    } else {
      console.log("[PDF Export] 使用提供的 filePath:", finalPath);
    }

    // 确保文件扩展名是 .pdf
    if (!finalPath.toLowerCase().endsWith(".pdf")) {
      finalPath += ".pdf";
    }
    console.log("[PDF Export] 最终保存路径:", finalPath);
    sendExportProgress(sender, { type: 'pdf', progress: 20, message: '正在加载导出页面...' });

    // 加载临时 HTML 文件
    console.log("[PDF Export] 开始加载临时 HTML 文件...");
    try {
      await pdfWindow.loadFile(tempHtmlPath);
      console.log("[PDF Export] 临时 HTML 文件加载完成");
      sendExportProgress(sender, { type: 'pdf', progress: 40, message: '页面已加载，正在处理资源...' });
    } catch (loadErr) {
      console.error("[PDF Export] 加载 HTML 文件失败:", loadErr);
      sendExportProgress(sender, { type: 'pdf', progress: 100, message: `导出失败：${loadErr.message || String(loadErr)}`, done: true, error: true });
      throw loadErr;
    }

    // 等待页面加载完成
    // console.log("[PDF Export] 等待 did-finish-load...");
    // await new Promise((resolve) => {
    //   pdfWindow.webContents.once('did-finish-load', resolve);
    // });
    // console.log("[PDF Export] 页面加载完成 (did-finish-load)");

    // 等待所有图片加载完成
    console.log("[PDF Export] 开始检查图片加载状态...");
    try {
      await pdfWindow.webContents.executeJavaScript(`
        new Promise((resolve) => {
            console.log("开始检查图片...");
            const images = document.querySelectorAll('img');
            if (images.length === 0) {
                console.log("没有图片，直接完成");
                resolve();
                return;
            }
            console.log("找到 " + images.length + " 张图片");
            let loadedCount = 0;
            const checkComplete = () => {
                loadedCount++;
                // console.log("图片加载进度: " + loadedCount + "/" + images.length);
                if (loadedCount === images.length) {
                    console.log("所有图片加载完成");
                    resolve();
                }
            };
            images.forEach((img) => {
                if (img.complete) {
                    checkComplete();
                } else {
                    img.onload = checkComplete;
                    img.onerror = checkComplete; // 即使加载失败也继续
                }
            });
            // 超时保护：5秒后强制完成
            setTimeout(() => {
                console.log("图片加载超时，强制完成");
                resolve();
            }, 5000);
        });
        `).catch((e) => {
        console.warn("[PDF Export] 等待图片加载脚本出错:", e);
      });
      console.log("[PDF Export] 图片加载检查结束");
      sendExportProgress(sender, { type: 'pdf', progress: 58, message: '资源处理完成，正在排版...' });
    } catch (jsErr) {
      console.error("[PDF Export] 执行 JS 失败:", jsErr);
    }

    // 额外等待一下，确保所有样式都应用完成
    console.log("[PDF Export] 等待样式渲染 (500ms)...");
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log("[PDF Export] 等待结束");

    // 将单个水印推到最后一页底部，避免在每页重复显示
    console.log("[PDF Export] 开始定位末页水印...");
    try {
      const watermarkLayout = await pdfWindow.webContents.executeJavaScript(`
        (() => {
          const measureMm = (mm) => {
            const probe = document.createElement('div');
            probe.style.position = 'absolute';
            probe.style.visibility = 'hidden';
            probe.style.pointerEvents = 'none';
            probe.style.left = '-99999px';
            probe.style.top = '0';
            probe.style.width = '1px';
            probe.style.height = mm + 'mm';
            document.body.appendChild(probe);
            const px = probe.getBoundingClientRect().height;
            probe.remove();
            return px;
          };

          const watermark = document.querySelector('.pdf-export .app-watermark');
          const content = document.querySelector('.pdf-export .markdown-body');
          if (!watermark || !content) {
            return { adjusted: false, reason: 'missing-elements' };
          }

          watermark.style.marginTop = '0px';
          watermark.style.position = 'relative';
          watermark.style.left = 'auto';
          watermark.style.right = 'auto';
          watermark.style.bottom = 'auto';

          const pageHeightPx = measureMm(297);
          if (!pageHeightPx || pageHeightPx < 200) {
            return { adjusted: false, reason: 'invalid-page-height', pageHeightPx };
          }

          const bottomInsetPx = measureMm(8);
          const minGapPx = measureMm(18);

          const scrollY = window.scrollY || window.pageYOffset || 0;
          const contentRect = content.getBoundingClientRect();
          const watermarkRect = watermark.getBoundingClientRect();

          const contentTop = contentRect.top + scrollY;
          const contentBottom = contentTop + contentRect.height;
          const watermarkTopNow = watermarkRect.top + scrollY;
          const watermarkHeight = watermarkRect.height;

          const minTop = contentBottom + minGapPx;
          const requiredBottom = minTop + watermarkHeight + bottomInsetPx;
          const pageIndex = Math.max(1, Math.ceil(requiredBottom / pageHeightPx));
          const targetTop = (pageIndex * pageHeightPx) - bottomInsetPx - watermarkHeight;
          const extraMargin = Math.max(0, Math.ceil(targetTop - watermarkTopNow));

          watermark.style.marginTop = extraMargin + 'px';
          return {
            adjusted: true,
            pageHeightPx,
            bottomInsetPx,
            minGapPx,
            pageIndex,
            extraMargin,
            watermarkHeight,
          };
        })();
      `).catch((e) => ({ adjusted: false, reason: 'execute-failed', error: String(e) }));
      console.log("[PDF Export] 末页水印定位结果:", watermarkLayout);
    } catch (watermarkErr) {
      console.warn("[PDF Export] 末页水印定位失败，使用默认位置:", watermarkErr);
    }

    await new Promise(resolve => setTimeout(resolve, 80));
    sendExportProgress(sender, { type: 'pdf', progress: 70, message: '正在生成 PDF...' });

    console.log("[PDF Export] 开始生成 PDF 数据...");
    // 生成 PDF
    let pdfData;
    try {
      pdfData = await pdfWindow.webContents.printToPDF({
        marginsType: 1, // 0 = default, 1 = none, 2 = minimum
        pageSize: 'A4',
        printBackground: true, // 重要：保留背景色和样式
        displayHeaderFooter: false,
        landscape: false,
        preferCSSPageSize: true,
      });
      console.log("[PDF Export] PDF 生成成功，数据类型:", typeof pdfData, "长度:", pdfData.length);
      sendExportProgress(sender, { type: 'pdf', progress: 88, message: 'PDF 已生成，正在写入文件...' });
    } catch (pdfError) {
      console.error("[PDF Export] 生成 PDF 失败:", pdfError);
      pdfWindow.close();
      try {
        await fs.promises.unlink(tempHtmlPath);
      } catch (e) { }
      sendExportProgress(sender, { type: 'pdf', progress: 100, message: `导出失败：${pdfError.message || String(pdfError)}`, done: true, error: true });
      return { success: false, error: `生成 PDF 失败: ${pdfError.message || String(pdfError)}` };
    }

    // 关闭临时窗口
    pdfWindow.close();
    console.log("[PDF Export] 临时窗口已关闭");

    // 删除临时 HTML 文件
    try {
      await fs.promises.unlink(tempHtmlPath);
      console.log("[PDF Export] 临时 HTML 文件已删除");
    } catch (e) {
      console.warn("Failed to delete temp HTML file:", e);
    }

    // 保存 PDF 文件
    console.log("[PDF Export] 正在写入文件:", finalPath);
    try {
      await fs.promises.writeFile(finalPath, Buffer.from(pdfData));
      console.log("[PDF Export] 文件写入成功");
    } catch (writeError) {
      console.error("[PDF Export] 文件写入失败:", writeError);
      sendExportProgress(sender, { type: 'pdf', progress: 100, message: `导出失败：${writeError.message || String(writeError)}`, done: true, error: true });
      return { success: false, error: `文件写入失败: ${writeError.message}` };
    }

    sendExportProgress(sender, { type: 'pdf', progress: 100, message: 'PDF 导出完成', done: true });
    return { success: true, path: finalPath };
  } catch (error) {
    console.error("Failed to export PDF:", error);
    sendExportProgress(sender, { type: 'pdf', progress: 100, message: `导出失败：${error.message || String(error)}`, done: true, error: true });
    return { success: false, error: error.message || String(error) };
  }
});

// ===================================================================
// ✅ 导出为图片（朋友圈）功能
// ===================================================================
ipcMain.handle("export-to-image", async (event, payload) => {
  const sender = event && event.sender ? event.sender : null;
  const { html, filePath } = payload;
  console.log("[Image Export] 收到导出请求, filePath:", filePath);

  if (!html || typeof html !== "string") {
    console.error("export-to-image: Invalid HTML content");
    return { success: false, error: "无效的 HTML 内容" };
  }

  try {
    // 创建临时的隐藏窗口用于生成图片
    // 朋友圈宽度约 375-428px，这里使用 400px 宽度
    // 初始使用一个非常大的高度，让内容可以完全展示
    const imageWindow = new BrowserWindow({
      width: 400,
      height: 10000,  // 使用非常大的高度，让内容完全展示
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // 将 HTML 内容写入临时文件
    const tempHtmlPath = path.join(os.tmpdir(), `lingmd-image-${Date.now()}.html`);
    console.log("[Image Export] 临时 HTML 路径:", tempHtmlPath);
    await fs.promises.writeFile(tempHtmlPath, html, 'utf-8');

    // 确定最终保存路径
    let finalPath = filePath;
    if (!finalPath) {
      console.log("[Image Export] 未提供 filePath，准备弹出保存对话框...");
      const win = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
      try {
        const result = await dialog.showSaveDialog(win, {
          title: "导出朋友圈图片",
          defaultPath: path.join(getDefaultDir(), "moments.png"),
          buttonLabel: "保存",
          filters: [
            { name: "PNG 图片", extensions: ["png"] },
            { name: "JPG 图片", extensions: ["jpg", "jpeg"] },
          ],
        });
        console.log("[Image Export] 保存对话框结果:", result);

        if (result.canceled || !result.filePath) {
          console.log("[Image Export] 用户取消了保存对话框");
          imageWindow.close();
          try {
            await fs.promises.unlink(tempHtmlPath);
          } catch (e) { }
          sendExportProgress(sender, { type: 'image', progress: 100, message: '已取消导出', done: true, canceled: true });
          return { success: false, canceled: true };
        }
        finalPath = result.filePath;
        console.log("[Image Export] 用户选择的路径:", finalPath);
      } catch (dialogError) {
        console.error("[Image Export] 保存对话框出错:", dialogError);
        imageWindow.close();
        try {
          await fs.promises.unlink(tempHtmlPath);
        } catch (e) { }
        sendExportProgress(sender, { type: 'image', progress: 100, message: `导出失败：${dialogError.message || String(dialogError)}`, done: true, error: true });
        return { success: false, error: `保存对话框失败: ${dialogError.message || String(dialogError)}` };
      }
    } else {
      console.log("[Image Export] 使用提供的 filePath:", finalPath);
    }

    // 确保文件扩展名是图片格式
    const ext = finalPath.toLowerCase().split('.').pop();
    if (!['png', 'jpg', 'jpeg'].includes(ext)) {
      finalPath += ".png";
    }
    console.log("[Image Export] 最终保存路径:", finalPath);
    sendExportProgress(sender, { type: 'image', progress: 18, message: '正在加载导出页面...' });

    // 加载临时 HTML 文件
    console.log("[Image Export] 开始加载临时 HTML 文件...");
    try {
      await imageWindow.loadFile(tempHtmlPath);
      console.log("[Image Export] 临时 HTML 文件加载完成");
      sendExportProgress(sender, { type: 'image', progress: 32, message: '页面已加载，正在处理资源...' });
    } catch (loadErr) {
      console.error("[Image Export] 加载 HTML 文件失败:", loadErr);
      sendExportProgress(sender, { type: 'image', progress: 100, message: `导出失败：${loadErr.message || String(loadErr)}`, done: true, error: true });
      throw loadErr;
    }

    // 等待页面加载完成
    console.log("[Image Export] 开始检查资源加载状态...");
    try {
      const resourcePrepResult = await imageWindow.webContents.executeJavaScript(`
        (async () => {
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const getAllImages = () => Array.from(document.querySelectorAll('img'));
          const readDocHeight = () => {
            const body = document.body;
            const doc = document.documentElement;
            return Math.max(
              body ? body.scrollHeight || 0 : 0,
              doc ? doc.scrollHeight || 0 : 0,
              body ? body.offsetHeight || 0 : 0,
              doc ? doc.offsetHeight || 0 : 0,
              1
            );
          };

          const normalizeImage = (img) => {
            try { img.loading = 'eager'; } catch (_e) {}
            try { img.decoding = 'sync'; } catch (_e) {}

            if (!img.getAttribute('src') || img.getAttribute('src') === '') {
              const lazySrc =
                img.getAttribute('data-src') ||
                img.getAttribute('data-original') ||
                img.getAttribute('data-url') ||
                img.getAttribute('data-lazy-src');
              if (lazySrc) {
                img.setAttribute('src', lazySrc);
              }
            }
          };

          const waitImageReady = async (img, timeoutMs = 12000) => {
            normalizeImage(img);
            const loaded = () => img.complete || img.naturalWidth > 0 || img.naturalHeight > 0;
            if (loaded()) {
              if (typeof img.decode === 'function') {
                await Promise.race([
                  img.decode().catch(() => {}),
                  sleep(1200),
                ]);
              }
              return;
            }

            await Promise.race([
              new Promise((resolve) => {
                const onDone = () => resolve();
                img.addEventListener('load', onDone, { once: true });
                img.addEventListener('error', onDone, { once: true });
              }),
              sleep(timeoutMs),
            ]);

            if (typeof img.decode === 'function') {
              await Promise.race([
                img.decode().catch(() => {}),
                sleep(1200),
              ]);
            }
          };

          // Multi-pass sweep to trigger lazy-loading resources on long pages.
          for (let pass = 0; pass < 3; pass++) {
            const images = getAllImages();
            await Promise.all(images.map((img) => waitImageReady(img, 12000)));

            const viewport = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0, 1);
            const totalHeight = readDocHeight();
            const step = Math.max(260, Math.floor(viewport * 0.9));
            for (let y = 0; y < totalHeight; y += step) {
              window.scrollTo(0, y);
              await sleep(35);
            }
            window.scrollTo(0, totalHeight);
            await sleep(120);
            window.scrollTo(0, 0);
            await sleep(120);
          }

          await sleep(400);
          const finalImages = getAllImages();
          return {
            totalImages: finalImages.length,
            pendingImages: finalImages.filter((img) => !img.complete).length,
            finalDocHeight: readDocHeight(),
          };
        })();
      `);
      console.log("[Image Export] 资源预处理结果:", resourcePrepResult);
    } catch (jsErr) {
      console.warn("[Image Export] 等待资源加载脚本出错:", jsErr);
    }
    sendExportProgress(sender, { type: 'image', progress: 42, message: '资源处理完成，正在计算尺寸...' });

    // 额外等待一下，确保所有样式都应用完成
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 再等待高度稳定，避免字体/异步渲染导致高度波动引发“偶发截断”
    let stableHeight = null;
    try {
      stableHeight = await imageWindow.webContents.executeJavaScript(`
        new Promise((resolve) => {
          const target = document.querySelector('.image-export') || document.body;
          const body = document.body;
          const html = document.documentElement;
          let lastHeight = -1;
          let stableTicks = 0;
          let tickCount = 0;
          const maxTicks = 90;
          const needStable = 6;

          const measure = () => {
            const rect = target.getBoundingClientRect();
            return Math.ceil(Math.max(
              rect.height || 0,
              target.scrollHeight || 0,
              body.scrollHeight || 0,
              html.scrollHeight || 0,
              1
            ));
          };

          const loop = () => {
            const h = measure();
            if (h === lastHeight) {
              stableTicks += 1;
            } else {
              lastHeight = h;
              stableTicks = 0;
            }

            tickCount += 1;
            if (stableTicks >= needStable || tickCount >= maxTicks) {
              resolve(h);
              return;
            }
            setTimeout(loop, 80);
          };

          // 字体加载会影响换行和总高度；在支持时等待字体就绪再开始稳定检测
          if (document.fonts && document.fonts.ready) {
            Promise.race([
              document.fonts.ready,
              new Promise((r) => setTimeout(r, 2500)),
            ]).finally(loop);
          } else {
            loop();
          }
        });
      `);
    } catch (stableErr) {
      console.warn("[Image Export] 等待高度稳定失败，继续使用当前尺寸:", stableErr);
    }

    // 获取页面内容的实际尺寸（优先按导出容器计算）
    console.log("[Image Export] 开始获取页面尺寸...");
    const dimensions = await imageWindow.webContents.executeJavaScript(`
      (() => {
        const target = document.querySelector('.image-export') || document.body;
        const body = document.body;
        const html = document.documentElement;
        const rect = target.getBoundingClientRect();
        const width = Math.ceil(Math.max(rect.width || 0, target.scrollWidth || 0, body.scrollWidth || 0, html.scrollWidth || 0, 360));
        const height = Math.ceil(Math.max(rect.height || 0, target.scrollHeight || 0, body.scrollHeight || 0, html.scrollHeight || 0, 1));
        return { width, height };
      })();
    `);
    if (typeof stableHeight === 'number' && Number.isFinite(stableHeight)) {
      dimensions.height = Math.max(dimensions.height, Math.ceil(stableHeight));
    }
    console.log("[Image Export] 页面尺寸:", dimensions);
    sendExportProgress(sender, { type: 'image', progress: 50, message: `尺寸 ${dimensions.width}x${dimensions.height}，开始生成图片...` });

    const finalWidth = Math.max(360, Math.min(2000, Math.ceil(dimensions.width)));
    const finalHeight = Math.max(1, Math.ceil(dimensions.height));
    const maxPixels = IMAGE_EXPORT_MAX_PIXELS;
    const preferFallbackForLongPage = finalHeight > 20_000;
    const shouldUseCdpPrimary = !IMAGE_EXPORT_FORCE_COMPAT_MODE && !preferFallbackForLongPage;
    let pngBuffer = null;

    // 优先使用 Chromium 全页截图能力；超长内容优先走兼容分段模式，避免 CDP 长时间超时。
    if (shouldUseCdpPrimary) {
      try {
        const totalPixels = finalWidth * finalHeight;
        if (totalPixels > maxPixels) {
          throw new Error(`截图尺寸过大: ${finalWidth}x${finalHeight}`);
        }

        const wc = imageWindow.webContents;
        const dbg = wc.debugger;
        const needDetach = !dbg.isAttached();
        if (needDetach) {
          dbg.attach('1.3');
        }

        const cdpCommand = async (command, params = {}, timeoutMs = 15000) => {
          let timer = null;
          try {
            const timeoutPromise = new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error(`${command} timeout (${timeoutMs}ms)`)), timeoutMs);
            });
            return await Promise.race([dbg.sendCommand(command, params), timeoutPromise]);
          } finally {
            if (timer) clearTimeout(timer);
          }
        };

        const viewportHeight = Math.max(900, Math.min(4000, finalHeight));
        await cdpCommand('Emulation.setDeviceMetricsOverride', {
          mobile: false,
          width: finalWidth,
          height: viewportHeight,
          deviceScaleFactor: 1,
          screenWidth: finalWidth,
          screenHeight: viewportHeight,
        }, 15000);

        const maxChunkHeight = 1500;
        const finalBitmap = Buffer.alloc(finalWidth * finalHeight * 4, 255);
        let offsetY = 0;
        let segmentCount = 0;

        const totalSegments = Math.ceil(finalHeight / maxChunkHeight);
        while (offsetY < finalHeight) {
          const chunkHeight = Math.min(maxChunkHeight, finalHeight - offsetY);
          console.log(`[Image Export] CDP 分段截图 ${segmentCount + 1}: y=${offsetY}, h=${chunkHeight}`);

          const shot = await cdpCommand('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: true,
            clip: {
              x: 0,
              y: offsetY,
              width: finalWidth,
              height: chunkHeight,
              scale: 1,
            },
          }, 15000);

          const chunkPng = Buffer.from(shot.data, 'base64');
          const chunkImage = nativeImage.createFromBuffer(chunkPng);
          if (chunkImage.isEmpty()) {
            throw new Error(`分段截图失败：第 ${segmentCount + 1} 段图像为空`);
          }

          const chunkSize = chunkImage.getSize();
          const chunkBitmap = chunkImage.toBitmap();
          const copyWidth = Math.min(finalWidth, chunkSize.width);
          const copyHeight = Math.min(chunkSize.height, finalHeight - offsetY);
          if (copyHeight <= 0 || copyWidth <= 0) {
            throw new Error(`分段截图失败：第 ${segmentCount + 1} 段尺寸异常 (${chunkSize.width}x${chunkSize.height})`);
          }

          for (let row = 0; row < copyHeight; row++) {
            const srcStart = row * chunkSize.width * 4;
            const dstStart = (offsetY + row) * finalWidth * 4;
            chunkBitmap.copy(finalBitmap, dstStart, srcStart, srcStart + copyWidth * 4);
          }

          offsetY += copyHeight;
          segmentCount++;
          const segProgress = 50 + Math.min(38, Math.round((segmentCount / totalSegments) * 38));
          sendExportProgress(sender, {
            type: 'image',
            progress: segProgress,
            message: '正在生成高清图片...',
            generatedCount: segmentCount,
            totalCount: totalSegments,
          });
        }

        await cdpCommand('Emulation.clearDeviceMetricsOverride', {}, 10000).catch(() => { });
        if (needDetach && dbg.isAttached()) {
          dbg.detach();
        }

        const mergedImage = createNativeImageFromRawBitmap(finalBitmap, finalWidth, finalHeight);
        if (mergedImage.isEmpty()) {
          throw new Error("分段拼接失败：生成图像为空");
        }

        pngBuffer = mergedImage.toPNG();
        console.log("[Image Export] CDP 分段拼接完成，段数:", segmentCount, "字节数:", pngBuffer.length);
        sendExportProgress(sender, { type: 'image', progress: 90, message: '截图完成，正在写入文件...' });
      } catch (cdpErr) {
        try {
          const dbg = imageWindow.webContents.debugger;
          if (dbg.isAttached()) {
            await dbg.sendCommand('Emulation.clearDeviceMetricsOverride').catch(() => { });
            dbg.detach();
          }
        } catch (detachErr) {
          console.warn("[Image Export] CDP 清理失败:", detachErr);
        }
        console.warn("[Image Export] CDP 截图失败，回退 capturePage:", cdpErr);
      }
    } else {
      console.log("[Image Export] 跳过 CDP 主方案，直接使用兼容截图模式:", {
        finalWidth,
        finalHeight,
        forceCompat: IMAGE_EXPORT_FORCE_COMPAT_MODE,
        preferFallbackForLongPage,
      });
      sendExportProgress(sender, {
        type: 'image',
        progress: 60,
        message: IMAGE_EXPORT_FORCE_COMPAT_MODE
          ? '已启用兼容截图模式...'
          : '文档较长，切换到兼容截图模式...',
      });
    }

    // 回退方案：分段滚动 + capturePage，再拼接，确保超长文档也能完整导出
    if (!pngBuffer || pngBuffer.length === 0) {
      sendExportProgress(sender, { type: 'image', progress: 74, message: '主方案失败，正在使用兼容截图模式...' });
      const fallbackViewportHeight = preferFallbackForLongPage
        ? Math.max(800, Math.min(1400, finalHeight))
        : Math.max(900, Math.min(2000, finalHeight));
      const desiredRenderScale = 2;
      const maxScaleByPixels = Math.sqrt(IMAGE_EXPORT_MAX_PIXELS / Math.max(1, finalWidth * finalHeight));
      let actualRenderScale = Math.max(1, Math.min(desiredRenderScale, Math.floor(maxScaleByPixels)));
      if (actualRenderScale > 1) {
        try {
          await imageWindow.webContents.setZoomFactor(actualRenderScale);
          console.log("[Image Export] 兼容模式启用高清渲染倍率:", actualRenderScale);
        } catch (zoomErr) {
          console.warn("[Image Export] 设置高清渲染倍率失败，回退 1x:", zoomErr);
          actualRenderScale = 1;
        }
      }
      const dipWidth = Math.max(1, Math.ceil(finalWidth * actualRenderScale));
      const dipViewportHeight = Math.max(1, Math.ceil(fallbackViewportHeight * actualRenderScale));
      if (typeof imageWindow.setContentSize === "function") {
        imageWindow.setContentSize(dipWidth, dipViewportHeight);
      } else {
        imageWindow.setSize(dipWidth, dipViewportHeight);
      }
      await new Promise(resolve => setTimeout(resolve, 250));

      let knownScrollHeight = finalHeight;
      let cssOffsetY = 0;
      let segmentCount = 0;
      let outputWidth = 0;
      let outputHeight = 0;
      let outputBitmap = null;
      let bitmapScale = 1;

      const getScrollMetrics = async () => {
        return await imageWindow.webContents.executeJavaScript(`
          (() => {
            const doc = document.documentElement;
            const body = document.body;
            const scrollTop = Math.max(window.scrollY || 0, doc.scrollTop || 0, body.scrollTop || 0);
            const clientHeight = Math.max(window.innerHeight || 0, doc.clientHeight || 0);
            const scrollHeight = Math.max(
              doc.scrollHeight || 0,
              body.scrollHeight || 0,
              doc.offsetHeight || 0,
              body.offsetHeight || 0,
              clientHeight
            );
            return { scrollTop, clientHeight, scrollHeight };
          })();
        `);
      };

      const ensureOutputBuffer = (requiredHeight) => {
        const safeRequiredHeight = Math.max(1, Math.ceil(requiredHeight));
        const totalPixels = outputWidth * safeRequiredHeight;
        if (totalPixels > IMAGE_EXPORT_MAX_PIXELS) {
          throw new Error(`兼容截图尺寸过大: ${outputWidth}x${safeRequiredHeight}`);
        }

        if (!outputBitmap) {
          outputBitmap = Buffer.alloc(outputWidth * safeRequiredHeight * 4, 255);
          outputHeight = safeRequiredHeight;
          return;
        }

        if (safeRequiredHeight <= outputHeight) return;
        const nextBitmap = Buffer.alloc(outputWidth * safeRequiredHeight * 4, 255);
        outputBitmap.copy(nextBitmap, 0, 0, outputBitmap.length);
        outputBitmap = nextBitmap;
        outputHeight = safeRequiredHeight;
      };

      // 关闭平滑滚动，避免 scrollTo 过渡动画导致分段数异常膨胀
      try {
        const scrollSetup = await imageWindow.webContents.executeJavaScript(`
          (() => {
            try { document.documentElement.style.scrollBehavior = 'auto'; } catch (_e) {}
            try { document.body.style.scrollBehavior = 'auto'; } catch (_e) {}
            return {
              htmlBehavior: getComputedStyle(document.documentElement).scrollBehavior,
              bodyBehavior: getComputedStyle(document.body).scrollBehavior,
              viewport: Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0),
            };
          })();
        `);
        console.log("[Image Export] 兼容模式滚动设置:", scrollSetup);
      } catch (scrollSetupErr) {
        console.warn("[Image Export] 兼容模式滚动设置失败:", scrollSetupErr);
      }

      const MAX_SEGMENTS = 300;
      while (segmentCount < MAX_SEGMENTS) {
        await imageWindow.webContents.executeJavaScript(`
          (() => {
            const y = ${Math.max(0, Math.floor(cssOffsetY))};
            try {
              window.scrollTo({ top: y, left: 0, behavior: 'auto' });
            } catch (_e) {
              window.scrollTo(0, y);
            }
            try { document.documentElement.scrollTop = y; } catch (_e) {}
            try { document.body.scrollTop = y; } catch (_e) {}
            return Math.max(
              window.scrollY || 0,
              document.documentElement.scrollTop || 0,
              document.body.scrollTop || 0
            );
          })();
        `);
        await new Promise(resolve => setTimeout(resolve, 100));

        const metrics = await getScrollMetrics();
        knownScrollHeight = Math.max(knownScrollHeight, metrics.scrollHeight);

        const cssTop = Math.max(0, Math.floor(metrics.scrollTop));
        const effectiveViewportHeight = Math.max(1, Math.floor(metrics.clientHeight || fallbackViewportHeight));
        const cssRemaining = Math.max(1, Math.ceil(knownScrollHeight - cssTop));
        const cssChunkHeight = Math.max(1, Math.min(effectiveViewportHeight, cssRemaining));

        const image = await imageWindow.webContents.capturePage({
          x: 0,
          y: 0,
          width: dipWidth,
          height: Math.max(1, Math.ceil(cssChunkHeight * actualRenderScale)),
        });
        if (image.isEmpty()) {
          throw new Error(`兼容截图失败：第 ${segmentCount + 1} 段为空`);
        }

        const shotSize = image.getSize();
        if (segmentCount === 0) {
          const scale = shotSize.width / finalWidth;
          bitmapScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
          outputWidth = shotSize.width;
          ensureOutputBuffer(Math.ceil(knownScrollHeight * bitmapScale) + 4);
        }

        const outputTop = Math.max(0, Math.floor(cssTop * bitmapScale));
        ensureOutputBuffer(Math.max(outputHeight, Math.ceil(knownScrollHeight * bitmapScale) + 4, outputTop + shotSize.height + 1));

        const shotBitmap = image.toBitmap();
        const copyWidth = Math.min(outputWidth, shotSize.width);
        const copyHeight = Math.min(shotSize.height, outputHeight - outputTop);
        if (copyWidth <= 0 || copyHeight <= 0) {
          throw new Error(`兼容截图失败：第 ${segmentCount + 1} 段尺寸异常 (${shotSize.width}x${shotSize.height})`);
        }

        for (let row = 0; row < copyHeight; row++) {
          const srcStart = row * shotSize.width * 4;
          const dstStart = (outputTop + row) * outputWidth * 4;
          shotBitmap.copy(outputBitmap, dstStart, srcStart, srcStart + copyWidth * 4);
        }

        segmentCount++;
        const expectedSegments = Math.max(segmentCount, Math.ceil(knownScrollHeight / effectiveViewportHeight));
        const segProgress = 74 + Math.min(18, Math.round((segmentCount / expectedSegments) * 18));
        sendExportProgress(sender, {
          type: 'image',
          progress: segProgress,
          message: '正在生成高清图片...',
          generatedCount: segmentCount,
          totalCount: expectedSegments,
        });

        const nextCssOffset = cssTop + cssChunkHeight;
        const nearBottom = nextCssOffset >= knownScrollHeight - 1;
        if (nearBottom) {
          // 最后一屏给资源更多时间稳定，避免尾图晚到导致截断
          let hasGrowth = false;
          for (let retry = 0; retry < 6; retry++) {
            await new Promise(resolve => setTimeout(resolve, 260));
            const postMetrics = await getScrollMetrics();
            if (postMetrics.scrollHeight > knownScrollHeight + 1) {
              knownScrollHeight = postMetrics.scrollHeight;
              cssOffsetY = Math.max(nextCssOffset, cssTop + 1);
              hasGrowth = true;
              break;
            }
          }
          if (hasGrowth) {
            continue;
          }
          break;
        }

        cssOffsetY = nextCssOffset;
      }

      if (segmentCount >= MAX_SEGMENTS) {
        throw new Error(`兼容截图失败：分段次数超过上限(${MAX_SEGMENTS})`);
      }

      // 底部补抓：防止最后一屏图片延迟渲染，覆盖一次真实底部视图
      if (segmentCount > 0) {
        await imageWindow.webContents.executeJavaScript(`window.scrollTo(0, document.documentElement.scrollHeight || document.body.scrollHeight || 0);`);
        await new Promise(resolve => setTimeout(resolve, 320));

        const bottomMetrics = await getScrollMetrics();
        knownScrollHeight = Math.max(knownScrollHeight, bottomMetrics.scrollHeight);

        const bottomCssTop = Math.max(0, Math.floor(bottomMetrics.scrollTop));
        const bottomCaptureHeight = Math.max(
          1,
          Math.min(fallbackViewportHeight, Math.ceil(bottomMetrics.clientHeight || fallbackViewportHeight))
        );
        const bottomImage = await imageWindow.webContents.capturePage({
          x: 0,
          y: 0,
          width: dipWidth,
          height: Math.max(1, Math.ceil(bottomCaptureHeight * actualRenderScale)),
        });
        if (!bottomImage.isEmpty()) {
          const bottomShotSize = bottomImage.getSize();
          const bottomOutputTop = Math.max(0, Math.floor(bottomCssTop * bitmapScale));
          ensureOutputBuffer(
            Math.max(
              outputHeight,
              Math.ceil(knownScrollHeight * bitmapScale) + 8,
              bottomOutputTop + bottomShotSize.height + 1
            )
          );

          const bottomBitmap = bottomImage.toBitmap();
          const bottomCopyWidth = Math.min(outputWidth, bottomShotSize.width);
          const bottomCopyHeight = Math.min(bottomShotSize.height, outputHeight - bottomOutputTop);
          for (let row = 0; row < bottomCopyHeight; row++) {
            const srcStart = row * bottomShotSize.width * 4;
            const dstStart = (bottomOutputTop + row) * outputWidth * 4;
            bottomBitmap.copy(outputBitmap, dstStart, srcStart, srcStart + bottomCopyWidth * 4);
          }
          console.log("[Image Export] 兼容模式底部补抓完成:", {
            cssTop: bottomCssTop,
            captureHeight: bottomCaptureHeight,
            bitmapHeight: bottomShotSize.height,
          });
        }
      }

      const finalOutputHeight = Math.max(1, Math.min(outputHeight, Math.ceil(knownScrollHeight * bitmapScale) + 8));
      const finalBitmap = outputBitmap.subarray(0, outputWidth * finalOutputHeight * 4);
      const mergedImage = createNativeImageFromRawBitmap(finalBitmap, outputWidth, finalOutputHeight);
      if (mergedImage.isEmpty()) {
        throw new Error("兼容截图拼接失败：生成图像为空");
      }
      pngBuffer = mergedImage.toPNG();
      console.log("[Image Export] 兼容截图完成，段数:", segmentCount, "字节数:", pngBuffer.length, "尺寸:", { width: outputWidth, height: finalOutputHeight });
      sendExportProgress(sender, { type: 'image', progress: 90, message: '截图完成，正在写入文件...' });
    }

    if (!pngBuffer || pngBuffer.length < 16) {
      throw new Error("截图失败：图像数据无效");
    }

    // 关闭临时窗口
    imageWindow.close();
    console.log("[Image Export] 临时窗口已关闭");

    // 删除临时 HTML 文件
    try {
      await fs.promises.unlink(tempHtmlPath);
      console.log("[Image Export] 临时 HTML 文件已删除");
    } catch (e) {
      console.warn("Failed to delete temp HTML file:", e);
    }

    // 保存图片文件
    console.log("[Image Export] 正在写入文件:", finalPath);
    sendExportProgress(sender, { type: 'image', progress: 96, message: '正在写入图片文件...' });
    try {
      const ext = finalPath.toLowerCase().split('.').pop();
      if (ext === 'jpg' || ext === 'jpeg') {
        const jpgImage = nativeImage.createFromBuffer(pngBuffer);
        if (jpgImage.isEmpty()) {
          throw new Error("图片编码失败：无法从 PNG 转为 JPEG");
        }
        const jpgBuffer = jpgImage.toJPEG(90);
        if (!jpgBuffer || jpgBuffer.length < 16) {
          throw new Error("图片编码失败：JPEG 数据无效");
        }
        await fs.promises.writeFile(finalPath, jpgBuffer);
      } else {
        await fs.promises.writeFile(finalPath, pngBuffer);
      }
      console.log("[Image Export] 文件写入成功");
    } catch (writeError) {
      console.error("[Image Export] 文件写入失败:", writeError);
      sendExportProgress(sender, { type: 'image', progress: 100, message: `导出失败：${writeError.message || String(writeError)}`, done: true, error: true });
      return { success: false, error: `文件写入失败: ${writeError.message}` };
    }

    sendExportProgress(sender, { type: 'image', progress: 100, message: '图片导出完成', done: true });
    return { success: true, path: finalPath };
  } catch (error) {
    console.error("Failed to export image:", error);
    sendExportProgress(sender, { type: 'image', progress: 100, message: `导出失败：${error.message || String(error)}`, done: true, error: true });
    return { success: false, error: error.message || String(error) };
  }
});

// -------------------------------------------------------------------
// EPUB：目录扫描、封面与打包
// -------------------------------------------------------------------
ipcMain.handle("pick-book-directory", async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const r = await dialog.showOpenDialog(win, {
      title: "选择书籍根目录（包含多卷/章 Markdown）",
      properties: ["openDirectory"],
    });
    if (r.canceled || !r.filePaths?.length) return null;
    return r.filePaths[0];
  } catch (e) {
    console.error("pick-book-directory", e);
    return null;
  }
});

ipcMain.handle("pick-cover-image", async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const r = await dialog.showOpenDialog(win, {
      title: "选择封面图片",
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif"] },
      ],
    });
    if (r.canceled || !r.filePaths?.length) return null;
    return r.filePaths[0];
  } catch (e) {
    console.error("pick-cover-image", e);
    return null;
  }
});

ipcMain.handle("scan-markdown-book", async (_event, rootDir) => {
  if (!rootDir || typeof rootDir !== "string" || !fs.existsSync(rootDir)) {
    return [];
  }
  const out = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (/\.(md|markdown)$/i.test(e.name)) {
        out.push({ path: full, rel: path.relative(rootDir, full) });
      }
    }
  }
  walk(rootDir);
  out.sort((a, b) => a.rel.localeCompare(b.rel, "zh-CN", { numeric: true }));
  return out;
});

ipcMain.handle("export-epub-book", async (event, payload) => {
  const sender = event.sender;
  try {
    const { title, author, language, coverPath, chapters, mdThemeCss, codeThemeKey } = payload;
    if (!chapters || !chapters.length) {
      return { success: false, error: "没有章节" };
    }
    const safeKey = String(codeThemeKey || "tokyo-night-dark").replace(/[^a-z0-9-]/g, "");
    const hljsPath = path.join(__dirname, "..", "public", "hljs", `${safeKey}.min.css`);
    let hljsCss = "";
    if (fs.existsSync(hljsPath)) {
      hljsCss = fs.readFileSync(hljsPath, "utf8");
    }
    const katexPath = path.join(__dirname, "..", "node_modules", "katex", "dist", "katex.min.css");
    let katexCss = "";
    if (fs.existsSync(katexPath)) {
      katexCss = fs.readFileSync(katexPath, "utf8");
    }
    const combinedCss = `${mdThemeCss || ""}\n\n/* highlight.js */\n${hljsCss}\n\n/* KaTeX */\n${katexCss}\n\n/* EPUB */\n.epub-cover img{ max-width: 100%; height: auto; display: block; margin: 0 auto; }\n.epub-chapter img, .epub-chapter svg { max-width: 100% !important; height: auto !important; }\n`;

    const buf = await buildEpubZipBuffer({
      title: title || "未命名",
      author: author || "佚名",
      language: language || "zh-CN",
      coverPath: coverPath || null,
      chapters,
      combinedCss,
    });

    const win = BrowserWindow.fromWebContents(sender);
    const safeTitle = String(title || "book")
      .replace(/[<>:"/\\|?*]/g, "_")
      .trim() || "book";
    const defaultPath = path.join(getDefaultDir(), `${safeTitle}.epub`);
    const dlg = await dialog.showSaveDialog(win, {
      title: "保存 EPUB",
      defaultPath,
      filters: [{ name: "EPUB", extensions: ["epub"] }],
    });
    if (dlg.canceled || !dlg.filePath) {
      return { success: false, canceled: true };
    }
    let fp = dlg.filePath;
    if (!fp.toLowerCase().endsWith(".epub")) fp += ".epub";
    await fs.promises.writeFile(fp, buf);
    return { success: true, path: fp };
  } catch (e) {
    console.error("export-epub-book", e);
    return { success: false, error: e.message || String(e) };
  }
});
