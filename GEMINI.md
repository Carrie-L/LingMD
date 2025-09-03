# LingMD Project Overview

This is a Markdown editor application named "LingMD" built with React, Vite, and Electron. It provides a simple and efficient way to write and preview Markdown files, with a special feature for exporting content to WeChat.

## Technologies Used

*   **Electron:** For building the cross-platform desktop application.
*   **React:** For the user interface.
*   **Vite:** As the build tool and development server.
*   **Marked:** For parsing and rendering Markdown.
*   **Highlight.js:** For syntax highlighting in code blocks.
*   **DOMPurify:** For sanitizing the rendered HTML to prevent XSS attacks.
*   **Electron Store:** For persisting application state and user preferences.

## Building and Running

To build and run the project, you need to have Node.js and npm installed.

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Run in development mode:**
    ```bash
    npm start
    ```
    This will start the Vite development server and launch the Electron application.

3.  **Build for production:**
    ```bash
    npm run dist
    ```
    This will create a distributable package for your operating system in the `dist_electron` directory.

## Development Conventions

*   **State Management:** The application's state is managed within the main `App.jsx` component using React hooks.
*   **IPC Communication:** The main process (`main/main.js`) and the renderer process (`src/App.jsx`) communicate using Electron's IPC modules (`ipcMain` and `ipcRenderer`). The preload script (`main/preload.js`) exposes the necessary IPC functions to the renderer process in a secure way.
*   **Local Image Handling:** The application uses a custom `safe-file` protocol to securely load local images in the preview pane. This is a good security practice to prevent exposing the local file system to the renderer process.
*   **WeChat Export:** The "copy to WeChat" feature converts images to Base64 and adjusts the HTML to be compatible with the WeChat editor.
