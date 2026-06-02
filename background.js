'use strict';

const DEFAULT_LLMS = [
  { id: 'chatgpt',    name: 'ChatGPT',    url: 'https://chat.openai.com',       color: '#10a37f' },
  { id: 'claude',     name: 'Claude',     url: 'https://claude.ai',              color: '#d4a574' },
  { id: 'gemini',     name: 'Gemini',     url: 'https://gemini.google.com',      color: '#4285f4' },
];

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.sync.get(['llms', 'activeLLMId']);
  if (!data.llms || data.llms.length === 0) {
    await chrome.storage.sync.set({ llms: DEFAULT_LLMS, activeLLMId: DEFAULT_LLMS[0].id });
  }
  // Default floating button to enabled
  const { floatingBtnEnabled } = await chrome.storage.sync.get(['floatingBtnEnabled']);
  if (floatingBtnEnabled === undefined) {
    await chrome.storage.sync.set({ floatingBtnEnabled: true });
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

/* ── KEYBOARD COMMANDS ──────────────────────────────── */
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) return;

  // Open panel first for all commands
  await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  await delay(350);

  if (command === 'screenshot-tab') {
    const dataUrl = await captureTab(tab.id);
    if (dataUrl) {
      chrome.runtime.sendMessage({
        type: 'SCREENSHOT_READY', dataUrl, mode: 'full', autoSend: true
      }).catch(() => {});
    }
    return;
  }

  if (command === 'copy-selection') {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString().trim()
      });
      const text = results[0]?.result || '';
      if (text) {
        await delay(100);
        chrome.runtime.sendMessage({ type: 'SELECTION_TEXT', text }).catch(() => {});
      }
    } catch { /* page may block scripting */ }
    return;
  }

  if (command === 'region-screenshot') {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-screenshot.js']
    }).catch(() => {});
    return;
  }
});

/* ── MESSAGES ───────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'OPEN_PANEL_FLOAT') {
    const tabId = sender.tab?.id;
    if (tabId) chrome.sidePanel.open({ tabId }).catch(() => {});
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
      if (tabId) {
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-screenshot.js']
        }).catch(() => {});
      }
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

/* ── UTILS ──────────────────────────────────────────── */
function captureTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      resolve(chrome.runtime.lastError ? null : dataUrl);
    });
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
