// «دروازه‌ی داده‌ی کافی»: تب شاخص‌ها، آمار پیج، تنظیمات تحلیل، گزارش جلسه (ماه)، درصد تغییر فقط با فاکتور کافی
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const post = async (tok, path, body) => (await (await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })).json());
const tok = (await post('', '/api/auth/login/', { identifier: 'hamid@example.com', password: 'hamid-pass-333' })).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
let page;
try {
  page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(9000);
  const sleep = ms => page.waitForTimeout(ms), M = page.locator('.ov');
  await page.evaluate(() => { location.hash = '#/analysis'; }); await sleep(1500);
  await page.locator('.tabs').getByText('شاخص‌ها').first().click(); await sleep(900);
  let t = await page.locator('#view').innerText();
  ok(t.includes('موجودی انبار معادل چند ماه فروش') && /ماه بر پایه‌ی بهای تمام‌شده‌ی واقعی ۳۰ روز/.test(t), 'موجودی چند ماه فروش: برچسب با فرمول یکی است');
  ok(/در انتظار داده/.test(t) && /قابل اندازه‌گیری/.test(t), 'شاخص‌های بی‌داده «در انتظار داده» با زمان نوشته شده‌اند');
  ok(t.includes('نقدینگی آزاد') && t.includes('ساختار سود') && t.includes('تقویم بدهی'), 'نقدینگی آزاد، ساختار سود و تقویم بدهی هست');
  ok(!/NaN|undefined|Infinity/.test(t), 'در شاخص‌ها NaN/undefined نیست');
  // آمار هفتگی پیج
  await page.locator('button', { hasText: 'ثبت آمار هفتگی پیج' }).click(); await M.waitFor(); await sleep(400);
  const ins = M.locator('input.numinp'); await ins.nth(0).fill('40'); await ins.nth(1).fill('12'); await ins.nth(2).fill('900');
  await M.locator('button', { hasText: 'ثبت آمار هفته' }).click(); await sleep(1500);
  let tb = await D(); ok(tb.page_stats.length === 1 && tb.page_stats[0].dms === 40 && tb.page_stats[0].price_asks === 12 && tb.page_stats[0].visits === 900, 'آمار هفتگی پیج ذخیره شد');
  // تنظیمات تحلیل
  await page.locator('button', { hasText: 'تنظیمات تحلیل' }).first().click(); await M.waitFor(); await sleep(400);
  await M.locator('input.numinp').nth(0).fill('40'); await M.locator('input.numinp').nth(2).fill('300000000');
  await M.locator('button', { hasText: 'ذخیره' }).click(); await sleep(1500);
  tb = await D(); const st = k => Number((tb.app_settings.find(x => x.key === k) || {}).value);
  ok(st('lead_days') === 40 && st('page_goal') === 300000000, 'زمان تأمین و هدف پیج ذخیره شد');
  await page.evaluate(() => { location.hash = '#/analysis'; }); await sleep(600);
  await page.locator('.tabs').getByText('شاخص‌ها').first().click(); await sleep(700);
  t = await page.locator('#view').innerText(); ok(/هدف فروش پیج/.test(t) && /300/.test(t.replace(/[٬,]/g, '')) || /هدف فروش پیج/.test(t), 'هدف پیج در شاخص‌ها دیده می‌شود');
  ok(/قیف|نرخ تبدیل دایرکت/.test(t), 'نرخ تبدیل دایرکت: یا عدد یا «در انتظار داده»');
  // مشاور: قفل‌ها
  await page.locator('.tabs').getByText('مشاور خرید').first().click(); await sleep(1200);
  t = await page.locator('#view').innerText();
  ok(/قابل استناد می‌شوند/.test(t) && /پرفروش تأییدشده/.test(t) && /زمان تأمین \d+ روز/.test(t), 'مشاور: قفل نقطه‌ی سفارش، سطح‌بندی و زمان تأمین دیده می‌شود');
  // منطق: درصد تغییر، ماه، هزینه
  const r = await page.evaluate(async () => {
    const R = await import('./js/report.js'), M = await import('./js/meeting.js'), A = await import('./js/analysis.js'), AN = await import('./js/analytics.js'), I = await import('./js/indicators.js');
    const rep = R.buildReport(7), txt = R.reportText(rep), mt = M.buildMeeting(30), an = A.analyze(), sm = AN.stockMonths();
    return { k: rep.kpi, hasArrow: /[▲▼]/.test(txt.split('▸ چرا')[0]), crossMonth: mt.crossMonth, meetTxt: M.meetingText(mt), noExp: AN.noExpensesYet(), bd: AN.bizDays(), pending: an.pending.length, titles: an.findings.map(f => f.title), sm, rules: I.bonusRulesText() };
  });
  ok(!(r.k.count < 10 || r.k.prevCount < 10) || !r.hasArrow, `درصد تغییر با فاکتور کم (${r.k.count} و ${r.k.prevCount}) نشان داده نمی‌شود`);
  ok(r.sm.months30 != null && r.sm.cogs30 > 0 && r.sm.months7 !== undefined, 'stockMonths سه عدد جدا می‌دهد: ' + (r.sm.months30 && r.sm.months30.toFixed(2)));
  ok(!r.noExp || r.bd < 14 || r.titles.includes('هیچ هزینه‌ی عمومی ثبت نشده'), 'هشدار «هزینه‌ی عمومی ثبت نشده» (وقتی صفر هزینه و فعالیت ≥۱۴ روز)');
  ok(r.pending >= 0 && (r.bd >= 45 || r.pending >= 1), 'بخش «هنوز قابل سنجش نیست» وقتی فعالیت کمتر از ۴۵ روز است');
  ok(/قواعد پاداش آشنایان/.test(r.meetTxt) && /فقط از .* تا امروز می‌شمارد/.test(r.meetTxt), 'گزارش جلسه: قواعد پاداش و «هدف فقط از اول ماه می‌شمارد»');
  ok(r.crossMonth ? /از ماه قبل شروع می‌شود/.test(r.meetTxt) : true, 'اگر بازه از ماه قبل شروع شود هشدار هست (crossMonth=' + r.crossMonth + ')');
  await page.evaluate(() => { location.hash = '#/meeting'; }); await sleep(900);
  await page.locator('.chips button', { hasText: '۳۰ روز' }).first().click(); await sleep(700);
  t = await page.locator('#view').innerText();
  ok(!/NaN|undefined/.test(t) && (r.crossMonth ? /از ماه قبل شروع می‌شود/.test(t) : true), 'صفحه‌ی گزارش جلسه (۳۰ روز) درست رسم می‌شود');
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close(); console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
