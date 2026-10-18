// Service worker de OpenCode Cloud.
// - Guarda el "shell" de la app para que abra al instante y funcione sin conexión (verás la interfaz y el aviso de que no hay red).
// - Estrategia network-first: siempre intenta la red, así una actualización desde GitHub se ve en la siguiente carga.
// - NUNCA toca /api: las respuestas autenticadas (proyectos, mensajes, eventos SSE) no se guardan en caché.
const CACHE = 'occ-shell-v1';
const SHELL = [
  '/',
  '/app.css',
  '/app.js',
  '/md.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // sin caché, sin interceptar

  const isNav = req.mode === 'navigate';
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(isNav ? '/' : req, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(isNav ? '/' : req, { ignoreSearch: true });
        return cached || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }),
  );
});
