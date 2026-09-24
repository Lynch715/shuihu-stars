const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' in {} ? undefined : undefined });
  const pg = await br.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + path.resolve(process.argv[2]));
  await pg.waitForTimeout(400);
  const r = await pg.evaluate(() => {
    const out = {};
    initGame('classic'); 
    const hid = 'lin_chong';
    Grow.gainHero(hid);
    const h = G.heroes[hid];
    const set = DB.excSet(hid);
    out.set = set;
    const before = Stats.calc(hid);
    for (const id of set.items) { G.items['eq_' + id] = 1; Grow.equip(hid, DB.equip(id).slot, id); }
    const s = Stats.calc(hid);
    out.equip = h.equipment;
    out.pas = { skrate: s.pas.skrate, pierce: s.pas.pierce, cut: s.pas.cut, tough: s.pas.tough, first: s.pas.first, low: s.pas.low };
    out.setOn = s.meta.setOn; out.setHave = s.meta.setHave;
    out.atk = [before.atk, s.atk]; out.agi = [before.agi, s.agi];
    out.ob = DB.equip('w5') && obTxt(DB.equip('w5'));
    // 别人穿：只拿面板
    Grow.gainHero('lu_zhishen');
    // 全部 26 人配满，看有没有缺件
    out.bad = [];
    for (const k of DB.heroIds()) { const t = DB.hero(k); if (t.q !== 6) continue;
      const st = DB.excSet(k); if (!st || st.items.length !== 3) out.bad.push(k);
      for (const id of st.items) { const e = DB.equip(id); if (!e || e.exclusive !== k) out.bad.push(k + ':' + id); } }
    // 打一场
    G.team = [hid]; 
    const b = Battle.create('ch1_1'); Battle.runAll(b);
    out.win = b.win; out.log = b.log.filter(l => /追击|先手|奋起|护盾|保留/.test(l.s)).slice(0, 6).map(l => l.s);
    UI.sel = hid; out.heroView = VIEWS.hero().match(/setrow[\s\S]{0,400}/)?.[0];
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('ERR', errs);
  await br.close();
})();
