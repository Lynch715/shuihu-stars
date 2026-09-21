#!/usr/bin/env python3
"""
水浒群星录 · 人物表勘误

  python3 data/fix_heroes.py data/gameData_v10.json

三类问题：
  一、同一个人拆成两条，名字和绰号还互换了 —— 蒋忠／蒋门神、郑屠／镇关西。
      留关卡里在用的那条，另一条并掉。
  二、查无此人 —— 张猛方顶着「没羽箭」（那是张清的），邰正顶着「铁臂膊」（蔡福的），
      崔珏顶着「催命判官」（李立的）。崔珏本是道教的判官神，不是梁山好汉。
      三个都换成原著里真有、而这份名册里还缺的小人物。
  三、绰号张冠李戴 —— 燕顺是「锦毛虎」不是「锦豹子」（那是杨林的），
      萧嘉穗没有绰号，「神机军师」是朱武的。
"""
import json, sys

PATH = sys.argv[1] if len(sys.argv) > 1 else 'data/gameData_v10.json'
D = json.load(open(PATH, encoding='utf-8'))
H, S, B = D['heroes'], D['stages'], D['bonds']
rows = list(B.values()) if isinstance(B, dict) else B

# ── 一、并掉重复 ─────────────────────────────────────────
MERGE = {'jiang_men_shen': 'jiang_zhong',   # 留「蒋忠·蒋门神」，关卡在用
         'zhen_guanxi':    'zhen_xi'}       # 留「郑屠·镇关西」，关卡在用
for dup, keep in MERGE.items():
    if dup not in H: continue
    print(f'并：{H[dup]["name"]}({dup}) → {H[keep]["name"]}({keep})')
    for b in rows:
        b['members'] = [keep if m == dup else m for m in b['members']]
        seen, out = set(), []
        for m in b['members']:
            if m not in seen: seen.add(m); out.append(m)
        b['members'] = out
    for s in S.values():
        if s.get('enemies'): s['enemies'] = [keep if e == dup else e for e in s['enemies']]
        if s.get('first_reward', {}).get('hero') == dup: s['first_reward']['hero'] = keep
        for dr in s.get('drops', []):
            if dr.get('id') == dup: dr['id'] = keep
    del H[dup]

# ── 二、查无此人的三个，换成原著真有的 ───────────────────
#    数值与技能照搬原来那条，只换名号与来历 —— 战力曲线不动。
SWAP = {
  'zhang_mengfang': dict(nid='he_tao',   name='何涛', title='缉捕使臣',
    bio='济州府三都缉捕使臣。生辰纲一案奉命缉拿晁盖七人，反被阮氏兄弟在石碣村水泊里杀得大败，'
        '割了两耳回州。'),
  'tai_zheng': dict(nid='niu_er', name='牛二', title='没毛大虫',
    bio='东京街头的泼皮，满城人都躲着走。杨志在天汉桥卖刀，他缠着要白拿，一路撩拨到杨志刀下，'
        '一条命换得杨志刺配大名府。'),
  'cui_jue': dict(nid='wang_po', name='王婆', title='阳谷媒婆',
    bio='阳谷县紫石街开茶坊的婆子。替西门庆设下挨光十计，又出了那服砒霜的主意，'
        '武大郎的命就断在这条计上。'),
}
for old, nw in SWAP.items():
    if old not in H: continue
    h = H.pop(old)
    print(f'换：{h["name"]}（{h["title"]}）→ {nw["name"]}（{nw["title"]}）　'
          f'—— 原绰号属于别人，此人原著无考')
    h['name'], h['title'], h['bio'] = nw['name'], nw['title'], nw['bio']
    h['src'] = '水浒传'
    h.pop('arch', None)              # 让 assign_archetype.py 重新归类
    H[nw['nid']] = h
    for b in rows:
        b['members'] = [nw['nid'] if m == old else m for m in b['members']]
    for s in S.values():
        if s.get('enemies'): s['enemies'] = [nw['nid'] if e == old else e for e in s['enemies']]
        if s.get('first_reward', {}).get('hero') == old: s['first_reward']['hero'] = nw['nid']
        for dr in s.get('drops', []):
            if dr.get('id') == old: dr['id'] = nw['nid']

# ── 三、绰号还回原主 ─────────────────────────────────────
TITLE = {'yan_shun': '锦毛虎',      # 锦豹子是杨林的
         'xiao_jiasui': '布衣豪杰'}  # 神机军师是朱武的；萧嘉穗原著无绰号
for hid, t in TITLE.items():
    if hid in H and H[hid].get('title') != t:
        print(f'绰号：{H[hid]["name"]} {H[hid].get("title")} → {t}')
        H[hid]['title'] = t

# ── 自检 ─────────────────────────────────────────────────
ids = set(H)
bad = [(b['name'], m) for b in rows for m in b['members'] if m not in ids]
if bad: raise SystemExit('羁绊里还有找不到的人：' + str(bad))
bad2 = [(k, e) for k, s in S.items() for e in (s.get('enemies') or []) if e not in ids]
if bad2: raise SystemExit('关卡里还有找不到的人：' + str(bad2[:5]))

from collections import defaultdict
bt = defaultdict(list)
for i, h in H.items():
    if h.get('title'): bt[h['title']].append(h['name'])
dup = {t: v for t, v in bt.items()
       if len(v) > 1 and t not in ('偏将','大将','副将','先锋','上将','元帅','枢密','枢密使',
                                   '太尉','尚书','太子','三大王','皇叔','女将','军师','雷将','双枪将')}
print('\n绰号仍然重复的：', dup if dup else '无')
print(f'人物总数 {len(H)}')

json.dump(D, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'已写回 {PATH}')
