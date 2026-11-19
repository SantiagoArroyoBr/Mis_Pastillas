// Solo recursos estáticos versionados. Nunca interceptar Auth, API ni JSON privados.
const PREFIX = 'acompana-connected-';
const VERSION = '__ACOMPANA_BUILD__';
const ASSETS = /*__ACOMPANA_ASSETS__*/ [];
const paths = new Set(ASSETS.map(path=>new URL(path,self.location.origin).pathname));
self.addEventListener('install',event=>event.waitUntil(caches.open(PREFIX+VERSION).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for (const name of await caches.keys()) if(name.startsWith(PREFIX)&&name!==PREFIX+VERSION) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{
  if(event.data?.type==='APPLY_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!paths.has(url.pathname)) return;
  event.respondWith((async()=>{
    const cache=await caches.open(PREFIX+VERSION);
    return await cache.match(url.pathname)||fetch(event.request);
  })());
});
