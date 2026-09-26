const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + path.resolve(process.argv[2]));
  await pg.waitForTimeout(400);
  const r = await pg.evaluate((mode) => {
    const out = {};
    out.view0 = UI.view;
    initGame(mode); Save.write();
    out.gift = G.startGift.map(h => DB.hero(h).name + '/' + DB.hero(h).q);
    out.mode = G.mode;
    out.heroSk = Object.values(G.heroes).map(h => ({ hid: h.hid, sk: h.sk, owned: h.owned }));
    // 抽十个人
    G.res.silver = 99999; Grow.recruit(10); Grow.recruit(10);
    Grow.autoTeam();
    out.team = G.team.map(h => DB.hero(h).name);
    // 打一场
    const b = Battle.create('ch1_1');
    Battle.runAll(b);
    out.res = { win: b.win, round: b.round, result: b.result };
    out.log = b.log.slice(0, 40).map(l => l.c + ' ' + l.s);
    out.cats = {};
    for (const u of [...b.allies, ...b.foes]) for (const s of u.skills) out.cats[s.cat] = (out.cats[s.cat] || 0) + 1;
    // 描述抽样
    out.descs = ['lc1','lc2','lzs1','lzs3','lzs4','wy1','wy3','v6_song_jiang_1','v6_cai_jing_1','v6_luo_ruji_1','v6_wan_qixie_1'].map(id => id + ' ' + DB.skill(id).name + ' ' + SkillText.full(DB.skill(id)));
    // 详情页渲染
    UI.sel = G.team[0]; UI.view = 'hero'; render();
    out.detail = document.querySelector('.dsk').innerText.slice(0, 300);
    UI.view = 'gift'; render(); out.giftHtml = document.querySelector('.giftcard').innerText.slice(0, 200);
    UI.view = 'mode'; render(); out.modeHtml = document.querySelector('.modepick').innerText.slice(0, 100);
    return out;
  }, process.argv[3] || 'classic');
  console.log(JSON.stringify(r, null, 1));
  console.log('errors:', errs);
  await br.close();
})();
