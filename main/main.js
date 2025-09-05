// main.js - 完整修复版

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  shell,
  net,clipboard
} = require("electron");
const path = require("path");
const fs = require("fs");
const Store = require("electron-store").default;
const store = new Store();
const { pathToFileURL, fileURLToPath } = require("url");
const juice = require("juice");
const { log } = require("console");
const os = require('os');


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
      const fileArg = argv.find((arg) => arg.endsWith(".md"));
      if (fileArg && fs.existsSync(fileArg)) {
        mainWindow.webContents.send("load-last-file", fileArg);
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

// 2) 把它注册为 ipc handler（preload 已经调用 ipcRenderer.invoke("get-attachment-folder")）
// ipcMain.handle('get-attachment-folder', async () => {
//   return getAttachmentFolder();
// });


ipcMain.handle('save-image', async (event, { fileName, buffer, originalName }) => {
  try {
    // 确保图片目录存在
    const imageDir = await getDefaultImageDir();
    console.log("-imageDir-",imageDir);
    
    const fullPath = path.join(imageDir, fileName);
     console.log("-fullPath-",fullPath);
    
    // 将数组转换回Buffer并保存文件
    const fileBuffer = Buffer.from(buffer);
await fs.promises.writeFile(fullPath, fileBuffer);
    
    // 返回相对路径（用于Markdown）
    const relativePath = `${fileName}`;
    console.log("-relativePath-",relativePath);
    
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
    console.log("imageDir",imageDir);
    
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
  mainWindow.loadURL("http://127.0.0.1:5173");

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

      console.log(
        `[safe-file] Forwarding to net.fetch with URL: ${standardFileUrl}`
      );

      // Let Electron's built-in, powerful fetch handler do the work.
      // It knows how to correctly handle valid file:// URLs.
      return net.fetch(standardFileUrl);
    } catch (err) {
      console.error(
        `[safe-file] Failed to handle request for ${request.url}:`,
        err
      );
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
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
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

ipcMain.handle("resolve-image-path", (event, { fileDir, src }) => {
  let finalPath = null;

  // 1. Try relative path
  if (fileDir) {
    const relativePath = path.resolve(fileDir, src);
    if (fs.existsSync(relativePath)) {
      finalPath = relativePath;
      console.log("resolve-image-path finalPath",finalPath);
      
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
  store.set("lastFile", filePath)
);

ipcMain.handle(
  "convert-file-src",
  (event, filePath) => `safe-file://${path.normalize(filePath)}`
);

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
  previewWindow.on("closed", () => {
    previewWindow = null;
  });
  previewWindow.loadURL("http://127.0.0.1:5173?mode=preview");
});

// ===================================================================
// ✅ (终极版) 为公众号复制功能转换 HTML
// ===================================================================
ipcMain.handle("convert-html-for-clipboard", async (event, payload) => {
  const { html: rawHtml, codeThemeKey,css, themeCssValues } = payload;
  // 2. 预先检查输入
  if (typeof rawHtml !== "string") {
    console.error(
      "convertHtmlForClipboard received non-string html content:",
      rawHtml
    );
    return ""; // 如果 html 部分不是字符串，返回空
  }
  console.error(
      "convertHtmlForClipboard rawHtml:",
      rawHtml
    );
  if (!rawHtml) return "";
  if (!themeCssValues) {
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
        if (extension === ".jpg" || extension === ".jpeg")
          mimeType = "image/jpeg";
        else if (extension === ".gif") mimeType = "image/gif";
        else if (extension === ".svg") mimeType = "image/svg+xml";

        const base64String = fileBuffer.toString("base64");
        const dataUrl = `data:${mimeType};base64,${base64String}`;

        htmlWithBase64Images = htmlWithBase64Images.replace(item.src, dataUrl);
      } catch (e) {
        console.error(`Failed to convert image to Base64: ${item.src}`, e);
      }
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
    
    const inlinedHtml = juice(
     htmlWithBase64Images,
      {
        extraCss:  highlightCss + extraCss, 
      }
    );
    
    // 可选：保存CSS到文件或进行其他处理
    // console.log(`复制了主题 ${theme} 的样式内容`);


    // const inlinedHtml = juice(
    //   // 必须用 .markdown-body 包裹，让 CSS 规则能正确匹配
    //   `<section class="markdown-body">${htmlWithBase64Images}</section>`,
    //   {
    //     extraCss: markdownThemeCss + highlightCss + extraCss, // ✅ 合并了三种 CSS
    //   }
    // );

    console.log("extraCSS:",  highlightCss + extraCss);

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

