#!/usr/bin/env python3
"""
水浒群星录 V10.7 · 装备百分比重分配 —— 出对照表

  python3 data/equip_v107_map.py            → data/equip_v107.tsv + 装备对照表_V10.7.md

只出表，不改数据。表审过之后由 fix_v107.py 按 tsv 灌进 gameData_v10.json。
tsv 可以手改：改完再跑 fix_v107.py 就行。

口径（规范 V10.7 ②）：
  兵器  主 武% 或 智%，可带另一样做副项
  甲盔  主 防% 或 血%，副项另一样
  马    主 捷%；神驹副武，象牛驼副血，鹿鹤副智
  宝物  主 武/智/捷/血 任一；名以上的普通宝物带一条特殊属性（数值压低），专属宝物照旧
  主项按品阶 3/5/7/9/12/15，副项减半 1/2/3/4/6/7
"""
import json, re, sys, os
ROOT = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(ROOT, 'gameData_v10.json'), encoding='utf-8'))
H, EQ = D['heroes'], D['equipment']
Q = {'凡': 1, '良': 2, '猛': 3, '名': 4, '天罡': 5, '绝世': 6}
MAIN = {1: 3, 2: 5, 3: 7, 4: 9, 5: 12, 6: 15}
SUB  = {1: 1, 2: 2, 3: 3, 4: 4, 5: 6, 6: 7}
SN = {'atk': '武', 'int': '智', 'def': '防', 'agi': '捷', 'hp': '血'}

def role(t):
    a, i = t.get('atk', 0), t.get('int', 0)
    return 'mix' if min(a, i) / max(a, i, 1) >= 0.85 else ('wu' if a > i else 'wen')
def qn(e): return Q.get(e.get('q'), 2) if not isinstance(e.get('q'), int) else e['q']
def has(s, *ws): return any(w in s for w in ws)

def weapon(e, n, wt, ow, orole):
    cur_int = bool(e.get('pct_int'))
    if wt in ('扇', '笔', '拂尘') or cur_int and wt != '剑':
        main = 'int'
        sub = 'atk' if wt in ('拂尘', '棍', '鞭', '刀') else None      # 拂尘、哨棒、铜链、雁翎刀这类文官家伙带点武
        return main, sub
    if wt == '剑':
        if cur_int or orole == 'wen': return 'int', 'atk'
        return 'atk', 'int'
    # 武主
    sub = 'int' if wt in ('戟', '鞭', '锏', '索') or orole == 'mix' else None
    return 'atk', sub

def armor(e, n):
    if has(n, '甲', '铠', '鍪', '铁叶'): return 'def', 'hp'
    return 'hp', 'def'          # 袍裘衣衫裰袈裟氅朝服

def helmet(e, n):
    if has(n, '盔', '兜鍪'): return 'def', 'hp'
    return 'hp', 'def'          # 巾冠帽纱抹额

def mount(e, n, q):
    if has(n, '象', '牛', '骆驼', '轿', '驴', '骡'): return 'agi', 'hp'
    if has(n, '鹿', '鹤'): return 'agi', 'int'
    return 'agi', 'atk' if q >= 5 else None

# 宝物：主项按名字，特殊属性一条（普通宝物，名以上）
SPECIAL = [
    # (关键词组, 主项, 特殊属性 key, 值)
    (('羽扇', '天书', '道符', '法印', '法袍', '巫术杖', '金砖', '河图洛书', '砚台', '书法', '密信', '算盘', '兵书', '罗盘', '笏板', '官印', '知州印', '奔雷车图', '金扇', '湖笔'), 'int', 'pskrate', 0.05),
    (('令旗', '精忠旗', '帅印', '狼牙旗', '令箭', '玉玺', '圣旨', '枢密使印'), 'atk', 'pcmd', 0.10),
    (('枪谱', '风雪图', '流星锤链', '飞刀囊', '火炮图', '肉铺刀', '宝剑'), 'atk', 'pcrit', 0.05),
    (('铁券', '宝塔', '佛珠', '金甲', '药箱', '玉佩'), 'hp', 'pcut', 0.05),
    (('甲马', '足球', '御赐球', '官靴', '绣花鞋'), 'agi', 'pdodge', 0.05),
]
def special(e, n):
    for ws, main, fk, fv in SPECIAL:
        if has(n, *ws): return main, fk, fv
    return 'int', 'pskrate', 0.05

rows = []
for eid, e in EQ.items():
    n, slot, q = e['n'], e.get('slot'), qn(e)
    wt = e.get('weapon_type') or ''
    ow = e.get('exclusive'); ot = H.get(ow, {}); orole = role(ot) if ot else ''
    sub = None; fxk = fxv = None; note = ''
    if slot == 'weapon':
        # 兵器类型勘误
        if n in ('飞石袋', '飞鱼袋', '锦袋飞石'): wt2 = '弓'
        elif n == '铁锹': wt2 = '锹'
        elif n == '团牌': wt2 = '盾'
        elif n == '祖传宝刀': wt2 = '刀'
        elif n == '明教圣火剑': wt2 = '剑'
        else: wt2 = wt
        if wt2 != wt: note = f'类型 {wt or "空"}→{wt2}'
        main, sub = weapon(e, n, wt2, ow, orole)
        wt = wt2
    elif slot == 'armor': main, sub = armor(e, n)
    elif slot == 'helmet': main, sub = helmet(e, n)
    elif slot == 'mount': main, sub = mount(e, n, q)
    elif slot == 'special':
        main, fxk, fxv = special(e, n)
        if ow or q < 4: fxk = fxv = None          # 专属照旧两条；猛以下不带
    else: continue
    cur = ' '.join(f'{SN[k[4:]]}{round(v*100)}' for k, v in e.items() if k.startswith('pct_') and v)
    rows.append({
        'id': eid, 'name': n, 'q': e.get('q'), 'slot': slot, 'type': wt, 'owner': ot.get('name', ''), 'orole': orole,
        'main': main, 'mainPct': MAIN[q], 'sub': sub or '', 'subPct': SUB[q] if sub else 0,
        'fx': fxk or '', 'fxv': fxv or '', 'cur': cur, 'hp': e.get('hp', 0), 'note': note,
    })

# 文官擅长兵器勘误：文官（wen）、书生或道士范式、写着刀的
fav = []
for hid, t in H.items():
    if role(t) != 'wen': continue
    exw = next((x for x in EQ.values() if x.get('exclusive') == hid and x.get('slot') == 'weapon'), None)
    cur = t.get('fav_weapon')
    if exw and exw.get('weapon_type') and cur != exw['weapon_type']:
        fav.append((hid, t['name'], cur, exw['weapon_type'], f'专属是{exw["n"]}')); continue
    if exw: continue
    arch = t.get('arch', '')
    if t['name'] == '哈迷蚩': fav.append((hid, t['name'], cur, '扇', '金国军师')); continue
    if cur in ('刀', '枪', '斧', '锤', None):
        if 'taoist' in arch: new = '剑'
        elif 'civ_lit' in arch or 'civ_mkt' in arch: new = '笔' if t['name'] in ('萧让', '蒋敬', '皇甫端', '安道全', '金大坚', '侯健') else '扇'
        else: continue
        fav.append((hid, t['name'], cur, new, arch))

# ── 写 tsv ──
cols = ['id', 'name', 'q', 'slot', 'type', 'owner', 'orole', 'main', 'mainPct', 'sub', 'subPct', 'fx', 'fxv', 'cur', 'hp', 'note']
with open(os.path.join(ROOT, 'equip_v107.tsv'), 'w', encoding='utf-8') as f:
    f.write('\t'.join(cols) + '\n')
    for r in rows: f.write('\t'.join(str(r[c]) for c in cols) + '\n')
with open(os.path.join(ROOT, 'fav_v107.tsv'), 'w', encoding='utf-8') as f:
    f.write('hid\tname\told\tnew\twhy\n')
    for x in fav: f.write('\t'.join(map(str, x)) + '\n')

# ── 写 markdown 对照表 ──
SLOTN = {'weapon': '兵器', 'armor': '战甲', 'helmet': '头盔', 'mount': '坐骑', 'special': '宝物'}
FXN = {'pskrate': '主动技发动率', 'pcmd': '指挥技效果', 'pcrit': '暴击率', 'pcut': '受到伤害', 'pdodge': '闪避'}
out = ['# 装备对照表 V10.7（待审）', '',
       '每件一主一副：主项按品阶 3/5/7/9/12/15，副项 1/2/3/4/6/7。「现在」一列是改前的百分比。',
       '固定血量一律减半（表里不列）。专属本人加成、特效、套装不动。普通宝物（名以上）新带一条特殊属性，专属宝物照旧。', '']
for slot in ['weapon', 'armor', 'helmet', 'mount', 'special']:
    rs = [r for r in rows if r['slot'] == slot]
    rs.sort(key=lambda r: (-Q.get(r['q'], 0), r['owner'] == '', r['name']))
    out.append(f'## {SLOTN[slot]}（{len(rs)} 件）'); out.append('')
    hdr = '| 名 | 品阶 | ' + ('类型 | ' if slot == 'weapon' else '') + '专属 | 主项 | 副项 | ' + ('特殊属性 | ' if slot == 'special' else '') + '现在 | 备注 |'
    out.append(hdr); out.append('|' + '---|' * (hdr.count('|') - 1))
    for r in rs:
        cells = [r['name'], r['q']]
        if slot == 'weapon': cells.append(r['type'])
        cells += [r['owner'] + (f'（{ {"wu":"武","wen":"文","mix":"双全"}[r["orole"]] }）' if r['orole'] else ''),
                  f"{SN[r['main']]}{r['mainPct']}", f"{SN[r['sub']]}{r['subPct']}" if r['sub'] else '—']
        if slot == 'special': cells.append(f"{FXN.get(r['fx'], r['fx'])}{'−' if r['fx']=='pcut' else '+'}{round(r['fxv']*100)}%" if r['fx'] else ('照旧' if r['owner'] else '—'))
        cells += [r['cur'], r['note']]
        out.append('| ' + ' | '.join(cells) + ' |')
    out.append('')
out.append(f'## 文官擅长兵器勘误（{len(fav)} 人）'); out.append('')
out.append('| 人 | 现在 | 改为 | 依据 |'); out.append('|---|---|---|---|')
for hid, nm, o, nw, why in fav: out.append(f'| {nm} | {o or "空"} | {nw} | {why} |')
out.append('')
# 补文官兵器
out += ['## 补文官家伙（非专属天罡、绝世兵器武智各半）', '',
        '现在非专属天罡兵器 8 件里智 2 件，绝世 6 件里智 2 件。补 4 件：', '',
        '| 名 | 品阶 | 类型 | 主项 | 副项 |', '|---|---|---|---|---|',
        '| 湘妃竹扇 | 天罡 | 扇 | 智12 | — |', '| 铁笔判官 | 天罡 | 笔 | 智12 | 武6 |',
        '| 三清拂尘 | 绝世 | 拂尘 | 智15 | 武7 |', '| 玉骨龙纹笔 | 绝世 | 笔 | 智15 | — |', '']
open(os.path.join(ROOT, '..', '装备对照表_V10.7.md'), 'w', encoding='utf-8').write('\n'.join(out))
print(f'{len(rows)} 件，擅长兵器勘误 {len(fav)} 人')
import collections
print(collections.Counter((r['slot'], r['main'], r['sub']) for r in rows))
