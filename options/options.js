'use strict';

const PRESETS = [
  { id:'chatgpt',    name:'ChatGPT',    url:'https://chat.openai.com',       color:'#10a37f' },
  { id:'claude',     name:'Claude',     url:'https://claude.ai',              color:'#d4a574' },
  { id:'gemini',     name:'Gemini',     url:'https://gemini.google.com',      color:'#4285f4' },
  { id:'perplexity', name:'Perplexity', url:'https://www.perplexity.ai',      color:'#20b2aa' },
  { id:'grok',       name:'Grok',       url:'https://grok.x.com',             color:'#1da1f2' },
  { id:'mistral',    name:'Mistral',    url:'https://chat.mistral.ai',        color:'#ff7000' },
  { id:'copilot',    name:'Copilot',    url:'https://copilot.microsoft.com',  color:'#0078d4' },
  { id:'meta',       name:'Meta AI',    url:'https://www.meta.ai',            color:'#0866ff' },
];

const DEFAULT_LLMS = [
  { id: 'chatgpt',    name: 'ChatGPT',    url: 'https://chat.openai.com',       color: '#10a37f' },
  { id: 'claude',     name: 'Claude',     url: 'https://claude.ai',              color: '#d4a574' },
  { id: 'gemini',     name: 'Gemini',     url: 'https://gemini.google.com',      color: '#4285f4' },
];

const CMD_LABELS = {
  'screenshot-tab':    'Screenshot current tab → paste into LLM',
  'copy-selection':    'Selected text → paste into LLM',
  'region-screenshot': 'Region screenshot → paste into LLM',
};

let llms = [], activeLLMId = null, prompts = [];
const toastEl = document.getElementById('toast');

async function loadAll() {
  try {
    const d = await chrome.storage.sync.get(['llms','activeLLMId','prompts','floatingBtnEnabled']);
    
    // If no LLMs, initialize with defaults
    if (!d.llms || d.llms.length === 0) {
      llms = DEFAULT_LLMS;
      activeLLMId = DEFAULT_LLMS[0].id;
      await saveLLMs();
    } else {
      llms = d.llms;
      activeLLMId = d.activeLLMId || llms[0].id;
    }
    
    prompts = d.prompts || [];
    renderPresets(); 
    renderLLMList(); 
    renderPromptList();
    
    const fbToggle = document.getElementById('floatingBtnToggle');
    if (fbToggle) fbToggle.checked = d.floatingBtnEnabled !== false;
  } catch (err) {
    console.warn('Load failed:', err);
  }
}

async function saveLLMs()    { await chrome.storage.sync.set({ llms, activeLLMId }); }
async function savePrompts() { await chrome.storage.sync.set({ prompts }); }

function getFavUrl(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
  catch { return null; }
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toast(msg, type='') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (type ? ' '+type : '');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => { toastEl.className = 'toast'; }, 2600);
}

/* ── Presets ── */
function renderPresets() {
  const c = document.getElementById('presets');
  if (!c) return;
  const added = new Set(llms.map(l=>l.id));
  c.innerHTML = '';
  PRESETS.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn' + (added.has(p.id) ? ' added' : '');
    const fav = getFavUrl(p.url);
    btn.innerHTML = `${fav ? `<img src="${fav}" alt="" onerror="this.style.display='none'"/>` : ''}<span>${p.name}</span>`;
    if (!added.has(p.id)) {
      btn.addEventListener('click', () => addLLM(p));
    } else {
      btn.title = 'Already in your list';
    }
    c.appendChild(btn);
  });
}

/* ── LLM List ── */
function renderLLMList() {
  const list = document.getElementById('llmList');
  if (!list) return;
  document.getElementById('llmCount').textContent = llms.length;
  if (!llms.length) { 
    list.innerHTML = '<div class="list-empty">No LLMs yet. Use Quick Add or the form above.</div>'; 
    return; 
  }
  list.innerHTML = '';
  llms.forEach((llm, i) => {
    const row = document.createElement('div');
    row.className = 'list-row';
    const dot = document.createElement('div');
    dot.className = 'color-dot'; dot.style.background = llm.color || '#7c3aed';
    const fav = document.createElement('div');
    fav.className = 'row-fav';
    const favUrl = getFavUrl(llm.url);
    if (favUrl) {
      const img = document.createElement('img');
      img.src = favUrl;
      img.onerror = () => { img.remove(); fav.textContent = llm.name.slice(0,1).toUpperCase(); fav.style.background = llm.color||'#7c3aed'; };
      fav.appendChild(img);
    } else { fav.textContent = llm.name.slice(0,1).toUpperCase(); fav.style.background = llm.color||'#7c3aed'; }
    const info = document.createElement('div'); info.className = 'row-info';
    info.innerHTML = `<div class="row-name">${esc(llm.name)}${llm.id===activeLLMId?' <span class="def-star">★</span>':''}</div>
                      <div class="row-url">${esc(llm.url)}</div>`;
    const acts = document.createElement('div'); acts.className = 'row-acts';
    if (i > 0) acts.appendChild(mkBtn('↑', () => moveLLM(i,-1)));
    if (i < llms.length-1) acts.appendChild(mkBtn('↓', () => moveLLM(i,1)));
    acts.appendChild(mkBtn('★', () => setDefault(llm.id), 'star'));
    acts.appendChild(mkBtn('✕', () => removeLLM(llm.id), 'del'));
    row.appendChild(dot); row.appendChild(fav); row.appendChild(info); row.appendChild(acts);
    list.appendChild(row);
  });
}

function mkBtn(label, fn, cls='') {
  const b = document.createElement('button');
  b.className = 'row-btn' + (cls?' '+cls:'');
  b.textContent = label; b.addEventListener('click', fn); return b;
}

async function addLLM(llm) {
  if (llms.find(l=>l.id===llm.id||l.url===llm.url)) { 
    toast('Already added','error'); 
    return; 
  }
  llms.push(llm); 
  if (!activeLLMId) activeLLMId = llm.id;
  await saveLLMs(); 
  renderPresets(); 
  renderLLMList(); 
  toast(`${llm.name} added`,'success');
}

async function removeLLM(id) {
  llms = llms.filter(l=>l.id!==id);
  if (activeLLMId===id) activeLLMId = llms[0]?.id ?? null;
  await saveLLMs(); renderPresets(); renderLLMList(); toast('Removed');
}

async function moveLLM(i, d) {
  const ni = i+d; if (ni<0||ni>=llms.length) return;
  [llms[i],llms[ni]] = [llms[ni],llms[i]];
  await saveLLMs(); renderLLMList();
}

async function setDefault(id) {
  activeLLMId = id; await saveLLMs(); renderLLMList(); toast('Default set','success');
}

document.getElementById('addForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('newName').value.trim();
  let url = document.getElementById('newUrl').value.trim();
  const color = document.getElementById('newColor').value;
  if (!name||!url) return;
  if (!url.startsWith('http')) url = 'https://'+url;
  await addLLM({ id:'custom_'+Date.now(), name, url, color });
  e.target.reset(); document.getElementById('newColor').value = '#7c3aed';
});

/* ── Prompts ── */
function renderPromptList() {
  const list = document.getElementById('promptList');
  if (!list) return;
  document.getElementById('promptCount').textContent = prompts.length;
  if (!prompts.length) { list.innerHTML = '<div class="list-empty">No prompts saved yet. Add one above.</div>'; return; }
  list.innerHTML = '';
  prompts.forEach(p => {
    const row = document.createElement('div');
    row.className = 'list-row';
    const info = document.createElement('div'); info.className = 'row-info';
    info.innerHTML = `<div class="row-name">${esc(p.title)}</div>
                      <div class="row-url">${esc(p.content.slice(0,80))}${p.content.length>80?'…':''}</div>`;
    const acts = document.createElement('div'); acts.className = 'row-acts';
    acts.appendChild(mkBtn('✕', () => deletePrompt(p.id), 'del'));
    row.appendChild(info); row.appendChild(acts);
    list.appendChild(row);
  });
}
async function deletePrompt(id) {
  prompts = prompts.filter(p=>p.id!==id);
  await savePrompts(); renderPromptList(); toast('Prompt deleted');
}
document.getElementById('promptForm').addEventListener('submit', async e => {
  e.preventDefault();
  const title   = document.getElementById('promptTitle').value.trim();
  const content = document.getElementById('promptContent').value.trim();
  if (!title||!content) return;
  prompts.unshift({ id:'p_'+Date.now(), title, content });
  await savePrompts(); renderPromptList();
  e.target.reset(); toast('Prompt saved','success');
});

/* ── Shortcuts ── */
async function checkShortcuts() {
  const statusEl = document.getElementById('shortcutStatus');
  const listEl   = document.getElementById('shortcutList');
  if (!statusEl || !listEl) return;
  statusEl.textContent = 'Checking…'; listEl.innerHTML = '';
  const cmds = await chrome.commands.getAll();
  let bad = false;
  cmds.forEach(cmd => {
    if (cmd.name==='_execute_action') return;
    const label = CMD_LABELS[cmd.name] || cmd.name;
    const row = document.createElement('div'); row.className='sc-row';
    const n = document.createElement('span'); n.className='sc-lbl'; n.textContent=label;
    const k = document.createElement('span'); k.className='sc-key';
    if (cmd.shortcut) {
      k.innerHTML = cmd.shortcut.split('+').map(x=>`<kbd>${x}</kbd>`).join('+');
    } else {
      k.innerHTML = '<span class="sc-warn">Not assigned — possible conflict</span>'; bad=true;
    }
    row.appendChild(n); row.appendChild(k); listEl.appendChild(row);
  });
  if (bad) {
    statusEl.innerHTML = `<span class="sw">⚠ Conflicts Detected.</span> <span>Some shortcuts may not work.</span> <a class="slink" id="fixLink" href="#">Open Settings →</a>`;
    document.getElementById('fixLink').addEventListener('click', e => { e.preventDefault(); chrome.tabs.create({ url:'chrome://extensions/shortcuts' }); });
  } else {
    statusEl.innerHTML = '<span class="sok">✓ All shortcuts active.</span> <span>No conflicts detected in your browser.</span>';
  }
}
document.getElementById('checkShortcutsBtn').addEventListener('click', checkShortcuts);
document.getElementById('scLink').addEventListener('click', e => { e.preventDefault(); chrome.tabs.create({ url:'chrome://extensions/shortcuts' }); });

/* ── Floating button ── */
// Floating button removed

/* ── Nav ── */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s=>s.classList.add('hidden'));
    item.classList.add('active');
    const target = document.getElementById('section-'+item.dataset.section);
    if (target) target.classList.remove('hidden');
    if (item.dataset.section==='shortcuts') checkShortcuts();
  });
});

/* ── Feedback ── */
const fbForm = document.getElementById('feedbackForm');
if (fbForm) {
  fbForm.addEventListener('submit', e => {
    e.preventDefault();
    const subject = document.getElementById('fbSubject').value.trim();
    const message = document.getElementById('fbMessage').value.trim();
    // Contact email - configure this in your local config.js
    const email = 'YOUR_EMAIL@example.com';
    
    const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent('[Genaibar Feedback] ' + subject)}&body=${encodeURIComponent(message)}`;
    window.open(mailtoUrl, '_blank');
    
    toast('Feedback client opened', 'success');
    e.target.reset();
  });
}

loadAll();
