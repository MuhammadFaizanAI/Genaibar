# Genaibar — Chrome Extension

One-click access to all your AI assistants in a persistent Chrome side panel.

## How to Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`
2. Toggle **Developer mode** ON (top-right switch)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project
5. The LLM Hub icon appears in your Chrome toolbar
6. Click it to open the side panel

## Phase 1 Features

- **Side panel** — persistent panel that stays open as you browse
- **LLM switcher** — icon bar to jump between ChatGPT, Claude, Gemini, and more
- **Add/remove LLMs** — configure any AI website via Settings
- **X-Frame bypass** — strips headers so LLM sites load inside the panel
- **Open in tab** — launch the active LLM in a full tab from the status bar
- **Keyboard shortcuts** — `Alt+Shift+L` opens the panel

## Default LLMs

- ChatGPT (https://chat.openai.com)
- Claude (https://claude.ai)
- Gemini (https://gemini.google.com)

## Add More LLMs

Click the **+** button or the **gear icon** in the panel to open Settings, then use Quick Add to add Perplexity, Grok, Copilot, Mistral, Meta AI, or any custom URL.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+L` | Open/close panel |
| `Alt+Shift+S` | Screenshot tab (Phase 2) |
| `Alt+Shift+C` | Copy selection to LLM (Phase 3) |

Customize shortcuts at `chrome://extensions/shortcuts`.