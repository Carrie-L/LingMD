// useBasicScrollSync.js - 改进版：区分用户滚动与程序滚动，防止回环/编辑时跳动
import { useEffect, useRef, useCallback } from 'react';

/**
 * useBasicScrollSync(enabled = true, opts = {})
 * 返回 { editorRef, previewRef, wechatRef }
 *
 * options:
 *  - lockMs: 当进行 programmatic scroll 时，忽略对方 scroll 事件的时间窗口（ms）。默认 120
 *  - syncOnInput: 是否在输入/内容变化时也同步（默认 false，避免编辑时跳动）
 *  - debug: 是否打印少量调试信息（默认 false）
 */
export const useBasicScrollSync = (enabled = true, opts = {}) => {
  const { lockMs = 120, syncOnInput = false, debug = false } = opts;

  const editorRef = useRef(null);
  const previewRef = useRef(null);
  const wechatRef = useRef(null);

  // 当我们 programmatic 设置 scrollTop 时，短期忽略对方的 scroll 事件，避免回环
  const programmaticLockRef = useRef(false);
  const lockTimerRef = useRef(null);

  // 标记最近一次是哪个源发起的用户交互 'editor' | 'preview' | 'wechat' | null
  const lastUserSourceRef = useRef(null);

  // 用于节流：保存是否已有 rAF 挂起
  const rafPendingRef = useRef(false);

  // 用户最近是否触发过滚动/交互（通过 wheel/mousedown/touchstart 判断）
  const userInteractingRef = useRef(false);
  const userInteractTimerRef = useRef(null);
  const USER_INTERACT_DEBOUNCE = 500; // ms：用户交互后这个时间段内我们认为后续 scroll 来自用户

  // 清除 programmatic lock
  const clearProgrammaticLock = useCallback(() => {
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }
    programmaticLockRef.current = false;
    lastUserSourceRef.current = null;
  }, []);

  const setProgrammaticLock = useCallback((source) => {
    programmaticLockRef.current = true;
    lastUserSourceRef.current = source || 'programmatic';
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(() => {
      programmaticLockRef.current = false;
      lockTimerRef.current = null;
      if (debug) console.debug('[scroll-sync] programmatic lock cleared');
    }, lockMs);
    if (debug) console.debug('[scroll-sync] set programmatic lock from', source);
  }, [lockMs, debug]);

  // 辅助：从 element（可能是 wrapper）里找到 textarea
  const getEditorTextarea = useCallback((el) => {
    if (!el) return null;
    // 如果传入的是 ref.current-like object with .el (一些 editor lib 会这样)
    if (el.el && el.el.tagName === 'TEXTAREA') return el.el;
    if (el.tagName === 'TEXTAREA') return el;
    if (el.querySelector) {
      const ta = el.querySelector('textarea');
      if (ta) return ta;
    }
    return null;
  }, []);

  // 计算滚动百分比（基于 scrollTop / (scrollHeight - clientHeight)）
  const getScrollPercentage = useCallback((el) => {
    if (!el) return 0;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = scrollHeight - clientHeight;

    // 边界处理：精确对齐顶部和底部（使用容差处理浮点数精度问题）
    if (maxScroll <= 0) return 0;
    if (scrollTop <= 1) return 0;  // 容差 1px
    if (scrollTop >= maxScroll - 1) return 1;  // 容差 1px

    return scrollTop / maxScroll;
  }, []);

  // 根据百分比滚动（直接设置 scrollTop）
  const scrollToPercentage = useCallback((el, percentage) => {
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll <= 0) return;

    // 边界处理：精确对齐顶部和底部
    if (percentage === 0) {
      // 如果已经在顶部附近，跳过（避免反向滚动）
      if (scrollTop <= 1) return;
      el.scrollTop = 0;
      return;
    }
    if (percentage === 1) {
      // 如果已经在底部附近，跳过（避免反向滚动）
      if (scrollTop >= maxScroll - 1) return;
      el.scrollTop = maxScroll;
      return;
    }

    // 应用滚动比例
    const targetScrollTop = percentage * maxScroll;
    el.scrollTop = targetScrollTop;
  }, []);

  // 将一次“用户滚动”同步到别处（节流 rAF）
  const scheduleSync = useCallback((from, percentage) => {
    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      if (!enabled) return;

      // 如果当前处于 programmatic lock，忽略这次同步（通常是因为这是由程序产生）
      if (programmaticLockRef.current) {
        if (debug) console.debug('[scroll-sync] ignored scheduleSync due to programmatic lock');
        return;
      }

      const editor = editorRef.current;
      const preview = previewRef.current;
      const wechat = wechatRef.current;

      // 标记我们马上要做 programmatic scroll，以避免对方的 scroll handler 回环
      setProgrammaticLock(`${from}->others`);

      try {
        if (from === 'editor') {
          // editor -> preview & wechat
          if (preview) scrollToPercentage(preview, percentage);
          if (wechat) scrollToPercentage(wechat, percentage);
        } else if (from === 'preview') {
          // preview -> editor & wechat
          if (editor) {
            const ta = getEditorTextarea(editor);
            if (ta) scrollToPercentage(ta, percentage);
          }
          if (wechat) scrollToPercentage(wechat, percentage);
        } else if (from === 'wechat') {
          // wechat -> editor & preview
          if (editor) {
            const ta = getEditorTextarea(editor);
            if (ta) scrollToPercentage(ta, percentage);
          }
          if (preview) scrollToPercentage(preview, percentage);
        }
      } catch (e) {
        console.warn('[scroll-sync] scheduleSync error', e);
      }
    });
  }, [enabled, getEditorTextarea, scrollToPercentage, setProgrammaticLock, debug]);

  // 标记用户交互（wheel/mousedown/touchstart），在一段时间内认为 scroll 来自用户
  const markUserInteracting = useCallback((source) => {
    userInteractingRef.current = true;
    lastUserSourceRef.current = source;
    if (userInteractTimerRef.current) clearTimeout(userInteractTimerRef.current);
    userInteractTimerRef.current = setTimeout(() => {
      userInteractingRef.current = false;
      userInteractTimerRef.current = null;
      lastUserSourceRef.current = null;
    }, USER_INTERACT_DEBOUNCE);
  }, []);

  // editor scroll handler
  const handleEditorScroll = useCallback(() => {
    if (!enabled) return;
    const editor = editorRef.current;
    if (!editor) return;
    const ta = getEditorTextarea(editor);
    if (!ta) return;

    // 如果是程序触发（短期锁定）则忽略
    if (programmaticLockRef.current) {
      if (debug) {/*console.debug('[scroll-sync] editor scroll ignored due to programmatic lock')*/ }
      return;
    }

    // 只有当最近有用户交互时（wheel/mousedown/touchstart），才把滚动视为用户主动滚动并做同步。
    if (!userInteractingRef.current && !syncOnInput) {
      // 这次 scroll 很可能是浏览器自动 due to caret/DOM update，我们不主动同步（这样避免输入时跳动）
      if (debug) console.debug('[scroll-sync] editor scroll ignored (no recent user interaction)');
      return;
    }

    const percentage = getScrollPercentage(ta);
    if (debug) console.debug('[scroll-sync] editor -> percent', percentage);
    scheduleSync('editor', percentage);
  }, [enabled, getEditorTextarea, getScrollPercentage, scheduleSync, syncOnInput, debug]);

  // preview scroll handler
  const handlePreviewScroll = useCallback(() => {
    if (!enabled) return;
    const preview = previewRef.current;
    if (!preview) return;

    if (programmaticLockRef.current) {
      if (debug) {/*console.debug('[scroll-sync] preview scroll ignored due to programmatic lock')*/ }
      return;
    }

    if (!userInteractingRef.current) {
      if (debug) console.debug('[scroll-sync] preview scroll ignored (no recent user interaction)');
      return;
    }

    const percentage = getScrollPercentage(preview);
    if (debug) console.debug('[scroll-sync] preview -> percent', percentage);
    scheduleSync('preview', percentage);
  }, [enabled, getScrollPercentage, scheduleSync, debug]);

  // wechat scroll handler
  const handleWechatScroll = useCallback(() => {
    if (!enabled) return;
    const wechat = wechatRef.current;
    if (!wechat) return;

    if (programmaticLockRef.current) {
      if (debug) {/*console.debug('[scroll-sync] wechat scroll ignored due to programmatic lock')*/ }
      return;
    }

    if (!userInteractingRef.current) {
      if (debug) console.debug('[scroll-sync] wechat scroll ignored (no recent user interaction)');
      return;
    }

    const percentage = getScrollPercentage(wechat);
    if (debug) console.debug('[scroll-sync] wechat -> percent', percentage);
    scheduleSync('wechat', percentage);
  }, [enabled, getScrollPercentage, scheduleSync, debug]);

  // 当 syncOnInput = true 且编辑器 input 触发时，也可以同步（注意：默认 false）
  const handleEditorInput = useCallback(() => {
    if (!enabled) return;
    if (!syncOnInput) return;

    const editor = editorRef.current;
    if (!editor) return;
    const ta = getEditorTextarea(editor);
    if (!ta) return;

    // 如果程序刚刚触发滚动则忽略
    if (programmaticLockRef.current) return;

    const percentage = getScrollPercentage(ta);
    scheduleSync('editor', percentage);
  }, [enabled, syncOnInput, getEditorTextarea, getScrollPercentage, scheduleSync]);

  // effect: attach event listeners
  useEffect(() => {
    if (!enabled) return;

    const editor = editorRef.current;
    const preview = previewRef.current;
    const wechat = wechatRef.current;

    if (!editor) {
      if (debug) console.debug('[scroll-sync] no editor ref yet');
      return;
    }

    const ta = getEditorTextarea(editor);
    if (!ta) {
      if (debug) console.debug('[scroll-sync] no textarea in editor ref yet');
      return;
    }

    // 用户交互检测（让我们知道接下来的 scroll 是否来自用户）
    // attach to both textarea wrapper and preview/wechat so we can detect mousedown/wheel/touchstart
    const onUserWheel = (e) => {
      // 判断事件来源并标记
      if (e && e.target) {
        if (editor.contains && editor.contains(e.target)) markUserInteracting('editor');
        else if (preview && preview.contains && preview.contains(e.target)) markUserInteracting('preview');
        else if (wechat && wechat.contains && wechat.contains(e.target)) markUserInteracting('wechat');
        else markUserInteracting('unknown');
      } else {
        markUserInteracting('unknown');
      }
    };
    const onUserDown = (e) => {
      if (e && e.target) {
        if (editor.contains && editor.contains(e.target)) markUserInteracting('editor');
        else if (preview && preview.contains && preview.contains(e.target)) markUserInteracting('preview');
        else if (wechat && wechat.contains && wechat.contains(e.target)) markUserInteracting('wechat');
        else markUserInteracting('unknown');
      } else {
        markUserInteracting('unknown');
      }
    };

    // attach user interaction listeners (passive is fine)
    ta.addEventListener('wheel', onUserWheel, { passive: true });
    ta.addEventListener('mousedown', onUserDown, { passive: true });
    ta.addEventListener('touchstart', onUserDown, { passive: true });

    if (preview) {
      preview.addEventListener('wheel', onUserWheel, { passive: true });
      preview.addEventListener('mousedown', onUserDown, { passive: true });
      preview.addEventListener('touchstart', onUserDown, { passive: true });
    }

    if (wechat) {
      wechat.addEventListener('wheel', onUserWheel, { passive: true });
      wechat.addEventListener('mousedown', onUserDown, { passive: true });
      wechat.addEventListener('touchstart', onUserDown, { passive: true });
    }

    // attach scroll listeners
    ta.addEventListener('scroll', handleEditorScroll, { passive: true });
    if (syncOnInput) {
      ta.addEventListener('input', handleEditorInput);
    }

    if (preview) preview.addEventListener('scroll', handlePreviewScroll, { passive: true });
    if (wechat) wechat.addEventListener('scroll', handleWechatScroll, { passive: true });

    if (debug) console.debug('[scroll-sync] listeners attached');

    // cleanup
    return () => {
      ta.removeEventListener('wheel', onUserWheel);
      ta.removeEventListener('mousedown', onUserDown);
      ta.removeEventListener('touchstart', onUserDown);

      ta.removeEventListener('scroll', handleEditorScroll);
      if (syncOnInput) ta.removeEventListener('input', handleEditorInput);

      if (preview) {
        preview.removeEventListener('wheel', onUserWheel);
        preview.removeEventListener('mousedown', onUserDown);
        preview.removeEventListener('touchstart', onUserDown);
        preview.removeEventListener('scroll', handlePreviewScroll);
      }

      if (wechat) {
        wechat.removeEventListener('wheel', onUserWheel);
        wechat.removeEventListener('mousedown', onUserDown);
        wechat.removeEventListener('touchstart', onUserDown);
        wechat.removeEventListener('scroll', handleWechatScroll);
      }

      // 清理定时器/锁
      if (userInteractTimerRef.current) {
        clearTimeout(userInteractTimerRef.current);
        userInteractTimerRef.current = null;
      }
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
        lockTimerRef.current = null;
      }
      rafPendingRef.current = false;
      programmaticLockRef.current = false;
      userInteractingRef.current = false;

      if (debug) console.debug('[scroll-sync] listeners removed and cleared');
    };
  // 这些依赖项里不要放 ref.current（React 推荐），只放 handler 依赖和配置
  }, [
    enabled,
    syncOnInput,
    debug,
    getEditorTextarea,
    handleEditorScroll,
    handlePreviewScroll,
    handleWechatScroll,
    handleEditorInput,
    markUserInteracting,
  ]);

  return {
    editorRef,
    previewRef,
    wechatRef,
  };
};

export default useBasicScrollSync;
