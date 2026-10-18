const CACHE = 'tenis-live-shell-1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/app.css',
  './js/main.js',
  './js/util.js',
  './js/flags.js',
  './js/levels.js',
  './js/store.js',
  './js/favorites.js',
  './js/providers/espn.js',
  './js/providers/scores365.js',
  './js/providers/apitennis.js',
  './js/providers/merge.js',
  './js/providers/rankings.js',
  './js/providers/load.js',
  './js/predict/markov.js',
  './js/predict/model.js',
  './js/predict/attach.js',
  './js/ui/view.js',
  './js/ui/screens.js',
  './js/ui/detail.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(event.request);
      if (fresh.ok) cache.put(event.request, fresh.clone());
      return fresh;
    } catch {
      const cached = await cache.match(event.request) || (event.request.mode === 'navigate' ? await cache.match('./index.html') : null);
      if (cached) return cached;
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
