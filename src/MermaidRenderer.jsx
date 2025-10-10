import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

/**
 * Mermaid 渲染组件 - 独立控制渲染逻辑，防止闪烁和消失
 * @param {Object} props
 * @param {string} props.code - Mermaid 代码
 * @param {string} props.id - 唯一标识符
 */
export function MermaidRenderer({ code, id }) {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState(null);
  const [error, setError] = useState(null);
  const [isRendering, setIsRendering] = useState(false);

  // 使用 code 作为渲染的唯一依赖
  useEffect(() => {
    let isMounted = true;

    const renderMermaid = async () => {
      if (!code || !code.trim()) {
        setSvg(null);
        return;
      }

      // 防止重复渲染
      if (isRendering) return;
      setIsRendering(true);

      try {
        // 等待 mermaid 初始化
        await new Promise(resolve => {
          if (mermaid.parse) {
            resolve();
          } else {
            setTimeout(resolve, 100);
          }
        });

        // 生成唯一 ID
        const uniqueId = `mermaid-${id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 渲染 SVG
        const { svg: renderedSvg } = await mermaid.render(uniqueId, code);

        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
          console.log(`[MermaidRenderer] ✅ Rendered: ${id}`);
        }
      } catch (err) {
        console.error(`[MermaidRenderer] ❌ Render failed for ${id}:`, err);
        if (isMounted) {
          setError(err.message);
          setSvg(null);
        }
      } finally {
        if (isMounted) {
          setIsRendering(false);
        }
      }
    };

    renderMermaid();

    return () => {
      isMounted = false;
    };
  }, [code, id]); // 只在 code 变化时重新渲染

  if (error) {
    return (
      <div
        ref={containerRef}
        className="mermaid-error"
        style={{
          color: '#721c24',
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          padding: '10px',
          margin: '10px 0',
        }}
      >
        <strong>Mermaid 渲染错误:</strong>
        <pre style={{ margin: '5px 0 0 0', fontSize: '12px' }}>{error}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        ref={containerRef}
        className="mermaid mermaid-loading"
        style={{ padding: '10px', color: '#666', fontStyle: 'italic' }}
      >
        渲染中...
      </div>
    );
  }

  // 渲染成功：直接插入 SVG
  return (
    <div
      ref={containerRef}
      className="mermaid mermaid-rendered"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
