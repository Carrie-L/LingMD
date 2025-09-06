import { useEffect, useState,useCallback  } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import mdTaskLists from "markdown-it-task-lists";
import mdAttrs from "markdown-it-attrs";
import mdKatex from "markdown-it-katex";
import mermaid from "mermaid";
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
    // return `<img src="${encodeURIComponent(token.src)}" alt="${token.alt}" />`;
    return '';
  },
};
// marked.use({ extensions: [obsidianImageExtension] });

// 我们只配置 highlight 函数，让它返回带 class 的 <span>
// marked.setOptions({
//   highlight: function (code, lang) {
//     const language = hljs.getLanguage(lang) ? lang : 'plaintext';
//     return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
//   },
//   langPrefix: 'hljs language-', // 确保 langPrefix 正确
// });

// Create markdown-it instance
function createMarkdownIt() {
  const md = new MarkdownIt({
    html: true, // 允许 HTML（必要以便 mermaid/katex 片段保留）
    linkify: true,
    typographer: true,
    highlight: (str, lang) => {
      try {
        if (lang && hljs.getLanguage(lang)) {
          return `<pre><code class="hljs language-${lang}">${hljs.highlight(str, { language: lang }).value}</code></pre>`;
        } else {
          return `<pre><code class="hljs">${hljs.highlightAuto(str).value}</code></pre>`;
        }
      } catch (e) {
        const esc = str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<pre><code class="hljs language-plaintext">${esc}</code></pre>`;
      }
    },
  });

   // 插件：任务列表、KaTeX、可选属性
  md.use(mdTaskLists, { enabled: true, label: true });
  md.use(mdKatex); // 支持 $...$ 和 $$...$$
  md.use(mdAttrs); // 可选：支持 {#id .class} 语法的元素属性

  return md;
}


const renderer = new marked.Renderer();
// 3. ✅ 使用正确的函数签名 (code, language)
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
// 5. ✅ 将所有配置应用到全局的 marked 实例
marked.use({ 
  extensions: [obsidianImageExtension], 
  renderer: renderer,
  gfm: true, // 启用 GitHub Flavored Markdown
  breaks: true, // 启用换行符
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
    const md = createMarkdownIt();

    async function render() {
      if (!content && content !== "" ) {
        // setHtmlResult({ rawHtml: "", sanitizedHtml: "" });
         if (mounted) setHtmlResult({ rawHtml: "", sanitizedHtml: "" });
        return;
      }

       // 1) 先把 Obsidian 内联图像语法替换成标准 markdown 图像，避免 markdown-it 忽略
      //    e.g. ![[foo.png]] -> ![](foo.png)
      const withObsidianImages = content.replace(/!\[\[(.+?)\]\]/g, (m, p1) => {
        return `![](${encodeURIComponent(p1.trim())})`;
      });

      // let rawHtml = marked(content);
      let rawHtml = marked(withObsidianImages);
      // console.log("✅✅rawHtml:", rawHtml);

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

       // 3) Post-process img src with main process resolver to support safe-file protocol
      // rawHtml = await replaceAsync(rawHtml, async (match, src, rest) => {
      //   try {
      //     const decodedSrc = decodeURIComponent(src);
      //     const fileDir = filePath ? window.electronAPI.path.dirname(filePath) : "";
      //     const resolvedPath = await window.electronAPI.resolveImagePath({
      //       fileDir,
      //       src: decodedSrc,
      //     });
      //     if (resolvedPath) {
      //       return `<img src="${resolvedPath}" ${rest}>`;
      //     }
      //   } catch (err) {
      //     console.error("[Renderer] 图片路径解析失败:", src, err);
      //   }
      //   return match;
      // });

      console.log("✅✅✅✅rawHtml:", rawHtml);

      // ✅ 关键修复：使用 ADD_PROTOCOLS 而不是 ALLOWED_PROTOCOLS
      // 这会将 'safe-file' 添加到 DOMPurify 的默认安全协议列表中，而不是覆盖它们。
      // 这是最健壮和推荐的做法。
      const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
        "p","div","span","br","h1","h2","h3","h4","h5","h6",
    "strong","b","em","i","u","del","s","code","blockquote","hr",
    "pre","ul","ol","li","table","thead","tbody","tr","th","td",
    "a","img","body",
    // allow form/input for task-lists
    "input",
    // allow svg for mermaid
    "svg","g","path","circle","rect","ellipse","line","polyline","polygon","text"
        ],
        ALLOWED_ATTR: [
          "href", "src", "alt", "title", "colspan", "rowspan", "class","data-task-index","style","id",
           // attributes needed for task-list and table alignment
    "type","checked","disabled","data-task-index","align","style","id","role","aria-hidden"   
        ],
        ALLOWED_URI_REGEXP:
          /^(?:(?:https?|safe-file|file|blob|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
        ADD_PROTOCOLS: ['safe-file'],
      });

  // 5) set rawHtml & sanitizedHtml
      if (!mounted) return;
      setHtmlResult({ rawHtml, sanitizedHtml: sanitizedHtml });

      // (调试日志)
      // console.log("--- HTML Rendering ---");
      // console.log("Raw HTML (has class):", rawHtml.substring(0, 300));
      // console.log("Sanitized HTML (should also have class):", sanitizedHtml.substring(0, 300));
      if (rawHtml.includes('class=') && !sanitizedHtml.includes('class=')) {
        console.error("!!! Critical Error: 'class' attribute was STILL removed by DOMPurify!");
      }

      console.log("✅✅✅✅✅sanitizedHtml:", sanitizedHtml);

       // 6) mermaid: 在 DOM 更新后，init mermaid on the preview container.
      //    (不能在这里直接操作 DOM — 但父组件使用 sanitizedHtml 设置 innerHTML 后，我们需要 mermaid.init())
      //    因此，我们派发一个自定义事件，父组件或 index 中可监听触发 mermaid.init()
      //    我们也可以在这里直接尝试初始化（如果 document 已有预览容器）
      try {
        // 小尝试：如果页面上存在 mermaid 容器，调用 init（在大多数情况下有效）
        if (typeof mermaid !== 'undefined' && document) {
          // 初始化 mermaid，只影响页面上 .mermaid 的元素
          mermaid.initialize({ startOnLoad: false, theme: 'default' });
          // 延迟执行以确保 DOM 已插入（父组件在 setState 后会同步更新 DOM）
          setTimeout(() => {
            try {
              mermaid.init(undefined, document.querySelectorAll('.mermaid'));
            } catch (e) {
              // ignore
            }
          }, 50);
        }
      } catch (e) {
        // noop
      }

      // setHtmlResult({ rawHtml, sanitizedHtml });
    }

    render();
  }, [content, filePath]);

  return htmlResult;
}
