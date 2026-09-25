#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
水浒群星录 V10.5 · 数据修正（可重跑）
  python3 fix_v105.py

  1. 技能勘误：18 人各给一套自己的四招（借用 / 照抄别人的那些换掉），没人用的旧技能删掉
  2. 两处改名：穆弘「小遮拦」→「没遮拦」，武松「铁臂膊」→「打虎神力」
  3. 配合技：叠毒（麻沸散、蒙汗药计、白花蛇牙、毒蝎暗伏、鼓上蚤飞）、狂风（呼风唤雨、天魔乱舞、妖雾弥漫）
  4. 铁匠铺：补 6 件通用兵器（天罡 4、绝世 2）
  5. 报告：每人四招齐不齐、有没有共用技能 ID（杂兵除外）、档位越界

技能 DSL 与档位校验直接借 rework_skills.py 的实现（只取「主流程」之前的部分）。
"""
import json, os, re, sys, collections

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, 'gameData_v10.json')

# ── 借 rework_skills.py 的 DSL / 档位校验 ────────────────────────────
src = open(os.path.join(ROOT, 'rework_skills.py'), encoding='utf-8').read()
src = src.split('# ── 主流程')[0]
ns = {'__file__': os.path.join(ROOT, 'rework_skills.py')}
sys.argv = [sys.argv[0]]                # 别让 rework 的 --check 解析吃到我们的参数
exec(compile(src, 'rework_skills.py', 'exec'), ns)
parse, settle, WARN = ns['parse'], ns['settle'], ns['WARN']

d = json.load(open(DATA, encoding='utf-8'))
heroes, skills, equip = d['heroes'], d['skills'], d['equipment']

# ── 1  技能勘误 ────────────────────────────────────────────────────────
KITS = {
  'shi_xiu': [
    ('拼命三郎',   'A dmg single 2.0; st hit bleed 0.4 2'),
    ('翠屏山',     'A dmg single 1.8; st hit disarm 0.4 1'),
    ('大名府劫法场', 'P plow 0.5 atk 0.3; ptough'),
    ('跳楼劫法场', 'A dmg col 1.4; st hit stun 0.25 1'),
  ],
  'xuan_zan': [
    ('连珠箭',   'A dmg single 1.9; st hit vuln 0.4 2 0.2'),
    ('丑郡马',   'P pcut 0.08; pstat atk 0.06'),
    ('关胜副将', 'S2 shield frontm 0.12'),
    ('郡马号令', 'C buff mates atk 0.10 3'),
  ],
  'hao_siwen': [
    ('井木犴枪', 'A dmg single 1.9; st hit bleed 0.3 2'),
    ('梦犴之兆', 'P pdodge 0.12'),
    ('蒲东同袍', 'C buff mates atk 0.10 3'),
    ('井木怒目', 'A dmg single 2.0; st hit stun 0.25 1'),
  ],
  'jin_dajian': [
    ('玉臂雕印', 'A st smartest silence 0.6 2; dmg smartest 0.8 src=int'),
    ('巧匠',     'P pstat def 0.10'),
    ('伪造印信', 'C buff mates int 0.12 3'),
    ('刻石留名', 'S2 shield mates 0.05'),
  ],
  'hou_jian': [
    ('通臂猿',   'A dmg single 1.8; st hit disarm 0.3 1'),
    ('裁缝妙手', 'P pdodge 0.15'),
    ('旗号伪装', 'A st rand2 chaos 0.5 1'),
    ('缝衣制旗', 'C buff mates def 0.10 3'),
  ],
  'deng_fei': [
    ('火眼狻猊', 'A dmg single 2.0; st hit burn 0.3 2'),
    ('狻猊怒目', 'P pstat atk 0.10'),
    ('铁链横扫', 'A dmg row 1.2'),
    ('铁链护身', 'S2 shield self 0.30'),
  ],
  'he_tao': [
    ('缉捕',     'A dmg single 1.6; st hit disarm 0.3 1'),
    ('公人眼线', 'P pfirst'),
    ('差役号令', 'C buff mates agi 0.10 3'),
    ('拘拿',     'A dmg weakest 2.0'),
  ],
  'niu_er': [
    ('耍无赖',   'A st self taunt 1.0 1; dmg single 1.2'),
    ('没毛大虫', 'P pcut 0.06'),
    ('街头撒泼', 'A dmg row 0.8'),
    ('死缠烂打', 'P pcounter 0.2 0.8'),
  ],
  'wang_po': [
    ('挑拨离间', 'A st smartest chaos 0.6 1; dmg smartest 0.4 src=int'),
    ('巧舌如簧', 'P pstat int 0.10'),
    ('茶坊耳目', 'C buff mates agi 0.08 3'),
    ('王婆卖瓜', 'A st smartest silence 0.8 2; dmg smartest 1.0 src=int'),
  ],
  'shi_quan': [
    ('望仙桥刺客', 'A dmg single 2.0; st hit bleed 0.3 2'),
    ('义胆',       'P plow 0.4 atk 0.3'),
    ('岳家旧部',   'C buff mates atk 0.08 3'),
    ('刺秦',       'A dmg strongest 1.8; st hit vuln 0.3 2 0.2'),
  ],
  'ji_qing': [
    ('吉青枪法', 'A dmg single 1.9; st hit stun 0.2 1'),
    ('岳家军',   'P pstat atk 0.08'),
    ('铁壁',     'S2 shield self 0.28'),
    ('冲阵',     'A dmg col 1.3'),
  ],
  'zhen_xianglin': [
    ('祥麟枪',   'A dmg single 2.0; st hit bleed 0.3 2'),
    ('双枪齐出', 'P pfollow 0.3 0.6'),
    ('猿臂寨将', 'C buff mates def 0.20 3'),
    ('猿臂冲阵', 'A dmg row 1.2'),
  ],
  'ha_lansheng': [
    ('神力斧',   'A dmg single 2.1; st hit stun 0.25 1'),
    ('力大无穷', 'P pstat atk 0.12'),
    ('铁甲',     'S2 shield self 0.28'),
    ('横扫',     'A dmg row 1.2'),
  ],
  'sha_zhiren': [
    ('沙家刀法', 'A dmg single 1.9; st hit bleed 0.3 2'),
    ('刀不离手', 'P pcounter 0.3 0.8'),
    ('沙家号令', 'C buff mates agi 0.22 3'),
    ('疾风斩',   'A dmg col 1.3'),
  ],
  'li_tianyou': [
    ('厉家枪',   'A dmg single 1.9; st hit bleed 0.3 2'),
    ('江南骁将', 'P pstat atk 0.10'),
    ('厉家护体', 'S2 shield self 0.30'),
    ('兄弟同心', 'A buff mates atk 0.2 2'),
  ],
  'bao_daoyi': [
    ('玄天混元剑', 'A dmg single 2.2 src=int; st hit bleed 0.4 2'),
    ('灵应天师',   'C buff mates int 0.15 3'),
    ('道法护身',   'S2 shield self 0.20; st self dodge 1.0 2 0.15'),
    ('妖法迷阵',   'A st rand3 chaos 0.4 1; dmg rand3 0.4 src=int'),
  ],
  'tian_shi': [
    ('田家刀法', 'A dmg single 1.8; st hit bleed 0.3 2'),
    ('河北兵',   'P pstat hp 0.10'),
    ('晋王宗亲', 'C buff mates def 0.10 3'),
    ('冲阵',     'A dmg row 1.1'),
  ],
  'mu_chun': [
    ('小遮拦',   'A dmg single 1.8; st hit bleed 0.3 2'),
    ('穆家兄弟', 'P pstat atk 0.08'),
    ('遮拦护身', 'S2 shield self 0.26'),
    ('揭阳镇霸', 'A dmg row 1.1'),
  ],
}

for hid, kit in KITS.items():
    h = heroes[hid]
    ids = []
    for i, (name, spec) in enumerate(kit):
        sid = f'{hid}_v5s{i + 1}'
        sk = parse(spec); sk['name'] = name
        settle(sid, sk, h['q'], i, name)
        skills[sid] = sk
        ids.append(sid)
    h['sk'] = ids

# ── 2  改名 ───────────────────────────────────────────────────────────
if 'xzj1' in skills: skills['xzj1']['name'] = '没遮拦'
if 'ws4' in skills: skills['ws4']['name'] = '打虎神力'

# ── 3  配合技 ─────────────────────────────────────────────────────────
def add_fx(sid, fx):
    s = skills[sid]
    if not any(json.dumps(f, sort_keys=True) == json.dumps(fx, sort_keys=True) for f in s['fx']):
        s['fx'].append(fx)
def set_layers(sid, n):
    for f in skills[sid]['fx']:
        if f.get('k') == 'status' and f.get('st') == 'poison': f['layers'] = n

add_fx('adq4', {'k': 'status', 'tg': 'hit', 'st': 'poison', 'chance': 0.5, 'dur': 3, 'layers': 2})      # 安道全 麻沸散
add_fx('sun_erniang_s3', {'k': 'status', 'tg': 'hit', 'st': 'poison', 'chance': 0.5, 'dur': 3, 'layers': 2})   # 孙二娘 蒙汗药计
set_layers('yoc1', 2)     # 杨春 白花蛇牙
set_layers('jb5n', 2)     # 解宝 毒蝎暗伏
add_fx('shi_qian_s1', {'k': 'status', 'tg': 'hit', 'st': 'poison', 'chance': 0.35, 'dur': 3})   # 时迁 鼓上蚤飞

# 公孙胜 呼风唤雨：狂风 + 法术伤害，灼烧交给放火的
skills['gss2']['fx'] = [{'k': 'status', 'tg': 'all', 'st': 'wind', 'dur': 2},
                        {'k': 'dmg', 'tg': 'all', 'mult': 0.5, 'src': 'int'}]
add_fx('fan_rui_s2', {'k': 'status', 'tg': 'all', 'st': 'wind', 'dur': 2})   # 樊瑞 天魔乱舞
add_fx('qdq2', {'k': 'status', 'tg': 'all', 'st': 'wind', 'dur': 1})          # 乔道清 妖雾弥漫

# ── 4  铁匠铺补货：6 件通用兵器 ─────────────────────────────────────
NEW_W = {
  'w105_1': {'n': '镔铁雪花刀', 'q': '天罡', 'weapon_type': '刀', 'desc': '镔铁百炼，刃纹如雪'},
  'w105_2': {'n': '点钢蛇矛',   'q': '天罡', 'weapon_type': '枪', 'desc': '矛尖点钢，出如蛇信'},
  'w105_3': {'n': '泼风刀',     'q': '天罡', 'weapon_type': '刀', 'desc': '刀阔背厚，劈风有声'},
  'w105_4': {'n': '乌金锏',     'q': '天罡', 'weapon_type': '锏', 'desc': '乌金铸就，一锏碎甲'},
  'w105_5': {'n': '玄铁重刀',   'q': '绝世', 'weapon_type': '刀', 'desc': '玄铁所铸，重逾百斤'},
  'w105_6': {'n': '乌金长枪',   'q': '绝世', 'weapon_type': '枪', 'desc': '通体乌金，寒光照人'},
}
PANEL = {'天罡': {'atk': 50, 'int': 30, 'pct_atk': 0.22}, '绝世': {'atk': 60, 'int': 40, 'pct_atk': 0.3}}
for eid, w in NEW_W.items():
    equip[eid] = dict(w, slot='weapon', **PANEL[w['q']])

# ── 清理：没人用的技能删掉 ────────────────────────────────────────────
used = collections.defaultdict(list)
for hid, h in heroes.items():
    for sid in h.get('sk', []): used[sid].append(hid)
dead = [sid for sid in list(skills) if sid not in used]
for sid in dead: del skills[sid]

# ── 报告 ──────────────────────────────────────────────────────────────
print(f'新写技能 {len(KITS) * 4}，删除无主技能 {len(dead)}：{"、".join(dead)}')
miss = [h['name'] for h in heroes.values() if len(h.get('sk', [])) != 4 and h.get('src') != '杂兵']
print('四招不齐：', '、'.join(miss) if miss else '无')
shared = {sid: v for sid, v in used.items() if len(v) > 1 and any(heroes[x].get('src') != '杂兵' for x in v)}
print('共用技能 ID（杂兵除外）：', {sid: [heroes[x]['name'] for x in v] for sid, v in shared.items()} if shared else '无')
bad = [sid for sid in skills if 'name' not in skills[sid] or not skills[sid].get('fx')]
print('坏技能：', bad or '无')
print(f'档位提醒 {len(WARN)} 条')
for w in WARN: print('  ', w)
wp = collections.Counter((e['slot'], e['q']) for e in equip.values() if not e.get('exclusive') and e['slot'] == 'weapon')
print('通用兵器按品阶：', dict(wp))

json.dump(d, open(DATA, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('已写入', DATA)
