#!/usr/bin/env node
/** 状态效果普查：用与调难度一致的「标准玩家阵容」跑多关多场，
 *  统计真正出现的 status key、事件类型、日志类别、回合分布。*/
const { chromium } = require('playwright');
const fs = require('fs');
const HTML = process.argv[2];

const PROBE = function (opt) {
  const chOf = sid => (DB.stage(sid) || {}).ch || 1;
  function tierOf(ch) {
    return { star: ch<=2?1: ch<=6?2: ch<=12?3: ch<=20?4:5,
             size: Math.min(9, 2 + Math.floor((ch-1)*1.1)),
             gearQ: ch<=2?0: Math.min(6, Math.ceil(ch/5)) };
  }
  const obtainable = (() => {
    const byCh = {};
    for (const sid of DB.stageIds()) {
      const st = DB.stage(sid), ch = st.ch || 1;
      (byCh[ch] ||= new Set());
      const fr = st.first_reward || {};
      if (fr.hero && DB.hero(fr.hero)) byCh[ch].add(fr.hero);
      for (const d of (st.drops || [])) if (d.t==='hero' && DB.hero(d.id)) byCh[ch].add(d.id);
    }
    const cum = {}, acc = new Set(CFG.startHeroes);
    for (const ch of DB.chapters) {
      for (const h of (byCh[ch]||[])) acc.add(h);
      cum[ch] = [...acc].filter(h => DB.hero(h) && DB.hero(h).src !== '杂兵');
    }
    return cum;
  })();
  function gearFor(ch) {
    const q = tierOf(ch).gearQ, out = {};
    for (const slot of SLOTS) {
      const cand = DB.equipIds().map(DB.equip).filter(e => e && e.slot===slot && e.q<=q && !e.exclusive).sort((a,b)=>b.q-a.q);
      if (cand.length) out[slot] = cand[0].id;
    }
    return out;
  }
  function buildTeam(sid) {
    const st = DB.stage(sid), ch = st.ch || 1;
    const { star, size, gearQ } = tierOf(ch);
    const lv = Math.max(1, (st.rec_lv||[1,5])[0]);
    if (ch === 1) { initGame();
      for (const hid of G.team) { G.heroes[hid].lv = lv; G.heroes[hid].base = Object.assign({}, grownBase(hid, lv)); }
      return; }
    const pool = (obtainable[ch]||CFG.startHeroes).slice().sort((a,b)=>DB.hero(b).q-DB.hero(a).q);
    const team = pool.slice(0, size);
    const gear = gearQ>0 ? gearFor(ch) : {};
    G.heroes = {}; G.team = [];
    for (const hid of team) {
      const t = DB.hero(hid), h = makeHero(hid);
      h.lv = lv; h.star = star;
      h.base = Object.assign({}, grownBase(hid, lv));
      h.owned = (t.sk||[]).slice(0, Math.min(star,4));
      h.equipment = Object.assign({weapon:null,armor:null,helmet:null,mount:null,special:null}, gear);
      G.heroes[hid] = h; G.team.push(hid);
    }
  }

  const status = {}, events = {}, logs = {}, skTypes = {};
  const rounds = [], sample = [];
  const stages = DB.stageIds();
  const pick = stages.filter((s,i) => i % 4 === 0);   // 抽样 1/4 关卡
  for (const sid of pick) {
    buildTeam(sid);
    for (let n = 0; n < 6; n++) {
      const b = Battle.create(sid);
      if (!b || !b.allies.length || !b.foes.length) break;
      let g = 0;
      while (!b.over && g++ < 200) {
        Battle.runRound(b);
        for (const u of [...b.allies, ...b.foes])
          for (const k of Object.keys(u.status||{}))
            if (u.status[k]) status[k] = (status[k]||0) + 1;
      }
      rounds.push(b.round);
      for (const e of (b.events||[])) events[e.k] = (events[e.k]||0)+1;
      for (const l of (b.log||[])) logs[l.c] = (logs[l.c]||0)+1;
    }
  }
  rounds.sort((a,b)=>a-b);
  return { stagesTried: pick.length, battles: rounds.length,
           roundMed: rounds[Math.floor(rounds.length/2)],
           roundP90: rounds[Math.floor(rounds.length*0.9)],
           roundMax: rounds[rounds.length-1],
           status, events, logs, skTypes };
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.error('PAGEERROR', e.message));
  await p.goto('file://' + require('path').resolve(HTML));
  await p.waitForTimeout(600);
  const r = await p.evaluate(`(${PROBE.toString()})({})`);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
