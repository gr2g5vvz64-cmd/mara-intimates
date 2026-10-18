import { serve, launch, newPage, login, API, buyer } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const fa = x => String(x).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,\s]/g, '');
const post = async (tok, path, body) => (await (await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })).json());
const tok = (await post('', '/api/auth/login/', { identifier: 'hamid@example.com', password: 'hamid-pass-333' })).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const K = n => Math.round(n / 1000) * 1000;
const t0 = await D(); const item = t0.items.find(i => i.name.startsWith('شورت')); const sup = t0.suppliers[0];
// خرید دومِ همین کالا با قیمت دیگر → دو پارت
const pr = await post(tok, '/api/rpc/create_purchase/', { supplier_id: sup.id, ship_cost: 0, lines: [{ item_id: item.id, qty: 6, unit_price: 1500000, hold_m: 6, hold_r: 0 }], payments: [] });
ok(pr.ok !== false, 'خرید دوم برای ساخت دو پارت ثبت شد');
const t1 = await D(); const lots = t1.v_lots.filter(l => l.item_id === item.id && !l.voided).sort((a, b) => a.id - b.id);
ok(lots.length === 2, 'کالا دو پارت دارد: ' + lots.map(l => `${l.lot_no}=${Math.round(l.landed_unit)}`).join(' | '));
const [l1, l2] = lots;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const M = page.locator('.ov'), sleep = ms => page.waitForTimeout(ms);
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(500); };
const priceOf = c => c.locator('.c-price input').inputValue().then(fa);
const costOf = c => c.locator('.c-cost .ro').innerText().then(fa);
try {
  await go('#/sales'); await page.click('text=＋ فروش جدید'); await M.waitFor();
  const c1 = M.locator('.lcard').first();
  const tops = async c => (await c.locator('.sline > .fld, .sline > .rm').evaluateAll(a => a.map(x => Math.round(x.getBoundingClientRect().bottom))));
  ok(new Set(await tops(c1)).size === 1, 'چهار فیلد (نام، تعداد، بهای تمام‌شده، فی فروش) در یک ردیف‌اند');
  ok(await c1.locator('.c-cost .ro').innerText() === '—', 'قبل از انتخاب کالا بهای تمام‌شده خالی است');
  await c1.locator('.cmb input').fill('شورت'); await c1.locator('.cmb-o').first().click(); await sleep(300);
  ok(await c1.locator('.lotchip').count() === 3, 'نوار پارت‌ها: خودکار + ۲ پارت');
  const chipT = (await c1.locator('.lotchip').allInnerTexts()).map(x => x.replace(/\s+/g, ' ')); console.log('   ', chipT.join(' || '));
  ok(chipT.some(x => x.includes(l1.lot_no) && x.includes(fa(Math.round(l1.landed_unit)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')) || x.includes(l1.lot_no)) && chipT.some(x => x.includes(l2.lot_no)), 'هر پارت: شماره، تعداد و بهای تمام‌شده نمایش داده می‌شود');
  ok(await costOf(c1) === String(Math.round(l1.landed_unit)), `خودکار: بهای تمام‌شده = قدیمی‌ترین پارت (${Math.round(l1.landed_unit)}) → ${await costOf(c1)}`);
  ok(await priceOf(c1) === String(K(l1.landed_unit * 1.2)), `فی فروش پیش‌فرض = ۲۰٪ بالاتر (گرد هزار): ${K(l1.landed_unit * 1.2)} → ${await priceOf(c1)}`);
  // انتخاب پارت دوم
  await c1.locator(`.lotchip[data-lot="${l2.id}"]`).click(); await sleep(200);
  ok(await costOf(c1) === String(Math.round(l2.landed_unit)) && await priceOf(c1) === String(K(l2.landed_unit * 1.2)), `انتخاب ${l2.lot_no}: بهای تمام‌شده ${await costOf(c1)} و فی فروش ${await priceOf(c1)} (انتظار ${K(l2.landed_unit * 1.2)})`);
  ok(await c1.locator(`.lotchip.on[data-lot="${l2.id}"]`).count() === 1, 'پارت انتخاب‌شده مشخص است');
  // قیمت دستی با تغییر تعداد نمی‌پرد
  await c1.locator('.c-price input').fill('2000000'); await c1.locator('.stp.big .stp-i').fill('2'); await sleep(250);
  ok(await priceOf(c1) === '2000000', 'قیمت دستی با تغییر تعداد حفظ می‌شود');
  await c1.locator(`.lotchip[data-lot="${l2.id}"]`).click(); await sleep(200);
  ok(await priceOf(c1) === String(K(l2.landed_unit * 1.2)), 'انتخاب پارت دوباره فی فروش را به ۲۰٪ برمی‌گرداند');
  // ردیف دوم
  await page.click('text=＋ افزودن کالای دیگر'); await sleep(200);
  ok(await M.locator('.lcard').count() === 2, 'کالای دوم در ردیف بعدی اضافه شد');
  const c2 = M.locator('.lcard').nth(1);
  ok(new Set(await tops(c2)).size === 1, 'ردیف دوم هم چهار فیلد در یک خط است');
  await c2.locator('.cmb input').fill('جوراب'); await c2.locator('.cmb-o').first().click(); await sleep(250);
  const sock = t1.v_lots.find(l => l.item.startsWith('جوراب'));
  ok(await c2.locator('.lotchip:visible').count() === 0, 'کالای تک‌پارتی نوار پارت ندارد');
  ok(await costOf(c2) === String(Math.round(sock.landed_unit)) && await priceOf(c2) === String(K(sock.landed_unit * 1.2)), `جوراب: بهای تمام‌شده ${await costOf(c2)} · فی فروش ${await priceOf(c2)}`);
  // ثبت
  await buyer(page, page.locator('.ov').last());
  await page.locator('.sheet-f button', { hasText: 'ثبت فروش' }).click(); await sleep(2000);
  const t2 = await D(); const sl = t2.sale_lines.filter(x => x.item_id === item.id).sort((a, b) => b.id - a.id)[0];
  ok(sl && Math.round(sl.unit_price) === K(l2.landed_unit * 1.2) && sl.lot_id === l2.id && sl.qty === 2, `ثبت شد: فی فروش ${sl && sl.unit_price} از پارت ${sl && sl.lot_id} تعداد ${sl && sl.qty}`);
  // موبایل: نام بالا، سه فیلد در یک خط
  const mp = await newPage(browser, url, { logs, viewport: { width: 390, height: 800 } }); await login(mp, 'rana@example.com', 'rana-pass-22'); mp.setDefaultTimeout(8000);
  await mp.evaluate(() => { location.hash = '#/sales'; }); await mp.waitForTimeout(500); await mp.click('text=＋ فروش جدید'); await mp.waitForTimeout(400);
  const mc = mp.locator('.ov .lcard').first(); const mt = await mc.locator('.sline > .fld').evaluateAll(a => a.map(x => Math.round(x.getBoundingClientRect().bottom)));
  ok(mt[0] < mt[1] && mt[1] === mt[2], 'موبایل: نام کالا بالا، تعداد/بهای تمام‌شده/فی فروش در یک خط ' + mt.join(','));
  const ov = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); ok(!ov, 'موبایل: اسکرول افقی ندارد');
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close();
console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
