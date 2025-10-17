/*
  Davis BrickShot Challenge - Service Worker

  Caching strategy:
  - Network-first for navigations (HTML documents)
  - Cache-first with background update for static assets
  - Versioned via CACHE_NAME; old caches are purged on activate
*/

const CACHE_NAME = 'brickshot-cache-v1.0.0';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/service-worker.js',
  '/icon.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key !== CACHE_NAME && key.startsWith('brickshot-cache-')) {
        return caches.delete(key);
      }
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Network-first for navigations
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('/', networkResponse.clone());
        cache.put('/index.html', networkResponse.clone());
        return networkResponse;
      } catch (err) {
        // Offline fallback
        const cached = await caches.match('/index.html');
        return cached || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  // Cache-first (stale-while-revalidate) for other requests
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const fetchPromise = fetch(request)
      .then(async (networkResponse) => {
        try {
          const cache = await caches.open(CACHE_NAME);
          if (request.method === 'GET' && networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
        } catch {}
        return networkResponse;
      })
      .catch(() => undefined);

    // Serve cache immediately if present; update in background
    return cached || fetchPromise || new Response('', { status: 504 });
  })());
});
