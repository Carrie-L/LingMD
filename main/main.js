// main.js - 完整修复版

const { app, BrowserWindow, ipcMain, dialog, protocol, shell, net } = require("electron");
const path = require("path");
const fs = require("fs");
const Store = require("electron-store").default;
const store = new Store();
const { pathToFileURL, fileURLToPath } = require("url"); 
const juice = require('juice');
const { log } = require("console");

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
// main.js --- 找到 convert-html-for-clipboard 函数并用下面的代码替换它

// ===================================================================
// ✅ 修正版：为公众号转换 HTML（方案 B）
// ===================================================================
// ipcMain.handle("convert-html-for-clipboard", async (event, payload) => {
//   const { html: htmlContent, themeCss } = payload; // 传入 html + CSS
//   if (!htmlContent) return "";

//   let finalHtml = htmlContent;

//   // === Step 1: 转换图片为 Base64 ===
//   const imageTagsRegex = /<img src="(safe-file:\/\/[^"]+)"/g;
//   const imageReplacements = await Promise.all(
//     [...finalHtml.matchAll(imageTagsRegex)].map(async (match) => {
//       const originalSrc = match[1];
//       const originalTag = match[0];
//       try {
//         const standardFileUrl = originalSrc.replace("safe-file:", "file:");
//         const filePath = fileURLToPath(standardFileUrl);
//         const fileBuffer = await fs.promises.readFile(filePath);
//         let mimeType;
//         const ext = path.extname(filePath).toLowerCase();
//         if (ext === ".png") mimeType = "image/png";
//         else if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
//         else if (ext === ".gif") mimeType = "image/gif";
//         else if (ext === ".svg") mimeType = "image/svg+xml";
//         else mimeType = "application/octet-stream";
//         const base64String = fileBuffer.toString("base64");
//         const dataUrl = `data:${mimeType};base64,${base64String}`;
//         const newTag = originalTag.replace(originalSrc, dataUrl);
//         return { originalTag, newTag };
//       } catch (error) {
//         console.error(`Failed to convert image to Base64: ${originalSrc}`, error);
//         return { originalTag, newTag: originalTag };
//       }
//     })
//   );

//   for (const { originalTag, newTag } of imageReplacements) {
//     finalHtml = finalHtml.replace(originalTag, newTag);
//   }

//   // === Step 2: 替换代码块 ===
//   const preCodeRegex = /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g;
//   finalHtml = finalHtml.replace(preCodeRegex, (match, codeContent) => {
//     // 换行 → <br>，空格 → &nbsp;
//     const safeCode = codeContent
//       .replace(/\n/g, "<br/>")
//       .replace(/ /g, "&nbsp;");

//     return `<pre class="custom"><code class="hljs">${safeCode}</code></pre>`;
//   });

//   // === Step 3: 在开头插入主题 CSS ===
//   const cssBlock = `<style>${themeCss}</style>`;
//   finalHtml = cssBlock + finalHtml;

//   return finalHtml;
// });

// ===================================================================
// ✅ (终极版) 为公众号复制功能转换 HTML
// ===================================================================
ipcMain.handle("convert-html-for-clipboard", async(event, rawHtml) => {
  if (!rawHtml) return "";

  try {
     // === Step 1: 转换图片为 Base64 ===
  let htmlWithBase64Images = rawHtml;
    // 注意：我们现在的 img 标签 src 属性可能被 DOMPurify 绕过后变成了 data-safe-src
    // 但在你最新的 useMarkdownRenderer.js 中，它被换回来了。我们假设它是 src
    const imageTagsRegex = /<img src="(safe-file:\/\/[^"]+)"/g;

    // 使用一个异步的 replace 方法
    const replacements = [];
    htmlWithBase64Images.replace(imageTagsRegex, (match, src) => {
        replacements.push({ match, src });
    });

    for (const item of replacements) {
      try {
        const standardFileUrl = item.src.replace("safe-file:", "file:");
        const filePath = fileURLToPath(standardFileUrl);
        const fileBuffer = await fs.promises.readFile(filePath);
        
        const extension = path.extname(filePath).toLowerCase();
        let mimeType = "image/png"; // 默认
        if (extension === ".jpg" || extension === ".jpeg") mimeType = "image/jpeg";
        else if (extension === ".gif") mimeType = "image/gif";
        else if (extension === ".svg") mimeType = "image/svg+xml";

        const base64String = fileBuffer.toString("base64");
        const dataUrl = `data:${mimeType};base64,${base64String}`;
        
        htmlWithBase64Images = htmlWithBase64Images.replace(item.src, dataUrl);
      } catch(e) {
        console.error(`Failed to convert image to Base64: ${item.src}`, e);
      }
    }

    // ✅ 2. 读取我们准备好的 CSS 主题文件内容
    // path.join(__dirname, ...) 确保了路径在任何环境下都正确
    console.log("__dirname",__dirname);
    
    const highlightCss = fs.readFileSync(path.join(__dirname, 'styles', 'tokyo-night-dark.css'), 'utf-8');
    
    // ✅ 3. 定义一些额外的、适配微信的 CSS 规则
    // const extraCss = `
    //   /* 基础适配 */
    //   section, p, span, h1, h2, h3, h4, h5, h6 {
    //     margin: 0;
    //     padding: 0;
    //     line-height: 1.6;
    //   }
    //   /* 标题适配 */
    //   h1 { font-size: 1.5em; font-weight: bold; margin: 0.67em 0; }
    //   h2 { font-size: 1.3em; font-weight: bold; margin: 0.83em 0; }
    //   h3, h4, h5, h6 { font-size: 1.1em; font-weight: bold; margin: 1em 0; }
    //   /* 代码块容器适配 */
    //   pre {
    //     margin: 1em 0 !important;
    //     padding: 1em !important;
    //     border-radius: 6px !important;
    //     white-space: pre-wrap !important;
    //     word-wrap: break-word !important;
    //   }
    // `;

    // ✅ 终极版 extraCss，目标：强制水平滚动
// ✅ 借鉴开源库，定义一个适配微信的“主题”
    const extraCss = `
    /* 标题适配 */
      h1 { font-size: 1.5em; font-weight: bold; margin: 0.67em 0; }
      h2 { font-size: 1.3em; font-weight: bold; margin: 0.83em 0; }
      h3, h4, h5, h6 { font-size: 1.1em; font-weight: bold; margin: 1em 0; }     
      pre {
        margin: 1.2em 8px !important;
        padding: 1em !important;
        border-radius: 6px !important;
        /* 核心滚动样式 */
        white-space: pre !important;
        overflow-x: auto !important;
      }
      code {
        /* 强制 nowrap，配合 pre 的 overflow-x: auto */
        white-space: nowrap !important; 
        font-family: Menlo, Operator Mono, Consolas, Monaco, monospace;
      }
    `;

    // ✅ 4. 使用 juice 将 CSS 内联到 HTML 中 juice(html, options)
    // const inlinedHtml = juice(htmlWithBase64Images, {
    //   extraCss: highlightCss + extraCss, // 将主题和我们的附加规则合并
    //   removeStyleTags: true, // 移除 HTML 中的 <style> 标签
    //   applyStyleTags: true, // 应用 HTML 中的 <style> 标签
    // });
    const inlinedHtml = juice(htmlWithBase64Images, {
      extraCss: highlightCss + extraCss,
      removeStyleTags: true,
    });
    
    // ✅ 5. (可选但推荐) 对标题进行最后的降级处理，以获得最佳兼容性
    let finalHtml = inlinedHtml;
    

    // ✅ 6. (可选) 图片处理 - 从分析文档中借鉴
    // 这个正则会找到所有<img>标签，移除 width/height 属性，并转为 style
    finalHtml = finalHtml.replace(/<img[^>]*>/g, (match) => {
        if (!match.includes('style=')) {
            match = match.replace('>', ' style="">');
        }
        const width = match.match(/width="([^"]*)"/);
        const height = match.match(/height="([^"]*)"/);
        if (width) {
            match = match.replace(width[0], '').replace(/style="/, `style="width: ${width[1]}px;`);
        }
        if (height) {
            match = match.replace(height[0], '').replace(/style="/, `style="height: ${height[1]}px;`);
        }
        return match;
    });

    finalHtml = finalHtml.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/g, (match, preContent) => {
        const processedContent = preContent.replace(/(>[^<]+)|(^[^<]+)/g, (str) => str.replace(/ /g, `&nbsp;`));
        return match.replace(preContent, processedContent);
    });

    console.log("////finalHtml",finalHtml);
    

    return finalHtml;

  } catch (error) {
    console.error("Failed to process HTML for clipboard:", error);
    // 出错时返回原始 HTML，避免程序崩溃
    return rawHtml;
  }
});
