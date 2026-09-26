# -*- coding: utf-8 -*-
"""V10.6 引擎补丁：一次性，靠精确替换，替换不到就报错停下。"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def patch(fn, pairs):
    p = os.path.join(ROOT, 'src', fn); s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        n = s.count(a)
        if n != 1: print('!! 替换点不唯一或找不到', fn, n, a[:60]); sys.exit(1)
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s); print('ok', fn, len(pairs))

E = [
# 1 被动封顶加三项
("  pasCap: { cut: 0.35, dodge: 0.30, skrate: 0.25, pierce: 0.40 },",
 "  pasCap: { cut: 0.35, dodge: 0.30, skrate: 0.25, pierce: 0.40, heal: 0.40, ctrl: 0.20, buff: 0.35 },"),
# 2 装备智百分比
("      pct:  { atk: e.pct_atk || 0, def: e.pct_def || 0, hp: e.pct_hp || 0 },",
 "      pct:  { atk: e.pct_atk || 0, def: e.pct_def || 0, hp: e.pct_hp || 0, int: e.pct_int || 0 },   // V10.6 文官兵器吃智%"),
# 3 被动表
("              skrate: 0, pierce: 0, cmd: 0 };",
 "              skrate: 0, pierce: 0, cmd: 0, heal: 0, ctrl: 0, buff: 0 };"),
("        case 'pcmd':     p.cmd += f.pct; break;\n      }",
 "        case 'pcmd':     p.cmd += f.pct; break;\n        case 'pheal':    p.heal += f.pct; break;\n        case 'pctrl':    p.ctrl += f.val; break;\n        case 'pbuff':    p.buff += f.pct; break;\n      }"),
("  p.skrate = Math.min(p.skrate, cp.skrate); p.pierce = Math.min(p.pierce, cp.pierce);\n",
 "  p.skrate = Math.min(p.skrate, cp.skrate); p.pierce = Math.min(p.pierce, cp.pierce);\n  p.heal = Math.min(p.heal, cp.heal); p.ctrl = Math.min(p.ctrl, cp.ctrl); p.buff = Math.min(p.buff, cp.buff);\n"),
# 4 描述
("      case 'pcmd':     return `指挥技效果+${pc(f.pct)}`;",
 "      case 'pcmd':     return `指挥技效果+${pc(f.pct)}`;\n      case 'pheal':    return `施放的治疗+${pc(f.pct)}`;\n      case 'pctrl':    return `眩晕、混乱、沉默的命中几率+${pc(f.val)}`;\n      case 'pbuff':    return `施放的增益与护盾+${pc(f.pct)}`;"),
("        if (f.pierce) s += `，无视${pc(f.pierce)}防御`;\n        return s;",
 "        if (f.pierce) s += `，无视${pc(f.pierce)}防御`;\n        if (f.vsCtrl) s += `，对被控制（眩晕、混乱、沉默）的目标伤害+${pc(f.vsCtrl)}`;\n        return s;"),
("        if (f.st === 'bleed') return `${ch}使${tg}流血${dur}（每回合失 ${pc(CFG.bleedPct)} 最大生命）`;",
 "        if (f.st === 'bleed') return `${ch}使${tg}流血${dur}（每回合失 ${pc(CFG.bleedPct)} 最大生命，无视护盾）`;"),
("        if (f.st === 'poison') return `${ch}使${tg}中毒${f.layers > 1 ? ` ${f.layers} 层` : ''}${dur}（每层每回合失 ${pc(CFG.poisonPct)} 当前生命）`;",
 "        if (f.st === 'poison') return `${ch}使${tg}中毒${f.layers > 1 ? ` ${f.layers} 层` : ''}${dur}（每层每回合失 ${pc(CFG.poisonPct)} 当前生命，无视护盾）`;"),
# 5 真实伤害：流血中毒绕过护盾
("    let left = amount, absorbed = 0;\n    if (tgt.shield > 0) {",
 "    let left = amount, absorbed = 0;\n    // V10.6 流血、中毒是真实伤害：不吃防御减伤（上面 src 为空已经跳过），也不被护盾挡\n    const trueDmg = tag === 'bleed' || tag === 'poison';\n    if (tgt.shield > 0 && !trueDmg) {"),
# 6 治疗加成
("  heal(b, tgt, amount, src) {\n    const before = tgt.hp;",
 "  heal(b, tgt, amount, src) {\n    if (src && src.pas && src.pas.heal) amount = Math.round(amount * (1 + src.pas.heal));   // V10.6 pheal\n    const before = tgt.hp;"),
# 7 控制命中
("    let p = f.chance == null ? 1 : f.chance;\n    if (f.st === 'chaos' && u) {",
 "    let p = f.chance == null ? 1 : f.chance;\n    // V10.6 pctrl：自己上的眩晕、混乱、沉默更容易中，封顶 95%\n    if (u && u.pas && u.pas.ctrl && u.ally !== t.ally && ['stun', 'chaos', 'silence'].includes(f.st)) p = Math.min(0.95, p + u.pas.ctrl);\n    if (f.st === 'chaos' && u) {"),
# 8 vsCtrl
("          if (f.exec && t.hp / t.maxHp < f.exec.at) base *= f.exec.mul;",
 "          if (f.exec && t.hp / t.maxHp < f.exec.at) base *= f.exec.mul;\n          if (f.vsCtrl && (t.status.stun || t.status.chaos || t.status.silence)) base *= 1 + f.vsCtrl;"),
# 9 增益与护盾加成
("          const add = Math.round((t[f.stat] || 10) * f.pct * mod);\n          const cur = t.status[key];",
 "          const bm = f.k === 'buff' && u.pas && u.pas.buff ? 1 + u.pas.buff : 1;   // V10.6 pbuff\n          const add = Math.round((t[f.stat] || 10) * f.pct * mod * bm);\n          const cur = t.status[key];"),
("          const add = Math.round(t.maxHp * f.pct * pw);\n          t.shield += add; u.tally.healed += add;",
 "          const add = Math.round(t.maxHp * f.pct * pw * (u.pas && u.pas.buff ? 1 + u.pas.buff : 1));   // V10.6 pbuff\n          t.shield += add; u.tally.healed += add;"),
# 10 驱散日志写上护盾
("          if (t.shield > 0) { t.shield = 0; t.shieldDur = 0; }\n          if (good.length) b.log.push({ c: 'in', s: `${t.ln} 增益被驱散` });",
 "          const hadShield = t.shield > 0;\n          if (hadShield) { t.shield = 0; t.shieldDur = 0; }\n          if (good.length || hadShield) {\n            b.log.push({ c: 'in', s: `${t.ln} ${hadShield ? '护盾' + (good.length ? '与增益' : '') : '增益'}被驱散` });\n            this.ev(b, { k: 'st', t: t.idx, ally: t.ally, st: 'dispel' });\n          }"),
# 11 敌方用改版前面板
("  const t = DB.hero(hid);\n  if (!t) return null;\n  const b0 = { atk: t.atk, def: t.def, int: t.int, agi: t.agi, hp: baseHp(t) };",
 "  const t = foeT ? DB.foeHero(hid) : DB.hero(hid);\n  if (!t) return null;\n  const b0 = { atk: t.atk, def: t.def, int: t.int, agi: t.agi, hp: baseHp(t) };"),
("function grownBase(hid, lv) {\n  const key = hid + '@' + lv;",
 "function grownBase(hid, lv, foeT) {\n  const key = hid + '@' + lv + (foeT ? 'f' : '');"),
("    hero: id => heroes[id] || null,\n",
 "    hero: id => heroes[id] || null,\n    /** V10.6 敌方口径：升过品阶的文官当敌将时仍用改版前的品阶与五维（数据里的 foe 快照），关卡难度不跟着变 */\n    foeHero: id => { const t = heroes[id]; return t ? (t.foe ? Object.assign({}, t, t.foe) : t) : null; },\n"),
("    return Lap.foeMulOf(tier.mul, (DB.hero(hid) || {}).q, tier.ch)",
 "    return Lap.foeMulOf(tier.mul, (DB.foeHero(hid) || {}).q, tier.ch)"),
("    const base = grownBase(hid, lv);\n    if (!base) return null;\n    const skills = ((DB.hero(hid) || {}).sk || []).slice(0, Math.min(star, 4));\n    const s = this.calc(hid, { hero: { lv, star, base, equipment: {} }, noBond: true, team: [], skills });",
 "    const base = grownBase(hid, lv, true);\n    if (!base) return null;\n    const skills = ((DB.hero(hid) || {}).sk || []).slice(0, Math.min(star, 4));\n    const s = this.calc(hid, { hero: { lv, star, base, equipment: {} }, noBond: true, team: [], skills, q: (DB.foeHero(hid) || {}).q });"),
("    const lv = h.lv || 1, star = h.star || 1, q = t.q || 1;",
 "    const lv = h.lv || 1, star = h.star || 1, q = (opt && opt.q) || t.q || 1;"),
# 12 一键装备评分
("       + ((e.pct.atk || 0) * (mage ? 300 : 900)) + ((e.pct.def || 0) + (e.pct.hp || 0)) * 600;",
 "       + ((e.pct.atk || 0) * (mage ? 300 : 900)) + ((e.pct.int || 0) * (mage ? 900 : 100)) + ((e.pct.def || 0) + (e.pct.hp || 0)) * 600;"),
]
V = [
("  for (const k of ['atk', 'def', 'hp']) if (e.pct[k]) p.push(`${STAT_NAME[k]}+${Math.round(e.pct[k] * 100)}%`);",
 "  for (const k of ['atk', 'int', 'def', 'hp']) if (e.pct[k]) p.push(`${STAT_NAME[k]}+${Math.round(e.pct[k] * 100)}%`);"),
]
patch('engine.js', E); patch('view.js', V)
