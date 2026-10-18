// ماتریس ثبت: برای هر نوع ثبت جداگانه، قطع شبکه شبیه‌سازی می‌شود و باید دقیقاً یک ردیف در جنگو بنشیند
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(9000);
const acc = n => t => t.accounts.find(a => a.name === n).id;
const cases = async () => {
  const t = await D(); const it = t.items.find(i => i.name.includes('جوراب')).id, sp = t.suppliers[1].id;
  const lot = t.v_lots.find(l => l.rem_m > 1 && l.rem_r >= 0), debtSale = t.v_sales.find(s => s.outstanding > 0), cus = t.v_customer_balance.find(c => c.outstanding > 0);
  const sl = t.sale_lines.find(l => l.qty - l.returned_qty > 0), inv = t.v_invoices.find(i => i.debt > 0);
  return [
    ['save_item', { name: 'کالای آزمایشی', category: 'شورت' }, 'items'], ['save_supplier', { name: 'تامین‌کننده‌ی آزمایشی' }, 'suppliers'], ['save_customer', { name: 'مشتری آزمایشی' }, 'customers'],
    ['create_purchase', { supplier_id: sp, ship_cost: 0, lines: [{ item_id: it, qty: 2, unit_price: 100000, hold_m: 2, hold_r: 0 }], payments: [] }, 'purchase_invoices'],
    ['create_sale', { seller: 'مهسا', channel: 'پیج اینستاگرام', received: null, customer: 'خریدار ماتریس', account_id: acc('حساب مهسا')(t), lines: [{ item_id: it, qty: 1, unit_price: 300000, holder: 'مهسا' }] }, 'v_sales'],
    ['add_expense', { category: 'تبلیغات', amount: 1000, account_id: acc('نقد مهسا')(t) }, 'expenses'],
    ['add_transfer', { from_account_id: acc('حساب مهسا')(t), to_account_id: acc('نقد مهسا')(t), amount: 1000, kind: 'transfer' }, 'transfers'],
    ['move_stock', { lot_id: lot.id, from_holder: 'مهسا', to_holder: 'رعنا', qty: 1 }, 'stock_moves'],
    ['add_supplier_payment', { supplier_id: inv.supplier_id, invoice_id: inv.id, account_id: acc('حساب رعنا')(t), amount: 1000 }, 'supplier_payments'],
    ['add_collection', { sale_id: debtSale.id, account_id: acc('حساب رعنا')(t), amount: 1000 }, 'collections'],
    ['collect_customer', { customer_id: cus.id, account_id: acc('حساب رعنا')(t), amount: 1000 }, 'collections'],
    ['create_return', { sale_line_id: sl.id, holder: 'مهسا', qty: 1, condition: 'سالم', to_supplier: false, refund_amount: 0 }, 'returns'],
    ['create_supplier_return', { lot_id: lot.id, holder: 'مهسا', qty: 1 }, 'returns'],
    ['set_due_date', { kind: 'purchase', id: inv.id, due_date: '2099-01-01' }, null, t2 => t2.v_invoices.find(i => i.id === inv.id).due_date === '2099-01-01'],
  ];
};
try {
  for (const [fn, payload, table, check] of await cases()) {
    const before = await D(); const n0 = table ? before[table].length : 0; let calls = 0;
    await page.route(`**/api/rpc/${fn}/`, r => (++calls <= 1 ? r.abort('failed') : r.continue()));
    const res = await page.evaluate(async ([f, p]) => { const m = await import(new URL('js/outbox.js', location.href)); return JSON.stringify(await m.rpc(f, p)); }, [fn, payload]);
    const queued = /queued/.test(res);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('mara.outbox.v1') || '[]').length === 0, null, { timeout: 25000 }).catch(() => {});
    const after = await D(); const left = await page.evaluate(() => JSON.parse(localStorage.getItem('mara.outbox.v1') || '[]').length);
    const good = check ? check(after) : after[table].length === n0 + 1;
    ok(queued && left === 0 && good, `${fn}: قطع شبکه ← صف ← ذخیره (${table ? n0 + ' → ' + after[table].length : 'بررسی وضعیت'}) · تماس‌ها ${calls}`);
    await page.unroute(`**/api/rpc/${fn}/`);
  }
  // ابطال آخرین هزینه
  const t = await D(); const e = t.expenses.slice().sort((a, b) => b.id - a.id)[0]; let c = 0;
  await page.route('**/api/rpc/void_entry/', r => (++c <= 1 ? r.abort('failed') : r.continue()));
  await page.evaluate(async id => { const m = await import(new URL('js/outbox.js', location.href)); await m.rpc('void_entry', { kind: 'expense', id, reason: 'تست' }); }, e.id);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('mara.outbox.v1') || '[]').length === 0, null, { timeout: 25000 }).catch(() => {});
  ok((await D()).expenses.find(x => x.id === e.id).voided === true, 'void_entry: قطع شبکه ← صف ← ابطال شد');
  const fin = await D(); ok(Math.abs(fin.v_totals.check_diff) < 1, 'ترازنامه‌ی کنترلی بعد از همه‌ی ثبت‌ها صفر است: ' + fin.v_totals.check_diff);
} catch (e) { console.log('ERR', e.message.split('\n')[0]); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
