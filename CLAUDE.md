# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LingMD is a modern Markdown editor built with Electron and React. It provides a dual-pane editing experience with real-time preview, theme customization, and special features for WeChat Official Account publishing.

## Common Development Commands

### Development
```bash
npm run start                    # Start the development server with Electron
npm run start-react              # Start React dev server only
npm run start-electron           # Start Electron only (waits for React)
```

### Build & Distribution
```bash
npm run build-react              # Build React application for production
npm run dist                     # Create distributable packages
```

### Code Quality
```bash
npm run lint                     # Run ESLint (if configured)
```

## Architecture

### Core Components

**App.jsx** - Main application container with state management:
- Theme switching (Markdown themes and code highlight themes)
- File operations (new, open, save, auto-save)
- Scroll synchronization between editor and preview
- WeChat export functionality
- Mermaid diagram rendering

**Editor.jsx** - Markdown editor component:
- Undo/redo functionality with history management
- Image paste/upload support
- Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Esc)
- File handling and image management

**useMarkdownRenderer.js** - Markdown processing:
- Uses Marked.js and Markdown-it for parsing
- Supports KaTeX math expressions
- Mermaid diagram integration
- Syntax highlighting with highlight.js
- DOM sanitization with DOMPurify

**useScrollSync.js** - Scroll synchronization:
- Real-time sync between editor, preview, and WeChat export panes
- Debounced scroll handling for performance

### Main Process (main/main.js)

**File Operations:**
- Single instance application lock
- Default directory management
- Attachment folder handling for images
- Last file persistence

**Image Handling:**
- Custom `safe-file://` protocol for secure local image loading
- Image upload and path resolution
- Base64 conversion for WeChat export

**WeChat Export:**
- HTML processing with Juice for inline styles
- Image conversion to Base64
- Theme-aware CSS extraction

### Key Features

**Theme System:**
- 15+ Markdown themes (light, dark, magazine, neon, sakura, etc.)
- 8+ code highlight themes (Tokyo Night, GitHub Dark, etc.)
- Dynamic CSS loading and theme switching

**WeChat Integration:**
- Dedicated export pane matching WeChat formatting
- Inline CSS generation for consistent styling
- Image handling optimized for WeChat's requirements

**File Management:**
- Auto-save functionality (3-second delay)
- Default document directory
- Attachment folder for image organization
- Session persistence

## Development Notes

### Image Handling
- Images are stored in user-configurable attachment folder
- Local images use `safe-file://` protocol for security
- WeChat export converts images to Base64
- Relative paths are resolved relative to document location

### Theme Development
- Themes are defined in `App.jsx` with CSS variables
- New themes should follow the established CSS variable naming convention
- Both markdown themes and code highlight themes are supported

### Electron Integration
- Uses preload script for secure IPC communication
- Custom protocol handler for local file access
- Single instance application pattern

### Performance Considerations
- Scroll synchronization is debounced for performance
- Mermaid rendering includes retry logic for complex diagrams
- Auto-save uses timeout to prevent excessive file operations

## File Structure
```
src/
├── App.jsx           # Main application component
├── Editor.jsx        # Markdown editor
├── Preview.jsx       # Preview pane
├── Outline.jsx       # Document outline
├── WechatExport.jsx  # WeChat export view
├── main.jsx          # React entry point
├── useMarkdownRenderer.js # Markdown processing
└── useScrollSync.js  # Scroll synchronization

main/
├── main.js           # Electron main process
└── preload.js        # Preload script

public/
├── hljs/             # Highlight.js themes
└── styles/           # Application styles
```