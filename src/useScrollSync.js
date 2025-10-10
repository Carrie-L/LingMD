// useScrollSync.js
import { useEffect, useRef, useCallback } from 'react';

export const useScrollSync = (content, enabled = true) => {
  const editorRef = useRef(null);
  const previewRef = useRef(null);
  const wechatRef = useRef(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);

  // 计算编辑器中光标所在行数
  const getEditorLineInfo = useCallback((editorElement) => {
    if (!editorElement) return { line: 0, lineHeight: 20 };
    
    const textarea = editorElement.querySelector('textarea');
    if (!textarea) return { line: 0, lineHeight: 20 };
    
    const cursorPosition = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPosition);
    const lines = textBefore.split('\n');
    const currentLine = lines.length - 1;
    
    // 计算行高
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = parseInt(computedStyle.lineHeight) || 20;
    
    return { line: currentLine, lineHeight };
  }, []);

  // 计算预览区中对应的位置
  const scrollToLineInPreview = useCallback((targetElement, lineIndex, lineHeight, sourceScrollTop, sourceMaxScroll) => {
    if (!targetElement) return;

    // 检查源元素是否在顶部或底部（容差 1px）
    const isAtTop = sourceScrollTop <= 1;
    const isAtBottom = sourceScrollTop >= sourceMaxScroll - 1;

    if (isAtTop) {
      // 强制滚动到顶部
      targetElement.scrollTop = 0;
      return;
    }

    if (isAtBottom) {
      // 强制滚动到底部
      const maxScroll = targetElement.scrollHeight - targetElement.clientHeight;
      targetElement.scrollTop = maxScroll;
      return;
    }

    // 在预览区查找对应的元素位置
    const scrollPosition = lineIndex * lineHeight;

    // 确保滚动位置在有效范围内
    const maxScroll = targetElement.scrollHeight - targetElement.clientHeight;
    const finalScrollPosition = Math.min(scrollPosition, maxScroll);

    targetElement.scrollTop = Math.max(0, finalScrollPosition);
  }, []);

  // 从预览区滚动位置反推编辑器位置
  const getEditorLineFromPreviewScroll = useCallback((previewElement, editorElement) => {
    if (!previewElement || !editorElement) return 0;
    
    const { scrollTop } = previewElement;
    const textarea = editorElement.querySelector('textarea');
    if (!textarea) return 0;
    
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = parseInt(computedStyle.lineHeight) || 20;
    
    // 根据滚动位置估算行数
    const estimatedLine = Math.floor(scrollTop / lineHeight);
    return estimatedLine;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const editor = editorRef.current;
    const preview = previewRef.current;
    const wechat = wechatRef.current;
    
    if (!editor) return;

    const syncFromEditor = () => {
      if (isScrollingRef.current) return;

      isScrollingRef.current = true;

      try {
        const { line, lineHeight } = getEditorLineInfo(editor);
        const { scrollTop, scrollHeight, clientHeight } = editor;
        const maxScroll = scrollHeight - clientHeight;

        // 同步到预览区
        if (preview) {
          scrollToLineInPreview(preview, line, lineHeight, scrollTop, maxScroll);
        }

        // 同步到微信预览区
        if (wechat) {
          scrollToLineInPreview(wechat, line, lineHeight, scrollTop, maxScroll);
        }
      } catch (error) {
        console.warn('Editor sync error:', error);

        // 降级到比例同步
        const { scrollTop, scrollHeight, clientHeight } = editor;
        const maxScroll = scrollHeight - clientHeight;

        // 检查顶部和底部
        const isAtTop = scrollTop <= 1;
        const isAtBottom = scrollTop >= maxScroll - 1;

        [preview, wechat].forEach(target => {
          if (target && target !== editor) {
            if (isAtTop) {
              target.scrollTop = 0;
            } else if (isAtBottom) {
              const targetMaxScroll = target.scrollHeight - target.clientHeight;
              target.scrollTop = targetMaxScroll;
            } else {
              const scrollRatio = maxScroll <= 0 ? 0 : scrollTop / maxScroll;
              const targetMaxScroll = target.scrollHeight - target.clientHeight;
              target.scrollTop = Math.max(0, targetMaxScroll * scrollRatio);
            }
          }
        });
      }

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 50);
    };

    const syncFromPreview = (sourceElement) => {
      if (isScrollingRef.current) return;

      isScrollingRef.current = true;

      try {
        const { scrollTop, scrollHeight, clientHeight } = sourceElement;
        const maxScroll = scrollHeight - clientHeight;

        // 检查顶部和底部
        const isAtTop = scrollTop <= 1;
        const isAtBottom = scrollTop >= maxScroll - 1;

        if (isAtTop) {
          // 强制所有区域滚动到顶部
          if (editor) editor.scrollTop = 0;
          [preview, wechat].forEach(target => {
            if (target && target !== sourceElement) {
              target.scrollTop = 0;
            }
          });
        } else if (isAtBottom) {
          // 强制所有区域滚动到底部
          if (editor) {
            const editorMaxScroll = editor.scrollHeight - editor.clientHeight;
            editor.scrollTop = editorMaxScroll;
          }
          [preview, wechat].forEach(target => {
            if (target && target !== sourceElement) {
              const targetMaxScroll = target.scrollHeight - target.clientHeight;
              target.scrollTop = targetMaxScroll;
            }
          });
        } else {
          // 中间位置，使用正常的同步逻辑
          const editorLine = getEditorLineFromPreviewScroll(sourceElement, editor);

          // 滚动编辑器到对应行
          const textarea = editor.querySelector('textarea');
          if (textarea) {
            const computedStyle = window.getComputedStyle(textarea);
            const lineHeight = parseInt(computedStyle.lineHeight) || 20;
            const targetScrollTop = editorLine * lineHeight;
            const editorMaxScroll = editor.scrollHeight - editor.clientHeight;
            editor.scrollTop = Math.min(targetScrollTop, editorMaxScroll);
          }

          // 同步到另一个预览区
          const targets = [preview, wechat].filter(el => el && el !== sourceElement);
          targets.forEach(target => {
            if (target) {
              const scrollRatio = maxScroll <= 0 ? 0 : scrollTop / maxScroll;
              const targetMaxScroll = target.scrollHeight - target.clientHeight;
              target.scrollTop = Math.max(0, targetMaxScroll * scrollRatio);
            }
          });
        }
      } catch (error) {
        console.warn('Preview sync error:', error);

        // 降级到比例同步
        const { scrollTop, scrollHeight, clientHeight } = sourceElement;
        const maxScroll = scrollHeight - clientHeight;

        // 检查顶部和底部
        const isAtTop = scrollTop <= 1;
        const isAtBottom = scrollTop >= maxScroll - 1;

        [editor, ...(wechat === sourceElement ? [preview] : wechat ? [wechat] : [])].forEach(target => {
          if (target && target !== sourceElement) {
            if (isAtTop) {
              target.scrollTop = 0;
            } else if (isAtBottom) {
              const targetMaxScroll = target.scrollHeight - target.clientHeight;
              target.scrollTop = targetMaxScroll;
            } else {
              const scrollRatio = maxScroll <= 0 ? 0 : scrollTop / maxScroll;
              const targetMaxScroll = target.scrollHeight - target.clientHeight;
              target.scrollTop = Math.max(0, targetMaxScroll * scrollRatio);
            }
          }
        });
      }

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 50);
    };

    // 添加事件监听器
    const editorHandler = () => syncFromEditor();
    const previewHandler = () => syncFromPreview(preview);
    const wechatHandler = () => syncFromPreview(wechat);

    editor.addEventListener('scroll', editorHandler, { passive: true });
    if (preview) preview.addEventListener('scroll', previewHandler, { passive: true });
    if (wechat) wechat.addEventListener('scroll', wechatHandler, { passive: true });

    // 监听编辑器内容变化和光标位置变化
    const handleEditorInput = () => {
      // 延迟执行，确保DOM更新完成
      setTimeout(syncFromEditor, 10);
    };

    const textarea = editor.querySelector('textarea');
    if (textarea) {
      textarea.addEventListener('input', handleEditorInput);
      textarea.addEventListener('keyup', handleEditorInput);
      textarea.addEventListener('click', handleEditorInput);
    }

    // 清理函数
    return () => {
      editor.removeEventListener('scroll', editorHandler);
      if (preview) preview.removeEventListener('scroll', previewHandler);
      if (wechat) wechat.removeEventListener('scroll', wechatHandler);
      
      if (textarea) {
        textarea.removeEventListener('input', handleEditorInput);
        textarea.removeEventListener('keyup', handleEditorInput);
        textarea.removeEventListener('click', handleEditorInput);
      }
      
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [enabled, content, getEditorLineInfo, scrollToLineInPreview, getEditorLineFromPreviewScroll]);

  return {
    editorRef,
    previewRef,
    wechatRef
  };
};