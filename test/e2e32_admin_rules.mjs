// داشبورد مدیر خلوت‌تر، برداشت فقط مدیر، ماه‌ها از مهر ۱۴۰۵، قفل ماه سه ماه اخیر
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tokOf = async (e, p) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: e, password: p }) })).json()).data.token;
const rpc = async (tk, fn, body) => (await fetch(API + '/api/rpc/' + fn + '/', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tk }, body: JSON.stringify(body) })).json();
const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
const sleep = ms => page.waitForTimeout(ms), go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(700); };
try {
  await go('#/'); await sleep(500);
  const bt = await page.locator('#view').innerText();
  ok(!/فروش جدید/.test(bt) && !/خرید جدید/.test(bt), 'داشبورد مدیر: دکمه‌های فروش جدید و خرید جدید نیست');
  ok(/مشاور و تحلیل/.test(bt) && /گزارش جلسه/.test(bt), 'داشبورد مدیر: مشاور و تحلیل و گزارش جلسه هست');
  ok(await page.locator('.qtip').count() >= 1, 'راهنماها پشت آیکون «؟» رفتند: ' + await page.locator('.qtip').count());
  ok(!/۱ نفر از|حدود \d+٪ فروش این بازه را ساخته/.test(bt), 'جمله‌ی تکراری تمرکز خریداران نیست');
  // فروشنده‌ها در یک جدول
  ok(/فروشنده‌ها/.test(bt) && (bt.match(/هدف فروش به آشنایان/g) || []).length === 1, 'جدول واحد فروشنده‌ها هست و هدف فروش جدا تکرار نشده');
  // ماه‌ها
  await go('#/pnl'); await sleep(700);
  const opts = await page.locator('select option').allInnerTexts(); ok(opts.length >= 1 && !opts.some(o => /۱۴۰۴|1404/.test(o)), 'نوار ماه از مهر ۱۴۰۵ شروع می‌شود: ' + opts.join(' | '));
  await go('#/finance'); await sleep(600);
  const body = await page.locator('#view').innerText(); ok(!/۱۴۰۴|1404/.test(body.split('قفل پایان ماه')[1] || ''), 'قفل پایان ماه: ماه‌های قبل از مهر ۱۴۰۵ نیست');
  // برداشت
  const th = await tokOf('hamid@example.com', 'hamid-pass-333'), tm = await tokOf('mahsa@example.com', 'mahsa-pass-1');
  const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + th } })).json()).data.tables;
  const t = await D(); const biz = t.accounts.find(a => a.kind !== 'pocket'), pk = t.accounts.find(a => a.kind === 'pocket' && a.owner === 'مهسا');
  const r1 = await rpc(tm, 'add_transfer', { from_account_id: biz.id, to_account_id: pk.id, amount: 1000, kind: 'profit_payout' });
  ok(!r1.ok && /حمیدرضا/.test(r1.message || ''), 'مهسا نمی‌تواند برداشت سود ثبت کند: ' + (r1.message || '').slice(0, 60));
  const r2 = await rpc(tm, 'add_transfer', { from_account_id: biz.id, to_account_id: pk.id, amount: 1000 });
  ok(!r2.ok && /حمیدرضا/.test(r2.message || ''), 'مهسا نمی‌تواند برداشت سرمایه (حساب کسب‌وکار ← جیب) ثبت کند');
  const r3 = await rpc(th, 'add_transfer', { from_account_id: biz.id, to_account_id: pk.id, amount: 1000, kind: 'profit_payout' });
  ok(r3.ok, 'مدیر می‌تواند برداشت ثبت کند');
  const pm = await newPage(browser, url, { logs }); await login(pm, 'mahsa@example.com', 'mahsa-pass-1'); pm.setDefaultTimeout(8000);
  await pm.evaluate(() => { location.hash = '#/finance'; }); await pm.waitForTimeout(900);
  ok(!(await pm.locator('body').innerText()).includes('ثبت برداشت'), 'مهسا: دکمه‌ی «ثبت برداشت» را نمی‌بیند');
  await page.screenshot({ path: '/tmp/admin_rules.png' });
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close(); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
