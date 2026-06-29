// Service worker — installable PWA + offline app shell.
// App-shell pages are cached; API + media always go to the network (fresh data).
const CACHE = 'coaching-os-v1';
const SHELL = ['/', '/upload', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;                 // never cache POSTs (enroll, marks, uploads)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/reportcards/')) return; // always live
  // network-first for navigations, fall back to cached shell when offline
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
  );
});
