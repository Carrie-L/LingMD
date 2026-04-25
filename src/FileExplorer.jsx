import React, { useEffect, useState } from "react";

function buildFileTree(files = []) {
  const root = { kind: "dir", name: "", rel: "", children: [] };
  const dirMap = new Map([["", root]]);

  for (const file of files) {
    const rel = typeof file?.rel === "string" ? file.rel : "";
    const parts = rel.split(/[\\/]+/).filter(Boolean);
    if (!parts.length) continue;

    let parentRel = "";
    let parentNode = root;

    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index];
      const currentRel = parentRel ? `${parentRel}/${name}` : name;
      let dirNode = dirMap.get(currentRel);

      if (!dirNode) {
        dirNode = { kind: "dir", name, rel: currentRel, children: [] };
        parentNode.children.push(dirNode);
        dirMap.set(currentRel, dirNode);
      }

      parentRel = currentRel;
      parentNode = dirNode;
    }

    parentNode.children.push({
      kind: "file",
      name: parts[parts.length - 1],
      rel,
      path: file.path,
    });
  }

  const sortNodes = (nodes) => {
    nodes.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "dir" ? -1 : 1;
      }
      return left.name.localeCompare(right.name, "zh-CN", {
        numeric: true,
        sensitivity: "base",
      });
    });

    for (const node of nodes) {
      if (node.kind === "dir") {
        sortNodes(node.children);
      }
    }
  };

  sortNodes(root.children);
  return root.children;
}

function normalizePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
    .toLowerCase();
}

function getFolderName(rootPath) {
  const parts = String(rootPath || "").split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function getDirectoryLabel(rel) {
  const parts = String(rel || "").split("/").filter(Boolean);
  return parts[parts.length - 1] || rel;
}

export default function FileExplorer({
  rootPath = "",
  files = [],
  activeFilePath = "",
  onOpenFile,
  onOpenFolder,
  onRevealInSystem,
  exportSelectionMode = false,
  selectedDirectoryRels = [],
  onToggleDirectorySelection,
  onConfirmDirectoryExport,
  onCancelDirectoryExport,
}) {
  const [expandedDirs, setExpandedDirs] = useState({});
  const tree = buildFileTree(files);
  const activePath = normalizePath(activeFilePath);
  const rootName = getFolderName(rootPath);
  const selectedDirSet = new Set(
    (selectedDirectoryRels || []).map((dir) => String(dir || ""))
  );

  useEffect(() => {
    const nextExpanded = {};
    for (const file of files) {
      const rel = typeof file?.rel === "string" ? file.rel : "";
      const parts = rel.split(/[\\/]+/).filter(Boolean);
      let currentRel = "";
      for (let index = 0; index < parts.length - 1; index += 1) {
        currentRel = currentRel ? `${currentRel}/${parts[index]}` : parts[index];
        nextExpanded[currentRel] = true;
      }
    }
    setExpandedDirs(nextExpanded);
  }, [rootPath, files]);

  const toggleDir = (rel) => {
    setExpandedDirs((current) => ({
      ...current,
      [rel]: !current[rel],
    }));
  };

  const renderNodes = (nodes, depth = 0) => {
    if (!nodes.length) return null;

    return (
      <ul className="file-explorer-tree">
        {nodes.map((node) => {
          if (node.kind === "dir") {
            const expanded = expandedDirs[node.rel] !== false;
            const isSelected = selectedDirSet.has(node.rel);
            return (
              <li key={node.rel} className="file-explorer-item">
                <div className={`file-explorer-row-shell${isSelected ? " selected" : ""}`}>
                  {exportSelectionMode ? (
                    <label
                      className="file-explorer-selectbox"
                      title={`选择目录 ${getDirectoryLabel(node.rel)}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleDirectorySelection?.(node.rel)}
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="file-explorer-row file-explorer-dir"
                    style={{ paddingLeft: `${12 + depth * 14}px` }}
                    onClick={() => toggleDir(node.rel)}
                    title={node.rel}
                  >
                    <span className="file-explorer-caret" aria-hidden="true">
                      {expanded ? "▾" : "▸"}
                    </span>
                    <span className="file-explorer-icon" aria-hidden="true">
                      dir
                    </span>
                    <span className="file-explorer-name">{node.name}</span>
                  </button>
                </div>
                {expanded ? renderNodes(node.children, depth + 1) : null}
              </li>
            );
          }

          const isActive = normalizePath(node.path) === activePath;
          return (
            <li key={node.rel} className="file-explorer-item">
              <div className="file-explorer-row-shell">
                {exportSelectionMode ? <span className="file-explorer-selectbox spacer" /> : null}
                <button
                  type="button"
                  className={`file-explorer-row file-explorer-file${isActive ? " active" : ""}`}
                  style={{ paddingLeft: `${12 + depth * 14}px` }}
                  onClick={() => onOpenFile?.(node.path)}
                  title={node.rel}
                >
                  <span className="file-explorer-caret placeholder" aria-hidden="true">
                    •
                  </span>
                  <span className="file-explorer-icon" aria-hidden="true">
                    md
                  </span>
                  <span className="file-explorer-name">{node.name}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        <div className="file-explorer-heading">
          <div className="file-explorer-kicker">Explorer</div>
          <div className="file-explorer-root" title={rootPath || "未打开文件夹"}>
            {rootName || "未打开文件夹"}
          </div>
        </div>
        <div className="file-explorer-actions">
          <button type="button" className="sidebar-action-button" onClick={() => onOpenFolder?.()}>
            打开文件夹
          </button>
          {rootPath ? (
            <button
              type="button"
              className="sidebar-action-button secondary"
              onClick={() => onRevealInSystem?.(rootPath)}
            >
              打开目录
            </button>
          ) : null}
        </div>
        {exportSelectionMode ? (
          <div className="file-explorer-selection-bar">
            <div className="file-explorer-selection-text">
              已选 {selectedDirectoryRels.length} 个目录
            </div>
            <div className="file-explorer-selection-actions">
              <button
                type="button"
                className="sidebar-action-button"
                disabled={!selectedDirectoryRels.length}
                onClick={() => onConfirmDirectoryExport?.()}
              >
                导出选中目录
              </button>
              <button
                type="button"
                className="sidebar-action-button secondary"
                onClick={() => onCancelDirectoryExport?.()}
              >
                取消
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {!rootPath ? (
        <div className="file-explorer-empty">
          <p>导入一个文件夹后，这里会显示该目录下全部 Markdown 文件。</p>
        </div>
      ) : files.length === 0 ? (
        <div className="file-explorer-empty">
          <p>当前文件夹下没有可显示的 Markdown 文件。</p>
        </div>
      ) : (
        <div className="file-explorer-body">{renderNodes(tree)}</div>
      )}
    </div>
  );
}
