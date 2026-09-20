#!/usr/bin/env python3
"""
水浒群星录 · 阶段 5 尾声：中后期支线与 Boss 补足人数

  python3 rebalance_lateflank.py data/gameData_v10.json

调参器把强度系数封在 6 倍（再往上数值荒唐且脆如薄纸）之后，
有十四关卡在「已经顶到 6 倍还是百分百胜」——它们清一色只有 7 个敌人，
而玩家是 9 个。人数差摆在那里，系数再高也补不回行动数的差距。

这里把第 10 章起的支线 / Boss / 隐藏关补到 9 人，补位取同章名将
（不够就向前后两章借），杂兵不超过四分之一。
"""
import json, re, sys, collections

PATH = sys.argv[1] if len(sys.argv) > 1 else 'gameData_v10.json'
D = json.load(open(PATH, encoding='utf-8'))
H, ST = D['heroes'], D['stages']
MINION = [k for k, v in H.items() if v.get('src') == '杂兵']
START = {'shi_jin', 'zhu_wu'}

def kind(sid):
    s = ST[sid]
    if s.get('hidden'):  return 'hidden'
    if s.get('is_boss'): return 'boss'
    return 'side' if re.search(r'_f\d+$', sid) else 'normal'

by_ch = collections.defaultdict(list)
for sid in ST: by_ch[ST[sid].get('ch') or 0].append(sid)

pool_ch = {}
for ch, lst in by_ch.items():
    seen = []
    for sid in lst:
        for e in (ST[sid].get('enemies') or []):
            if e in H and H[e].get('src') != '杂兵' and e not in START and e not in seen:
                seen.append(e)
    pool_ch[ch] = seen

def named(ch):
    out = list(pool_ch.get(ch) or [])
    weak = lambda l: (not l) or (sum(H[h]['q'] for h in l) / len(l) < 3)
    for d in (1, 2):
        if not weak(out): break
        for c2 in (ch - d, ch + d):
            out += [h for h in (pool_ch.get(c2) or []) if h not in out]
    return sorted(out, key=lambda h: -H[h]['q'])

TARGET = 9
changed = []
for ch in sorted(by_ch):
    if ch < 10: continue
    pool = named(ch)
    for sid in by_ch[ch]:
        k = kind(sid)
        if k == 'normal': continue
        cur = list(ST[sid].get('enemies') or [])
        if len(cur) >= TARGET: continue
        before = len(cur)
        i = 0
        while len(cur) < TARGET and pool:
            cur.append(pool[i % len(pool)]); i += 1
        while len(cur) < TARGET:
            cur.append(MINION[len(cur) % len(MINION)])
        # 杂兵不超过四分之一
        nm = [e for e in cur if H[e].get('src') == '杂兵']
        if len(nm) > TARGET // 4 and pool:
            keep = [e for e in cur if H[e].get('src') != '杂兵']
            j = 0
            while len(keep) < TARGET - TARGET // 4:
                keep.append(pool[j % len(pool)]); j += 1
            keep += nm[:TARGET - len(keep)]
            cur = keep[:TARGET]
        ST[sid]['enemies'] = cur[:TARGET]
        changed.append(f'{sid} {ST[sid]["name"][:12]} {k} {before}→{len(cur)}')

print('阶段 5 尾声 · 中后期人数补足')
print('=' * 58)
print(f'补足 {len(changed)} 关')
for c in changed[:18]: print('  ' + c)
if len(changed) > 18: print(f'  …… 其余 {len(changed)-18} 关')
cnt = collections.Counter(len(s.get('enemies') or []) for s in ST.values())
print('人数分布：' + '　'.join(f'{n}人×{cnt[n]}' for n in sorted(cnt)))
dang = [e for s in ST.values() for e in (s.get('enemies') or []) if e not in H]
print(f'悬空敌人 {len(dang)}')

json.dump(D, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'已写回 {PATH}')
