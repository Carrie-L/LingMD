// Outline.jsx
import React from 'react';

export default function Outline({ headings = [], onNavigate }) {
  if (!headings || headings.length === 0) {
    return (
      <div className="outline empty">
        <div style={{padding: 12, color: '#666'}}>无标题 — 请在文档中添加 # / ## / ### 标题</div>
      </div>
    );
  }

  return (
    <nav className="outline">
      <ul>
        {headings.map(h => (
          <li key={h.id} style={{ paddingLeft: (h.level - 1) * 10 }}>
            <a
              href={"#"+h.id}
              onClick={(e) => {
                e.preventDefault();
                if (onNavigate) onNavigate(h.id);
              }}
              title={h.text}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
