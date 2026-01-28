// Utility (dev-safe banner)
console.log('Sophia\'s Recipes - dev-safe build');

const qs  = (s, el = document) => el.querySelector(s);
const qsa = (s, el = document) => [...el.querySelectorAll(s)];
const byId = id => document.getElementById(id);

// --- helpers (defined early) ---
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]
  ));
}
function formatQty(n) {
  const s = (Math.round(n*100)/100).toFixed(2).replace(/\.?0+$/,'');
  return s;
}

function initThemeToggle() {
  const buttons = qsa('[data-theme-toggle]');
  if (buttons.length === 0) return;

  const storageKey = 'sophias.theme';
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const stored = localStorage.getItem(storageKey);
  let theme = stored || (prefersDark ? 'dark' : 'light');

  function apply(next) {
    theme = next;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(storageKey, theme);
    buttons.forEach(btn => {
      btn.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    });
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => apply(theme === 'dark' ? 'light' : 'dark'));
  });

  apply(theme);
}

// Favorites (localStorage)
let INDEX = [];
let ACTIVE_TAG = null;
const FAV_KEY = 'sophias.favorites.v1';
function getFavs(){ try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch { return new Set(); } }
function saveFavs(set){ localStorage.setItem(FAV_KEY, JSON.stringify([...set])); }
function toggleFav(slug){ const f = getFavs(); f.has(slug) ? f.delete(slug) : f.add(slug); saveFavs(f); return f.has(slug); }
function isFav(slug){ return getFavs().has(slug); }

// Convert time string (e.g., "12-15 min", "30 min") to minutes
function timeToMinutes(str) {
  if (!str) return null;
  const range = str.match(/(\d+)\s*[-–to]+\s*(\d+)/i);
  if (range) return Math.round((+range[1] + +range[2]) / 2);
  const single = str.match(/(\d+)/);
  return single ? +single[1] : null;
}

// PWA registration (production only; disabled on localhost/127.x)
if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Load index then init
async function loadIndex(){
  const r = await fetch('data/recipes/_index.json');
  INDEX = await r.json();
  initHome();
}

function initHome(){
  const grid = byId('recipeGrid');
  const filtersEl = byId('filters');
  const searchInput = byId('searchInput');
  const emptyState = byId('emptyState');
  const recipeCount = byId('recipeCount');
  const tagCount = byId('tagCount');
  if(!grid || !filtersEl) return;

  const allTags = [...new Set(INDEX.flatMap(r => r.tags ?? []))].sort();
  if (recipeCount) recipeCount.textContent = String(INDEX.length);
  if (tagCount) tagCount.textContent = String(allTags.length);
  const FILTERS = ['★ Starred', ...allTags];

  function renderFilters(){
    filtersEl.innerHTML = '';
    FILTERS.forEach(tag => {
      const b = document.createElement('button');
      b.className = 'tag' + (ACTIVE_TAG === tag ? ' active' : '');
      b.type = 'button';
      b.textContent = tag;
      b.setAttribute('aria-pressed', ACTIVE_TAG === tag ? 'true' : 'false');
      b.onclick = () => { ACTIVE_TAG = (ACTIVE_TAG === tag ? null : tag); renderList(); };
      filtersEl.appendChild(b);
    });
  }

  function renderList(){
    grid.innerHTML = '';
    const q = (searchInput?.value || '').trim().toLowerCase();
    const favs = getFavs();

    let items = INDEX
      .filter(r => !ACTIVE_TAG || (ACTIVE_TAG === '★ Starred' ? favs.has(r.slug) : (r.tags || []).includes(ACTIVE_TAG)))
      .filter(r => {
        if (!q) return true;
        const hay = [r.title, r.description, r.style, ...(r.tags || [])].join(' ').toLowerCase();
        return hay.includes(q);
      })
      .sort((a,b) => {
        const fa = favs.has(a.slug) ? 0 : 1;
        const fb = favs.has(b.slug) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const ta = timeToMinutes(a.time) ?? 9999;
        const tb = timeToMinutes(b.time) ?? 9999;
        if (ta < 31 && tb >= 31) return -1;
        if (tb < 31 && ta >= 31) return 1;
        return a.title.localeCompare(b.title);
      });

    if (items.length === 0){ emptyState.hidden = false; return; }
    emptyState.hidden = true;

    items.forEach((r, i) => {
      const card = document.createElement('a');
      card.href = `recipe.html?r=${encodeURIComponent(r.slug)}`;
      card.className = 'card';
      card.style.setProperty('--delay', `${i * 60}ms`);
      card.innerHTML = `
        <div class="card-star"><button class="star-btn" title="Star" aria-label="Star recipe" data-starred="${isFav(r.slug)}">${isFav(r.slug) ? '★' : '☆'}</button></div>
        <img class="card-img" src="${r.image}" alt="${escapeHtml(r.title)}">
        <div class="card-body">
          <h2 class="card-title">${escapeHtml(r.title)}</h2>
          <div class="card-meta">
            ${r.time ? `<span>${r.time}</span>` : ''}
            ${(r.tags || []).slice(0,2).map(t => `<span>${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>`;
      card.querySelector('.star-btn').addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const starred = toggleFav(r.slug);
        const btn = ev.currentTarget;
        btn.dataset.starred = String(starred);
        btn.textContent = starred ? '★' : '☆';
        renderFilters();
      });
      grid.appendChild(card);
    });
  }

  searchInput?.addEventListener('input', renderList);
  renderFilters();
  renderList();
}

async function initRecipePage(){
  const container = byId('recipeContainer');
  if (!container) return;
  const params = new URLSearchParams(location.search);
  const slug = params.get('r');
  if (!slug){ container.innerHTML = '<p class="empty">Recipe not found.</p>'; return; }
  const res = await fetch(`data/recipes/${encodeURIComponent(slug)}.json`);
  if (!res.ok){ container.innerHTML = '<p class="empty">Recipe not found.</p>'; return; }
  const recipe = await res.json();
  renderRecipe(container, recipe);
  injectSchema(recipe);

  const favBtn = byId('favBtn');
  function syncFavBtn(){ const starred = isFav(slug); favBtn.setAttribute('aria-pressed', String(starred)); favBtn.textContent = starred ? '★ Starred' : '☆ Star'; }
  favBtn.addEventListener('click', () => { toggleFav(slug); syncFavBtn(); });
  syncFavBtn();
}

function renderRecipe(root, r){
  root.innerHTML = `
    <article class="recipe">
      <header class="recipe-header">
        <h1>${escapeHtml(r.title)}</h1>
        <img class="recipe-hero" src="${r.image}" alt="${escapeHtml(r.title)}">
        <div class="meta-row">
          ${r.servings ? `<span>Serves: ${r.servings}</span>` : ''}
          ${r.time ? `<span>Time: ${r.time}</span>` : ''}
          ${r.style ? `<span>${escapeHtml(r.style)}</span>` : ''}
        </div>
        <div class="badges">${(r.tags || []).map(t => `<span class="badge">${escapeHtml(t)}</span>`).join('')}</div>
        <div class="actions">
          <button class="btn" id="copyIngredientsBtn">Copy ingredients</button>
          <button class="btn" id="shareBtn">Share</button>
          <button class="btn primary" onclick="window.print()">Print</button>
        </div>
      </header>
      ${r.description ? `<p class="note">${escapeHtml(r.description)}</p>` : ''}
      <div class="grid-2">
        <section class="section ingredients">
          <h3>Ingredients</h3>
          ${renderIngredientSections(r)}
          ${r.servings ? `
            <div class="scale-row">
              <label for="scaleInput">Scale servings:</label>
              <input type="number" min="1" id="scaleInput" value="${r.servings}" style="width:5rem">
              <button class="btn" id="applyScaleBtn">Apply</button>
              <button class="btn" id="resetScaleBtn">Reset</button>
            </div>
          ` : ''}
        </section>
        <section class="section steps">
          <h3>Method</h3>
          ${renderSteps(r)}
          ${r.tips?.length ? `
            <div class="section" style="margin-top:1rem">
              <h3>Notes & Tips</h3>
              <ul>${r.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
            </div>` : ''
          }
        </section>
      </div>
    </article>
  `;

  byId('copyIngredientsBtn')?.addEventListener('click', () => {
    const text = plainIngredientText(r);
    navigator.clipboard.writeText(text).then(() => alert('Ingredients copied!'));
  });

  byId('shareBtn')?.addEventListener('click', async () => {
    const shareData = { title: r.title, text: r.description || r.title, url: location.href };
    if (navigator.share) { try { await navigator.share(shareData); } catch {} }
    else { await navigator.clipboard.writeText(location.href); alert('Link copied!'); }
  });

  const scaleInput = byId('scaleInput');
  const applyBtn = byId('applyScaleBtn');
  const resetBtn = byId('resetScaleBtn');
  function applyScale(){
    const target = parseFloat(scaleInput.value);
    const base = r.servings;
    if (!base || !target || target <= 0) return;
    qsa('[data-qty]').forEach(el => {
      const baseVal = parseFloat(el.getAttribute('data-qty-base'));
      if (isNaN(baseVal)) return;
      const scaled = baseVal * (target/base);
      el.textContent = formatQty(scaled);
    });
  }
  function resetScale(){ qsa('[data-qty]').forEach(el => { el.textContent = el.getAttribute('data-qty-display'); }); if (scaleInput) scaleInput.value = r.servings; }
  applyBtn?.addEventListener('click', applyScale);
  resetBtn?.addEventListener('click', resetScale);

  attachTimers();
}

function renderIngredientSections(r){
  const sections = r.ingredients?.sections?.length ? r.ingredients.sections : [ { title: null, items: r.ingredients?.items || [] } ];
  return sections.map(sec => `
    ${sec.title ? `<h4>${escapeHtml(sec.title)}</h4>` : ''}
    <ul>
      ${sec.items.map(line => `<li>${renderQty(line)}</li>`).join('')}
    </ul>
  `).join('');
}

function renderQty(line){
  if (typeof line === 'string') return escapeHtml(line);
  const hasNumQty = line.qty && /^\d+(?:[\./-]\d+)?/.test(String(line.qty));
  const qtyPart = hasNumQty
    ? `<strong data-qty data-qty-base="${parseFloat(line.qty)}" data-qty-display="${escapeHtml(line.qty)}">${escapeHtml(line.qty)}</strong>`
    : (line.qty ? `<strong>${escapeHtml(line.qty)}</strong>` : '');
  const unit = line.unit ? ` ${escapeHtml(line.unit)}` : '';
  const item = line.item ? ` ${escapeHtml(line.item)}` : '';
  const note = line.note ? ` ${escapeHtml(line.note)}` : '';
  return `${qtyPart}${unit}${item}${note}`.trim();
}

function renderSteps(r){
  const steps = r.steps || [];
  return `<ol>${steps.map((s,i) => {
    const dur = parseDuration(s);
    const controls = dur ? timerControlsHTML(dur) : optionalTimerHTML();
    return `<li data-step-index="${i}">${s}${controls}</li>`;
  }).join('')}</ol>`;
}

function timerControlsHTML(seconds){
  const mm = Math.floor(seconds/60); const ss = seconds%60;
  return `
    <div class="timer-controls" data-default-seconds="${seconds}">
      <button class="btn btn-sm" data-action="minus">−</button>
      <span class="timer-display" data-remaining>${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}</span>
      <button class="btn btn-sm" data-action="plus">+</button>
      <button class="btn" data-action="start">⏱ Start</button>
      <button class="btn" data-action="reset">Reset</button>
    </div>`;
}
function optionalTimerHTML(){
  return `
    <div class="timer-controls" data-default-seconds="0">
      <span class="timer-display" data-remaining>--:--</span>
      <button class="btn" data-action="custom">⏱ Timer…</button>
    </div>`;
}

function attachTimers(){
  qsa('.timer-controls').forEach(ctrl => {
    let defaultSeconds = parseInt(ctrl.getAttribute('data-default-seconds'), 10) || 0;
    let remaining = defaultSeconds;
    let interval = null;
    const display = ctrl.querySelector('[data-remaining]');

    function render(){ const mm = Math.floor(remaining/60); const ss = remaining%60; display.textContent = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; ctrl.parentElement.classList.toggle('timer-running', !!interval); }
    function tick(){ remaining = Math.max(0, remaining-1); render(); if (remaining === 0){ clearInterval(interval); interval=null; render(); try{ new AudioContext(); }catch(e){} alert("⏱ Time's up!"); }}

    ctrl.addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return; const action = btn.getAttribute('data-action');
      if (action === 'plus'){ remaining += 60; render(); }
      else if (action === 'minus'){ remaining = Math.max(0, remaining-60); render(); }
      else if (action === 'start'){
        if (remaining === 0) remaining = defaultSeconds || 60;
        if (interval){ clearInterval(interval); interval=null; render(); btn.textContent='⏱ Start'; }
        else { interval=setInterval(tick, 1000); render(); btn.textContent='Pause'; }
      }
      else if (action === 'reset'){ remaining = defaultSeconds; clearInterval(interval); interval=null; render(); const s=ctrl.querySelector('[data-action="start"]'); if(s) s.textContent='⏱ Start'; }
      else if (action === 'custom'){ const mins = parseInt(prompt('Minutes?'),10); if (!isNaN(mins) && mins>=0){ remaining = mins*60; defaultSeconds = remaining; render(); } }
    });

    render();
  });
}

function parseDuration(text){
  if (!text) return null;
  const m = String(text).match(/(\d+)\s*(?:[–\-to]+\s*(\d+)\s*)?(min|mins|minutes|sec|secs|seconds)/i);
  if (!m) return null; let a = parseInt(m[1],10); let b = m[2] ? parseInt(m[2],10) : null; const unit = m[3].toLowerCase(); let base = b ? Math.round((a+b)/2) : a; if (unit.startsWith('sec')) return base; return base*60;
}

function plainIngredientText(r){
  const sections = r.ingredients?.sections?.length ? r.ingredients.sections : []; const lines = [];
  sections.forEach(sec => { if (sec.title) lines.push(sec.title + ':'); sec.items.forEach(it => { if (typeof it === 'string') lines.push('- ' + it); else { const qty = it.qty ? it.qty : ''; const unit = it.unit ? ` ${it.unit}` : ''; const item = it.item ? ` ${it.item}` : ''; const note = it.note ? ` ${it.note}` : ''; lines.push(`- ${qty}${unit}${item}${note}`); } }); lines.push(''); });
  return lines.join('\n').trim();
}

function injectSchema(r){
  const minutes = timeToMinutes(r.time);
  const schema = { "@context":"https://schema.org", "@type":"Recipe", "name":r.title, "image":[location.origin + '/' + r.image], "description": r.description || r.style || "", "recipeYield": r.servings ? String(r.servings) : undefined, "totalTime": minutes ? `PT${minutes}M` : undefined, "recipeCategory": r.categories || [], "keywords": (r.keywords || []).join(', '), "recipeIngredient": r.ingredients?.sections?.flatMap(s => s.items.map(it => typeof it === 'string' ? it : [it.qty, it.unit, it.item, it.note].filter(Boolean).join(' '))) || [], "recipeInstructions": (r.steps || []).map(s => ({ "@type":"HowToStep", "text": s })) };
  const script = document.createElement('script'); script.type='application/ld+json'; script.textContent = JSON.stringify(schema); document.head.appendChild(script);
}

// Start
initThemeToggle();
loadIndex().then(initRecipePage);
