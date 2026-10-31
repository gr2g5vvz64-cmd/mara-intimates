import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const theme = p => p.evaluate(() => document.documentElement.getAttribute('data-theme'));
try {
  // مدیر: گزینه را می‌بیند و انتخاب می‌کند
  let page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
  await page.evaluate(() => { location.hash = '#/settings'; }); await page.waitForTimeout(700);
  if (await page.locator('#themebtn[aria-expanded=false]').count()) await page.locator('#themebtn').click();
  ok(await page.locator('.tb-opt[data-theme-id="t10"]').count() === 1, 'مدیر تم شیشه‌ای تیره را در فهرست می‌بیند');
  await page.locator('.tb-opt[data-theme-id="t10"]').click(); await page.waitForTimeout(500);
  ok(await theme(page) === 't10', 'انتخاب → data-theme=t10');
  ok((await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).includes('gradient'), 'پس‌زمینه‌ی گرادیان اعمال شد');
  ok((await page.evaluate(() => getComputedStyle(document.querySelector('.card')).backdropFilter || '')).includes('blur'), 'کارت شیشه‌ای (blur) است');
  await page.evaluate(() => { location.hash = '#/home'; }); await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/theme_t10_admin.png', fullPage: false });
  await page.reload(); await page.waitForTimeout(1200);
  ok(await theme(page) === 't10', 'بعد از بارگذاری دوباره هم می‌ماند');
  await page.context().close();
  // مهسا: در همان مرورگر/ذخیره‌ی t10 نباید ببیند
  for (const [u, pw] of [['mahsa@example.com', 'mahsa-pass-1'], ['mahdi@example.com', 'mahdi-pass-44']]) {
    page = await newPage(browser, url, { logs }); await page.addInitScript(() => { try { localStorage.setItem('mara.theme.last', 't10'); } catch {} });
    await login(page, u, pw); page.setDefaultTimeout(8000); await page.waitForTimeout(600);
    ok(await theme(page) !== 't10', u + ': تم مدیر از صفحه‌ی ورود برداشته شد → ' + await theme(page));
    await page.evaluate(() => { location.hash = '#/settings'; }); await page.waitForTimeout(600);
    if (await page.locator('#themebtn[aria-expanded=false]').count()) await page.locator('#themebtn').click();
    ok(await page.locator('.tb-opt').count() >= 5 && await page.locator('.tb-opt[data-theme-id="t10"]').count() === 0, u + ': گزینه‌ی t10 در فهرست نیست');
    await page.context().close();
  }
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول ' + errs.slice(0, 2).join('|'));
} catch (e) { console.log('ERR', e.message); fails++; }
await browser.close(); srv.close?.(); console.log(fails ? 'FAILS: ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
