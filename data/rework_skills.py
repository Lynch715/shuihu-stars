#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
水浒群星录 V10.3 · 技能重做
  python3 rework_skills.py            改写 data/gameData_v10.json 里的 skills
  python3 rework_skills.py --check    只算不写，打印期望值报告

三件事：
  1. 天罡/绝世 71 人的 280 个技能按 skills_named.py 手写表生成
  2. 其余 193 人的技能按名字关键词生成形状，数值按品质档解出来
  3. 没人用的技能删掉

新字段：{ name, cat, rate, cd, fx:[…] }。旧的 type/desc/mult/stat/value/dur/chance/eff 全部丢掉，
描述由引擎 SkillText.desc() 从 fx 拼，不再存。

「期望值」：把一个技能折成「每回合多打几下普攻」。主动技放出来就不普攻了，所以一次发动的
价值要先扣掉那一下普攻（V − 1），再乘发动率。同品质同格位的技能落在同一档里，
效果越猛发动率越低。数值系数见 value()，是尺子不是真理 —— 拿来保证同档技能强弱不离谱，
真实强弱由 playthrough.js 跑出来再调。
"""
import json, os, re, sys, random, collections, importlib.util

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, 'gameData_v10.json')
CHECK = '--check' in sys.argv
random.seed(10_3)

spec = importlib.util.spec_from_file_location('named', os.path.join(ROOT, 'skills_named.py'))
named = importlib.util.module_from_spec(spec); spec.loader.exec_module(named)
NAMED = named.NAMED

# ── 品质档：每回合期望额外产出（相对普攻），按格位从档底走到档顶，★4 再加一成半 ──
BAND = { 1: (0.38, 0.52), 2: (0.42, 0.58), 3: (0.56, 0.72), 4: (0.65, 0.82), 5: (0.82, 1.06), 6: (1.06, 1.30) }
def target(q, slot):
    lo, hi = BAND[q]
    t = lo + (hi - lo) * slot / 3
    return t * (1.15 if slot == 3 else 1.0)

# 被动、指挥是常驻/一次性的，折成每回合之后比主动小一截；这两个系数把它们拉到同一把尺子上
PAS_K = 0.22      # 被动每回合价值 ≈ 档位 × 0.22
CMD_K = 0.22      # 指挥总价值 / 10 回合 ≈ 档位 × 0.22
SURE_K = 0.5      # 必中技多半是护盾治疗这种守势招：不扣普攻，档位打对折

N = { 'single': 1, 'weakest': 1, 'strongest': 1, 'smartest': 1, 'row': 2, 'col': 2, 'front': 2, 'back': 2,
      'rand2': 2, 'rand3': 2.8, 'all': 3.5, 'self': 1, 'mates': 5, 'lowest': 1, 'frontm': 3, 'colm': 3, 'hit': 1 }
STV = { 'stun': 1.6, 'silence': 0.6, 'disarm': 0.7, 'chaos': 2.0, 'taunt': 0.6, 'bleed': 0.35, 'burn': 0.3, 'poison': 0.25 }
W = { 'atk': 1.0, 'def': 0.7, 'int': 0.6, 'agi': 0.5, 'hp': 0.6 }

def value(fx, cat):
    """折算成「普攻次数」。主动/必中/指挥算一次发动的总价值；被动算每回合价值。"""
    v = 0.0; prevN = 1
    for f in fx:
        k = f['k']
        if k == 'dmg':
            n = N[f['tg']]; prevN = n
            m = f['mult'] * (1 + 0.25 * (f['exec']['mul'] - 1) * 0.5 if f.get('exec') else 1)
            if f.get('drain'): m *= 1 + 0.3 * (1 if f['drain'] >= 1 else f['drain'])
            if f.get('pierce'): m *= 1 + 0.5 * f['pierce']
            v += m * n
        elif k == 'status':
            n = prevN if f['tg'] == 'hit' else N[f['tg']]
            st, ch, dur = f['st'], f.get('chance', 1), f.get('dur', 1)
            per = (2.5 * f.get('val', 0.2)) if st in ('vuln', 'dodge') else STV.get(st, 0.5)
            v += ch * dur * per * n
        elif k in ('buff', 'debuff'):
            v += f['pct'] * W[f['stat']] * f.get('dur', 2) * N[f['tg']]
        elif k == 'heal':
            v += (f['pct'] * 3.7 * 0.9 if f.get('pct') else f['mult'] * 0.6) * N[f['tg']]
        elif k == 'shield':
            v += f['pct'] * 3.7 * 1.0 * N[f['tg']]
        elif k == 'steal':
            v += f['pct'] * W[f['stat']] * f.get('dur', 2) * 2
        elif k in ('cleanse', 'dispel'):
            v += 0.4 * min(N[f['tg']], 3)
        # 被动（每回合）
        elif k == 'pstat':   v += f['pct'] * W[f['stat']] * 1.5
        elif k == 'pcrit':   v += f['val'] * 0.6
        elif k == 'pcritdmg':v += f['val'] * 0.2
        elif k == 'pdmg':    v += f['pct'] * 1.5
        elif k == 'pcut':    v += f['pct'] * 1.3
        elif k == 'pdodge':  v += f['chance'] * 1.0
        elif k == 'pcounter':v += f['chance'] * f['mult'] * 0.8
        elif k == 'pfollow': v += f['chance'] * f['mult']
        elif k == 'ponhit':  v += f['chance'] * STV.get(f['st'], 0.5) * f.get('dur', 1) * 0.8
        elif k == 'pregen':  v += f['pct'] * 3.7
        elif k == 'plow':    v += f['pct'] * W[f['stat']] * 0.6
        elif k == 'pshield': v += f['pct'] * 3.7 / 6
        elif k == 'pimmune': v += 0.12 * len(f['st'])
        elif k == 'pfirst':  v += 0.12
        elif k == 'ptough':  v += 0.15
    return v

def r20(x): return round(x * 20) / 20

# ── DSL 解析 ───────────────────────────────────────────────────────────
def num(s): return float(s)
def parse_fx(tok):
    p = tok.split()
    k = p[0]
    if k == 'dmg':
        f = { 'k': 'dmg', 'tg': p[1], 'mult': num(p[2]) }
        for o in p[3:]:
            a, b = o.split('=')
            if a == 'src': f['src'] = b
            elif a == 'exec': at, mul = b.split(','); f['exec'] = { 'at': num(at), 'mul': num(mul) }
            elif a == 'drain': f['drain'] = num(b)
            elif a == 'pierce': f['pierce'] = num(b)
        return f
    if k == 'st':
        f = { 'k': 'status', 'tg': p[1], 'st': p[2] }
        if len(p) > 3: f['chance'] = num(p[3])
        if len(p) > 4: f['dur'] = int(p[4])
        if len(p) > 5: f['val'] = num(p[5])
        return f
    if k in ('buff', 'debuff'):
        return { 'k': k, 'tg': p[1], 'stat': p[2], 'pct': num(p[3]), 'dur': int(p[4]) }
    if k == 'heal':
        if p[2].startswith('pct='): return { 'k': 'heal', 'tg': p[1], 'pct': num(p[2][4:]) }
        return { 'k': 'heal', 'tg': p[1], 'mult': num(p[2]) }
    if k == 'shield': return { 'k': 'shield', 'tg': p[1], 'pct': num(p[2]) }
    if k == 'steal': return { 'k': 'steal', 'tg': p[1], 'stat': p[2], 'pct': num(p[3]), 'dur': int(p[4]) }
    if k in ('cleanse', 'dispel'): return { 'k': k, 'tg': p[1] }
    if k == 'pstat': return { 'k': 'pstat', 'stat': p[1], 'pct': num(p[2]) }
    if k in ('pcrit', 'pcritdmg'): return { 'k': k, 'val': num(p[1]) }
    if k in ('pdmg', 'pcut', 'pregen', 'pshield'): return { 'k': k, 'pct': num(p[1]) }
    if k == 'pdodge': return { 'k': 'pdodge', 'chance': num(p[1]) }
    if k in ('pcounter', 'pfollow'): return { 'k': k, 'chance': num(p[1]), 'mult': num(p[2]) }
    if k == 'ponhit': return { 'k': 'ponhit', 'st': p[1], 'chance': num(p[2]), 'dur': int(p[3]) }
    if k == 'plow': return { 'k': 'plow', 'at': num(p[1]), 'stat': p[2], 'pct': num(p[3]) }
    if k == 'pimmune': return { 'k': 'pimmune', 'st': p[1].split(',') }
    if k == 'pfirst': return { 'k': 'pfirst' }
    if k == 'ptough': return { 'k': 'ptough' }
    raise ValueError('未知效果 ' + tok)

def parse(spec):
    head, _, rest = spec.strip().partition(' ')
    m = re.match(r'^([ASCP])(\d*)$', head)
    if not m: raise ValueError('类别不对 ' + spec)
    cat = { 'A': 'active', 'S': 'sure', 'C': 'cmd', 'P': 'passive' }[m.group(1)]
    n = m.group(2)
    fx = [parse_fx(t.strip()) for t in rest.split(';') if t.strip()]
    out = { 'cat': cat, 'fx': fx }
    if cat == 'active' and n: out['rate'] = int(n) / 100
    if cat == 'sure': out['cd'] = int(n) if n else 2
    return out

# ── 定发动率 / 校验 ────────────────────────────────────────────────────
WARN = []
def settle(sid, sk, q, slot, name):
    """主动：按目标解发动率。其余：算一下离档位多远，离谱的记下来。"""
    t = target(q, slot)
    v = value(sk['fx'], sk['cat'])
    if sk['cat'] == 'active':
        vv = v - 1          # 放技能这回合不普攻
        if 'rate' not in sk:
            sk['rate'] = r20(min(0.65, max(0.35, t / vv))) if vv > 0 else 0.65
        ev = sk['rate'] * vv
        if ev > t * 1.45 or ev < t * 0.6:
            WARN.append(f'{sid} {name} q{q}★{slot+1} 主动 EV {ev:.2f} 目标 {t:.2f}（{sk["rate"]:.0%} × {v:.2f}）')
    elif sk['cat'] == 'sure':
        ev = v / (sk['cd'] + 1); t = t * SURE_K
        if ev > t * 1.45 or ev < t * 0.6:
            WARN.append(f'{sid} {name} q{q}★{slot+1} 必中 EV {ev:.2f} 目标 {t:.2f}（冷却 {sk["cd"]} · {v:.2f}）')
    elif sk['cat'] == 'cmd':
        ev = v / 10
        if ev > t * CMD_K * 1.6 or ev < t * CMD_K * 0.55:
            WARN.append(f'{sid} {name} q{q}★{slot+1} 指挥 EV {ev:.2f} 目标 {t * CMD_K:.2f}（总 {v:.2f}）')
    else:
        ev = v
        if ev > t * PAS_K * 1.6 or ev < t * PAS_K * 0.55:
            WARN.append(f'{sid} {name} q{q}★{slot+1} 被动 EV {ev:.2f} 目标 {t * PAS_K:.2f}')
    return ev

# ── 关键词规则（名/猛/良/凡 + 杂兵）─────────────────────────────────────
# 顺序即优先级。每条：正则 → 形状名。形状在 shape() 里按目标值解出数值。
RULES = [
    (r'谗言|告密|诬告|莫须有|罗织|勒索|要挟|审讯|刑求|口蜜|窃听|窃窃|笑面|笑脸', 'silence'),
    (r'蒙汗|迷药|下毒|麻沸|迷眼|夺门|缴|勾魂|夺魄', 'disarm'),
    (r'妖法|幻术|迷魂|蛊惑|诡计|机关算尽|美人计|风月|勾引|唆使|花言|枕边|媚|妖女|迷人|误走|伪造|奸计|鬼魅|伎俩|铁扇', 'chaos'),
    (r'教头|统帅|统军|统领|号令|激励|将令|军师|之主|寨主|元帅|都统|头领|威严|威风|士气|军魂|聚义|同心|兄弟|并肩|联手|领袖|门风|家五虎|之首|大军|铁骑|亲征|辅国|命官|重臣|权威|庇护|党羽', 'cmd_buff'),
    (r'谋略|谋臣|智谋|智|算|韬|策|谋', 'cmd_int'),
    (r'医|药|回春|救|疗|甘霖|仙风|妙手|嘉穗|恩|人情|账房|风情|悦耳|袅袅|嘹亮|横吹', 'heal'),
    (r'护盾|护体|铁壁|城墙|坚固|军阵|铠|甲', 'shield_self'),
    (r'反|硬|铁骨|铜皮|筋骨|悍|刚|金刚|不坏|身躯|臂长|高大|万全|坚守|明哲|无惧', 'p_counter'),
    (r'飞|轻|走壁|草上|日行|迅捷|敏捷|神行|潜|蛇行|翱翔|翅|如电|如风|游走|幻影|蜃|活闪|鬼脸|伪装|面目模糊', 'p_dodge'),
    (r'连|双|齐出|连珠|急|疾|两头|双尾|三大', 'p_follow'),
    (r'偷|窃|盗|吞没|搜刮|贪|勒索|吸|夺', 'steal'),
    (r'火|焰|炮|烧|焚|雷|霹雳|轰', 'burn'),
    (r'毒|蛇|蝎|蜈|蛊|药', 'poison'),
    (r'锤|棒|棍|闹|撞|擂|震|锏|锹|铁棒|大圣|哪吒', 'stun'),
    (r'破阵|破敌|慧眼|识破|嗅探|追踪|穿|透|贯|箭|射|弓|弩', 'vuln'),
    (r'千军|万军|十万|四方|千里|乱舞|万里|横扫|翻江|倒海|王神威|大王|圣公', 'aoe'),
    (r'出身|血脉|之后|血统|福星|高照|之力|神力|力大|力敌|勇|猛|威|霸', 'p_stat'),
    (r'刀|剑|斩|刺|牙|爪|斧|枪|戟|矛|鞭|拳|扑|砍|劈|杀|击|突袭|冲锋|冲', 'bleed'),
]

PAS_ALT = ['p_stat', 'p_follow', 'p_counter', 'p_dodge']
def shape_of(name, oldtype, slot, seen=()):
    for pat, sh in RULES:
        if re.search(pat, name): break
    else:
        sh = { 'buff_all': 'cmd_buff', 'heal_all': 'heal', 'heal_one': 'heal', 'heal_self': 'heal', 'chaos': 'chaos',
               'steal': 'steal', 'shld_self': 'shield_self', 'shld_all': 'shield_self', 'shld_col': 'shield_self',
               'atk_all': 'aoe', 'atk_row': 'bleed', 'atk_col': 'bleed' }.get(oldtype, 'plain')
    # 老类型提示范围：横排竖列全体保留一下打面
    if sh in ('bleed', 'stun', 'vuln', 'burn', 'poison', 'plain') and oldtype in ('atk_row', 'atk_col', 'atk_all'):
        sh = sh + '_' + { 'atk_row': 'row', 'atk_col': 'col', 'atk_all': 'all' }[oldtype]
    # ★1 必须是主动或必中：能出手的招；★2 优先被动/指挥
    if slot == 0 and sh in ('p_counter', 'p_dodge', 'p_follow', 'p_stat'): sh = 'plain'
    if slot == 0 and sh in ('cmd_buff', 'cmd_int'): sh = 'buff_active'
    # 戴宗四招三个闪避：同一个人的被动不重样
    if sh in PAS_ALT and sh in seen:
        for alt in PAS_ALT:
            if alt not in seen: sh = alt; break
    return sh

def shape(sh, q, slot, rng):
    """形状 → 技能。数值按目标值解，随机抖动一点免得整齐划一。"""
    t = target(q, slot)
    j = lambda: rng.uniform(0.92, 1.08)
    tag = sh.split('_')[-1] if sh.split('_')[-1] in ('row', 'col', 'all') else None
    base = sh[:-4] if tag else sh
    tgn = tag or 'single'
    n = N[tgn]
    def dmg_with(st, chance, dur, val=None):
        nonlocal tgn, n
        stv = (2.5 * val) if st == 'vuln' else STV[st]
        if tgn == 'all' and t / 0.35 / N['all'] < 0.5: tgn = 'row'; n = N['row']   # 低档打不起全体
        rate = { 'single': 0.55, 'row': 0.45, 'col': 0.45, 'all': 0.35 }[tgn]
        budget = t * j() / rate + 1
        mmin = 1.2 if tgn == 'single' else 0.7 if tgn != 'all' else 0.45
        # 先保住倍率下限，剩下的预算给状态；预算不够就把状态几率往下压，压到一成以下干脆不要
        room = budget - mmin * n
        chance = min(chance, room / (dur * stv * n)) if room > 0 else 0
        chance = round(chance, 2)
        if chance < 0.1:
            return { 'cat': 'active', 'rate': rate, 'fx': [{ 'k': 'dmg', 'tg': tgn, 'mult': round(max(mmin, budget / n), 2) }] }
        m = (budget - chance * dur * stv * n) / n
        f = [{ 'k': 'dmg', 'tg': tgn, 'mult': round(m, 2) }, { 'k': 'status', 'tg': 'hit', 'st': st, 'chance': chance, 'dur': dur }]
        if val is not None: f[1]['val'] = val
        return { 'cat': 'active', 'rate': rate, 'fx': f }
    if base == 'plain':
        rate = { 'single': 0.6, 'row': 0.45, 'col': 0.45, 'all': 0.35 }[tgn]
        m = max(1.2 if tgn == 'single' else 0.7, (t * j() / rate + 1) / n)
        return { 'cat': 'active', 'rate': rate, 'fx': [{ 'k': 'dmg', 'tg': tgn, 'mult': round(m, 2) }] }
    if base == 'bleed':  return dmg_with('bleed', 0.3, 2)
    if base == 'stun':   return dmg_with('stun', 0.25, 1)
    if base == 'burn':   return dmg_with('burn', 0.3, 2)
    if base == 'poison': return dmg_with('poison', 0.35, 3)
    if base == 'vuln':   return dmg_with('vuln', 0.4, 2, 0.2)
    if sh == 'aoe':
        m = (t * j() / 0.35 + 1) / N['all']
        if m < 0.5:                                   # 低档的「全体」打不起，退成横排
            m = (t * j() / 0.45 + 1) / N['row']
            return { 'cat': 'active', 'rate': 0.45, 'fx': [{ 'k': 'dmg', 'tg': 'row', 'mult': round(max(0.7, m), 2) }] }
        return { 'cat': 'active', 'rate': 0.35, 'fx': [{ 'k': 'dmg', 'tg': 'all', 'mult': round(m, 2) }] }
    if sh == 'silence':
        # 沉默最高智的：先按预算定几率（最高八成），有富余再补一点智力伤害
        rate = 0.45; budget = t * j() / rate + 1
        ch = round(min(0.8, budget / (2 * STV['silence'])), 2)
        m = (budget - ch * 2 * STV['silence'])
        fx = [{ 'k': 'status', 'tg': 'smartest', 'st': 'silence', 'chance': ch, 'dur': 2 }]
        if m >= 0.4: fx.append({ 'k': 'dmg', 'tg': 'smartest', 'mult': round(m, 2), 'src': 'int' })
        return { 'cat': 'active', 'rate': rate, 'fx': fx }
    if sh == 'disarm':
        rate = 0.45; budget = t * j() / rate + 1
        m = 1.4
        ch = round(min(0.7, max(0.15, (budget - m) / STV['disarm'])), 2)
        m = round(max(m, budget - ch * STV['disarm']), 2)       # 几率封顶之后，剩下的预算补进倍率
        return { 'cat': 'active', 'rate': rate, 'fx': [{ 'k': 'dmg', 'tg': 'single', 'mult': m },
                                                        { 'k': 'status', 'tg': 'hit', 'st': 'disarm', 'chance': ch, 'dur': 1 }] }
    if sh == 'chaos':
        budget = t * j() / 0.45 + 1
        ch = min(0.7, max(0.3, budget / STV['chaos']))
        fx = [{ 'k': 'status', 'tg': 'smartest', 'st': 'chaos', 'chance': round(ch, 2), 'dur': 1 }]
        rem = budget - ch * STV['chaos']
        if rem >= 0.4: fx.append({ 'k': 'dmg', 'tg': 'smartest', 'mult': round(rem, 2), 'src': 'int' })
        return { 'cat': 'active', 'rate': 0.45, 'fx': fx }
    if sh == 'cmd_buff':
        stat = rng.choice(['atk', 'atk', 'def', 'agi'])
        pct = t * CMD_K * 10 * j() / (W[stat] * 3 * 5)
        return { 'cat': 'cmd', 'fx': [{ 'k': 'buff', 'tg': 'mates', 'stat': stat, 'pct': round(pct, 2), 'dur': 3 }] }
    if sh == 'cmd_int':
        pct = t * CMD_K * 10 * j() / (W['int'] * 3 * 5)
        return { 'cat': 'cmd', 'fx': [{ 'k': 'buff', 'tg': 'mates', 'stat': 'int', 'pct': round(pct, 2), 'dur': 3 }] }
    if sh == 'buff_active':
        stat = rng.choice(['atk', 'def', 'agi'])
        rate = 0.5
        pct = (t * j() / rate + 1) / (W[stat] * 2 * 5)
        return { 'cat': 'active', 'rate': rate, 'fx': [{ 'k': 'buff', 'tg': 'mates', 'stat': stat, 'pct': round(pct, 2), 'dur': 2 }] }
    if sh == 'heal':
        if slot >= 2:
            m = t * SURE_K * 3 * j() / (0.6 * 5)      # 必中冷却 2：三回合一次
            return { 'cat': 'sure', 'cd': 2, 'fx': [{ 'k': 'heal', 'tg': 'mates', 'mult': round(m, 1) }] }
        m = (t * j() / 0.5 + 1) / 0.6
        return { 'cat': 'active', 'rate': 0.5, 'fx': [{ 'k': 'heal', 'tg': 'lowest', 'mult': round(m, 1) }] }
    if sh == 'shield_self':
        if slot == 1:
            pct = t * PAS_K * j() * 6 / 3.7
            return { 'cat': 'passive', 'fx': [{ 'k': 'pshield', 'pct': round(pct, 2) }] }
        pct = t * SURE_K * 3 * j() / 3.7
        return { 'cat': 'sure', 'cd': 2, 'fx': [{ 'k': 'shield', 'tg': 'self', 'pct': round(min(0.6, pct), 2) }] }
    if sh == 'p_counter':
        ch = t * PAS_K * j() / (0.8 * 0.8)
        return { 'cat': 'passive', 'fx': [{ 'k': 'pcounter', 'chance': round(min(0.5, ch), 2), 'mult': 0.8 }] }
    if sh == 'p_dodge':
        ch = t * PAS_K * j()
        return { 'cat': 'passive', 'fx': [{ 'k': 'pdodge', 'chance': round(min(0.3, ch), 2) }] }
    if sh == 'p_follow':
        ch = t * PAS_K * j() / 0.6
        return { 'cat': 'passive', 'fx': [{ 'k': 'pfollow', 'chance': round(min(0.5, ch), 2), 'mult': 0.6 }] }
    if sh == 'p_stat':
        stat = rng.choice(['atk', 'atk', 'def', 'hp'])
        pct = t * PAS_K * j() / (W[stat] * 1.5)
        return { 'cat': 'passive', 'fx': [{ 'k': 'pstat', 'stat': stat, 'pct': round(pct, 2) }] }
    if sh == 'steal':
        pct = t * SURE_K * 3 * j() / (W['atk'] * 3 * 2)
        return { 'cat': 'sure', 'cd': 2, 'fx': [{ 'k': 'steal', 'tg': 'strongest', 'stat': 'atk', 'pct': round(min(0.35, max(0.1, pct)), 2), 'dur': 3 }] }
    raise ValueError(sh)

# ── 主流程 ─────────────────────────────────────────────────────────────
d = json.load(open(DATA, encoding='utf-8'))
heroes, old = d['heroes'], d['skills']
used = collections.OrderedDict()
for hid, h in heroes.items():
    for i, sid in enumerate(h.get('sk', [])):
        used.setdefault(sid, []).append((hid, i))

new = {}
stats = collections.Counter()
shape_cnt = collections.Counter()
seen_by_hero = collections.defaultdict(set)
for sid, owners in used.items():
    o = old.get(sid)
    if not o: print('!! 断链', sid); continue
    # 一个技能被几个人共用时，按品质最高、格位最靠后的那个人定档
    hid, slot = max(owners, key=lambda x: (heroes[x[0]]['q'], x[1]))
    q = heroes[hid]['q']
    if sid in NAMED:
        sk = parse(NAMED[sid]); src = 'named'
    else:
        rng = random.Random(sid)
        sh = shape_of(o['name'], o['type'], slot, seen_by_hero[hid])
        seen_by_hero[hid].add(sh)
        sk = shape(sh, q, slot, rng); src = sh
        shape_cnt[sh] += 1
    sk['name'] = o['name']
    settle(sid, sk, q, slot, o['name'])
    stats[sk['cat']] += 1
    new[sid] = sk

print(f'在用技能 {len(used)}，删除未用 {len(old) - len(used)}')
print('类别分布', dict(stats))
print('规则形状分布', dict(shape_cnt.most_common()))
print(f'越档提醒 {len(WARN)} 条')
for w in WARN: print('  ', w)

if CHECK: sys.exit(0)

# 一份可读的表，抽查用
lines = []
for sid, sk in new.items():
    lines.append(f"{sid}\t{sk['name']}\t{sk['cat']}\t{sk.get('rate', '')}\t{sk.get('cd', '')}\t{json.dumps(sk['fx'], ensure_ascii=False)}")
open(os.path.join(ROOT, 'rework_skills_table.tsv'), 'w', encoding='utf-8').write('\n'.join(lines))
open(os.path.join(ROOT, 'rework_skills_report.txt'), 'w', encoding='utf-8').write(
    f'在用 {len(used)} 删 {len(old) - len(used)}\n类别 {dict(stats)}\n形状 {dict(shape_cnt)}\n越档 {len(WARN)}\n' + '\n'.join(WARN))

d['skills'] = new
json.dump(d, open(DATA, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('已写入', DATA)
