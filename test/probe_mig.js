const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.resolve(process.argv[2]));
  await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => {
    initGame('classic');
    // 假装是旧存档：手上有贺统军（★3 30 级）和于玉珏，还有贺重宝
    const fake = (hid, lv, star) => ({ hid, lv, exp: 0, star, hurt: { lv: 0, rest: 0 },
      base: { atk: 80, def: 60, int: 50, agi: 60, hp: 900 }, base0: {}, owned: [], equipment: { weapon: 'w1', armor: null, helmet: null, mount: null, special: null } });
    G.heroes.he_tongjun = fake('he_tongjun', 30, 3);
    G.heroes.yu_yujue = fake('yu_yujue', 20, 2);
    G.heroes.yu_yulin = fake('yu_yulin', 10, 1);
    G.frags.he_tongjun = 5;
    G.team = ['he_tongjun', 'yu_yujue', 'yu_yulin'];
    Save.migrate();
    const out = { heroes: Object.keys(G.heroes).filter(k => /he_|yu_yu/.test(k)),
      hcb: G.heroes.he_chongbao && { lv: G.heroes.he_chongbao.lv, star: G.heroes.he_chongbao.star, owned: G.heroes.he_chongbao.owned, eq: G.heroes.he_chongbao.equipment.weapon },
      frags: { hcb: G.frags.he_chongbao, yyl: G.frags.yu_yulin }, team: G.team, w1: G.items.eq_w1,
      calc: Stats.calc('he_chongbao') && Stats.calc('he_chongbao').atk };
    out.names = ['w5','jx_lin_chong_m','exc_9001','s16','wuyan_guang_dao','jx_zhou_ang_w'].map(k => DB.equip(k).name + '/' + DB.equip(k).slot + '/' + DB.equip(k).weaponType);
    out.zhou = DB.hero('zhou_ang').title + ' ' + DB.hero('zhou_ang').fav_weapon;
    out.stage = Battle.roster('ch14_f1').map(h => DB.hero(h).name);
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); console.log(errs);
  await br.close();
})();
