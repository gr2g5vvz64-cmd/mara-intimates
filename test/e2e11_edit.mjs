import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tk = async (e, p) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: e, password: p }) })).json()).data.token;
const tok = await tk('hamid@example.com', 'hamid-pass-333');
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const sleep = (p, ms) => p.waitForTimeout(ms);
const go = async (p, h) => { await p.evaluate(x => { location.hash = x; }, h); await sleep(p, 600); };
const t0 = await D();
const cand = t0.v_sales.filter(s => !s.voided && !t0.collections.some(c => c.sale_id === s.id && !c.voided) && !t0.returns.some(r => !r.voided && t0.sale_lines.some(l => l.id === r.sale_line_id && l.sale_id === s.id)))[0];
ok(!!cand, 'فروش قابل‌ویرایش در داده‌ی تست هست: ' + (cand && cand.no));
try {
  // رعنا: حالا مثل مهسا ویرایش/ابطال دارد
  const pr = await newPage(browser, url, { logs }); await login(pr, 'rana@example.com', 'rana-pass-22'); pr.setDefaultTimeout(8000);
  await go(pr, '#/sales'); await pr.locator('tr, .li, .row').filter({ hasText: cand.no }).first().click(); await sleep(pr, 500);
  let t = await pr.locator('.ov').last().innerText();
  ok(t.includes('ویرایش') && t.includes('ابطال'), 'رعنا در جزئیات فروش دکمه‌ی ویرایش/ابطال دارد');
  ok(t.includes('مرجوعی'), 'رعنا همچنان ثبت‌کردن‌ها را می‌بیند');
  // مهسا: ویرایش فروش
  const pm = await newPage(browser, url, { logs }); await login(pm, 'mahsa@example.com', 'mahsa-pass-1'); pm.setDefaultTimeout(8000);
  await go(pm, '#/sales'); await pm.locator('tr, .li, .row').filter({ hasText: cand.no }).first().click(); await sleep(pm, 500);
  const M = pm.locator('.ov').last();
  ok((await M.innerText()).includes('ویرایش'), 'مهسا دکمه‌ی ویرایش را می‌بیند');
  await M.locator('button', { hasText: 'ویرایش' }).first().click(); await sleep(pm, 900);
  const M2 = pm.locator('.ov').last();
  ok((await M2.innerText()).includes('ویرایش فروش ' + cand.no), 'فرم ویرایش با عنوان درست باز شد');
  await M2.locator('.irow').first().locator('.c-price input').fill('777000'); await sleep(pm, 300);
  await M2.locator('button', { hasText: 'ذخیره‌ی ویرایش فاکتور' }).click(); await sleep(pm, 2200);
  const t1 = await D();
  const old = t1.v_sales.find(s => s.id === cand.id);
  ok(old && old.voided, 'فروش قبلی باطل شد (در تاریخچه می‌ماند)');
  const nw = t1.v_sales.filter(s => !s.voided && s.id !== cand.id && s.id > cand.id).sort((a, b) => b.id - a.id)[0];
  ok(nw && /ویرایش/.test(old.void_reason || ''), 'دلیل ابطال «ویرایش شد…» ثبت شد: ' + (old && old.void_reason));
  ok(+t1.v_totals.check_diff === 0, 'check_diff=0 بعد از ویرایش');
  // حذف کالا/مشتری توسط مهسا
  await go(pm, '#/customers'); const body = await pm.locator('body').innerText(); ok(body.length > 50, 'صفحه‌ی مشتریان باز است');
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول' + (real.length ? ': ' + real.slice(0, 2).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message.split('\n')[0]); fails++; }
await browser.close(); srv.close();
console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
