// useDoocsStyleScrollSync.js - 基于doocs/md实现的滚动比例同步
import { useEffect, useRef } from 'react';

export const useDoocsStyleScrollSync = (enabled = true) => {
  const editorRef = useRef(null);
  const previewRef = useRef(null);
  const wechatRef = useRef(null);
  const isSyncingRef = useRef(false);
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const editor = editorRef.current;
    const preview = previewRef.current;
    const wechat = wechatRef.current;

    console.log('🔍 Scroll Sync Debug:', {
      editor: !!editor,
      preview: !!preview,
      wechat: !!wechat,
      enabled
    });

    if (!editor) return;

    // 计算滚动百分比
    const getScrollPercentage = (element) => {
      if (!element) return 0;
      const { scrollTop, scrollHeight, offsetHeight } = element;
      const maxScroll = scrollHeight - offsetHeight;
      return maxScroll <= 0 ? 0 : scrollTop / maxScroll;
    };

    // 应用滚动到目标元素
    const scrollToPercentage = (element, percentage) => {
      if (!element) return;
      const { scrollHeight, offsetHeight } = element;
      const maxScroll = scrollHeight - offsetHeight;
      if (maxScroll <= 0) return;
      
      const targetScrollTop = percentage * maxScroll;
      element.scrollTop = targetScrollTop;
    };

    // 同步滚动函数
    const syncScroll = (source, targets) => {
      console.log('🔍 syncScroll called:', {
        source: source.tagName,
        isSyncing: isSyncingRef.current,
        targetsCount: targets.length
      });
      
      if (isSyncingRef.current) return;
      
      isSyncingRef.current = true;
      
      try {
        const percentage = getScrollPercentage(source);
        console.log('🔍 Scroll percentage:', percentage);
        
        targets.forEach((target, index) => {
          if (target && target !== source) {
            console.log(`🔍 Syncing to target ${index}:`, target.tagName);
            scrollToPercentage(target, percentage);
          }
        });
      } catch (error) {
        console.warn('Scroll sync error:', error);
      }

      // 防抖处理
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      debounceTimerRef.current = setTimeout(() => {
        isSyncingRef.current = false;
      }, 300);
    };

    // 编辑器滚动处理
    const handleEditorScroll = () => {
      console.log('🔍 Editor scroll triggered:', {
        scrollTop: editor.scrollTop,
        scrollHeight: editor.scrollHeight,
        offsetHeight: editor.offsetHeight
      });
      const targets = [preview, wechat].filter(Boolean);
      console.log('🔍 Syncing to targets:', targets.map(t => !!t));
      syncScroll(editor, targets);
    };

    // 预览区滚动处理
    const handlePreviewScroll = () => {
      if (!preview) return;
      const targets = [editor, wechat].filter(Boolean).filter(el => el !== preview);
      syncScroll(preview, targets);
    };

    // 微信预览区滚动处理
    const handleWechatScroll = () => {
      if (!wechat) return;
      const targets = [editor, preview].filter(Boolean).filter(el => el !== wechat);
      syncScroll(wechat, targets);
    };

    // 添加滚动事件监听器
    console.log('🔍 Adding scroll event listeners:', {
      editor: editor.tagName,
      preview: preview ? preview.tagName : 'null',
      wechat: wechat ? wechat.tagName : 'null'
    });
    
    editor.addEventListener('scroll', handleEditorScroll, { passive: true });
    if (preview) preview.addEventListener('scroll', handlePreviewScroll, { passive: true });
    if (wechat) wechat.addEventListener('scroll', handleWechatScroll, { passive: true });
    
    console.log('🔍 Scroll event listeners added successfully');

    // 清理函数
    return () => {
      editor.removeEventListener('scroll', handleEditorScroll);
      if (preview) preview.removeEventListener('scroll', handlePreviewScroll);
      if (wechat) wechat.removeEventListener('scroll', handleWechatScroll);
      
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled]);

  return {
    editorRef,
    previewRef,
    wechatRef
  };
};