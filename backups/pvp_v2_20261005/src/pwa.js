/* ── 装到桌面 · 离线 · 禁缩放 ───────────────────────────────────────────
   Chrome / Edge：beforeinstallprompt，一点就装。
   Safari（iPhone / Mac）：苹果没有安装 API，只能给图文指引。
   Firefox 桌面：没有安装这回事，什么都不弹。
   弹窗时机：进了主界面再等 45 秒，不打断开篇和战斗；点过「以后再说」不再弹。
   主界面底部常驻一个「装到桌面」入口，随时能手动调出来。 */
const Pwa = (() => {
  const KEY = 'qxl_install';
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg|OPR/.test(ua);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let deferred = null, armed = false;

  const state = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const mark = v => { try { localStorage.setItem(KEY, v); } catch (e) {} };

  /** 主界面要不要摆「装到桌面」按钮 */
  const available = () => !standalone && (!!deferred || (isSafari && (isIOS || /Macintosh/.test(ua))));

  function sheet(title, body, btns) {
    $('modal').innerHTML = `<div class="sheet">
      <div class="shead">${title}</div>
      <div class="sbody">${body}</div>
      <div class="btns">${btns}</div>
    </div>`;
    $('modal').classList.add('on');
  }

  function offer() {
    if (!available()) return;
    if (deferred) {
      sheet('装到桌面', '装好之后从桌面图标直接进，没有地址栏，断网也能接着打。',
        '<div class="btn" data-action="pwa-later">以后再说</div>'
        + '<div class="btn main" data-action="pwa-install">装　上</div>');
    } else {
      const how = isIOS
        ? '点屏幕底部的<b>分享</b>按钮（方框带向上箭头）→ 往下找<b>「添加到主屏幕」</b>→ 右上角<b>添加</b>。'
        : '菜单栏<b>文件</b> →<b>「添加到程序坞」</b>。';
      sheet('装到桌面', how + '<br>装好之后从图标直接进，断网也能接着打。',
        '<div class="btn" data-action="pwa-later">以后再说</div>'
        + '<div class="btn main" data-action="modal-close">知道了</div>');
    }
  }

  async function install() {
    closeModal();
    if (!deferred) return offer();
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    mark(outcome === 'accepted' ? 'installed' : 'dismissed');
    if (UI.view === 'main') render();
  }
  function later() { mark('dismissed'); closeModal(); }

  /* beforeinstallprompt 往往在开篇字幕放完之前就到了，所以这里不直接计时，
     而是隔两秒看一眼：进了主界面、没有弹窗挡着，才开始数 45 秒。 */
  function arm() {
    if (armed || standalone) return;
    const st = state();
    if (st === 'dismissed' || st === 'installed') return;
    armed = true;
    const wait = () => {
      if (typeof UI !== 'undefined' && G.seenIntro && UI.view !== 'intro') setTimeout(fire, 45000);
      else setTimeout(wait, 2000);
    };
    const fire = () => {
      // 正在打仗、正看章首卡、或者别的弹窗开着 —— 过一会儿再来
      if (['battle', 'chapcard', 'epilogue', 'intro'].includes(UI.view) || $('modal').classList.contains('on'))
        return setTimeout(fire, 15000);
      const s = state();
      if (s !== 'dismissed' && s !== 'installed') offer();
    };
    wait();
  }

  addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e; arm();
    if (typeof UI !== 'undefined' && UI.view === 'main') render();
  });
  addEventListener('appinstalled', () => { mark('installed'); deferred = null; });
  if (isSafari) addEventListener('load', arm);

  /* ── service worker：只在 http(s) 下注册，本地双击 file:// 打开不碰 ── */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    /* 只有玩家点了「刷新」才重载。首次访问时 clients.claim() 也会触发
       controllerchange，不拦的话新玩家刚进来就被刷一次。 */
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!Pwa._wantReload || reloading) return; reloading = true; location.reload();
    });
    addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        const ask = w => {
          if (!w || !navigator.serviceWorker.controller) return;   // 首次安装不算更新
          sheet('有新版本', '刷新一下就是新版，存档不受影响。',
            '<div class="btn" data-action="modal-close">等会儿</div>'
            + '<div class="btn main" data-action="pwa-reload">刷　新</div>');
          Pwa._waiting = w;
        };
        if (reg.waiting) ask(reg.waiting);
        /* 图片是按需加载的，没看过的图断网就看不到。进来 8 秒后让 worker
           在后台把全部立绘和场景图慢慢补进缓存，之后断网也完整。
           开了省流量的不补。已经在缓存里的 worker 会跳过。 */
        const c = navigator.connection;
        if (!(c && c.saveData)) setTimeout(() => {
          const urls = [window.PORTRAITS, window.ARCHETYPES, window.SCENES]
            .flatMap(o => Object.values(o || {}));
          navigator.serviceWorker.ready.then(r => r.active && r.active.postMessage({ precache: urls }));
        }, 8000);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w && w.addEventListener('statechange', () => { if (w.state === 'installed') ask(w); });
        });
      }).catch(() => {});
    });
  }
  function reload() { closeModal(); Pwa._wantReload = true; Pwa._waiting && Pwa._waiting.postMessage('skipWaiting'); }

  /* ── 禁止缩放 ──
     viewport 的 user-scalable=no 在 iOS 10 之后被 Safari 无视，
     双指缩放要拦 gesture 事件，双击放大靠 CSS touch-action。 */
  for (const t of ['gesturestart', 'gesturechange', 'gestureend'])
    document.addEventListener(t, e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  // 桌面端 Ctrl/⌘ + 滚轮 也是缩放
  addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

  return { available, offer, install, later, reload, standalone, _waiting: null, _wantReload: false };
})();
window.Pwa = Pwa;
