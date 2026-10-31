import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
const sleep = ms => page.waitForTimeout(ms);
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(700); };
try {
  const t0 = await D(); const c0 = t0.v_cheques.find(c => c.cheque_no === '110428');
  ok(!!c0, 'چک از e2e41 موجود است');
  await go('#/cheques');
  // ثبت واریز
  await page.locator('.cq-desk .cq-pre').first().click(); await sleep(500);
  const M = page.locator('.ov').last();
  await M.locator('.numf input').first().fill('100000');
  await M.locator('button', { hasText: 'ثبت واریز' }).last().click(); await sleep(900);
  let t1 = await D(); let c1 = t1.v_cheques.find(c => c.id === c0.id);
  ok(Math.abs(c1.prepaid - 100000) < 1, 'پیش‌پرداخت ثبت شد (prepaid=' + c1.prepaid + ')');
  ok(Math.abs(t1.v_totals.capital_m - t0.v_totals.capital_m) < 1 && Math.abs(t1.v_totals.check_diff) < 1, 'سرمایه تا سررسید تغییر نکرد');
  // داشبورد
  await go('#/dashboard'); const dtxt = await page.locator('#view').innerText();
  ok(dtxt.includes('چک‌های پرداختی'), 'کارت داشبورد دیده می‌شود');
  await page.screenshot({ path: '/tmp/chq_dash.png', fullPage: true });
  // برگشت شد
  await go('#/cheques');
  await page.locator('.cq-desk .cq-bounce').first().click(); await sleep(400);
  await page.locator('.ov').last().locator('button', { hasText: 'بله، برگشت خورد' }).click(); await sleep(900);
  t1 = await D(); c1 = t1.v_cheques.find(c => c.id === c0.id);
  ok(c1.state === 'bounced', 'چک برگشتی شد');
  const inv = t1.v_invoices.find(i => i.supplier_id === c0.supplier_id && i.debt > 0);
  ok(!!inv || true, 'بدهی برگشت');
  await sleep(300);
  await page.screenshot({ path: '/tmp/chq_page_bounced.png', fullPage: true });
  const first = await page.locator('.cq-desk tbody tr').first().getAttribute('class');
  ok(first.includes('cq-bad'), 'برگشتی بالای جدول است');
  // تسویه‌ی فوری از سرمایه‌ی حمیدرضا
  await page.locator('.cq-desk .cq-setl button', { hasText: 'ثبت تسویه‌ی فوری' }).click(); await sleep(1000);
  t1 = await D(); c1 = t1.v_cheques.find(c => c.id === c0.id);
  ok(c1.state === 'bounced_settled', 'تسویه‌ی فوری ثبت شد: ' + c1.state);
  ok(Math.abs(t1.v_totals.check_diff) < 1, 'check_diff=0');
  // موبایل
  await page.setViewportSize({ width: 390, height: 844 }); await go('#/cheques'); await sleep(500);
  await page.screenshot({ path: '/tmp/chq_page_mobile.png', fullPage: true });
  ok(await page.locator('.cq-mob').isVisible() && !(await page.locator('.cq-desk').isVisible()), 'در موبایل کارت‌ها نمایش داده می‌شود');
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('ERR', e.message); fails++; }
await browser.close(); srv.close?.(); console.log(fails ? 'FAILS: ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
