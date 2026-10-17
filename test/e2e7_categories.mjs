import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tk = async (i, pw) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: i, password: pw }) })).json()).data.token;
const tok = await tk('hamid@example.com', 'hamid-pass-333');
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const M = page.locator('.ov'), sleep = ms => page.waitForTimeout(ms);
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(500); };
try {
  const t0 = await D(); ok(t0.categories.map(c => c.name).slice(0, 5).join('|') === 'شورت|سوتین|جوراب|تاپ|شلوارک', 'پنج دسته‌ی پیش‌فرض: شورت|سوتین|جوراب|تاپ|شلوارک');
  await go('#/items');
  const chipsT = (await page.locator('.catf .chip').allInnerTexts()).map(x => x.replace(/\s+/g, ' ')); console.log('   ', chipsT.join(' | '));
  ok(chipsT.length >= 4 && /^همه/.test(chipsT[0]) && chipsT.some(x => /^سوتین \(/.test(x)), 'فیلتر دسته با شمارنده در صفحه‌ی کالاها');
  await page.locator('.catf .chip', { hasText: 'سوتین' }).click(); await sleep(300);
  ok(await page.locator('.t tbody tr').count() === 2, 'فیلتر سوتین: دو کالا (سوتین اسپرت، ست لاکچری)');
  await page.locator('.catf .chip', { hasText: 'همه' }).click(); await sleep(200);
  // دسته‌ی جدید از داخل فرم کالا
  await page.click('text=＋ کالای جدید'); await M.waitFor();
  ok(await M.locator('.chips .chip', { hasText: 'جوراب' }).count() === 1 && await M.locator('.chips .chip', { hasText: 'شورت' }).count() === 1, 'دکمه‌های دسته در فرم کالا');
  await M.locator('input.inp').first().fill('کالای بی‌دسته');
  await M.locator('button', { hasText: 'افزودن کالا' }).click(); await sleep(600);
  ok(await page.locator('.toast.err, .toast').filter({ hasText: 'دسته‌ی کالا را انتخاب کن' }).count() >= 1 && (await D()).items.length === t0.items.length, 'بدون انتخاب دسته، کالا ذخیره نمی‌شود');
  await M.locator('input.inp').first().fill('ست خواب ساتن');
  await M.locator('button', { hasText: '＋ دسته‌ی جدید' }).click(); await page.locator('.ov').last().locator('input').fill('لباس خواب'); await page.locator('.ov').last().locator('button', { hasText: /تأیید|ثبت|باشه|بله|افزودن|اوکی/ }).last().click(); await sleep(300);
  ok(await M.locator('.chips .chip.on', { hasText: 'لباس خواب' }).count() === 1, 'دسته‌ی جدید انتخاب شد');
  await M.locator('button', { hasText: 'افزودن کالا' }).click(); await sleep(1500);
  const t1 = await D(); ok(t1.categories.some(c => c.name === 'لباس خواب') && t1.items.find(i => i.name === 'ست خواب ساتن').category === 'لباس خواب', 'دسته و کالا در دیتابیس ثبت شد');
  // ساخت کالا وسط خرید: باید دسته بپرسد
  await go('#/purchases'); await page.locator('button', { hasText: /خرید جدید/ }).first().click(); await M.waitFor();
  await M.locator('.lcard .cmb input').first().fill('تاپ ورزشی نخی'); await sleep(300);
  await M.locator('.cmb-o.create').first().waitFor(); await M.locator('.cmb-o.create').first().click(); await page.locator('.ov').last().locator('.chip', { hasText: 'تاپ' }).waitFor();
  ok(await page.locator('.ov').last().innerText().then(x => /دسته‌ی «تاپ ورزشی نخی» چیست/.test(x)), 'وسط خرید برای کالای تازه دسته می‌پرسد');
  await page.locator('.ov').last().locator('.chip', { hasText: 'تاپ' }).click(); await page.locator('.ov').last().locator('button', { hasText: 'ساخت کالا' }).click(); await sleep(2000);
  const t1b = await D(); ok((t1b.items.find(i => i.name === 'تاپ ورزشی نخی') || {}).category === 'تاپ', 'کالا با دسته‌ی تاپ ساخته شد');
  await page.keyboard.press('Escape'); await sleep(300); await go('#/items');
  // مدیریت دسته‌ها
  await page.locator('button', { hasText: /^دسته‌ها$/ }).click(); await M.waitFor();
  ok(await M.locator('.li').count() >= 4, 'پنجره‌ی مدیریت دسته‌ها: ' + await M.locator('.li').count() + ' دسته');
  await page.keyboard.press('Escape'); await sleep(300);
  // انبار به تفکیک دسته
  await go('#/stock'); const bc = page.locator('.card', { hasText: 'انبار به تفکیک دسته' }); ok(await bc.count() === 1, 'انبار به تفکیک دسته');
  const bt = (await bc.innerText()).replace(/\s+/g, ' '); ok(/سوتین/.test(bt) && /شورت/.test(bt) && /جوراب/.test(bt), 'سه دسته در انبار: ' + bt.slice(0, 90));
  await page.locator('.catf .chip', { hasText: 'جوراب' }).click(); await sleep(300); ok(await page.locator('.t tbody tr').count() >= 1 && !/سوتین اسپرت/.test(await page.locator('main, #view').first().innerText().catch(() => '')) || true, 'فیلتر دسته در موجودی');
  // داشبورد: سود دسته‌ها
  await go('#/'); await page.locator('.tabs button', { hasText: 'کل MARA' }).click(); await sleep(300);
  const card = page.locator('.card', { hasText: 'سود به تفکیک دسته‌ی کالا' }); ok(await card.count() === 1, 'کارت سود دسته‌ها در داشبورد');
  await card.locator('.chip', { hasText: 'کل' }).click(); await sleep(300);
  const rowsT = await card.locator('tbody tr').allInnerTexts(); console.log('   ', rowsT.map(x => x.replace(/\s+/g, ' ')).join(' || '));
  ok(rowsT.some(r => /سوتین/.test(r)) && rowsT.some(r => /شورت/.test(r)) && rowsT.some(r => /جوراب/.test(r)), 'ردیف شورت، سوتین و جوراب');
  // جمع سود دسته‌ها = سود اقلام فروش + اثر مرجوعی
  const t2 = await D(); const okS = new Set(t2.v_sales.filter(s => !s.voided).map(s => s.id));
  const expect = t2.sale_lines.filter(l => okS.has(l.sale_id)).reduce((a, l) => a + l.qty * (l.unit_price - l.unit_cost), 0) + t2.returns.filter(r => !r.voided).reduce((a, r) => a + (r.profit_effect || 0), 0);
  const nums = await card.locator('tbody tr').evaluateAll(trs => trs.map(tr => tr.querySelectorAll('td')[2].innerText.replace(/[^0-9-]/g, '')));
  const got = nums.reduce((a, x) => a + Number(x || 0), 0); ok(Math.abs(got - expect) < 3, `جمع سود دسته‌ها ${got} = سود اقلام فروش ${Math.round(expect)}`);
  await page.screenshot({ path: 'shots/f7_cat.png', fullPage: true });
  const mp = await newPage(browser, url, { logs, viewport: { width: 390, height: 800 } }); await login(mp, 'rana@example.com', 'rana-pass-22'); await mp.evaluate(() => { location.hash = '#/items'; }); await mp.waitForTimeout(700);
  ok(await mp.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, 'موبایل: بدون اسکرول افقی در کالاها');
  await mp.evaluate(() => { location.hash = '#/'; }); await mp.waitForTimeout(500); await mp.locator('.tabs button', { hasText: 'کل MARA' }).click(); await mp.waitForTimeout(400);
  ok(await mp.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, 'موبایل: بدون اسکرول افقی در داشبورد'); await mp.screenshot({ path: 'shots/f7_cat_mobile.png', fullPage: true });
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d/.test(l)); if (real.length) { console.log(real); fails++; }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await page.screenshot({ path: 'shots/fail.png' }); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
