# LingMD

一个现代化的 Markdown 编辑器，专为微信公众号内容创作而优化。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.1.1-lightgrey.svg)

## 主要特性

### 普通的编辑功能
- **实时预览**：左右分栏编辑，实时查看渲染效果
- **语法高亮**：支持多种代码高亮主题
- **数学公式**：支持 KaTeX 数学公式渲染
- **流程图支持**：集成 Mermaid，支持流程图、时序图、甘特图等
- **任务列表**：支持 Markdown 任务列表语法
- **目录导航**：自动生成文档目录，快速跳转

### 微信公众号预览
- **专用预览区**：模拟微信公众号编辑器样式
- **一键复制**：点击"复制到公众号"即可复制带样式的文章，保证在微信编辑器中的显示效果
- **图片复制**：复制到公众号能带上图片一起

### 一般的主题系统
- **15+ Markdown 主题**：推荐Minty Fresh、Magazine Style主题，其它主题还没优化
- **8+ 代码高亮主题**
- **动态切换主题**

### 还需精进的文件管理
- **默认目录**：可设置默认文档目录
- **图片管理**：支持设置默认图片目录，统一管理图片资源
- **相对路径**：图片路径相对于当前文档位置解析
- **Obsidian 兼容**：支持 Obsidian 的图片语法 `![[image.png]]`

## 🛠️ 技术栈

- **前端框架**：React 19
- **构建工具**：Vite 7
- **桌面应用**：Electron 37
- **Markdown 解析**：Markdown-it、Marked
- **数学公式**：KaTeX

## 📦 安装

### 开发环境要求
- Node.js >= 16
- npm >= 8

### 安装依赖
```bash
npm install
```

### 开发命令
```bash
# 启动开发服务器（同时启动 React 和 Electron）
npm start

# 仅启动 React 开发服务器
npm run start-react

# 仅启动 Electron（等待 React 服务器就绪）
npm run start-electron

# 构建 React 应用
npm run build-react

# 创建可分发包
npm run dist
```

## 🐛 已知问题

- 任务列表在微信公众号中可能导致 checkbox 和任务换行（已禁用）
- 编辑器、预览区和微信公众号预览区三区域同步滚动（无法完美实现同步，干脆取消这个功能了）

## 📝 更新日志

### v1.1.1
- 初始版本发布
- 支持基本的 Markdown 编辑和预览
- 微信公众号导出功能
- 多主题支持
- Mermaid 图表支持

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 👤 作者

Ling

---

**享受写作的乐趣！** ✨
