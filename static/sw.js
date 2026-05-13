const CACHE = 'st-v1';

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(['/']); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;

  var url = new URL(e.request.url);

  // CDN resources — cache first, network fallback
  if (url.origin !== location.origin) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(res) {
          caches.open(CACHE).then(function(c) { c.put(e.request, res.clone()); });
          return res;
        });
      })
    );
    return;
  }

  // Same-origin assets — network first, cache fallback
  e.respondWith(
    fetch(e.request).then(function(res) {
      caches.open(CACHE).then(function(c) { c.put(e.request, res.clone()); });
      return res;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
