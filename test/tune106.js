// V10.6 连续评分：候选人 + 八个天罡武将 vs 九个绝世武将（缩放），score = 我方剩血比 − 敌方剩血比
//   node test/score106.js <html> [场数]
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.resolve(process.argv[2])); await pg.waitForTimeout(300);
  if (process.env.C) await pg.evaluate(v => { window.__C = v.split(','); }, process.env.C);
  if (process.env.T) await pg.evaluate(v => { window.__T = v; }, +process.env.T);
  if (process.env.MB) await pg.evaluate(v => {
    Battle.basic = function (b, u) {
      const tg = this.single(b, u); if (!tg.length) return; const t = tg[0];
      if (this.dodged(b, t)) return;
      const a = Math.max(this.eff(u, 'atk'), this.magic(u) * v);
      const d = this.dmg(a, this.eff(t, 'def'), a, 1, this.critOf(u), u);
      this.hurt(b, t, d.v, u, d.crit ? 'crit' : '');
      if (!t.alive || !u.alive) return;
      for (const f of u.pas.onhit) if (chance(f.chance)) this.putStatus(b, u, t, { ...f, base: this.eff(u, 'atk') });
      const fo = u.pas.follow;
      if (fo && t.alive && chance(fo.chance)) { const d2 = this.dmg(a, this.eff(t, 'def'), a * fo.mult, 1, this.critOf(u), u); this.hurt(b, t, d2.v, u, 'follow'); }
    };
  }, +process.env.MB);
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
    const ORIG = {};
    const scale = (hid, k) => {
      for (const sid of DB.hero(hid).sk) {
        const s = DB.skill(sid); if (!ORIG[sid]) ORIG[sid] = JSON.parse(JSON.stringify(s.fx));
        s.fx = ORIG[sid].map(f0 => { const f = Object.assign({}, f0);
          if (f.k === 'dmg') f.mult *= k;
          else if (f.k === 'buff' || f.k === 'debuff' || f.k === 'shield' || f.k === 'steal') f.pct *= k;
          else if (f.k === 'heal') { if (f.pct) f.pct *= k; else f.mult *= k; }
          else if (f.k === 'status' && f.chance != null && f.chance < 1 && ['stun', 'chaos', 'silence'].includes(f.st)) f.chance = Math.min(0.95, f.chance * Math.sqrt(k));
          else if (['pstat', 'pcut', 'pdmg', 'pregen'].includes(f.k)) f.pct *= k;
          return f; });
      }
    };
    const best = (c, n) => Math.max(score(c, 0, n), score(c, 7, n));
    const T = +(window.__T || 0.25);
    const out = {};
    for (const c of (window.__C || ['luo_zhenren', 'gongsun_sheng', 'wu_yong', 'song_jiang', 'qiao_daoqing', 'liu_huiniang', 'zong_ze', 'gao_qiu', 'cai_jing', 'qin_hui', 'zhang_shuye', 'chen_xizhen'])) {
      const s0 = best(c, N);
      let lo = 0.5, hi = 3.5;
      for (let i = 0; i < 7; i++) { const m = Math.sqrt(lo * hi); scale(c, m); if (best(c, N) < T) lo = m; else hi = m; }
      const k = Math.sqrt(lo * hi); scale(c, k); const s1 = best(c, N); scale(c, 1);
      out[DB.hero(c).name] = { 原分: +s0.toFixed(3), k: +k.toFixed(2), 调后: +s1.toFixed(3) };
    }
    return out;
  }, N);
  console.log(JSON.stringify(r)); console.log('errors:', errs); await br.close();
})();
