// V10.5 探针：狂风助火、叠毒、百分比流血、铁匠铺、一键装备 / 卸装、法术伤害对比
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.resolve(process.argv[2]));
  await pg.waitForTimeout(400);
  const r = await pg.evaluate(() => {
    const out = {};
    initGame('classic');
    for (const hid of ['gongsun_sheng', 'ling_zhen', 'wei_dingguo', 'yang_chun', 'xie_bao', 'an_daoquan', 'lin_chong', 'wu_yong', 'xuan_zan'])
      if (DB.hero(hid) && !G.heroes[hid]) Grow.gainHero(hid);
    for (const hid of Object.keys(G.heroes)) { const h = G.heroes[hid]; h.lv = 50; h.star = 5; h.base = Object.assign({}, grownBase(hid, 50)); h.owned = DB.hero(hid).sk.slice(0, 4); }
    G.team = ['lin_chong', 'xuan_zan', 'yang_chun', 'gongsun_sheng', 'ling_zhen', 'wei_dingguo', 'xie_bao', 'an_daoquan', 'wu_yong'].filter(h => G.heroes[h]);
    out.team = G.team;
    out.xuanzan = DB.hero('xuan_zan').sk.map(id => id + ' ' + DB.skill(id).name + ' ' + SkillText.full(DB.skill(id)));
    out.gss2 = SkillText.full(DB.skill('gss2'));
    out.adq4 = SkillText.full(DB.skill('adq4'));
    const b = Battle.create('ch20_boss');
    Battle.runAll(b);
    out.res = { win: b.win, round: b.round };
    out.log = b.log.map(l => l.s).filter(s => /狂风|蔓延|中毒|流血|灼烧|法术/.test(s)).slice(0, 40);
    // 法术 vs 武 单发对比：公孙胜 五雷 vs 林冲 豹头环眼，对同一个目标各打 200 次取均值
    for (const hid of ['gongsun_sheng', 'lin_chong']) { G.items['eq_w105_6'] = 1; Grow.equip(hid, 'weapon', 'w105_6'); }
    out.gearInt = Stats.calc('gongsun_sheng').int; out.gearAtk = Stats.calc('lin_chong').atk;
    const b2 = Battle.create('ch20_boss');
    const gs = b2.allies.find(u => u.hid === 'gongsun_sheng'), lc = b2.allies.find(u => u.hid === 'lin_chong');
    const tgt = b2.foes[0];
    const avg = (u, f) => { let s = 0; for (let i = 0; i < 300; i++) { const atkV = f.src === 'int' ? Battle.magic(u) : Battle.eff(u, 'atk'); const d = Battle.dmg(atkV, Battle.eff(tgt, 'def'), atkV * f.mult, skillPow(Battle.eff(u, 'int'), Battle.eff(u, 'atk')), 0, u); s += d.v; } return Math.round(s / 300); };
    out.cmp = { gs: { int: gs.int, atk: gs.atk, hit: avg(gs, DB.skill('gss1').fx[0]) }, lc: { atk: lc.atk, int: lc.int, hit: avg(lc, DB.skill('lc1').fx[0]) },
                tgt: { name: tgt.name, def: tgt.def, hp: tgt.maxHp }, basic: avg(lc, { mult: 1 }) };
    // 铁匠铺
    G.res.silver = 99999;
    out.cap0 = Grow.forgeCap(); out.rates0 = Grow.forgeRates();
    const f1 = Grow.forge(10); out.forge = f1.list.map(x => DB.equip(x.eid).name + '/' + x.q + (x.had ? '(重)' : ''));
    G.lap = 2; out.cap2 = Grow.forgeCap(); out.rates2 = Grow.forgeRates();
    const f2 = Grow.forge(10); out.forge2 = f2.list.map(x => DB.equip(x.eid).name + '/' + x.q); G.lap = 1;
    // 一键装备 / 卸装
    const a = Grow.autoEquip(); out.autoEquip = a;
    out.worn = G.team.map(h => h + ':' + SLOTS.map(s => G.heroes[h].equipment[s] ? DB.equip(G.heroes[h].equipment[s]).name : '-').join('/'));
    const st = Grow.stripTeam(); out.strip = st;
    out.wornAfter = G.team.filter(h => SLOTS.some(s => G.heroes[h].equipment[s])).length;
    UI.view = 'team'; render(); out.teamBtns = [...document.querySelectorAll('#content .btn')].map(x => x.innerText).slice(0, 6);
    UI.view = 'tavern'; render(); out.tavern = document.querySelector('#content').innerText.slice(-420);
    UI.forge = f1.list; UI.view = 'forgeResult'; render(); out.forgeView = document.querySelector('#content').innerText.slice(0, 200);
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('errors:', errs);
  await br.close();
})();
