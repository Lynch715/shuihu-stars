const { chromium, devices } = require('playwright');
const path = require('path');
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ ...devices['iPhone 13'] });
  const pg = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pg);
  const tap = async (x, y, hold) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await pg.waitForTimeout(hold);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pg.waitForTimeout(400);
  };
  await pg.goto('file://' + path.resolve(process.argv[2]));
  await pg.waitForTimeout(400);
  await pg.evaluate(() => {
    initGame('classic'); G.giftShown = true;
    for (const h of ['lin_chong','yue_fei','wu_song']) Grow.gainHero(h);
    G.team = ['lin_chong','yue_fei','wu_song'];
    G.items.eq_w1 = 2; G.items.eq_w5 = 1; Grow.equip('lin_chong', 'weapon', 'w5');
    Save.write(); UI.view = 'team'; render();
    window.__log = [];
    for (const t of ['pointerdown','pointerup','click']) document.addEventListener(t, e => __log.push(t + ':' + (e.target.className||e.target.tagName)), true);
  });
  for (const hold of [60, 150, 250, 400, 700]) {
    await pg.evaluate(() => { UI.view = 'team'; render(); __log.length = 0; });
    await pg.waitForTimeout(200);
    const bb = await (await pg.$('.tslot[data-id="lin_chong"]')).boundingBox();
    await tap(bb.x + bb.width / 2, bb.y + 40, hold);
    const v = await pg.evaluate(() => UI.view);
    let r = 'n/a';
    if (v === 'hero') {
      const a = await (await pg.$('.eqrow .act')).boundingBox();
      await pg.evaluate(() => __log.length = 0);
      await tap(a.x + a.width / 2, a.y + a.height / 2, hold);
      r = await pg.evaluate(() => G.heroes.lin_chong.equipment.weapon + ' modal=' + $('modal').classList.contains('on') + ' ' + __log.join(' '));
      await pg.evaluate(() => { closeModal(); if (!G.heroes.lin_chong.equipment.weapon) { Grow.equip('lin_chong','weapon','w5'); } });
    }
    console.log('hold', hold, 'view', v, '|', r);
  }
  await br.close();
})();
