// useSimpleDoocsScrollSync.js - 简化版本的doocs/md风格滚动同步
import { useEffect, useRef } from 'react';

export const useSimpleDoocsScrollSync = (enabled = true) => {
  const editorRef = useRef(null);
  const previewRef = useRef(null);
  const wechatRef = useRef(null);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const editor = editorRef.current;
    const preview = previewRef.current;
    const wechat = wechatRef.current;

    console.log('🔍 Scroll Sync Debug - Elements:', {
      editor: !!editor,
      preview: !!preview,
      wechat: !!wechat
    });

    if (!editor) return;

    // 计算滚动百分比
    const getScrollPercentage = (element) => {
      if (!element) return 0;
      const { scrollTop, scrollHeight, clientHeight } = element;
      const maxScroll = scrollHeight - clientHeight;
      return maxScroll <= 0 ? 0 : scrollTop / maxScroll;
    };

    // 应用滚动到目标元素
    const scrollToPercentage = (element, percentage) => {
      if (!element) return;
      const { scrollHeight, clientHeight } = element;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) return;
      
      const targetScrollTop = percentage * maxScroll;
      element.scrollTop = targetScrollTop;
    };

    // 同步滚动函数
    const syncScroll = (source, target) => {
      if (isSyncingRef.current || !target) return;
      
      console.log('🔍 Sync scroll:', {
        source: source.tagName || source.id,
        target: target.tagName || target.id,
        sourceScroll: source.scrollTop,
        isSyncing: isSyncingRef.current
      });
      
      isSyncingRef.current = true;
      
      try {
        const percentage = getScrollPercentage(source);
        scrollToPercentage(target, percentage);
        
        console.log('🔍 Sync applied:', {
          percentage: percentage.toFixed(3),
          targetScroll: target.scrollTop
        });
      } catch (error) {
        console.warn('Scroll sync error:', error);
      }

      // 300ms 后重置同步状态
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 300);
    };

    // 编辑器滚动处理
    const handleEditorScroll = () => {
      console.log('🔍 Editor scroll event:', editor.scrollTop);
      syncScroll(editor, preview);
      if (wechat) syncScroll(editor, wechat);
    };

    // 预览区滚动处理
    const handlePreviewScroll = () => {
      if (!preview) return;
      console.log('🔍 Preview scroll event:', preview.scrollTop);
      syncScroll(preview, editor);
      if (wechat) syncScroll(preview, wechat);
    };

    // 微信预览区滚动处理
    const handleWechatScroll = () => {
      if (!wechat) return;
      console.log('🔍 Wechat scroll event:', wechat.scrollTop);
      syncScroll(wechat, editor);
      if (preview) syncScroll(wechat, preview);
    };

    // 添加滚动事件监听器
    console.log('🔍 Adding event listeners...');
    editor.addEventListener('scroll', handleEditorScroll, { passive: true });
    if (preview) preview.addEventListener('scroll', handlePreviewScroll, { passive: true });
    if (wechat) wechat.addEventListener('scroll', handleWechatScroll, { passive: true });
    console.log('🔍 Event listeners added');

    // 清理函数
    return () => {
      console.log('🔍 Cleaning up event listeners...');
      editor.removeEventListener('scroll', handleEditorScroll);
      if (preview) preview.removeEventListener('scroll', handlePreviewScroll);
      if (wechat) wechat.removeEventListener('scroll', handleWechatScroll);
    };
  }, [enabled]);

  return {
    editorRef,
    previewRef,
    wechatRef
  };
};