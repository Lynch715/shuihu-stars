const { chromium, devices } = require('playwright');
const path = require('path');
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ ...devices['iPhone 13'] });
  const pg = await ctx.newPage(); const cdp = await ctx.newCDPSession(pg);
  await pg.goto('file://' + path.resolve(process.argv[2])); await pg.waitForTimeout(300);
  await pg.evaluate(() => { initGame('classic'); G.giftShown = true;
    for (const h of ['lin_chong','yue_fei','wu_song']) Grow.gainHero(h);
    G.team = ['lin_chong','yue_fei','wu_song']; UI.view = 'team'; render(); });
  await pg.waitForTimeout(200);
  const a = await (await pg.$('.tslot[data-id="lin_chong"]')).boundingBox();
  const b = await (await pg.$('.tslot[data-id="wu_song"]')).boundingBox();
  const p0 = { x: a.x + a.width / 2, y: a.y + 40 }, p1 = { x: b.x + b.width / 2, y: b.y + 40 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p0] });
  await pg.waitForTimeout(420);
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p0.x + (p1.x - p0.x) * i / 8, y: p0.y + (p1.y - p0.y) * i / 8 }] }); await pg.waitForTimeout(30); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pg.waitForTimeout(400);
  console.log(await pg.evaluate(() => UI.view + ' ' + G.team.join(',')));
  await br.close();
})();
