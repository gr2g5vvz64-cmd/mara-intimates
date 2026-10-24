// مشاور خرید: فقط کالای واقعاً پرفروش پیشنهاد خرید می‌گیرد؛ کم‌فروش‌ها «خرید نکن»؛ تب گزارش جلسه در صفحه‌ی تحلیل هست
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const post = async (tok, path, body) => (await (await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })).json());
const tok = (await post('', '/api/auth/login/', { identifier: 'hamid@example.com', password: 'hamid-pass-333' })).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const R = async (fn, p) => (await post(tok, '/api/rpc/' + fn + '/', p));
const iso = k => new Date(Date.now() - k * 864e5).toISOString().slice(0, 10);
const t0 = await D(); const sup = t0.suppliers[0].id, ac = t0.accounts.find(a => a.name === 'حساب مهسا').id;
const mk = async n => (await R('save_item', { name: n, category: 'شورت' })).data.result.id;
const A = await mk('مشاور پرفروش'), B = await mk('مشاور تک‌فروش'), C = await mk('مشاور راکد');
await R('create_purchase', { supplier_id: sup, ship_cost: 0, payments: [], lines: [{ item_id: A, qty: 8, unit_price: 100000, hold_m: 8, hold_r: 0 }, { item_id: B, qty: 5, unit_price: 100000, hold_m: 5, hold_r: 0 }, { item_id: C, qty: 6, unit_price: 100000, hold_m: 6, hold_r: 0 }] });
const sale = (item, k, cust) => R('create_sale', { date: iso(k), seller: 'مهسا', channel: 'آشنایان', customer: cust, received: 150000, account_id: ac, lines: [{ item_id: item, qty: 1, unit_price: 150000 }] });
for (const [k, c] of [[1, 'ا۱'], [2, 'ب۱'], [3, 'ا۱'], [4, 'ب۱'], [5, 'ا۱'], [6, 'ب۱']]) await sale(A, k, 'مشتری ' + c);
await sale(B, 3, 'مشتری ا۱');
const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(9000);
const sleep = ms => page.waitForTimeout(ms), M = page.locator('.ov');
try {
  await page.evaluate(() => { location.hash = '#/analysis'; }); await sleep(1500);
  const tabs = await page.locator('.tabs button, .tabs a, .tabs [role=tab]').allInnerTexts();
  ok(tabs.some(x => x.includes('مشاور خرید')) && tabs.some(x => x.includes('گزارش جلسه')), 'تب‌های تحلیل: ' + tabs.map(x => x.trim()).join(' | '));
  const body = await page.locator('#view').innerText();
  ok(/بخرید/.test(body) && body.includes('مشاور پرفروش'), 'کالای پرفروش در لیست «بخرید» است');
  const buyRow = page.locator('tbody tr', { hasText: 'مشاور پرفروش' }).first();
  ok(/بخرید|تمام/.test(await buyRow.innerText()) && /عدد/.test(await buyRow.innerText()), 'مقدار پیشنهادی خرید نوشته شده: ' + (await buyRow.innerText()).replace(/\s+/g, ' ').slice(0, 100));
  const buySec = (await page.locator('#view h3', { hasText: 'بخرید' }).first().evaluate(h => { let t = ''; let n = h.nextElementSibling; while (n && n.tagName !== 'H3') { t += n.innerText + '\n'; n = n.nextElementSibling; } return t; }));
  ok(!buySec.includes('مشاور تک‌فروش') && !buySec.includes('مشاور راکد'), 'کالای تک‌فروش و راکد در لیست «بخرید» نیستند');
  const avoidSec = (await page.locator('#view h3', { hasText: 'خرید نکنید' }).first().evaluate(h => { let t = ''; let n = h.nextElementSibling; while (n && n.tagName !== 'H3') { t += n.innerText + '\n'; n = n.nextElementSibling; } return t; }));
  ok(avoidSec.includes('مشاور راکد'), 'کالای راکد در «خرید نکنید» است');
  // ثبت خرید از روی پیشنهاد: فرم با کالا و تعداد پر می‌شود و نظر مشاور دیده می‌شود
  await buyRow.locator('button', { hasText: 'ثبت خرید' }).click(); await M.waitFor(); await sleep(900);
  ok((await M.locator('.pgrow').first().locator('.c-name input').inputValue()).includes('مشاور پرفروش'), 'فرم خرید با کالای پیشنهادی باز شد');
  ok(await M.locator('.advbox.buy:visible, .advbox.urgent:visible').count() === 1, 'در فرم خرید، نظر مشاور (بخرید) دیده می‌شود');
  await page.keyboard.press('Escape'); await sleep(300);
  // خرید یک کالای راکد: هشدار «خرید نکن» در فرم خرید
  await page.evaluate(() => { location.hash = '#/purchases'; }); await sleep(500); await page.click('text=＋ خرید جدید'); await M.waitFor();
  await M.locator('.pgrow').first().locator('.c-name input').fill('مشاور راکد'); await sleep(200); await page.locator('.cmb-list:not([hidden]) .cmb-o').first().click(); await sleep(1200);
  ok(await M.locator('.advbox.avoid:visible').count() === 1, 'هشدار «خرید نکن» برای کالای راکد در فرم خرید');
  await page.keyboard.press('Escape'); await sleep(300);
  // تب گزارش جلسه
  await page.evaluate(() => { location.hash = '#/analysis'; }); await sleep(800);
  await page.locator('.tabs', {}).getByText('گزارش جلسه').first().click(); await sleep(900);
  ok(page.url().includes('#/meeting') && (await page.locator('#view').innerText()).includes('گزارش جلسه'), 'تب گزارش جلسه‌ی دو هفته‌ای باز می‌شود');
  // متن برای بات
  const ar = await (await fetch(API + '/api/advisor/?days=30', { headers: { authorization: 'Bearer ' + tok } })).json(); ok(ar.ok !== false && ar.data.items.length > 0, 'API مشاور جواب می‌دهد');
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close();
console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
