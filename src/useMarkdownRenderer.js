import { useEffect, useState, useMemo } from "react";
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import mdTaskLists from "markdown-it-task-lists";
import mdAttrs from "markdown-it-attrs";
import mdKatex from "markdown-it-katex";
import hljs from "highlight.js/lib/core";
import { useDebounce } from "./useDebounce";

// 导入并注册语言包
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import java from "highlight.js/lib/languages/java";
import kotlin from "highlight.js/lib/languages/kotlin";

// 注册语言
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("java", java);
hljs.registerLanguage("kotlin", kotlin);

// Mermaid 初始化将在 App.jsx 中统一处理


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
    return "";
  },
};

// 创建 markdown-it 实例
function createMarkdownIt() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: (str, lang) => {
      try {
        if (lang && hljs.getLanguage(lang)) {
          return `<pre><code class="hljs language-${lang}">${
            hljs.highlight(str, { language: lang }).value
          }</code></pre>`;
        } else {
          return `<pre><code class="hljs">${
            hljs.highlightAuto(str).value
          }</code></pre>`;
        }
      } catch (e) {
        const esc = str
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `<pre><code class="hljs language-plaintext">${esc}</code></pre>`;
      }
    },
  });

  // 添加插件
  md.use(mdTaskLists, { enabled: true, label: true });
  md.use(mdKatex);
  md.use(mdAttrs);

  // 重要：重写 fence 规则来处理 mermaid
  const defaultFence =
    md.renderer.rules.fence ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || "").trim().toLowerCase();

    // 检查是否为 mermaid 代码块
    if (info === "mermaid") {
      const code = token.content.trim();
      // **极其重要**：只返回一个简单的 div 容器。不要加 ID，不要做任何其他处理。
      // CSS 和 App.jsx 会处理剩下的事情。
      return `<div class="mermaid">${code}</div>`;
    }

    // 其他代码块走默认渲染
    return defaultFence(tokens, idx, options, env, self);
  };

  return md;
}

// marked 渲染器设置
// const renderer = new marked.Renderer();
// renderer.code = ({ text, lang }) => {
//   const code = text || "";
//   const language = lang || "plaintext";

//   try {
//     if (hljs.getLanguage(language)) {
//       const highlighted = hljs.highlight(code, {
//         language,
//         ignoreIllegals: true,
//       }).value;
//       return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
//     }
//     const highlighted = hljs.highlightAuto(code).value;
//     return `<pre><code class="hljs">${highlighted}</code></pre>`;
//   } catch (e) {
//     const escaped = code
//       .replace(/&/g, "&amp;")
//       .replace(/</g, "&lt;")
//       .replace(/>/g, "&gt;");
//     return `<pre><code class="hljs language-plaintext">${escaped}</code></pre>`;
//   }
// };

// marked.use({
//   extensions: [obsidianImageExtension],
//   renderer: renderer,
//   gfm: true,
//   breaks: true,
// });

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

// ====== 新增的 helper：把 mermaid div 替换为 SVG ======
// 输入：rawHtml 包含 `<div class="mermaid">...code...</div>`
// 输出：rawHtml 中相应 div 被替换为返回的 SVG 字符串（内联 svg）
// 若渲染失败或 mermaid API 不可用，则回退为原始 div（不破坏原有内容）
async function renderMermaidBlocksToSvg(rawHtml) {
  if (!rawHtml || rawHtml.indexOf('class="mermaid"') === -1) return rawHtml;

  // 正则匹配所有 mermaid div（非贪婪）
  const mermaidRegex =
    /<div\s+class=(?:"|')mermaid(?:"|')\s*>([\s\S]*?)<\/div>/gi;

  const tasks = [];
  const matches = [];
  rawHtml.replace(mermaidRegex, (match, code) => {
    matches.push({ match, code });
    return match;
  });

  if (!matches.length) return rawHtml;

  for (let i = 0; i < matches.length; i++) {
    const original = matches[i].match;
    // code 里可能还包含 HTML 实体（如果你的 markdown 渲染步骤曾经 escape 过），
    // 但在你的项目里 markdown-it 直接放入了原始文本，所以这里通常是原始 mermaid 源。
    const code = matches[i].code || "";
    let svg = null;

    try {
      if (typeof document !== 'undefined' && mermaid && mermaid.render) {
        svg = await new Promise((resolve, reject) => {
          const id = `mermaid-${Date.now()}-${i}-${Math.round(
            Math.random() * 10000
          )}`;

          // 必要的防护：只有在浏览器环境且 document 存在时创建临时容器
          if (typeof document === "undefined") {
            // 没有 DOM 环境，无法渲染内联 SVG，回退
            return resolve(null);
          }

          try {
            // 创建一个临时容器元素并传入 render，避免 d3 select 时 selection.node() 为 undefined
            const tempContainer = document.createElement("div");
            // (可选) 将 tempContainer 暂时挂到 document 中，某些浏览器/环境在 detached nodes 上可能有差异：
            // document.body.appendChild(tempContainer);

            mermaid.parse.render(
              id,
              code,
              (svgCode) => {
                // 如果之前 append 到 document.body 了，可以移除 tempContainer 以清理
                // if (tempContainer.parentNode) tempContainer.parentNode.removeChild(tempContainer);
                resolve(svgCode);
              },
              tempContainer
            );
          } catch (e) {
            reject(e);
          }
        });
      } else {
        svg = null;
      }
    } catch (e) {
      console.warn("[Renderer] mermaid.mermaidAPI.render failed for block:", e);
      svg = null;
    }

    if (svg && typeof svg === "string" && svg.trim().length > 0) {
      // Replace the original div (mermaid source) with returned SVG string
      rawHtml = rawHtml.replace(original, svg);
    } else {
      // 回退：保留原始 mermaid div（这样 mermaid.init 在 preview 渲染时仍可作为后备）
      // 不改变 rawHtml
      // 但我们可以把原始保持（no-op）
    }
  }

  return rawHtml;
}

// 主 hook
export function useMarkdownRenderer(content, filePath, themeContainerStyles) {
  // 添加防抖，避免频繁渲染（停止输入 150ms 后才渲染）
  const debouncedContent = useDebounce(content, 150);

  const [htmlResult, setHtmlResult] = useState({
    rawHtml: "",
    sanitizedHtml: "",
  });

  useEffect(() => {
    let mounted = true;

    async function render() {
      if (!debouncedContent && debouncedContent !== "") {
        if (mounted) setHtmlResult({ rawHtml: "", sanitizedHtml: "" });
        return;
      }

      // 1. 处理 Obsidian 图像语法
      const withObsidianImages = debouncedContent.replace(/!\[\[(.+?)\]\]/g, (m, p1) => {
        return `![](${encodeURIComponent(p1.trim())})`;
      });

      // 2. 使用 markdown-it 渲染
      const md = createMarkdownIt();
      let rawHtml = md.render(withObsidianImages);

      console.log("Raw HTML after markdown-it:", rawHtml);

      // 3. 处理图片路径
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

      console.log(
        "Raw HTML after image processing:",
        rawHtml.substring(0, 300)
      );

      // ====== 注释掉预渲染步骤，改为在 DOM 插入后由 App.jsx 统一渲染 ======
      // try {
      //   rawHtml = await renderMermaidBlocksToSvg(rawHtml);
      //   console.log("[Renderer] mermaid blocks rendered to SVG where possible");
      // } catch (e) {
      //   console.warn("[Renderer] renderMermaidBlocksToSvg failed:", e);
      //   // 失败时回退到不做替换的 rawHtml（后续仍会走 sanitize）
      // }

      // 4. 清理 HTML，确保 mermaid 相关的标签和属性不被移除
      const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
          "p",
          "div",
          "span",
          "br",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "strong",
          "b",
          "em",
          "i",
          "u",
          "del",
          "s",
          "code",
          "blockquote",
          "hr",
          "pre",
          "ul",
          "ol",
          "li",
          "table",
          "thead",
          "tbody",
          "tr",
          "th",
          "td",
          "a",
          "img",
          "body",
          "input",
          // 允许 style 标签，这样 mermaid 内联的 <style> 不会被移除
          "style",
          // Mermaid SVG 相关标签
          "svg",
          "g",
          "path",
          "circle",
          "rect",
          "ellipse",
          "line",
          "polyline",
          "polygon",
          "text",
          "tspan",
          "defs",
          "marker",
          "use",
          "clipPath",
          "foreignObject",
          "switch",
          "ruby",
          "rt",
          "rp",
        ],

        ALLOWED_ATTR: [
          "href",
          "src",
          "alt",
          "title",
          "colspan",
          "rowspan",
          "class",
          "data-task-index",
          "style",
          "id",
          "type",
          "checked",
          "disabled",
          "align",
          "role",
          "aria-hidden",
          // Mermaid SVG 相关属性
          "width",
          "height",
          "viewBox",
          "xmlns",
          "x",
          "y",
          "dx",
          "dy",
          "fill",
          "stroke",
          "stroke-width",
          "stroke-dasharray",
          "transform",
          "d",
          "r",
          "cx",
          "cy",
          "x1",
          "y1",
          "x2",
          "y2",
          "points",
          "text-anchor",
          "dominant-baseline",
          "font-family",
          "font-size",
          "font-weight",
        ],
        ALLOWED_URI_REGEXP:
          /^(?:(?:https?|safe-file|file|blob|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
        ADD_PROTOCOLS: ["safe-file"],
      });

      if (!mounted) return;

      console.log("Final sanitized HTML:", sanitizedHtml);
      setHtmlResult({ rawHtml, sanitizedHtml });
    }

    render();

    return () => {
      mounted = false;
    };
  }, [debouncedContent, filePath]);

  return htmlResult;
}
