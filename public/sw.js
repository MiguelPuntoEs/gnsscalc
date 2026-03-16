const CACHE_NAME = 'gnsscalc-v1';
const PRECACHE_URLS = ['/', '/positioning', '/nmea', '/rinex', '/ntrip', '/spectrum', '/antex', '/about'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept dev server or Vite HMR requests
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  // Network-first for navigation, stale-while-revalidate for assets
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() => caches.match(request).then((cached) => {
        if (cached) return cached;
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'text/html' } });
      }))
    );
    return;
  }

  // Cache-first for immutable hashed assets only (_astro/ build output)
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Network-first for everything else (fonts, images, etc.)
  if (request.destination === 'style' || request.destination === 'font' || request.destination === 'image') {
    event.respondWith(
      fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() => caches.match(request).then((cached) => {
        if (cached) return cached;
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      }))
    );
  }
});
