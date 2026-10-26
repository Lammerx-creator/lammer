/* The production bundle hash is passed by registerPwa(). No development requests are cached. */
const scope = new URL(self.registration.scope);
const appUrl = (path) => new URL(path, scope).href;
const INDEX_URL = appUrl('index.html');
const ASSETS_PATH = new URL('assets/', scope).pathname;
const ICONS_PATH = new URL('icons/', scope).pathname;
// Separate installations on the same origin must never delete one another's caches.
const CACHE_PREFIX = `deutschtrainer-${encodeURIComponent(scope.pathname)}-`;
const build = new URL(self.location.href).searchParams.get('build') || 'v1';
const CACHE_NAME = `${CACHE_PREFIX}${encodeURIComponent(build)}`;
const SHELL = [
  '',
  'index.html',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
].map(appUrl);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch(INDEX_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('Cannot prepare the offline application shell.');
    const html = await response.clone().text();
    const assets = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g))
      .map((match) => new URL(match[1], INDEX_URL))
      .filter((url) => url.origin === scope.origin && url.pathname.startsWith(ASSETS_PATH))
      .map((url) => url.href);
    if (!assets.some((url) => new URL(url).pathname.endsWith('.js'))) {
      throw new Error('Offline installation requires a production build.');
    }
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([...new Set([...SHELL, ...assets])]);
    await cache.put(INDEX_URL, response);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) return response;
      } catch {
        // A complete, previously installed application shell is available offline.
      }
      return (await caches.open(CACHE_NAME)).match(INDEX_URL)
        .then((response) => response || Response.error());
    })());
    return;
  }

  const isAppAsset = url.pathname.startsWith(ASSETS_PATH) ||
    url.pathname.startsWith(ICONS_PATH) || url.href === appUrl('manifest.webmanifest');
  if (!isAppAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  })());
});
