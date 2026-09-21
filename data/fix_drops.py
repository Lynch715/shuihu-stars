#!/usr/bin/env python3
"""
水浒群星录 · 掉落表清理

  python3 data/fix_drops.py data/gameData_v10.json

背包里的「杂物」一件都用不上 —— G.items 在代码里只有写入、没有消耗路径。
一周目打完会攒下二十个黄金、十二片万能碎片、三本兵法，全是摆设。

这一遍做两件事：
  一、钥匙、技能书、羁绊信物从掉落表里拿掉。这三类背后的系统从来没接上 ——
      隐藏关现在靠 req_stage 解锁（key3 key4 指向的关卡压根不存在），
      技能威力没有攻/防/特效的分类，羁绊早就改成按队伍成员算了。
      按品阶换成同档的有用东西。
  二、银两和黄金留在掉落表里，但结算那头改成直接进钱包（见 engine.js）。
"""
import json, sys

PATH = sys.argv[1] if len(sys.argv) > 1 else 'data/gameData_v10.json'
D = json.load(open(PATH, encoding='utf-8'))
S, I = D['stages'], D['items']

# 按章深浅换：前期给小的，后期给大的
def swap(iid, ch):
    t = I.get(iid, {}).get('type')
    if t == 'key':        return 'frag2' if ch >= 12 else 'frag'
    if t == 'skill_book': return ('exp5' if ch >= 20 else 'exp3') if iid in ('sb4','sb5','sb6') else \
                                 ('exp3' if ch >= 12 else 'exp2')
    if t == 'bond_item':  return 'heal2' if ch >= 12 else 'heal1'
    return None

n = 0
log = {}
for sid, st in S.items():
    ch = st.get('ch', 1)
    for d in st.get('drops', []):
        if d.get('t') != 'con': continue
        new = swap(d.get('id'), ch)
        if new:
            log[(I[d['id']]['name'], I[new]['name'])] = log.get((I[d['id']]['name'], I[new]['name']), 0) + 1
            d['id'] = new; n += 1

print('掉落替换：')
for (a, b), k in sorted(log.items(), key=lambda x: -x[1]):
    print(f'  {a:<14} → {b:<12} ×{k}')
print(f'  共 {n} 处\n')

from collections import defaultdict
exp = defaultdict(float); cnt = defaultdict(int)
for st in S.values():
    for d in st.get('drops', []):
        if d.get('t') == 'con':
            exp[d['id']] += d.get('rate', 0) * (d.get('v') or 1); cnt[d['id']] += 1
print('清理后，一周目每关打一遍的期望收获：')
for k in sorted(exp, key=lambda x: -exp[x]):
    print(f'  {I[k]["name"]:<12}{I[k]["type"]:<10}{cnt[k]:>4} 处{exp[k]:>7.1f} 个')

dead = [I[k]['name'] for k in I if I[k].get('type') in ('key', 'skill_book', 'bond_item')]
print(f'\n物品表里留着但不再掉落的：{len(dead)} 种 —— {"、".join(dead)}')
print('（先留在表里，哪天要做技能书或者羁绊信物，接上就能用）')

json.dump(D, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'\n已写回 {PATH}')
