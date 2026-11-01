// مرجوعی چندردیفی (یک فاکتور، چند قلم، یک‌جا) + تغییر خریدار فاکتور + ویرایش نام مشتری
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const post = async (tok, path, body) => (await (await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })).json());
const tok = (await post('', '/api/auth/login/', { identifier: 'hamid@example.com', password: 'hamid-pass-333' })).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
try {
  let tb = await D();
  const lots = tb.v_lots.filter(l => !l.voided && l.rem_m >= 3), items = [...new Set(lots.map(l => l.item_id))].slice(0, 3);
  const acc = tb.accounts.find(a => a.kind !== 'pocket' && a.active !== false);
  const c1 = await post(tok, '/api/rpc/save_customer/', { name: 'خریدار آزمون A' }), c2 = await post(tok, '/api/rpc/save_customer/', { name: 'خریدار آزمون B' });
  const sale = await post(tok, '/api/rpc/create_sale/', { seller: 'مهسا', channel: 'پیج اینستاگرام', customer_id: c1.data.result.id, account_id: acc.id, lines: items.map(i => ({ item_id: i, qty: 3, unit_price: 500000, holder: 'مهسا' })) });
  ok(sale.ok && items.length === 3, 'فاکتور سه‌قلمی برای آزمون ساخته شد: ' + (sale.data && sale.data.result.no));
  const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(9000);
  globalThis.__p = page; const sleep = ms => page.waitForTimeout(ms);
  await page.evaluate(() => { location.hash = '#/sales'; }); await sleep(1200);
  await page.locator('tr', { hasText: sale.data.result.no }).first().click(); await page.locator('.ov').waitFor(); await sleep(400);
  ok(await page.locator('.ov button', { hasText: 'تغییر خریدار' }).count() === 1 && await page.locator('.ov button', { hasText: 'اصلاح نام مشتری' }).count() === 1, 'در فاکتور: «تغییر خریدار» و «ویرایش مشتری» هست');
  // مرجوعی چندردیفی
  await page.locator('.ov button', { hasText: /^مرجوعی$/ }).click(); await sleep(700);
  const cards = page.locator('.ov .rb-lines .card'); ok(await cards.count() === 3, 'هر سه قلم فاکتور در یک جدول دیده می‌شود');
  await page.locator('.ov button', { hasText: 'همه‌ی قلم‌ها' }).click(); await sleep(300);
  await cards.nth(2).locator('.stp-i').fill('0'); await cards.nth(2).locator('.stp-i').blur(); await sleep(300);
  const sm = await page.locator('.ov .sumbox').innerText(); ok(/۲|2/.test(sm) && /قلم/.test(sm), 'خلاصه‌ی دو قلم: ' + sm.replace(/\n/g, ' | ').slice(0, 80));
  await page.locator('.ov button', { hasText: 'ثبت مرجوعی' }).click(); await sleep(2000);
  tb = await D(); const sl = tb.sale_lines.filter(l => l.sale_id === sale.data.result.id);
  ok(sl.filter(l => l.returned_qty === 3).length === 2 && sl.filter(l => l.returned_qty === 0).length === 1, 'دو قلم کامل برگشت خورد و قلم سوم دست‌نخورده ماند (یک‌جا)');
  ok(tb.returns.filter(r => sl.some(l => l.id === r.sale_line_id)).length === 2, 'دو ردیف مرجوعی ثبت شد');
  // تغییر خریدار
  await page.evaluate(() => { location.hash = '#/sales'; }); await sleep(900);
  await page.locator('tr', { hasText: sale.data.result.no }).first().click(); await page.locator('.ov').waitFor(); await sleep(300);
  await page.locator('.ov button', { hasText: 'تغییر خریدار' }).click(); await sleep(500);
  await page.locator('.ov .cmb .inp').first().click(); await page.locator('.ov .cmb-o', { hasText: 'خریدار آزمون B' }).first().click(); await sleep(200);
  await page.locator('.ov button', { hasText: 'ذخیره‌ی خریدار جدید' }).click(); await sleep(1800);
  tb = await D(); ok(tb.v_sales.find(s => s.id === sale.data.result.id).customer_id === c2.data.result.id, 'خریدار فاکتور عوض شد');
  // ویرایش نام مشتری
  await page.evaluate(() => { location.hash = '#/sales'; }); await sleep(900);
  await page.locator('tr', { hasText: sale.data.result.no }).first().click(); await page.locator('.ov').waitFor(); await sleep(300);
  await page.locator('.ov button', { hasText: 'اصلاح نام مشتری' }).click(); await sleep(500);
  await page.locator('.ov input.inp').first().fill('خریدار آزمون B (اصلاح‌شده)'); await page.locator('.ov button', { hasText: /^ذخیره$/ }).click(); await sleep(1800);
  tb = await D(); ok(tb.customers.find(c => c.id === c2.data.result.id).name === 'خریدار آزمون B (اصلاح‌شده)' && tb.v_sales.find(s => s.id === sale.data.result.id).customer === 'خریدار آزمون B (اصلاح‌شده)', 'نام مشتری ویرایش شد و روی فاکتورها هم عوض شد');
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/i.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join('|') : ''));
} catch (e) { console.log('FAIL exception', e.message.split('\n')[0], (e.message.match(/locator\([^\n]*/)||[''])[0]); try { await globalThis.__p.screenshot({ path: '/tmp/e52.png' }); } catch {} fails++; }
await browser.close(); srv.close(); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
