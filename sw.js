const APP_CACHE_PREFIX = 'acompanha-';
const CACHE_NAME = APP_CACHE_PREFIX + 'v9';
const LEGACY_APP_CACHES = new Set(['cuidados-v8']);
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './compatibility.js',
  './domain.js',
  './sharing.js',
  './payments.js',
  './inventory.js',
  './care-ui.js',
  './forms.js',
  './appointments.js',
  './styles.css',
  './fonts/Nunito[wght].ttf',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];
const ASSET_URLS = new Set(ASSETS.map((asset) => new URL(asset, self.location.href).href));

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME &&
        (k.startsWith(APP_CACHE_PREFIX) || LEGACY_APP_CACHES.has(k))).map((k) => caches.delete(k)))),
      caches.open(CACHE_NAME).then((cache) => cache.keys().then((requests) => Promise.all(
        requests.filter((request) => !ASSET_URLS.has(request.url)).map((request) => cache.delete(request))
      )))
    ])
      .then(() => self.clients.claim())
  );
});

// Primero la red (para recibir cambios), y si no hay internet, el caché
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!ASSET_URLS.has(e.request.url)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put(e.request, res.clone()))
            .then(() => res);
        }
        return res;
      })
      .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(e.request)))
  );
});
