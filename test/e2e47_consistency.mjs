// یکی‌بودن عددهای مهم در جاهای مختلف (کلاینت، سرور، صفحه‌ی مالی و حساب‌وکتاب) — هر جا اختلاف شد خطا می‌دهد
import { serve, launch, newPage, login, API } from './h5.mjs';
import { execSync } from 'node:child_process';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tokOf = async (id, pw) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: id, password: pw }) })).json()).data.token;
const tok = await tokOf('hamid@example.com', 'hamid-pass-333'); const H = { 'content-type': 'application/json', authorization: 'Bearer ' + tok };
const rpc = async (fn, p) => { const r = await fetch(API + '/api/rpc/' + fn + '/', { method: 'POST', headers: H, body: JSON.stringify(p) }); return { s: r.status, j: await r.json() }; };
const T0 = (await (await fetch(API + '/api/data/', { headers: H })).json()).data.tables; const it = T0.v_stock.filter(x => x.rem >= 8).sort((a, b) => b.rem - a.rem)[0], bank = T0.accounts.find(a => a.kind !== 'pocket').id;
const cost = it.value / it.rem, today = new Date().toISOString().slice(0, 10);
const parts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
const key = parts.find(p => p.type === 'year').value.replace(/\D/g, '').slice(0, 4) + '-' + parts.find(p => p.type === 'month').value;
for (const o of ['مهسا', 'رعنا']) await rpc('set_goal', { month: key, owner: o, amount: Math.round(cost * 1.3 * 4) });
const sale = (seller, qty, ch, recv) => rpc('create_sale', { seller, channel: ch, customer: 'مشتری ' + seller, received: recv, account_id: bank, lines: [{ item_id: it.id, qty, unit_price: Math.round(cost * 1.3) }] });
await sale('مهسا', 5, 'آشنایان', Math.round(cost * 1.3) * 5); await sale('رعنا', 2, 'آشنایان', Math.round(cost * 1.3)); await sale('رعنا', 1, 'پیج اینستاگرام', Math.round(cost * 1.3));
await rpc('add_expense', { date: today, category: 'تبلیغات', amount: 300000, account_id: bank, kind: 'variable' });
// کسری انبارگردانی ۴۰۰ هزار ریال روی مهسا (مستقیم در دیتابیس تست)
execSync(`python3 -c "import psycopg;c=psycopg.connect('host=/tmp port=5433 user=postgres dbname=mara_e2e',autocommit=True);c.execute(\\"insert into partner_charges(date,partner,amount,note) values (current_date,'مهسا',400000,'تست')\\")"`);
try {
  const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000); await page.waitForTimeout(1200);
  const R = await page.evaluate(async key => {
    const st = await import('/js/store.js'), dw = await import('/js/dash_widgets.js'), an = await import('/js/analytics.js'), ins = await import('/js/insights.js');
    const { S } = st, sum = (a, f) => a.reduce((x, y) => x + f(y), 0), act = st.activeSales(), T = S.totals, mo = st.monthly().find(m => m.key === key) || {};
    const rep = (await st.api('/api/report/month/?month=' + key)).data, hd = dw.healthData();
    return { T, p: rep.pnl, set: rep.settlement, mo, hd: { sales: hd.st.sales, profit: hd.st.profit }, sumSalesProfit: sum(act, s => s.profit), exp: sum(S.expenses.filter(e => !e.voided), e => e.amount),
      cus: sum(S.vCus, c => c.outstanding), salesOut: sum(act, s => s.outstanding || 0), stock: sum(S.stock, i => i.value), biz: sum(st.businessAccounts(), a => st.accBalance(a.id)),
      goalDone: sum(['مهسا', 'رعنا'], n => ins.goalProgress(n, key).done), bonus: ins.bonusMonth(key), bonusAll: ins.bonusLifetime(), charges: S.charges.length };
  }, key);
  const near = (a, b, m) => ok(Math.abs(a - b) <= 1, `${m} (${Math.round(a)} ≟ ${Math.round(b)})`);
  near(R.T.profit, R.sumSalesProfit - R.exp, 'سود کل = Σ سود فروش‌ها − هزینه‌ها');
  near(R.T.receivable, R.cus, 'طلب: خلاصه = Σ مشتری‌ها'); near(R.T.receivable, R.salesOut, 'طلب: خلاصه = Σ فاکتورها');
  near(R.T.stock_value, R.stock, 'انبار: خلاصه = Σ کالاها'); near(R.T.business_balance, R.biz, 'پول حساب‌ها: خلاصه = Σ حساب‌ها');
  near(R.p.revenue, R.mo.sales, 'فروش ماه: سرور = کلاینت'); near(R.p.revenue, R.hd.sales, 'فروش ماه: سرور = کارت سلامت سرمایه');
  near(R.p.net_profit, R.mo.profit, 'سود ماه: سرور = کلاینت'); near(R.p.net_profit, R.hd.profit, 'سود ماه: سرور = کارت سلامت سرمایه');
  // کسری انبارگردانی در دو جا
  ok(R.charges >= 1, 'کسری انبارگردانی در داده‌ی کلاینت هست');
  await page.evaluate(() => { location.hash = '#/finance'; }); await page.waitForTimeout(1500);
  const fin = page.locator('#view table').filter({ hasText: 'سهم از سود' }).first();
  const fa = s => Number(String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,\s]/g, '').replace(/[^\d.-]/g, ''));
  for (const n of ['مهسا', 'رعنا']) {
    const cells = await fin.locator('tr', { hasText: n }).first().locator('td').allInnerTexts(); const ui = fa(cells[3]); const sv = R.set.people.find(x => x.name === n).profit_share_total;
    ok(Math.abs(ui - sv) <= 2, `سهم از سود ${n}: جدول مالی = حساب‌وکتاب سرور (${ui} ≟ ${Math.round(sv)})`);
  }
  await page.context().close();
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول ' + errs.slice(0, 2).join('|'));
} catch (e) { console.log('ERR', e.message); fails++; }
await browser.close(); srv.close?.(); console.log(fails ? 'FAILS: ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
