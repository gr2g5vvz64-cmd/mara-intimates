import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
try {
  const API = 'http://localhost:8111';
  const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'mahsa@example.com', password: 'mahsa-pass-1' }) })).json()).data.token;
  const rpc = async (n, b) => (await (await fetch(API + '/api/rpc/' + n + '/', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify(b) })).json());
  const d = (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
  const lot = d.v_lots.filter(l => !l.voided && l.rem_m >= 3)[0];
  const sale = await rpc('create_sale', { seller: 'مهسا', channel: 'x', customer: 'تست تطبیق', received: 0, due_date: '2099-02-01', lines: [{ item_id: lot.item_id, qty: 3, unit_price: 100000 }] });
  ok(sale.ok, 'فروش ۳ عددی برای تست ثبت شد');
  const d2 = (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
  const sl = d2.sale_lines.find(l => l.sale_id === sale.data.result.id);
  const r1 = await rpc('create_return', { sale_line_id: sl.id, qty: 1, condition: 'معیوب', holder: 'مهسا', refund_amount: 0 }); ok(r1.ok, 'برگشت معیوبِ بدون برگشت به انبار ثبت شد: ' + (r1.message || ''));
  const r2 = await rpc('create_return', { sale_line_id: sl.id, qty: 1, condition: 'سالم', holder: 'مهسا', refund_amount: 0 }); ok(r2.ok, 'برگشت سالم ثبت شد');
  const r3 = await rpc('create_supplier_return', { lot_id: lot.id, holder: 'مهسا', qty: 1 }); ok(r3.ok, 'برگشت به تامین‌کننده ثبت شد: ' + (r3.message || ''));
  const a = await newPage(browser, url, { logs }); await login(a, 'hamid@example.com', 'hamid-pass-333'); a.setDefaultTimeout(9000); await a.waitForTimeout(1500);
  const r = await a.evaluate(async () => { const m = await import('/js/pages/stockaudit.js'); const rows = m.audit(); return { n: rows.length, bad: rows.filter(x => x.diff !== 0).map(x => [x.name, x.bought, x.sold, x.retOk, x.supRet, x.rem, x.expected]) }; });
  console.log('items', r.n, 'bad', JSON.stringify(r.bad));
  ok(r.n > 0 && r.bad.length === 0, 'داده‌ی سالم: همه‌ی کالاها با ثبت‌ها می‌خوانند');
  await a.evaluate(() => { location.hash = '#/stockaudit'; }); await a.waitForTimeout(800);
  const t = await a.locator('#view').innerText(); ok(/تطبیق انبار/.test(t) && /همه‌ی کالاها با ثبت‌ها می‌خوانند/.test(t), 'صفحه باز می‌شود و «همه می‌خوانند» می‌گوید');
  // اختلاف مصنوعی
  await a.evaluate(async () => { const { S } = await import('/js/store.js'); S.lots.find(l => !l.voided).rem_m += 3; });
  await a.evaluate(() => { location.hash = '#/'; }); await a.waitForTimeout(300); await a.evaluate(() => { location.hash = '#/stockaudit'; }); await a.waitForTimeout(800);
  const t2 = await a.locator('#view').innerText(); ok(/\+3/.test(t2) && /ناهماهنگ/.test(t2), 'اختلاف ۳ عددی پیدا و نشان داده می‌شود');
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول');
} catch (e) { console.log('ERR', e.message.split('\n')[0]); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
