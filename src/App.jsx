import React, { useState, useEffect } from "react";
import Editor from "./Editor.jsx";
import Preview from "./Preview.jsx";

function App() {
  const [content, setContent] = useState("");
  const [filePath, setFilePath] = useState(null);
  const [status, setStatus] = useState("未保存");
  const [toast, setToast] = useState("");

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

return (
  <div className="app light">
    <div className="toolbar">
      <button onClick={handleNewFile}>🆕 新建</button>
      <button onClick={handleOpen}>📂 打开</button>
      <button onClick={handleSave}>💾 保存</button>
      <button onClick={handleSetDefaultDir}>⚙️ 设置默认文件夹</button>
    </div>
    <div className="main">
      <Editor value={content} onChange={setContent} />
      <Preview value={content} />
    </div>
    <div className="status-bar">
      <span>{filePath || "未打开文件"}</span>
      <span>{status}</span>
      <span>{wordCount} 字</span>
      {/* ⚡ 点击默认文件夹路径 → 打开系统资源管理器 */}
      <span
        title="点击打开默认文件夹"
        style={{ cursor: "pointer", textDecoration: "underline" }}
        onClick={handleOpenDefaultDir}
      >
        📂 {defaultDir}
      </span>
    </div>
    {toast && <div className="toast">{toast}</div>}
  </div>
);






}

export default App;
