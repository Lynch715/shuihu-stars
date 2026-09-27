#!/usr/bin/env node
/**
 * V10.8.2 功名手动领奖 · 探针
 *   node probe_achv_claim.js <html 路径>
 * 达成不入账 → 结算单「领取」→ 弹窗入账 → 不能重复领 → 功名簿单领、全部领取
 * → 聚义页待领横条与跳转 → V10.8 老存档读入不重复发。
 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const FILE = path.resolve(process.argv[2] || 'index.html');
const OUT = path.dirname(FILE);
const URL = 'file://' + FILE;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 390, height: 800 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.evaluate(() => localStorage.clear()); await pg.reload();
  await pg.click('[data-action=mode-pick][data-id=classic]');
  await pg.evaluate(() => { G.seenIntro = true; G.giftShown = true; Save.write(); UI.view = 'main'; render(); });
  const res = () => pg.evaluate(() => ({ gold: G.res.gold, token: G.res.token, silver: G.res.silver }));

  console.log('一、打一仗，结算单上领');
  const s = await pg.evaluate(() => {
    let b;
    for (let i = 0; i < 30; i++) { b = Battle.create('ch1_1'); let g = 0; while (!b.over && g++ < 200) Battle.runRound(b); if (b.win) break; }
    G.stats.wins = 99;   // 这一仗打赢正好「胜 100 场」
    UI.battle = b; UI.rewards = Stages.settle(b); b.settled = true; UI.view = 'result'; render();
    return { win: b.win, pend: Achv.pending().map(a => a.id), ach: UI.rewards.filter(o => o.ach).map(o => o.text) };
  });
  ok(s.win, '打赢了 ch1_1');
  ok(s.ach.length > 0, '结算单有功名行：' + s.ach.join(' / '));
  ok(s.pend.includes('win100'), '「胜 100 场」达成后是待领，没自动发');
  ok(!s.ach.some(t => t.includes('奖')), '结算单不再写「奖 …」');
  const nClaimBtn = await pg.$$eval('.ritem .aclaim', e => e.length);
  ok(nClaimBtn === s.ach.length, `结算单 ${nClaimBtn} 个「领取」`);
  await pg.screenshot({ path: OUT + '/shot_result.png', fullPage: true });
  const before = await res();
  const aid = 'win100';
  const rw = await pg.evaluate(id => Achv.reward(Achv.list().find(a => a.id === id)), aid);
  await pg.click('.ritem .aclaim[data-id=win100]');
  ok(await pg.isVisible('#modal.on .achvclaim'), '点了弹出领奖卡');
  const after = await res();
  ok(after.gold - before.gold === (rw.gold || 0) && after.token - before.token === (rw.token || 0) && after.silver - before.silver === (rw.silver || 0),
    `入账与奖励一致：${JSON.stringify(rw)}`);
  const card = await pg.textContent('#modal .achvclaim');
  ok(/→/.test(card), '弹窗写前后数值：' + card.replace(/\s+/g, ' ').trim());
  await pg.screenshot({ path: OUT + '/shot_claim_one.png' });
  await pg.click('[data-action=modal-close]');
  ok(await pg.$eval(`.ritem .adone`, e => e.textContent) === '已领', '结算单那行变「已领」');
  const again = await pg.evaluate(id => Achv.claim(id).err, aid);
  ok(again && again.includes('领过'), '重复领被拒：' + again);

  console.log('二、聚义页横条 → 功名簿');
  await pg.evaluate(() => { G.res.silver = 1e9; while (Object.keys(G.heroes).length < 40) Grow.recruit(10); Save.write(); go('main'); });
  const pend = await pg.evaluate(() => Achv.pending().length);
  const bar = await pg.$('.achvnew');
  ok(pend >= 2 && bar && (await bar.textContent()).includes('待领 ' + pend), `聚义页横条写待领 ${pend}`);
  await pg.click('.achvnew');
  ok(await pg.evaluate(() => UI.view === 'codex' && !G.fold.achv), '跳到图鉴，功名簿展开');
  const top = await pg.$eval('.sec[data-id="achv"]', e => e.getBoundingClientRect().top);
  ok(Math.abs(top) < 60, `功名簿滚到顶上（距顶 ${Math.round(top)}px）`);
  ok(await pg.$$eval('.achv.todo', e => e.length) === pend, '待领的条目都标了出来');
  await pg.screenshot({ path: OUT + '/shot_codex.png' });

  const t0 = await res();
  const tot = await pg.evaluate(() => Achv.pending().reduce((s, a) => { const r = Achv.reward(a); s.gold += r.gold || 0; s.token += r.token || 0; s.silver += r.silver || 0; return s; }, { gold: 0, token: 0, silver: 0 }));
  await pg.click('[data-action=achv-claim-all]');
  const t1 = await res();
  ok(t1.gold - t0.gold === tot.gold && t1.token - t0.token === tot.token && t1.silver - t0.silver === tot.silver, `全部领取入账合计一致 ${JSON.stringify(tot)}`);
  ok(await pg.isVisible('#modal.on .achvclaim .cl-list'), '全部领取弹清单');
  await pg.screenshot({ path: OUT + '/shot_claim_all.png' });
  await pg.click('[data-action=modal-close]');
  ok(await pg.evaluate(() => Achv.pending().length) === 0, '领完没有待领');
  await pg.evaluate(() => go('main'));
  ok(!(await pg.$('.achvnew')), '聚义页横条消失');

  console.log('三、称号要领了才能戴');
  const tt = await pg.evaluate(() => {
    const a = Achv.list().find(x => x.title);
    G.achv[a.id] = 1; delete G.achvClaimed[a.id]; G.title = null;
    const early = Achv.setTitle(a.id);
    const r = Achv.claim(a.id);
    return { early, wore: r.wore, now: G.title === a.id };
  });
  ok(!tt.early && tt.wore && tt.now, '没领时戴不上；领了自动戴上');

  console.log('四、V10.8 老存档');
  const old = await pg.evaluate(() => {
    const d = JSON.parse(localStorage.getItem(CFG.saveKey));
    delete d.achvClaimed;          // V10.8 存档没有这个字段
    d.res.token = 555; d.res.gold = 66;
    Save.locked = true;
    localStorage.setItem(CFG.saveKey, JSON.stringify(d));
    return Object.keys(d.achv).length;
  });
  await pg.reload();
  const o = await pg.evaluate(() => ({ token: G.res.token, gold: G.res.gold, pend: Achv.pending().length, claimed: Object.keys(G.achvClaimed).length }));
  ok(o.token === 555 && o.gold === 66 && o.pend === 0 && o.claimed >= old, `老存档 ${old} 条已达成全算已领，账不变，待领 ${o.pend}`);
  ok(!errs.length, '无页面报错' + (errs.length ? '：' + errs.join(' | ') : ''));

  console.log(`\n通过 ${pass}　失败 ${fail}`);
  await br.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
