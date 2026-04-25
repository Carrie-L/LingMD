import mermaid from "mermaid";

const baseFlowchart = {
  useMaxWidth: false,
  curve: "basis",
  diagramPadding: 20,
  wrappingWidth: 200,
  defaultRenderer: "dagre",
};

/**
 * 编辑器 / 预览：htmlLabels 在浏览器里效果好。
 */
export function initMermaidPreview() {
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "loose",
    fontFamily: "Arial, sans-serif",
    // Mermaid 11：全局 htmlLabels 会参与合并，需显式打开（与 flowchart 一致）
    htmlLabels: true,
    flowchart: {
      ...baseFlowchart,
      htmlLabels: true,
    },
    class: {
      htmlLabels: true,
    },
  });
}

/**
 * EPUB 导出：必须 htmlLabels:false，否则用 foreignObject 画字，多数 EPUB 阅读器不显示文字。
 */
export function initMermaidEpubExport() {
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "loose",
    fontFamily: "Arial, sans-serif",
    // EPUB/SVG：顶层必须为 false，否则仍可能走 foreignObject（阅读器不渲染文字）
    htmlLabels: false,
    flowchart: {
      ...baseFlowchart,
      htmlLabels: false,
    },
    class: {
      htmlLabels: false,
    },
  });
}
