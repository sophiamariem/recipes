// Utility (dev-safe banner)
import { Recipe, ApprovedTag, validateRecipeTags, APPROVED_TAGS, normalizeUnits } from './recipe.js';

console.log('Sophia\'s Recipes - dev-safe build');

const qs  = (s: string, el: ParentNode = document) => el.querySelector(s);
const qsa = (s: string, el: ParentNode = document) => [...el.querySelectorAll(s)] as HTMLElement[];
const byId = (id: string) => document.getElementById(id);

// --- helpers (defined early) ---
function escapeHtml(s: string | number | boolean | null | undefined): string {
  return String(s).replace(/[&<>"']/g, m => (
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' } as Record<string, string>)[m] || m
  ));
}
function stripTags(s: string | null | undefined): string {
  return String(s ?? '').replace(/<[^>]*>/g, '');
}
function formatQty(n: number) {
  const s = (Math.round(n*100)/100).toFixed(2).replace(/\.?0+$/,'');
  return s;
}

function showToast(message: string) {
  const host = byId('toastHost');
  if (!host) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 2200);
}

let alarmAudioCtx: AudioContext | null = null;
function playAlarmSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    alarmAudioCtx = alarmAudioCtx || new AudioCtx();
    const ctx = alarmAudioCtx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.0);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.05);
  } catch {}
  if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
}

async function maybeRequestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'default') return;
  const ok = confirm('Allow notifications for timer alerts?');
  if (!ok) return;
  try { await Notification.requestPermission(); } catch {}
}

async function notifyTimerDone(title: string, body: string) {
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        tag: 'recipe-timer',
        renotify: true,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png'
      } as any);
      return true;
    }
  } catch {}
  try {
    new Notification(title, { body });
    return true;
  } catch {}
  return false;
}

function initWakeLockButton() {
  const btn = byId('keepAwakeBtn');
  if (!btn) return;

  let wakeLock: any = null;
  let wantWake = false;

  function updateButton() {
    btn!.setAttribute('aria-pressed', String(wantWake));
  }

  async function requestWakeLock(silent = false) {
    if (!('wakeLock' in navigator)) {
      if (!silent) showToast('Keep awake not supported');
      wantWake = false;
      updateButton();
      return;
    }
    try {
      wakeLock = await (navigator as any).wakeLock.request('screen');
      if (!silent) showToast('Screen will stay awake');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
        if (wantWake && document.visibilityState === 'visible') {
          requestWakeLock(true);
        }
      });
    } catch (err) {
      wakeLock = null;
      wantWake = false;
      updateButton();
      if (!silent) showToast('Could not enable keep awake');
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }
  }

  btn.addEventListener('click', async () => {
    wantWake = !wantWake;
    updateButton();
    if (wantWake) await requestWakeLock();
    else {
      releaseWakeLock();
      showToast('Keep awake off');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wantWake && !wakeLock) {
      requestWakeLock(true);
    } else if (document.visibilityState !== 'visible') {
      wakeLock = null;
    }
  });

  updateButton();
}

function initThemeToggle() {
  const buttons = qsa('[data-theme-toggle]');
  if (buttons.length === 0) return;

  const storageKey = 'sophias.theme';
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const stored = localStorage.getItem(storageKey);
  let theme = stored || (prefersDark ? 'dark' : 'light');

  function apply(next: string) {
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
let INDEX: Recipe[] = [];
let ACTIVE_TAGS = new Set<string>();
const FAV_KEY = 'sophias.favorites.v1';
function getFavs(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch { return new Set(); } }
function saveFavs(set: Set<string>){ localStorage.setItem(FAV_KEY, JSON.stringify([...set])); }
function toggleFav(slug: string){ const f = getFavs(); f.has(slug) ? f.delete(slug) : f.add(slug); saveFavs(f); return f.has(slug); }
function isFav(slug: string){ return getFavs().has(slug); }

// Convert time string (e.g., "12-15 min", "30 min") to minutes
function timeToMinutes(str: string | undefined): number | null {
  if (!str) return null;
  // Only the active time counts — ignore trailing "+ 4 h chill", "+ overnight soak".
  const active = String(str).split('+')[0] as string;
  // Ranges first: "25–30 min", "20 to 30 min" → midpoint.
  const range = active.match(/(\d+)\s*(?:[-–]|\s+to\s+)\s*(\d+)/i);
  if (range && range[1] && range[2]) return Math.round((+range[1] + +range[2]) / 2);
  // Then hours and minutes together: "2 hr 30 min", "1 h", "45 min".
  const hours = active.match(/(\d+)\s*(?:h|hr|hrs|hour|hours)\b/i);
  const mins = active.match(/(\d+)\s*(?:min|mins|minutes)\b/i);
  if (hours || mins) {
    return (hours ? +(hours[1] as string) * 60 : 0) + (mins ? +(mins[1] as string) : 0);
  }
  const single = active.match(/(\d+)/);
  return (single && single[1]) ? +single[1] : null;
}

const UNDER_30_TAG = 'Under 30 min';

function getEffectiveTags(recipe: Recipe | { tags: string[], time?: string }): (ApprovedTag | typeof UNDER_30_TAG)[] {
  let tags = Array.isArray(recipe.tags) ? [...recipe.tags] : [];
  tags = tags.filter(t => (APPROVED_TAGS as readonly string[]).includes(t));
  
  const minutes = timeToMinutes(recipe.time);
  if (minutes !== null && minutes <= 30) {
    if (!tags.includes(UNDER_30_TAG)) tags.unshift(UNDER_30_TAG);
  }
  return tags as (ApprovedTag | typeof UNDER_30_TAG)[];
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
  // Basic validation for index items
  INDEX.forEach((r: any) => validateRecipeTags(r.tags));
  initHome();
}

function initHome(){
  const grid = byId('recipeGrid');
  const filtersEl = byId('filters');
  const searchInput = byId('searchInput') as HTMLInputElement;
  const emptyState = byId('emptyState');
  const recipeCount = byId('recipeCount');
  const tagCount = byId('tagCount');
  if(!grid || !filtersEl) return;

  const allTags = [...new Set(INDEX.flatMap(r => getEffectiveTags(r)))].sort();
  if (recipeCount) recipeCount.textContent = String(INDEX.length);
  if (tagCount) tagCount.textContent = String(allTags.length);
  const otherTags = allTags.filter(tag => tag !== UNDER_30_TAG && tag !== 'High Protein');
  const STARRED_LABEL = '★ Starred';
  const FILTERS = [STARRED_LABEL, UNDER_30_TAG, 'High Protein', ...otherTags];

  let SHOW_ALL_TAGS = false;
  function renderFilters(){
    filtersEl!.innerHTML = '';
    
    const visibleCount = window.innerWidth < 600 ? 5 : 10;
    const itemsToShow = SHOW_ALL_TAGS ? FILTERS : FILTERS.slice(0, visibleCount);

    itemsToShow.forEach(tag => {
      const b = document.createElement('button');
      const isOn = ACTIVE_TAGS.has(tag);
      b.className = 'tag' + (isOn ? ' active' : '');
      b.type = 'button';
      b.textContent = tag;
      b.setAttribute('aria-pressed', isOn ? 'true' : 'false');
      b.onclick = () => {
        if (ACTIVE_TAGS.has(tag)) ACTIVE_TAGS.delete(tag); else ACTIVE_TAGS.add(tag);
        renderList(); renderFilters();
      };
      filtersEl!.appendChild(b);
    });

    if (ACTIVE_TAGS.size > 0) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'tag tag-clear';
      clearBtn.type = 'button';
      clearBtn.textContent = `\u2715 Clear (${ACTIVE_TAGS.size})`;
      clearBtn.title = 'Clear all active filters';
      clearBtn.onclick = () => { ACTIVE_TAGS.clear(); renderList(); renderFilters(); };
      filtersEl!.appendChild(clearBtn);
    }

    if (FILTERS.length > visibleCount) {
      const moreBtn = document.createElement('button');
      moreBtn.className = 'tag tag-more';
      moreBtn.type = 'button';
      moreBtn.textContent = SHOW_ALL_TAGS ? 'Show less \u25B4' : `+${FILTERS.length - visibleCount} more \u25BE`;
      moreBtn.onclick = () => { SHOW_ALL_TAGS = !SHOW_ALL_TAGS; renderFilters(); };
      filtersEl!.appendChild(moreBtn);
    }
  }

  window.addEventListener('resize', () => {
    if (!SHOW_ALL_TAGS) renderFilters();
  });

  function renderList(){
    grid!.innerHTML = '';
    const q = (searchInput?.value || '').trim().toLowerCase();
    const favs = getFavs();

    let items = INDEX
      .filter(r => {
        if (ACTIVE_TAGS.size === 0) return true;
        const tags = getEffectiveTags(r) as string[];
        // AND semantics: every selected filter must match
        return [...ACTIVE_TAGS].every(t => t === STARRED_LABEL ? favs.has(r.slug) : tags.includes(t));
      })
      .filter(r => {
        if (!q) return true;
        const hay = [r.title, r.description, r.style, r.search, ...getEffectiveTags(r)].join(' ').toLowerCase();
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

    if (items.length === 0){ emptyState!.hidden = false; return; }
    emptyState!.hidden = true;

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
            ${(() => {
              const tags = getEffectiveTags(r);
              // Ensure High Protein is always visible if it exists
              let visibleTags = tags.slice(0, 3);
              if (tags.includes('High Protein') && !visibleTags.includes('High Protein')) {
                visibleTags[2] = 'High Protein';
              }
              return visibleTags.map(t => `<span class="${t === 'High Protein' ? 'hp-tag' : ''}">${escapeHtml(t)}</span>`).join('');
            })()}
          </div>
        </div>`;
      (card.querySelector('.star-btn') as HTMLElement).addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const starred = toggleFav(r.slug);
        const btn = ev.currentTarget as HTMLElement;
        btn.dataset.starred = String(starred);
        btn.textContent = starred ? '★' : '☆';
        renderFilters();
      });
      grid!.appendChild(card);
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
  const recipe: Recipe = await res.json();
  validateRecipeTags(recipe.tags);
  renderRecipe(container, recipe);
  injectSchema(recipe);

  const favBtn = byId('favBtn') as HTMLButtonElement;
  function syncFavBtn(){ const starred = isFav(slug!); favBtn.setAttribute('aria-pressed', String(starred)); favBtn.textContent = starred ? '★ Starred' : '☆ Star'; }
  favBtn.addEventListener('click', () => { toggleFav(slug!); syncFavBtn(); });
  syncFavBtn();
}

function renderRecipe(root: HTMLElement, r: Recipe){
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
        <div class="badges">${getEffectiveTags(r).map(t => `<span class="badge">${escapeHtml(t)}</span>`).join('')}</div>
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
    navigator.clipboard.writeText(text).then(() => showToast('Ingredients copied'));
  });

  byId('shareBtn')?.addEventListener('click', async () => {
    const shareData = { title: r.title, text: r.description || r.title, url: location.href };
    if (navigator.share) { try { await navigator.share(shareData); return; } catch {} }
    await navigator.clipboard.writeText(location.href);
    showToast('Link copied');
  });

  const scaleInput = byId('scaleInput') as HTMLInputElement;
  const applyBtn = byId('applyScaleBtn');
  const resetBtn = byId('resetScaleBtn');
  function applyScale(){
    const target = parseFloat(scaleInput.value);
    const base = r.servings;
    if (!base || !target || target <= 0) return;
    qsa('[data-qty]').forEach(el => {
      const baseVal = parseFloat(el.getAttribute('data-qty-base')!);
      if (isNaN(baseVal)) return;
      const scaled = baseVal * (target/base);
      el.textContent = formatQty(scaled);
    });
  }
  function resetScale(){ qsa('[data-qty]').forEach(el => { el.textContent = el.getAttribute('data-qty-display')!; }); if (scaleInput) scaleInput.value = String(r.servings); }
  applyBtn?.addEventListener('click', applyScale);
  resetBtn?.addEventListener('click', resetScale);

  attachTimers();
}

function renderIngredientSections(r: Recipe){
  const sections = r.ingredients?.sections?.length ? r.ingredients.sections : [ { title: null, items: r.ingredients?.items || [] } as any ];
  return sections.map((sec: any) => `
    ${sec.title ? `<h4>${escapeHtml(sec.title)}</h4>` : ''}
    <ul>
      ${sec.items.map((line: any) => `<li>${renderQty(line)}</li>`).join('')}
    </ul>
  `).join('');
}

function parseQty(s: string): number {
  if (s.includes('/')) {
    const [num, den] = s.split('/').map(n => parseFloat(n.trim()));
    if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den;
  }
  if (s.includes('-') || s.includes('–')) {
    const parts = s.split(/[-–]/).map(n => parseFloat(n.trim()));
    const validParts = parts.filter(n => !isNaN(n));
    if (validParts.length > 0) return validParts.reduce((a, b) => a + b, 0) / validParts.length;
  }
  return parseFloat(s);
}

function renderQty(line: any){
  if (typeof line === 'string') return escapeHtml(line);
  const hasNumQty = line.qty && /^\d+(?:[\./\s-–]\d+)?/.test(String(line.qty));
  const qtyPart = hasNumQty
    ? `<strong data-qty data-qty-base="${parseQty(String(line.qty))}" data-qty-display="${escapeHtml(line.qty)}">${escapeHtml(line.qty)}</strong>`
    : (line.qty ? `<strong>${escapeHtml(line.qty)}</strong>` : '');
  const unit = line.unit ? ` ${escapeHtml(line.unit)}` : '';
  const item = line.item ? ` ${escapeHtml(line.item)}` : '';
  const head = `${qtyPart}${unit}${item}`.trim();
  const note = line.note
    ? `<span class="ing-note">${head ? ', ' : ''}${escapeHtml(line.note)}</span>`
    : '';
  return `${head}${note}`;
}

function renderSteps(r: Recipe){
  const steps = r.steps || [];
  return `<ol>${steps.map((s,i) => {
    const dur = parseDuration(s);
    const controls = dur ? timerControlsHTML(dur) : optionalTimerHTML();
    return `<li data-step-index="${i}" data-step-text="${escapeHtml(stripTags(s))}">${s}${controls}</li>`;
  }).join('')}</ol>`;
}

function timerControlsHTML(seconds: number){
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
    let defaultSeconds = parseInt(ctrl.getAttribute('data-default-seconds') || '0', 10) || 0;
    let remaining = defaultSeconds;
    let interval: number | null = null;
    const display = ctrl.querySelector('[data-remaining]');
    const stepText = ctrl.closest('li')?.getAttribute('data-step-text') || 'Timer';

    function render(){ 
      if (!display) return;
      const mm = Math.floor(remaining/60); const ss = remaining%60; 
      display.textContent = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; 
      ctrl.parentElement!.classList.toggle('timer-running', !!interval); 
    }
    function tick(){
      remaining = Math.max(0, remaining-1);
      render();
      if (remaining === 0){
        if (interval) clearInterval(interval);
        interval = null;
        render();
        playAlarmSound();
        notifyTimerDone('Timer done', stepText);
        showToast("Timer done");
      }
    }

    ctrl.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('button'); if (!btn) return; 
      const action = btn.getAttribute('data-action');
      if (action === 'plus'){ remaining += 60; render(); }
      else if (action === 'minus'){ remaining = Math.max(0, remaining-60); render(); }
      else if (action === 'start'){
        maybeRequestNotificationPermission();
        if (remaining === 0) remaining = defaultSeconds || 60;
        if (interval){ 
          clearInterval(interval); 
          interval=null; 
          render(); 
          btn.textContent='⏱ Start'; 
        } else { 
          interval = window.setInterval(tick, 1000); 
          render(); 
          btn.textContent='Pause'; 
        }
      }
      else if (action === 'reset'){ 
        remaining = defaultSeconds; 
        if (interval) clearInterval(interval); 
        interval=null; 
        render(); 
        const s = ctrl.querySelector('[data-action="start"]'); 
        if(s) s.textContent='⏱ Start'; 
      }
      else if (action === 'custom'){ 
        const minsStr = prompt('Minutes?'); 
        if (minsStr) {
          const mins = parseInt(minsStr, 10);
          if (!isNaN(mins) && mins>=0){ 
            remaining = mins*60; 
            defaultSeconds = remaining; 
            render(); 
          } 
        }
      }
    });

    render();
  });
}

function parseDuration(text: string | undefined): number | null {
  if (!text) return null;
  const m = String(text).match(/(\d+)\s*(?:[–\-to]+\s*(\d+)\s*)?(min|mins|minutes|sec|secs|seconds)/i);
  if (!m || !m[1] || !m[3]) return null; 
  let a = parseInt(m[1],10); 
  let b = m[2] ? parseInt(m[2],10) : null; 
  const unit = m[3].toLowerCase(); 
  let base = b ? Math.round((a+b)/2) : a; 
  if (unit.startsWith('sec')) return base; 
  return base*60;
}

function plainIngredientText(r: Recipe){
  const sections = r.ingredients?.sections?.length ? r.ingredients.sections : []; const lines: string[] = [];
  sections.forEach((sec: any) => { if (sec.title) lines.push(sec.title + ':'); sec.items.forEach((it: any) => { if (typeof it === 'string') lines.push('- ' + it); else { const qty = it.qty ? it.qty : ''; const unit = it.unit ? ` ${it.unit}` : ''; const item = it.item ? ` ${it.item}` : ''; const head = `${qty}${unit}${item}`.trim(); const note = it.note ? `${head ? ', ' : ''}${it.note}` : ''; lines.push(`- ${head}${note}`); } }); lines.push(''); });
  return lines.join('\n').trim();
}

function injectSchema(r: Recipe){
  const minutes = timeToMinutes(r.time);
  const schema = { 
    "@context":"https://schema.org", 
    "@type":"Recipe", 
    "name":r.title, 
    "image":[location.origin + '/' + r.image], 
    "description": r.description || r.style || "", 
    "recipeYield": r.servings ? String(r.servings) : undefined, 
    "totalTime": minutes ? `PT${minutes}M` : undefined, 
    "recipeCategory": r.categories || [], 
    "keywords": (r.keywords || []).join(', '), 
    "recipeIngredient": r.ingredients?.sections?.flatMap((s: any) => s.items.map((it: any) => typeof it === 'string' ? it : [it.qty, it.unit, it.item, it.note].filter(Boolean).join(' '))) || [], 
    "recipeInstructions": (r.steps || []).map(s => ({ "@type":"HowToStep", "text": stripTags(s) }))
  };
  const script = document.createElement('script'); 
  script.type='application/ld+json'; 
  script.textContent = JSON.stringify(schema); 
  document.head.appendChild(script);
}

// Start
initWakeLockButton();
initThemeToggle();
loadIndex().then(initRecipePage);
