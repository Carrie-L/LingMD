// useSimpleContentScrollSync.js - 基于内容的简单滚动同步
import { useEffect, useRef, useState, useCallback } from 'react';

export const useSimpleContentScrollSync = (content, sanitizedHtml, enabled = true) => {
  const editorRef = useRef(null);
  const previewRef = useRef(null);
  const wechatRef = useRef(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  
  // 找到编辑器中当前可见的文本内容
  const getVisibleTextInEditor = useCallback((editorElement) => {
    if (!editorElement) return '';
    
    const textarea = editorElement.el && editorElement.el.tagName === 'TEXTAREA' 
      ? editorElement.el 
      : editorElement.tagName === 'TEXTAREA' 
        ? editorElement 
        : editorElement.querySelector('textarea');
    
    if (!textarea) return '';
    
    const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight) || 24;
    const scrollTop = textarea.scrollTop;
    const clientHeight = textarea.clientHeight;
    
    const startLine = Math.floor(scrollTop / lineHeight);
    const endLine = Math.floor((scrollTop + clientHeight) / lineHeight);
    
    const lines = content.split('\n');
    const visibleLines = lines.slice(startLine, endLine + 1);
    
    // 返回中间几行作为关键内容
    const middleIndex = Math.floor(visibleLines.length / 2);
    const keyLines = visibleLines.slice(
      Math.max(0, middleIndex - 2),
      Math.min(visibleLines.length, middleIndex + 3)
    );
    
    return keyLines.join('\n').trim();
  }, [content]);
  
  // 在预览区中找到包含目标文本的元素
  const findElementContainingText = useCallback((htmlContainer, targetText) => {
    if (!htmlContainer || !targetText) return null;
    
    // 简化目标文本，只取前几个字符进行匹配
    const searchTerms = targetText
      .split(/\s+/)
      .filter(term => term.length > 2)
      .slice(0, 3);
    
    if (searchTerms.length === 0) return null;
    
    // 搜索所有文本节点
    const textElements = htmlContainer.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, td');
    
    for (const element of textElements) {
      const elementText = element.textContent || '';
      const score = searchTerms.reduce((acc, term) => {
        return acc + (elementText.includes(term) ? 1 : 0);
      }, 0);
      
      if (score >= searchTerms.length - 1) { // 至少匹配大部分关键词
        return element;
      }
    }
    
    // 如果没有精确匹配，尝试部分匹配
    for (const element of textElements) {
      const elementText = element.textContent || '';
      if (elementText.includes(searchTerms[0])) {
        return element;
      }
    }
    
    return null;
  }, []);
  
  // 滚动到指定元素
  const scrollToElement = useCallback((element, container) => {
    if (!element || !container) return;
    
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    // 计算元素在容器中的相对位置
    const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
    const containerHeight = container.clientHeight;
    const elementHeight = elementRect.height;
    
    // 让元素在容器中居中显示
    const targetScrollTop = Math.max(0, relativeTop - containerHeight / 2 + elementHeight / 2);
    const maxScroll = container.scrollHeight - container.clientHeight;
    
    container.scrollTop = Math.min(targetScrollTop, maxScroll);
  }, []);
  
  // 从编辑器同步到预览区
  const syncFromEditor = useCallback(() => {
    if (isScrollingRef.current) return;
    
    isScrollingRef.current = true;
    
    try {
      const editor = editorRef.current;
      const preview = previewRef.current;
      const wechat = wechatRef.current;
      
      if (!editor) return;
      
      const textarea = editor.el && editor.el.tagName === 'TEXTAREA' 
        ? editor.el 
        : editor.tagName === 'TEXTAREA' 
          ? editor 
          : editor.querySelector('textarea');
      
      if (!textarea) return;
      
      // 检查是否在边界位置
      const { scrollTop, scrollHeight, clientHeight } = textarea;
      const isAtTop = scrollTop <= 10; // 顶部10px内
      const isAtBottom = scrollHeight - scrollTop - clientHeight <= 10; // 底部10px内
      
      // 边界情况：直接滚动到对应位置
      if (isAtTop) {
        if (preview) preview.scrollTop = 0;
        if (wechat) wechat.scrollTop = 0;
        return;
      }
      
      if (isAtBottom) {
        if (preview) {
          const maxScroll = preview.scrollHeight - preview.clientHeight;
          preview.scrollTop = maxScroll;
        }
        if (wechat) {
          const maxScroll = wechat.scrollHeight - wechat.clientHeight;
          wechat.scrollTop = maxScroll;
        }
        return;
      }
      
      // 非边界情况：使用内容匹配
      const visibleText = getVisibleTextInEditor(editor);
      let hasMatch = false;
      
      if (visibleText && preview) {
        const targetElement = findElementContainingText(preview, visibleText);
        if (targetElement) {
          scrollToElement(targetElement, preview);
          hasMatch = true;
        }
      }
      
      if (visibleText && wechat) {
        const targetElement = findElementContainingText(wechat, visibleText);
        if (targetElement) {
          scrollToElement(targetElement, wechat);
          hasMatch = true;
        }
      }
      
      // 如果没有找到匹配，使用比例同步作为降级方案
      if (!hasMatch) {
        const scrollRatio = scrollTop / (scrollHeight - clientHeight);
        
        if (preview) {
          const maxScroll = preview.scrollHeight - preview.clientHeight;
          preview.scrollTop = scrollRatio * maxScroll;
        }
        
        if (wechat) {
          const maxScroll = wechat.scrollHeight - wechat.clientHeight;
          wechat.scrollTop = scrollRatio * maxScroll;
        }
      }
    } catch (error) {
      console.warn('Editor sync error:', error);
    }
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 150);
  }, [getVisibleTextInEditor, findElementContainingText, scrollToElement]);
  
  // 从预览区同步到编辑器
  const syncFromPreview = useCallback((sourceElement) => {
    if (isScrollingRef.current) return;
    
    isScrollingRef.current = true;
    
    try {
      const editor = editorRef.current;
      const source = sourceElement;
      
      if (!editor || !source) return;
      
      const { scrollTop, scrollHeight, clientHeight } = source;
      const isAtTop = scrollTop <= 10; // 顶部10px内
      const isAtBottom = scrollHeight - scrollTop - clientHeight <= 10; // 底部10px内
      
      // 边界情况：直接滚动到对应位置
      if (isAtTop) {
        const textarea = editor.el && editor.el.tagName === 'TEXTAREA' 
          ? editor.el 
          : editor.tagName === 'TEXTAREA' 
            ? editor 
            : editor.querySelector('textarea');
        
        if (textarea) {
          textarea.scrollTop = 0;
        }
        return;
      }
      
      if (isAtBottom) {
        const textarea = editor.el && editor.el.tagName === 'TEXTAREA' 
          ? editor.el 
          : editor.tagName === 'TEXTAREA' 
            ? editor 
            : editor.querySelector('textarea');
        
        if (textarea) {
          const maxScroll = textarea.scrollHeight - textarea.clientHeight;
          textarea.scrollTop = maxScroll;
        }
        return;
      }
      
      // 非边界情况：使用内容匹配
      const centerY = scrollTop + clientHeight / 2;
      const elements = source.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, td');
      
      let targetElement = null;
      let minDistance = Infinity;
      
      for (const element of elements) {
        const elementTop = element.offsetTop;
        const distance = Math.abs(elementTop - centerY);
        
        if (distance < minDistance) {
          minDistance = distance;
          targetElement = element;
        }
      }
      
      let hasMatch = false;
      
      if (targetElement) {
        const targetText = (targetElement.textContent || '').trim();
        if (targetText) {
          // 在编辑器中查找对应文本
          const lines = content.split('\n');
          const targetLine = lines.findIndex(line => 
            line.includes(targetText.substring(0, 20)) || // 匹配前20个字符
            targetText.includes(line.substring(0, 20))
          );
          
          if (targetLine !== -1) {
            const textarea = editor.el && editor.el.tagName === 'TEXTAREA' 
              ? editor.el 
              : editor.tagName === 'TEXTAREA' 
                ? editor 
                : editor.querySelector('textarea');
            
            if (textarea) {
              const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight) || 24;
              const targetScrollTop = targetLine * lineHeight;
              const maxScroll = textarea.scrollHeight - textarea.clientHeight;
              
              textarea.scrollTop = Math.min(targetScrollTop, maxScroll);
              hasMatch = true;
            }
          }
        }
      }
      
      // 如果没有找到匹配，使用比例同步作为降级方案
      if (!hasMatch) {
        const scrollRatio = scrollTop / (scrollHeight - clientHeight);
        
        const textarea = editor.el && editor.el.tagName === 'TEXTAREA' 
          ? editor.el 
          : editor.tagName === 'TEXTAREA' 
            ? editor 
            : editor.querySelector('textarea');
        
        if (textarea) {
          const maxScroll = textarea.scrollHeight - textarea.clientHeight;
          textarea.scrollTop = scrollRatio * maxScroll;
        }
      }
      
      // 同步到另一个预览区
      if (sourceElement === previewRef.current && wechatRef.current) {
        const targetText = targetElement?.textContent?.trim();
        if (targetText) {
          const target = findElementContainingText(wechatRef.current, targetText);
          if (target) {
            scrollToElement(target, wechatRef.current);
          }
        } else {
          // 使用比例同步
          const maxScroll = wechatRef.current.scrollHeight - wechatRef.current.clientHeight;
          wechatRef.current.scrollTop = scrollRatio * maxScroll;
        }
      } else if (sourceElement === wechatRef.current && previewRef.current) {
        const targetText = targetElement?.textContent?.trim();
        if (targetText) {
          const target = findElementContainingText(previewRef.current, targetText);
          if (target) {
            scrollToElement(target, previewRef.current);
          }
        } else {
          // 使用比例同步
          const maxScroll = previewRef.current.scrollHeight - previewRef.current.clientHeight;
          previewRef.current.scrollTop = scrollRatio * maxScroll;
        }
      }
    } catch (error) {
      console.warn('Preview sync error:', error);
    }
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 150);
  }, [content, findElementContainingText, scrollToElement]);
  
  // 设置事件监听器
  useEffect(() => {
    if (!enabled) return;
    
    const editor = editorRef.current;
    const preview = previewRef.current;
    const wechat = wechatRef.current;
    
    if (!editor) return;
    
    // 获取textarea元素
    const textarea = editor.el && editor.el.tagName === 'TEXTAREA' 
      ? editor.el 
      : editor.tagName === 'TEXTAREA' 
        ? editor 
        : editor.querySelector('textarea');
    
    if (!textarea) return;
    
    const editorHandler = () => syncFromEditor();
    const previewHandler = () => syncFromPreview(preview);
    const wechatHandler = () => syncFromPreview(wechat);
    
    // 添加事件监听器
    textarea.addEventListener('scroll', editorHandler, { passive: true });
    textarea.addEventListener('input', editorHandler);
    textarea.addEventListener('keyup', editorHandler);
    textarea.addEventListener('click', editorHandler);
    
    if (preview) preview.addEventListener('scroll', previewHandler, { passive: true });
    if (wechat) wechat.addEventListener('scroll', wechatHandler, { passive: true });
    
    // 清理函数
    return () => {
      textarea.removeEventListener('scroll', editorHandler);
      textarea.removeEventListener('input', editorHandler);
      textarea.removeEventListener('keyup', editorHandler);
      textarea.removeEventListener('click', editorHandler);
      
      if (preview) preview.removeEventListener('scroll', previewHandler);
      if (wechat) wechat.removeEventListener('scroll', wechatHandler);
      
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [enabled, syncFromEditor, syncFromPreview]);
  
  return {
    editorRef,
    previewRef,
    wechatRef
  };
};