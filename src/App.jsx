import React, { useState, useEffect } from "react";
import Editor from "./Editor.jsx";
import Preview from "./Preview.jsx";
import Outline from "./Outline.jsx";
import WechatExport from "./WechatExport.jsx"; 
import { useMarkdownRenderer } from './useMarkdownRenderer'; 

function App() {
  // 直接解析 URL 参数
  const query = new URLSearchParams(window.location.search);
  const mode = query.get("mode") || "edit"; // edit | preview
  const [showWechat, setShowWechat] = useState(false); // ✅ 新增：控制是否显示公众号区域
  
  const [content, setContent] = useState("");
  const [filePath, setFilePath] = useState(null);
  const [status, setStatus] = useState("未保存");
  const [toast, setToast] = useState("");
  const [activeRightTab, setActiveRightTab] = useState("outline"); // outline | wechat

  // ✅ 直接在顶层组件调用 Hook，获取渲染结果
  // 这样，我们只需要渲染一次，所有子组件和复制功能都可以共享结果
  const { rawHtml, sanitizedHtml } = useMarkdownRenderer(content, filePath);

  const [attachmentFolder, setAttachmentFolder] = useState(null); // ✅ 新增 state

  // ✅ 1. 新增一个刷新触发器 state，它就是一个简单的计数器
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ✅ 2. 新增一个 state 来管理当前选中的主题
  const [currentTheme, setCurrentTheme] = useState('dark'); // 默认为亮色主题

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
    // 现在可以直接访问 value 和 rawHtml
    if (!content.trim()) {
      alert("没有内容可复制");
      return;
    }

    try {
      console.log("Step 1: Using pre-rendered raw HTML for conversion...");
      // 1. 直接使用 Hook 生成的 rawHtml，它已经包含了 safe-file:// 路径
      // 这避免了重新渲染，保证了内容一致性
      // ✅ 3. 获取当前选中的主题对象
      const selectedTheme = codeBlockThemes[currentTheme];

      console.log("Step 2: Sending to main process with theme:", selectedTheme);
      // ✅ 4. 将 HTML 和主题对象一起传递给主进程
      const finalHtml = await window.electronAPI.convertHtmlForClipboard({
        html: rawHtml,
        theme: selectedTheme,
      });

      // 2. 将此 HTML 发送到主进程进行 Base64 转换
      console.log("Step 2: Sending to main process for Base64 conversion...");
    
      console.log("finalHtml before clipboard:", finalHtml);

      // 3. 写入剪贴板
      console.log("Step 3: Writing to clipboard...");
      const blobHtml = new Blob([finalHtml], { type: "text/html" });
      const blobText = new Blob([content], { type: "text/plain" });
      const clipboardItem = new ClipboardItem({
        "text/html": blobHtml,
        "text/plain": blobText,
      });

      await navigator.clipboard.write([clipboardItem]);
      
      console.log("Successfully copied to clipboard for WeChat!");
      showToast("已成功复制到剪贴板！");

    } catch (error) {
      console.error("Failed to copy for WeChat:", error);
      alert("复制失败，详情请查看控制台");
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
        <button onClick={() => {
          console.log('Toggling showWechat from:', showWechat);
          setShowWechat(!showWechat);
        }}>📱 公众号</button>
        {/* ✅ (可选) 新增一个切换主题的按钮/下拉菜单 */}
        <select value={currentTheme} onChange={(e) => setCurrentTheme(e.target.value)}>
          <option value="light">亮色代码</option>
          <option value="dark">暗色代码</option>
        </select>
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
