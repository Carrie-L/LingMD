// Editor.jsx
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

function EditorComponent({ value, onChange, onUploadingChange }, ref) {
  const textareaRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  // 当上传状态变化时，如果父组件传了回调就通知
  useEffect(() => {
    if (typeof onUploadingChange === 'function') onUploadingChange(isUploading);
  }, [isUploading, onUploadingChange]);

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

        console.log("handleImageUpload result",result);
        

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
    console.log("insertImageMarkdown imagePath",imagePath);
     console.log("insertImageMarkdown altText",altText);


    const textarea = textareaRef.current;
    if (!textarea) {
      // 兜底：直接把图片追加到文本末尾
      const appended = (value || '') + `\n\n![${altText || '图片'}](${imagePath})\n\n`;
      onChange && onChange(appended);
      return;
    }

    const cursorPosition = textarea.selectionStart;
    const textBefore = (value || '').substring(0, cursorPosition);
    const textAfter = (value || '').substring(cursorPosition);

    const imageMarkdown = `![](${imagePath})`;//${altText || '图片'}

    const needNewLineBefore = textBefore.length > 0 && !textBefore.endsWith('\n');
    const needNewLineAfter = textAfter.length > 0 && !textAfter.startsWith('\n');

    const newContent =
      textBefore +
      (needNewLineBefore ? '\n' : '') +
      imageMarkdown +
      (needNewLineAfter ? '\n' : '') +
      textAfter;

    // 使用传入的 onChange 更新父组件 content（保持 Editor 为受控组件）
    onChange && onChange(newContent);

    // 恢复光标位置（因为 value 来自父组件，等 React 更新后再设置）
    setTimeout(() => {
      const newCursorPosition = cursorPosition +
        (needNewLineBefore ? 1 : 0) +
        imageMarkdown.length +
        (needNewLineAfter ? 1 : 0);

      // 只有在 textareaRef.current 存在时才设置
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
  useImperativeHandle(ref, () => ({
    handleFileSelect,
    isUploading,
    // 暴露一个外部可以触发粘贴处理（如果需要）
    handlePasteFile: handlePaste
  }), [isUploading, value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange && onChange(e.target.value)}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      placeholder={`在这里输入Markdown内容...

支持图片：
• Ctrl+V 粘贴剪贴板中的图片
• 拖拽图片文件到编辑区
• 插入图片按钮`}
      className="editor"
    />
  );
}

export default forwardRef(EditorComponent);
