const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await pg.goto('file://' + path.resolve(process.argv[2]));
  await pg.waitForTimeout(400);
  const go = async (fn, file) => { await pg.evaluate(fn); await pg.waitForTimeout(700); await pg.screenshot({ path: file }); };
  await pg.evaluate(() => {
    initGame('classic'); G.giftShown = true;
    for (const h of ['lin_chong','yue_fei','wu_song','hua_rong','song_jiang','yan_qing','zhang_heng','shi_en','bai_sheng']) Grow.gainHero(h);
    G.team = ['lin_chong','yue_fei','wu_song','hua_rong','song_jiang','yan_qing','zhang_heng','shi_en','bai_sheng'];
    Save.write();
  });
  await go(() => { UI.view = 'heroes'; render(); window.scrollTo(0, 250); }, '/tmp/q1.png');
  await go(() => { UI.sel = 'lin_chong'; UI.view = 'hero'; render(); window.scrollTo(0, 0); }, '/tmp/q2.png');
  await go(() => { UI.view = 'team'; render(); window.scrollTo(0, 250); }, '/tmp/q3.png');
  await go(() => { const b = Battle.create('ch1_1'); UI.battle = b; UI.view = 'battle'; render(); window.scrollTo(0, 150); }, '/tmp/q4.png');
  await br.close();
})();
