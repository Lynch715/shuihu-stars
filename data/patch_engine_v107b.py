#!/usr/bin/env python3
"""V10.7 engine 改动 ④：减伤 / 回血 / 发动率三个新状态，指挥技时限（from / every）。可重跑。"""
import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, 'src', 'engine.js')
s = open(p, encoding='utf-8').read()
if "guard: '减伤'" in s: print('已经改过'); sys.exit(0)
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:70]); s = s.replace(a, b)

# 状态名
rep("""const ST_NAME = { stun: '眩晕', silence: '沉默', disarm: '缴械', chaos: '混乱', taunt: '嘲讽',
                  vuln: '易伤', bleed: '流血', burn: '灼烧', poison: '中毒', dodge: '闪避', wind: '狂风' };""",
"""const ST_NAME = { stun: '眩晕', silence: '沉默', disarm: '缴械', chaos: '混乱', taunt: '嘲讽',
                  vuln: '易伤', bleed: '流血', burn: '灼烧', poison: '中毒', dodge: '闪避', wind: '狂风',
                  guard: '减伤', regen: '回血', rate: '振奋' };   // V10.7 指挥技新增三种增益：受伤减免、每回合回血、主动技发动率""")
rep("""  dodge: '有几率闪避单体攻击', wind: '受到的灼烧伤害提高，灼烧向同排蔓延',
};""",
"""  dodge: '有几率闪避单体攻击', wind: '受到的灼烧伤害提高，灼烧向同排蔓延',
  guard: '受到的伤害降低', regen: '每回合回复最大生命的一部分', rate: '主动技发动率提高',
};
const GAIN_ST = ['dodge', 'taunt', 'guard', 'regen', 'rate'];   // 给自己人的状态：驱散会拿掉，格子上画 ▲""")

# 技能说明
rep("""        if (f.st === 'taunt') return `${tg}获得【嘲讽】（敌方单体攻击优先指向自身）${dur}`;""",
"""        if (f.st === 'taunt') return `${tg}获得【嘲讽】（敌方单体攻击优先指向自身）${dur}`;
        if (f.st === 'guard') return `${tg}获得【减伤】（受到的伤害 −${pc(f.val || 0.15)}）${dur}`;
        if (f.st === 'regen') return `${tg}获得【回血】（每回合回复最大生命的 ${pc(f.val || 0.05)}）${dur}`;
        if (f.st === 'rate') return `${tg}获得【振奋】（主动技发动率 +${pc(f.val || 0.1)}）${dur}`;""")
# 指挥技时限前缀
rep("""  desc(sk) {
    const parts = (sk.fx || []).map(f => this.fx(f)).filter(Boolean);
    return parts.join('；') || '—';
  },""",
"""  desc(sk) {
    const parts = (sk.fx || []).map(f => this.fx(f)).filter(Boolean);
    // V10.7 指挥技时限：默认开战时发动一次；from = 第 N 回合开始时发动一次；every = 每回合开始时按几率发动
    const when = sk.cat !== 'cmd' ? '' : sk.every ? `每回合开始时${sk.rate != null && sk.rate < 1 ? ` ${pc(sk.rate)} 几率` : ''}：`
               : sk.from ? `第 ${sk.from} 回合开始时：` : '';
    return when + (parts.join('；') || '—');
  },""")

# 伤害：减伤
rep("""      if (tgt.status.vuln) amount *= 1 + (tgt.status.vuln.val || 0.2);
      if (tgt.pas.cut) amount *= 1 - Math.min(0.5, tgt.pas.cut);""",
"""      if (tgt.status.vuln) amount *= 1 + (tgt.status.vuln.val || 0.2);
      if (tgt.status.guard) amount *= 1 - Math.min(0.5, tgt.status.guard.val || 0.15);   // V10.7 减伤状态
      if (tgt.pas.cut) amount *= 1 - Math.min(0.5, tgt.pas.cut);""")

# 发动率
rep("""      if (chance(s.rate + (u.pas.skrate || 0)) && this.usable(b, u, s)) return s;""",
"""      if (chance(s.rate + (u.pas.skrate || 0) + (u.status.rate ? u.status.rate.val || 0 : 0)) && this.usable(b, u, s)) return s;   // V10.7 振奋""")

# putStatus 文案
rep("""      taunt: '敌方单体攻击优先指向自身', vuln: `受到的伤害 +${pc(f.val || 0.2)}`, dodge: `${pc(f.val || 0.2)} 几率闪避单体攻击`,""",
"""      taunt: '敌方单体攻击优先指向自身', vuln: `受到的伤害 +${pc(f.val || 0.2)}`, dodge: `${pc(f.val || 0.2)} 几率闪避单体攻击`,
      guard: `受到的伤害 −${pc(f.val || 0.15)}`, regen: `每回合回复最大生命的 ${pc(f.val || 0.05)}`, rate: `主动技发动率 +${pc(f.val || 0.1)}`,""")
rep("""    const gain = f.st === 'dodge' || f.st === 'taunt';""",
"""    const gain = GAIN_ST.includes(f.st);""")
# 默认值：guard/regen/rate 没写 val 时给默认
rep("""    let val = f.val || 0;
    if (f.st === 'burn') val = Math.max(1, Math.round((f.base || 0) * CFG.burnK));""",
"""    let val = f.val || 0;
    if (f.st === 'burn') val = Math.max(1, Math.round((f.base || 0) * CFG.burnK));
    if (!val && f.st === 'guard') val = 0.15;
    if (!val && f.st === 'regen') val = 0.05;
    if (!val && f.st === 'rate') val = 0.1;""")

# 驱散拿掉增益状态
rep("""          const good = Object.keys(t.status).filter(k => k.startsWith('buff_') || k === 'dodge' || k === 'taunt');""",
"""          const good = Object.keys(t.status).filter(k => k.startsWith('buff_') || GAIN_ST.includes(k));""")
rep("""                                    : k === 'dodge' ? `闪避+${pc(t.status[k].val || 0.2)}` : '嘲讽');""",
"""                                    : k === 'dodge' ? `闪避+${pc(t.status[k].val || 0.2)}` : (ST_NAME[k] || k));""")

# tick：回血；到期提示
rep("""      else if (s.dur === 1 && ['taunt', 'vuln', 'dodge', 'wind'].includes(k))
        b.log.push({ c: 'in', s: `${u.ln} 的【${ST_NAME[k]}】结束` });""",
"""      else if (k === 'regen' && u.hp < u.maxHp) this.heal(b, u, Math.max(1, Math.round(u.maxHp * (s.val || 0.05))), null);   // V10.7 回血状态
      if (s.dur === 1 && ['taunt', 'vuln', 'dodge', 'wind', 'guard', 'regen', 'rate'].includes(k))
        b.log.push({ c: 'in', s: `${u.ln} 的【${ST_NAME[k]}】结束` });""")

# prelude：只发没有时限的；runRound：第 N 回合 / 每回合
rep("""    for (const u of order) for (const sk of u.cmds) {
      if (b.over || !u.alive) break;
      if (this.usable(b, u, sk)) this.cast(b, u, sk);
    }
  },""",
"""    for (const u of order) for (const sk of u.cmds) {
      if (b.over || !u.alive) break;
      if (sk.from || sk.every) continue;          // V10.7 有时限的指挥技在 roundCmds 里发
      if (this.usable(b, u, sk)) this.cast(b, u, sk);
    }
  },

  /** V10.7 回合开始时的指挥技：from = 第 N 回合发一次；every = 每回合按 rate 掷一次 */
  roundCmds(b) {
    const list = [...b.allies, ...b.foes].filter(u => u.alive && u.cmds.some(sk => sk.from || sk.every));
    if (!list.length) return;
    const order = list.map(u => ({ u, k: this.eff(u, 'agi') })).sort((a, c) => c.k - a.k).map(x => x.u);
    for (const u of order) for (const sk of u.cmds) {
      if (b.over || !u.alive) break;
      if (u.status.silence && sk.every) continue;
      if (sk.from && sk.from === b.round && this.usable(b, u, sk)) this.cast(b, u, sk);
      else if (sk.every && chance(sk.rate == null ? 1 : sk.rate) && this.usable(b, u, sk)) this.cast(b, u, sk);
    }
  },""")
rep("""    b.events.push({ k: 'round', n: b.round, li: b.log.length });
""",
"""    b.events.push({ k: 'round', n: b.round, li: b.log.length });
    this.roundCmds(b);   // V10.7 有时限的指挥技
""")
open(p, 'w', encoding='utf-8').write(s)
print('engine ④ 写入')
