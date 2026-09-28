const CACHE = 'tomoshibi-v6';
const ASSETS = [
  './', './index.html', './index.html?build=6', './style.css?v=6', './app.js?v=6', './adventure.js?v=6',
  './rules.js?v=6', './content.js?v=6', './manifest.webmanifest?v=6', './icon.svg', './icon-180.png', './credits.html',
  './scene-village.svg', './scene-archive.svg', './scene-road.svg', './scene-grove.svg', './scene-gate.svg', './scene-vault.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html'))));
});
