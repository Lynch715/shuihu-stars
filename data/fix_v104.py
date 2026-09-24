#!/usr/bin/env python3
"""
V10.4 数据：绝世三件套 · 羁绊补全 · 阵营 / fav_weapon / 范式修正
见 规范_V10.4_绝世三件套·羁绊补全·立绘修正.md

  python3 data/fix_v104.py

可重跑：每次都按本文件里的表把目标字段整个写一遍，不做增量叠加。
"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = os.path.join(ROOT, 'data', 'gameData_v10.json')
D = json.load(open(F, encoding='utf-8'))
H, E, B = D['heroes'], D['equipment'], D['bonds']
NAME = {}
for k, v in H.items(): NAME.setdefault(v['name'], k)
def hid(n):
    if n not in NAME: sys.exit(f'!! 找不到人物：{n}')
    return NAME[n]

# ── 效果写法 ─────────────────────────────────────────────────────────
S    = lambda st, p: {'k': 'pstat', 'stat': st, 'pct': p}
CR   = lambda v: {'k': 'pcrit', 'val': v}
CD   = lambda v: {'k': 'pcritdmg', 'val': v}
DM   = lambda p: {'k': 'pdmg', 'pct': p}
CUT  = lambda p: {'k': 'pcut', 'pct': p}
DG   = lambda c: {'k': 'pdodge', 'chance': c}
CT   = lambda c, m: {'k': 'pcounter', 'chance': c, 'mult': m}
FL   = lambda c, m: {'k': 'pfollow', 'chance': c, 'mult': m}
OH   = lambda c, st, d=1: {'k': 'ponhit', 'chance': c, 'st': st, 'dur': d}
RG   = lambda p: {'k': 'pregen', 'pct': p}
LOW  = lambda at, st, p: {'k': 'plow', 'at': at, 'stat': st, 'pct': p}
SH   = lambda p: {'k': 'pshield', 'pct': p}
IM   = lambda *st: {'k': 'pimmune', 'st': list(st)}
FIRST = {'k': 'pfirst'}
TOUGH = {'k': 'ptough'}
SKR  = lambda v: {'k': 'pskrate', 'val': v}
PI   = lambda p: {'k': 'ppierce', 'pct': p}
CMD  = lambda p: {'k': 'pcmd', 'pct': p}

# 面板：绝世统一值
PANEL = {
    'weapon': {'atk': 60, 'int': 40, 'pct_atk': 0.30},
    'armor':  {'def': 35, 'hp': 1000, 'pct_def': 0.24, 'pct_hp': 0.25},
    'mount':  {'agi': 26, 'pct_hp': 0.25},
}
# 本人穿的属性加成（owner_bonus）；坐骑的捷按表里写的
OB = {'weapon': {'atk': 0.20}, 'armor': {'def': 0.15, 'hp': 0.15}}

# fav_weapon 修正（同时决定三件套兵器的 weapon_type）
FAV = {'卢俊义': '枪', '呼延灼': '鞭', '岳云': '锤', '栾廷玉': '棍', '金兀术': '斧', '邓元觉': '禅杖',
       '史文恭': '枪', '方杰': '戟', '孙安': '剑', '史进': '刀', '武松': '刀', '琼英': '戟',
       '兀颜光': '戟', '卞祥': '斧', '周昂': '斧', '韩存保': '戟', '陶宗旺': '锹', '吉青': '棍'}

# 三件套：人物, 兵器, 战甲, 坐骑, 套装
#   件：(旧 ID 或 None, 名字, fx[, 坐骑捷加成])
SETS = [
 ('林冲',
  ('w5', '丈八蛇矛', [SKR(.10), PI(.20)]),
  (None, '风雪貂裘', [CUT(.12), LOW(.40, 'atk', .30)]),
  (None, '卷毛青鬃马', [FIRST], .20),
  ('逼上梁山', [TOUGH, LOW(.30, 'atk', .40)])),
 ('鲁智深',
  ('exc_9001', '水磨禅杖', [FL(.30, .8), DM(.10)]),
  (None, '皂布直裰', [RG(.04), IM('chaos')]),
  (None, '枣红马', [DG(.10)], .15),
  ('倒拔垂杨柳', [SH(.20), CT(.35, 1.0)])),
 ('卢俊义',
  (None, '点钢枪', [SKR(.08), CR(.12)]),
  ('a5', '麒麟黄金甲', [CUT(.15), SH(.15)]),
  (None, '雪白卷毛马', [DG(.12)], .20),
  ('河北三绝', [S('atk', .12), S('def', .12), S('agi', .12), CD(.30)])),
 ('岳飞',
  ('w8', '沥泉枪', [SKR(.10), PI(.15)]),
  (None, '岳帅明光铠', [CUT(.12), IM('stun', 'chaos')]),
  (None, '白龙驹', [FIRST], .20),
  ('精忠报国', [CMD(.30), RG(.03)])),
 ('栾廷玉',
  (None, '浑铁棒', [OH(.30, 'stun'), DM(.10)]),
  (None, '祝家庄铁叶甲', [CUT(.15), CT(.25, .8)]),
  (None, '铁青骢', [DG(.10)], .20),
  ('铁棒无敌', [FL(.30, 1.0), IM('disarm')])),
 ('岳云',
  ('yue_yun_chui', '八十二斤银锤', [OH(.25, 'stun'), PI(.20)]),
  (None, '银叶连环甲', [SH(.18), CUT(.10)]),
  (None, '银鬃马', [FIRST], .20),
  ('少年英雄', [LOW(.50, 'atk', .35), CR(.10)])),
 ('关胜',
  ('w19', '青龙偃月刀', [CR(.12), CD(.30)]),
  (None, '绿锦战袍', [CUT(.12), IM('silence', 'disarm')]),
  (None, '赤兔马', [FIRST], .20),
  ('大刀关胜', [SKR(.12), DM(.12)])),
 ('呼延灼',
  ('w42', '水磨八棱钢鞭', [OH(.30, 'disarm'), FL(.25, .8)]),
  (None, '连环马铠', [CUT(.18)]),
  ('m4', '踢雪乌骓', [FIRST], .15),
  ('连环马', [CMD(.25), SH(.15)])),
 ('金兀术',
  ('w36', '金雀开山斧', [PI(.25), DM(.08)]),
  (None, '四狼主金锁甲', [CUT(.15), IM('stun')]),
  (None, '拐子马', [FIRST], .20),
  ('铁浮屠', [SH(.20), CT(.30, .9)])),
 ('方腊',
  (None, '明教圣火剑', [OH(.25, 'burn', 2), SKR(.08)]),
  ('exc_9026', '方腊龙袍', [RG(.04), CUT(.10)]),
  (None, '帮源御马', [DG(.10)], .18),
  ('江南霸主', [CMD(.30), IM('chaos')])),
 ('石宝',
  ('w25', '劈风刀', [CR(.12), CD(.35)]),
  (None, '南离赤焰甲', [CUT(.12), LOW(.40, 'atk', .25)]),
  (None, '南国赤骥', [DG(.08)], .20),
  ('流星锤', [FL(.35, .9), OH(.20, 'stun')])),
 ('邓元觉',
  ('exc_9028', '宝光禅杖', [DM(.12), FL(.25, .7)]),
  (None, '宝光袈裟', [RG(.05), IM('chaos', 'silence')]),
  (None, '菊花青', [DG(.08)], .18),
  ('宝光如来', [SH(.20), TOUGH])),
 ('史文恭',
  ('exc_9036', '朱缨丈二枪', [CR(.15), PI(.20)]),
  (None, '白绫银甲', [CUT(.12), DG(.10)]),
  ('m3', '照夜玉狮子', [FIRST], .22),
  ('毒箭', [OH(.30, 'poison', 2), CD(.30)])),
 ('王寅',
  (None, '钢枪', [SKR(.10), PI(.15)]),
  (None, '青罗护心甲', [CUT(.12), S('int', .20)]),
  (None, '转山飞', [FIRST], .25),
  ('文臣武略', [DM(.12), LOW(.40, 'atk', .30)])),
 ('方杰',
  ('fang_jie_qiang', '方天画戟', [FL(.30, .8), CR(.10)]),
  (None, '殿前金甲', [CUT(.12), SH(.12)]),
  (None, '紫骝马', [DG(.10)], .20),
  ('殿后死战', [TOUGH, LOW(.30, 'atk', .40)])),
 ('卞祥',
  (None, '开山大斧', [DM(.12), PI(.15)]),
  (None, '丞相铁叶重甲', [CUT(.18)]),
  (None, '太行黑骓', [RG(.03)], .15),
  ('身长一丈', [SH(.25), CT(.30, .8)])),
 ('孙安',
  ('exc_9052', '镔铁双剑', [FL(.30, .8), CR(.10)]),
  (None, '殿帅铁甲', [CUT(.12), IM('disarm')]),
  (None, '晋阳赤骝', [FIRST], .20),
  ('力大无穷', [DM(.15), LOW(.40, 'atk', .25)])),
 ('阿里奇',
  (None, '狼尾长枪', [SKR(.08), OH(.20, 'bleed', 2)]),
  (None, '镀金鳞甲', [CUT(.12), IM('stun')]),
  (None, '辽东青马', [FIRST], .22),
  ('辽国先锋', [CR(.12), CD(.30)])),
 ('兀颜光',
  ('wuyan_guang_dao', '朱红画杆方天戟', [PI(.20), DM(.10)]),
  (None, '黑铁连身铠', [CUT(.18), IM('stun', 'disarm')]),
  (None, '统军铁骢', [SH(.10)], .15),
  ('全军统帅', [CMD(.35), RG(.03)])),
 ('杜壆',
  (None, '淮西蛇矛', [SKR(.10), CR(.10)]),
  (None, '护心镜甲', [CUT(.10), CT(.25, .9)]),
  (None, '五花马', [FIRST], .20),
  ('淮西第一', [DM(.15), TOUGH])),
 ('酆泰',
  (None, '劈山刀', [CR(.12), CD(.30)]),
  (None, '铁壁甲', [CUT(.15), SH(.12)]),
  (None, '淮南黄骠马', [DG(.08)], .20),
  ('淮西双璧', [FL(.30, .8), LOW(.40, 'atk', .25)])),
 ('琼妖纳廷',
  (None, '朔方长槊', [PI(.15), OH(.20, 'bleed', 2)]),
  (None, '银铃鳞甲', [DG(.12), CUT(.08)]),
  (None, '朔漠追风马', [FIRST], .25),
  ('大漠风暴', [SKR(.12), CR(.10)])),
 ('周昂',
  (None, '开山金蘸斧', [OH(.25, 'stun'), DM(.08)]),
  (None, '铜筋铁甲', [CUT(.15), RG(.03)]),
  (None, '枣骝马', [FIRST], .20),
  ('锐不可当', [DM(.15), PI(.15)])),
 ('王焕',
  (None, '浑铁枪', [SKR(.08), CR(.10)]),
  (None, '宿将旧甲', [CUT(.15), IM('chaos')]),
  (None, '银合马', [RG(.03)], .15),
  ('老而弥坚', [LOW(.50, 'atk', .25), LOW(.50, 'def', .25), TOUGH])),
 ('高宠',
  ('gao_chong_qiang', '錾金虎头枪', [PI(.25), SKR(.08)]),
  (None, '白马银铠', [CUT(.12), SH(.12)]),
  (None, '照月白马', [FIRST], .22),
  ('枪挑铁滑车', [DM(.18), RG(.04)])),
 ('王进',
  ('wang_jin_gun', '齐眉熟铜棍', [OH(.25, 'disarm'), FL(.25, .8)]),
  (None, '教头旧战袍', [DG(.12), CUT(.08)]),
  (None, '延安府青骢', [FIRST], .20),
  ('禁军传承', [CMD(.30), CR(.10)])),
]

# ── 1. fav_weapon ────────────────────────────────────────────────────
for n, w in FAV.items(): H[hid(n)]['fav_weapon'] = w

# ── 2. 三件套 ────────────────────────────────────────────────────────
jue = {k for k, v in H.items() if v['q'] == 6}
done, sets = set(), {}
pool = set(D['EXCLUSIVE_POOL'])
for row in SETS:
    n, parts, (sname, sfx) = row[0], row[1:4], row[4]
    h = hid(n); done.add(h)
    ids = []
    for slot, part in zip(('weapon', 'armor', 'mount'), parts):
        old, name, fx = part[0], part[1], part[2]
        eid = old or f'jx_{h}_{slot[0]}'
        prev = E.get(eid, {})
        e = {'n': name, 'q': '绝世', 'slot': slot, 'desc': f'{H[h]["name"]}专属',
             'exclusive': h, 'owner_bonus': {'agi': part[3]} if slot == 'mount' else dict(OB[slot]),
             'fx': fx}
        e.update(PANEL[slot])
        if slot == 'weapon': e['weapon_type'] = H[h].get('fav_weapon') or prev.get('weapon_type') or '刀'
        E[eid] = e
        pool.add(eid); ids.append(eid)
    sets[h] = {'name': sname, 'items': ids, 'fx': sfx}
miss = jue - done
if miss: sys.exit('!! 这些绝世没配三件套：' + '、'.join(H[k]['name'] for k in miss))
D['EXCLUSIVE_POOL'] = sorted(pool)
D['exc_sets'] = sets

# ── 2b. 其余专属改名（原著有的照原著，没有的按物件起，不再「人名+兵器」）──
WPN = {'atk': 30, 'int': 16, 'pct_atk': 0.16}          # 名将兵器面板，同祖传宝刀
EXR = {
 'w7':  {'n': '画杆方天戟'},                             # 通用，给方杰那件让名
 'w4':  {'n': '偃月大刀'},                               # 通用，给关胜那件让名
 'w6':  {'n': '开山板斧'},                               # 通用，给李逵那件让名
 'w17': {'n': '三尖刀'},                                 # 通用，给史进那件让名
 'w24': {'n': '浑铁点钢枪'},                             # 通用，给卢俊义那件让名
 'w23': {'n': '熟铁锏'},                                 # 通用，原来就和 w10 重名
 'w12': {'n': '松纹古定剑'},
 'w20': {'n': '银杆画戟', 'weapon_type': '戟', 'desc': '郭盛专属'},
 'w32': {'n': '双铜锤'},
 'w38': {'n': '造船斧', 'weapon_type': '斧'},
 'w50': {'n': '锦袋飞石', 'weapon_type': '弓'},
 's16': {'n': '雪花镔铁戒刀', 'slot': 'weapon', 'weapon_type': '刀', **WPN, 'drop': ['pct_def', 'pct_hp']},
 's25': {'n': '拳经枪谱'},
 's12': {'n': '青囊药箱'},
 's13': {'n': '湖笔徽墨'},
 's23': {'n': '猿臂宝剑'},
 's24': {'n': '奔雷车图'},
 'exc_9022': {'n': '海州知州印'},
 'zhang_bao_gun': {'n': '镔铁棍'},
 'wang_heng_dao': {'n': '矮脚虎长枪', 'weapon_type': '枪'},   # 原来叫王横刀，王横是说岳里另一个人
 'tang_long_chui': {'n': '铁瓜锤'},
 'cao_zheng_dao': {'n': '解腕尖刀'},
 'zou_run_jiao': {'n': '登云山铁棍', 'weapon_type': '棍'},
 'zhu_fu_dao': {'n': '沂水朴刀'},
 'zheng_tianshou_qiang': {'n': '清风山长枪'},
 'tao_zongwang_fu': {'n': '开山铁锹', 'weapon_type': '锹'},
 'qiao_daoqing_jian': {'n': '幻魔宝剑'},
 'fan_rui_chui': {'n': '流星铜锤'},
 'tian_hu_dao': {'n': '晋王宝刀'},
 'wang_qing_dao': {'n': '楚王宝刀'},
 'pang_wanchun_gong': {'n': '穿杨弓'},
 'exc_9008': {'n': '三尖两刃刀', 'weapon_type': '刀'},
 'exc_9009': {'n': '双板斧', 'weapon_type': '斧'},
 'exc_9016': {'n': '雷部金甲'},
 'exc_9018': {'n': '杨家银枪', 'weapon_type': '枪'},
 'exc_9019': {'n': '狼牙棒', 'weapon_type': '棍'},
 'exc_9021': {'n': '砍柴刀', 'weapon_type': '刀'},
 'exc_9023': {'n': '镔铁双枪', 'weapon_type': '枪'},
 'exc_9037': {'n': '五股叉', 'weapon_type': '叉'},
 'exc_9038': {'n': '分水叉', 'weapon_type': '叉'},
 'exc_9039': {'n': '揭阳朴刀', 'weapon_type': '刀'},
 'exc_9040': {'n': '桃花山长枪', 'weapon_type': '枪'},
 'exc_9041': {'n': '大砍刀', 'weapon_type': '刀'},
 'exc_9042': {'n': '宪字点钢枪', 'weapon_type': '枪'},      # 原来叫张显长枪，张显、张宪是两个人
 'exc_9043': {'n': '斩马刀', 'weapon_type': '刀'},
 'exc_9044': {'n': '铁狼牙棒', 'weapon_type': '棍'},
 'exc_9045': {'n': '亮银枪', 'weapon_type': '枪'},
 'exc_9047': {'n': '锁子连环铠'},
 'exc_9048': {'n': '宣花大斧', 'weapon_type': '斧'},
 'exc_9049': {'n': '厚背砍刀', 'weapon_type': '刀'},
 'exc_9051': {'n': '镇国画戟', 'weapon_type': '戟'},
}
for eid, kv in EXR.items():
    e = E[eid]; kv = dict(kv)
    for k in kv.pop('drop', []): e.pop(k, None)
    e.update(kv)
    if e.get('exclusive') and e.get('desc', '').endswith(('关联', '专属')):
        e['desc'] = f"{H[e['exclusive']]['name']}专属"
# 同名检查
names = {}
for k, e in E.items(): names.setdefault(e['n'], []).append(k)
dup = {n: ks for n, ks in names.items() if len(ks) > 1}

# ── 3. 阵营字段 ──────────────────────────────────────────────────────
GROUP = {'王焕': 'jiedu', '韩存保': 'jiedu', '孙安': 'tianhu', '唐斌': 'tianhu',
         '耶律得重': 'liao', '贺重宝': 'liao', '韩延寿': 'liao'}
for n, g in GROUP.items():
    H[hid(n)]['group'] = g; H[hid(n)]['faction'] = g

# ── 4. 范式图 ────────────────────────────────────────────────────────
# 道士用 arch_taoist（美术那边已出图）
ARCH = {'乔道清': 'arch_taoist', '马灵': 'arch_taoist', '张天师': 'arch_taoist', '包道乙': 'arch_taoist',
        '洞仙文荣': 'arch_taoist', '王进': 'arch_gen_qiang', '韩存保': 'arch_gen_qiang',
        '曹宁': 'arch_gen_qiang', '郑怀': 'arch_gen_qiang'}
for n, a in ARCH.items(): H[hid(n)]['arch'] = a

# ── 4b. 人物归属与称号（Lynch 核对原著后定） ─────────────────────────
GROUP2 = {'周昂': 'jiedu', '袁朗': 'wangqing', '田实': 'tianhu'}
for n, g in GROUP2.items():
    H[hid(n)]['group'] = g; H[hid(n)]['faction'] = g
INFO = {
 '周昂':   {'title': '禁军副教头', 'bio': '周昂，高俅帐前心腹，八十万禁军副教头，与丘岳并称。使一柄开山金蘸斧，随高太尉征讨梁山。'},
 '贺重宝': {'title': '辽国副统军', 'bio': '贺重宝，辽国兀颜统军部下副统军，人称贺统军。'},
 '于玉麟': {'title': '熊威将', 'bio': '于玉麟，田虎部下，盖州钮文忠麾下四威将之一，号熊威将，与方琼、安士荣、褚亨并列。'},
 '田实':   {'title': '田彪之子', 'bio': '田实，田彪之子、田虎之侄。晋宁城破时被杀。'},
 '哈兰生': {'title': '归化庄都团练', 'bio': '哈兰生，《荡寇志》人物，归化庄都团练。受云天彪檄调，征剿梁山。'},
 '沙志仁': {'title': '正一庄都团练', 'bio': '沙志仁，《荡寇志》人物，正一庄都团练。受云天彪檄调，征剿梁山。'},
 '韩存保': {'title': '十节度'},
 '萧嘉穗': {'bio': '萧嘉穗，荆南布衣豪杰。王庆据荆南时，发动城中百姓反正，助宋军收复荆南。宋江敬重其为人，萧嘉穗却不受官职，飘然而去。'},
}
for n, kv in INFO.items(): H[hid(n)].update(kv)

# 同一人拆成了两个：并掉。关卡、卡池、羁绊里的引用全换成留下的那个；
# 旧存档里的人由 Save.migrate 按 hero_remap 换过去
MERGE = {'he_tongjun': 'he_chongbao', 'yu_yujue': 'yu_yulin'}
remap = D.setdefault('hero_remap', {})
for old, new in MERGE.items():
    remap[old] = new
    if old not in H: continue
    del H[old]
    for top in list(D):
        if top in ('heroes', 'hero_remap'): continue
        txt = json.dumps(D[top], ensure_ascii=False)
        if f'"{old}"' in txt: D[top] = json.loads(txt.replace(f'"{old}"', f'"{new}"'))
for k in ('LEGEND_POOL', 'GOLD_POOL'):
    D[k] = list(dict.fromkeys(D[k]))
B = D['bonds']
for b in B: b['members'] = list(dict.fromkeys(b['members']))
NAME = {}
for k, v in H.items(): NAME.setdefault(v['name'], k)

# ── 5. 羁绊 ──────────────────────────────────────────────────────────
byid = {b['id']: b for b in B}
def tiers(ns):
    return [{'need': n, 'rate': r} for n, r in zip(ns, (0.4, 0.7, 1))]
# 魅已删：三条死羁绊改属性
for bid, attr in (('bond_31', 'atk'), ('bond_42', 'atk'), ('bond_114', 'hp')):
    b = byid[bid]; b['attr'] = attr
    b['effect'] = f'{attr}+{b["val"]}%'; b['desc'] = f'{b["name"]}：{b["effect"]}'
NEW = [
 ('bond_v1',  '方腊四大元帅', '石宝 邓元觉 司行方 厉天闰', 'atk', 11, (2, 3, 4)),
 ('bond_72',  '方氏宗族', '方腊 方皭 方裕 方杰 方天定 方貌 方垕 方肥 方天寿', 'hp', 14, (2, 4, 7)),
 ('bond_v2',  '帮源死守', '王寅 方杰', 'atk', 8, (2,)),
 ('bond_v3',  '方腊朝班', '娄敏中 祖士远 吕师囊 方肥', 'int', 9, (2, 2, 4)),
 ('bond_v4',  '厉家兄弟', '厉天闰 厉天祐', 'atk', 8, (2,)),
 ('bond_v5',  '包郑师徒', '包道乙 郑彪', 'int', 8, (2,)),
 ('bond_v6',  '方腊偏将', '高玉 卜树英 钱振鹏', 'atk', 9, (2, 2, 3)),
 ('bond_v7',  '盖州守将', '钮文忠 方琼 安士荣 褚亨 于玉麟', 'atk', 11, (2, 3, 5)),
 ('bond_v8',  '河北上将', '卞祥 孙安 山士奇 田定 唐斌', 'atk', 12, (2, 3, 5)),
 ('bond_v9',  '孙乔同乡', '孙安 乔道清', 'int', 8, (2,)),
 ('bond_v10', '琼英张清', '琼英 张清', 'atk', 8, (2,)),
 ('bond_v11', '邬梨义女', '邬梨 琼英', 'hp', 8, (2,)),
 ('bond_v12', '淮西上将', '杜壆 酆泰 縻貹 马劲 滕戡 袁朗', 'atk', 12, (2, 3, 6)),
 ('bond_63',  '王庆军师', '王庆 李助 刘敏', 'int', 9, (2, 2, 3)),
 ('bond_v13', '高太尉麾下', '王焕 韩存保 周昂 高俅', 'def', 9, (2, 3, 4)),
 ('bond_v14', '耶律父子', '耶律得重 耶律宗云 耶律宗电 耶律宗雷 耶律宗霖', 'hp', 12, (2, 3, 5)),
 ('bond_v15', '兀颜统军帐下', '兀颜光 阿里奇 琼妖纳廷 楚明玉 贺重宝 耶律得华 洞仙文荣 韩延寿', 'atk', 13, (2, 4, 8)),
 ('bond_v16', '辽国先锋', '阿里奇 琼妖纳廷', 'atk', 8, (2,)),
 ('bond_55',  '猿臂寨', '陈希真 陈丽卿 祝永清 真祥麟', 'atk', 10, (2, 2, 4)),
 ('bond_v17', '黑旋风步卒', '李逵 鲍旭 项充 李衮', 'atk', 10, (2, 2, 4)),
 ('bond_v18', '望仙桥刺秦', '施全 秦桧', 'atk', 8, (2,)),
 ('bond_v19', '田彪父子', '田彪 田实', 'hp', 8, (2,)),
 ('bond_v20', '英雄相惜', '宋江 萧嘉穗', 'int', 8, (2,)),
 ('bond_v21', '归化三庄', '哈兰生 沙志仁', 'hp', 8, (2,)),
 ('bond_v22', '天彪檄调', '云天彪 哈兰生 沙志仁', 'atk', 9, (2, 2, 3)),
]
for bid, name, mem, attr, val, tv in NEW:
    b = {'id': bid, 'name': name, 'type': 'relation', 'members': [hid(n) for n in mem.split()],
         'effect': f'{attr}+{val}%', 'desc': f'{name}：{attr}+{val}%', 'attr': attr, 'val': val, 'tiers': tiers(tv)}
    if bid in byid: byid[bid].clear(); byid[bid].update(b)
    else: B.append(b); byid[bid] = b

json.dump(D, open(F, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# ── 报告 ─────────────────────────────────────────────────────────────
inb = {m for b in B for m in b['members']}
print(f'三件套 {len(sets)} 人 / {sum(len(s["items"]) for s in sets.values())} 件；专属池 {len(pool)} 件')
print(f'羁绊 {len(B)} 条')
print('重名装备：', dup or '无')
for q, t in ((6, '绝世'), (5, '天罡'), (4, '名将')):
    left = [v['name'] for k, v in H.items() if v['q'] == q and k not in inb]
    print(f'{t} 无羁绊 {len(left)}：{"、".join(left)}')
