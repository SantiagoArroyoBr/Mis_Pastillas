const APP_CACHE_PREFIX = 'acompanha-';
const CACHE_NAME = APP_CACHE_PREFIX + 'v10';
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
  './fonts/NunitoSans.ttf',
  './icons/house.svg',
  './icons/pill.svg',
  './icons/wallet.svg',
  './fonts/Nunito[wght].ttf',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];
const ASSET_URLS = new Set(ASSETS.map((asset) => new URL(asset, self.location.href).href));

self.addEventListener('install', (e) => {
  const requests = ASSETS.map((asset) => new Request(new URL(asset, self.location.href), { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(requests)));
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

// Cada versión sirve sus propios recursos. La actualización espera a que se
// cierren los clientes de la versión anterior para respetar formularios abiertos.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (e.request.mode === 'navigate') url.search = '';
  if (!ASSET_URLS.has(url.href)) return;
  e.respondWith(
    caches.open(CACHE_NAME)
      .then((cache) => cache.match(url.href))
      .catch(() => undefined)
      .then((cached) => cached || fetch(e.request))
  );
});
