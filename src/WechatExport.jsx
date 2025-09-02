// src/WechatExport.jsx

import React from 'react';
import { useMarkdownRenderer } from './useMarkdownRenderer'; // 导入新 Hook

function WechatExport({ value, filePath }) {
  // ✅ 同样直接调用 Hook
  const renderedHtml = useMarkdownRenderer(value, filePath);

  return (
    <div className="wechat-export">
      <div>
        <div
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>
    </div>
  );
}

export default WechatExport;