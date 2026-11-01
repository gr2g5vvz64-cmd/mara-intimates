import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
try {
  const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(9000);
  await page.evaluate(() => { location.hash = '#/analysis'; }); await page.waitForTimeout(1200);
  await page.locator('.tabs').getByText('خروجی تحلیل‌ها').first().click(); await page.waitForTimeout(700);
  const t = await page.locator('#view').innerText();
  ok(t.includes('کل MARA') && t.includes('بررسی اشتباهات') && t.includes('مشاور خرید') && t.includes('شاخص‌های تکمیلی') && t.includes('گزارش جلسه'), 'همه‌ی بخش‌ها و «کل MARA» هست');
  const r = await page.evaluate(async () => {
    const A = await import('./js/aipack.js'), all = await A.buildAiPack({}), one = await A.buildSections(['ind'], { ask: false }), anon = await A.buildSections(['status'], { anon: true });
    return { all, one, anon, n: A.SECTIONS.length };
  });
  ok(r.n === 8 && /=== 1\) /.test(r.all) && r.all.includes('مشاور خرید') && r.all.includes('درخواست از بررسی‌کننده') && !/NaN|undefined/.test(r.all), 'خروجی کل کامل است و NaN ندارد');
  ok(r.one.includes('شاخص‌های تکمیلی') && !r.one.includes('مشاور خرید (۳۰') && !r.one.includes('درخواست از بررسی‌کننده'), 'خروجی یک بخش فقط همان بخش است');
  ok(r.anon.includes('حذف شده'), 'حالت بدون نام');
  // پیش‌نمایش و دانلود
  await page.locator('button', { hasText: 'پیش‌نمایش' }).first().click(); await page.waitForTimeout(600);
  ok(await page.locator('#view pre').count() === 1 && (await page.locator('#view pre').innerText()).length > 30, 'پیش‌نمایش نشان داده می‌شود');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('button', { hasText: 'خروجی همین تحلیل' }).nth(3).click()]);
  ok(/^MARA-.*\.txt$/.test(dl.suggestedFilename()), 'دانلود فایل متنی: ' + dl.suggestedFilename());
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('button', { hasText: 'خروجی کل MARA' }).click()]);
  ok(/^MARA-all/.test(dl2.suggestedFilename()), 'دانلود کل MARA');
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR|clipboard|Clipboard/i.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join('|') : ''));
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close(); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
