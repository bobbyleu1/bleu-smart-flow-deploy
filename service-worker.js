
const CACHE_NAME = 'bleu-smartflow-v1';
const urlsToCache = [
  '/bleu-smart-flow-deploy/',
  '/bleu-smart-flow-deploy/index.html',
  '/bleu-smart-flow-deploy/manifest.json',
  '/bleu-smart-flow-deploy/assets/index.js',
  '/bleu-smart-flow-deploy/assets/index.css',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => key !== CACHE_NAME && caches.delete(key))
    ))
  );
});
