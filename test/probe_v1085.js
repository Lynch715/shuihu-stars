/* V10.8.5 审计修复 · 探针：存档整理、坏档启动、回合链、宿星重掷、伤势、施术者倒下
 *   node probe_v1085.js <游戏html路径>   */
const { chromium } = require('playwright');
const path = require('path');
const FILE = process.argv[2];
if (!FILE) { console.error("用法: node probe_v1085.js <游戏html路径>"); process.exit(2); }
const URL = "file://" + path.resolve(FILE);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext();
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.waitForTimeout(300);

  // 0. 正常存档过一遍 sanitize 不走样
  const same = await pg.evaluate(() => {
    initGame('classic'); G.seenIntro = true; G.res.silver = 5e6;
    for (let i = 0; i < 6; i++) Grow.recruit(10);
    Grow.autoTeam();
    for (const sid of DB.stageIds().slice(0, 12)) { const b = Battle.create(sid); Battle.runAll(b); Stages.settle(b); }
    for (const h of Object.keys(G.heroes).slice(0, 5)) Grow.levelUp(h);
    Save.write();
    const raw = localStorage.getItem(CFG.saveKey);
    const d = JSON.parse(raw); const e = Save.sanitize(d);
    const a = JSON.parse(raw);
    // 比较：sanitize 后除了补上的默认字段，其余一致
    const diffs = [];
    for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(d[k])) diffs.push(k);
    return { e, diffs, n: Object.keys(G.heroes).length, cleared: Object.keys(G.cleared).length };
  });
  ok(!same.e && same.diffs.length === 0, `真实存档（${same.n} 将、通关 ${same.cleared}）整理前后逐字一致 ${JSON.stringify(same.diffs)}`);

  // 1. Guide.next 走到最后一支不再抛错
  const g = await pg.evaluate(() => {
    try {
      G.res.silver = 0;
      // 反复取，直到走到「下一关」那支；造一个满足条件的局面：把所有人升到推荐级以上不现实，直接看函数源里不再有 sid
      const r = Guide.next(); render();
      return { ok: true, src: /roster\(sid\)/.test(Guide.next.toString()), r };
    } catch (e) { return { ok: false, e: e.message }; }
  });
  ok(g.ok && !g.src, 'Guide.next 不再引用未定义的 sid，主界面可渲染 ' + JSON.stringify(g.r || g.e).slice(0, 80));

  // 2. 恶意 / 坏存档导入
  const cases = await pg.evaluate(async () => {
    const good = JSON.parse(localStorage.getItem(CFG.saveKey));
    const out = {};
    const hid = Object.keys(good.heroes)[0];
    const mk = f => { const d = JSON.parse(JSON.stringify(good)); f(d); return JSON.stringify(d); };
    const X = '<img src=x onerror="window.__pwn=1">';
    const t = {
      xss: mk(d => { d.res.gold = X; d.res.silver = X; d.res.token = X; d.heroes[hid].lv = X; d.items.exp1 = X; d.log = [X]; }),
      nullHero: mk(d => { d.heroes.song_jiang = null; }),
      lvAbc: mk(d => { d.heroes[hid].lv = 'abc'; }),
      silverStr: mk(d => { d.res.silver = '100'; }),
      noBase: mk(d => { delete d.heroes[hid].base; }),
      proto: '{"v":10,"heroes":{"__proto__":{"lv":1}},"team":["__proto__"]}',
      proto2: mk(d => { d.team.push('__proto__', 'constructor'); d.heroes = Object.assign(JSON.parse('{"__proto__":{"x":1},"constructor":{"lv":3}}'), d.heroes); }),
      unknown: mk(d => { d.heroes.nobody = { hid: 'nobody', lv: 3 }; d.team.push('nobody'); }),
    };
    for (const [k, v] of Object.entries(t)) {
      const r = await Save.parseCode(v);
      out[k] = r.err ? { err: r.err } : { d: r.d };
    }
    return { out, hid };
  });
  const o = cases.out, hid = cases.hid;
  ok(o.xss.d && o.xss.d.res.gold === 0 && o.xss.d.heroes[hid].lv === 1 && !o.xss.d.items.exp1, 'XSS 字段被洗成数字');
  ok(o.nullHero.d && !('song_jiang' in o.nullHero.d.heroes) || o.nullHero.err, 'null 英雄被丢掉');
  ok(o.lvAbc.d && o.lvAbc.d.heroes[hid].lv === 1, 'lv:"abc" → 1');
  ok(o.silverStr.d && o.silverStr.d.res.silver === 100, 'silver:"100" → 100（数字）');
  ok(o.noBase.d && o.noBase.d.heroes[hid].base && typeof o.noBase.d.heroes[hid].base.atk === 'number', '缺 base 的按等级补上');
  ok(!!o.proto.err, '__proto__ 存档拒收：' + o.proto.err);
  ok(o.proto2.d && !o.proto2.d.team.includes('__proto__') && !o.proto2.d.team.includes('constructor'), '阵容里的 __proto__/constructor 被剔掉');
  ok(o.unknown.d && !o.unknown.d.heroes.nobody && !o.unknown.d.team.includes('nobody'), '不认识的人被丢掉');

  // 2b. 把 XSS 存档真的导入 + 刷新：不执行脚本、能进主界面
  await pg.evaluate(async () => {
    const good = JSON.parse(localStorage.getItem(CFG.saveKey));
    const X = '<img src=x onerror="window.__pwn=1">';
    good.res.gold = X; good.heroes[Object.keys(good.heroes)[0]].lv = X;
    const r = await Save.parseCode(JSON.stringify(good));
    Save.importRaw(r.raw);
  });
  await pg.reload(); await pg.waitForTimeout(500);
  let st = await pg.evaluate(() => ({ pwn: window.__pwn, view: UI.view, top: $('res').innerText, len: document.body.innerText.length }));
  ok(!st.pwn && st.len > 50, `导入恶意存档后刷新：脚本未执行，页面正常（${st.view}）`);

  // 2c. 本地存储里直接塞坏档（绕过导入，模拟老版本导入的坏档）：不白屏
  await pg.evaluate(() => {
    Save.locked = true;   // 别让刷新前的 beforeunload 把塞进去的坏档盖掉
    const d = JSON.parse(localStorage.getItem(CFG.saveKey));
    d.heroes[Object.keys(d.heroes)[0]] = null; d.res.gold = '<img src=x onerror="window.__pwn=2">';
    localStorage.setItem(CFG.saveKey, JSON.stringify(d));
  });
  await pg.reload(); await pg.waitForTimeout(500);
  st = await pg.evaluate(() => ({ pwn: window.__pwn, view: UI.view, len: document.body.innerText.length, gold: G.res.gold }));
  ok(!st.pwn && st.len > 50 && st.gold === 0, `本地坏档启动不白屏、不执行脚本（${st.view}）`);
  // 2d. 整理不了的坏档：另存 _bad、不白屏
  await pg.evaluate(() => { Save.locked = true; localStorage.setItem(CFG.saveKey, '{"v":10,"heroes":{"__proto__":{}},"team":[]}'); });
  await pg.reload(); await pg.waitForTimeout(500);
  st = await pg.evaluate(() => ({ view: UI.view, bad: !!localStorage.getItem(CFG.saveKey + '_bad'), len: document.body.innerText.length }));
  ok(st.view === 'mode' && st.bad && st.len > 20, '整理不了的坏档：另存一份，进选模式页');

  // 3. 调速连点不叠回合链
  await pg.evaluate(() => { Save.locked = true; localStorage.clear(); });
  await pg.reload(); await pg.waitForTimeout(300);
  const spd = await pg.evaluate(async () => {
    initGame('classic'); G.seenIntro = true; G.giftShown = true; Save.write();
    const orig = Battle.runRound.bind(Battle); let n = 0;
    Battle.runRound = b => { n++; const ev = orig(b); b.over = false; if (b.round > 25) b.round = 5; return ev; };
    G.speed = 'normal';
    Play.start('ch1_1');
    await new Promise(r => setTimeout(r, 3000)); const n1 = n; n = 0;
    for (let i = 0; i < 5; i++) { document.querySelector('[data-action="speed"][data-id="normal"]').click(); await new Promise(r => setTimeout(r, 50)); }
    await new Promise(r => setTimeout(r, 3000)); const n2 = n;
    Battle.runRound = orig; UI.battle.over = true; Play.finish();
    return { n1, n2 };
  });
  ok(spd.n2 <= spd.n1 + 2, `连点 5 次调速后回合频率不翻倍（3 秒 ${spd.n1} → ${spd.n2} 回合）`);

  // 4. 打一半离开再开新仗：旧仗结算、新仗单链
  const re = await pg.evaluate(async () => {
    G.speed = 'fast'; UI.battle = null;
    Play.start('ch1_1'); const b1 = UI.battle;
    await new Promise(r => setTimeout(r, 400));
    go('stages');
    Play.start('ch1_1'); const b2 = UI.battle;
    const orig = Battle.runRound.bind(Battle); let n = 0, wrong = 0;
    Battle.runRound = b => { n++; if (b !== UI.battle) wrong++; return orig(b); };
    await new Promise(r => setTimeout(r, 3000));
    Battle.runRound = orig;
    return { s1: b1.settled, over1: b1.over, n, wrong, same: b1 === b2 };
  });
  ok(re.s1 && re.over1 && !re.same && re.wrong === 0, `旧仗已结算（settled=${re.s1}），新仗 3 秒 ${re.n} 回合，推错仗 ${re.wrong} 次`);

  // 5. 宿星重掷记录刷新后还在
  const f1 = await pg.evaluate(() => {
    G.lap = 2; Fate.roll(); G.res.token = 999;
    const id = G.fates[0]; const e = Fate.reroll(id);
    return { e, got: G.fates[0] };
  });
  await pg.reload(); await pg.waitForTimeout(400);
  const f2 = await pg.evaluate(got => ({ e: Fate.reroll(got), rr: G.fateRerolled }), f1.got);
  ok(!f1.e && f2.e === '这颗已经换过一次了', `刷新后同一颗不能再换：${f2.e}`);

  // 6. 伤势：手上不满九人时新伤不当场减
  const hu = await pg.evaluate(() => {
    initGame('classic'); G.seenIntro = true;
    const b = Battle.create('ch1_1'); Battle.runAll(b);
    const u = b.allies[0]; u.alive = false; u.hp = 0;
    const r = Hurt.settle(b);
    return { out: JSON.stringify(r).slice(0, 300), rest: G.heroes[u.hid].hurt };
  });
  ok(hu.rest.rest >= 2, `新伤休养场数不被当场减掉：${JSON.stringify(hu.rest)}`);

  // 7. 施术者被反击打死后技能中断
  const cc = await pg.evaluate(() => {
    const b = Battle.create('ch1_1');
    const u = b.allies[0];
    const sk = { name: '测', cat: 'active', fx: [{ k: 'dmg', tg: 'all', mult: 1 }, { k: 'buff', tg: 'self', stat: 'atk', pct: 0.5, dur: 2 }] };
    const hp0 = b.foes.map(f => f.hp);
    const origHurt = Battle.hurt.bind(Battle); let calls = 0;
    Battle.hurt = function (bb, t, v, src, tag, kind) { const r = origHurt(bb, t, v, src, tag, kind); if (kind === 'skill' && ++calls === 1) { u.hp = 0; u.alive = false; } return r; };
    const atk0 = u.atk; Battle.cast(b, u, sk); Battle.hurt = origHurt;
    return { calls, buffed: JSON.stringify(u.buffs || u.status || {}).includes('atk') && u.atk !== atk0 };
  });
  ok(cc.calls === 1, `施术者倒下后群攻只打到第一个人（打了 ${cc.calls} 人）`);

  // 7b. 先驱散再打同一人的技能，后半截要打得出去
  const dp = await pg.evaluate(() => {
    const out = {};
    for (const [hid, sid] of [['liu_huiniang', 'v6_liu_huiniang_1'], ['zhu_wu', 'zw4'], ['li_ruoshui', 'v6_li_ruoshui_4']]) {
      if (!DB.hero(hid) || !DB.skill(sid)) { out[sid] = 'skip'; continue; }
      initGame('classic'); G.heroes = {}; G.team = [];
      G.heroes[hid] = makeHero(hid); G.team.push(hid);
      const b = Battle.create('ch1_1'); const u = b.allies[0];
      const hp0 = b.foes.reduce((x, f) => x + f.hp + f.shield, 0);
      Battle.cast(b, u, DB.skill(sid));
      out[sid] = hp0 - b.foes.reduce((x, f) => x + f.hp + f.shield, 0);
    }
    return out;
  });
  ok(Object.values(dp).every(v => v === 'skip' || v > 0), '驱散后的伤害打得出去 ' + JSON.stringify(dp));

  // 8. 渲染一圈主要页面不报错
  await pg.evaluate(() => { initGame('chaos'); G.seenIntro = true; G.giftShown = true; G.res.silver = 1e6; Grow.recruit(10); for (const v of ['main','heroes','stages','tavern','bag','codex','team']) { try { go(v); } catch (e) {} } UI.hsort = 'power'; go('heroes'); UI.hsort = 'atk'; render(); UI.hsort = 'int'; render(); });
  ok(errs.length === 0, '全程无页面报错 ' + JSON.stringify(errs).slice(0, 300));

  console.log(`\n通过 ${pass}　失败 ${fail}`);
  await br.close();
  process.exit(fail ? 1 : 0);
})();
