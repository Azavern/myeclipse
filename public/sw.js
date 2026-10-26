// Service worker minimal: hanya aset statis yang di-cache. Halaman aplikasi berisi
// data anggota dan tidak pernah disimpan di cache agar tidak bocor ke pengguna lain
// di perangkat yang sama. Navigasi yang gagal menampilkan halaman offline.
const CACHE = 'eclipse-v0.2.0';
const OFFLINE = '/offline.html';
const PRECACHE = [OFFLINE, '/offline.css', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('eclipse-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () =>
        (await caches.match(OFFLINE)) ??
        new Response('Kamu sedang offline.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/offline.css') {
    event.respondWith(
      caches.match(request).then((hit) => hit ?? fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});
