#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
水浒群星录 V10.6 · 文官扩编（可重跑）
  python3 data/fix_v106.py

每次都从 data/gameData_v105_base.json（V10.5 的数据）出发，整份重算后写回 gameData_v10.json。
见 规范_V10.6_文官扩编.md

  1. 新建 10 人，改 11 位老人（品阶、五维、成长、技能、arch、擅长）
  2. 敌方 foe 快照：升过品阶的老人当敌将时用 V10.5 的面板
  3. 驱散：新老文官一共 21 人带驱散
  4. 12 个绝世文官的三件套（36 件）+ 31 件通用文官装备
  5. 8 条新羁绊
  6. 报告：技能档位、全员面板、池子变化
"""
import json, os, re, sys, collections

ROOT = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(ROOT, 'gameData_v105_base.json')
OUT = os.path.join(ROOT, 'gameData_v10.json')

src = open(os.path.join(ROOT, 'rework_skills.py'), encoding='utf-8').read().split('# ── 主流程')[0]
ns = {'__file__': os.path.join(ROOT, 'rework_skills.py')}
_argv = sys.argv; sys.argv = [sys.argv[0]]
exec(compile(src, 'rework_skills.py', 'exec'), ns)
sys.argv = _argv
_parse, settle, WARN = ns['parse'], ns['settle'], ns['WARN']

def parse(spec):
    """在 rework 的 DSL 上加两样：dmg 的 vsctrl=、st poison 末尾的 Ln（层数）"""
    extra = {}
    m = re.search(r' vsctrl=([\d.]+)', spec)
    if m: extra['vsCtrl'] = float(m.group(1)); spec = spec.replace(m.group(0), '')
    layers = re.findall(r'(st \S+ poison[^;]*?) L(\d)', spec)
    for body, n in layers: spec = spec.replace(f'{body} L{n}', body)
    sk = _parse(spec)
    li = 0
    for f in sk['fx']:
        if f['k'] == 'dmg' and 'vsCtrl' in extra: f['vsCtrl'] = extra['vsCtrl']
        if f['k'] == 'status' and f['st'] == 'poison' and li < len(layers): f['layers'] = int(layers[li][1]); li += 1
    return sk

D = json.load(open(BASE, encoding='utf-8'))
H, SK, E, B = D['heroes'], D['skills'], D['equipment'], D['bonds']
QN = {1: '凡', 2: '良', 3: '猛', 4: '名', 5: '天罡', 6: '绝世'}

# ── 1  人物 ──────────────────────────────────────────────────────────
GR = {
  'mage': {'atk': .017, 'int': .047, 'def': .018, 'agi': .022, 'hp': .22},
  'sup':  {'atk': .020, 'int': .040, 'def': .028, 'agi': .024, 'hp': .30},
  'jian': {'atk': .018, 'int': .047, 'def': .022, 'agi': .023, 'hp': .26},
  'wu':   {'atk': .035, 'int': .022, 'def': .030, 'agi': .028, 'hp': .35},
}
# id: (名, 品阶, 武, 防, 智, 捷, 血, 成长, 擅长, arch)
STAT = {
 'luo_zhenren':   ('罗真人', 6, 42, 52, 100, 60, 115, 'mage', '剑', 'arch_taoist'),
 'gongsun_sheng': ('公孙胜', 6, 50, 50,  99, 62, 118, 'mage', '剑', 'arch_taoist'),
 'wu_yong':       ('吴用',   6, 40, 66,  97, 58, 145, 'mage', '鞭', 'arch_civ_lit'),
 'song_jiang':    ('宋江',   6, 60, 78,  92, 66, 170, 'sup',  '剑', 'arch_civ_lit'),
 'qiao_daoqing':  ('乔道清', 6, 48, 42,  97, 56, 115, 'mage', '剑', 'arch_taoist'),
 'liu_huiniang':  ('刘慧娘', 6, 52, 58,  97, 66, 140, 'mage', '刀', 'arch_woman'),
 'zong_ze':       ('宗泽',   6, 62, 76,  92, 64, 168, 'sup',  '剑', 'arch_civ_lit'),
 'gao_qiu':       ('高俅',   6, 55, 72,  96, 65, 150, 'jian', '棍', 'arch_civ_lit'),
 'cai_jing':      ('蔡京',   6, 45, 66,  96, 60, 145, 'jian', '扇', 'arch_civ_lit'),
 'qin_hui':       ('秦桧',   6, 48, 70,  97, 62, 148, 'jian', '扇', 'arch_civ_lit'),
 'zhang_shuye':   ('张叔夜', 6, 88, 80,  93, 68, 165, None,   '刀', 'arch_civ_lit'),
 'chen_xizhen':   ('陈希真', 6, 84, 64,  95, 74, 145, None,   '剑', 'arch_taoist'),
 'li_gang':       ('李纲',   5, 45, 70,  90, 58, 150, 'sup',  '剑', 'arch_civ_lit'),
 'su_yuanjing':   ('宿元景', 5, 40, 58,  90, 60, 130, 'sup',  '扇', 'arch_civ_lit'),
 'he_taiping':    ('贺太平', 5, 38, 55,  92, 55, 120, 'mage', '笔', 'arch_civ_lit'),
 'zhang_bangchang':('张邦昌',5, 42, 52,  89, 58, 118, 'jian', '扇', 'arch_civ_lit'),
 'li_ruoshui':    ('李若水', 4, 40, 62,  84, 52, 140, 'sup',  '笔', 'arch_civ_lit'),
 'gai_tianxi':    ('盖天锡', 4, 50, 55,  86, 58, 120, 'mage', '笔', 'arch_civ_lit'),
 'jin_chengying': ('金成英', 4, 86, 70,  68, 72, 168, 'wu',   '刀', 'arch_gen_dao'),
 'wan_qixie':     ('万俟卨', 4, 40, 50,  86, 56, 118, 'jian', '笔', 'arch_civ_lit'),
 'luo_ruji':      ('罗汝楫', 4, 38, 48,  84, 55, 112, 'jian', '笔', 'arch_civ_lit'),
}
NEW = {
 'luo_zhenren':   ('水浒传',   '二仙山真人', '罗真人，蓟州二仙山紫虚观的道长，公孙胜的师父。戴宗、李逵上山求他放公孙胜下山破高廉，李逵嫌他推托，半夜摸上去砍了他一斧，第二天却见他好端端坐着。罗真人拿一方手帕化作红云，把李逵摔进蓟州府里吃了一场苦头，这才放公孙胜下山。'),
 'zong_ze':       ('说岳全传', '东京留守', '宗泽，北宋末年的东京留守。金兵南下时死守汴梁，招抚河北义军，岳飞早年就在他帐下。一再上书请高宗回銮北伐，都没有下文，临终前连呼三声「过河」而死。'),
 'li_gang':       ('说岳全传', '主战宰臣', '李纲，靖康年间的主战派大臣。金兵第一次围汴京时由他主持城防，硬是把金兵顶了回去。和议一成就被罢官，前后几起几落。'),
 'su_yuanjing':   ('水浒传',   '殿前太尉', '宿元景，殿前太尉，朝中少有肯替梁山说话的人。奉旨去西岳降香，被宋江借了御香仪仗去赚华州；事后他反倒力主招安，成了梁山受招安的牵线人。'),
 'he_taiping':    ('荡寇志',   '山东安抚使', '贺太平，《荡寇志》里的山东安抚使。看着迂缓随俗，奸党背后叫他「贺鼻涕」，可一碰到举贤、除奸两件事就一刻不停。后来拿到童贯私通梁山的书信，当面奏明天子，把童贯送上了法场。金成英是他的得意门生。'),
 'zhang_bangchang':('说岳全传','伪楚僭主', '张邦昌，北宋宰相。靖康之变后被金人立为伪楚皇帝，做了三十三天，金兵一撤就去迎康王即位，最后还是被赐死。《说岳》里把他写成通金卖国的奸臣。'),
 'li_ruoshui':    ('说岳全传', '吏部侍郎', '李若水，靖康年间的吏部侍郎，随宋钦宗到金营。金人要废钦宗，他抱着钦宗不放，破口大骂，被割了舌头仍骂不绝口，终被杀害。'),
 'gai_tianxi':    ('荡寇志',   '盖青天', '盖天锡，《荡寇志》人物，汝南人，进士出身，二十六岁做郓城知县。骑得劣马、开得硬弓，最拿手的却是断案，人称「还魂包孝肃」「盖青天」。金银寨一案，他从刘二身上的绳痕看出破绽，一路审出了蔡京的亲笔信。'),
 'jin_chengying': ('荡寇志',   '武解元', '金成英，《荡寇志》人物，曹州人，天河楼前武解元，一身好武艺，仗义疏财。被曹州知府高衙内陷害，兄弟儿子下狱，只身逃走。后投恩师贺太平，献策收复曹州，与韦扬隐合力斩了董平，实授曹州都监。'),
 'luo_ruji':      ('说岳全传', '御史', '罗汝楫，秦桧党羽。岳飞下狱时，他和万俟卨轮番上章弹劾，罗织罪名。'),
}
FOE_KEYS = ('q', 'atk', 'def', 'int', 'agi', 'hp', 'gr')
changed_old = []
for hid, (name, q, a, df, i, ag, hp, gk, fav, arch) in STAT.items():
    if hid in NEW:
        srcb, title, bio = NEW[hid]
        H[hid] = {'name': name, 'src': srcb, 'title': title, 'bio': bio, 'bond_item': '', 'sk': []}
    else:
        t = H[hid]
        if t['name'] != name: sys.exit(f'!! {hid} 名字对不上：{t["name"]}')
        t['foe'] = {k: t[k] for k in FOE_KEYS}
        changed_old.append(hid)
    t = H[hid]
    t.update({'q': q, 'atk': a, 'def': df, 'int': i, 'agi': ag, 'hp': hp, 'fav_weapon': fav, 'arch': arch})
    if gk: t['gr'] = dict(GR[gk])

# ── 2  技能 ──────────────────────────────────────────────────────────
KITS = {
 'luo_zhenren': [('五雷天罚', 'A50 dmg all 1.1 src=int; st hit stun 0.2 1'),
                 ('化帕腾云', 'S3 st strongest stun 0.8 1; st self dodge 1 2 0.2'),
                 ('紫虚道法', 'C buff mates int 0.25 3'),
                 ('道心无碍', 'P pshield 0.20; pcut 0.08')],
 'song_jiang':  [('及时雨',   'A55 heal mates pct=0.12; cleanse mates'),
                 ('仗义疏财', 'A45 buff mates atk 0.24 2; buff mates int 0.24 2'),
                 ('呼保义',   'S3 shield mates 0.15'),
                 ('领袖魅力', 'C buff mates def 0.15 3; buff mates atk 0.10 3')],
 'liu_huiniang':[('慧眼识破', 'A55 dispel single; dmg hit 2.4 src=int; st hit vuln 0.4 2 0.2'),
                 ('奔雷车',   'A50 dmg all 1.0 src=int; st hit burn 0.5 2'),
                 ('机关算尽', 'A45 st smartest chaos 0.7 1; dmg smartest 1.6 src=int'),
                 ('奇门遁甲', 'S3 shield mates 0.15')],
 'zong_ze':     [('三呼过河', 'A50 buff mates atk 0.25 2; buff mates int 0.25 2'),
                 ('老当益壮', 'P plow 0.4 int 0.4'),
                 ('东京留守', 'S3 shield mates 0.15'),
                 ('知人善任', 'C buff mates atk 0.12 3; buff mates def 0.12 3')],
 'gao_qiu':     [('蹴鞠得幸', 'A55 dmg strongest 2.4 src=int; st hit stun 0.35 1'),
                 ('权倾朝野', 'A45 debuff all atk 0.15 2; st smartest chaos 0.5 1; dmg all 0.9 src=int'),
                 ('排挤忠良', 'S2 steal strongest atk 0.35 3; st strongest silence 0.6 1'),
                 ('太尉威风', 'C buff mates def 0.15 3; buff mates atk 0.10 3')],
 'cai_jing':    [('弄权',     'A50 dispel all; dmg all 0.8 src=int'),
                 ('搜刮民脂', 'S2 steal all atk 0.12 3'),
                 ('奸相弄权', 'A45 st smartest chaos 0.7 1; dmg smartest 1.8 src=int'),
                 ('六贼之首', 'C buff mates int 0.20 3')],
 'qin_hui':     [('莫须有',   'A55 st smartest silence 0.8 2; st smartest vuln 1 2 0.3; dmg smartest 2.2 src=int'),
                 ('十二道金牌', 'S3 st all silence 0.45 1'),
                 ('口蜜腹剑', 'A45 dmg single 2.6 src=int; st hit poison 0.5 3 L2'),
                 ('东窗密议', 'C buff mates agi 0.18 3')],
 'li_gang':     [('力守汴京', 'S3 shield mates 0.15'),
                 ('坚壁',     'C buff mates def 0.18 3'),
                 ('主战',     'A45 buff mates atk 0.15 2'),
                 ('忠直',     'P pcut 0.10')],
 'su_yuanjing': [('招安',     'A50 st rand2 chaos 0.5 1'),
                 ('太尉宽仁', 'A45 heal mates 0.6'),
                 ('奏请',     'C buff mates int 0.12 3'),
                 ('宣诏招抚', 'S3 dispel single; cleanse mates')],
 'he_taiping':  [('经略调度', 'C buff mates agi 0.2 3'),
                 ('诛佞',     'A50 dispel strongest; dmg strongest 1.4 src=int; st hit silence 0.4 1'),
                 ('举贤',     'A45 buff mates atk 0.12 2; buff mates int 0.12 2'),
                 ('深藏风力', 'P pfirst; pstat int 0.08')],
 'zhang_bangchang':[('割地求和', 'S3 st all vuln 1 2 0.22; debuff self def 0.2 2'),
                 ('伪楚僭号', 'A45 st smartest chaos 0.6 1; dmg smartest 0.9 src=int'),
                 ('开门揖盗', 'A50 dispel single; dmg hit 1.4 src=int'),
                 ('卖国求荣', 'C buff mates int 0.10 3')],
 'li_ruoshui':  [('骂贼',     'S2 st self taunt 1 2; shield self 0.25'),
                 ('殉节',     'P ptough; pcut 0.06'),
                 ('忠愤',     'A45 st strongest silence 0.5 1; dmg strongest 1.0 src=int'),
                 ('直谏',     'A50 dispel single; dmg hit 1.2 src=int')],
 'gai_tianxi':  [('明察秋毫', 'A50 dispel single; st hit vuln 1 2 0.2; dmg hit 1.2 src=int'),
                 ('折狱',     'A55 dmg single 1.5 src=int'),
                 ('缉拿',     'S3 st strongest silence 0.5 1; dmg strongest 1.0 src=int'),
                 ('盖青天',   'C buff mates int 0.10 3')],
 'jin_chengying':[('武解元',  'A55 dmg single 1.9; st hit bleed 0.3 2'),
                 ('议复曹州', 'C buff mates atk 0.10 3'),
                 ('天河楼前', 'A45 dmg row 1.2'),
                 ('轻财好义', 'P pstat hp 0.10; pcounter 0.2 0.8')],
 'wan_qixie':   [('罗织罪名', 'A55 dmg single 1.0 src=int; st hit poison 1 2 L2; st hit bleed 0.7 2'),
                 ('酷吏审讯', 'A45 st smartest silence 0.7 2; dmg smartest 0.9 src=int'),
                 ('大理寺狱', 'S3 st all poison 1 3 L2'),
                 ('酷吏',     'P pregen 0.02')],
 'luo_ruji':    [('交章弹劾', 'A55 dmg single 1.4 src=int vsctrl=1.0'),
                 ('附和',     'A45 st smartest silence 0.7 1; dmg smartest 0.8 src=int'),
                 ('落井下石', 'S2 dmg weakest 1.2 src=int'),
                 ('党附',     'C buff mates int 0.08 3')],
}
old_sk = {s for v in H.values() for s in v.get('sk', [])}
for hid, kit in KITS.items():
    ids = []
    for i, (nm, spec) in enumerate(kit):
        sid = f'v6_{hid}_{i+1}'
        sk = parse(spec); sk['name'] = nm
        SK[sid] = sk; ids.append(sid)
    H[hid]['sk'] = ids


# ── 2a 老绝世文官的技能结构：每人最多一个必中技 ─────────────────────
#   引擎先放冷却好的必中技；两个冷却 2 的必中技轮着转，主动技几乎轮不上（V10.6 实测乔道清一场输出为 0）
OLDKIT = {
 'wy1':  ('智多星',     'A65 st smartest silence 0.9 2; st smartest chaos 0.5 1; dmg smartest 1.8 src=int'),
 'wy4':  ('智取生辰纲', 'A50 dmg all 1.0 src=int; st hit stun 0.25 1'),       # 吴用：原「妙手回春」必中群疗
 'gss1': ('五雷天罡正法', 'A55 dmg single 2.4 src=int; st hit stun 0.3 1'),
 'qdq1': ('幻魔真人',   'A50 dmg all 1.1 src=int'),
 'cxt1': ('猿臂剑法',   'A55 dmg single 2.4 src=int; st hit bleed 0.3 2'),
 'cxt2': ('希真幻术',   'A50 dispel rand2; st hit chaos 0.5 1; dmg hit 0.9 src=int'),
 'zsz1': ('忠勇双全',   'A55 dmg single 2.4; st hit vuln 0.4 2 0.2'),
 'zsz2': ('一代名臣',   'C buff mates int 0.16 3; buff mates atk 0.10 3'),
 'zsz3': ('忠烈护国',   'S2 shield mates 0.14'),
 'zsz4': ('朝廷威仪',   'A45 dmg col 1.6; st hit silence 0.3 1'),
 'qdq3': ('幻魔大法',   'S2 steal smartest int 0.35 3'),                     # 乔道清：偷智改成偷智最高的
 'qdq4': ('道法回春',   'P pregen 0.03; pdodge 0.12'),                       # 乔道清：原必中自疗
 'cxt3': ('巧夺天工',   'P pstat int 0.12; pcrit 0.10'),                     # 陈希真：原必中偷智
}
for sid, (nm, spec) in OLDKIT.items():
    sk = parse(spec); sk['name'] = nm; SK[sid] = sk
KITS_TUNE_EXTRA = {'wu_yong': ['wy4'], 'qiao_daoqing': [], 'chen_xizhen': []}

# ── 2b 定标：新写的技能按 rework_skills 那把尺子往本档中线拉 ─────────────
#   只缩放数值（伤害倍率、增益/护盾/治疗/夺取的百分比、被动百分比），控制几率不动。
#   上限：单体伤害 2.6、群体 1.2、增益 0.35、护盾 0.30、治疗百分比 0.20、夺取 0.40、被动 0.20。
NOTUNE = {'v6_cai_jing_2', 'v6_qin_hui_2', 'v6_zhang_bangchang_1', 'v6_li_ruoshui_2', 'v6_wan_qixie_4', 'v6_gao_qiu_3'}   # 尺子量不准的几招，手定
target, value, SURE_K, CMD_K, PAS_K = ns['target'], ns['value'], ns['SURE_K'], ns['CMD_K'], ns['PAS_K']
AOE = {'all', 'row', 'col', 'rand2', 'rand3', 'front', 'back'}
def scaled(sk, k):
    out = json.loads(json.dumps(sk))
    for f in out['fx']:
        if f['k'] == 'dmg': f['mult'] = round(min(f['mult'] * k, 1.2 if f['tg'] in AOE else 2.6), 2)
        elif f['k'] in ('buff', 'debuff'): f['pct'] = round(min(f['pct'] * k, 0.35), 2)
        elif f['k'] == 'shield': f['pct'] = round(min(f['pct'] * k, 0.30), 2)
        elif f['k'] == 'heal':
            if 'pct' in f: f['pct'] = round(min(f['pct'] * k, 0.20), 2)
            else: f['mult'] = round(min(f['mult'] * k, 1.6), 2)
        elif f['k'] == 'steal': f['pct'] = round(min(f['pct'] * k, 0.40), 2)
        elif f['k'] in ('pstat', 'pcut', 'pdmg', 'pregen'): f['pct'] = round(min(f['pct'] * k, 0.20), 2)
    return out
def ev_of(sk, q, slot):
    t = target(q, slot); v = value(sk['fx'], sk['cat'])
    if sk['cat'] == 'active': return sk['rate'] * (v - 1), t
    if sk['cat'] == 'sure': return v / (sk['cd'] + 1), t * SURE_K
    if sk['cat'] == 'cmd': return v / 10, t * CMD_K
    return v, t * PAS_K
TUNED = []
for hid in KITS:
    q = H[hid]['q']
    for slot, sid in enumerate(H[hid]['sk']):
        if sid in NOTUNE: continue
        if q == 6: continue          # 绝世文官手定，靠模拟验证（尺子高估群攻、低估控制）
        sk = SK[sid]; ev, t = ev_of(sk, q, slot)
        if 0.8 * t <= ev <= 1.2 * t: continue
        lo, hi = 0.3, 3.0
        for _ in range(40):
            mid = (lo + hi) / 2
            if ev_of(scaled(sk, mid), q, slot)[0] < t: lo = mid
            else: hi = mid
        new = scaled(sk, (lo + hi) / 2)
        SK[sid] = new
        TUNED.append(f"{H[hid]['name']}·{sk['name']}：{ev:.2f} → {ev_of(new, q, slot)[0]:.2f}（目标 {t:.2f}）")

SK['v6_wan_qixie_4']['fx'] = [{'k': 'pdot', 'pct': 1.0}]   # 酷吏：他上的流血中毒伤害翻倍（招牌）

# ── 2c 模拟定标（V10.6 连续评分：候选人 + 八个天罡武将 vs 九个绝世武将）──────────
#   这几个人在「拼伤害」的对阵里明显落后，伤害 / 增益 / 护盾 / 治疗 / 夺取整体放大
SIMK = {'qiao_daoqing': 1.6, 'chen_xizhen': 1.6, 'wu_yong': 1.6, 'gao_qiu': 1.6, 'qin_hui': 1.6, 'liu_huiniang': 1.5, 'zong_ze': 1.15}
def simk(sk, k):
    out = json.loads(json.dumps(sk))
    for f in out['fx']:
        if f['k'] == 'dmg': f['mult'] = round(min(f['mult'] * k, 1.8 if f['tg'] in AOE else 3.8), 2)
        elif f['k'] in ('buff', 'debuff', 'steal'): f['pct'] = round(min(f['pct'] * k, 0.45), 2)
        elif f['k'] == 'shield': f['pct'] = round(min(f['pct'] * k, 0.30), 2)
        elif f['k'] == 'heal':
            if 'pct' in f: f['pct'] = round(min(f['pct'] * k, 0.20), 2)
            else: f['mult'] = round(f['mult'] * k, 2)
        elif f['k'] == 'status' and f.get('chance') is not None and f['chance'] < 1 and f['st'] in ('stun', 'chaos', 'silence'):
            f['chance'] = round(min(0.95, f['chance'] * k ** 0.5), 2)
    return out

# 老技能上加驱散 / 微调（在 V10.5 底稿上改，每次重算，不会叠两遍）
ADD_DISPEL = {   # 技能 id: 驱散的目标（放在这招最前面）
 'wy3': 'strongest',                 # 吴用 巧取豪夺
 'qdq2': 'rand2',                    # 乔道清 妖雾弥漫
 'cxt2': 'rand2',                    # 陈希真 希真幻术
 'xr1': 'smartest',                  # 萧让 伪造文书
 'px3': 'smartest',                  # 裴宣 孔目审讯
 'hmc1': 'smartest',                 # 哈迷蚩 诡计多端
 'lz3': 'strongest',                 # 李助 偷天换日
 'ml3': 'strongest',                 # 马灵 法术偷天
 'zt2_n': 'rand2',                   # 张天师 天师符咒
 'bao_daoyi_v5s4': 'rand2',          # 包道乙 妖法迷阵
 'dong_xianwenrong_s3': 'smartest',  # 洞仙文荣 妖法护国
 'lv_shi_nang_s3': 'smartest',       # 吕师囊 妖法迷阵
 'bq2': 'smartest',                  # 黄文炳 谗言陷害
 'zw4': 'single',                    # 朱武 借刀杀人（驱散后打同一人）
}
for sid, tg in ADD_DISPEL.items():
    s = SK[sid]
    if sid == 'zw4':
        s['fx'] = [{'k': 'dispel', 'tg': 'single'}] + [dict(f, tg='hit') if f['k'] == 'dmg' else f for f in s['fx']]
    else:
        s['fx'] = [{'k': 'dispel', 'tg': tg}] + s['fx']
SK['gss3']['fx'][0]['pct'] = 0.20   # 升绝世后指挥偏低
SK['qdq2']['rate'] = 0.5          # 加了驱散，发动率从 65% 压到 50%

# ── 3  装备 ──────────────────────────────────────────────────────────
S   = lambda st, p: {'k': 'pstat', 'stat': st, 'pct': p}
CR  = lambda v: {'k': 'pcrit', 'val': v}
CD  = lambda v: {'k': 'pcritdmg', 'val': v}
DM  = lambda p: {'k': 'pdmg', 'pct': p}
CUT = lambda p: {'k': 'pcut', 'pct': p}
DG  = lambda c: {'k': 'pdodge', 'chance': c}
CT  = lambda c, m: {'k': 'pcounter', 'chance': c, 'mult': m}
RG  = lambda p: {'k': 'pregen', 'pct': p}
LOW = lambda at, st, p: {'k': 'plow', 'at': at, 'stat': st, 'pct': p}
SH  = lambda p: {'k': 'pshield', 'pct': p}
IM  = lambda *st: {'k': 'pimmune', 'st': list(st)}
FIRST = {'k': 'pfirst'}; TOUGH = {'k': 'ptough'}
SKR = lambda v: {'k': 'pskrate', 'val': v}
PI  = lambda p: {'k': 'ppierce', 'pct': p}
CMD = lambda p: {'k': 'pcmd', 'pct': p}
HEAL = lambda p: {'k': 'pheal', 'pct': p}
CTRL = lambda v: {'k': 'pctrl', 'val': v}
BUF = lambda p: {'k': 'pbuff', 'pct': p}

PANEL = {
  'weapon_wen': {'int': 90, 'atk': 20, 'pct_int': 0.30},
  'weapon_wu':  {'atk': 60, 'int': 40, 'pct_atk': 0.30},
  'armor':  {'def': 35, 'hp': 1000, 'pct_def': 0.24, 'pct_hp': 0.25},
  'mount':  {'agi': 26, 'pct_hp': 0.25},
}
OB = {'weapon_wen': {'int': 0.20}, 'weapon_wu': {'atk': 0.20}, 'armor': {'def': 0.15, 'hp': 0.15}, 'mount': {'agi': 0.20}}
WU = {'zhang_shuye', 'chen_xizhen'}          # 文武双全，兵器用武将面板
SETS = {
 'luo_zhenren':  [(None, '紫虚神剑', [SKR(.08), DM(.12)]), (None, '鹤氅道袍', [CUT(.12), IM('chaos')]), (None, '二仙山白鹿', [CTRL(.12), SH(.15)]), ('二仙山', [SKR(.08), PI(.20)])],
 'gongsun_sheng':[('w12', '松纹古定剑', [SKR(.10), CR(.10)]), (None, '皂色道袍', [CUT(.12), RG(.03)]), (None, '云龙青骢', [DM(.12), FIRST]), ('入云龙', [CD(.40), DG(.12)])],
 'wu_yong':      [(None, '铜链', [CTRL(.10), SKR(.08)]), (None, '秀才襕衫', [CUT(.12), IM('silence')]), (None, '郓城青骡', [CMD(.20), SH(.15)]), ('智取生辰纲', [CTRL(.10), FIRST])],
 'song_jiang':   [(None, '宋公明佩剑', [HEAL(.15), SKR(.08)]), (None, '押司青袍', [CUT(.15), RG(.03)]), (None, '及时雨黄骠', [BUF(.20), CMD(.20)]), ('替天行道', [HEAL(.20), BUF(.15), TOUGH])],
 'qiao_daoqing': [('qiao_daoqing_jian', '幻魔宝剑', [DM(.12), SKR(.08)]), (None, '八卦紫袍', [CUT(.12), DG(.10)]), (None, '妖雾黑驴', [CTRL(.12), IM('chaos')]), ('幻魔真人', [DM(.15), PI(.15)])],
 'liu_huiniang': [(None, '慧娘雁翎刀', [PI(.20), CR(.10)]), (None, '云锦战袍', [CUT(.12), DG(.12)]), (None, '胭脂马', [DM(.12), SH(.15)]), ('奔雷车', [SKR(.10), PI(.15)])],
 'zong_ze':      [(None, '留守佩剑', [CMD(.15), SKR(.08)]), (None, '紫金朝服', [CUT(.15), RG(.03)]), (None, '黄河骢', [BUF(.15), FIRST]), ('过河', [CMD(.30), LOW(.40, 'int', .30)])],
 'gao_qiu':      [(None, '太尉哨棒', [CTRL(.10), DM(.10)]), (None, '紫袍金带', [CUT(.15), CT(.25, .8)]), (None, '殿帅玉骢', [SKR(.10), FIRST]), ('殿帅府', [CTRL(.10), LOW(.30, 'int', .40)])],
 'cai_jing':     [(None, '太师泥金扇', [SKR(.10), DM(.10)]), (None, '太师蟒袍', [CUT(.15), RG(.03)]), (None, '相府金鞍马', [S('int', .10), SH(.15)]), ('六贼之首', [S('int', .15), RG(.03)])],
 'qin_hui':      [(None, '东窗折扇', [CTRL(.12), DM(.10)]), (None, '相国紫袍', [CUT(.12), IM('silence')]), (None, '东窗黑骓', [SKR(.08), FIRST]), ('风波亭', [CTRL(.08), PI(.15)])],
 'zhang_shuye':  [(None, '海州破虏刀', [SKR(.08), PI(.15)]), (None, '龙图战袍', [CUT(.15), SH(.15)]), (None, '济州紫骝', [CMD(.15), FIRST]), ('荡寇', [S('atk', .12), S('int', .12)])],
 'chen_xizhen':  [(None, '希真青锋剑', [SKR(.08), CR(.10)]), (None, '猿臂道袍', [CUT(.12), DG(.10)]), (None, '猿臂寨白马', [DM(.12), IM('chaos')]), ('猿臂道人', [PI(.20), CD(.30)])],
}
pool = set(D['EXCLUSIVE_POOL']); sets = D['exc_sets']
for hid, parts in SETS.items():
    ids = []
    for slot, part in zip(('weapon', 'armor', 'mount'), parts[:3]):
        old, nm, fxl = part
        eid = old or f'jx_{hid}_{slot[0]}'
        pk = ('weapon_wu' if hid in WU else 'weapon_wen') if slot == 'weapon' else slot
        e = {'n': nm, 'q': '绝世', 'slot': slot, 'desc': f'{H[hid]["name"]}专属', 'exclusive': hid,
             'owner_bonus': dict(OB[pk]), 'fx': fxl}
        e.update(PANEL[pk])
        if slot == 'weapon': e['weapon_type'] = H[hid]['fav_weapon']
        E[eid] = e; pool.add(eid); ids.append(eid)
    sname, sfx = parts[3]
    sets[hid] = {'name': sname, 'items': ids, 'fx': sfx}
jue = {k for k, v in H.items() if v['q'] == 6}
miss = jue - set(sets)
if miss: sys.exit('!! 这些绝世没配三件套：' + '、'.join(H[k]['name'] for k in miss))
D['EXCLUSIVE_POOL'] = sorted(pool)

# 通用文官装备：面板按品阶
GP = {
 'weapon':  {2: {'int': 22, 'atk': 5,  'pct_int': .08}, 3: {'int': 40, 'atk': 10, 'pct_int': .12}, 4: {'int': 45, 'atk': 10, 'pct_int': .16},
             5: {'int': 70, 'atk': 15, 'pct_int': .22}, 6: {'int': 90, 'atk': 20, 'pct_int': .30}},
 'armor':   {2: {'def': 10, 'hp': 350, 'int': 8,  'pct_def': .08, 'pct_hp': .09}, 4: {'def': 16, 'hp': 450, 'int': 16, 'pct_def': .14, 'pct_hp': .15},
             5: {'def': 26, 'hp': 700, 'int': 24, 'pct_def': .18, 'pct_hp': .19}, 6: {'def': 36, 'hp': 1000, 'int': 32, 'pct_def': .24, 'pct_hp': .25}},
 'helmet':  {2: {'def': 6,  'int': 6,  'pct_def': .08, 'pct_hp': .09}, 4: {'def': 14, 'int': 14, 'pct_def': .14, 'pct_hp': .15},
             5: {'def': 20, 'int': 20, 'pct_def': .18, 'pct_hp': .19}, 6: {'def': 24, 'int': 26, 'pct_def': .24, 'pct_hp': .25}},
 'mount':   {2: {'agi': 8,  'int': 6,  'pct_hp': .09}, 4: {'agi': 18, 'int': 16, 'pct_hp': .15},
             5: {'agi': 20, 'int': 22, 'pct_hp': .19}, 6: {'agi': 22, 'int': 30, 'pct_hp': .25}},
 'special': {2: {'int': 14, 'pct_def': .08, 'pct_hp': .09}, 4: {'int': 34, 'pct_def': .14, 'pct_hp': .15},
             5: {'int': 50, 'pct_def': .18, 'pct_hp': .19}, 6: {'int': 64, 'pct_def': .24, 'pct_hp': .25}},
}
GEN = [  # 槽位, 品阶, 名, 描述, 兵器类型
 ('weapon', 2, '竹骨折扇', '书生随身的折扇', '扇'), ('weapon', 2, '桃木剑', '道士驱邪用的木剑', '剑'),
 ('weapon', 3, '铁骨扇', '扇骨是熟铁打的，合起来能当短棍', '扇'), ('weapon', 3, '铁笔', '精钢铸的笔杆', '笔'),
 ('weapon', 4, '判官笔', '笔尖淬过火，点穴用', '笔'), ('weapon', 4, '马尾拂尘', '白马尾扎的拂尘', '拂尘'),
 ('weapon', 5, '鹅毛羽扇', '军师摇的羽扇', '扇'), ('weapon', 5, '七星法剑', '剑脊嵌着七颗铜星', '剑'),
 ('weapon', 6, '鹤羽神扇', '传说是仙鹤落下的翎羽扎成', '扇'), ('weapon', 6, '紫电拂尘', '一抖便有电光', '拂尘'),
 ('armor', 2, '青衫', '读书人的青布长衫', None), ('armor', 2, '粗布道袍', '云游道士的道袍', None),
 ('armor', 4, '绯罗官袍', '五品以上的官服', None), ('armor', 4, '鹤氅', '羽毛织的大氅', None),
 ('armor', 5, '紫绶朝服', '三公上朝的朝服', None), ('armor', 6, '八卦仙衣', '绣着先天八卦的法衣', None),
 ('helmet', 2, '方巾', '书生戴的方巾', None), ('helmet', 2, '道冠', '束发的道冠', None),
 ('helmet', 4, '乌纱帽', '官员的乌纱', None), ('helmet', 4, '纶巾', '青丝带编的头巾', None),
 ('helmet', 5, '进贤冠', '文官上朝的冠', None), ('helmet', 6, '通天冠', '只在大典上戴的冠', None),
 ('mount', 2, '青骡', '走山路稳当', None), ('mount', 2, '毛驴', '慢是慢，不挑草料', None),
 ('mount', 4, '青牛', '老子出关骑的就是这个', None), ('mount', 5, '白鹿', '山中灵鹿', None), ('mount', 6, '仙鹤', '驮得动人的仙鹤', None),
 ('special', 2, '算盘', '账房先生的算盘', None), ('special', 2, '兵书', '翻烂了的兵书', None),
 ('special', 4, '罗盘', '看风水也看阵势', None), ('special', 4, '笏板', '上朝奏事用的象牙笏', None),
 ('special', 5, '官印', '一方铜印', None), ('special', 6, '河图洛书', '相传出自黄河洛水', None),
]
cnt = collections.Counter()
for slot, q, nm, desc, wt in GEN:
    cnt[slot] += 1
    eid = f'{slot[0]}106_{cnt[slot]}'
    e = {'n': nm, 'q': QN[q], 'slot': slot, 'desc': desc, 'wen': True}
    e.update(GP[slot][q])
    if wt: e['weapon_type'] = wt
    E[eid] = e

# ── 4  羁绊 ──────────────────────────────────────────────────────────
def tiers(n):
    return [{'need': 2, 'rate': 1}] if n == 2 else [{'need': 2, 'rate': .6}, {'need': 3, 'rate': 1}] if n == 3 \
        else [{'need': 2, 'rate': .4}, {'need': 3, 'rate': .7}, {'need': 4, 'rate': 1}]
NB = [
 ('二仙山师徒', ['luo_zhenren', 'gongsun_sheng'], 'int', 10),
 ('罗真人戏铁牛', ['luo_zhenren', 'li_kui'], 'hp', 10),
 ('风波亭', ['qin_hui', 'wan_qixie', 'luo_ruji'], 'int', 12),
 ('靖康忠臣', ['li_gang', 'zong_ze', 'li_ruoshui'], 'def', 12),
 ('宗泽识岳', ['zong_ze', 'yue_fei'], 'atk', 10),
 ('西岳降香', ['su_yuanjing', 'song_jiang'], 'int', 10),
 ('荡寇文臣', ['zhang_shuye', 'he_taiping', 'gai_tianxi', 'jin_chengying'], 'def', 10),
 ('贺门师生', ['he_taiping', 'jin_chengying'], 'atk', 8),
]
nxt = 1
for name, mem, attr, val in NB:
    for m in mem:
        if m not in H: sys.exit('!! 羁绊成员不存在 ' + m)
    B.append({'id': f'bond_v6_{nxt}', 'name': name, 'type': 'relation', 'members': mem, 'effect': f'{attr}+{val}%',
              'desc': f'{name}：{attr}+{val}%', 'attr': attr, 'val': val, 'tiers': tiers(len(mem))})
    nxt += 1

# 老池子名单（引擎不读，按品阶从全体非杂兵里取；这里只是保持数据自洽）
for k, v in STAT.items():
    if v[1] >= 4 and k not in D['LEGEND_POOL']: D['LEGEND_POOL'].append(k)
    if v[1] >= 5 and k not in D['GOLD_POOL']: D['GOLD_POOL'].append(k)
D['LEGEND_POOL'].sort(); D['GOLD_POOL'].sort()

# ── 5  清掉没人用的技能 ─────────────────────────────────────────────
used = {s for v in H.values() for s in v.get('sk', [])}
dropped = [s for s in list(SK) if s not in used and s in old_sk]
for s in dropped: del SK[s]

for hid, k in SIMK.items():
    for sid in H[hid]['sk']: SK[sid] = dict(simk(SK[sid], k), name=SK[sid]['name'])

# ── 2d 降档：原著分量撑不起「绝世」的四人降到天罡（三件套保留，品阶和面板跟着降）─────
#   当敌将时 foe 快照还是绝世，关卡难度不变
DOWN = {
 'a_liqi':          '阿里奇，辽国先锋大将，骁勇异常。与徐宁斗了三十余合，追赶时被张清一石子打中左眼，翻身落马被擒，伤重而死。',
 'qiong_yaonating': '琼妖纳延，辽国上将，随兀颜光征讨梁山军。阵前追赶史进，被花荣一箭射落马下。',
 'feng_tai':        '酆泰，王庆部下大将，使两条铁简。阵前一简打死河北降将山士奇，随即被卞祥一枪刺死。',
 'zhou_ang':        None,
}
P5 = {'weapon': {'atk': 50, 'int': 30, 'pct_atk': 0.22}, 'armor': {'def': 30, 'hp': 800, 'pct_def': 0.18, 'pct_hp': 0.19},
      'mount': {'agi': 22, 'pct_hp': 0.19}}
for hid, bio in DOWN.items():
    t = H[hid]
    t['foe'] = {k: t[k] for k in FOE_KEYS}
    t['q'] = 5
    if bio: t['bio'] = bio
    for eid in sets[hid]['items']:
        e = E[eid]
        for k in ('atk', 'int', 'def', 'hp', 'agi', 'pct_atk', 'pct_int', 'pct_def', 'pct_hp'): e.pop(k, None)
        e['q'] = '天罡'; e.update(P5[e['slot']])
# 王焕：bio 原来写成「王庆麾下」，他是高俅手下的十节度使之首
H['wang_huan']['title'] = '节度使'
H['wang_huan']['bio'] = '王焕，十节度使之首，早年绿林出身，受招安后做了节度使。高俅征梁山时点为先锋，年过六旬，阵前与林冲斗了七八十合不分胜负，使一条长枪。'

# ── 2e 副属性减半（Lynch 定）：武将的智、文官的武，基础值与成长各砍一半；武智差不到一成五的文武双全不动
#   敌方 foe 快照里的面板按同一规则砍
def role(a, i):
    return 'mix' if min(a, i) / max(a, i, 1) >= 0.85 else ('wu' if a > i else 'wen')
def halve(t):
    r = role(t['atk'], t['int'])
    k = 'int' if r == 'wu' else 'atk' if r == 'wen' else None
    if not k: return None
    t[k] = max(5, round(t[k] * 0.5))
    if t.get('gr') and k in t['gr']: t['gr'] = dict(t['gr'], **{k: round(t['gr'][k] * 0.5, 4)})
    return r
HALVED = collections.Counter()
for hid, t in H.items():
    HALVED[halve(t)] += 1
    if t.get('foe'): halve(t['foe'])

# ── 2f 智力差伤害（Lynch 定）：8 招计谋改成打「武最高的敌人」，伤害 =（智×法术系数 − 目标智）× 倍率，无视防御
GAP = {'wy1': None, 'v6_qin_hui_3': None, 'v6_he_taiping_2': None, 'v6_gai_tianxi_2': None,
       'zw4': 'strongest', 'xr1': None, 'hmc1': None, 'v6_zhang_bangchang_3': 'strongest'}
for sid, dispel_tg in GAP.items():
    sk = SK[sid]
    for f in sk['fx']:
        if f['k'] == 'dmg':
            f['src'] = 'gap'
            if f['tg'] != 'hit': f['tg'] = 'strongest'
        if f['k'] == 'dispel' and dispel_tg: f['tg'] = dispel_tg

# ── 2g Boss 关阵势（Lynch 定）：35 个 Boss 关各带一种，效果写在引擎 THEMES 里
ST = D['stages']
THEME = {
 'blade':  ['ch1_boss', 'ch2_boss', 'ch7_boss', 'ch10_boss', 'ch15_boss', 'ch16_f1', 'ch20_boss', 'ch22_bossb', 'hidden_23_1', 'ch30_f2'],
 'shield': ['ch5_boss', 'ch6_boss', 'ch8_boss', 'ch15_f2', 'ch17_boss', 'ch20_f2', 'ch22_boss', 'ch26_f1'],
 'dot':    ['ch4_boss', 'ch12_boss', 'ch19_bossb', 'ch21_boss', 'ch25_boss', 'ch31_f1'],
 'chaos':  ['ch3_boss', 'ch13_boss', 'ch16_boss', 'ch19_boss', 'ch21_f1', 'ch25_f2'],
 'wen':    ['ch9_boss', 'ch11_boss', 'ch14_boss', 'ch18_boss', 'ch23_boss'],
}
for th, sids in THEME.items():
    for sid in sids:
        if sid not in ST or not ST[sid].get('is_boss'): sys.exit('!! 阵势关不存在或不是 Boss 关：' + sid)
        ST[sid]['theme'] = th
nb = [k for k, v in ST.items() if v.get('is_boss') and not v.get('theme')]
if nb: sys.exit('!! 这些 Boss 关没配阵势：' + '、'.join(nb))
# 一周目名单：谋臣关按剧情补文官；刀山关里原有的文官换成同关武将
ROSTER = {
 'ch9_boss':  ['song_jiang', 'lu_junyi', 'wu_yong', 'lin_chong', 'zhu_wu', 'gongsun_sheng', 'guan_sheng', 'xiao_rang', 'jiang_jing'],
 'ch11_boss': ['gao_qiu', 'tong_guan', 'cai_jing', 'hao_siwen', 'xuan_zan', 'cai_jing', 'hao_siwen', 'tong_guan', 'gao_qiu'],
 'ch14_boss': ['wang_qing', 'li_zhu', 'duan_sanniang', 'li_zhu', 'liu_min', 'liu_min', 'wang_qing', 'duan_sanniang', 'li_zhu'],
 'ch18_boss': ['zhang_shuye', 'yun_tianbiao', 'chen_xizhen', 'he_taiping', 'gai_tianxi', 'liu_huiniang', 'chen_xizhen', 'he_taiping', 'yun_tianbiao'],
 'ch23_boss': ['qin_hui', 'wan_qixie', 'luo_ruji', 'ha_michi', 'zhang_bangchang', 'yue_fei', 'jin_wushu', 'luo_ruji', 'wan_qixie'],
 'ch1_boss':  ['shi_jin', 'chen_da', 'yang_chun', 'chen_da'],
 'ch16_f1':   ['wu_yanguang', 'a_liqi', 'qiong_yaonating', 'yeli_dezhong', 'ye_lvzonglei', 'he_chongbao', 'yeli_dezhong', 'chu_mingyu', 'han_yanshou'],
}
for sid, ros in ROSTER.items():
    for h in ros:
        if h not in H: sys.exit(f'!! {sid} 名单里的人不存在：{h}')
    ST[sid]['enemies'] = ros

# ── 敌方技能快照 ─────────────────────────────────────────────────────
BSK = json.load(open(BASE, encoding='utf-8'))['skills']
BH = json.load(open(BASE, encoding='utf-8'))['heroes']
for hid in changed_old:
    old = BH[hid]['sk']
    if old == H[hid]['sk'] and all(SK.get(x) == BSK.get(x) for x in old): continue
    ids = []
    for sid in old:
        fid = 'f5_' + sid
        SK[fid] = json.loads(json.dumps(BSK[sid])); ids.append(fid)
    H[hid]['foe']['sk'] = ids

json.dump(D, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# ── 6  报告 ──────────────────────────────────────────────────────────
R = []
R.append('# V10.6 数据报告\n')
qc = collections.Counter(v['q'] for k, v in H.items() if v.get('src') != '杂兵')
base = json.load(open(BASE, encoding='utf-8'))
qb = collections.Counter(v['q'] for k, v in base['heroes'].items() if v.get('src') != '杂兵')
R.append('## 招募池各档人数（V10.5 → V10.6）\n')
for q in range(1, 7): R.append(f'- {QN[q]}：{qb[q]} → {qc[q]}')
R.append('\n## 本版涉及的 21 人\n')
R.append('| 人 | 品阶 | 武 | 防 | 智 | 捷 | 血 | 擅长 | 技能 |')
R.append('|---|---|---|---|---|---|---|---|---|')
for hid in STAT:
    t = H[hid]
    R.append(f"| {t['name']}{'（新）' if hid in NEW else ''} | {QN[t['q']]} | {t['atk']} | {t['def']} | {t['int']} | {t['agi']} | {t['hp']} | {t['fav_weapon']} | "
             + '、'.join(SK[s]['name'] for s in t['sk']) + ' |')
WARN.clear()
for hid in STAT:
    t = H[hid]
    for i, s in enumerate(t['sk']):
        settle(s, dict(SK[s]), t['q'], i, t['name'] + '·' + SK[s]['name'])
R.append('\n## 技能档位校验（rework_skills 那把尺子，偏离五成以上才列）\n')
R += ['- ' + w for w in WARN] or ['- 全部在档内']
dis = sorted({H[h]['name'] for h, v in H.items() for s in v['sk'] if any(f.get('k') == 'dispel' for f in SK[s].get('fx', []))})
R.append('\n## 定标（缩放过的技能）\n'); R += ['- ' + x for x in TUNED]
R.append(f'\n## 副属性减半\n\n' + '、'.join(f'{k}: {v}' for k, v in HALVED.items()))
R.append(f'\n## 带驱散的人（{len(dis)}）\n\n' + '、'.join(dis))
R.append(f'\n## 装备\n\n- 专属池：{len(base["EXCLUSIVE_POOL"])} → {len(D["EXCLUSIVE_POOL"])}\n- 通用文官装备新增 {len(GEN)} 件\n- 绝世三件套：{len(base["exc_sets"])} → {len(sets)} 套')
R.append(f'\n## 删掉的旧技能 {len(dropped)} 个\n\n' + '、'.join(dropped))
open(os.path.join(ROOT, 'fix_v106_report.md'), 'w', encoding='utf-8').write('\n'.join(R) + '\n')
print('\n'.join(R))
