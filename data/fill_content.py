#!/usr/bin/env python3
"""
水浒群星录 · 阶段 1b 内容补全

  python3 fill_content.py data/gameData_v10.json

  1  12 个空 enemies 关卡配敌方（按关卡标题点名的角色 + 同阵营配角 + 杂兵）
  2  两个占位关名改中文
  3  15 篇缺失 bio

就地改写输入文件，同时输出 fill_report.txt。
"""
import json, sys, os

PATH = sys.argv[1] if len(sys.argv) > 1 else 'gameData_v10.json'
D = json.load(open(PATH, encoding='utf-8'))
H, ST = D['heroes'], D['stages']
REP = []
def log(s=''): REP.append(s); print(s)

M = 'bandit_1 bandit_2 bandit_3 bandit_4 bandit_5 bandit_6'.split()

# ── 1  关卡敌方配置 ───────────────────────────────────────────
# 每关：点名主将放首位，配同阵营部将，余位用杂兵填到 6–9 人
STAGE_ENEMY = {
    'ch17_f1': ['tian_hu', 'tian_biao', 'tian_bao', 'an_shirong', M[3], M[4], M[5]],
    'ch17_f2': ['wu_li', 'qiong_ying', 'shan_shiqi', 'yu_yulin', M[1], M[2], M[3]],
    'ch19_f1': ['qiao_daoqing', 'ma_ling', 'bian_xiang', 'fang_qiong', 'tian_ding', M[2], M[4]],
    'ch22_f1': ['wang_qing', 'duan_sanniang', 'li_xiong', 'ma_jin', M[0], M[3], M[5]],
    'ch22_f2': ['li_zhu', 'mi_sheng', 'teng_kan', 'liu_min', 'du_zhao', M[2], M[4]],
    'ch23_f1': ['duan_sanniang', 'pan_xu', 'ma_jin', 'li_xiong', M[1], M[3], M[5]],
    'ch25_f2': ['wang_qing', 'du_jue', 'feng_tai', 'wang_huan', 'li_zhu', 'mi_sheng', M[4]],
    'ch27_f1': ['fang_la', 'fang_tianding', 'lou_minzhong', 'zu_shiyuan', 'gao_yu', M[2], M[5]],
    'ch27_f2': ['shi_bao', 'wang_yin', 'zheng_biao', 'qian_zhenpeng', 'bo_shuying', M[1], M[3]],
    'ch30_f1': ['deng_yuanjue', 'pang_wanchun', 'li_tianrun', 'si_xingfang', 'lv_shi_nang', 'fang_jie', M[0]],
    # 两个隐藏宝藏关：全员名将，无杂兵
    'ch21_f1': ['tian_hu', 'bian_xiang', 'zhou_ang', 'wu_li', 'qiao_daoqing', 'ma_ling',
                'qiong_ying', 'shan_shiqi', 'tian_ding'],
    'ch26_f1': ['wang_qing', 'du_jue', 'feng_tai', 'wang_huan', 'li_zhu', 'mi_sheng',
                'duan_sanniang', 'ma_jin', 'teng_kan'],

    # ── 辽国 ch12–16 ──
    'ch12_f1': ['a_liqi', 'ye_lvzonglei', 'yeli_zongyun', 'chu_mingyu', M[0], M[1], M[3]],
    'ch12_f2': ['yeli_zongyun', 'yeli_zongdian', 'ye_lvzonglei', 'ye_lvzonglin', M[1], M[2], M[4]],
    'ch13_f1': ['dong_xianwenrong', 'qiong_yaonating', 'chu_mingyu', 'ye_lvdehua', M[0], M[3], M[5]],
    'ch13_f2': ['chu_mingyu', 'he_tongjun', 'ye_lvdehua', 'yeli_zongdian', M[2], M[3], M[4]],
    'ch14_f1': ['he_tongjun', 'han_yanshou', 'ye_lvdehua', 'yeli_zongyun', M[0], M[2], M[5]],
    'ch14_f2': ['yeli_dezhong', 'ye_lvzonglei', 'ye_lvzonglin', 'yeli_zongdian', M[1], M[3], M[4]],
    'ch15_f1': ['wu_yanguang', 'a_liqi', 'qiong_yaonating', 'he_tongjun', M[0], M[2], M[4]],
    'ch15_f2': ['yeli_dezhong', 'wu_yanguang', 'a_liqi', 'ye_lvzonglei', 'han_yanshou', M[1], M[5]],
    'ch16_f1': ['wu_yanguang', 'a_liqi', 'qiong_yaonating', 'yeli_dezhong', 'ye_lvzonglei',
                'he_tongjun', 'dong_xianwenrong', 'chu_mingyu', 'han_yanshou'],
    # ── 田虎 ch18–20 ──
    'ch18_f1': ['geng_gong', 'niu_wenzhong', 'ni_lin', 'sheng_ben', M[0], M[2], M[4]],
    'ch18_f2': ['shan_shiqi', 'an_shirong', 'chu_heng', 'yu_yujue', M[1], M[3], M[5]],
    'ch19_f2': ['fang_qiong', 'tian_ding', 'yu_yulin', 'tian_qiong', M[0], M[2], M[3]],
    'ch20_f1': ['tang_bin', 'bian_xiang', 'zhou_ang', 'ni_lin', M[1], M[4], M[5]],
    'ch20_f2': ['sun_an', 'tian_hu', 'bian_xiang', 'zhou_ang', 'wu_li', M[2], M[3]],
    # ── 王庆 ch23–25 ──
    'ch23_f2': ['yuan_lang', 'du_jue', 'feng_tai', 'mi_sheng', M[0], M[1], M[4]],
    'ch24_f1': ['ma_jin', 'teng_kan', 'li_xiong', 'du_zhao', M[2], M[3], M[5]],
    'ch24_f2': ['teng_kan', 'ma_jin', 'pan_xu', 'li_xiong', M[0], M[2], M[4]],
    'ch25_f1': ['liu_min', 'li_zhu', 'du_zhao', 'pan_xu', M[1], M[3], M[5]],
    # ── 方腊 ch28–31 ──
    'ch28_f1': ['li_tianrun', 'li_tianyou', 'zhuo_wanli', 'he_tong', M[0], M[2], M[4]],
    'ch28_f2': ['fang_mao', 'fang_tianshou', 'wu_su', 'he_xun', M[1], M[3], M[5]],
    'ch29_f1': ['lv_shi_nang', 'shen_gang', 'zhao_yi', 'fang_yufu', M[0], M[2], M[3]],
    'ch29_f2': ['wang_yin', 'zheng_biao', 'bao_daoyi', 'fang_jiao', M[1], M[4], M[5]],
    'ch30_f2': ['fang_tianding', 'shi_bao', 'deng_yuanjue', 'pang_wanchun', 'fang_jie', M[0], M[3]],
    'ch31_f1': ['fang_la', 'shi_bao', 'deng_yuanjue', 'wang_yin', 'fang_jie', 'pang_wanchun',
                'fang_tianding', 'li_tianrun', 'si_xingfang'],
}
RENAME = {
    'ch21_f1': '晋王府秘藏',
    'ch26_f1': '楚王宫秘藏',
    'ch16_f1': '北国秘藏',
    'ch31_f1': '帮源洞秘藏',
}

log('阶段 1b 内容补全')
log('=' * 60)
log('\n[1] 关卡敌方配置')
miss = []
for sid, ids in STAGE_ENEMY.items():
    if sid not in ST:
        miss.append(sid); continue
    bad = [i for i in ids if i not in H]
    if bad:
        miss.append(f'{sid}:{bad}'); continue
    ST[sid]['enemies'] = ids
    if sid in RENAME:
        old = ST[sid]['name']; ST[sid]['name'] = RENAME[sid]
        log(f'      {sid:<10}「{old}」→「{RENAME[sid]}」')
    names = '、'.join(H[i]['name'] for i in ids)
    log(f'      {sid:<10}{ST[sid]["name"]:<12}{len(ids)} 人　{names}')
if miss:
    log(f'      !! 有问题：{miss}'); sys.exit(1)

# ── 2  bio ───────────────────────────────────────────────────
# [确] = 原著有明确记载  [推] = 依据身份与阵营写，原著着墨极少
BIO = {
 'bao_daoyi': ('确',
   '包道乙，方腊麾下国师，江南道教中人，善用妖法，随身一口玄元混天剑能凌空取人。'
   '乌龙岭之战飞剑斩断武松左臂，武松自此成了独臂行者。后被凌振火炮击中，尸骨无存。'),
 'shi_quan': ('确',
   '施全，岳飞旧部。岳飞父子冤死风波亭后，他不肯苟活，伏于众安桥下行刺秦桧。'
   '一刀砍在轿杠上，失手被擒，受尽酷刑而不改口，最终遇害于市。'),
 'ji_qing': ('确',
   '吉青，岳飞结义兄弟之一，与王贵、汤怀、张显、牛皋同列。'
   '出身草莽，性子直，力气大，随岳飞自麒麟村起兵，转战两河，一路做到统制。'),
 'li_tianyou': ('确',
   '厉天祐，方腊麾下战将，厉天闰之弟。兄弟二人同守江南要隘，以骁勇著称。'
   '宋江大军南下时于阵前交锋，力战不敌，死于乱军之中。'),
 'han_yanshou': ('确',
   '韩延寿，辽国大将，镇守边关多年。宋江奉诏征辽，两军对垒于幽燕之地，'
   '他领兵屡次拒战，终因辽主乞降而收兵，是辽国阵中少数全身而退的将领。'),
 'tian_shi': ('推',
   '田实，田虎宗族子弟，随田虎在河北起事，受封守将，统本部人马镇守州县。'
   '田虎自称晋王后，宗室多居要职，他亦在其列。晋军覆灭时一同败没。'),
 'tian_qiong': ('推',
   '田琼，田虎之侄，威胜军中的宗室将领。田虎割据河北五州，亲族分守各处关隘，'
   '他领一路兵马。宋江军平定河北后，田氏宗族尽数溃散。'),
 'geng_wen': ('推',
   '耿文，田虎帐下军师，掌文书与谋划。田虎起于草莽，倚重读书人替他理事，'
   '耿文便是其中之一。不长征战，随中军进退。'),
 'fang_yufu': ('推',
   '方裕，方腊皇侄。方腊称帝后大封宗室，子侄辈各领兵马分守江南州县，'
   '他是其中一支的主将。清溪帮源洞被破时，方氏宗族多半死于乱中。'),
 'fang_jiao': ('推',
   '方皭，方腊族弟。随方腊在睦州起事，凭宗室身份受封，统领本部兵马。'
   '江南平定之日，与族中诸人一同殁于阵。'),
 'zhuang_ru': ('推',
   '庄儒，方腊帐下军师。方腊据江南八州二十五县，朝仪官制一应俱全，'
   '文臣谋士各司其职，庄儒在中枢参赞军机，少亲临战阵。'),
 'cheng_wan': ('推',
   '程万，方腊麾下部将，领一路人马守江南州县。'
   '方腊军中此类将佐甚多，各守一城一隘，宋江大军过处，或战或降。'),
 'zhen_xianglin': ('推',
   '真祥麟，说岳全传中的将领，属金国一方。金兵屡次南下，阵中骁将不少，'
   '他亦在其列，与岳家军交锋于两河之间。'),
 'ha_lansheng': ('推',
   '哈兰生，说岳全传中的金国将领。金人南侵时随军作战，'
   '在与岳家军的几番交锋中出阵，是金营中有名号的一员。'),
 'sha_zhiren': ('推',
   '沙志仁，说岳全传中的金国将领。随大军南下，屡与宋军对垒，'
   '与岳家军诸将数次照面。'),
}

log('\n[2] 角色 bio')
need = [k for k, v in H.items() if not v.get('bio')]
wrote, uncertain = 0, []
for k in need:
    if k not in BIO:
        log(f'      !! 未准备 bio：{k} {H[k]["name"]}'); continue
    kind, text = BIO[k]
    H[k]['bio'] = text
    wrote += 1
    if kind == '推': uncertain.append(H[k]['name'])
    log(f'      [{kind}] {H[k]["name"]:<8}{text[:28]}…')

still = [k for k, v in H.items() if not v.get('bio')]
log(f'\n      写入 {wrote} 篇，仍缺 {len(still)} 篇')
log(f'      其中 {len(uncertain)} 篇标 [推]：原著着墨极少，按身份与阵营写，'
    f'未编造具体战绩 —— {"、".join(uncertain)}')

# ── 3  校验 ───────────────────────────────────────────────────
log('\n[3] 校验')
empty = [k for k, v in ST.items() if not (v.get('enemies') or [])]
nobio = [k for k, v in H.items() if not v.get('bio')]
dang = [f'{sid}:{e}' for sid, v in ST.items() for e in (v.get('enemies') or []) if e not in H]
log(f'      空 enemies 关卡 {len(empty)}　缺 bio {len(nobio)}　悬空敌人 {len(dang)}')
sizes = sorted({len(v.get('enemies') or []) for v in ST.values()})
log(f'      关卡敌方人数区间 {min(sizes)}–{max(sizes)}')

ok = not empty and not nobio and not dang
log('\n' + '=' * 60)
log('内容补全 ' + ('通过' if ok else '未通过'))

json.dump(D, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
open(os.path.join(os.path.dirname(PATH) or '.', 'fill_report.txt'), 'w',
     encoding='utf-8').write('\n'.join(REP))
print(f'\n已更新 {PATH}（{os.path.getsize(PATH)/1024:.0f}KB）')
sys.exit(0 if ok else 1)
