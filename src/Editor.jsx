// Editor.jsx - CodeMirror 6 版本，配置为纯文本写作模式
import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

function EditorComponent({ value, onChange, onUploadingChange }, forwardedRef) {
  const editorContainerRef = useRef(null);
  const editorViewRef = useRef(null);
  const isUpdatingRef = useRef(false);
  const findInputRef = useRef(null);
  const replaceInputRef = useRef(null);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchMode, setSearchMode] = useState('find'); // 'find' | 'replace'
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [searchMeta, setSearchMeta] = useState({ current: 0, total: 0, message: '' });

  const searchVisibleRef = useRef(false);
  const searchQueryRef = useRef('');
  const replaceTextRef = useRef('');
  const caseSensitiveRef = useRef(false);

  const openSearchPanelRef = useRef(() => false);
  const closeSearchPanelRef = useRef(() => false);
  const findNextRef = useRef(() => false);
  const replaceCurrentRef = useRef(() => false);
  const replaceAllRef = useRef(() => false);
  const refreshSearchMetaRef = useRef(() => []);

  const normalize = (text, cs) => (cs ? text : text.toLowerCase());

  const collectMatches = (docText, needle, cs) => {
    if (!needle) return [];
    const source = normalize(docText, cs);
    const target = normalize(needle, cs);
    if (!target) return [];

    const matches = [];
    let fromIndex = 0;
    while (fromIndex <= source.length) {
      const idx = source.indexOf(target, fromIndex);
      if (idx === -1) break;
      matches.push({ from: idx, to: idx + needle.length });
      fromIndex = idx + Math.max(target.length, 1);
    }
    return matches;
  };

  const refreshSearchMeta = (message = '') => {
    const view = editorViewRef.current;
    if (!view) return [];

    const query = searchQueryRef.current;
    if (!query) {
      setSearchMeta({ current: 0, total: 0, message });
      return [];
    }

    const matches = collectMatches(view.state.doc.toString(), query, caseSensitiveRef.current);
    const sel = view.state.selection.main;
    const currentIndex = matches.findIndex((m) => m.from === sel.from && m.to === sel.to);

    setSearchMeta({
      current: currentIndex >= 0 ? currentIndex + 1 : 0,
      total: matches.length,
      message: message || (matches.length === 0 ? '未找到匹配项' : ''),
    });
    return matches;
  };

  const openSearchPanel = (mode = 'find') => {
    const view = editorViewRef.current;
    if (!view) return false;

    setSearchVisible(true);
    searchVisibleRef.current = true;
    setSearchMode(mode);
    setSearchMeta((prev) => ({ ...prev, message: '' }));

    const sel = view.state.selection.main;
    if (sel.from !== sel.to) {
      const selected = view.state.sliceDoc(sel.from, sel.to);
      if (selected && selected !== searchQueryRef.current) {
        searchQueryRef.current = selected;
        setSearchQuery(selected);
      }
    }

    requestAnimationFrame(() => {
      if (mode === 'replace' && searchQueryRef.current && replaceInputRef.current) {
        replaceInputRef.current.focus();
        replaceInputRef.current.select();
      } else if (findInputRef.current) {
        findInputRef.current.focus();
        findInputRef.current.select();
      }
    });

    refreshSearchMeta('');
    return true;
  };

  const closeSearchPanel = () => {
    setSearchVisible(false);
    searchVisibleRef.current = false;
    setSearchMeta((prev) => ({ ...prev, message: '' }));
    editorViewRef.current?.focus();
    return true;
  };

  const findNextMatch = (direction = 1) => {
    const view = editorViewRef.current;
    if (!view) return false;

    const query = searchQueryRef.current;
    if (!query) {
      setSearchMeta({ current: 0, total: 0, message: '请输入查找内容' });
      return false;
    }

    const matches = collectMatches(view.state.doc.toString(), query, caseSensitiveRef.current);
    if (matches.length === 0) {
      setSearchMeta({ current: 0, total: 0, message: '未找到匹配项' });
      return false;
    }

    const sel = view.state.selection.main;
    const currentIndex = matches.findIndex((m) => m.from === sel.from && m.to === sel.to);
    let targetIndex = -1;

    if (direction > 0) {
      if (currentIndex >= 0) {
        targetIndex = (currentIndex + 1) % matches.length;
      } else {
        targetIndex = matches.findIndex((m) => m.from >= sel.to);
        if (targetIndex === -1) targetIndex = 0;
      }
    } else {
      if (currentIndex >= 0) {
        targetIndex = (currentIndex - 1 + matches.length) % matches.length;
      } else {
        for (let i = matches.length - 1; i >= 0; i -= 1) {
          if (matches[i].to <= sel.from) {
            targetIndex = i;
            break;
          }
        }
        if (targetIndex === -1) targetIndex = matches.length - 1;
      }
    }

    const target = matches[targetIndex];
    view.dispatch({
      selection: { anchor: target.from, head: target.to },
      scrollIntoView: true,
    });
    setSearchMeta({ current: targetIndex + 1, total: matches.length, message: '' });
    return true;
  };

  const replaceCurrent = () => {
    const view = editorViewRef.current;
    if (!view) return false;

    const query = searchQueryRef.current;
    if (!query) {
      setSearchMeta({ current: 0, total: 0, message: '请输入查找内容' });
      return false;
    }

    let matches = collectMatches(view.state.doc.toString(), query, caseSensitiveRef.current);
    if (matches.length === 0) {
      setSearchMeta({ current: 0, total: 0, message: '未找到可替换项' });
      return false;
    }

    let sel = view.state.selection.main;
    let currentIndex = matches.findIndex((m) => m.from === sel.from && m.to === sel.to);

    if (currentIndex === -1) {
      if (!findNextMatch(1)) return false;
      sel = view.state.selection.main;
      matches = collectMatches(view.state.doc.toString(), query, caseSensitiveRef.current);
      currentIndex = matches.findIndex((m) => m.from === sel.from && m.to === sel.to);
      if (currentIndex === -1) return false;
    }

    const insert = replaceTextRef.current;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert },
      selection: { anchor: sel.from, head: sel.from + insert.length },
      scrollIntoView: true,
    });

    const remaining = collectMatches(view.state.doc.toString(), query, caseSensitiveRef.current);
    if (remaining.length === 0) {
      setSearchMeta({ current: 0, total: 0, message: '替换完成' });
      return true;
    }

    findNextMatch(1);
    return true;
  };

  const replaceAllMatches = () => {
    const view = editorViewRef.current;
    if (!view) return false;

    const query = searchQueryRef.current;
    if (!query) {
      setSearchMeta({ current: 0, total: 0, message: '请输入查找内容' });
      return false;
    }

    const matches = collectMatches(view.state.doc.toString(), query, caseSensitiveRef.current);
    if (matches.length === 0) {
      setSearchMeta({ current: 0, total: 0, message: '未找到可替换项' });
      return false;
    }

    const insert = replaceTextRef.current;
    const changes = matches.map((m) => ({ from: m.from, to: m.to, insert }));
    view.dispatch({ changes });

    const replacedCount = matches.length;
    const remaining = collectMatches(view.state.doc.toString(), query, caseSensitiveRef.current);
    setSearchMeta({
      current: 0,
      total: remaining.length,
      message: `已全部替换 ${replacedCount} 处`,
    });
    return true;
  };

  useEffect(() => {
    searchVisibleRef.current = searchVisible;
  }, [searchVisible]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    replaceTextRef.current = replaceText;
  }, [replaceText]);

  useEffect(() => {
    caseSensitiveRef.current = caseSensitive;
  }, [caseSensitive]);

  useEffect(() => {
    openSearchPanelRef.current = openSearchPanel;
    closeSearchPanelRef.current = closeSearchPanel;
    findNextRef.current = findNextMatch;
    replaceCurrentRef.current = replaceCurrent;
    replaceAllRef.current = replaceAllMatches;
    refreshSearchMetaRef.current = refreshSearchMeta;
  });

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

        // 键盘快捷键
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          // 自定义快捷键
          {
            key: 'Mod-f',
            run: () => openSearchPanelRef.current('find'),
          },
          {
            key: 'Mod-r',
            run: () => openSearchPanelRef.current('replace'),
          },
          {
            key: 'Mod-h',
            run: () => openSearchPanelRef.current('replace'),
          },
          {
            key: 'F3',
            run: () => findNextRef.current(1),
          },
          {
            key: 'Shift-F3',
            run: () => findNextRef.current(-1),
          },
          {
            key: 'Mod-Shift-r',
            run: () => replaceAllRef.current(),
          },
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
              if (searchVisibleRef.current) {
                closeSearchPanelRef.current();
                return true;
              }
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

            if (searchVisibleRef.current && searchQueryRef.current) {
              refreshSearchMetaRef.current('');
            }
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
  }, []); // 只在组件挂载时创建一次编辑器

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
    <div className="editor-shell" style={{ height: '100%', width: '100%' }}>
      <div
        className="editor codemirror-editor"
        ref={editorContainerRef}
        style={{ height: '100%', width: '100%' }}
      />

      {searchVisible && (
        <div className="editor-search-panel" role="dialog" aria-label="查找替换">
          <div className="editor-search-row">
            <input
              ref={findInputRef}
              type="text"
              className="editor-search-input"
              value={searchQuery}
              placeholder="查找（Ctrl+F）"
              onChange={(e) => {
                const next = e.target.value;
                searchQueryRef.current = next;
                setSearchQuery(next);
                refreshSearchMeta('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  findNextMatch(e.shiftKey ? -1 : 1);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  closeSearchPanel();
                }
              }}
            />

            <label className="editor-search-check" title="区分大小写">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => {
                  const next = e.target.checked;
                  caseSensitiveRef.current = next;
                  setCaseSensitive(next);
                  refreshSearchMeta('');
                }}
              />
              大小写
            </label>

            <button type="button" onClick={() => findNextMatch(-1)} title="上一个（Shift+F3）">上一个</button>
            <button type="button" onClick={() => findNextMatch(1)} title="下一个（F3）">下一个</button>

            {searchMode === 'find' ? (
              <button type="button" onClick={() => setSearchMode('replace')} title="切换到替换（Ctrl+R）">替换</button>
            ) : (
              <button type="button" onClick={() => setSearchMode('find')} title="只查找">仅查找</button>
            )}
            <button type="button" onClick={closeSearchPanel} title="关闭（Esc）">关闭</button>
          </div>

          {searchMode === 'replace' && (
            <div className="editor-search-row">
              <input
                ref={replaceInputRef}
                type="text"
                className="editor-search-input"
                value={replaceText}
                placeholder="替换为（Ctrl+R）"
                onChange={(e) => {
                  const next = e.target.value;
                  replaceTextRef.current = next;
                  setReplaceText(next);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.ctrlKey || e.metaKey) {
                      replaceAllMatches();
                    } else {
                      replaceCurrent();
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    closeSearchPanel();
                  }
                }}
              />
              <button type="button" onClick={replaceCurrent} title="替换当前并跳到下一个">替换</button>
              <button type="button" onClick={replaceAllMatches} title="全部替换（Ctrl+Shift+R）">全部替换</button>
            </div>
          )}

          <div className="editor-search-meta">
            <span>{`${searchMeta.current}/${searchMeta.total}`}</span>
            <span>{searchMeta.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default forwardRef(EditorComponent);
