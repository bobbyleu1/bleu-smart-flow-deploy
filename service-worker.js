const CACHE_NAME = 'bleu-smartflow-v1';
const urlsToCache = [
  '/bleu-smart-flow-deploy/',
  '/bleu-smart-flow-deploy/index.html',
  '/bleu-smart-flow-deploy/manifest.json',
  '/bleu-smart-flow-deploy/assets/index-lDloF4IK.js',
  '/bleu-smart-flow-deploy/assets/index-IGc9O9rH.css',
  // add other assets if needed
];

// Install event - cache resources
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        return response || fetch(event.request);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
