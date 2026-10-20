// انبارگردانی: مدیر مستقیم ثبت می‌کند، رعنا برای تأیید می‌فرستد، ابطال و تأیید از رابط
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
const sleep = ms => page.waitForTimeout(ms), M = page.locator('.ov').last();
const go = async (p, h) => { await p.evaluate(x => { location.hash = x; }, h); await sleep(600); };
try {
  const t0 = await D(); const tot0 = t0.v_totals;
  await go(page, '#/stocktake');
  ok((await page.locator('main, #view, body').first().innerText()).includes('انبارگردانی'), 'صفحه‌ی انبارگردانی باز شد');
  await page.click('text=＋ شروع شمارش'); await sleep(400);
  const rows = page.locator('.stk-row'); ok(await rows.count() > 0, 'ردیف‌های شمارش آمد');
  // اولین کالای دارای موجودی نزد مهسا
  const n = await rows.count(); let idx = -1, sys = 0;
  for (let i = 0; i < n; i++) { const s = parseInt((await rows.nth(i).locator('.stk-s b').innerText()).replace(/[^\d]/g, ''), 10); if (s >= 2) { idx = i; sys = s; break; } }
  ok(idx >= 0, 'کالایی با موجودی ≥۲ نزد مهسا هست (' + sys + ')');
  const r0 = rows.nth(idx); await r0.locator('.stk-in').fill(String(sys - 1)); await sleep(300);
  ok((await r0.locator('.stk-df').innerText()).includes('-1') || (await r0.locator('.stk-df').innerText()).includes('−1') || /1/.test(await r0.locator('.stk-df').innerText()), 'اختلاف کسری ۱ نشان داده شد');
  ok(await page.locator('.stk-side button.primary').isDisabled(), 'بدون دلیل اختلاف، ثبت قفل است');
  await r0.locator('.stk-rs .chip', { hasText: 'گم‌شده' }).click(); await sleep(300);
  ok(!(await page.locator('.stk-side button.primary').isDisabled()), 'بعد از انتخاب دلیل، ثبت باز شد');
  ok((await page.locator('.stk-side').innerText()).includes('خالص اثر روی سود'), 'پنل نتیجه با اثر حسابداری دیده می‌شود');
  await page.screenshot({ path: '/tmp/stk_count.png' });
  await page.locator('.stk-side button.primary').click(); await sleep(1800);
  const t1 = await D(); const st = t1.stocktakes || [];
  ok(st.length === 1 && st[0].status === 'posted' && st[0].holder === 'مهسا', 'انبارگردانی مدیر مستقیم ثبت شد');
  const ex = t1.expenses.filter(e => e.stocktake_id); ok(ex.length === 1 && ex[0].category === 'کسری موجودی' && ex[0].account_id === null && ex[0].amount > 0, 'هزینه‌ی «کسری موجودی» بدون حساب ساخته شد');
  ok(Math.abs(t1.v_totals.check_diff) < 1, 'ترازنامه‌ی کنترلی بالانس ماند');
  ok(t1.v_totals.profit < tot0.profit && t1.v_totals.business_balance === tot0.business_balance, 'سود کم شد، پول حساب‌ها نه');
  await sleep(500); ok((await page.locator('body').innerText()).includes('ST-0001'), 'در تاریخچه‌ی انبارگردانی دیده می‌شود');
  await page.screenshot({ path: '/tmp/stk_list.png' });
  // ابطال از رابط
  await page.locator('tr, .drow, .trow', { hasText: 'ST-0001' }).first().click(); await M.waitFor(); await sleep(300);
  await M.locator('button', { hasText: 'ابطال انبارگردانی' }).click(); await sleep(300);
  await page.locator('.ov').last().locator('button', { hasText: 'باطل کن' }).click(); await sleep(300);
  await page.locator('.ov').last().locator('input, textarea').first().fill('تست ابطال'); await page.locator('.ov').last().locator('button.primary, button', { hasText: /تأیید|ثبت|باشه|اوکی|بله/ }).last().click(); await sleep(1800);
  const t2 = await D(); ok(t2.stocktakes[0].voided === true && t2.v_totals.profit === tot0.profit, 'ابطال: موجودی و سود برگشت');
  // رعنا → در انتظار تأیید
  const p2 = await newPage(browser, url, { logs }); await login(p2, 'rana@example.com', 'rana-pass-22'); p2.setDefaultTimeout(8000);
  await go(p2, '#/stocktake'); await p2.click('text=＋ شروع شمارش'); await sleep(400);
  const rr = p2.locator('.stk-row'); let j = -1, s2 = 0; const m2 = await rr.count();
  for (let i = 0; i < m2; i++) { const s = parseInt((await rr.nth(i).locator('.stk-s b').innerText()).replace(/[^\d]/g, ''), 10); if (s >= 1) { j = i; s2 = s; break; } }
  ok(j >= 0, 'رعنا هم کالایی دارد');
  await rr.nth(j).locator('.stk-in').fill(String(s2 + 100000)); await sleep(200);
  await rr.nth(j).locator('.stk-rs .chip', { hasText: 'خطای ثبت' }).click(); await sleep(200);
  ok((await p2.locator('.stk-side button.primary').innerText()).includes('تأیید'), 'برای رعنا دکمه «ارسال برای تأیید» است');
  await p2.locator('.stk-side button.primary').click(); await sleep(1800);
  const t3 = await D(); const pend = t3.stocktakes.find(x => x.status === 'pending');
  ok(pend && t3.expenses.filter(e => e.stocktake_id && !e.voided).length === 0, 'اختلاف بزرگ رعنا در انتظار تأیید ماند و چیزی تغییر نکرد');
  await page.reload(); await sleep(1500); await go(page, '#/stocktake'); await page.locator('tr, .drow, .trow', { hasText: pend.no }).first().click(); await M.waitFor();
  await M.locator('button', { hasText: 'تأیید و ثبت' }).click(); await sleep(300);
  await page.locator('.ov').last().locator('button', { hasText: 'تأیید و ثبت' }).last().click(); await sleep(1800);
  const t4 = await D(); ok(t4.stocktakes.find(x => x.id === pend.id).status === 'posted' && Math.abs(t4.v_totals.check_diff) < 1, 'مدیر تأیید کرد؛ ثبت شد و بالانس است');
  // موبایل
  await page.setViewportSize({ width: 390, height: 800 }); await go(page, '#/stocktake'); await page.click('text=＋ شروع شمارش'); await sleep(500);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), 'گوشی: اسکرول افقی ندارد');
  await page.screenshot({ path: '/tmp/stk_mobile.png' });
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
