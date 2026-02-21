import React, { useState, useEffect } from 'react';

const DEFAULT_VARIABLES = {
  '--md-bg': '#ffffff',
  '--md-fg': '#000000',
  '--md-muted': '#666666',
  '--md-accent': '#e7b0d0',
  '--md-border': '#e5e7eb',
  '--md-code-bg': '#f3f4f6',
  '--md-code-fg': '#0f172a',
  '--md-quote-bg': '#fafafa',
  '--md-quote-bar': '#d1d5db',
  '--md-table-stripe': '#fafafa',
};

const LABEL_MAP = {
  '--md-bg': '背景颜色',
  '--md-fg': '文字颜色',
  '--md-muted': '次要文字色',
  '--md-accent': '强调/链接色',
  '--md-border': '边框颜色',
  '--md-code-bg': '代码块背景',
  '--md-code-fg': '代码块文字',
  '--md-quote-bg': '引用块背景',
  '--md-quote-bar': '引用块侧边栏',
  '--md-table-stripe': '表格隔行变色',
};

export default function ThemeEditor({ initialTheme, onSave, onCancel }) {
  const [name, setName] = useState(initialTheme?.name || '未命名主题');
  const [variables, setVariables] = useState(initialTheme?.variables || DEFAULT_VARIABLES);
  const [customCss, setCustomCss] = useState(initialTheme?.customCss || '');
  const [settings, setSettings] = useState(initialTheme?.settings || {
    fontSize: '16px',
    lineHeight: '1.8',
    headingScale: '1.2', // 标题缩放比例
  });

  const handleColorChange = (key, value) => {
    setVariables(prev => ({ ...prev, [key]: value }));
  };

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert('请输入主题名称');
      return;
    }
    onSave({
      id: initialTheme?.id || `custom-${Date.now()}`,
      name,
      variables,
      customCss,
      settings
    });
  };

  return (
    <div className="theme-editor-overlay">
      <div className="theme-editor-modal">
        <h3>自定义主题编辑器</h3>
        
        <div className="form-group">
          <label>主题名称</label>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="输入主题名称"
          />
        </div>

        <div className="editor-columns">
          <div className="column">
            <h4>基础样式</h4>
            <div className="form-group">
              <label>正文字号 (px)</label>
              <input 
                type="text" 
                value={settings.fontSize} 
                onChange={(e) => handleSettingChange('fontSize', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>行高 (倍数)</label>
              <input 
                type="text" 
                value={settings.lineHeight} 
                onChange={(e) => handleSettingChange('lineHeight', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>标题缩放比例</label>
              <input 
                type="number" 
                step="0.1"
                value={settings.headingScale} 
                onChange={(e) => handleSettingChange('headingScale', e.target.value)}
                title="H1 = H2 * scale, H2 = H3 * scale..."
              />
            </div>
          </div>

          <div className="column">
            <h4>颜色设置</h4>
            {Object.entries(variables).map(([key, value]) => (
              <div className="form-group color-input" key={key}>
                <label>{LABEL_MAP[key] || key}</label>
                <div className="color-picker-wrapper">
                  <input 
                    type="color" 
                    value={value} 
                    onChange={(e) => handleColorChange(key, e.target.value)}
                  />
                  <input 
                    type="text" 
                    value={value} 
                    onChange={(e) => handleColorChange(key, e.target.value)}
                    className="hex-input"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>自定义 CSS (高级)</label>
          <textarea 
            value={customCss} 
            onChange={(e) => setCustomCss(e.target.value)}
            placeholder=".markdown-body p { margin-bottom: 2em; }"
            rows={6}
          />
        </div>

        <div className="editor-actions">
          <button onClick={onCancel}>取消</button>
          <button onClick={handleSave} className="primary">保存主题</button>
        </div>
      </div>
      
      <style>{`
        .theme-editor-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        .theme-editor-modal {
          background: #fff;
          padding: 20px;
          border-radius: 8px;
          width: 800px;
          max-width: 90vw;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          color: #333;
        }
        .editor-columns {
          display: flex;
          gap: 20px;
        }
        .column {
          flex: 1;
        }
        .form-group {
          margin-bottom: 15px;
        }
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          font-size: 14px;
        }
        .form-group input[type="text"],
        .form-group input[type="number"],
        .form-group textarea {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-family: inherit;
        }
        .color-picker-wrapper {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .color-picker-wrapper input[type="color"] {
          border: none;
          padding: 0;
          width: 40px;
          height: 40px;
          cursor: pointer;
          background: none;
        }
        .hex-input {
          flex: 1;
        }
        .editor-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
          border-top: 1px solid #eee;
          padding-top: 20px;
        }
        .editor-actions button {
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          border: 1px solid #ddd;
          background: #fff;
        }
        .editor-actions button.primary {
          background: #007bff;
          color: #fff;
          border-color: #007bff;
        }
      `}</style>
    </div>
  );
}



