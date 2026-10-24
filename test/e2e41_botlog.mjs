import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tok = async (e, p) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: e, password: p }) })).json()).data.token;
const T = await tok('hamid@example.com', 'hamid-pass-333');
const get = async p => (await fetch(API + p, { headers: { authorization: 'Bearer ' + T } })).json();
try {
  const r = await get('/api/notify-log/'); ok(r.ok !== false && Array.isArray(r.data.rows) && Array.isArray(r.data.users), 'API پیام‌ها پاسخ داد');
  const r2 = await get('/api/notify-log/?kind=capital&user=رعنا'); ok(Array.isArray(r2.data.rows), 'فیلتر سرمایه + رعنا کار می‌کند');
  const s = await (await fetch(API + '/api/capital-notice/send/', { method: 'POST', headers: { authorization: 'Bearer ' + T, 'content-type': 'application/json' }, body: '{}' })).json();
  ok(s.data && Array.isArray(s.data.missing), 'ارسال پیام سرمایه جواب داد: ' + JSON.stringify(s.data && s.data.missing));
  const tm = await tok('mahdi@example.com', 'mahdi-pass-44'); const x = await fetch(API + '/api/notify-log/', { headers: { authorization: 'Bearer ' + tm } }); ok(x.status === 403, 'مهدی به پیام‌ها دسترسی ندارد (' + x.status + ')');
  const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
  await page.evaluate(() => { location.hash = '#/history'; }); await page.waitForTimeout(700);
  await page.click('text=پیام‌های بات'); await page.waitForTimeout(1200);
  ok(await page.locator('text=چه کسانی پیام می‌گیرند').count() === 1, 'پنل وضعیت اتصال');
  ok(await page.locator('.chips button', { hasText: 'انبارگردانی' }).count() === 1 && await page.locator('.chips button', { hasText: 'ابطال/حذف' }).count() === 1, 'فیلترهای انبارگردانی و ابطال/حذف');
  await page.click('.chips button:has-text("سرمایه")'); await page.waitForTimeout(800);
  ok(true, 'کلیک فیلتر سرمایه بدون خطا');
  const pa = await newPage(browser, url, { logs }); await login(pa, 'rana@example.com', 'rana-pass-22'); await pa.evaluate(() => { location.hash = '#/history'; }); await pa.waitForTimeout(700);
  ok(await pa.locator('text=پیام‌های بات').count() === 0, 'رعنا تب پیام‌ها را نمی‌بیند');
  await page.screenshot({ path: 'shots/botlog.png' });
} catch (e) { ok(false, 'exception ' + e.message); }
const bad = logs.filter(l => !/Failed to load resource|fonts|favicon/.test(l)); if (bad.length) { console.log(bad.join('\n')); }
await browser.close(); srv.close(); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
