/* FARPOP - service worker: deixa o app abrir offline (PWA no PC/tablet/celular). */
const CACHE = 'farpop-v3';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'sync.bundle.js', 'vendor/fontawesome/css/all.min.css'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const put = (req, res) => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); return res; };

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fontes/ícones de CDN: cache primeiro. Todo o resto de outros domínios (Firebase etc.) passa direto.
  if (url.origin !== location.origin) {
    if (/(^|\.)fonts\.(googleapis|gstatic)\.com$|^cdnjs\.cloudflare\.com$/.test(url.host)) {
      e.respondWith(
        caches.match(req).then(hit => hit || fetch(req).then(r => put(req, r)).catch(() => hit))
      );
    }
    return;
  }

  // Arquivos do próprio app: rede primeiro (sempre a versão nova), cache como reserva offline.
  e.respondWith(
    fetch(req).then(r => put(req, r)).catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
  );
});
