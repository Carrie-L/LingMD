import React, { useEffect } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import hljs from "highlight.js";

// 永远用暗色高亮
import "./styles/github-dark.css";

export default function Preview({ value }) {
  const html = DOMPurify.sanitize(
    marked(value || "```js\nconsole.log('Hello 简泠!');\n```")
  );

  useEffect(() => {
    // 每次 value 改变后强制高亮
    hljs.highlightAll();
  }, [value]); // 👈 关键：依赖 value

  return (
    <div
      className="preview markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
