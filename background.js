/**
 * @file background.js
 * @description Main background service worker for the Genaibar Chrome extension.
 * Handles side panel state, global keyboard shortcuts, screenshot processing, 
 * and inter-component communication.
 */

'use strict';

/** @constant {Array} DEFAULT_LLMS - Predefined list of popular AI assistants. */
const DEFAULT_LLMS = [
  { id: 'chatgpt',    name: 'ChatGPT',    url: 'https://chat.openai.com',       color: '#10a37f' },
  { id: 'claude',     name: 'Claude',     url: 'https://claude.ai',              color: '#d4a574' },
  { id: 'gemini',     name: 'Gemini',     url: 'https://gemini.google.com',      color: '#4285f4' },
];

/** @type {Set<number>} Track which windows have the panel open to manage state. */
const panelOpenWindows = new Set();

/**
 * Initialize storage with default LLMs on extension installation.
 */
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.sync.get(['llms', 'activeLLMId']);
  if (!data.llms || data.llms.length === 0) {
    await chrome.storage.sync.set({ llms: DEFAULT_LLMS, activeLLMId: DEFAULT_LLMS[0].id });
  }
});

// Configure side panel behavior: click action icon to toggle panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Clean up tracking when a window is closed.
chrome.windows.onRemoved.addListener(windowId => panelOpenWindows.delete(windowId));

/* ── KEYBOARD COMMANDS ─────────────────────────────── */
/**
 * Listener for global keyboard shortcuts defined in manifest.json.
 */
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) return;

  // Handle panel toggle
  if (command === 'open-panel') {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      panelOpenWindows.add(tab.windowId);
      broadcastPanelState(tab.windowId, true);
    } catch (e) { console.error('Failed to open side panel:', e); }
    return;
  }

  // Ensure panel is open for other commands
  await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  await delay(400); // Allow panel rendering time

  // Capture full tab screenshot
  if (command === 'screenshot-tab') {
    const dataUrl = await captureTab(tab.id);
    if (dataUrl) {
      chrome.runtime.sendMessage({
        type: 'SCREENSHOT_READY', dataUrl, mode: 'full', autoSend: true
      }).catch(() => {});
    }
    return;
  }

  // Copy selected text from the page
  if (command === 'copy-selection') {
    if (isPdf(tab.url)) {
      chrome.runtime.sendMessage({
        type: 'SHOW_ERROR',
        msg: 'PDFs don\'t support text selection in Chrome. Use the screenshot tool (Alt+Shift+S) to capture text visually.'
      }).catch(() => {});
      return;
    }
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString().trim()
      });
      const text = results[0]?.result || '';
      if (text) {
        await delay(100);
        chrome.runtime.sendMessage({ type: 'SELECTION_TEXT', text }).catch(() => {});
      } else {
        chrome.runtime.sendMessage({
          type: 'SHOW_ERROR',
          msg: 'No text selected. Select some text on the page first, then use Alt+Shift+C.'
        }).catch(() => {});
      }
    } catch {
      chrome.runtime.sendMessage({
        type: 'SHOW_ERROR',
        msg: 'Could not read selection. Try refreshing the page or using the screenshot tool.'
      }).catch(() => {});
    }
    return;
  }

  // Trigger region selection screenshot tool
  if (command === 'region-screenshot') {
    if (isPdf(tab.url)) {
      const dataUrl = await captureTab(tab.id);
      if (dataUrl) {
        chrome.runtime.sendMessage({
          type: 'SCREENSHOT_READY', dataUrl, mode: 'full', autoSend: true
        }).catch(() => {});
        chrome.runtime.sendMessage({
          type: 'SHOW_ERROR',
          msg: 'Region selection is limited on PDFs. A full screenshot has been captured instead.'
        }).catch(() => {});
      }
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-screenshot.js']
    }).catch(() => {});
    return;
  }
});

/* ── MESSAGES ──────────────────────────────────────── */
/**
 * Listener for inter-component communication (panel <-> background).
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'PANEL_OPENED') {
    chrome.windows.getCurrent((win) => {
       if (win) {
         panelOpenWindows.add(win.id);
       }
    });
    return;
  }

  if (msg.type === 'PANEL_CLOSED') {
    chrome.windows.getCurrent((win) => {
       if (win) {
         panelOpenWindows.delete(win.id);
       }
    });
    return;
  }

  if (msg.type === 'CAPTURE_FULL_SCREENSHOT') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) { sendResponse({ error: 'No active tab' }); return; }
      const dataUrl = await captureTab(tabId);
      sendResponse({ dataUrl });
    });
    return true;
  }

  if (msg.type === 'START_REGION_SELECT') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      if (isPdf(tabs[0].url)) {
        const dataUrl = await captureTab(tabId);
        if (dataUrl) {
          chrome.runtime.sendMessage({
            type: 'SCREENSHOT_READY', dataUrl, mode: 'full', autoSend: false
          }).catch(() => {});
          chrome.runtime.sendMessage({
            type: 'SHOW_ERROR',
            msg: 'Region select is not supported on built-in PDF viewer. Full screenshot captured.'
          }).catch(() => {});
        }
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-screenshot.js']
      }).catch(() => {});
    });
    return true;
  }

  if (msg.type === 'REGION_SELECTED') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      const dataUrl = await captureTab(tabId);
      if (dataUrl) {
        chrome.runtime.sendMessage({
          type: 'SCREENSHOT_READY', dataUrl, mode: 'region', region: msg.region, autoSend: true
        }).catch(() => {});
      }
    });
  }
});

/* ── HELPERS ───────────────────────────────────────── */
/**
 * Check if the URL belongs to a PDF document.
 * @param {string} url - The URL to check.
 * @returns {boolean} True if the URL is likely a PDF.
 */
function isPdf(url) {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.endsWith('.pdf') || u.includes('.pdf?') || u.includes('.pdf#') ||
         u.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai');
}

/**
 * Capture the visible area of the active tab.
 * @param {number} tabId - ID of the tab to capture.
 * @returns {Promise<string|null>} Data URL of the screenshot, or null on failure.
 */
function captureTab(tabId) {
  return new Promise(resolve => {
    chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 }, dataUrl => {
      resolve(chrome.runtime.lastError ? null : dataUrl);
    });
  });
}

/**
 * Promise-based delay helper.
 * @param {number} ms - Delay duration in milliseconds.
 * @returns {Promise}
 */
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
