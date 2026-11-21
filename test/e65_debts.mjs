// صفحه‌ی بدهکاران و بستانکاران (۷.۷۴)
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const T = (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
try {
  const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(9000);
  await page.evaluate(() => { location.hash = '#/debts'; }); await page.waitForTimeout(1000);
  const txt = await page.locator('#view').innerText();
  ok(/بدهکاران و بستانکاران/.test(txt) && /خالص/.test(txt), 'صفحه باز شد');
  const nOwe = T.v_customer_balance.filter(c => c.outstanding > 0.5).length + T.v_supplier_balance.filter(s => s.balance < -0.5).length;
  const nDue = T.v_customer_balance.filter(c => c.credit_bal > 0.5).length + T.v_supplier_balance.filter(s => s.balance > 0.5).length;
  const secs = page.locator('#view section.card');
  const r1 = await secs.nth(0).locator('tbody tr').count(), r2 = await secs.nth(1).locator('tbody tr').count();
  ok(r1 === nOwe, `ردیف بدهکاران ${r1} = ${nOwe}`); ok(r2 === nDue, `ردیف بستانکاران ${r2} = ${nDue}`);
  const menu = await page.locator('nav a[data-r="debts"]').count(); ok(menu >= 1, 'در منو هست');
} catch (e) { console.log('ERR', e.message); fails++; }
await browser.close(); srv.kill && srv.kill();
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
