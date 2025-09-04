import React, { useState, useEffect, useRef  } from "react";
import Editor from "./Editor.jsx";
import Preview from "./Preview.jsx";
import Outline from "./Outline.jsx";
import WechatExport from "./WechatExport.jsx";
import { useMarkdownRenderer } from './useMarkdownRenderer';
// import 'highlight.js/styles/tokyo-night-dark.css'; 
import './styles.css';


// ✅ 1. 新增一个强大的 CSS 提取器工具函数
// 将这个函数放在 App 组件外部
function extractCssForWechat(containerElement) {
  if (!containerElement) return '';

  const selectors = [
    // 内容主题
    '.markdown-body', '.markdown-body h1', '.markdown-body h2', '.markdown-body h3',
    '.markdown-body h4','.markdown-body h5','.markdown-body h6',
    '.markdown-body p', '.markdown-body a', '.markdown-body blockquote', 
    '.markdown-body :not(pre) > code', '.markdown-body ul', '.markdown-body li',
    '.markdown-body hr',
    
    // 代码高亮主题
    '.hljs', '.hljs-keyword', '.hljs-string', '.hljs-comment', '.hljs-number',
    '.hljs-built_in', '.hljs-literal', '.hljs-params', '.hljs-title',
    // ... 你可以根据需要添加更多 .hljs-xxx 选择器
  ];

  const tempDiv = document.createElement('section');
  document.body.appendChild(tempDiv);
  tempDiv.style.display = 'none';

  const generatedCssRules = new Set();

  selectors.forEach(selector => {
    // 尝试在容器内查找元素
    const element = containerElement.querySelector(selector);
    
    // 如果找不到，就在临时 div 里创建一个，以便获取样式
    const targetElement = element || document.createElement(selector.split(' ').pop().replace(/\./g, ''));
    if (!element) tempDiv.appendChild(targetElement);

    const style = window.getComputedStyle(targetElement);
    const properties = [
      'color', 'background-color', 'font-weight', 'font-style', 'font-size', 'line-height',
      'border-left', 'padding', 'margin', 'display', 'border-radius', 'font-family',
    ];

    let rule = `${selector} { `;
    properties.forEach(prop => {
      const value = style.getPropertyValue(prop);
      if (value) {
        rule += `${prop}: ${value}; `;
      }
    });
    rule += `}`;
    generatedCssRules.add(rule);
  });

  document.body.removeChild(tempDiv);
  
  // 添加强制滚动条的样式
  const finalCss = Array.from(generatedCssRules).join('\n') 
    + `\npre { white-space: pre !important; overflow-x: auto !important; }`
    + `\nli p { display: inline !important; margin: 0 !important; }`;
    
  return finalCss;
}

// Markdown 主题清单
const MD_THEMES = {
  light: { name: "Light" },
  dark: { name: "Dark" },
  sepia: { name: "Sepia" },
  paper: { name: "Paper" },
  midnight: { name: "Midnight" },
  auroraPurple: { name: "Aurora Purple" },   
  mintyFresh: { name: "Minty Fresh" },       
  lazySloth: { name: "Lazy Sloth" },         
  oceanBreeze: { name: "Ocean Breeze" },     
  candyDream: { name: "Candy Dream" },       
  sunsetGlow: { name: "Sunset Glow" },       
  galaxyNight: { name: "Galaxy Night" },     

  magazine: { name: "Magazine Style" },
  neonDreams: { name: "Neon Dreams" },
  sakuraBloom: { name: "Sakura Bloom" },
  executive: { name: "Executive Suite" },
  mintBreeze: { name: "Mint Breeze" },
  digitalWave: { name: "Digital Wave" },
  sunsetGlow: { name: "Sunset Glow" },
  lavenderMist: { name: "Lavender Mist" },
  forestWhisper: { name: "Forest Whisper" },
  roseGold: { name: "Rose Gold Elegance" },
};


const DEFAULT_MD_THEME = "light";

// ✅ 1. 定义代码主题元数据
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
  // 主题状态（Markdown 主题）
  const [mdTheme, setMdTheme] = useState(
    localStorage.getItem("mdTheme") || DEFAULT_MD_THEME
  );
  const [themeKey, setThemeKey] = useState(DEFAULT_THEME_KEY); // 默认CODE主题

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

// 第一个 useEffect：负责持久化存储
  useEffect(() => {
    localStorage.setItem("mdTheme", mdTheme);
  }, [mdTheme]);

  // 第二个 useEffect：负责读取样式
  // 1. 创建一个 ref 来引用我们的主容器 div
  const appRef = useRef(null);
  useEffect(() => {
    if (appRef.current) {
      const styles = getComputedStyle(appRef.current);
      console.log(`主题 '${mdTheme}' 的styles是: ${styles}`);
      console.dir(styles);
      const backgroundColor = styles.getPropertyValue('--md-bg').trim();
      console.log(`主题 '${mdTheme}' 的背景色是: ${backgroundColor}`);
    }
  }, [mdTheme]);



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

      // 1. ✅ 核心增强：读取当前主题下的所有CSS变量值
      const computedStyles = getComputedStyle(appRef.current);
      const themeCssValues = {
        bg: computedStyles.getPropertyValue('--md-bg').trim(),
        fg: computedStyles.getPropertyValue('--md-fg').trim(),
        muted: computedStyles.getPropertyValue('--md-muted').trim(),
        accent: computedStyles.getPropertyValue('--md-accent').trim(),
        border: computedStyles.getPropertyValue('--md-border').trim(),
        codeBg: computedStyles.getPropertyValue('--md-code-bg').trim(),
        codeFg: computedStyles.getPropertyValue('--md-code-fg').trim(),
        quoteBg: computedStyles.getPropertyValue('--md-quote-bg').trim(),
        quoteBar: computedStyles.getPropertyValue('--md-quote-bar').trim(),
        tableStripe: computedStyles.getPropertyValue('--md-table-stripe').trim(),
      };

      //  const computedCss = extractCssForWechat(wechatPreviewRef.current);

      // console.log("Sending HTML and computed CSS to main process...");
      // const finalHtml = await window.electronAPI.convertHtmlForClipboard({
      //   html: rawHtml,
      //   css: computedCss, // ✅ 发送动态生成的 CSS
      // });

      console.log("Step 1: Sending raw HTML and theme CSS values to main process...");
      
      // 2. ✅ 将读取到的样式值对象 themeCssValues 传递给主进程
      const finalHtml = await window.electronAPI.convertHtmlForClipboard({
        html: rawHtml,
        codeThemeKey: themeKey, // 代码高亮主题的 key
        themeCssValues: themeCssValues, // 文章主题的颜色值
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
      showToast("已成功复制到剪贴板！");

    } catch (error) {
      console.error("Failed to copy for WeChat:", error);
      // alert 的内容如果是 error 对象，也会显示 [object Object]
      // 所以我们只显示 error.message
      alert(`复制失败: ${error.message}`);
    }
  };



  // 默认编辑模式
  return (
    <div className="app" data-mdtheme={mdTheme} ref={appRef}>
      <div className="toolbar">
        <button onClick={handleNewFile}>🐙 新建</button>
        <button onClick={handleOpen}>📂 打开</button>
        <button onClick={handleSave}>🍁 保存</button>
        <button onClick={handlePreview}>🐳 预览</button>

        {/* ✅ 6. 创建主题选择下拉菜单 */}
        <select value={mdTheme} onChange={(e) => setMdTheme(e.target.value)} title="Markdown 主题">
          {Object.entries(MD_THEMES).map(([key, t]) => (
            <option key={key} value={key}>{t.name}</option>
          ))}
        </select>
        <select value={themeKey} onChange={(e) => setThemeKey(e.target.value)}>
          {Object.entries(THEMES).map(([key, theme]) => (
            <option key={key} value={key}>{theme.name}</option>
          ))}
        </select>

        <button
          className={showWechat ? "active" : ""}
          onClick={() => setShowWechat(!showWechat)}
        >
          🌱 公众号
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
