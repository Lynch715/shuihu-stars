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
  maxLv: 50,
  maxStar: 5,
  maxRounds: 30,
  teamSize: 9,

  qmult:   { 1: 1.00, 2: 1.10, 3: 1.20, 4: 1.35, 5: 1.50, 6: 1.70 },
  starMul: { 1: 1.00, 2: 1.12, 3: 1.26, 4: 1.42, 5: 1.60 },
  starSk:  { 1: 1.00, 2: 1.05, 3: 1.10, 4: 1.15, 5: 1.20 },

  hpMult: 5,              // 体力 → 血量
  lvGrow: 0.015,          // 每级通用成长
  favBonus: 0.20,         // 擅长武器加攻
  cap: { eqPct: 0.30, bondAtk: 0.25, bondHp: 0.25, bondOther: 0.20 },

  critRate: 0.08, critChaK: 1400, critChaCap: 0.10,
  critMul: 1.5,
  dmgVar: 0.16, agiVar: 0.12,   // 单次伤害与出手顺序的抖动，见 dmg()
  armorK: 0.6,            // 减伤分母系数
  dmgK: 4.8,              // 全局伤害系数：控制战斗时长，不影响双方强弱对比
  chaosResist: 0.25,      // 每次被混乱后抗性递增
  shieldDur: 3,

  startSilver: 500,
  startHeroes: ['shi_jin', 'zhu_wu'],
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
  /* 伤势。原来一场仗打完什么都不留下 —— 全员满血复活，输了重来一遍就是，
     于是难度形同虚设，一百单八将也只用得着最强的九个。
     现在阵亡的人要养伤，而且「只有没上阵的人才恢复」——想让主力缓过来，
     就得派别人去打。二梯队这才有了用处。 */
  hurtHeavyRest: 3,       // 阵亡 → 重伤，休养几场
  hurtLightRest: 2,       // 残血 → 轻伤，休养几场
  hurtLightAt: 0.25,      // 血线低于这个比例算轻伤
  hurtLightMul: 0.8,      // 带伤上阵的属性折扣
  hurtMinRoster: 4,       // 可用人手不足这个数时，重伤降级为轻伤（防开局卡死）
  cureHeavy: 2.5, cureLight: 1.0,   // 治疗价 = 系数 × 一级操练钱
  cureDoctor: 0.4,        // 安道全在册时打四折
  doctorId: 'an_daoquan',
  /* 升星原来只认「那个人自己的碎片」，而碎片只从重复角色来。
     摸底跑里三百七十抽打满全程，主力星级仍旧钉死在 2.7 ——
     你常用的恰恰是最稀有的那几个，重复概率趋近于零。
     兵符是通用碎片：首通给，任何人都能用，星级这才走得动。 */
  tokenBy: { normal: 0, side: 2, boss: 4, hidden: 6 },
  starCost: { 1: 2, 2: 4, 3: 8, 4: 16 },
  fragByQ: { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8, 6: 12 },

  recruitRate: { 1: 0.45, 2: 0.28, 3: 0.15, 4: 0.08, 5: 0.03, 6: 0.01 },
  recruitCost1: 500, recruitCost10: 4500,
  goldExchangeCost: 2,
  pityTen: 4,             // 十连保底 ≥名
  pityFifty: 5,           // 累计 50 抽保底 ≥天罡

  /* 演出节拍。一回合有十七到二十三件事，原来一股脑挤进一秒里，
     每件事分到 58 毫秒 —— 谁出的手、打的谁、死了没有，一样看不清。
     现在按「一拍」计时：一个人出一次手连着他造成的伤害算一拍，
     出了人命、暴击、群攻的拍子给更多停留时间。 */
  beatBase: 150,          // 一拍的基准毫秒
  roundMin: 900,          // 一回合最少占多久，免得三两下的回合一闪而过
  speeds: { slow: 1.6, normal: 1.0, fast: 0.26 },
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
const STAT_NAME = { atk: '武', def: '防', int: '智', agi: '捷', cha: '魅', hp: '血' };

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
              agi: e.agi || 0, cha: e.cha || 0, hp: e.hp || 0 },
      pct:  { atk: e.pct_atk || 0, def: e.pct_def || 0, hp: e.pct_hp || 0 },
      exclusive: e.exclusive || e.bond || null,
      ownerBonus: e.owner_bonus || null,
      otherBonus: e.other_bonus || null,
    };
  }

  const heroes = RAW.heroes, skills = RAW.skills, stages = RAW.stages;
  const bonds = RAW.bonds, items = RAW.items, dialogs = RAW.dialogs || {};
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
    exclusivePool: RAW.EXCLUSIVE_POOL || [],
  };
})();

/* ── 2  工具 ─────────────────────────────────────────────────────────── */

const rnd = () => Math.random();
const rndInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chance = p => rnd() < p;
const pick = a => a[Math.floor(rnd() * a.length)];
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const $ = id => document.getElementById(id);

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
        seenIntro: G.seenIntro, seenCh: G.seenCh, fold: G.fold,
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
};

/* ── 4  状态 ─────────────────────────────────────────────────────────── */

const G = {
  heroes: {}, items: {}, frags: {}, cleared: {}, team: [],
  res: { silver: 0, gold: 0, token: 0 }, log: [], clearCount: 0, pity: { ten: 0, fifty: 0 },
  speed: 'normal', seenIntro: false, seenCh: {}, fold: {},
};

/* 五位数的伤害飘在 46 像素宽的格子上没法看，过万折成「万」。
   战报和格子共用这一条，免得一边写「27万」一边写「93132」。 */
const num = v => v >= 10000 ? (v / 10000).toFixed(v >= 100000 ? 0 : 1) + '万' : String(Math.round(v));

const UI = { view: 'main', sel: null, stage: null, battle: null, playing: false,
  hsort: 'q', hfilt: 'all' };   // 群将谱当下的排法与筛法，只活在这一次会话里

function makeHero(hid) {
  const t = DB.hero(hid);
  if (!t) return null;
  return {
    hid, lv: 1, exp: 0, star: 1,
    hurt: { lv: 0, rest: 0 },
    base: { atk: t.atk, def: t.def, int: t.int, agi: t.agi, cha: t.cha, hp: t.hp },
    base0: { atk: t.atk, def: t.def, int: t.int, agi: t.agi, cha: t.cha, hp: t.hp },
    owned: (t.sk || []).slice(0, 1),
    equipment: { weapon: null, armor: null, helmet: null, mount: null, special: null },
  };
}

function initGame() {
  G.heroes = {}; G.items = {}; G.frags = {}; G.cleared = {}; G.team = [];
  G.res = { silver: CFG.startSilver, gold: 0, token: 0 };
  G.log = []; G.clearCount = 0; G.pity = { ten: 0, fifty: 0 }; G.speed = G.speed || 'normal';
  G.seenIntro = false; G.seenCh = {}; G.fold = G.fold || {};
  for (const hid of CFG.startHeroes) {
    const h = makeHero(hid);
    if (h) { G.heroes[hid] = h; G.team.push(hid); }
  }
}

/* ── 5  数值层 ───────────────────────────────────────────────────────── */
/* 全局唯一属性口径。任何地方要数值都来这里拿，包括战力和敌人。 */

const GROW_KEYS = ['atk', 'def', 'int', 'agi', 'cha', 'hp'];
const RARITY_GROW = { 6: 1.0, 5: 0.92, 4: 0.84, 3: 0.76, 2: 0.68, 1: 0.6 };

/** 单级成长增量。玩家升级与敌人构造共用同一实现，保证敌我同口径。 */
function growStep(t, base0, k) {
  const gr = t.gr || {};
  const g = k === 'hp' ? Math.min(0.06, (gr.hp != null ? gr.hp : 0.3) * 0.18)
                       : (gr[k] != null ? gr[k] : 0.028);
  return Math.max(1, Math.round((base0[k] || 10) * g * (RARITY_GROW[t.q] || 0.8)));
}

/** 把模板按等级累积成长，得到该等级的 base。带缓存。 */
const _grownCache = new Map();
function grownBase(hid, lv) {
  const key = hid + '@' + lv;
  const hit = _grownCache.get(key);
  if (hit) return hit;
  const t = DB.hero(hid);
  if (!t) return null;
  const b0 = { atk: t.atk, def: t.def, int: t.int, agi: t.agi, cha: t.cha, hp: t.hp };
  const b = Object.assign({}, b0);
  for (let i = 1; i < lv; i++) for (const k of GROW_KEYS) b[k] += growStep(t, b0, k);
  _grownCache.set(key, b);
  return b;
}

const Stats = {
  /** 羁绊加成（按队伍构成，返回各属性的百分比） */
  bond(hid, team) {
    const out = { atk: 0, def: 0, int: 0, agi: 0, cha: 0, hp: 0 };
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
    const flat = { atk: 0, def: 0, int: 0, agi: 0, cha: 0, hp: 0 };
    const pct = { atk: 0, def: 0, hp: 0 };
    let apt = false, exc = 0, list = [];
    for (const slot of SLOTS) {
      const e = DB.equip(h.equipment && h.equipment[slot]);
      if (!e) continue;
      list.push(e);
      for (const k in flat) flat[k] += e.flat[k] || 0;
      for (const k in pct) pct[k] += e.pct[k] || 0;
      if (e.weaponType && fav && e.weaponType === fav) apt = true;
      if (e.exclusive === hid) {
        const ob = e.ownerBonus || {};
        exc += ob.atk || 0.25;
      } else if (e.exclusive && e.otherBonus) {
        exc += 0;   // 非本人持专属：不给专属加成
      }
    }
    return { flat, pct, apt, exc, list };
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
    const lv = h.lv || 1, star = h.star || 1, q = t.q || 1;
    const gr = t.gr || {};
    const mult = (CFG.qmult[q] || 1) * (CFG.starMul[star] || 1) * (1 + (lv - 1) * CFG.lvGrow);

    const raw = {};
    for (const k of ['atk', 'def', 'int', 'agi', 'cha', 'hp']) {
      const b = (h.base && h.base[k]) || t[k] || 10;
      raw[k] = b * mult * (1 + (gr[k] || 0.02) * (lv - 1));
    }

    // 带伤上阵打折。放在这里而不是战斗里，战力显示才和实战一致。
    const hm = (h.hurt && h.hurt.lv === 1) ? CFG.hurtLightMul : 1;
    if (hm !== 1) for (const k of Object.keys(raw)) raw[k] *= hm;

    const g = this.gear(h, hid);
    const team = (opt && opt.team) || G.team;
    const bd = (opt && opt.noBond) ? { atk: 0, def: 0, int: 0, agi: 0, cha: 0, hp: 0 }
                                   : this.bond(hid, team);

    const out = {};
    for (const k of ['atk', 'def', 'int', 'agi', 'cha']) {
      let v = raw[k] + (g.flat[k] || 0);
      if (g.pct[k]) v *= 1 + clamp(g.pct[k], 0, CFG.cap.eqPct);
      if (k === 'atk') {
        if (g.apt) v *= 1 + CFG.favBonus;
        if (g.exc) v *= 1 + g.exc;
        v *= 1 + clamp(bd.atk, 0, CFG.cap.bondAtk);
      } else {
        v *= 1 + clamp(bd[k], 0, CFG.cap.bondOther);
      }
      out[k] = Math.max(1, Math.round(v));
    }
    let hp = raw.hp + (g.flat.hp || 0);
    if (g.pct.hp) hp *= 1 + clamp(g.pct.hp, 0, CFG.cap.eqPct);
    hp *= 1 + clamp(bd.hp, 0, CFG.cap.bondHp);
    out.maxHp = Math.max(1, Math.round(hp * CFG.hpMult));
    out.q = q; out.lv = lv; out.star = star;
    out.meta = { apt: g.apt, exc: g.exc, bond: bd, gear: g.list };
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
  calcEnemy(hid, lv, star, mul) {
    const base = grownBase(hid, lv);
    if (!base) return null;
    const s = this.calc(hid, { hero: { lv, star, base, equipment: {} }, noBond: true, team: [] });
    if (!s) return null;
    const m = mul || 1;
    if (m !== 1) {
      s.atk = Math.max(1, Math.round(s.atk * m));
      s.def = Math.max(1, Math.round(s.def * m));
      s.maxHp = Math.max(1, Math.round(s.maxHp * Math.pow(m, 0.5)));
    }
    return s;
  },

  /** 战力：从上面的输出派生，绝不另写公式 */
  power(s) {
    if (!s) return 0;
    return Math.round(s.atk * 2 + s.def * 1.5 + s.int * 1.2 + s.agi + s.maxHp * 0.05);
  },
  heroPower(hid) { return this.power(this.calc(hid)); },
  teamPower() { return G.team.reduce((a, h) => a + (h ? this.heroPower(h) : 0), 0); },
  stagePower(sid) {
    const st = DB.stage(sid);
    if (!st) return 0;
    const t = Battle.enemyTier(sid);
    return (st.enemies || []).reduce((a, e) => a + this.power(this.calcEnemy(e, t.lv, t.star, t.mul)), 0);
  },
};

/* ── 6  战斗 ─────────────────────────────────────────────────────────── */

const Battle = {
  /** 关卡敌方等级 / 星级 / 强度系数：优先读数据字段，没有则由推荐等级推导 */
  enemyTier(sid) {
    const st = DB.stage(sid) || {};
    const rl = st.rec_lv || [1, 5];
    const ch = st.ch || 1;
    return {
      lv: st.enemy_lv || Math.max(1, rl[1]),
      star: st.enemy_star || (ch > 20 ? 5 : ch > 10 ? 4 : ch > 3 ? 3 : 2),
      mul: st.enemy_mul != null ? st.enemy_mul : 1,
    };
  },

  unit(hid, stats, ally, idx) {
    const t = DB.hero(hid);
    const h = ally ? G.heroes[hid] : null;
    const sk = (ally ? (h.owned || []) : (t.sk || []).slice(0, Math.min(stats.star, 4)))
      .map(id => {
        const s = DB.skill(id);
        return s ? {
          id, name: s.name, type: s.type, desc: s.desc,
          cd: s.cd || 0, cur: 0, last: -99,
          mult: s.mult != null ? s.mult : 1,
          stat: s.stat || 'atk', value: s.value || 10, dur: s.dur || 2,
          chance: s.chance != null ? s.chance : 0.5, eff: s.eff || null,
        } : null;
      }).filter(Boolean);
    return {
      hid, name: t.name, ally, idx,
      row: Math.floor(idx / 3), col: idx % 3,
      atk: stats.atk, def: stats.def, int: stats.int, agi: stats.agi, cha: stats.cha,
      maxHp: stats.maxHp, hp: stats.maxHp,
      q: stats.q, lv: stats.lv, star: stats.star,
      skills: sk, skillMod: CFG.starSk[stats.star] || 1,
      shield: 0, shieldDur: 0, status: {}, chaosHit: 0, alive: true,
    };
  },

  /** 两边撞名时给战报加个标记。ch1_boss 里敌我都有史进、朱武，
   *  不标的话战报上就是「史进 → 史进 受创 120」，没法读。 */
  tagNames(b) {
    const cnt = {};
    for (const u of [...b.allies, ...b.foes]) cnt[u.name] = (cnt[u.name] || 0) + 1;
    const dupSide = {};
    for (const u of b.allies) dupSide[u.name] = (dupSide[u.name] || 0) + 1;
    for (const u of [...b.allies, ...b.foes]) {
      // 只有「两边都有这个名字」才标；同一边有两个同名不必标
      const both = dupSide[u.name] && b.foes.some(f => f.name === u.name);
      u.ln = both ? `${u.name}（${u.ally ? '我' : '敌'}）` : u.name;
    }
  },

  create(sid) {
    const st = DB.stage(sid);
    if (!st) return null;
    const tier = this.enemyTier(sid);
    const allies = G.team.filter(hid => hid && Hurt.able(hid))
      .map((hid, i) => { const s = Stats.calc(hid); return s ? this.unit(hid, s, true, i) : null; })
      .filter(Boolean);
    const foes = (st.enemies || [])
      .map((eid, i) => {
        const s = Stats.calcEnemy(eid, tier.lv, tier.star, tier.mul);
        return s ? this.unit(eid, s, false, i) : null;
      }).filter(Boolean);
    const b = { sid, stage: st, allies, foes, round: 0, over: false, win: null, log: [], events: [] };
    this.tagNames(b);
    return b;
  },

  /** 发一条事件，并记下此刻战报写到第几行 —— 播放时战报跟着画面走，
   *  而不是一回合结束后整段刷出来。一秒钟刷二十行，等于没写。 */
  ev(b, o) { o.li = b.log.length; b.events.push(o); return o; },

  side(b, u) { return u.ally ? b.allies : b.foes; },
  other(b, u) { return u.ally ? b.foes : b.allies; },
  living(list) { return list.filter(x => x.alive); },

  /** 有效属性：读 status.buff_* —— 这是 V9 版本里写了却没人读的那一块 */
  eff(u, k) {
    let v = u[k] || 0;
    const s = u.status['buff_' + k];
    if (s) v += s.val;
    return Math.max(1, Math.round(v));
  },

  /** 魅在战斗里的意思是气势：压得住场面，出手就更狠（暴击率）。
   *  有 17 个技能只动魅，若魅不入战，那些技能等于白写。*/
  critOf(u) {
    if (!u) return CFG.critRate;
    return CFG.critRate + Math.min(CFG.critChaCap, this.eff(u, 'cha') / CFG.critChaK);
  },

  /** 一次挥刀的结果不该每次都一样。没有这层抖动，九对九打二十回合，
   *  大数定律会把每一场抹成同一场：胜率对强度是一道断崖（1.00 → 0.00），
   *  中间那段「险胜」根本不存在，Boss 只有碾压和被碾压两种样子。*/
  dmg(atkV, defV, base, mod, critRate) {
    const armor = Math.max(defV * CFG.armorK, 1);
    let d = base * (atkV / (atkV + armor)) * mod * CFG.dmgK;
    d *= 1 + (Math.random() * 2 - 1) * CFG.dmgVar;
    let crit = false;
    if (chance(critRate == null ? CFG.critRate : critRate)) { d *= CFG.critMul; crit = true; }
    return { v: Math.max(1, Math.round(d)), crit };
  },

  /** 统一扣血出口：护盾在所有伤害路径生效 */
  hurt(b, tgt, amount, src, tag) {
    let left = amount, absorbed = 0;
    if (tgt.shield > 0) {
      absorbed = Math.min(tgt.shield, left);
      tgt.shield -= absorbed; left -= absorbed;
    }
    tgt.hp = Math.max(0, tgt.hp - left);
    if (absorbed) b.log.push({ c: 'sh', s: `${tgt.ln} 护盾挡下 ${num(absorbed)}` });
    if (left) b.log.push({ c: 'dm', s: `${src ? src.ln + ' → ' : ''}${tgt.ln} 受创 ${num(left)}` });
    this.ev(b, { k: 'dmg', t: tgt.idx, ally: tgt.ally, v: amount, absorbed, tag,
                 s: src ? src.idx : null, sa: src ? src.ally : null });
    if (tgt.hp <= 0 && tgt.alive) {
      tgt.alive = false;
      b.log.push({ c: 'dm', s: `${tgt.ln} 阵亡` });
      this.ev(b, { k: 'die', t: tgt.idx, ally: tgt.ally });
    }
    return left;
  },

  heal(b, tgt, amount, src) {
    const before = tgt.hp;
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + amount);
    const got = tgt.hp - before;
    if (got > 0) {
      b.log.push({ c: 'he', s: `${tgt.ln} 回复 ${num(got)}` });
      this.ev(b, { k: 'heal', t: tgt.idx, ally: tgt.ally, v: got,
                   s: src ? src.idx : null, sa: src ? src.ally : null });
    }
  },

  /** 集火对象：多半打最虚的那个，但不是铁律。
   *  全场一致地只打血最少的，等于每场都按同一套剧本走完 —— 胜负对强度就成了
   *  一道断崖，中间那段「险胜」不存在。让集火带点偏差，战局才有分叉。*/
  /** 前排挡在前面：单体攻击先找活人最靠前的那一排，那一排清空了才轮到下一排。
   *  这样九宫格才真的是「阵」——把肉的放第一排，谋士放后面，位置开始有意义。
   *  群攻（整排、整列、全体）不受这条约束，本来就是照着面打的。 */
  front(foes) {
    if (!foes.length) return foes;
    const r = Math.min(...foes.map(x => x.row));
    return foes.filter(x => x.row === r);
  },

  focus(pool) {
    const s = pool.slice().sort((a, c) => a.hp - c.hp);
    if (s.length < 2 || Math.random() < 0.62) return s[0];
    return s[1 + Math.floor(Math.random() * (s.length - 1))];
  },

  /** 目标选择：一律按 skill.type，不看技能名 */
  targets(b, u, sk) {
    const foes = this.living(this.other(b, u));
    const mates = this.living(this.side(b, u));
    switch (sk.type) {
      case 'atk_all':  return foes;
      case 'atk_row':  { const r = foes.filter(x => x.row === u.row); return r.length ? r : foes.slice(0, 3); }
      case 'atk_col':  { const c = foes.filter(x => x.col === u.col); return c.length ? c : foes.slice(0, 1); }
      case 'atk_single': {
        const line = this.front(foes);                  // 先锁最前面那一排
        const same = line.filter(x => x.col === u.col); // 排内优先打正对面
        const pool = same.length ? same : line;
        return pool.length ? [this.focus(pool)] : [];
      }
      case 'heal_all':  return mates;
      case 'heal_self': return [u];
      case 'heal_one': {
        const hurt = mates.slice().sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp);
        return hurt.length ? [hurt[0]] : [];
      }
      case 'shld_self': return [u];
      case 'shld_all':  return mates;
      case 'shld_col':  return mates.filter(x => x.col === u.col);
      case 'buff_all':  return mates;
      case 'chaos':     return foes.length ? [foes.slice().sort((a, c) => c.int - a.int)[0]] : [];
      case 'steal':     return foes.length ? [foes.slice().sort((a, c) => c[sk.stat] - a[sk.stat])[0]] : [];
      default:          return foes.length ? [foes[0]] : [];
    }
  },

  cast(b, u, sk, tgts) {
    const mod = u.skillMod;
    b.log.push({ c: 'sk', s: `${u.ln} · ${sk.name}` });
    this.ev(b, { k: 'cast', t: u.idx, ally: u.ally, name: sk.name });

    if (sk.type.startsWith('atk')) {
      for (const t of tgts) {
        if (!t.alive) continue;
        const d = this.dmg(this.eff(u, 'atk'), this.eff(t, 'def'),
                           this.eff(u, 'atk') * sk.mult, mod, this.critOf(u));
        this.hurt(b, t, d.v, u, d.crit ? 'crit' : '');
        if (sk.eff && t.alive && chance(sk.eff.chance || 0)) this.applyEff(b, t, sk.eff, d.v);
      }
    } else if (sk.type.startsWith('heal')) {
      for (const t of tgts) if (t.alive) this.heal(b, t, Math.round(this.eff(u, 'int') * sk.mult * mod), u);
    } else if (sk.type.startsWith('shld')) {
      for (const t of tgts) {
        if (!t.alive) continue;
        t.shield += Math.round(t.maxHp * sk.mult * mod);
        t.shieldDur = CFG.shieldDur;
        b.log.push({ c: 'sh', s: `${t.ln} 护盾 +${Math.round(t.maxHp * sk.mult * mod)}` });
      }
    } else if (sk.type === 'buff_all') {
      for (const t of tgts) {
        if (!t.alive) continue;
        // maxHp 不经 eff() 读，写成 buff_hp 等于白写 —— 改成当场回血
        if (sk.stat === 'hp') { this.heal(b, t, Math.round(t.maxHp * (sk.value / 100) * mod), u); continue; }
        const add = Math.round((t[sk.stat] || 10) * (sk.value / 100) * mod);
        const cur = t.status['buff_' + sk.stat];
        t.status['buff_' + sk.stat] = { dur: sk.dur, val: Math.max(add, cur ? cur.val : -Infinity) };
        b.log.push({ c: 'sk', s: `${t.ln} ${STAT_NAME[sk.stat] || sk.stat}+${add}（${sk.dur}回合）` });
      }
    } else if (sk.type === 'steal') {
      for (const t of tgts) {
        if (!t.alive) continue;
        if (sk.stat === 'hp') {                       // 夺血：从对面抽，补给自己
          const drain = Math.round(t.maxHp * (sk.value / 100) * mod);
          const real = this.hurt(b, t, drain, u, 'drain');
          this.heal(b, u, real, u); continue;
        }
        const v = Math.round((t[sk.stat] || 10) * (sk.value / 100) * mod);
        t.status['buff_' + sk.stat] = { dur: sk.dur, val: -v };
        u.status['buff_' + sk.stat] = { dur: sk.dur, val: (u.status['buff_' + sk.stat]?.val || 0) + v };
        b.log.push({ c: 'sk', s: `${u.ln} 夺 ${t.ln} ${STAT_NAME[sk.stat] || sk.stat} ${v}` });
      }
    } else if (sk.type === 'chaos') {
      for (const t of tgts) {
        if (!t.alive) continue;
        const p = sk.chance * Math.pow(1 - CFG.chaosResist, t.chaosHit);
        if (chance(p)) {
          t.status.chaos = { dur: 1, val: 0 }; t.chaosHit++;
          b.log.push({ c: 'sk', s: `${t.ln} 陷入混乱` });
        } else {
          b.log.push({ c: 'in', s: `${t.ln} 稳住了心神` });
        }
      }
    }
  },

  applyEff(b, t, eff, dmgV) {
    if (eff.type === 'stun') { t.status.stun = { dur: 1, val: 0 }; b.log.push({ c: 'in', s: `${t.ln} 眩晕` }); }
    else if (eff.type === 'bleed') { t.status.bleed = { dur: 2, val: Math.round(dmgV * 0.3) }; b.log.push({ c: 'in', s: `${t.ln} 流血` }); }
    else if (eff.type === 'burn') { t.status.burn = { dur: 2, val: Math.round(dmgV * 0.25) }; b.log.push({ c: 'in', s: `${t.ln} 灼烧` }); }
    else if (eff.type === 'poison') { t.status.poison = { dur: 3, val: Math.round(dmgV * 0.2) }; b.log.push({ c: 'in', s: `${t.ln} 中毒` }); }
  },

  basic(b, u) {
    const foes = this.living(this.other(b, u));
    if (!foes.length) return;
    const line = this.front(foes);
    const same = line.filter(x => x.col === u.col);
    const t = this.focus(same.length ? same : line);
    const d = this.dmg(this.eff(u, 'atk'), this.eff(t, 'def'), this.eff(u, 'atk'), 1, this.critOf(u));
    this.hurt(b, t, d.v, u, d.crit ? 'crit' : '');
  },

  chaosAct(b, u) {
    const mates = this.living(this.side(b, u)).filter(x => x !== u);
    b.log.push({ c: 'in', s: `${u.ln} 混乱，向自己人挥刀` });
    if (!mates.length) return;
    const t = pick(mates);
    const d = this.dmg(this.eff(u, 'atk'), this.eff(t, 'def'), this.eff(u, 'atk') * 0.8, 1, this.critOf(u));
    this.hurt(b, t, d.v, u, '');
  },

  /** DoT 与状态倒计时。stun / chaos 在行动阶段消费，这里只负责递减 */
  tick(b, u) {
    for (const k of Object.keys(u.status)) {
      const s = u.status[k];
      if (k === 'bleed' || k === 'burn' || k === 'poison') this.hurt(b, u, s.val, null, k);
      s.dur--;
      if (s.dur <= 0) delete u.status[k];
    }
    if (u.shieldDur > 0 && --u.shieldDur === 0 && u.shield > 0) {
      u.shield = 0;
      b.log.push({ c: 'in', s: `${u.ln} 护盾消散` });
    }
  },

  pickSkill(u, b) {
    const ready = u.skills.filter(s => s.cur === 0);
    if (!ready.length) return null;
    // 轮换：取最久未用的；同样久则随机，避免永远第一个
    const oldest = Math.min(...ready.map(s => s.last));
    const cand = ready.filter(s => s.last === oldest);
    const sk = pick(cand);
    return this.targets(b, u, sk).length ? sk : null;
  },

  /** 跑一个回合，返回本回合的事件序列供演出 */
  runRound(b) {
    if (b.over) return null;
    b.round++;
    b.log.push({ c: 'r', s: `第 ${b.round} 回合` });
    b.events = [{ k: 'round', n: b.round, li: b.log.length }];

    // 出手顺序同样带抖动：捷高的仍然多半先动，但不再是铁打的名次
    const order = [...b.allies, ...b.foes].filter(u => u.alive)
      .map(u => ({ u, k: this.eff(u, 'agi') * (1 + (Math.random() * 2 - 1) * CFG.agiVar) }))
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
          this.cast(b, u, sk, this.targets(b, u, sk));
          sk.cur = sk.cd; sk.last = b.round;
        } else {
          this.basic(b, u);
        }
      }
      if (this.checkEnd(b)) break;
    }

    // 冷却在回合末统一递减（不是行动后立刻，否则 cd:1 等于 cd:0）
    if (!b.over) {
      for (const u of [...b.allies, ...b.foes]) for (const s of u.skills) if (s.cur > 0) s.cur--;
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

  /** 一次性算完（模拟与快进用） */
  runAll(b) { while (!b.over) this.runRound(b); return b; },
};

/* ── 7  养成 ─────────────────────────────────────────────────────────── */

const Grow = {
  /** 督练的天花板：打到哪儿，才练得到哪儿。
   *  银子原来可以无限往操练里填，于是招兵买马那一头永远没余钱；
   *  而且谁钱多谁就能把等级堆过头，把关卡难度直接抹平。
   *  设定上也讲得通 —— 本事是打出来的，钱只能把该有的阅历补齐，补不出没打过的仗。 */
  drillCap() {
    let top = 5;
    for (const sid of DB.stageIds()) {
      if (!G.cleared[sid]) continue;
      const rl = DB.stage(sid).rec_lv;
      if (rl && rl[1] > top) top = rl[1];
    }
    return Math.min(CFG.maxLv, top + CFG.drillAhead);
  },

  /** 督练一级要花多少银两：只补还差的那点经验，快满时便宜。
   *  已经顶到天花板的返回 0，按钮那边据此显示「练不动了」 */
  drillCost(hid) {
    const h = G.heroes[hid];
    if (!h || h.lv >= CFG.maxLv) return 0;
    if (h.lv >= this.drillCap()) return 0;
    const gap = Math.max(1, CFG.expNeed(h.lv) - h.exp);
    return Math.ceil(gap * CFG.drillPrice(h.lv));
  },

  /** 花银两补经验，升级路径与打关卡拿经验完全相同 */
  levelUp(hid) {
    const h = G.heroes[hid];
    if (!h) return '没有这个人';
    if (h.lv >= CFG.maxLv) return '已满级';
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
    const cap = Math.min(CFG.maxLv, this.drillCap(), stopAt || CFG.maxLv);
    if (h.lv >= cap) return { n: 0, spent: 0, why: '已到' + (stopAt ? stopAt + ' 级' : '满级') };
    const lv0 = h.lv, silver0 = G.res.silver;
    let why = '';
    // 上限兜底：真有人把银子堆到几百万，也不至于在这儿转到天荒地老
    for (let guard = 0; guard < 4000; guard++) {
      if (h.lv >= cap) { why = cap >= CFG.maxLv ? '满级了' : `到头了，督练最多到 ${cap} 级`; break; }
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
    while (h.lv + n < CFG.maxLv && h.exp >= CFG.expNeed(h.lv + n)) { h.exp -= CFG.expNeed(h.lv + n); n++; }
    if (n) { this.applyGrowth(h, n); h.lv += n; }
    if (h.lv >= CFG.maxLv) h.exp = 0;
    return n;
  },

  /** 升级只累加 base，战斗数值由 Stats.calc 统一算 —— 与敌人共用 growStep */
  applyGrowth(h, steps) {
    const t = DB.hero(h.hid) || {};
    for (let i = 0; i < steps; i++)
      for (const k of GROW_KEYS) h.base[k] += growStep(t, h.base0, k);
  },

  addExp(amount) {
    const up = [];
    for (const hid of G.team) {
      const h = G.heroes[hid];
      if (!h) continue;
      if (this.gainExp(h, amount)) up.push(`${DB.hero(hid).name} 升至 ${h.lv} 级`);
    }
    return up;
  },

  /** 升星先耗本人碎片，不够的部分用兵符顶 */
  starUp(hid) {
    const h = G.heroes[hid];
    if (!h) return '没有这个人';
    if (h.star >= CFG.maxStar) return '已满星';
    const cost = CFG.starCost[h.star] || 99;
    const own = G.frags[hid] || 0;
    const need = Math.max(0, cost - own);
    if (need > G.res.token)
      return `需 ${cost}：现有碎片 ${own}、兵符 ${G.res.token}`;
    G.frags[hid] = own - Math.min(own, cost);
    G.res.token -= need;
    h.star++;
    const all = DB.hero(hid).sk || [];
    const locked = all.filter(s => !h.owned.includes(s));
    if (locked.length) h.owned.push(locked[0]);
    Save.write();
    return null;
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
    return clamp(Math.round(avg) - 2, 1, CFG.maxLv);
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
    return { got: false, hid, frag: n };
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
  rollOne(floorQ) {
    let q;
    if (floorQ) {
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
    const hid = this.rollOne(CFG.pityFifty);
    const r = { ...this.gainHero(hid), q: DB.hero(hid).q };
    Save.write();
    return { list: [r] };
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
    // 超出的名额从战力最高的人开始减免 —— 主力留着能用，玩家才转得动
    let spare = Math.max(0, floor - ableAfterAll);
    const relief = new Set(dead.slice()
      .sort((x, y) => Stats.heroPower(y.hid) - Stats.heroPower(x.hid))
      .slice(0, spare).map(u => u.hid));

    for (const u of b.allies) {
      const h = G.heroes[u.hid];
      if (!h) continue;
      let lv = 0, rest = 0;
      if (!u.alive) {
        const soft = relief.has(u.hid);
        lv = soft ? 1 : 2;
        rest = soft ? CFG.hurtLightRest : CFG.hurtHeavyRest;
      } else if (u.hp / u.maxHp < CFG.hurtLightAt) { lv = 1; rest = CFG.hurtLightRest; }
      if (!lv) continue;
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
    return Math.max(10, Math.round(base * k * doc));
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

    if (!Object.keys(G.cleared).length)
      return { txt: '先打第一关：史家村学艺', sub: '两个人也够用，照着打就是', act: 'stage', id: nextStage };

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

    // 兵符够升星
    for (const hid of G.team) {
      const h = G.heroes[hid];
      if (h.star >= CFG.maxStar) continue;
      const need = CFG.starCost[h.star] || 99;
      if ((G.frags[hid] || 0) + G.res.token >= need)
        return { txt: `${DB.hero(hid).name} 可以升星`, sub: '升一星多一个技能', act: 'hero', id: hid };
    }

    // 钱多到可以十连
    if (G.res.silver >= CFG.recruitCost10 + CFG.recruitCost1)
      return { txt: '银两够十连了', sub: '去酒肆招兵买马', act: 'go', id: 'tavern' };

    if (st) return { txt: `下一关：${st.name}`, sub: `第${st.ch}章 · 推荐 ${(st.rec_lv || [1, 5])[1]} 级 · 敌 ${(st.enemies || []).length} 人`, act: 'stage', id: nextStage };
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
      return `须先通「${r ? r.name : req}」`;
    }
    const line = this.mainLine(st.ch || 1);
    const i = line.indexOf(sid);
    if (i > 0) { const p = DB.stage(line[i - 1]); return `须先通「${p ? p.name : ''}」`; }
    return '尚未解锁';
  },

  /** 按槽位与品质区间摇一件装备。该档没货就往下找，绝世的甲与盔本来就没有。 */
  rollEquip(slot, qmax, qmin) {
    const sl = slot === 'helm' ? 'helmet' : (slot || pick(SLOTS));
    for (let lo = qmin; lo >= 1; lo--) {
      const cand = DB.equipIds().filter(k => {
        const e = DB.equip(k);
        return e && e.slot === sl && e.q <= qmax && e.q >= lo && !e.exclusive;
      });
      if (cand.length) return pick(cand);
    }
    return null;
  },

  /** 章节对应的装备品质上限，与 rebalance_growth.py 里的 cap_by_ch 保持一致 */
  qCap(ch) { return ch <= 4 ? 2 : ch <= 9 ? 3 : ch <= 15 ? 4 : ch <= 23 ? 5 : 6; },

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
      this.woundReport(b, out);   // 输了更该挂彩
      Save.write();
      return out;
    }

    const first = !G.cleared[sid];
    G.cleared[sid] = true;
    G.clearCount++;

    // 经验与银两都随推荐等级走：第 30 章一关的收成不该和第 1 章一样
    const L = L0, kind = this.kindOf(sid);
    const exp = CFG.stageExp(L);
    const ups = Grow.addExp(exp);
    out.push({ icon: '经', text: `经验 +${exp}`, c: 'he' });
    ups.forEach(t => out.push({ icon: '升', text: t, c: 'sk' }));

    const silver = CFG.stageSilver(L);
    G.res.silver += silver;
    out.push({ icon: '银', text: `银两 +${silver}`, c: '' });

    if (chance(0.05)) { G.res.gold += 1; out.push({ icon: '金', text: '黄金 +1', c: 'sk' }); }

    for (const d of (st.drops || [])) {
      if (!chance(d.rate || 0)) continue;
      if (d.t === 'hero' && d.id) {
        const r = Grow.gainHero(d.id);
        if (r) out.push({ icon: '将', text: r.got ? `${DB.hero(d.id).name} 入伙（${r.lv} 级）` : `${DB.hero(d.id).name} 碎片 +${r.frag}`, c: 'sk' });
      } else if (d.t === 'equip') {
        const eid = this.rollEquip(d.slot, d.qmax || 6, d.qmin || 1);
        if (eid) {
          G.items['eq_' + eid] = (G.items['eq_' + eid] || 0) + 1;
          out.push({ icon: '器', text: `获 ${DB.equip(eid).name}`, c: '' });
        }
      } else if (d.t === 'con' && d.id) {
        G.items[d.id] = (G.items[d.id] || 0) + (d.v || 1);
        const it = DB.item(d.id);
        out.push({ icon: '物', text: `获 ${it ? it.name : d.id}`, c: '' });
      }
    }

    if (first) {
      const fr = st.first_reward || {};
      const fs = CFG.firstSilver(L, kind);
      G.res.silver += fs;
      out.push({ icon: '首', text: `首通 银两 +${fs}`, c: 'sk' });
      const fe = CFG.firstExp(L, kind);
      Grow.addExp(fe).forEach(t => out.push({ icon: '升', text: t, c: 'sk' }));
      out.push({ icon: '首', text: `首通 经验 +${fe}`, c: 'sk' });
      // 首通必得一件装备。原来装备只靠 10–20% 的掉落，打到第九章还是赤手空拳，
      // 而难度是按「每格都有本章档次的装备」调的。
      const tk = CFG.tokenBy[kind] || 1;
      G.res.token += tk;
      out.push({ icon: '符', text: `首通 兵符 +${tk}`, c: 'sk' });
      const cap = this.qCap(st.ch || 1);
      const fe2 = this.rollEquip(null, cap, Math.max(1, cap - 1));
      if (fe2) {
        G.items['eq_' + fe2] = (G.items['eq_' + fe2] || 0) + 1;
        out.push({ icon: '首', text: `首通 获 ${DB.equip(fe2).name}`, c: 'sk' });
      }
      if (fr.hero && DB.hero(fr.hero)) {
        const r = Grow.gainHero(fr.hero);
        out.push({ icon: '首', text: r.got ? `首通 ${DB.hero(fr.hero).name} 入伙（${r.lv} 级）` : `首通 ${DB.hero(fr.hero).name} 碎片 +${r.frag}`, c: 'sk' });
      }
    }

    this.woundReport(b, out);
    G.log = [...out.slice(0, 3).map(o => o.text), ...G.log].slice(0, 20);
    Save.write();
    return out;
  },
};
