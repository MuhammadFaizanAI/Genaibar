(function () {
  if (document.getElementById('__llmhub_overlay')) return;

  const dpr = window.devicePixelRatio || 1;

  const overlay = document.createElement('div');
  overlay.id = '__llmhub_overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:2147483647;cursor:crosshair;
    background:rgba(0,0,0,0.35);user-select:none;
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    position:absolute;border:2px solid #a78bfa;
    background:rgba(167,139,250,0.08);display:none;pointer-events:none;
    box-shadow:0 0 0 9999px rgba(0,0,0,0.35);
  `;

  const dims = document.createElement('div');
  dims.style.cssText = `
    position:absolute;background:#7c3aed;color:#fff;
    font:600 11px/1 monospace;padding:3px 7px;border-radius:4px;
    pointer-events:none;white-space:nowrap;
  `;

  const hint = document.createElement('div');
  hint.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(18,18,28,0.92);color:#f0f0f5;
    font:500 13px/1.5 -apple-system,sans-serif;
    padding:10px 18px;border-radius:10px;border:1px solid #2a2a3e;
    pointer-events:none;text-align:center;
  `;
  hint.textContent = 'Drag to select a region  •  ESC to cancel';

  overlay.appendChild(box);
  overlay.appendChild(dims);
  overlay.appendChild(hint);
  document.documentElement.appendChild(overlay);

  let sx = 0, sy = 0, dragging = false;

  overlay.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    hint.style.display = 'none';
    box.style.display = 'block';
    updateBox(e.clientX, e.clientY);
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    updateBox(e.clientX, e.clientY);
  });

  overlay.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;
    const x = Math.round(Math.min(e.clientX, sx));
    const y = Math.round(Math.min(e.clientY, sy));
    const w = Math.round(Math.abs(e.clientX - sx));
    const h = Math.round(Math.abs(e.clientY - sy));
    cleanup();
    if (w > 8 && h > 8) {
      chrome.runtime.sendMessage({ type: 'REGION_SELECTED', region: { x, y, w, h, dpr } });
    }
  });

  document.addEventListener('keydown', onKey, true);

  function onKey(e) {
    if (e.key === 'Escape') { cleanup(); }
  }

  function cleanup() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  }

  function updateBox(cx, cy) {
    const x = Math.min(cx, sx), y = Math.min(cy, sy);
    const w = Math.abs(cx - sx), h = Math.abs(cy - sy);
    box.style.left = x + 'px';
    box.style.top = y + 'px';
    box.style.width = w + 'px';
    box.style.height = h + 'px';
    dims.textContent = `${w} x ${h}`;
    dims.style.left = x + 'px';
    dims.style.top = Math.max(0, y - 22) + 'px';
  }
})();
