// Service worker: caches the app shell so Day Trader opens instantly and works
// offline (showing the last cached data). API calls go straight to the network.

const VERSION = 'daytrader-v1';
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/tabs/registry.js',
  './js/core/settings.js',
  './js/core/cache.js',
  './js/core/fetcher.js',
  './js/core/store.js',
  './js/sources/adapters.js',
  './js/sources/index.js',
  './js/sources/markets.js',
  './js/analysis/risk.js',
  './js/analysis/technicals.js',
  './js/ai/claude.js',
  './js/ui/dom.js',
  './js/ui/feed.js',
  './js/ui/markets.js',
  './js/ui/overview.js',
  './js/ui/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Same-origin files: network first (so updates show up), cache as fallback.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html'))),
  );
});
