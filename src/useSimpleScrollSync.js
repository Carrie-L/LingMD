// useSimpleScrollSync.js - 简单有效的滚动位置比例同步
import { useEffect, useRef } from 'react';

export const useSimpleScrollSync = (enabled = true) => {
  const editorRef = useRef(null);
  const previewRef = useRef(null);
  const wechatRef = useRef(null);
  const isSyncingRef = useRef(false);
  const syncTimeoutRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const editor = editorRef.current;
    const preview = previewRef.current;
    const wechat = wechatRef.current;
    
    if (!editor) return;

    const syncScroll = (sourceElement, targetElements) => {
      if (isSyncingRef.current) return;
      
      isSyncingRef.current = true;
      
      try {
        const { scrollTop, scrollHeight, clientHeight } = sourceElement;
        const maxScroll = scrollHeight - clientHeight;
        
        // 如果没有滚动空间，不进行同步
        if (maxScroll <= 0) {
          isSyncingRef.current = false;
          return;
        }
        
        const scrollRatio = scrollTop / maxScroll;
        
        targetElements.forEach(targetElement => {
          if (targetElement && targetElement !== sourceElement) {
            const targetMaxScroll = targetElement.scrollHeight - targetElement.clientHeight;
            
            // 如果目标也没有滚动空间，跳过
            if (targetMaxScroll <= 0) return;
            
            const targetScrollTop = Math.max(0, targetMaxScroll * scrollRatio);
            targetElement.scrollTop = targetScrollTop;
          }
        });
      } catch (error) {
        console.warn('Scroll sync error:', error);
      }

      // 清除之前的定时器
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      
      // 设置新的定时器来重置同步状态
      syncTimeoutRef.current = setTimeout(() => {
        isSyncingRef.current = false;
      }, 50);
    };

    // 编辑器滚动事件处理
    const handleEditorScroll = () => {
      const targets = [preview, wechat].filter(Boolean);
      syncScroll(editor, targets);
    };

    // 预览区滚动事件处理
    const handlePreviewScroll = () => {
      if (!preview) return;
      const targets = [editor, wechat].filter(Boolean).filter(el => el !== preview);
      syncScroll(preview, targets);
    };

    // 微信预览区滚动事件处理
    const handleWechatScroll = () => {
      if (!wechat) return;
      const targets = [editor, preview].filter(Boolean).filter(el => el !== wechat);
      syncScroll(wechat, targets);
    };

    // 添加滚动事件监听器
    editor.addEventListener('scroll', handleEditorScroll, { passive: true });
    if (preview) preview.addEventListener('scroll', handlePreviewScroll, { passive: true });
    if (wechat) wechat.addEventListener('scroll', handleWechatScroll, { passive: true });

    // 清理函数
    return () => {
      editor.removeEventListener('scroll', handleEditorScroll);
      if (preview) preview.removeEventListener('scroll', handlePreviewScroll);
      if (wechat) wechat.removeEventListener('scroll', handleWechatScroll);
      
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [enabled]);

  return {
    editorRef,
    previewRef,
    wechatRef
  };
};