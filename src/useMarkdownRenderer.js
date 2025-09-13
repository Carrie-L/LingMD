import { useEffect, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import mdTaskLists from "markdown-it-task-lists";
import mdAttrs from "markdown-it-attrs";
import mdKatex from "markdown-it-katex";
import mermaid from "mermaid";
import hljs from "highlight.js/lib/core";

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
const renderer = new marked.Renderer();
renderer.code = ({ text, lang }) => {
  const code = text || "";
  const language = lang || "plaintext";

  try {
    if (hljs.getLanguage(language)) {
      const highlighted = hljs.highlight(code, {
        language,
        ignoreIllegals: true,
      }).value;
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

marked.use({
  extensions: [obsidianImageExtension],
  renderer: renderer,
  gfm: true,
  breaks: true,
});

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

export function useMarkdownRenderer(content, filePath, themeContainerStyles) {
  const [htmlResult, setHtmlResult] = useState({
    rawHtml: "",
    sanitizedHtml: "",
  });

  useEffect(() => {
    let mounted = true;

    async function render() {
      if (!content && content !== "") {
        if (mounted) setHtmlResult({ rawHtml: "", sanitizedHtml: "" });
        return;
      }

      // 1. 处理 Obsidian 图像语法
      const withObsidianImages = content.replace(/!\[\[(.+?)\]\]/g, (m, p1) => {
        return `![](${encodeURIComponent(p1.trim())})`;
      });

      // 2. 使用 markdown-it 渲染
      const md = createMarkdownIt();
      let rawHtml = md.render(withObsidianImages);

      console.log("Raw HTML after markdown-it:", rawHtml.substring(0));

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

      console.log("Final sanitized HTML:", sanitizedHtml.substring(0, 300));
      setHtmlResult({ rawHtml, sanitizedHtml });
    }

    render();

    return () => {
      mounted = false;
    };
  }, [content, filePath]);

  return htmlResult;
}
