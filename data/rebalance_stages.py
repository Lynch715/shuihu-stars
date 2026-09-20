#!/usr/bin/env python3
"""
水浒群星录 · 阶段 3a 关卡结构重排

  python3 rebalance_stages.py data/gameData_v10.json

原始数据里 rec_lv 从第 3 章起就摸到 50 级上限，之后二十多章全挤在 42–50，
ch25 甚至有一关写着 5 级 —— 等级承载不了 31 章的进度。这里做两件事：

  1  rec_lv 重排成跨 31 章的单调曲线（3 → 50），章内按关序递增；
     隐藏关额外 +6，表示「回头再打」。
  2  敌方人数补齐：普通关 ≥5、支线 ≥6、Boss ≥8、隐藏 =9。
     补位优先取同章其他关卡出现过的同阵营角色，不够才用杂兵。

真正的难度旋钮是 enemy_mul，由 tune_difficulty.js 模拟反推，这里不碰。
"""
import json, re, sys, collections

PATH = sys.argv[1] if len(sys.argv) > 1 else 'gameData_v10.json'
D = json.load(open(PATH, encoding='utf-8'))
H, ST = D['heroes'], D['stages']
MINION = [k for k, v in H.items() if v.get('src') == '杂兵']
# 玩家起手阵容不得被补位成敌人（否则第 1 关就在打自己人）
START_HEROES = {'shi_jin', 'zhu_wu'}

def stage_key(sid):
    m = re.match(r'^(?:ch|hidden_)(\d+)_(\w+)$', sid)
    if not m: return (999, 9, 0)
    ch, rest = int(m.group(1)), m.group(2)
    if rest.isdigit():      return (ch, 0, int(rest))
    if rest == 'boss':      return (ch, 1, 0)
    if rest.startswith('f'):return (ch, 2, int(rest[1:] or 0))
    return (ch, 3, 0)

def kind(sid):
    s = ST[sid]
    if s.get('hidden'):  return 'hidden'
    if s.get('is_boss'): return 'boss'
    if re.search(r'_f\d+$', sid): return 'side'
    return 'normal'

by_ch = collections.defaultdict(list)
for sid in ST: by_ch[ST[sid].get('ch') or 0].append(sid)
for ch in by_ch: by_ch[ch].sort(key=stage_key)
chapters = sorted(by_ch)

print('阶段 3a 关卡结构重排')
print('=' * 62)

# ── 1  rec_lv 单调曲线 ───────────────────────────────────────
LO, HI = 3, 50
n_ch = len(chapters)
changed_lv = 0
for i, ch in enumerate(chapters):
    base = LO + (HI - LO) * i / max(1, n_ch - 1)
    lst = by_ch[ch]
    span = max(1, len(lst) - 1)
    for j, sid in enumerate(lst):
        lv = base + (HI - LO) / max(1, n_ch - 1) * (j / span) * 0.9
        lv = int(round(lv))
        if kind(sid) == 'hidden': lv = min(HI, lv + 6)
        lv = max(1, min(HI, lv))
        old = (ST[sid].get('rec_lv') or [1, 5])[1]
        ST[sid]['rec_lv'] = [max(1, lv - 3), lv]
        if old != lv: changed_lv += 1

print(f'[1] rec_lv 重排 {changed_lv} 关')
prev = 0; ok = True
for ch in chapters:
    main = [s for s in by_ch[ch] if kind(s) != 'hidden']   # 隐藏关有意 +6，不参与
    if not main: continue
    mx = max(ST[s]['rec_lv'][1] for s in main)
    mn = min(ST[s]['rec_lv'][1] for s in main)
    if mn < prev: ok = False
    prev = mx
print(f'    单调性校验（不含隐藏关）：{"通过" if ok else "仍有回落"}')
print('    抽样：' + '　'.join(
    f'ch{ch}={min(ST[s]["rec_lv"][1] for s in by_ch[ch])}–{max(ST[s]["rec_lv"][1] for s in by_ch[ch])}'
    for ch in chapters[::6]))

# ── 2  敌方人数补齐 ──────────────────────────────────────────
NEED = {'normal': 5, 'side': 6, 'boss': 8, 'hidden': 9}
# 早期章节玩家只有两三个人，9 个敌人光靠行动数就碾死玩家，
# 所以敌方人数也要跟着阵容规模走。
def cap_by_ch(ch): return min(9, 3 + ch)
# 同章出现过的非杂兵角色，作为补位池
pool_ch = {}
for ch in chapters:
    seen = []
    for sid in by_ch[ch]:
        for e in (ST[sid].get('enemies') or []):
            if (e in H and H[e].get('src') != '杂兵'
                    and e not in START_HEROES and e not in seen):
                seen.append(e)
    pool_ch[ch] = seen

padded, detail = 0, []
for ch in chapters:
    for sid in by_ch[ch]:
        k = kind(sid)
        cap = cap_by_ch(ch)
        need = min(NEED[k], cap)
        cur = list(ST[sid].get('enemies') or [])
        if len(cur) > cap:                       # 超出上限先裁掉（保留前排名将）
            cur.sort(key=lambda e: (H[e].get('src') == '杂兵'))
            ST[sid]['enemies'] = cur[:cap]
            cur = list(ST[sid]['enemies'])
        if len(cur) >= need: continue
        before = len(cur)
        # 先补同章同阵营名将
        for cand in pool_ch[ch]:
            if len(cur) >= need: break
            if cand not in cur: cur.append(cand)
        # 还不够用杂兵轮换
        mi = 0
        while len(cur) < need:
            cur.append(MINION[mi % len(MINION)]); mi += 1
        ST[sid]['enemies'] = cur[:cap]
        padded += 1
        detail.append(f'{sid} {ST[sid]["name"]} {before}→{len(ST[sid]["enemies"])}')

print(f'\n[2] 敌方人数补齐 {padded} 关')
for d in detail[:14]: print('    ' + d)
if len(detail) > 14: print(f'    …… 其余 {len(detail)-14} 关')

# ── 2b  Boss 关不许是一群杂兵 ────────────────────────────────
# 原始数据里 ch6_boss 是 9 个小喽啰、ch12_boss 是 1 名将带 7 杂兵。
# 这种阵容无论强度系数调到多高都拉不动，因为底子是 q=1。
upgraded, up_detail = 0, []
def named_pool(ch):
    '''同章名将；本章为空或整体偏弱（均品质 <3）时向前后各两章借。'''
    out = list(pool_ch.get(ch) or [])
    def weak(lst):
        return (not lst) or (sum(H[h]['q'] for h in lst) / len(lst) < 3)
    for d in (1, 2):
        if not weak(out): break
        for c2 in (ch - d, ch + d):
            out += [h for h in (pool_ch.get(c2) or []) if h not in out]
    return out

for ch in chapters:
    named = named_pool(ch)
    named.sort(key=lambda h: -H[h]['q'])
    for sid in by_ch[ch]:
        if kind(sid) not in ('boss', 'hidden'): continue
        cur = list(ST[sid]['enemies'])
        n_min = len([e for e in cur if H[e].get('src') == '杂兵'])
        cap = len(cur) // 4                      # 杂兵上限：四分之一
        if n_min <= cap or not named: continue
        before = f'{len(cur)-n_min}名将+{n_min}杂兵'
        out_list, used_min = [], 0
        for e in cur:
            if H[e].get('src') != '杂兵': out_list.append(e)
        # 先补同章名将（可重复，视作精锐卫队），再留少量杂兵
        i = 0
        while len(out_list) < len(cur) - cap:
            out_list.append(named[i % len(named)]); i += 1
        while len(out_list) < len(cur):
            out_list.append([e for e in cur if H[e].get('src') == '杂兵'][used_min % max(1, n_min)])
            used_min += 1
        ST[sid]['enemies'] = out_list[:len(cur)]
        upgraded += 1
        after = f'{len([e for e in ST[sid]["enemies"] if H[e].get("src") != "杂兵"])}名将+' \
                f'{len([e for e in ST[sid]["enemies"] if H[e].get("src") == "杂兵"])}杂兵'
        up_detail.append(f'{sid} {ST[sid]["name"]} {before} → {after}')

print(f'\n[2b] Boss/隐藏关阵容升级 {upgraded} 关')
for d in up_detail[:12]: print('    ' + d)
if len(up_detail) > 12: print(f'    …… 其余 {len(up_detail)-12} 关')

c = collections.Counter(len(s.get('enemies') or []) for s in ST.values())
print('    人数分布：' + '　'.join(f'{n}人×{c[n]}' for n in sorted(c)))

# ── 3  校验 ─────────────────────────────────────────────────
dang = [f'{sid}:{e}' for sid, s in ST.items() for e in (s.get('enemies') or []) if e not in H]
print(f'\n[3] 校验：悬空敌人 {len(dang)}　人数区间 {min(c)}–{max(c)}')

json.dump(D, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'\n已写回 {PATH}')
