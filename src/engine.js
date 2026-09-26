/* ==========================================================================
   水浒群星录 V10 · 引擎
   --------------------------------------------------------------------------
   约束（改动时请遵守，这是这次重构的全部意义）：
     · 每个函数只有一份实现。禁止 window.X = 覆盖，禁止包装既有函数。
     · 一切数值只从 Stats.calc 出。战力也从它派生，不允许另写估算公式。
     · 技能一律按 skill.type 分派，禁止用技能名的中文子串判断行为。
     · 渲染函数只读状态、只拼字符串，不写业务逻辑。
     · 事件一律 data-action 委托，禁止内联 onclick。
     · 禁止 setInterval 做数据兜底。
   ========================================================================== */
'use strict';

/* ── 0  常量 ─────────────────────────────────────────────────────────── */

const CFG = {
  /* 等级与星级的上限按周目取，见 Lap.maxLv / Lap.maxStar 与上面的 lapLv / lapStar。 */
  maxRounds: 30,
  teamSize: 9,

  qmult:   { 1: 1.00, 2: 1.10, 3: 1.20, 4: 1.35, 5: 1.50, 6: 1.70 },
  /* ★6 ★7 是二周目以后的东西。技能位在 ★2/3/4 已经发完，
     再往上不发新技能，只续属性与技能威力。 */
  starMul: { 1: 1.00, 2: 1.12, 3: 1.26, 4: 1.42, 5: 1.60, 6: 1.80, 7: 2.02 },
  starSk:  { 1: 1.00, 2: 1.05, 3: 1.10, 4: 1.15, 5: 1.20, 6: 1.26, 7: 1.32 },

  /* 周目。三周目起数值封顶，周目本身不设上限 —— 想一直刷就一直刷。 */
  lapLv:   { 1: 50, 2: 60 },   // 查不到的周目一律取 lapLvMax
  lapStar: { 1: 5,  2: 6  },
  lapLvMax: 70, lapStarMax: 7,

  /* 二周目玩家是带着满配从第一关重打，而关卡曲线是给「从零长起来」设计的：
     一周目的敌方等级从 3 爬到 50。拿满级队去打 3 级的小喽啰没有任何意义，
     光乘一个系数也救不回来 —— 第一章要有挑战就得乘几十倍，末章就该爆了。
     所以二周目不是「乘」，是「整段平移」：把敌方等级从一周目的 3–50
     线性映射到本周目的区间，关卡之间的相对难度（章末比小关硬）原样保留。 */
  foeLv1: [3, 50],
  /* V10.3.2 后段拉伸：数据里的敌级 3→50，玩家二十二章就满 50 级，之后十来章一直是满级打低级。
     30 级以上的敌级按比例拉到 52：末章敌人略高于玩家上限（55 时 ch30_f2 三局停一局），
     得靠星级和装备去啃 —— 这才是「Boss 卡一下」。周目区间也跟着多 8 级。 */
  foeStretch: [30, 50],
  /* 周目区间不跟着拉伸：63 对 60 二周目停在 ch20_f2，73 对 70 三周目停在 ch22_boss。
     二三周目本来就有穿甲和星级压着，等级别再超过玩家上限。 */
  lapBand: { 2: [46, 60], 3: [56, 70] },   // 查不到的周目一律取 lapBandMax
  lapBandMax: [56, 70],
  /* V10.3.2 敌方「装备等效」：玩家后期有装备 +30%、羁绊 +25%、专属神兵，敌人是裸的。
     二十章起按章递增 3% → 10%，等于承认他们也穿了甲；各周目一样按章走（15% 时末章成墙）。 */
  foeGear: [[20, 0.03], [33, 0.10]],
  /* 平移之外再乘的一道微调，按周目查表 —— 不能用幂次。
     玩家从二周目到三周目只多 17% 等级上限加 12% 星级倍率，
     幂次会让敌方涨得比人快，第三周目必停在 136/139。
     三周目起玩家数值封顶（70 / ★7），敌方也必须跟着封顶，
     否则第四周目必死。往后各周目靠宿星换手感，不靠堆数值。
     系数是 foeLv1 收窄到 3–50 之后重标的：平移这一段本身变陡了，
     乘的这一道就得让出来。二周目 1.00→139 场（毫无重试），
     1.12→234/310 场，1.18→292 场且三局里有一局停在 136。
     三周目 1.18→139/196 场，1.24 与 1.30 都卡在 ch30_f1，
     玩家练到 60 级就没钱再练，够不着 70。取 1.12 / 1.18。 */
  lapFoeBy: { 1: 1, 2: 0.85 },
  lapFoeMax: 0.86,
  /* V10.3.4 二三周目大幅抬难度：星级每周目 +2、关卡补满九人、穿甲不低于一成。 */
  /* V10.3.5 二周目起敌方星级、装备配齐：星级 = 上一周目的上限（Boss 关再 +1，不超本周目上限），
     穿甲 = 15% 起、每周目 +5%，章内再按 foeGear 往上走。 */
  lapStarBoss: 0,   // Boss 再 +1 星时 ch7 / ch15 / ch22 的 Boss 关三局三停
  lapGear: { 2: 0.15 }, lapGearStep: 0.05,
  /* 二周目起杂兵换成同阵营名将：普通关只换猛/名（≤4），Boss 与支线不限。见 Battle.roster */
  lapRosterQ: 5,
  /* V10.6 关卡强度整体上抬：普通关 ×1.25、Boss 关 ×1.5（乘在封顶与折扣之后）。Lynch 定：难度不够，Boss 关狠狠抬 */
  foeUp: 1.25, foeUpBoss: 1.5,
  /* V10.6 二周目起敌将品阶下限：普通关至少名将、Boss 关至少天罡 */
  lapFloorQ: 4, lapFloorQBoss: 5,
  /* V10.3 再下调（原 1.00 / 1.06）：技能整套换过之后敌方的绝世将（孙安、邓元觉这些）指挥+护盾+治疗一套齐，
     二周目按 1.00 打，停在 ch20_f2 田虎决战·孙安，伤员 12；0.94 一轮 139 场全过。 */
  /* V10.1 下调（原 1.12 / 1.18）。人只能靠抽之后，一周目带进二周目的阵容
     比原来弱一截 —— 原来关卡一路送的多是 Boss 级的名将。照原系数连打三周目，
     二周目要打六七百场、三周目三局挂两局；1.00 / 1.06 是二周目 139–406 场、
     三周目三局过两局，与 V10.0 的量级相当。 */
  /* 一周目的 enemy_mul 是拿来补等级差的：敌人才 20 级，靠系数硬撑难度，
     个别关能顶到 6。二周目起等级已经整段平移上去了，这道补偿就该收回来 ——
     mul 6 的关卡在三周目是 6×1.18，玩家练满 70 级 ★7 也打不过，
     三周目卡在 ch22_boss / ch24_f2 / ch30_f1 就是这么来的。
     削到 2.5：三周目四局过两局；不削是四局全挂，削到 3 是三局过一局。
     剩下那两局挂在伤员上（卡住时账上还有 7–16k 银两、练级已到 70 级上限、
     伤员 9–22 人），那是伤病系统的账，不是这道系数能救的。 */
  /* V10.3.2 封顶按敌人品质分档：封顶是为了不让吴用、岳飞这种名将 ×6 一回合团灭；
     后段十来章满是 mul 5.4 的小喽啰，一刀切到 3 之后 27–33 章一次重试都没有。
     凡良杂兵底子薄，×5.5 也就是个像样的兵。 */
  lapMulCap: { 1: 4.5, 2: 4.5, 3: 3.5, 4: 2.0, 5: 2.0, 6: 2.0 },
  /* V10.3.1 一周目也封顶。关卡的 enemy_mul 是在「成长算两遍、五十级血是武的二十倍、一仗打三十回合」
     那套公式下反推出来的，mul 6 靠玩家耗得起才成立。成长只算一次之后一仗只有几回合，
     mul 6 的敌人（武防 ×6）第一回合就把人打空 —— 第四、八、二十二章各卡一两百场。 */
  mulCap1: { 1: 5.5, 2: 5.5, 3: 4.0, 4: 3.0, 5: 3.0, 6: 3.0 },
  /* 二十七章起（方腊一路）敌人已经 53–55 级带一成半穿甲，名将再 ×3 就是墙（ch28_f2 / ch29_f2 / ch30_f1 全停）。
     后段名将的系数封到 2.0，靠等级和穿甲压人，不靠倍率。 */
  lateCapCh: 27,
  mulCapLate: { 1: 5.0, 2: 5.0, 3: 3.0, 4: 2.0, 5: 2.0, 6: 2.0 },
  /* V10.1 一周目敌方强度的按章折扣：[章, 系数] 折线。
     原来的难度表是在两个前提下调出来的：关卡一路送人，而且十九件「专属神兵」
     被当成良品宝物白送 —— 第一章就能捡到一件武 +60 的东西。
     这两样都拿掉之后照原表打，一周目要打上千场、末章撞满级墙。
     这张折线是拿 playthrough.js 跑出来的，只动一周目；二周目起人已经攒齐了，照旧。 */
  foeEase: [[1, 0.65], [8, 0.74], [20, 0.80], [27, 0.86], [33, 0.72]],
  /* V10.3.2：主线尾段不再打折。原来 27 章 .74、33 章 .64 是为了末章隐藏关不成墙，
     结果主线 25–31 章一局下来一次重试都没有。支线与隐藏关单独一条（foeEaseSide），照旧打折。 */
  foeEaseSide: [[1, 0.65], [8, 0.74], [20, 0.80], [27, 0.74], [33, 0.64]],
  /* V10.3 抬了中段：开局多送一个绝世、技能整套换过，照原折线一周目只要 216–235 场，前期几乎不用重试。
     末章反而略放 —— 末章卡的是 50 级上限，抬到 .82 三局里一局停在 ch30_f1。
     现在传统模式 272 / 368 / 373 场，与 V10.1 同一量级；混乱模式 562–907 场，随机技能本来就是赌。 */
  /* 混乱模式敌方强度折扣。随机摇来的四招平均比原装那套弱一截（原装是按人配的，随机的可能四个被动），
     敌人却还是原装。不折的话一周目 540–1055 场、三局里一局停在末章隐藏关；九折还是三局停一局（ch30_f2），八五折过。 */
  chaosEase: 0.75,
  fateReroll: 30,              // 重掷一颗宿星要多少符

  /* V10.3.1 5 → 10，dmgK 4.8 → 3.6：成长只算一次之后高等级的血不再是武的二十倍，
     一仗只剩两三回合，演出都没得看。两道一起调回「一个人挨七八下才倒」，
     早期关卡（原来三下就倒）也顺带耐打了些。 */
  hpMult: 10,             // 体力 → 血量
  lvGrow: 0.015,          // 每级通用成长
  favBonus: 0.20,         // 擅长武器加攻
  cap: { eqPct: 0.30, bondAtk: 0.25, bondHp: 0.25, bondOther: 0.20 },
  /* V10.4 被动汇总封顶：绝世三件套 + 技能被动叠起来不许成墙 */
  pasCap: { cut: 0.35, dodge: 0.30, skrate: 0.25, pierce: 0.40, heal: 0.40, ctrl: 0.20, buff: 0.35, dot: 1.0 },

  /* 暴击跟着捷走。原来挂在魅上，魅又不在详情页上显示 —— 玩家看到一个
     「魅」不知道干什么用，V10.1 把魅整个删了，暴击交给捷。
     系数照原来魅的量级定：中位数的人多出三四个点，封顶十个点。 */
  critRate: 0.08, critAgiK: 1800, critAgiCap: 0.10,
  /* 智 = 技能威力。原来智只管治疗，264 人里会治疗的 43 个，
     剩下两百多人的智是摆设。现在攻击技能、护盾都按智加成，
     按智在「智+武」里的占比算，谋士吃满、武夫吃得少，而且不随等级膨胀。 */
  intSk: 0.4,
  /* V10.5 法术系数。智一路没人喂：装备百分比、擅长、专属加成、羁绊封顶全给武，智只拿兵器上几十点固定值。
     五十级满配顶级武将的武约 1750、顶级谋士的智约 1050，再进同一条伤害公式，法术单发只有武将的三成。
     凡是从智派生的数 —— src:'int' 的伤害、mult 型治疗、法术技能的灼烧 —— 先乘这一道再进公式。敌我同口径。 */
  intK: 1.1,
  intBasic: 0.85,
  healK: 2.2,             // V10.6 治疗系数：按智回血 × 技能威力 × 2.2，群疗 0.8 约回一成血        // V10.6 法术普攻：智高的人普攻按 智×intK×0.85 打
  /* V10.5 持续伤害改百分比：流血按最大生命、中毒按当前生命叠层、灼烧仍是固定值（施术者攻击值 × burnK）。
     原来三种都是上状态时按施术者武 ×1.2 再乘 0.3 / 0.25 / 0.2 定死，五十级对着两万血条扣几百，159 个带流血的技能全是摆设。 */
  bleedPct: 0.04, poisonPct: 0.04, poisonMax: 5, burnK: 0.35,
  windBurn: 1.5,          // 狂风：灼烧伤害 ×1.5，并向同排蔓延
  critMul: 1.5,
  dmgVar: 0.16, agiVar: 0.12,   // 单次伤害与出手顺序的抖动，见 dmg()
  armorK: 0.6,            // 减伤分母系数
  dmgK: 3.6,              // 全局伤害系数：控制战斗时长，不影响双方强弱对比
  chaosResist: 0.25,      // 每次被混乱后抗性递增
  shieldDur: 3,

  /* V10.1 起关卡不再送人，武将只能在酒肆抽。开局两个人，
     给够一次十连的钱，不然前几章就是两个人硬扛四五个。
     V10.3 起开局那两个人不再固定史进朱武：随机一个绝世、一个凡将（rollStartGift）。 */
  startSilver: 5000,
  /* 经验为主，银两为辅。
     原来两条轨道喂同一个等级：经验全程只够到 24 级，银两却能一路买到 50 级，
     于是经验成了摆设。现在等级只由经验决定，银两用来「督练」——
     花钱补足到下一级还差的那点经验，越到后面每点经验越贵。 */
  expNeed: lv => Math.round(120 * lv + 1.2 * lv * lv),
  stageExp: L => Math.round((30 + 9 * L) * (0.85 + rnd() * 0.3)),
  firstExp: (L, k) => Math.round((120 + 34 * L) * (KIND_MUL[k] || 1)),
  firstSilver: (L, k) => Math.round((110 + 41 * L) * (KIND_MUL[k] || 1)),
  stageSilver: L => Math.round((20 + 2 * L) * (0.8 + rnd() * 0.4)),
  drillPrice: lv => 0.8 + 0.06 * lv,          // 每点经验的银两单价
  drillAhead: 3,                              // 督练最多领先当前战线几级
  loseExp: 0.35,                              // 败仗拿三成经验
  /* 败仗原来一文钱不给。可治伤要钱、督练也要钱，输掉的仗只出不进 ——
     三周目一旦开始输，账上永远凑不出翻盘的钱。经验都给三成了，
     银两没有理由是零，同一个口径。 */
  loseSilver: 0.35,
  /* 伤势。原来一场仗打完什么都不留下 —— 全员满血复活，输了重来一遍就是，
     于是难度形同虚设，一百单八将也只用得着最强的九个。
     现在阵亡的人要养伤，而且「只有没上阵的人才恢复」——想让主力缓过来，
     就得派别人去打。二梯队这才有了用处。 */
  hurtHeavyRest: 3,       // 阵亡 → 重伤，休养几场
  hurtLightRest: 2,       // 残血 → 轻伤，休养几场
  hurtLightAt: 0.25,      // 血线低于这个比例算轻伤
  hurtLightMul: 0.8,      // 带伤上阵的属性折扣
  hurtMinRoster: 4,       // 可用人手不足这个数时，重伤降级为轻伤（防开局卡死）
  /* 一场仗最多几人重伤。原来没有上限：一败九人全抬下去，顶上来的是生手 ——
     经验只给上阵的人，于是越换越弱、越弱越输，一路滚到打不动。
     三周目八局里三局死在这个循环上，卡住时伤员 18–22 人、队伍均级
     比推荐低十几级。封了顶，一败折损三人，另外六个带轻伤接着打。 */
  hurtHeavyMax: 3,
  /* 二梯队拿半份经验。原来经验只给上阵的九个人，板凳上的永远是生手 ——
     主力一挂彩，顶上来的比推荐等级低十几级，这才是伤病死循环的发动机。
     只给按战力排在正选之后的九个人，不是全员：一百单八将人人满级的话，
     伤病就彻底没牙了。
     比例是扫出来的：0.5 三周目八局过七局，但一周目从 196 场掉到 158 场，
     首周目的火候削掉了两成；0.35 六局过五局；0.25 六局全过，一周目
     还是 158–310 场，与改动前同一量级。取 0.25 —— 够让替补接得上手，
     不够让一百单八将人人满级。 */
  benchExp: 0.25,
  cureHeavy: 2.5, cureLight: 1.0,   // 治疗价 = 系数 × 一级操练钱
  cureDoctor: 0.4,        // 安道全在册时打四折
  doctorId: 'an_daoquan',
  /* 升星原来只认「那个人自己的碎片」，而碎片只从重复角色来。
     摸底跑里三百七十抽打满全程，主力星级仍旧钉死在 2.7 ——
     你常用的恰恰是最稀有的那几个，重复概率趋近于零。
     兵符是通用碎片：首通给，任何人都能用，星级这才走得动。 */
  tokenBy: { normal: 0, side: 2, boss: 4, hidden: 6 },
  starCost: { 1: 2, 2: 4, 3: 8, 4: 16, 5: 32, 6: 64 },
  /* V10.3.4 升星消耗按品质分档：兵符是万能碎片，绝世和凡将升一星花一样多说不过去。
     名（q4）照旧，往下打折、往上加价；本人碎片也按这个数扣。 */
  starCostQ: { 1: 0.5, 2: 0.6, 3: 0.8, 4: 1.0, 5: 1.4, 6: 2.0 },
  fragByQ: { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8, 6: 12 },
  fragMelt: 2,            // 满星之后，几片本人碎片折一枚兵符
  /* 专属装备只从 Boss 关掉，概率极低。每次打赢 Boss（含速战）摇一次。 */
  excDrop: 0.03,

  recruitRate: { 1: 0.45, 2: 0.28, 3: 0.15, 4: 0.08, 5: 0.03, 6: 0.01 },
  recruitCost1: 500, recruitCost10: 4500,
  goldExchangeCost: 2,
  /* V10.3.5 黄金求贤：保底名将，天罡绝世压低（原来是保底天罡、天罡 75% 绝世 25%） */
  goldRate: { 4: 0.65, 5: 0.27, 6: 0.08 },
  pityTen: 4,             // 十连保底 ≥名
  pityFifty: 5,           // 累计 50 抽保底 ≥天罡

  /* V10.5 铁匠铺：抽装备。通用装备五个槽位都在池里，专属也进池但压得很低（品阶「7」）。
     池子的最高品阶跟着进度走：当前章的掉落上限 +1（qCap），一周目打完就不封。
     摇不到的档位把概率让给下面一档，界面上按实际池子重算显示。 */
  forgeCost1: 400, forgeCost10: 3600,
  forgeRate: { 1: 0.35, 2: 0.30, 3: 0.20, 4: 0.10, 5: 0.04, 6: 0.006, 7: 0.004 },
  forgePityTen: 3,        // 十连保底 ≥猛
  forgeForty: 5,          // 累计 40 抽保底 ≥天罡

  /* 演出节拍。一回合有十七到二十三件事，原来一股脑挤进一秒里，
     每件事分到 58 毫秒 —— 谁出的手、打的谁、死了没有，一样看不清。
     现在按「一拍」计时：一个人出一次手连着他造成的伤害算一拍，
     出了人命、暴击、群攻的拍子给更多停留时间。 */
  beatBase: 150,          // 一拍的基准毫秒
  roundMin: 900,          // 一回合最少占多久，免得三两下的回合一闪而过
  /* V10.2 拉开三档：原来 缓 1.6 / 常 1.0 / 疾 0.26，缓和常只差六成，手机上分不出来，
     常速本身也嫌快。现在前几回合一回合约 缓 5.5 秒 / 常 3.3 秒 / 疾 1.2 秒。 */
  speeds: { slow: 3.0, normal: 1.7, fast: 0.6 },
  speedTxt: { slow: '缓', normal: '常', fast: '疾' },
  roundDelay: 520,        // 回合之间的停顿 ms
  saveKey: 'shuihu_v10',
  saveVersion: 10,
};

const KIND_MUL = { normal: 1, side: 1.3, boss: 2, hidden: 2.5 };
const QTXT = { 1: '凡', 2: '良', 3: '猛', 4: '名', 5: '天罡', 6: '绝世' };
const QSEAL = { 1: '凡', 2: '良', 3: '猛', 4: '名', 5: '罡', 6: '绝' };
const QCLS = { 1: 'q-fan', 2: 'q-liang', 3: 'q-meng', 4: 'q-ming', 5: 'q-tian', 6: 'q-jue' };
const SLOTS = ['weapon', 'armor', 'helmet', 'mount', 'special'];
const SLOT_NAME = { weapon: '兵器', armor: '战甲', helmet: '头盔', mount: '坐骑', special: '宝物' };
const STAT_NAME = { atk: '武', def: '防', int: '智', agi: '捷', hp: '血' };

/* ── 2  工具 ─────────────────────────────────────────────────────────── */

const rnd = () => Math.random();
const rndInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chance = p => rnd() < p;
const pick = a => a[Math.floor(rnd() * a.length)];
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const $ = id => document.getElementById(id);

/* ── 2.5  技能文案 ───────────────────────────────────────────────────── */
/* 技能描述不再手写，从字段拼出来 —— 数据改了描述跟着改，永远对得上。
   纯字符串函数，视图和数据校验脚本都只认这一份。 */

const ST_NAME = { stun: '眩晕', silence: '沉默', disarm: '缴械', chaos: '混乱', taunt: '嘲讽',
                  vuln: '易伤', bleed: '流血', burn: '灼烧', poison: '中毒', dodge: '闪避', wind: '狂风' };
const TG_NAME = { single: '单体', row: '横排', col: '竖列', all: '敌方全体', back: '敌方后排', front: '敌方前排',
                  weakest: '血最少的敌人', strongest: '武最高的敌人', smartest: '智最高的敌人',
                  rand2: '随机两个敌人', rand3: '随机三个敌人',
                  self: '自身', mates: '全军', lowest: '血最少的队友', frontm: '我方前排', colm: '同列队友', hit: '命中者' };
const pc = x => Math.round(x * 100) + '%';

const SkillText = {
  cat(sk) {
    return sk.cat === 'passive' ? '被动' : sk.cat === 'cmd' ? '指挥'
         : sk.cat === 'sure' ? `必中·冷却${sk.cd || 2}` : `主动 ${pc(sk.rate == null ? 0.5 : sk.rate)}`;
  },
  fx(f) {
    const tg = TG_NAME[f.tg] || f.tg || '';
    const dur = f.dur ? `${f.dur}回合` : '';
    switch (f.k) {
      case 'dmg': {
        let s = f.src === 'gap' ? `对${tg}造成智力差伤害（施术者智力减目标智力）×${pc(f.mult)}，无视防御`
              : `对${tg}造成${pc(f.mult)}${f.src === 'int' ? '智力' : ''}伤害`;
        if (f.exec) s += `，目标血量低于${pc(f.exec.at)}时伤害×${f.exec.mul}`;
        if (f.drain) s += `，${f.drain >= 1 ? '' : pc(f.drain)}伤害转为自身回复`;
        if (f.pierce) s += `，无视${pc(f.pierce)}防御`;
        if (f.vsCtrl) s += `，对被控制（眩晕、混乱、沉默）的目标伤害+${pc(f.vsCtrl)}`;
        return s;
      }
      case 'status': {
        const n = ST_NAME[f.st] || f.st;
        const ch = f.chance != null && f.chance < 1 ? `${pc(f.chance)}几率` : '';
        if (f.st === 'vuln') return `${ch}使${tg}易伤（受伤+${pc(f.val || 0.2)}）${dur}`;
        if (f.st === 'dodge') return `${tg}获得${pc(f.val || 0.2)}闪避${dur}`;
        if (f.st === 'taunt') return `${tg}嘲讽敌方${dur}`;
        if (f.st === 'wind') return `${tg}陷入狂风${dur}（灼烧 +${pc(CFG.windBurn - 1)} 并向同排蔓延）`;
        if (f.st === 'bleed') return `${ch}使${tg}流血${dur}（每回合失 ${pc(CFG.bleedPct)} 最大生命，无视护盾）`;
        if (f.st === 'poison') return `${ch}使${tg}中毒${f.layers > 1 ? ` ${f.layers} 层` : ''}${dur}（每层每回合失 ${pc(CFG.poisonPct)} 当前生命，无视护盾）`;
        if (f.st === 'burn') return `${ch}使${tg}灼烧${dur}（每回合受施术者攻击值 ${pc(CFG.burnK)} 的伤害）`;
        return `${ch}使${tg}${n}${dur}`;
      }
      case 'buff':   return `${tg}${STAT_NAME[f.stat] || f.stat}+${pc(f.pct)}${dur ? '，持续' + dur : ''}`;
      case 'debuff': return `${tg}${STAT_NAME[f.stat] || f.stat}−${pc(f.pct)}${dur ? '，持续' + dur : ''}`;
      case 'heal':   return f.pct ? `${tg}回复${pc(f.pct)}血量` : `为${tg}回复智×${+(f.mult * CFG.healK).toFixed(2)}的血量`;
      case 'shield': return `${tg}获得${pc(f.pct)}血量的护盾`;
      case 'steal':  return `夺取${tg}${pc(f.pct)}的${STAT_NAME[f.stat] || f.stat}${dur}`;
      case 'cleanse':return `解除${tg}的负面状态`;
      case 'dispel': return `驱散${tg}的增益与护盾`;
      // 被动
      case 'pstat':  return `${STAT_NAME[f.stat] || f.stat}+${pc(f.pct)}`;
      case 'pcrit':  return `暴击率+${pc(f.val)}`;
      case 'pcritdmg': return `暴击伤害+${pc(f.val)}`;
      case 'pdmg':   return `造成的伤害+${pc(f.pct)}`;
      case 'pcut':   return `受到的伤害−${pc(f.pct)}`;
      case 'pdodge': return `${pc(f.chance)}几率闪避单体攻击`;
      case 'pcounter': return `受击后${pc(f.chance)}几率反击（${pc(f.mult)}伤害）`;
      case 'pfollow':  return `普攻后${pc(f.chance)}几率追击（${pc(f.mult)}伤害）`;
      case 'ponhit':   return `普攻${pc(f.chance)}几率使目标${ST_NAME[f.st] || f.st}${f.layers > 1 ? ` ${f.layers} 层` : ''}${dur}`;
      case 'pregen':   return `每回合回复${pc(f.pct)}血量`;
      case 'plow':     return `血量低于${pc(f.at)}时${STAT_NAME[f.stat] || f.stat}+${pc(f.pct)}`;
      case 'pshield':  return `开局获得${pc(f.pct)}血量的护盾`;
      case 'pimmune':  return `免疫${(f.st || []).map(x => ST_NAME[x] || x).join('、')}`;
      case 'pfirst':   return `首回合必定先手`;
      case 'ptough':   return `致命一击后保留 1 点血（一场一次）`;
      case 'pskrate':  return `主动技发动率+${pc(f.val)}`;
      case 'ppierce':  return `无视${pc(f.pct)}防御`;
      case 'pcmd':     return `指挥技效果+${pc(f.pct)}`;
      case 'pheal':    return `施放的治疗+${pc(f.pct)}`;
      case 'pctrl':    return `眩晕、混乱、沉默的命中几率+${pc(f.val)}`;
      case 'pbuff':    return `施放的增益与护盾+${pc(f.pct)}`;
      case 'pdot':     return `施加的流血、中毒伤害+${pc(f.pct)}`;
      default: return f.k;
    }
  },
  desc(sk) {
    const parts = (sk.fx || []).map(f => this.fx(f)).filter(Boolean);
    return parts.join('；') || '—';
  },
  full(sk) { return `【${this.cat(sk)}】${this.desc(sk)}`; },
};

/* ── 1  数据层（只读） ───────────────────────────────────────────────── */

const DB = (() => {
  const RAW = JSON.parse(document.getElementById('gameData').textContent);

  // 装备三套字段家族归一成一套
  const equip = {};
  for (const [id, e] of Object.entries(RAW.equipment)) {
    const q = typeof e.q === 'number' ? e.q
            : ({ '凡': 1, '良': 2, '猛': 3, '名': 4, '天罡': 5, '绝世': 6 }[e.q] || 2);
    equip[id] = {
      id,
      name: e.n || e.name || id,
      q,
      slot: e.slot === 'helm' ? 'helmet' : (e.slot || 'special'),
      desc: e.desc || '',
      weaponType: e.weapon_type || '',
      flat: { atk: e.atk || 0, def: e.def || 0, int: e.int || 0,
              agi: e.agi || 0, hp: e.hp || 0 },
      pct:  { atk: e.pct_atk || 0, def: e.pct_def || 0, hp: e.pct_hp || 0, int: e.pct_int || 0 },   // V10.6 文官兵器吃智%
      exclusive: e.exclusive || null,
      // 专属加成：只有本人穿才有。键是 atk/def/int/agi/hp/crit/all
      ownerBonus: e.exclusive ? (e.owner_bonus || { atk: 0.25 }) : null,
      fx: e.fx || [],          // V10.4 专属特效：本人穿才生效，写法同技能被动
      wen: !!e.wen,            // V10.6 文官合用的通用装（关卡掉落按阵上文官比例摇）
    };
  }

  const heroes = RAW.heroes, stages = RAW.stages;
  const bonds = RAW.bonds, items = RAW.items, dialogs = RAW.dialogs || {};

  /* V10.3 技能统一成一套字段：
       { name, cat, rate, cd, fx:[…] }
       cat  active 概率主动 · sure 必中主动（带冷却）· cmd 指挥（战前发一次）· passive 被动
       fx   见 Battle.applyFx / SkillText。
     旧的 13 种 type（atk_single / buff_all …）在这里折成新字段，数据层换完之后这段映射就没人走了。 */
  const legacy = (id, s) => {
    const m = s.mult != null ? s.mult : 1, out = { name: s.name, fx: [] };
    const st = s.stat || 'atk', v = s.value || 10, dur = s.dur || 2;
    const hit = s.eff ? [{ k: 'status', tg: 'hit', st: s.eff.type, chance: s.eff.chance || 0.3,
                           dur: s.eff.type === 'stun' ? 1 : s.eff.type === 'poison' ? 3 : 2 }] : [];
    const rateBy = (x, lo, hi) => Math.round(clamp(hi - (x - 1) * (hi - lo), lo, hi) * 20) / 20;
    switch (s.type) {
      case 'atk_single': Object.assign(out, { cat: 'active', rate: rateBy(m, 0.4, 0.65) }); out.fx = [{ k: 'dmg', tg: 'single', mult: m }, ...hit]; break;
      case 'atk_row':    Object.assign(out, { cat: 'active', rate: rateBy(m, 0.35, 0.5) });  out.fx = [{ k: 'dmg', tg: 'row', mult: m }, ...hit]; break;
      case 'atk_col':    Object.assign(out, { cat: 'active', rate: rateBy(m, 0.35, 0.5) });  out.fx = [{ k: 'dmg', tg: 'col', mult: m }, ...hit]; break;
      case 'atk_all':    Object.assign(out, { cat: 'active', rate: 0.35 });                  out.fx = [{ k: 'dmg', tg: 'all', mult: m }, ...hit]; break;
      case 'heal_all':   Object.assign(out, { cat: 'active', rate: 0.45 }); out.fx = [{ k: 'heal', tg: 'mates', mult: m }]; break;
      case 'heal_one':   Object.assign(out, { cat: 'active', rate: 0.55 }); out.fx = [{ k: 'heal', tg: 'lowest', mult: m * 1.6 }]; break;
      case 'heal_self':  Object.assign(out, { cat: 'active', rate: 0.55 }); out.fx = [{ k: 'heal', tg: 'self', mult: m * 1.4 }]; break;
      case 'shld_self':  Object.assign(out, { cat: 'sure', cd: 2 });        out.fx = [{ k: 'shield', tg: 'self', pct: m }]; break;
      case 'shld_all':   Object.assign(out, { cat: 'cmd' });                out.fx = [{ k: 'shield', tg: 'mates', pct: m }]; break;
      case 'shld_col':   Object.assign(out, { cat: 'sure', cd: 2 });        out.fx = [{ k: 'shield', tg: 'colm', pct: m }]; break;
      case 'buff_all':
        if (st === 'hp') { Object.assign(out, { cat: 'active', rate: 0.45 }); out.fx = [{ k: 'heal', tg: 'mates', pct: v / 100 }]; }
        else { Object.assign(out, { cat: 'cmd' }); out.fx = [{ k: 'buff', tg: 'mates', stat: st, pct: v / 100, dur: dur + 1 }]; }
        break;
      case 'steal':
        Object.assign(out, { cat: 'active', rate: 0.5 });
        out.fx = st === 'hp' ? [{ k: 'dmg', tg: 'single', mult: 1.0, drain: 1 }]
                             : [{ k: 'steal', tg: 'strongest', stat: st, pct: v / 100, dur }];
        break;
      case 'chaos':
        Object.assign(out, { cat: 'active', rate: 0.45 });
        out.fx = [{ k: 'status', tg: 'smartest', st: 'chaos', chance: s.chance || 0.5, dur: 1 }];
        break;
      default: Object.assign(out, { cat: 'active', rate: 0.5 }); out.fx = [{ k: 'dmg', tg: 'single', mult: m }];
    }
    return out;
  };
  const skills = {};
  for (const [id, s] of Object.entries(RAW.skills)) {
    const n = s.cat ? { name: s.name, cat: s.cat, rate: s.rate, cd: s.cd, fx: s.fx || [] } : legacy(id, s);
    n.id = id;
    if (n.cat === 'active' && n.rate == null) n.rate = 0.5;
    if (n.cat === 'sure' && !n.cd) n.cd = 2;
    if (n.cat !== 'sure') n.cd = 0;
    if (n.cat !== 'active') n.rate = 1;
    n.desc = SkillText.desc(n);
    skills[id] = n;
  }
  const story = RAW.story || { intro: [], chapters: {}, epilogue: null };

  // 羁绊倒排：hid → 参与的羁绊
  const bondsOf = {};
  bonds.forEach((b, i) => (b.members || []).forEach(m => (bondsOf[m] ||= []).push(i)));

  // 关卡按章分组并排序
  const byChapter = {};
  const stageKey = sid => {
    const m = String(sid).match(/^(?:ch|hidden_)(\d+)_(\w+)$/);
    if (!m) return [999, 9, 0];
    const rest = m[2];
    if (/^\d+$/.test(rest)) return [+m[1], 0, +rest];
    if (rest === 'boss') return [+m[1], 1, 0];
    if (rest[0] === 'f') return [+m[1], 2, +rest.slice(1) || 0];
    return [+m[1], 3, 0];
  };
  for (const sid of Object.keys(stages)) (byChapter[stages[sid].ch || 0] ||= []).push(sid);
  for (const ch of Object.keys(byChapter)) {
    byChapter[ch].sort((a, b) => {
      const ka = stageKey(a), kb = stageKey(b);
      for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return 0;
    });
  }
  const chapters = Object.keys(byChapter).map(Number).sort((a, b) => a - b);

  const recruitPool = Object.keys(heroes).filter(k => heroes[k].src !== '杂兵');
  const poolByQ = {};
  recruitPool.forEach(k => (poolByQ[heroes[k].q] ||= []).push(k));

  return {
    hero: id => heroes[id] || null,
    /** V10.6 敌方口径：升过品阶的文官当敌将时仍用改版前的品阶与五维（数据里的 foe 快照），关卡难度不跟着变 */
    foeHero: id => { const t = heroes[id]; return t ? (t.foe ? Object.assign({}, t, t.foe) : t) : null; },
    skill: id => skills[id] || null,
    equip: id => equip[id] || null,
    stage: id => stages[id] || null,
    item: id => items[id] || null,
    dialog: id => dialogs[id] || null,
    story, chapterCard: ch => story.chapters[String(ch)] || null,
    heroIds: () => Object.keys(heroes),
    equipIds: () => Object.keys(equip),
    stageIds: () => Object.keys(stages),
    bonds, bondsOf, byChapter, chapters, stageKey,
    recruitPool, poolByQ,
    exclusivePool: (RAW.EXCLUSIVE_POOL || []).filter(k => equip[k] && equip[k].exclusive),
    /** 专属去重时删掉的装备 → 留下来的那件。读旧存档时用 */
    equipRemap: RAW.equip_remap || {},
    /** V10.4 同一人拆成两个的并掉了（贺统军 → 贺重宝、于玉珏 → 于玉麟）。读旧存档时用 */
    heroRemap: RAW.hero_remap || {},
    /** V10.4 绝世三件套：hid → { name, items:[兵,甲,骑], fx } */
    excSet: hid => (RAW.exc_sets || {})[hid] || null,
  };
})();

/* ── 3  存档 ─────────────────────────────────────────────────────────── */

const Save = {
  write() {
    if (!G.heroes || !Object.keys(G.heroes).length || !Array.isArray(G.team)) return false;
    try {
      localStorage.setItem(CFG.saveKey, JSON.stringify({
        v: CFG.saveVersion,
        heroes: G.heroes, items: G.items, frags: G.frags,
        cleared: G.cleared, team: G.team, res: G.res,
        log: G.log, clearCount: G.clearCount, pity: G.pity, speed: G.speed,
        seenIntro: G.seenIntro, seenCh: G.seenCh, fold: G.fold, seenEpi: G.seenEpi,
        lap: G.lap, fates: G.fates, everCleared: G.everCleared,
        mode: G.mode, startGift: G.startGift, giftShown: G.giftShown,
      }));
      return true;
    } catch (e) { return false; }
  },
  read() {
    try {
      const raw = localStorage.getItem(CFG.saveKey);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return (d && d.v === CFG.saveVersion) ? d : null;
    } catch (e) { return null; }
  },
  wipe() { try { localStorage.removeItem(CFG.saveKey); } catch (e) {} },

  /** V10.0 → V10.1 的存档就地折算，重复跑不出事。
   *   · 三种无主碎片按片数折成兵符（1/3/5）
   *   · 专属去重删掉的装备换成留下来的那件；数据里已经没有的装备卸掉
   *   · 武将身上的魅删掉
   *   · 已经满星的人，碎片按 2:1 折兵符 */
  migrate() {
    // V10.4 并掉的人：没有新的就整个挪过去；两个都有，旧的那个折成新人的碎片
    for (const [old, to] of Object.entries(DB.heroRemap)) {
      if (!DB.hero(to)) continue;
      const oh = G.heroes[old];
      if (oh) {
        if (!G.heroes[to]) {
          // 按新人的底子重建，等级、星级、装备、伤势照旧；混乱模式的随机技能也照旧
          const h = makeHero(to);
          h.lv = oh.lv || 1; h.exp = oh.exp || 0; h.star = oh.star || 1;
          if (h.lv > 1) h.base = Object.assign({}, grownBase(to, h.lv));
          h.equipment = oh.equipment || h.equipment; h.hurt = oh.hurt || h.hurt;
          if (oh.sk) { h.sk = oh.sk; h.owned = oh.owned; }
          else h.owned = (DB.hero(to).sk || []).slice(0, Math.min(h.star, 4));
          G.heroes[to] = h;
        }
        else {
          G.frags[to] = (G.frags[to] || 0) + (CFG.fragByQ[DB.hero(to).q] || 1) * (oh.star || 1);
          for (const s of SLOTS) {            // 旧的身上的装备放回行囊
            const id = oh.equipment && oh.equipment[s];
            if (id) G.items['eq_' + id] = (G.items['eq_' + id] || 0) + 1;
          }
        }
        delete G.heroes[old];
      }
      if (G.frags[old]) { G.frags[to] = (G.frags[to] || 0) + G.frags[old]; delete G.frags[old]; }
      if (Array.isArray(G.team)) G.team = [...new Set(G.team.map(h => h === old ? to : h))];
      if (Array.isArray(G.startGift)) G.startGift = G.startGift.map(h => h === old ? to : h);
    }
    for (const [k, v] of [['frag', 1], ['frag2', 3], ['frag3', 5]]) {
      if (G.items[k]) { G.res.token = (G.res.token || 0) + G.items[k] * v; delete G.items[k]; }
    }
    const R = DB.equipRemap;
    for (const k of Object.keys(G.items)) {
      if (!k.startsWith('eq_')) continue;
      const id = k.slice(3), to = R[id] || id;
      if (!DB.equip(to)) { delete G.items[k]; continue; }
      if (to !== id) { G.items['eq_' + to] = (G.items['eq_' + to] || 0) + G.items[k]; delete G.items[k]; }
    }
    for (const h of Object.values(G.heroes)) {
      for (const o of [h.base, h.base0]) if (o) delete o.cha;
      for (const s of SLOTS) {
        const id = h.equipment && h.equipment[s];
        if (!id) continue;
        const to = R[id] || id, e = DB.equip(to);
        if (e && e.slot === s) { h.equipment[s] = to; continue; }
        // 换过来的那件不是这一格的（玉麒麟金枪并进了麒麟黄金甲），卸下放回行囊
        h.equipment[s] = null;
        if (e) G.items['eq_' + to] = (G.items['eq_' + to] || 0) + 1;
      }
    }
    for (const hid of Object.keys(G.frags)) {
      if (!G.heroes[hid] || !(G.frags[hid] > 0)) { if (!(G.frags[hid] > 0)) delete G.frags[hid]; continue; }
      Grow.melt(hid);
    }
    // V10.5 技能勘误换掉了 44 个技能 ID。传统模式按图鉴重发；混乱模式里摇到的旧 ID 换一个新的随机技
    for (const [hid, h] of Object.entries(G.heroes)) {
      if (!DB.hero(hid)) continue;
      if (h.sk) {
        h.sk = h.sk.map(id => DB.skill(id) ? id : Chaos.roll().find(x => !h.sk.includes(x)) || id);
        h.owned = h.sk.slice(0, Math.min(h.star || 1, 4));
      } else if ((h.owned || []).some(id => !DB.skill(id))) {
        h.owned = (DB.hero(hid).sk || []).slice(0, Math.min(h.star || 1, 4));
      }
    }
    G.pity = Object.assign({ ten: 0, fifty: 0, forge: 0 }, G.pity || {});
  },
};

/* ── 4  状态 ─────────────────────────────────────────────────────────── */

const G = {
  heroes: {}, items: {}, frags: {}, cleared: {}, team: [],
  res: { silver: 0, gold: 0, token: 0 }, log: [], clearCount: 0, pity: { ten: 0, fifty: 0 },
  speed: 'normal', seenIntro: false, seenCh: {}, fold: {},
  seenEpi: false,   // 尾声只在头一回打完一周目时自动出，之后从主界面重看
  /* 周目。老存档没有这三个字段，读进来按一周目算，一切照旧。
     everCleared 跨周目不清 —— 上一周目打过的关，这一周目可以直接速战，
     不然重看一遍 139 段关前白很烦。 */
  lap: 1, fates: [], everCleared: {},
  /* V10.3 模式：classic 传统（技能按图鉴）/ chaos 混乱（每人入手时随机四个技能，记在 h.sk）。
     老存档没这个字段，按传统读。 */
  mode: 'classic',
  startGift: null,   // 开局随机送的两个人 [绝世, 凡]，入伙卡要亮他们
  giftShown: false,
};

/* 五位数的伤害飘在 46 像素宽的格子上没法看，过万折成「万」。
   战报和格子共用这一条，免得一边写「27万」一边写「93132」。 */
const num = v => v >= 10000 ? (v / 10000).toFixed(v >= 100000 ? 0 : 1) + '万' : String(Math.round(v));

/* 关名在数据里带着「·Boss」和「★」两种后缀，是给自己看的记号：
   前者章末关有，后者隐藏关有。玩家那边不该看见 —— 关名左边本来就有方印标着，
   名字里再带一次是多余的，中英混排还把整页的古籍味破了。
   只在显示时剥掉，数据里的 name 原样留着，调试和模拟还靠它认关卡类型。 */
const stName = n => String(n || '').replace(/·Boss$/i, '').replace(/^★/, '');

const UI = { view: 'main', sel: null, stage: null, battle: null, playing: false,
  hsort: 'q', hfilt: 'all' };   // 群将谱当下的排法与筛法，只活在这一次会话里

function makeHero(hid) {
  const t = DB.hero(hid);
  if (!t) return null;
  const h = {
    hid, lv: 1, exp: 0, star: 1,
    hurt: { lv: 0, rest: 0 },
    base: { atk: t.atk, def: t.def, int: t.int, agi: t.agi, hp: baseHp(t) },
    base0: { atk: t.atk, def: t.def, int: t.int, agi: t.agi, hp: baseHp(t) },
    owned: [],
    equipment: { weapon: null, armor: null, helmet: null, mount: null, special: null },
  };
  // 混乱模式：入手那一刻摇四个技能，从此就是他的。敌人不走这里，还是原装。
  if (G.mode === 'chaos') h.sk = Chaos.roll();
  h.owned = skillIdsOf(hid, h).slice(0, 1);
  return h;
}

/* 混乱模式的技能池：招募池里所有人的技能，杂兵的「招式3」这种不进来。
   完全随机，四个不重复 —— 可能抽到四个被动，那就是一辈子普攻的命。 */
const Chaos = {
  pool: null,
  all() {
    if (!this.pool) {
      const set = new Set();
      for (const hid of DB.recruitPool) for (const id of (DB.hero(hid).sk || [])) if (DB.skill(id)) set.add(id);
      this.pool = [...set];
    }
    return this.pool;
  },
  roll() {
    const pool = this.all().slice(), out = [];
    while (out.length < 4 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  },
};

/** 开局送的两个人：一个绝世、一个凡将，都从招募池里随机。 */
function rollStartGift() {
  const top = DB.poolByQ[6] || DB.poolByQ[5] || [], low = DB.poolByQ[1] || DB.poolByQ[2] || [];
  return [pick(top), pick(low)].filter(Boolean);
}

function initGame(mode) {
  G.mode = mode === 'chaos' ? 'chaos' : 'classic';
  G.heroes = {}; G.items = {}; G.frags = {}; G.cleared = {}; G.team = [];
  G.res = { silver: CFG.startSilver, gold: 0, token: 0 };
  G.log = []; G.clearCount = 0; G.pity = { ten: 0, fifty: 0, forge: 0 }; G.speed = G.speed || 'normal';
  G.seenIntro = false; G.seenCh = {}; G.fold = G.fold || {}; G.seenEpi = false;
  G.lap = 1; G.fates = []; G.everCleared = {};
  G.startGift = rollStartGift(); G.giftShown = false;
  for (const hid of G.startGift) {
    const h = makeHero(hid);
    if (h) { G.heroes[hid] = h; G.team.push(hid); }
  }
}

/* ── 4.5  周目与宿星 ─────────────────────────────────────────────────── */

/* 一周目打完时，等级 47/50、星级 4.9/5 都贴着天花板，人却只收到三分之一。
   两条成长轴封了顶，剩下的收集又全看抽卡运气 —— 于是「通关了但没得玩」。
   二周目把上限往上抬一档，关卡从头再打一遍，养成全留着。 */
const Lap = {
  now()      { return G.lap || 1; },
  maxLv(l)   { l = l || this.now(); return CFG.lapLv[l]   || CFG.lapLvMax; },
  maxStar(l) { l = l || this.now(); return CFG.lapStar[l] || CFG.lapStarMax; },

  /** 敌方按周目整体上浮。系数是跑模拟校出来的，不拍脑袋定。 */
  foeMul() { return CFG.lapFoeBy[this.now()] || CFG.lapFoeMax; },

  /** 关卡强度系数按周目折算：一周目原样，之后先削顶再乘微调。 */
  foeMulOf(mul, q, ch) {
    const table = ch >= CFG.lateCapCh ? CFG.mulCapLate : this.now() <= 1 ? CFG.mulCap1 : CFG.lapMulCap;
    const cap = table[q || 6];
    const m = Math.min(mul, cap);
    return m * this.foeMul();
  },

  /** 本周目敌方等级的区间。一周目原样不动。 */
  band() { return this.now() <= 1 ? null : (CFG.lapBand[this.now()] || CFG.lapBandMax); },

  /** 推荐等级跟着敌方一起平移。不然二周目第一关会写着「推荐 1–3 级 · 敌方 46 级」。 */
  recLv(rl) {
    if (!rl) return rl;
    return [this.foeLv(rl[0]), this.foeLv(rl[1])];
  },

  /** 一周目后段拉伸，见 CFG.foeStretch */
  stretch(lv) {
    const [from, to] = CFG.foeStretch, top = CFG.foeLv1[1];
    if (lv <= from) return lv;
    return Math.round(from + (lv - from) * (to - from) / Math.max(1, top - from));
  },

  /** 把一周目的敌方等级映射到本周目的区间 */
  foeLv(lv) {
    const b = this.band();
    if (!b) return this.stretch(lv);
    const [a0, a1] = CFG.foeLv1, [b0, b1] = b;
    const t = clamp((lv - a0) / Math.max(1, a1 - a0), 0, 1);
    return Math.round(b0 + t * (b1 - b0));
  },

  /** 敌方装备等效系数，按章 */
  foeGear(ch) {
    const [[c0, g0], [c1, g1]] = CFG.foeGear;
    if (ch < c0) return 0;
    return g0 + (g1 - g0) * clamp((ch - c0) / Math.max(1, c1 - c0), 0, 1);
  },

  /** 二周目的主成长轴是星级不是等级，所以符的产出跟着周目走 */
  tokenMul() { return this.now(); },

  done() { return DB.stageIds().every(sid => G.cleared[sid]); },

  /** 重整旗鼓：人、等级、星、装备、家当全留着，关卡进度和伤势清零 */
  next() {
    if (!this.done()) return '这一周目还没打完';
    for (const sid of Object.keys(G.cleared)) G.everCleared[sid] = 1;
    G.cleared = {};
    for (const h of Object.values(G.heroes)) h.hurt = { lv: 0, rest: 0 };
    G.lap = this.now() + 1;
    G.seenCh = {};
    Fate.roll();
    Save.write();
    return null;
  },
};

/* 宿星。二周目开局石碣上亮三颗，这一周目全程生效，周目之间不继承。
   每条都有得有失 —— 没有纯赚的，所以花符重掷是权衡，不是刷分。 */
const FATES = [
  { id: 'kui',  name: '天魁星', up: '我方武力 +12%',      dn: '敌方血量 +15%',            f: { myAtk: 1.12, foeHp: 1.15 } },
  { id: 'sha',  name: '天杀星', up: '我方暴击率翻倍',     dn: '我方受到的暴击也翻倍',      f: { myCrit: 2, foeCrit: 2 } },
  { id: 'su',   name: '天速星', up: '我方捷 +18%',        dn: '我方防 −10%',              f: { myAgi: 1.18, myDef: 0.90 } },
  { id: 'shou', name: '天寿星', up: '伤势休养少一场',     dn: '治伤价钱翻倍',             f: { rest: -1, cure: 2 } },
  { id: 'fu',   name: '天富星', up: '银两收入 ×1.6',      dn: '符的产出减半',             f: { silver: 1.6, token: 0.5 } },
  { id: 'qiao', name: '天巧星', up: '装备掉落翻倍',       dn: '装备品阶上限降一档',        f: { drop: 2, qcap: -1 } },
  { id: 'ku',   name: '天哭星', up: '银两收入 ×1.8',      dn: '阵亡一律重伤，不再有轻伤',  f: { silver: 1.8, allHeavy: 1 } },
  { id: 'gu',   name: '地孤星', up: '我方全属性 +15%',    dn: '羁绊全部失效',             f: { myAll: 1.15, noBond: 1 } },
  { id: 'sha2', name: '地煞星', up: '首通符 +2',          dn: '敌方每关多一人',           f: { tokenAdd: 2, foeMore: 1 } },
  { id: 'sun',  name: '地损星', up: '首通经验 ×1.4',      dn: '每关结束随机一名上阵者轻伤', f: { exp: 1.4, hurtAfter: 1 } },
  { id: 'fu2',  name: '地伏星', up: '前排承伤减免 20%',   dn: '后排受创 +20%',            f: { frontCut: 0.8, backUp: 1.2 } },
  { id: 'ling', name: '地灵星', up: '每回合全队回血 2%',  dn: '安道全不在册时全队血量 −8%', f: { regen: 0.02, needDoc: 1 } },
];

const Fate = {
  all() { return FATES; },
  of(id) { return FATES.find(x => x.id === id) || null; },
  on()  { return (G.fates || []).map(id => this.of(id)).filter(Boolean); },

  /** 某一条修正当下的值。没抽到这条宿星就返回兜底值。 */
  v(key, dflt) {
    let r = dflt;
    for (const f of this.on()) if (f.f[key] != null) {
      // 乘数相乘、加数相加：按兜底值是 1 还是 0 判断
      r = dflt === 1 ? r * f.f[key] : dflt === 0 ? r + f.f[key] : f.f[key];
    }
    return r;
  },
  has(key) { return this.on().some(f => f.f[key] != null); },

  roll() {
    const pool = FATES.map(f => f.id);
    const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    G.fates = out;
    G.fateRerolled = {};
    return out;
  },

  /** 一颗只许重掷一次，免得拿符刷到一手顺的 */
  reroll(id) {
    const i = (G.fates || []).indexOf(id);
    if (i < 0) return '没有这颗星';
    G.fateRerolled = G.fateRerolled || {};
    if (G.fateRerolled[id]) return '这颗已经换过一次了';
    if ((G.res.token || 0) < CFG.fateReroll) return `需 ${CFG.fateReroll} 符`;
    const pool = FATES.map(f => f.id).filter(x => !G.fates.includes(x));
    if (!pool.length) return '没有别的星可换';
    G.res.token -= CFG.fateReroll;
    const got = pool[Math.floor(rnd() * pool.length)];
    G.fates[i] = got;
    G.fateRerolled[got] = 1;
    Save.write();
    return null;
  },
};

/* ── 5  数值层 ───────────────────────────────────────────────────────── */
/* 全局唯一属性口径。任何地方要数值都来这里拿，包括战力和敌人。 */

const GROW_KEYS = ['atk', 'def', 'int', 'agi', 'hp'];
const RARITY_GROW = { 6: 1.0, 5: 0.92, 4: 0.84, 3: 0.76, 2: 0.68, 1: 0.6 };

/** 单级成长增量。玩家升级与敌人构造共用同一实现，保证敌我同口径。 */
/* 血量成长率：数据里 gr.hp 武将 0.35–0.50、文官 0.13–0.23，原来乘 0.18 封顶 0.06，
   武将全撞顶、文官 0.02 —— 五十级下来血差近一倍，再叠上基础血的差距就是四倍。
   V10.3.1 压进 0.035–0.05 这条窄带：武将还是更肉，但文官不再一碰就倒。 */
function hpGrow(gr) {
  const raw = gr != null ? gr : 0.3;
  return 0.035 + 0.015 * clamp((raw - 0.13) / 0.37, 0, 1);
}
function growStep(t, base0, k) {
  const gr = t.gr || {};
  const g = k === 'hp' ? hpGrow(gr.hp) : (gr[k] != null ? gr[k] : 0.028);
  return Math.max(1, Math.round((base0[k] || 10) * g * (RARITY_GROW[t.q] || 0.8)));
}

/** 基础血下限 100：几个文官 80–90 的底子，加上更矮的成长，五十级还是纸糊的 */
const baseHp = t => Math.max(100, t.hp || 10);

/** 把模板按等级累积成长，得到该等级的 base。带缓存。 */
const _grownCache = new Map();
function grownBase(hid, lv, foeT) {
  const key = hid + '@' + lv + (foeT ? 'f' : '');
  const hit = _grownCache.get(key);
  if (hit) return hit;
  const t = foeT ? DB.foeHero(hid) : DB.hero(hid);
  if (!t) return null;
  const b0 = { atk: t.atk, def: t.def, int: t.int, agi: t.agi, hp: baseHp(t) };
  const b = Object.assign({}, b0);
  for (let i = 1; i < lv; i++) for (const k of GROW_KEYS) b[k] += growStep(t, b0, k);
  _grownCache.set(key, b);
  return b;
}

/** 一周目敌方强度按章的折扣，折线插值。见 CFG.foeEase */
function foeEase(ch, side) {
  const P = side ? CFG.foeEaseSide : CFG.foeEase;
  if (!P || !P.length) return 1;
  if (ch <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) {
    if (ch <= P[i][0]) {
      const [x0, y0] = P[i - 1], [x1, y1] = P[i];
      return y0 + (y1 - y0) * (ch - x0) / (x1 - x0);
    }
  }
  return P[P.length - 1][1];
}

/** V10.6 出手后才倒计时的控制状态 */
const CTRL_ST = ['stun', 'chaos', 'silence', 'disarm'];

/** V10.6 Boss 关阵势。关卡数据里 theme 字段指到这里；效果只挂在敌方身上，叠在 Boss ×1.5 之上。
 *  普攻附带状态（ponhit）会先后掷两次几率，这里填的是开过平方的数，实际命中 = 平方 */
const THEMES = {
  shield: { name: '铁壁', tip: '敌方全体开局带三成血量的护盾，不会消散，每三回合再加一成。带驱散的人、流血中毒（穿盾）好打得多。' },
  dot:    { name: '毒刃', tip: '敌方普攻带毒带血，他们上的毒和流血伤害翻倍。带净化、治疗的人好打得多。' },
  chaos:  { name: '迷阵', tip: '一开阵我方就有人发昏，敌方普攻三成几率让人混乱，控制更容易中。智高的人不容易乱，免疫混乱的装备、净化都管用。' },
  blade:  { name: '刀山', tip: '敌方全是武将，武力加两成、暴击加一成。护盾减伤顶住，智力差伤害专打武将。' },
  wen:    { name: '谋臣', tip: '敌方以文官为主，智加三成半、技能更常放。驱散拆他们的增益、净化解控，我方智高也不容易被乱。' },
};
/** 阵势对敌方面板的加成（战力估算与开打共用） */
function themeStats(s, th) {
  if (!s || !th) return s;
  if (th === 'blade') s.atk = Math.round(s.atk * 1.2);
  if (th === 'wen') s.int = Math.round(s.int * 1.35);
  return s;
}
/** 阵势的战斗效果：开打时挂到每个敌将身上 */
function themeUnit(u, th) {
  const p = u.pas = Object.assign({}, u.pas, { onhit: (u.pas.onhit || []).slice() });
  if (th === 'shield') { u.shield += Math.round(u.maxHp * 0.3); u.shieldDur = 99; }
  if (th === 'dot') {
    p.onhit.push({ k: 'ponhit', st: 'poison', chance: 0.89, dur: 2, layers: 2 }, { k: 'ponhit', st: 'bleed', chance: 0.67, dur: 2 });
    p.dot = (p.dot || 0) + 1.0;
  }
  if (th === 'chaos') { p.onhit.push({ k: 'ponhit', st: 'chaos', chance: 0.55, dur: 1 }); p.ctrl = (p.ctrl || 0) + 0.20; }
  if (th === 'blade') u.crit = (u.crit || 0) + 0.10;
  if (th === 'wen') p.skrate = (p.skrate || 0) + 0.15;
}

/** V10.6 定位：武、智差不到一成五算文武双全；否则高的那边定。战力、卡片、筛选、武%加智都按这个分 */
const roleOf = t => { if (!t) return 'wu'; const a = t.atk || 0, i = t.int || 0; return Math.min(a, i) / Math.max(a, i, 1) >= 0.85 ? 'mix' : a > i ? 'wu' : 'wen'; };
/** 主属性：武，或 智×法术系数，取高的 */
const mainOf = s => { const m = (s.int || 0) * CFG.intK; return m > (s.atk || 0) ? { k: 'int', v: s.int, eff: m, sub: s.atk || 0 } : { k: 'atk', v: s.atk, eff: s.atk || 0, sub: (s.int || 0) * CFG.intK }; };
/** 技能威力倍数：智在「智+武」里占得越多，技能越狠。详情页和战斗共用这一条 */
const skillPow = (int, atk) => 1 + CFG.intSk * int / Math.max(1, int + atk);

/** 这个人的四个技能 ID。混乱模式下每人有自己的一套（h.sk），传统模式读图鉴。 */
function skillIdsOf(hid, h) { return (h && h.sk) || (DB.hero(hid) || {}).sk || []; }

/** 被动汇总：一组技能里的被动折成一张表。属性层的（pstat / pcrit）进 Stats.calc，
 *  战斗层的（反击、追击、减伤……）由 Battle 在钩子里读。 */
function passivesOf(ids, extra) {
  const p = { stat: { atk: 0, def: 0, int: 0, agi: 0, hp: 0 }, crit: 0, critDmg: 0, dmg: 0, cut: 0, dodge: 0,
              counter: null, follow: null, onhit: [], regen: 0, low: [], shield: 0, immune: [], first: false, tough: false,
              skrate: 0, pierce: 0, cmd: 0, heal: 0, ctrl: 0, buff: 0, dot: 0 };
  // 技能被动 + V10.4 专属装备特效（extra：本人穿着的专属与套装，已在 Stats.gear 里挑好）
  const lists = [];
  for (const id of ids || []) {
    const s = DB.skill(id);
    if (s && s.cat === 'passive') lists.push(s.fx);
  }
  if (extra && extra.length) lists.push(extra);
  for (const fxs of lists) {
    for (const f of fxs) {
      switch (f.k) {
        case 'pstat':    p.stat[f.stat] = (p.stat[f.stat] || 0) + f.pct; break;
        case 'pcrit':    p.crit += f.val; break;
        case 'pcritdmg': p.critDmg += f.val; break;
        case 'pdmg':     p.dmg += f.pct; break;
        case 'pcut':     p.cut += f.pct; break;
        case 'pdodge':   p.dodge += f.chance; break;
        case 'pcounter': p.counter = p.counter && p.counter.chance > f.chance ? p.counter : { chance: f.chance, mult: f.mult }; break;
        case 'pfollow':  p.follow = p.follow && p.follow.chance > f.chance ? p.follow : { chance: f.chance, mult: f.mult }; break;
        case 'ponhit':   p.onhit.push(f); break;
        case 'pregen':   p.regen += f.pct; break;
        case 'plow':     p.low.push(f); break;
        case 'pshield':  p.shield += f.pct; break;
        case 'pimmune':  p.immune.push(...(f.st || [])); break;
        case 'pfirst':   p.first = true; break;
        case 'ptough':   p.tough = true; break;
        case 'pskrate':  p.skrate += f.val; break;
        case 'ppierce':  p.pierce += f.pct; break;
        case 'pcmd':     p.cmd += f.pct; break;
        case 'pheal':    p.heal += f.pct; break;
        case 'pctrl':    p.ctrl += f.val; break;
        case 'pbuff':    p.buff += f.pct; break;
        case 'pdot':     p.dot += f.pct; break;
      }
    }
  }
  const cp = CFG.pasCap;
  p.cut = Math.min(p.cut, cp.cut); p.dodge = Math.min(p.dodge, cp.dodge);
  p.skrate = Math.min(p.skrate, cp.skrate); p.pierce = Math.min(p.pierce, cp.pierce);
  p.heal = Math.min(p.heal, cp.heal); p.ctrl = Math.min(p.ctrl, cp.ctrl); p.buff = Math.min(p.buff, cp.buff); p.dot = Math.min(p.dot, cp.dot);
  return p;
}
/** 暴击率（未计宿星）。详情页和战斗共用 */
const critRate = (agi, extra) => CFG.critRate + Math.min(CFG.critAgiCap, agi / CFG.critAgiK) + (extra || 0);

const Stats = {
  /** 羁绊加成（按队伍构成，返回各属性的百分比） */
  bond(hid, team) {
    const out = { atk: 0, def: 0, int: 0, agi: 0, hp: 0 };
    const idx = DB.bondsOf[hid];
    if (!idx || !team || !team.length) return out;
    const inTeam = new Set(team);
    if (!inTeam.has(hid)) return out;
    for (const i of idx) {
      const b = DB.bonds[i];
      const have = (b.members || []).filter(m => inTeam.has(m)).length;
      let rate = 0;
      for (const t of (b.tiers || [])) if (have >= t.need) rate = Math.max(rate, t.rate);
      if (!rate) continue;
      const a = b.attr || 'atk';
      if (a in out) out[a] += (b.val || 0) / 100 * rate;
    }
    return out;
  },

  /** 装备汇总 */
  gear(h, hid) {
    const t = DB.hero(hid) || {};
    const fav = t.fav_weapon || '';
    const flat = { atk: 0, def: 0, int: 0, agi: 0, hp: 0 };
    const pct = { atk: 0, def: 0, hp: 0 };
    // 专属加成按件上写的来。原来只认武力，天王宝塔写着血防，给的却是武 +25%
    const exc = { atk: 0, def: 0, int: 0, agi: 0, hp: 0, crit: 0 };
    let apt = false, excOn = null, list = [];
    const excList = [], fx = [];                        // V10.4：一人可穿多件专属
    for (const slot of SLOTS) {
      const e = DB.equip(h.equipment && h.equipment[slot]);
      if (!e) continue;
      list.push(e);
      for (const k in flat) flat[k] += e.flat[k] || 0;
      for (const k in pct) pct[k] += e.pct[k] || 0;
      if (e.weaponType && fav && e.weaponType === fav) apt = true;
      if (e.exclusive === hid && e.ownerBonus) {        // 非本人穿：只拿面板
        excOn = excOn || e;
        excList.push(e);
        if (e.fx.length) fx.push(...e.fx);
        const ob = e.ownerBonus;
        for (const k of Object.keys(exc)) exc[k] += (ob[k] || 0) + (k !== 'crit' ? (ob.all || 0) : 0);
      }
    }
    // 绝世三件套：三件都是本人的、都穿着，套装效果才生效
    const set = DB.excSet(hid);
    const setHave = set ? set.items.filter(id => excList.some(e => e.id === id)).length : 0;
    const setOn = !!set && setHave === set.items.length;
    if (setOn) fx.push(...set.fx);
    return { flat, pct, apt, exc, excOn, excList, fx, set, setHave, setOn, list };
  },

  /**
   * 唯一属性入口。纯函数，一次算完，不存在重复应用。
   *   base（含升级累积） × 品质 × 星级 × 成长
   *   + 装备固定值 → × 装备百分比 → × 擅长 → × 专属 → × 羁绊
   */
  calc(hid, opt) {
    const h = (opt && opt.hero) || G.heroes[hid];
    const t = DB.hero(hid);
    if (!h || !t) return null;
    const lv = h.lv || 1, star = h.star || 1, q = (opt && opt.q) || t.q || 1;
    const mult = (CFG.qmult[q] || 1) * (CFG.starMul[star] || 1) * (1 + (lv - 1) * CFG.lvGrow);

    /* V10.3.1：成长只算一次。base 已经是 growStep 一级一级累加过的，
       原来这里再乘一道 (1 + gr × (lv−1))，血的 gr 武将 0.4 文官 0.15，五十级就是 ×20 对 ×8，
       两道叠起来武将血是文官的十几二十倍，文官被碰一下就倒。 */
    const raw = {};
    for (const k of ['atk', 'def', 'int', 'agi', 'hp']) {
      raw[k] = (h.base && h.base[k]) || t[k] || 10;
      raw[k] *= mult;
    }

    // 带伤上阵打折。放在这里而不是战斗里，战力显示才和实战一致。
    const hm = (h.hurt && h.hurt.lv === 1) ? CFG.hurtLightMul : 1;
    if (hm !== 1) for (const k of Object.keys(raw)) raw[k] *= hm;

    const g = this.gear(h, hid);
    const team = (opt && opt.team) || G.team;
    // 敌人走 calcEnemy（noBond），宿星只作用在自己人身上
    const mine = !(opt && opt.noBond);
    const bd = (!mine || Fate.has('noBond')) ? { atk: 0, def: 0, int: 0, agi: 0, hp: 0 }
                                             : this.bond(hid, team);
    if (mine) {
      const all = Fate.v('myAll', 1);
      const fm = { atk: Fate.v('myAtk', 1) * all, def: Fate.v('myDef', 1) * all,
                   int: all, agi: Fate.v('myAgi', 1) * all, hp: Fate.v('myHp', 1) * all };
      for (const k of Object.keys(raw)) if (fm[k] !== 1) raw[k] *= fm[k];
    }

    const out = {};
    for (const k of ['atk', 'def', 'int', 'agi']) {
      let v = raw[k] + (g.flat[k] || 0);
      if (g.pct[k]) v *= 1 + clamp(g.pct[k], 0, CFG.cap.eqPct);
      if (g.exc[k]) v *= 1 + g.exc[k];
      if (k === 'atk') {
        if (g.apt) v *= 1 + CFG.favBonus;
        v *= 1 + clamp(bd.atk, 0, CFG.cap.bondAtk);
      } else if (k === 'int') {
        /* V10.5 智跟武吃同一份兵器加成：兵器的百分比、擅长、专属的武加成，一样给智。
           不然武一路 ×1.3 ×1.2 ×1.2 往上走，智只拿兵器上四十点固定值，法师五十级还是一千出头的智。
           羁绊取武、智两条里高的那条（封顶按武的）。敌人不穿装备，这几道对他们本来就是 1。 */
        // V10.6 这道放大只给文官和文武双全：武将的智不再被兵器、专属、擅长跟着抬（林冲五十级智 1515 就是这么来的）
        if (roleOf(t) !== 'wu') {
          if (g.pct.atk) v *= 1 + clamp(g.pct.atk, 0, CFG.cap.eqPct);
          if (g.exc.atk) v *= 1 + g.exc.atk;
          if (g.apt) v *= 1 + CFG.favBonus;
          v *= 1 + clamp(Math.max(bd.int, bd.atk), 0, CFG.cap.bondAtk);
        } else v *= 1 + clamp(bd.int, 0, CFG.cap.bondOther);
      } else {
        v *= 1 + clamp(bd[k], 0, CFG.cap.bondOther);
      }
      out[k] = Math.max(1, Math.round(v));
    }
    let hp = raw.hp + (g.flat.hp || 0);
    if (g.pct.hp) hp *= 1 + clamp(g.pct.hp, 0, CFG.cap.eqPct);
    if (g.exc.hp) hp *= 1 + g.exc.hp;
    hp *= 1 + clamp(bd.hp, 0, CFG.cap.bondHp);
    // 被动技能的属性加成放在最后一乘：升星解锁了才算，敌人按星级切技能
    const pas = passivesOf((opt && opt.skills) || h.owned || [], g.fx);
    for (const k of ['atk', 'def', 'int', 'agi']) if (pas.stat[k]) out[k] = Math.max(1, Math.round(out[k] * (1 + pas.stat[k])));
    if (pas.stat.hp) hp *= 1 + pas.stat.hp;
    out.maxHp = Math.max(1, Math.round(hp * CFG.hpMult));
    out.crit = (g.exc.crit || 0) + pas.crit;   // 专属与被动给的暴击，直接加在暴击率上
    out.pas = pas;
    out.q = q; out.lv = lv; out.star = star;
    out.meta = { apt: g.apt, exc: g.excOn, excList: g.excList, set: g.set, setHave: g.setHave, setOn: g.setOn,
                 bond: bd, gear: g.list };
    return out;
  },

  /**
   * 敌人属性：与玩家同一口径 —— base 同样按等级累积成长，只是不含装备与羁绊。
   * mul 是关卡强度系数（阶段 3 由模拟反推后固化进数据）：
   *   攻防全额缩放，血量按平方根衰减缩放 —— 敌人变致命的速度快于变肉，
   *   否则调校为了压胜率会把敌人堆成血牛，把战斗拖成几十回合。
   *   敏捷不缩放，免得高难关的敌人永远先手。
   * 等级与星级保持叙事诚实，界面显示即真实。
   */
  /** 关卡强度系数按这个敌人的品质封顶再乘折扣 */
  foeMul(hid, tier) {
    // 二周目起支线关的倍率再打七五折：ch20_f2 田虎决战七个名将 ★5 ×2.0，三局三停
    const sideCut = (tier.side && Lap.now() > 1) ? 0.75 : 1;
    return Lap.foeMulOf(tier.mul, (DB.foeHero(hid) || {}).q, tier.ch) * (tier.ease == null ? 1 : tier.ease) * sideCut
         * (tier.boss ? CFG.foeUpBoss : CFG.foeUp);
  },

  calcEnemy(hid, lv, star, mul, gear) {
    const base = grownBase(hid, lv, true);
    if (!base) return null;
    const ft = DB.foeHero(hid) || {};
    const skills = (ft.sk || []).slice(0, Math.min(star, 4));
    const s = this.calc(hid, { hero: { lv, star, base, equipment: {} }, noBond: true, team: [], skills, q: ft.q });
    if (!s) return null;
    if (gear) for (const k of ['atk', 'def', 'int', 'agi', 'maxHp']) s[k] = Math.max(1, Math.round(s[k] * (1 + gear)));
    const m = mul || 1;
    if (m !== 1) {
      s.atk = Math.max(1, Math.round(s.atk * m));
      s.def = Math.max(1, Math.round(s.def * m));
      s.maxHp = Math.max(1, Math.round(s.maxHp * Math.pow(m, 0.5)));
    }
    // 天魁星：我方武力涨，敌方血量跟着涨
    const fh = Fate.v('foeHp', 1);
    if (fh !== 1) s.maxHp = Math.max(1, Math.round(s.maxHp * fh));
    return s;
  },

  /** 战力：从上面的输出派生，绝不另写公式 */
  power(s) {
    if (!s) return 0;
    // V10.6 主属性算两倍、另一样算三成：原来武×2、智×1.2，罗真人输出和林冲一样多，战力只有他的六成
    const m = mainOf(s);
    return Math.round(m.eff * 2 + m.sub * 0.3 + s.def * 1.5 + s.agi + s.maxHp * 0.05);
  },
  heroPower(hid) { return this.power(this.calc(hid)); },
  teamPower() { return G.team.reduce((a, h) => a + (h ? this.heroPower(h) : 0), 0); },
  stagePower(sid) {
    const st = DB.stage(sid);
    if (!st) return 0;
    const t = Battle.enemyTier(sid);
    return Battle.roster(sid).reduce((a, e) => a + this.power(themeStats(this.calcEnemy(e, t.lv, t.star, this.foeMul(e, t), t.gear), st.theme)), 0);
  },
};

/* ── 6  战斗 ─────────────────────────────────────────────────────────── */

const Battle = {
  /** 关卡敌方等级 / 星级 / 强度系数：优先读数据字段，没有则由推荐等级推导 */
  enemyTier(sid) {
    const st = DB.stage(sid) || {};
    const rl = st.rec_lv || [1, 5];
    const ch = st.ch || 1;
    // 支线关（_f1/_f2）与隐藏关本来就比同章高六级、系数更高。V10.3.2 的拉伸和穿甲只给主线：
    // 支线跟着拉到 53 对 50、再穿一成甲，就是三周目都过不去的墙（ch29_f2 / ch30_f1 三局停两局）
    // 28–33 章整章都是 _f 编号（方腊一路），那是主线不是支线：只有同章还有主线关的 _f 才算支线
    const side = !!st.hidden || (/_f\d+$/.test(sid) && (DB.byChapter[ch] || []).some(x => !/_f\d+$/.test(x) && !(DB.stage(x) || {}).hidden));
    const lv0 = Lap.foeLv(st.enemy_lv || Math.max(1, rl[1]));
    return {
      lv: side ? Math.min(lv0, Lap.maxLv() + 1) : lv0,
      // 二周目起敌方也跟着多一星，上限与玩家同档
      // V10.3.4 二周目起每周目多两星（原来一星）：二周目玩家已是 ★6，敌人才 4 星
      star: Lap.now() <= 1
        ? (st.enemy_star || (ch > 21 ? 5 : ch > 10 ? 4 : ch > 3 ? 3 : 2))
        : Math.min(Lap.maxStar(), Lap.maxStar(Lap.now() - 1) + (st.is_boss ? CFG.lapStarBoss : 0)),
      // mul 按敌人品质封顶，这里给的是「封顶前」的值，calcEnemy 那头按人封
      mul: (st.enemy_mul != null ? st.enemy_mul : 1),
      ease: (Lap.now() <= 1 ? foeEase(ch, side) : 1) * (G.mode === 'chaos' ? CFG.chaosEase : 1),
      gear: Lap.now() <= 1 ? (side ? 0 : Lap.foeGear(ch))
          : (CFG.lapGear[Lap.now()] != null ? CFG.lapGear[Lap.now()] : CFG.lapGear[2] + CFG.lapGearStep * (Lap.now() - 2)) + Lap.foeGear(ch),
      side,
      ch,
      boss: !!st.is_boss,
    };
  },

  /** 这一关这一周目的敌方名单。关卡页显示与开打用同一份。
   *  一周目照数据；二周目起杂兵换成同阵营名将、补满九人，名单按 sid+周目定死，看到什么打什么。 */
  roster(sid) {
    const st = DB.stage(sid);
    if (!st) return [];
    const base = (st.enemies || []).slice();
    if (Lap.now() <= 1) return base;
    const side = !!st.hidden || (/_f\d+$/.test(sid) && (DB.byChapter[st.ch] || []).some(x => !/_f\d+$/.test(x) && !(DB.stage(x) || {}).hidden));
    // V10.6 二周目起：普通关名将以下、Boss 关天罡以下的敌将一律换掉
    const qmin = st.is_boss ? CFG.lapFloorQBoss : CFG.lapFloorQ;
    const fq = e => (DB.foeHero(e) || {}).q || 1;
    // V10.6 阵势：刀山关只要武将，谋臣关只要文官（文武双全两边都算）
    const rok = e => st.theme === 'blade' ? roleOf(DB.foeHero(e)) !== 'wen' : st.theme === 'wen' ? roleOf(DB.foeHero(e)) !== 'wu' : true;
    const named = base.filter(e => (DB.hero(e) || {}).src !== '杂兵' && fq(e) >= qmin && rok(e));
    const facs = new Set(named.map(e => DB.hero(e).faction).filter(Boolean));
    const qmax = st.is_boss ? 6 : CFG.lapRosterQ;   // 支线本来就高六级，换人也只换猛名，不然 ch20_f2 三局全停
    const used = new Set(named);
    // 候选：同阵营在前，无阵营的朝廷/说岳人物垫后；同一关不重复；顺序按 sid+周目哈希定死
    const h32 = str => { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
    const key = sid + '#' + Lap.now();
    const cand = DB.heroIds().filter(k => { const t = DB.hero(k); return t.src !== '杂兵' && !used.has(k) && fq(k) <= qmax && fq(k) >= qmin && rok(k); })
      .map(k => ({ k, f: facs.has(DB.hero(k).faction) ? 0 : !DB.hero(k).faction ? 1 : 2, r: h32(key + k) }))
      .filter(x => x.f < 2)
      .sort((a, c) => a.f - c.f || a.r - c.r).map(x => x.k);
    const out = named.slice();
    let i = 0;
    // 先把杂兵一个个换掉，再补到九人
    const want = Math.max(base.length, CFG.teamSize);
    while (out.length < want && i < cand.length) out.push(cand[i++]);
    // V10.6 品阶下限抬了之后同阵营可能凑不齐（前几章原班人马全是凡良）：再从别的阵营补
    if (out.length < want) {
      const more = DB.heroIds().filter(k => { const t = DB.hero(k); return t.src !== '杂兵' && !out.includes(k) && fq(k) <= qmax && fq(k) >= qmin && rok(k); })
        .sort((a, c) => h32(key + a) - h32(key + c));
      for (let j = 0; out.length < want && j < more.length; j++) out.push(more[j]);
    }
    // 候选不够（阵营小又都用过）就用原有名将复制
    for (let j = 0; out.length < want && named.length; j++) out.push(named[j % named.length]);
    return out;
  },

  unit(hid, stats, ally, idx) {
    const t = DB.hero(hid);
    const h = ally ? G.heroes[hid] : null;
    // V10.6 敌将用 foe 快照里的技能（升档改过技能的老角色，当 Boss 时还是 V10.5 那一套）
    const ids = ally ? (h.owned || []) : ((DB.foeHero(hid) || t).sk || []).slice(0, Math.min(stats.star, 4));
    const skills = ids.map((id, i) => {
      const s = DB.skill(id);
      return s ? { id, slot: i, name: s.name, cat: s.cat, rate: s.rate, cd: s.cd || 0, fx: s.fx, cur: 0, last: -99 } : null;
    }).filter(Boolean);
    const pas = stats.pas || passivesOf(ids);
    const u = {
      hid, name: t.name, ally, idx,
      row: Math.floor(idx / 3), col: idx % 3,
      atk: stats.atk, def: stats.def, int: stats.int, agi: stats.agi, crit: stats.crit || 0,
      maxHp: stats.maxHp, hp: stats.maxHp,
      q: stats.q, lv: stats.lv, star: stats.star,
      tally: { dealt: 0, taken: 0, healed: 0 },   // 输出 / 承伤 / 治疗（含护盾），榜单用
      skills,
      actives: skills.filter(s => s.cat === 'active' || s.cat === 'sure'),
      cmds: skills.filter(s => s.cat === 'cmd'),
      pas, skillMod: CFG.starSk[stats.star] || 1,
      shield: 0, shieldDur: 0, status: {}, chaosHit: 0, alive: true, tough: pas.tough, lowDone: {},
    };
    if (pas.shield > 0) { u.shield = Math.round(u.maxHp * pas.shield); u.shieldDur = 99; }
    return u;
  },

  /** 两边撞名时给战报加个标记。ch1_boss 里敌我都有史进、朱武，
   *  不标的话战报上就是「史进 → 史进 受创 120」，没法读。 */
  /** 战报里的名字带阵营标记：{a|林冲} 是我方、{f|史进} 是敌方，视图 logHtml 拿去上色。
   *  原来两边撞名才标「（我）」「（敌）」，现在颜色一分，同名也认得出。 */
  tagNames(b) {
    for (const u of [...b.allies, ...b.foes]) u.ln = `{${u.ally ? 'a' : 'f'}|${u.name}}`;
  },

  create(sid) {
    const st = DB.stage(sid);
    if (!st) return null;
    const tier = this.enemyTier(sid);
    const allies = G.team.filter(hid => hid && Hurt.able(hid))
      .map((hid, i) => { const s = Stats.calc(hid); return s ? this.unit(hid, s, true, i) : null; })
      .filter(Boolean);
    // 地煞星：敌方每关多一人，从这一关已有的敌人里再抽一个补上
    let elist = this.roster(sid);
    if (elist.length && Fate.has('foeMore')) {
      const n = Math.round(Fate.v('foeMore', 0));
      for (let i = 0; i < n; i++) elist.push(elist[Math.floor(rnd() * elist.length)]);
    }
    const foes = elist
      .map((eid, i) => {
        const s = themeStats(Stats.calcEnemy(eid, tier.lv, tier.star, Stats.foeMul(eid, tier), tier.gear), st.theme);
        return s ? this.unit(eid, s, false, i) : null;
      }).filter(Boolean);
    // V10.6 Boss 关阵势
    if (st.theme && THEMES[st.theme]) for (const u of foes) themeUnit(u, st.theme);
    // Boss 关：品质最高的那个敌将是本关的 Boss，硬撑一口气加一成减伤。数字上不大，手感上他得多挨几刀。
    if (st.is_boss && foes.length) {
      const boss = foes.reduce((a, u) => (u.q > a.q || (u.q === a.q && u.maxHp > a.maxHp)) ? u : a);
      boss.pas = Object.assign({}, boss.pas, { cut: (boss.pas.cut || 0) + 0.1 });
      boss.tough = true; boss.isBoss = true;
    }
    // 地灵星的另一头：神医不在册，全队血薄一截
    if (Fate.has('needDoc') && !G.heroes[CFG.doctorId]) {
      for (const u of allies) {
        u.maxHp = Math.max(1, Math.round(u.maxHp * 0.92));
        u.hp = Math.min(u.hp, u.maxHp);
      }
    }
    const b = { sid, stage: st, allies, foes, round: 0, over: false, win: null, log: [], events: [], theme: st.theme || null };
    this.tagNames(b);
    if (b.theme && THEMES[b.theme]) b.log.push({ c: 'in', s: `阵势 · ${THEMES[b.theme].name}：${THEMES[b.theme].tip}` });
    return b;
  },

  /** 发一条事件，并记下此刻战报写到第几行 —— 播放时战报跟着画面走，
   *  而不是一回合结束后整段刷出来。一秒钟刷二十行，等于没写。 */
  ev(b, o) { o.li = b.log.length; b.events.push(o); return o; },

  side(b, u) { return u.ally ? b.allies : b.foes; },
  other(b, u) { return u.ally ? b.foes : b.allies; },
  living(list) { return list.filter(x => x.alive); },

  /** 有效属性：底子 + 增益 − 减益。增减益分开记（buff_x / debuff_x），
   *  同一属性可以同时挨一个加一个减，互不覆盖。 */
  eff(u, k) {
    let v = u[k] || 0;
    const s = u.status['buff_' + k];
    if (s) v += s.val;
    const d = u.status['debuff_' + k];
    if (d) v -= d.val;
    return Math.max(1, Math.round(v));
  },

  /** 暴击率：底子 + 捷（手快，看得见破绽）+ 专属 + 被动。 */
  critOf(u) {
    if (!u) return CFG.critRate;
    const base = critRate(this.eff(u, 'agi'), u.crit);
    // 天杀星：双方暴击率一起翻倍。敌人只打我们，所以「敌方暴击翻倍」
    // 就等于「我方受到的暴击翻倍」，不必再在挨打那头绕一道。
    return base * Fate.v(u.ally ? 'myCrit' : 'foeCrit', 1);
  },

  /** 一次挥刀的结果不该每次都一样。没有这层抖动，九对九打二十回合，
   *  大数定律会把每一场抹成同一场：胜率对强度是一道断崖（1.00 → 0.00），
   *  中间那段「险胜」根本不存在，Boss 只有碾压和被碾压两种样子。*/
  dmg(atkV, defV, base, mod, critRate, src) {
    if (src && src.pas.pierce) defV *= 1 - src.pas.pierce;     // V10.4 专属：无视防御
    const armor = Math.max(defV * CFG.armorK, 1);
    let d = base * (atkV / (atkV + armor)) * mod * CFG.dmgK;
    d *= 1 + (Math.random() * 2 - 1) * CFG.dmgVar;
    if (src && src.pas.dmg) d *= 1 + src.pas.dmg;
    let crit = false;
    if (chance(critRate == null ? CFG.critRate : critRate)) { d *= CFG.critMul + (src ? src.pas.critDmg : 0); crit = true; }
    return { v: Math.max(1, Math.round(d)), crit };
  },

  /** 单体攻击能不能被躲开：状态给的闪避 + 被动闪避 */
  dodged(b, tgt) {
    const p = (tgt.status.dodge ? tgt.status.dodge.val : 0) + (tgt.pas.dodge || 0);
    if (p > 0 && chance(Math.min(0.6, p))) {
      b.log.push({ c: 'in', s: `${tgt.ln} 闪过了` });
      this.ev(b, { k: 'miss', t: tgt.idx, ally: tgt.ally });
      return true;
    }
    return false;
  },

  /** 统一扣血出口：护盾、易伤、被动减伤在所有伤害路径生效 */
  hurt(b, tgt, amount, src, tag) {
    // 地伏星：自己人前排扛得住些，后排更脆。row 是 0/1/2，0 就是前排。
    if (tgt.ally && Fate.has('frontCut')) {
      amount = amount * (tgt.row === 0 ? Fate.v('frontCut', 1) : Fate.v('backUp', 1));
    }
    // 只有「别人打的」才吃易伤和减伤；流血中毒这种持续伤害照原样扣
    if (src) {
      if (tgt.status.vuln) amount *= 1 + (tgt.status.vuln.val || 0.2);
      if (tgt.pas.cut) amount *= 1 - Math.min(0.5, tgt.pas.cut);
    }
    amount = Math.max(1, Math.round(amount));
    let left = amount, absorbed = 0;
    // V10.6 流血、中毒是真实伤害：不吃防御减伤（上面 src 为空已经跳过），也不被护盾挡
    const trueDmg = tag === 'bleed' || tag === 'poison';
    if (tgt.shield > 0 && !trueDmg) {
      absorbed = Math.min(tgt.shield, left);
      tgt.shield -= absorbed; left -= absorbed;
    }
    // 硬骨头：一场里第一次挨到致命一击，留一口气
    if (left >= tgt.hp && tgt.tough) { tgt.tough = false; left = tgt.hp - 1; b.log.push({ c: 'ps', s: `${tgt.ln} 硬撑着没倒（被动）` }); }
    tgt.hp = Math.max(0, tgt.hp - left);
    tgt.tally.taken += absorbed + left;
    if (src) src.tally.dealt += absorbed + left;
    if (absorbed) b.log.push({ c: 'sh', s: `${tgt.ln} 护盾挡下 ${num(absorbed)}` });
    const dot = { bleed: '流血', burn: '灼烧', poison: '中毒', counter: '反击', follow: '追击', drain: '吸血' }[tag];
    if (left) b.log.push({ c: 'dm', s: `${src ? src.ln + ' → ' : ''}${tgt.ln}${dot ? `（${dot}）` : ''} 受创 ${num(left)}${tag === 'crit' ? '　暴击' : ''}` });
    this.ev(b, { k: 'dmg', t: tgt.idx, ally: tgt.ally, v: absorbed + left, absorbed, tag,
                 s: src ? src.idx : null, sa: src ? src.ally : null });
    if (tgt.hp <= 0 && tgt.alive) {
      tgt.alive = false;
      b.log.push({ c: 'dm', s: `${tgt.ln} 阵亡` });
      this.ev(b, { k: 'die', t: tgt.idx, ally: tgt.ally });
    } else if (tgt.alive && src) {
      this.lowCheck(b, tgt);
      // 反击：挨了打还站着，有几率还一手。反击不再触发反击。
      const c = tgt.pas.counter;
      if (c && src.alive && !tgt.status.stun && !tgt.status.chaos && tag !== 'counter' && chance(c.chance)) {
        b.log.push({ c: 'ps', s: `${tgt.ln} 反击（被动）` });
        const d = this.dmg(this.eff(tgt, 'atk'), this.eff(src, 'def'), this.eff(tgt, 'atk') * c.mult, 1, this.critOf(tgt), tgt);
        this.hurt(b, src, d.v, tgt, 'counter');
      }
    }
    return left;
  },

  /** 残血激发：血线第一次跌破阈值时，给自己一个不消散的增益 */
  lowCheck(b, u) {
    for (const f of u.pas.low) {
      const key = f.stat + f.at;
      if (u.lowDone[key] || u.hp / u.maxHp >= f.at) continue;
      u.lowDone[key] = 1;
      const add = Math.round((u[f.stat] || 10) * f.pct);
      const cur = u.status['buff_' + f.stat];
      u.status['buff_' + f.stat] = { dur: 99, val: (cur ? cur.val : 0) + add };
      b.log.push({ c: 'ps', s: `${u.ln} 濒危奋起，${STAT_NAME[f.stat]}+${add}（被动）` });
    }
  },

  heal(b, tgt, amount, src) {
    if (src && src.pas && src.pas.heal) amount = Math.round(amount * (1 + src.pas.heal));   // V10.6 pheal
    const before = tgt.hp;
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + amount);
    const got = tgt.hp - before;
    if (got > 0) {
      if (src) src.tally.healed += got;
      b.log.push({ c: 'he', s: `${tgt.ln} 回复 ${num(got)}` });
      this.ev(b, { k: 'heal', t: tgt.idx, ally: tgt.ally, v: got,
                   s: src ? src.idx : null, sa: src ? src.ally : null });
    }
  },

  /** 前排挡在前面：单体攻击先找活人最靠前的那一排，那一排清空了才轮到下一排。
   *  这样九宫格才真的是「阵」——把肉的放第一排，谋士放后面，位置开始有意义。
   *  群攻（整排、整列、全体）不受这条约束，本来就是照着面打的。 */
  front(foes) {
    if (!foes.length) return foes;
    const r = Math.min(...foes.map(x => x.row));
    return foes.filter(x => x.row === r);
  },
  back(foes) {
    if (!foes.length) return foes;
    const r = Math.max(...foes.map(x => x.row));
    return foes.filter(x => x.row === r);
  },

  /** 集火对象：多半打最虚的那个，但不是铁律。
   *  全场一致地只打血最少的，等于每场都按同一套剧本走完 —— 胜负对强度就成了
   *  一道断崖，中间那段「险胜」不存在。让集火带点偏差，战局才有分叉。*/
  focus(pool) {
    const s = pool.slice().sort((a, c) => a.hp - c.hp);
    if (s.length < 2 || Math.random() < 0.62) return s[0];
    return s[1 + Math.floor(Math.random() * (s.length - 1))];
  },

  /** 单体攻击的落点：嘲讽者优先；否则前排里正对面的那一列 */
  single(b, u) {
    const foes = this.living(this.other(b, u));
    if (!foes.length) return [];
    const taunt = foes.filter(x => x.status.taunt);
    if (taunt.length) return [pick(taunt)];
    const line = this.front(foes);
    const same = line.filter(x => x.col === u.col);
    return [this.focus(same.length ? same : line)];
  },

  /** 目标选择：一律按 fx.tg。hit 由 cast 自己处理（打中的那几个）。 */
  targets(b, u, tg) {
    const foes = this.living(this.other(b, u));
    const mates = this.living(this.side(b, u));
    const shuffle = a => a.slice().sort(() => Math.random() - 0.5);
    switch (tg) {
      case 'single':  return this.single(b, u);
      case 'all':     return foes;
      case 'row':     { const r = foes.filter(x => x.row === u.row); return r.length ? r : this.front(foes); }
      case 'col':     { const c = foes.filter(x => x.col === u.col); return c.length ? c : this.single(b, u); }
      case 'front':   return this.front(foes);
      case 'back':    return this.back(foes);
      case 'weakest': return foes.length ? [foes.slice().sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0]] : [];
      case 'strongest': return foes.length ? [foes.slice().sort((a, c) => c.atk - a.atk)[0]] : [];
      case 'smartest':  return foes.length ? [foes.slice().sort((a, c) => c.int - a.int)[0]] : [];
      case 'rand2':   return shuffle(foes).slice(0, 2);
      case 'rand3':   return shuffle(foes).slice(0, 3);
      case 'self':    return [u];
      case 'mates':   return mates;
      case 'lowest':  { const s = mates.slice().sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp); return s.length ? [s[0]] : []; }
      case 'frontm':  return this.front(mates);
      case 'colm':    return mates.filter(x => x.col === u.col);
      default:        return this.single(b, u);
    }
  },

  /** 一个技能「有没有得放」：第一条效果找得到目标就算有 */
  usable(b, u, sk) {
    const f = (sk.fx || [])[0];
    if (!f) return false;
    if (f.k === 'heal' && !f.pct) {
      // 没人掉血就别浪费一次发动
      return this.targets(b, u, f.tg).some(t => t.hp < t.maxHp);
    }
    return this.targets(b, u, f.tg).length > 0;
  },

  /** 上状态。免疫的状态不上；混乱按双方智力比与抗性折算命中。 */
  putStatus(b, u, t, f, quiet) {
    if (!t.alive) return;
    if (t.pas.immune.includes(f.st)) { b.log.push({ c: 'in', s: `${t.ln} 不受${ST_NAME[f.st] || f.st}` }); return; }
    let p = f.chance == null ? 1 : f.chance;
    // V10.6 pctrl：自己上的眩晕、混乱、沉默更容易中，封顶 95%
    if (u && u.pas && u.pas.ctrl && u.ally !== t.ally && ['stun', 'chaos', 'silence'].includes(f.st)) p = Math.min(0.95, p + u.pas.ctrl);
    if (f.st === 'chaos' && u) {
      // 乱得了乱不了，看两边谁的智高：高一倍命中翻到 1.5 倍，低一半降到一半
      const ratio = clamp(0.5 + 0.5 * this.eff(u, 'int') / Math.max(1, this.eff(t, 'int')), 0.5, 1.5);
      p = p * ratio * Math.pow(1 - CFG.chaosResist, t.chaosHit);
    }
    if (!chance(p)) {
      if (f.chance == null || f.chance >= 0.8 || f.st === 'chaos') b.log.push({ c: 'in', s: `${t.ln} 稳住了心神` });
      return;
    }
    const dur = f.dur || 1;
    // V10.5 持续伤害：流血按最大生命（不叠层，只刷新回合数）；中毒叠层，按当前生命扣；
    // 灼烧是固定值 = 施术者攻击值 × burnK，唯一随施术者成长的一种，狂风放大它。
    let val = f.val || 0;
    if (f.st === 'burn') val = Math.max(1, Math.round((f.base || 0) * CFG.burnK));
    const cur = t.status[f.st];
    const n = f.st === 'poison' ? Math.min(CFG.poisonMax, (cur ? cur.n || 1 : 0) + (f.layers || 1)) : 0;
    // V10.6 pdot：施术者的流血中毒加成记在状态上，取高的那个
    const mul = (f.st === 'bleed' || f.st === 'poison') ? Math.max(cur && cur.mul || 1, 1 + (u && u.pas ? u.pas.dot || 0 : 0)) : undefined;
    t.status[f.st] = { dur: Math.max(dur, cur ? cur.dur : 0), val: Math.max(val, cur ? cur.val : 0), n, mul };
    if (f.st === 'chaos') t.chaosHit++;
    // 写清楚这个状态到底干了什么，玩家不用去翻说明
    const what = {
      stun: '下回合动不了', silence: '放不出技能', disarm: '不能普攻', chaos: '敌我不分',
      taunt: '把敌人的攻击引到自己身上', vuln: `受到的伤害 +${pc(f.val || 0.2)}`, dodge: `闪避 +${pc(f.val || 0.2)}`,
      bleed: `每回合失 ${pc(CFG.bleedPct)} 最大生命`, burn: `每回合灼伤 ${num(val)}`,
      poison: `每回合失 ${pc(CFG.poisonPct * n)} 当前生命`, wind: '灼烧加重，火势蔓延',
    }[f.st] || '';
    const tag = f.st === 'poison' ? `中毒 ×${n}` : ST_NAME[f.st] || f.st;
    if (!quiet) b.log.push({ c: 'st', s: `${t.ln} 【${tag}】${what}${dur > 1 ? `，${dur} 回合` : ''}` });
    this.ev(b, { k: 'st', t: t.idx, ally: t.ally, st: f.st });
  },

  /** 执行一条效果。返回这条效果打中的目标（给后面的 hit 用）。 */
  /** 法术值：智 × 法术系数。法术伤害、治疗、法术灼烧都从这个数出发 */
  magic(u) { return this.eff(u, 'int') * CFG.intK; },

  applyFx(b, u, f, prevHit, mod, prevSrc) {
    const pw = mod * skillPow(this.eff(u, 'int'), this.eff(u, 'atk'));
    let tgts = f.tg === 'hit' ? prevHit : this.targets(b, u, f.tg);
    const hit = [];
    switch (f.k) {
      case 'dmg': {
        const gap = f.src === 'gap';
        const atkV = (f.src === 'int' || gap) ? this.magic(u) : this.eff(u, 'atk');
        for (const t of tgts) {
          if (!t.alive) continue;
          if ((f.tg === 'single' || f.tg === 'weakest' || f.tg === 'strongest' || f.tg === 'smartest') && this.dodged(b, t)) continue;
          // V10.6 智力差伤害：（施术者智×法术系数 − 目标智）× 倍率，无视防御；打文官几乎没伤害
          let base = gap ? Math.max(0, atkV - this.eff(t, 'int')) * f.mult : atkV * f.mult;
          if (f.exec && t.hp / t.maxHp < f.exec.at) base *= f.exec.mul;
          if (f.vsCtrl && (t.status.stun || t.status.chaos || t.status.silence)) base *= 1 + f.vsCtrl;
          const defV = gap ? 0 : this.eff(t, 'def') * (1 - (f.pierce || 0));
          const d = this.dmg(atkV, defV, base, pw, this.critOf(u), u);
          const real = this.hurt(b, t, d.v, u, d.crit ? 'crit' : '');
          if (f.drain && real > 0 && u.alive) this.heal(b, u, Math.round(real * (f.drain >= 1 ? 1 : f.drain)), u);
          hit.push(t);
        }
        return hit;
      }
      case 'status': {
        // 灼烧的固定值按施术者的攻击值定：这招前面打的是法术伤害就按法术值，否则按武
        const base = prevSrc === 'int' ? this.magic(u) : this.eff(u, 'atk');
        // 必中的群体状态（狂风）一行写完，不然九个人九行「陷入狂风」
        const live = tgts.filter(t => t.alive);
        const group = f.chance == null && live.length > 1;
        for (const t of tgts) this.putStatus(b, u, t, f.base != null ? f : { ...f, base }, group);
        if (group) {
          const mine = f.st === 'dodge' || f.st === 'taunt' ? u.ally : !u.ally;
          const nm = TG_NAME[f.tg] || '';
          b.log.push({ c: 'st', s: `{${mine ? 'a' : 'f'}|${/^[敌我]方/.test(nm) ? nm : (mine ? '我方' : '敌方') + nm}} 【${ST_NAME[f.st] || f.st}】${f.st === 'wind' ? '灼烧加重，火势蔓延' : ''}${(f.dur || 1) > 1 ? `，${f.dur} 回合` : ''}` });
        }
        return tgts;
      }
      case 'buff':
      case 'debuff': {
        // 群体的一行写完（「全军 武+12%」），九行「某某 武+7」没人看
        const key = f.k + '_' + f.stat, sign = f.k === 'buff' ? '+' : '−';
        const live = tgts.filter(t => t.alive);
        for (const t of live) {
          const bm = f.k === 'buff' && u.pas && u.pas.buff ? 1 + u.pas.buff : 1;   // V10.6 pbuff
          const add = Math.round((t[f.stat] || 10) * f.pct * mod * bm);
          const cur = t.status[key];
          t.status[key] = { dur: f.dur || 2, val: Math.max(add, cur ? cur.val : 0) };
          if (live.length === 1) b.log.push({ c: 'sk', s: `${t.ln} ${STAT_NAME[f.stat] || f.stat}${sign}${add}（${f.dur || 2}回合）` });
          this.ev(b, { k: 'st', t: t.idx, ally: t.ally, st: f.k });
        }
        if (live.length > 1) {
          const mine = f.k === 'buff' ? u.ally : !u.ally;     // 增益给自己人，减益给对面
          b.log.push({ c: 'sk', s: `{${mine ? 'a' : 'f'}|${mine ? '我方' : '敌方'}${TG_NAME[f.tg] || ''}} ${STAT_NAME[f.stat] || f.stat}${sign}${pc(f.pct * mod)}（${f.dur || 2}回合）` });
        }
        return tgts;
      }
      case 'heal':
        for (const t of tgts) if (t.alive) {
          // V10.6 按智回血补上技能威力与治疗系数：原来没乘 dmgK 也没乘技能威力，倍率相同的治疗只有伤害的三分之一
          //   敌我同口径（V10.6 定）：敌将的奶一样变强，关卡跟着变难
          const v = f.pct ? Math.round(t.maxHp * f.pct * mod) : Math.round(this.magic(u) * f.mult * pw * CFG.healK);
          this.heal(b, t, v, u);
        }
        return tgts;
      case 'shield':
        for (const t of tgts) {
          if (!t.alive) continue;
          const add = Math.round(t.maxHp * f.pct * pw * (u.pas && u.pas.buff ? 1 + u.pas.buff : 1));   // V10.6 pbuff
          t.shield += add; u.tally.healed += add;
          t.shieldDur = Math.max(t.shieldDur, CFG.shieldDur);
          b.log.push({ c: 'sh', s: `${t.ln} 护盾 +${add}` });
        }
        return tgts;
      case 'steal':
        for (const t of tgts) {
          if (!t.alive) continue;
          const v = Math.round((t[f.stat] || 10) * f.pct * mod);
          const dur = f.dur || 2;
          t.status['debuff_' + f.stat] = { dur, val: Math.max(v, t.status['debuff_' + f.stat]?.val || 0) };
          u.status['buff_' + f.stat] = { dur, val: (u.status['buff_' + f.stat]?.val || 0) + v };
          b.log.push({ c: 'sk', s: `${u.ln} 夺 ${t.ln} ${STAT_NAME[f.stat] || f.stat} ${v}` });
        }
        return tgts;
      case 'cleanse':
        for (const t of tgts) {
          const bad = Object.keys(t.status).filter(k => k.startsWith('debuff_') || ['stun', 'silence', 'disarm', 'chaos', 'vuln', 'bleed', 'burn', 'poison', 'wind'].includes(k));
          for (const k of bad) delete t.status[k];
          if (bad.length) b.log.push({ c: 'he', s: `${t.ln} 状态解除` });
        }
        return tgts;
      case 'dispel':
        for (const t of tgts) {
          const good = Object.keys(t.status).filter(k => k.startsWith('buff_') || k === 'dodge' || k === 'taunt');
          for (const k of good) delete t.status[k];
          const hadShield = t.shield > 0;
          if (hadShield) { t.shield = 0; t.shieldDur = 0; }
          if (good.length || hadShield) {
            b.log.push({ c: 'in', s: `${t.ln} ${hadShield ? '护盾' + (good.length ? '与增益' : '') : '增益'}被驱散` });
            this.ev(b, { k: 'st', t: t.idx, ally: t.ally, st: 'dispel' });
          }
        }
        return tgts;
      default: return tgts;
    }
  },

  cast(b, u, sk) {
    // V10.4 专属：指挥技加成
    const mod = u.skillMod * (sk.cat === 'cmd' && u.pas.cmd ? 1 + u.pas.cmd : 1);
    // 技能名后面把效果写全：「林冲 · 豹头环眼｜对单体造成200%伤害；30%几率使命中者眩晕1回合」
    const tagTxt = sk.cat === 'cmd' ? '（指挥）' : sk.cat === 'sure' ? '（必中）' : '';
    b.log.push({ c: 'sk', s: `${u.ln} · ${sk.name}${tagTxt}｜${SkillText.desc(sk)}` });
    this.ev(b, { k: 'cast', t: u.idx, ally: u.ally, name: sk.name });
    let hit = [], src = null;
    for (const f of sk.fx || []) {
      if (b.over) break;
      const r = this.applyFx(b, u, f, hit, mod, src);
      if (f.k === 'dmg') { hit = r.filter(t => t.alive); src = f.src === 'int' ? 'int' : 'atk'; }
    }
  },

  /** 普攻：单体，吃闪避、嘲讽；被动可附带状态与追击 */
  basic(b, u) {
    const tg = this.single(b, u);
    if (!tg.length) return;
    const t = tg[0];
    if (this.dodged(b, t)) return;
    // V10.6 法术普攻：智（乘法术系数）比武高的人，普攻按 智×法术系数×intBasic 打。敌我同口径
    const pa = Math.max(this.eff(u, 'atk'), this.magic(u) * CFG.intBasic);
    const d = this.dmg(pa, this.eff(t, 'def'), pa, 1, this.critOf(u), u);
    this.hurt(b, t, d.v, u, d.crit ? 'crit' : '');
    if (!t.alive || !u.alive) return;
    for (const f of u.pas.onhit) if (chance(f.chance)) this.putStatus(b, u, t, { ...f, base: this.eff(u, 'atk') });
    const fo = u.pas.follow;
    if (fo && t.alive && chance(fo.chance)) {
      b.log.push({ c: 'ps', s: `${u.ln} 追击（被动）` });
      const d2 = this.dmg(pa, this.eff(t, 'def'), pa * fo.mult, 1, this.critOf(u), u);
      this.hurt(b, t, d2.v, u, 'follow');
    }
  },

  chaosAct(b, u) {
    const mates = this.living(this.side(b, u)).filter(x => x !== u);
    b.log.push({ c: 'in', s: `${u.ln} 混乱，向自己人挥刀` });
    if (!mates.length) return;
    const t = pick(mates);
    const d = this.dmg(this.eff(u, 'atk'), this.eff(t, 'def'), this.eff(u, 'atk') * 0.8, 1, this.critOf(u), u);
    this.hurt(b, t, d.v, u, '');
  },

  /** V10.6 控制状态出手后才走一格：中了一回合眩晕就是实打实停一回合 */
  afterAct(b, u) {
    for (const k of CTRL_ST) {
      const s = u.status[k]; if (!s) continue;
      if (--s.dur <= 0) {
        delete u.status[k];
        if (k === 'silence' || k === 'disarm') b.log.push({ c: 'in', s: `${u.ln} 的${ST_NAME[k]}消退` });
      }
    }
  },

  /** DoT 与状态倒计时。控制状态（眩晕、混乱、沉默、缴械）不在这里减，见 afterAct */
  tick(b, u) {
    for (const k of Object.keys(u.status)) {
      const s = u.status[k];
      if (k === 'bleed' || k === 'burn' || k === 'poison') {
        let v = k === 'bleed' ? u.maxHp * CFG.bleedPct * (s.mul || 1)
              : k === 'poison' ? u.hp * CFG.poisonPct * (s.n || 1) * (s.mul || 1)
              : s.val * (u.status.wind ? CFG.windBurn : 1);
        this.hurt(b, u, Math.max(1, Math.round(v)), null, k);
        if (!u.alive) return;
        // 狂风助火：着火的人把火带给同排还没着的一个人
        if (k === 'burn' && u.status.wind) {
          const near = this.living(this.side(b, u)).filter(x => x !== u && x.row === u.row && !x.status.burn);
          if (near.length) {
            const t = pick(near);
            t.status.burn = { dur: 1, val: s.val, n: 0 };
            b.log.push({ c: 'st', s: `火借风势，${u.ln} 身上的火烧到了 ${t.ln}` });
            this.ev(b, { k: 'st', t: t.idx, ally: t.ally, st: 'burn' });
          }
        }
      }
      // V10.6 修：眩晕、混乱、沉默、缴械改到出手之后再减（见 afterAct）。原来先减再判，
      //   一回合的控制在生效前就被清掉了——60 场里施加 42 次、生效 0 次
      else if (CTRL_ST.includes(k)) continue;
      else if (s.dur === 1 && ['taunt', 'vuln', 'dodge', 'wind'].includes(k))
        b.log.push({ c: 'in', s: `${u.ln} 的${ST_NAME[k]}消退` });
      s.dur--;
      if (s.dur <= 0) delete u.status[k];
    }
    if (u.shieldDur > 0 && u.shieldDur < 99 && --u.shieldDur === 0 && u.shield > 0) {
      u.shield = 0;
      b.log.push({ c: 'in', s: `${u.ln} 护盾消散` });
    }
    if (u.pas.regen > 0 && u.hp < u.maxHp) this.heal(b, u, Math.max(1, Math.round(u.maxHp * u.pas.regen)), null);
  },

  /** 这回合放哪个：冷却好的必中技优先；再按格位顺序给概率技掷骰，第一个中的放，
   *  一回合最多放一个。都没中就普攻。 */
  pickSkill(u, b) {
    if (u.status.silence) return null;
    for (const s of u.actives) {
      if (s.cat === 'sure' && s.cur === 0 && this.usable(b, u, s)) return s;
    }
    for (const s of u.actives) {
      if (s.cat !== 'active') continue;
      if (chance(s.rate + (u.pas.skrate || 0)) && this.usable(b, u, s)) return s;
    }
    return null;
  },

  /** 战前：两边的指挥技各发一次，按捷序 */
  prelude(b) {
    const cmds = [...b.allies, ...b.foes].filter(u => u.alive && u.cmds.length);
    if (!cmds.length) return;
    b.log.push({ c: 'r', s: '两军对阵' });
    const order = cmds.map(u => ({ u, k: this.eff(u, 'agi') })).sort((a, c) => c.k - a.k).map(x => x.u);
    for (const u of order) for (const sk of u.cmds) {
      if (b.over || !u.alive) break;
      if (this.usable(b, u, sk)) this.cast(b, u, sk);
    }
  },

  /** 跑一个回合，返回本回合的事件序列供演出 */
  runRound(b) {
    if (b.over) return null;
    b.events = [];
    if (b.round === 0) this.prelude(b);
    b.round++;
    b.log.push({ c: 'r', s: `第 ${b.round} 回合` });
    b.events.push({ k: 'round', n: b.round, li: b.log.length });
    // V10.6 铁壁：每三回合敌方全体再加一成血量的护盾
    if (b.theme === 'shield' && b.round > 1 && (b.round - 1) % 3 === 0) {
      for (const u of b.foes) if (u.alive) { u.shield += Math.round(u.maxHp * 0.1); u.shieldDur = 99; }
      b.log.push({ c: 'sh', s: '铁壁：敌方全体护盾再加一成' });
    }
    // V10.6 迷阵：开阵时我方随机三人六成几率混乱一回合
    if (b.theme === 'chaos' && b.round === 1) {
      const src = this.living(b.foes)[0];
      const live = this.living(b.allies).slice().sort(() => Math.random() - 0.5).slice(0, 3);
      if (src) for (const t of live) this.putStatus(b, src, t, { st: 'chaos', chance: 0.6, dur: 1 });
    }

    // 地灵星：每回合开头全队回一点血
    const rg = Fate.v('regen', 0);
    if (rg > 0) for (const u of b.allies) {
      if (u.alive && u.hp < u.maxHp) this.heal(b, u, Math.max(1, Math.round(u.maxHp * rg)), null);
    }

    // 出手顺序同样带抖动：捷高的仍然多半先动，但不再是铁打的名次。首回合先手的被动排最前。
    const order = [...b.allies, ...b.foes].filter(u => u.alive)
      .map(u => ({ u, k: this.eff(u, 'agi') * (1 + (Math.random() * 2 - 1) * CFG.agiVar) + (b.round === 1 && u.pas.first ? 1e6 : 0) }))
      .sort((a, c) => c.k - a.k).map(x => x.u);

    for (const u of order) {
      if (!u.alive || b.over) continue;

      this.tick(b, u);
      if (!u.alive) { if (this.checkEnd(b)) break; continue; }

      if (u.status.stun) {
        b.log.push({ c: 'in', s: `${u.ln} 眩晕，动不了` });
      } else if (u.status.chaos) {
        this.chaosAct(b, u);
      } else {
        const sk = this.pickSkill(u, b);
        if (sk) {
          this.cast(b, u, sk);
          sk.cur = sk.cd; sk.last = b.round;
        } else if (u.status.disarm) {
          b.log.push({ c: 'in', s: `${u.ln} 被缴了械，出不了手` });
        } else {
          this.basic(b, u);
        }
      }
      if (u.alive) this.afterAct(b, u);
      if (this.checkEnd(b)) break;
    }

    // 冷却在回合末统一递减（不是行动后立刻，否则 cd:1 等于 cd:0）
    if (!b.over) {
      for (const u of [...b.allies, ...b.foes]) for (const s of u.actives) if (s.cur > 0) s.cur--;
      // 三十合不下就鸣金收兵，以伤亡论高下。
      // 一律判负的话，明明压着打却在第三十回合莫名其妙输掉，玩家看不出为什么。
      if (b.round >= CFG.maxRounds) {
        const frac = list => {
          let hp = 0, mx = 0;
          for (const u of list) { hp += Math.max(0, u.hp); mx += u.maxHp; }
          return mx ? hp / mx : 0;
        };
        b.over = true; b.result = 'timeout';
        b.win = frac(b.allies) > frac(b.foes);
        b.log.push({ c: 'r', s: b.win ? '三十回合没分出胜负，鸣金收兵 —— 我方伤亡较轻，算赢'
                                      : '三十回合没分出胜负，鸣金收兵 —— 我方折损更重，算输' });
      }
    }
    return b.events;
  },

  checkEnd(b) {
    if (b.over) return true;
    const a = this.living(b.allies).length, f = this.living(b.foes).length;
    if (!f) { b.over = true; b.win = true; b.result = 'win'; }
    else if (!a) { b.over = true; b.win = false; b.result = 'lose'; }
    return b.over;
  },

  /** 榜单：我方输出、承伤、治疗各取前三。结算和战报底下都读它。 */
  board(b) {
    const top = k => b.allies.filter(u => u.tally[k] > 0).sort((x, y) => y.tally[k] - x.tally[k]).slice(0, 3)
      .map(u => ({ name: u.name, hid: u.hid, v: u.tally[k] }));
    return { dealt: top('dealt'), taken: top('taken'), healed: top('healed') };
  },

  /** 一次性算完（模拟与快进用） */
  runAll(b) { while (!b.over) this.runRound(b); return b; },
};

/* ── 7  养成 ─────────────────────────────────────────────────────────── */

const Grow = {
  /** 用一件杂物。行囊里点它就走这儿 —— 原来 G.items 只有写入没有消耗，
   *  背包攒一堆兵法和伤药，一件也用不掉。 */
  useItem(key, hid) {
    const n = G.items[key] || 0;
    if (n <= 0) return '背囊里没有这个';
    const it = DB.item(key);
    if (!it) return '这是什么东西';
    const take = () => { if (--G.items[key] <= 0) delete G.items[key]; Save.write(); };

    if (it.type === 'exp') {
      const h = G.heroes[hid];
      if (!h) return '先挑一个人';
      if (h.lv >= Lap.maxLv()) return `${DB.hero(hid).name}已满级`;
      const ups = this.addExpTo(h, it.v || 0);
      take();
      return { ok: `${DB.hero(hid).name} 读完${it.name}，长了 ${it.v} 经验${ups ? `，升 ${ups} 级` : ''}` };
    }

    if (it.type === 'cure') {
      // 大还丹是全军的，别的都是点一个人
      if ((it.v || 0) >= 9) {
        const hurt = Object.keys(G.heroes).filter(h => Hurt.of(h).lv);
        if (!hurt.length) return '全军无伤，留着吧';
        for (const h of hurt) G.heroes[h].hurt = { lv: 0, rest: 0 };
        take();
        return { ok: `一丸${it.name}下去，${hurt.length} 人的伤全好了` };
      }
      const h = G.heroes[hid];
      if (!h) return '先挑一个人';
      const u = Hurt.of(hid);
      if (!u.lv) return `${DB.hero(hid).name}身上没伤`;
      if (u.lv === 2 && (it.v || 1) < 2) return `${it.name}治不了重伤`;
      h.hurt = { lv: 0, rest: 0 };
      take();
      return { ok: `${DB.hero(hid).name} 敷了${it.name}，伤好了` };
    }

    return '这个东西还没派上用场';
  },

  /** 给指定的人加经验并结算升级 */
  addExpTo(h, amount) {
    const before = h.lv;
    this.gainExp(h, amount);
    Save.write();
    return h.lv - before;
  },

  /** 督练的天花板：打到哪儿，才练得到哪儿。
   *  银子原来可以无限往操练里填，于是招兵买马那一头永远没余钱；
   *  而且谁钱多谁就能把等级堆过头，把关卡难度直接抹平。
   *  设定上也讲得通 —— 本事是打出来的，钱只能把该有的阅历补齐，补不出没打过的仗。 */
  drillCap() {
    let top = 5;
    for (const sid of DB.stageIds()) {
      if (!G.cleared[sid]) continue;
      const rl = Lap.recLv(DB.stage(sid).rec_lv);
      if (rl && rl[1] > top) top = rl[1];
    }
    // 二周目开局关卡进度清零，但人已经练到上一周目的顶了 —— 不能因此连练都练不动。
    // 上一周目挣来的等级就是这一周目的底。
    const floor = Lap.now() > 1 ? Lap.maxLv(Lap.now() - 1) : 0;
    return Math.min(Lap.maxLv(), Math.max(floor, top + CFG.drillAhead));
  },

  /** 督练一级要花多少银两：只补还差的那点经验，快满时便宜。
   *  已经顶到天花板的返回 0，按钮那边据此显示「练不动了」 */
  drillCost(hid) {
    const h = G.heroes[hid];
    if (!h || h.lv >= Lap.maxLv()) return 0;
    if (h.lv >= this.drillCap()) return 0;
    const gap = Math.max(1, CFG.expNeed(h.lv) - h.exp);
    return Math.ceil(gap * CFG.drillPrice(h.lv));
  },

  /** 花银两补经验，升级路径与打关卡拿经验完全相同 */
  levelUp(hid) {
    const h = G.heroes[hid];
    if (!h) return '没有这个人';
    if (h.lv >= Lap.maxLv()) return '已满级';
    const cap = this.drillCap();
    if (h.lv >= cap) return `练不动了 —— 督练最多到 ${cap} 级，往前打几关才练得上去`;
    const cost = this.drillCost(hid);
    if (G.res.silver < cost) return `需 ${cost} 银两`;
    G.res.silver -= cost;
    this.gainExp(h, Math.max(1, CFG.expNeed(h.lv) - h.exp));
    Save.write();
    return null;
  },

  /** 一级一级点，从一级练到满级是上千次点击，没人受得了。
   *  连练：银两花光、撞上等级上限、或者到了指定级数就停。
   *  到位为止还是走 levelUp 那一条路，属性与打关卡升上去的完全一致。 */
  drillMax(hid, stopAt) {
    const h = G.heroes[hid];
    if (!h) return { n: 0, spent: 0, why: '没有这个人' };
    const cap = Math.min(Lap.maxLv(), this.drillCap(), stopAt || Lap.maxLv());
    if (h.lv >= cap) return { n: 0, spent: 0, why: '已到' + (stopAt ? stopAt + ' 级' : '满级') };
    const lv0 = h.lv, silver0 = G.res.silver;
    let why = '';
    // 上限兜底：真有人把银子堆到几百万，也不至于在这儿转到天荒地老
    for (let guard = 0; guard < 4000; guard++) {
      if (h.lv >= cap) { why = cap >= Lap.maxLv() ? '满级了' : `到头了，督练最多到 ${cap} 级`; break; }
      const c = this.drillCost(hid);
      if (G.res.silver < c) { why = '银两不够了'; break; }
      G.res.silver -= c;
      this.gainExp(h, Math.max(1, CFG.expNeed(h.lv) - h.exp));
    }
    Save.write();
    return { n: h.lv - lv0, spent: silver0 - G.res.silver, why };
  },

  /** 这个人还能练到几级 —— 按手上的银两推算，按钮上先告诉玩家 */
  drillReach(hid) {
    const h = G.heroes[hid];
    if (!h) return 0;
    const cap = this.drillCap();
    let lv = h.lv, exp = h.exp, purse = G.res.silver;
    for (let guard = 0; guard < 4000 && lv < cap; guard++) {
      const gap = Math.max(1, CFG.expNeed(lv) - exp);
      const c = Math.ceil(gap * CFG.drillPrice(lv));
      if (purse < c) break;
      purse -= c; lv++; exp = 0;
    }
    return lv;
  },

  /** 单人加经验并结算升级 —— 队伍加经验与督练共用这一条路 */
  gainExp(h, amount) {
    h.exp += amount;
    let n = 0;
    while (h.lv + n < Lap.maxLv() && h.exp >= CFG.expNeed(h.lv + n)) { h.exp -= CFG.expNeed(h.lv + n); n++; }
    if (n) { this.applyGrowth(h, n); h.lv += n; }
    if (h.lv >= Lap.maxLv()) h.exp = 0;
    return n;
  },

  /** 升级只累加 base，战斗数值由 Stats.calc 统一算 —— 与敌人共用 growStep */
  applyGrowth(h, steps) {
    const t = DB.hero(h.hid) || {};
    for (let i = 0; i < steps; i++)
      for (const k of GROW_KEYS) h.base[k] += growStep(t, h.base0, k);
  },

  /** 二梯队：按战力排在正选之后的那一阵人。伤病轮换靠他们接手。 */
  reserve() {
    return Object.keys(G.heroes)
      .filter(h => !G.team.includes(h))
      .sort((a, b) => Stats.heroPower(b) - Stats.heroPower(a))
      .slice(0, CFG.teamSize);
  },

  addExp(amount) {
    const up = [];
    for (const hid of G.team) {
      const h = G.heroes[hid];
      if (!h) continue;
      if (this.gainExp(h, amount)) up.push(`${DB.hero(hid).name} 升至 ${h.lv} 级`);
    }
    // 二梯队跟着练，拿半份。见 CFG.benchExp
    const half = Math.round(amount * CFG.benchExp);
    if (half > 0) for (const hid of this.reserve()) {
      const h = G.heroes[hid];
      if (!h) continue;
      if (this.gainExp(h, half)) up.push(`${DB.hero(hid).name} 升至 ${h.lv} 级`);
    }
    return up;
  },

  /** 升星账。按钮、群将筛选、首页提示都读这一份，不再各算各的。
   *  先扣本人碎片，不够的用兵符补。
   *  原来还有三种「无主碎片」夹在中间，跟兵符干的是同一件事，V10.1 并进兵符了。 */
  /** 某人从 star 升到 star+1 要几片：基础表 × 品质系数 */
  starCostOf(hid, star) {
    const q = (DB.hero(hid) || {}).q || 1;
    return Math.max(1, Math.round((CFG.starCost[star] || 99) * (CFG.starCostQ[q] || 1)));
  },

  starNeed(hid) {
    const h = G.heroes[hid];
    if (!h) return null;
    if (h.star >= Lap.maxStar()) return { max: true };
    const cost = this.starCostOf(hid, h.star);
    const own = G.frags[hid] || 0;
    const useOwn = Math.min(own, cost);
    const token = cost - useOwn;
    return { max: false, cost, own, useOwn, token, ok: token <= (G.res.token || 0) };
  },

  starUp(hid) {
    const h = G.heroes[hid];
    if (!h) return '没有这个人';
    const n = this.starNeed(hid);
    if (n.max) return '已满星';
    if (!n.ok) return `需 ${n.cost}：碎片 ${n.own}，还差 ${n.token} 兵符（现有 ${G.res.token || 0}）`;
    G.frags[hid] = n.own - n.useOwn;
    if (!G.frags[hid]) delete G.frags[hid];
    G.res.token -= n.token;
    h.star++;
    const all = skillIdsOf(hid, h);
    const locked = all.filter(s => !h.owned.includes(s));
    if (locked.length) h.owned.push(locked[0]);
    this.melt(hid);
    Save.write();
    return null;
  },

  /** 满星的人：手上的碎片按 CFG.fragMelt 片折一枚兵符，零头留着。
   *  返回折出来的兵符数 */
  melt(hid) {
    const h = G.heroes[hid];
    if (!h || h.star < Lap.maxStar()) return 0;
    const n = G.frags[hid] || 0;
    const tk = Math.floor(n / CFG.fragMelt);
    if (!tk) return 0;
    G.frags[hid] = n - tk * CFG.fragMelt;
    if (!G.frags[hid]) delete G.frags[hid];
    G.res.token = (G.res.token || 0) + tk;
    return tk;
  },

  equip(hid, slot, eid) {
    const h = G.heroes[hid];
    const e = DB.equip(eid);
    if (!h || !e || e.slot !== slot) return '装不上';
    const key = 'eq_' + eid;
    if ((G.items[key] || 0) <= 0) return '背包里没有';
    const old = h.equipment[slot];
    if (old) G.items['eq_' + old] = (G.items['eq_' + old] || 0) + 1;
    h.equipment[slot] = eid;
    if (--G.items[key] <= 0) delete G.items[key];
    Save.write();
    return null;
  },

  unequip(hid, slot) {
    const h = G.heroes[hid];
    if (!h || !h.equipment[slot]) return '这个位置是空的';
    const eid = h.equipment[slot];
    G.items['eq_' + eid] = (G.items['eq_' + eid] || 0) + 1;
    h.equipment[slot] = null;
    Save.write();
    return null;
  },

  bagEquips(slot) {
    return Object.keys(G.items)
      .filter(k => k.startsWith('eq_') && G.items[k] > 0)
      .map(k => DB.equip(k.slice(3)))
      .filter(e => e && (!slot || e.slot === slot))
      .sort((a, b) => b.q - a.q);
  },

  /** 新入伙的人从「队伍平均等级 −2」起步。
   *  从 1 级开始的话，第二十章抽到卢俊义也顶不上一个练满的陈达 ——
   *  模拟里三百五十抽下来主力阵容一个没换，抽卡等于白抽。
   *  在江湖上闯出名号的人，不是一张白纸。 */
  joinLevel() {
    const ls = G.team.map(h => (G.heroes[h] || {}).lv || 1);
    if (!ls.length) return 1;
    const avg = ls.reduce((a, b) => a + b, 0) / ls.length;
    return clamp(Math.round(avg) - 2, 1, Lap.maxLv());
  },

  gainHero(hid) {
    if (!DB.hero(hid)) return null;
    if (!G.heroes[hid]) {
      const h = makeHero(hid);
      const lv = this.joinLevel();
      if (lv > 1) { h.lv = lv; h.base = Object.assign({}, grownBase(hid, lv)); }
      G.heroes[hid] = h;
      return { got: true, hid, lv };
    }
    const n = CFG.fragByQ[DB.hero(hid).q] || 1;
    G.frags[hid] = (G.frags[hid] || 0) + n;
    const token = this.melt(hid);      // 满星的人再来，碎片直接折兵符
    return { got: false, hid, frag: n, token };
  },

  /** 一键上阵：挑当下能打的最强九人，并把耐揍的排到前排。
   *  前排优先承伤之后，谁站第一排就不再是无所谓的事。 */
  autoTeam() {
    const able = Object.keys(G.heroes).filter(h => Hurt.able(h));
    if (!able.length) return '没有能上阵的人';
    const best = able.sort((a, b) => Stats.heroPower(b) - Stats.heroPower(a))
                     .slice(0, CFG.teamSize);
    // 前排按「血 + 防」排，后排留给输出与谋士
    const tough = hid => { const s = Stats.calc(hid); return s ? s.maxHp / CFG.hpMult + s.def * 2 : 0; };
    const byTough = best.slice().sort((a, b) => tough(b) - tough(a));
    const front = byTough.slice(0, 3);
    const rest = best.filter(h => !front.includes(h))
                     .sort((a, b) => Stats.heroPower(b) - Stats.heroPower(a));
    G.team = front.concat(rest);
    Save.write();
    return null;
  },

  addToTeam(hid) {
    if (G.team.includes(hid)) return '已在阵中';
    if (Hurt.heavy(hid)) return `${DB.hero(hid).name} 重伤未愈，上不得阵`;
    if (G.team.length >= CFG.teamSize) return `最多 ${CFG.teamSize} 人`;
    G.team.push(hid); Save.write(); return null;
  },
  /** 拖动换位：两个格子对调。
   *  阵列不留空洞 —— 位置就是出场次序，前三个站第一排。
   *  留空洞的话战斗里的行列要另算一套，不值当。 */
  swapTeam(i, j) {
    if (i === j) return null;
    if (i < 0 || j < 0 || i >= G.team.length || j >= G.team.length) return '那儿是空位';
    const t = G.team.slice();
    const x = t[i]; t[i] = t[j]; t[j] = x;
    G.team = t;
    Save.write();
    return null;
  },

  removeFromTeam(hid) {
    const i = G.team.indexOf(hid);
    if (i < 0) return '不在阵中';
    if (G.team.length <= 1) return '至少留一人';
    G.team.splice(i, 1); Save.write(); return null;
  },

  /** 两段式抽卡：先按公示概率抽稀有度，再在该档内等概率抽人。UI 显示即真实概率。 */
  rollOne(floorQ, rates) {
    let q;
    if (rates) {
      const ks = Object.keys(rates).map(Number).filter(k => DB.poolByQ[k]);
      const tot = ks.reduce((a, k) => a + rates[k], 0);
      let r = rnd() * tot; q = ks[0];
      for (const k of ks) { r -= rates[k]; if (r <= 0) { q = k; break; } }
    } else if (floorQ) {
      const pool = [], w = [];
      for (let i = floorQ; i <= 6; i++) if (DB.poolByQ[i]) { pool.push(i); w.push(CFG.recruitRate[i]); }
      const tot = w.reduce((a, b) => a + b, 0);
      let r = rnd() * tot; q = pool[0];
      for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) { q = pool[i]; break; } }
    } else {
      let r = rnd(), acc = 0; q = 1;
      for (let i = 6; i >= 1; i--) { acc += CFG.recruitRate[i]; if (r < acc) { q = i; break; } }
    }
    const pool = DB.poolByQ[q] || DB.poolByQ[1];
    return pick(pool);
  },

  recruit(times) {
    const cost = times === 1 ? CFG.recruitCost1 : CFG.recruitCost10;
    if (G.res.silver < cost) return { err: `需 ${cost} 银两` };
    G.res.silver -= cost;
    const out = [];
    for (let i = 0; i < times; i++) {
      G.pity.ten++; G.pity.fifty++;
      let floor = 0;
      if (G.pity.fifty >= 50) { floor = CFG.pityFifty; G.pity.fifty = 0; }
      else if (times === 10 && i === times - 1 && !out.some(o => DB.hero(o.hid).q >= CFG.pityTen)) floor = CFG.pityTen;
      const hid = this.rollOne(floor);
      if (DB.hero(hid).q >= CFG.pityTen) G.pity.ten = 0;
      if (DB.hero(hid).q >= CFG.pityFifty) G.pity.fifty = 0;
      out.push({ ...this.gainHero(hid), q: DB.hero(hid).q });
    }
    Save.write();
    return { list: out };
  },

  goldExchange() {
    if (G.res.gold < CFG.goldExchangeCost) return { err: `需 ${CFG.goldExchangeCost} 黄金` };
    G.res.gold -= CFG.goldExchangeCost;
    const hid = this.rollOne(0, CFG.goldRate);
    const r = { ...this.gainHero(hid), q: DB.hero(hid).q };
    Save.write();
    return { list: [r] };
  },

  /* ── V10.5 铁匠铺 ─────────────────────────────────────────────── */

  /** 眼下能打造到的最高品阶：当前进度章的掉落上限 +1；一周目通关过就不封。专属算「7」。 */
  forgeCap() {
    if (Lap.now() > 1 || Lap.done()) return 7;
    let ch = 1;
    for (const sid of Object.keys(G.cleared)) { const st = DB.stage(sid); if (st && st.ch > ch) ch = st.ch; }
    const cap = Stages.qCap(ch) + 1;
    return cap >= 6 ? 7 : cap;
  },
  /** 按封顶重算后的概率表（摇不到的档位让给下一档），界面显示用的就是这张 */
  forgeRates(cap) {
    cap = cap || this.forgeCap();
    const out = {};
    let spill = 0;
    for (let q = 7; q >= 1; q--) {
      const r = CFG.forgeRate[q] || 0;
      if (q > cap) { spill += r; continue; }
      out[q] = r + spill; spill = 0;
    }
    return out;
  },
  /** 某个品阶的池子。7 = 专属：先挑手上的人还没拿到的，再挑任意一件 */
  forgePool(q) {
    if (q === 7) {
      const pool = DB.exclusivePool;
      const have = new Set(Object.keys(G.items).filter(k => k.startsWith('eq_') && G.items[k] > 0).map(k => k.slice(3)));
      for (const h of Object.values(G.heroes)) for (const sl of SLOTS) if (h.equipment[sl]) have.add(h.equipment[sl]);
      const mine = pool.filter(k => G.heroes[DB.equip(k).exclusive] && !have.has(k));
      return mine.length ? mine : pool.filter(k => !have.has(k)).length ? pool.filter(k => !have.has(k)) : pool;
    }
    return DB.equipIds().filter(k => { const e = DB.equip(k); return e && !e.exclusive && e.q === q; });
  },
  forgeOne(floorQ) {
    const rates = this.forgeRates();
    const ks = Object.keys(rates).map(Number).filter(q => q >= (floorQ || 1) && this.forgePool(q).length).sort((a, b) => a - b);
    if (!ks.length) return null;
    const tot = ks.reduce((a, q) => a + rates[q], 0);
    let r = rnd() * tot, q = ks[ks.length - 1];
    for (const k of ks) { r -= rates[k]; if (r <= 0) { q = k; break; } }
    return pick(this.forgePool(q));
  },
  forge(times) {
    const cost = times === 1 ? CFG.forgeCost1 : CFG.forgeCost10;
    if (G.res.silver < cost) return { err: `需 ${cost} 银两` };
    G.res.silver -= cost;
    G.pity.forge = G.pity.forge || 0;
    const out = [];
    for (let i = 0; i < times; i++) {
      G.pity.forge++;
      let floor = 0;
      const cap = this.forgeCap();
      if (G.pity.forge >= 40 && cap >= CFG.forgeForty) { floor = CFG.forgeForty; G.pity.forge = 0; }
      else if (times === 10 && i === times - 1 && !out.some(o => o.q >= CFG.forgePityTen)) floor = CFG.forgePityTen;
      const eid = this.forgeOne(floor);
      if (!eid) break;
      const e = DB.equip(eid);
      if (e.q >= CFG.forgeForty) G.pity.forge = 0;
      const had = (G.items['eq_' + eid] || 0) > 0
        || Object.values(G.heroes).some(h => SLOTS.some(sl => h.equipment[sl] === eid));
      G.items['eq_' + eid] = (G.items['eq_' + eid] || 0) + 1;
      out.push({ eid, q: e.exclusive ? 7 : e.q, had });
    }
    Save.write();
    return { list: out };
  },

  /* ── V10.5 布阵页一键装备 / 一键卸装 ─────────────────────────── */

  /** 一件装备对这个人值多少：品阶优先；兵器对上擅长比一档品阶还值钱；再看面板，武将看武、谋士看智 */
  gearScore(hid, e) {
    const t = DB.hero(hid) || {};
    let v = e.q * 1000;
    if (e.exclusive === hid) v += 5000;
    if (e.slot === 'weapon' && e.weaponType && e.weaponType === t.fav_weapon) v += 800;
    const mage = (t.int || 0) > (t.atk || 0);
    v += (e.flat.atk || 0) * (mage ? 1 : 3) + (e.flat.int || 0) * (mage ? 3 : 1)
       + (e.flat.def || 0) * 2 + (e.flat.agi || 0) * 2 + (e.flat.hp || 0) / 20
       + ((e.pct.atk || 0) * (mage ? 300 : 900)) + ((e.pct.int || 0) * (mage ? 900 : 100)) + ((e.pct.def || 0) + (e.pct.hp || 0)) * 600;
    // V10.6 文官兵器（只加智%）武将拿着吃亏：扣掉两档品阶，高两档以上才考虑
    if (e.slot === 'weapon' && e.pct.int && !e.pct.atk && !mage) v -= 2500;
    return v;
  },
  /** 只动阵上九人，只从背包里拿，不从别人身上扒 */
  autoEquip() {
    const team = G.team.filter(Boolean);
    if (!team.length) return { err: '阵上没有人' };
    let put = 0, swapped = 0;
    // 先发专属：本人穿才有特效
    for (const hid of team) for (const e of this.bagEquips(null)) {
      if (e.exclusive !== hid) continue;
      const cur = G.heroes[hid].equipment[e.slot];
      if (cur === e.id) continue;
      if (!this.equip(hid, e.slot, e.id)) { put++; if (cur) swapped++; }
    }
    // 再按战力从高到低轮人，每格挑背包里最合适的一件
    const order = team.slice().sort((a, b) => Stats.heroPower(b) - Stats.heroPower(a));
    for (const hid of order) for (const slot of SLOTS) {
      const bag = this.bagEquips(slot);
      if (!bag.length) continue;
      const best = bag.slice().sort((a, b) => this.gearScore(hid, b) - this.gearScore(hid, a))[0];
      const curId = G.heroes[hid].equipment[slot];
      const cur = DB.equip(curId);
      if (cur && this.gearScore(hid, cur) >= this.gearScore(hid, best)) continue;
      if (!this.equip(hid, slot, best.id)) { put++; if (cur) swapped++; }
    }
    return { put, swapped };
  },
  /** 阵上九人的装备全部回背包 */
  stripTeam() {
    let n = 0;
    for (const hid of G.team.filter(Boolean)) for (const slot of SLOTS) if (!this.unequip(hid, slot)) n++;
    return { n };
  },
};

/* ── 7之一  伤势 ─────────────────────────────────────────────────────── */

const Hurt = {
  of(hid) { const h = G.heroes[hid]; return (h && h.hurt) || { lv: 0, rest: 0 }; },
  heavy(hid) { return this.of(hid).lv === 2; },
  /** 还能上阵的人 */
  able(hid) { return !!G.heroes[hid] && !this.heavy(hid); },
  ableCount() { return Object.keys(G.heroes).filter(h => this.able(h)).length; },

  /** 一场仗打完记账：上阵的人按结局挂伤，没上阵的人养一场。
   *  胜负都算 —— 输了更该挂彩。 */
  settle(b) {
    const out = [];
    const onField = new Set(b.allies.map(u => u.hid));

    // 全军覆没不能变成死局：先算这一仗最多能让多少人重伤，
    // 使「还能上阵的人」不低于一阵之数（手上不够九个就按手上的算）。
    const owned = Object.keys(G.heroes).length;
    const floor = Math.min(owned, CFG.teamSize);
    const dead = b.allies.filter(u => !u.alive);
    const ableAfterAll = Object.keys(G.heroes)
      .filter(h => this.able(h) && !dead.some(u => u.hid === h)).length;
    // 超出的名额从战力最高的人开始减免 —— 主力留着能用，玩家才转得动。
    // 两条线取宽的那条：一是阵容底线（手上凑不出一阵就得减免），
    // 二是一场仗的重伤人数上限（见 CFG.hurtHeavyMax）。
    let spare = Math.max(0, floor - ableAfterAll, dead.length - CFG.hurtHeavyMax);
    const relief = new Set(dead.slice()
      .sort((x, y) => Stats.heroPower(y.hid) - Stats.heroPower(x.hid))
      .slice(0, spare).map(u => u.hid));

    for (const u of b.allies) {
      const h = G.heroes[u.hid];
      if (!h) continue;
      let lv = 0, rest = 0;
      if (!u.alive) {
        // 天哭星：倒下就是重伤，没有减免这回事
        const soft = relief.has(u.hid) && !Fate.has('allHeavy');
        lv = soft ? 1 : 2;
        rest = soft ? CFG.hurtLightRest : CFG.hurtHeavyRest;
      } else if (u.hp / u.maxHp < CFG.hurtLightAt) { lv = 1; rest = CFG.hurtLightRest; }
      if (!lv) continue;
      // 天寿星：休养少一场
      rest = Math.max(1, rest + Fate.v('rest', 0));
      const old = h.hurt || { lv: 0, rest: 0 };
      h.hurt = { lv: Math.max(old.lv, lv), rest: Math.max(old.rest, rest) };
      out.push({ hid: u.hid, lv: h.hurt.lv, rest: h.hurt.rest, died: !u.alive });
    }

    // 没上阵的人休养一场。
    // 但手上人数还不够摆一阵时根本换不下来 —— 那样伤只会越积越死，
    // 开局两个人打十场，朱武会一直挂着轻伤好不了。这种时候人人都算休养。
    const noBench = Object.keys(G.heroes).length <= CFG.teamSize;
    const healed = [];
    for (const hid of Object.keys(G.heroes)) {
      if (!noBench && onField.has(hid)) continue;
      const h = G.heroes[hid];
      if (!h.hurt || !h.hurt.lv) continue;
      h.hurt.rest--;
      if (h.hurt.rest <= 0) { h.hurt = { lv: 0, rest: 0 }; healed.push(hid); }
    }

    // 重伤的人抬下去，位置直接让板凳上最强的顶上 —— 一场大败之后
    // 让玩家手动补八个空位是白费功夫，何况他也只会这么补。
    const down = [];
    for (let i = 0; i < G.team.length; i++) {
      const hid = G.team[i];
      if (!hid || !this.heavy(hid)) continue;
      const bench = Object.keys(G.heroes)
        .filter(x => this.able(x) && !G.team.includes(x))
        .sort((x, y) => Stats.heroPower(y) - Stats.heroPower(x));
      if (bench.length) { G.team[i] = bench[0]; down.push({ out: hid, in: bench[0] }); }
      else if (G.team.length > 1) { G.team.splice(i, 1); i--; down.push({ out: hid, in: null }); }
    }
    return { hurt: out, healed, down };
  },

  cureCost(hid) {
    const h = G.heroes[hid];
    if (!h || !h.hurt || !h.hurt.lv) return 0;
    const k = h.hurt.lv === 2 ? CFG.cureHeavy : CFG.cureLight;
    const doc = G.heroes[CFG.doctorId] ? CFG.cureDoctor : 1;
    // 挂在操练价上，自然随等级涨
    const base = Math.max(1, Math.ceil(Math.max(1, CFG.expNeed(h.lv)) * CFG.drillPrice(h.lv)));
    return Math.max(10, Math.round(base * k * doc * Fate.v('cure', 1)));
  },

  cure(hid) {
    const h = G.heroes[hid];
    if (!h) return '没有这个人';
    if (!h.hurt || !h.hurt.lv) return '身上没伤';
    const c = this.cureCost(hid);
    if (G.res.silver < c) return `需 ${c} 银两`;
    G.res.silver -= c;
    h.hurt = { lv: 0, rest: 0 };
    Save.write();
    return null;
  },

  txt(hid) {
    const u = this.of(hid);
    if (!u.lv) return '';
    return u.lv === 2 ? `重伤 · 还需 ${u.rest} 场` : `轻伤 · 还需 ${u.rest} 场`;
  },
};

/* ── 7之二  引导 ─────────────────────────────────────────────────────── */

/** 新手进来不知道先干什么。这里按存档状态算出一条「下一步」，
 *  主界面常驻显示，点一下直接跳过去。纯函数，不改任何状态。 */
const Guide = {
  next() {
    const owned = Object.keys(G.heroes);
    const nextStage = DB.stageIds().find(s => !G.cleared[s] && Stages.unlocked(s));
    const st = nextStage ? DB.stage(nextStage) : null;

    if (!Object.keys(G.cleared).length) {
      // 二周目开局带着一身家当从头走，别再说「两个人也够用」
      if (Lap.now() > 1)
        return { txt: `${Lap.now()} 周目，从头再走一遍`,
                 sub: `这一趟敌方强一截，等级能练到 ${Lap.maxLv()}、星级到 ${Lap.maxStar()}；`
                      + `打过的关可以速战`, act: 'stage', id: nextStage };
      if (owned.length < CFG.teamSize && G.res.silver >= CFG.recruitCost10)
        return { txt: '先去酒肆招人', sub: '关卡不送人，武将只能招。开局的钱够一次十连', act: 'go', id: 'tavern' };
      return { txt: '先打第一关：史家村学艺', sub: '照着打就是', act: 'stage', id: nextStage };
    }
    // 人手不够一阵，钱够就先招人
    if (owned.length < CFG.teamSize && G.res.silver >= CFG.recruitCost1)
      return { txt: `手上才 ${owned.length} 个人`, sub: '关卡不送人，去酒肆招几个', act: 'go', id: 'tavern' };

    // 阵上有重伤的空位
    const benchAble = owned.filter(h => !G.team.includes(h) && Hurt.able(h));
    if (G.team.length < CFG.teamSize && benchAble.length) {
      const hurtN = owned.filter(h => Hurt.heavy(h)).length;
      if (hurtN) return { txt: `${hurtN} 人重伤，阵上缺人`, sub: '去布阵把伤员换下来', act: 'go', id: 'team' };
    }
    // 有人闲着没上阵
    if (G.team.length < CFG.teamSize && owned.length > G.team.length)
      return { txt: `还有 ${owned.length - G.team.length} 个人没上阵`, sub: '去布阵把空位填满', act: 'go', id: 'team' };

    // 阵满了，但板凳上有更强的
    if (G.team.length >= CFG.teamSize) {
      const bench = owned.filter(h => !G.team.includes(h));
      if (bench.length) {
        const best = bench.reduce((a, b) => Stats.heroPower(b) > Stats.heroPower(a) ? b : a);
        const worst = G.team.reduce((a, b) => Stats.heroPower(b) < Stats.heroPower(a) ? b : a);
        if (Stats.heroPower(best) > Stats.heroPower(worst) * 1.15)
          return { txt: `${DB.hero(best).name} 比阵上的 ${DB.hero(worst).name} 强`, sub: '去布阵换一换', act: 'go', id: 'team' };
      }
    }

    // 包里有比身上好的装备
    for (const hid of G.team) for (const slot of SLOTS) {
      const cur = G.heroes[hid].equipment[slot];
      const bag = Grow.bagEquips(slot);
      if (bag.length && (!cur || bag[0].q > DB.equip(cur).q))
        return { txt: `${DB.hero(hid).name} 的${SLOT_NAME[slot]}可以换`, sub: '行囊里有更好的', act: 'hero', id: hid };
    }

    // 够钱督练，且队伍低于下一关推荐等级
    if (st) {
      const want = (st.rec_lv || [1, 5])[1];
      const weak = G.team.filter(h => G.heroes[h].lv < want - 1);
      if (weak.length) {
        const c = Grow.drillCost(weak[0]);
        if (G.res.silver >= c)
          return { txt: `队伍比「${st.name}」的推荐等级低`, sub: `去群将操练，${DB.hero(weak[0]).name} 一级 ${c} 银`, act: 'hero', id: weak[0] };
      }
    }

    // 碎片加兵符够升星
    for (const hid of G.team) {
      const n = Grow.starNeed(hid);
      if (n && !n.max && n.ok)
        return { txt: `${DB.hero(hid).name} 可以升星`, sub: '升一星多一个技能', act: 'hero', id: hid };
    }

    // 钱多到可以十连
    if (G.res.silver >= CFG.recruitCost10 + CFG.recruitCost1)
      return { txt: '银两够十连了', sub: '去酒肆招兵买马', act: 'go', id: 'tavern' };

    if (st) return { txt: `下一关：${stName(st.name)}`,
      sub: `第${st.ch}章 · 推荐 ${Lap.recLv(st.rec_lv || [1, 5])[1]} 级 · 敌 ${Battle.roster(sid).length} 人`,
      act: 'stage', id: nextStage };
    return { txt: '关隘已经打通了', sub: '石碣上的名字，还差几个', act: 'go', id: 'codex' };
  },
};

/* ── 8  关卡解锁与结算 ───────────────────────────────────────────────── */

const Stages = {
  kindOf(sid) {
    const st = DB.stage(sid);
    if (!st) return 'normal';
    if (st.hidden) return 'hidden';
    if (st.is_boss) return 'boss';
    return /_f\d+$/.test(sid) ? 'side' : 'normal';
  },

  /** 隐藏关推荐等级比同章高六级，是回头再打的东西，
   *  不能挡在主线前面 —— 原来它排在章末，下一章要等它通了才开，
   *  等于第三章就把人卡死。主线只认主线。 */
  mainLine(ch) { return (DB.byChapter[ch] || []).filter(s => !(DB.stage(s) || {}).hidden); },

  /** 前置关一路往回找到第一个非隐藏关。
   *  数据里 138 关串成一条 req_stage 链，隐藏关也在链上 ——
   *  ch27 的前置是 ch26 的秘藏，秘藏打不过，后面五章就全锁死了。 */
  reqOf(sid) {
    let r = (DB.stage(sid) || {}).req_stage, n = 0;
    while (r && (DB.stage(r) || {}).hidden && n++ < 20) r = (DB.stage(r) || {}).req_stage;
    return r || null;
  },

  unlocked(sid) {
    const st = DB.stage(sid);
    if (!st) return false;
    if (G.cleared[sid]) return true;
    const req = this.reqOf(sid);
    if (req && !G.cleared[req]) return false;
    const ch = st.ch || 1;
    const line = this.mainLine(ch);
    const prevCh = () => {
      const p = DB.chapters.filter(c => c < ch).pop();
      if (p == null) return true;
      const pl = this.mainLine(p);
      return pl.length ? !!G.cleared[pl[pl.length - 1]] : true;
    };
    if (st.hidden) return prevCh() || (line.length ? !!G.cleared[line[0]] : true);
    const i = line.indexOf(sid);
    if (i > 0) return !!G.cleared[line[i - 1]];
    return prevCh();
  },

  lockReason(sid) {
    const st = DB.stage(sid);
    const req = this.reqOf(sid);
    if (req && !G.cleared[req]) {
      const r = DB.stage(req);
      return `须先通「${r ? stName(r.name) : req}」`;
    }
    const line = this.mainLine(st.ch || 1);
    const i = line.indexOf(sid);
    if (i > 0) { const p = DB.stage(line[i - 1]); return `须先通「${p ? stName(p.name) : ''}」`; }
    return '尚未解锁';
  },

  /** 按槽位与品质区间摇一件装备。该档没货就往下找，绝世的甲与盔本来就没有。 */
  rollEquip(slot, qmax, qmin) {
    const sl = slot === 'helm' ? 'helmet' : (slot || pick(SLOTS));
    // V10.6：文官装按阵上文官（智高于武）的比例摇，没有文官也留一成。不然低档兵器被扇子笔杆摊薄
    const team = (G.team || []).filter(Boolean);
    const mages = team.filter(h => { const t = DB.hero(h); return t && t.int > t.atk; }).length;
    const wenP = Math.max(0.1, team.length ? mages / team.length : 0.1);
    const wantWen = chance(wenP);
    for (let lo = qmin; lo >= 1; lo--) {
      const cand = DB.equipIds().filter(k => {
        const e = DB.equip(k);
        return e && e.slot === sl && e.q <= qmax && e.q >= lo && !e.exclusive;
      });
      if (!cand.length) continue;
      const pref = cand.filter(k => DB.equip(k).wen === wantWen);
      return pick(pref.length ? pref : cand);
    }
    return null;
  },

  /** 摇一件专属：这一关敌将的 → 手上的人还没拿到的 → 任意一件 */
  rollExclusive(st) {
    const pool = DB.exclusivePool;
    if (!pool.length) return null;
    const have = new Set(Object.keys(G.items).filter(k => k.startsWith('eq_') && G.items[k] > 0).map(k => k.slice(3)));
    for (const h of Object.values(G.heroes)) for (const s of SLOTS) if (h.equipment[s]) have.add(h.equipment[s]);
    const foes = new Set(st.enemies || []);
    const a = pool.filter(k => foes.has(DB.equip(k).exclusive) && !have.has(k));
    if (a.length) return pick(a);
    const b = pool.filter(k => G.heroes[DB.equip(k).exclusive] && !have.has(k));
    if (b.length) return pick(b);
    const c = pool.filter(k => !have.has(k));
    return c.length ? pick(c) : null;
  },

  /** 章节对应的装备品质上限，与 rebalance_growth.py 里的 cap_by_ch 保持一致 */
  qCap(ch) { return ch <= 4 ? 2 : ch <= 9 ? 3 : ch <= 15 ? 4 : ch <= 25 ? 5 : 6; },

  /** 把这一仗的伤亡写进结算单 */
  woundReport(b, out) {
    const r = Hurt.settle(b);
    for (const w of r.hurt)
      out.push({ icon: '伤', text: `${DB.hero(w.hid).name} ${w.lv === 2 ? '重伤' : '轻伤'}，` +
        `休养 ${w.rest} 场${w.died ? '' : ''}`, c: w.lv === 2 ? 'dm' : 'in' });
    for (const d of r.down)
      out.push({ icon: '伤', text: d.in
        ? `${DB.hero(d.out).name} 抬下阵去，${DB.hero(d.in).name} 顶上`
        : `${DB.hero(d.out).name} 抬下阵去`, c: 'dm' });
    if (r.healed.length)
      out.push({ icon: '愈', text: `${r.healed.map(h => DB.hero(h).name).join('、')} 伤愈归队`, c: 'he' });
  },

  settle(b) {
    const st = b.stage, sid = b.sid;
    const out = [];
    const L0 = (st.rec_lv || [1, 5])[1];

    // 败了什么都不给的话，打不过就是永久卡死 —— 输掉的仗不给银两不给缴获，
    // 但长见识：三成经验。练几场总能过去。
    if (!b.win) {
      const e = Math.round(CFG.stageExp(L0) * CFG.loseExp);
      const ups = Grow.addExp(e);
      out.push({ icon: '经', text: `打输了也长经验 +${e}`, c: 'he' });
      ups.forEach(t => out.push({ icon: '升', text: t, c: 'sk' }));
      // 败仗也收得回一点银两 —— 不然治伤的钱永远凑不出来
      const ls = Math.round(CFG.stageSilver(L0) * CFG.loseSilver * Fate.v('silver', 1));
      if (ls > 0) { G.res.silver += ls; out.push({ icon: '银', text: `收拢残局 +${ls}`, c: '' }); }
      this.woundReport(b, out);   // 输了更该挂彩
      Save.write();
      return out;
    }

    const first = !G.cleared[sid];
    G.cleared[sid] = true;
    G.everCleared = G.everCleared || {};
    G.everCleared[sid] = 1;      // 跨周目不清：下一周目这关可以直接速战
    G.clearCount++;

    // 经验与银两都随推荐等级走：第 30 章一关的收成不该和第 1 章一样
    const L = L0, kind = this.kindOf(sid);
    const exp = CFG.stageExp(L);
    const ups = Grow.addExp(exp);
    out.push({ icon: '经', text: `经验 +${exp}`, c: 'he' });
    ups.forEach(t => out.push({ icon: '升', text: t, c: 'sk' }));

    const silver = Math.round(CFG.stageSilver(L) * Fate.v('silver', 1));
    G.res.silver += silver;
    out.push({ icon: '银', text: `银两 +${silver}`, c: '' });

    if (chance(0.05)) { G.res.gold += 1; out.push({ icon: '金', text: '黄金 +1', c: 'sk' }); }

    for (const d of (st.drops || [])) {
      const dr = d.t === 'equip' ? Fate.v('drop', 1) : 1;
      if (!chance((d.rate || 0) * dr)) continue;
      // 武将只能靠抽（V10.1）：关卡不送人，数据里的 hero 掉落已经清掉，这里也不认
      if (d.t === 'equip') {
        const qc = Math.round(Fate.v('qcap', 0));
        const eid = this.rollEquip(d.slot, Math.max(1, (d.qmax || 6) + qc), Math.max(1, (d.qmin || 1) + qc));
        if (eid) {
          G.items['eq_' + eid] = (G.items['eq_' + eid] || 0) + 1;
          out.push({ icon: '器', text: `获 ${DB.equip(eid).name}`, c: '' });
        }
      } else if (d.t === 'con' && d.id) {
        // 银两和黄金本身就在物品表里，原来一并塞进背包当摆设 ——
        // 打一关弹「获 黄金」，钱包纹丝不动。59 处黄金掉落全废在这儿。
        const it = DB.item(d.id);
        if (d.id === 'silver' || d.id === 'gold' || d.id === 'token') {
          const v = d.v || (d.id === 'gold' ? 1 : d.id === 'token' ? 1 : 100);
          G.res[d.id] = (G.res[d.id] || 0) + v;
          const nm = { silver: '银两', gold: '黄金', token: '兵符' }[d.id];
          out.push({ icon: { silver: '银', gold: '金', token: '符' }[d.id], text: `${nm} +${v}`, c: 'sk' });
        } else {
          G.items[d.id] = (G.items[d.id] || 0) + 1;
          out.push({ icon: '物', text: `获 ${it ? it.name : d.id}`, c: '' });
        }
      }
    }

    if (first) {
      const fr = st.first_reward || {};
      const fs = Math.round(CFG.firstSilver(L, kind) * Fate.v('silver', 1));
      G.res.silver += fs;
      out.push({ icon: '银', text: `首通 银两 +${fs}`, c: 'sk' });
      const fe = Math.round(CFG.firstExp(L, kind) * Fate.v('exp', 1));
      Grow.addExp(fe).forEach(t => out.push({ icon: '升', text: t, c: 'sk' }));
      out.push({ icon: '经', text: `首通 经验 +${fe}`, c: 'sk' });
      // 首通必得一件装备。原来装备只靠 10–20% 的掉落，打到第九章还是赤手空拳，
      // 而难度是按「每格都有本章档次的装备」调的。
      // 二周目的主成长轴是星级，所以符跟着周目翻倍；
      // 天富星把它减半，地煞星再补上两个
      const tk = Math.max(1, Math.round(((CFG.tokenBy[kind] || 1) * Lap.tokenMul()
                                         * Fate.v('token', 1)) + Fate.v('tokenAdd', 0)));
      G.res.token += tk;
      out.push({ icon: '符', text: `首通 兵符 +${tk}`, c: 'sk' });
      const cap = Math.max(1, this.qCap(st.ch || 1) + Math.round(Fate.v('qcap', 0)));
      const fe2 = this.rollEquip(null, cap, Math.max(1, cap - 1));
      if (fe2) {
        G.items['eq_' + fe2] = (G.items['eq_' + fe2] || 0) + 1;
        out.push({ icon: '器', text: `首通 获 ${DB.equip(fe2).name}`, c: 'sk' });
      }
    }

    // Boss 关极低概率掉一件专属。先从这一关的敌将里找，
    // 这一关的人没有专属，就从自己手上的人里找还没拿到的
    if (kind === 'boss' && chance(CFG.excDrop)) {
      const eid = this.rollExclusive(st);
      if (eid) {
        G.items['eq_' + eid] = (G.items['eq_' + eid] || 0) + 1;
        const e = DB.equip(eid);
        out.push({ icon: '器', text: `获 专属 ${e.name}（${DB.hero(e.exclusive).name}）`, c: 'sk' });
      }
    }

    // 地损星：打完总有人挂点彩
    if (Fate.has('hurtAfter')) {
      const pool = b.allies.filter(u => u.alive && G.heroes[u.hid]);
      if (pool.length) {
        const u = pool[Math.floor(rnd() * pool.length)];
        const h = G.heroes[u.hid], old = h.hurt || { lv: 0, rest: 0 };
        if (!old.lv) {
          h.hurt = { lv: 1, rest: Math.max(1, CFG.hurtLightRest + Fate.v('rest', 0)) };
          out.push({ icon: '伤', text: `${DB.hero(u.hid).name} 挂了彩（地损星）`, c: 'dm' });
        }
      }
    }
    this.woundReport(b, out);
    G.log = [...out.slice(0, 3).map(o => o.text), ...G.log].slice(0, 20);
    Save.write();
    return out;
  },
};
