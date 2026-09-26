// V10.6 探针：文官 vs 武将单场产出；奸臣克制；流血中毒穿盾；驱散
//   node test/probe106.js <html> [场数]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.resolve(process.argv[2]));
  await pg.waitForTimeout(400);
  const N = +(process.argv[3] || 60);
  const r = await pg.evaluate((N) => {
    const out = {};
    if (DB.foeHero) DB.foeHero = DB.hero;   // 对拼：两边都是玩家口径，不用敌方快照
    initGame('classic');
    const all = DB.heroIds().filter(k => DB.hero(k).src !== '杂兵');
    for (const hid of all) if (!G.heroes[hid]) Grow.gainHero(hid);
    for (const hid of all) {
      const h = G.heroes[hid]; h.lv = 50; h.star = 5; h.base = Object.assign({}, grownBase(hid, 50));
      h.owned = DB.hero(hid).sk.slice(0, 4); h.equipment = {}; h.hurt = null;
      const set = DB.excSet(hid);
      if (set) for (const id of set.items) h.equipment[DB.equip(id).slot] = id;
    }
    const nm = h => DB.hero(h).name;
    // 手工对阵：两队都是玩家口径（满级满星、绝世穿本人三件套），不走关卡
    const fight = (A, Bt, f = 1) => {
      const allies = A.map((h, i) => Battle.unit(h, Stats.calc(h, { team: A }), true, i));
      const foes = Bt.map((h, i) => Battle.unit(h, Stats.calc(h, { team: Bt }), false, i));
      if (f !== 1) for (const u of foes) { for (const k of ['atk', 'def', 'int']) u[k] = Math.round(u[k] * f); u.maxHp = Math.round(u.maxHp * f); u.hp = u.maxHp; }
      const b = { sid: 'ch1_1', stage: DB.stage('ch1_1'), allies, foes, round: 0, over: false, win: null, log: [], events: [] };
      Battle.tagNames(b); Battle.runAll(b); return b;
    };
    const q = n => all.filter(k => DB.hero(k).q === n);
    const wu5 = q(5).filter(k => DB.hero(k).atk > DB.hero(k).int && !DB.excSet(k)).slice(0, 8);
    const jueWu = ['lin_chong', 'lu_junyi', 'guan_sheng', 'shi_wengong', 'gao_chong', 'du_jue', 'hu_yanzhuo', 'yue_fei', 'lu_zhishen'];

    // A. 单场产出：候选人放 7 号位（后排），其余八人是固定的天罡武将；对面九个绝世武将，
    //    强度缩放到「候选人是林冲时五五开」，每个候选人用同一个缩放
    const cands = ['luo_zhenren', 'gongsun_sheng', 'wu_yong', 'song_jiang', 'qiao_daoqing', 'liu_huiniang', 'zong_ze',
                   'gao_qiu', 'cai_jing', 'qin_hui', 'zhang_shuye', 'chen_xizhen', 'lin_chong', 'lu_junyi', 'guan_sheng', 'shi_wengong', 'gao_chong', 'du_jue'];
    const opp = jueWu;
    const mk = c => wu5.slice(0, 7).concat([c], wu5.slice(7, 8));
    const wrA = (t, n, f) => { let w = 0; for (let i = 0; i < n; i++) if (fight(t, opp, f).win) w++; return w / n; };
    let lo = 0.2, hi = 3; for (let i = 0; i < 9; i++) { const m = Math.sqrt(lo * hi); if (wrA(mk('lin_chong'), 40, m) > 0.5) lo = m; else hi = m; }
    const fA = Math.sqrt(lo * hi); out.fA = +fA.toFixed(3);
    out.output = {};
    for (const c of cands) {
      const team = mk(c);
      let dealt = 0, healed = 0, win = 0;
      for (let i = 0; i < N; i++) {
        const b = fight(team, opp, fA); const u = b.allies[7];
        dealt += u.tally.dealt; healed += u.tally.healed; if (b.win) win++;
      }
      out.output[nm(c)] = { dealt: Math.round(dealt / N), healed: Math.round(healed / N), win: +(win / N).toFixed(2) };
    }

    // B. 奸臣克制：同一队八人 + 第九人换成奸臣 / 对照（公孙胜），分别打「他克的阵」和「普通阵」
    const base8 = ['lin_chong', 'lu_junyi', 'guan_sheng', 'hu_yanzhuo', 'wu_yong', 'luo_zhenren', 'qiao_daoqing', 'liu_huiniang'];
    const COMPS = {
      carry: ['gao_chong', 'shi_wengong', 'du_jue', ...q(3).filter(k => DB.hero(k).atk > DB.hero(k).int).slice(0, 6)],   // 一两个大哥带一群小弟
      shield: ['song_jiang', 'li_gang', 'zong_ze', 'zhang_tianshi', 'ma_ling', 'lu_zhishen', 'lu_junyi', 'yue_fei', 'guan_sheng'],
      mage: ['luo_zhenren', 'gongsun_sheng', 'qiao_daoqing', 'wu_yong', 'liu_huiniang', 'chen_xizhen', 'lin_chong', 'guan_sheng', 'yue_fei'],
      tank: ['lu_zhishen', 'lu_junyi', 'hu_yanzhuo', 'li_gang', 'yue_yun', 'gao_chong', 'guan_sheng', 'wu_yanguang', 'yue_fei'],
      hp: ['lu_zhishen', 'fang_jie', 'sun_an', 'a_liqi', 'wu_yanguang', 'gao_chong', 'yue_yun', 'guan_sheng', 'yue_fei'],
      neutral: ['lin_chong', 'guan_sheng', 'shi_wengong', 'du_jue', 'yue_fei', 'wu_yong', 'gongsun_sheng', 'song_jiang', 'bian_xiang'],
    };
    const JIAN = { gao_qiu: 'carry', cai_jing: 'shield', qin_hui: 'mage', zhang_bangchang: 'tank', wan_qixie: 'hp', luo_ruji: 'mage' };
    const ctrl = 'gongsun_sheng';
    const wr = (t, o, n, f) => { let w = 0; for (let i = 0; i < n; i++) if (fight(t, o, f).win) w++; return w / n; };
    // 把对面缩放到「对照组正好五五开」
    const even = (t, o) => { let lo = 0.3, hi = 3; for (let i = 0; i < 9; i++) { const m = Math.sqrt(lo * hi); if (wr(t, o, 40, m) > 0.5) lo = m; else hi = m; } return Math.sqrt(lo * hi); };
    out.counter = {};
    for (const [j, comp] of Object.entries(JIAN)) {
      let b8 = base8.slice();
      if (j === 'luo_ruji') b8[7] = 'qin_hui';      // 罗汝楫要配秦桧
      const M = N * 3;
      const fT = even(b8.concat([ctrl]), COMPS[comp]), fN = even(b8.concat([ctrl]), COMPS.neutral);
      const r = {
        vsTarget: { jian: wr(b8.concat([j]), COMPS[comp], M, fT), ctrl: wr(b8.concat([ctrl]), COMPS[comp], M, fT) },
        vsNeutral: { jian: wr(b8.concat([j]), COMPS.neutral, M, fN), ctrl: wr(b8.concat([ctrl]), COMPS.neutral, M, fN) },
      };
      r.edge = +((r.vsTarget.jian - r.vsTarget.ctrl) - (r.vsNeutral.jian - r.vsNeutral.ctrl)).toFixed(2);
      out.counter[nm(j) + '→' + comp] = r;
    }

    // C. 流血中毒穿盾、驱散：扫一场战报
    const b = fight(['wan_qixie', 'cai_jing', 'luo_ruji', 'qin_hui', 'gai_tianxi', 'he_taiping', 'lin_chong', 'guan_sheng', 'lu_junyi'], COMPS.shield);
    out.logSample = b.log.map(l => l.s).filter(s => /驱散|中毒|流血|护盾挡/.test(s)).slice(0, 25);
    return out;
  }, N);
  console.log(JSON.stringify(r, null, 1));
  console.log('errors:', errs);
  await br.close();
})();
