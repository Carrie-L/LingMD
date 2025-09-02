// src/Preview.jsx

import React from 'react';
import { useMarkdownRenderer } from './useMarkdownRenderer'; // 导入新 Hook

function Preview({ value, filePath }) {
  // ✅ 直接调用 Hook 获取渲染好的 HTML
  const renderedHtml = useMarkdownRenderer(value, filePath);

  return (
    <div className="preview">
      <div
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
}

export default Preview;