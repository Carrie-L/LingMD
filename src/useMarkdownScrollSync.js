// useMarkdownScrollSync.js - 基于markdown内容位置的精确滚动同步
import { useEffect, useRef, useCallback, useState } from 'react';

// 辅助函数：从Editor组件ref获取实际的textarea元素
const getEditorTextarea = (editorRef) => {
  if (!editorRef) return null;
  
  // 如果是Editor组件返回的对象，包含el属性
  if (editorRef.el && editorRef.el.tagName === 'TEXTAREA') {
    return editorRef.el;
  }
  
  // 如果是直接的DOM元素
  if (editorRef.tagName === 'TEXTAREA') {
    return editorRef;
  }
  
  // 尝试查找textarea
  return editorRef.querySelector ? editorRef.querySelector('textarea') : null;
};

export const useMarkdownScrollSync = (content, sanitizedHtml, enabled = true) => {
  const editorRef = useRef(null);
  const previewRef = useRef(null);
  const wechatRef = useRef(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const [contentMapping, setContentMapping] = useState([]);

  // 构建markdown行到HTML元素的映射
  const buildContentMapping = useCallback((markdown, htmlContainer) => {
    if (!htmlContainer || !markdown) return [];

    const lines = markdown.split('\n');
    const mapping = [];
    
    // 查找预览区中的主要元素
    const elements = htmlContainer.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, table, hr, img');
    
    let currentLine = 0;
    
    elements.forEach(element => {
      // 根据元素类型估算对应的markdown行数
      let estimatedLines = 1;
      
      if (element.tagName.match(/^H[1-6]$/)) {
        // 标题通常对应1行markdown
        estimatedLines = 1;
      } else if (element.tagName === 'P') {
        // 段落可能有多个行
        const text = element.textContent || '';
        estimatedLines = Math.ceil(text.length / 80) || 1;
      } else if (element.tagName === 'LI') {
        // 列表项
        const text = element.textContent || '';
        estimatedLines = Math.ceil(text.length / 60) || 1;
      } else if (element.tagName === 'BLOCKQUOTE') {
        // 引用块
        const text = element.textContent || '';
        estimatedLines = Math.ceil(text.length / 70) || 1;
      } else if (element.tagName === 'PRE') {
        // 代码块
        const codeText = element.textContent || '';
        estimatedLines = codeText.split('\n').length;
      } else if (element.tagName === 'TABLE') {
        // 表格
        const rows = element.querySelectorAll('tr').length;
        estimatedLines = rows + 2; // +2 for table markers
      } else if (element.tagName === 'HR') {
        // 分割线
        estimatedLines = 1;
      } else if (element.tagName === 'IMG') {
        // 图片
        estimatedLines = 1;
      }
      
      mapping.push({
        element,
        startLine: currentLine,
        endLine: currentLine + estimatedLines,
        scrollTop: element.offsetTop
      });
      
      currentLine += estimatedLines;
    });
    
    return mapping;
  }, []);

  // 从编辑器滚动位置找到对应的预览区元素
  const findPreviewElementFromEditorScroll = useCallback((editorElement, mapping) => {
    if (!editorElement || !mapping.length) return null;
    
    const textarea = getEditorTextarea(editorElement);
    if (!textarea) return null;
    
    // 计算当前可见的第一行
    const scrollTop = textarea.scrollTop;
    const editorLineHeight = parseInt(window.getComputedStyle(textarea).lineHeight) || 24;
    const visibleLine = Math.floor(scrollTop / editorLineHeight);
    
    // 找到最接近的映射元素
    const targetElement = mapping.find(item => 
      visibleLine >= item.startLine && visibleLine <= item.endLine
    ) || mapping.reduce((closest, item) => {
      const closestDiff = Math.abs(visibleLine - closest.startLine);
      const currentDiff = Math.abs(visibleLine - item.startLine);
      return currentDiff < closestDiff ? item : closest;
    }, mapping[0]);
    
    return targetElement;
  }, []);

  // 从预览区滚动位置找到对应的编辑器行
  const findEditorLineFromPreviewScroll = useCallback((previewElement, mapping) => {
    if (!previewElement || !mapping.length) return 0;
    
    const scrollTop = previewElement.scrollTop;
    
    // 找到当前可见的元素
    const visibleElement = mapping.find(item => 
      scrollTop >= item.scrollTop && scrollTop < item.scrollTop + item.element.offsetHeight
    ) || mapping.reduce((closest, item) => {
      const closestDiff = Math.abs(scrollTop - closest.scrollTop);
      const currentDiff = Math.abs(scrollTop - item.scrollTop);
      return currentDiff < closestDiff ? item : closest;
    }, mapping[0]);
    
    return visibleElement ? visibleElement.startLine : 0;
  }, []);

  // 更新内容映射
  useEffect(() => {
    if (!enabled || !sanitizedHtml) return;
    
    const updateMapping = () => {
      if (previewRef.current) {
        const mapping = buildContentMapping(content, previewRef.current);
        setContentMapping(mapping);
      }
    };
    
    // 延迟执行，确保DOM完全渲染
    setTimeout(updateMapping, 100);
  }, [content, sanitizedHtml, enabled, buildContentMapping]);

  // 滚动同步逻辑
  useEffect(() => {
    if (!enabled || !contentMapping.length) return;

    const editor = editorRef.current;
    const preview = previewRef.current;
    const wechat = wechatRef.current;
    
    if (!editor) return;

    const syncFromEditor = () => {
      if (isScrollingRef.current) return;
      
      isScrollingRef.current = true;
      
      try {
        const targetElement = findPreviewElementFromEditorScroll(editor, contentMapping);
        
        if (targetElement) {
          // 计算滚动位置，使元素居中显示
          const elementHeight = targetElement.element.offsetHeight;
          const containerHeight = preview ? preview.clientHeight : 0;
          const targetScrollTop = Math.max(0, targetElement.scrollTop - containerHeight / 2 + elementHeight / 2);
          
          // 同步到预览区
          if (preview) {
            const maxScroll = preview.scrollHeight - preview.clientHeight;
            preview.scrollTop = Math.min(targetScrollTop, maxScroll);
          }
          
          // 同步到微信预览区
          if (wechat) {
            const maxScroll = wechat.scrollHeight - wechat.clientHeight;
            wechat.scrollTop = Math.min(targetScrollTop, maxScroll);
          }
        }
      } catch (error) {
        console.warn('Editor sync error:', error);
        
        // 降级到比例同步
        const textarea = getEditorTextarea(editor);
        if (textarea) {
          const { scrollTop, scrollHeight, clientHeight } = textarea;
          const maxScroll = scrollHeight - clientHeight;
          const scrollRatio = maxScroll <= 0 ? 0 : scrollTop / maxScroll;
          
          [preview, wechat].forEach(target => {
            if (target && target !== editor) {
              const targetMaxScroll = target.scrollHeight - target.clientHeight;
              target.scrollTop = Math.max(0, targetMaxScroll * scrollRatio);
            }
          });
        }
      }

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 100);
    };

    const syncFromPreview = (sourceElement) => {
      if (isScrollingRef.current) return;
      
      isScrollingRef.current = true;
      
      try {
        const targetLine = findEditorLineFromPreviewScroll(sourceElement, contentMapping);
        
        // 滚动编辑器到对应行
        let textarea = null;
        if (editor && typeof editor === 'object') {
          if (editor.el && editor.el.tagName === 'TEXTAREA') {
            textarea = editor.el;
          }
        } else if (editor && editor.tagName === 'TEXTAREA') {
          textarea = editor;
        } else if (editor) {
          textarea = editor.querySelector('textarea');
        }
        
        if (textarea) {
          const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight) || 24;
          const targetScrollTop = targetLine * lineHeight;
          const maxScroll = textarea.scrollHeight - textarea.clientHeight;
          textarea.scrollTop = Math.min(targetScrollTop, maxScroll);
        }
        
        // 同步到另一个预览区
        const targets = [preview, wechat].filter(el => el && el !== sourceElement);
        targets.forEach(target => {
          if (target) {
            const targetElement = findPreviewElementFromEditorScroll(editor, contentMapping);
            if (targetElement) {
              const elementHeight = targetElement.element.offsetHeight;
              const containerHeight = target.clientHeight;
              const targetScrollTop = Math.max(0, targetElement.scrollTop - containerHeight / 2 + elementHeight / 2);
              const maxScroll = target.scrollHeight - target.clientHeight;
              target.scrollTop = Math.min(targetScrollTop, maxScroll);
            }
          }
        });
      } catch (error) {
        console.warn('Preview sync error:', error);
        
        // 降级到比例同步
        const { scrollTop, scrollHeight, clientHeight } = sourceElement;
        const maxScroll = scrollHeight - clientHeight;
        const scrollRatio = maxScroll <= 0 ? 0 : scrollTop / maxScroll;
        
        [editor, ...(wechat === sourceElement ? [preview] : wechat ? [wechat] : [])].forEach(target => {
          if (target && target !== sourceElement) {
            const targetTextarea = getEditorTextarea(target);
            
            if (targetTextarea) {
              const targetMaxScroll = targetTextarea.scrollHeight - targetTextarea.clientHeight;
              targetTextarea.scrollTop = Math.max(0, targetMaxScroll * scrollRatio);
            } else {
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
      }, 100);
    };

    // 添加事件监听器
    const editorHandler = () => syncFromEditor();
    const previewHandler = () => syncFromPreview(preview);
    const wechatHandler = () => syncFromPreview(wechat);

    // 获取Editor组件中的textarea元素
    const textarea = getEditorTextarea(editor);

    console.log('🔍 Debug - textarea found:', !!textarea);
    
    if (textarea) {
      textarea.addEventListener('scroll', editorHandler, { passive: true });
      textarea.addEventListener('input', editorHandler);
      textarea.addEventListener('keyup', editorHandler);
      textarea.addEventListener('click', editorHandler);
    }
    
    if (preview) preview.addEventListener('scroll', previewHandler, { passive: true });
    if (wechat) wechat.addEventListener('scroll', wechatHandler, { passive: true });

    // 清理函数
    return () => {
      if (textarea) {
        textarea.removeEventListener('scroll', editorHandler);
        textarea.removeEventListener('input', editorHandler);
        textarea.removeEventListener('keyup', editorHandler);
        textarea.removeEventListener('click', editorHandler);
      }
      
      if (preview) preview.removeEventListener('scroll', previewHandler);
      if (wechat) wechat.removeEventListener('scroll', wechatHandler);
      
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [enabled, contentMapping, findPreviewElementFromEditorScroll, findEditorLineFromPreviewScroll]);

  return {
    editorRef,
    previewRef,
    wechatRef
  };
};