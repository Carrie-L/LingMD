import React, { useState, useEffect, useRef } from "react";
import Editor from "./Editor.jsx";
import Preview from "./Preview.jsx";
import Outline from "./Outline.jsx";
import WechatExport from "./WechatExport.jsx";
import { useMarkdownRenderer } from './useMarkdownRenderer';
// import 'highlight.js/styles/tokyo-night-dark.css'; 
import './styles.css';





// ======== 主题 ==============


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

const extractPreviewStyles = (mdTheme) => {
  console.log("333mdTheme", mdTheme);

  const previewElement = document.querySelector('.wechat-export');
  console.log("previewElement", previewElement);
  if (!previewElement) return '';

  // 获取当前主题的CSS变量
  const computedStyle = getComputedStyle(previewElement);
  const cssVariables = {};

  // 提取所有--md-开头的CSS变量
  for (let i = 0; i < document.styleSheets.length; i++) {
    try {
      const styleSheet = document.styleSheets[i];
      for (let j = 0; j < styleSheet.cssRules.length; j++) {
        const rule = styleSheet.cssRules[j];
        if (rule.selectorText && rule.selectorText.includes(`data-mdtheme="${mdTheme}"`)) {
          const style = rule.style;
          for (let k = 0; k < style.length; k++) {
            const property = style[k];
            if (property.startsWith('--md-')) {
              cssVariables[property] = style.getPropertyValue(property);
            }
          }
        }
      }
    } catch (e) {
      // 跨域样式表会抛出异常，忽略
      console.log("cssVariables异常", e);

    }
  }

  console.log("cssVariables", mdTheme, cssVariables);


  // 生成完整的CSS字符串，包含所有必要的样式
  return generateCompleteCSS(cssVariables, mdTheme);
};

// 2. 生成完整CSS的函数
const generateCompleteCSS = (variables, theme) => {
  // 基础样式
  const baseStyles = `
/* Markdown Preview Styles - Theme: ${theme} */
.markdown-content {
  color: ${variables['--md-fg'] || '#212121'};
  background: ${variables['--md-bg'] || '#fff'};
  max-width: 800px;
  margin: 0 0;
  padding: 0;
  line-height: 2;
  font-size: 15px;
  font-weight: 350;
  word-wrap: break-word !important;
  font-family: PingFang SC,system-ui,-apple-system,BlinkMacSystemFont,Helvetica Neue,Hiragino Sans GB,Microsoft YaHei UI,Microsoft YaHei,Arial,sans-serif !important;
}

.markdown-content p {
  margin: 1.5em 0;
}

/* 标题样式 */
.markdown-content h1,
.markdown-content h2,
.markdown-content h3{
  line-height: 1.7;
  margin: 2em 0 0 0;
  font-weight: 700;
}
.markdown-content h4,
.markdown-content h5,
.markdown-content h6 {
  line-height: 1.5;
  margin: 2em 0 0 0;
  font-weight: 600;
}

.markdown-body h1 { font-size: 28px; }
.markdown-body h2 { font-size: 25px; }
.markdown-body h3 { font-size: 20px; }
.markdown-body h4 { font-size: 18px; }
.markdown-body h5 { font-size: 16px; }
.markdown-body h6 { font-size: 16px;  }



/* 代码块样式 */
.markdown-content pre {
  border-radius: 6px;
  padding: 0;
  overflow: auto;
  margin: 1em 0;
}

.markdown-content :not(pre) > code {
    background-color: ${variables['--md-code-bg'] || '#f7f9faff'};
    color: ${variables['--md-code-fg'] || '#e7b0d0'};
    border: 1px solid ${variables['--md-border'] || '#e5e7eb'};
     padding: .1em .4em;
    border-radius: 4px; 
    font-size: 13px;
    margin: 0 0.1em;
  }

/* 引用样式 */
.markdown-content blockquote {
  background-color: ${variables['--md-quote-bg'] || '#f6f8fa'};
  border-left: 4px solid ${variables['--md-quote-bar'] || '#dfe2e5'};
  margin: 1em 0;
  padding: .6em 1em;
  color: ${variables['--md-fg'] || '#333'};
}

/* 列表样式 */
.markdown-content ul,
.markdown-content ol {
  padding-left: 1.4em;
  margin: .8em 0;
}

.markdown-content li {
  margin: .8em .3em; 
}

/* 表格样式 */
.markdown-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.markdown-content th,
.markdown-content td {
  border: 1px solid ${variables['--md-border'] || '#d0d7de'};
  padding: 8px 12px;
  text-align: left;
}

.markdown-content th {
  background-color: ${variables['--md-quote-bg'] || '#f6f8fa'};
  font-weight: 600;
}

.markdown-content tr:nth-child(even) {
  background-color: ${variables['--md-table-stripe'] || '#f6f8fa'};
}

/* 链接样式 */
.markdown-content a {
  color: ${variables['--md-accent'] || '#48eabf'};
  text-decoration: none;
}

.markdown-content a:hover {
  text-decoration: underline;
}

.markdown-content hr {
  border: none;
  border-top: 1px solid ${variables['--md-border'] || '#d0d7de'};
  margin: 2em 0;
}

/* 图片样式 */
.markdown-content img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}
`;

  // 获取当前主题特定的标题样式
  const themeSpecificStyles = getThemeSpecificStyles(theme, variables);

  return baseStyles + themeSpecificStyles;
};

// 3. 获取主题特定样式
const getThemeSpecificStyles = (theme, variables) => {
  const themeStyles = {
    magazine: `
/* Magazine Style Headers */
.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  text-align: center;
  font-weight: 700;
  letter-spacing: 0.5px;
  border-bottom: 2px solid ${variables['--md-accent'] || '#000'};
  padding-bottom: 8px;
}`,

    neonDreams: `
/* Neon Dreams Headers */
.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  background: linear-gradient(135deg, ${variables['--md-accent'] || '#ec4899'}, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 800;
  border-left: 4px solid ${variables['--md-accent'] || '#ec4899'};
  padding-left: 16px;
}`,

    sakuraBloom: `
/* Sakura Bloom Headers */
.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  background: ${variables['--md-accent'] || '#f472b6'};
  color: white;
  border-radius: 12px;
  padding: 8px 16px;
  text-align: center;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(244, 114, 182, 0.3);
}`,

    executive: `
/* Executive Headers */
.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  border-left: 6px solid ${variables['--md-accent'] || '#3b82f6'};
  padding-left: 20px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}`,

    mintBreeze: `
/* Mint Breeze Headers */
.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  color: ${variables['--md-accent'] || '#10b981'};
  font-weight: 600;
  text-align: center;
  position: relative;
  padding: 20px 0 10px 0;
}

.markdown-content h1::before,
.markdown-content h2::before,
.markdown-content h3::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: 2px;
  background: ${variables['--md-accent'] || '#10b981'};
}`,

    digitalWave: `
/* Digital Wave Headers */
.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  background: linear-gradient(135deg, #0ea5e9, #3b82f6);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  position: relative;
  overflow: hidden;
}`,

    sunsetGlow: `
/* Sunset Glow Headers */
.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  color: ${variables['--md-accent'] || '#f97316'};
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: ${variables['--md-accent'] || '#f97316'};
  text-decoration-thickness: 3px;
  text-underline-offset: 6px;
  text-align: center;
}`,

    lavenderMist: `
/* Lavender Mist Headers */
.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  border: 2px solid ${variables['--md-accent'] || '#8b5cf6'};
  border-radius: 16px;
  padding: 12px 20px;
  text-align: center;
  background: rgba(139, 92, 246, 0.1);
  color: ${variables['--md-accent'] || '#8b5cf6'};
  font-weight: 600;
}`,

    forestWhisper: `
/* Forest Whisper Headers */
.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  border-left: 8px solid ${variables['--md-accent'] || '#059669'};
  border-top: 2px solid ${variables['--md-accent'] || '#059669'};
  border-bottom: 2px solid ${variables['--md-accent'] || '#059669'};
  padding: 10px 0 10px 20px;
  background: linear-gradient(90deg, rgba(5, 150, 105, 0.1), transparent);
  font-weight: 700;
  color: ${variables['--md-accent'] || '#059669'};
}`,

    roseGold: `
/* Rose Gold Headers */
.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  background: linear-gradient(45deg, #e11d48, #ec4899, #f59e0b);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 800;
  text-align: center;
  position: relative;
  padding-bottom: 12px;
}

.markdown-content h1::after,
.markdown-content h2::after,
.markdown-content h3::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 50px;
  height: 3px;
  background: linear-gradient(45deg, #e11d48, #ec4899, #f59e0b);
  border-radius: 2px;
}`
  };

  return themeStyles[theme] || '';
};

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
  const editorRef = useRef(null);
  const [editorUploading, setEditorUploading] = useState(false);
  const [filePath, setFilePath] = useState(null);
  const [status, setStatus] = useState("未保存");
  const [toast, setToast] = useState("");
  const [activeRightTab, setActiveRightTab] = useState("outline"); // outline | wechat


  // ✅ 3. (核心修复) 添加防御性回退逻辑
  // a. 首先，获取当前选中的主题对象
  const currentTheme = THEMES[themeKey];
  // b. 如果由于某种原因（比如 state 更新延迟）找不到主题，就使用默认主题
  // const safeTheme = currentTheme || THEMES[DEFAULT_THEME_KEY];

  const { rawHtml, sanitizedHtml } = useMarkdownRenderer(
    content,
    filePath
  );



  const [attachmentFolder, setAttachmentFolder] = useState(null); // ✅ 新增 state

  // ✅ 新增：应用启动时，获取已保存的附件文件夹路径
  useEffect(() => {
    (async () => {
      try {
        const folder = await window.electronAPI.getAttachmentFolder();
        console.log("attachmentFolder", folder);

        if (folder) {
          setAttachmentFolder(folder);
          localStorage.setItem('attachmentFolder', folder);
        }
      } catch (err) {
        console.error('读取 attachmentFolder 失败', err);
        // 尝试从 localStorage 读（降级）
        const cached = localStorage.getItem('attachmentFolder');
        if (cached) setAttachmentFolder(cached);
      }
    })();
  }, []);

  // ✅ 新增：处理设置附件文件夹的点击事件
  const handleSetAttachmentFolder = async () => {
    try {
      const res = await window.electronAPI.chooseAttachmentFolder();
      if (!res) return;
      if (res.canceled) return; // 用户取消选择
      if (res.error) {
        showToast('设置失败：' + res.error);
        return;
      }
      // 成功：res.folder 为选择路径
      setAttachmentFolder(res.folder);
      localStorage.setItem('attachmentFolder', res.folder);
      showToast(`🖼️ 附件文件夹已设置为: ${res.folder}`);
    } catch (err) {
      console.error('chooseAttachmentFolder 调用失败：', err);
      showToast('发生错误：' + (err && err.message));
    }
  };


  const showToast = (message, duration = 3000) => {
    setToast(message);
    setTimeout(() => setToast(""), duration);
  };


  // 自动保存
  useEffect(() => {
  // 仅在 appReady 后且有 filePath 才允许自动保存
  // if (!appReady) return;
  if (!filePath) return;

  setStatus('未保存');

  const timer = setTimeout(async () => {
    try {
      await window.electronAPI.saveFile(content, filePath);
      setStatus('已自动保存');
    } catch (err) {
      console.error('auto save failed', err);
      setStatus('自动保存失败');
    }
  }, 3000); // 停止输入 3s 后自动保存

  return () => clearTimeout(timer);
}, [content, filePath]);

  // 手动保存
  const handleSave = async () => {
    if (!filePath) return; // 没路径就不保存
    await window.electronAPI.saveFile(content, filePath);
    window.electronAPI.setLastFile(filePath);
    setStatus("已保存");
    showToast("💾 文件已保存在: " + filePath);
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
    }else{
      showToast("❌ 📂文件未打开");
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
    (async () => {
      const folder = await window.electronAPI.getDefaultDir();
      console.log("defaultDir folder", folder);
      if (folder) {
        setDefaultDir(folder);
      }
    })();
    // window.electronAPI.getDefaultDir().then(setDefaultDir);
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


      console.log("222mdTheme", mdTheme);

      // 提取当前主题的CSS样式
      const extractedCSS = extractPreviewStyles(mdTheme);
      console.log("extractedCSS", extractedCSS);
      // 获取渲染后的HTML内容
      const previewElement = document.querySelector('.wechat-export');
      if (!previewElement) return;
      console.log("previewElement", previewElement);


      // 克隆预览元素并添加类名
      const clonedElement = previewElement.cloneNode(true);
      clonedElement.className = 'markdown-content';

      // 创建完整的HTML结构
      const styledHTML = `
        <section class="markdown-content">
          <style>
            ${extractedCSS}
          </style>
          ${clonedElement.innerHTML}
        </section>
      `;

      console.log("xxxxxstyledHTML", styledHTML);

      // 通过Electron IPC发送到主进程

      const finalHtml = await window.electronAPI.convertHtmlForClipboard({
        html: styledHTML,
        codeThemeKey: themeKey, // 代码高亮主题的 key
        css: extractedCSS,
        themeCssValues: mdTheme, // 文章主题的颜色值
      });


      console.log("xxxxxfinalHtml", finalHtml);


      console.log("Step 1: Sending raw HTML and theme CSS values to main process...");

      // 2. ✅ 将读取到的样式值对象 themeCssValues 传递给主进程
      // const finalHtml = await window.electronAPI.convertHtmlForClipboard({
      //   html: rawHtml,
      //   codeThemeKey: themeKey, // 代码高亮主题的 key
      //   themeCssValues: themeCssValues, // 文章主题的颜色值
      // });

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
        <label className="toolbar-button" onClick={handleNewFile}>
          🐙 新建</label>
        <label onClick={handleOpen} className="toolbar-button" >📂 打开</label>
        <label onClick={handleSave} className="toolbar-button">🍁 保存</label>
        <label onClick={handlePreview} className="toolbar-button">🐳 预览</label>

        <label className="toolbar-button">
          🌼 插入图片
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => editorRef.current && editorRef.current.handleFileSelect(e)}
            style={{ display: 'none' }}
          />
        </label>
        {editorUploading && <span className="uploading">上传中...</span>}

        {/* ✅ 6. 创建主题选择下拉菜单 */}
        <select value={mdTheme} onChange={(e) => setMdTheme(e.target.value)} title="Markdown 主题" >
          {Object.entries(MD_THEMES).map(([key, t]) => (
            <option key={key} value={key}>{t.name}</option>
          ))}
        </select>
        <select value={themeKey} onChange={(e) => setThemeKey(e.target.value)} title="Code 主题">
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
          <label className="toolbar-button" onClick={handleCopyToWechat}>复制到公众号</label>
        )}
      </div>

      <div className={`main ${showWechat ? "wechat-visible" : ""}`}>
        {/* 编辑区域 */}
        {/* <Editor value={content} onChange={setContent} /> */}
        <Editor
          ref={editorRef}
          value={content}
          onChange={setContent}
          onUploadingChange={(isUploading) => setEditorUploading(isUploading)}
        />

        {/* 预览区 */}
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
          📂 默认文档目录： {defaultDir}
        </span>
        {/* ✅ 新增：在状态栏显示和设置附件文件夹 */}
        <span
          title="点击设置 Obsidian 附件文件夹"
          style={{ cursor: "pointer", textDecoration: "underline" }}
          onClick={handleSetAttachmentFolder}
        >
          ⛳️ 设置默认图片目录： {attachmentFolder || "未设置图片目录，请设置。"}
        </span>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );






}

export default App;
