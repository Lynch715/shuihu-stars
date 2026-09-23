#!/usr/bin/env node
/**
 * 水浒群星录 · 多周目连打
 *   node laps.js <html> [周目数]
 *
 * 一周目打完接着开二周目、三周目，不重置存档 —— 二周目的玩家是带着
 * 满级队回第一章的，这正是「敌级整段平移」要挡住的事。
 * 只看一件事：每个周目能不能走完 139 关，以及要打多少场。
 */
const { chromium } = require('playwright');
const HTML = process.argv[2], LAPS = +(process.argv[3] || 3);
// 调参用：--foemul=1.18,1.30 临时覆盖二周目 / 三周目起的敌方微调系数
const MULARG = (process.argv.find(a => a.startsWith('--foemul=')) || '').split('=')[1];
const MUL = MULARG ? MULARG.split(',').map(Number) : null;
// 调参用：--mulcap=3 临时覆盖二周目起的关卡强度系数削顶
const CAPARG = (process.argv.find(a => a.startsWith('--mulcap=')) || '').split('=')[1];
const CAP = CAPARG ? +CAPARG : null;
// 调参用：--bench=0.35 临时覆盖二梯队经验比例
const BENARG = (process.argv.find(a => a.startsWith('--bench=')) || '').split('=')[1];
const BEN = BENARG ? +BENARG : null;

const SIM = function (LAPS, MUL, CAP, BEN) {
  if (MUL) { CFG.lapFoeBy[2] = MUL[0]; CFG.lapFoeMax = MUL[1]; }
  if (CAP) CFG.lapMulCap = CAP;
  if (BEN != null) CFG.benchExp = BEN;
  initGame();
  const order = [];
  for (const ch of DB.chapters) for (const sid of DB.byChapter[ch]) order.push(sid);

  const teamUp = () => {
    const owned = Object.keys(G.heroes).filter(h => Hurt.able(h));
    owned.sort((a, b) => Stats.heroPower(b) - Stats.heroPower(a));
    G.team = owned.slice(0, CFG.teamSize);
  };
  const cureUp = reserve => {
    for (const hid of Object.keys(G.heroes)) {
      if (!Hurt.of(hid).lv) continue;
      if (G.res.silver - Hurt.cureCost(hid) < reserve) continue;
      Hurt.cure(hid);
    }
  };
  const gearUp = () => {
    for (const hid of G.team) for (const slot of SLOTS) {
      const bag = Grow.bagEquips(slot);
      if (!bag.length) continue;
      const cur = G.heroes[hid].equipment[slot];
      if (cur && DB.equip(cur).q >= bag[0].q) continue;
      Grow.equip(hid, slot, bag[0].id);
    }
  };
  const starUp = () => { for (const hid of G.team) while (!Grow.starUp(hid)) {} };
  const levelTo = (cap, reserve) => {
    cap = Math.min(cap, Lap.maxLv());
    let moved = true;
    while (moved) {
      moved = false;
      for (const hid of G.team) {
        const h = G.heroes[hid];
        if (h.lv >= cap) continue;
        if (G.res.silver - Grow.drillCost(hid) < reserve) continue;
        if (!Grow.levelUp(hid)) moved = true;
      }
    }
  };

  const out = [];
  for (let lap = 1; lap <= LAPS; lap++) {
    let battles = 0, guard = 0, dry = 0, stuck = null;
    const tries = {};
    while (guard++ < 400) {
      const todo = order.filter(sid => !G.cleared[sid] && Stages.unlocked(sid));
      if (!todo.length) break;
      let got = 0;
      for (const sid of todo) {
        const stg = DB.stage(sid);
        const want = Lap.recLv(stg.rec_lv || [1, 5])[1] + 3 * (tries[sid] || 0);
        teamUp(); gearUp(); starUp();
        // V10.1 起武将只能靠抽：人手不到 20 先抽人；手上有钱就十连（同 playthrough.js --nomed）
        while (Object.keys(G.heroes).length < 20 && G.res.silver >= CFG.recruitCost1)
          Grow.recruit(G.res.silver >= CFG.recruitCost10 ? 10 : 1);
        teamUp(); gearUp(); starUp();
        if (Object.keys(G.heroes).filter(h => Hurt.able(h)).length < CFG.teamSize + 3) cureUp(0);
        levelTo(want, CFG.recruitCost1);
        const reserve = CFG.recruitCost1;
        while (G.res.silver - reserve >= CFG.recruitCost10) Grow.recruit(10);
        if ((tries[sid] || 0) >= 1) cureUp(0);
        teamUp(); gearUp(); starUp(); levelTo(want, 0);

        const bt = Battle.create(sid);
        if (!bt || !bt.allies.length || !bt.foes.length) { G.cleared[sid] = true; continue; }
        Battle.runAll(bt); battles++;
        if (!bt.win) { tries[sid] = (tries[sid] || 0) + 1; Stages.settle(bt); continue; }
        Stages.settle(bt); got++;
      }
      // 一轮没推进，就回头刷已通的高级关攒经验银两 —— 真人卡关也是这么做的
      if (!got) {
        const done = order.filter(s => G.cleared[s])
          .sort((a, b) => (DB.stage(b).rec_lv || [1, 5])[1] - (DB.stage(a).rec_lv || [1, 5])[1]).slice(0, 3);
        for (let k = 0; k < 6; k++) for (const sid of done) {
          const bt = Battle.create(sid);
          if (!bt || !bt.foes.length) continue;
          Battle.runAll(bt); battles++; Stages.settle(bt);
        }
      }
      dry = got ? 0 : dry + 1;
      if (dry >= 12) {
        const sid = order.find(s => !G.cleared[s] && Stages.unlocked(s));
        const stg = sid && DB.stage(sid);
        stuck = sid ? `${sid} ${stg.name}（第${stg.ch}章，推荐 ${Lap.recLv(stg.rec_lv)[1]} 级，` +
                      `实际 ${Math.round(G.team.reduce((a, h) => a + G.heroes[h].lv, 0) / G.team.length)} 级，` +
                      `余银 ${Math.round(G.res.silver)}，练级上限 ${Grow.drillCap()}，` +
                      `升一级要 ${Math.round(Grow.drillCost(G.team[0]))}，` +
                      `伤员 ${Object.keys(G.heroes).filter(h => Hurt.of(h).lv).length}）` : '未知';
        break;
      }
    }
    const cleared = order.filter(s => G.cleared[s]).length;
    out.push({ lap, cleared, total: order.length, battles, stuck,
               band: Lap.band(), maxLv: Lap.maxLv(),
               lv: +(G.team.reduce((a, h) => a + G.heroes[h].lv, 0) / G.team.length).toFixed(1),
               own: Object.keys(G.heroes).length });
    if (stuck) break;
    const msg = Lap.next();
    if (msg) { out[out.length - 1].stuck = '开不了下一周目：' + msg; break; }
  }
  return out;
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('  页面异常 ' + e.message));
  await p.goto('file://' + require('path').resolve(HTML));
  await p.waitForTimeout(1500);
  const res = await p.evaluate(`(${SIM.toString()})(${LAPS}, ${JSON.stringify(MUL)}, ${JSON.stringify(CAP)}, ${JSON.stringify(BEN)})`);
  console.log('周目　通关　　战斗　敌级区间　等级上限　队伍均级　拥有');
  for (const r of res)
    console.log(`  ${r.lap}　${String(r.cleared + '/' + r.total).padStart(7)}　${String(r.battles).padStart(4)} 场　`
      + `${(r.band ? r.band.join('–') : '3–50').padStart(6)}　${String(r.maxLv).padStart(6)}　`
      + `${String(r.lv).padStart(6)}　${String(r.own).padStart(4)}` + (r.stuck ? `　✗ ${r.stuck}` : '　✓'));
  await b.close();
  process.exit(res.some(r => r.stuck) ? 1 : 0);
})();
