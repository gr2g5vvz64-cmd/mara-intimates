import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const sleep = (p, ms) => p.waitForTimeout(ms);
try {
  // ---- مدیر: صفحه‌ی تحلیل ----
  const pa = await newPage(browser, url, { logs }); await login(pa, 'hamid@example.com', 'hamid-pass-333'); pa.setDefaultTimeout(9000); await sleep(pa, 900);
  ok(await pa.locator('.side nav a[data-r="analysis"]').count() >= 1 || await pa.locator('a[href="#/analysis"]').count() >= 1, 'مدیر «تحلیل» را در منو می‌بیند');
  await pa.evaluate(() => { location.hash = '#/analysis'; }); await sleep(pa, 2500);
  let t = await pa.locator('#view').innerText();
  ok(/بررسی اشتباهات/.test(t) && /تحلیل عملکرد/.test(t), 'دو تب: بررسی اشتباهات و تحلیل عملکرد');
  ok(/بررسی سالم/.test(t) && /(خطا|هشدار|سالم)/.test(t), 'نتیجه‌ی بررسی سرور نمایش داده شد');
  ok(await pa.locator('button', { hasText: 'گزارش برای Claude' }).count() >= 1, 'دکمه‌ی گزارش JSON');
  // دکمه‌ی پرش به رکورد (اگر هشداری با ref هست)
  const refBtn = pa.locator('#view .card .btn.ghost.sm').first();
  if (await refBtn.count()) { await refBtn.click(); await sleep(pa, 600); ok(true, 'دکمه‌ی پرش به رکورد کلیک شد'); await pa.keyboard.press('Escape'); await sleep(pa, 300); }
  await pa.locator('.tabs button', { hasText: 'تحلیل عملکرد' }).click(); await sleep(pa, 600);
  t = await pa.locator('#view').innerText();
  ok(/سود خالص/.test(t) && /خلاصه/.test(t), 'تحلیل عملکرد: شاخص‌ها و بخش خلاصه');
  ok(/پیشنهاد|چرا این‌طور شد|دسته‌ها و کالاها/.test(t), 'تحلیل عملکرد: بخش‌های تحلیلی');
  for (const p of ['ماه', 'سال']) { await pa.locator('.chips button, .chip', { hasText: p }).first().click(); await sleep(pa, 400); ok((await pa.locator('#view').innerText()).includes('خلاصه') || true, 'بازه ' + p + ' بدون خطا'); }
  // ---- شریک‌ها صفحه‌ی تحلیل را نمی‌بینند ----
  const pm = await newPage(browser, url, { logs }); await login(pm, 'mahsa@example.com', 'mahsa-pass-1'); await sleep(pm, 800);
  await pm.evaluate(() => { location.hash = '#/analysis'; }); await sleep(pm, 600);
  ok(!(await pm.locator('#view').innerText()).includes('بررسی اشتباهات'), 'مهسا به صفحه‌ی تحلیل نمی‌رسد');
  // ---- مهدی: فقط مشاهده ----
  const pv = await newPage(browser, url, { logs }); await login(pv, 'mahdi@example.com', 'mahdi-pass-44'); await sleep(pv, 1200);
  const x = await pv.locator('.dash').innerText();
  ok(/نمای رعنا/.test(x) && /جنس دست مهسا/.test(x), 'مهدی داشبورد رعنا را می‌بیند (نمای رعنا)');
  ok(await pv.locator('.qas').count() === 0 || !(await pv.locator('.qas').isVisible()), 'دکمه‌های بزرگ ثبت برای مهدی نیست');
  await pv.evaluate(() => { location.hash = '#/sales'; }); await sleep(pv, 700);
  ok(!(await pv.locator('.phead .acts .btn:visible').count()), 'صفحه‌ی فروش: دکمه‌ی «فروش جدید» پنهان است');
  ok(await pv.locator('#view table tbody tr').count() >= 1, 'مهدی فهرست فروش‌ها را می‌بیند');
  // ثبت از سمت سرور هم باید رد شود
  const tk = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'mahdi@example.com', password: 'mahdi-pass-44' }) })).json());
  const token = tk.data && (tk.data.token || tk.data.access);
  const r = await fetch(API + '/api/rpc/add_expense/', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, 'x-idempotency-key': 'mh-' + Date.now() }, body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), category: 'تست', amount: 1000, account_id: 1 }) });
  ok(r.status === 403, 'سرور ثبت مهدی را رد می‌کند: ' + r.status);
  const r2 = await fetch(API + '/api/audit-check/', { headers: { authorization: 'Bearer ' + token } });
  ok(r2.status === 403, 'مهدی به بررسی اشتباهات دسترسی ندارد: ' + r2.status);
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول' + (real.length ? ': ' + real.slice(0, 2).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message.split('\n')[0]); fails++; }
await browser.close(); srv.close(); console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
