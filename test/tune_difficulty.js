#!/usr/bin/env node
/**
 * 水浒群星录 · 阶段 3 难度调校
 *
 *   node tune_difficulty.js <已构建的html> <gameData_v10.json>
 *
 * 做法：不估算，直接在引擎里跑模拟。
 *   1. 为每关构造「标准玩家阵容」——该关推荐等级、按章递进的星级与队伍规模、
 *      按章可获得的角色、按章档次的装备。
 *   2. 对每关二分搜索 enemy_lv，使模拟胜率落进目标区间。
 *   3. 把 enemy_lv / enemy_star 写回 gameData。
 *
 * 目标区间（对应「稳步推图，Boss 卡一下」）：
 *   普通关 88–96%　支线 72–86%　Boss 50–68%　隐藏 25–45%
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const HTML = process.argv[2];
const DATA = process.argv[3];
// 玩家模型不再靠猜。playthrough.js --profile 会实打实跑一遍，
// 记下每一章真实拥有谁、什么等级星级、每格装备什么品质。
const PROF = fs.existsSync('player_profile.json')
  ? JSON.parse(fs.readFileSync('player_profile.json', 'utf8')) : null;
if (!HTML || !fs.existsSync(HTML) || !DATA || !fs.existsSync(DATA)) {
  console.error('用法: node tune_difficulty.js <html> <gameData_v10.json>');
  process.exit(2);
}

const TUNER = function (opt) {
  const { SIM, PROF } = opt;
  const MUL_CAP = 6;      // 强度系数封顶：再往上就是数值荒唐且脆如薄纸
  const LV_CAP = 60;      // 敌方等级封顶：满级 50 之上再多十级已是极限
  const byCh = {};
  if (PROF) for (const r of PROF) byCh[r.ch] = r;
  const profOf = ch => {
    if (!PROF) return null;
    for (let c = ch; c >= 1; c--) if (byCh[c]) return byCh[c];
    return PROF[0];
  };

  /* ── 标准玩家模型 ──────────────────────────────────────────── */
  const chOf = sid => (DB.stage(sid) || {}).ch || 1;

  // 玩家模型必须贴住真实进度：开局就是两个人、1 级、没有装备。
  function tierOf(ch) {
    return {
      star: ch <= 2 ? 1 : ch <= 6 ? 2 : ch <= 12 ? 3 : ch <= 20 ? 4 : 5,
      size: Math.min(9, 2 + Math.floor((ch - 1) * 1.1)),
      gearQ: ch <= 2 ? 0 : Math.min(6, Math.ceil(ch / 5)),
    };
  }

  // 按章可获得的角色：该章及之前所有关卡的首通奖励与掉落，加起手两人
  const obtainable = (() => {
    const byCh = {};
    for (const sid of DB.stageIds()) {
      const st = DB.stage(sid), ch = st.ch || 1;
      (byCh[ch] ||= new Set());
      const fr = st.first_reward || {};
      if (fr.hero && DB.hero(fr.hero)) byCh[ch].add(fr.hero);
      for (const d of (st.drops || []))
        if (d.t === 'hero' && DB.hero(d.id)) byCh[ch].add(d.id);
    }
    const cum = {}, acc = new Set(CFG.startHeroes);
    for (const ch of DB.chapters) {
      for (const h of (byCh[ch] || [])) acc.add(h);
      cum[ch] = [...acc].filter(h => DB.hero(h) && DB.hero(h).src !== '杂兵');
    }
    return cum;
  })();

  // 按章可用的装备：品质不超过该章档次，每槽取最好的一件
  /** 按实测的「每格最好品质」配装；没有档案就一律用上限品质 */
  function gearForQ(qmax, P) {
    const out = {};
    SLOTS.forEach((slot, i) => {
      const q = P && P.gearQ ? (P.gearQ[i] || 0) : qmax;
      if (!q) return;
      const cand = DB.equipIds().map(DB.equip)
        .filter(e => e && e.slot === slot && e.q <= q && !e.exclusive)
        .sort((a, b) => b.q - a.q);
      if (cand.length) out[slot] = cand[0].id;
    });
    return out;
  }

  function buildTeam(sid) {
    const st = DB.stage(sid), ch = st.ch || 1;
    const P = profOf(ch);
    // 有实测档案就照实测建阵，没有才退回估算模型
    const star = P ? Math.max(1, Math.round(P.star)) : tierOf(ch).star;
    const size  = P ? P.size  : tierOf(ch).size;
    const gearQ = P ? Math.max(...P.gearQ) : tierOf(ch).gearQ;
    // 用推荐等级下限：玩家刚打到这关，不是练满了才来
    const lv = Math.max(1, (st.rec_lv || [1, 5])[0]);

    if (ch === 1) {                      // 第一章直接用真实开局状态
      initGame();
      for (const hid of G.team) {
        G.heroes[hid].lv = lv;
        G.heroes[hid].base = Object.assign({}, grownBase(hid, lv));
      }
      return { lv, star: 1, size: G.team.length, gearQ: 0, team: G.team.slice() };
    }
    // 有原样留档就照搬那支队伍：等级星级装备逐人还原，一点不估。
    //
    // 但伤势系统让玩家强度在同一关上下浮动很大 —— 照着某一次快照调，
    // 下一局换一批人在养伤就对不上了。所以这里按「主力有两个重伤在养、
    // 还有一个带轻伤上阵」来建阵：满状态时略轻松，正轮换时刚好。
    if (P && P.snap && P.snap.length) {
      const snap = P.snap.slice();
      if (snap.length >= 6) {
        snap.sort((a, b) => (b.lv * 100 + b.star) - (a.lv * 100 + a.star));
        snap.splice(0, 2);                       // 两个主力在养伤
        if (snap[0]) snap[0] = Object.assign({}, snap[0], { hurtLight: true });
      }
      G.heroes = {}; G.team = [];
      for (const u of snap) {
        if (!DB.hero(u.hid)) continue;
        const h = makeHero(u.hid);
        h.lv = u.lv; h.star = u.star;
        h.base = Object.assign({}, grownBase(u.hid, u.lv));
        h.owned = (u.owned || []).slice();
        h.equipment = Object.assign({ weapon: null, armor: null, helmet: null, mount: null, special: null }, u.eq || {});
        if (u.hurtLight && h.hurt) h.hurt = { lv: 1, rest: 1 };
        G.heroes[u.hid] = h; G.team.push(u.hid);
      }
      if (G.team.length) {
        const al = G.team.reduce((a, h) => a + G.heroes[h].lv, 0) / G.team.length;
        return { lv: Math.round(al), star: +(G.team.reduce((a, h) => a + G.heroes[h].star, 0) / G.team.length).toFixed(1),
                 size: G.team.length, gearQ, team: G.team.slice() };
      }
    }
    const src = P && P.own && P.own.length ? P.own : (obtainable[ch] || CFG.startHeroes);
    const pool = src.slice().filter(h => DB.hero(h)).sort((a, b) => DB.hero(b).q - DB.hero(a).q);
    const team = pool.slice(0, size);
    const gear = gearQ > 0 ? gearForQ(gearQ, P) : {};
    // 直接构造状态，不污染真实存档
    G.heroes = {}; G.team = [];
    for (const hid of team) {
      const t = DB.hero(hid);
      const h = makeHero(hid);
      h.lv = lv; h.star = star;
      h.base = Object.assign({}, grownBase(hid, lv));   // 与敌人共用同一成长实现
      h.owned = (t.sk || []).slice(0, Math.min(star, 4));
      h.equipment = Object.assign({ weapon: null, armor: null, helmet: null, mount: null, special: null }, gear);
      G.heroes[hid] = h; G.team.push(hid);
    }
    return { lv, star, size, gearQ, team };
  }

  /* ── 模拟 ─────────────────────────────────────────────────── */
  function winRate(sid, elv, estar, emul, n) {
    const st = DB.stage(sid);
    const oL = st.enemy_lv, oS = st.enemy_star, oM = st.enemy_mul;
    st.enemy_lv = elv; st.enemy_star = estar; st.enemy_mul = emul;
    let w = 0, rounds = 0;
    for (let i = 0; i < n; i++) {
      const b = Battle.create(sid);
      if (!b || !b.allies.length || !b.foes.length) {
        st.enemy_lv = oL; st.enemy_star = oS; st.enemy_mul = oM; return -1; }
      let g = 0; while (!b.over && g++ < 200) Battle.runRound(b);
      if (b.win) w++;
      rounds += b.round;
    }
    st.enemy_lv = oL; st.enemy_star = oS; st.enemy_mul = oM;
    return { rate: w / n, rounds: rounds / n };
  }

  /* ── 分类与目标 ───────────────────────────────────────────── */
  function kindOf(sid) {
    const st = DB.stage(sid);
    if (st.hidden) return 'hidden';
    if (st.is_boss) return 'boss';
    if (/_f\d+$/.test(sid)) return 'side';
    return 'normal';
  }
  const TARGET = {
    normal: [0.88, 0.96], side: [0.72, 0.86], boss: [0.50, 0.68], hidden: [0.25, 0.45],
  };
  // 头两章是新手期：普通关要稳赢，第一个 Boss 也不该卡人
  const TARGET_EARLY = {
    normal: [0.94, 0.99], side: [0.85, 0.95], boss: [0.70, 0.85], hidden: [0.25, 0.45],
  };

  /* ── 主流程：逐关二分 ─────────────────────────────────────── */
  const out = [];
  for (const sid of DB.stageIds()) {
    const st = DB.stage(sid);
    const ch = st.ch || 1;
    const info = buildTeam(sid);
    const kind = kindOf(sid);
    const [lo, hi] = (ch <= 2 ? TARGET_EARLY : TARGET)[kind];
    const mid = (lo + hi) / 2;
    // 等级与星级保持叙事诚实：敌方等级 = 推荐等级上限，星级按章递进
    let elv = Math.max(1, (st.rec_lv || [1, 5])[1]);
    const estar = ch <= 3 ? 2 : ch <= 10 ? 3 : ch <= 20 ? 4 : 5;

    // ① 几何阶梯粗扫，找到胜率穿过目标的那一段
    const LADDER = [0.3, 0.45, 0.65, 0.9, 1.25, 1.7, 2.3, 3.2, 4.4, 6.0, 8.0];
    let scan = LADDER.map(m => ({ m, r: winRate(sid, elv, estar, m, SIM) }));
    // 系数超过 5 说明这关的底子（人数、品质）撑不住目标，再往上堆就是薄纸一张：
    // 数值稍有变动胜率就从 0.5 掉到 0。这种关改抬等级，等级是能说出口的强度。
    //
    // 但这两条都要封顶。第 25 章是「洪太尉误走妖魔」这类开篇桥段，
    // 敌人是洪信、郑屠、潘金莲 —— 本来就不是打仗的人。
    // 不封顶的话调参器会把潘金莲堆到 80 级 21.5 倍才够卡人，
    // 数字荒唐不说，玩家在这一章被掏空，下一章就抬不起头。
    // 撑不到目标的关就让它偏易 —— 中间来一段轻松的过场没什么不好。
    let lvBump = 0;
    while (lvBump < 2 && elv < LV_CAP && scan[scan.length - 1].r !== -1
           && scan[scan.length - 1].r.rate > mid) {
      elv = Math.min(LV_CAP, Math.round(elv * 1.2) + 2); lvBump++;
      scan = LADDER.map(m => ({ m, r: winRate(sid, elv, estar, m, SIM) }));
    }
    if (scan.some(x => x.r === -1)) {
      out.push({ sid, name: st.name, ch, kind, n: (st.enemies || []).length,
        recLv: info.lv, star: info.star, size: info.size, gearQ: info.gearQ,
        enemyLv: elv, enemyStar: estar, enemyMul: 1, rate: -1, rounds: 0,
        target: [lo, hi], note: '无法建阵' });
      continue;
    }
    // 胜率随 mul 单调下降；找最后一个 rate>mid 与第一个 rate<=mid
    let lowI = -1, highI = -1;
    for (let i = 0; i < scan.length; i++) {
      if (scan[i].r.rate > mid) lowI = i;
      else { highI = i; break; }
    }
    // ② 括号内二分。
    //    胜率对系数是一条很陡的曲线（ch1_boss：×0.4 → 97%，×0.5 → 17%），
    //    小样本下「谁大谁小」全是噪声，所以这里不按「离目标最近」挑点，
    //    而是始终维持一个 [偏易, 偏难] 的括号，每次取中点收缩。
    let a, b, note = '';
    if (lowI === -1) { a = LADDER[0] * 0.25; b = LADDER[0]; note = '最弱档仍偏难'; }
    else if (highI === -1) { a = MUL_CAP * 0.8; b = MUL_CAP; note = '底子撑不住，留作过场'; }
    else { a = LADDER[lowI]; b = LADDER[highI]; }

    const N2 = SIM * 3;
    let best = null, bestGap = Infinity, hit = null;
    for (let it = 0; it < 9 && b - a > Math.max(0.02, a * 0.02); it++) {
      const m = Math.round(((a + b) / 2) * 100) / 100;
      const r = winRate(sid, elv, estar, m, N2);
      if (r === -1) break;
      const gap = r.rate > hi ? r.rate - hi : r.rate < lo ? lo - r.rate : 0;
      if (gap < bestGap) { bestGap = gap; best = { mul: m, ...r }; }
      if (gap === 0) { hit = { mul: m, ...r }; break; }
      if (r.rate > hi) a = m; else b = m;
    }
    if (!best) best = { mul: (a + b) / 2, rate: -1, rounds: 0 };

    // ③ 大样本定稿。若复核后掉出区间，就在同一个括号里再收两次。
    let mul = Math.min(MUL_CAP, Math.round((hit || best).mul * 100) / 100);
    let fin = winRate(sid, elv, estar, mul, SIM * 6);
    for (let round = 0; round < 2; round++) {
      if (fin.rate >= lo && fin.rate <= hi) break;
      if (fin.rate > hi) a = mul; else b = mul;
      const m = Math.min(MUL_CAP, Math.round(((a + b) / 2) * 100) / 100);
      if (m === mul) break;
      const r = winRate(sid, elv, estar, m, SIM * 6);
      const g0 = fin.rate > hi ? fin.rate - hi : lo - fin.rate;
      const g1 = r.rate > hi ? r.rate - hi : r.rate < lo ? lo - r.rate : 0;
      if (g1 < g0) { mul = m; fin = r; } else break;
    }
    out.push({
      sid, name: st.name, ch, kind, n: (st.enemies || []).length,
      recLv: info.lv, star: info.star, size: info.size, gearQ: info.gearQ,
      enemyLv: elv, enemyStar: estar, enemyMul: mul,
      note: note + (lvBump ? `（抬级 ${lvBump} 次 → ${elv}）` : ''),
      rate: fin.rate, rounds: fin.rounds,
      target: [lo, hi],
    });
  }
  return out;
};

(async () => {
  console.log('\n水浒群星录 · 阶段 3 难度调校');
  console.log('─'.repeat(70));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('页面错误:', String(e.message).slice(0, 160)));
  await page.goto('file://' + path.resolve(HTML));
  await page.waitForTimeout(2600);

  const t0 = Date.now();
  const rows = await page.evaluate(TUNER, { SIM: 32, PROF });
  if (!PROF) console.log('！没找到 player_profile.json，退回估算的玩家模型');
  await browser.close();
  console.log(`模拟完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s，共 ${rows.length} 关\n`);

  // 汇总
  const byKind = {};
  for (const r of rows) (byKind[r.kind] ||= []).push(r);
  const KN = { normal: '普通关', side: '支线关', boss: 'Boss 关', hidden: '隐藏关' };
  console.log('类型      关数   胜率区间        目标区间     达标');
  for (const [k, list] of Object.entries(byKind)) {
    const ok = list.filter(r => r.rate >= r.target[0] - 0.06 && r.rate <= r.target[1] + 0.06);
    const rs = list.map(r => r.rate).sort((a, b) => a - b);
    console.log(`${KN[k].padEnd(9)}${String(list.length).padStart(4)}   ` +
      `${(rs[0] * 100).toFixed(0)}%–${(rs[rs.length - 1] * 100).toFixed(0)}%`.padEnd(16) +
      `${(list[0].target[0] * 100).toFixed(0)}%–${(list[0].target[1] * 100).toFixed(0)}%`.padEnd(13) +
      `${ok.length}/${list.length}`);
  }

  const bad = rows.filter(r => r.rate < 0 || r.rate < r.target[0] - 0.06 || r.rate > r.target[1] + 0.06);
  if (bad.length) {
    console.log(`\n未落进目标区间的 ${bad.length} 关：`);
    bad.slice(0, 20).forEach(r => console.log(
      `  ${r.sid.padEnd(13)}${r.name.padEnd(16)}${r.kind.padEnd(7)}` +
      `敌 ${String(r.enemyLv).padStart(2)}级${r.enemyStar}星×${r.n}人 ×${r.enemyMul}　` +
      `胜率 ${(r.rate * 100).toFixed(0)}%（目标 ${(r.target[0] * 100).toFixed(0)}–${(r.target[1] * 100).toFixed(0)}%）` +
      (r.note ? `　${r.note}` : '')));
  }

  console.log('\n零胜率 / 全胜关：');
  const z = rows.filter(r => r.rate <= 0.02 || r.rate >= 0.995);
  console.log(z.length ? z.map(r => `  ${r.sid} ${r.name} ${(r.rate * 100).toFixed(0)}%`).join('\n') : '  无');

  // 写回数据
  const D = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  for (const r of rows) {
    if (!D.stages[r.sid]) continue;
    D.stages[r.sid].enemy_lv = r.enemyLv;
    D.stages[r.sid].enemy_star = r.enemyStar;
    D.stages[r.sid].enemy_mul = r.enemyMul;
  }
  fs.writeFileSync(DATA, JSON.stringify(D), 'utf8');
  fs.writeFileSync(path.join(path.dirname(DATA), 'difficulty_table.json'), JSON.stringify(rows, null, 1));
  console.log(`\n已写回 enemy_lv / enemy_star / enemy_mul 至 ${path.basename(DATA)}`);
  console.log(`详表：difficulty_table.json`);
})();
