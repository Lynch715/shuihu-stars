#!/usr/bin/env python3
"""
水浒群星录 · 阶段 1 数据清洗（结构层）

输入：原始 html（读其中的 <script id="gameData">）+ injected_full.json（运行时注入项）
输出：gameData_v10.json + clean_report.txt

做的事：
  1  角色 ID 重建：81 个乱码 ID → 拼音；修 li_yun(李衮→li_gun)；张青同音加后缀
  2  技能 ID 重建：376 个乱码 ID → <新角色id>_s<N>
  3  全量引用改写：stages.enemies / drops / first_reward / bonds.members
                  / equipment.exclusive / 各卡池
  4  合并运行时注入：19 个重复丢弃（保留 gameData 版），9 个真新增并入并换算血量量纲
  5  q 定型为数字 1–6，删冗余 rarity
  6  equipment.slot 统一（helm → helmet）
  7  stage.ch 补齐
  8  羁绊门槛改三档（初识/相契/齐聚）
  9  卡池按品质重建
  10 校验：零乱码 ID、零悬空引用
"""
import re, json, sys, os, collections, statistics
from pypinyin import lazy_pinyin

HTML = sys.argv[1] if len(sys.argv) > 1 else 'game.html'
INJ  = sys.argv[2] if len(sys.argv) > 2 else 'injected_full.json'
OUT  = 'gameData_v10.json'
REP  = []
def log(s=''):
    REP.append(s); print(s)

# ── 载入 ──────────────────────────────────────────────────────
raw = re.search(r'<script[^>]*id="gameData"[^>]*>(.*?)</script>',
                open(HTML, encoding='utf-8').read(), re.S).group(1).strip()
D = json.loads(raw)
INJD = json.load(open(INJ, encoding='utf-8'))
H, S, E, ST, BD = D['heroes'], D['skills'], D['equipment'], D['stages'], D['bonds']

log('水浒群星录 · 阶段 1 数据清洗')
log('=' * 60)
log(f'输入：角色 {len(H)} / 技能 {len(S)} / 装备 {len(E)} / 关卡 {len(ST)} / 羁绊 {len(BD)}')

# ── 1  角色 ID 重建 ───────────────────────────────────────────
inj_by_name = {v['name']: k for k, v in INJD['onlyH'].items()}
SPECIAL = {  # 复姓与多音字
    '耶律得重': 'yeli_dezhong', '耶律宗云': 'yeli_zongyun', '耶律宗电': 'yeli_zongdian',
    '公孙胜': 'gongsun_sheng', '皇甫端': 'huangfu_duan', '诸葛英': 'zhuge_ying',
    '单廷圭': 'shan_tinggui', '解珍': 'xie_zhen', '解宝': 'xie_bao',
    '李衮': 'li_gun', '燕顺': 'yan_shun',
}
# 真同音不同人 → 加绰号首字拼音后缀
HOMOPHONE = {'张青': 'zhang_qing_cai'}
# 同一人的异体字重复条目（gameData 内部重复）→ 合并成同一 ID
SAME_PERSON = {'单廷圭': 'shan_tinggui', '单廷珪': 'shan_tinggui'}
# 原始数据里的拼写错误 → 正确 ID（去下划线后比对）
ALIAS_FIX = {'andaquan': 'an_daoquan'}

def pinyin_id(name):
    if name in SAME_PERSON: return SAME_PERSON[name]
    if name in SPECIAL:   return SPECIAL[name]
    if name in HOMOPHONE: return HOMOPHONE[name]
    if name in inj_by_name and re.match(r'^[a-z][a-z0-9_]*$', inj_by_name[name]) \
       and not re.search(r'(_l|\d)$', inj_by_name[name]):
        return inj_by_name[name]
    py = lazy_pinyin(name)
    return py[0] + '_' + ''.join(py[1:]) if len(py) > 1 else py[0]

SLUG = re.compile(r'^[a-z][a-z0-9_]*$')
mangled = [k for k in H
           if re.match(r'^_+\d*$', k) or not SLUG.match(k) or re.search(r'_hero$', k)]
hmap = {}
# 先处理需要腾位的既有错误 ID
for k, v in list(H.items()):
    if k in mangled: continue
    if v['name'] in SAME_PERSON and SAME_PERSON[v['name']] != k:
        hmap[k] = SAME_PERSON[v['name']]
    elif v['name'] in SPECIAL and SPECIAL[v['name']] != k:
        hmap[k] = SPECIAL[v['name']]
for k in mangled:
    hmap[k] = pinyin_id(H[k]['name'])

final = {k: hmap.get(k, k) for k in H}
cnt = collections.Counter(final.values())
groups = {v: [k for k in final if final[k] == v] for v, n in cnt.items() if n > 1}

# 允许的合并：同一人的异体字重复；其余冲突视为错误
merges, bad_dup = {}, {}
for v, ks in groups.items():
    names = {H[k]['name'] for k in ks}
    if all(n in SAME_PERSON for n in names) and len({SAME_PERSON[n] for n in names}) == 1:
        merges[v] = ks
    else:
        bad_dup[v] = ks
# 同音不同人：被重建的那个加绰号后缀，已有的正确 ID 不动
auto_suffix = []
for v, ks in list(bad_dup.items()):
    rebuilt = [k for k in ks if k in mangled]
    keepers = [k for k in ks if k not in mangled]
    if not rebuilt or len(keepers) != 1:
        continue
    for k in rebuilt:
        t = H[k].get('title') or H[k]['name']
        suf = lazy_pinyin(t)[0]
        nid = f'{v}_{suf}'
        n = 2
        while nid in set(final.values()) | set(H):
            nid = f'{v}_{suf}{n}'; n += 1
        hmap[k] = nid; final[k] = nid
        auto_suffix.append((k, H[k]['name'], t, nid))
    del bad_dup[v]

if bad_dup:
    log('\n!! ID 重建后存在无法判定的冲突，中止：')
    for v, ks in bad_dup.items():
        log(f'   {v} ← ' + '、'.join(f'{k}({H[k]["name"]})' for k in ks))
    sys.exit(1)

# 后缀可能引入新冲突，复查一轮
cnt = collections.Counter(final.values())
still = {v: [k for k in final if final[k] == v] for v, n in cnt.items() if n > 1 and v not in merges}
if still:
    log('\n!! 加后缀后仍冲突，中止：')
    for v, ks in still.items():
        log(f'   {v} ← ' + '、'.join(f'{k}({H[k]["name"]})' for k in ks))
    sys.exit(1)
for k, nm, t, nid in auto_suffix:
    log(f'      同音不同人：{nm}（{t}）→ {nid}')

# 合并：保留字段更完整的一条（有 seat 优先，其次字段数多），技能取并集
drop_ids = set()
for v, ks in merges.items():
    ks_sorted = sorted(ks, key=lambda k: (('seat' in H[k]), len(H[k])), reverse=True)
    keep, rest = ks_sorted[0], ks_sorted[1:]
    base = dict(H[keep])
    for r in rest:
        for f, val in H[r].items():
            if f not in base or base[f] in (None, '', []): base[f] = val
        drop_ids.add(r)          # 技能保留主记录的，不取并集（否则会变 8 个）
    H[keep] = base
    who = '、'.join('%s(%s)' % (k, H[k]['name']) for k in ks if k in H)
    log('      合并同一人：%s → %s（保留 %s）' % (who, v, keep))

log(f'\n[1] 角色 ID：重建 {len(mangled)} 个非法 ID + 修正 {len(hmap)-len(mangled)} 个错拼'
    f' + 同音加后缀 {len(auto_suffix)} 个 + 合并同一人 {len(merges)} 组（丢弃 {len(drop_ids)} 条）')

# ── 2  技能 ID 重建 ───────────────────────────────────────────
smap = {}
for old_hid, v in H.items():
    if old_hid in drop_ids: continue
    new_hid = final[old_hid]
    for i, sid in enumerate(v.get('sk', []) or []):
        if (not SLUG.match(sid) or sid.startswith('_')) and sid not in smap:
            smap[sid] = f'{new_hid}_s{i+1}'
# 剩余未被任何角色引用的非法技能 ID
orphan = [k for k in S if (not SLUG.match(k) or k.startswith('_')) and k not in smap]
for i, sid in enumerate(orphan):
    smap[sid] = f'orphan_s{i+1}'
log(f'[2] 技能 ID：重建 {len(smap)} 个（其中无主 {len(orphan)} 个）')

# ── 3  应用重建 ───────────────────────────────────────────────
H2 = {final[k]: dict(v) for k, v in H.items() if k not in drop_ids}
S2 = {smap.get(k, k): dict(v) for k, v in S.items()}
for hid, v in H2.items():
    v['sk'] = [smap.get(s, s) for s in (v.get('sk') or [])]

# 兜底解析：① 已重建映射 ② 被丢弃的注入别名 ③ 按姓名拼音反查 ④ 原样
def canon_of(name):
    py = lazy_pinyin(name)
    return py[0] + '_' + ''.join(py[1:]) if len(py) > 1 else py[0]

surviving = {}                      # 姓名 → 最终 ID
for k in H:
    if k in drop_ids: continue
    surviving[H[k]['name']] = final[k]
# 无后缀的优先占位，避免 zhangqing 之类被同音后缀项抢走
by_canon, by_flat = {}, {}
for n, i in sorted(surviving.items(), key=lambda kv: kv[1].count('_')):
    c = canon_of(n)
    by_canon.setdefault(c, i)
    by_flat.setdefault(c.replace('_', ''), i)
    by_flat.setdefault(i.replace('_', ''), i)
inj_alias = {k: surviving[v['name']]                 # 被丢弃的注入 ID → 存活 ID
             for k, v in INJD['onlyH'].items() if v['name'] in surviving}

_unresolved = collections.Counter()
def remap_h(x):
    if x in final:      return final[x]
    if x in inj_alias:  return inj_alias[x]
    if x in by_canon:   return by_canon[x]
    f = str(x).replace('_', '').lower()      # 去下划线兜底（yuefei → yue_fei）
    if f in by_flat:    return by_flat[f]
    if f in ALIAS_FIX and ALIAS_FIX[f] in surviving.values(): return ALIAS_FIX[f]
    _unresolved[x] += 1
    return x

ST2 = {}
for sid, s in ST.items():
    s = dict(s)
    s['enemies'] = [remap_h(e) for e in (s.get('enemies') or [])]
    if s.get('first_reward') and s['first_reward'].get('hero'):
        s['first_reward'] = dict(s['first_reward'])
        s['first_reward']['hero'] = remap_h(s['first_reward']['hero'])
    if s.get('drops'):
        s['drops'] = [dict(d, id=remap_h(d['id'])) if d.get('t') == 'hero' and d.get('id') else d
                      for d in s['drops']]
    dead = [e for e in s['enemies'] if e not in final.values()
            and e not in {final[k] for k in H if k not in drop_ids}]
    ST2[sid] = s

BD2 = []
for b in BD:
    b = dict(b)
    b['members'] = [remap_h(m) for m in (b.get('members') or [])]
    BD2.append(b)

E2 = {}
for eid, e in E.items():
    e = dict(e)
    if e.get('exclusive'): e['exclusive'] = remap_h(e['exclusive'])
    if e.get('bond'):      e['bond']      = remap_h(e['bond'])
    if e.get('slot') == 'helm': e['slot'] = 'helmet'
    E2[eid] = e
log(f'[3] 引用改写：关卡 {len(ST2)} / 羁绊 {len(BD2)} / 装备 {len(E2)}'
    + (f'，别名兜底命中 {len(inj_alias)} 条' if inj_alias else ''))
if _unresolved:
    log('      无法解析的引用：' + '、'.join(f'{k}×{n}' for k, n in _unresolved.most_common(10)))

# ── 4  合并运行时注入 ─────────────────────────────────────────
# 血量量纲换算：注入项按 gameData 同品质中位数比例缩放
QN = {'凡':1,'良':2,'猛':3,'名':4,'天罡':5,'绝世':6}
def qnum(q):
    if isinstance(q, (int, float)) and 1 <= q <= 6: return int(q)
    return QN.get(str(q).strip(), 4)

hp_by_q = collections.defaultdict(list)
for v in H2.values(): hp_by_q[qnum(v['q'])].append(v['hp'])
med = {q: statistics.median(vs) for q, vs in hp_by_q.items()}

exist_names = {v['name'] for v in H2.values()}
added, merged = [], []
for k, v in INJD['onlyH'].items():
    if v['name'] in exist_names:
        merged.append(v['name']); continue
    v = dict(v); v.pop('hid', None)
    q = qnum(v.get('q'))
    inj_hp = [x['hp'] for x in INJD['onlyH'].values() if qnum(x.get('q')) == q]
    ratio = (med.get(q, 144)) / (statistics.median(inj_hp) if inj_hp else 660)
    v['hp'] = max(50, round(v['hp'] * ratio))
    v['sk'] = [smap.get(s, s) for s in (v.get('sk') or [])]
    v['src'] = '水浒传' if k not in ('shi_quan','ji_qing','zhen_xianglin','ha_lansheng','sha_zhiren') else '说岳全传'
    H2[k] = v; added.append((k, v['name'], v['hp']))
log(f'[4] 注入合并：丢弃重复 {len(merged)} 个，并入新增 {len(added)} 个（血量已按品质换算）')
for k, n, hp in added: log(f'      + {k:<16}{n:<8}hp→{hp}')

for eid, e in INJD['onlyE'].items():
    if eid in E2: continue
    e = dict(e)
    if e.get('exclusive'): e['exclusive'] = remap_h(e['exclusive'])
    if e.get('bond'):      e['bond']      = remap_h(e['bond'])
    if e.get('slot') == 'helm': e['slot'] = 'helmet'
    E2[eid] = e
log(f'      装备并入后共 {len(E2)} 件')

# ── 5  q 定型 ─────────────────────────────────────────────────
for v in H2.values():
    v['q'] = qnum(v.get('q'))
    v.pop('rarity', None)
qdist = collections.Counter(v['q'] for v in H2.values())
log('[5] q 定型为 1–6，删 rarity 冗余：' +
    '　'.join(f'{["","凡","良","猛","名","天罡","绝世"][q]}{qdist[q]}' for q in sorted(qdist)))

# ── 6  stage.ch 补齐 ──────────────────────────────────────────
fixed_ch = 0
for sid, s in ST2.items():
    if s.get('ch') is None:
        m = re.match(r'^(?:ch|hidden_)(\d+)', sid)
        s['ch'] = s.get('chapter') or (int(m.group(1)) if m else 0); fixed_ch += 1
    s.pop('chapter', None)
log(f'[6] stage.ch 补齐 {fixed_ch} 关，删冗余 chapter 字段')

# ── 7  羁绊门槛三档 ───────────────────────────────────────────
for b in BD2:
    n = len(b.get('members') or [])
    b['tiers'] = ([{'need': n, 'rate': 1.0}] if n <= 2 else
                  [{'need': 2, 'rate': 0.4},
                   {'need': -(-n // 2), 'rate': 0.7},
                   {'need': n, 'rate': 1.0}])
    b.pop('min_count', None); b.pop('require_all', None)
tier_n = collections.Counter(len(b['tiers']) for b in BD2)
log(f'[7] 羁绊门槛三档：单档 {tier_n[1]} 条（2 人羁绊）／三档 {tier_n[3]} 条')

# ── 8  卡池重建 ───────────────────────────────────────────────
def pool(pred): return sorted(k for k, v in H2.items()
                              if pred(v['q']) and v.get('src') != '杂兵')
D2 = dict(D)
D2.update(heroes=H2, skills=S2, equipment=E2, stages=ST2, bonds=BD2)
D2['LEGEND_POOL']    = pool(lambda q: q >= 4)
D2['GOLD_POOL']      = pool(lambda q: q >= 5)
D2['EXCLUSIVE_POOL'] = sorted(k for k, v in E2.items() if v.get('exclusive'))
D2.pop('EXC_POOL', None); D2.pop('V9_META', None)
log(f'[8] 卡池重建：名将 {len(D2["LEGEND_POOL"])} / 黄金 {len(D2["GOLD_POOL"])} / 专属 {len(D2["EXCLUSIVE_POOL"])}')

# ── 8b  清理原始数据里就不存在的引用 ──────────────────────────
dead_ref = [k for k, v in ST2.items()
            if (v.get('enemies') or []) and any(e not in H2 for e in v['enemies'])]
for k in dead_ref:
    ST2[k]['enemies'] = [e for e in ST2[k]['enemies'] if e in H2]

# 专属绑定指向不存在的人 → 去掉该字段（可选字段，不影响装备本身）
dropped_bond = []
for eid, e in E2.items():
    for f in ('exclusive', 'bond'):
        if e.get(f) and e[f] not in H2:
            dropped_bond.append(f'{eid}.{f}={e[f]}'); e.pop(f)
if dropped_bond:
    log(f'[8b] 清理无效专属绑定 {len(dropped_bond)} 处：{"、".join(dropped_bond)}')
if dead_ref:
    log(f'[8b] 清理原始坏引用：{"、".join(dead_ref)}（敌人在原始数据中不存在，已清空）')

# ── 9  校验 ───────────────────────────────────────────────────
log('\n[9] 校验')
bad_h = [k for k in H2 if not SLUG.match(k)]
bad_s = [k for k in S2 if not SLUG.match(k)]
log(f'      非法角色 ID {len(bad_h)}　非法技能 ID {len(bad_s)}')

dangling = collections.defaultdict(list)
for hid, v in H2.items():
    for s in v['sk']:
        if s not in S2: dangling['角色→技能'].append(f'{hid}:{s}')
for sid, s in ST2.items():
    for e in s.get('enemies') or []:
        if e not in H2: dangling['关卡→敌人'].append(f'{sid}:{e}')
    fr = s.get('first_reward') or {}
    if fr.get('hero') and fr['hero'] not in H2: dangling['关卡→首通'].append(f'{sid}:{fr["hero"]}')
    for d in s.get('drops') or []:
        if d.get('t') == 'hero' and d.get('id') not in H2: dangling['关卡→掉落'].append(f'{sid}:{d.get("id")}')
for b in BD2:
    for m in b['members']:
        if m not in H2: dangling['羁绊→成员'].append(f'{b.get("name")}:{m}')
for k in D2['LEGEND_POOL'] + D2['GOLD_POOL']:
    if k not in H2: dangling['卡池→角色'].append(k)
for eid, e in E2.items():
    for f in ('exclusive', 'bond'):
        if e.get(f) and e[f] not in H2: dangling[f'装备→{f}'].append(f'{eid}:{e[f]}')

tot = sum(len(v) for v in dangling.values())
if tot:
    for kind, items in dangling.items():
        log(f'      悬空 {kind}：{len(items)} 处　{"、".join(items[:5])}')
else:
    log('      悬空引用 0 处')

no_bio = [k for k, v in H2.items() if not v.get('bio')]
empty_enemies = [k for k, v in ST2.items() if not (v.get('enemies') or [])]
log(f'      缺 bio {len(no_bio)} 个（阶段 1b 补）')
empty_enemies = sorted(set(empty_enemies) | set(dead_ref))
log(f'      空 enemies 关卡 {len(empty_enemies)} 个（阶段 1b 补）：{"、".join(empty_enemies)}')

log('\n' + '=' * 60)
log(f'输出：角色 {len(H2)} / 技能 {len(S2)} / 装备 {len(E2)} / 关卡 {len(ST2)} / 羁绊 {len(BD2)}')
ok = (not bad_h and not bad_s and tot == 0)
log('结构层清洗 ' + ('通过' if ok else '未通过'))

json.dump(D2, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump({'heroes': final, 'skills': smap}, open('idmap.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
open('clean_report.txt', 'w', encoding='utf-8').write('\n'.join(REP))
print(f'\n已写出 {OUT}（{os.path.getsize(OUT)/1024:.0f}KB）、idmap.json、clean_report.txt')
sys.exit(0 if ok else 1)
