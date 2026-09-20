#!/usr/bin/env node
/**
 * 水浒群星录 · 阶段 5 通关模拟
 *   node playthrough.js <html> [局数]
 *
 * 用引擎自己的函数从头打到尾：按顺序推关、赢了就结算、银两先升级后抽卡、
 * 有好装备就换上。记录每一章的等级、队伍规模、银两收支与卡关位置。
 * 目的不是「能不能通」，是看养成节奏在哪一章断掉。
 */
const { chromium } = require('playwright');
const HTML = process.argv[2], RUNS = +(process.argv[3] || 1);
const PROFILE = process.argv.includes('--profile');   // 摸底跑：压低难度，只为采集养成曲线

const SIM = function (opt) {
  const { RUNS, PROFILE } = opt;
  const runs = [];
  // 摸底跑用真实难度，但死磕到底 —— 打不过就多练几级再来，
  // 要的是「一路打过去手里会攒下什么」，不是「第一次就能不能过」。
  // 压低难度摸出来的曲线是假的：清关快、重试少、银两富余，
  // 调参器照着它调，真实局到第十章就撞墙。
  for (let run = 0; run < RUNS; run++) {
    initGame();
    const order = [];
    for (const ch of DB.chapters) for (const sid of DB.byChapter[ch]) order.push(sid);

    const st = { battles: 0, earnSilver: 0, spendLv: 0, spendGacha: 0, pulls: 0,
                 tries: {}, marks: [], stuck: null };
    let guard = 0;

    const teamUp = () => {                      // 选还能上阵的、战力最高的九人
      const owned = Object.keys(G.heroes).filter(h => Hurt.able(h));
      owned.sort((a, b) => Stats.heroPower(b) - Stats.heroPower(a));
      G.team = owned.slice(0, CFG.teamSize);
    };
    // 主力重伤又打不过时，玩家会花钱请郎中。钱宽裕才治，先紧着练级。
    const cureUp = (reserve) => {
      for (const hid of Object.keys(G.heroes)) {
        if (!Hurt.of(hid).lv) continue;
        const c = Hurt.cureCost(hid);
        if (G.res.silver - c < reserve) continue;
        const b0 = G.res.silver;
        if (!Hurt.cure(hid)) st.spendCure = (st.spendCure || 0) + (b0 - G.res.silver);
      }
    };
    const gearUp = () => {                      // 每人每格穿包里最好的一件
      for (const hid of G.team) for (const slot of SLOTS) {
        const bag = Grow.bagEquips(slot);
        if (!bag.length) continue;
        const cur = G.heroes[hid].equipment[slot];
        if (cur && DB.equip(cur).q >= bag[0].q) continue;
        Grow.equip(hid, slot, bag[0].id);
      }
    };
    const starUp = () => { for (const hid of G.team) while (!Grow.starUp(hid)) {} };
    const levelTo = (cap, reserve) => {          // 把队伍练到 cap 级，留 reserve 银两
      let moved = true;
      while (moved) {
        moved = false;
        for (const hid of G.team) {
          const h = G.heroes[hid];
          if (h.lv >= cap || h.lv >= CFG.maxLv) continue;
          const c = Grow.drillCost(hid);
          if (G.res.silver - c < reserve) continue;
          const before = G.res.silver;
          if (!Grow.levelUp(hid)) { st.spendLv += before - G.res.silver; moved = true; }
        }
      }
    };

    // 一轮扫一遍所有已解锁未通的关；一轮下来一关都没通才算卡死。
    // 隐藏关推荐等级比同章高 6 级，玩家会先放着，模拟也要能放着。
    let pass = 0, dry = 0;
    while (guard++ < 400) {
      const todo = order.filter(sid => !G.cleared[sid] && Stages.unlocked(sid));
      if (!todo.length) break;
      let got = 0;
      for (const sid of todo) {
        const stg = DB.stage(sid);
        // 打不过就多练几级再来，玩家也是这么干的
        const want = (stg.rec_lv || [1, 5])[1] + 3 * (st.tries[sid] || 0);
        teamUp(); gearUp(); starUp();
        // 先治伤：主力躺着的时候，抽一百张卡也顶不上把林冲治好
        if (Object.keys(G.heroes).filter(h => Hurt.able(h)).length < CFG.teamSize + 3) cureUp(0);
        levelTo(want, CFG.recruitCost1);
        // 抽卡之前先把治伤的钱留出来。原来一有闲钱就十连，
        // 轮到伤员时账上永远是空的 —— 真人不会这么花钱。
        const medKit = G.team.reduce((a, h) => a + Math.max(0, Hurt.cureCost(h)), 0) || 0;
        const reserve = Math.max(CFG.recruitCost1, medKit * 2);
        while (!(st.tries[sid] || 0) && G.res.silver - reserve >= CFG.recruitCost10 * 1.2) {
          const bal = G.res.silver; Grow.recruit(10);
          st.spendGacha += bal - G.res.silver; st.pulls += 10;
        }
        // 打不过就先治伤再上：重伤的主力比什么都值钱
        if ((st.tries[sid] || 0) >= 1) cureUp(0);
        teamUp(); gearUp(); starUp(); levelTo(want, 0);

        const bt = Battle.create(sid);
        if (!bt || !bt.allies.length || !bt.foes.length) { G.cleared[sid] = true; continue; }
        Battle.runAll(bt); st.battles++;
        if (!bt.win) { st.tries[sid] = (st.tries[sid] || 0) + 1; Stages.settle(bt); continue; }
        const s0 = G.res.silver;
        Stages.settle(bt);
        st.earnSilver += G.res.silver - s0;
        got++;
        if (stg.ch && !st.marks.some(m => m.ch === stg.ch)) {
          st.marks.push({ ch: stg.ch, want,
            lv: +(G.team.reduce((a, h) => a + G.heroes[h].lv, 0) / G.team.length).toFixed(1),
            size: G.team.length, heroes: Object.keys(G.heroes).length,
            silver: Math.round(G.res.silver), battles: st.battles, pulls: st.pulls,
            eq: Object.keys(G.items).filter(k => k.startsWith('eq_')).reduce((a, k) => a + G.items[k], 0)
                + G.team.reduce((a, h) => a + SLOTS.filter(s2 => G.heroes[h].equipment[s2]).length, 0),
            own: Object.keys(G.heroes).filter(h => DB.hero(h) && DB.hero(h).src !== '杂兵'),
            // 阵容原样留档：谁、几级、几星、会哪几招、身上穿什么。
            // 只记平均值的话，调参器永远在跟一个不存在的队伍较劲。
            snap: G.team.map(h => ({ hid: h, lv: G.heroes[h].lv, star: G.heroes[h].star,
              owned: (G.heroes[h].owned || []).slice(),
              eq: Object.assign({}, G.heroes[h].equipment) })),
            gearQ: SLOTS.map(s2 => Math.max(0, ...G.team.map(h => {
              const e = G.heroes[h].equipment[s2]; return e ? DB.equip(e).q : 0; }))),
            frag: Object.values(G.frags || {}).reduce((a, v) => a + v, 0),
            hurt: Object.keys(G.heroes).filter(h => Hurt.of(h).lv).length,
            star: +(G.team.reduce((a, h) => a + G.heroes[h].star, 0) / G.team.length).toFixed(1) });
        }
      }
      // 一轮没推进，就回头刷已通的高级关攒经验银两 —— 真人卡关也是这么做的
      if (!got) {
        const done = order.filter(sid => G.cleared[sid]);
        const farm = done.sort((a, b) => ((DB.stage(b).rec_lv || [1, 5])[1] - (DB.stage(a).rec_lv || [1, 5])[1]))
                         .slice(0, 3);
        for (let k = 0; k < 6; k++) for (const sid of farm) {
          const bt = Battle.create(sid);
          if (!bt || !bt.foes.length) continue;
          Battle.runAll(bt); st.battles++; st.farm = (st.farm || 0) + 1;
          const s1 = G.res.silver; Stages.settle(bt); st.earnSilver += G.res.silver - s1;
        }
      }
      pass++;
      dry = got ? 0 : dry + 1;
      if (dry >= (PROFILE ? 60 : 12)) {
        const blk = order.filter(sid => !G.cleared[sid] && Stages.unlocked(sid))[0];
        const bs = DB.stage(blk);
        st.stuck = { sid: blk, name: bs.name, ch: bs.ch, want: (bs.rec_lv || [1, 5])[1],
          lv: +(G.team.reduce((a, h) => a + G.heroes[h].lv, 0) / G.team.length).toFixed(1),
          size: G.team.length, silver: Math.round(G.res.silver), pass };
        break;
      }
    }
    st.cleared = Object.keys(G.cleared).length;
    st.total = order.length;
    if (PROFILE) {
      // 每章结束时的实际状态：拥有谁、什么等级星级、每个槽位最好的装备品质
      st.profile = st.profile || [];
    }
    runs.push(st);
  }
  return runs;
};

(async () => {
  const br = await chromium.launch();
  const p = await br.newPage();
  p.on('pageerror', e => console.error('页面错误:', e.message));
  await p.goto('file://' + require('path').resolve(HTML));
  await p.waitForTimeout(700);
  const rs = await p.evaluate(`(${SIM.toString()})({RUNS:${RUNS},PROFILE:${PROFILE}})`);
  await br.close();

  rs.forEach((r, i) => {
    console.log(`\n第 ${i + 1} 局　通关 ${r.cleared}/${r.total}　战斗 ${r.battles} 场`);
    console.log(`  银两：关卡收入 ${r.earnSilver}　操练 ${r.spendLv}　抽卡 ${r.spendGacha}（${r.pulls} 抽）　治伤 ${r.spendCure || 0}`);
    console.log('  章　推荐级　实际级　星　队伍　拥有　装备　养伤　银两　抽数　累计战斗');
    for (const m of r.marks)
      console.log(`  ${String(m.ch).padStart(2)}　${String(m.want).padStart(6)}　${String(m.lv).padStart(6)}　${m.star}　${String(m.size).padStart(4)}　${String(m.heroes).padStart(4)}　${String(m.eq).padStart(4)}　${String(m.hurt ?? 0).padStart(4)}　${String(m.silver).padStart(6)}　${String(m.pulls).padStart(4)}　${String(m.battles).padStart(6)}`);
    if (r.stuck) console.log(`  ✗ 卡死在 ${r.stuck.sid} ${r.stuck.name}（第 ${r.stuck.ch} 章）` +
      `　推荐 ${r.stuck.want} 级，实际 ${r.stuck.lv} 级 / ${r.stuck.size} 人 / 余银 ${r.stuck.silver}`);
    else console.log('  ✓ 全程无卡关');
    if (i === 0 && (PROFILE || process.argv.includes('--write-profile'))) {
      // 真实难度跑到哪一章，那几章就用真实数据覆盖摸底数据；
      // 打不到的章节沿用摸底跑的曲线。两边一起喂给调参器，来回两三轮就收敛。
      const fs2 = require('fs');
      const old = fs2.existsSync('player_profile.json')
        ? JSON.parse(fs2.readFileSync('player_profile.json', 'utf8')) : [];
      const map = {};
      for (const o2 of old) map[o2.ch] = o2;
      for (const m of r.marks) map[m.ch] = { ch: m.ch, lv: Math.round(m.lv),
        star: +m.star.toFixed(2), size: m.size, gearQ: m.gearQ, own: m.own, snap: m.snap };
      const prof = Object.values(map).sort((a, b) => a.ch - b.ch);
      fs2.writeFileSync('player_profile.json', JSON.stringify(prof));
      console.log(`  → player_profile.json 更新（覆盖 ${r.marks.length} 章，共 ${prof.length} 章）`);
    }
  });
})();
