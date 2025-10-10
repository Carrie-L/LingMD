import React, { useMemo } from 'react';
import { MermaidRenderer } from './MermaidRenderer';

/**
 * 将 CSS 样式字符串转换为 React style 对象
 * 例如: "color: red; font-size: 14px" -> { color: 'red', fontSize: '14px' }
 */
function parseStyleString(styleStr) {
  if (!styleStr || typeof styleStr !== 'string') return {};

  return styleStr
    .split(';')
    .filter(rule => rule.trim())
    .reduce((acc, rule) => {
      const [property, value] = rule.split(':').map(s => s.trim());
      if (property && value) {
        // 将 kebab-case 转换为 camelCase (例如: font-size -> fontSize)
        const camelProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        acc[camelProperty] = value;
      }
      return acc;
    }, {});
}

/**
 * 带 Mermaid 支持的预览组件
 * 解析 HTML，将 <div class="mermaid">...</div> 替换为 MermaidRenderer 组件
 * @param {Object} props
 * @param {string} props.html - 渲染后的 HTML 内容
 * @param {React.Ref} props.forwardedRef - 外部传入的 ref
 */
export const PreviewWithMermaid = React.forwardRef(({ html }, ref) => {
  // 使用 useMemo 缓存解析结果，只在 html 变化时重新解析
  const elements = useMemo(() => {
    if (!html) return [];

    // 创建临时 DOM 来解析 HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const result = [];
    let keyCounter = 0;
    let mermaidCount = 0;

    // 递归处理节点
    const processNode = (node, parentKey = '') => {
      // 文本节点
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text && text.trim()) {
          return { type: 'text', content: text, key: `${parentKey}-text-${keyCounter++}` };
        }
        return null;
      }

      // 元素节点
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        const key = `${parentKey}-${tagName}-${keyCounter++}`;

        // 检查是否是 Mermaid 代码块
        if (tagName === 'div' && node.classList.contains('mermaid')) {
          const code = node.textContent?.trim() || '';
          mermaidCount++;
          return {
            type: 'mermaid',
            code,
            key,
          };
        }

        // 普通元素：递归处理子节点
        const children = Array.from(node.childNodes)
          .map((child, idx) => processNode(child, `${key}-${idx}`))
          .filter(Boolean);

        // 处理属性，转换为 React 兼容的格式
        const attributes = Array.from(node.attributes || []).reduce((acc, attr) => {
          const name = attr.name;
          const value = attr.value;

          // 特殊处理 style 属性：将字符串转为对象
          if (name === 'style' && value) {
            acc.style = parseStyleString(value);
          }
          // 特殊处理 class 属性：React 使用 className
          else if (name === 'class') {
            acc.className = value;
          }
          // 特殊处理 for 属性：React 使用 htmlFor
          else if (name === 'for') {
            acc.htmlFor = value;
          }
          // 布尔属性
          else if (name === 'checked' || name === 'disabled' || name === 'readonly') {
            acc[name] = value === '' || value === name;
          }
          // 其他属性保持不变
          else {
            acc[name] = value;
          }

          return acc;
        }, {});

        return {
          type: 'element',
          tagName,
          attributes,
          children,
          key,
        };
      }

      return null;
    };

    // 处理所有顶级子节点
    Array.from(tempDiv.childNodes).forEach(node => {
      const processed = processNode(node);
      if (processed) result.push(processed);
    });

    if (mermaidCount > 0) {
      console.log(`[PreviewWithMermaid] ✅ Parsed ${result.length} elements, found ${mermaidCount} Mermaid blocks`);
    }
    return result;
  }, [html]);

  // 渲染解析后的元素树
  const renderElement = (element) => {
    if (!element) return null;

    // 文本节点
    if (element.type === 'text') {
      return element.content;
    }

    // Mermaid 组件
    if (element.type === 'mermaid') {
      return <MermaidRenderer key={element.key} code={element.code} id={element.key} />;
    }

    // 普通元素
    if (element.type === 'element') {
      const { tagName, attributes, children, key } = element;
      const props = { key, ...attributes };

      // Void 元素列表（自闭合标签，不能有子元素）
      const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
                           'link', 'meta', 'param', 'source', 'track', 'wbr'];

      // 如果是 void 元素，不渲染子元素
      if (voidElements.includes(tagName)) {
        return React.createElement(tagName, props);
      }

      // 普通元素：递归渲染子元素
      const childElements = children?.map(renderElement);
      return React.createElement(tagName, props, childElements);
    }

    return null;
  };

  return (
    <div className="markdown-body" ref={ref}>
      {elements.map(renderElement)}
    </div>
  );
});

PreviewWithMermaid.displayName = 'PreviewWithMermaid';
