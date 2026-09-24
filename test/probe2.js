const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const p = await br.newPage();
  await p.goto('file://' + require('path').resolve(process.argv[2])); await p.waitForTimeout(400);
  const r = await p.evaluate(([sids, ov]) => {
    Object.assign(CFG, ov);
    initGame('classic'); G.res.silver = 1e7;
    for (let i = 0; i < 8; i++) Grow.recruit(10);
    const out = {};
    for (const sid of sids) {
      const st = DB.stage(sid); const t = Battle.enemyTier(sid);
      for (const h of Object.values(G.heroes)) { h.lv = 50; h.base = Object.assign({}, grownBase(h.hid, 50)); h.star = 5; h.owned = skillIdsOf(h.hid, h).slice(0, 4); h.hurt = { lv: 0, rest: 0 }; }
      Grow.autoTeam();
      let w = 0, rounds = 0; const N = 30;
      for (let i = 0; i < N; i++) { const b = Battle.create(sid); Battle.runAll(b); if (b.win) w++; rounds += b.round; }
      out[`${sid} ${st.name} lv${t.lv} ★${t.star} mul${t.mul.toFixed(2)} gear${t.gear.toFixed(2)} n${st.enemies.length}`] = `${Math.round(w / N * 100)}% ${(rounds / N).toFixed(1)}回合 我方战力${Stats.teamPower()} 敌${Stats.stagePower(sid)}`;
    }
    return out;
  }, [JSON.parse(process.argv[4] || '["ch22_boss","ch23_1","ch25_1","ch25_boss","ch27_boss","ch30_boss","ch31_boss","ch30_f1"]'), JSON.parse(process.argv[3] || '{}')]);
  console.log(r); await br.close();
})();
