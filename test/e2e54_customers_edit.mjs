import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const M = page.locator('.ov'), sleep = ms => page.waitForTimeout(ms);
try {
  const t0 = await D(); const c0 = t0.customers.find(c => c.active !== false && !t0.v_customer_balance.find(b => b.id === c.id && b.outstanding > 0.5));
  await page.evaluate(() => { location.hash = '#/customers'; }); await sleep(600);
  const row = page.locator('tr', { hasText: c0.name }).first();
  ok(await row.count() === 1, 'مشتری بدون بدهی هم در صفحه‌ی مشتریان هست: ' + c0.name);
  await row.locator('button', { hasText: 'ویرایش' }).click(); await sleep(300);
  await M.locator('input[placeholder="نام مشتری"]').fill(c0.name + ' ویرایش'); await M.locator('input[inputmode="tel"]').fill('09120000001'); await M.locator('textarea').fill('تهران، خیابان آزمون');
  await M.locator('button', { hasText: 'ذخیره' }).first().click(); await sleep(1500);
  const c1 = (await D()).customers.find(c => c.id === c0.id);
  ok(c1.name === c0.name + ' ویرایش' && c1.phone === '09120000001' && c1.address === 'تهران، خیابان آزمون', 'نام، تلفن و نشانی ذخیره شد');
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d/.test(l)); if (real.length) { console.log(real); fails++; }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await page.screenshot({ path: 'shots/fail.png' }); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
