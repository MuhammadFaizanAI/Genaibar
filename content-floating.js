'use strict';
/*
 * Injects a draggable floating "V" button on every webpage.
 * Clicking it opens the Genaibar side panel.
 * Users can disable it from the extension's Settings page.
 */

(function () {
  const BTN_ID = 'Genaibar-hub-fab';
  if (document.getElementById(BTN_ID)) return;

  // Check if enabled (default: true)
  chrome.storage.sync.get(['floatingBtnEnabled'], ({ floatingBtnEnabled }) => {
    if (floatingBtnEnabled === false) return;
    mount();
  });

  // Respond to settings changes without reload
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.floatingBtnEnabled) {
      if (changes.floatingBtnEnabled.newValue === false) {
        document.getElementById(BTN_ID)?.remove();
      } else {
        if (!document.getElementById(BTN_ID)) mount();
      }
    }
  });

  function mount() {
    const btn = document.createElement('div');
    btn.id = BTN_ID;

    const STYLE = `
      position: fixed !important;
      bottom: 22px !important;
      right: 22px !important;
      width: 46px !important;
      height: 46px !important;
      border-radius: 50% !important;
      background: linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%) !important;
      cursor: pointer !important;
      z-index: 2147483647 !important;
      box-shadow: 0 4px 18px rgba(124,58,237,0.55) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      user-select: none !important;
      opacity: 0.75 !important;
      transition: opacity 0.2s, transform 0.2s, box-shadow 0.2s !important;
      font-family: -apple-system,system-ui,sans-serif !important;
      font-size: 18px !important;
      font-weight: 800 !important;
      color: white !important;
      letter-spacing: -0.5px !important;
    `;
    btn.setAttribute('style', STYLE);
    btn.textContent = 'V';
    btn.title = 'Open Genaibar';

    // Hover
    btn.addEventListener('mouseenter', () => {
      btn.style.setProperty('opacity', '1', 'important');
      btn.style.setProperty('transform', 'scale(1.12)', 'important');
      btn.style.setProperty('box-shadow', '0 6px 28px rgba(124,58,237,0.75)', 'important');
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.setProperty('opacity', '0.75', 'important');
      btn.style.setProperty('transform', 'scale(1)', 'important');
      btn.style.setProperty('box-shadow', '0 4px 18px rgba(124,58,237,0.55)', 'important');
    });

    // Drag
    let dragging = false, ox, oy, startRight, startBottom;
    btn.addEventListener('mousedown', (e) => {
      dragging = false;
      ox = e.clientX; oy = e.clientY;
      startRight  = parseInt(btn.style.getPropertyValue('right'))  || 22;
      startBottom = parseInt(btn.style.getPropertyValue('bottom')) || 22;

      const move = (e) => {
        const dx = e.clientX - ox, dy = e.clientY - oy;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragging = true;
        if (!dragging) return;
        const nr = Math.max(6, startRight  - dx);
        const nb = Math.max(6, startBottom - dy);
        btn.style.setProperty('right',  nr + 'px', 'important');
        btn.style.setProperty('bottom', nb + 'px', 'important');
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });

    btn.addEventListener('click', () => {
      if (dragging) return;
      chrome.runtime.sendMessage({ type: 'OPEN_PANEL_FLOAT' });
    });

    document.body.appendChild(btn);
  }
})();
