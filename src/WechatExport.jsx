// src/WechatExport.jsx

import React, { useState, useEffect } from 'react';
import { marked } from 'marked';

// ✅ 1. 将 replaceAsync 定义为一个独立的、可导出的辅助函数
async function replaceAsync(str, regex, asyncFn) {
  const promises = [];
  str.replace(regex, (match, ...args) => {
    promises.push(asyncFn(match, ...args));
  });
  const data = await Promise.all(promises);
  return str.replace(regex, () => data.shift());
}


function WechatExport({ value, filePath }) {
  const [renderedHtml, setRenderedHtml] = useState('');

  useEffect(() => {
    const processMarkdown = async () => {
      // 增加对 value 的健壮性检查
      if (typeof value !== 'string') {
        setRenderedHtml('');
        return;
      }

      // 1. 先将 Markdown 转换为初步的 HTML
      let html = marked(value);

      // 2. 处理 HTML 中的图片路径
      if (filePath) {
        // 增加对 filePath 的健壮性检查
        if (typeof filePath !== 'string' || !window.electronAPI?.path?.dirname) {
          setRenderedHtml(html); // 如果 filePath 或 API 无效，则跳过图片处理
          return;
        }

        const fileDir = window.electronAPI.path.dirname(filePath);
        
        const imgRegex = /<img src="([^"]+)"/g;
        
        // ✅ 2. 使用新的辅助函数来调用
        html = await replaceAsync(html, imgRegex, async (match, src) => {
            if (src.startsWith('http') || src.startsWith('data:')) {
                return match;
            }

            // 增加对 resolve API 的检查
            if (!window.electronAPI?.path?.resolve || !window.electronAPI?.convertFileSrc) {
                return match; // 如果 API 不存在，则返回原样
            }

            const absoluteImgPath = window.electronAPI.path.resolve(fileDir, src);
            const safeSrc = await window.electronAPI.convertFileSrc(absoluteImgPath);
            
            // 返回替换后的整个 img 标签字符串的一部分
            return `<img src="${safeSrc}"`;
        });
      }

      setRenderedHtml(html);
    };

    processMarkdown();
  }, [value, filePath]);

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