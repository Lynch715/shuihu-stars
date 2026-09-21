# -*- coding: utf-8 -*-
"""按 req_stage 链序导出《关卡一览.md》。章号变了就重跑一次，别手写。"""
import json, re

d = json.load(open('data/gameData_v10.json', encoding='utf-8'))
S, D, C = d['stages'], d['dialogs'], d['story']['chapters']

nxt, roots = {}, []
for sid, s in S.items():
    r = s.get('req_stage')
    (nxt.setdefault(r, []).append(sid) if r else roots.append(sid))
order = []
def walk(sid):
    while True:
        order.append(sid)
        k = nxt.get(sid, [])
        if not k: return
        if len(k) > 1:
            for x in k: walk(x)
            return
        sid = k[0]
for r in roots: walk(r)
assert len(order) == len(S)

def kind(sid, s):
    if s.get('hidden'): return '隐藏'
    if re.search(r'_f\d', sid): return '支线'
    return '章末' if s.get('is_boss') else '主线'

rows, cur = [], None
for s_id in order:
    s = S[s_id]
    head = ''
    if s['ch'] != cur:
        cur = s['ch']
        head = '**第%d章 %s**' % (cur, C[str(cur)]['title'])
    nm = re.sub(r'·Boss$', '', s['name']).lstrip('★')
    line = (D.get(s_id, {}).get('before') or [''])[0]
    rows.append('| %s | %s | %s | %d 级 | %d | %s |'
                % (head, nm, kind(s_id, s), s['rec_lv'][1], len(s['enemies']), line))

out = ['# 水浒群星录 · %d 关一览' % len(order), '',
       '按游戏里的推进顺序排。「剧情」一列是关前白的第一段。', '',
       '| 章 | 关卡 | 类型 | 推荐 | 敌 | 剧情 |', '|---|---|---|---|---|---|'] + rows
open('关卡一览.md', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('✓ 关卡一览.md　%d 关 / %d 章' % (len(order), len(C)))
