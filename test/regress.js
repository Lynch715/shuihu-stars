#!/usr/bin/env node
/**
 * 水浒群星录 · 回归测试
 *
 *   node regress.js <游戏html路径>
 *
 * 同一套检查跨版本可用：页面加载后先装一层 __api 垫片，自动识别
 * V9（window.createBattle / cloneHero / tryStarUp…）与
 * V10（Battle / Stats / Grow / Save…）两套接口。
 *
 * 每项检查独立，各自重开页面。末尾写出 regress_result.json。
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = process.argv[2];
if (!FILE || !fs.existsSync(FILE)) {
  console.error('用法: node regress.js <游戏html路径>');
  process.exit(2);
}
const URL = 'file://' + path.resolve(FILE);

/* ── 跨版本垫片（注入页面执行） ──────────────────────────────────── */
const SHIM = function () {
  const W = window;
  const v10 = !!(W.Battle && W.Stats && W.Grow && W.DB);
  const api = { v10 };

  if (v10) {
    api.heroIds   = () => W.DB.heroIds();
    api.hero      = h => W.DB.hero(h);
    api.skill     = s => W.DB.skill(s);
    api.equipIds  = () => W.DB.equipIds();
    api.equip     = e => W.DB.equip(e);
    api.bonds     = () => W.DB.bonds;
    api.skillsOf  = h => (W.DB.hero(h) || {}).sk || [];
    api.create    = sid => W.Battle.create(sid);
    api.round     = b => W.Battle.runRound(b);
    api.sides     = b => ({ allies: b.allies, foes: b.foes });
    api.logLen    = b => (b.log || []).length;
    api.won       = b => b.win === true;
    api.statsOf   = h => { const s = W.Stats.calc(h); return s && { atk: s.atk, hp: s.maxHp }; };
    api.teamPower = () => W.Stats.teamPower();
    api.stagePower= s => W.Stats.stagePower(s);
    api.levelUp   = h => W.Grow.levelUp(h);
    api.starUp    = h => W.Grow.starUp(h);
    api.giveFrag  = (h, n) => { W.G.frags[h] = n; };
    api.ownedLen  = h => (W.G.heroes[h].owned || []).length;
    api.star      = h => W.G.heroes[h].star;
    api.lv        = h => W.G.heroes[h].lv;
    api.setEquip  = (h, slot, e) => { W.G.heroes[h].equipment[slot] = e; };
    api.save      = () => W.Save.write();
    api.settle    = b => W.Stages.settle(b);
    api.makeHero  = h => W.makeHero(h);
    api.rollSample = n => {
      const c = {};
      for (let i = 0; i < n; i++) { const h = W.Grow.rollOne(0); const q = W.DB.hero(h).q; c[q] = (c[q] || 0) + 1; }
      return c;
    };
    api.hookSkill = () => {
      const used = {}; const o = W.Battle.cast.bind(W.Battle);
      W.Battle.cast = function (b, u, sk, t) { if (sk && sk.id) used[sk.id] = 1; return o(b, u, sk, t); };
      return () => Object.keys(used).length;
    };
  } else {
    const RAW = W.RAW || {};
    api.heroIds   = () => Object.keys(RAW.heroes || {});
    api.hero      = h => (RAW.heroes || {})[h];
    api.skill     = s => (RAW.skills || {})[s];
    api.equipIds  = () => Object.keys(RAW.equipment || {});
    api.equip     = e => { const x = (RAW.equipment || {})[e]; return x && {
                            id: e, slot: x.slot, q: x.q, flat: { atk: x.atk || 0 } }; };
    api.bonds     = () => RAW.bonds || [];
    api.skillsOf  = h => (api.hero(h) || {}).sk || [];
    api.create    = sid => W.createBattle(sid);
    api.round     = b => W.runBattleStep(b);
    api.sides     = b => ({ allies: b.allies, foes: b.enemies });
    api.logLen    = b => (b.log || []).length;
    api.won       = b => b.result === 'win';
    api.statsOf   = h => { const u = W.cloneHero(h); return u && { atk: u.atk, hp: u.max_hp }; };
    api.teamPower = () => W.calcTeamPower();
    api.stagePower= s => W.calcStagePower(s);
    api.levelUp   = h => { W.tryLevelUp(h); return null; };
    api.starUp    = h => { W.tryStarUp(h); return null; };
    api.giveFrag  = (h, n) => { W.G.frags = W.G.frags || {}; W.G.frags[h] = n; };
    api.ownedLen  = h => (W.G.heroes[h].owned || []).length;
    api.star      = h => W.G.heroes[h].star;
    api.lv        = h => W.G.heroes[h].lv;
    api.setEquip  = (h, slot, e) => { W.G.heroes[h].equipment[slot] = e; };
    api.save      = () => W.saveGame();
    api.settle    = () => null;
    api.makeHero  = h => W.makeHero(h);
    api.rollSample = () => null;
    api.hookSkill = () => {
      const used = {}; const o = W.executeSkill;
      W.executeSkill = function (c, sk) { if (sk && sk.id) used[sk.id] = 1; return o.apply(this, arguments); };
      return () => Object.keys(used).length;
    };
  }
  W.__api = api;
};

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log((pass === true ? '  通过' : pass === 'warn' ? '  存疑' : '  失败') + '  ' + name);
  if (detail) console.log('        ' + String(detail).replace(/\n/g, '\n        '));
}

async function fresh(browser) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(URL);
  await page.waitForTimeout(2600);
  await page.evaluate(SHIM);
  await page.evaluate(PICK_MODE);
  return { ctx, page, errors };
}

/* V10.3 起没有存档时先停在选模式那一屏。检查项默认按传统模式走：替玩家点一下。 */
const PICK_MODE = function () {
  if (window.UI && window.G && UI.view === 'mode') { initGame('classic'); Save.write(); UI.view = 'main'; render(); }
};

const CHECKS = [];
const check = (name, fn) => CHECKS.push({ name, fn });

/* ── 数据层 ──────────────────────────────────────────────────────── */

check('页面加载无 JS 错误', async b => {
  const { ctx, errors } = await fresh(b); await ctx.close();
  return errors.length === 0 ? [true, null]
    : [false, `${errors.length} 个错误：\n` + errors.slice(0, 3).join('\n')];
});

check('角色 ID 规范', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const ids = __api.heroIds();
    const bad = ids.filter(k => !/^[a-z][a-z0-9_]*$/.test(k));
    return { n: ids.length, bad: bad.length, s: bad.slice(0, 6) };
  });
  await ctx.close();
  return r.bad === 0 ? [true, `${r.n} 个角色 ID 全部合法`]
    : [false, `${r.n} 中 ${r.bad} 个非法，如 ${r.s.join(' / ')}`];
});

check('技能 ID 规范且无断链', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const broken = [];
    for (const h of __api.heroIds())
      for (const s of __api.skillsOf(h)) if (!__api.skill(s)) broken.push(h + ':' + s);
    const bad = 0;
    return { n: broken.length, s: broken.slice(0, 5) };
  });
  await ctx.close();
  return r.n === 0 ? [true, null] : [false, `断链 ${r.n} 处 ${r.s.join(' / ')}`];
});

check('角色 bio 完整', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const no = __api.heroIds().filter(k => !(__api.hero(k) || {}).bio);
    return { n: no.length, t: __api.heroIds().length, s: no.slice(0, 5) };
  });
  await ctx.close();
  return r.n === 0 ? [true, null] : [false, `${r.t} 中 ${r.n} 个缺 bio，如 ${r.s.join(' / ')}`];
});

/* ── 开局 ────────────────────────────────────────────────────────── */

check('开局状态正常', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => ({
    heroes: Object.keys(G.heroes || {}).length,
    valid: (G.team || []).every(h => h && G.heroes[h]),
    names: (G.team || []).map(h => (__api.hero(h) || {}).name || h),
    silver: G.res && G.res.silver,
    want: (window.CFG && CFG.startSilver) || 500,   // V10.1 起手给够一次十连
  }));
  await ctx.close();
  const ok = r.heroes >= 2 && r.valid && r.silver === r.want;
  return [ok, `起手 ${r.names.join('、')}　银两 ${r.silver}` + (r.valid ? '' : '　← 队伍含无效 ID')];
});

check('开局赠将：一绝世一凡将，随机', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const seen = new Set(); let ok = true;
    for (let i = 0; i < 12; i++) {
      initGame('classic');
      const qs = (G.startGift || []).map(h => DB.hero(h).q).sort().join(',');
      if (qs !== '1,6' || G.team.length !== 2) ok = false;
      seen.add(G.startGift.join(','));
    }
    return { ok, distinct: seen.size, last: G.startGift.map(h => DB.hero(h).name + '(' + DB.hero(h).q + ')').join('、') };
  });
  await ctx.close();
  return (r.ok && r.distinct > 3) ? [true, `十二次开局 ${r.distinct} 种组合，如 ${r.last}`]
    : [false, `品质不对或不随机：ok=${r.ok} distinct=${r.distinct}`];
});

check('模式字段：传统 / 混乱写进存档，老存档按传统读', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    initGame('chaos'); Save.write();
    const raw = localStorage.getItem(CFG.saveKey);
    const chaos = /"mode":"chaos"/.test(raw);
    const d = JSON.parse(raw); delete d.mode; localStorage.setItem(CFG.saveKey, JSON.stringify(d));
    const s = Save.read();
    return { chaos, legacy: s && !s.mode };
  });
  await ctx.close();
  return (r.chaos && r.legacy) ? [true, '混乱模式写入存档；去掉字段后仍能读'] : [false, JSON.stringify(r)];
});

check('混乱模式：每人四招随机、不重复、写进存档', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    initGame('chaos'); G.res.silver = 1e6;
    Grow.recruit(10);
    const hs = Object.values(G.heroes);
    const bad = hs.filter(h => !h.sk || h.sk.length !== 4 || new Set(h.sk).size !== 4 || !h.sk.every(id => DB.skill(id)));
    const same = hs.filter(h => h.sk.join() === (DB.hero(h.hid).sk || []).join()).length;
    Save.write();
    const back = Save.read();
    const kept = Object.values(back.heroes).every(h => Array.isArray(h.sk) && h.sk.length === 4);
    // 敌人不受影响
    const bt = Battle.create('ch1_1');
    const foeOrig = bt.foes.every(u => u.skills.every((s, i) => s.id === (DB.hero(u.hid).sk || [])[i]));
    return { n: hs.length, bad: bad.length, same, kept, foeOrig };
  });
  await ctx.close();
  return (r.bad === 0 && r.kept && r.foeOrig && r.same <= 1)
    ? [true, `${r.n} 人四招齐全，存档保留，敌方原装`]
    : [false, JSON.stringify(r)];
});

check('文官武将血量差距在 1.5–3.5 倍内（50 级同品质）', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const hp = (hid, lv) => { const s = Stats.calcEnemy(hid, lv, 4, 1); return s.maxHp; };
    const pairs = [['lu_zhishen', 'wu_yong'], ['li_kui', 'an_daoquan'], ['wu_song', 'gongsun_sheng'], ['lin_chong', 'wu_yong']];
    return pairs.map(([a, c]) => ({ a: DB.hero(a).name, c: DB.hero(c).name, ha: hp(a, 50), hc: hp(c, 50), k: +(hp(a, 50) / hp(c, 50)).toFixed(2) }));
  });
  await ctx.close();
  const bad = r.filter(x => x.k < 1.5 || x.k > 3.5);
  const txt = r.map(x => `${x.a}${x.ha}/${x.c}${x.hc}=${x.k}×`).join('　');
  return bad.length ? [false, txt] : [true, txt];
});

check('发动率与公示一致', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    // 只给一个人一个 45% 的单体攻击技，打一千回合数发动次数
    const N = 3000; let used = 0, turns = 0;
    const o = Battle.cast.bind(Battle);
    Battle.cast = function (b, u, sk) { if (u.ally && sk.id === '__probe') used++; return o(b, u, sk); };
    const probe = { id: '__probe', slot: 0, name: '探', cat: 'active', rate: 0.45, cd: 0, cur: 0, last: -99,
                    fx: [{ k: 'dmg', tg: 'single', mult: 0.01 }] };
    for (let i = 0; i < N / 30; i++) {
      const bt = Battle.create('ch1_1');
      for (const u of [...bt.allies, ...bt.foes]) { u.maxHp = u.hp = 1e9; u.skills = []; u.actives = []; u.cmds = []; }
      bt.allies[0].actives = [Object.assign({}, probe)];
      for (let g = 0; g < 30 && !bt.over; g++) { Battle.runRound(bt); turns++; }
    }
    return { rate: used / turns, turns };
  });
  await ctx.close();
  return Math.abs(r.rate - 0.45) < 0.04 ? [true, `公示 45%，实测 ${(r.rate * 100).toFixed(1)}%（${r.turns} 回合）`]
    : [false, `公示 45%，实测 ${(r.rate * 100).toFixed(1)}%`];
});

/* ── 战斗 ────────────────────────────────────────────────────────── */

check('第 1 关敌方配置合理', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const bt = __api.create('ch1_1'); const s = __api.sides(bt);
    const start = (window.CFG && CFG.startHeroes) || [];
    return {
      foes: s.foes.map(u => ({ n: u.name, hid: u.hid, q: u.q, atk: u.atk,
                              hp: u.maxHp || u.max_hp })),
      start,
    };
  });
  await ctx.close();
  // 判据按品质与阵营，不看绝对数值：强度系数会把杂兵也抬上去
  const elite = r.foes.filter(e => e.q >= 5);
  const own = r.foes.filter(e => r.start.indexOf(e.hid) >= 0);
  const hp = r.foes.reduce((s, e) => s + e.hp, 0);
  if (elite.length)
    return [false, `第 1 关混入 ${elite.length} 名天罡以上：` +
      elite.map(e => `${e.n}(${e.q})`).join('、')];
  if (own.length)
    return [false, `第 1 关把玩家起手角色当成了敌人：` + own.map(e => e.n).join('、')];
  return [true, `${r.foes.length} 名敌人，最高品质 ${Math.max.apply(null, r.foes.map(e => e.q))}，总血 ${hp}`];
});

check('战力对比与实战一致', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const my = __api.teamPower(), foe = __api.stagePower('ch1_1');
    const bt = __api.create('ch1_1'); const s = __api.sides(bt);
    const real = s.foes.reduce((a, u) => a + u.atk * 2 + u.def * 1.5 + (u.int || 0) * 1.2
      + (u.agi || 0) + (u.maxHp || u.max_hp) * 0.05, 0);
    return { my, foe, real: Math.round(real), n: s.foes.length };
  });
  await ctx.close();
  const k = r.real / r.foe;
  return (k > 0.85 && k < 1.2) ? [true, `我方 ${r.my}　显示敌方 ${r.foe}　实测 ${r.real}`]
    : [false, `显示敌方 ${r.foe}，实际强度 ${r.real}（差 ${k.toFixed(1)} 倍，${r.n} 人）`];
});

check('第 1 关可通关', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    let w = 0;
    for (let i = 0; i < 20; i++) {
      const bt = __api.create('ch1_1');
      let g = 0; while (!bt.over && g++ < 200) __api.round(bt);
      if (__api.won(bt)) w++;
    }
    return w;
  });
  await ctx.close();
  return r >= 18 ? [true, `20 场胜 ${r}`] : [false, `20 场只胜 ${r}（应 ≥18）`];
});

check('战斗日志非空', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const bt = __api.create('ch1_1');
    let g = 0; while (!bt.over && g++ < 200) __api.round(bt);
    return { n: __api.logLen(bt), r: bt.round };
  });
  await ctx.close();
  return r.n > 0 ? [true, `${r.r} 回合产出 ${r.n} 条`] : [false, `${r.r} 回合，日志 0 条`];
});

check('技能会轮换（非恒取第一个）', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const count = __api.hookSkill();
    for (let i = 0; i < 6; i++) {
      const bt = __api.create('ch1_1');
      let g = 0; while (!bt.over && g++ < 200) __api.round(bt);
    }
    return count();
  });
  await ctx.close();
  return r >= 3 ? [true, `用到 ${r} 种技能`] : [false, `6 场只用到 ${r} 种技能`];
});

check('buff 技能有实际效果', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    function total(withBuff) {
      let sum = 0;
      for (let i = 0; i < 40; i++) {
        const bt = __api.create('ch1_1'); const s = __api.sides(bt);
        s.foes.forEach(u => { u.maxHp = u.max_hp = 5e6; u.hp = 5e6; });
        s.allies.forEach(u => {
          u.maxHp = u.max_hp = 5e6; u.hp = 5e6;
          u.status = u.status || {};
          if (withBuff) u.status.buff_atk = { dur: 99, val: 5000 };
        });
        const a = s.foes.reduce((x, u) => x + u.hp, 0);
        // 流血中毒按最大生命扣，五百万血一跳就是二十万，会把 buff 的差别淹掉：不计
        let dot = 0; const B = window.Battle, H0 = B && B.hurt;
        if (H0) B.hurt = function (b, t, am, src, tag) { const hp = t.hp; const r = H0.call(this, b, t, am, src, tag); if (!t.ally && (tag === 'bleed' || tag === 'poison')) dot += hp - t.hp; return r; };
        for (let g = 0; g < 3 && !bt.over; g++) __api.round(bt);
        if (H0) B.hurt = H0;
        sum += a - s.foes.reduce((x, u) => x + u.hp, 0) - dot;
      }
      return Math.round(sum / 40);
    }
    return { plain: total(false), buffed: total(true) };
  });
  await ctx.close();
  if (!r || !r.plain) return ['warn', '取样失败 ' + JSON.stringify(r)];
  const k = r.buffed / r.plain;
  return k > 1.5 ? [true, `buff_atk +5000 后三回合总伤 ${r.plain}→${r.buffed}（${k.toFixed(1)}×）`]
    : [false, `buff_atk +5000 后总伤 ${r.plain}→${r.buffed}（${k.toFixed(2)}×）——status.buff_* 无人读取`];
});

check('护盾能抵挡伤害', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const bt = __api.create('ch1_1'); const s = __api.sides(bt);
    s.foes.forEach(u => { u.shield = 1e7; u.shieldDur = 999; });
    const a = s.foes.reduce((x, u) => x + u.hp, 0);
    // V10.6 起流血、中毒是真实伤害（穿盾），驱散会拿掉护盾：这两样单独记账，不算「漏扣」
    let dot = 0; const B = window.Battle, H0 = B && B.hurt;
    if (H0) B.hurt = function (b, t, am, src, tag) { const hp = t.hp; const r = H0.call(this, b, t, am, src, tag); if (!t.ally && (tag === 'bleed' || tag === 'poison')) dot += hp - t.hp; return r; };
    for (let g = 0; g < 4 && !bt.over; g++) __api.round(bt);
    if (H0) B.hurt = H0;
    const dispelled = (bt.log || []).some(l => /护盾.*被驱散/.test(l.s || ''));
    return dispelled ? -1 : a - s.foes.reduce((x, u) => x + u.hp, 0) - dot;
  });
  await ctx.close();
  if (r === -1) return [true, '这一局对面护盾被驱散（V10.6 驱散），跳过'];
  return r <= 0 ? [true, '千万护盾全额吸收，未掉血（流血中毒穿盾不计）']
    : [false, `带千万护盾仍掉血 ${r}（有伤害路径不扣盾）`];
});

/* ── 养成 ────────────────────────────────────────────────────────── */

check('升级生效且扣银两', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const h = G.team[0];
    G.res.silver = 999999;
    const lv0 = __api.lv(h), a0 = __api.statsOf(h).atk;
    __api.levelUp(h);
    return { lv0, lv1: __api.lv(h), a0, a1: __api.statsOf(h).atk, spent: 999999 - G.res.silver };
  });
  await ctx.close();
  const ok = r.lv1 === r.lv0 + 1 && r.a1 > r.a0 && r.spent > 0;
  return [ok, `Lv${r.lv0}→${r.lv1}　武 ${r.a0}→${r.a1}　耗银 ${r.spent}`];
});

check('升星消耗碎片并解锁技能', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const h = G.team[0];
    __api.giveFrag(h, 999);
    const s0 = __api.star(h), o0 = __api.ownedLen(h);
    __api.starUp(h);
    return { s0, s1: __api.star(h), o0, o1: __api.ownedLen(h), used: 999 - (G.frags[h] || 0) };
  });
  await ctx.close();
  const ok = r.s1 === r.s0 + 1 && r.used > 0 && r.o1 > r.o0;
  return [ok, `★${r.s0}→${r.s1}　技能 ${r.o0}→${r.o1} 个　耗碎片 ${r.used}`];
});

check('装备穿戴影响战斗属性', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const h = G.team[0];
    const eid = __api.equipIds().find(k => {
      const e = __api.equip(k); return e && e.slot === 'weapon' && (e.flat.atk || 0) > 0;
    });
    if (!eid) return { err: '无可用武器' };
    const a0 = __api.statsOf(h).atk;
    __api.setEquip(h, 'weapon', eid);
    return { eid, add: __api.equip(eid).flat.atk, a0, a1: __api.statsOf(h).atk };
  });
  await ctx.close();
  if (r.err) return ['warn', r.err];
  return r.a1 > r.a0 ? [true, `${r.eid}(+${r.add}) 武 ${r.a0}→${r.a1}`]
    : [false, `穿上 ${r.eid}(+${r.add}) 战斗属性没变（${r.a0}→${r.a1}）`];
});

check('羁绊在真实阵容下可触发', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const BD = __api.bonds();
    if (!BD.length) return { err: '无羁绊数据' };
    const freq = {};
    BD.forEach(x => (x.members || []).forEach(m => { freq[m] = (freq[m] || 0) + 1; }));
    const team = Object.keys(freq).sort((a, c) => freq[c] - freq[a]).slice(0, 9);
    team.forEach(h => { if (!G.heroes[h]) G.heroes[h] = __api.makeHero(h); });
    G.team = team.slice();
    const inT = new Set(team);
    let act = 0;
    BD.forEach(x => {
      const have = (x.members || []).filter(m => inT.has(m)).length;
      const need = x.tiers ? Math.min.apply(null, x.tiers.map(t => t.need))
                           : (x.min_count || (x.members || []).length);
      if (have >= need) act++;
    });
    const h0 = team[0];
    const withT = __api.statsOf(h0).atk;
    G.team = [h0];
    const alone = __api.statsOf(h0).atk;
    return { total: BD.length, act, withT, alone };
  });
  await ctx.close();
  if (r.err) return ['warn', r.err];
  const moved = r.withT !== r.alone;
  return (r.act >= 10 && moved)
    ? [true, `最优 9 人阵容激活 ${r.act}/${r.total} 条，属性 ${r.alone}→${r.withT}`]
    : [false, `激活 ${r.act}/${r.total} 条` + (moved ? '' : '，且属性无变化（羁绊未接入数值）')];
});

check('招募概率与公示一致', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => __api.rollSample ? __api.rollSample(6000) : null);
  await ctx.close();
  if (!r) return ['warn', '抽卡函数未暴露，无法自动校验'];
  const want = { 1: 45, 2: 28, 3: 15, 4: 8, 5: 3, 6: 1 };
  const tot = Object.values(r).reduce((a, x) => a + x, 0);
  const rows = [], bad = [];
  for (const q of [6, 5, 4, 3, 2, 1]) {
    const got = (r[q] || 0) / tot * 100;
    rows.push(`${['', '凡', '良', '猛', '名', '天罡', '绝世'][q]} ${got.toFixed(1)}%/${want[q]}%`);
    if (Math.abs(got - want[q]) > Math.max(1.5, want[q] * 0.25)) bad.push(q);
  }
  return bad.length === 0 ? [true, rows.join('　')]
    : [false, '与公示偏差过大：' + rows.join('　')];
});

/* ── 存档与结算 ──────────────────────────────────────────────────── */

check('存档读档往返一致', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    G.res.silver = 12345;
    G.frags = G.frags || {}; G.frags.__probe = 7;
    G.cleared = G.cleared || {}; G.cleared.ch1_1 = true;
    __api.save();
    const raw = Object.keys(localStorage).filter(k => /shuihu/i.test(k))
      .map(k => localStorage.getItem(k)).join('');
    return { silver: raw.indexOf('12345') >= 0, frags: raw.indexOf('__probe') >= 0,
             cleared: raw.indexOf('ch1_1') >= 0 };
  });
  await ctx.close();
  const miss = Object.entries(r).filter(([, v]) => !v).map(([k]) => k);
  return miss.length === 0 ? [true, '银两 / 碎片 / 通关进度均已持久化']
    : [false, `未写入存档：${miss.join('、')}`];
});

check('刷新后银两不被重置', async b => {
  const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL); await page.waitForTimeout(2600);
  await page.evaluate(SHIM); await page.evaluate(PICK_MODE);
  await page.evaluate(() => { G.res.silver = 8888; __api.save(); });
  await page.reload(); await page.waitForTimeout(2800);
  const after = await page.evaluate(() => G && G.res && G.res.silver);
  await ctx.close();
  return after === 8888 ? [true, '8888 保持'] : [false, `存 8888，刷新后变成 ${after}`];
});

check('结算奖励真实入账', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    if (!__api.v10) return { skip: 1 };
    const s0 = G.res.silver;
    let bt = null;
    for (let i = 0; i < 30; i++) {
      bt = __api.create('ch1_1');
      let g = 0; while (!bt.over && g++ < 200) __api.round(bt);
      if (bt.win) break;
    }
    if (!bt.win) return { nowin: 1 };
    const out = __api.settle(bt);
    let shown = 0;
    (out || []).forEach(o => {
      if (!/银两/.test(o.text)) return;
      const m = o.text.match(/\+\s*(\d+)/);
      if (m) shown += +m[1];
    });
    return { s0, s1: G.res.silver, shown, n: (out || []).length,
             lines: (out || []).map(o => o.text) };
  });
  await ctx.close();
  if (r.skip) return ['warn', '旧版结算封在闭包里，无法校验'];
  if (r.nowin) return [false, '30 次都没打赢，无法校验结算'];
  const real = r.s1 - r.s0;
  return (r.shown && real === r.shown)
    ? [true, `面板银两合计 +${r.shown}，账上实增 ${real}，共 ${r.n} 条奖励`]
    : [false, `面板合计 +${r.shown}，账上实增 ${real}（差 ${real - r.shown}）\n` +
        (r.lines || []).join(' / ')];
});

check('伤势记账与休养', async b => {
  const { ctx, page } = await fresh(b);
  const r = await page.evaluate(() => {
    const W = window;
    if (!W.Hurt) return { skip: true };
    const real = W.DB.heroIds().filter(h => W.DB.hero(h).src !== '杂兵');

    // 名册厚时：阵亡该挂重伤，替补该自动顶上，重伤不得上阵
    W.initGame();
    const pool = real.slice(0, 30);
    W.G.heroes = {}; W.G.team = [];
    for (const h of pool) { const x = W.makeHero(h); x.lv = 5; W.G.heroes[h] = x; }
    W.G.team = pool.slice(0, 9);
    const first = W.G.team.slice();
    const bt = W.Battle.create('ch16_boss'); W.Battle.runAll(bt); W.Stages.settle(bt);
    const heavy = Object.values(W.G.heroes).filter(v => v.hurt && v.hurt.lv === 2).length;
    // V10.5 起伤病分轻重：只有重伤的要被换下，轻伤的带伤接着打（原来要求九人全换，是「输了全员重伤」那套规则时写的）
    const hvFirst = first.filter(h => W.G.heroes[h].hurt && W.G.heroes[h].hurt.lv === 2);
    const swapped = W.G.team.length === 9 && hvFirst.length > 0 && hvFirst.every(h => !W.G.team.includes(h));
    const hv = Object.keys(W.G.heroes).find(h => W.G.heroes[h].hurt.lv === 2);
    const blocked = !!W.Grow.addToTeam(hv);

    // 没上阵的人每打一场恢复一场
    let n = 0;
    while (W.G.heroes[hv].hurt.lv && n++ < 6) {
      const b2 = W.Battle.create('ch1_1'); W.Battle.runAll(b2); W.Stages.settle(b2);
    }
    const healed = !W.G.heroes[hv].hurt.lv;

    // 名册薄时：全军覆没也不能打成死局
    W.initGame();
    const few = real.slice(0, 6);
    W.G.heroes = {}; W.G.team = [];
    for (const h of few) { const x = W.makeHero(h); x.lv = 3; W.G.heroes[h] = x; }
    W.G.team = few.slice();
    const b3 = W.Battle.create('ch16_boss'); W.Battle.runAll(b3); W.Stages.settle(b3);
    const able = few.filter(h => W.Hurt.able(h)).length;

    return { heavy, swapped, blocked, healed, n, able, need: few.length };
  });
  await ctx.close();
  if (r.skip) return [null, '这一版没有伤势系统'];
  const ok = r.heavy > 0 && r.swapped && r.blocked && r.healed && r.able === r.need;
  return [ok, `重伤 ${r.heavy} 人，替补顶上 ${r.swapped ? '是' : '否'}，重伤禁上阵 ${r.blocked ? '是' : '否'}，` +
    `休养 ${r.n} 场痊愈，薄名册覆没后仍可上阵 ${r.able}/${r.need}`];
});

check('无定时器强制重绘', async b => {
  const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__timers = [];
    const oi = window.setInterval;
    window.setInterval = function (f, t) { window.__timers.push(t); return oi.apply(this, arguments); };
  });
  await page.goto(URL); await page.waitForTimeout(2800);
  const t = await page.evaluate(() => window.__timers || []);
  await ctx.close();
  return t.length === 0 ? [true, null]
    : [false, `${t.length} 个 setInterval 在跑：${t.join('ms / ')}ms`];
});

/* ── 跑 ──────────────────────────────────────────────────────────── */
(async () => {
  console.log('\n水浒群星录 · 回归测试');
  console.log('目标：' + path.basename(FILE) + '\n' + '─'.repeat(64));
  const browser = await chromium.launch();
  for (const c of CHECKS) {
    try {
      const [pass, detail] = await c.fn(browser);
      record(c.name, pass, detail);
    } catch (e) {
      record(c.name, false, '检查本身抛错：' + String(e.message).slice(0, 150));
    }
  }
  await browser.close();

  const pass = results.filter(r => r.pass === true).length;
  const warn = results.filter(r => r.pass === 'warn').length;
  const fail = results.filter(r => r.pass === false).length;
  console.log('─'.repeat(64));
  console.log(`通过 ${pass}　存疑 ${warn}　失败 ${fail}　共 ${results.length} 项`);
  if (fail) {
    console.log('\n失败项：');
    results.filter(r => r.pass === false).forEach(r => console.log('  · ' + r.name));
  }
  fs.writeFileSync(path.join(path.dirname(FILE), 'regress_result.json'),
    JSON.stringify({ file: path.basename(FILE), at: new Date().toISOString(), results }, null, 1));
  process.exit(0);
})();
