#!/usr/bin/env python3
"""
水浒群星录 · 关卡文案写回

  python3 data/apply_copy.py data/gameData_v10.json

原来 103 关的对白是三句模板灌出来的：
  第一段按章复用，103 关只有 26 种正文；
  第二段套「此去{章节名}」，于是有了「此去荡寇志·起」这种句子；
  第三段和胜负白，103 关一字不差，胜利白里还漏着「梁山（岳家）」的括号注释。

现在 139 关各写各的，见 data/copy/part*.py。
"""
import importlib.util, json, sys, os

PATH = sys.argv[1] if len(sys.argv) > 1 else 'data/gameData_v10.json'
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'copy')

T = {}
for n in ('part1', 'part2', 'part3', 'part4'):
    spec = importlib.util.spec_from_file_location(n, os.path.join(HERE, n + '.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    for k in m.T:
        if k in T: raise SystemExit(f'关卡 {k} 写了两遍')
    T.update(m.T)

D = json.load(open(PATH, encoding='utf-8'))
ids = set(D['stages'])
miss, extra = ids - set(T), set(T) - ids
if miss:  raise SystemExit('这些关没写：' + '　'.join(sorted(miss)))
if extra: raise SystemExit('这些关不存在：' + '　'.join(sorted(extra)))

D['dialogs'] = {k: {'before': [T[k][0], T[k][1]],
                    'after_win': T[k][2], 'after_lose': T[k][3]}
                for k in sorted(T)}

# 自检：任何一段都不许有两关撞车，模板句更不许再出现
from collections import Counter
for field, get in (('关前第一段', lambda v: v['before'][0]),
                   ('关前第二段', lambda v: v['before'][1]),
                   ('胜',         lambda v: v['after_win']),
                   ('负',         lambda v: v['after_lose'])):
    c = Counter(get(v) for v in D['dialogs'].values())
    dup = [(t, n) for t, n in c.most_common() if n > 1]
    print(f'{field}：{len(c)} 种 / {len(D["dialogs"])} 关' + (f'，撞车 {len(dup)} 处' if dup else '，无撞车'))
    for t, n in dup[:5]: print(f'    ×{n}  {t[:40]}')

for bad in ('此去', '（岳家）', '战鼓催征', '正是英雄用武之时'):
    n = sum(1 for v in D['dialogs'].values() if bad in json.dumps(v, ensure_ascii=False))
    print(f'残留「{bad}」：{n}')

json.dump(D, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'\n已写回 {PATH}　共 {len(T)} 关')
