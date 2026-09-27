#!/usr/bin/env node
/**
 * 水浒群星录 · 三周目伤病经济专测
 *   node lap3.js <html> [局数] [--lap=3] [--patch=xxx.js] [--silver=5000]
 *
 * laps.js 要从一周目一路打到三周目，V10.6 抬难度之后模拟玩家一周目就常卡死，
 * 三周目根本到不了。这里直接造一个「二周目打完」的家当开三周目：
 * 一百六十来人、主力 60 级 ★6、包里一批天罡绝世装、账上几千银两。
 * 只看三周目：通不通、打几场、伤员怎么滚、银两进出、治伤花了多少。
 *
 * --patch=file.js：在 initGame 之前先在页面里跑一段 JS，用来试改法（覆盖 CFG 或函数）。
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const HTML = process.argv[2], RUNS = +(process.argv[3] || 1);
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const LAP = +arg('lap', 3), SILVER = +arg('silver', 5000), OWN = +arg('own', 160);
const PATCH = arg('patch', null) ? fs.readFileSync(arg('patch'), 'utf8') : '';

const SIM = function (opt) {
  const { RUNS, LAP, SILVER, OWN } = opt;
  const runs = [];
  for (let run = 0; run < RUNS; run++) {
    initGame();
    // ── 造二周目打完的家当 ──
    G.res.silver = 1e9;
    while (Object.keys(G.heroes).length < OWN) Grow.recruit(10);
    G.res.silver = SILVER; G.res.gold = 0; G.res.token = 40;
    const lvCap = Lap.maxLv(LAP - 1), stCap = Lap.maxStar(LAP - 1);
    const ids = Object.keys(G.heroes).sort((a, b) => Stats.heroPower(b) - Stats.heroPower(a));
    ids.forEach((hid, i) => {
      const h = G.heroes[hid];
      h.lv = i < 36 ? lvCap : i < 80 ? lvCap - 10 : Math.max(1, lvCap - 25);
      h.exp = 0;
      h.star = Math.max(h.star || 1, i < 18 ? stCap : i < 40 ? stCap - 1 : i < 80 ? stCap - 2 : 1);
    });
    for (let k = 0; k < 60; k++) {
      const e = Stages.rollEquip(null, 6, k < 30 ? 6 : 5);
      if (e) G.items['eq_' + e] = (G.items['eq_' + e] || 0) + 1;
    }
    for (const sid of DB.stageIds()) { G.cleared[sid] = true; G.everCleared[sid] = 1; }
    G.lap = LAP - 1; Lap.next();   // 走正规入口：清关卡、清伤、抽宿星
    G.fates = [];                  // 宿星随机性太大，专测先不带
    Save.write();

    const order = [];
    for (const ch of DB.chapters) for (const sid of DB.byChapter[ch]) order.push(sid);
    const st = { battles: 0, lose: 0, earn: 0, spendCure: 0, cures: 0, spendGacha: 0, spendLv: 0,
                 hurtPeak: 0, hurtTrail: [], stuck: null, tries: {} };
    const teamUp = () => {
      const owned = Object.keys(G.heroes).filter(h => Hurt.able(h));
      owned.sort((a, b) => Stats.heroPower(b) - Stats.heroPower(a));
      G.team = owned.slice(0, CFG.teamSize);
    };
    const cureUp = reserve => {
      for (const hid of Object.keys(G.heroes)) {
        if (!Hurt.of(hid).lv) continue;
        const c = Hurt.cureCost(hid);
        if (G.res.silver - c < reserve) continue;
        if (!Hurt.cure(hid)) { st.spendCure += c; st.cures++; }
      }
    };
    const gearUp = () => {
      for (const hid of G.team) for (const slot of SLOTS) {
        const bag = Grow.bagEquips(slot);
        if (!bag.length) continue;
        const cur = G.heroes[hid].equipment[slot];
        if (cur && DB.equip(cur).q >= bag[0].q) continue;
        Grow.equip(hid, slot, bag[0].id);
      }
    };
    const starUp = () => { for (const hid of G.team) while (!Grow.starUp(hid)) {} };
    const levelTo = (cap, reserve) => {
      cap = Math.min(cap, Lap.maxLv());
      let moved = true;
      while (moved) {
        moved = false;
        for (const hid of G.team) {
          const h = G.heroes[hid];
          if (h.lv >= cap) continue;
          const c = Grow.drillCost(hid);
          if (G.res.silver - c < reserve) continue;
          if (!Grow.levelUp(hid)) { st.spendLv += c; moved = true; }
        }
      }
    };
    const fight = sid => {
      const bt = Battle.create(sid);
      if (!bt || !bt.allies.length || !bt.foes.length) return null;
      const s0 = G.res.silver;
      Battle.runAll(bt); st.battles++;
      Stages.settle(bt);
      st.earn += G.res.silver - s0;
      if (!bt.win) st.lose++;
      const hurtN = Object.keys(G.heroes).filter(h => Hurt.of(h).lv).length;
      st.hurtPeak = Math.max(st.hurtPeak, hurtN);
      if (st.battles % 25 === 0) st.hurtTrail.push(hurtN);
      return bt.win;
    };

    let guard = 0, dry = 0;
    while (guard++ < 400) {
      const todo = order.filter(sid => !G.cleared[sid] && Stages.unlocked(sid));
      if (!todo.length) break;
      let got = 0;
      for (const sid of todo) {
        const stg = DB.stage(sid);
        const want = Lap.recLv(stg.rec_lv || [1, 5])[1] + 3 * (st.tries[sid] || 0);
        teamUp(); gearUp(); starUp();
        if (Object.keys(G.heroes).filter(h => Hurt.able(h)).length < CFG.teamSize + 3) cureUp(0);
        levelTo(want, CFG.recruitCost1);
        const reserve = CFG.recruitCost1;
        while (G.res.silver - reserve >= CFG.recruitCost10) { const s0 = G.res.silver; Grow.recruit(10); st.spendGacha += s0 - G.res.silver; }
        if ((st.tries[sid] || 0) >= 1) cureUp(0);
        teamUp(); gearUp(); starUp(); levelTo(want, 0);
        const w = fight(sid);
        if (w === null) { G.cleared[sid] = true; continue; }
        if (!w) { st.tries[sid] = (st.tries[sid] || 0) + 1; continue; }
        got++;
      }
      if (!got) {
        const done = order.filter(s => G.cleared[s])
          .sort((a, b) => (DB.stage(b).rec_lv || [1, 5])[1] - (DB.stage(a).rec_lv || [1, 5])[1]).slice(0, 3);
        for (let k = 0; k < 6; k++) for (const sid of done) { teamUp(); fight(sid); }
      }
      dry = got ? 0 : dry + 1;
      if (dry >= 12) {
        const sid = order.find(s => !G.cleared[s] && Stages.unlocked(s));
        const stg = sid && DB.stage(sid);
        st.stuck = sid ? `${sid} ${stg.name}（第${stg.ch}章，余银 ${Math.round(G.res.silver)}，`
          + `伤员 ${Object.keys(G.heroes).filter(h => Hurt.of(h).lv).length}（重 ${Object.keys(G.heroes).filter(h => Hurt.heavy(h)).length}），`
          + `治一个重伤要 ${Hurt.cureCost(Object.keys(G.heroes).find(h => Hurt.heavy(h)) || G.team[0]) || '—'}）` : '未知';
        break;
      }
    }
    const cleared = order.filter(s => G.cleared[s]).length;
    const sampleCure = (() => { const h = G.heroes[G.team[0]]; const bak = h.hurt; h.hurt = { lv: 2, rest: 3 }; const c = Hurt.cureCost(G.team[0]); h.hurt = bak; return c; })();
    runs.push({ cleared, total: order.length, ...st, sampleCure,
                lv: +(G.team.reduce((a, h) => a + G.heroes[h].lv, 0) / G.team.length).toFixed(1),
                silver: Math.round(G.res.silver), retries: Object.values(st.tries).reduce((a, b) => a + b, 0) });
  }
  return runs;
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('  页面异常 ' + e.message));
  await p.goto('file://' + path.resolve(HTML));
  await p.waitForTimeout(1500);
  if (PATCH) await p.evaluate(PATCH);
  const rs = await p.evaluate(`(${SIM.toString()})(${JSON.stringify({ RUNS, LAP, SILVER, OWN })})`);
  console.log(`${LAP} 周目 · ${RUNS} 局${PATCH ? ' · patch ' + arg('patch') : ''}`);
  console.log('通关　　　场次　败仗　重试　伤员峰值　收入　治伤(次)　抽卡　练级　余银　治重伤单价　伤员曲线');
  for (const r of rs)
    console.log(`  ${String(r.cleared + '/' + r.total).padStart(7)}　${String(r.battles).padStart(4)}　${String(r.lose).padStart(3)}　${String(r.retries).padStart(3)}　`
      + `${String(r.hurtPeak).padStart(4)}　${String(Math.round(r.earn / 1000) + 'k').padStart(6)}　${String(Math.round(r.spendCure / 1000) + 'k(' + r.cures + ')').padStart(9)}　`
      + `${String(Math.round(r.spendGacha / 1000) + 'k').padStart(5)}　${String(Math.round(r.spendLv / 1000) + 'k').padStart(5)}　${String(r.silver).padStart(6)}　${String(r.sampleCure).padStart(7)}　`
      + r.hurtTrail.join(',') + (r.stuck ? `\n      ✗ ${r.stuck}` : ''));
  const ok = rs.filter(r => !r.stuck).length;
  console.log(`通过 ${ok}/${rs.length}`);
  await b.close();
})();
