import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const jlogin = async (id, pw) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: id, password: pw }) })).json()).data.token;
const hamid = await jlogin('hamid@example.com', 'hamid-pass-333');
const call = async (path, body, t = hamid) => (await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
const T = async () => (await call('/api/data/')).data.tables;
// داده‌ی ماه گذشته (۱۴۰۵/۰۷) تا دکمه از قبل فعال باشد
const t0 = await T(); const st = t0.v_stock.find(s => s.active && (s.qty_m + s.qty_r) > 5) || t0.v_stock[0];
const acc = t0.accounts.find(a => a.kind !== 'pocket').id;
await call('/api/rpc/set_goal/', { month: '1405-07', owner: 'مهسا', amount: 1000000 });
const r = await call('/api/rpc/create_sale/', { seller: 'مهسا', is_acq: true, channel: 'حضوری', customer: 'مشتری آشنا', date: '2026-10-10', received: 90000000, account_id: acc, lines: [{ item_id: st.item_id || st.id, qty: 2, unit_price: 45000000 }] });
console.log('sale:', JSON.stringify(r).slice(0, 160));
const fi = (await call('/api/fund/')).data.owners['مهسا']; console.log('months:', JSON.stringify(fi.months));
ok(fi.months.some(m => m.month === '1405-07' && m.can_save), 'ماه گذشته برای مهسا قابل ذخیره است');
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const sleep = ms => page.waitForTimeout(ms);
try {
  await page.evaluate(() => { location.hash = '#/fund'; }); await sleep(900);
  const txt = await page.locator('#view').innerText();
  ok(/صندوق مهسا/.test(txt) && !/صندوق رعنا/.test(txt), 'مهسا فقط صندوق خودش را می‌بیند');
  ok(await page.locator('#view button', { hasText: 'ذخیره‌ی پاداش' }).count() >= 1, 'دکمه‌ی ذخیره‌ی پاداش برای ماه تمام‌شده هست');
  await page.screenshot({ path: 'shots/fund_before.png' });
  await page.locator('#view button', { hasText: 'ذخیره‌ی پاداش' }).first().click(); await sleep(400);
  await page.locator('.ov').last().locator('button', { hasText: 'بله، ذخیره کن' }).click(); await sleep(1500);
  const fi2 = (await call('/api/fund/')).data.owners['مهسا']; ok(fi2.balance > 0 && fi2.entries.length >= 1, 'پاداش در صندوق ذخیره شد: ' + fi2.balance);
  const txt2 = await page.locator('#view').innerText(); ok(/ذخیره شد/.test(txt2) && /در صندوق/.test(txt2), 'صفحه بعد از ذخیره به‌روز شد');
  await page.screenshot({ path: 'shots/fund_after.png' });
  // حساب‌وکتاب ماه گذشته: ردیف‌های تازه
  await page.evaluate(() => { location.hash = '#/settle'; }); await sleep(1200);
  const st2 = await page.locator('#view').innerText(); ok(/پاداش ذخیره‌شده در صندوق/.test(st2) && /سود برابر قابل خرید مشترک/.test(st2), 'حساب‌وکتاب ماهانه ردیف‌های صندوق را دارد');
  // رعنا
  const p2 = await newPage(browser, url, { logs }); await login(p2, 'rana@example.com', 'rana-pass-22'); await p2.evaluate(() => { location.hash = '#/fund'; }); await p2.waitForTimeout(900);
  const t2 = await p2.locator('#view').innerText(); ok(/صندوق رعنا/.test(t2) && !/صندوق مهسا/.test(t2), 'رعنا فقط صندوق خودش را می‌بیند');
  // مدیر
  const p3 = await newPage(browser, url, { logs }); await login(p3, 'hamid@example.com', 'hamid-pass-333'); await p3.evaluate(() => { location.hash = '#/fund'; }); await p3.waitForTimeout(900);
  const t3 = await p3.locator('#view').innerText(); ok(/صندوق مهسا/.test(t3) && /صندوق رعنا/.test(t3) && /ابطال/.test(t3), 'مدیر هر دو صندوق و دکمه‌ی ابطال را می‌بیند');
  // موبایل
  await page.setViewportSize({ width: 390, height: 800 }); await page.evaluate(() => { location.hash = '#/fund'; }); await sleep(900); await page.screenshot({ path: 'shots/fund_mob.png' });
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d/.test(l)); if (real.length) { console.log(real); fails++; }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await page.screenshot({ path: 'shots/fail.png' }); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
