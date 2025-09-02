import React from "react";

export default function Outline({ value }) {
  const lines = value.split("\n");
  const headings = lines
    .map((line, i) => {
      const match = line.match(/^(#{1,6})\s+(.*)/);
      if (match) {
        return { level: match[1].length, text: match[2], line: i };
      }
      return null;
    })
    .filter(Boolean);

  return (
    <div className="outline">
      <h3>目录</h3>
      <ul>
        {headings.map((h, idx) => (
          <li key={idx} style={{ marginLeft: (h.level - 1) * 12 }}>
            {h.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
