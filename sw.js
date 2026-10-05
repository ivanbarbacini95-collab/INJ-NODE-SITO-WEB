const CACHE_NAME = 'inj-node-v16.00.8-shell';
const APP_SHELL = [
  './',
  './index.html',
  './viewport.css?v=16.00.8',
  './viewport.js?v=16.00.8',
  './style.css?v=16.00.8',
  './app.js?v=16.00.8',
  './live-charts.html',
  './live-charts.css?v=16.00.8',
  './live-charts.js',
  './order-book.html',
  './order-book.css?v=16.00.8',
  './order-book.js',
  './command-center.html',
  './command-center.css?v=16.00.8',
  './command-center.js',
  './treasury.html',
  './treasury.css?v=16.00.8',
  './treasury.js?v=16.00.8'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && key.startsWith('inj-node-')).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const isolatedPath = ['live-charts.html', 'command-center.html', 'order-book.html', 'treasury.html'].find((name) => url.pathname.endsWith('/' + name));
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(isolatedPath ? request : './index.html', copy));
          }
          return response;
        })
        .catch(() => isolatedPath ? caches.match(request).then((hit) => hit || caches.match('./' + isolatedPath)) : caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
