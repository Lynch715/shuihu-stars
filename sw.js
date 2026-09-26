/* 水浒群星录 · service worker
   代码（html/js/manifest）网络优先：联网打开永远是新版，断网才用缓存。
   图片缓存优先 + 后台更新：秒开、省流量。
   改版时把 VER 往上加一，旧缓存会被清掉。 */
const VER = 'qxl-v10.6.1-2';
const SHELL = ['./', './index.html', './site.webmanifest', './favicon.ico',
               './icon/icon-192.png', './icon/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') return self.skipWaiting();
  if (e.data && e.data.precache) e.waitUntil(precache(e.data.precache));
});

/* 后台补图：四路并发，已有的跳过，失败的下次再说 */
async function precache(urls) {
  const c = await caches.open(VER);
  const todo = [];
  for (const u of urls) if (!(await c.match(u))) todo.push(u);
  const worker = async () => {
    while (todo.length) {
      const u = todo.shift();
      try { const r = await fetch(u); if (r.ok) await c.put(u, r); } catch (e) {}
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

const isImg = u => /\.(webp|png|jpg|jpeg|ico|svg)$/i.test(u.pathname);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return;

  /* 图片地址都带 ?v=内容哈希，换了图地址就变，缓存里有就一定是对的，不用再去网上核对。
     原来命中缓存也要后台再拉一遍：每次重画页面，满屏立绘各发一个请求，网差时全堵在路上。 */
  if (isImg(u)) {
    e.respondWith(caches.open(VER).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      return fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; });
    }));
    return;
  }
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(VER).then(c => c.put(req, cp)); }
    return r;
  }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)));
});
