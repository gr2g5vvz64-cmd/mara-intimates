// اصلاحات ۷.۱۷: مرجوعی در جدول کالا، بدهی خالص، محافظ داده‌ی کم، اطمینان مشاور، نسخه‌ی بی‌نام
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tokOf = async (e, p) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: e, password: p }) })).json()).data.token;
const rpc = async (tk, fn, body) => (await fetch(API + '/api/rpc/' + fn + '/', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tk }, body: JSON.stringify(body) })).json();
const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
const sleep = ms => page.waitForTimeout(ms), go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(700); };
try {
  await go('#/analysis'); await sleep(900);
  const t = await page.evaluate(async () => (await import('./js/aipack.js')).buildAiPack());
  ok(/سوتین اسپرت \([^)]*، 3 عدد\)/.test(t), 'جدول کالا: سوتین اسپرت ۳ عدد (پس از مرجوعی)، هم‌خوان با مشاور');
  ok(/بدهی خالص/.test(t) && /اعتبار/.test(t), 'بدهی کل، اعتبار و خالص نوشته شده');
  ok(/مقایسه‌ای نیست/.test(t) && !/0\.0٪ ماه قبل/.test(t), 'مقایسه با دوره‌ی بدون فعالیت نشان داده نمی‌شود');
  ok(/تکراری بودن هنوز قابل سنجش نیست/.test(t), 'تکراری ۰٪ در ماه اول نیامده');
  ok(/اطمینان کم/.test(t) && /فعلاً نخر/.test(t), 'مشاور: فعلاً نخر + اطمینان کم');
  ok(/موجودی انبار معادل [\d.]+ ماه فروش/.test(t), 'موجودی انبار بر حسب ماه فروش در خروجی');
  const sm = await page.evaluate(async () => (await import('./js/analytics.js')).stockMonths());
  ok(sm.months != null && sm.months > 0, 'stockMonths عدد می‌دهد: ' + (sm.months && sm.months.toFixed(2)));
  ok(/به تفکیک فروشنده و کانال/.test(t) && /مرجوعی‌های ۳۰ روز اخیر/.test(t), 'جدول کانال×فروشنده و مرجوعی‌ها در خروجی');
  ok(/پیش از هزینه‌های عمومی/.test(t), 'عنوان سود: پیش از هزینه‌های عمومی');
  const a = await page.evaluate(async () => (await import('./js/aipack.js')).buildAiPack({ anon: true }));
  ok(!a.includes('تولیدی احمدی') && !a.includes('خانم الف') && a.includes('طرف حساب'), 'نسخه‌ی بدون نام: نام مشتری/تامین‌کننده حذف شد');
  ok(!/undefined|NaN/.test(t + a), 'بدون undefined/NaN');
  await go('#/analysis'); await page.locator('.tabs button', { hasText: 'مشاور' }).first().click().catch(() => {}); await sleep(900);
  ok(/اطمینان کم|فقط \d+ روز|[۰-۹]+ روز از اولین فروش/.test(await page.locator('#view').innerText()), 'صفحه‌ی مشاور هشدار داده‌ی کم دارد');
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close(); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
