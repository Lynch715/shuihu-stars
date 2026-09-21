# -*- coding: utf-8 -*-
"""章号归位：重排键序、拆孤儿段、统一章名、敌级归位。见 重构规范_V10.md §29"""
import json, collections, io, sys

P = 'data/gameData_v10.json'
d = json.load(open(P, encoding='utf-8'))
S = d['stages']

# ── 1 改名（对白不动，对白本来就是对的） ──────────────────────────
RENAME = {
    'ch19_1':    '云天彪独掌一军',
    'ch19_2':    '刘慧娘的卦',
    'ch22_1':    '岳云初阵',
    'ch22_2':    '杨再兴请战',
    'ch22_boss': '郾城破拐子马·Boss',
}
for sid, nm in RENAME.items():
    S[sid]['name'] = nm

# 阵容撞车：两处照搬，改掉后一处（首通奖与掉落不动）
S['ch19_2']['enemies'] = ['liu_huiniang','chen_xizhen','chen_liqing','bandit_3','bandit_4','bandit_5']
S['ch23_3']['enemies'] = ['yue_fei','zhang_xian','niu_gao','yue_yun','bandit_1','bandit_2','bandit_3']

# 秘藏关上的 req_chapter 是改章号前的残留（55/63），引擎已不读，清掉
for sid in ('ch16_f1','ch21_f1','ch26_f1','ch31_f1'):
    S[sid].pop('req_chapter', None)

# ── 2 郾城段前移到小商桥之前（史序：郾城→颍昌→小商桥→朱仙镇） ──────
S['ch22_1']['req_stage']  = 'ch20_f2'
S['ch21_1']['req_stage']  = 'ch22_boss'
S['ch22_f1']['req_stage'] = 'ch21_f1'
for sid in ('ch22_1', 'ch22_2', 'ch22_boss'):
    S[sid]['rec_lv'] = [31, 34]

# ── 3 分章：一章一名，顺序即链序 ─────────────────────────────────
GROUPS = [
 ('少华山聚义',   ['ch1_1','ch1_2','ch1_3','ch1_boss']),
 ('花石纲劫难',   ['ch2_1','ch2_2','ch2_3','ch2_boss']),
 ('智取生辰纲',   ['ch3_1','ch3_2','ch3_boss','hidden_4_1']),
 ('江州劫法场',   ['ch4_1','ch4_2','ch4_boss']),
 ('三打祝家庄',   ['ch5_1','ch5_2','ch5_3','ch5_boss','hidden_7_1']),
 ('大破连环马',   ['ch6_1','ch6_boss']),
 ('曾头市复仇',   ['ch7_1','ch7_2','ch7_3','ch7_boss']),
 ('智取大名府',   ['ch8_1','ch8_2','ch8_3','ch8_boss']),
 ('石碣受天文',   ['ch9_1','ch9_2','ch9_boss']),
 ('两赢童贯',     ['ch10_1','ch10_2','ch10_boss']),
 ('三败高俅',     ['ch11_1','ch11_2','ch11_boss']),
 ('征辽',         ['ch12_1','ch12_2','ch12_3','ch12_boss','hidden_12_1','ch12_f1','ch12_f2']),
 ('田虎之乱',     ['ch13_1','ch13_2','ch13_3','ch13_boss','ch13_f1','ch13_f2']),
 ('王庆之乱',     ['ch14_1','ch14_2','ch14_3','ch14_boss','ch14_f1','ch14_f2']),
 ('征方腊·上',    ['ch15_1','ch15_2','ch15_3','ch15_4','ch15_boss','ch15_f1','ch15_f2']),
 ('征方腊·下',    ['ch16_1','ch16_2','ch16_3','ch16_boss','hidden_16_1','ch16_f1']),
 ('荡寇志·起',    ['ch17_1','ch17_2','ch17_3','ch17_boss','ch17_f1','ch17_f2']),
 ('荡寇志·终',    ['ch18_1','ch18_2','ch18_3','ch18_boss','ch18_f1','ch18_f2']),
 ('雷将余威',     ['ch19_1','ch19_2','ch19_boss','ch19_f1','ch19_f2']),
 ('靖康耻',       ['ch19_1b','ch19_2b','ch19_3b','ch19_bossb']),
 ('岳母刺字',     ['ch20_1','ch20_2','ch20_3','ch20_boss','ch20_f1','ch20_f2']),
 ('郾城大捷',     ['ch22_1','ch22_2','ch22_boss']),
 ('八百破十万',   ['ch21_1','ch21_2','ch21_3','ch21_boss','ch21_f1','ch22_f1','ch22_f2']),
 ('朱仙镇大捷',   ['ch22_1b','ch22_2b','ch22_3b','ch22_bossb']),
 ('风波亭',       ['ch23_1','ch23_2','ch23_3','ch23_boss','hidden_23_1','ch23_f1','ch23_f2']),
 ('淮西余烬',     ['ch24_f1','ch24_f2']),
 ('开篇·妖魔出世', ['ch25_1','ch25_2','ch25_3','ch25_4','ch25_5','ch25_boss','ch25_f1','ch25_f2']),
 ('楚王宫',       ['ch26_f1']),
 ('睦州',         ['ch27_f1','ch27_f2']),
 ('独松关',       ['ch28_f1','ch28_f2']),
 ('润州',         ['ch29_f1','ch29_f2']),
 ('帮源洞',       ['ch30_f1','ch30_f2']),
 ('石碣重光',     ['ch31_f1']),
]

flat = [s for _, g in GROUPS for s in g]
assert len(flat) == len(set(flat)) == len(S), (len(flat), len(set(flat)), len(S))
assert set(flat) == set(S), set(flat) ^ set(S)

# 隐藏关的 ch_name 保留「隐藏·」前缀，其余按章名
HIDDEN_NAME = {sid: S[sid].get('ch_name') for sid in S if S[sid].get('hidden')}

newS = {}
for i, (title, ids) in enumerate(GROUPS, 1):
    for sid in ids:
        st = S[sid]
        st['ch'] = i
        st['ch_name'] = HIDDEN_NAME.get(sid) or title
        st['enemy_lv'] = st['rec_lv'][1]          # 敌级归位
        newS[sid] = st
d['stages'] = newS

# ── 4 题词卡：title 与 ch_name 同名，lines 按内容迁移 ─────────────
old = d['story']['chapters']
LINES = {                      # 新章号 → 旧章号
 **{i: i for i in range(1, 19)},
 20: 19, 21: 20, 23: 21, 24: 22, 25: 23, 26: 24,
 27: 25, 28: 26, 29: 27, 30: 28, 31: 29, 32: 30, 33: 31,
}
NEW_LINES = {
 19: ['梁山平了，雷将们还在关外。', '打完了仗的人，比打仗的时候更难打发。'],
 22: ['拐子马三骑一联，铁浮屠人马都裹铁。', '破它的法子很笨：钻到马肚子底下，砍腿。'],
}
chapters = {}
for i, (title, _) in enumerate(GROUPS, 1):
    lines = NEW_LINES.get(i) or old[str(LINES[i])]['lines']
    chapters[str(i)] = {'title': title, 'lines': lines}
d['story']['chapters'] = chapters

# ── 自检 ────────────────────────────────────────────────────────
err = []
nxt = collections.defaultdict(list)
roots = []
for sid, s in d['stages'].items():
    r = s.get('req_stage')
    (nxt[r].append(sid) if r else roots.append(sid))
if roots != ['ch1_1']: err.append('roots=%s' % roots)
seen, order = set(), []
def walk(sid):
    while True:
        seen.add(sid); order.append(sid)
        k = nxt.get(sid, [])
        if not k: return
        if len(k) > 1:
            for x in k: walk(x)
            return
        sid = k[0]
walk('ch1_1')
if len(seen) != len(d['stages']): err.append('断链 %s' % (set(d['stages']) - seen))

names = collections.Counter(s['name'] for s in d['stages'].values())
dup = [n for n, c in names.items() if c > 1]
if dup: err.append('重名 %s' % dup)

rosters = collections.defaultdict(list)
for sid, s in d['stages'].items():
    rosters[tuple(sorted(s['enemies']))].append(sid)
same = [v for v in rosters.values() if len(v) > 1]
if same: err.append('同阵容 %s' % same)

for i, (title, ids) in enumerate(GROUPS, 1):
    ok = {title} | {v for v in HIDDEN_NAME.values() if v}
    nm = set(d['stages'][x]['ch_name'] for x in ids)
    if not nm <= ok or title not in nm: err.append('第%d章名不一 %s' % (i, nm))
    if chapters[str(i)]['title'] != title: err.append('第%d章题词名不符' % i)

blank = [s for s in d['stages'] if not d['stages'][s].get('ch_name')]
if blank: err.append('章名空 %s' % blank)

bad = [s for s in d['stages'] if d['stages'][s]['enemy_lv'] != d['stages'][s]['rec_lv'][1]]
if bad: err.append('敌级不符 %s' % bad)

miss = [s for s in d['stages'] if s not in d['dialogs']]
if miss: err.append('缺对白 %s' % miss)

# 键序 == 链序
if list(d['stages']) != order: 
    a = [x for x in zip(list(d['stages']), order) if x[0] != x[1]]
    err.append('键序≠链序 %s' % a[:5])

# 推荐等级沿链单调（秘藏/试炼这类尖峰除外）
SPIKE = {s for s in d['stages'] if d['stages'][s].get('hidden')}   # 隐藏关与各派秘藏都是尖峰
prev = 0
for sid in order:
    if sid in SPIKE: continue
    lv = d['stages'][sid]['rec_lv'][0]
    if lv < prev: err.append('等级倒挂 %s %d<%d' % (sid, lv, prev))
    prev = max(prev, lv)

if err:
    print('\n'.join('✗ ' + e for e in err)); sys.exit(1)

json.dump(d, open(P, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('✓ %d 关 / %d 章，键序=链序，一章一名，敌级归位' % (len(d['stages']), len(GROUPS)))
