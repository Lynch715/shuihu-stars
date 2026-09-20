#!/usr/bin/env python3
"""
水浒群星录 · 阶段 5 养成节奏（数据侧）

  python3 rebalance_growth.py data/gameData_v10.json

三件事：

  1  首通奖励里的杂兵换成该章真正的角色。
     原始数据里第 1 章四关首通给的是「小喽啰、悍匪、朱武、史进」——
     后两个是起手角色（转碎片），等于整章只新增两个杂兵。

  2  装备掉落按章节限品质。
     原来是「从全部 216 件里按槽位随机」，第 1 关就可能掉绝世装备。

  3  first_reward 里的 silver / exp_book 删掉。
     经验与银两改由引擎按推荐等级与关卡类型统一计算（见 CFG.stageExp / firstExp /
     firstSilver），数据里不再各写各的 —— 原来 259900 银两分布毫无规律，
     单关最高一万，而十连才 4500。
"""
import json, re, sys, collections

PATH = sys.argv[1] if len(sys.argv) > 1 else 'gameData_v10.json'
D = json.load(open(PATH, encoding='utf-8'))
H, ST, EQ = D['heroes'], D['stages'], D['equipment']

print('阶段 5 养成节奏 · 数据侧')
print('=' * 62)

# ── 1  首通奖励里的杂兵 ──────────────────────────────────────
FIX = {
    'ch1_1':    'chen_da',      # 史家村学艺 —— 少华山三兄弟之一
    'ch1_2':    'yang_chun',    # 少华山初会
    'ch6_1':    'hu_yanzhuo',   # 呼延灼来袭
    'ch6_boss': 'xu_ning',      # 徐宁破阵
}
minion = [(sid, (s.get('first_reward') or {}).get('hero'))
          for sid, s in ST.items()
          if (s.get('first_reward') or {}).get('hero') in H
          and H[(s.get('first_reward') or {}).get('hero')].get('src') == '杂兵']
for sid, old in minion:
    new = FIX.get(sid)
    if not new:
        print(f'!! {sid} 首通给杂兵 {H[old]["name"]}，但没有指定替换'); continue
    ST[sid].setdefault('first_reward', {})['hero'] = new
    print(f'[1] {sid} {ST[sid]["name"]:<14} 首通 {H[old]["name"]} → {H[new]["name"]}')
print(f'    杂兵首通共 {len(minion)} 处')

# 掉落里的杂兵（现在是 0 处，留着防回归）
n_md = 0
for sid, s in ST.items():
    keep = []
    for d in (s.get('drops') or []):
        if d.get('t') == 'hero' and H.get(d.get('id'), {}).get('src') == '杂兵':
            n_md += 1; continue
        keep.append(d)
    if s.get('drops') is not None: s['drops'] = keep
print(f'    掉落里的杂兵剔除 {n_md} 条')

# ── 2  装备掉落限品质 ────────────────────────────────────────
QMAP = {'凡': 1, '良': 2, '猛': 3, '名': 4, '天罡': 5, '绝世': 6}
def qof(e):
    q = e.get('q')
    return q if isinstance(q, int) else QMAP.get(q, 2)
def slot_of(e):
    s = e.get('slot') or 'special'
    return 'helmet' if s == 'helm' else s

def cap_by_ch(ch):
    """第 1–4 章凡良，5–9 章到猛，10–15 到名，16–23 到天罡，24 章起绝世"""
    return 2 if ch <= 4 else 3 if ch <= 9 else 4 if ch <= 15 else 5 if ch <= 23 else 6

pool = collections.defaultdict(list)
for eid, e in EQ.items():
    if e.get('exclusive') or e.get('bond'): continue
    pool[(slot_of(e), qof(e))].append(eid)

gated = 0
for sid, s in ST.items():
    ch = s.get('ch') or 1
    cap = cap_by_ch(ch)
    for d in (s.get('drops') or []):
        if d.get('t') != 'equip': continue
        slot = 'helmet' if d.get('slot') == 'helm' else (d.get('slot') or 'special')
        d['slot'] = slot
        d['qmax'] = cap
        d['qmin'] = max(1, cap - 1)          # 掉落至少是上一档，别一直掉凡品
        gated += 1
n_pool = {k: len(v) for k, v in sorted(pool.items())}
print(f'\n[2] 装备掉落加品质区间 {gated} 条　章节上限 1–4章:良　5–9:猛　10–15:名　16–23:天罡　24+:绝世')
short = [k for k in [(sl, q) for sl in ['weapon','armor','helmet','mount','special'] for q in range(1,7)]
         if not pool.get(k)]
if short: print('    ！这些槽位·品质组合没有可掉的装备：', short)

# ── 3  首通的银两与经验书交给引擎 ─────────────────────────────
n_s = n_b = 0
for s in ST.values():
    fr = s.get('first_reward')
    if not fr: continue
    if 'silver' in fr:   del fr['silver'];   n_s += 1
    if 'exp_book' in fr: del fr['exp_book']; n_b += 1
    for k in list(fr):
        if k not in ('hero',): del fr[k]
n_r = 0
for s in ST.values():
    if 'reward' in s: del s['reward']; n_r += 1
print(f'\n[3] 清掉 first_reward.silver {n_s} 处、exp_book {n_b} 处、stage.reward {n_r} 处')
print('    经验与银两改由 CFG.stageExp / firstExp / firstSilver 按推荐等级统一算')

# ── 4  校验 ─────────────────────────────────────────────────
bad = [sid for sid, s in ST.items()
       if (s.get('first_reward') or {}).get('hero')
       and H.get((s.get('first_reward') or {}).get('hero'), {}).get('src') == '杂兵']
uniq = {}
for sid, s in sorted(ST.items()):
    h = (s.get('first_reward') or {}).get('hero')
    if h: uniq.setdefault(h, []).append(sid)
print(f'\n[4] 校验：首通仍给杂兵 {len(bad)} 关　首通角色去重后 {len(uniq)} 人 / 共 {sum(len(v) for v in uniq.values())} 关')
dup = sorted(((len(v), H[k]['name']) for k, v in uniq.items()), reverse=True)[:5]
print('    重复最多：' + '　'.join(f'{n}×{nm}' for n, nm in dup))

json.dump(D, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'\n已写回 {PATH}')
