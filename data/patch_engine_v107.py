#!/usr/bin/env python3
"""V10.7 engine 改动 ①：增益按来源分格、异名相加、同名刷新、封顶；夺取所得封顶。可重跑（已改过就跳过）。"""
import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, 'src', 'engine.js')
s = open(p, encoding='utf-8').read()
if 'V10.7 增益按来源分格' in s:
    print('已经改过'); sys.exit(0)

def between(a, b):
    i = s.index(a); j = s.index(b, i); assert j > i, (a, b); return s[i:j]
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:60]); s = s.replace(a, b)

rep("  cap: { eqPct: 0.50, bondAtk: 0.25, bondHp: 0.25, bondOther: 0.20 },",
"""  /* V10.7 装备百分比单项上限 50% → 30%（每件只带一主一副，见规范 V10.7 ②）；
     战斗中增益、削弱各封顶面板值的 50%（异名相加，同名刷新，见 Battle.eff）；夺取所得另不超过自身面板 30% */
  cap: { eqPct: 0.30, bondAtk: 0.25, bondHp: 0.25, bondOther: 0.20, buff: 0.50, debuff: 0.50, steal: 0.30 },""")

old_eff = between("  /** 有效属性：底子 + 增益 − 减益。增减益分开记（buff_x / debuff_x），", "  /** 暴击率：底子 + 捷")
new_eff = """  /** V10.7 增益按来源分格：键 `buff_atk|豹头环眼`、`debuff_def|夺魂`。
   *  同名只刷新回合与数值（取高），异名相加，加总封顶面板值的 cap.buff / cap.debuff。
   *  残血激发（low_）并入增益一起封顶，但不被驱散、不到期。 */
  mods(u, kind, k) {
    const out = [], pre = kind + '_' + k + '|';
    for (const key of Object.keys(u.status)) if (key.startsWith(pre)) out.push({ key, src: key.slice(pre.length), val: u.status[key].val || 0, dur: u.status[key].dur });
    return out;
  },
  /** 某属性的增益或削弱：{ raw 各格之和, val 封顶后, cap 上限, list } */
  modSum(u, kind, k) {
    const list = this.mods(u, kind, k);
    let raw = list.reduce((a, m) => a + m.val, 0);
    if (kind === 'buff') { const lo = u.status['low_' + k]; if (lo) raw += lo.val; }
    const cap = Math.round((u[k] || 0) * (kind === 'buff' ? CFG.cap.buff : CFG.cap.debuff));
    return { raw, val: Math.min(raw, cap), cap, list };
  },
  /** 写一格增益/削弱：同名取高并刷新回合，异名另起一格。返回 { add 写入后的格值, old 原格值, key } */
  putMod(u, kind, k, src, val, dur) {
    const key = kind + '_' + k + '|' + (src || '其他');
    const cur = u.status[key];
    const old = cur ? cur.val : 0;
    u.status[key] = { dur: Math.max(dur, cur ? cur.dur : 0), val: Math.max(val, old) };
    return { key, add: Math.max(val, old), old };
  },
  /** 有效属性：底子 + 增益（封顶） − 削弱（封顶） */
  eff(u, k) {
    let v = u[k] || 0;
    if (Object.keys(u.status).length) {
      v += this.modSum(u, 'buff', k).val;
      v -= this.modSum(u, 'debuff', k).val;
    }
    return Math.max(1, Math.round(v));
  },

"""
s = s.replace(old_eff, new_eff)

old_buff = between("      case 'buff':\n      case 'debuff': {", "      case 'heal':\n        for (const t of tgts) if (t.alive) {")
new_buff = """      case 'buff':
      case 'debuff': {
        // V10.7 异名相加、同名刷新、加总封顶（Lynch 定 ±50%）。群体先一句总述，再每人一行写前后数值
        const sign = f.k === 'buff' ? '+' : '−';
        const nm = STAT_NAME[f.stat] || f.stat, dur = f.dur || 2, src = u.castName || '其他';
        const live = tgts.filter(t => t.alive);
        if (live.length > 1) {
          const mine = f.k === 'buff' ? u.ally : !u.ally;     // 增益给自己人，减益给对面
          b.log.push({ c: 'sk', s: `${sideLabel(f.tg, mine)} ${nm} ${sign}${pc(f.pct * mod)}，持续 ${dur} 回合` });
        }
        const kn = f.k === 'buff' ? '增益' : '削弱';
        for (const t of live) {
          const bm = f.k === 'buff' && u.pas && u.pas.buff ? 1 + u.pas.buff : 1;   // V10.6 pbuff
          const add = Math.round((t[f.stat] || 10) * f.pct * mod * bm);
          const before = this.eff(t, f.stat);
          const r = this.putMod(t, f.k, f.stat, src, add, dur);
          const after = this.eff(t, f.stat), m = this.modSum(t, f.k, f.stat);
          let how;
          if (r.old >= add) how = `同名${kn}已有 ${sign}${num(r.old)}，不叠加，持续回合刷新为 ${dur}`;
          else if (r.old) how = `同名${kn} ${sign}${num(r.old)}→${sign}${num(add)}`;
          else how = `${sign}${num(add)}`;
          const capTxt = m.raw > m.cap ? `；${kn}合计 ${sign}${num(m.raw)} 已达上限 ${sign}${num(m.cap)}` : '';
          b.log.push({ c: 'sk', s: `　${t.ln} ${nm} ${num(before)}→${num(after)}（${src}：${how}${capTxt}），持续 ${dur} 回合` });
          this.ev(b, { k: 'st', t: t.idx, ally: t.ally, st: f.k });
        }
        return tgts;
      }
"""
s = s.replace(old_buff, new_buff)

old_steal = between("      case 'steal':\n        for (const t of tgts) {", "      case 'cleanse':\n        for (const t of tgts) {")
new_steal = """      case 'steal':
        for (const t of tgts) {
          if (!t.alive) continue;
          const v = Math.round((t[f.stat] || 10) * f.pct * mod);
          const dur = f.dur || 2, nm = STAT_NAME[f.stat] || f.stat, src = u.castName || '夺取';
          const t0 = this.eff(t, f.stat), u0 = this.eff(u, f.stat);
          // V10.7 目标的削弱按来源分格（同名刷新、异名相加、封顶）；自己只拿目标实际少掉的那部分，
          //   再不超过自身面板的 cap.steal（文官夺武将的武原来能翻三倍）
          this.putMod(t, 'debuff', f.stat, src, v, dur);
          const t1 = this.eff(t, f.stat), got0 = Math.max(0, t0 - t1);
          const lim = Math.round((u[f.stat] || 0) * CFG.cap.steal);
          const got = Math.min(got0, lim);
          if (got > 0) this.putMod(u, 'buff', f.stat, src, got, dur);
          const u1 = this.eff(u, f.stat);
          const dm = this.modSum(t, 'debuff', f.stat);
          b.log.push({ c: 'sk', s: `${u.ln} 夺取 ${t.ln} ${nm} ${num(v)}：${t.ln} ${num(t0)}→${num(t1)}（−${num(got0)}${dm.raw > dm.cap ? `；削弱合计已达上限 −${num(dm.cap)}` : ''}）；${u.ln} ${num(u0)}→${num(u1)}（${u1 > u0 ? `+${num(u1 - u0)}` : '未生效：增益已达上限'}${got0 > lim ? `；所得封顶为自身 ${pc(CFG.cap.steal)} 即 ${num(lim)}` : ''}），持续 ${dur} 回合` });
        }
        return tgts;
"""
s = s.replace(old_steal, new_steal)

rep("""          const what = bad.map(k => k.startsWith('debuff_') ? `${STAT_NAME[k.slice(7)] || k.slice(7)}−${num(t.status[k].val)}`""",
    """          const what = bad.map(k => k.startsWith('debuff_') ? `${STAT_NAME[k.slice(7).split('|')[0]] || k.slice(7)}−${num(t.status[k].val)}（${k.split('|')[1] || ''}）`""")
rep("""          const what = good.map(k => k.startsWith('buff_') ? `${STAT_NAME[k.slice(5)] || k.slice(5)}+${num(t.status[k].val)}`""",
    """          const what = good.map(k => k.startsWith('buff_') ? `${STAT_NAME[k.slice(5).split('|')[0]] || k.slice(5)}+${num(t.status[k].val)}（${k.split('|')[1] || ''}）`""")
rep("""        const isB = k.startsWith('buff_'), isD = k.startsWith('debuff_');
        const stat = isB ? k.slice(5) : isD ? k.slice(7) : null;
        const before = stat ? this.eff(u, stat) : 0;
        delete u.status[k];
        if (stat && s.val) b.log.push({ c: 'in', s: `${u.ln} ${STAT_NAME[stat] || stat}${isB ? '增益 +' : '削弱 −'}${num(s.val)} 到期：${STAT_NAME[stat] || stat} ${num(before)}→${num(this.eff(u, stat))}` });""",
    """        const isB = k.startsWith('buff_'), isD = k.startsWith('debuff_');
        const stat = isB ? k.slice(5).split('|')[0] : isD ? k.slice(7).split('|')[0] : null;
        const srcN = k.split('|')[1] || '';
        const before = stat ? this.eff(u, stat) : 0;
        delete u.status[k];
        if (stat && s.val) b.log.push({ c: 'in', s: `${u.ln} ${STAT_NAME[stat] || stat}${isB ? '增益 +' : '削弱 −'}${num(s.val)}（${srcN}）到期：${STAT_NAME[stat] || stat} ${num(before)}→${num(this.eff(u, stat))}` });""")
rep("""    let hit = [], src = null;
    for (const f of sk.fx || []) {
      if (b.over) break;
      const r = this.applyFx(b, u, f, hit, mod, src);""",
    """    let hit = [], src = null;
    u.castName = sk.name;   // V10.7 增益按来源分格：格子用技能名标
    for (const f of sk.fx || []) {
      if (b.over) break;
      const r = this.applyFx(b, u, f, hit, mod, src);""")
rep("""      b.log.push({ c: 'ps', s: `${u.ln} 触发【残血】：生命低于 ${pc(f.at)}，${STAT_NAME[f.stat]} ${num(before)}→${num(this.eff(u, f.stat))}（+${num(add)}，持续至战斗结束，不可驱散）（来源：${f.from || '被动'}）` });""",
    """      const m = this.modSum(u, 'buff', f.stat);
      b.log.push({ c: 'ps', s: `${u.ln} 触发【残血】：生命低于 ${pc(f.at)}，${STAT_NAME[f.stat]} ${num(before)}→${num(this.eff(u, f.stat))}（+${num(add)}，持续至战斗结束，不可驱散${m.raw > m.cap ? `；增益合计已达上限 +${num(m.cap)}` : ''}）（来源：${f.from || '被动'}）` });""")
rep("""      case 'buff':   return `${tg}${STAT_NAME[f.stat] || f.stat} +${pc(f.pct)}${dur}（同属性增益不叠加，取最高值）`;""",
    """      case 'buff':   return `${tg}${STAT_NAME[f.stat] || f.stat} +${pc(f.pct)}${dur}（异名增益相加、同名刷新，合计不超过面板值的 ${pc(CFG.cap.buff)}）`;""")
rep("""      case 'steal':  return `夺取${tg} ${pc(f.pct)} 的${STAT_NAME[f.stat] || f.stat}${dur}（自身所得等于目标实际减少值）`;""",
    """      case 'steal':  return `夺取${tg} ${pc(f.pct)} 的${STAT_NAME[f.stat] || f.stat}${dur}（自身所得等于目标实际减少值，且不超过自身面板值的 ${pc(CFG.cap.steal)}）`;""")
open(p, 'w', encoding='utf-8').write(s)
print('engine ① 写入', p)
