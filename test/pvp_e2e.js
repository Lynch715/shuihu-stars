const { chromium } = require('playwright');
// 用法：python3 -m http.server 8765 后 node test/pvp_e2e.js（需 npm i playwright）
const URL = process.env.URL || 'http://127.0.0.1:8765/index.html';
const errors = [];
let checks = 0;
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); checks++; console.log('✓ ' + m); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) { if (!/404/.test(m.text())) errors.push(m.type() + ': ' + m.text()); }; });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(URL); await page.waitForTimeout(800);

  // 造一份存档：九个满级满星将领 + 一份旧结构的 PVP 战绩（展开快照）+ 旧 UUID 身份
  const legacy = await page.evaluate(async () => {
    initGame('classic'); G.heroes = {};
    G.team = DB.recruitPool.slice().sort((a, b) => DB.hero(b).q - DB.hero(a).q).slice(0, 9);
    for (const id of G.team) { const h = makeHero(id); h.lv = 70; h.star = 7; h.base = JSON.parse(JSON.stringify(grownBase(id, 70))); h.owned = DB.hero(id).sk.slice(0, 4); G.heroes[id] = h; }
    const w = DB.equipIds().find(id => DB.equip(id).slot === 'weapon'); G.items['eq_' + w] = 3;
    G.lap = 3; G.seenIntro = true; G.giftShown = true; G.seenCh = {}; G.fold = {};
    PVP.init(); G.pvp.owner = '8d6f2c1a-3b4e-4f5a-9c7d-0e1f2a3b4c5d'; G.pvp.name = '验收好汉'; G.pvp.cells = G.team.slice();
    const mine = PVP.snapshot(); const foe = JSON.parse(JSON.stringify(mine)); foe.owner = 'opponent-000000000001'; foe.name = '旧对手';
    for (const h of foe.team) { h.lv = 1; h.star = 1; h.base = JSON.parse(JSON.stringify(grownBase(h.id, 1))); h.skills = DB.hero(h.id).sk.slice(0, 1); }
    const key = await PVP.identity(foe);
    // 旧结构：mine/opponent 是展开对象，没有 key / oname；三条重复
    for (let i = 0; i < 3; i++) G.pvp.records.push({ time: 1000 + i, result: '胜', rounds: 5, mine, opponent: foe, reward: i ? null : '旧对手的头颅' });
    G.pvp.heads.push({ name: '旧对手的头颅', time: 1000, key, opponent: foe }); G.pvp.claimed[key] = true;
    Save.write(); return { key, foe };
  });
  await page.reload(); await page.waitForTimeout(800);

  // 大帐 → PVP 入口（触发迁移）
  await page.click('[data-action="pvp-enter"]'); await page.waitForTimeout(1200);
  const after = await page.evaluate(() => ({ recs: G.pvp.records.map(r => ({ t: typeof r.mine, o: typeof r.opponent, key: r.key, oname: r.oname })), heads: G.pvp.heads.map(h => ({ o: typeof h.opponent, oname: h.oname, key: h.key })), claimed: Object.keys(G.pvp.claimed), pending: PVP.pending() }));
  ok(after.recs.length === 1 && after.recs[0].t === 'string' && after.recs[0].o === 'string' && after.recs[0].key === legacy.key && after.recs[0].oname === '旧对手', '旧档三条重复战绩合并为一条并转成对战码');
  ok(after.heads.length === 1 && after.heads[0].o === 'string' && after.heads[0].oname === '旧对手' && after.claimed.length === 1 && !after.pending, '头颅转码、已领取状态不变');
  ok(await page.locator('.stat3 b').nth(2).innerText() === '1', 'PVP 首页显示 1 颗头颅');

  // 生成对战码（旧 UUID 身份 → 16 字节标志）
  await page.click('[data-action="pvp-code"]'); await page.waitForTimeout(500);
  const code = await page.inputValue('#pvp-export');
  ok(code.startsWith('SHP2:') && code.length <= 360 && /^[A-Za-z0-9_\-:]+$/.test(code), `生成 Base64URL 对战码 ${code.length} 字`);
  ok(await page.evaluate(c => (PVP.bytesCode(c)[1] & 4) === 4, code), '旧档 UUID 身份按 16 字节写入');
  await page.click('[data-action="modal-close"]');

  // 用对方（1 级）的码挑战：先造一份 v1 格式旧码和一份 SHU2 旧码，分别预览
  const oldCodes = await page.evaluate(async foe => {
    const cat = SH_PVP_CATALOG, keep = { v: cat.v, bits: cat.bits };
    Object.assign(cat, { v: 1, bits: PVP.V1BITS }); const v1 = await PVP.encode(foe); Object.assign(cat, keep);
    const bytes = PVP.bytesCode(v1); const frame = new Uint8Array(bytes.length + 2); frame[0] = bytes.length >>> 8; frame[1] = bytes.length & 255; frame.set(bytes, 2);
    let text = PVP.DENSE, value = 0, count = 0; for (const byte of frame) { value = (value << 8) | byte; count += 8; while (count >= 14) { count -= 14; text += String.fromCharCode(0x4e00 + ((value >>> count) & 16383)); value &= (1 << count) - 1; } } if (count) text += String.fromCharCode(0x4e00 + (value << (14 - count)));
    return { v1, shu2: text, v2: await PVP.encode(foe) };
  }, legacy.foe);
  for (const [k, c] of Object.entries(oldCodes)) {
    await page.click('[data-action="go"][data-id="pvp"]').catch(() => {}); await page.waitForTimeout(200);
    await page.click('[data-action="pvp-challenge"]'); await page.waitForTimeout(300);
    await page.fill('#pvp-import', c.replace(/(.{40})/g, '$1\n')); await page.click('[data-action="pvp-preview"]'); await page.waitForTimeout(600);
    ok((await page.locator('#content').innerText()).includes('旧对手'), `${k} 码粘贴（带换行）可预览对手`);
  }
  // 开战（当前停在 v2 预览）
  await page.evaluate(() => { G.speed = 'fast'; });
  await page.click('[data-action="pvp-fight"]');
  await page.waitForFunction(() => UI.battle && UI.battle.over && UI.battle.settled, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const res = await page.evaluate(() => ({ win: UI.battle.win, recs: G.pvp.records.length, heads: G.pvp.heads.length, r0: G.pvp.records[0], view: UI.view }));
  ok(res.win === true && res.recs === 1 && res.heads === 1 && typeof res.r0.mine === 'string' && typeof res.r0.opponent === 'string' && res.r0.key === legacy.key, '再胜旧对手同阵容：战绩更新为一条、头颅不重领、新记录存对战码');
  // 结算页 → 战绩页 → 详情能从码解出双方阵容
  await page.click('[data-action="settle-go"]'); await page.waitForTimeout(400);
  ok((await page.locator('#content').innerText()).includes('这个阵容的头颅已领取'), '结算页提示该阵容头颅已领取');
  await page.click('[data-action="go"][data-id="pvp-records"]'); await page.waitForTimeout(400);
  ok((await page.locator('#content').innerText()).includes('旧对手'), '战绩与战利品页按 oname 显示对手名');
  await page.click('[data-action="pvp-record"]'); await page.waitForTimeout(600);
  const detail = await page.locator('#modal').innerText();
  ok(detail.includes('我方') && detail.includes('对方') && detail.includes('旧对手') && (detail.match(/Lv\./g) || []).length === 18, '对战详情从码解出双方九人');
  await page.click('[data-action="modal-close"]');
  await page.click('[data-action="pvp-head"]'); await page.waitForTimeout(600);
  ok((await page.locator('#modal').innerText()).includes('姓名：旧对手'), '头颅详情显示姓名与对手阵容');
  await page.click('[data-action="modal-close"]');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), '390 宽无横向溢出');
  // 存档体积与导出往返
  const sz = await page.evaluate(async () => { Save.write(); const raw = localStorage.getItem(CFG.saveKey); const c = await Save.exportCode(); const p = await Save.parseCode(c); return { raw: raw.length, code: c.length, ok: !p.err && p.d.pvp.records.length === 1 }; });
  ok(sz.ok, `存档 ${sz.raw} 字节 / 存档码 ${sz.code} 字，导出导入往返正常`);
  await page.screenshot({ path: 'pvp_v2_records.png' });
  console.log('console errors/warnings:', errors.length ? errors : '无');
  console.log(`PASS ${checks} checks`);
  await browser.close();
})().catch(e => { console.error(e); console.error('errors:', errors); process.exit(1); });
