import { useEffect, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import mdTaskLists from "markdown-it-task-lists";
import mdAttrs from "markdown-it-attrs";
import mdKatex from "markdown-it-katex";
import mermaid from "mermaid";
import hljs from 'highlight.js/lib/core';

// 导入并注册语言包
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import java from 'highlight.js/lib/languages/java';
import kotlin from 'highlight.js/lib/languages/kotlin';

// 注册语言
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('java', java);
hljs.registerLanguage('kotlin', kotlin);

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
    return '';
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

  // 添加插件
  md.use(mdTaskLists, { enabled: true, label: true });
  md.use(mdKatex);
  md.use(mdAttrs);

  // 重要：重写 fence 规则来处理 mermaid
  const defaultFence = md.renderer.rules.fence || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };
  
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || '').trim().toLowerCase();
    
    // 检查是否为 mermaid 代码块
    if (info === 'mermaid' || info.startsWith('mermaid ')) {
      const code = token.content || '';
      // 生成唯一的 ID
      const mermaidId = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log('Creating mermaid div with ID:', mermaidId, 'and code:', code.substring(0, 50));
      
      // 返回带有唯一 ID 的 div
      return `<div class="mermaid" id="${mermaidId}">${code}</div>`;
    }
    
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


// ---------- MERMAID PREFLIGHT RENDER HELPERS ----------

// convert special characters for safe fallback
function escapeHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ensure svg string contains xmlns
function ensureSvgXmlns(svgStr) {
  if (!svgStr) return svgStr;
  if (!/xmlns=/.test(svgStr)) {
    svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svgStr;
}

// helper: create an Image from an SVG string (data URL)
function svgStringToImage(svgString) {
  return new Promise((resolve, reject) => {
    try {
      const svg64 = btoa(unescape(encodeURIComponent(svgString)));
      const src = 'data:image/svg+xml;base64,' + svg64;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    } catch (err) {
      reject(err);
    }
  });
}

// helper: convert svgString -> PNG data URL with target width (keeps aspect ratio)
// options: { targetWidth, background }  (background optional e.g. '#fff')
// returns dataURL (base64 png)
async function svgStringToPngDataUrl(svgString, options = {}) {
  const { targetWidth = null, background = null, scale = 1 } = options;
  if (!svgString) throw new Error('Empty SVG');

  // Ensure xmlns
  svgString = ensureSvgXmlns(svgString);

  // Parse intrinsic size from svg or viewBox
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');

  let width = parseFloat(svgEl && svgEl.getAttribute('width'));
  let height = parseFloat(svgEl && svgEl.getAttribute('height'));
  const viewBox = svgEl && svgEl.getAttribute('viewBox');

  if ((!width || !height) && viewBox) {
    const parts = viewBox.split(/\s+|,/).filter(Boolean);
    if (parts.length === 4) {
      width = parseFloat(parts[2]);
      height = parseFloat(parts[3]);
    }
  }

  // Fallback: temporarily insert into DOM to measure
  if ((!width || !height) && typeof document !== 'undefined') {
    const tmp = document.createElement('div');
    tmp.style.position = 'fixed';
    tmp.style.left = '-10000px';
    tmp.style.top = '-10000px';
    tmp.style.visibility = 'hidden';
    tmp.innerHTML = svgString;
    document.body.appendChild(tmp);
    const realSvg = tmp.querySelector('svg');
    if (realSvg) {
      try {
        const bb = realSvg.getBBox ? realSvg.getBBox() : { width: realSvg.clientWidth, height: realSvg.clientHeight };
        width = bb.width || realSvg.clientWidth || 800;
        height = bb.height || realSvg.clientHeight || 600;
      } catch (e) {
        width = realSvg.clientWidth || 800;
        height = realSvg.clientHeight || 600;
      }
    } else {
      width = 800; height = 600;
    }
    document.body.removeChild(tmp);
  }

  if (!width || !height) { width = 800; height = 600; }

  // Compute target canvas size
  let targetW = Math.round(width * scale);
  let targetH = Math.round(height * scale);

  if (targetWidth && targetWidth > 0) {
    const ratio = width / height;
    targetW = Math.round(targetWidth * scale);
    targetH = Math.round(targetW / ratio);
  }

  // Create Image and draw to canvas
  const img = await svgStringToImage(svgString);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');

  // background
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Draw scaled
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Return dataURL
  return canvas.toDataURL('image/png');
}

// Render a single mermaid diagram to SVG string. Compatible with multiple mermaid versions.
// ---------- Replace the renderMermaidToSvg implementation with this ----------
// ====== Replace the existing renderMermaidToSvg with this simplified version ======
async function renderMermaidToSvg(diagramCode, id, options = {}) {
  // simple wrapper: use mermaid.render or mermaid.mermaidAPI.render depending on availability
  if (typeof mermaid === 'undefined') throw new Error('mermaid not found');

  // prefer API that returns svg directly
  try {
    if (typeof mermaid.render === 'function') {
      // mermaid.render may return a string or a promise resolving to { svg }
      const out = mermaid.render(id, diagramCode);
      if (out && typeof out.then === 'function') {
        const res = await out;
        return res && res.svg ? res.svg : (typeof res === 'string' ? res : null);
      } else {
        return out && out.svg ? out.svg : (typeof out === 'string' ? out : null);
      }
    }

    if (mermaid.mermaidAPI && typeof mermaid.mermaidAPI.render === 'function') {
      return await new Promise((resolve, reject) => {
        try {
          mermaid.mermaidAPI.render(id, diagramCode, (svgCode) => {
            resolve(svgCode);
          });
        } catch (err) {
          reject(err);
        }
      });
    }

    // fallback: no supported API available
    throw new Error('No mermaid render API available');
  } catch (err) {
    // bubble up for caller to handle (will show fallback code block)
    throw err;
  }
}
// ====== end replacement ======

// ---------- end replacement ----------


/**
 * renderMermaidBlocksInHtml
 * - html: raw HTML string created by markdown-it that contains <div class="mermaid" id="...">code</div>
 * - opts:
 *    { generatePngForWechat: boolean, wechatWidth: number, pngScale: number, pngBackground: string|null }
 * - returns: html with mermaid blocks replaced by rendered <svg> or by <img src="data:image/png;base64,..."> when generatePngForWechat=true
 */
async function renderMermaidBlocksInHtml(html, opts = {}) {
const { generatePngForWechat = false, pngBackground = null } = opts || {};

  if (!html || typeof html !== 'string') return html;
  if (typeof mermaid === 'undefined') return html;

  // Find all mermaid divs we previously inserted (markdown-it fence rule should create them)
  // Pattern allows optional id (if none present, we will create one)
  const mermaidDivRegex = /<div\s+class=["']mermaid["'](?:\s+id=["']([^"']+)["'])?\s*>([\s\S]*?)<\/div>/gi;
  const replacements = [];
  let match;
  while ((match = mermaidDivRegex.exec(html)) !== null) {
    const id = match[1] || `mermaid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const code = (match[2] || '').trim();
    const full = match[0];
    replacements.push({ full, id, code });
  }

  if (replacements.length === 0) return html;

  // We will replace placeholders to avoid messing indexes while replacing
  for (const item of replacements) {
    const token = `<!--MERMAID_PLACEHOLDER_${item.id}-->`;
    html = html.replace(item.full, token);
    item.token = token;
  }

  // Render each diagram
  for (const item of replacements) {
    const { code, id, token } = item;
    if (!code) {
      html = html.replace(token, `<pre class="mermaid-fallback">${escapeHtml(code)}</pre>`);
      continue;
    }
    try {
      let svgStr = await renderMermaidToSvg(code, id, { renderWidth: 1200 });
      if (!svgStr) throw new Error('Empty SVG from mermaid');

      // ===== SVG 后处理：移除会把图缩小的 style/width，并强制设置一个合理的像素宽度 =====
(function() {
  try {
    // 我们希望渲染结果按这个基准宽度布局（视情调整，1200 对 Gantt 通常合适）
    const targetRenderPx = (typeof renderWidth === 'number' && renderWidth > 0) ? renderWidth : 1200;

    // 解析 svg 字符串
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgStr, 'image/svg+xml');
    const svgEl = doc.querySelector && doc.querySelector('svg');

    if (svgEl) {
      // 移除内联 style 和 max-width 之类会被 CSS 放大/缩小的属性
      svgEl.removeAttribute('style');
      // mermaid 可能设置 width="100%"; 删除百分比宽度，改为固定像素宽
      const currentWidth = svgEl.getAttribute('width');
      const currentViewBox = svgEl.getAttribute('viewBox');

      // 计算高度：优先用 viewBox 宽高比；若无 viewBox 再尝试 height 属性或默认
      let newWidth = targetRenderPx;
      let newHeight = null;
      if (currentViewBox) {
        const parts = currentViewBox.split(/\s+|,/).filter(Boolean);
        if (parts.length === 4) {
          const vbW = parseFloat(parts[2]) || 1;
          const vbH = parseFloat(parts[3]) || 1;
          newHeight = Math.round(newWidth * (vbH / vbW));
        }
      }
      // 若没 viewBox，尝试使用 height attr
      if (!newHeight) {
        const h = svgEl.getAttribute('height');
        if (h) {
          // 如果 width 存在，按比例换算；否则直接采用 height
          if (svgEl.getAttribute('width')) {
            const w = parseFloat(svgEl.getAttribute('width')) || newWidth;
            newHeight = Math.round((parseFloat(h) / w) * newWidth);
          } else {
            newHeight = parseFloat(h) || Math.round(newWidth * 0.6);
          }
        } else {
          newHeight = Math.round(newWidth * 0.6); // fallback ratio
        }
      }

      // 强制设置像素宽高，并保留 viewBox（便于响应式缩放）
      svgEl.setAttribute('width', String(newWidth));
      svgEl.setAttribute('height', String(newHeight));
      // 建议 preserveAspectRatio 保持左上对齐并等比缩放
      svgEl.setAttribute('preserveAspectRatio', 'xMinYMin meet');

      // serialize 回字符串
      const serializer = new XMLSerializer();
      svgStr = serializer.serializeToString(svgEl);
    }
  } catch (postErr) {
    // 若处理失败，不要中断：保持原 svgStr
    console.warn('SVG post-processing failed', postErr);
  }
})();
// ===== 结束 SVG 后处理 =====


      svgStr = ensureSvgXmlns(svgStr);

      if (generatePngForWechat) {
        // Convert to PNG data URL sized to wechatWidth
        try {
          // const dataUrl = await svgStringToPngDataUrl(svgStr, { targetWidth: wechatWidth, background: pngBackground, scale: pngScale });
          // Embed as image (use data URL)
          const dataUrl = await svgStringToPngDataUrl(svgStr, { background: pngBackground });

          const imgTag = `<img class="mermaid-generated-png" src="${dataUrl}" alt="mermaid diagram" style="max-width:100%;height:auto;display:block;">`;
          html = html.replace(token, imgTag);
        } catch (err) {
          console.warn('Failed convert mermaid svg->png, keeping svg. err=', err);
          html = html.replace(token, svgStr);
        }
      } else {
        // Keep SVG inline
        html = html.replace(token, svgStr);
      }
    } catch (err) {
      console.warn('Failed to render mermaid diagram, falling back to code block', err);
      const fallback = `<pre class="mermaid-fallback">${escapeHtml(code)}</pre>`;
      html = html.replace(token, fallback);
    }
  }

  return html;
}

// ---------- Export helper: save mermaid code to svg/png files (for explicit export feature) ----------
async function exportMermaidToFiles(code, options = {}) {
  const { svgFilename = 'diagram.svg', pngFilename = 'diagram.png', pngScale = Math.max(window.devicePixelRatio || 1, 2), pngBackground = null } = options || {};
  if (!code) throw new Error('Empty mermaid code');

  const svgStr = await renderMermaidToSvg(code);
  const svgWithXmlns = ensureSvgXmlns(svgStr);

  // Download SVG
  const blobSvg = new Blob([svgWithXmlns], { type: 'image/svg+xml;charset=utf-8' });
  const urlSvg = URL.createObjectURL(blobSvg);
  const a1 = document.createElement('a');
  a1.href = urlSvg;
  a1.download = svgFilename;
  document.body.appendChild(a1);
  a1.click();
  a1.remove();
  setTimeout(() => URL.revokeObjectURL(urlSvg), 1000);

  // Download PNG
  try {
    const dataUrl = await svgStringToPngDataUrl(svgWithXmlns, { scale: pngScale, background: pngBackground });
    // convert dataURL to blob
    const res = await fetch(dataUrl);
    const blobPng = await res.blob();
    const urlPng = URL.createObjectURL(blobPng);
    const a2 = document.createElement('a');
    a2.href = urlPng;
    a2.download = pngFilename;
    document.body.appendChild(a2);
    a2.click();
    a2.remove();
    setTimeout(() => URL.revokeObjectURL(urlPng), 1000);
  } catch (err) {
    console.warn('Failed to export PNG from mermaid svg', err);
  }
}

// ---------- END HELPERS ----------



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


try {
  // true = 为 wechat 生成 PNG 并替换为 <img> （如果你想在所有地方都用 svg，把 generatePngForWechat 改为 false）
  rawHtml = await renderMermaidBlocksInHtml(rawHtml, {
    generatePngForWechat: false, // false = keep inline SVG; true = replace with PNG images
    wechatWidth: 360,            // 当 generatePngForWechat=true 时，目标宽度（px）
    pngScale: Math.max(window.devicePixelRatio || 1, 2),
    pngBackground: '#ffffff'     // 或 null 保持透明
  });
  console.log('Mermaid pre-render done: mermaid blocks replaced with SVG/PNG.');
} catch (err) {
  console.warn('Mermaid pre-render failed, continuing with original HTML', err);
}



      console.log('Raw HTML after markdown-it:', rawHtml.substring(0, 300));

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

      console.log('Raw HTML after image processing:', rawHtml.substring(0, 300));

      // 4. 清理 HTML，确保 mermaid 相关的标签和属性不被移除
      const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
  "p", "div", "span", "br", "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "del", "s", "code", "blockquote", "hr",
  "pre", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
  "a", "img", "body", "input",
  // 允许 style 标签，这样 mermaid 内联的 <style> 不会被移除
  "style",
  // Mermaid SVG 相关标签
  "svg", "g", "path", "circle", "rect", "ellipse", "line", "polyline", 
  "polygon", "text", "tspan", "defs", "marker", "use", "clipPath",
  "foreignObject", "switch",'ruby', 'rt', 'rp'
],

        ALLOWED_ATTR: [
          "href", "src", "alt", "title", "colspan", "rowspan", "class", "data-task-index",
          "style", "id", "type", "checked", "disabled", "align", "role", "aria-hidden",
          // Mermaid SVG 相关属性
          "width", "height", "viewBox", "xmlns", "x", "y", "dx", "dy", "fill", 
          "stroke", "stroke-width", "stroke-dasharray", "transform", "d", "r", 
          "cx", "cy", "x1", "y1", "x2", "y2", "points", "text-anchor", 
          "dominant-baseline", "font-family", "font-size", "font-weight"
        ],
        ALLOWED_URI_REGEXP:
          /^(?:(?:https?|safe-file|file|blob|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
        ADD_PROTOCOLS: ['safe-file'],
      });

      if (!mounted) return;
      
      console.log('Final sanitized HTML:', sanitizedHtml.substring(0, 300));
      setHtmlResult({ rawHtml, sanitizedHtml });
    }

    render();

    return () => {
      mounted = false;
    };
  }, [content, filePath]);

  return htmlResult;
}