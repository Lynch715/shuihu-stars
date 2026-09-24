const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.resolve(process.argv[2]));
  await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => {
    const res = {};
    const jue = DB.heroIds().filter(k => DB.hero(k).q === 6);
    const trial = (lv, star, withSet, sid, n, k = 9) => {
      initGame('classic');
      G.res.silver = 1e12;
      const team = jue.slice(0, 9);
      team.forEach((hid, ti) => {
        Grow.gainHero(hid); const h = G.heroes[hid];
        while (h.lv < lv) Grow.gainExp(h, Math.max(1, CFG.expNeed(h.lv) - h.exp));
        h.star = star; h.owned = (DB.hero(hid).sk || []).slice();
      });
      team.forEach((hid, ti) => {
        const src = (withSet && ti < k) ? hid : team[(ti + 1) % team.length];   // 不是本人：只拿面板
        for (const id of ES(src).items) { G.items['eq_' + id] = (G.items['eq_' + id] || 0) + 1; Grow.equip(hid, DB.equip(id).slot, id); }
      });
      G.team = team;
      let w = 0;
      for (let i = 0; i < n; i++) { const b = Battle.create(sid); Battle.runAll(b); if (b.win) w++; }
      return w / n;
    };
    const FX = {}; for (const id of DB.equipIds()) FX[id] = DB.equip(id).fx;
    const ES = DB.excSet;
    const mode = m => { for (const id in FX) DB.equip(id).fx = m >= 1 ? FX[id] : []; DB.excSet = m >= 2 ? ES : (() => null); };
    for (const lv of [27, 29]) {
      const r = {};
      mode(2); r.none = trial(lv, 1, false, 'ch25_boss', 40);
      mode(0); r.ob = trial(lv, 1, true, 'ch25_boss', 40, 1);
      mode(1); r.fx = trial(lv, 1, true, 'ch25_boss', 40, 1);
      mode(2); r.set = trial(lv, 1, true, 'ch25_boss', 40, 1);
      res['ch25@' + lv] = r;
    }
    res.who = jue.slice(0, 3).map(h => DB.hero(h).name);
    return res;
    for (const [sid, lv] of [['ch15_boss', 12], ['ch15_boss', 15], ['ch20_boss', 18], ['ch20_boss', 22], ['ch25_boss', 26], ['ch25_boss', 30]]) {
      res[sid + '@' + lv] = { no: trial(lv, 1, false, sid, 30), set: trial(lv, 1, true, sid, 30) };
    }
    return res;
  });
  console.log(JSON.stringify(r)); console.log(errs);
  await br.close();
})();
