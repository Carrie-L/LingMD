import { useEffect, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from 'highlight.js/lib/core';

// 2. ✅ 显式导入并注册你需要的语言包
// 你可以根据需要添加更多语言，比如 python, css, html, bash 等
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml'; // for HTML
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import java from 'highlight.js/lib/languages/java';
import kotlin from 'highlight.js/lib/languages/kotlin';

// 3. ✅ 注册语言
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript); // 别名
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript); // 别名
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml); // HTML 使用 xml 语言包
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python); // 别名
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('java', java);
hljs.registerLanguage('kotlin', kotlin);

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
    return `<img src="${encodeURIComponent(token.src)}" alt="${token.alt}" />`;
  },
};
marked.use({ extensions: [obsidianImageExtension] });

// 我们只配置 highlight 函数，让它返回带 class 的 <span>
marked.setOptions({
  highlight: function(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  },
  langPrefix: 'hljs language-', // 确保 langPrefix 正确
});


const renderer = new marked.Renderer();
renderer.code = ({ text, lang }) => {
  const code = text || "";
  const language = lang || "plaintext";

  try {
    if (hljs.getLanguage(language)) {
      const highlighted = hljs.highlight(code, { language, ignoreIllegals: true }).value;
      return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
    }
    const highlighted = hljs.highlightAuto(code).value;
    return `<pre><code class="hljs">${highlighted}</code></pre>`;
  } catch (e) {
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<pre><code class="hljs language-plaintext">${escaped}</code></pre>`;
  }
};

marked.use({ renderer });



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
    rawHtml: "",
    sanitizedHtml: "",
  });

  useEffect(() => {
    async function render() {
      if (!content) {
        setHtmlResult({ rawHtml: "", sanitizedHtml: "" });
        return;
      }

      let rawHtml = marked(content);
      console.log("✅✅rawHtml:", rawHtml);

      rawHtml = await replaceAsync(rawHtml, async (match, src, rest) => {
        try {
          const decodedSrc = decodeURIComponent(src);
          const fileDir = filePath
            ? window.electronAPI.path.dirname(filePath)
            : "";
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

      console.log("✅✅✅✅rawHtml:", rawHtml);

      // ✅ 关键修复：使用 ADD_PROTOCOLS 而不是 ALLOWED_PROTOCOLS
      // 这会将 'safe-file' 添加到 DOMPurify 的默认安全协议列表中，而不是覆盖它们。
      // 这是最健壮和推荐的做法。
      const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
  ALLOWED_TAGS: [
    "p","div","span","br","h1","h2","h3","h4","h5","h6",
    "strong","b","em","i","u","del","s","code","blockquote","hr",
    "pre","ul","ol","li","table","thead","tbody","tr","th","td",
    "a","img"
  ],
  ALLOWED_ATTR: [
    "href", "src", "alt", "title", "colspan", "rowspan", "class"   // ✅ 加上 class
  ],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|safe-file|file|blob|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  ADD_PROTOCOLS: ['safe-file'],
});


      // (调试日志)
      console.log("--- HTML Rendering ---");
      console.log("Raw HTML (has class):", rawHtml.substring(0, 300));
      console.log("Sanitized HTML (should also have class):", sanitizedHtml.substring(0, 300));
      if (rawHtml.includes('class=') && !sanitizedHtml.includes('class=')) {
          console.error("!!! Critical Error: 'class' attribute was STILL removed by DOMPurify!");
      }

      console.log("✅✅✅✅✅sanitizedHtml:", sanitizedHtml);

      setHtmlResult({ rawHtml, sanitizedHtml });
    }

    render();
  }, [content, filePath]);

  return htmlResult;
}
