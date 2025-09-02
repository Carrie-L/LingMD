// useMarkdownRenderer.js --- 最终修复版 v2

import { useEffect, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

// 自定义扩展：支持 Obsidian 的 ![[xxx.png]]
const obsidianImageExtension = {
  name: "obsidian-image",
  level: "inline",
  start(src) { return src.match(/!\[\[(.*?)\]\]/)?.index; },
  tokenizer(src) {
    const rule = /^!\[\[(.+?)\]\]/;
    const match = rule.exec(src);
    if (match) {
      return {
        type: "obsidian-image",
        raw: match[0],
        src: match[1].trim(),
        alt: match[1].trim(),
      };
    }
  },
  renderer(token) {
    return `<img src="${encodeURIComponent(token.src)}" alt="${token.alt}" />`;
  },
};
marked.use({ extensions: [obsidianImageExtension] });

// 异步替换函数
async function replaceAsync(html, callback) {
  const regex = /<img src="(.*?)"(.*?)>/g;
  const promises = [];
  html.replace(regex, (match, src, rest) => {
    promises.push(callback(match, src, rest));
    return match;
  });
  const results = await Promise.all(promises);
  return html.replace(regex, () => results.shift());
}

export function useMarkdownRenderer(content, filePath) {
  const [htmlResult, setHtmlResult] = useState({
    rawHtml: '',
    sanitizedHtml: '',
  });

  useEffect(() => {
    async function render() {
      if (!content) {
        setHtmlResult({ rawHtml: '', sanitizedHtml: '' });
        return;
      }

      let rawHtml = marked(content);

      rawHtml = await replaceAsync(rawHtml, async (match, src, rest) => {
        try {
          const decodedSrc = decodeURIComponent(src);
          const fileDir = filePath ? window.electronAPI.path.dirname(filePath) : "";
          const resolvedPath = await window.electronAPI.resolveImagePath({
            fileDir,
            src: decodedSrc,
          });

          if (resolvedPath) {
            return `<img src="${resolvedPath}" ${rest}>`;
          }
        } catch (err) {
          console.error("[Renderer] 图片路径解析失败:", src, err);
        }
        return match; 
      });

      // ✅ 关键修复：使用 ADD_PROTOCOLS 而不是 ALLOWED_PROTOCOLS
      // 这会将 'safe-file' 添加到 DOMPurify 的默认安全协议列表中，而不是覆盖它们。
      // 这是最健壮和推荐的做法。
      const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
         ALLOWED_TAGS: ['img', 'a', 'p', 'div', 'span', 'code', 'pre'], 
        ALLOWED_ATTR: ['src', 'href', 'alt', 'title'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|safe-file|file|blob|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
        });


      setHtmlResult({ rawHtml, sanitizedHtml });
    }

    render();
  }, [content, filePath]);

  return htmlResult;
}