import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
try {
  const d = await newPage(browser, url, { logs, viewport: { width: 1280, height: 900 } }); await login(d, 'hamid@example.com', 'hamid-pass-333'); d.setDefaultTimeout(9000); await d.waitForTimeout(1500);
  await d.waitForSelector('.dbody .kpis'); await d.waitForTimeout(500);
  const t = await d.locator('#view').innerText();
  ok(!/میلیون ریال/.test(t), 'هیچ «میلیون ریال» خلاصه‌ای در داشبورد دسکتاپ نیست');
  const labs = await d.evaluate(() => [...document.querySelectorAll('.chart.tall text.cv')].map(x => x.textContent));
  ok(labs.length > 0 && labs.every(x => /^-?\d{1,3}(,\d{3})*$|^0$/.test(x)), 'دسکتاپ: عددهای بالای ستون کامل با جداکننده‌اند: ' + labs.filter(x => x !== '0').slice(0, 4).join(' | '));
  ok(await d.evaluate(() => [...document.querySelectorAll('.chart text.cv')].some(x => /rotate\(-90\)/.test(x.getAttribute('transform') || ''))), 'عددها چرخیده‌اند');
  await d.locator('.chart.tall').first().scrollIntoViewIfNeeded(); await d.waitForTimeout(300);
  const rect = d.locator('.chart.tall rect').nth(1); await rect.hover(); await d.waitForTimeout(200);
  ok(/ریال/.test(await d.locator('.ctip:not([hidden])').first().innerText().catch(() => '')), 'دسکتاپ: با موس روی ستون، کادر مبلغ کامل با «ریال» می‌آید');
  await d.locator('.hc').first().scrollIntoViewIfNeeded(); await d.waitForTimeout(300);
  await d.locator('.card:has(.chart.tall)').first().screenshot({ path: 'shots/full_desktop.png' });
  await d.locator('.hc').first().screenshot({ path: 'shots/full_health.png' });
  const m = await newPage(browser, url, { logs, viewport: { width: 390, height: 844 } }); await login(m, 'hamid@example.com', 'hamid-pass-333'); m.setDefaultTimeout(9000); await m.waitForTimeout(1500);
  await m.waitForSelector('.dbody .kpis'); await m.waitForTimeout(500);
  const mt = await m.locator('#view').innerText(); ok(!/میلیون ریال/.test(mt), 'موبایل: هیچ «میلیون ریال» نیست');
  const mc = await m.evaluate(() => [...document.querySelectorAll('.chart:not(.tall) text.cv')].length);
  ok(await m.evaluate(() => document.querySelectorAll('.chart.tall').length === 0), 'موبایل: نمودار مبلغی بلند/چرخیده نیست');
  const mr = m.locator('.ctwrap svg rect').nth(1); await mr.scrollIntoViewIfNeeded(); await mr.click({ force: true }); await m.waitForTimeout(250);
  ok(/ریال/.test(await m.locator('.ctip:not([hidden])').first().innerText().catch(() => '')), 'موبایل: با لمس ستون، مبلغ کامل با «ریال» نمایش داده می‌شود');
  await m.locator('.card:has(.ctwrap)').first().screenshot({ path: 'shots/full_mobile.png' });
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول' + (real.length ? ': ' + real.slice(0, 2).join(' | ') : ''));
} catch (e) { console.log('ERR', e.message.split('\n')[0]); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
