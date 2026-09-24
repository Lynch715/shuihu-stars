# -*- coding: utf-8 -*-
"""
水浒群星录 V10.3 · 天罡 / 绝世 71 人技能手写表
按技能 ID 写，名字沿用数据里的。rework_skills.py 读这张表。

一行一个技能，写法：
  <类别> <效果>; <效果>; …
  类别   A 概率主动（发动率由脚本按品质档解出，A45 可以指定）
         S2 必中主动，冷却 2
         C  指挥（战前发一次）
         P  被动
  效果   dmg <目标> <倍率> [src=int] [exec=血线,倍] [drain=1|比例] [pierce=比例]
         st <目标> <状态> [几率] [回合] [值]        目标 hit = 刚被前一条 dmg 打中的人
         buff|debuff <目标> <属性> <比例> <回合>
         heal <目标> <智力倍率> | heal <目标> pct=<血量比例>
         shield <目标> <血量比例>
         steal <目标> <属性> <比例> <回合>
         cleanse <目标> / dispel <目标>
         pstat <属性> <比例> / pcrit <值> / pcritdmg <值> / pdmg <比例> / pcut <比例> / pdodge <几率>
         pcounter <几率> <倍率> / pfollow <几率> <倍率> / ponhit <状态> <几率> <回合>
         pregen <比例> / plow <血线> <属性> <比例> / pshield <比例> / pimmune <状态,…> / pfirst / ptough
  目标   single row col all front back weakest strongest smartest rand2 rand3
         self mates lowest frontm colm hit
"""

NAMED = {
# ── 绝世 ──────────────────────────────────────────────────────────────
# 高宠 · 錾金枪，挑滑车
'gao_chong_s1': 'A dmg single 2.2; st hit vuln .5 2 .2',          # 錾金枪法：一枪透甲
'gao_chong_s2': 'A dmg row 1.3; st hit stun .25 1',               # 白马长枪：一骑当先
'gao_chong_s3': 'P pcut .10; pshield .15',                        # 银锤护体
'gao_chong_s4': 'C buff mates atk .14 3; buff frontm def .12 3',  # 岳家枪势
# 王进 · 八十万禁军教头，史进的师父
'wang_jin_s1': 'A dmg single 1.8; buff self atk .10 2',           # 教头棍法
'wang_jin_s2': 'S3 heal mates 0.6; cleanse mates',                # 齐眉棍势：稳住阵脚
'wang_jin_s3': 'A dmg smartest 1.8; st hit silence .8 2',   # 王进之力
'wang_jin_s4': 'C buff mates atk .12 3; buff mates agi .10 3',    # 禁军传承
# 卢俊义 · 河北玉麒麟，棍棒天下无双
'ljy1': 'A dmg single 2.3 exec=.4,1.8',                           # 麒麟玉角
'ljy2': 'A dmg col 1.5; st hit bleed .35 2',                      # 枪出如龙
'ljy3': 'P pstat atk .12; pcrit .06',                             # 河北玉麒麟
'ljy4': 'S2 shield self .35; st self taunt 1 1',                  # 金甲护体：扛在前面
# 关胜 · 大刀，关公之后
'gs1': 'A dmg single 2.1; st hit vuln .5 2 .25',                  # 青龙偃月
'gs2': 'A dmg row 1.35',                                          # 关家刀法
'gs3': 'C buff mates atk .12 3; debuff all atk .08 2',            # 大刀风采：敌军胆寒
'gs4': 'P pcut .12; ptough',                                      # 名将之躯
# 林冲 · 豹子头
'lc1': 'A dmg single 2.0; st hit stun .3 1',                      # 豹头环眼
'lc2': 'A dmg single 2.2 exec=.5,2',                              # 风雪山神庙：雪夜杀人
'lc3': 'A dmg col 1.45; st hit bleed .3 2',                       # 丈八蛇矛
'lc4': 'C buff mates atk .15 3',                                  # 八十万禁军教头
# 呼延灼 · 连环马
'hyz1': 'A dmg row 1.4; st hit stun .2 1',                        # 连环马阵
'hyz2': 'A dmg single 1.9; dmg single 0.7',                       # 双鞭破敌：两鞭
'hyz3': 'C buff frontm def .18 3; shield frontm .10',             # 铁甲连环
'hyz4': 'P pcut .10; pcounter .3 .7',                             # 钢鞭护体
# 鲁智深 · 花和尚
'lzs1': 'A dmg all 0.65; st hit disarm .3 1',                     # 倒拔垂杨柳：吓得动不了手
'lzs2': 'A dmg single 2.0; st hit stun .35 1',                     # 禅杖横扫
'lzs3': 'S2 shield self .4',                                      # 铜皮铁骨
'lzs4': 'P pstat hp .12; pimmune chaos',                          # 花和尚：禅心不乱
# 岳飞 · 精忠报国
'yf1': 'A dmg single 2.2; st hit vuln .4 2 .2',                   # 沥泉神枪
'yf2': 'A dmg col 1.45',                                          # 岳家枪法
'yf3': 'C buff mates atk .12 3; buff mates def .10 3',            # 精忠报国
'yf4': 'S3 heal mates 0.7; cleanse mates',                        # 岳母刺字
# 栾廷玉 · 祝家庄教师
'lty1': 'A dmg single 2.1; st hit stun .3 1',                     # 铁棒无敌
'lty2': 'A dmg col 1.4',                                          # 祝家庄教头
'lty3': 'C shield mates .12',                                     # 铁壁阵
'lty4': 'P pstat atk .08; pstat def .08',                         # 名师指导
# 岳云 · 双锤
'yy1': 'A dmg single 2.1; st hit stun .35 1',                     # 双锤擂鼓
'yy2': 'A dmg row 1.3; buff self atk .08 2',                      # 少年英雄
'yy3': 'P pshield .2; pcut .06',                                  # 银锤护体
'yy4': 'C buff mates agi .12 3; buff mates atk .08 3',            # 岳家小将
# 金兀术 · 四太子
'jws1': 'A dmg single 2.1; st hit bleed .4 2',                    # 金雀斧
'jws2': 'A dmg all 0.8; st hit silence .25 1',                    # 狼主咆哮
'jws3': 'C buff mates atk .14 3',                                 # 四狼主
'jws4': 'S3 shield frontm .25',                                   # 铁浮屠
# 方腊 · 明教教主
'fl1': 'A dmg all 0.8 src=int; st hit burn .3 2',                 # 圣公神威
'fl2': 'C buff mates int .15 3; buff mates atk .08 3',            # 明教教主
'fl3': 'S3 shield mates .12',                                     # 江南霸主
'fl4': 'A st rand3 chaos .5 1; debuff rand3 def .15 2; dmg rand3 0.4 src=int',            # 蛊惑人心
# 石宝 · 劈风刀、流星锤
'sb1_n': 'A dmg single 2.2; st hit bleed .4 2',                   # 劈风刀
'sb2_n': 'A dmg row 1.3; st hit stun .25 1',                      # 流星锤
'sb3_n': 'C buff mates atk .12 3',                                # 南国大将
'sb4_n': 'P pcut .10; pcounter .25 .8',                           # 石宝护体
# 邓元觉 · 宝光如来，禅杖
'dyj1': 'A dmg single 2.1; st hit stun .3 1',                     # 宝光如来
'dyj2': 'S3 shield mates .12',                                    # 佛门护法
'dyj3': 'A heal mates 1.0',                                       # 佛光普照
'dyj4': 'C buff mates def .12 3; buff mates int .10 3',           # 方腊国师
# 史文恭 · 曾头市教师，射晁盖
'swg1': 'A dmg single 2.2; st hit poison .4 3',                   # 史家枪法：药箭
'swg2': 'A dmg col 1.5',                                          # 神枪贯日
'swg3': 'C buff mates atk .10 3; debuff all agi .1 2',            # 曾头市教师
'swg4': 'P pcut .08; pdodge .10',                                 # 铁甲护身
# 王寅 · 方腊尚书，转山飞
'wang_yin_s1': 'A dmg single 2.1; st hit vuln .4 2 .2',           # 尚书枪法
'wang_yin_s2': 'A dmg col 1.4',                                   # 方腊尚书
'wang_yin_s3': 'A dmg single 1.9 src=int; st hit silence .6 2',   # 文臣武略
'wang_yin_s4': 'P pdodge .15; pstat agi .08',                     # 帮源守将：转山飞
# 方杰 · 方天画戟
'fang_jie_s1': 'A dmg single 2.1; st hit bleed .35 2',            # 小将军枪
'fang_jie_s2': 'A dmg col 1.45',                                  # 方腊侄
'fang_jie_s3': 'A dmg single 2.2; buff self atk .15 3',           # 少年英雄
'fang_jie_s4': 'P plow .5 atk .3; plow .5 def .2',                # 殿后死战
# 卞祥 · 田虎丞相
'bian_xiang_s1': 'A dmg single 2.2; st hit stun .25 1',           # 卞家刀法
'bian_xiang_s2': 'A dmg col 1.4',                                 # 田虎丞相
'bian_xiang_s3': 'A dmg single 2.0; dmg weakest 0.6',             # 河北名将
'bian_xiang_s4': 'C buff mates atk .10 3; buff mates int .10 3',  # 文武双全
# 孙安 · 田虎殿帅
'sun_an_s1': 'A dmg single 2.1; st hit bleed .35 2',              # 孙家刀法
'sun_an_s2': 'A dmg col 1.45',                                    # 田虎殿帅
'sun_an_s3': 'A dmg single 2.2; st hit vuln .5 2 .25',             # 山西名将
'sun_an_s4': 'P pstat atk .14',                                   # 力大无穷
# 阿里奇 · 辽国先锋
'a_liqi_s1': 'A dmg single 2.1; st hit bleed .3 2',               # 阿里枪法
'a_liqi_s2': 'A dmg row 1.35; st hit stun .2 1',                  # 辽国先锋
'a_liqi_s3': 'P pshield .2; pcut .06',                            # 北国骁将
'a_liqi_s4': 'C buff mates atk .12 3; buff mates agi .08 3',      # 冲锋陷阵
# 兀颜光 · 辽国都统军
'wu_yanguang_s1': 'A dmg single 2.2; st hit vuln .5 2 .25',       # 兀颜刀法
'wu_yanguang_s2': 'A dmg col 1.5',                                # 辽国都统
'wu_yanguang_s3': 'A dmg single 2.0; dmg single 0.8',             # 北国第一将
'wu_yanguang_s4': 'C buff mates atk .15 3; buff mates def .10 3', # 全军统帅
# 杜壆 · 淮西第一猛将
'dx1': 'A dmg single 2.2; st hit bleed .4 2',                     # 丈八蛇矛
'dx2': 'A dmg row 1.4; st hit stun .2 1',                         # 淮西第一猛
'dx3': 'C buff mates atk .14 3',                                  # 猛将之威
'dx4': 'S2 shield self .4; st self taunt 1 1; buff self def .15 2',                                      # 金甲护体
# 酆泰
'ft1': 'A dmg single 2.2; st hit stun .3 1',                      # 劈山刀法
'ft2': 'A dmg row 1.35; st hit bleed .3 2',                       # 淮西双璧
'ft3': 'C buff mates atk .12 3; buff mates agi .10 3',            # 勇冠三军
'ft4': 'P pcut .12; pshield .10',                                 # 铁壁护身
# 琼妖纳廷
'qynt1': 'A dmg single 2.2; st hit vuln .4 2 .2',                 # 朔方枪法
'qynt2': 'A dmg row 1.4',                                         # 辽邦神力
'qynt3': 'C debuff all def .15 3; debuff all agi .10 3',          # 大漠风暴
'qynt4': 'P pcut .10; pcounter .3 .7',                            # 铁骑护体
# 周昂
'za1': 'A dmg single 2.2; st hit stun .3 1',                      # 轰雷刀法
'za2': 'A dmg row 1.35; st hit vuln .3 2 .2',                     # 河北雄风
'za3': 'C buff mates atk .14 3; buff mates agi .06 3',            # 锐不可当
'za4': 'P pcut .12; ptough',                                      # 铜筋铁骨
# 王焕 · 老将
'wh1': 'A dmg single 2.1; st hit bleed .35 2',                    # 老枪诀
'wh2': 'A dmg row 1.35',                                          # 沙场宿将
'wh3': 'C buff mates def .14 3; cleanse mates',                   # 临阵不乱
'wh4': 'P pcut .10; plow .5 def .25',                             # 老而弥坚

# ── 天罡 ──────────────────────────────────────────────────────────────
# 张奎
'zhang_kui_s1': 'A dmg single 1.9; st hit bleed .3 2',            # 金虎枪法
'zhang_kui_s2': 'A dmg all 0.7',                                  # 长枪破阵
'zhang_kui_s3': 'P pshield .2; pcut .06',                                  # 福星护体
'zhang_kui_s4': 'C buff mates atk .10 3',                         # 岳家骁将
# 吴用 · 智多星
'wy1': 'A st smartest silence .9 2; st smartest chaos .5 1',     # 智多星
'wy2': 'C buff mates int .14 3; buff mates atk .06 3',            # 运筹帷幄
'wy3': 'S2 steal strongest atk .3 3',                             # 巧取豪夺
'wy4': 'S3 heal mates 0.8',                                       # 妙手回春
# 公孙胜 · 入云龙
'gss1': 'A dmg single 2.0 src=int; st hit stun .3 1',             # 五雷天罡正法
'gss2': 'A dmg all 0.6 src=int; st hit burn .3 2',               # 呼风唤雨
'gss3': 'C buff mates int .14 3',                                 # 天罡道法
'gss4': 'S2 shield self .3; st self dodge 1 2 .2',                # 云龙护体
# 秦明 · 霹雳火
'qm1': 'A dmg all 0.6; st hit burn .3 2',                        # 霹雳火
'qm2': 'A dmg single 1.9; st hit stun .3 1',                      # 狼牙棒
'qm3': 'C buff mates atk .12 3',                                  # 烈火燎原
'qm4': 'S2 shield mates .12',                                     # 霹雳护体
# 花荣 · 小李广
'shy1': 'A dmg weakest 2.0; st hit vuln .4 2 .2',                 # 百步穿杨
'shy2': 'A dmg col 1.4',                                          # 神臂弓散射
'shy3': 'P pcrit .12; pstat agi .08; pstat atk .04',                             # 小李广
'shy4': 'A dmg back 1.3; st hit stun .25 1',                      # 精准射击：射后排
# 武松 · 行者
'ws1': 'A dmg single 2.1 exec=.5,1.8',                            # 景阳冈打虎
'ws2': 'A dmg row 1.1; st hit bleed .3 2',                        # 鸳鸯楼
'ws3': 'A dmg single 1.7; st self dodge 1 2 .25',                 # 醉拳
'ws4': 'P pcut .08; pcounter .3 .8',                              # 铁臂膊
# 董平 · 双枪将
'dp1': 'A dmg single 1.8; dmg single 0.7',                        # 双枪将
'dp2': 'A dmg col 1.4',                                           # 双枪齐出
'dp3': 'C buff mates atk .10 3; buff self agi .15 3',             # 董平神力
'dp4': 'P pdodge .12; pshield .10',                               # 双枪护体
# 张清 · 没羽箭
'zq2n': 'A dmg single 1.9; st hit stun .35 1',                    # 没羽箭
'zq3n': 'A dmg col 1.3; st hit stun .15 1',                       # 飞石连珠
'zq4n': 'A dmg rand2 0.9; st hit disarm .7 1',                  # 飞石迷眼
'zq5n': 'P pcrit .08; pfirst',                                    # 没羽神射
# 杨志 · 青面兽
'yz2n': 'A dmg single 2.0; st hit bleed .35 2',                   # 杨家枪法
'yz3n': 'A dmg col 1.4',                                          # 青面兽冲
'yz4n': 'P pcut .10; pstat def .06',                                             # 杨家将血统
'yz5n': 'C buff mates atk .10 3; buff mates def .08 3',           # 将门之后
# 徐宁 · 金枪手
'jz1': 'A dmg single 2.0; st hit vuln .4 2 .2',                   # 金枪手
'jz2': 'A dmg col 1.1; st hit disarm .3 1',                       # 钩镰枪法：勾兵器
'jz3': 'P pshield .15; pcut .06',                                 # 金枪护体
'jz4': 'C buff mates agi .12 3; buff mates atk .06 3',            # 教头传承
# 索超 · 急先锋
'sq1': 'A dmg single 2.0; st hit bleed .3 2',                     # 急先锋
'sq2': 'A dmg row 1.35',                                          # 斧法迅捷
'sq3': 'C buff mates agi .12 3; buff frontm atk .10 3',           # 先锋冲锋
'sq4': 'P pfirst; pdmg .08',                                      # 急先锋护体
# 李逵 · 黑旋风
'lk1': 'A dmg row 1.2',                                           # 旋风斧
'lk2': 'A dmg all 0.8',                                           # 黑旋风
'lk3': 'A dmg single 2.1; st hit bleed .4 2',                     # 板斧劈砍
'lk4': 'P pdmg .12; pimmune silence',                             # 天杀星：不怕人劝
# 史进 · 九纹龙
'shj1': 'A dmg row 1.1',                                         # 九纹龙
'shj2': 'A dmg single 1.9; st hit bleed .3 2',                    # 史家枪法
'shj3': 'C buff mates atk .10 3',                                 # 少华山头领
'shj4': 'S2 shield colm .2',                                      # 纹身护体
# 石秀 · 拼命三郎
'bs1': 'A dmg single 2.0 exec=.5,1.6',                            # 病关索
'bs2': 'A dmg row 1.3',                                           # 解家枪法
'bs3': 'P pcounter .35 .8',                                       # 铁臂膊
'bs4': 'P plow .5 atk .3; pdmg .06',                              # 步军骁将：拼命
# 孙立 · 病尉迟
'sl1': 'A dmg single 1.9; st hit stun .3 1',                      # 病尉迟
'sl2': 'A dmg row 1.3',                                           # 孙家枪法
'sl3': 'S2 shield self .3; st self taunt 1 1',                    # 尉迟铁壁
'sl4': 'C buff mates def .16 3; shield mates .06',                                  # 琼林名将
# 凌振 · 轰天雷
'lz2_n': 'A dmg all 0.5 src=int; st hit stun .2 1',               # 轰天雷
'lz3_n': 'A dmg row 1.3 src=int; st hit burn .3 2',               # 火炮齐射
'lz4_n': 'C debuff all def .15 2; debuff all atk .08 2',                                # 火炮教头：轰开阵
'lz5_n': 'P pshield .2; pcut .06',                                         # 火药护体
# 安道全 · 神医
'adq1': 'A heal mates 0.8',                                       # 神医妙手
'adq2': 'S2 heal lowest 2.2; cleanse lowest',                     # 对症下药
'adq3': 'C heal mates pct=.10; buff mates def .08 3',             # 杏林春暖
'adq4': 'A st rand3 stun .55 1; dmg rand3 0.3 src=int',                                   # 麻沸散
# 晁盖 · 托塔天王
'cg1': 'A dmg single 1.9; st hit stun .3 1',                      # 托塔天王
'cg2': 'C buff mates atk .12 3',                                  # 梁山之主
'cg3': 'S3 shield mates .10',                                     # 天王护体
'cg4': 'A dmg row 1.3',                                           # 聚义之怒
# 云天彪 · 荡寇志
'ytb1': 'A dmg single 2.0; st hit stun .3 1',                     # 雷部正神
'ytb2': 'A dmg col 1.4',                                          # 云家枪法
'ytb3': 'S3 shield mates .10',                                    # 忠义护国
'ytb4': 'C buff mates atk .10 3; buff mates def .08 3',           # 雷将统帅
# 陈希真（真祥麟共用）
'cxt1': 'A dmg single 1.8 src=int; st hit bleed .3 2',            # 猿臂剑法
'cxt2': 'A st rand2 chaos .5 1',                                  # 希真幻术
'cxt3': 'S2 steal strongest int .35 3',                            # 巧夺天工
'cxt4': 'S3 heal mates 0.8',                                      # 仙风道骨
# 杨再兴 · 小商桥
'yzx1': 'A dmg single 2.1',                                       # 百步穿杨
'yzx2': 'A dmg row 1.1; st hit vuln .3 2 .2',                    # 小商桥冲锋
'yzx3': 'A dmg col 1.4',                                          # 杨家枪法
'yzx4': 'P plow .4 atk .25; ptough',                              # 忠勇将军：死战
# 张叔夜
'zsz1': 'A dmg single 1.9; st hit vuln .4 2 .2',                  # 忠勇双全
'zsz2': 'C buff mates int .12 3; buff mates atk .06 3',           # 一代名臣
'zsz3': 'S3 shield mates .10',                                    # 忠烈护国
'zsz4': 'A dmg col 1.3; st hit silence .3 1',                     # 朝廷威仪
# 陆文龙 · 双枪
'lwl1': 'A dmg single 1.8; dmg single 0.7',                       # 双枪飞舞
'lwl2': 'A dmg row 1.3',                                          # 双枪并刺
'lwl3': 'C buff mates agi .15 3; buff mates atk .06 3',                                 # 北国小王爷
'lwl4': 'P pshield .15; pdodge .08',                              # 银盔银甲
# 周侗 · 武学宗师
'zt2_1': 'A dmg single 2.0; st hit vuln .4 2 .2',                 # 名师绝学
'zt2_2': 'C buff mates atk .10 3; buff mates int .10 3',          # 天下武师
'zt2_3': 'S3 shield mates .10',                                   # 武学宗师
'zt2_4': 'S2 steal strongest atk .3 3',                           # 偷师学艺
# 邬梨
'wl2_n': 'A dmg single 1.9; st hit bleed .3 2',                   # 梨花枪
'wl3_n': 'A dmg row 1.3',                                         # 邬家枪法
'wl4_n': 'C buff mates atk .10 3',                                # 田虎部将
'wl5_n': 'P pcut .12; pstat def .06',                                            # 河北武将
# 李助 · 金剑先生
'lz1': 'A dmg single 1.9 src=int; st hit silence .4 1',           # 金剑先生
'lz2': 'A st rand2 chaos .5 1',                                   # 妖法惑众
'lz3': 'S2 steal strongest atk .3 3',                             # 偷天换日
'lz4': 'C buff mates int .18 3; buff mates agi .06 3',                                  # 金剑护法
# 贺重宝 · 辽国猛将，会妖法
'hzb1': 'A dmg single 1.9; st hit bleed .3 2',                    # 贺家枪法
'hzb2': 'A st rand2 chaos .45 1; dmg rand2 0.5 src=int',          # 妖法阵阵
'hzb3': 'C buff mates atk .10 3',                                 # 辽国猛将
'hzb4': 'S2 shield self .35; st self taunt 1 1',                                      # 贺重宝护体
# 乔道清 · 幻魔君
'qdq1': 'A dmg all 0.75 src=int',                                 # 幻魔真人
'qdq2': 'A st rand3 chaos .4 1',                                  # 妖雾弥漫
'qdq3': 'S2 steal strongest int .35 3',                            # 幻魔大法
'qdq4': 'S2 heal self 2.0; st self dodge 1 2 .2',                 # 道法回春
# 马灵 · 神驹子
'ml1': 'A dmg all 0.55 src=int; st hit burn .25 2',                # 神兽金甲
'ml2': 'A dmg rand2 0.8 src=int; st hit stun .45 1',                                    # 金砖法术
'ml3': 'S2 steal strongest agi .35 3',                              # 法术偷天
'ml4': 'S2 shield mates .12',                                     # 金甲护法
# 张天师
'zt1_n': 'A heal mates 0.8',                                      # 天师道法
'zt2_n': 'A st rand3 silence .7 2; dmg rand3 0.4 src=int',                               # 天师符咒
'zt3_n': 'C buff mates int .14 3; cleanse mates',                 # 龙虎山天师
'zt4_n': 'S2 shield mates .12',                                   # 道法护身
# 庞万春 · 小养由基
'pwc1': 'A dmg weakest 2.0; st hit poison .4 3',                  # 九天飞刀
'pwc2': 'A dmg col 1.35',                                         # 飞刀连射
'pwc3': 'A dmg rand2 0.6; st hit disarm .7 1',                                # 飞刀迷眼
'pwc4': 'P pcrit .12; pstat agi .08; pstat atk .05',                             # 方腊神射手
# 方天定 · 太子
'fang_tianding_s1': 'A dmg single 1.9; st hit bleed .3 2',        # 太子枪法
'fang_tianding_s2': 'A dmg col 1.4',                              # 江南少主
'fang_tianding_s3': 'A dmg single 1.8; st hit vuln .35 2 .2',     # 护国先锋
'fang_tianding_s4': 'C buff mates atk .10 3; buff mates int .08 3', # 明教圣子
# 厉天闰
'li_tianrun_s1': 'A dmg single 2.0; st hit stun .25 1',           # 钢枪突刺
'li_tianrun_s2': 'A dmg col 1.4',                                 # 南军先锋
'li_tianrun_s3': 'A dmg single 1.9; dmg weakest 0.5',             # 镇国元帅
'li_tianrun_s4': 'P pstat atk .10; pcrit .04',                    # 厉家枪法
# 司行方
'si_xingfang_s1': 'A dmg single 2.0; st hit bleed .3 2',          # 司家刀法
'si_xingfang_s2': 'A dmg col 1.4',                                # 南国大将
'si_xingfang_s3': 'A dmg single 1.9; st hit vuln .35 2 .2',       # 镇国元帅
'si_xingfang_s4': 'C buff mates def .16 3; shield mates .06',                       # 厉天闰副
# 郑彪 · 郑魔君
'zheng_biao_s1': 'A dmg single 1.9 src=int; st hit burn .35 2',   # 郑魔君法
'zheng_biao_s2': 'A dmg all 0.6 src=int; st hit burn .3 2',       # 妖火焚天
'zheng_biao_s3': 'C buff mates int .15 3; buff mates atk .05 3',                        # 方腊国师
'zheng_biao_s4': 'A st rand3 chaos .5 1; dmg rand3 0.5 src=int',                        # 魔君乱政
# 田定
'tian_ding_s1': 'A dmg single 1.9; st hit bleed .3 2',            # 太子枪法
'tian_ding_s2': 'A dmg col 1.4',                                  # 晋王太子
'tian_ding_s3': 'A dmg single 2.0; st hit stun .35 1',            # 河北少主
'tian_ding_s4': 'C buff frontm def .15 3; shield frontm .08',     # 守城护驾
# 琼英 · 琼矢镞
'qiong_ying_s1': 'A dmg weakest 1.9; st hit stun .3 1',           # 琼英飞石
'qiong_ying_s2': 'A dmg single 1.7; dmg single 0.7',              # 双刀连珠
'qiong_ying_s3': 'A dmg rand2 1.1',                               # 田虎郡主
'qiong_ying_s4': 'P pcrit .08; pfollow .25 .6',                   # 子母石法
# 山士奇
'shan_shiqi_s1': 'A dmg single 1.9; st hit bleed .3 2',           # 山家枪法
'shan_shiqi_s2': 'A dmg col 1.4',                                 # 田虎枢密
'shan_shiqi_s3': 'A dmg single 1.8; st hit vuln .35 2 .2',        # 盖州大将
'shan_shiqi_s4': 'C buff frontm def .18 3; shield frontm .08',                       # 守城先锋
# 方琼
'fang_qiong_s1': 'A dmg single 1.9; st hit bleed .3 2',           # 方家斧法
'fang_qiong_s2': 'A dmg row 1.3',                                 # 田虎先锋
'fang_qiong_s3': 'S2 shield self .3; st self taunt 1 1',          # 太原守将
'fang_qiong_s4': 'C buff mates atk .10 3',                        # 冲锋陷阵
# 袁朗 · 王庆元帅
'yuan_lang_s1': 'A dmg single 2.0; st hit stun .3 1',             # 袁家斧法
'yuan_lang_s2': 'A dmg col 1.4',                                  # 王庆元帅
'yuan_lang_s3': 'A dmg single 1.9; dmg weakest 0.5',              # 淮西大将
'yuan_lang_s4': 'P pstat atk .12',                                # 力敌万人
# 縻貹
'mi_sheng_s1': 'A dmg single 2.0; st hit bleed .35 2',            # 縻家斧法
'mi_sheng_s2': 'A dmg row 1.3',                                   # 王庆偏将
'mi_sheng_s3': 'P pcut .10; pshield .10',                         # 淮西步军
'mi_sheng_s4': 'C buff mates atk .10 3',                          # 冲锋陷阵
# 耶律得重
'yeli_dezhong_s1': 'A dmg single 2.0; st hit vuln .4 2 .2',       # 耶律刀法
'yeli_dezhong_s2': 'A dmg col 1.4',                               # 辽国大元帅
'yeli_dezhong_s3': 'A dmg row 1.25; st hit stun .2 1',            # 统军十万
'yeli_dezhong_s4': 'C buff mates atk .12 3; buff mates def .08 3', # 北国柱石
# 耶律宗雷
'ye_lvzonglei_s1': 'A dmg single 2.0; st hit stun .3 1',          # 宗雷斧法
'ye_lvzonglei_s2': 'A dmg row 1.3',                               # 耶律宗将
'ye_lvzonglei_s3': 'P pshield .15; pcut .06',                     # 辽国上将
'ye_lvzonglei_s4': 'P pstat atk .12',                             # 力大无穷
# 韩存保
'hcb1': 'A dmg single 1.9; dmg single 0.7',                       # 双鞭破敌
'hcb2': 'A dmg row 1.0; st hit stun .2 1',                        # 将门虎子
'hcb3': 'C buff mates atk .12 3',                                 # 刚猛无俦
'hcb4': 'S2 shield self .3; st self taunt 1 1',                   # 披甲持鞭
}
