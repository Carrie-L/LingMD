// Editor.jsx - CodeMirror 6 版本，配置为纯文本写作模式
import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

function EditorComponent({ value, onChange, onUploadingChange, mdTheme }, forwardedRef) {
  const editorContainerRef = useRef(null);
  const editorViewRef = useRef(null);
  const isUpdatingRef = useRef(false);

  // 初始化 CodeMirror
  useEffect(() => {
    if (!editorContainerRef.current) return;

    // 保存当前编辑器内容
    const currentValue = editorViewRef.current ? editorViewRef.current.state.doc.toString() : (value || '');

    const startState = EditorState.create({
      doc: currentValue,
      extensions: [
        // 启用历史记录（撤销/重做）
        history(),

        // 自动换行 - 写作必备
        EditorView.lineWrapping,

        // 占位符
        placeholder('在这里输入 Markdown，或者打开文件...'),

        // 极简黑白主题样式
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '15px',
            fontFamily: "'LXGW WenKai', 'PingFang SC', system-ui, sans-serif",
            backgroundColor: '#ffffff',
          },
          '.cm-content': {
            padding: '40px',
            caretColor: '#212121',
            lineHeight: '2.5',
            color: '#212121',
            fontFamily: 'inherit',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: 'inherit',
          },
          '.cm-line': {
            fontFamily: 'inherit',
            color: '#212121',
          },
          // 隐藏行号和侧边栏
          '.cm-gutters': {
            display: 'none',
          },
          // 光标样式
          '.cm-cursor': {
            borderLeftColor: '#212121',
            borderLeftWidth: '2px',
          },
          // 选中文本样式 - 淡灰色
          '&.cm-focused .cm-selectionBackground, ::selection': {
            backgroundColor: '#e5e5e5',
          },
          // 占位符样式
          '.cm-placeholder': {
            color: '#999',
            fontStyle: 'normal',
          },
        }),

        // 键盘快捷键
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          // 自定义快捷键
          {
            key: 'Mod-b',
            run: (view) => {
              toggleWrap(view, '**', '**');
              return true;
            },
          },
          {
            key: 'Mod-i',
            run: (view) => {
              toggleWrap(view, '*', '*');
              return true;
            },
          },
          {
            key: '`',
            run: (view) => {
              toggleWrap(view, '`', '`');
              return true;
            },
          },
          {
            key: 'Mod-k',
            run: (view) => {
              insertLink(view);
              return true;
            },
          },
          {
            key: 'Mod-Shift-c',
            run: (view) => {
              toggleCodeBlock(view);
              return true;
            },
          },
          {
            key: 'Mod-Shift-l',
            run: (view) => {
              toggleLinePrefix(view, '- ');
              return true;
            },
          },
          {
            key: 'Mod-Shift-o',
            run: (view) => {
              toggleOrderedList(view);
              return true;
            },
          },
          {
            key: 'Mod-Shift-h',
            run: (view) => {
              toggleLinePrefix(view, '# ');
              return true;
            },
          },
          {
            key: 'Escape',
            run: () => {
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
                return true;
              }
              if (window.electronAPI && typeof window.electronAPI.exitFullScreen === 'function') {
                window.electronAPI.exitFullScreen().catch(() => {});
                return true;
              }
              return false;
            },
          },
        ]),

        // 监听内容变化
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isUpdatingRef.current) {
            const newValue = update.state.doc.toString();
            onChange && onChange(newValue);
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: editorContainerRef.current,
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [mdTheme]); // 主题变化时重新创建编辑器

  // 当外部 value 变化时更新编辑器
  useEffect(() => {
    if (!editorViewRef.current || isUpdatingRef.current) return;

    const currentDoc = editorViewRef.current.state.doc.toString();
    if (currentDoc !== value) {
      isUpdatingRef.current = true;
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: value || '',
        },
      });
      isUpdatingRef.current = false;
    }
  }, [value]);

  // 暴露方法给父组件
  useImperativeHandle(forwardedRef, () => ({
    // 返回可滚动的 DOM 元素
    el: editorViewRef.current?.scrollDOM,
    focus: () => editorViewRef.current?.focus(),
    getValue: () => editorViewRef.current?.state.doc.toString(),
    handleFileSelect: async (eOrFiles) => {
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
    },
  }), []);

  // ========== 辅助函数 ==========

  const toggleWrap = (view, prefix, suffix) => {
    const state = view.state;
    const selection = state.selection.main;
    const from = selection.from;
    const to = selection.to;
    const text = state.doc.toString();

    const before = text.slice(0, from);
    const selected = text.slice(from, to);
    const after = text.slice(to);

    const preStart = from - prefix.length;
    const postEnd = to + suffix.length;

    // 检查是否已经被包裹
    if (
      preStart >= 0 &&
      text.slice(preStart, from) === prefix &&
      text.slice(to, postEnd) === suffix
    ) {
      // 取消包裹
      view.dispatch({
        changes: [
          { from: preStart, to: from, insert: '' },
          { from: to, to: postEnd, insert: '' },
        ],
        selection: { anchor: preStart, head: preStart + selected.length },
      });
    } else {
      // 添加包裹
      view.dispatch({
        changes: { from, to, insert: prefix + selected + suffix },
        selection: { anchor: from + prefix.length, head: from + prefix.length + selected.length },
      });
    }
  };

  const toggleCodeBlock = (view) => {
    const state = view.state;
    const selection = state.selection.main;
    const from = selection.from;
    const to = selection.to;
    const text = state.doc.toString();

    const before = text.slice(0, from);
    const selected = text.slice(from, to);
    const after = text.slice(to);

    const pre = text.slice(Math.max(0, from - 4), from);
    const post = text.slice(to, to + 4);

    if (pre.endsWith('```\n') && post.startsWith('\n```')) {
      // 取消代码块
      view.dispatch({
        changes: [
          { from: from - 4, to: from, insert: '' },
          { from: to, to: to + 4, insert: '' },
        ],
        selection: { anchor: from - 4, head: from - 4 + selected.length },
      });
    } else {
      // 添加代码块
      const needNewlineBefore = before.length === 0 || before.endsWith('\n') ? '' : '\n';
      const needNewlineAfter = after.length === 0 || after.startsWith('\n') ? '' : '\n';
      const insert = needNewlineBefore + '```\n' + selected + '\n```' + needNewlineAfter;

      view.dispatch({
        changes: { from, to, insert },
        selection: {
          anchor: from + needNewlineBefore.length + 4,
          head: from + needNewlineBefore.length + 4 + selected.length
        },
      });
    }
  };

  const toggleLinePrefix = (view, prefix) => {
    const state = view.state;
    const selection = state.selection.main;
    const from = selection.from;
    const to = selection.to;
    const text = state.doc.toString();

    // 找到选区的行范围
    const lineStart = text.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
    const lineEndPos = text.indexOf('\n', to);
    const lineEnd = lineEndPos === -1 ? text.length : lineEndPos;

    const selectedLines = text.slice(lineStart, lineEnd).split('\n');
    const allHave = selectedLines.every(l => l.startsWith(prefix));

    let processed;
    if (allHave) {
      processed = selectedLines.map(l => l.slice(prefix.length)).join('\n');
    } else {
      processed = selectedLines.map(l => (l.trim() === '' ? l : prefix + l)).join('\n');
    }

    view.dispatch({
      changes: { from: lineStart, to: lineEnd, insert: processed },
      selection: {
        anchor: from + (allHave ? -prefix.length : prefix.length),
        head: from + (allHave ? -prefix.length : prefix.length) + (processed.length - (lineEnd - lineStart))
      },
    });
  };

  const toggleOrderedList = (view) => {
    const state = view.state;
    const selection = state.selection.main;
    const from = selection.from;
    const to = selection.to;
    const text = state.doc.toString();

    const lineStart = text.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
    const lineEndPos = text.indexOf('\n', to);
    const lineEnd = lineEndPos === -1 ? text.length : lineEndPos;

    const selectedLines = text.slice(lineStart, lineEnd).split('\n');
    const allHave = selectedLines.every(l => /^\d+\. /.test(l));

    let processed;
    if (allHave) {
      processed = selectedLines.map(l => l.replace(/^\d+\. /, '')).join('\n');
    } else {
      processed = selectedLines.map((l, idx) => (l.trim() === '' ? l : `${idx + 1}. ${l}`)).join('\n');
    }

    view.dispatch({
      changes: { from: lineStart, to: lineEnd, insert: processed },
      selection: { anchor: from, head: from + processed.length },
    });
  };

  const insertLink = (view) => {
    const state = view.state;
    const selection = state.selection.main;
    const from = selection.from;
    const to = selection.to;
    const text = state.doc.toString();
    const selected = text.slice(from, to);

    const url = prompt('输入链接 URL:', 'https://');
    if (!url) return;

    const textForLink = selected || prompt('链接文本（留空使用 URL）:', url) || url;
    const linkMd = `[${textForLink}](${url})`;

    view.dispatch({
      changes: { from, to, insert: linkMd },
      selection: { anchor: from, head: from + linkMd.length },
    });
  };

  const handleImageUpload = async (file) => {
    try {
      if (onUploadingChange) onUploadingChange(true);

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
      if (onUploadingChange) onUploadingChange(false);
    }
  };

  const insertImageMarkdown = (imagePath, altText) => {
    const view = editorViewRef.current;
    if (!view) return;

    const state = view.state;
    const selection = state.selection.main;
    const cursorPosition = selection.head;
    const text = state.doc.toString();

    const textBefore = text.substring(0, cursorPosition);
    const textAfter = text.substring(cursorPosition);
    const imageMarkdown = `![](${imagePath})`;

    const needNewLineBefore = textBefore.length > 0 && !textBefore.endsWith('\n');
    const needNewLineAfter = textAfter.length > 0 && !textAfter.startsWith('\n');

    const insert =
      (needNewLineBefore ? '\n\n' : '\n') +
      imageMarkdown +
      (needNewLineAfter ? '\n\n' : '\n');

    view.dispatch({
      changes: { from: cursorPosition, to: cursorPosition, insert },
      selection: { anchor: cursorPosition + insert.length, head: cursorPosition + insert.length },
    });

    view.focus();
  };

  // 处理粘贴事件
  useEffect(() => {
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

    const container = editorContainerRef.current;
    if (container) {
      container.addEventListener('paste', handlePaste);
      return () => container.removeEventListener('paste', handlePaste);
    }
  }, []);

  // 处理拖放事件
  useEffect(() => {
    const handleDrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer.files || []);
      const imageFiles = files.filter(f => f.type && f.type.startsWith('image/'));
      for (let file of imageFiles) {
        await handleImageUpload(file);
      }
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const container = editorContainerRef.current;
    if (container) {
      container.addEventListener('drop', handleDrop);
      container.addEventListener('dragover', handleDragOver);
      return () => {
        container.removeEventListener('drop', handleDrop);
        container.removeEventListener('dragover', handleDragOver);
      };
    }
  }, []);

  return (
    <div
      className="editor codemirror-editor"
      ref={editorContainerRef}
      style={{ height: '100%', width: '100%' }}
    />
  );
}

export default forwardRef(EditorComponent);
