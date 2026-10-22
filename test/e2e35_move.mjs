// دکمه‌ی جابجایی بالای صفحه‌ی موجودی
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tokOf = async (e, p) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: e, password: p }) })).json()).data.token;
const rpc = async (tk, fn, body) => (await fetch(API + '/api/rpc/' + fn + '/', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tk }, body: JSON.stringify(body) })).json();
const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
const sleep = ms => page.waitForTimeout(ms), go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(700); };
try {
  const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + await tokOf('hamid@example.com', 'hamid-pass-333') } })).json()).data.tables;
  const sums = async () => { const t = await D(); const l = (t.lots || t.v_lots || []).filter(x => !x.voided); return [l.reduce((a, x) => a + (x.rem_m || 0), 0), l.reduce((a, x) => a + (x.rem_r || 0), 0)]; };
  const [m0, r0] = await sums();
  await go('#/stock'); await sleep(900);
  const hb = page.locator('.phead .acts button', { hasText: 'جابجایی' }); ok(await hb.count() === 1, 'دکمه‌ی جابجایی کنار خرید و برگشت هست');
  await page.locator('.chips button', { hasText: 'دسته' }).first().click().catch(() => {}); await sleep(300);
  ok(await page.locator('#view table tbody button', { hasText: 'جابجایی' }).count() === 0, 'دکمه‌ی جابجایی از جدول دسته‌ها برداشته شد');
  await hb.click(); await sleep(500);
  ok(await page.locator('.ov select').count() >= 1, 'فرم کالا را انتخاب می‌کند');
  await page.locator('.ov .chips button', { hasText: 'از مهسا به رعنا' }).click();
  await page.locator('.ov button', { hasText: 'ثبت جابجایی' }).click(); await sleep(1500);
  const [m1, r1] = await sums(); ok(m1 === m0 - 1 && r1 === r0 + 1, `تعداد جابجا شد: مهسا ${m0}→${m1}، رعنا ${r0}→${r1}`);
  const pm = await newPage(browser, url, { logs }); await login(pm, 'mahdi@example.com', 'mahdi-pass-44'); await pm.evaluate(() => { location.hash = '#/stock'; }); await pm.waitForTimeout(900);
  ok(await pm.locator('.phead .acts button', { hasText: 'جابجایی' }).count() === 0, 'مهدی (فقط‌بیننده) دکمه‌ی جابجایی را نمی‌بیند');
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close(); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
