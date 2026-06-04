# Genaibar 

**The World's Fastest AI Sidebar Browser.**  
*Unify your AI workflow. One panel. No distractions.*

[![Version](https://img.shields.io/badge/Version-1.0.0-green.svg)]()
[![License](https://img.shields.io/badge/License-MIT-purple.svg)]()

Genaibar is a high-performance Chrome extension designed for power users who rely on multiple AI assistants. It provides a persistent, glassmorphic sidebar that allows you to switch between ChatGPT, Claude, Gemini, and others instantly—without ever leaving your current tab.

---

## Key Features

- **Lazy-Loading Architecture:** Only the active AI assistant consumes memory. Open 10+ tabs without slowing down your browser.
- **Smart Screenshot Suite:** Capture full tabs or specific regions (`Alt+Shift+R`) and have them automatically uploaded to your chat.
- **Instant Smart Copy:** Select any text and press `Alt+Shift+C` to send it directly into the active LLM.
- **Advanced Auto-Upload:** Proprietary "Hidden File Input" strategy for Claude.ai and Gemini to bypass security blocks and framework restrictions.
- **Glassmorphism UI:** A beautiful, modern interface with real-time blur and fluid animations.
- **Fast Refresh:** One-click "Soft Reload" to unstick AI sites without losing your context.
- **Unique Image Naming:** Automatically generates unique high-res filenames to prevent Gemini/AI image deduplication issues.
...
---

## Installation (Developer Mode)

1.  **Download:** Clone this repository or download the ZIP folder.
2.  **Unpack:** Extract the files to a folder on your computer.
3.  **Configure:** 
    - Copy `config.template.js` to `config.js`.
    - Edit `config.js` and add your personal configuration (e.g., feedback email).
    - Note: `config.js` is ignored by git and will not be committed.
4.  **Chrome Extensions:** Open Chrome and navigate to `chrome://extensions`.
5.  **Developer Mode:** Enable **Developer mode** (top-right toggle).
6.  **Load Unpacked:** Click **Load unpacked** and select the `genaibar-extension/` folder.
7.  **Pin:** Pin Genaibar to your toolbar for instant access.

---
...

## Pro Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Alt+Shift+L` | Open / Close Sidebar |
| `Alt+Shift+S` | Capture Full Tab → Upload |
| `Alt+Shift+R` | Select Region → Upload |
| `Alt+Shift+C` | Copy Selection → Send |

---

## Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Built with ❤️ for the AI community.*
