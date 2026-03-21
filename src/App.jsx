import React, { useState, useEffect, useRef } from "react";
import MarkdownIt from 'markdown-it';
import mdKatex from 'markdown-it-katex';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import Editor from "./Editor.jsx";
import Preview from "./Preview.jsx";
import Outline from "./Outline.jsx";
import WechatExport from "./WechatExport.jsx";
import ThemeEditor from "./ThemeEditor.jsx";
import { useMarkdownRenderer, renderMarkdownChapterHtml } from './useMarkdownRenderer';
import { PreviewWithMermaid } from './PreviewWithMermaid';
import './styles.css';
import 'katex/dist/katex.min.css';



// 这段代码会替换掉你组件内的初始化 useEffect
const mermaidInitialized = new Promise(resolve => {
  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'Arial, sans-serif',
      // ...保留你所有的详细配置...
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true,
        curve: 'basis',
        diagramPadding: 20,
        wrappingWidth: 200,
        defaultRenderer: 'dagre'
      }
    });
    console.log('✅ Mermaid 已在应用加载时全局初始化');
    resolve(); // 初始化成功，Promise 完成
  } catch (e) {
    console.error('❌ Mermaid 全局初始化失败:', e);
    resolve(); // 即使失败也 resolve，以防阻塞后续渲染
  }
});

// ======== 主题 ==============
// Markdown 主题清单
const MD_THEMES = {
  light: { name: "Studio Light" },
  dark: { name: "Carbon Dark" },
  sepia: { name: "Warm Sepia" },
  paper: { name: "Paper White" },
  midnight: { name: "Midnight Ink" },
  natsumeNotebook: { name: "Natsume Notebook" },
  campfireMidnight: { name: "Campfire Midnight" },
  duskCamp: { name: "Switchboard Blush" },
  auroraPurple: { name: "Aurora Violet" },
  mintyFresh: { name: "Morning Camp Radio" },
  lazySloth: { name: "Fog Sage" },
  oceanBreeze: { name: "Ocean Breeze" },
  candyDream: { name: "Candy Pastel" },
  sunsetGlow: { name: "Sunset Amber" },
  galaxyNight: { name: "Galaxy Night" },

  magazine: { name: "Editorial Mono" },
  neonDreams: { name: "Neon Pulse" },
  sakuraBloom: { name: "Sakura Soft" },
  executive: { name: "Executive Pro" },
  mintBreeze: { name: "Mint Breeze" },
  digitalWave: { name: "Digital Wave" },
  lavenderMist: { name: "Lavender Mist" },
  forestWhisper: { name: "Mint Mountain Trail" },
  roseGold: { name: "Rose Gold" },
  anneGreenGables: { name: "Anne of Green Gables" },
};

const DEFAULT_MD_THEME = "light";

// ✅ 1. 定义代码主题元数据
const THEMES = {
  'tokyo-night-dark': {
    name: 'Tokyo Night Dark',
    container: { background: '#1a1b26', color: '#a9b1d6' },
    path: 'hljs/tokyo-night-dark.min.css',
  },
  'github-dark': {
    name: 'GitHub Dark',
    container: { background: '#0d1117', color: '#c9d1d9' },
    path: 'hljs/github-dark.min.css',
  },
  'atom-one-dark': { // 修正了 key
    name: 'Atom One Dark',
    container: { background: '#282c34', color: '#abb2bf' }, // 补上了 container
    path: 'hljs/atom-one-dark.min.css',
  },
  'felipec': {
    name: 'felipec',
    container: { background: '#1d3a4a', color: '#dbe1e6' }, // 补上了 container
    path: 'hljs/felipec.min.css',
  },
  'monokai': {
    name: 'monokai',
    container: { background: '#2a2c2d', color: '#f8f8f2' }, // 补上了 container
    path: 'hljs/monokai.min.css',
  },
  'panda-syntax-dark': {
    name: 'panda syntax dark',
    container: { background: '#2a2c32', color: '#e6e6e6' }, // 补上了 container
    path: 'hljs/panda-syntax-dark.min.css',
  },
  'tomorrow-night-blue': {
    name: 'tomorrow night blue',
    container: { background: '#002451', color: '#ffffff' }, // 补上了 container
    path: 'hljs/tomorrow-night-blue.min.css',
  },
};

// ✅ 1. 定义一个默认的主题键，确保它一定存在
const DEFAULT_THEME_KEY = 'tokyo-night-dark';

const extractPreviewStyles = (mdTheme) => {
  console.log("333mdTheme", mdTheme);

  const previewElement = document.querySelector('.preview');
  console.log(".preview", previewElement);
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

const extractWechatPreviewStyles = (mdTheme, customThemeData) => {
  console.log("333mdTheme", mdTheme);

  // 自定义主题处理逻辑同上
  if (customThemeData) {
    const cssVariables = { ...customThemeData.variables };
    if (customThemeData.settings) {
        cssVariables['--md-font-size'] = customThemeData.settings.fontSize;
        cssVariables['--md-line-height'] = customThemeData.settings.lineHeight;
    }
    let css = generateCompleteCSS(cssVariables, mdTheme);
    if (customThemeData.customCss) {
        css += `\n${customThemeData.customCss}`;
    }
    
    const settings = customThemeData.settings || {};
    const headingScale = parseFloat(settings.headingScale || '1.2');
    const scales = [1, headingScale, headingScale**2, headingScale**3, headingScale**4, headingScale**5];
    
    css += `
      .markdown-body h6 { font-size: ${scales[0]}em; }
      .markdown-body h5 { font-size: ${scales[1]}em; }
      .markdown-body h4 { font-size: ${scales[2]}em; }
      .markdown-body h3 { font-size: ${scales[3]}em; }
      .markdown-body h2 { font-size: ${scales[4]}em; }
      .markdown-body h1 { font-size: ${scales[5]}em; }
      .markdown-body { font-size: ${settings.fontSize || '16px'}; line-height: ${settings.lineHeight || '1.8'}; }
    `;
    return css;
  }

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
.markdown-body {
  color: #3e3e3e;
  background: ${variables['--md-bg'] || '#fff'};
  margin: 0 0;
  padding: 0;
  line-height: 2;
  font-size: 15px;
  font-weight: 400;
  letter-spacing:0px;
  word-wrap: break-word !important;
font-family: 
          PingFang SC, system-ui, -apple-system, BlinkMacSystemFont, Helvetica Neue, Hiragino Sans GB, Microsoft YaHei UI, Microsoft YaHei, Arial, sans-serif;
  }

.markdown-body p {
  margin: 1.5em 0;
  line-height: 3;
}

.markdown-body p>strong{
  color: ${variables['--md-strong'] || '#212121'};
}

.markdown-body li>p>strong{
  color: ${variables['--md-text'] || '#212121'};
}

/* 标题样式 */
.markdown-body h1,
.markdown-body h2,
.markdown-body h3{
  line-height: 1.7;
  margin: 2em 0 0 0;
  font-weight: 700;
}
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  line-height: 1.5;
  margin: 2em 0 0 0;
  font-weight: 600;
}

.markdown-body h1 { font-size: 25px; }
.markdown-body h2 { font-size: 23px; }
.markdown-body h3 { font-size: 20px; 
  color: ${variables['--md-accent'] || '#212121'};
  font-weight: 600;
  text-align: left;
  position: left;
  padding: 0 0 10px 0;
  border-bottom: 2px solid ${variables['--md-accent'] || '#212121'};}
.markdown-body h4 { font-size: 18px; 
  color: ${variables['--md-accent'] || '#212121'};
  font-weight: 600;
  text-align: left;
  position: left;
  padding: 0 0 7px 0;
  border-bottom: 2px solid ${variables['--md-accent'] || '#212121'};
}
.markdown-body h5 { font-size: 16px; }
.markdown-body h6 { font-size: 16px;  }

.markdown-body ruby{
  ruby-position: over; 
  line-height: 3;
}
.markdown-body rt{
  font-size: 10px !important; 
  letter-spacing: 0px;
  font-family: "Noto Sans JP", "Yu Gothic", sans-serif;
}
  

/* 代码块样式 margin-top: 8px; */
.markdown-body pre {
  border-radius: 6px;
  padding: 0;
  overflow: auto;
  margin: 1em 0;
}

.markdown-body :not(pre) > code {
    background-color: ${variables['--md-code-bg'] || '#f7f9faff'};
    color: ${variables['--md-code-fg'] || '#e7b0d0'};
    border: 1px solid ${variables['--md-border'] || '#e5e7eb'};
     padding: .1em .4em;
    border-radius: 4px; 
    font-size: 13px;
    margin: 0 0.1em;
  }

/* 引用样式 */
.markdown-body blockquote {
  background-color: ${variables['--md-quote-bg'] || '#f6f8fa'};
  border-left: 4px solid ${variables['--md-quote-bar'] || '#dfe2e5'};
  margin: 1em 0;
  padding: .6em 1em;
  color: ${variables['--md-fg'] || '#333'};
  line-height:1.2;
}

/* 列表样式 */
.markdown-body ul,
.markdown-body ol {
  padding-left: 1.4em;
  margin: .8em 0;
}

.markdown-body li {
  margin: .8em .3em; 
}

/* todolist 不添加支持了，因为复制到公众号后会导致checkbox和任务换行，且无法修改*/
.markdown-body li input[type="checkbox"] {
  display: none !important;        /* 隐藏复选框 */
  width: 0 !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}
  
/* 表格样式 */
.markdown-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 2em 0;
  font-size: 12px;
}

.markdown-body th,
.markdown-body td {
  border: 1px solid ${variables['--md-border'] || '#d0d7de'};
  padding: 8px 12px;
  text-align: left;
}

.markdown-body th[align="center"],
.markdown-body td[align="center"] {
  text-align: center;
}
.markdown-body th[align="right"],
.markdown-body td[align="right"] {
  text-align: right;
}

.markdown-body th {
  background-color: ${variables['--md-quote-bg'] || '#f6f8fa'};
  font-weight: 600;
}

.markdown-body tr:nth-child(even) {
  background-color: ${variables['--md-table-stripe'] || '#f6f8fa'};
}

/* 链接样式 */
.markdown-body a {
  color: ${variables['--md-accent'] || '#48eabf'};
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body hr {
  border: none;
  border-top: 1px solid ${variables['--md-border'] || '#d0d7de'};
  margin: 2em 0;
}

/* 图片样式 */
.markdown-body img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

/* Mermaid 样式 */
.markdown-body .mermaid {
  text-align: center;
  margin: 1.5em 0;
}

.markdown-body .mermaid svg {
  max-width: 100%;
  height: auto;
}
`;

  // 获取当前主题特定的样式
  const themeSpecificStyles = getThemeSpecificStyles(theme, variables);

  return baseStyles + themeSpecificStyles;
};

// 3. 获取主题特定样式
const getThemeSpecificStyles = (_theme, variables) => {
  const accent = variables['--md-accent'] || '#2f7df5';
  const border = variables['--md-border'] || '#dbe5f2';
  const quoteBg = variables['--md-quote-bg'] || '#f3f8ff';
  const headingColor = variables['--md-fg'] || '#1f2937';

  return `
/* Modern unified heading/blockquote tuning for export */
.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4 {
  color: ${headingColor};
}

.markdown-body h1,
.markdown-body h2 {
  border-bottom: 1px solid ${border};
  padding-bottom: 0.35em;
}

.markdown-body h3,
.markdown-body h4 {
  color: ${accent};
}

.markdown-body blockquote {
  background: ${quoteBg};
  border-radius: 10px;
}
`;
};



function App() {
  // 全局初始化 mermaid（只在应用启动时初始化一次）
  // useEffect(() => {
  //   try {
  //     mermaid.initialize({
  //       startOnLoad: false,
  //       theme: 'default',
  //       securityLevel: 'loose',
  //       fontFamily: 'Arial, sans-serif',
  //       themeVariables: {
  //         fontSize: '16px',
  //         fontFamily: 'Arial, sans-serif',
  //         primaryColor: '#ECECFF',
  //         primaryTextColor: '#000',
  //         primaryBorderColor: '#525F7F',
  //         lineColor: '#333',
  //         secondaryColor: '#fff',
  //         tertiaryColor: '#fff'
  //       },
  //       flowchart: {
  //         useMaxWidth: false,
  //         htmlLabels: true,
  //         curve: 'basis',
  //         diagramPadding: 20,
  //         wrappingWidth: 200,
  //         defaultRenderer: 'dagre'
  //       }
  //     });
  //     console.log('Mermaid initialized in App component with enhanced config');
  //   } catch (e) {
  //     console.warn('mermaid initialize failed at app startup', e);
  //   }
  // }, []); // 空依赖数组确保只运行一次

  // ====== 布局状态 ======
  const [viewMode, setViewMode] = useState("edit"); // "edit" | "preview"
  const [showOutline, setShowOutline] = useState(true); // 默认显示目录
  const [headings, setHeadings] = useState([]); // Outline 要的数据 
  const [defaultDir, setDefaultDir] = useState("");
  const [lastSaveDir, setLastSaveDir] = useState(null);

  // 自定义主题状态
  const [customThemes, setCustomThemes] = useState({});
  const [isThemeEditorOpen, setIsThemeEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState(null);

  // 主题状态（Markdown 主题）
  const [mdTheme, setMdTheme] = useState(
    localStorage.getItem("mdTheme") || DEFAULT_MD_THEME
  );
  const [themeKey, setThemeKey] = useState(DEFAULT_THEME_KEY); // 默认CODE主题
  const isAnneTheme = mdTheme === "anneGreenGables";

  // 动态加载和卸载 CSS 主题
  useEffect(() => {
    const loadCustomThemes = async () => {
      try {
        const themes = await window.electronAPI.getCustomThemes();
        setCustomThemes(themes || {});
      } catch (error) {
        console.error("Failed to load custom themes:", error);
      }
    };
    loadCustomThemes();
  }, []);

  // 生成自定义主题 CSS 的辅助函数
  const generateCustomThemeCSS = (theme) => {
    if (!theme) return '';
    const vars = Object.entries(theme.variables || {})
      .map(([k, v]) => `${k}: ${v};`)
      .join('\n');
    
    const settings = theme.settings || {};
    const fontSize = settings.fontSize || '16px';
    const lineHeight = settings.lineHeight || '1.8';
    const headingScale = parseFloat(settings.headingScale || '1.2');

    // 基础样式
    let css = `
      .app[data-mdtheme="${theme.id}"] {
        ${vars}
        --md-font-size: ${fontSize};
        --md-line-height: ${lineHeight};
      }
      
      /* 微信预览区特定的字体和行高覆盖 */
      .app[data-mdtheme="${theme.id}"] .markdown-body {
        font-size: var(--md-font-size);
        line-height: var(--md-line-height);
      }
    `;

    // 标题大小逻辑
    const scales = [1, headingScale, headingScale**2, headingScale**3, headingScale**4, headingScale**5]; 
    // h6 -> h1
    
    css += `
      .app[data-mdtheme="${theme.id}"] h6 { font-size: ${scales[0]}em; }
      .app[data-mdtheme="${theme.id}"] h5 { font-size: ${scales[1]}em; }
      .app[data-mdtheme="${theme.id}"] h4 { font-size: ${scales[2]}em; }
      .app[data-mdtheme="${theme.id}"] h3 { font-size: ${scales[3]}em; }
      .app[data-mdtheme="${theme.id}"] h2 { font-size: ${scales[4]}em; }
      .app[data-mdtheme="${theme.id}"] h1 { font-size: ${scales[5]}em; }
    `;

    if (theme.customCss) {
       css += `
       /* Custom CSS for ${theme.name} */
       ${theme.customCss}
       `;
    }

    return css;
  };

  // 注入自定义主题 CSS
  useEffect(() => {
    const styleId = 'custom-theme-styles';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    // 仅生成当前选中的自定义主题的 CSS，或者生成所有自定义主题的 CSS
    // 为了性能和 simplicity，我们生成所有的，因为 data-mdtheme 选择器会隔离它们
    const allCss = Object.values(customThemes).map(generateCustomThemeCSS).join('\n');
    styleEl.textContent = allCss;

  }, [customThemes]);

  useEffect(() => {
    // 1. 创建一个新的 <link> 元素 
    const linkElement = document.createElement('link');

    // 2. 设置它的属性
    linkElement.rel = 'stylesheet';
    linkElement.id = 'dynamic-theme-stylesheet'; // 给它一个ID，方便管理
    linkElement.href = THEMES[themeKey].path; // e.g., 'hljs/tokyo-night-dark.min.css'

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

  // 第二个 useEffect：把页面外层背景同步为当前主题背景
  const appRef = useRef(null);
  useEffect(() => {
    if (!appRef.current) return;
    const styles = getComputedStyle(appRef.current);
    const appBackground =
      styles.getPropertyValue("--ui-app-bg").trim() ||
      styles.getPropertyValue("--md-bg").trim() ||
      "#ffffff";

    document.body.style.background = appBackground;
    document.documentElement.style.background = appBackground;

    return () => {
      document.body.style.background = "";
      document.documentElement.style.background = "";
    };
  }, [mdTheme, customThemes]);

  // 直接解析 URL 参数
  const query = new URLSearchParams(window.location.search);
  const mode = query.get("mode") || "edit"; // edit | preview
  const [showPreview, setShowPreview] = useState(true); // 控制是否显示预览
  const [showWechat, setShowWechat] = useState(false); // 控制是否显示公众号区域

  const [content, setContent] = useState("");

  // const editorRef = useRef(null);
  const [editorUploading, setEditorUploading] = useState(false);
  const [filePath, setFilePath] = useState(null);
  const [status, setStatus] = useState("未保存");
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  /** EPUB：选完目录后在此弹层填写元数据（避免 window.prompt 在 Electron 中不可用） */
  const [epubWizard, setEpubWizard] = useState(null);
  const [epubFormTitle, setEpubFormTitle] = useState("");
  const [epubFormAuthor, setEpubFormAuthor] = useState("");
  const [epubFormPickCover, setEpubFormPickCover] = useState(false);

  const [exportProgress, setExportProgress] = useState({
    visible: false,
    type: "",
    progress: 0,
    message: "",
    generatedCount: 0,
    totalCount: 0,
  });
  const exportProgressHideTimerRef = useRef(null);
  const [activeRightTab, setActiveRightTab] = useState("outline"); // outline | wechat
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const fileMenuButtonRef = useRef(null);
  const fileMenuActionsRef = useRef({
    newFile: async () => {},
    open: async () => {},
    save: async () => {},
    exportHtml: async () => {},
    exportPdf: async () => {},
    exportImage: async () => {},
  });

  // 获取当前选中的主题对象
  const currentTheme = THEMES[themeKey];

  // 把 editor 的源 markdown 按行扫描，把对应那一行的 - [ ] / - [x] 切换
  function toggleNthTaskInMarkdown(nth, checked) {
    // 把内容按行分割，逐行查找任务列表项，遇到第 nth 个时切换 [ ] <-> [x]
    const lines = content.split(/\r?\n/);
    const taskRe = /^(\s*[-*]\s\[(?: |x|X)\]\s)(.*)$/; // capture 前缀和剩余文本
    let found = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(taskRe);
      if (m) {
        if (found === nth) {
          const prefix = m[1];
          const body = m[2];
          const newPrefix = prefix.replace(/\[(?: |x|X)\]/, checked ? '[x]' : '[ ]');
          lines[i] = newPrefix + body;
          break;
        }
        found++;
      }
    }
    const newContent = lines.join('\n');
    // 这里假设你用的是 setContent 更新 editor
    setContent(newContent);
  }

  const { rawHtml, sanitizedHtml } = useMarkdownRenderer(
    content,
    filePath
  );

  // 不再使用滚动同步，使用普通的 ref
  const editorRef = useRef(null);
  const previewRef = useRef(null);
  const wechatRef = useRef(null);

  useEffect(() => {
    const syncWindowState = async () => {
      if (!window.electronAPI || typeof window.electronAPI.windowIsMaximized !== "function") return;
      try {
        const maximized = await window.electronAPI.windowIsMaximized();
        setIsWindowMaximized(Boolean(maximized));
      } catch (err) {
        console.warn("windowIsMaximized failed:", err);
      }
    };
    syncWindowState();
    window.addEventListener("focus", syncWindowState);
    return () => window.removeEventListener("focus", syncWindowState);
  }, []);

  // 事件委托：preview 与 wechat 两个区域的 checkbox 点击同步回 editor
  useEffect(() => {
    const containers = [previewRef.current, wechatRef.current].filter(Boolean);
    if (containers.length === 0) return;

    const handleClick = (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== 'checkbox') return;

      // 在各自容器内查找所有 visible 的 task checkboxes（按渲染顺序）
      const parent = target.closest('.markdown-body') || target.parentElement;
      if (!parent) return;
      const checkboxes = Array.from(parent.querySelectorAll('input[type="checkbox"]'));
      const idx = checkboxes.indexOf(target);
      if (idx === -1) return;

      // 调用组件内的切换函数（会更新 content）
      toggleNthTaskInMarkdown(idx, target.checked);
    };

    containers.forEach((c) => c.addEventListener('click', handleClick));
    return () => containers.forEach((c) => c.removeEventListener('click', handleClick));
  }, [sanitizedHtml, content]); // 依赖 sanitizedHtml & content，保证元素更新后重新绑定

  // Mermaid 渲染现在由 PreviewWithMermaid 组件处理，不再需要这里的 useEffect

  // 目录 Outline
  // previewRef 已经在你文件里（useBasicScrollSync 返回），我们用它来扫描 headings
  // ======= Collect headings (稳定、无循环) =======
  useEffect(() => {
    // 只在 sanitizedHtml 或 previewRef 初次就绪时采集一次，避免 MutationObserver 引发循环
    const collect = () => {
      const container = previewRef.current;
      if (!container) {
        // 若 preview 不存在，则清空 headings（避免残留）
        if (headings.length) setHeadings([]);
        return;
      }

      const nodes = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6'));
      const list = nodes.map((node, i) => {
        const text = node.textContent || `heading-${i}`;
        const slug = text
          .trim()
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .slice(0, 80);

        if (!node.id) {
          let candidate = slug || `heading-${i}`;
          let uniq = candidate;
          let suffix = 1;
          // 只在当前 container 内检查，减少跨文档冲突：prefix 用 preview 的 id（若存在）
          const prefix = container.id || 'preview';
          uniq = `${prefix}-${candidate}`;
          while (document.getElementById(uniq)) {
            uniq = `${prefix}-${candidate}-${suffix++}`;
          }
          node.id = uniq;
        }

        return {
          id: node.id,
          text,
          level: parseInt(node.tagName.slice(1), 10),
        };
      });

      // 仅在内容确实改变时才 setHeadings，避免无意义更新导致重渲染循环
      const same =
        list.length === headings.length &&
        list.every((it, idx) => headings[idx] && headings[idx].id === it.id && headings[idx].text === it.text && headings[idx].level === it.level);

      if (!same) setHeadings(list);
    };

    // 初次收集（当 sanitizedHtml 变动时）
    collect();

    // 也在窗口 resize 时重新收集（因为可能有懒加载或渲染差异）
    const onResize = () => {
      // 用 requestAnimationFrame 防抖
      window.requestAnimationFrame(collect);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
    };
    // 仅依赖 sanitizedHtml（当预览内容改变）和 previewRef.current 的存在
  }, [sanitizedHtml]); // 不要把 headings 或 previewRef 放到依赖里以免循环


  // 启动时获取默认文件夹
  useEffect(() => {
    (async () => {
      // const folder = await window.electronAPI.getDefaultDir();
      // console.log("defaultDir folder", folder);
      // if (folder) {
      //   setDefaultDir(folder);
      // }
      try {
        if (window.electronAPI && typeof window.electronAPI.getDefaultDir === 'function') {
          const folder = await window.electronAPI.getDefaultDir();
          console.log('defaultDir folder (from electronAPI):', folder);
          if (folder) {
            setDefaultDir(folder);
            localStorage.setItem('defaultDir', folder);
            return;
          }
        } else {
          console.warn('electronAPI.getDefaultDir not available - likely running in browser. Falling back to localStorage or documents default.');
        }
        // 降级：先看 localStorage，再构造默认路径（在浏览器环境里只能展示但不能创建）
        const cached = localStorage.getItem('defaultDir');
        if (cached) {
          setDefaultDir(cached);
        } else {
          // 在非 Electron 环境我们也能显示用户预期的默认字符串（但不实际创建）
          const docsFallback = (() => {
            try {
              // 若在 electron 环境，window.process?.platform 可能存在，但这里主要是 UX 提示
              return 'Documents/LingMD';
            } catch (e) { return 'Documents/LingMD'; }
          })();
          setDefaultDir(docsFallback);
        }
      } catch (err) {
        console.error('读取 defaultDir 失败（降级）', err);
        const cached = localStorage.getItem('defaultDir');
        if (cached) setDefaultDir(cached);
      }
    })();
  }, []);

  const handleSetDefaultDir = async () => {
    try {
      if (!window.electronAPI || typeof window.electronAPI.setDefaultDir !== 'function') {
        alert('当前无法配置默认文件夹（仅桌面应用支持）。');
        return;
      }
      const dir = await window.electronAPI.setDefaultDir();
      if (dir) {
        setDefaultDir(dir);
        localStorage.setItem('defaultDir', dir);
        showToast(`📂 默认文件夹已设置为: ${dir}`);
      }
    } catch (e) {
      console.error('设置默认文件夹失败', e);
      showToast('设置失败，请重试');
    }
  };


  const handleOpenDefaultDir = async () => {
    const dir = await window.electronAPI.openDefaultDir();
    if (dir) {
      showToast(`📂 已在系统中打开: ${dir}`);
    }
  };

  const [attachmentFolder, setAttachmentFolder] = useState(null);

  // 应用启动时，获取已保存的附件文件夹路径
  useEffect(() => {
    (async () => {
      try {
        // 如果 electronAPI 可用，就调用；否则退到 localStorage
        if (window.electronAPI && typeof window.electronAPI.getAttachmentFolder === 'function') {
          const folder = await window.electronAPI.getAttachmentFolder();
          // 可能返回 undefined/null/'' -> 视为未设置
          if (folder) {
            setAttachmentFolder(folder);
            localStorage.setItem('attachmentFolder', folder);
          } else {
            // 未设置：尝试从 localStorage 读取（兼容旧版本）
            const cached = localStorage.getItem('attachmentFolder') || '';
            setAttachmentFolder(cached);
          }
        } else {
          // 无 electronAPI（比如在 web 模式），从 localStorage 读取或置空
          const cached = localStorage.getItem('attachmentFolder') || '';
          setAttachmentFolder(cached);
        }
      } catch (err) {
        console.log('读取 attachmentFolder 失败（降级）：', err);
        const cached = localStorage.getItem('attachmentFolder') || '';
        setAttachmentFolder(cached);
      }
    })();
  }, []);

  // 处理设置附件文件夹的点击事件
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

  const showToast = (message, duration = 3000, pathLink = "") => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    setToast({
      message,
      pathLink: pathLink || "",
    });

    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, duration);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const startExportProgress = (type, message, progress = 2) => {
    if (exportProgressHideTimerRef.current) {
      clearTimeout(exportProgressHideTimerRef.current);
      exportProgressHideTimerRef.current = null;
    }
    setExportProgress({
      visible: true,
      type,
      progress: Math.max(0, Math.min(100, progress)),
      message: message || "正在导出...",
      generatedCount: 0,
      totalCount: 0,
    });
  };

  const finishExportProgress = () => {
    if (exportProgressHideTimerRef.current) {
      clearTimeout(exportProgressHideTimerRef.current);
    }
    exportProgressHideTimerRef.current = setTimeout(() => {
      setExportProgress({
        visible: false,
        type: "",
        progress: 0,
        message: "",
        generatedCount: 0,
        totalCount: 0,
      });
      exportProgressHideTimerRef.current = null;
    }, 500);
  };

  useEffect(() => {
    if (!window.electronAPI || typeof window.electronAPI.onExportProgress !== "function") {
      return;
    }
    const unsubscribe = window.electronAPI.onExportProgress((payload) => {
      if (!payload || typeof payload !== "object") return;
      const nextType = payload.type || "export";
      const nextMessage = payload.message || "正在导出...";
      const nextProgress = Number.isFinite(payload.progress)
        ? Math.max(0, Math.min(100, payload.progress))
        : 0;
      const nextGeneratedCount = Number.isFinite(payload.generatedCount)
        ? Math.max(0, Math.floor(payload.generatedCount))
        : 0;
      const nextTotalCount = Number.isFinite(payload.totalCount)
        ? Math.max(0, Math.floor(payload.totalCount))
        : 0;

      setExportProgress((prev) => {
        const sameType = !prev.type || prev.type === nextType;
        const monotonicProgress = sameType ? Math.max(prev.progress || 0, nextProgress) : nextProgress;
        return {
          visible: true,
          type: nextType,
          progress: monotonicProgress,
          message: nextMessage,
          generatedCount: nextGeneratedCount,
          totalCount: nextTotalCount,
        };
      });

      if (payload.done || payload.canceled || payload.error) {
        finishExportProgress();
      }
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
      if (exportProgressHideTimerRef.current) {
        clearTimeout(exportProgressHideTimerRef.current);
      }
    };
  }, []);

  // 获取导出默认文件名：忽略开头 YAML，优先取后续第一个 Markdown 标题
  const getExportDefaultBaseName = (markdownText) => {
    const text = (markdownText || "").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/);

    let startIndex = 0;
    while (startIndex < lines.length && lines[startIndex].trim() === "") {
      startIndex++;
    }

    if (startIndex < lines.length && lines[startIndex].trim() === "---") {
      startIndex++;
      while (startIndex < lines.length) {
        const line = lines[startIndex].trim();
        if (line === "---" || line === "...") {
          startIndex++;
          break;
        }
        startIndex++;
      }
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
      if (headingMatch && headingMatch[1]) {
        return sanitizeFileName(headingMatch[1]);
      }
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) return sanitizeFileName(line);
    }

    return sanitizeFileName(text || "untitled");
  };

  const handleOpenInFolder = async (targetPath) => {
    if (!targetPath) return;
    try {
      if (!window.electronAPI || typeof window.electronAPI.openInFolder !== "function") {
        showToast("当前环境不支持打开目录。");
        return;
      }
      const res = await window.electronAPI.openInFolder(targetPath);
      if (!res || !res.success) {
        showToast("打开目录失败：" + (res && res.error ? res.error : "未知错误"));
      }
    } catch (err) {
      showToast("打开目录失败：" + (err && err.message ? err.message : String(err)));
    }
  };

  // 自动保存
  useEffect(() => {
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
  // ---- App.jsx 中的 handleSave（替换原有） ----
  // 更宽松且安全的 sanitizeFileName：保留空格和点，但去掉危险字符，合并多空格，去首尾空格/点
  const sanitizeFileName = (s) => {
    if (!s) return 'untitled';
    // 取第一行并去首尾空白
    let name = s.split(/\r?\n/)[0].trim();
    if (!name) return 'untitled';

    // 删除文件名中会引起问题的字符（Windows/Unix 都不推荐使用）
    // 允许: 字母数字、中文、空格、点、下划线、短横、括号等常用字符
    name = name.replace(/[\/\\:\*\?"<>\|#%&{}\^~\[\]`]+/g, ''); // 移除一批危险符号

    // 合并连续空格为一个空格
    name = name.replace(/\s+/g, ' ').trim();

    // Windows 不允许文件名以空格或点结尾，也不建议以点开头
    name = name.replace(/^[. ]+/, ''); // 去掉开头的点或空格
    name = name.replace(/[. ]+$/, ''); // 去掉结尾的点或空格

    // 限制长度（保留扩展名前的长度）
    const MAX_LEN = 120;
    if (name.length > MAX_LEN) name = name.slice(0, MAX_LEN).trim();

    if (!name) name = 'untitled';
    return name;
  };



  const handleSave = async (opts = { forceDialog: false }) => {
    try {
      // 如果已经有路径且不是强制打开对话，直接保存
      if (filePath && !opts.forceDialog && !filePath.includes("未命名")) {
        const res = await window.electronAPI.saveFile(content, filePath);
        if (res && res.success) {
          window.electronAPI.setLastFile(res.path || filePath);
          setFilePath(res.path || filePath);
          setStatus("已保存");
          showToast("💾 文件已保存在: " + (res.path || filePath));
        } else {
          showToast("保存失败: " + (res && res.error));
        }
        return;
      }

      // 否则（没有 filePath 或 强制另存为）——弹出“另存为”对话，默认用第一行作为文件名
      const firstLineName = sanitizeFileName(content);
      let baseDir = lastSaveDir || defaultDir || '';
      const suggestedFull = joinPath(baseDir, `${firstLineName}.md`);

      const dlg = await window.electronAPI.showSaveDialog({ defaultPath: suggestedFull });
      if (!dlg || dlg.canceled || !dlg.filePath) return;

      let chosen = dlg.filePath;
      if (!chosen.toLowerCase().endsWith('.md')) chosen += '.md';

      // 保存成功后记住目录
      setLastSaveDir(dirname(chosen));




      // const defaultDirPath = defaultDir || (await window.electronAPI.getDefaultDir?.()) || '';
      // const suggestedFull = defaultDirPath
      // ? (defaultDirPath.endsWith('/') || defaultDirPath.endsWith('\\') ? defaultDirPath : (defaultDirPath + pathSep())) + `${firstLineName}.md`
      // : `${firstLineName}.md`;

      // 调用主进程弹出保存对话（需要 preload 暴露 showSaveDialog）
      // const dlg = await window.electronAPI.showSaveDialog({ defaultPath: suggestedFull });
      // if (!dlg || dlg.canceled || !dlg.filePath) {
      //   // showToast("已取消保存");
      //   return;
      // }

      // 确保扩展名为 .md（用户可能改名了）
      // let chosen = dlg.filePath;
      // if (!chosen.toLowerCase().endsWith('.md')) chosen = chosen + '.md';

      // 最后写文件
      const result = await window.electronAPI.saveFile(content, chosen);
      if (result && result.success) {
        window.electronAPI.setLastFile(result.path || chosen);
        setFilePath(result.path || chosen);
        setStatus("已保存");
        showToast("💾 文件已保存在: " + (result.path || chosen));
      } else {
        showToast("保存失败: " + (result && result.error));
      }
    } catch (err) {
      console.error('handleSave error', err);
      showToast("保存时出错: " + (err && err.message));
    }
  };

  // 小 helper：在渲染端获取 path 分隔符 (简单实现)
  const pathSep = () => (navigator.platform && navigator.platform.toLowerCase().includes('win') ? '\\' : '/');

  // 在组件挂载时增加 Ctrl/Cmd+S 全局监听（放在 useEffect 中）
  useEffect(() => {
    const onKeyDown = (e) => {
      const mod = e.ctrlKey || e.metaKey; // 支持 Windows/Linux 和 macOS
      if (mod && !e.altKey && (e.key.toLowerCase() === 's')) {
        e.preventDefault();
        if (e.shiftKey) {// Ctrl+Shift+S -> 另存为
          handleSave({ forceDialog: true });
        } else {// Ctrl+S -> 普通保存
          handleSave({ forceDialog: false });
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [content, filePath, defaultDir]); // 依赖 content/filePath/defaultDir


  // 启动时加载上次的文件
  useEffect(() => {
    try {
      // 如果 electronAPI 可用，就调用；否则退到 localStorage
      if (window.electronAPI && typeof window.electronAPI.onLoadLastFile === 'function') {
        window.electronAPI.onLoadLastFile(async (fp) => {
          if (fp) {
            setFilePath(fp);
            const res = await window.electronAPI.readFile(fp);
            if (res) {
              setContent(res.content);
              setStatus("已加载");
            }
          }
        });
      } else {
        setFilePath('');
      }
    } catch (err) {
      console.log('读取 onLoadLastFile 失败（降级）：', err);
      setFilePath('');
    }




  }, []);

  const handleOpen = async () => {
    const result = await window.electronAPI.openFile();
    if (result) {
      setFilePath(result.path);
      setContent(result.content);
      window.electronAPI.setLastFile(result.path);
      setStatus("已打开");
    } else {
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
      console.log("🆕 新建文件：", result.path);
    }
  };





  // 处理公众号复制的函数
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

      // 1. 核心增强：读取当前主题下的所有CSS变量值
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

      console.log("222mdTheme", mdTheme);

      // 提取当前主题的CSS样式
      const extractedCSS = extractWechatPreviewStyles(mdTheme);
      console.log("extractedCSS", extractedCSS);
      // 获取渲染后的HTML内容
      const previewElement = document.querySelector('.wechat-export');
      if (!previewElement) return;
      console.log("previewElement", previewElement);

      // 克隆预览元素并添加类名
      const clonedElement = previewElement.cloneNode(true);

      // --- 新增代码：从克隆的元素中移除所有 H1 和 H2 标签 ---
      const headers = clonedElement.querySelectorAll('h1, h2');
      headers.forEach(header => header.remove());
      // --- 新增代码结束 ---

      clonedElement.className = 'markdown-body';


      // 创建完整的HTML结构
      const styledHTML = `
        <section class="markdown-body">
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
      alert(`复制失败: ${error.message}`);
    }
  };

  // 在 App 组件内部（和 handleCopyToWechat 同级）
  const handleExportHtml = async () => {
    try {
      if (!content || content.trim() === "") {
        alert("内容为空，无法导出。");
        return;
      }

    // 1. 构建主题 CSS（复用你已有的提取函数）
    const extractedCSS = extractPreviewStyles(mdTheme, customThemes[mdTheme]) || "";

    // 2. 取出用于导出的 preview DOM（复用 wechat-export 区域的结构）
      const previewElement = document.querySelector(".preview");
      if (!previewElement) {
        alert("找不到导出区域（.preview .markdown-body），请先打开公众号预览或切换布局。");
        return;
      }

      console.log("previewElement///", previewElement);
      

      // 克隆并做同样的处理（去掉 H1/H2 是你在 copy 中的行为，按需保留或删除）
      const cloned = previewElement.cloneNode(true);
      // 如果想与复制到公众号一致，删除 h1/h2：
      const headers = cloned.querySelectorAll("h1,h2");
      headers.forEach(h => h.remove());
      cloned.className = "markdown-body";

      // 3. 生成要发到主进程处理的"裸 HTML"
      // 生成导出 HTML（替换之前的 styledHTML）
      const exportWrapperCss = `
/* 导出时强制预览区宽度和居中 —— 覆盖应用中可能的全屏规则 */
.preview-export {
  box-sizing: border-box;
  width: 100%;
  display: block;
  padding: 0;
  background: var(--md-bg, #ffffff);
  color: var(--md-fg, #000);
  min-height: auto;
}

/* HTML 导出宽度与主预览流一致 */
.preview-export .preview {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  height: auto !important;
  overflow: visible !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}

.preview-export .preview-inner {
  height: auto !important;
  overflow: visible !important;
}

/* markdown-body 直接沿用主预览宽度策略 */
.preview-export .markdown-body {
  width: 100%;
  max-width: none;
  padding: 20px 80px 80px 80px;
  box-sizing: border-box;
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
  height: auto !important;
  min-height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}

/* 保证图片/mermaid 等不超出 */
.preview-export .markdown-body img,
.preview-export .markdown-body svg,
.preview-export .markdown-body .mermaid {
  max-width: 100% !important;
  width: auto !important;
}
`;

      // clonedHtml 是你 cloneNode 后取的 innerHTML
      const styledHTML = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>
      ${extractedCSS || ""}   /* 你的主题/hljs 等样式 */
      ${exportWrapperCss}     /* 覆盖宽度的导出用 CSS */
    </style>
  </head>
  <body>
    <div class="preview-export">
      <div class="preview">
        <div class="preview-inner">
          <div class="markdown-body">
            ${cloned.innerHTML}
          </div>
        </div>
      </div>
    </div>
  </body>
</html>
`;

      // 4. 先让主进程做转换（图片 base64 / 样式内联 / 代码样式等）
      const finalHtml = await window.electronAPI.convertHtmlForClipboard({
        html: styledHTML,
        codeThemeKey: themeKey,
        css: extractedCSS,
        themeCssValues: mdTheme,
      });

      if (!finalHtml || finalHtml.trim() === "") {
        alert("导出失败：主进程返回空内容。");
        return;
      }

      // 5. 建议文件名：忽略 YAML，优先使用第一个 Markdown 标题
      const exportBaseName = getExportDefaultBaseName(content || "");
      const suggested = (exportBaseName || "untitled") + ".html";

      // 6. 弹出保存对话（使用已有 show-save-dialog）
      const dlg = await window.electronAPI.showSaveDialog({ defaultPath: suggested });
      if (!dlg || dlg.canceled || !dlg.filePath) {
        // 用户取消
        return;
      }

      let chosen = dlg.filePath;
      // 强制 .html 后缀
      if (!chosen.toLowerCase().endsWith(".html")) chosen += ".html";

      // 7. 调用 save-file 把 finalHtml 写入磁盘
      const res = await window.electronAPI.saveFile(finalHtml, chosen);
      if (res && res.success) {
        const finalPath = res.path || chosen;
        showToast("✅ 导出成功：", 6000, finalPath);
      } else {
        showToast("导出失败：" + (res && res.error ? res.error : ""));
      }
    } catch (err) {
      console.error("handleExportHtml error:", err);
      alert("导出失败：" + (err && err.message ? err.message : String(err)));
    }
  };

  useEffect(() => {
    if (epubWizard) {
      setEpubFormTitle(epubWizard.defaultTitle || "");
      setEpubFormAuthor("");
      setEpubFormPickCover(false);
    }
  }, [epubWizard]);

  const deriveChapterTitle = (markdown, fp) => {
    const lines = (markdown || "").split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*#\s+(.+)$/);
      if (m) return m[1].trim();
    }
    const seg = (fp || "").split(/[/\\]/);
    const base = seg[seg.length - 1] || "chapter";
    return base.replace(/\.(md|markdown)$/i, "");
  };

  const runEpubExportCore = async (files, bookTitle, bookAuthor, pickCover) => {
    let coverPath = null;
    if (pickCover && window.electronAPI?.pickCoverImage) {
      coverPath = await window.electronAPI.pickCoverImage();
    }
    const chapters = [];
    const total = files.length;
    startExportProgress("epub", "正在渲染章节…", 4);
    for (let i = 0; i < files.length; i++) {
      const { path: chapterPath, rel } = files[i];
      const pct = Math.round(8 + (82 * (i + 1)) / total);
      startExportProgress("epub", `正在渲染 ${i + 1}/${total}: ${rel}`, pct);
      const readRes = await window.electronAPI.readFile(chapterPath);
      if (!readRes || readRes.content == null) {
        console.warn("read chapter failed", chapterPath, readRes);
        continue;
      }
      const mdText = String(readRes.content);
      const chapterTitle = deriveChapterTitle(mdText, chapterPath);
      const bodyHtml = await renderMarkdownChapterHtml(mdText, chapterPath);
      const fullDoc = `<!DOCTYPE html><html><body><div class="markdown-body">${bodyHtml}</div></body></html>`;
      const inlined = await window.electronAPI.convertHtmlForClipboard({
        html: fullDoc,
        skipJuice: true,
      });
      if (!inlined) {
        alert(`章节「${rel}」处理失败，已跳过`);
        continue;
      }
      const parser = new DOMParser();
      const doc = parser.parseFromString(inlined, "text/html");
      const mdInner =
        doc.querySelector(".markdown-body")?.innerHTML || doc.body.innerHTML;
      chapters.push({ title: chapterTitle, htmlBody: mdInner });
    }
    if (!chapters.length) {
      finishExportProgress();
      alert("没有成功渲染任何章节。");
      return;
    }
    let mdThemeCss = "";
    if (customThemes[mdTheme]) {
      mdThemeCss = extractWechatPreviewStyles(mdTheme, customThemes[mdTheme]) || "";
    } else {
      mdThemeCss = extractPreviewStyles(mdTheme) || "";
    }
    startExportProgress("epub", "正在打包 EPUB…", 94);
    const result = await window.electronAPI.exportEpubBook({
      title: bookTitle,
      author: bookAuthor,
      language: "zh-CN",
      coverPath,
      chapters,
      mdThemeCss,
      codeThemeKey: themeKey,
    });
    finishExportProgress();
    if (result.canceled) return;
    if (result.success && result.path) {
      showToast("✅ EPUB 已保存", 6000, result.path);
    } else {
      alert(`导出失败：${result?.error || "未知错误"}`);
    }
  };

  const handleEpubMetaConfirm = async () => {
    if (!epubWizard) return;
    const { files, defaultTitle } = epubWizard;
    const bookTitle = epubFormTitle.trim() || defaultTitle;
    const bookAuthor = epubFormAuthor.trim() || "佚名";
    const pickCover = epubFormPickCover;
    setEpubWizard(null);
    try {
      await runEpubExportCore(files, bookTitle, bookAuthor, pickCover);
    } catch (e) {
      finishExportProgress();
      console.error(e);
      alert(`导出失败：${e.message || e}`);
    }
  };

  const handleExportEpub = async () => {
    if (!window.electronAPI?.pickBookDirectory) {
      alert("请使用 Electron 桌面版导出 EPUB。");
      return;
    }
    try {
      const rootDir = await window.electronAPI.pickBookDirectory();
      if (!rootDir) return;
      const files = await window.electronAPI.scanMarkdownBook(rootDir);
      if (!files.length) {
        alert("该目录下没有找到 .md 文件。");
        return;
      }
      const defaultBookTitle =
        rootDir.split(/[/\\]/).filter(Boolean).pop() || "作品";
      setEpubWizard({ files, defaultTitle: defaultBookTitle });
    } catch (e) {
      console.error(e);
      alert(`导出失败：${e.message || e}`);
    }
  };

  // 获取页面所有 CSS 规则的辅助函数
  const getAllStyles = () => {
    let css = '';
    for (let i = 0; i < document.styleSheets.length; i++) {
      try {
        const sheet = document.styleSheets[i];
        for (let j = 0; j < sheet.cssRules.length; j++) {
          css += sheet.cssRules[j].cssText + '\n';
        }
      } catch (e) {
        console.warn("Failed to get css rules", e);
      }
    }
    return css;
  };

  // 导出为 PDF 的处理函数
  const handleExportPdf = async () => {
    console.log("handleExportPdf 被调用");
    try {
      if (!content || content.trim() === "") {
        alert("内容为空，无法导出。");
        return;
      }
      console.log("开始导出 PDF...");

      // 1. 获取页面全量样式
      const allStyles = getAllStyles();
      const appStyles = appRef.current ? getComputedStyle(appRef.current) : null;
      const exportBg = (appStyles?.getPropertyValue("--md-bg") || "").trim() || "#ffffff";
      const exportFg = (appStyles?.getPropertyValue("--md-fg") || "").trim() || "#111111";

      // 2. 取出用于导出的正文 DOM（只拿真实内容，避免带入滚动容器）
      const previewElement = document.querySelector(".preview .markdown-body");
      if (!previewElement) {
        finishExportProgress();
        alert("找不到导出区域（.preview .markdown-body），请先打开预览或切换布局。");
        return;
      }

      // 克隆并处理
      const cloned = previewElement.cloneNode(true);
      // 删除 h1/h2（可选，根据需求决定）
      const headers = cloned.querySelectorAll("h1,h2");
      headers.forEach((h) => h.remove());

      // 3. 生成导出 HTML
      // 关键：包裹在 .app[data-mdtheme] 容器中，以确保 CSS 选择器匹配
      const exportWrapperCss = `
/* PDF 导出样式：重置应用布局中的 100vh/overflow，避免导出成“一屏带滚动条” */
html,
body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  height: auto !important;
  min-height: auto !important;
  overflow: visible !important;
  background: ${exportBg} !important;
  color: ${exportFg} !important;
  position: relative !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

/* 让每一页都铺满主题背景，避免“外白内暗” */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background: ${exportBg};
  z-index: 0;
  pointer-events: none;
}

.app {
  display: block !important;
  width: 100% !important;
  height: auto !important;
  min-height: auto !important;
  overflow: visible !important;
  background: ${exportBg} !important;
  color: ${exportFg} !important;
  position: relative !important;
  z-index: 1;
}

.pdf-export {
  box-sizing: border-box;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 12mm 9mm 10mm 9mm;
  background: ${exportBg};
  color: ${exportFg};
  height: auto !important;
  min-height: auto !important;
  overflow: visible !important;
  position: relative;
  z-index: 1;
}

.pdf-export .markdown-body {
  width: 100%;
  max-width: 100%;
  padding: 0;
  box-sizing: border-box;
  margin: 0;
  height: auto !important;
  min-height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}

@media print {
  html,
  body,
  .app,
  .pdf-export,
  .pdf-export .markdown-body {
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }
}

@page {
  size: A4;
  margin: 0;
}

/* 保证图片/mermaid 等不超出 */
.pdf-export .markdown-body img,
.pdf-export .markdown-body svg,
.pdf-export .markdown-body .mermaid {
  max-width: 100% !important;
  width: auto !important;
  height: auto !important;
}

/* PDF 分页优化 */
.pdf-export .markdown-body h1,
.pdf-export .markdown-body h2,
.pdf-export .markdown-body h3 {
  page-break-after: avoid;
  break-after: avoid-page;
}

.pdf-export .markdown-body pre,
.pdf-export .markdown-body blockquote {
  page-break-inside: avoid;
  break-inside: avoid-page;
}

/* Export watermark */
.pdf-export .app-watermark {
  position: relative;
  margin: 0 auto;
  text-align: center;
  user-select: none;
  pointer-events: none;
  page-break-inside: avoid;
  break-inside: avoid-page;
  z-index: 2;
}

.pdf-export .app-watermark-divider {
  width: min(260px, 62%);
  height: 12px;
  margin: 0 auto 10px;
  border-radius: 999px;
  opacity: 0.42;
  border-top: 1px dashed rgba(140, 222, 203, 0.5);
  border-bottom: 1px dashed rgba(140, 222, 203, 0.3);
  box-shadow: inset 0 1px 0 rgba(202, 240, 229, 0.3);
}

.pdf-export .app-watermark-title {
  font-family: "STKaiti", "KaiTi", "DFKai-SB", "Segoe Script", "Brush Script MT", cursive;
  font-size: 30px;
  line-height: 1.12;
  letter-spacing: 1px;
  font-weight: 500;
  color: rgba(92, 185, 163, 0.5);
  text-shadow: 0 0 1px rgba(165, 232, 215, 0.33), 0 0 10px rgba(136, 220, 201, 0.14);
}
`;

      const styledHTML = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>
      ${allStyles}
      ${exportWrapperCss}
    </style>
  </head>
  <body>
    <div class="app" data-mdtheme="${mdTheme}">
      <div class="pdf-export">
        <div class="markdown-body">
          ${cloned.innerHTML}
        </div>
        <div class="app-watermark" aria-hidden="true">
          <div class="app-watermark-divider"></div>
          <div class="app-watermark-title">简·泠 MD</div>
        </div>
      </div>
    </div>
  </body>
</html>
`;

      // 4. 先让主进程做转换（只做图片 base64 转换，跳过 Juice 内联）
      const finalHtml = await window.electronAPI.convertHtmlForClipboard({
        html: styledHTML,
        skipJuice: true, // 新增参数：跳过样式内联，使用全量 CSS
      });
      if (!finalHtml || finalHtml.trim() === "") {
        finishExportProgress();
        alert("导出失败：主进程返回空内容。");
        return;
      }

      // 5. 建议文件名：忽略 YAML，优先使用第一个 Markdown 标题
      const exportBaseName = getExportDefaultBaseName(content || "");
      const suggested = (exportBaseName || "untitled") + ".pdf";

      // 6. 先弹出保存对话框（与导出 HTML 保持一致）
      const dlg = await window.electronAPI.showSaveDialog({ 
        defaultPath: suggested,
        filters: [
          { name: "PDF", extensions: ["pdf"] },
          { name: "所有文件", extensions: ["*"] },
        ]
      });
      
      if (!dlg || dlg.canceled || !dlg.filePath) {
        // 用户取消
        finishExportProgress();
        return;
      }
      
      const savePath = dlg.filePath;
      startExportProgress("pdf", "正在生成 PDF，请稍候...", 6);

      // 7. 调用 PDF 导出，传入确定的路径
      console.log("调用 window.electronAPI.exportToPdf, path:", savePath);
      if (!window.electronAPI || !window.electronAPI.exportToPdf) {
        finishExportProgress();
        console.error("window.electronAPI.exportToPdf 不存在！");
        alert("PDF 导出功能不可用，请检查 Electron API 是否正确加载。");
        return;
      }
      
      const result = await window.electronAPI.exportToPdf({
        html: finalHtml,
        filePath: savePath, 
      });
      console.log("PDF 导出结果:", result);

      if (result && result.success) {
        const finalPath = result.path || savePath;
        showToast("✅ PDF 导出成功：", 6000, finalPath);
      } else {
        showToast("PDF 导出失败：" + (result && result.error ? result.error : "未知错误"));
      }
    } catch (err) {
      console.error("handleExportPdf error:", err);
      finishExportProgress();
      alert("导出失败：" + (err && err.message ? err.message : String(err)));
    }
  };

  // 导出为图片（朋友圈）
  const handleExportImage = async () => {
    console.log("handleExportImage 被调用");
    try {
      if (!content || content.trim() === "") {
        alert("内容为空，无法导出。");
        return;
      }
      console.log("开始导出朋友圈图片...");

      // 1. 获取页面全量样式
      const allStyles = getAllStyles();

      // 2. 取出用于导出的正文 DOM（只拿内容，避免滚动容器）
      const previewElement = document.querySelector(".preview .markdown-body");
      if (!previewElement) {
        finishExportProgress();
        alert("找不到导出区域（.preview .markdown-body），请先打开预览或切换布局。");
        return;
      }

      // 克隆并处理
      const cloned = previewElement.cloneNode(true);
      // 删除 h1/h2（可选，根据需求决定）
      const headers = cloned.querySelectorAll("h1,h2");
      headers.forEach((h) => h.remove());

      // 3. 生成导出 HTML
      // 朋友圈适配样式：宽度固定，内容居中，字体较大便于阅读
      const exportWrapperCss = `
/* 朋友圈图片导出样式 - 生成长图（无滚动条，内容完整展开） */
html,
body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  height: auto !important;
  min-height: auto !important;
  overflow: visible !important;
  background: var(--md-bg, #ffffff) !important;
  color: var(--md-fg, #111) !important;
}

/* 隐藏滚动条，避免分段截图拼接后出现多个滚动条滑块 */
html,
body,
.image-export,
.image-export .markdown-body,
.image-export * {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar,
.image-export::-webkit-scrollbar,
.image-export .markdown-body::-webkit-scrollbar,
.image-export *::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
  background: transparent !important;
}

.app {
  display: block !important;
  width: 100% !important;
  height: auto !important;
  min-height: auto !important;
  overflow: visible !important;
  background: var(--md-bg, #ffffff) !important;
  color: var(--md-fg, #111) !important;
}

.image-export {
  box-sizing: border-box;
  width: 100%;
  max-width: 390px;
  margin: 0 auto;
  padding: 20px 10px 24px;
  background: var(--md-bg, #ffffff) !important;
  color: var(--md-fg, #111111) !important;
  height: auto !important;
  min-height: auto !important;
  overflow: visible !important;
}

.image-export .markdown-body {
  width: 100%;
  max-width: 100%;
  padding: 0 6px;
  box-sizing: border-box;
  margin: 0;
  font-size: 17px;
  font-weight: 500;
  line-height: 1.8;
  color: var(--md-fg, #111111) !important;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  height: auto !important;
  min-height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}

.image-export .markdown-body p {
  margin: 1em 0;
  line-height: 1.8;
}

.image-export .markdown-body h1,
.image-export .markdown-body h2,
.image-export .markdown-body h3 {
  font-size: 16px;
  margin: 1.5em 0 0.5em 0;
}

.image-export .markdown-body h4,
.image-export .markdown-body h5 {
  font-size: 15px;
  margin: 1.2em 0 0.4em 0;
}

/* 保证图片/mermaid 等不超出 */
.image-export .markdown-body img,
.image-export .markdown-body svg,
.image-export .markdown-body .mermaid {
  max-width: 100% !important;
  width: auto !important;
  height: auto !important;
}

.image-export .markdown-body pre {
  font-size: 13px;
  overflow: visible !important;
  white-space: pre-wrap !important;
  word-break: break-word !important;
}

.image-export .markdown-body blockquote {
  font-size: 14px;
  padding: 0.5em 1em;
}

/* Export watermark */
.image-export .app-watermark {
  margin: 60px auto 0;
  text-align: center;
  user-select: none;
}

.image-export .app-watermark-divider {
  width: min(250px, 68%);
  height: 12px;
  margin: 0 auto 10px;
  border-radius: 999px;
  opacity: 0.44;
  border-top: 1px dashed rgba(140, 223, 204, 0.52);
  border-bottom: 1px dashed rgba(140, 223, 204, 0.32);
  box-shadow: inset 0 1px 0 rgba(204, 241, 231, 0.32);
}

.image-export .app-watermark-title {
  font-family: "STKaiti", "KaiTi", "DFKai-SB", "Segoe Script", "Brush Script MT", cursive;
  font-size: 28px;
  line-height: 1.1;
  letter-spacing: 1px;
  font-weight: 500;
  color: rgba(88, 181, 158, 0.54);
  text-shadow: 0 0 1px rgba(166, 234, 217, 0.35), 0 0 10px rgba(136, 220, 201, 0.16);
}
`;

      const styledHTML = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>
      ${allStyles}
      ${exportWrapperCss}
    </style>
  </head>
  <body>
    <div class="app" data-mdtheme="${mdTheme}">
      <div class="image-export">
        <div class="markdown-body">
          ${cloned.innerHTML}
        </div>
        <div class="app-watermark" aria-hidden="true">
          <div class="app-watermark-divider"></div>
          <div class="app-watermark-title">简·泠 MD</div>
        </div>
      </div>
    </div>
  </body>
</html>
`;

      // 4. 先让主进程做转换（只做图片 base64 转换，跳过 Juice 内联）
      const finalHtml = await window.electronAPI.convertHtmlForClipboard({
        html: styledHTML,
        skipJuice: true,
      });
      if (!finalHtml || finalHtml.trim() === "") {
        finishExportProgress();
        alert("导出失败：主进程返回空内容。");
        return;
      }

      // 5. 建议文件名：忽略 YAML，优先使用第一个 Markdown 标题
      const exportBaseName = getExportDefaultBaseName(content || "");
      const suggested = (exportBaseName || "untitled") + ".png";

      // 6. 先弹出保存对话框
      const dlg = await window.electronAPI.showSaveDialog({
        defaultPath: suggested,
        filters: [
          { name: "PNG 图片", extensions: ["png"] },
          { name: "JPG 图片", extensions: ["jpg", "jpeg"] },
        ]
      });

      if (!dlg || dlg.canceled || !dlg.filePath) {
        finishExportProgress();
        return;
      }

      const savePath = dlg.filePath;
      startExportProgress("image", "正在渲染长图，请稍候...", 6);

      // 7. 调用图片导出，传入确定的路径
      console.log("调用 window.electronAPI.exportToImage, path:", savePath);
      if (!window.electronAPI || !window.electronAPI.exportToImage) {
        finishExportProgress();
        console.error("window.electronAPI.exportToImage 不存在！");
        alert("图片导出功能不可用，请检查 Electron API 是否正确加载。");
        return;
      }

      const result = await window.electronAPI.exportToImage({
        html: finalHtml,
        filePath: savePath,
      });
      console.log("图片导出结果:", result);

      if (result && result.success) {
        const finalPath = result.path || savePath;
        showToast("✅ 图片导出成功：", 6000, finalPath);
      } else if (result && result.canceled) {
        showToast("导出已取消");
      } else {
        showToast("图片导出失败：" + (result && result.error ? result.error : "未知错误"));
      }
    } catch (err) {
      console.error("handleExportImage error:", err);
      finishExportProgress();
      alert("导出失败：" + (err && err.message ? err.message.toString() : String(err)));
    }
  };


  // 返回路径中的目录部分
  function dirname(filePath) {
    if (!filePath) return '';
    return filePath.substring(0, filePath.lastIndexOf('/') > -1
      ? filePath.lastIndexOf('/')
      : filePath.lastIndexOf('\\'));
  }

  // 拼接路径
  function joinPath(dir, name) {
    if (!dir) return name;
    const sep = dir.includes('\\') ? '\\' : '/';
    return dir.endsWith(sep) ? dir + name : dir + sep + name;
  }

  const handleOpenNativeFileMenu = async (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!window.electronAPI || typeof window.electronAPI.showNativeFileMenu !== "function") return;
    try {
      const rect = fileMenuButtonRef.current?.getBoundingClientRect();
      const payload = rect
        ? { x: Math.round(rect.left), y: Math.round(rect.bottom + 10) }
        : {};
      await window.electronAPI.showNativeFileMenu(payload);
    } catch (err) {
      console.error("showNativeFileMenu failed:", err);
    }
  };

  const handleWindowMinimize = async () => {
    if (!window.electronAPI || typeof window.electronAPI.windowMinimize !== "function") return;
    try {
      await window.electronAPI.windowMinimize();
    } catch (err) {
      console.error("windowMinimize failed:", err);
    }
  };

  const handleWindowToggleMaximize = async () => {
    if (!window.electronAPI || typeof window.electronAPI.windowToggleMaximize !== "function") return;
    try {
      const res = await window.electronAPI.windowToggleMaximize();
      if (res && typeof res.isMaximized === "boolean") {
        setIsWindowMaximized(res.isMaximized);
      } else if (typeof window.electronAPI.windowIsMaximized === "function") {
        const maximized = await window.electronAPI.windowIsMaximized();
        setIsWindowMaximized(Boolean(maximized));
      }
    } catch (err) {
      console.error("windowToggleMaximize failed:", err);
    }
  };

  const handleWindowClose = async () => {
    if (!window.electronAPI || typeof window.electronAPI.windowClose !== "function") return;
    try {
      await window.electronAPI.windowClose();
    } catch (err) {
      console.error("windowClose failed:", err);
    }
  };

  fileMenuActionsRef.current = {
    newFile: handleNewFile,
    open: handleOpen,
    save: handleSave,
    exportHtml: handleExportHtml,
    exportPdf: handleExportPdf,
    exportImage: handleExportImage,
  };

  useEffect(() => {
    if (!window.electronAPI || typeof window.electronAPI.onFileMenuCommand !== "function") return undefined;
    const unsubscribe = window.electronAPI.onFileMenuCommand(async (command) => {
      const actions = fileMenuActionsRef.current;
      try {
        switch (command) {
          case "new":
            await actions.newFile();
            break;
          case "open":
            await actions.open();
            break;
          case "save":
            await actions.save();
            break;
          case "export-html":
            await actions.exportHtml();
            break;
          case "export-pdf":
            await actions.exportPdf();
            break;
          case "export-image":
            await actions.exportImage();
            break;
          default:
            break;
        }
      } catch (err) {
        console.error("native file menu command failed:", command, err);
      }
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);


  // 默认编辑模式
  return (
    <div className={`app${isAnneTheme ? " theme-anne-green-gables" : ""}`} data-mdtheme={mdTheme} ref={appRef}>
      <div className="toolbar">
        <div className="toolbar-main">
        <div className="app-brand" title="LingMD">
          <img src="/favicon.ico" alt="LingMD" />
          <span>LingMD</span>
        </div>

        <div className="file-menu">
          <button
            ref={fileMenuButtonRef}
            type="button"
            className="toolbar-button file-menu-trigger"
            onClick={handleOpenNativeFileMenu}
          >
            File
          </button>
        </div>
        {/* 视图切换按钮 */}
      <button
          className={viewMode === 'edit' ? 'toolbar-button active' : 'toolbar-button'}
          onClick={() => setViewMode('edit')}
          title="编辑模式（左编辑右预览）"
        >
          分栏
        </button>
        <button
          className={viewMode === 'pure-edit' ? 'toolbar-button active' : 'toolbar-button'}
          onClick={() => setViewMode('pure-edit')}
          title="仅编辑模式"
        >
          仅编辑
        </button>
        <button
          className={viewMode === 'preview' ? 'toolbar-button active' : 'toolbar-button'}
          onClick={() => setViewMode('preview')}
          title="仅预览模式"
        >
          仅预览
        </button>


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
        
        <label onClick={handleExportHtml} className="toolbar-button">导出 HTML</label>
        <label onClick={handleExportPdf} className="toolbar-button">导出 PDF</label>
        <label onClick={handleExportImage} className="toolbar-button">📷 导出图片</label>
        <label onClick={handleExportEpub} className="toolbar-button">导出 EPUB</label>

        {editorUploading && <span className="uploading">上传中...</span>}

        {/* 6. 创建主题选择下拉菜单 */}
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
        <div className="window-controls" aria-label="window-controls">
          <button
            type="button"
            className="window-control"
            title="Minimize"
            onClick={handleWindowMinimize}
          >
            -
          </button>
          <button
            type="button"
            className="window-control"
            title={isWindowMaximized ? "Restore" : "Maximize"}
            onClick={handleWindowToggleMaximize}
          >
            {isWindowMaximized ? "❐" : "□"}
          </button>
          <button
            type="button"
            className="window-control close"
            title="Close"
            onClick={handleWindowClose}
          >
            ×
          </button>
        </div>
      </div>

      {isAnneTheme && (
        <aside className="anne-side-dock" aria-label="Anne of Green Gables quick actions">
          <button
            type="button"
            className="anne-side-dock-item"
            onClick={handleOpenNativeFileMenu}
            title="文件菜单"
          >
            <span className="anne-side-dock-icon" aria-hidden="true" />
            <span>File</span>
          </button>
          <button
            type="button"
            className={`anne-side-dock-item${viewMode === "pure-edit" ? " active" : ""}`}
            onClick={() => setViewMode("pure-edit")}
            title="仅编辑模式"
          >
            <span className="anne-side-dock-icon" aria-hidden="true" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            className={`anne-side-dock-item${viewMode === "preview" ? " active" : ""}`}
            onClick={() => setViewMode("preview")}
            title="仅预览模式"
          >
            <span className="anne-side-dock-icon" aria-hidden="true" />
            <span>View</span>
          </button>
          <div className="anne-side-dock-label">写作文件</div>
        </aside>
      )}

      {/* 主布局：目录 + 内容区 + 微信区 */}
      <div className={`main ${showWechat ? "wechat-visible" : ""} ${showOutline ? "outline-visible" : ""} mode-${viewMode}`}>
        {isAnneTheme && (
          <div className="anne-scene-decoration" aria-hidden="true">
            <div className="anne-scene-vine anne-scene-vine-left" />
            <div className="anne-scene-vine anne-scene-vine-right" />
            <div className="anne-scene-photo anne-scene-photo-top" />
            <div className="anne-scene-photo anne-scene-photo-bottom" />
            <div className="anne-scene-radio" />
            <div className="anne-scene-petal anne-scene-petal-left" />
            <div className="anne-scene-petal anne-scene-petal-right" />
          </div>
        )}

        {/* 左侧目录 */}
        {showOutline && (
          <div className="outline-wrapper">
            <Outline headings={headings} onNavigate={(id) => {
              console.log('目录点击，id:', id);

              // 点目录时，同时滚动编辑器、预览和微信区
              const el = document.getElementById(id);
              console.log('找到元素:', el);

              if (!el) {
                console.warn('未找到元素 id:', id);
                return;
              }

              // 1. 滚动预览区
              if (previewRef.current) {
                console.log('滚动预览区');
                const container = previewRef.current;
                const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 20;
                container.scrollTo({ top, behavior: 'smooth' });
              } else {
                console.warn('previewRef.current 为空');
              }

              // 2. 滚动微信区（如果存在）
              if (wechatRef.current && showWechat) {
                console.log('滚动微信区');
                // 在微信区查找相同 id 的元素
                const wechatEl = wechatRef.current.querySelector(`#${CSS.escape(id)}`);
                if (wechatEl) {
                  const top = wechatEl.getBoundingClientRect().top - wechatRef.current.getBoundingClientRect().top + wechatRef.current.scrollTop - 20;
                  wechatRef.current.scrollTo({ top, behavior: 'smooth' });
                }
              }

              // 3. 滚动编辑器到对应位置（根据标题在内容中的位置）
              if (editorRef.current && editorRef.current.el) {
                console.log('滚动编辑器');
                try {
                  // 获取标题文本
                  const headingText = el.textContent || '';
                  const editorTextarea = editorRef.current.el;
                  const editorContent = editorTextarea.value || '';

                  // 在编辑器内容中查找标题
                  // 尝试多种标题格式：# 标题, ## 标题, ### 标题 等
                  const escapedText = headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const patterns = [
                    new RegExp(`^#{1,6}\\s+${escapedText}\\s*$`, 'm'),
                    new RegExp(`^#{1,6}\\s+${escapedText}`, 'm'),
                    new RegExp(escapedText, 'i')
                  ];

                  let matchIndex = -1;
                  for (const pattern of patterns) {
                    const match = editorContent.match(pattern);
                    if (match && match.index !== undefined) {
                      matchIndex = match.index;
                      break;
                    }
                  }

                  if (matchIndex >= 0) {
                    // 计算到该位置的行数
                    const textBefore = editorContent.substring(0, matchIndex);
                    const linesBefore = textBefore.split('\n').length - 1;

                    // 读取实际的行高和字体大小
                    const computedStyle = window.getComputedStyle(editorTextarea);
                    const fontSize = parseFloat(computedStyle.fontSize) || 15;

                    // styles.css 中 .editor 的 line-height: 2em
                    // 所以实际行高是 fontSize * 2
                    const lineHeight = fontSize * 2;

                    console.log('fontSize:', fontSize, 'lineHeight:', lineHeight, 'linesBefore:', linesBefore);

                    // 计算滚动位置：标题行的位置，让标题显示在顶部
                    // 减去一点偏移量，让标题不会完全贴顶
                    const scrollTop = Math.max(0, linesBefore * lineHeight - 20);

                    editorTextarea.scrollTo({ top: scrollTop, behavior: 'smooth' });
                    console.log('编辑器已滚动到 scrollTop:', scrollTop);
                  } else {
                    console.warn('未在编辑器中找到标题:', headingText);
                  }
                } catch (err) {
                  console.warn('编辑器滚动失败:', err);
                }
              } else {
                console.warn('editorRef.current 或 .el 为空');
              }
            }} />
          </div>
        )}

        {/* 中间内容区 */}
        <div className="content-area">
          {/* 编辑模式：左右分栏 */}
          {viewMode === 'edit' && (
            <>
              <div className="editor-wrapper">
                <Editor
                  ref={editorRef}
                  value={content}
                  onChange={setContent}
                  onUploadingChange={(isUploading) => setEditorUploading(isUploading)}
                />
              </div>
              <div className="preview-wrapper">
                <div className="preview">
                  <div className="preview-inner">
                    <PreviewWithMermaid
                      html={sanitizedHtml}
                      ref={previewRef}
                    />
                  </div>
                </div>
              </div>
            </>
          )}


    {/* 仅编辑模式：只显示编辑 */}
              {viewMode === 'pure-edit' && (
                <div className="editor-wrapper edit-only">
                  <Editor
                  ref={editorRef}
                  value={content}
                  onChange={setContent}
                  onUploadingChange={(isUploading) => setEditorUploading(isUploading)}
                />
                </div>
              )}
            

          {/* 仅预览模式：只显示预览 */}
          {viewMode === 'preview' && (
            <div className="preview-wrapper preview-only">
              <div className="preview">
                <div className="preview-inner">
                  <PreviewWithMermaid
                    html={sanitizedHtml}
                    ref={previewRef}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 公众号区 */}
        {showWechat && (
          <div className="wechat-export">
            <div className="preview-inner">
              <PreviewWithMermaid
                html={sanitizedHtml}
                ref={wechatRef}
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
        {/* 新增：在状态栏显示和设置附件文件夹 */}
        <span
          title="点击设置 Obsidian 附件文件夹"
          style={{ cursor: "pointer", textDecoration: "underline" }}
          onClick={handleSetAttachmentFolder}
        >
          ⛳️ 设置默认图片目录： {attachmentFolder || "未设置图片目录，请设置。"}
        </span>
      </div>

      {epubWizard && (
        <div
          className="epub-meta-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="epub-meta-dialog-title"
          onClick={() => setEpubWizard(null)}
        >
          <div className="epub-meta-card" onClick={(e) => e.stopPropagation()}>
            <div className="epub-meta-title" id="epub-meta-dialog-title">
              导出 EPUB
            </div>
            <p className="epub-meta-hint">
              已找到 {epubWizard.files.length} 个 Markdown 文件，填写元数据后开始打包。
            </p>
            <div className="epub-meta-form">
              <label className="epub-meta-row">
                <span>书名</span>
                <input
                  type="text"
                  value={epubFormTitle}
                  onChange={(e) => setEpubFormTitle(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="epub-meta-row">
                <span>作者</span>
                <input
                  type="text"
                  value={epubFormAuthor}
                  onChange={(e) => setEpubFormAuthor(e.target.value)}
                  placeholder="可选"
                />
              </label>
              <label className="epub-meta-row epub-meta-check">
                <input
                  type="checkbox"
                  checked={epubFormPickCover}
                  onChange={(e) => setEpubFormPickCover(e.target.checked)}
                />
                <span>导出前选择封面图片</span>
              </label>
            </div>
            <div className="epub-meta-actions">
              <button
                type="button"
                className="toolbar-button"
                onClick={() => setEpubWizard(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={() => handleEpubMetaConfirm()}
              >
                开始导出
              </button>
            </div>
          </div>
        </div>
      )}

      {exportProgress.visible && (
        <div className="export-progress-overlay">
          <div className="export-progress-card">
            <div className="export-progress-title">
              {exportProgress.type === "pdf"
                ? "导出 PDF"
                : exportProgress.type === "epub"
                  ? "导出 EPUB"
                  : "导出图片"}
            </div>
            <div className="export-progress-message">
              {exportProgress.message || "正在处理，请稍候..."}
            </div>
            {exportProgress.type === "image" && exportProgress.totalCount > 0 && (
              <div className="export-progress-segment">
                <div className="export-progress-segment-label">
                  {`已生成图片：${Math.min(exportProgress.generatedCount, exportProgress.totalCount)} / ${exportProgress.totalCount}`}
                </div>
                <div className="export-progress-segment-bar">
                  <div
                    className="export-progress-segment-fill"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          (Math.min(exportProgress.generatedCount, exportProgress.totalCount) / Math.max(1, exportProgress.totalCount)) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <div className="export-progress-bar">
              <div
                className="export-progress-fill"
                style={{ width: `${Math.max(0, Math.min(100, exportProgress.progress))}%` }}
              />
            </div>
            <div className="export-progress-percent">
              {Math.round(Math.max(0, Math.min(100, exportProgress.progress)))}%
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast">
          <span>{toast.message}</span>
          {toast.pathLink ? (
            <span
              className="toast-path-link"
              title="点击打开所在目录"
              onClick={() => handleOpenInFolder(toast.pathLink)}
            >
              {toast.pathLink}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default App;
