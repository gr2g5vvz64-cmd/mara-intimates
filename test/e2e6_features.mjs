import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tk = async (i, pw) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: i, password: pw }) })).json()).data.token;
const tok = await tk('hamid@example.com', 'hamid-pass-333');
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const M = page.locator('.ov'), sleep = ms => page.waitForTimeout(ms);
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(500); };
const vars = () => page.evaluate(() => { const s = getComputedStyle(document.documentElement); return { bg: s.getPropertyValue('--bg').trim(), gold: s.getPropertyValue('--gold').trim(), theme: document.documentElement.getAttribute('data-theme') }; });
try {
  /* ---------- تم‌ها ---------- */
  ok(await page.locator('#themebtn').isVisible(), 'زبانه‌ی تم رنگی بالای صفحه هست');
  await page.click('#themebtn'); await sleep(200);
  const opts = await page.locator('.tb-opt').count(); ok(opts === 9, 'نه تم در پنل: ' + opts);
  const names = await page.locator('.tb-opt b').allInnerTexts(); console.log('   ', names.map(n => n.replace(/\s+/g, ' ')).join(' | '));
  ok(await page.locator('.tb-opt.on').count() === 1, 'تم فعلی علامت دارد');
  const before = await vars();
  await page.locator('.tb-opt[data-theme-id=t5]').click(); await sleep(300);
  let v = await vars(); ok(v.theme === 't5' && v.bg === '#1A1416' && v.bg !== before.bg, 'تم مشکی لوکس اعمال شد: ' + v.bg);
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor); ok(bodyBg === 'rgb(26, 20, 22)', 'پس‌زمینه‌ی صفحه واقعاً تیره شد ' + bodyBg);
  await page.screenshot({ path: 'shots/f6_dark.png' });
  await page.locator('.tb-opt[data-theme-id=t4]').click(); await sleep(300); v = await vars(); ok(v.theme === 't4' && v.gold === '#C9A24B', 'تم قهوه‌ای-طلایی (لوگو)');
  await page.screenshot({ path: 'shots/f6_logo.png' });
  await page.locator('.tb-opt[data-theme-id=t2]').click(); await sleep(300);
  await page.reload(); await page.waitForSelector('#view'); await sleep(800);
  v = await vars(); ok(v.theme === 't2', 'بعد از رفرش همان تم ماند: ' + v.theme);
  // تم هر کاربر برای خودش
  await page.evaluate(() => localStorage.setItem('mara.theme.رعنا', 't6'));
  ok(await page.evaluate(() => localStorage.getItem('mara.theme.مهسا')) === 't2', 'تم مهسا جدا ذخیره می‌شود');
  await page.click('#themebtn'); await page.locator('.tb-opt[data-theme-id=t7]').click(); await sleep(300);

  /* ---------- شمارنده‌ها ---------- */
  const t0 = await D();
  const navs = await page.locator('.side nav a').evaluateAll(a => a.map(x => ({ r: x.dataset.r, t: x.querySelector('.nt').innerText, c: x.querySelector('.cnt') && !x.querySelector('.cnt').hidden ? x.querySelector('.cnt').innerText : null, cls: x.querySelector('.cnt').className })));
  console.log('   ', navs.map(n => `${n.t}:${n.c}`).join(' | '));
  const missing = navs.filter(n => n.r !== 'help' && n.c == null); ok(missing.length === 0, 'همه‌ی زبانه‌ها شمارنده دارند' + (missing.length ? ' ✗ ' + missing.map(m => m.t) : ''));
  const owed = t0.v_sales.filter(s => !s.voided && s.outstanding > 0).length;
  const salesN = navs.find(n => n.r === 'sales'); ok(salesN && salesN.c && salesN.c.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) == String(owed), `شمارنده‌ی فروش = فروش‌های باز (${owed}): ${salesN && salesN.c}`);
  const stockN = navs.find(n => n.r === 'stock'); const lowN = t0.v_stock.filter(i => i.active && i.rem <= i.min_stock).length; ok(stockN.c && stockN.c.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) == String(lowN), `شمارنده‌ی موجودی = کم‌موجودی/تمام‌شده (${lowN}): ${stockN.c}`);
  ok(await page.locator('.bottom a .cnt').count() === 5, 'نوار پایین موبایل هم شمارنده دارد');
  ok(await page.locator('.dnav a .cnt').count() >= 15, 'منوی کشویی هم شمارنده دارد');
  ok(await page.locator('.tabs button .cnt').count() === 3, 'تب‌های داشبورد شمارنده دارند');
  await go('#/pay'); ok(await page.locator('.tabs button .cnt').count() === 4, 'تب‌های پرداخت‌ها شمارنده دارند');
  await go('#/stock'); ok(await page.locator('.tabs button .cnt').count() === 2, 'تب‌های موجودی شمارنده دارند');
  // انبار: جنس دست هر نفر با قیمت تمام‌شده
  const wh = page.locator('.card', { hasText: 'انبار: جنس دست هر نفر' }); ok(await wh.count() === 1, 'کارت انبار در صفحه‌ی موجودی');
  const whT = (await wh.innerText()).replace(/[٬,\s]/g, ''); const stv = t0.v_totals.stock_value;
  const dig = n => String(Math.round(n));
  ok(/مهسا/.test(whT) && /رعنا/.test(whT) && /جمعکل/.test(whT), 'ردیف مهسا، رعنا و جمع کل');
  const lots = t0.v_lots.filter(l => !l.voided); const vm = lots.reduce((a, l) => a + l.rem_m * l.landed_unit, 0), vr = lots.reduce((a, l) => a + l.rem_r * l.landed_unit, 0);
  ok(Math.abs(vm + vr - stv) < 2, `مهسا ${Math.round(vm)} + رعنا ${Math.round(vr)} = ارزش کل انبار ${Math.round(stv)}`);
  ok(whT.includes(dig(vm)) && whT.includes(dig(vr)) && whT.includes(dig(stv)), 'ارزش هر نفر و جمع کل در کارت درست نمایش داده شد');
  await page.screenshot({ path: 'shots/f6_counters.png' });

  /* ---------- هشدار منفی شدن حساب ---------- */
  await go('#/pay?tab=exp'); await page.click('text=＋ هزینه‌ی جدید').catch(async () => { await page.locator('button', { hasText: /هزینه/ }).first().click(); });
  await M.waitFor(); const eb = await page.evaluate(async () => 0);
  const accs = M.locator('.accpick button, .chip').filter({ hasText: 'حساب مهسا' }).first(); if (await accs.count()) await accs.click();
  await M.locator('.numinp').first().fill('9999999999'); await sleep(200);
  await M.locator('button', { hasText: 'ثبت هزینه' }).click(); await sleep(500);
  const warn = await page.locator('.ov .confirm-t').last().innerText().catch(() => ''); ok(/منفی/.test(warn), 'هشدار منفی شدن حساب آمد: ' + warn.slice(0, 60));
  await page.locator('.ov').last().locator('button', { hasText: 'انصراف' }).click(); await sleep(300);
  ok((await D()).expenses.length === t0.expenses.length, 'با انصراف چیزی ثبت نشد');
  await page.keyboard.press('Escape'); await sleep(300);

  /* ---------- بستن روز ---------- */
  await go('#/finance'); await page.locator('button', { hasText: 'بستن روز' }).first().click(); await M.waitFor();
  const rowsN = await M.locator('.acc-r').count(); ok(rowsN === 4, 'چهار حساب کسب‌وکار در بستن روز: ' + rowsN);
  const sys = (await M.locator('.acc-r').first().innerText()).replace(/\s+/g, ' ');
  await M.locator('.acc-r').first().locator('.numinp').fill('1000'); await sleep(200);
  ok(/کمبود|اضافه|می‌خواند/.test(await M.locator('.acc-r').first().locator('.df').innerText()), 'اختلاف زنده نمایش داده شد');
  await M.locator('button', { hasText: 'بستن روز و ثبت' }).click(); await sleep(1300);
  const t1 = await D(); ok(t1.day_closes.length === 1 && Number(t1.day_closes[0].counted) === 1000, 'بستن روز در دیتابیس ثبت شد: ' + JSON.stringify(t1.day_closes[0] && [t1.day_closes[0].counted, t1.day_closes[0].diff]));
  await sleep(500); ok(/بستن روزها/.test(await page.locator('#view').innerText()), 'جدول بستن روزها در صفحه‌ی مالی');
  ok(Math.abs(t1.v_totals.check_diff) < 1, 'ترازنامه‌ی کنترلی سر جایش (بستن روز حساب را عوض نمی‌کند)');

  /* ---------- هدف ماهانه ---------- */
  await go('#/'); await page.locator('.tabs button', { hasText: 'کل MARA' }).click(); await sleep(300);
  ok(await page.locator('.goalrow').count() === 2, 'کارت هدف: دو شریک');
  await page.locator('button', { hasText: 'تعیین هدف' }).first().click(); await M.waitFor();
  await M.locator('.numinp').nth(0).fill('50000000'); await M.locator('.numinp').nth(1).fill('30000000');
  await M.locator('button', { hasText: 'ثبت هدف' }).click(); await M.waitFor({ state: 'detached', timeout: 15000 }); await sleep(500);
  const t2 = await D(); ok(t2.goals.length === 2 && t2.goals.some(g => g.owner === 'مهسا' && Number(g.amount) === 50000000), 'دو هدف ماهانه در دیتابیس');
  await sleep(300); ok(await page.locator('.gbar').count() === 2, 'نوار پیشرفت هدف نمایش داده شد');
  await page.screenshot({ path: 'shots/f6_goals.png', fullPage: true });

  /* ---------- نمودار سررسید، مشتریان برتر، پیشنهاد خرید ---------- */
  ok(await page.locator('svg.dchart').count() === 1, 'نمودار سررسیدهای ۳۰ روز');
  const top = await page.locator('.rank .li').count(); ok(top >= 1, 'مشتریان برتر: ' + top + ' نفر');
  await go('#/customers'); ok(await page.locator('.rank').count() === 1, 'مشتریان برتر در صفحه‌ی مشتریان هم هست');
  await go('#/'); await page.locator('.tabs button', { hasText: 'کل MARA' }).click(); await sleep(300);
  // پیشنهاد خرید مجدد: فروش تقریباً همه‌ی سوتین اسپرت مهسا
  const tt = await D(); const bra = tt.v_stock.find(i => i.name === 'سوتین اسپرت'), ac = tt.accounts.find(a => a.name === 'حساب مهسا');
  const rs = await fetch(API + '/api/rpc/create_sale/', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok, 'x-idempotency-key': 'e6-' + Date.now() }, body: JSON.stringify({ seller: 'مهسا', channel: 'پیج اینستاگرام', customer: 'مشتری برتر آزمایشی', received: null, account_id: ac.id, lines: [{ item_id: bra.id, qty: bra.rem_m - 1, unit_price: 900000 }] }) });
  ok(rs.ok, 'فروش آزمایشی برای کم کردن موجودی: ' + rs.status);
  await page.evaluate(() => { location.hash = '#/stock'; }); await sleep(300); await go('#/'); await page.reload(); await page.waitForSelector('#view'); await sleep(900);
  await page.locator('.tabs button', { hasText: 'کل MARA' }).click(); await sleep(300);
  const ro = await page.locator('.reorder').innerText().catch(() => ''); ok(/سوتین اسپرت/.test(ro) && /بخر/.test(ro), 'پیشنهاد خرید مجدد برای سوتین اسپرت: ' + ro.replace(/\s+/g, ' ').slice(0, 90));
  const hn = await page.locator('.side nav a[data-r=""] .cnt').innerText(); ok(hn !== '۰', 'شمارنده‌ی خانه بعد از هشدار جدید: ' + hn);
  const cn = await page.locator('.side nav a[data-r="stock"] .cnt').innerText(); ok(cn !== '۰', 'شمارنده‌ی موجودی بعد از کم‌موجودی: ' + cn);
  await page.screenshot({ path: 'shots/f6_all.png', fullPage: true });
  console.log('    پیشنهاد خرید:', (await page.locator('.reorder').innerText().catch(() => 'ندارد')).replace(/\s+/g, ' ').slice(0, 120));

  /* ---------- موبایل ---------- */
  const mp = await newPage(browser, url, { logs, viewport: { width: 390, height: 800 } }); await login(mp, 'rana@example.com', 'rana-pass-22'); await mp.waitForTimeout(800);
  await mp.click('#themebtn'); await mp.waitForTimeout(200); await mp.screenshot({ path: 'shots/f6_mobile_themes.png' });
  const ov = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(ov <= 1, 'موبایل: بدون اسکرول افقی (' + ov + ')');
  await mp.locator('.tb-opt[data-theme-id=t5]').click(); await mp.waitForTimeout(300); await mp.screenshot({ path: 'shots/f6_mobile_dark.png' });
  ok(await mp.evaluate(() => localStorage.getItem('mara.theme.رعنا')) === 't5', 'رعنا تم خودش را دارد (جدا از مهسا)');
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d/.test(l)); if (real.length) { console.log(real); fails++; }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await page.screenshot({ path: 'shots/fail.png' }); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
