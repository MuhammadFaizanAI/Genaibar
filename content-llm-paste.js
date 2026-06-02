'use strict';
/*
 * Injected (via manifest content_scripts + all_frames:true) into every frame,
 * including the LLM iframes inside the side-panel.
 * Receives postMessage from panel.js and pastes image or text into the chat input.
 */

window.addEventListener('message', async (event) => {
  if (!event.data || event.data.source !== 'Genaibar-hub-ext') return;

  const { type, dataUrl, text } = event.data;

  if (type === 'PASTE_IMAGE' && dataUrl) {
    await pasteImage(dataUrl);
  } else if (type === 'PASTE_TEXT' && text) {
    pasteText(text);
  }
});

/* ── Find the chat input box ── */
function findChatInput() {
  const SELECTORS = [
    // ChatGPT
    '#prompt-textarea',
    // Claude / Gemini / Meta AI / Grok — contenteditable
    'div[contenteditable="true"]',
    // Perplexity, Mistral, others
    'textarea',
    'input[type="text"]',
  ];
  for (const sel of SELECTORS) {
    const el = document.querySelector(sel);
    if (el && isVisible(el)) return el;
  }
  return null;
}

function isVisible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/* ── Paste image ── */
async function pasteImage(dataUrl) {
  const el = findChatInput();
  if (!el) {
    // fallback — no identifiable input, nothing to do
    console.warn('[Genaibar Hub] No chat input found for image paste.');
    return;
  }

  el.focus();

  try {
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    const file = new File([blob], 'screenshot.png', { type: 'image/png' });

    // Build a DataTransfer carrying the image file
    const dt = new DataTransfer();
    dt.items.add(file);

    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(pasteEvent);
  } catch (err) {
    console.warn('[Genaibar] Image paste failed:', err);
  }
}

/* ── Paste text ── */
function pasteText(text) {
  const el = findChatInput();
  if (!el) {
    console.warn('[Genaibar] No chat input found for text paste.');
    return;
  }

  el.focus();

  // contenteditable approach (Claude, Gemini, etc.)
  if (el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true') {
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    return;
  }

  // textarea / input approach — use React's native setter so React state updates
  const nativeSetter =
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set ||
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  if (nativeSetter) {
    nativeSetter.call(el, text);
  } else {
    el.value = text;
  }

  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
