import { useEffect, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

// 自定义扩展：支持 Obsidian 的 ![[xxx.png]]
const obsidianImageExtension = {
  name: "obsidian-image",
  level: "inline",
  start(src) {
    return src.match(/!\[\[(.*?)\]\]/)?.index;
  },
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
    // 渲染时，src直接使用文件名，并进行编码以防特殊字符
    return `<img src="${encodeURIComponent(token.src)}" alt="${token.alt}" />`;
  },
};

marked.use({ extensions: [obsidianImageExtension] });

// 异步替换函数：处理图片路径
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
  const [html, setHtml] = useState("");

  useEffect(() => {
    async function render() {
      if (!content) {
        setHtml("");
        return;
      }

      let rawHtml = marked(content);

      // ===================================================================
      // ✅ 图片路径异步替换 - 修复版
      // ===================================================================
      rawHtml = await replaceAsync(rawHtml, async (match, src, rest) => {
        try {
          // 1. 解码从 img 标签获取的 src
          const decodedSrc = decodeURIComponent(src);
          console.log("[Renderer] 捕获到图片 src:", decodedSrc);

          // 2. 获取当前 markdown 文件的目录 (如果文件已保存)
          const fileDir = filePath ? window.electronAPI.path.dirname(filePath) : "";

          // 3. 调用主进程的解析函数，同时传递 fileDir 和 src
          const resolvedPath = await window.electronAPI.resolveImagePath({
            fileDir,
            src: decodedSrc, // 传递原始 src，让 main 进程处理
          });

          console.log("[Renderer] 解析结果:", resolvedPath, rest);

          if (resolvedPath) {
            // 如果解析成功，替换为 safe-file:// 协议的路径
            return `<img src="${resolvedPath}" >`;
          }
        } catch (err) {
          console.error("[Renderer] 图片路径解析失败:", src, err);
        }
        // 如果解析失败或发生错误，返回原始的 img 标签
        return match; 
      });

      // ✅ 关键修复：配置 DOMPurify 以允许 'safe-file' 协议
      const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: ['img', 'a', 'p', 'div', 'span', 'code', 'pre'], 
        ALLOWED_ATTR: ['src', 'href', 'alt', 'title'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|safe-file|file|blob|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
        });

        console.log("最终 rawHtml:", rawHtml);
        console.log("最终 sanitizedHtml:", sanitizedHtml);


      setHtml(sanitizedHtml);
    }

    render();
  }, [content, filePath]);

  return html;
}
