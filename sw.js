// IA Trader - Service Worker PWA
const CACHE = 'ia-trader-v1';
const OFFLINE_URLS = ['/mobile', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(OFFLINE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Sempre busca rede para API e WebSocket
  if (e.request.url.includes('/api/') || e.request.url.startsWith('ws')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Atualiza cache com versão mais recente
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
