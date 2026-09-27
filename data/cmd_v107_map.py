#!/usr/bin/env python3
"""
水浒群星录 V10.7 · 规则生成的指挥技重分 —— 出对照表

  python3 data/cmd_v107_map.py     → data/cmd_v107.tsv + 指挥技对照表_V10.7.md

只处理「所有使用者都是名将及以下」的属性增益指挥技（天罡绝世手写的不碰）。
八类（规范 V10.7 ④）：
  A 属性增益（留，数值压到 6–10%）  B 减伤  C 回血  D 开局护盾  E 发动率（振奋）
  F 敌方减益  G 每回合施压  H 每回合净化
每类按名字关键词分，分不出的按人的路数：文官走 E，武将走 A。
tsv 可以手改（cat 列改字母即可），改完跑 fix_v107_cmd.py。
"""
import json, os, re, collections
ROOT = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(ROOT, 'gameData_v10.json'), encoding='utf-8'))
SK, H = D['skills'], D['heroes']
def role(t):
    a, i = t.get('atk', 0), t.get('int', 0)
    return 'mix' if min(a, i) / max(a, i, 1) >= 0.85 else ('wu' if a > i else 'wen')

users = collections.defaultdict(list)
for hid, h in H.items():
    for i, x in enumerate(h.get('sk', [])): users[x].append((hid, i + 1))

KEYS = [
    ('B', '守城|守京|护驾|庇护|防御|护卫|寨主|山寨|山主|山头领|山将|洞守|寨将|抵御|铁壁|盾'),
    ('C', '医|药|安抚|内政|宴|酒|厨|茶|安邦|农夫|种菜|管营|管事|街坊|治国|良策'),
    ('D', '阵法|布阵|工匠|缝衣|制旗|造|锁|铁甲|甲'),
    ('E', '军师|谋|算|智|策|计|妙|书生|印信|文|府尹|通判|尚书|枢密|太尉|重臣|辅国|命官|太守|法度|党附'),
    ('F', '暗算|蛇毒|窃|狡猾|耳目|情报|探子|伪造|密|抢亲|被殴|卖艺|客'),
    ('G', '水军|水战|水寨|江|湖|骁将|先锋|猎户|射|飞|石|火|炮|铁骑|冲锋|大军|副将|副'),
    ('H', '天师|道|法|符|灵应|神|庙|佛'),
    ('A', '号令|统帅|统领|威严|激励|士气|同心|兄弟|联手|豪气|亲征|元老|军魂|旗手|福将|将令|大将|聚义|忠义|头领|同门|同袍|并肩|夫妻|之妻|情谊|旧部|亲随|郡马|称王|宗亲|皇族|义士|好汉|大汉|光明'),
]
V = {  # 按品阶：凡 良 猛 名
    'A': {1: 0.06, 2: 0.07, 3: 0.08, 4: 0.10},
    'B': {1: 0.08, 2: 0.10, 3: 0.12, 4: 0.15},
    'C': {1: 0.025, 2: 0.03, 3: 0.035, 4: 0.04},
    'D': {1: 0.05, 2: 0.06, 3: 0.08, 4: 0.10},
    'E': {1: 0.04, 2: 0.05, 3: 0.06, 4: 0.08},
    'F': {1: 0.06, 2: 0.07, 3: 0.08, 4: 0.10},
    'G': {1: 0.35, 2: 0.40, 3: 0.45, 4: 0.50},   # 伤害倍率（智力或武力 ×）
    'H': {1: 0.30, 2: 0.35, 3: 0.40, 4: 0.45},   # 每回合几率
}
CATN = {'A': '属性增益', 'B': '减伤', 'C': '回血', 'D': '开局护盾', 'E': '发动率', 'F': '敌方减益', 'G': '每回合施压', 'H': '每回合净化'}

def build(cat, q, stat, r):
    """按类别造 fx 与时限。返回 (fx, from, every, rate, 描述用的 val)"""
    v = V[cat][q]
    if cat == 'A': return [{'k': 'buff', 'tg': 'mates', 'stat': stat, 'pct': v, 'dur': 3}], 0, False, None, v
    if cat == 'B': return [{'k': 'status', 'tg': 'mates', 'st': 'guard', 'val': v, 'dur': 3}], 0, False, None, v
    if cat == 'C': return [{'k': 'status', 'tg': 'mates', 'st': 'regen', 'val': v, 'dur': 3}], 2, False, None, v
    if cat == 'D': return [{'k': 'shield', 'tg': 'mates', 'pct': v}], 0, False, None, v
    if cat == 'E': return [{'k': 'status', 'tg': 'mates', 'st': 'rate', 'val': v, 'dur': 3}], 0, False, None, v
    if cat == 'F':
        st = 'int' if r == 'wen' else 'atk'
        return [{'k': 'debuff', 'tg': 'all', 'stat': st, 'pct': v, 'dur': 3}], 0, False, None, v
    if cat == 'G':
        src = 'int' if r == 'wen' else 'atk'
        return [{'k': 'dmg', 'tg': 'rand2', 'mult': v, 'src': src}], 0, True, 0.5, v
    if cat == 'H': return [{'k': 'cleanse', 'tg': 'mates'}], 0, True, v, v

if __name__ == '__main__':
    rows = []
    for sid, s in SK.items():
        if s.get('cat') != 'cmd': continue
        fx = s.get('fx', [])
        if not any(f.get('k') == 'buff' for f in fx): continue
        us = users.get(sid, [])
        if not us or any(H[h].get('q', 0) >= 5 for h, _ in us): continue
        hid = us[0][0]; t = H[hid]; q = max(1, min(4, t.get('q', 2))); r = role(t)
        name = s['name']
        cat = None
        for c, pat in KEYS:
            if re.search(pat, name): cat = c; break
        if not cat: cat = 'E' if r == 'wen' else 'A'
        old = fx[0]
        stat = old.get('stat', 'atk')
        nfx, frm, every, rate, v = build(cat, q, stat, r)
        rows.append({'sid': sid, 'hero': t['name'], 'q': q, 'role': r, 'slot': us[0][1], 'name': name, 'cat': cat,
                     'old': f"{ {'atk':'武','def':'防','int':'智','agi':'捷'}[stat] }+{round(old.get('pct',0)*100)}%",
                     'stat': stat, 'val': v, 'from': frm, 'every': int(every), 'rate': rate if rate is not None else ''})

    cols = ['sid', 'hero', 'q', 'role', 'slot', 'name', 'cat', 'old', 'stat', 'val', 'from', 'every', 'rate']
    with open(os.path.join(ROOT, 'cmd_v107.tsv'), 'w', encoding='utf-8') as f:
        f.write('\t'.join(cols) + '\n')
        for r in rows: f.write('\t'.join(str(r[c]) for c in cols) + '\n')

    SN = {'atk': '武', 'def': '防', 'int': '智', 'agi': '捷'}
    def newtxt(r):
        c, v = r['cat'], r['val']
        if c == 'A': return f"我方全体{SN[r['stat']]} +{round(v*100)}%，3 回合"
        if c == 'B': return f"我方全体减伤 {round(v*100)}%，3 回合"
        if c == 'C': return f"第 2 回合起，我方全体每回合回血 {round(v*1000)/10}%，3 回合"
        if c == 'D': return f"开局我方全体护盾 {round(v*100)}% 最大生命"
        if c == 'E': return f"我方全体主动技发动率 +{round(v*100)}%，3 回合"
        if c == 'F': return f"敌方全体{'智' if r['role']=='wen' else '武'} −{round(v*100)}%，3 回合"
        if c == 'G': return f"每回合开始 50% 几率：对随机两名敌人造成{'智力' if r['role']=='wen' else '武力'} {round(v*100)}% 伤害"
        if c == 'H': return f"每回合开始 {round(v*100)}% 几率：解除我方全体负面状态"
    QN = {1: '凡', 2: '良', 3: '猛', 4: '名'}
    RN = {'wu': '武', 'wen': '文', 'mix': '双全'}
    out = ['# 指挥技对照表 V10.7（待审）', '',
           f'规则生成的属性增益指挥技 {len(rows)} 条（使用者全是名将及以下），按名字关键词重分八类。天罡绝世手写的没动。',
           '数值按品阶递增（凡→名）：增益 6–10%、减伤 8–15%、回血 2.5–4%/回合、护盾 5–10%、发动率 4–8%、减益 6–10%、施压伤害 35–50%、净化几率 30–45%。',
           '分类不合适的直接说「某某改成 X 类」。', '']
    cnt = collections.Counter(r['cat'] for r in rows)
    out.append('| 类 | 条数 |'); out.append('|---|---|')
    for c in 'ABCDEFGH': out.append(f'| {c} {CATN[c]} | {cnt[c]} |')
    out.append('')
    for c in 'ABCDEFGH':
        rs = sorted([r for r in rows if r['cat'] == c], key=lambda r: (-r['q'], r['hero']))
        if not rs: continue
        out.append(f'## {c} {CATN[c]}（{len(rs)}）'); out.append('')
        out.append('| 人 | 品阶 | 第几招 | 技能 | 现在 | 改后 |'); out.append('|---|---|---|---|---|---|')
        for r in rs: out.append(f"| {r['hero']}（{RN[r['role']]}） | {QN[r['q']]} | {r['slot']} | {r['name']} | {r['old']} | {newtxt(r)} |")
        out.append('')
    # 手写指挥技润色建议
    out += ['## 天罡绝世手写指挥技：建议加时限的几条（不点头不动）', '',
            '| 人 | 技能 | 现在 | 建议 |', '|---|---|---|---|']
    SUG = [('吴用', '运筹帷幄', '全体智 +22%、武 +10%，3 回合', '不变；另加：每回合开始 40% 几率全体振奋（发动率 +8%，1 回合）'),
           ('宋江', '领袖魅力', '全体防 +15%、武 +10%，3 回合', '改成：全体减伤 12%（3 回合）；第 2 回合起全体每回合回血 3%（3 回合）'),
           ('公孙胜', '天罡道法', '全体智 +20%，3 回合', '不变；另加：每回合开始 35% 几率净化全体'),
           ('岳飞', '精忠报国', '全体武 +12%、防 +10%，3 回合', '改成：全体武 +12%（3 回合）+ 全体减伤 10%（3 回合）'),
           ('张叔夜', '一代名臣', '全体智 +16%、武 +10%，3 回合', '改成第 3 回合开始时发动（后发制人），数值抬到智 +20%、武 +12%')]
    for a, b_, c_, d_ in SUG: out.append(f'| {a} | {b_} | {c_} | {d_} |')
    out.append('')
    open(os.path.join(ROOT, '..', '指挥技对照表_V10.7.md'), 'w', encoding='utf-8').write('\n'.join(out))
    print(len(rows), dict(cnt))
