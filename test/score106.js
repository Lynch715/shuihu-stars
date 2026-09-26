// V10.6 连续评分：候选人 + 八个天罡武将 vs 九个绝世武将（缩放），score = 我方剩血比 − 敌方剩血比
//   node test/score106.js <html> [场数]
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.resolve(process.argv[2])); await pg.waitForTimeout(300);
  const N = +(process.argv[3] || 60);
  const r = await pg.evaluate((N) => {
    if (DB.foeHero) DB.foeHero = DB.hero;   // 对拼：两边都是玩家口径，不用敌方快照
    initGame('classic');
    const all = DB.heroIds().filter(k => DB.hero(k).src !== '杂兵');
    for (const hid of all) { Grow.gainHero(hid); const h = G.heroes[hid]; h.lv = 50; h.star = 5; h.base = Object.assign({}, grownBase(hid, 50)); h.owned = DB.hero(hid).sk.slice(0, 4); h.equipment = {}; h.hurt = null; const set = DB.excSet(hid); if (set) for (const id of set.items) h.equipment[DB.equip(id).slot] = id; }
    const fight = (A, Bt, f) => { const allies = A.map((h, i) => Battle.unit(h, Stats.calc(h, { team: A }), true, i)); const foes = Bt.map((h, i) => Battle.unit(h, Stats.calc(h, { team: Bt }), false, i)); for (const u of foes) { for (const k of ['atk', 'def', 'int']) u[k] = Math.round(u[k] * f); u.maxHp = Math.round(u.maxHp * f); u.hp = u.maxHp; } const b = { sid: 'ch1_1', stage: DB.stage('ch1_1'), allies, foes, round: 0, over: false, win: null, log: [], events: [] }; Battle.tagNames(b); Battle.runAll(b); return b; };
    const q = n => all.filter(k => DB.hero(k).q === n);
    const wu5 = q(5).filter(k => DB.hero(k).atk > DB.hero(k).int && !DB.excSet(k)).slice(0, 8);
    const opp = ['lin_chong', 'lu_junyi', 'guan_sheng', 'shi_wengong', 'gao_chong', 'du_jue', 'hu_yanzhuo', 'yue_fei', 'lu_zhishen'];
    const frac = us => us.reduce((a, u) => a + Math.max(0, u.hp), 0) / us.reduce((a, u) => a + u.maxHp, 0);
    const score = (c, pos, n) => { const t = wu5.slice(0, 8); t.splice(pos, 0, c); let s = 0; for (let i = 0; i < n; i++) { const b = fight(t, opp, 0.346); s += frac(b.allies) - frac(b.foes); } return s / n; };
    const G1 = { 绝世武将: ['lin_chong', 'guan_sheng', 'shi_wengong', 'hu_yanzhuo', 'yue_fei', 'du_jue', 'bian_xiang', 'wang_yin'],
                 天罡武将: ['qin_ming', 'dong_ping', 'zhang_qing', 'suo_chao', 'xu_ning', 'mu_hong', 'lei_heng', 'huang_xin'].filter(h => DB.hero(h) && !wu5.includes(h)),
                 绝世文官: ['luo_zhenren', 'gongsun_sheng', 'wu_yong', 'song_jiang', 'qiao_daoqing', 'liu_huiniang', 'zong_ze', 'gao_qiu', 'cai_jing', 'qin_hui', 'zhang_shuye', 'chen_xizhen'],
                 天罡名将文官: ['li_gang', 'su_yuanjing', 'he_taiping', 'zhang_bangchang', 'li_ruoshui', 'gai_tianxi', 'jin_chengying', 'wan_qixie', 'luo_ruji', 'zhu_wu', 'an_daoquan', 'xiao_jiasui'] };
    const out = {};
    for (const [g, list] of Object.entries(G1)) { out[g] = {}; for (const c of list) { const a = score(c, 0, N), b = score(c, 7, N); out[g][DB.hero(c).name + '/' + DB.hero(c).q] = { 前排: +a.toFixed(3), 后排: +b.toFixed(3), 取高: +Math.max(a, b).toFixed(3) }; } }
    return out;
  }, N);
  console.log(JSON.stringify(r)); console.log('errors:', errs); await br.close();
})();
