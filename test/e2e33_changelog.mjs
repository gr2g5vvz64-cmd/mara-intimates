// تاریخچه: زبانه‌ی اصلاحات MARA و ۱۰ ردیف
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tokOf = async (e, p) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: e, password: p }) })).json()).data.token;
const rpc = async (tk, fn, body) => (await fetch(API + '/api/rpc/' + fn + '/', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tk }, body: JSON.stringify(body) })).json();
const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
const sleep = ms => page.waitForTimeout(ms), go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(700); };
try {
  await go('#/history'); await sleep(900);
  ok(await page.locator('.tabs button', { hasText: 'اصلاحات MARA' }).count() === 1, 'زبانه‌ی اصلاحات MARA هست');
  const n1 = await page.locator('#view table tbody tr').count(); ok(n1 <= 10, 'جدول تاریخچه حداکثر ۱۰ ردیف: ' + n1);
  await page.locator('.tabs button', { hasText: 'اصلاحات MARA' }).click(); await sleep(400);
  const n2 = await page.locator('#view table tbody tr').count(); ok(n2 === 10, 'اصلاحات: ۱۰ ردیف اول: ' + n2);
  ok(/۱۴۰۵\/۰۷/.test(await page.locator('#view').innerText()), 'تاریخ شمسی دارد');
  await page.locator('#view button', { hasText: 'نمایش بیشتر' }).click(); await sleep(400);
  const n3 = await page.locator('#view table tbody tr').count(); ok(n3 > 10, 'نمایش بیشتر ردیف‌های قدیمی را آورد: ' + n3);
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close(); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
