function getFileMenuItems() {
  return [
    { command: "new", label: "新建" },
    { command: "open", label: "打开文件" },
    { command: "open-folder", label: "打开文件夹" },
    { command: "save", label: "保存" },
    { command: "save-as", label: "另存为" },
    { type: "separator" },
    { command: "export-html", label: "导出 HTML" },
    { command: "export-pdf", label: "导出 PDF" },
    { command: "export-image", label: "导出图片" },
    { command: "export-epub", label: "导出 EPUB" },
  ];
}

module.exports = {
  getFileMenuItems,
};
