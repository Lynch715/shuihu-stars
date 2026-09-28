#!/usr/bin/env python3
"""
V10.8.5 数据勘误（审计发现），重复跑不出事：

  1. 36 个支线关的 boss 字段是编码丢失的乱码（'____25' 之类）→ 改成该关敌阵首位的人。
     引擎和界面目前都不读这个字段，只是把脏数据洗干净。
  2. 羁绊「桃花山」只有两人，档位却写 [2,2,3]：第三档永远达不成，头两档门槛重复。
     改成一档 need 2 / rate 0.7 —— 和现在两人凑齐时实际拿到的一样，数值不变。
  3. 难易 diff：四个秘藏关误填了等级（42/44/46/50），界面本来就截到最高档「七」，改成 7；
     第 27 章主线 ch25_1 … ch25_boss 标的 1–3 是开篇关的旧值，前后章主线都是 5，改成 5。
     diff 只用于关卡列表上的「难易」字样，不进战斗数值。
"""
import json, os, re

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gameData_v10.json')
D = json.load(open(PATH, encoding='utf-8'))
st = D['stages']
n = {'boss': 0, 'bond': 0, 'diff': 0}

for sid, s in st.items():
    b = s.get('boss')
    if isinstance(b, str) and re.fullmatch(r'_+\d*', b) and s.get('enemies'):
        e = s['enemies'][0]
        s['boss'] = e if isinstance(e, str) else (e.get('hid') or e.get('id'))
        n['boss'] += 1

for bd in D['bonds'] if isinstance(D['bonds'], list) else D['bonds'].values():
    if bd.get('id') == 'bond_12' and len(bd['members']) == 2 and len(bd['tiers']) == 3:
        bd['tiers'] = [{'need': 2, 'rate': 0.7}]
        n['bond'] += 1

for sid, s in st.items():
    if s.get('diff', 0) > 7:
        s['diff'] = 7; n['diff'] += 1
    elif s.get('ch') == 27 and re.fullmatch(r'ch25_(\d+|boss)', sid) and s.get('diff', 5) < 5:
        s['diff'] = 5; n['diff'] += 1

json.dump(D, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=None, separators=(',', ':'))
print(f"boss 字段 {n['boss']} 关　羁绊档位 {n['bond']} 条　难易 {n['diff']} 关")
