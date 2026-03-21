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
    flowchart: {
      ...baseFlowchart,
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
    flowchart: {
      ...baseFlowchart,
      htmlLabels: false,
    },
  });
}
