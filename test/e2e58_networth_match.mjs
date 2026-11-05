import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const API = 'http://localhost:8111';
try {
  const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
  const d = (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
  const acc = d.accounts.find(a => a.kind !== 'pocket').id, sup = d.suppliers[0].id, it = d.items[0].id;
  // یک خرید نسیه (بدهی به تامین‌کننده) تا بدهی صفر نباشد
  const r = await (await fetch(API + '/api/rpc/create_purchase/', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ supplier_id: sup, ship_cost: 0, lines: [{ item_id: it, qty: 10, unit_price: 1000000, hold_m: 5, hold_r: 5 }], payments: [], cheques: [] }) })).json();
  ok(r.ok, 'خرید نسیه ثبت شد (بدهی ۱۰ میلیون)');
  const a = await newPage(browser, url, { logs, viewport: { width: 1280, height: 900 } }); await login(a, 'hamid@example.com', 'hamid-pass-333'); a.setDefaultTimeout(9000); await a.waitForTimeout(1500);
  const t = await a.locator('#view').innerText();
  const worth = await a.evaluate(async () => (await import('/js/store.js')).S.totals.net_worth);
  ok(/جمع دارایی‌ها/.test(t) && /بدهی ما/.test(t) && /ارزش خالص کسب‌وکار/.test(t), 'کارت سلامت سرمایه: دارایی، بدهی و ارزش خالص نوشته شده');
  const m = await a.evaluate(() => { const rows = [...document.querySelectorAll('.hc .srow')].map(r => r.innerText.replace(/\s+/g, ' ')); return rows.find(x => /ارزش خالص/.test(x)) || ''; });
  const shown = Number((m.match(/([\d.]+)\s*(?:میلیون|ریال)/) || [])[1]);
  console.log('worth=', worth, 'row=', m);
  ok(Math.abs(shown - worth / 1e6) < 0.06, `ارزش خالص پایین (${shown} میلیون) با ارزش کسب‌وکار بالا (${(worth / 1e6).toFixed(1)} میلیون) یکی است`);
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول');
} catch (e) { console.log('ERR', e.message.split('\n')[0]); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
