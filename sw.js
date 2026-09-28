/* 水浒群星录 · service worker
   代码（html/js/manifest）网络优先：联网打开永远是新版，断网才用缓存。
   图片缓存优先 + 后台补齐：秒开、省流量。
   VER 由 build.py 每次构建按版本号和内容哈希改写 —— sw.js 变了浏览器才会装新 worker、
   才会弹「有新版本」，旧的代码缓存才会被清掉。不要手改。
   图片单放一个桶（IMG），不跟着版本清：地址带 ?v=内容哈希，换了图地址就变，
   旧地址在后台补图时顺手删掉，缓存不会越攒越大。 */
const VER = 'qxl-V10.8.5-a4cbf926';
const IMG = 'qxl-img';
const SHELL = ['./', './index.html', './site.webmanifest', './favicon.ico',
               './icon/icon-192.png', './icon/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VER && k !== IMG).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') return self.skipWaiting();
  if (e.data && e.data.precache) e.waitUntil(precache(e.data.precache));
});

const abs = p => new URL(p, self.registration.scope).href;

/* 后台补图：先删掉这一版用不到的旧哈希，再四路并发补缺的，已有的跳过，失败的下次再说 */
async function precache(urls) {
  const c = await caches.open(IMG);
  const want = new Set(urls.map(abs));
  for (const r of await c.keys()) if (r.url.includes('?v=') && !want.has(r.url)) await c.delete(r);
  const todo = [];
  for (const u of want) if (!(await c.match(u))) todo.push(u);
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
    e.respondWith((async () => {
      const hit = await caches.match(req);          // 图片桶、壳子里的图标都找
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) { const cp = r.clone(); caches.open(IMG).then(c => c.put(req, cp)); }
      return r;
    })());
    return;
  }

  const nav = req.mode === 'navigate';
  // 首页不管带什么查询串（微信转发会加 ?from=…）都存成同一条：断网时拿到的是最近一次联网打开的那份
  const home = nav && /\/(index\.html)?$/.test(u.pathname);
  const key = home ? './index.html' : req;
  const cached = () => caches.match(key, { ignoreSearch: nav })
    .then(r => r || (nav ? caches.match('./index.html') : undefined));
  const net = fetch(req).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(VER).then(c => c.put(key, cp)); }
    return r;
  });

  if (!nav) {
    e.respondWith(net.catch(() => cached().then(r => r || Response.error())));
    return;
  }
  /* 弱网：连得上但半天回不来。四秒没回音先拿缓存顶上；
     网络那份回来照样写进缓存，下次打开就是新的。缓存里没有就接着等网络。 */
  e.respondWith(new Promise(resolve => {
    let done = false;
    const give = r => { if (!done && r) { done = true; resolve(r); } };
    const t = setTimeout(() => cached().then(give), 4000);
    net.then(r => { clearTimeout(t); give(r); },
             () => { clearTimeout(t); cached().then(r => give(r || Response.error())); });
  }));
});
