/* ==========================================================================
   水浒群星录 V10 · 渲染层
   渲染函数只读状态、只拼字符串。事件一律 data-action 委托。
   ========================================================================== */

/* ── 立绘 ─────────────────────────────────────────────────────────────── */
/* 立绘三级回退：本人的 → 范式的（多人共用）→ 兵器剪影。
   PORTRAITS / ARCHETYPES 由构建脚本注入，值是「相对路径?v=哈希」，图片按需加载。 */
const ownPortrait = hid => (window.PORTRAITS && window.PORTRAITS[hid]) || '';
/* 范式底图每张都出了全身、半身两个取景，按 hid 定死用哪个。 */
const archPortrait = hid => {
  const t = DB.hero(hid);
  const a = t && t.arch;
  if (!a || !window.ARCHETYPES) return '';
  const A = window.ARCHETYPES;
  if (hashId(hid) & 4) { const b = A[a + '~b']; if (b) return b; }
  return A[a] || '';
};
const portraitOf = hid => ownPortrait(hid) || archPortrait(hid);
const hasPortrait = hid => !!portraitOf(hid);

/* 同一张范式图给几十个人用，全一个样子就穿帮了。
   按 hid 做稳定哈希取八种变体：先分全身／半身两个取景（换的是底图，
   见 archPortrait），再各配镜像与轻微冷暖（在样式表里）。
   色调只敢动一点点 —— 转多了连绢底一起变色，立绘就跟界面脱开了。
   哈希只认 hid，同一个人每次进来都长一样。 */
function hashId(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const porAttr = hid => ownPortrait(hid) ? '' : ` data-v="${hashId(hid) % 8}"`;
// lazy：群将、图鉴一页上百张人物牌，只取滚到眼前的那些
const porTag = (cls, hid) => `<img class="${cls}" src="${portraitOf(hid)}"${porAttr(hid)} alt="" loading="lazy" decoding="async">`;

/* 伤印：重伤朱砂、轻伤赭石，后面跟还要休养几场 */
function hurtTag(hid) {
  const u = Hurt.of(hid);
  if (!u.lv) return '';
  return `<span class="hurt ${u.lv === 2 ? 'hv' : 'lt'}">${u.lv === 2 ? '重伤' : '轻伤'} ${u.rest}</span>`;
}

/* 兵器剪影：无立绘时的人物牌主视觉 */
const WEAPON_SVG = {
  枪: '<path d="M20 158 L20 40 M20 40 L13 14 L20 2 L27 14 Z M12 44 q8 5 16 0"/>',
  刀: '<path d="M20 158 L20 52 q-10 -18 -2 -34 q10 -14 4 -16 M11 56 h18"/>',
  剑: '<path d="M20 158 L20 46 M20 46 L20 8 M10 50 h20 M20 8 l-4 8 M20 8 l4 8"/>',
  斧: '<path d="M20 158 L20 46 M20 46 q-16 -6 -14 -26 q14 4 14 14 q0 -12 14 -16 q3 20 -14 28 Z"/>',
  棍: '<path d="M20 158 L20 12 M13 16 h14 M13 154 h14"/>',
  禅杖: '<path d="M20 158 L20 30 M20 30 m-11 -10 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0 M20 9 v22 M9 20 h22"/>',
  锤: '<path d="M20 158 L20 44 M8 44 h24 v-20 h-24 Z"/>',
  鞭: '<path d="M20 158 L20 30 M14 30 h12 M14 50 h12 M14 70 h12 M14 90 h12"/>',
  戟: '<path d="M20 158 L20 34 M20 34 L14 10 L20 2 L26 10 Z M20 44 q14 -4 16 -16 M20 52 q-14 -4 -16 -16"/>',
  弓: '<path d="M14 150 q-16 -60 0 -120 M14 30 L14 150 M8 90 h14"/>',
  叉: '<path d="M20 158 L20 40 M8 40 v-22 M20 40 v-30 M32 40 v-22 M8 40 h24"/>',
  索: '<path d="M20 158 q-10 -20 0 -40 q10 -20 0 -40 q-10 -20 0 -40 M14 12 h12"/>',
  石: '<path d="M20 100 m-18 0 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0 M10 92 q10 -6 20 0"/>',
  默认: '<path d="M20 158 L20 30 M12 34 h16 M20 30 L14 12 L20 4 L26 12 Z"/>',
};
function weaponSvg(hid) {
  const t = DB.hero(hid) || {};
  const p = WEAPON_SVG[t.fav_weapon] || WEAPON_SVG['默认'];
  return `<svg viewBox="0 0 40 160" fill="none" stroke="currentColor" stroke-width="5"
     stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

/* ── 小部件 ───────────────────────────────────────────────────────────── */

const seal = q => `<span class="seal ${QCLS[q]}">${QSEAL[q]}</span>`;
const stars = n => '★'.repeat(n) + '☆'.repeat(Math.max(0, Lap.maxStar() - n));
/* V10.4 品阶框：绝世朱红双线、天罡紫、名将赭石，猛以下照旧墨线。返回带前导空格的类名 */
const qf = q => q >= 4 ? ` qf${q}` : '';

/* 群将谱用的小牌：跟布阵的格子一个尺寸、一个版式（三列、立绘 3:4、名字在下），
   两页来回切时人不会忽大忽小。品阶印、在阵标、伤势标叠在立绘上。 */
/** V10.6 卡片上写主属性：文官写智，武将写武（原来一律写武，罗真人一栏「武 539」） */
function mainTxt(s) { const m = mainOf(s); return m.k === 'int' ? `智${s.int}` : `武${s.atk}`; }

function plateSm(hid) {
  const t = DB.hero(hid), h = G.heroes[hid];
  if (!t) return '';
  const s = h ? Stats.calc(hid) : null;
  const inTeam = G.team.includes(hid);
  return `<div class="tslot pl${qf(t.q)}${Hurt.heavy(hid) ? ' hurt-out' : ''}" data-action="hero" data-id="${hid}">
    ${hasPortrait(hid) ? porTag('por', hid) : `<div class="por ph">${weaponSvg(hid)}</div>`}
    ${seal(t.q)}
    ${inTeam ? '<span class="onfield">阵</span>' : ''}
    ${hurtTag(hid)}
    <div class="n">${esc(t.name)}</div>
    <div class="v">${h ? `Lv.${h.lv} <b>${'★'.repeat(h.star)}</b>` : esc(titleOf(t))}</div>
    ${s ? `<div class="v">${mainTxt(s)} 血${s.maxHp}</div>` : ''}
  </div>`;
}

function plate(hid, extra) {
  const t = DB.hero(hid), h = G.heroes[hid];
  if (!t) return '';
  const s = h ? Stats.calc(hid) : null;
  const has = hasPortrait(hid);
  const inTeam = G.team.includes(hid);
  return `<div class="plate${has ? ' has' : ''}${qf(t.q)}" data-action="hero" data-id="${hid}">
    ${has ? porTag('por', hid) : `<div class="weap">${weaponSvg(hid)}</div>`}
    ${seal(t.q)}
    ${hurtTag(hid)}
    ${inTeam ? '<span class="onfield">阵</span>' : ''}
    <div class="pinfo">
      <div class="nm">${esc(t.name)}</div>
      <div class="ti">${esc(titleOf(t))}${h ? `${titleOf(t) ? ' · ' : ''}Lv.${h.lv}` : ''}</div>
      ${s ? `<div class="st"><span><i>武</i>${s.atk}</span><span><i>防</i>${s.def}</span><span><i>血</i>${s.maxHp}</span></div>` : ''}
      <div class="stars">${h ? stars(h.star) : (extra || '')}</div>
    </div>
  </div>`;
}

/** 小节抬头。给了 key 就可以点着收起来，收起状态存进存档。 */
/* 关名去后缀（stName）在引擎里，引擎和视图共用一条 */

/* 有六个人的绰号字段就是名字本身（五种杂兵，外加潘金莲）。
   照直显示就成了「潘金莲　潘金莲」。 */
const titleOf = t => (t && t.title && t.title !== t.name) ? t.title : '';

/* 钱够不够，按钮上直接看出来：够→主按钮，不够→灰掉 */
const afford = (have, cost) => have >= cost ? 'main' : 'off';

function sectionTitle(t, right, key) {
  const f = key ? !!G.fold[key] : false;
  // 右边没附注的也补一格空的，不然有附注的小节横线短一截，同一页上下一看就歪
  return `<div class="sec${key ? ' foldable' : ''}${f ? ' folded' : ''}"
    ${key ? `data-action="fold" data-id="${esc(key)}"` : ''}>
    <span class="fish"></span><h2>${esc(t)}</h2><span class="line"></span>${
      right || '<span class="tp"></span>'}</div>`;
}

/** 抬头 + 内容，收起时内容不渲染 —— 图鉴那种两百多格的列表，
 *  与其 display:none 藏着，不如干脆不生成，翻页快得多。 */
function section(key, title, body, right) {
  return sectionTitle(title, right, key) + (G.fold[key] ? '' : body);
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('on'), 1800);
}

/* ── 顶栏与导航 ───────────────────────────────────────────────────────── */

/* 第一行是每局都在来回点的四个，第二行隔一阵才看一次。
   「聚义」就是主界面 —— 原来导航里没有它，进了哪一页都回不了首页。 */
const NAV = [
  ['main', '聚义'], ['stages', '关隘'], ['team', '布阵'], ['heroes', '群将'],
  ['tavern', '酒肆'], ['items', '行囊'], ['bonds', '羁绊'], ['codex', '图鉴'],
];
/* 子页面亮哪个导航格 */
const NAV_OF = { hero: null, stage: 'stages', chapcard: 'stages', recruitResult: 'tavern', forgeResult: 'tavern',
  battle: 'stages', result: 'stages' };

function renderTop() {
  $('res').innerHTML = `
    <span><i>银</i><b>${G.res.silver.toLocaleString()}</b></span><span class="sep"></span>
    <span><i>金</i><b>${G.res.gold}</b></span><span class="sep"></span>
    <span><i>符</i><b>${G.res.token || 0}</b></span><span class="sep"></span>
    <span><i>将</i><b>${Object.keys(G.heroes).length}</b></span>
    ${Lap.now() > 1 ? `<span class="sep"></span><span><i>周目</i><b>${Lap.now()}</b></span>` : ''}`;
  const cur = UI.view === 'hero' ? UI.hfrom
            : (UI.view in NAV_OF ? NAV_OF[UI.view] : UI.view);
  $('nav').innerHTML = NAV.map(([v, t]) =>
    `<div class="tab${cur === v ? ' on' : ''}" data-action="go" data-id="${v}">${t}</div>`).join('');
}

/* ── 各视图 ───────────────────────────────────────────────────────────── */

const VIEWS = {};

function sceneOf(ch) {
  const card = DB.chapterCard(ch);
  return card && card.scene && window.SCENES ? window.SCENES[card.scene] || '' : '';
}
function sceneLayer(ch, cls) {
  const scene = typeof ch === 'string' ? (window.SCENES && window.SCENES[ch]) || '' : sceneOf(ch);
  return scene ? `<div class="${cls}" style="background-image:url('${scene}')"></div>` : '';
}

/** 字幕从屏幕下缘往上推。时长按内容实际高度算，
 *  短屏幕和长屏幕的观感才一样。 */
function startCrawl() {
  const box = $('crawlIn');
  if (!box) return;
  const view = box.parentElement.clientHeight || 600;
  const title = box.querySelector('.cr-title');
  const start = view * 0.55;
  // 收尾停在片名上，而不是把字全推出画外 —— 推空了就是十几秒的空屏
  const end = title
    ? view / 2 - title.offsetHeight / 2 - title.offsetTop
    : -box.scrollHeight;
  const dist = start - end;
  // 整段控制在一分钟上下：再慢没人看得完，再快读不清
  const sec = clamp(Math.round(dist / 52), 40, 75);
  box.style.transform = `translateY(${start}px)`;
  void box.offsetWidth;
  box.style.transition = `transform ${sec}s linear`;
  box.style.transform = `translateY(${end}px)`;
  // 片名停住后自己进主界面，不用非点一下
  clearTimeout(Play.introTimer);
  Play.introTimer = setTimeout(() => {
    if (UI.view === 'intro') afterIntro();
  }, (sec + 3) * 1000);
}

/* ── 开场字幕 ─────────────────────────────────────────────────────────
   一段一段往上走，走完停在最后一句。随时点一下跳过。
   只在头一回开局放；之后从主界面的「重看开篇」进。 */
VIEWS.intro = () => {
  const rows = DB.story.intro || [];
  return `<div class="crawl" data-action="intro-skip">
    ${sceneLayer(27, 'scene-full')}
    <div class="crawl-in" id="crawlIn">
      ${rows.map(r => r.b ? '<div class="cr-b"></div>'
        : r.h ? `<div class="cr-h">${esc(r.h)}</div>`
        : r.h2 ? `<div class="cr-h2">${esc(r.h2)}</div>`
        : r.e ? `<div class="cr-e">${esc(r.e)}</div>`
        : `<div class="cr-p">${esc(r.s)}</div>`).join('')}
      <div class="cr-title">文字水浒 · 群星录</div>
    </div>
    <div class="crawl-skip">轻触跳过</div>
  </div>`;
};

/* 开局选模式。只在没有存档时出一屏（和重开一局之后）。选定就写进存档，一局之内不能改。 */
VIEWS.mode = () => `<div class="modepick">
    ${sceneLayer(1, 'scene-full')}
    <div class="mp-t">聚　义</div>
    <div class="mp-s">这一局怎么走</div>
    <div class="mp-card" data-action="mode-pick" data-id="classic">
      <b>传　统</b>
      <span>人人本事按图鉴来，林冲使枪、吴用用计。</span>
    </div>
    <div class="mp-card chaos" data-action="mode-pick" data-id="chaos">
      <b>混　乱</b>
      <span>每个人入伙那一刻随机摇四招，谁也不知道自己会什么。开局送的两个也一样。</span>
    </div>
  </div>`;

/* 入伙卡：开篇字幕走完，把开局随机送的两个人亮出来 —— 不然玩家不知道自己多了谁 */
VIEWS.gift = () => {
  const ids = (G.startGift || []).filter(h => G.heroes[h]);
  return `<div class="giftcard">
    <div class="gc-t">投　奔</div>
    <div class="gc-s">${G.mode === 'chaos' ? '混乱模式 · ' : ''}两位好汉先来入伙</div>
    ${ids.map(hid => { const t = DB.hero(hid), h = G.heroes[hid];
      return `<div class="gc-row">
        <div class="gc-face${qf(t.q)}">${hasPortrait(hid) ? porTag('por', hid) : `<div class="weap">${weaponSvg(hid)}</div>`}</div>
        <div class="gc-info">
          <div class="nm">${seal(t.q)} ${esc(t.name)}<i>${esc(titleOf(t))}</i></div>
          <div class="dsk">${skRowsHtml(hid, h)}</div>
        </div>
      </div>`; }).join('')}
    <div class="btns"><div class="btn main" data-action="gift-done">去聚义厅</div></div>
  </div>`;
};

/* 开篇走完之后去哪：头一回要先看入伙卡 */
function afterIntro() {
  G.seenIntro = true;
  if (G.startGift && !G.giftShown) { G.giftShown = true; Save.write(); UI.view = 'gift'; render(); return; }
  Save.write(); UI.view = 'main'; render();
}

/* 章首题词：进一章的头一关时出一张，看过就不再出 */
VIEWS.chapcard = () => {
  const c = UI.card;
  if (!c) return '<div class="empty"></div>';
  return `<div class="chapcard" data-action="card-done">
    ${sceneLayer(c.ch, 'scene-card')}
    <div class="cc-ch">第 ${c.ch} 章</div>
    <div class="cc-t">${esc(c.title)}</div>
    <div class="cc-rule"></div>
    ${c.lines.map(l => `<div class="cc-l">${esc(l)}</div>`).join('')}
    <div class="cc-go">轻触继续</div>
  </div>`;
};

/* 尾声：头一回把一周目的关隘全打通时出一张，版式同章首卡。
   之后从主界面「重看尾声」进。 */
VIEWS.epilogue = () => {
  const e = DB.story.epilogue;
  if (!e) return '<div class="empty"></div>';
  return `<div class="chapcard epi" data-action="epi-done">
    ${sceneLayer(e.scene || '', 'scene-card')}
    <div class="cc-ch">群 星 录</div>
    <div class="cc-t">${esc(e.title)}</div>
    <div class="cc-rule"></div>
    ${e.lines.map(l => `<div class="cc-l">${esc(l)}</div>`).join('')}
    <div class="cc-go">轻触继续</div>
  </div>`;
};

VIEWS.main = () => {
  const cleared = Object.keys(G.cleared).length;
  const next = DB.stageIds().find(s => !G.cleared[s] && Stages.unlocked(s));
  const st = next ? DB.stage(next) : null;
  return `
  <div class="hero-banner">
    <div class="bt">水浒群星录</div>
    <div class="bs">九人对阵 · 星宿聚义 · ${G.mode === 'chaos' ? '混乱' : '传统'}</div>
  </div>
  <div class="stat3">
    <div><b>${Object.keys(G.heroes).length}</b><i>已收将</i></div>
    <div><b>${G.team.length}/${CFG.teamSize}</b><i>出战</i></div>
    <div><b>${cleared}</b><i>已通关</i></div>
  </div>
  ${(() => { const g = Guide.next(); return g ? `<div class="nextup" data-action="${g.act}" data-id="${g.id || ''}">
      <div class="k">下一步</div>
      <div class="v">${esc(g.txt)}</div>
      <div class="m">${esc(g.sub)}</div>
    </div>` : ''; })()}
  <div class="btns">
    <div class="btn main" data-action="go" data-id="stages">出　征</div>
    <div class="btn" data-action="go" data-id="team">布　阵</div>
  </div>
  ${fateBar()}
  ${Lap.done() ? `<div class="lapcard" data-action="lap-next">
      <div class="k">${Lap.now()} 周目已通关</div>
      <div class="v">重整旗鼓</div>
      <div class="m">人、等级、星、家当全留着，关隘从头再走一遍；
        等级上限 ${Lap.maxLv()} → ${Lap.maxLv(Lap.now() + 1)}，星级 ${Lap.maxStar()} → ${Lap.maxStar(Lap.now() + 1)}</div>
    </div>` : ''}
  ${G.log.length ? section('log', '最　近',
     '<div class="logbox">' + G.log.slice(0, 8).map(l => `<div>${esc(l)}</div>`).join('') + '</div>') : ''}
  <div class="btns" style="margin-top:22px">
    <div class="btn" data-action="replay-intro">重看开篇</div>
    ${G.seenEpi ? '<div class="btn" data-action="epilogue">重看尾声</div>' : ''}
    ${window.Pwa && Pwa.available() ? '<div class="btn" data-action="pwa-offer">装到桌面</div>' : ''}
    <div class="btn warn" data-action="reset">重开一局</div>
  </div>
  <div class="contact" data-action="copy-wx">有 bug、有想法，加微信说一声：<b>lynchrrr</b><i>点一下复制</i></div>`;
};

/* 宿星条。二周目才有，三颗一直摆在主界面上 —— 这一周目是什么手感，
   一眼看得见，不用翻菜单。每颗可以花符换一次。 */
function fateBar() {
  const on = Fate.on();
  if (!on.length) return '';
  return section('fates', `宿星（${on.length}）`,
    '<div class="fates">' + on.map(f => {
      const done = (G.fateRerolled || {})[f.id];
      return `<div class="fate">
        <div class="fn">${esc(f.name)}</div>
        <div class="fu">${esc(f.up)}</div>
        <div class="fd">${esc(f.dn)}</div>
        ${done ? '<div class="fr done">已换过</div>'
               : `<div class="fr${(G.res.token || 0) >= CFG.fateReroll ? '' : ' off'}"
                    data-action="fate-reroll" data-id="${f.id}">换 · ${CFG.fateReroll} 符</div>`}
      </div>`;
    }).join('') + '</div>');
}

/* 群将谱的排法与筛法。收满是两百多人，一路往下翻找不到人。 */
const SORTS = {
  power: ['战力', (a, b) => Stats.heroPower(b) - Stats.heroPower(a)],
  q:     ['品阶', (a, b) => (DB.hero(b).q - DB.hero(a).q) || (G.heroes[b].lv - G.heroes[a].lv)],
  lv:    ['等级', (a, b) => (G.heroes[b].lv - G.heroes[a].lv) || (DB.hero(b).q - DB.hero(a).q)],
  atk:   ['武力', (a, b) => Stats.calc(b).atk - Stats.calc(a).atk],
  int:   ['智力', (a, b) => Stats.calc(b).int - Stats.calc(a).int],
  star:  ['星数', (a, b) => (G.heroes[b].star - G.heroes[a].star) || (DB.hero(b).q - DB.hero(a).q)],
};
const FILTS = {
  all:   ['全部',  () => true],
  team:  ['在阵',  h => G.team.includes(h)],
  idle:  ['未上阵', h => !G.team.includes(h)],
  wu:    ['武将',  h => roleOf(DB.hero(h)) !== 'wen'],
  wen:   ['文官',  h => roleOf(DB.hero(h)) !== 'wu'],
  hurt:  ['带伤',  h => !!Hurt.of(h).lv],
  up:    ['可升星', h => { const n = Grow.starNeed(h); return !!n && !n.max && n.ok; }],
};

/** 群将谱当下排出来的那一串人。详情页左右切换也按这一串走 */
function heroesShown() {
  const sk = SORTS[UI.hsort] ? UI.hsort : 'q';
  const fk = FILTS[UI.hfilt] ? UI.hfilt : 'all';
  return Object.keys(G.heroes).filter(FILTS[fk][1]).sort(SORTS[sk][1]);
}

/** 图鉴里已收的人，按图鉴的排法 */
function codexOwned() {
  const bySrc = {};
  DB.heroIds().filter(k => DB.hero(k).src !== '杂兵')
    .forEach(k => (bySrc[DB.hero(k).src || '其他'] ||= []).push(k));
  return Object.values(bySrc).flatMap(ids =>
    ids.slice().sort((a, b) => DB.hero(b).q - DB.hero(a).q)).filter(k => G.heroes[k]);
}

/** 从哪一页点进详情，就在那一页的人里左右切 */
function heroCtx(from, id) {
  let list;
  if (from === 'heroes') list = heroesShown();
  else if (from === 'team') list = G.team.slice();
  else if (from === 'codex') list = codexOwned();
  else if (from === 'recruitResult') list = [...new Set((UI.recruit || []).map(r => r.hid))];
  else list = G.team.includes(id) ? G.team.slice() : [id];
  list = list.filter(h => G.heroes[h]);
  if (!list.includes(id)) list = [id];
  return list;
}

function openHero(id) {
  if (UI.view !== 'hero') {
    UI.hfrom = UI.view;
    UI.hlist = heroCtx(UI.view, id);
  } else if (!(UI.hlist || []).includes(id)) {
    UI.hlist = [id];
  }
  UI.sel = id; UI.view = 'hero'; render();
}

function stepHero(d) {
  const L = (UI.hlist || []).filter(h => G.heroes[h]);
  if (L.length < 2) return;
  const i = Math.max(0, L.indexOf(UI.sel));
  UI.sel = L[(i + d + L.length) % L.length];
  render();
}

/* 属性的用处写在数字后面。原来一排「武防智捷魅」，魅是干什么的没人知道 */
function statNote(k, s) {
  if (k === 'int') return `技能威力 +${Math.round((skillPow(s.int, s.atk) - 1) * 100)}%`;
  if (k === 'agi') return `先手 · 暴击 ${Math.round(critRate(s.agi, s.crit) * 100)}%`;
  return { atk: '伤害', def: '减伤', hp: '' }[k];
}

/** 装备的全部属性写成一行 */
function eqTxt(e) {
  const p = [];
  for (const k of ['atk', 'def', 'int', 'agi', 'hp']) if (e.flat[k]) p.push(`${STAT_NAME[k]}+${e.flat[k]}`);
  for (const k of ['atk', 'int', 'def', 'hp']) if (e.pct[k]) p.push(`${STAT_NAME[k]}+${Math.round(e.pct[k] * 100)}%`);
  return p.join(' ');
}
const OB_NAME = { atk: '武', def: '防', int: '智', agi: '捷', hp: '血', crit: '暴击', all: '全属性' };
function obTxt(e) {
  if (!e.exclusive || !e.ownerBonus) return '';
  const who = DB.hero(e.exclusive);
  const stat = Object.entries(e.ownerBonus)
    .filter(([, v]) => v).map(([k, v]) => `${OB_NAME[k] || k}+${Math.round(v * 100)}%`);
  // V10.4 专属特效跟在属性后面，写法同技能被动
  const fx = (e.fx || []).map(f => SkillText.fx(f));
  return `${who ? who.name : ''}用时 ` + [stat.join(' '), ...fx].filter(Boolean).join('；');
}
/** V10.6 装备百分比合计与上限：每项单独封顶 CFG.cap.eqPct */
function eqPctHtml(meta) {
  const p = (meta && meta.pct) || {}, cap = CFG.cap.eqPct;
  const nm = { atk: '武', int: '智', def: '防', hp: '血' };
  const on = ['atk', 'int', 'def', 'hp'].filter(k => p[k] > 0);
  return `<div class="eqpct">装备百分比 ${on.length ? on.map(k => `${nm[k]} +${Math.round(p[k] * 100)}%${p[k] > cap ? `<em>（按 ${Math.round(cap * 100)}% 计）</em>` : ''}`).join('　') : '无'}<i>每项上限 ${Math.round(cap * 100)}%</i></div>`;
}
/** 绝世三件套一行：「套装·逼上梁山 2/3｜效果」，没齐灰显 */
function setRowHtml(hid, meta) {
  const set = meta && meta.set;
  if (!set) return '';
  const names = set.items.map(id => { const e = DB.equip(id); return e ? e.name : id; }).join('、');
  return `<div class="setrow${meta.setOn ? ' on' : ''}">
    <b>套装 · ${esc(set.name)} <i>${meta.setHave}/${set.items.length}</i></b>
    <span>${esc(set.fx.map(f => SkillText.fx(f)).join('；'))}</span>
    <span class="setn">${esc(names)}</span></div>`;
}

VIEWS.heroes = () => {
  const sk = SORTS[UI.hsort] ? UI.hsort : 'q';
  const fk = FILTS[UI.hfilt] ? UI.hfilt : 'all';
  const ids = heroesShown();
  const all = Object.keys(G.heroes).length;

  const bar = `<div class="picker">
    <div class="pline"><i>排序</i>${Object.entries(SORTS).map(([k, v]) =>
      `<span class="pk${k === sk ? ' on' : ''}" data-action="hsort" data-id="${k}">${v[0]}</span>`).join('')}</div>
    <div class="pline"><i>筛选</i>${Object.entries(FILTS).map(([k, v]) =>
      `<span class="pk${k === fk ? ' on' : ''}" data-action="hfilt" data-id="${k}">${v[0]}</span>`).join('')}</div>
  </div>`;

  return section('heroes', `群将谱（${ids.length}${ids.length < all ? ` / ${all}` : ''}）`,
    bar + (ids.length
      ? `<div class="plates sm">${ids.map(h => plateSm(h)).join('')}</div>`
      : '<div class="empty">这一档下没人</div>'));
};

/* 技能四行：类别标签 + 从字段拼出来的描述。没解锁的只给名字和解锁星级。
   混乱模式下读的是这个人自己那套（h.sk），不是图鉴。 */
const SK_CLS = { active: 'c-act', sure: 'c-sure', cmd: 'c-cmd', passive: 'c-pas' };
function skTag(sk) { return `<em class="sktag ${SK_CLS[sk.cat] || ''}">${esc(SkillText.cat(sk))}</em>`; }
function skRowsHtml(hid, h) {
  const ids = skillIdsOf(hid, h);
  const own = h ? h.owned : ids;
  return ids.map((id, i) => {
    const sk = DB.skill(id); if (!sk) return '';
    const has = own.includes(id);
    return `<div class="sk${has ? '' : ' lock'}">
      <b>${skTag(sk)}${esc(sk.name)}</b><span>${has ? esc(sk.desc) : `★${i + 1} 解锁`}</span></div>`;
  }).join('') + (h && h.sk ? '<div class="sk-note">混乱模式 · 这四招是入伙时随机得来的</div>' : '');
}

VIEWS.hero = () => {
  const hid = UI.sel, t = DB.hero(hid), h = G.heroes[hid];
  if (!t || !h) return '<div class="empty">查无此人</div>';
  const s = Stats.calc(hid);
  const nextLv = h.lv < Lap.maxLv() ? Grow.drillCost(hid) : null;
  const reach = Grow.drillReach(hid);   // 手上的银子够练到几级
  const dcap = Grow.drillCap();         // 打到哪儿才练得到哪儿
  const sn = Grow.starNeed(hid);
  const bd = s.meta.bond;
  const L = (UI.hlist || []).filter(x => G.heroes[x]);
  const pos = L.indexOf(hid);
  const multi = L.length > 1;
  const bondOn = Object.entries(bd).filter(([, v]) => v > 0);

  const skRows = skRowsHtml(hid, h);

  const eqRows = SLOTS.map(slot => {
    const e = DB.equip(h.equipment[slot]);
    const mine = e && e.exclusive === hid;
    return `<div class="eqrow">
      <i>${SLOT_NAME[slot]}</i>
      ${e ? `<b class="${QCLS[e.q]}">${esc(e.name)}</b>
             <span class="eqs">${esc(eqTxt(e))}${mine ? `<em>${esc(obTxt(e))}</em>` : ''}</span>
             <span class="act" data-action="unequip" data-id="${hid}" data-slot="${slot}">卸</span>`
          : `<b class="dim">空</b>
             <span class="act" data-action="equip-pick" data-id="${hid}" data-slot="${slot}">配</span>`}
    </div>`;
  }).join('');

  const back = UI.hfrom && UI.hfrom !== 'hero' ? UI.hfrom : 'heroes';
  return `<div class="detail" id="hdetail">
    ${multi ? `<div class="hnav">
      <span class="hstep" data-action="hero-step" data-id="-1">‹ ${esc(DB.hero(L[(pos - 1 + L.length) % L.length]).name)}</span>
      <b>${pos + 1} / ${L.length}</b>
      <span class="hstep" data-action="hero-step" data-id="1">${esc(DB.hero(L[(pos + 1) % L.length]).name)} ›</span>
    </div>` : ''}
    <div class="dtop">
      ${hasPortrait(hid) ? porTag('dpor' + qf(t.q), hid)
        : `<div class="dpor ph${qf(t.q)}">${weaponSvg(hid)}</div>`}
      <div class="dside">
        ${seal(t.q)}
        <div class="dnm">${esc(t.name)}</div>
        <div class="dti">${esc(titleOf(t))}</div>
        <div class="dlv">Lv.${h.lv} · ${stars(h.star)}</div>
        ${Hurt.of(hid).lv ? `<div class="dhurt ${Hurt.heavy(hid) ? 'hv' : 'lt'}">
          ${esc(Hurt.txt(hid))}${Hurt.heavy(hid) ? '' : `　属性 ×${CFG.hurtLightMul}`}</div>` : ''}
        <div class="drow"><i>武</i><b>${s.atk}</b><u>${statNote('atk', s)}</u>${s.meta.apt ? '<s>擅长</s>' : ''}</div>
        <div class="drow"><i>防</i><b>${s.def}</b><u>${statNote('def', s)}</u></div>
        <div class="drow"><i>智</i><b>${s.int}</b><u>${statNote('int', s)}</u></div>
        <div class="drow"><i>捷</i><b>${s.agi}</b><u>${statNote('agi', s)}</u></div>
        <div class="drow"><i>血</i><b>${s.maxHp}</b></div>
        ${h.lv < Lap.maxLv() ? `<div class="dexp"><i>经验</i>
          <em><u style="width:${clamp(h.exp / CFG.expNeed(h.lv) * 100, 0, 100)}%"></u></em>
          <b>${Math.round(h.exp)} / ${CFG.expNeed(h.lv)}</b></div>` : ''}
        ${bondOn.length ? `<div class="dbond">羁绊 ${bondOn.map(([k, v]) =>
            `${STAT_NAME[k]}+${Math.round(v * 100)}%`).join('　')}</div>` : ''}
      </div>
    </div>
    <div class="dbar">
      <div class="btn sm${nextLv ? afford(G.res.silver, nextLv) : ' dim'}"
           data-action="levelup" data-id="${hid}">${nextLv ? `操练 · ${nextLv} 银`
             : (h.lv >= Lap.maxLv() ? '已满级' : `督练到顶 ${dcap} 级`)}</div>
      ${nextLv && reach > h.lv
        ? `<div class="btn sm main" data-action="drillmax" data-id="${hid}">连练到 ${reach} 级</div>` : ''}
      ${Hurt.of(hid).lv ? `<div class="btn sm${G.res.silver >= Hurt.cureCost(hid) ? ' main' : ''}"
           data-action="cure" data-id="${hid}">郎中 · ${Hurt.cureCost(hid)} 银</div>` : ''}
      <div class="btn sm${!sn.max && sn.ok ? ' main' : ''}"
           data-action="starup" data-id="${hid}">${sn.max
             ? `已满星${G.frags[hid] ? ` · 碎片 ${G.frags[hid]}` : ''}`
             : `升星 · 片${sn.useOwn}/${sn.cost}${sn.token ? `+符${sn.token}` : ''}`}</div>
      <div class="btn sm${Hurt.heavy(hid) && !G.team.includes(hid) ? ' dim' : ''}"
           data-action="${G.team.includes(hid) ? 'unteam' : 'team'}" data-id="${hid}">
        ${G.team.includes(hid) ? '下阵' : (Hurt.heavy(hid) ? '伤重' : '上阵')}</div>
    </div>
    <div class="eqbox">${eqRows}${setRowHtml(hid, s.meta)}${eqPctHtml(s.meta)}</div>
    <div class="dbio">${esc(t.bio || '')}</div>
    <div class="dsk">${skRows}</div>
    <div class="btns"><div class="btn" data-action="go" data-id="${back}">返　回</div></div>
  </div>`;
};

VIEWS.stages = () => {
  let html = '';
  for (const ch of DB.chapters) {
    const list = DB.byChapter[ch];
    if (!list || !list.length) continue;
    const anyOpen = list.some(s => Stages.unlocked(s));
    if (!anyOpen && !list.some(s => G.cleared[s])) {
      const prevDone = ch === DB.chapters[0] || list.some(s => Stages.unlocked(s));
      if (!prevDone) continue;
    }
    const chName = DB.stage(list[0]).ch_name || '';
    const fk = 'ch' + ch;
    html += sectionTitle(`第${ch}章${chName ? ' · ' + chName : ''}`, null, fk);
    if (G.fold[fk]) continue;
    html += '<div class="frame tight">';
    let ord = 0;                       // 本章内普通关的序号，给左边那方小印用
    for (const sid of list) {
      const st = DB.stage(sid);
      const plain = !st.is_boss && !st.hidden && !/_f\d/.test(sid);
      const k = plain ? ord++ : -1;
      const open = Stages.unlocked(sid), done = !!G.cleared[sid];
      const n = Battle.roster(sid).length;
      html += `<div class="stage${done ? ' done' : ''}${open ? '' : ' lock'}"
          ${open ? `data-action="stage" data-id="${sid}"` : ''}>
        <div class="no">${st.is_boss ? '王' : st.hidden ? '秘' : /_f\d/.test(sid) ? '支'
          : '一二三四五六七八九十'[k] || (k + 1)}</div>
        <div class="mid">
          <div class="t">${esc(stName(st.name))}</div>
          <div class="m">${open ? `难易 <span class="hard">${'一二三四五六七'[Math.min((st.diff || 1) - 1, 6)]}</span> · 推荐 ${st.rec_lv ? Lap.recLv(st.rec_lv)[1] : '?'} 级 · 敌 ${n} 人`
                                : esc(Stages.lockReason(sid))}</div>
        </div>
        ${done ? '<div class="chk">已通</div>' : ''}
      </div>`;
    }
    html += '</div>';
  }
  return html || '<div class="empty">暂无关卡</div>';
};

VIEWS.stage = () => {
  const sid = UI.stage, st = DB.stage(sid);
  if (!st) return '<div class="empty">查无此关</div>';
  const my = Stats.teamPower(), foe = Stats.stagePower(sid);
  const r = foe ? my / foe : 9;
  const verdict = r >= 1.35 ? ['稳操胜券', 'ok'] : r >= 1.1 ? ['略占上风', 'ok']
                : r >= 0.9 ? ['势均力敌', 'mid'] : r >= 0.7 ? ['颇为吃力', 'bad'] : ['恐难取胜', 'bad'];
  const dlg = DB.dialog(sid);
  const tier = Battle.enemyTier(sid);
  const foes = Battle.roster(sid).map(e => DB.hero(e)).filter(Boolean);

  return `<div class="frame stage-frame">
    ${sceneLayer(st.ch, 'scene-stage')}
    <div class="sname">${esc(stName(st.name))}</div>
    <div class="vsbar">
      <div class="side"><b>${my}</b><i>我方</i></div>
      <div class="mid ${verdict[1]}">${verdict[0]}</div>
      <div class="side"><b>${foe}</b><i>敌方</i></div>
    </div>
    <div class="pbar"><em style="width:${clamp(my / (my + foe) * 100, 4, 96)}%"></em></div>
    <div class="meta">推荐 ${st.rec_lv ? Lap.recLv(st.rec_lv).join('–') : '?'} 级 · 敌方 ${tier.lv} 级 ${tier.star} 星 · 共 ${foes.length} 人</div>
    <div class="foelist">${foes.map(f => `<span class="${QCLS[f.q]}">${esc(f.name)}</span>`).join('')}</div>
    ${st.theme && THEMES[st.theme] ? `<div class="theme"><b>阵势 · ${THEMES[st.theme].name}</b><span>${esc(THEMES[st.theme].tip)}</span></div>` : ''}
    ${dlg && dlg.before ? `<div class="brief">${dlg.before.map(p => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
    <div class="btns">
      <div class="btn main" data-action="fight" data-id="${sid}">出　战</div>
      ${(G.cleared[sid] || G.everCleared[sid]) ? `<div class="btn" data-action="sweep" data-id="${sid}">速　战</div>` : ''}
      <div class="btn" data-action="go" data-id="stages">返　回</div>
    </div>
  </div>`;
};

VIEWS.team = () => {
  const p = Stats.teamPower();
  const slots = [];
  for (let i = 0; i < CFG.teamSize; i++) {
    const hid = G.team[i];
    if (hid) {
      const t = DB.hero(hid), s = Stats.calc(hid);
      slots.push(`<div class="tslot${qf(t.q)}${Hurt.heavy(hid) ? ' hurt-out' : ''}" data-action="hero" data-id="${hid}"
        data-slot="${i}">
        ${hasPortrait(hid) ? porTag('por', hid)
                           : `<div class="por ph">${weaponSvg(hid)}</div>`}
        ${hurtTag(hid)}
        <div class="n">${esc(t.name)}</div>
        <div class="v">${mainTxt(s)} 血${s.maxHp}</div>
        <span class="x" data-action="unteam" data-id="${hid}">×</span></div>`);
    } else {
      slots.push(`<div class="tslot empty" data-action="go" data-id="heroes" data-slot="${i}">
        <div class="plus">＋</div><div class="n">空位</div></div>`);
    }
  }
  const bonds = DB.bonds.map((b, i) => {
    const inTeam = new Set(G.team);
    const have = (b.members || []).filter(m => inTeam.has(m)).length;
    let tier = null;
    for (const t of (b.tiers || [])) if (have >= t.need) tier = t;
    return tier ? { b, have, tier } : null;
  }).filter(Boolean);

  const wounded = Object.keys(G.heroes).filter(h => Hurt.of(h).lv);
  const heavy = wounded.filter(h => Hurt.heavy(h));
  return sectionTitle('布阵', `<span class="tp">总战力 ${p}</span>`) +
    (wounded.length ? `<div class="woundbar">养伤 ${wounded.length} 人` +
      (heavy.length ? `，其中 ${heavy.length} 人重伤上不得阵` : '') +
      `　<i>没上阵的人每打一场恢复一场</i></div>` : '') +
    `<div class="tgrid" id="tgrid">${
       [0, 1, 2].map(r => `<div class="rowtag${r === 0 ? ' front' : ''}">
         <b>${['前排', '中排', '后排'][r]}</b>${r === 0 ? '<i>先挨打</i>' : ''}</div>` +
         slots.slice(r * 3, r * 3 + 3).join('')).join('')
     }</div>
     <div class="btns tight2">
       <div class="btn main" data-action="auto-team">一键上阵</div>
       <div class="btn" data-action="auto-equip">一键装备</div>
       <div class="btn" data-action="strip-team">一键卸装</div>
       <div class="btn" data-action="go" data-id="heroes">去挑人</div>
     </div>
     <div class="tip">按住格子拖动可以换位。前三个站第一排，单挑先打前排。血量就是兵力：血越少，伤害、治疗、护盾越弱（半血只剩六成半）。一键装备只动阵上九人、只从行囊里拿。</div>` +
    section('teambond', `已激活羁绊（${bonds.length}）`,
    (bonds.length ? `<div class="frame tight">${bonds.map(({ b, have, tier }) =>
      `<div class="bondrow"><b>${esc(b.name)}</b>
        <span class="tier">${have}/${b.members.length} 人 · ${tier.rate === 1 ? '齐聚' : tier.need === 2 ? '初识' : '熟识'}</span>
        <span class="val">${STAT_NAME[b.attr] || b.attr}+${Math.round(b.val * tier.rate)}%</span></div>`).join('')}</div>`
      : '<div class="empty">凑齐同一羁绊的两人即可激活</div>'));
};

VIEWS.items = () => {
  // 背包里的 + 已经穿在人身上的，合成一张总表，穿着的标明是谁
  const worn = {};
  for (const hid of Object.keys(G.heroes)) {
    const eq = G.heroes[hid].equipment || {};
    for (const slot of SLOTS) if (eq[slot]) (worn[eq[slot]] ||= []).push(hid);
  }
  const bagN = {};
  for (const k of Object.keys(G.items)) if (k.startsWith('eq_') && G.items[k] > 0) bagN[k.slice(3)] = G.items[k];
  const allIds = [...new Set([...Object.keys(bagN), ...Object.keys(worn)])];
  const all = allIds.map(DB.equip).filter(Boolean)
    .sort((a, c) => c.q - a.q || SLOTS.indexOf(a.slot) - SLOTS.indexOf(c.slot));
  const eqs = Grow.bagEquips(null);
  const cons = Object.keys(G.items).filter(k => !k.startsWith('eq_') && G.items[k] > 0);
  const fr = Object.keys(G.frags).filter(k => G.frags[k] > 0);
  const idle = all.filter(e => bagN[e.id]).length;
  return section('bagEq', `兵器战甲（${all.length}）`,
    (all.length ? `<div class="frame tight">${all.map(e => {
      const users = worn[e.id] || [], n = bagN[e.id] || 0;
      return `<div class="itrow${users.length ? ' on' : ''}"${users.length
          ? ` data-action="hero" data-id="${users[0]}"` : ''}>
        <b class="${QCLS[e.q]}">${esc(e.name)}</b>
        <span class="s">${SLOT_NAME[e.slot] || e.slot}</span>
        <span class="eqs">${esc(eqTxt(e))}${e.exclusive ? `<em>专属 · ${esc(obTxt(e))}</em>` : ''}</span>
        <span class="who">${users.length
          ? users.map(h => esc(DB.hero(h).name)).join('、') + ' 在用'
          : ''}</span>
        <span class="n">${n ? `闲 ×${n}` : ''}</span></div>`;
    }).join('')}</div>`
      : '<div class="empty">空空如也</div>'),
      `<span class="tp${idle + Object.keys(worn).length ? '' : ' zero'}">闲置 ${idle} · 在用 ${Object.keys(worn).length}</span>`) +
    (fr.length ? section('bagFrag', `武将碎片（${fr.length}）`, `<div class="frame tight">${fr.map(h => {
      const n = Grow.starNeed(h);
      return `<div class="itrow on"${G.heroes[h] ? ` data-action="hero" data-id="${h}"` : ''}>
        <b>${esc(DB.hero(h) ? DB.hero(h).name : h)}</b>
        <span class="s">${!n ? '' : n.max ? `满星，每 ${CFG.fragMelt} 片折一枚兵符`
          : `下一星要 ${n.cost}${n.token ? `，差的 ${n.token} 片用兵符补` : '，够了'}`}</span>
        <span class="n">×${G.frags[h]}</span></div>`;
    }).join('')}</div>`,
      `<span class="tp">兵符 ${G.res.token || 0}</span>`) : '') +
    (cons.length ? section('bagItem', '杂　物', `<div class="frame tight">${cons.map(k => {
      const it = DB.item(k) || {};
      const live = it.type === 'exp' || it.type === 'cure';   // 点得动的只有这两类
      return `<div class="itrow${live ? ' on' : ''}"${live ? ` data-action="use-item" data-id="${k}"` : ''}>
        <b>${esc(it.name || k)}</b>
        <span class="s">${esc(it.desc || '')}</span>
        <span class="n">×${G.items[k]}</span>
        ${live ? '<span class="go">用</span>' : ''}</div>`;
    }).join('')}</div>`) : '');
};

VIEWS.bonds = () => {
  const inTeam = new Set(G.team);
  const rows = DB.bonds.map(b => {
    const have = (b.members || []).filter(m => inTeam.has(m)).length;
    const owned = (b.members || []).filter(m => G.heroes[m]).length;
    let tier = null;
    for (const t of (b.tiers || [])) if (have >= t.need) tier = t;
    const nextT = (b.tiers || []).find(t => have < t.need);
    return { b, have, owned, tier, nextT };
  }).sort((a, c) => (c.tier ? 1 : 0) - (a.tier ? 1 : 0) || c.have - a.have);

  return section('bonds', `羁绊谱 ${rows.filter(r => r.tier).length}/${rows.length}`,
    `<div class="frame tight">${rows.map(({ b, have, owned, tier, nextT }) =>
      `<div class="bondrow${tier ? ' on' : ''}">
        <b>${esc(b.name)}</b>
        <span class="tier">在阵 ${have}/${b.members.length}　已收 ${owned}</span>
        <span class="val">${tier ? `${STAT_NAME[b.attr] || b.attr}+${Math.round(b.val * tier.rate)}%`
                                 : nextT ? `还差 ${nextT.need - have} 人` : '—'}</span>
        <div class="mem">${b.members.map(m => {
          const t = DB.hero(m);
          return `<span class="${inTeam.has(m) ? 'in' : G.heroes[m] ? 'own' : 'no'}">${esc(t ? t.name : m)}</span>`;
        }).join('')}</div>
      </div>`).join('')}</div>`);
};

VIEWS.tavern = () => {
  const rate = Object.entries(CFG.recruitRate).sort((a, b) => b[0] - a[0])
    .map(([q, r]) => `<span class="${QCLS[q]}">${QTXT[q]} ${(r * 100).toFixed(0)}%</span>`).join('');
  return sectionTitle('酒肆招贤') + `<div class="frame">
    <div class="rates">${rate}</div>
    <div class="btns">
      <div class="btn ${afford(G.res.silver, CFG.recruitCost1)}" data-action="recruit" data-id="1">
        单抽 · ${CFG.recruitCost1} 银</div>
      <div class="btn ${afford(G.res.silver, CFG.recruitCost10)}" data-action="recruit" data-id="10">
        十连 · ${CFG.recruitCost10} 银</div>
    </div>
    <div class="btns"><div class="btn ${afford(G.res.gold, CFG.goldExchangeCost)}"
      data-action="gold">黄金求贤 · ${CFG.goldExchangeCost} 金（保底名将 · 天罡 ${Math.round(CFG.goldRate[5] * 100)}% 绝世 ${Math.round(CFG.goldRate[6] * 100)}%）</div></div>
  </div>` + forgeHtml();
};

/* V10.5 铁匠铺：抽装备。概率按眼下的池子重算显示，封顶跟着进度走 */
function forgeHtml() {
  const cap = Grow.forgeCap();
  const rates = Grow.forgeRates(cap);
  const fmt = r => { const v = r * 100; return v >= 1 ? v.toFixed(0) : v.toFixed(1); };
  const row = Object.entries(rates).sort((a, b) => b[0] - a[0])
    .map(([q, r]) => q === '7' ? `<span class="q-jue">专属 ${fmt(r)}%</span>`
                              : `<span class="${QCLS[q]}">${QTXT[q]} ${fmt(r)}%</span>`).join('');
  return sectionTitle('铁匠铺', cap >= 7 ? '' : `<span class="tp">眼下最高 ${QTXT[cap]}</span>`) + `<div class="frame">
    <div class="rates">${row}</div>
    <div class="btns">
      <div class="btn ${afford(G.res.silver, CFG.forgeCost1)}" data-action="forge" data-id="1">打一件 · ${CFG.forgeCost1} 银</div>
      <div class="btn ${afford(G.res.silver, CFG.forgeCost10)}" data-action="forge" data-id="10">打十件 · ${CFG.forgeCost10} 银</div>
    </div>
  </div>`;
}

VIEWS.forgeResult = () => {
  const list = UI.forge || [];
  const fresh = list.filter(r => !r.had).length;
  return sectionTitle('铁匠铺所得', `<span class="tp">新得 ${fresh} · 又一件 ${list.length - fresh}</span>`) +
    `<div class="frame tight">${list.map(r => {
      const e = DB.equip(r.eid);
      return `<div class="itrow${e.q >= 5 ? ' on' : ''}">
        <b class="${QCLS[e.q]}">${esc(e.name)}</b>
        <span class="s">${SLOT_NAME[e.slot] || e.slot}${e.exclusive ? ' · 专属' : ''}</span>
        <span class="eqs">${esc(eqTxt(e))}${e.exclusive ? `<em>${esc(DB.hero(e.exclusive).name)} · ${esc(obTxt(e))}</em>` : ''}</span>
        <span class="n">${r.had ? '又一件' : '新得'}</span></div>`;
    }).join('')}</div>
  <div class="btns"><div class="btn main" data-action="go" data-id="tavern">再　来</div>
    <div class="btn" data-action="go" data-id="team">去布阵</div></div>`;
};

/* 十连结果原来铺十张大人物牌。两百多人共用十二张范式底图，别处还能靠
   镜像色调半身遮掩，十张并排摊开就彻底穿帮 —— 一屏里四个是同一个铁盔兵。
   改成一人一行：小头像 + 名字绰号 + 品阶 + 入伙还是碎片。
   撞车不再并排摆出来，也看得更快。 */
VIEWS.recruitResult = () => {
  const list = UI.recruit || [];
  const got = list.filter(r => r.got).length;
  return sectionTitle('招贤所得', `<span class="tp">入伙 ${got} · 碎片 ${list.length - got}</span>`) +
    `<div class="frame tight">${list.map(r => {
      const t = DB.hero(r.hid);
      return `<div class="rcrow${t.q >= 5 ? ' hi' : ''}" data-action="hero" data-id="${r.hid}">
        <span class="face${qf(t.q)}">${hasPortrait(r.hid) ? porTag('por', r.hid)
                                                 : `<span class="weap">${weaponSvg(r.hid)}</span>`}</span>
        <b class="${QCLS[t.q]}">${esc(t.name)}</b>
        <span class="ti">${esc(titleOf(t))}</span>
        <span class="q ${QCLS[t.q]}">${QTXT[t.q]}</span>
        <span class="got">${r.got ? '新入伙' : r.token ? `满星 · 兵符 +${r.token}` : `碎片 +${r.frag}`}</span>
      </div>`;
    }).join('')}</div>
  <div class="btns"><div class="btn main" data-action="go" data-id="tavern">再　来</div>
    <div class="btn" data-action="go" data-id="heroes">看　人</div></div>`;
};

VIEWS.codex = () => {
  const all = DB.heroIds().filter(k => DB.hero(k).src !== '杂兵');
  const bySrc = {};
  all.forEach(k => (bySrc[DB.hero(k).src || '其他'] ||= []).push(k));
  const own = all.filter(k => G.heroes[k]).length;
  // 开篇说「名字收齐那天，石碣会从地里起出来」—— 这一页就是那块碑
  let html = `<div class="stele">
    <div class="st-t">石　碣</div>
    <div class="st-s">伏魔殿下掘出，字先刻好，人后来到${G.mode === 'chaos' ? '<br>本局混乱模式：人人的本事都是入伙时随机得来的' : ''}</div>
    <div class="st-n"><b>${own}</b> / ${all.length}</div>
  </div>`;
  for (const [src, ids] of Object.entries(bySrc)) {
    const o = ids.filter(k => G.heroes[k]).length;
    html += section('cx:' + src, `${src} ${o}/${ids.length}`,
      '<div class="codex">' +
      ids.sort((a, b) => DB.hero(b).q - DB.hero(a).q).map(k => {
        const t = DB.hero(k), has = !!G.heroes[k];
        const nm = has ? t.name : '？';
        const fit = nm.length >= 5 ? ' n5' : nm.length === 4 ? ' n4' : '';
        return `<span class="cx ${has ? QCLS[t.q] : 'no'}${fit}"
          ${has ? `data-action="hero" data-id="${k}"` : ''}>${esc(nm)}</span>`;
      }).join('') + '</div>');
  }
  return html + excCodexHtml();
};

/* V10.5 专属神兵图鉴：按主人分行，件名做成小牌，拿到的上色、没拿到的灰。点一件看面板与效果。 */
function ownedEq() {
  const set = new Set(Object.keys(G.items).filter(k => k.startsWith('eq_') && G.items[k] > 0).map(k => k.slice(3)));
  for (const h of Object.values(G.heroes)) for (const sl of SLOTS) if (h.equipment[sl]) set.add(h.equipment[sl]);
  return set;
}
function excCodexHtml() {
  const by = {};
  for (const id of DB.equipIds()) { const e = DB.equip(id); if (e && e.exclusive && DB.hero(e.exclusive)) (by[e.exclusive] ||= []).push(e); }
  const have = ownedEq();
  const owners = Object.keys(by).sort((a, b) => DB.hero(b).q - DB.hero(a).q || by[b].length - by[a].length);
  const total = owners.reduce((n, h) => n + by[h].length, 0);
  const got = owners.reduce((n, h) => n + by[h].filter(e => have.has(e.id)).length, 0);
  return section('cx:exc', `专属神兵 ${got}/${total}`,
    `<div class="frame tight">${owners.map(hid => {
      const t = DB.hero(hid);
      const list = by[hid].slice().sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
      const set = DB.excSet(hid), setN = set ? set.items.filter(id => have.has(id)).length : 0;
      return `<div class="exrow">
        <b class="${QCLS[t.q]}"${G.heroes[hid] ? ` data-action="hero" data-id="${hid}"` : ''}>${esc(t.name)}</b>
        <span class="pcs">${list.map(e => `<i class="${have.has(e.id) ? QCLS[e.q] : 'no'}" data-action="eq-info" data-id="${e.id}">${esc(e.name)}</i>`).join('')}</span>
        ${set ? `<em class="${setN === set.items.length ? 'on' : ''}">套 ${setN}/${set.items.length}</em>` : ''}
      </div>`;
    }).join('')}</div>`);
}
function openEquipInfo(eid) {
  const e = DB.equip(eid);
  if (!e) return;
  const who = e.exclusive ? DB.hero(e.exclusive) : null;
  const set = who ? DB.excSet(e.exclusive) : null;
  const have = ownedEq();
  const n = G.items['eq_' + eid] || 0;
  const worn = Object.keys(G.heroes).filter(h => SLOTS.some(sl => G.heroes[h].equipment[sl] === eid));
  $('modal').innerHTML = `<div class="sheet">
    <div class="shead"><span class="${QCLS[e.q]}">${esc(e.name)}</span>　<small>${QTXT[e.q]} · ${SLOT_NAME[e.slot] || e.slot}${e.weaponType ? ' · ' + esc(e.weaponType) : ''}</small></div>
    <div class="sbody">
      <div>${esc(eqTxt(e)) || '—'}</div>
      ${e.exclusive ? `<div class="mine">${esc(obTxt(e))}</div>` : ''}
      ${set ? `<div class="dim">套装 · ${esc(set.name)}（${set.items.filter(id => have.has(id)).length}/${set.items.length}）：${esc(set.fx.map(f => SkillText.fx(f)).join('；'))}</div>` : ''}
      <div class="dim">${worn.length ? worn.map(h => DB.hero(h).name).join('、') + ' 在用' : n ? `行囊里 ×${n}` : e.exclusive ? '还没拿到。Boss 关 3% 掉，铁匠铺也能碰运气' : '还没拿到'}</div>
    </div>
    <div class="btns"><div class="btn" data-action="modal-close">关　闭</div></div>
  </div>`;
  $('modal').classList.add('on');
}

/* ── 战斗视图与演出 ───────────────────────────────────────────────────── */

/* 状态印记。格子上看不出谁被眩、谁被夺了武，玩家就不知道战况为什么翻。
   控制类（眩乱）与持续伤害（血灼毒）永远显示；增减益在九人阵里让位给空间。*/
const ST_MARK = {
  stun:  ['眩', 'ctl'], chaos: ['乱', 'ctl'], silence: ['沉', 'ctl'], disarm: ['缚', 'ctl'],
  taunt: ['嘲', 'bf up'], vuln: ['伤', 'dot'], dodge: ['闪', 'bf up'],
  bleed: ['血', 'dot'], burn:  ['灼', 'dot'], poison: ['毒', 'dot'], wind: ['风', 'dot'],
};
function stHtml(u) {
  if (!u.alive) return '';
  let h = '';
  for (const k of Object.keys(ST_MARK))
    if (u.status[k]) h += `<i class="sm ${ST_MARK[k][1]}">${ST_MARK[k][0]}${k === 'poison' && u.status[k].n > 1 ? u.status[k].n : ''}</i>`;
  for (const k of ['atk', 'def', 'int', 'agi']) {
    const v = u.status['buff_' + k], d = u.status['debuff_' + k], lo = u.status['low_' + k];
    if ((v && v.val > 0) || (lo && lo.val > 0)) h += `<i class="sm bf up">${STAT_NAME[k]}▲</i>`;
    if (d && d.val > 0) h += `<i class="sm bf dn">${STAT_NAME[k]}▼</i>`;
  }
  return h;
}

const shPct = u => clamp(u.shield / u.maxHp * 100, 0, 100);
/* 数字折算（num）在引擎里，战报和格子共用同一套写法 */

function cellHtml(u, n) {
  const dead = !u.alive;
  const pct = clamp(u.hp / u.maxHp * 100, 0, 100);
  const por = hasPortrait(u.hid);
  return `<div class="cell${u.ally ? '' : ' foe'}${dead ? ' dead' : ''}" id="c${u.ally ? 'a' : 'f'}${u.idx}">
    ${por ? porTag('por' + qf(u.q), u.hid) : `<div class="por ph${qf(u.q)}">${weaponSvg(u.hid)}</div>`}
    <div class="st">${stHtml(u)}</div>
    <div class="cn">${esc(u.name)}</div>
    <div class="hpbar"><em style="width:${pct}%"></em><b style="width:${shPct(u)}%"></b></div>
    ${n <= 6 ? `<div class="num">${num(u.hp)} / ${num(u.maxHp)}</div>` : ''}
    <div class="fx"></div>
  </div>`;
}

VIEWS.battle = () => {
  const b = UI.battle;
  if (!b) return '<div class="empty">没有进行中的战斗</div>';
  // 二周目地煞星会给敌方多加人，超过九个按九人档排（样式只分到 9）
  const n = Math.min(9, Math.max(b.allies.length, b.foes.length));
  const done = !!b.settled;
  return `<div class="board${done ? ' done' : ''}" data-n="${n}">
    <div class="bhead"><span>第 <b id="rn">${b.round}</b> 回合</span>
      ${done ? '<span class="bend-h">战　罢</span>'
      : `<span class="spd" data-action="speed">${['slow', 'normal', 'fast'].map(k =>
        `<i class="${G.speed === k ? 'on' : ''}" data-action="speed" data-id="${k}">${CFG.speedTxt[k]}</i>`
      ).join('')}</span>`}</div>
    <div class="side-label">敌　方</div>
    <div class="grid" id="gfoe">${b.foes.map(u => cellHtml(u, n)).join('')}</div>
    <div class="vs">对　阵</div>
    <div class="side-label">我　方</div>
    <div class="grid" id="gally">${b.allies.map(u => cellHtml(u, n)).join('')}</div>
    ${done ? `<div class="bend">
      <div class="bend-t ${b.win ? 'win' : 'lose'}">${b.win ? '得　胜' : '败　绩'}</div>
      <div class="bend-s">共 ${b.round} 回合${b.result === 'timeout' ? ' · 三十回合没分出胜负，按伤亡算' : ''}</div>
      <div class="btns">
        <div class="btn" data-action="blog-full">${UI.logFull ? '收起战报' : '看战报'}</div>
        <div class="btn main" data-action="settle-go">结　算</div>
      </div></div>` : ''}
    <div class="log${done && UI.logFull ? ' full' : ''}" id="blog">${done ? logHtml(b.log, !UI.logFull) : ''}</div>
    ${done ? boardHtml(b) : ''}
  </div>`;
};

/* 战报：tail 为真时只取最后两回合（演出中滚动用），否则整场 */
function logHtml(all, tail) {
  let cut = all;
  if (tail) {
    cut = [];
    let seen = 0;
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].c === 'r' && ++seen > 2) break;
      cut.unshift(all[i]);
      if (cut.length > 40) break;
    }
  }
  return cut.map(l => `<div class="${l.c}">${logLine(l.s)}</div>`).join('');
}
/* 名字上色：{a|名} 我方、{f|名} 敌方 */
function logLine(s) {
  return esc(s).replace(/\{([af])\|([^}]+)\}/g, (m, side, n) => `<b class="ln-${side}">${n}</b>`);
}
/* 榜单：输出 / 承伤 / 治疗各前五，我方一张、敌方一张（V10.6） */
function boardHtml(b) {
  const col = (t, list) => `<div class="bd-col"><i>${t}</i>${list.length ? list.map((x, i) =>
    `<span class="r${i}"><em>${esc(x.name)}</em><u>${num(x.v)}</u></span>`).join('') : '<span class="none">—</span>'}</div>`;
  const one = (side, label) => { const bd = Battle.board(b, side);
    return `<div class="bd-side ${side}">${label}</div><div class="board-mvp">${col('输出', bd.dealt)}${col('承伤', bd.taken)}${col('治疗', bd.healed)}</div>`; };
  return one('allies', '我　方') + one('foes', '敌　方');
}

function openBattleLog() {
  const b = UI.battle;
  if (!b) return;
  $('modal').innerHTML = `<div class="sheet">
    <div class="shead">战　报 · ${esc(stName(b.stage.name))}</div>
    <div class="scroll log full" id="mlog">${logHtml(b.log)}${b.over ? boardHtml(b) : ''}</div>
    <div class="btns"><div class="btn" data-action="modal-close">关　闭</div></div>
  </div>`;
  $('modal').classList.add('on');
  const m = $('mlog'); if (m) m.scrollTop = 0;
}

VIEWS.result = () => {
  const b = UI.battle, r = UI.rewards || [];
  const dlg = DB.dialog(b.sid);
  const win = b.win;
  return `<div class="frame result">
    <div class="rtitle ${win ? 'win' : 'lose'}">${win ? '得　胜' : '败　绩'}</div>
    <div class="rsub">${esc(stName(b.stage.name))} · 共 ${b.round} 回合${
      b.result === 'timeout' ? '（三十回合没分出胜负，按伤亡算）' : ''}</div>
    ${dlg ? `<div class="rdlg">${esc(win ? (dlg.after_win || '') : (dlg.after_lose || ''))}</div>` : ''}
    ${win ? `<div class="rlist">${r.map(o =>
      `<div class="ritem"><i>${o.icon}</i><span class="${o.c}">${esc(o.text)}</span></div>`).join('')}</div>`
      : '<div class="rdlg">整顿人马，练几级、换身装备，再来一趟。</div>'}
    <div class="btns">
      ${win && !G.seenEpi && DB.story.epilogue && Lap.done()
        ? '<div class="btn main" data-action="epilogue">尾　声</div>'
        : '<div class="btn main" data-action="go" data-id="stages">回关隘</div>'}
      <div class="btn" data-action="fight" data-id="${b.sid}">再战一场</div>
    </div>
    <div class="btns"><div class="btn" data-action="blog-modal">战　报</div></div>
  </div>`;
};

const cellOf = (ally, idx) => $('c' + (ally ? 'a' : 'f') + idx);
/* 重复触发同一个类要先摘掉再强制回流，否则动画只播第一次 */
function flash(el, cls, ms) {
  if (!el) return;
  const list = cls.split(' ');
  el.classList.remove(...list); void el.offsetWidth; el.classList.add(...list);
  setTimeout(() => el.classList.remove(...list), ms);
}

/* 逐回合播放 */
/* 把一回合的事件切成「拍」：一个人出一次手，连着他这一手造成的伤害，算一拍。
   十七件事平铺是十七下心跳，切成拍就是九下，每下里面是一件完整的事。 */
function toBeats(ev) {
  const out = [];
  for (const e of ev) {
    if (e.k === 'round') continue;
    const last = out[out.length - 1];
    if (e.k === 'cast') { out.push({ from: { i: e.t, a: e.ally }, name: e.name, evs: [e] }); continue; }
    const from = e.s != null ? { i: e.s, a: e.sa } : null;
    const same = last && last.from && from && last.from.i === from.i && last.from.a === from.a;
    if (last && (same || e.k === 'die' || (!from && !last.closed))) last.evs.push(e);
    else out.push({ from, name: null, evs: [e] });
  }
  return out;
}

/* 一拍该停多久：出了人命、暴击、群攻的拍子值得多看两眼，
   例行的一刀一枪扫过去就行。 */
function beatWeight(bt) {
  let w = 1;
  const hits = bt.evs.filter(e => e.k === 'dmg' || e.k === 'heal').length;
  const kills = bt.evs.filter(e => e.k === 'die').length;
  if (bt.name) w += 0.55;                       // 有技能名，得给人读的时间
  if (hits > 2) w += 0.45;                      // 群攻
  if (bt.evs.some(e => e.tag === 'crit')) w += 0.6;
  if (bt.evs.some(e => e.k === 'heal')) w += 0.3;
  w += 1.1 * kills;
  return w;
}

const Play = {
  tok: 0,
  start(sid) {
    const b = Battle.create(sid);
    if (!b || !b.allies.length) { toast('先去布阵'); return; }
    UI.battle = b; UI.view = 'battle'; UI.playing = true; UI.logFull = false; this.tok++;
    this.shown = 0;
    render();
    this.step();
  },

  /** 打到后面回合数多，节奏自然该收一收 —— 开场看得清，鏖战不拖沓 */
  rate(round) {
    const s = CFG.speeds[G.speed] || 1;
    const decay = round <= 6 ? 1 : round <= 12 ? 0.9 : round <= 20 ? 0.8 : 0.7;
    return CFG.beatBase * s * decay;
  },

  /** 丢掉排队中的演出，画面直接对齐引擎里的当前状态，随即继续 */
  resync() {
    this.tok++;
    const b = UI.battle;
    if (!b) return;
    for (const u of [...b.allies, ...b.foes]) this.sync(u, u.hp);
    this.log(b);
    if (b.over) { setTimeout(() => this.finish(), 240); return; }
    setTimeout(() => this.step(), 120);
  },

  step() {
    const b = UI.battle;
    if (!b || b.over) return this.finish();
    const ev = Battle.runRound(b);
    const span = this.paint(b, ev);
    if (b.over) { setTimeout(() => this.finish(), span); return; }
    setTimeout(() => this.step(), span);
  },

  paint(b, ev) {
    // 每回合一个令牌：改了速度或进了下一回合，上一批排队的定时器一律作废，
    // 否则旧血量会把已经推进的战况倒着写回去。
    const tok = ++this.tok;
    const rn = $('rn');
    if (rn) { rn.textContent = b.round; rn.classList.remove('beat'); void rn.offsetWidth; rn.classList.add('beat'); }
    const units = [...b.allies, ...b.foes];
    const key = u => (u.ally ? 'a' : 'f') + u.idx;

    // 倒着走一遍，算出每一件事发生后该显示多少血
    const hp = {};
    for (const u of units) hp[key(u)] = u.hp;
    const shot = new Map();
    for (let i = ev.length - 1; i >= 0; i--) {
      const e = ev[i];
      if (e.k !== 'dmg' && e.k !== 'heal') continue;
      const k = (e.ally ? 'a' : 'f') + e.t;
      shot.set(e, hp[k]);
      hp[k] += (e.k === 'dmg') ? Math.max(0, e.v - (e.absorbed || 0)) : -e.v;
    }
    for (const u of units) if (u.alive || hp[key(u)] > 0) this.sync(u, hp[key(u)], true);

    const bts = toBeats(ev);
    const unit = w => Math.max(18, this.rate(b.round) * w);
    let t = 0;
    for (const bt of bts) {
      const at = t, dur = unit(beatWeight(bt));
      // 高亮只活到这一拍结束 —— 否则三拍的金边叠在一起，还是看不出谁在出手
      setTimeout(() => { if (this.tok === tok) this.playBeat(b, bt, shot, dur); }, at);
      t += dur;
    }
    setTimeout(() => { if (this.tok !== tok) return;
      for (const u of units) this.sync(u, u.hp); this.log(b); }, t + 40);
    const sp = CFG.speeds[G.speed] || 1;
    return Math.max(CFG.roundMin * sp, t + Math.round(CFG.roundDelay * sp * 0.5));
  },

  /** 放一拍：出手方前倾，技能名浮出，伤害逐个落下，战报同步往下写 */
  playBeat(b, bt, shot, dur) {
    const hold = Math.max(180, Math.min(1500, (dur || 300) * 0.88));
    let li = 0;
    for (const e of bt.evs) {
      if (e.li != null) li = Math.max(li, e.li);
      const el = cellOf(e.ally, e.t);
      if (!el) continue;
      const fx = el.querySelector('.fx');
      if (e.k === 'cast') {
        const f = document.createElement('div');
        f.className = 'castname'; f.textContent = e.name;
        fx.appendChild(f);
        setTimeout(() => f.remove(), hold);
        flash(el, 'acting', hold);
      } else if (e.k === 'dmg' || e.k === 'heal') {
        const f = document.createElement('div');
        f.className = 'float' + (e.k === 'heal' ? ' heal' : '') + (e.tag === 'crit' ? ' crit' : '');
        f.textContent = (e.k === 'heal' ? '+' : '−') + num(e.v);
        fx.appendChild(f);
        setTimeout(() => f.remove(), hold);
        flash(el, e.tag === 'crit' ? 'hit crit' : 'hit', Math.min(hold, 460));
        if (e.s != null) flash(cellOf(e.sa, e.s), 'strike', Math.min(hold, 340));
        const u = (e.ally ? b.allies : b.foes)[e.t];
        if (u && shot.has(e)) this.sync(u, shot.get(e), true);
      } else if (e.k === 'die') {
        flash(el, 'fell', Math.max(hold, 700));
        el.classList.add('dead');
      } else if (e.k === 'miss') {
        const f = document.createElement('div');
        f.className = 'float miss'; f.textContent = '闪';
        fx.appendChild(f);
        setTimeout(() => f.remove(), hold);
      } else if (e.k === 'st') {
        flash(el, 'hit', Math.min(hold, 300));
        const u = (e.ally ? b.allies : b.foes)[e.t];
        const st = el.querySelector('.st');
        if (u && st) st.innerHTML = stHtml(u);
      }
    }
    if (li) this.log(b, li);
  },

  /** 把一个人的血条、护盾、状态、生死同步到指定血量 */
  sync(u, hpVal, keepAlive) {
    const el = cellOf(u.ally, u.idx);
    if (!el) return;
    el.classList.toggle('dead', !u.alive && !(keepAlive && hpVal > 0));
    const bar = el.querySelector('.hpbar em');
    if (bar) bar.style.width = clamp(hpVal / u.maxHp * 100, 0, 100) + '%';
    const shb = el.querySelector('.hpbar b');
    if (shb) shb.style.width = (hpVal > 0 ? shPct(u) : 0) + '%';
    const box = el.querySelector('.num');
    if (box) box.textContent = `${num(Math.max(0, hpVal))} / ${num(u.maxHp)}`;
    const st = el.querySelector('.st');
    if (st) { const h = stHtml(u); if (st.innerHTML !== h) st.innerHTML = h; }
  },

  /* 战报跟着画面走：只写到这一拍为止，写完自动滚到底 */
  log(b, upto) {
    const lg = $('blog');
    if (!lg) return;
    lg.innerHTML = logHtml(upto ? b.log.slice(0, upto) : b.log, true);
    lg.scrollTop = lg.scrollHeight;
  },

  /* 打完先停在战场上，让人看一眼战况、翻翻战报，按「结算」才去结算页。
     奖励和伤病这一刻就记进存档 —— 不点结算直接走开，东西也不会丢。 */
  finish() {
    const b = UI.battle;
    if (!b || b.settled) return;
    this.tok++;
    UI.playing = false;
    UI.rewards = Stages.settle(b);
    b.settled = true;
    if (UI.view !== 'battle') { toast(b.win ? '刚才那一仗打赢了，东西已入囊' : '刚才那一仗输了'); return; }
    render();
    const lg = $('blog'); if (lg) lg.scrollTop = lg.scrollHeight;
  },
};

/* ── 装备选择弹层 ─────────────────────────────────────────────────────── */

function openEquipPick(hid, slot) {
  const list = Grow.bagEquips(slot);
  $('modal').innerHTML = `<div class="sheet">
    <div class="shead">选一件${SLOT_NAME[slot]}</div>
    <div class="scroll">
    ${list.length ? list.map(e => `<div class="opt" data-action="equip-do"
        data-id="${hid}" data-slot="${slot}" data-eid="${e.id}">
        <b class="${QCLS[e.q]}">${esc(e.name)}</b>
        <span>${esc(eqTxt(e))}${e.exclusive
          ? `<em class="${e.exclusive === hid ? 'mine' : ''}">专属 · ${esc(obTxt(e))}</em>` : ''}</span>
        <span class="n">×${G.items['eq_' + e.id]}</span></div>`).join('')
      : '<div class="empty">背囊里没有这一类</div>'}
    </div>
    <div class="btns"><div class="btn" data-action="modal-close">关　闭</div></div>
  </div>`;
  $('modal').classList.add('on');
}
const closeModal = () => { $('modal').classList.remove('on'); $('modal').innerHTML = ''; };

/* 自家的确认框。原来用的是浏览器的 confirm()：样式跟整套界面是两回事，
   而且装成桌面／主屏应用之后，有的壳子干脆不弹，按下去像没反应。 */
let askYes = null;
function ask(title, body, yesTxt, fn) {
  askYes = fn;
  $('modal').innerHTML = `<div class="sheet">
    <div class="shead">${esc(title)}</div>
    <div class="sbody">${esc(body)}</div>
    <div class="btns">
      <div class="btn" data-action="modal-close">算　了</div>
      <div class="btn warn" data-action="ask-yes">${esc(yesTxt)}</div>
    </div>
  </div>`;
  $('modal').classList.add('on');
}

/* 用东西之前先挑人。经验书挑谁都行，伤药只列身上带伤的 —— 
   列一堆没伤的人让玩家自己找，是另一种不体贴。 */
function openUsePick(key) {
  const it = DB.item(key) || {};
  const cure = it.type === 'cure';
  let list = Object.keys(G.heroes);
  if (cure) list = list.filter(h => Hurt.of(h).lv && (Hurt.of(h).lv < 2 || (it.v || 1) >= 2));
  else list = list.filter(h => G.heroes[h].lv < Lap.maxLv());
  list.sort((a, b) => cure ? (Hurt.of(b).lv - Hurt.of(a).lv) || (Stats.heroPower(b) - Stats.heroPower(a))
                           : (G.heroes[a].lv - G.heroes[b].lv));

  $('modal').innerHTML = `<div class="sheet">
    <div class="shead">${esc(it.name)}　用在谁身上</div>
    <div class="scroll">
    ${list.length ? list.map(h => {
      const t = DB.hero(h), g = G.heroes[h], u = Hurt.of(h);
      return `<div class="opt" data-action="use-do" data-id="${key}" data-hid="${h}">
        <b class="${QCLS[t.q]}">${esc(t.name)}</b>
        <span>${cure ? (u.lv === 2 ? '重伤' : '轻伤') + `　还需休养 ${u.rest} 场`
                     : `Lv.${g.lv}　经验 ${Math.round(g.exp)} / ${CFG.expNeed(g.lv)}`}</span>
      </div>`;
    }).join('')
      : `<div class="empty">${cure ? '没人需要它' : '都满级了'}</div>`}
    </div>
    <div class="btns"><div class="btn" data-action="modal-close">关　闭</div></div>
  </div>`;
  $('modal').classList.add('on');
}

/* ── 渲染入口 ─────────────────────────────────────────────────────────── */

/* 换了页面（或换了人）才回到顶上；同一页里的操作（配、卸、操练、升星……）重画后留在原处。
   原来每次都 scrollTo(0,0)：详情页往下翻到装备栏点「卸」，页面一下跳回顶上，
   手指下面换成了别的按钮，看着像没点中，接着再点就点到别处去了。 */
function render() {
  renderTop();
  const key = UI.view + '|' + (UI.sel || '');
  const y = key === render.key ? window.scrollY : 0;
  const fn = VIEWS[UI.view] || VIEWS.main;
  $('content').innerHTML = fn();
  window.scrollTo(0, y);
  render.key = key;
}
function go(v) { UI.view = v; UI.sel = null; render.key = null; render(); }

/* ── 事件委托（全局唯一） ─────────────────────────────────────────────── */

/* ── 布阵拖动 ──────────────────────────────────────────────────────────
   手机上是主战场，所以不用 HTML5 的 dragstart（移动端支持得一塌糊涂），
   统一走 pointer 事件：按住不动 180 毫秒才算「拿起来」，
   免得轻轻一点就被判成拖拽，点进详情页反而进不去。 */
const Drag = {
  from: -1, el: null, ghost: null, armed: false, timer: 0,

  start(ev) {
    const cell = ev.target.closest('.tslot');
    if (!cell || !$('tgrid') || cell.classList.contains('empty')) return;
    const slot = +cell.dataset.slot;
    if (!(slot >= 0)) return;
    this.from = slot; this.el = cell; this.armed = false; this.moved = false;
    this.x0 = ev.clientX; this.y0 = ev.clientY;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.armed = true;
      cell.classList.add('lifting');
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    }, 320);
  },

  move(ev) {
    if (this.from < 0) return;
    const dx = ev.clientX - this.x0, dy = ev.clientY - this.y0;
    if (!this.armed) {
      // 按住之前就滑走了，当成翻页，取消这次拖拽
      if (dx * dx + dy * dy > 144) this.cancel();
      return;
    }
    ev.preventDefault();
    if (dx * dx + dy * dy > 144) this.moved = true;
    this.el.style.transform = `translate(${dx}px,${dy}px)`;
    this.el.style.zIndex = 20;
    const over = this.under(ev);
    for (const n of document.querySelectorAll('.tslot.over')) n.classList.remove('over');
    if (over && over !== this.el) over.classList.add('over');
  },

  under(ev) {
    const n = document.elementFromPoint(ev.clientX, ev.clientY);
    return n && n.closest ? n.closest('.tslot') : null;
  },

  end(ev) {
    clearTimeout(this.timer);
    if (this.from < 0) return;
    const armed = this.armed, from = this.from, moved = this.moved, hid = this.el && this.el.dataset.id;
    const target = armed ? this.under(ev) : null;
    this.cancel();
    if (!armed) return;
    this.justDragged = true;
    setTimeout(() => { this.justDragged = false; }, 60);
    // V10.4：按得稍久但没挪窝，就是一次点按。原来按住超过 180ms 就算「拿起来」，
    // 手机上正常一点也常常超过这个数，松手后跳不进详情页，得再点一次
    if (!moved) { if (hid) openHero(hid); return; }
    if (target && +target.dataset.slot >= 0 && +target.dataset.slot !== from) {
      const e = Grow.swapTeam(from, +target.dataset.slot);
      if (e) toast(e);
      render();
    } else render();
  },

  cancel() {
    clearTimeout(this.timer);
    if (this.el) { this.el.style.transform = ''; this.el.style.zIndex = ''; this.el.classList.remove('lifting'); }
    for (const n of document.querySelectorAll('.tslot.over')) n.classList.remove('over');
    this.from = -1; this.el = null; this.armed = false;
  },
};
document.addEventListener('pointerdown', ev => Drag.start(ev));
document.addEventListener('pointermove', ev => Drag.move(ev), { passive: false });
document.addEventListener('pointerup', ev => Drag.end(ev));
document.addEventListener('pointercancel', () => Drag.cancel());
/* 手机上光在 pointermove 里 preventDefault 拦不住滚动：手指一动浏览器就接管去滚页面，
   随手发一个 pointercancel，拖拽当场作废。得在 touchmove 上拦（必须非 passive）。
   只在「已经拿起来」之后拦，没按够时间就滑，照样是翻页。 */
document.addEventListener('touchmove', ev => {
  if (Drag.from >= 0 && Drag.armed && ev.cancelable) ev.preventDefault();
}, { passive: false });
/* 长按立绘会弹出存图菜单，也会打断拖拽 */
document.addEventListener('contextmenu', ev => {
  if (ev.target.closest && ev.target.closest('.tslot')) ev.preventDefault();
});

document.addEventListener('click', ev => {
  // 刚拖完那一下不要再当成点击，否则松手就跳进详情页
  if (Drag.justDragged) { Drag.justDragged = false; ev.stopPropagation(); return; }
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action, id = el.dataset.id, slot = el.dataset.slot;
  ev.stopPropagation();

  switch (a) {
    case 'go': go(id); break;
    case 'hero': openHero(id); break;
    case 'hero-step': stepHero(+id); break;
    case 'stage': {
      const st = DB.stage(id), ch = st && st.ch;
      const card = ch && !G.seenCh[ch] ? DB.chapterCard(ch) : null;
      if (card) { UI.card = { ch, title: card.title, lines: card.lines, scene: card.scene, then: id }; UI.view = 'chapcard'; }
      else { UI.stage = id; UI.view = 'stage'; }
      render(); break;
    }
    case 'intro-skip': clearTimeout(Play.introTimer); afterIntro(); break;
    case 'mode-pick': initGame(id); Save.write(); UI.view = 'intro'; render(); startCrawl(); break;
    case 'gift-done': go('main'); break;
    case 'replay-intro': UI.view = 'intro'; render(); startCrawl(); break;
    case 'epilogue': UI.view = 'epilogue'; render(); break;
    case 'epi-done': G.seenEpi = true; Save.write(); go('main'); break;
    case 'card-done': {
      const c = UI.card; UI.card = null;
      if (c) { G.seenCh[c.ch] = true; Save.write(); }
      if (c && c.then) { UI.stage = c.then; UI.view = 'stage'; }
      else UI.view = 'stages';
      render(); break;
    }
    case 'fight': closeModal(); Play.start(id); break;
    // 通过的关卡回头再刷时不必再看一遍演出
    case 'sweep': {
      closeModal();
      const b = Battle.create(id);
      if (!b || !b.allies.length) { toast('先去布阵'); break; }
      Battle.runAll(b);
      UI.battle = b; UI.rewards = Stages.settle(b); b.settled = true; UI.view = 'result'; UI.playing = false;
      render(); break;
    }
    case 'speed': {
      // 换速度立刻生效：作废排队中的定时器，剩下的事件按新节奏重排
      const order = ['slow', 'normal', 'fast'];
      G.speed = id && order.includes(id) ? id
              : order[(order.indexOf(G.speed) + 1) % order.length];
      Save.write();
      const box = document.querySelector('.spd');
      if (box) box.querySelectorAll('i').forEach(n =>
        n.classList.toggle('on', n.dataset.id === G.speed));
      // 换挡要立刻见效：作废排队中的拍子，把画面对齐当前战况，马上进下一回合。
      // 否则按了「疾」还得等这一回合按旧节奏磨完。
      if (UI.playing && UI.battle) Play.resync();
      break;
    }
    case 'levelup': { const e = Grow.levelUp(id); toast(e || '练成一级'); render(); break; }
    case 'drillmax': {
      const r = Grow.drillMax(id);
      toast(r.n ? `连练 ${r.n} 级，花了 ${r.spent.toLocaleString()} 银 —— ${r.why}` : (r.why || '练不动了'));
      render(); break;
    }
    case 'cure': { const e = Hurt.cure(id); toast(e || '伤好了'); render(); break; }
    case 'auto-team': { const e = Grow.autoTeam(); toast(e || '已按战力排好，耐揍的站前排'); render(); break; }
    case 'fold': { G.fold[id] = !G.fold[id]; Save.write(); render(); break; }
    case 'hsort': UI.hsort = id; render(); break;
    case 'fate-reroll': { const e = Fate.reroll(id); toast(e || '换了一颗'); render(); break; }
    case 'use-item': {
      const it = DB.item(id) || {};
      // 大还丹是全军一起的，不用挑人
      if (it.type === 'cure' && (it.v || 0) >= 9) {
        const r = Grow.useItem(id, null);
        toast(typeof r === 'string' ? r : r.ok); render();
      } else openUsePick(id);
      break;
    }
    case 'use-do': {
      const r = Grow.useItem(id, el.dataset.hid);
      closeModal();
      toast(typeof r === 'string' ? r : r.ok);
      render(); break;
    }
    case 'lap-next':
      ask(`开 ${Lap.now() + 1} 周目`,
          `人、等级、星级、装备、银两、符都留着，关隘进度清零重走。`
          + `等级上限 ${Lap.maxLv()} 抬到 ${Lap.maxLv(Lap.now() + 1)}，`
          + `星级 ${Lap.maxStar()} 抬到 ${Lap.maxStar(Lap.now() + 1)}，敌方也跟着强一截。`
          + `开局会亮三颗宿星。`,
          '重整旗鼓', () => {
            const e = Lap.next();
            if (e) { toast(e); return; }
            go('main');
            toast(`${Lap.now()} 周目，宿星已定`);
          });
      break;
    case 'hfilt': UI.hfilt = id; render(); break;
    case 'starup': { const e = Grow.starUp(id); toast(e || '升星了'); render(); break; }
    case 'team': { const e = Grow.addToTeam(id); toast(e || '已上阵'); render(); break; }
    case 'unteam': { const e = Grow.removeFromTeam(id); toast(e || '已下阵'); render(); break; }
    case 'equip-pick': openEquipPick(id, slot); break;
    case 'equip-do': { const e = Grow.equip(id, slot, el.dataset.eid); closeModal(); toast(e || '换好了'); render(); break; }
    case 'unequip': { const e = Grow.unequip(id, slot); toast(e || '已卸下'); render(); break; }
    case 'modal-close': closeModal(); break;
    case 'settle-go': if (UI.battle && UI.battle.settled) { UI.view = 'result'; render(); } break;
    case 'blog-full': {
      UI.logFull = !UI.logFull;
      render();
      const lg = $('blog');
      if (lg) {
        lg.scrollTop = lg.scrollHeight;
        if (UI.logFull) lg.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      break;
    }
    case 'blog-modal': openBattleLog(); break;
    case 'pwa-install': Pwa.install(); break;
    case 'pwa-later': Pwa.later(); break;
    case 'pwa-offer': Pwa.offer(); break;
    case 'pwa-reload': Pwa.reload(); break;
    case 'recruit': {
      const r = Grow.recruit(+id);
      if (r.err) { toast(r.err); break; }
      UI.recruit = r.list; UI.view = 'recruitResult'; render(); break;
    }
    case 'gold': {
      const r = Grow.goldExchange();
      if (r.err) { toast(r.err); break; }
      UI.recruit = r.list; UI.view = 'recruitResult'; render(); break;
    }
    case 'forge': {
      const r = Grow.forge(+id);
      if (r.err) { toast(r.err); break; }
      UI.forge = r.list; UI.view = 'forgeResult'; render(); break;
    }
    case 'eq-info': openEquipInfo(id); break;
    case 'copy-wx': {
      const wx = 'lynchrrr';
      const done = () => toast('微信号复制好了：' + wx);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(wx).then(done, () => toast('微信号：' + wx));
      else toast('微信号：' + wx);
      break;
    }
    case 'auto-equip': {
      const r = Grow.autoEquip();
      toast(r.err ? r.err : r.put ? `配了 ${r.put} 件，换下 ${r.swapped} 件` : '行囊里没有更好的');
      render(); break;
    }
    case 'strip-team': {
      const r = Grow.stripTeam();
      toast(r.n ? `卸下 ${r.n} 件，都回行囊了` : '身上本来就是空的');
      render(); break;
    }
    case 'reset':
      ask('重开一局', '这一局的将、银两、通关进度会全部清掉，回不来。', '清掉，重来', () => {
        Save.wipe(); UI.view = 'mode'; render(); toast('重开了，选个模式');
      });
      break;
    case 'ask-yes': { const fn = askYes; askYes = null; closeModal(); if (fn) fn(); break; }
  }
});

/* ── 详情页左右切换：手机横滑、电脑方向键 ─────────────────────────────
   只认横向为主的一划，竖着翻页不受影响。 */
const Swipe = { x: 0, y: 0, on: false };
// 用 touch 事件而不用 pointer：手指一动浏览器就接管滚动，pointer 那头会被 cancel 掉
document.addEventListener('touchstart', ev => {
  if (UI.view !== 'hero' || ev.touches.length !== 1 || !ev.target.closest('#hdetail')) return;
  Swipe.on = true; Swipe.x = ev.touches[0].clientX; Swipe.y = ev.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', ev => {
  if (!Swipe.on) return;
  Swipe.on = false;
  const t = ev.changedTouches[0];
  const dx = t.clientX - Swipe.x, dy = t.clientY - Swipe.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) stepHero(dx < 0 ? 1 : -1);
}, { passive: true });
document.addEventListener('keydown', ev => {
  if (UI.view !== 'hero' || $('modal').classList.contains('on')) return;
  if (ev.key === 'ArrowLeft') stepHero(-1);
  else if (ev.key === 'ArrowRight') stepHero(1);
});

/* ── 启动 ─────────────────────────────────────────────────────────────── */

function boot() {
  const s = Save.read();
  if (s) {
    Object.assign(G, {
      heroes: s.heroes || {}, items: s.items || {}, frags: s.frags || {},
      cleared: s.cleared || {}, team: (s.team || []).filter(h => s.heroes && s.heroes[h]),
      res: Object.assign({ silver: CFG.startSilver, gold: 0, token: 0 }, s.res || {}),
      fold: s.fold || {},
      log: s.log || [], clearCount: s.clearCount || 0, pity: s.pity || { ten: 0, fifty: 0 },
      speed: s.speed || 'normal', seenIntro: !!s.seenIntro, seenCh: s.seenCh || {}, seenEpi: !!s.seenEpi,
      // 老存档没有这三个字段，按一周目读，一切照旧
      lap: s.lap || 1, fates: s.fates || [], everCleared: s.everCleared || {},
      // V10.3：模式与开局赠将。老存档按传统读，没有入伙卡可看
      mode: s.mode === 'chaos' ? 'chaos' : 'classic', startGift: s.startGift || null, giftShown: !!(s.giftShown || !s.startGift),
    });
    for (const h of Object.values(G.heroes)) {
      const t = DB.hero(h.hid) || {};
      h.base0 ||= { atk: t.atk, def: t.def, int: t.int, agi: t.agi, hp: t.hp };
      h.equipment ||= { weapon: null, armor: null, helmet: null, mount: null, special: null };
      h.owned ||= skillIdsOf(h.hid, h).slice(0, 1);
    }
    if (!G.team.length) G.team = Object.keys(G.heroes).slice(0, 2);
    Save.migrate(); Save.write();
    if (!G.seenIntro) { UI.view = 'intro'; render(); startCrawl(); }
    else render();
  } else {
    // 没有存档：先选模式，选完再开局
    UI.view = 'mode'; render();
  }
  window.addEventListener('beforeunload', () => Save.write());
}

/* 供回归测试调用 */
window.G = G; window.UI = UI; window.CFG = CFG;
window.DB = DB; window.Stats = Stats; window.Battle = Battle;
window.Grow = Grow; window.Stages = Stages; window.Save = Save;
window.render = render; window.go = go; window.makeHero = makeHero; window.initGame = initGame;
window.grownBase = grownBase; window.growStep = growStep; window.GROW_KEYS = GROW_KEYS;
window.Hurt = Hurt; window.Guide = Guide; window.Lap = Lap; window.Fate = Fate;

document.addEventListener('DOMContentLoaded', boot);
