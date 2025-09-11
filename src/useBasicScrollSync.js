// useBasicScrollSync.js - 基础滚动同步，专注于做好基本功能
import { useEffect, useRef, useCallback } from 'react';

export const useBasicScrollSync = (enabled = true) => {
  const editorRef = useRef(null);
  const previewRef = useRef(null);
  const wechatRef = useRef(null);
  const isSyncingRef = useRef(false);
  const syncTimeoutRef = useRef(null);

  // 获取编辑器的textarea元素
  const getEditorTextarea = useCallback((editorRef) => {
    if (!editorRef) return null;
    
    if (editorRef.el && editorRef.el.tagName === 'TEXTAREA') {
      return editorRef.el;
    }
    
    if (editorRef.tagName === 'TEXTAREA') {
      return editorRef;
    }
    
    return editorRef.querySelector ? editorRef.querySelector('textarea') : null;
  }, []);

  // 计算滚动百分比
  const getScrollPercentage = useCallback((element) => {
    if (!element) return 0;
    const { scrollTop, scrollHeight, clientHeight } = element;
    const maxScroll = scrollHeight - clientHeight;
    return maxScroll <= 0 ? 0 : scrollTop / maxScroll;
  }, []);

  // 滚动到指定百分比
  const scrollToPercentage = useCallback((element, percentage) => {
    if (!element) return;
    const { scrollHeight, clientHeight } = element;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll <= 0) return;
    
    const targetScrollTop = percentage * maxScroll;
    element.scrollTop = targetScrollTop;
  }, []);

  // 同步滚动 - 从编辑器到预览区
  const syncFromEditor = useCallback(() => {
    if (isSyncingRef.current || !enabled) return;
    
    isSyncingRef.current = true;
    
    try {
      const editor = editorRef.current;
      const preview = previewRef.current;
      const wechat = wechatRef.current;
      
      if (!editor) return;
      
      const textarea = getEditorTextarea(editor);
      if (!textarea) return;
      
      const percentage = getScrollPercentage(textarea);
      
      // 同步到预览区
      if (preview) {
        scrollToPercentage(preview, percentage);
      }
      
      // 同步到微信预览区
      if (wechat) {
        scrollToPercentage(wechat, percentage);
      }
      
    } catch (error) {
      console.warn('Editor sync error:', error);
    }
    
    // 重置同步状态
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(() => {
      isSyncingRef.current = false;
    }, 100);
  }, [enabled, getEditorTextarea, getScrollPercentage, scrollToPercentage]);

  // 同步滚动 - 从预览区到编辑器和其他预览区
  const syncFromPreview = useCallback((sourceElement) => {
    if (isSyncingRef.current || !enabled) return;
    
    isSyncingRef.current = true;
    
    try {
      const editor = editorRef.current;
      const preview = previewRef.current;
      const wechat = wechatRef.current;
      
      if (!sourceElement) return;
      
      const percentage = getScrollPercentage(sourceElement);
      
      // 同步到编辑器
      if (editor) {
        const textarea = getEditorTextarea(editor);
        if (textarea) {
          scrollToPercentage(textarea, percentage);
        }
      }
      
      // 同步到其他预览区
      const otherTargets = [];
      if (sourceElement === preview && wechat) {
        otherTargets.push(wechat);
      } else if (sourceElement === wechat && preview) {
        otherTargets.push(preview);
      }
      
      otherTargets.forEach(target => {
        scrollToPercentage(target, percentage);
      });
      
    } catch (error) {
      console.warn('Preview sync error:', error);
    }
    
    // 重置同步状态
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(() => {
      isSyncingRef.current = false;
    }, 100);
  }, [enabled, getEditorTextarea, getScrollPercentage, scrollToPercentage]);

  // 设置事件监听器
  useEffect(() => {
    if (!enabled) return;

    const editor = editorRef.current;
    const preview = previewRef.current;
    const wechat = wechatRef.current;

    if (!editor) return;

    const textarea = getEditorTextarea(editor);
    if (!textarea) return;

    // 事件处理函数
    const handleEditorScroll = () => syncFromEditor();
    const handlePreviewScroll = () => syncFromPreview(preview);
    const handleWechatScroll = () => syncFromPreview(wechat);

    // 添加事件监听器
    textarea.addEventListener('scroll', handleEditorScroll, { passive: true });
    
    if (preview) {
      preview.addEventListener('scroll', handlePreviewScroll, { passive: true });
    }
    
    if (wechat) {
      wechat.addEventListener('scroll', handleWechatScroll, { passive: true });
    }

    // 清理函数
    return () => {
      textarea.removeEventListener('scroll', handleEditorScroll);
      
      if (preview) {
        preview.removeEventListener('scroll', handlePreviewScroll);
      }
      
      if (wechat) {
        wechat.removeEventListener('scroll', handleWechatScroll);
      }
      
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [enabled, syncFromEditor, syncFromPreview, getEditorTextarea]);

  return {
    editorRef,
    previewRef,
    wechatRef
  };
};