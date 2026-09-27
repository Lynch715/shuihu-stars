#!/usr/bin/env python3
"""V10.7.1 · 专属与 Boss 关对应（Lynch 定按建议做）。可重跑。
  1. 升过档的文官敌方快照按现在的品阶与面板重写（技能不动）
  2. 一周目 Boss / 支线关名单：把从不出场的专属主人放进合适的关
"""
import json, os
ROOT = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(ROOT, 'gameData_v10.json')
D = json.load(open(PATH, encoding='utf-8')); H, ST = D['heroes'], D['stages']
name2id = {t['name']: k for k, t in H.items()}

# 1. 快照
n = 0
for hid, t in H.items():
    f = t.get('foe')
    if not f: continue
    if f.get('q', t['q']) >= t['q']: continue          # 降档那四个（快照 6、本体 5）保持：Lynch 定当敌将仍按绝世
    # 只重写品阶和武防智捷；血量与成长沿用快照——敌方文官血要比武将薄（回归里有一条守着 1.5–3.5 倍）
    for k in ('q', 'atk', 'def', 'int', 'agi'):
        if k in t: f[k] = t[k]
    n += 1
print('敌方快照按本体重写', n, '人')

# 2. 名单。格式：关卡 → [(换掉谁/序号, 换成谁)]；'+' 表示追加
EDITS = {
    'ch1_boss':  [('+', '王进'), ('+', '朱武')],                       # 史进的师父、少华山军师
    'ch6_boss':  [('悍匪', '呼延灼'), ('毛贼', '徐宁')],               # 连环马之战：呼延灼、钩镰枪
    'ch7_boss':  [('小喽啰', '张清'), ('山贼', '龚旺')],               # 曾头市之后的东昌府
    'ch4_boss':  [('张顺#2', '武松'), ('李逵#3', '石秀')],
    'ch9_boss':  [('朱武', '秦明'), ('蒋敬', '董平')],
    'ch18_boss': [('陈希真#2', '真祥麟'), ('贺太平#2', '宗泽')],       # 雷将、官军统帅
    'ch23_boss': [('罗汝楫#2', '高宠')],
    'ch22_bossb': [('牛皋#2', '曹宁')],                                # 曹宁归宋就在朱仙镇
    'ch25_boss': [('小喽啰#1', '张天师')],                             # 洪太尉误走妖魔那一章
    'ch13_f1':   [('小喽啰', '罗真人')],                               # 法师对法师
}
def apply(sid, edits):
    st = ST[sid]; en = st['enemies']
    for who, new in edits:
        nid = name2id[new]
        if nid in en: continue
        if who == '+': en.append(nid); continue
        nm, _, idx = who.partition('#'); idx = int(idx or 1)
        hid = name2id[nm]
        pos = [i for i, e in enumerate(en) if e == hid]
        if len(pos) < idx: print('  找不到', sid, who); continue
        en[pos[idx - 1]] = nid
    print(' ', sid, st['name'], '→', ' '.join(H[e]['name'] for e in en))
for sid, ed in EDITS.items(): apply(sid, ed)
# 3. 换人之后三关变难，按参考队胜率重校（test/bosscheck.js --only=... --mul=...）：史文恭 2.0→1.6、荡平梁山 2.78→1.9、风波亭 2.64→1.65
for sid, m in [('ch7_boss', 1.6), ('ch18_boss', 1.9), ('ch23_boss', 1.65)]: ST[sid]['enemy_mul'] = m
json.dump(D, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
