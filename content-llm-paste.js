'use strict';
/*
 * Injected into every frame (manifest content_scripts, all_frames:true).
 * Receives postMessage from panel.js, pastes image/text into the LLM input,
 * then reports success/failure back so the panel can show a helpful hint.
 */

window.addEventListener('message', async (event) => {
  if (!event.data || event.data.source !== 'genaibar-ext') return;

  const { type, dataUrl, text, msgId } = event.data;
  let result = { success: false, error: '', hint: '' };

  try {
    if (type === 'PASTE_IMAGE' && dataUrl) {
      result = await pasteImage(dataUrl);
    } else if (type === 'PASTE_TEXT' && text) {
      result = pasteText(text);
    }
  } catch (err) {
    result = {
      success: false,
      error: err.message,
      hint: 'Unexpected error. Click the chat input and press Ctrl+V to paste manually.'
    };
  }

  // Report result back to panel (event.source = panel's contentWindow)
  try {
    event.source?.postMessage({ source: 'genaibar-paste-result', msgId, ...result }, '*');
  } catch { /* cross-origin guard */ }
});

/* ── LLM-specific selectors ─────────────────────────── */
function findChatInput() {
  const hostname = location.hostname;

  // Site-specific priority selectors
  const siteSelectors = {
    'chat.openai.com':          ['#prompt-textarea'],
    'chatgpt.com':              ['#prompt-textarea'],
    'claude.ai':                [
      '[data-lexical-editor][contenteditable="true"]',
      '.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][data-gramm]',
    ],
    'gemini.google.com':        ['.ql-editor[contenteditable="true"]', 'div[contenteditable="true"]'],
    'www.perplexity.ai':        ['textarea[placeholder]', 'textarea'],
    'grok.x.com':               ['textarea'],
    'chat.mistral.ai':          ['textarea', 'div[contenteditable="true"]'],
    'copilot.microsoft.com':    ['div[contenteditable="true"]', 'textarea'],
    'www.meta.ai':              ['div[contenteditable="true"]', 'textarea'],
  };

  // Try site-specific selectors first
  for (const [host, selectors] of Object.entries(siteSelectors)) {
    if (hostname.includes(host)) {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) return { el, site: host };
      }
    }
  }

  // Generic fallback chain
  const GENERIC = [
    'div[contenteditable="true"]',
    'textarea',
    'input[type="text"]',
  ];
  for (const sel of GENERIC) {
    const els = Array.from(document.querySelectorAll(sel));
    const visible = els.filter(isVisible);
    if (visible.length > 0) return { el: visible[0], site: 'generic' };
  }
  return null;
}

function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
}

/* Generate a unique filename per screenshot to avoid Gemini/AI de-duplication.
   Include site and high-res timestamp for absolute uniqueness. */
function uniqueName() {
  const site = location.hostname.replace('www.', '').split('.')[0] || 'ai';
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 9);
  return `genaibar-${site}-${ts}-${rand}.png`;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Image Paste ────────────────────────────────────── */
async function pasteImage(dataUrl) {
  // PDF viewer — content scripts cannot interact with Chrome's PDF renderer
  if (document.contentType === 'application/pdf') {
    return {
      success: false,
      error: 'pdf_viewer',
      hint: 'PDF viewer detected. Click the chat input and press Ctrl+V to paste manually.'
    };
  }

  const found = findChatInput();
  if (!found) {
    return {
      success: false,
      error: 'no_input',
      hint: 'Chat input not found. Please click the LLM\'s text box and press Ctrl+V.'
    };
  }

  const { el, site } = found;
  el.focus();
  await delay(150); // Allow focus to settle

  try {
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    const fileName = uniqueName();
    const file = new File([blob], fileName, { type: 'image/png' });

    const dt = new DataTransfer();
    dt.items.add(file);

    // Strategy 1: The "Hidden File Input" (Most reliable across all platforms)
    // Most LLMs have a hidden <input type="file"> for the paperclip icon.
    // If we find it and set its 'files', the site's own code handles the upload.
    const fileInput = document.querySelector('input[type="file"][accept*="image"]') || 
                      document.querySelector('input[type="file"]');
    if (fileInput) {
      try {
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        await delay(300);
        return { success: true };
      } catch (e) { console.warn('File input strategy failed, falling back to paste.'); }
    }

    // Strategy 2: Claude-specific Lexical/Drop
    if (site.includes('claude.ai')) {
      const dropped = await tryClaude(el, dt, blob, fileName);
      if (dropped) return { success: true };
    }

    // Strategy 3: Standard paste event
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(pasteEvent);
    
    // Fallback for Gemini: sometimes it needs a small delay and a second attempt or a different target
    if (site.includes('gemini.google.com')) {
      await delay(100);
      const editor = document.querySelector('.ql-editor');
      if (editor) editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    }

    await delay(300);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      hint: 'Auto-paste failed. The image is on your clipboard — just click the input and press Ctrl+V.'
    };
  }
}

/* Claude-specific: try multiple strategies for Lexical/ProseMirror */
async function tryClaude(el, dt, blob, fileName) {
  const lexRoot = document.querySelector('[data-lexical-editor="true"]') || el;
  
  // Strategy: File Drop simulation (highly effective for Claude)
  try {
    const dropDt = new DataTransfer();
    dropDt.items.add(new File([blob], fileName, { type: 'image/png' }));
    
    const events = ['dragenter', 'dragover', 'drop'];
    for (const type of events) {
      const ev = new DragEvent(type, {
        dataTransfer: dropDt,
        bubbles: true,
        cancelable: true
      });
      lexRoot.dispatchEvent(ev);
      await delay(20);
    }
    
    // Also try standard paste as backup
    lexRoot.focus();
    lexRoot.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dt, bubbles: true, cancelable: true
    }));
    
    return true;
  } catch (e) { 
    console.error('Claude drop error:', e);
    return false; 
  }
}

/* ── Text Paste ─────────────────────────────────────── */
function pasteText(text) {
  const found = findChatInput();
  if (!found) {
    return {
      success: false,
      error: 'no_input',
      hint: 'Chat input not found. Try clicking the input box and typing/pasting manually.'
    };
  }

  const { el } = found;
  el.focus();

  try {
    // Lexical / ProseMirror / generic contenteditable
    if (el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true') {
      // Move cursor to end
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      // execCommand works in all contenteditable environments
      if (document.execCommand('insertText', false, text)) {
        return { success: true };
      }
      // Fallback for strict environments
      el.textContent = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return { success: true };
    }

    // textarea / input (React native value setter ensures state update)
    const nativeSetter =
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set ||
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      hint: 'Could not paste text automatically. Copy it from history and paste with Ctrl+V.'
    };
  }
}
