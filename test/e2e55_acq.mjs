import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const M = page.locator('.ov').last(), sleep = ms => page.waitForTimeout(ms);
try {
  const t0 = await D(); const c0 = t0.customers.find(c => c.name === 'خریدار ۲');
  await page.evaluate(() => { location.hash = '#/customers'; }); await sleep(600);
  await page.locator('#view .chk', { hasText: 'فقط بدهکارها' }).locator('input').uncheck().catch(() => {}); await sleep(300);
  await page.locator('tr', { hasText: c0.name }).first().locator('button', { hasText: 'ویرایش' }).click(); await sleep(300);
  console.log(logs.join(' | ')); ok(/آشنا/.test(await M.innerText()) && /از اینستاگرام/.test(await M.innerText()) && /از تلگرام/.test(await M.innerText()), 'فرم ویرایش مشتری: تیک آشنا / اینستاگرام / تلگرام');
  await M.locator('.chk', { hasText: /^آشنا$/ }).locator('input').check(); await M.locator('.chk', { hasText: 'از اینستاگرام' }).locator('input').check();
  await M.locator('button', { hasText: 'ذخیره' }).first().click(); await sleep(1500);
  const c1 = (await D()).customers.find(c => c.id === c0.id);
  ok(c1.is_acq === true && c1.src_instagram === true && c1.src_telegram === false, 'تیک‌ها ذخیره شد');
  await page.evaluate(() => { location.hash = '#/sales'; }); await sleep(500); await page.click('text=＋ فروش جدید'); await sleep(700);
  ok(/فروش به آشنا/.test(await page.locator('.ov').last().innerText()), 'فرم فروش: تیک «فروش به آشنا»');
  ok(!/آشنایان/.test(await page.locator('.ov').last().locator('.sg-ch').innerText()), 'کانال «آشنایان» از کانال‌های جدید برداشته شد');
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d/.test(l)); if (real.length) { console.log(real); fails++; }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await page.screenshot({ path: 'shots/fail.png' }); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
