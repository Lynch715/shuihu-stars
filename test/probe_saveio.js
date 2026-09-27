#!/usr/bin/env node
/**
 * V10.7.1 存档导入导出 · 探针
 *   node probe_saveio.js <html 路径>
 * 起一个本地 http 服务（剪贴板要安全上下文），逐项检查：
 * 导出码生成、复制、下载、粘贴导入、选文件导入、坏码拒收、撤回、选模式页导入、截图。
 */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const FILE = path.resolve(process.argv[2] || 'index.html');
const OUT = path.dirname(FILE);
const srv = http.createServer((q, r) => {
  if (q.url === '/' || q.url.startsWith('/index')) { r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(FILE)); }
  else { r.writeHead(404); r.end(); }
});

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL = `http://localhost:${srv.address().port}/`;
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 390, height: 800 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL.slice(0, -1) });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  const toastTxt = () => pg.$eval('#toast', e => e.textContent);
  const lastToast = async () => { await pg.waitForTimeout(150); return toastTxt(); };
  const raw = () => pg.evaluate(() => localStorage.getItem(CFG.saveKey));
  const reloaded = () => pg.waitForEvent('load');

  console.log('一、选模式页');
  await pg.goto(URL); await pg.evaluate(() => localStorage.clear()); await pg.reload();
  ok(await pg.$('.modepick .mp-imp'), '选模式页有「已有存档？导入」');
  await pg.screenshot({ path: OUT + '/shot_mode.png' });
  await pg.click('.mp-imp');
  ok(await pg.isVisible('#modal.on .saveio'), '点开是存档卡，压在选模式页上面');
  ok(!(await pg.$('#sio-out')), '没有存档时不给导出');
  await pg.screenshot({ path: OUT + '/shot_mode_sheet.png' });
  await pg.click('[data-action=modal-close]');

  console.log('二、开一局、导出');
  await pg.click('[data-action=mode-pick][data-id=classic]');
  await pg.evaluate(() => { G.seenIntro = true; G.giftShown = true; G.res.silver = 777; G.lap = 2; Save.write(); });
  await pg.reload();
  ok(await pg.$('[data-action=save-io]'), '聚义页有「存档导入导出」');
  await pg.screenshot({ path: OUT + '/shot_main.png', fullPage: true });
  const A = JSON.parse(await raw());
  await pg.click('.btn[data-action=save-io]');
  await pg.waitForFunction(() => ($('sio-out') || {}).value, null, { timeout: 5000 });
  const code = await pg.$eval('#sio-out', e => e.value);
  ok(code.startsWith('SHXL1:z:'), `导出码 gzip 格式，长 ${code.length} 字（原 JSON ${JSON.stringify(A).length}）`);
  ok((await pg.textContent('.sio-m')).includes('2 周目'), '概况写出周目：' + (await pg.textContent('.sio-m')));
  await pg.screenshot({ path: OUT + '/shot_sheet.png' });

  await pg.click('[data-action=sio-copy]');
  await pg.waitForTimeout(200);
  const clip = await pg.evaluate(() => navigator.clipboard.readText());
  ok(clip === code, '复制存档码进剪贴板：' + await toastTxt());

  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-action=sio-down]')]);
  const dlp = await dl.path();
  ok(fs.readFileSync(dlp, 'utf8') === code, '下载文件内容一致：' + dl.suggestedFilename());
  await pg.click('[data-action=modal-close]');

  console.log('三、坏码拒收');
  await pg.evaluate(() => { G.res.silver = 12345; Save.write(); });
  const B = await raw();
  const bad = [
    ['随便什么字', '不是群星录'],
    ['SHXL1:z:' + code.slice(8, 60), '不完整'],
    ['SHXL1:q:abcd', '不认识'],
    [JSON.stringify(Object.assign({}, A, { v: 9 })), '版本对不上'],
    [JSON.stringify(Object.assign({}, A, { heroes: {} })), '一个将也没有'],
    ['{坏的', '损坏'],
  ];
  for (const [t, want] of bad) {
    const r = await pg.evaluate(t => Save.parseCode(t), t);
    ok(r.err && r.err.includes(want), `拒收「${t.slice(0, 16)}…」→ ${r.err}`);
  }
  await pg.click('.btn[data-action=save-io]');
  await pg.fill('#sio-in', 'SHXL1:z:' + code.slice(8, 60));
  await pg.click('[data-action=sio-import]');
  ok((await lastToast()).includes('不完整'), '界面上坏码只提示不弹确认：' + await toastTxt());
  ok(await raw() === B, '坏码不动原存档');

  console.log('四、粘贴导入（码里夹换行也认）');
  const messy = code.slice(0, 100) + '\n\n' + code.slice(100, 300) + '  \n' + code.slice(300);
  await pg.fill('#sio-in', messy);
  await pg.click('[data-action=sio-import]');
  await pg.waitForSelector('[data-action=ask-yes]');
  const body = await pg.textContent('#modal .sbody');
  ok(body.includes('当前') && body.includes('导入后'), '确认框写出前后对比：' + body);
  await pg.screenshot({ path: OUT + '/shot_confirm.png' });
  await Promise.all([reloaded(), pg.click('[data-action=ask-yes]')]);
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => G.res.silver) === 777, '导入后银两回到 777');
  ok(JSON.stringify(JSON.parse(await raw()).heroes) === JSON.stringify(A.heroes), '武将数据逐字一致');
  const bk = await pg.evaluate(() => Save.backup());
  ok(bk && bk.d.res.silver === 12345, '导入前那份留作备份（银两 12345）');
  ok(!errs.length, '无页面报错' + (errs.length ? '：' + errs.join(' | ') : ''));

  console.log('五、撤回');
  await pg.click('.btn[data-action=save-io]');
  ok(await pg.$('[data-action=sio-undo]'), '存档卡出现「换回这一份」');
  await pg.screenshot({ path: OUT + '/shot_sheet_bak.png' });
  await pg.click('[data-action=sio-undo]');
  await pg.waitForSelector('[data-action=ask-yes]');
  await Promise.all([reloaded(), pg.click('[data-action=ask-yes]')]);
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => G.res.silver) === 12345, '撤回后银两 12345');
  ok((await pg.evaluate(() => Save.backup())).d.res.silver === 777, '撤回后备份变成刚导入的那份，可再换回');

  console.log('六、选文件导入');
  const f = OUT + '/tmp_save.txt'; fs.writeFileSync(f, code);
  await pg.click('.btn[data-action=save-io]');
  await pg.setInputFiles('#sio-file', f);
  await pg.waitForSelector('[data-action=ask-yes]');
  await Promise.all([reloaded(), pg.click('[data-action=ask-yes]')]);
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => G.res.silver) === 777, '选文件导入成功');
  fs.unlinkSync(f);

  console.log('七、别的格式');
  const p = await pg.evaluate(async () => {
    const r = localStorage.getItem(CFG.saveKey);
    const plain = 'SHXL1:p:' + (function (u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); })(new TextEncoder().encode(r));
    const a1 = await Save.parseCode(plain), a2 = await Save.parseCode(r);
    return [!!a1.raw && a1.raw === r, !!a2.raw && a2.raw === r];
  });
  ok(p[0], '不压缩的 p: 码能读');
  ok(p[1], '直接贴 JSON 原文能读');

  console.log('八、没存档时从选模式页导入');
  await pg.evaluate(() => { Save.locked = true; localStorage.clear(); });
  await pg.reload();
  await pg.click('.mp-imp');
  await pg.fill('#sio-in', code);
  await pg.click('[data-action=sio-import]');
  await pg.waitForSelector('[data-action=ask-yes]');
  await Promise.all([reloaded(), pg.click('[data-action=ask-yes]')]);
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => UI.view === 'main' && G.res.silver === 777), '导入后直接进聚义页');
  ok(!(await pg.evaluate(() => Save.backup())), '本来没存档，不留空备份');
  ok(!errs.length, '全程无页面报错' + (errs.length ? '：' + errs.join(' | ') : ''));

  console.log(`\n通过 ${pass}　失败 ${fail}`);
  await br.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
