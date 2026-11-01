import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
try {
  let page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
  await page.evaluate(() => { location.hash = '#/help'; }); await page.waitForTimeout(900);
  ok(await page.locator('button', { hasText: 'باز کردن بسته‌ی گزارش ماهانه' }).count() === 1, 'مدیر دکمه‌ی بسته را در راهنما می‌بیند');
  await page.locator('button', { hasText: 'باز کردن بسته‌ی گزارش ماهانه' }).click(); await page.waitForTimeout(1800);
  const t = await page.locator('#view').innerText();
  ok(page.url().includes('#/pack'), 'به صفحه‌ی بسته رفت');
  ok(['۱ · صورت سود و زیان', '۲ · حساب‌وکتاب ماهانه', '۳ · هدف فروش و پاداش', '۴ · نکته‌های تحلیل'].every(x => t.includes(x)), 'هر چهار بخش هست');
  ok(await page.locator('.pack-sec').count() === 4 && await page.locator('.pack-cover').count() === 1, 'جلد و ۴ بخش');
  await page.locator('select.sel').selectOption({ index: 1 }); await page.waitForTimeout(1500);
  ok((await page.locator('#view').innerText()).includes('بسته‌ی گزارش ماهانه'), 'با عوض‌کردن ماه دوباره ساخته می‌شود');
  await page.screenshot({ path: '/tmp/pack.png', fullPage: true });
  await page.context().close();
  page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
  await page.evaluate(() => { location.hash = '#/help'; }); await page.waitForTimeout(800);
  ok(await page.locator('button', { hasText: 'بسته‌ی گزارش ماهانه' }).count() === 0, 'مهسا دکمه‌ی بسته را نمی‌بیند');
  await page.evaluate(() => { location.hash = '#/pack'; }); await page.waitForTimeout(800);
  ok(!page.url().includes('#/pack') && !(await page.locator('#view').innerText()).includes('محرمانه'), 'مهسا نمی‌تواند به #/pack برود');
  await page.context().close();
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول ' + errs.slice(0, 2).join('|'));
} catch (e) { console.log('ERR', e.message); fails++; }
await browser.close(); srv.close?.(); console.log(fails ? 'FAILS: ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
