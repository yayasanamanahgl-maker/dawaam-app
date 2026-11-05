/* DAWAAM 2F — offline-first shell. Simpan data pribadi hanya pada IndexedDB di perangkat. */
const CACHE_NAME = 'dawaam-pwa-shell-v2f-1';
const FILES = ['./','./index.html','./manifest.json','./icon-192.jpg','./icon-512.jpg'];
const INDEX_URL = new URL('./index.html',self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate',event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('dawaam-pwa-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch',event => {
  const request=event.request;
  if (request.method !== 'GET') return;
  const url=new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;

  if (request.mode === 'navigate') {
    // Online: ambil kode terbaru; offline: gunakan tampilan yang tersimpan.
    event.respondWith(
      fetch(request).then(async response => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(INDEX_URL,response.clone());
        }
        return response;
      }).catch(async () => {
        return (await caches.match(INDEX_URL)) ||
          new Response('DAWAAM belum tersedia offline. Buka sekali saat tersambung internet.',
            {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
      })
    );
    return;
  }

  // Static assets: cache-first, fetched and cached if missing.
  event.respondWith(
    caches.match(request).then(cached => cached ||
      fetch(request).then(async response => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request,response.clone());
        }
        return response;
      })
    )
  );
});