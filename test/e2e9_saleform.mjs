import { serve, launch, newPage, login, API, buyer, gridRow, gridNext } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const fa = x => String(x).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,\s+]/g, '');
const post = async (tok, path, body) => (await (await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })).json());
const tok = (await post('', '/api/auth/login/', { identifier: 'hamid@example.com', password: 'hamid-pass-333' })).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const t0 = await D(); const item = t0.items.find(i => i.name.startsWith('شورت')); const sup = t0.suppliers[0];
// خرید دومِ همین کالا با قیمت دیگر → دو پارت (۶ عدد نزد مهسا)
const pr = await post(tok, '/api/rpc/create_purchase/', { supplier_id: sup.id, ship_cost: 0, lines: [{ item_id: item.id, qty: 6, unit_price: 1500000, hold_m: 6, hold_r: 0 }], payments: [] });
ok(pr.ok !== false, 'خرید دوم برای ساخت دو پارت ثبت شد');
const t1 = await D(); const lots = t1.v_lots.filter(l => l.item_id === item.id && !l.voided).sort((a, b) => a.id - b.id);
ok(lots.length === 2, 'کالا دو پارت دارد: ' + lots.map(l => `${l.lot_no}=${Math.round(l.landed_unit)} (م ${l.rem_m}/ر ${l.rem_r})`).join(' | '));
const [l1, l2] = lots;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const M = page.locator('.ov').last(), sleep = ms => page.waitForTimeout(ms);
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(500); };
const NOTE = 'ارسال با پیک؛ کارت هدیه ' + 'y'.repeat(400);
try {
  await go('#/sales'); await page.click('text=＋ فروش جدید'); await M.waitFor(); await sleep(600);
  // ستون‌های جدول فروش
  const head = await M.locator('.pg-head').innerText();
  ok(['کد کالا', 'تعداد', 'فی فروش', 'برداشت از', 'سود ردیف', 'توضیحات'].every(x => head.includes(x)), 'سرستون‌های جدول فروش');
  // مقدار: همهٔ موجودی پارت اول مهسا + ۲ عدد از پارت دوم (FIFO از دو پارت)
  const q = l1.rem_m + 2, price = 3000000;
  await gridRow(page, M, 0, { name: 'شورت', qty: q, price, note: NOTE });
  const r0 = M.locator('.pgrow').first();
  ok((await r0.locator('.pg-code').innerText()).startsWith('MR-'), 'کد کالا خودکار آمد');
  ok(await r0.locator('.c-dl input').nth(0).inputValue() === String(q) && await r0.locator('.c-dl input').nth(1).inputValue() === '0', 'برداشت پیش‌فرض همه از موجودی فروشنده (مهسا)');
  const exCost = (l1.rem_m * l1.landed_unit + 2 * l2.landed_unit), exProfit = Math.round(q * price - exCost);
  const pf = +fa(await r0.locator('.sg-pf b').innerText());
  ok(Math.abs(pf - exProfit) <= 1, `سود ردیف با FIFO دو پارت: ${pf} (انتظار ${exProfit})`);
  ok((await M.locator('.pgrow').count()) === 2, 'ردیف تازه خودکار اضافه شد');
  // کالای تکراری
  await gridRow(page, M, 1, { name: 'شورت', qty: 1, price: 100 });
  ok(/تکراری/.test(await M.locator('.pg-probs').innerText()) || /تکراری/.test(await M.locator('.pgrow').nth(1).innerText()), 'کد تکراری در یک فاکتور هشدار می‌دهد');
  await M.locator('.pgrow').nth(1).locator('.c-rm button, .rm').click(); await sleep(300);
  // کمبود موجودی
  await r0.locator('.c-qty input').fill('9999'); await sleep(300);
  ok(/کافی نیست|کم داری/.test(await r0.locator('.pg-msg').innerText()), 'تعداد بیش از موجودی: خطا و ادامه بسته');
  await gridNext(page, M); ok(await M.locator('.pg1').isVisible(), 'با خطای موجودی به مرحلهٔ بعد نمی‌رود');
  await r0.locator('.c-qty input').fill(String(q)); await sleep(300);
  await buyer(page, M); await gridNext(page, M);
  ok(await M.locator('.pg2').isVisible(), 'مرحلهٔ تسویه باز شد');
  ok((await M.locator('.pg-il').innerText()).includes('ارسال با پیک'), 'توضیح ردیف در فهرست اقلام مرحلهٔ ۲ دیده می‌شود');
  await M.locator('[data-act=submit]').click(); await sleep(2200);
  const t2 = await D(); const sale = t2.v_sales.sort((a, b) => b.id - a.id)[0], sl = t2.sale_lines.filter(l => l.sale_id === sale.id);
  ok(+sale.total === q * price, `مبلغ فاکتور ${sale.total}`);
  ok(sl.length === 2 && sl[0].lot_id === l1.id && sl[0].qty === l1.rem_m && sl[1].lot_id === l2.id && sl[1].qty === 2 && sl.every(l => l.note === NOTE.trim()), 'FIFO: اول پارت قدیمی‌تر بعد پارت جدید؛ توضیح روی هر خط ذخیره شد');
  ok(Math.abs(+t2.v_totals.check_diff) < 1, 'ترازنامهٔ کنترلی صفر');
  // جزئیات فروش توضیح ردیف را نشان می‌دهد
  await go('#/sales'); await page.locator('tbody tr', { hasText: sale.no }).first().click(); await sleep(500);
  ok((await page.locator('.ov').last().innerText()).includes('کارت هدیه'), 'جزئیات فروش توضیح ردیف را نشان می‌دهد');
  await page.keyboard.press('Escape'); await sleep(300);
  // موبایل: کارت دو‌ستونه با چهار فیلد در یک سطر
  const mp = await newPage(browser, url, { logs, viewport: { width: 390, height: 844 } }); await login(mp, 'mahsa@example.com', 'mahsa-pass-1'); mp.setDefaultTimeout(8000);
  await mp.evaluate(() => { location.hash = '#/sales'; }); await mp.waitForTimeout(500); await mp.click('text=＋ فروش جدید'); await mp.waitForTimeout(700);
  const MM = mp.locator('.ov').last(); await gridRow(mp, MM, 0, { name: 'جوراب', qty: 2, price: 150000 }); await mp.waitForTimeout(300);
  const lay = await mp.evaluate(() => { const r = document.querySelector('.pgrow'); const ys = ['.c-qty input', '.c-fee input', '.pg-dl label:nth-child(1) input', '.pg-dl label:nth-child(2) input'].map(s => Math.round(r.querySelector(s).getBoundingClientRect().top)); return { ys, ovf: document.documentElement.scrollWidth > innerWidth + 2, wfee: r.querySelector('.c-fee input').getBoundingClientRect().width, wq: r.querySelector('.c-qty input').getBoundingClientRect().width }; });
  ok(new Set(lay.ys).size === 1 && !lay.ovf && lay.wfee > lay.wq * 1.6, 'موبایل: تعداد، فی، مهسا و رعنا در یک سطر؛ فی عریض‌تر؛ بدون اسکرول افقی ' + JSON.stringify(lay));
  await mp.screenshot({ path: '/tmp/sale_mobile.png' });
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.stack.split('\n').slice(0, 3).join(' / ')); fails++; }
await browser.close(); srv.close();
console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
