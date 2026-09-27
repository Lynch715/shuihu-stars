#!/usr/bin/env python3
"""
水浒群星录 V10.7 · 装备百分比重分配（按 equip_v107.tsv 灌数据）

  python3 data/fix_v107.py            # 默认 data/gameData_v10.json

可以重复跑（每次都按 tsv 重写百分比，所以改了 tsv 再跑一次就行）。
做的事（规范 V10.7 ②）：
  1. 每件装备只留 tsv 里写的主项、副项百分比，其余 pct_* 删掉
  2. 固定血量减半（只做一次，用 _v107_hp 标记）
  3. 兵器类型勘误（note 列）
  4. 名以上的普通宝物带一条特殊属性；专属照旧
  5. 文官擅长兵器勘误（fav_v107.tsv）
  6. 补四件文官兵器（湘妃竹扇、铁笔判官、三清拂尘、玉骨龙纹笔）
  7. 主项是智的普通装标 wen（关卡掉落按阵上文官比例摇）
"""
import json, csv, os, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
PATH = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(ROOT, 'gameData_v10.json'))
D = json.load(open(PATH, encoding='utf-8'))
H, EQ = D['heroes'], D['equipment']
rep = []
def say(s): rep.append(s); print(s)

rows = list(csv.DictReader(open(os.path.join(ROOT, 'equip_v107.tsv'), encoding='utf-8'), delimiter='\t'))
FXKEY = {'pskrate': 'val', 'pcrit': 'val', 'pcmd': 'pct', 'pcut': 'pct', 'pdodge': 'chance', 'pdmg': 'pct', 'ppierce': 'pct', 'pshield': 'pct', 'pregen': 'pct'}

n_pct = n_fx = n_type = 0
for r in rows:
    e = EQ.get(r['id'])
    if not e: say(f'找不到 {r["id"]} {r["name"]}'); continue
    for k in [k for k in e if k.startswith('pct_')]: del e[k]
    e['pct_' + r['main']] = int(r['mainPct']) / 100
    if r['sub']: e['pct_' + r['sub']] = int(r['subPct']) / 100
    n_pct += 1
    if r['note'].startswith('类型'):
        e['weapon_type'] = r['note'].split('→')[1]; n_type += 1
    if r['slot'] == 'special' and r['fx'] and not e.get('exclusive'):
        e['fx'] = [{'k': r['fx'], FXKEY[r['fx']]: float(r['fxv'])}]; n_fx += 1
    # 主项是智的普通装标 wen；武主的去掉
    if not e.get('exclusive'):
        if r['main'] == 'int': e['wen'] = True
        elif e.get('wen') and r['main'] == 'atk': del e['wen']
say(f'百分比重写 {n_pct} 件；兵器类型勘误 {n_type}；普通宝物加特殊属性 {n_fx}')

# 固定血量减半（一次）
n = 0
for e in EQ.values():
    if e.get('hp') and not e.get('_v107_hp'):
        e['hp'] = int(round(e['hp'] / 2)); e['_v107_hp'] = 1; n += 1
say(f'固定血量减半 {n} 件')

# 文官擅长兵器
n = 0
for r in csv.DictReader(open(os.path.join(ROOT, 'fav_v107.tsv'), encoding='utf-8'), delimiter='\t'):
    h = H.get(r['hid'])
    if h and h.get('fav_weapon') != r['new']: h['fav_weapon'] = r['new']; n += 1
say(f'文官擅长兵器勘误 {n} 人')

# 补文官兵器
NEW = {
    'w_v107_shan': {'n': '湘妃竹扇', 'q': '天罡', 'slot': 'weapon', 'desc': '湘妃竹为骨，扇面题诗', 'weapon_type': '扇', 'int': 70, 'atk': 12, 'pct_int': 0.12, 'wen': True},
    'w_v107_bi':   {'n': '铁笔判官', 'q': '天罡', 'slot': 'weapon', 'desc': '精铁铸的判官笔，点穴也点人', 'weapon_type': '笔', 'int': 64, 'atk': 24, 'pct_int': 0.12, 'pct_atk': 0.06, 'wen': True},
    'w_v107_fc':   {'n': '三清拂尘', 'q': '绝世', 'slot': 'weapon', 'desc': '三清殿前的拂尘，白鹿尾', 'weapon_type': '拂尘', 'int': 90, 'atk': 30, 'pct_int': 0.15, 'pct_atk': 0.07, 'wen': True},
    'w_v107_lb':   {'n': '玉骨龙纹笔', 'q': '绝世', 'slot': 'weapon', 'desc': '玉为骨、刻龙纹，一笔千军', 'weapon_type': '笔', 'int': 90, 'atk': 20, 'pct_int': 0.15, 'wen': True},
}
n = 0
for k, v in NEW.items():
    if k not in EQ: EQ[k] = v; n += 1
say(f'补文官兵器 {n} 件')

# 校验：每件最多两项百分比，单项 ≤ 0.15
bad = [e['n'] for e in EQ.values() if len([k for k in e if k.startswith('pct_')]) > 2 or any(v > 0.15 for k, v in e.items() if k.startswith('pct_'))]
say(f'校验：超出一主一副或超过 15% 的 {len(bad)} 件 {bad[:5]}')

json.dump(D, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=None, separators=(',', ':'))
open(os.path.join(ROOT, 'fix_v107_report.txt'), 'w', encoding='utf-8').write('\n'.join(rep) + '\n')
