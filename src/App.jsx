import React, { useState, useEffect } from "react";
import Editor from "./Editor.jsx";
import Preview from "./Preview.jsx";
import Outline from "./Outline.jsx";
import WechatExport from "./WechatExport.jsx";
import { useMarkdownRenderer } from './useMarkdownRenderer';
// import 'highlight.js/styles/tokyo-night-dark.css'; 
import './styles.css';

// ✅ 1. 定义主题元数据
const THEMES = {
  'tokyo-night-dark': {
    name: 'Tokyo Night Dark',
    container: { background: '#1a1b26', color: '#a9b1d6' },
    path: '/hljs/tokyo-night-dark.min.css',
  },
  'github-dark': {
    name: 'GitHub Dark',
    container: { background: '#0d1117', color: '#c9d1d9' },
    path: '/hljs/github-dark.min.css',
  },
  'atom-one-dark': { // 修正了 key
    name: 'Atom One Dark',
    container: { background: '#282c34', color: '#abb2bf' }, // 补上了 container
    path: '/hljs/atom-one-dark.min.css',
  },
  'felipec': {
    name: 'felipec',
    container: { background: '#1d3a4a', color: '#dbe1e6' }, // 补上了 container
    path: '/hljs/felipec.min.css',
  },
  'monokai': {
    name: 'monokai',
    container: { background: '#2a2c2d', color: '#f8f8f2' }, // 补上了 container
    path: '/hljs/monokai.min.css',
  },
  'panda-syntax-dark': {
    name: 'panda syntax dark',
    container: { background: '#2a2c32', color: '#e6e6e6' }, // 补上了 container
    path: '/hljs/panda-syntax-dark.min.css',
  },
  'tomorrow-night-blue': {
    name: 'tomorrow night blue',
    container: { background: '#002451', color: '#ffffff' }, // 补上了 container
    path: '/hljs/tomorrow-night-blue.min.css',
  },
};

// ✅ 1. 定义一个默认的主题键，确保它一定存在
const DEFAULT_THEME_KEY = 'tokyo-night-dark';

function App() {
  // ✅ 2. 创建 state 来管理当前主题的 key
  const [themeKey, setThemeKey] = useState(DEFAULT_THEME_KEY); // 默认主题

  // ✅ 3. 使用 useEffect 来动态加载和卸载 CSS 主题
// ===================================================================
  // ✅ 核心修复：使用 <link> 标签来动态加载 public 目录下的 CSS
  // ===================================================================
  useEffect(() => {
    // 1. 创建一个新的 <link> 元素
    const linkElement = document.createElement('link');
    
    // 2. 设置它的属性
    linkElement.rel = 'stylesheet';
    linkElement.id = 'dynamic-theme-stylesheet'; // 给它一个ID，方便管理
    linkElement.href = THEMES[themeKey].path; // e.g., '/hljs/tokyo-night-dark.min.css'

    // 3. 将它添加到 <head> 中，浏览器会自动加载并应用 CSS
    document.head.appendChild(linkElement);

    // 4. 定义清理函数
    // 当 themeKey 改变，React 会先运行这个清理函数，然后再运行新的 effect
    return () => {
      // 找到我们之前添加的 <link> 元素并移除它
      const oldLink = document.getElementById('dynamic-theme-stylesheet');
      if (oldLink) {
        document.head.removeChild(oldLink);
      }
    };
  }, [themeKey]); // 这个 effect 只在 themeKey 改变时运行

  

  // 直接解析 URL 参数
  const query = new URLSearchParams(window.location.search);
  const mode = query.get("mode") || "edit"; // edit | preview
  const [showWechat, setShowWechat] = useState(false); // ✅ 新增：控制是否显示公众号区域

  const [content, setContent] = useState("");
  const [filePath, setFilePath] = useState(null);
  const [status, setStatus] = useState("未保存");
  const [toast, setToast] = useState("");
  const [activeRightTab, setActiveRightTab] = useState("outline"); // outline | wechat


// ✅ 3. (核心修复) 添加防御性回退逻辑
  // a. 首先，获取当前选中的主题对象
  const currentTheme = THEMES[themeKey];
  // b. 如果由于某种原因（比如 state 更新延迟）找不到主题，就使用默认主题
  const safeTheme = currentTheme || THEMES[DEFAULT_THEME_KEY];
  
  const { rawHtml, sanitizedHtml } = useMarkdownRenderer(
    content, 
    filePath
  );



  const [attachmentFolder, setAttachmentFolder] = useState(null); // ✅ 新增 state

  // ✅ 新增：应用启动时，获取已保存的附件文件夹路径
  useEffect(() => {
    window.electronAPI.getAttachmentFolder().then(folder => {
      if (folder) setAttachmentFolder(folder);
    });
  }, []);

  // ✅ 新增：处理设置附件文件夹的点击事件
  const handleSetAttachmentFolder = async () => {
    const folder = await window.electronAPI.setAttachmentFolder();
    if (folder) {
      setAttachmentFolder(folder);

      // ✅ 2. 在设置成功后，立即更新触发器
      // 每次都让它的值变得和上次不一样，就能保证触发刷新
      setRefreshTrigger(prev => prev + 1);

      showToast(`🖼️ 附件文件夹已设置为: ${folder}`);
    }
  };

  const showToast = (message, duration = 3000) => {
    setToast(message);
    setTimeout(() => setToast(""), duration);
  };

  // 自动保存（停止输入 2 秒后保存）
  useEffect(() => {
    if (!filePath) return; // 没路径就不保存
    setStatus("未保存");
    const timer = setTimeout(async () => {
      await window.electronAPI.saveFile(content, filePath);
      setStatus("已自动保存");
      showToast("💾 自动保存");
    }, 2000);
    return () => clearTimeout(timer);
  }, [content, filePath]);

  // 手动保存
  const handleSave = async () => {
    if (!filePath) return; // 没路径就不保存
    await window.electronAPI.saveFile(content, filePath);
    window.electronAPI.setLastFile(filePath);
    setStatus("已保存");
    showToast("💾 文件已保存");
  };


  // 启动时加载上次的文件
  useEffect(() => {
    window.electronAPI.onLoadLastFile(async (fp) => {
      if (fp) {
        setFilePath(fp);
        const res = await window.electronAPI.readFile(fp); // 👈 用 readFile
        if (res) {
          setContent(res.content);
          setStatus("已加载");
        }
      }
    });
  }, []);

  const handleOpen = async () => {
    const result = await window.electronAPI.openFile();
    if (result) {
      setFilePath(result.path);
      setContent(result.content);
      window.electronAPI.setLastFile(result.path);
      setStatus("已打开");
      showToast("📂 文件已打开");
    }
  };



  // 字数统计
  const wordCount = content ? content.replace(/\s+/g, "").length : 0;

  const handleNewFile = async () => {
    const result = await window.electronAPI.newFile();
    if (result) {
      setFilePath(result.path);
      setContent(result.content);
      window.electronAPI.setLastFile(result.path);
      setStatus("新建");
      showToast("🆕 新建文件");
    }
  };

  const [defaultDir, setDefaultDir] = useState("");

  // 启动时获取默认文件夹
  useEffect(() => {
    window.electronAPI.getDefaultDir().then(setDefaultDir);
  }, []);

  const handleSetDefaultDir = async () => {
    const dir = await window.electronAPI.setDefaultDir();
    if (dir) {
      setDefaultDir(dir);
      showToast(`📂 默认文件夹已设置为: ${dir}`);
    }
  };

  const handleOpenDefaultDir = async () => {
    const dir = await window.electronAPI.openDefaultDir();
    if (dir) {
      showToast(`📂 已在系统中打开: ${dir}`);
    }
  };


  const handlePreview = () => {
    window.electronAPI.openPreview();
  };

  if (mode === "preview") {
    return (
      <div className="app">
        <div className="main preview-mode">
          {/* ✅ 同样给新窗口的预览传递 filePath */}
          <Preview value={content} filePath={filePath} />
          <Outline value={content} />
        </div>
      </div>
    );
  }


  // ✅ 新增：处理公众号复制的函数
  const handleCopyToWechat = async () => {
    if (!content.trim()) {
      alert("没有内容可复制");
      return;
    }

    try {
      // 1. 确认我们有待处理的 rawHtml
      if (!rawHtml) {
        alert("内容尚未渲染完成，请稍候再试。");
        return;
      }

      console.log("Step 1: Sending raw HTML to main process for juicing...");
      // 2. ✅ 关键修复：只传递 rawHtml 字符串，而不是一个对象
      const finalHtml = await window.electronAPI.convertHtmlForClipboard({
        html: rawHtml,
        theme: themeKey, // 传递主题的 key
      });

      // 3. 检查后端是否返回了有效的 HTML
      if (!finalHtml || finalHtml.trim() === '') {
        console.error("Main process returned empty HTML.");
        alert("复制失败：后端处理返回为空。");
        return;
      }

      // 4. 使用 Clipboard API 写入剪贴板
      console.log("Step 2: Writing juiced HTML to clipboard...");
      const blobHtml = new Blob([finalHtml], { type: "text/html" });
      const blobText = new Blob([content], { type: "text/plain" }); // 纯文本版本
      const clipboardItem = new ClipboardItem({
        "text/html": blobHtml,
        "text/plain": blobText,
      });

      await navigator.clipboard.write([clipboardItem]);

      console.log("Successfully copied to clipboard for WeChat!");
      alert("已成功复制到剪贴板！");

    } catch (error) {
      console.error("Failed to copy for WeChat:", error);
      // alert 的内容如果是 error 对象，也会显示 [object Object]
      // 所以我们只显示 error.message
      alert(`复制失败: ${error.message}`);
    }
  };


  // ✅ 1. 在组件外部或内部定义你的代码块主题
  const codeBlockThemes = {
    light: {
      backgroundColor: '#f6f8fa',
      padding: '16px',
      margin: '1em 0',
      border: '1px solid #eaeef2',
      borderRadius: '6px',
      overflow: 'auto',
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: '14px',
      lineHeight: '1.6',
      color: '#24292e', // 深灰色文字
    },
    dark: {
      backgroundColor: '#0d1117', // 暗色背景
      padding: '16px',
      margin: '1em 0',
      border: '1px solid #30363d', // 暗色边框
      borderRadius: '6px',
      overflow: 'auto',
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: '14px',
      lineHeight: '1.6',
      color: '#eaeef2', // 亮灰色文字
    }
  };


  // 默认编辑模式
  return (
    <div className="app light">
      <div className="toolbar">
        <button onClick={handleNewFile}>🆕 新建</button>
        <button onClick={handleOpen}>📂 打开</button>
        <button onClick={handleSave}>💾 保存</button>
        <button onClick={handlePreview}>👁️ 预览</button>
        {/* ✅ 6. 创建主题选择下拉菜单 */}
        <select value={themeKey} onChange={(e) => setThemeKey(e.target.value)}>
          {Object.entries(THEMES).map(([key, theme]) => (
            <option key={key} value={key}>{theme.name}</option>
          ))}
        </select>
        <button
    className={showWechat ? "active" : ""}
    onClick={() => setShowWechat(!showWechat)}
  >
    📱 公众号
  </button>
        {showWechat && (
          <button onClick={handleCopyToWechat}>复制到公众号</button>
        )}
      </div>


      <div className={`main ${showWechat ? "wechat-visible" : ""}`}>
        <Editor value={content} onChange={setContent} />
        {/* ✅ 将 sanitizedHtml 传递给子组件用于显示 */}
        {/* 注意：我们这里直接传递 HTML，而不是让子组件自己去渲染 */}
        <div className="preview">
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        </div>
        {showWechat && (
          <div className="wechat-export">
            <div>
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            </div>
          </div>
        )}
      </div>
      {/* 底部状态栏 */}
      <div className="status-bar">
        <span>{filePath || "未打开文件"}</span>
        <span>{status}</span>
        <span>{content.replace(/\s+/g, "").length} 字</span>
        <span
          title="点击打开默认文件夹"
          style={{ cursor: "pointer", textDecoration: "underline" }}
          onClick={handleOpenDefaultDir}
        >
          📂 {defaultDir}
        </span>
        {/* ✅ 新增：在状态栏显示和设置附件文件夹 */}
        <span
          title="点击设置 Obsidian 附件文件夹"
          style={{ cursor: "pointer", textDecoration: "underline" }}
          onClick={handleSetAttachmentFolder}
        >
          🖼️ {attachmentFolder || "未设置附件文件夹"}
        </span>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );






}

export default App;
