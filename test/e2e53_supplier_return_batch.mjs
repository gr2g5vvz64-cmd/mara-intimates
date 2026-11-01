import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const M = page.locator('.ov'), sleep = ms => page.waitForTimeout(ms);
try {
  const t0 = await D();
  await page.evaluate(() => { location.hash = '#/stock'; }); await sleep(500); await page.click('text=برگشت به تامین‌کننده');
  await M.locator('.cmb input').first().click(); await M.locator('.cmb-o').first().click(); await sleep(400);
  const cards = M.locator('.rb-lines .card'); const n = await cards.count();
  ok(n >= 1, `دسته‌های موجود فهرست شد (${n})`);
  let picked = 0;
  for (let i = 0; i < Math.min(n, 2); i++) { const c = cards.nth(i); await c.locator('.stp-i').fill('1'); await c.locator('.stp-i').blur(); picked++; }
  await sleep(200);
  ok(/اعتبار از بدهی/.test(await M.innerText()), 'پیش‌نمایش اعتبار نمایش داده شد');
  await M.locator('button', { hasText: 'ثبت برگشت به تامین‌کننده' }).click(); await sleep(1800);
  const t1 = await D(); const rs = t1.returns.filter(x => x.kind === 'supplier'), rs0 = t0.returns.filter(x => x.kind === 'supplier');
  ok(rs.length - rs0.length === picked, `${picked} ردیف برگشت ثبت شد`);
  ok(Math.abs(t1.v_totals.check_diff) < 1, 'ترازنامه‌ی کنترلی صفر');
  // دکمه‌ی اشتراک‌گذاری عکس حذف شده باشد
  await page.evaluate(() => { location.hash = '#/trade'; }); await sleep(600);
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d/.test(l)); if (real.length) { console.log(real); fails++; }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await page.screenshot({ path: 'shots/fail.png' }); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
