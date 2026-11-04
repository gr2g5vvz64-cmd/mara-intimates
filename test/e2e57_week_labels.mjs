import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
try {
  const a = await newPage(browser, url, { logs, viewport: { width: 1280, height: 900 } }); await login(a, 'hamid@example.com', 'hamid-pass-333'); a.setDefaultTimeout(9000); await a.waitForTimeout(1200);
  await a.waitForSelector('.dbody .kpis'); await a.waitForTimeout(500);
  const labels = await a.evaluate(() => [...document.querySelectorAll('.chart text.cl')].map(t => t.textContent));
  ok(!labels.some(x => /^پیش$|^\d+ پیش$|^[۰-۹]+ پیش$/.test(x)), 'برچسب گنگ «پیش / ۲ پیش» دیگر نیست');
  ok(labels.includes('این هفته') && labels.some(x => /هفته‌ی قبل|هفته قبل/.test(x)), 'برچسب‌ها: این هفته / هفته‌ی قبل / ۲ هفته قبل');
  ok(labels.some(x => /[0-9۰-۹]+–[0-9۰-۹]+ \S+/.test(x)), 'زیر هر هفته بازه‌ی تاریخ شمسی نوشته شده: ' + labels.filter(x => /–/.test(x)).slice(0, 3).join(' | '));
  await a.locator('.dbody .chart').first().scrollIntoViewIfNeeded(); await a.waitForTimeout(300);
  await a.locator('.dbody .chart').first().screenshot({ path: 'shots/week_labels.png' });
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول');
} catch (e) { console.log('ERR', e.message.split('\n')[0]); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
