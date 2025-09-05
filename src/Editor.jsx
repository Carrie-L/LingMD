// Editor.jsx
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

const UNDO_HISTORY_LIMIT = 100; // 设置历史记录上限为 100 步

function EditorComponent({ value, onChange, onUploadingChange }, ref) {
  const textareaRef = useRef(null);
  const wrapperRef = useRef(null); // 用于请求 DOM 全屏
  const [isUploading, setIsUploading] = useState(false);

  // ----- undo/redo 历史栈（使用 refs 避免频繁重渲染） -----
  const historyRef = useRef([]);     // 存放内容快照
  const historyIndexRef = useRef(-1);
  const lastPushTimeRef = useRef(0);
  const PUSH_DEBOUNCE_MS = 400; // 连续打字时不每次都入栈，避免太多小快照

  // 初始化历史（当组件挂载或 value 首次有值）
  useEffect(() => {
    if (typeof value === 'string') {
      historyRef.current = [value];
      historyIndexRef.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 如果外部 value 改变（例如从父组件同步过来），并与当前历史顶不同，入栈
  useEffect(() => {
    const curIdx = historyIndexRef.current;
    const hist = historyRef.current;
    const top = hist[curIdx];
    if (value !== undefined && value !== top) {
      pushHistory(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // 当上传状态变化时，如果父组件传了回调就通知
  useEffect(() => {
    if (typeof onUploadingChange === 'function') onUploadingChange(isUploading);
  }, [isUploading, onUploadingChange]);

  // ==============  快捷键 ==============
  // ctrl+z 撤销。push 历史：去重、截断 redo 分支、限制大小
  const pushHistory = (newVal) => {
    const now = Date.now();
    // 防抖：如果上次入栈时间过近，用覆盖当前栈顶的方式（避免每次按键都增加一项）
    if (now - lastPushTimeRef.current < PUSH_DEBOUNCE_MS) {
      const idx = historyIndexRef.current;
      if (idx >= 0) historyRef.current[idx] = newVal;
      lastPushTimeRef.current = now;
      return;
    }
    lastPushTimeRef.current = now;

    // 如果当前不是栈顶（即做过 undo），截断 redo 分支
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current.splice(historyIndexRef.current + 1);
    }
    historyRef.current.push(newVal);
    // 超出限制则丢掉最早
    if (historyRef.current.length > UNDO_HISTORY_LIMIT) {
      historyRef.current.shift();
    }
    historyIndexRef.current = historyRef.current.length - 1;
  };

  // undo 操作
  const doUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prev = historyRef.current[historyIndexRef.current];
      applyHistoryValue(prev);
    }
  };

  // redo 操作
  const doRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const next = historyRef.current[historyIndexRef.current];
      applyHistoryValue(next);
    }
  };

  // 把历史值应用到编辑器（同时恢复光标到合适位置）
  const applyHistoryValue = (val) => {
    // 使用 onChange 更新父组件 content（保持受控）
    onChange && onChange(val);
    // 恢复焦点（并把光标放到末尾，尽量保持体验）
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const pos = Math.min(val.length, textareaRef.current.selectionStart || 0);
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  // 当 textarea 内容变化 -> 通知父组件并把新值入栈
  const handleLocalChange = (e) => {
    const newVal = e.target.value;
    onChange && onChange(newVal);
    pushHistory(newVal);
  };

  // 处理 Ctrl/Cmd / 快捷键
const handleKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const modShift = mod && e.shiftKey;

    // 1) 撤销 / 重做
    if (mod && !e.altKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      doUndo();
      return;
    }
    if ((mod && !e.altKey && !e.shiftKey && (e.key === 'y' || e.key === 'Y')) ||
      (modShift && (e.key === 'Z' || e.key === 'z'))) { // 修正：小写z也判断
      e.preventDefault();
      doRedo();
      return;
    }

    // 2) 常用 Markdown 快捷键
    // Ctrl/Cmd + B：粗体
    if (mod && !e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      toggleWrap('**', '**');
      return;
    }
    // Ctrl/Cmd + I：斜体
    if (mod && !e.altKey && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      toggleWrap('*', '*');
      return;
    }
    // Ctrl/Cmd + `：行内代码
    if (mod && !e.altKey && !e.shiftKey && e.key === '`') {
      e.preventDefault();
      toggleWrap('`', '`');
      return;
    }
    // Ctrl/Cmd + K：插入链接
    if (mod && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      insertLink();
      return;
    }
    // Ctrl/Cmd + Shift + C：代码块
    if (modShift && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      toggleCodeBlock();
      return;
    }
    // Ctrl/Cmd + Shift + L：无序列表
    if (modShift && (e.key === 'L' || e.key === 'l')) {
      e.preventDefault();
      toggleLinePrefix('- ');
      return;
    }
    // Ctrl/Cmd + Shift + O：有序列表
    if (modShift && (e.key === 'O' || e.key === 'o')) {
      e.preventDefault();
      toggleOrderedList();
      return;
    }
    // Ctrl/Cmd + Shift + H：标题1
    if (modShift && (e.key === 'H' || e.key === 'h')) {
      e.preventDefault();
      toggleLinePrefix('# ');
      return;
    }

    // 3) Esc 退出全屏
    if (e.key === 'Escape') {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        e.preventDefault();
        return;
      }
      if (window.electronAPI && typeof window.electronAPI.exitFullScreen === 'function') {
        window.electronAPI.exitFullScreen().catch((err) => {
          console.debug('exitFullScreen failed', err);
        });
        e.preventDefault();
        return;
      }
    }
  };


  // ======= 在编辑区粘贴图片 =========
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items || [];
    for (let item of items) {
      if (item.type && item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await handleImageUpload(file);
        break;
      }
    }
  };

  // 对外暴露的文件选择处理（供父组件调用 input.onChange 时传入 event）
  const handleFileSelect = async (eOrFiles) => {
    // 支持直接传入 input 的 event 或 FileList/Array
    let files = [];
    if (eOrFiles && eOrFiles.target && eOrFiles.target.files) {
      files = Array.from(eOrFiles.target.files);
    } else if (Array.isArray(eOrFiles)) {
      files = eOrFiles;
    } else if (eOrFiles instanceof FileList) {
      files = Array.from(eOrFiles);
    }
    const imageFiles = files.filter(f => f.type && f.type.startsWith('image/'));
    for (let file of imageFiles) {
      await handleImageUpload(file);
    }
    // 如果是 input event，清空 value 以允许重复选择同一文件
    if (eOrFiles && eOrFiles.target && eOrFiles.target.files) eOrFiles.target.value = '';
  };

  // 处理图片上传
  const handleImageUpload = async (file) => {
    try {
      setIsUploading(true);
      // 生成唯一文件名
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const fileExtension = (file.name && file.name.split('.').pop()) || 'png';
      const fileName = `image_${timestamp}_${randomStr}.${fileExtension}`;

      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      if (window.electronAPI && window.electronAPI.saveImage) {
        const result = await window.electronAPI.saveImage({
          fileName,
          buffer: Array.from(uint8Array),
          originalName: file.name
        });

        console.log("handleImageUpload result", result);


        if (result && result.success) {
          // result.fullPath 或 result.relativePath，取决于 main 返回什么
          // const pathToUse = result.fullPath || result.relativePath || fileName;
          insertImageMarkdown(result.relativePath, file.name);
        } else {
          console.error('图片保存失败:', result && result.error);
          alert('图片保存失败: ' + (result && result.error));
        }
      } else {
        console.error('window.electronAPI.saveImage 未定义');
        alert('保存 API 未就绪');
      }
    } catch (error) {
      console.error('处理图片失败:', error);
      alert('处理图片失败: ' + (error && error.message));
    } finally {
      setIsUploading(false);
    }
  };

  // 插入图片Markdown语法 —— 改为通过 onChange 更新父组件的 content
const insertImageMarkdown = (imagePath, altText) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      const appended = (value || '') + `\n\n![${altText || '图片'}](${imagePath})\n\n`;
      onChange && onChange(appended);
      pushHistory(appended); // 也要记录历史
      return;
    }
    const cursorPosition = textarea.selectionStart;
    const textBefore = (value || '').substring(0, cursorPosition);
    const textAfter = (value || '').substring(cursorPosition);
    const imageMarkdown = `![](${imagePath})`;
    const needNewLineBefore = textBefore.length > 0 && !textBefore.endsWith('\n');
    const needNewLineAfter = textAfter.length > 0 && !textAfter.startsWith('\n');
    const newContent =
      textBefore +
      (needNewLineBefore ? '\n\n' : '\n') + // 插入图片前后最好空一行
      imageMarkdown +
      (needNewLineAfter ? '\n\n' : '\n') +
      textAfter;
      
    onChange && onChange(newContent);
    pushHistory(newContent); // 记录历史

    setTimeout(() => {
      const newCursorPosition = (textBefore + (needNewLineBefore ? '\n\n' : '\n') + imageMarkdown).length;
      if (textareaRef.current) {
        textareaRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files || []);
    await handleFileSelect(files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // 使用 forwardRef 暴露方法给父组件
  // useImperativeHandle(ref, () => ({
  //   handleFileSelect,
  //   isUploading,
  //   handlePasteFile: handlePaste,
  //   // 允许父组件调用 DOM 全屏
  //   enterFullscreen: async () => {
  //     try {
  //       if (wrapperRef.current && wrapperRef.current.requestFullscreen) {
  //         await wrapperRef.current.requestFullscreen();
  //       } else if (window.electronAPI && typeof window.electronAPI.enterFullScreen === 'function') {
  //         // 如果你在 main 实现了 native fullscreen，可以调用它
  //         window.electronAPI.enterFullScreen();
  //       }
  //     } catch (err) {
  //       console.error('enterFullscreen failed', err);
  //     }
  //   }
  // }), [isUploading, value]);



  // ----- helper functions -----
  const getSelection = () => {
    const ta = textareaRef.current;
    return {
      start: ta.selectionStart,
      end: ta.selectionEnd,
      text: (value || '').substring(ta.selectionStart, ta.selectionEnd)
    };
  };

const setValueAndSelect = (newVal, selStart, selEnd) => {
    onChange && onChange(newVal);
    pushHistory(newVal); // 所有改变内容的操作都应记录历史
    setTimeout(() => {
      if (!textareaRef.current) return;
      textareaRef.current.setSelectionRange(selStart, selEnd);
      textareaRef.current.focus();
    }, 0);
  };

  // 切换包裹（如 **bold**）
  const toggleWrap = (prefix, suffix) => {
    const ta = textareaRef.current;
    const { start, end } = getSelection();
    const text = value || '';

    const before = text.slice(0, start);
    const selected = text.slice(start, end);
    const after = text.slice(end);

    const preStart = start - prefix.length;
    const postEnd = end + suffix.length;

    // 如果已被包裹则去掉包裹
    if (
      preStart >= 0 &&
      text.slice(preStart, start) === prefix &&
      text.slice(end, postEnd) === suffix
    ) {
      const newVal = text.slice(0, preStart) + selected + text.slice(postEnd);
      const newStart = preStart;
      const newEnd = newStart + selected.length;
      setValueAndSelect(newVal, newStart, newEnd);
      return;
    }

    // 否则包裹
    const newVal = before + prefix + selected + suffix + after;
    const newStart = start + prefix.length;
    const newEnd = newStart + selected.length;
    setValueAndSelect(newVal, newStart, newEnd);
  };

  // toggle 代码块 ``` ... ```
  const toggleCodeBlock = () => {
    const { start, end } = getSelection();
    const text = value || '';
    const before = text.slice(0, start);
    const selected = text.slice(start, end);
    const after = text.slice(end);

    // 如果选中内容前后已经有三个反引号，则移除
    const pre = text.slice(Math.max(0, start - 4), start); // 可能含换行
    const post = text.slice(end, end + 4);
    if (pre.endsWith('```\n') && post.startsWith('\n```')) {
      const newVal = text.slice(0, start - 4) + selected + text.slice(end + 4);
      setValueAndSelect(newVal, start - 4, start - 4 + selected.length);
      return;
    }

    // 否则插入代码块（在前后各加换行包裹）
    const block = '```\n' + selected + '\n```';
    const needNewlineBefore = before.length === 0 || before.endsWith('\n') ? '' : '\n';
    const needNewlineAfter = after.length === 0 || after.startsWith('\n') ? '' : '\n';
    const newVal = before + needNewlineBefore + block + needNewlineAfter + after;
    const newStart = before.length + needNewlineBefore.length + 3; // 3 = ```\n
    const newEnd = newStart + selected.length;
    setValueAndSelect(newVal, newStart, newEnd);
  };

  // 在每一行前加/去掉前缀（如 '- ' 或 '# '）
  const toggleLinePrefix = (prefix) => {
    const ta = textareaRef.current;
    const { start, end } = getSelection();
    const text = value || '';

    // 找到选区覆盖的整行
    const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lineEndPos = text.indexOf('\n', end);
    const lineEnd = lineEndPos === -1 ? text.length : lineEndPos;

    const selectedLines = text.slice(lineStart, lineEnd).split('\n');

    const allHave = selectedLines.every(l => l.startsWith(prefix));
    let processed;
    if (allHave) {
      processed = selectedLines.map(l => l.slice(prefix.length)).join('\n');
    } else {
      processed = selectedLines.map(l => (l.trim() === '' ? l : prefix + l)).join('\n');
    }

    const newVal = text.slice(0, lineStart) + processed + text.slice(lineEnd);
    // 计算新的选区位置
    const newStart = start + (allHave ? -prefix.length : prefix.length);
    const newEnd = end + (processed.length - (lineEnd - lineStart));
    setValueAndSelect(newVal, newStart, newEnd);
  };

  // 有序列表：给每行添加编号或移除编号（最简单实现：若每行以数字+'. '开头则移除，否则按顺序添加）
  const toggleOrderedList = () => {
    const ta = textareaRef.current;
    const { start, end } = getSelection();
    const text = value || '';
    const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lineEndPos = text.indexOf('\n', end);
    const lineEnd = lineEndPos === -1 ? text.length : lineEndPos;
    const selectedLines = text.slice(lineStart, lineEnd).split('\n');

    const allHave = selectedLines.every(l => /^\d+\. /.test(l));
    let processed;
    if (allHave) {
      processed = selectedLines.map(l => l.replace(/^\d+\. /, '')).join('\n');
    } else {
      processed = selectedLines.map((l, idx) => (l.trim() === '' ? l : `${idx + 1}. ${l}`)).join('\n');
    }

    const newVal = text.slice(0, lineStart) + processed + text.slice(lineEnd);
    const newStart = start + (allHave ? 0 : 0); // 简单处理，可能需要微调
    const newEnd = newStart + processed.length;
    setValueAndSelect(newVal, newStart, newEnd);
  };

  // 插入链接（弹窗输入 URL 和文本）
  const insertLink = async () => {
    const { start, end } = getSelection();
    const selected = (value || '').slice(start, end);
    // 你可以换成更友好的 UI 而不是 prompt
    const url = prompt('输入链接 URL:', 'https://');
    if (!url) return;
    const textForLink = selected || prompt('链接文本（留空使用 URL）:', url) || url;
    const linkMd = `[${textForLink}](${url})`;

    const newVal = (value || '').slice(0, start) + linkMd + (value || '').slice(end);
    const newStart = start;
    const newEnd = start + linkMd.length;
    setValueAndSelect(newVal, newStart, newEnd);
  };


  // 渲染
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={handleLocalChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      placeholder="在这里输入 Markdown，或者打开文件...

第一次启动时，请设置 <默认文档保存目录> 和 <默认图片保存目录> ..."
      className="editor"
      style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}
    />
  );
}

export default forwardRef(EditorComponent);
