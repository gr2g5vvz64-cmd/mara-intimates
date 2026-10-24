// به‌روزرسانی خودکار: تغییر مدیر بدون بستن برنامه به مهسا می‌رسد
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tokOf = async (e, p) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: e, password: p }) })).json()).data.token;
const rpc = async (tk, fn, body) => (await fetch(API + '/api/rpc/' + fn + '/', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tk }, body: JSON.stringify(body) })).json();
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const sleep = ms => page.waitForTimeout(ms), go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(700); };
try {
  await go('#/stock'); await sleep(600);
  await page.evaluate(() => { window.__MARA_REFRESH_MS = 2500; window.__MARA_IDLE_MS = 500; });
  const th = await tokOf('hamid@example.com', 'hamid-pass-333');
  const r = await rpc(th, 'save_item', { name: 'کالای همگام‌سازی تست', category: 'سوتین' }); ok(r.ok !== false, 'مدیر کالا ساخت');
  const id = (r.data && r.data.result && r.data.result.id) || (r.data && (r.data.id || (r.data.ids || [])[0])) || r.id;
  const find = () => page.evaluate(async () => { const { S } = await import('./js/store.js'); const i = S.stock.find(x => x.name === 'کالای همگام‌سازی تست'); return i ? { active: i.active } : null; });
  let f = null; for (let k = 0; k < 14 && !f; k++) { await sleep(1000); f = await find(); }
  ok(f && f.active, 'مهسا بدون هیچ کاری کالای جدید را دید (به‌روزرسانی خودکار)');
  const r2 = await rpc(th, 'save_item', { id, name: 'کالای همگام‌سازی تست', category: 'سوتین', active: false }); ok(r2.ok !== false, 'مدیر کالا را حذف (غیرفعال) کرد');
  let g = null; for (let k = 0; k < 14; k++) { await sleep(1000); g = await find(); if (g && !g.active) break; }
  ok(g && g.active === false, 'مهسا غیرفعال شدن را هم دید بدون بستن برنامه');
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close(); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
