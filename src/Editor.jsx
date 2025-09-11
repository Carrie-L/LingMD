// Editor.jsx
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

const UNDO_HISTORY_LIMIT = 100;
function EditorComponent({ value, onChange, onUploadingChange }, forwardedRef) {
  const textareaRef = useRef(null);
  const wrapperRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const lastPushTimeRef = useRef(0);
  const PUSH_DEBOUNCE_MS = 400;

  useEffect(() => {
    if (typeof value === 'string') {
      historyRef.current = [value];
      historyIndexRef.current = 0;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const curIdx = historyIndexRef.current;
    const hist = historyRef.current;
    const top = hist[curIdx];
    if (value !== undefined && value !== top) {
      pushHistory(value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (typeof onUploadingChange === 'function') onUploadingChange(isUploading);
  }, [isUploading, onUploadingChange]);

  const pushHistory = (newVal) => {
    const now = Date.now();
    if (now - lastPushTimeRef.current < PUSH_DEBOUNCE_MS) {
      const idx = historyIndexRef.current;
      if (idx >= 0) historyRef.current[idx] = newVal;
      lastPushTimeRef.current = now;
      return;
    }
    lastPushTimeRef.current = now;

    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current.splice(historyIndexRef.current + 1);
    }
    historyRef.current.push(newVal);
    if (historyRef.current.length > UNDO_HISTORY_LIMIT) {
      historyRef.current.shift();
    }
    historyIndexRef.current = historyRef.current.length - 1;
  };

  const doUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prev = historyRef.current[historyIndexRef.current];
      applyHistoryValue(prev);
    }
  };
  const doRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const next = historyRef.current[historyIndexRef.current];
      applyHistoryValue(next);
    }
  };
  const applyHistoryValue = (val) => {
    onChange && onChange(val);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const pos = Math.min(val.length, textareaRef.current.selectionStart || 0);
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleLocalChange = (e) => {
    const newVal = e.target.value;
    onChange && onChange(newVal);
    pushHistory(newVal);
  };

  const handleKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const modShift = mod && e.shiftKey;

    if (mod && !e.altKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      doUndo();
      return;
    }
    if ((mod && !e.altKey && !e.shiftKey && (e.key === 'y' || e.key === 'Y')) ||
      (modShift && (e.key === 'Z' || e.key === 'z'))) {
      e.preventDefault();
      doRedo();
      return;
    }

    if (mod && !e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      toggleWrap('**', '**');
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      toggleWrap('*', '*');
      return;
    }
    if (!mod && !e.altKey && !e.shiftKey && e.key === '`') {
      e.preventDefault();
      toggleWrap('`', '`');
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      insertLink();
      return;
    }
    if (modShift && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      toggleCodeBlock();
      return;
    }
    if (modShift && (e.key === 'L' || e.key === 'l')) {
      e.preventDefault();
      toggleLinePrefix('- ');
      return;
    }
    if (modShift && (e.key === 'O' || e.key === 'o')) {
      e.preventDefault();
      toggleOrderedList();
      return;
    }
    if (modShift && (e.key === 'H' || e.key === 'h')) {
      e.preventDefault();
      toggleLinePrefix('# ');
      return;
    }

    if (e.key === 'Escape') {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        e.preventDefault();
        return;
      }
      if (window.electronAPI && typeof window.electronAPI.exitFullScreen === 'function') {
        window.electronAPI.exitFullScreen().catch(() => {});
        e.preventDefault();
        return;
      }
    }
  };

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

  const handleFileSelect = async (eOrFiles) => {
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
    if (eOrFiles && eOrFiles.target && eOrFiles.target.files) eOrFiles.target.value = '';
  };

  const handleImageUpload = async (file) => {
    try {
      setIsUploading(true);
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

        if (result && result.success) {
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

  const insertImageMarkdown = (imagePath, altText) => {
    const ta = textareaRef.current;
    const textVal = value || '';
    if (!ta) {
      const appended = textVal + `\n\n![${altText || '图片'}](${imagePath})\n\n`;
      onChange && onChange(appended);
      pushHistory(appended);
      return;
    }
    const cursorPosition = ta.selectionStart;
    const textBefore = textVal.substring(0, cursorPosition);
    const textAfter = textVal.substring(cursorPosition);
    const imageMarkdown = `![](${imagePath})`;
    const needNewLineBefore = textBefore.length > 0 && !textBefore.endsWith('\n');
    const needNewLineAfter = textAfter.length > 0 && !textAfter.startsWith('\n');
    const newContent =
      textBefore +
      (needNewLineBefore ? '\n\n' : '\n') +
      imageMarkdown +
      (needNewLineAfter ? '\n\n' : '\n') +
      textAfter;

    onChange && onChange(newContent);
    pushHistory(newContent);

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

  // 对父组件暴露：**把真实可滚动元素（textarea DOM）暴露给父组件**
  useImperativeHandle(forwardedRef, () => ({
    // 直接返回 DOM 节点（外部 hook 可以直接用 el.scrollTop/read/write）
    el: textareaRef.current,
    focus: () => textareaRef.current && textareaRef.current.focus(),
    getValue: () => textareaRef.current && textareaRef.current.value,
    handleFileSelect,
  }), []);

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
    pushHistory(newVal);
    setTimeout(() => {
      if (!textareaRef.current) return;
      textareaRef.current.setSelectionRange(selStart, selEnd);
      textareaRef.current.focus();
    }, 0);
  };

  const toggleWrap = (prefix, suffix) => {
    const ta = textareaRef.current;
    const { start, end } = getSelection();
    const text = value || '';
    const before = text.slice(0, start);
    const selected = text.slice(start, end);
    const after = text.slice(end);

    const preStart = start - prefix.length;
    const postEnd = end + suffix.length;

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

    const newVal = before + prefix + selected + suffix + after;
    const newStart = start + prefix.length;
    const newEnd = newStart + selected.length;
    setValueAndSelect(newVal, newStart, newEnd);
  };

  const toggleCodeBlock = () => {
    const { start, end } = getSelection();
    const text = value || '';
    const before = text.slice(0, start);
    const selected = text.slice(start, end);
    const after = text.slice(end);

    const pre = text.slice(Math.max(0, start - 4), start);
    const post = text.slice(end, end + 4);
    if (pre.endsWith('```\n') && post.startsWith('\n```')) {
      const newVal = text.slice(0, start - 4) + selected + text.slice(end + 4);
      setValueAndSelect(newVal, start - 4, start - 4 + selected.length);
      return;
    }

    const block = '```\n' + selected + '\n```';
    const needNewlineBefore = before.length === 0 || before.endsWith('\n') ? '' : '\n';
    const needNewlineAfter = after.length === 0 || after.startsWith('\n') ? '' : '\n';
    const newVal = before + needNewlineBefore + block + needNewlineAfter + after;
    const newStart = before.length + needNewlineBefore.length + 3;
    const newEnd = newStart + selected.length;
    setValueAndSelect(newVal, newStart, newEnd);
  };

  const toggleLinePrefix = (prefix) => {
    const ta = textareaRef.current;
    const { start, end } = getSelection();
    const text = value || '';

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
    const newStart = start + (allHave ? -prefix.length : prefix.length);
    const newEnd = end + (processed.length - (lineEnd - lineStart));
    setValueAndSelect(newVal, newStart, newEnd);
  };

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
    const newStart = start;
    const newEnd = newStart + processed.length;
    setValueAndSelect(newVal, newStart, newEnd);
  };

  const insertLink = async () => {
    const { start, end } = getSelection();
    const selected = (value || '').slice(start, end);
    const url = prompt('输入链接 URL:', 'https://');
    if (!url) return;
    const textForLink = selected || prompt('链接文本（留空使用 URL）:', url) || url;
    const linkMd = `[${textForLink}](${url})`;

    const newVal = (value || '').slice(0, start) + linkMd + (value || '').slice(end);
    const newStart = start;
    const newEnd = start + linkMd.length;
    setValueAndSelect(newVal, newStart, newEnd);
  };

  return (
    <div className="editor" ref={wrapperRef} style={{ height: '100%', width: '100%' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleLocalChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        placeholder={`在这里输入 Markdown，或者打开文件...`}
        className="editor-textarea"
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          border: 'none',
          outline: 'none',
          resize: 'none',
          fontFamily: 'inherit',
          background: 'transparent',
          padding: '20px',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.8'
        }}
      />
    </div>
  );
}

export default forwardRef(EditorComponent);
