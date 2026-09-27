#!/usr/bin/env node
/**
 * 水浒群星录 · Boss 关参考队胜率
 *   node test/bosscheck.js <html> [--ease=[[1,.7],...]] [--n=20] [--seed=3]
 * 每个 Boss 关造一支「该章该有的队」：等级 = 推荐级+3、星级随章、装备按本章掉落上限摇，
 * 从固定 60 人名册里按战力挑九个，打 n 场看胜率。用来对比两版之间 Boss 手感有没有变。
 */
const { chromium } = require('playwright');
const HTML = process.argv[2];
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const N = +arg('n', 20), EASE = arg('ease', null), SEEDS = +arg('seed', 3);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + require('path').resolve(HTML)); await p.waitForTimeout(1200);
  if (EASE) await p.evaluate(`CFG.foeEase = ${EASE}`);
  const r = await p.evaluate(([N, SEEDS]) => {
    const out = {};
    for (let seed = 0; seed < SEEDS; seed++) {
      initGame(); G.res.silver = 1e9;
      // 固定名册：按品阶从高到低取 80 人（去掉杂兵），不抽卡，去掉抽卡的随机
      const pool = DB.heroIds().filter(h => DB.hero(h).src !== '杂兵').sort((a, b) => DB.hero(b).q - DB.hero(a).q || a.localeCompare(b)).slice(40 + seed * 10, 40 + seed * 10 + 80);
      G.heroes = {}; for (const h of pool) G.heroes[h] = makeHero(h);
      const bosses = DB.stageIds().filter(s => Stages.kindOf(s) === 'boss' && !DB.stage(s).side);
      for (const sid of bosses) {
        const st = DB.stage(sid), ch = st.ch, L = (st.rec_lv || [1, 5])[1] + 3;
        const star = Math.min(5, 1 + Math.floor(ch / 7));
        for (const [hid, h] of Object.entries(G.heroes)) { h.lv = Math.min(50, L); h.star = star; h.base = Object.assign({}, grownBase(hid, h.lv)); h.owned = (DB.hero(hid).sk || []).slice(0, Math.min(star, 4)); h.equipment = {}; }
        const ids = Object.keys(G.heroes).sort((a, b) => Stats.heroPower(b) - Stats.heroPower(a));
        G.team = ids.slice(0, 9);
        const cap = Stages.qCap(ch);
        // 固定装备：本章掉落上限以内的普通装各一件，一键装备挑
        G.items = {};
        for (const k of DB.equipIds()) { const e = DB.equip(k); if (!e.exclusive && e.q <= cap && e.q >= Math.max(1, cap - 1)) G.items['eq_' + k] = 1; }
        Grow.autoEquip();
        let w = 0;
        for (let i = 0; i < N; i++) { const bt = Battle.create(sid); Battle.runAll(bt); if (bt.win) w++; for (const h of Object.values(G.heroes)) h.hurt = { lv: 0, rest: 0 }; }
        (out[sid] = out[sid] || { name: st.name, ch, w: 0, n: 0 }); out[sid].w += w; out[sid].n += N;
      }
    }
    return out;
  }, [N, SEEDS]);
  let tot = 0, cnt = 0;
  for (const [sid, v] of Object.entries(r)) { const pct = Math.round(100 * v.w / v.n); tot += pct; cnt++; console.log(`${String(v.ch).padStart(2)} ${sid.padEnd(11)} ${v.name.padEnd(12)} ${String(pct).padStart(3)}%`); }
  console.log(`平均 ${Math.round(tot / cnt)}%`);
  await b.close();
})();
