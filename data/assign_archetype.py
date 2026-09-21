#!/usr/bin/env python3
"""
水浒群星录 · 范式立绘归类

  python3 assign_archetype.py data/gameData_v10.json

九十多个偏将、枢密、先锋逐个出图不现实，也没必要 —— 玩家在 46 像素的格子里
看的是「这是个什么人」，不是「这是哪一个人」。

所以按「身份 + 兵器 + 是否番将」归成十二类范式立绘，一类一张，多人共用；
再由前端按 hid 做稳定哈希，派生出镜像与轻微色偏，同一张底图能出六个人样。
自己有立绘的角色不受影响，范式只是兜底的第二层。
"""
import json, re, sys

PATH = sys.argv[1] if len(sys.argv) > 1 else 'gameData_v10.json'
D = json.load(open(PATH, encoding='utf-8'))
H = D['heroes']

# 番将：辽、金、西夏一路。按姓名用字认，比猜 src 可靠
FOREIGN = re.compile(r'^(耶律|兀颜|完颜|粘罕|哈迷|金兀|阿里|琼妖|曲利|洞仙|天山|贺统|贺重|咬儿|楚明|阿黑|叶清)')
# 女性角色
WOMEN = {'扈三娘','顾大嫂','孙二娘','段三娘','琼英','刘慧娘','陈丽卿','潘金莲','李师师','金翠莲','阎婆惜','贾氏','王婆','白秀英'}
# 僧道法师
MONK = re.compile(r'(和尚|法师|真人|天师|道人|禅师|如来|国师|头陀)')
# 文职
CIVIL = re.compile(r'(枢密|太师|丞相|尚书|太尉|知州|府尹|县令|军师|秀士|书生|孔目|太守|酷吏|奸相|忠臣|通判|参谋)')
# 市井恶霸
MARKET = re.compile(r'(屠|恶霸|门神|店|赌|牙|贩|镇关西|判官|媒)')

BLUNT = {'斧','锤','棍','杖','拳','鞭','锏','禅杖'}

# 规则认不出来的，直接点名。医师、术士、账房这些人披一身甲拿把刀，
# 比共用一张脸更让人出戏 —— 共用还只是「像」，穿错行当是「错」。
NAMED = {
    '安道全': 'arch_civ_lit',   '皇甫端': 'arch_civ_lit',
    '蒋敬':   'arch_civ_lit',   '侯健':   'arch_civ_lit',
    '张叔夜': 'arch_civ_lit',   '邬梨':   'arch_civ_lit',
    '时迁':   'arch_civ_mkt',   '凌振':   'arch_civ_mkt',
    '包道乙': 'arch_monk',      '马灵':   'arch_monk',
    '樊瑞':   'arch_monk',      '李助':   'arch_gen_jian',
    '方垕':   'arch_elder',
    '于玉珏': 'arch_woman',     '卜树英': 'arch_woman',
}

def arche(hid, h):
    name = h.get('name', '')
    title = h.get('title') or ''
    tag = title + name
    w = h.get('fav_weapon') or ''
    q = h.get('q', 1)

    if h.get('src') == '杂兵':  return None          # 杂兵一人一张，不走范式
    if name in NAMED:           return NAMED[name]
    if '女将' in title:         return 'arch_woman'
    if name in WOMEN:           return 'arch_woman'
    if MONK.search(tag):        return 'arch_monk'
    if FOREIGN.match(name):     return 'arch_liao'
    if CIVIL.search(tag) and q <= 4:  return 'arch_civ_lit'
    if MARKET.search(tag):      return 'arch_civ_mkt'
    if '老' in tag or name in ('周侗','王进','洪信','张天师'): return 'arch_elder'
    if w == '剑':               return 'arch_gen_jian'
    if w in BLUNT:              return 'arch_gen_fu'
    if w == '枪' or w == '戟':
        return 'arch_sol_qiang' if q <= 2 else 'arch_gen_qiang'
    # 刀、弓、笛、空 —— 一律归到刀
    return 'arch_sol_dao' if q <= 2 else 'arch_gen_dao'

n = 0
cnt = {}
for hid, h in H.items():
    a = arche(hid, h)
    if a:
        h['arch'] = a; n += 1
        cnt[a] = cnt.get(a, 0) + 1
    else:
        h.pop('arch', None)

print('范式立绘归类')
print('=' * 52)
for k in sorted(cnt, key=lambda x: -cnt[x]):
    print(f'  {k:<18}{cnt[k]:>4} 人')
print(f'  {"合计":<18}{n:>4} 人（杂兵 6 个单独出图）')

json.dump(D, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'\n已写回 {PATH}')
