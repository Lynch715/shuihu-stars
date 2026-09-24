const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const p = await br.newPage();
  await p.goto('file://' + require('path').resolve(process.argv[2])); await p.waitForTimeout(400);
  const r = await p.evaluate((caps) => {
    initGame('classic'); G.res.silver = 1e7;
    for (let i = 0; i < 6; i++) Grow.recruit(10);
    const out = {};
    for (const cap of caps) {
      CFG.mulCap1 = cap;
      for (const [sid, over] of [['ch4_1', 4], ['ch8_1', 8], ['ch8_2', 8], ['ch22_1', 10], ['ch22_2b', 10], ['ch14_boss', 8], ['ch30_f1', 2]]) {
        const st = DB.stage(sid); if (!st) continue;
        const lv = Math.min(50, st.rec_lv[1] + over), star = Math.min(5, Math.ceil(lv / 12));
        for (const h of Object.values(G.heroes)) { h.lv = lv; h.base = Object.assign({}, grownBase(h.hid, lv)); h.star = star; h.owned = skillIdsOf(h.hid, h).slice(0, Math.min(star, 4)); h.hurt = { lv: 0, rest: 0 }; }
        Grow.autoTeam();
        let w = 0, rounds = 0; const N = 40;
        for (let i = 0; i < N; i++) { const b = Battle.create(sid); Battle.runAll(b); if (b.win) w++; rounds += b.round; }
        out[`cap${cap} ${sid} mul${st.enemy_mul} lv${lv}`] = `${Math.round(w / N * 100)}% ${(rounds / N).toFixed(1)}回合`;
      }
    }
    return out;
  }, JSON.parse(process.argv[3] || '[3.5,2.5,2]'));
  console.log(r); await br.close();
})();
