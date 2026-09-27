#!/usr/bin/env python3
"""V10.7 · 按 cmd_v107.tsv 重写规则生成的指挥技；顺带按拍板改几条手写的。可重跑。
  python3 data/fix_v107_cmd.py [--hand]   加 --hand 才动手写的五条（Lynch 点头后）"""
import json, csv, os, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(ROOT, 'gameData_v10.json')
D = json.load(open(PATH, encoding='utf-8')); SK, H = D['skills'], D['heroes']
sys.path.insert(0, ROOT)
from cmd_v107_map import build   # 同一套模板，避免两边写岔
n = 0
for r in csv.DictReader(open(os.path.join(ROOT, 'cmd_v107.tsv'), encoding='utf-8'), delimiter='\t'):
    s = SK.get(r['sid'])
    if not s: continue
    fx, frm, every, rate, v = build(r['cat'], int(r['q']), r['stat'], r['role'])
    s['fx'] = fx
    for k in ('from', 'every', 'rate'): s.pop(k, None)
    if frm: s['from'] = frm
    if every: s['every'] = True; s['rate'] = rate
    s['_v107'] = r['cat']
    n += 1
print(f'指挥技重写 {n} 条')

if '--hand' in sys.argv:
    def find(nm, sk):
        h = next(v for v in H.values() if v['name'] == nm)
        return next(SK[x] for x in h['sk'] if SK[x]['name'] == sk)
    s = find('吴用', '运筹帷幄');
    # 不变；另加一条每回合振奋的指挥技需要第二个技能位，这里合并进同一条：开局增益 + every 振奋做不到同条，改为增益里附带振奋 3 回合
    s['fx'] = [{'k': 'buff', 'tg': 'mates', 'stat': 'int', 'pct': 0.22, 'dur': 3}, {'k': 'buff', 'tg': 'mates', 'stat': 'atk', 'pct': 0.10, 'dur': 3},
               {'k': 'status', 'tg': 'mates', 'st': 'rate', 'val': 0.08, 'dur': 3}]
    s = find('宋江', '领袖魅力'); s['fx'] = [{'k': 'status', 'tg': 'mates', 'st': 'guard', 'val': 0.12, 'dur': 3}, {'k': 'status', 'tg': 'mates', 'st': 'regen', 'val': 0.03, 'dur': 3}]
    s = find('公孙胜', '天罡道法'); s['fx'] = [{'k': 'buff', 'tg': 'mates', 'stat': 'int', 'pct': 0.20, 'dur': 3}, {'k': 'cleanse', 'tg': 'mates'}]
    s = find('岳飞', '精忠报国'); s['fx'] = [{'k': 'buff', 'tg': 'mates', 'stat': 'atk', 'pct': 0.12, 'dur': 3}, {'k': 'status', 'tg': 'mates', 'st': 'guard', 'val': 0.10, 'dur': 3}]
    s = find('张叔夜', '一代名臣'); s['fx'] = [{'k': 'buff', 'tg': 'mates', 'stat': 'int', 'pct': 0.20, 'dur': 3}, {'k': 'buff', 'tg': 'mates', 'stat': 'atk', 'pct': 0.12, 'dur': 3}]; s['from'] = 3
    print('手写五条已改')
json.dump(D, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
