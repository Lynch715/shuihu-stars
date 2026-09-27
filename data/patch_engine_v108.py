#!/usr/bin/env python3
"""V10.8 功名（成就）：engine 侧。可重跑。"""
import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, 'src', 'engine.js')
s = open(p, encoding='utf-8').read()
if 'const Achv = {' in s: print('已经改过'); sys.exit(0)
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:70]); s = s.replace(a, b)

# ── 存档 ──
rep("""        mode: G.mode, startGift: G.startGift, giftShown: G.giftShown,
      }));""",
"""        mode: G.mode, startGift: G.startGift, giftShown: G.giftShown,
        stats: G.stats, achv: G.achv, title: G.title, achvNew: G.achvNew,   // V10.8 功名
      }));""")
rep("""  lap: 1, fates: [], everCleared: {},
  /* V10.3 模式""",
"""  lap: 1, fates: [], everCleared: {},
  /* V10.8 功名：计数器、已达成 { id: 周目 }、戴着的称号、新达成未看的 */
  stats: {}, achv: {}, title: null, achvNew: [],
  /* V10.3 模式""")
rep("""  G.lap = 1; G.fates = []; G.everCleared = {};
  G.startGift = rollStartGift(); G.giftShown = false;""",
"""  G.lap = 1; G.fates = []; G.everCleared = {};
  G.stats = {}; G.achv = {}; G.title = null; G.achvNew = [];
  G.startGift = rollStartGift(); G.giftShown = false;""")

# ── 战斗里的细项计数：挂在 b.ach 上 ──
rep("""      shield: 0, shieldDur: 0, status: {}, chaosHit: 0, alive: true, tough: pas.tough, toughFrom: pas.toughFrom, lowDone: {},""",
"""      shield: 0, shieldDur: 0, status: {}, chaosHit: 0, alive: true, tough: pas.tough, toughFrom: pas.toughFrom, lowDone: {},
      kills: 0, ff: 0, killsRound: {},   // V10.8 功名计数：击杀、误伤友方、每回合击杀""")
rep("""    if (tgt.hp <= 0 && tgt.alive) {
      tgt.alive = false;
      b.log.push({ c: 'dm', s: `${tgt.ln} 阵亡` });""",
"""    if (tgt.hp <= 0 && tgt.alive) {
      tgt.alive = false;
      // V10.8 功名计数
      b.ach = b.ach || { dotKills: 0, dispels: 0, steals: 0, counters: 0 };
      if (kind === 'bleed' || kind === 'poison') b.ach.dotKills++;
      if (src && src.alive !== undefined) { src.kills++; src.killsRound[b.round] = (src.killsRound[b.round] || 0) + 1; }
      b.log.push({ c: 'dm', s: `${tgt.ln} 阵亡` });""")
rep("""    this.hurt(b, t, d.v, u, d.crit ? 'crit' : '', 'chaos');
  },""",
"""    this.hurt(b, t, d.v, u, d.crit ? 'crit' : '', 'chaos');
    u.ff++;   // V10.8 功名：误伤友方次数
  },""")
rep("""        this.hurt(b, src, d.v, tgt, d.crit ? 'crit' : '', 'counter', c.from);""",
"""        (b.ach = b.ach || { dotKills: 0, dispels: 0, steals: 0, counters: 0 }).counters++;   // V10.8
        this.hurt(b, src, d.v, tgt, d.crit ? 'crit' : '', 'counter', c.from);""")
rep("""          if (good.length || hadShield) {
            b.log.push({ c: 'in', s: `${t.ln} 增益状态被驱散：${what.join('、')}` });""",
"""          if (good.length || hadShield) {
            (b.ach = b.ach || { dotKills: 0, dispels: 0, steals: 0, counters: 0 }).dispels++;   // V10.8
            b.log.push({ c: 'in', s: `${t.ln} 增益状态被驱散：${what.join('、')}` });""")
rep("""          if (got > 0) this.putMod(u, 'buff', f.stat, src, got, dur);""",
"""          if (got > 0) this.putMod(u, 'buff', f.stat, src, got, dur);
          (b.ach = b.ach || { dotKills: 0, dispels: 0, steals: 0, counters: 0 }).steals++;   // V10.8""")

# ── 养成计数 ──
rep("""  recruit(times) {
    const cost = times === 1 ? CFG.recruitCost1 : CFG.recruitCost10;""",
"""  recruit(times) {
    const cost = times === 1 ? CFG.recruitCost1 : CFG.recruitCost10;
    if (G.res.silver >= cost) { Achv.add('pulls', times); if (times === 10) Achv.add('pulls10', 1); Achv.add('silverSpent', cost); }""")
rep("""  forge(times) {
    const cost = times === 1 ? CFG.forgeCost1 : CFG.forgeCost10;
    if (G.res.silver < cost) return { err: `需 ${cost} 银两` };
    G.res.silver -= cost;""",
"""  forge(times) {
    const cost = times === 1 ? CFG.forgeCost1 : CFG.forgeCost10;
    if (G.res.silver < cost) return { err: `需 ${cost} 银两` };
    G.res.silver -= cost;
    Achv.add('forgePulls', times); if (times === 10) Achv.add('forge10', 1); Achv.add('silverSpent', cost);""")
rep("""      out.push({ eid, q: e.exclusive ? 7 : e.q, had });
    }
    Save.write();""",
"""      out.push({ eid, q: e.exclusive ? 7 : e.q, had });
      if (e.exclusive) Achv.add('forgeExc', 1);
    }
    Save.write();""")

open(p, 'w', encoding='utf-8').write(s)
print('engine V10.8 存档/计数钩子写入；Achv 模块见 append')
