import React from "react";

export default function Editor({ value, onChange }) {
  return (
    <textarea
      className="editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="在这里输入 Markdown..."
    />
  );
}
