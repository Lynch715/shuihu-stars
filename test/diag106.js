// V10.6 诊断：候选人放 7 号位（后排），看存活、出手、输出
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  await pg.goto('file://' + path.resolve(process.argv[2])); await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => {
    if (DB.foeHero) DB.foeHero = DB.hero;   // 对拼：两边都是玩家口径，不用敌方快照
    initGame('classic');
    const all = DB.heroIds().filter(k => DB.hero(k).src !== '杂兵');
    for (const hid of all) { Grow.gainHero(hid); const h = G.heroes[hid]; h.lv = 50; h.star = 5; h.base = Object.assign({}, grownBase(hid, 50)); h.owned = DB.hero(hid).sk.slice(0, 4); h.equipment = {}; h.hurt = null; const set = DB.excSet(hid); if (set) for (const id of set.items) h.equipment[DB.equip(id).slot] = id; }
    const fight = (A, Bt, f) => { const allies = A.map((h, i) => Battle.unit(h, Stats.calc(h, { team: A }), true, i)); const foes = Bt.map((h, i) => Battle.unit(h, Stats.calc(h, { team: Bt }), false, i)); for (const u of foes) { for (const k of ['atk', 'def', 'int']) u[k] = Math.round(u[k] * f); u.maxHp = Math.round(u.maxHp * f); u.hp = u.maxHp; } const b = { sid: 'ch1_1', stage: DB.stage('ch1_1'), allies, foes, round: 0, over: false, win: null, log: [], events: [] }; Battle.tagNames(b); Battle.runAll(b); return b; };
    const q = n => all.filter(k => DB.hero(k).q === n);
    const wu5 = q(5).filter(k => DB.hero(k).atk > DB.hero(k).int && !DB.excSet(k)).slice(0, 8);
    const opp = ['lin_chong', 'lu_junyi', 'guan_sheng', 'shi_wengong', 'gao_chong', 'du_jue', 'hu_yanzhuo', 'yue_fei', 'lu_zhishen'];
    const o = {};
    for (const c of ['lin_chong', 'gongsun_sheng', 'luo_zhenren', 'wu_yong', 'qiao_daoqing', 'liu_huiniang', 'gao_qiu', 'qin_hui', 'chen_xizhen', 'song_jiang']) {
      const t = wu5.slice(0, 7).concat([c], wu5.slice(7, 8)); const N = 30;
      const a = { 回合: 0, 放技能: 0, 存活: 0, 受伤: 0, 输出: 0, 被控: 0 };
      const casts = {};
      for (let i = 0; i < N; i++) {
        const b = fight(t, opp, 0.346); const u = b.allies[7]; const ln = u.ln;
        a.回合 += b.round;
        for (const l of b.log) {
          if (l.c === 'sk' && l.s.startsWith(ln + ' · ')) { a.放技能++; const n = l.s.slice(ln.length + 3).split(/[｜（]/)[0]; casts[n] = (casts[n] || 0) + 1; }
          if (l.s.startsWith(ln + ' 【眩晕】') || l.s.startsWith(ln + ' 【沉默】') || l.s.startsWith(ln + ' 【混乱】')) a.被控++;
        }
        a.受伤 += u.tally.taken; a.输出 += u.tally.dealt; if (u.alive) a.存活++;
      }
      for (const k in a) a[k] = +(a[k] / N).toFixed(2);
      for (const k in casts) casts[k] = +(casts[k] / N).toFixed(1);
      const s = Stats.calc(c, { team: t });
      o[DB.hero(c).name] = Object.assign(a, { 招: casts, 面板: `武${s.atk} 智${s.int} 防${s.def} 血${s.maxHp}` });
    }
    return o;
  });
  for (const [k, v] of Object.entries(r)) console.log(k, JSON.stringify(v));
  await br.close();
})();
