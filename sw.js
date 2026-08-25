/* Service worker for Sophia's Recipes.
 *
 * Strategy per resource type:
 *   app shell (html/css/js/icons)  cache-first, refreshed on new CACHE_VERSION
 *   recipe data (data/**.json)     stale-while-revalidate — instant, updates in background
 *   images                         cache-first, stored in a capped runtime cache
 *   fonts (cross-origin)           cache-first, opaque responses tolerated
 *
 * Bump CACHE_VERSION whenever the shell changes so clients pick up new builds.
 */

const CACHE_VERSION = 'v2';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;
const FONT_CACHE = `fonts-${CACHE_VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, DATA_CACHE, IMAGE_CACHE, FONT_CACHE];

const MAX_IMAGES = 80;

const SHELL_ASSETS = [
  './',
  'index.html',
  'recipe.html',
  'styles.css',
  'app.js',
  'recipe.js',
  'manifest.webmanifest',
  'favicon.svg',
  'favicon-32.png',
  'favicon-16.png',
  'apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Add individually: one 404 in addAll() would abort the whole install.
    await Promise.all(SHELL_ASSETS.map(async asset => {
      try { await cache.add(new Request(asset, { cache: 'reload' })); }
      catch (err) { console.warn('[sw] could not precache', asset, err); }
    }));
    // Warm the index and every recipe, so the whole notebook works offline from
    // first visit. All recipes together are about 286 KB, small enough to precache.
    try {
      const data = await caches.open(DATA_CACHE);
      const indexRequest = new Request('data/recipes/_index.json', { cache: 'reload' });
      await data.add(indexRequest);
      const index = await (await data.match(indexRequest)).json();
      await Promise.all(index.map(async recipe => {
        try { await data.add(new Request(`data/recipes/${recipe.slug}.json`, { cache: 'reload' })); }
        catch (err) { console.warn('[sw] could not precache recipe', recipe.slug, err); }
      }));
    } catch (err) { console.warn('[sw] could not precache recipe index', err); }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(name => CURRENT_CACHES.includes(name) ? null : caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map(key => cache.delete(key)));
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // Opaque responses (cross-origin fonts) have status 0 but are still cacheable.
  if (response && (response.ok || response.type === 'opaque')) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return hit || network.then(r => r || Response.error());
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Google Fonts stylesheet + font files.
  if (!sameOrigin) {
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
      event.respondWith(cacheFirst(request, FONT_CACHE).catch(() => caches.match(request)));
    }
    return;
  }

  // Recipe JSON — serve cached instantly, refresh behind the scenes.
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  // Photos — cache on first view, cap the cache so it can't grow forever.
  if (url.pathname.includes('/images/')) {
    event.respondWith(
      cacheFirst(request, IMAGE_CACHE)
        .then(response => { event.waitUntil(trimCache(IMAGE_CACHE, MAX_IMAGES)); return response; })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Navigations — network first so a fresh build wins, falling back to the shell offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put(request, response.clone());
        return response;
      } catch {
        // ignoreSearch so recipe.html?r=<slug> matches the cached recipe.html.
        return (await caches.match(request, { ignoreSearch: true }))
          || (await caches.match('index.html'))
          || Response.error();
      }
    })());
    return;
  }

  // Everything else in the shell.
  event.respondWith(cacheFirst(request, SHELL_CACHE).catch(() => caches.match(request)));
});
