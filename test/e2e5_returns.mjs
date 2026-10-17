import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const M = page.locator('.ov'), sleep = ms => page.waitForTimeout(ms);
try {
  const t0 = await D(); const sl = t0.v_sales.find(s => s.items_text.includes('ست لاکچری')); const line = t0.sale_lines.find(l => l.sale_id === sl.id);
  await page.evaluate(() => { location.hash = '#/returns'; }); await sleep(500); await page.click('text=＋ مرجوعی');
  await M.locator('.cmb input').first().fill(sl.no); await M.locator('.cmb-o').first().click(); await sleep(400);
  const txt = (await M.innerText()).replace(/\s+/g, ' ');
  ok(/کالای برگشتی پیش چه کسی می‌ماند/.test(txt), 'مرجوعی مشتری می‌پرسد کالا پیش چه کسی می‌ماند');
  ok(await M.locator('.chip.on', { hasText: line.holder }).count() >= 1, `پیش‌فرض = نگه‌دارنده‌ی فروش (${line.holder})`);
  const other = line.holder === 'مهسا' ? 'رعنا' : 'مهسا';
  await M.locator('.chip', { hasText: new RegExp('^' + other + '$') }).last().click(); await sleep(200);
  ok(new RegExp('کالا به موجودی ' + other + ' برمی‌گردد').test((await M.innerText()).replace(/\s+/g, ' ')), 'پیش‌نمایش: برمی‌گردد به ' + other);
  await M.locator('button', { hasText: 'معیوب' }).click(); await sleep(200);
  ok(/چه کسی کالای معیوب را تحویل گرفت/.test(await M.innerText()), 'برای معیوب سوال عوض می‌شود');
  await M.locator('button', { hasText: 'سالم' }).first().click(); await sleep(200);
  await M.locator('button', { hasText: 'ثبت مرجوعی' }).click(); await sleep(1500);
  const t1 = await D(); const r = t1.returns.filter(x => x.kind === 'customer').sort((a, b) => b.id - a.id)[0];
  ok(r && r.holder === other, `مرجوعی در دیتابیس با نگه‌دارنده‌ی ${r && r.holder}`);
  const s0 = t0.v_stock.find(i => i.name === 'ست لاکچری'), s1 = t1.v_stock.find(i => i.name === 'ست لاکچری');
  ok((other === 'مهسا' ? s1.rem_m - s0.rem_m : s1.rem_r - s0.rem_r) === 1 && (other === 'مهسا' ? s1.rem_r === s0.rem_r : s1.rem_m === s0.rem_m), `موجودی ${other} یکی زیاد شد و دیگری ثابت ماند`);
  ok(Math.abs(t1.v_totals.check_diff) < 1, 'ترازنامه‌ی کنترلی صفر');
  // ابطال مرجوعی باید همان نگه‌دارنده را برگرداند (از طریق API)
  // برگشت به تامین‌کننده
  await page.evaluate(() => { location.hash = '#/stock'; }); await sleep(500); await page.click('text=برگشت به تامین‌کننده');
  ok(/چه کسی کالا را به تامین‌کننده پس داد/.test(await M.innerText()), 'برگشت به تامین‌کننده: می‌پرسد چه کسی پس داد');
  await M.locator('.chip', { hasText: /^رعنا$/ }).click(); await sleep(300);
  await M.locator('.cmb input').first().click(); await M.locator('.cmb-o').first().click(); await sleep(200);
  await M.locator('button', { hasText: 'ثبت برگشت به تامین‌کننده' }).click(); await sleep(1500);
  const t2 = await D(); const sr = t2.returns.filter(x => x.kind === 'supplier').sort((a, b) => b.id - a.id)[0];
  ok(sr && sr.holder === 'رعنا', 'برگشت به تامین‌کننده با «رعنا» ثبت شد: ' + (sr && sr.holder));
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d/.test(l)); if (real.length) { console.log(real); fails++; }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await page.screenshot({ path: 'shots/fail.png' }); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
