'use strict';

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let llms        = [];
let activeLLMId = null;
let prompts     = [];
const iframes       = {};
const iframeLoaded  = {};
let pendingPaste    = null;  // { type, data }

// Unified session history (images + text)
const SESSION_HISTORY  = [];
const MAX_HISTORY      = 40;
let historyFilter      = 'all';

// Screenshot preview state (manual only)
let ssOriginalDataUrl = null;
let ssOriginalW = 0, ssOriginalH = 0;
let ssCurrentDataUrl  = null;
let pasteTimer = null;

/* ═══════════════════════════════════════
   ELEMENTS
═══════════════════════════════════════ */
const tabsEl        = document.getElementById('tabs');
const iframeArea    = document.getElementById('iframeArea');
const emptyState    = document.getElementById('emptyState');
const statusBar     = document.getElementById('statusBar');
const statusText    = document.getElementById('statusText');
const openTabBtn    = document.getElementById('openTabBtn');
const historyPanel  = document.getElementById('historyPanel');
const historyContent= document.getElementById('historyContent');
const promptsPanel  = document.getElementById('promptsPanel');
const promptsList   = document.getElementById('promptsList');
const pasteOverlay  = document.getElementById('pasteOverlay');
const pasteTitle    = document.getElementById('pasteTitle');
const pasteBar      = document.getElementById('pasteBar');
const ssOverlay     = document.getElementById('ssOverlay');
const ssImage       = document.getElementById('ssImage');
const ssDimsBadge   = document.getElementById('ssDimsBadge');
const ssHistStrip   = document.getElementById('ssHistStrip');
const ssHistRow     = document.getElementById('ssHistRow');
const ssCapturing   = document.getElementById('ssCapturing');
const toastEl       = document.getElementById('toast');
const customW       = document.getElementById('customW');
const customH       = document.getElementById('customH');

/* ═══════════════════════════════════════
   LIFECYCLE
═══════════════════════════════════════ */
chrome.runtime.sendMessage({ type: 'PANEL_OPENED' }).catch(() => {});
window.addEventListener('beforeunload', () => {
  chrome.runtime.sendMessage({ type: 'PANEL_CLOSED' }).catch(() => {});
});

/* ═══════════════════════════════════════
   BOOT
═══════════════════════════════════════ */
async function boot() {
  const data = await chrome.storage.sync.get(['llms', 'activeLLMId', 'prompts']);
  llms       = data.llms    || [];
  activeLLMId = data.activeLLMId || (llms[0]?.id ?? null);
  prompts    = data.prompts  || [];
  renderTabs();
  renderPrompts();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.llms || changes.activeLLMId) {
    chrome.storage.sync.get(['llms','activeLLMId'], d => {
      llms = d.llms || [];
      activeLLMId = d.activeLLMId || (llms[0]?.id ?? null);
      renderTabs();
    });
  }
  if (changes.prompts) {
    prompts = changes.prompts.newValue || [];
    renderPrompts();
  }
});

/* ═══════════════════════════════════════
   LLM TABS
═══════════════════════════════════════ */
function getFaviconUrl(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
  catch { return null; }
}

function renderTabs() {
  tabsEl.innerHTML = '';
  if (llms.length === 0) {
    emptyState.style.display = 'flex';
    statusBar.classList.remove('visible');
    Object.values(iframes).forEach(f => f.remove());
    return;
  }
  emptyState.style.display = 'none';

  llms.forEach(llm => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (llm.id === activeLLMId ? ' active' : '');
    tab.dataset.id = llm.id;
    tab.title = llm.name;

    const fav = document.createElement('div');
    fav.className = 'tab-favicon';
    const favUrl = getFaviconUrl(llm.url);
    if (favUrl) {
      const img = document.createElement('img');
      img.src = favUrl;
      img.alt = llm.name;
      img.onerror = () => {
        img.remove();
        Object.assign(fav.style, {
          background: llm.color || '#7c3aed', color: '#fff',
          borderRadius: '50%', fontSize: '11px', fontWeight: '700',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        });
        fav.textContent = llm.name.slice(0, 1).toUpperCase();
      };
      fav.appendChild(img);
    } else {
      Object.assign(fav.style, {
        background: llm.color || '#7c3aed', color: '#fff',
        borderRadius: '50%', fontSize: '11px', fontWeight: '700',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      });
      fav.textContent = llm.name.slice(0, 1).toUpperCase();
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.title = `Remove ${llm.name}`;
    closeBtn.innerHTML = `<svg viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    closeBtn.addEventListener('click', e => { e.stopPropagation(); removeLLM(llm.id); });

    tab.appendChild(fav);
    tab.appendChild(closeBtn);
    tab.addEventListener('click', () => switchLLM(llm.id));
    tabsEl.appendChild(tab);
    ensureIframe(llm);
  });
  updateActiveIframe();
}

function ensureIframe(llm) {
  if (iframes[llm.id]) return;
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute;inset:0;display:none;';
  wrapper.dataset.llmId = llm.id;

  const loader = document.createElement('div');
  loader.className = 'iframe-loader';
  loader.innerHTML = `<div class="spinner"></div><div class="loader-name">Loading ${llm.name}…</div>`;

  const frame = document.createElement('iframe');
  frame.className = 'llm-iframe active';
  frame.src = llm.url;
  frame.allow = 'clipboard-read; clipboard-write; microphone; camera';
  frame.setAttribute('allowfullscreen', '');
  frame.addEventListener('load', () => {
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), 300);
    try { statusText.textContent = frame.contentWindow?.location?.href || llm.url; }
    catch { statusText.textContent = llm.url; }
    iframeLoaded[llm.id] = true;
    if (pendingPaste && llm.id === activeLLMId) {
      setTimeout(() => {
        executePaste(pendingPaste.type, pendingPaste.data, frame);
        pendingPaste = null;
      }, 700);
    }
  });

  wrapper.appendChild(loader);
  wrapper.appendChild(frame);
  iframeArea.appendChild(wrapper);
  iframes[llm.id] = wrapper;
  iframeLoaded[llm.id] = false;
}

function updateActiveIframe() {
  Object.entries(iframes).forEach(([id, w]) => {
    w.style.display = id === activeLLMId ? 'block' : 'none';
  });
  const active = llms.find(l => l.id === activeLLMId);
  if (active) {
    statusBar.classList.add('visible');
    statusText.textContent = active.url;
    openTabBtn.onclick = () => chrome.tabs.create({ url: active.url });
  } else {
    statusBar.classList.remove('visible');
  }
}

async function switchLLM(id) {
  activeLLMId = id;
  await chrome.storage.sync.set({ activeLLMId: id });
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.id === id));
  updateActiveIframe();
}

async function removeLLM(id) {
  if (iframes[id]) { iframes[id].remove(); delete iframes[id]; }
  delete iframeLoaded[id];
  llms = llms.filter(l => l.id !== id);
  if (activeLLMId === id) activeLLMId = llms[0]?.id ?? null;
  await chrome.storage.sync.set({ llms, activeLLMId });
  renderTabs();
}

document.getElementById('emptySettingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('settingsBtn').addEventListener('click',       () => chrome.runtime.openOptionsPage());

/* ═══════════════════════════════════════
   DIRECT PASTE
═══════════════════════════════════════ */
function activeLLMName() {
  return llms.find(l => l.id === activeLLMId)?.name || 'LLM';
}

function requestPaste(type, data) {
  const wrapper = iframes[activeLLMId];
  if (!wrapper) { toast('No LLM open — add one in Settings', 'error'); return; }
  const frame = wrapper.querySelector('iframe');
  if (iframeLoaded[activeLLMId]) {
    executePaste(type, data, frame);
  } else {
    pendingPaste = { type, data };
    toast('LLM loading — will paste when ready…', 'info');
  }
}

function executePaste(type, data, frame) {
  if (!frame) return;
  frame.contentWindow.postMessage({
    source: 'Genaibar-hub-ext',
    type:   type === 'image' ? 'PASTE_IMAGE' : 'PASTE_TEXT',
    dataUrl: type === 'image' ? data : undefined,
    text:    type === 'text'  ? data : undefined,
  }, '*');
  toast(`${type === 'image' ? 'Screenshot' : 'Text'} sent to ${activeLLMName()}!`, 'success');
}

/* ═══════════════════════════════════════
   MESSAGE LISTENER
═══════════════════════════════════════ */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SCREENSHOT_READY') {
    showCapturing(false);
    if (msg.autoSend) {
      // Shortcut path — direct paste, no preview
      resolveScreenshot(msg.dataUrl, msg.mode === 'region' ? msg.region : null)
        .then(({ dataUrl, w, h }) => {
          addHistory({ type: 'image', dataUrl, w, h });
          requestPaste('image', dataUrl);
        });
    } else {
      // Manual path — show preview overlay
      showPreview(msg.dataUrl, msg.mode === 'region' ? msg.region : null);
    }
  }

  if (msg.type === 'SELECTION_TEXT' && msg.text) {
    addHistory({ type: 'text', text: msg.text });
    requestPaste('text', msg.text);
  }
});

/* ═══════════════════════════════════════
   SCREENSHOT — MANUAL CAPTURE
═══════════════════════════════════════ */
document.getElementById('screenshotBtn').addEventListener('click', captureFullScreenshot);
document.getElementById('regionBtn').addEventListener('click', startRegionSelect);

async function captureFullScreenshot() {
  showCapturing(true);
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'CAPTURE_FULL_SCREENSHOT' });
    if (resp?.dataUrl) showPreview(resp.dataUrl, null);
    else toast('Could not capture screenshot', 'error');
  } catch { toast('Capture failed', 'error'); }
  showCapturing(false);
}

async function startRegionSelect() {
  toast('Drag on the page to select a region', 'info');
  await chrome.runtime.sendMessage({ type: 'START_REGION_SELECT' });
}

async function resolveScreenshot(dataUrl, region) {
  if (region) {
    return cropImage(dataUrl, region);
  }
  const dims = await getImageDimensions(dataUrl);
  return { dataUrl, ...dims };
}

async function showPreview(dataUrl, region) {
  const { dataUrl: fd, w, h } = await resolveScreenshot(dataUrl, region);
  ssOriginalDataUrl = fd; ssOriginalW = w; ssOriginalH = h;
  ssCurrentDataUrl  = fd;
  ssImage.src = fd;
  ssDimsBadge.textContent = `${w} \u00d7 ${h}`;
  customW.value = w; customH.value = h;
  document.querySelectorAll('.preset-sz').forEach(b => b.classList.toggle('active', b.dataset.scale === '1'));
  ssOverlay.classList.remove('hidden');
  addHistory({ type: 'image', dataUrl: fd, w, h });
  renderHistoryStrip();
}

/* resize controls */
document.querySelectorAll('.preset-sz').forEach(btn => {
  btn.addEventListener('click', async () => {
    const scale = parseFloat(btn.dataset.scale);
    const w = Math.round(ssOriginalW * scale), h = Math.round(ssOriginalH * scale);
    ssCurrentDataUrl = await resizeImage(ssOriginalDataUrl, w, h);
    ssImage.src = ssCurrentDataUrl;
    ssDimsBadge.textContent = `${w} \u00d7 ${h}`;
    customW.value = w; customH.value = h;
    document.querySelectorAll('.preset-sz').forEach(b => b.classList.toggle('active', b === btn));
  });
});
document.getElementById('applyCustomSize').addEventListener('click', async () => {
  const w = parseInt(customW.value, 10), h = parseInt(customH.value, 10);
  if (!w || !h) return;
  ssCurrentDataUrl = await resizeImage(ssOriginalDataUrl, w, h);
  ssImage.src = ssCurrentDataUrl;
  ssDimsBadge.textContent = `${w} \u00d7 ${h}`;
  document.querySelectorAll('.preset-sz').forEach(b => b.classList.remove('active'));
});
customW.addEventListener('input', () => {
  const w = parseInt(customW.value, 10);
  if (w && ssOriginalW) customH.value = Math.round(w * ssOriginalH / ssOriginalW);
});
customH.addEventListener('input', () => {
  const h = parseInt(customH.value, 10);
  if (h && ssOriginalH) customW.value = Math.round(h * ssOriginalW / ssOriginalH);
});

/* ss-overlay actions */
document.getElementById('ssSendBtn').addEventListener('click', () => {
  ssOverlay.classList.add('hidden');
  ssHistStrip.classList.add('hidden');
  requestPaste('image', ssCurrentDataUrl);
});
document.getElementById('ssCopyBtn').addEventListener('click', async () => {
  const ok = await writeImageToClipboard(ssCurrentDataUrl);
  toast(ok ? 'Image copied to clipboard' : 'Could not copy', ok ? 'success' : 'error');
});
document.getElementById('ssCloseBtn').addEventListener('click', () => {
  ssOverlay.classList.add('hidden');
  ssHistStrip.classList.add('hidden');
});
document.getElementById('ssRetakeBtn').addEventListener('click', captureFullScreenshot);
document.getElementById('ssHistBtn').addEventListener('click', () => {
  ssHistStrip.classList.toggle('hidden');
  renderHistoryStrip();
});

/* ═══════════════════════════════════════
   TOPBAR PANEL TOGGLES
═══════════════════════════════════════ */
document.getElementById('historyBtn').addEventListener('click', () => {
  const open = !historyPanel.classList.contains('hidden');
  closeAllPanels();
  if (!open) {
    historyPanel.classList.remove('hidden');
    document.getElementById('historyBtn').classList.add('active');
  }
});
document.getElementById('promptsBtn').addEventListener('click', () => {
  const open = !promptsPanel.classList.contains('hidden');
  closeAllPanels();
  if (!open) {
    promptsPanel.classList.remove('hidden');
    document.getElementById('promptsBtn').classList.add('active');
  }
});
function closeAllPanels() {
  historyPanel.classList.add('hidden');
  promptsPanel.classList.add('hidden');
  document.getElementById('historyBtn').classList.remove('active');
  document.getElementById('promptsBtn').classList.remove('active');
}

/* History filter buttons */
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    historyFilter = btn.dataset.filter;
    renderHistory();
  });
});

document.getElementById('clearHistoryBtn').addEventListener('click', () => {
  SESSION_HISTORY.length = 0;
  renderHistory();
  toast('History cleared');
});

document.getElementById('managePromptsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

/* ═══════════════════════════════════════
   SESSION HISTORY
═══════════════════════════════════════ */
function addHistory(entry) {
  const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  SESSION_HISTORY.unshift({ id: Date.now(), ts, ...entry });
  if (SESSION_HISTORY.length > MAX_HISTORY) SESSION_HISTORY.pop();
  if (!historyPanel.classList.contains('hidden')) renderHistory();
}

function renderHistory() {
  const filtered = historyFilter === 'all'
    ? SESSION_HISTORY
    : SESSION_HISTORY.filter(e => e.type === historyFilter);

  if (filtered.length === 0) {
    historyContent.innerHTML = '<div class="history-empty">No items yet. Take a screenshot or use Alt+Shift+C to copy text.</div>';
    return;
  }

  historyContent.innerHTML = '';

  // Group consecutive images into rows for a nicer grid
  let imgRow = null;
  filtered.forEach(entry => {
    if (entry.type === 'image') {
      if (!imgRow) {
        imgRow = document.createElement('div');
        imgRow.className = 'history-images-row';
        historyContent.appendChild(imgRow);
      }
      const item = document.createElement('div');
      item.className = 'history-img-item';
      item.title = `${entry.w ? entry.w + '\u00d7' + entry.h + ' \u00b7 ' : ''}${entry.ts} — Click to paste`;
      item.innerHTML = `<img src="${entry.dataUrl}" loading="lazy"/><div class="hist-meta">${entry.ts}</div>`;
      item.addEventListener('click', () => useHistoryItem(entry));
      imgRow.appendChild(item);
    } else {
      imgRow = null; // break image grouping
      const item = document.createElement('div');
      item.className = 'history-text-item';
      item.title = 'Click to paste into LLM';
      item.innerHTML = `
        <div class="history-text-preview">${escHtml(entry.text || '')}</div>
        <div class="history-text-meta">${entry.ts} · text · click to paste</div>`;
      item.addEventListener('click', () => useHistoryItem(entry));
      historyContent.appendChild(item);
    }
  });
}

async function useHistoryItem(entry) {
  closeAllPanels();
  if (entry.type === 'image') {
    await writeImageToClipboard(entry.dataUrl);
    requestPaste('image', entry.dataUrl);
  } else {
    await navigator.clipboard.writeText(entry.text).catch(() => {});
    requestPaste('text', entry.text);
  }
}

/* small thumbnail strip inside screenshot preview */
function renderHistoryStrip() {
  const images = SESSION_HISTORY.filter(e => e.type === 'image').slice(0, 12);
  ssHistRow.innerHTML = '';
  images.forEach(entry => {
    const thumb = document.createElement('div');
    thumb.className = 'ss-hist-thumb';
    thumb.innerHTML = `<img src="${entry.dataUrl}" loading="lazy"/>`;
    thumb.addEventListener('click', () => {
      ssOriginalDataUrl = entry.dataUrl;
      ssOriginalW = entry.w || ssOriginalW;
      ssOriginalH = entry.h || ssOriginalH;
      ssCurrentDataUrl = entry.dataUrl;
      ssImage.src = entry.dataUrl;
      ssDimsBadge.textContent = entry.w ? `${entry.w} \u00d7 ${entry.h}` : '';
      customW.value = entry.w || ''; customH.value = entry.h || '';
    });
    ssHistRow.appendChild(thumb);
  });
}

/* ═══════════════════════════════════════
   PROMPT LIBRARY
═══════════════════════════════════════ */
function renderPrompts() {
  if (prompts.length === 0) {
    promptsList.innerHTML = `<div class="prompts-empty">No saved prompts.<br><a id="goSettings">Go to Settings to add prompts</a></div>`;
    document.getElementById('goSettings')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
    return;
  }
  promptsList.innerHTML = '';
  prompts.forEach(p => {
    const item = document.createElement('div');
    item.className = 'prompt-item';
    item.innerHTML = `<div class="prompt-title">${escHtml(p.title)}</div>
                      <div class="prompt-preview">${escHtml(p.content)}</div>`;
    item.addEventListener('click', () => {
      closeAllPanels();
      addHistory({ type: 'text', text: p.content });
      requestPaste('text', p.content);
    });
    promptsList.appendChild(item);
  });
}

/* ═══════════════════════════════════════
   PASTE OVERLAY (over iframe)
═══════════════════════════════════════ */
function showPasteOverlay(title) {
  pasteTitle.textContent = title;
  pasteOverlay.classList.remove('hidden');
  pasteOverlay.classList.add('visible');
  pasteBar.style.transition = 'none';
  pasteBar.style.width = '100%';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    pasteBar.style.transition = 'width 5s linear';
    pasteBar.style.width = '0%';
  }));
  clearTimeout(pasteTimer);
  pasteTimer = setTimeout(hidePasteOverlay, 5000);
}
function hidePasteOverlay() {
  pasteOverlay.classList.remove('visible');
  setTimeout(() => pasteOverlay.classList.add('hidden'), 250);
}
pasteOverlay.addEventListener('click', hidePasteOverlay);

/* ═══════════════════════════════════════
   IMAGE UTILS
═══════════════════════════════════════ */
function getImageDimensions(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = dataUrl;
  });
}
function resizeImage(dataUrl, w, h) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}
function cropImage(dataUrl, region) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const dpr = region.dpr || 1;
      const c = document.createElement('canvas');
      c.width = region.w * dpr; c.height = region.h * dpr;
      c.getContext('2d').drawImage(img, region.x * dpr, region.y * dpr, region.w * dpr, region.h * dpr, 0, 0, c.width, c.height);
      resolve({ dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height });
    };
    img.src = dataUrl;
  });
}
async function writeImageToClipboard(dataUrl) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch { return false; }
}

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
function showCapturing(show) { ssCapturing.classList.toggle('hidden', !show); }
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toast(msg, type = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => { toastEl.className = 'toast'; }, 3200);
}

boot();
