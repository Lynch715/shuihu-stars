#!/usr/bin/env python3
"""
水浒群星录 · V10.1 属性与碎片清理

  python3 data/fix_equip_stats.py data/gameData_v10.json

可以重复跑：每一步都先看数据是不是已经改过。

一、魅整个删掉
    战斗里魅只管暴击，加成顶天 7%，详情页又不显示，玩家看到的就是一个不知道干什么的字。
    · 武将身上的 cha 字段删掉（成长表 gr 里的也删）
    · 给魅加减的技能，改成加减捷（暴击挪到捷上了，见 engine.js critOf）
    · 装备上的魅：坐骑折成捷，别的折成智

二、装备上的死字段
    · sk（技能倍率，79 件）：引擎一行没读过。智现在就是技能威力，折成等值的智
    · lead（统率，6 件）：同上，折成智
    · other_bonus（专属给非本人的加成）：删，非本人穿只拿面板

三、专属装备
    · 19 件「专属神兵」数据只有 bindName，没槽位没品阶，被当成「良」品宝物掉出来。
      补成天罡兵器，绑定本人，描述里写的加成落到 owner_bonus 上
    · 描述写着「某某专属」、绑的却是别人的，按描述改绑（丈八蛇矛写林冲，绑的卢俊义）
    · 一人只留一件：挑面板最好的那件，另外同名的删掉，不同名的降成普通装备进掉落池
    · 只有加成没有面板的 exc_ 系列：跟同名的有面板的那件合并；没有同名的，按同槽同品阶的
      普通装备取中位数补面板
    · 每件专属都写明 owner_bonus（武/防/智/捷/血/暴击/全属性）
    · 删掉的装备写进 equip_remap，读旧存档时换成留下来的那件

四、碎片与武将来源
    · 无主碎片（无名/英雄/天罡）取消，关卡掉的无名碎片改成掉兵符
    · 武将只能靠抽：关卡掉落里的武将、首通送的武将全部拿掉
"""
import json, re, sys, statistics
from collections import defaultdict

PATH = next((a for a in sys.argv[1:] if not a.startswith('--')), 'data/gameData_v10.json')
D = json.load(open(PATH, encoding='utf-8'))
H, SK, EQ, ST, IT = D['heroes'], D['skills'], D['equipment'], D['stages'], D['items']
Q = {'凡': 1, '良': 2, '猛': 3, '名': 4, '天罡': 5, '绝世': 6}
QN = {v: k for k, v in Q.items()}
rep = []
def say(s): rep.append(s); print(s)

def qnum(e):
    q = e.get('q')
    return q if isinstance(q, int) else Q.get(q, 2)
def ename(e): return e.get('n') or e.get('name') or ''
def owner(e): return e.get('exclusive') or e.get('bond')

# ── 一  魅 ────────────────────────────────────────────────────────────
n = 0
for h in H.values():
    if 'cha' in h: del h['cha']; n += 1
    if isinstance(h.get('gr'), dict) and 'cha' in h['gr']: del h['gr']['cha']
say(f'武将去掉魅：{n} 人')
n = 0
for s in SK.values():
    if s.get('stat') == 'cha': s['stat'] = 'agi'; n += 1
say(f'技能 魅→捷：{n} 个')

# ── 二  装备死字段 ────────────────────────────────────────────────────
# 技能倍率 sk 1.10 ≈ 智 +20：一件天罡宝物本来就给二十来点智，同一个量级
n1 = n2 = n3 = 0
for e in EQ.values():
    if e.get('cha'):
        k = 'agi' if e.get('slot') == 'mount' else 'int'
        e[k] = e.get(k, 0) + e.pop('cha'); n1 += 1
    elif 'cha' in e: del e['cha']
    if e.get('sk'):
        e['int'] = e.get('int', 0) + round((e.pop('sk') - 1) * 200); n2 += 1
    elif 'sk' in e: del e['sk']
    if e.get('lead'):
        e['int'] = e.get('int', 0) + e.pop('lead'); n3 += 1
    elif 'lead' in e: del e['lead']
    e.pop('other_bonus', None)
say(f'装备 魅→智/捷：{n1} 件；技能倍率→智：{n2} 件；统率→智：{n3} 件')

# ── 三  专属 ─────────────────────────────────────────────────────────
name2hid = {}
for hid, h in H.items():
    if h.get('src') == '杂兵': continue
    name2hid.setdefault(h['name'], hid)
names = sorted(name2hid, key=len, reverse=True)

def hero_in(text):
    for nm in names:
        if nm and nm in (text or ''): return name2hid[nm]
    return None

# 3.1 bindName 神兵
WT = {'棍': '棍', '刀': '刀', '锤': '锤', '枪': '枪', '斧': '斧', '剑': '剑', '弓': '弓', '角': '叉'}
n = 0
for eid, e in EQ.items():
    if not e.get('bindName'): continue
    hid = name2hid.get(e['bindName'])
    if not hid: say(f'  !! 神兵 {eid} 找不到 {e["bindName"]}'); continue
    ob = {}
    m = re.search(r'（(.*)）', e.get('desc', ''))
    for part in (m.group(1).split(',') if m else []):
        part = part.strip()
        mm = re.search(r'([^\s+：:]+)\+(\d+)%', part)
        if not mm: continue
        k, v = mm.group(1), int(mm.group(2)) / 100
        k = k.split('装备时：')[-1].split('装备时:')[-1]
        if k in ('atk', 'def', 'int', 'hp'): key = k
        elif k == 'agi': key = 'agi'
        elif k == '暴击': key = 'crit'; v = round(v / 2, 2)
        elif k == '全属性': key = 'all'
        elif k in ('技能伤害', '法术伤害', '妖法伤害'): key = 'int'
        else: key = 'atk'                         # 棍法/刀法/锤法/远程伤害
        ob[key] = round(ob.get(key, 0) + v, 2)
    wt = next((WT[c] for c in e['name'] if c in WT), '')
    new = {'n': e['name'], 'q': '天罡', 'slot': 'weapon', 'desc': f'{e["bindName"]}专属',
           'atk': e.get('atk', 60), 'pct_atk': 0.2, 'exclusive': hid, 'owner_bonus': ob}
    if wt: new['weapon_type'] = wt
    EQ[eid] = new; n += 1
say(f'专属神兵补全：{n} 件')

# 3.2 描述写的主人和绑的对不上 → 按描述改绑
#     没绑人、描述却写「某某专属」的，绑上
n = 0
for eid, e in EQ.items():
    if 'bond' in e and not e['bond']: del e['bond']
    o = owner(e)
    if not o:
        who = hero_in(e.get('desc')) if '专属' in (e.get('desc') or '') else None
        if who: e['exclusive'] = who; n += 1; say(f'  补绑 {ename(e)} → {H[who]["name"]}')
        continue
    who = hero_in(e.get('desc'))
    if who and who != o and H.get(o, {}).get('name', '') not in (e.get('desc') or ''):
        say(f'  改绑 {ename(e)}：{H.get(o, {}).get("name", o)} → {H[who]["name"]}（描述「{e.get("desc")}」）')
        e.pop('bond', None); e['exclusive'] = who; n += 1
    elif 'bond' in e:
        e['exclusive'] = e.pop('bond')
say(f'专属改绑：{n} 件')

# 3.3 一人一件
STATK = ('atk', 'def', 'int', 'agi', 'hp')
PCTK = ('pct_atk', 'pct_def', 'pct_hp')
def has_stats(e): return any(e.get(k) for k in STATK + PCTK)
def score(e):
    return (1 if has_stats(e) else 0, 1 if e.get('slot') == 'weapon' else 0, qnum(e),
            sum(e.get(k, 0) for k in STATK) + 100 * sum(e.get(k, 0) for k in PCTK))

# 同槽同品阶普通装备的中位数面板，给只有加成没有面板的 exc_ 补
pool = defaultdict(list)
for e in EQ.values():
    if not owner(e) and e.get('slot'): pool[(e['slot'], qnum(e))].append(e)
def median_stats(slot, q):
    for dq in (0, -1, 1, -2):
        L = pool.get((slot, q + dq))
        if L: break
    else: return {}
    out = {}
    for k in STATK + PCTK:
        v = [x.get(k, 0) for x in L]
        m = statistics.median(v)
        if m: out[k] = round(m, 2) if k.startswith('pct') else int(round(m))
    return out

DEFAULT_OB = {'weapon': {'atk': 0.25}, 'armor': {'def': 0.2, 'hp': 0.15},
              'helmet': {'def': 0.2, 'hp': 0.1}, 'mount': {'agi': 0.2, 'hp': 0.1},
              'special': {'int': 0.25, 'hp': 0.1}}
def norm_ob(ob):
    out = {}
    for k, v in (ob or {}).items():
        k = {'spd': 'agi'}.get(k, k)
        if k in ('atk', 'def', 'int', 'agi', 'hp', 'crit', 'all'): out[k] = round(out.get(k, 0) + v, 2)
    return out

by = defaultdict(list)
for eid, e in EQ.items():
    if owner(e): by[owner(e)].append(eid)

remap = D.get('equip_remap', {})
kept, demoted, dropped = 0, 0, 0
for hid, ids in by.items():
    ids.sort(key=lambda i: score(EQ[i]), reverse=True)
    keep = ids[0]; k = EQ[keep]
    # 加成：同一人名下写得最具体的那份
    obs = [norm_ob(EQ[i].get('owner_bonus')) for i in ids if EQ[i].get('owner_bonus')]
    same = [i for i in ids[1:] if ename(EQ[i]) == ename(k)]
    ob = next((norm_ob(EQ[i].get('owner_bonus')) for i in [keep] + same if EQ[i].get('owner_bonus')), None)
    k['owner_bonus'] = ob or (obs[0] if obs else DEFAULT_OB.get(k.get('slot'), {'atk': 0.25}))
    if not has_stats(k):
        k.update(median_stats(k.get('slot', 'special'), qnum(k)))
    if not k.get('desc'): k['desc'] = f'{H[hid]["name"]}专属'
    k.pop('eid', None)
    kept += 1
    for i in ids[1:]:
        e = EQ[i]
        if ename(e) == ename(k) or not has_stats(e):
            remap[i] = keep; del EQ[i]; dropped += 1
        else:
            e.pop('exclusive', None); e.pop('owner_bonus', None); e.pop('eid', None)
            who = hero_in(e.get('desc'))
            if who: e['desc'] = f'{H[who]["name"]}旧物'
            demoted += 1
# remap 链条压平
for a in list(remap):
    b = remap[a]
    while b in remap: b = remap[b]
    remap[a] = b
D['equip_remap'] = remap
D['EXCLUSIVE_POOL'] = sorted(i for i, e in EQ.items() if e.get('exclusive'))
say(f'专属：{kept} 人各留一件；同名或无面板的删 {dropped} 件；降成普通装备 {demoted} 件')

# 同名的普通装备（非专属）也会撞，背包里两件「钩镰枪」分不清。
# 描述里写的就是专属那个人的（「张保惯用」），算同一件东西，删掉并入专属；
# 别的改个名。
ex_by_name = {ename(e): (i, e['exclusive']) for i, e in EQ.items() if e.get('exclusive')}
RENAME = {'钩镰枪': '官造钩镰枪'}
for eid in list(EQ):
    e = EQ[eid]
    if e.get('exclusive') or ename(e) not in ex_by_name: continue
    kid, who = ex_by_name[ename(e)]
    if hero_in(e.get('desc')) == who:
        remap[eid] = kid; del EQ[eid]
        say(f'  并入专属：{eid} {ename(e)}（{e.get("desc")}）')
    else:
        old = ename(e); e['n'] = RENAME.get(old, '仿' + old); e.pop('name', None)
        say(f'  普通装备改名：{old} → {e["n"]}')
D['equip_remap'] = remap

# ── 四  碎片与武将来源 ────────────────────────────────────────────────
n = 0
for st in ST.values():
    for d in st.get('drops', []):
        if d.get('t') == 'con' and d.get('id') in ('frag', 'frag2', 'frag3'):
            d['v'] = {'frag': 1, 'frag2': 3, 'frag3': 5}[d['id']]; d['id'] = 'token'; n += 1
IT['token'] = {'name': '兵符', 'type': 'currency', 'desc': '升星时顶碎片', 'q': '良', 'v': 1, 'target': ''}
for k in ('frag', 'frag2', 'frag3'): IT.pop(k, None)
say(f'无主碎片掉落 → 兵符：{n} 处')

nd = nf = 0
KEEP_HEROES = '--keep-heroes' in sys.argv      # 只给模拟对照用：只改属性、不动武将来源
for st in ([] if KEEP_HEROES else ST.values()):
    before = len(st.get('drops', []))
    st['drops'] = [d for d in st.get('drops', []) if d.get('t') != 'hero']
    nd += before - len(st['drops'])
    fr = st.get('first_reward')
    if isinstance(fr, dict) and 'hero' in fr:
        del fr['hero']; nf += 1
say(f'关卡不再送将：掉落 {nd} 处，首通 {nf} 处')

# ── 校验 ─────────────────────────────────────────────────────────────
bad = [i for i, e in EQ.items() if not e.get('slot') or 'cha' in e or 'sk' in e or 'lead' in e or 'bond' in e]
assert not bad, bad
assert not any('cha' in h for h in H.values())
assert not any(s.get('stat') == 'cha' for s in SK.values())
cnt = defaultdict(int)
for e in EQ.values():
    if e.get('exclusive'): cnt[e['exclusive']] += 1
assert all(v == 1 for v in cnt.values())
assert all(e['exclusive'] in H for e in EQ.values() if e.get('exclusive'))
say(f'校验通过：装备 {len(EQ)} 件，其中专属 {len(cnt)} 件')

json.dump(D, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
open(PATH.replace('gameData_v10.json', 'fix_equip_stats_report.txt'), 'w', encoding='utf-8').write('\n'.join(rep) + '\n')
