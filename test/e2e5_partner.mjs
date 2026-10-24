import { serve, launch, newPage, login, API, buyer, gridRow, gridNext } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tk = async (i, pw) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: i, password: pw }) })).json()).data.token;
const tok = await tk('hamid@example.com', 'hamid-pass-333');
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const M = page.locator('.ov'), sleep = ms => page.waitForTimeout(ms);
try {
  const dtx = await page.locator('.dash').innerText();
  ok(await page.locator('.tabs button').count() === 0 && /امروز من/.test(dtx) && /کارهای من/.test(dtx), 'داشبورد شریک: بدون تب، با «امروز من» و «کارهای من»');
  ok(/حساب‌های مهسا|جنس و پول من/.test(dtx) && /جنس دست رعنا/.test(dtx) && /ست لاکچری/.test(dtx), 'جنس دست رعنا (ست لاکچری) دیده می‌شود');
  ok(!/کل MARA|مقایسه/.test(dtx), 'عملکرد شریک دیگر دیده نمی‌شود');
  // فروش از موجودی رعنا توسط مهسا
  await page.evaluate(() => { location.hash = '#/sales'; }); await sleep(500); await page.click('text=＋ فروش جدید');
  await gridRow(page, M, 0, { name: 'ست', qty: 5, price: 5000000 });
  const row = M.locator('.pgrow').first(), dl = row.locator('.c-dl input');
  ok(/م 0 · ر 8/.test((await row.locator('.pg-stk').innerText()).replace(/\s+/g, ' ')), 'موجودی هر دو نفر نمایش داده شد');
  ok(await dl.nth(0).inputValue() === '0' && await dl.nth(1).inputValue() === '5', 'خودکار روی موجودی رعنا رفت (مهسا ۰ دارد)');
  ok(/باقی‌مانده از موجودی رعنا/.test(await row.locator('.pg-msg').innerText()), 'پیام «از موجودی رعنا برداشته می‌شود» دیده می‌شود');
  await row.locator('.c-qty input').fill('9'); await sleep(300);
  ok(/کافی نیست|کم داری/.test(await row.locator('.pg-msg').innerText()), 'تعداد بیش از موجودی دو نفر: خطا');
  await row.locator('.c-qty input').fill('2'); await sleep(300);
  await buyer(page, M);
  await gridNext(page, M); await M.locator('[data-act=submit]').click(); await sleep(1500);
  const t = await D(); const sale = t.v_sales.filter(s => s.items_text && s.items_text.includes('ست لاکچری')).sort((a, b) => b.id - a.id)[0];
  const sl = t.sale_lines.filter(l => l.sale_id === sale.id);
  ok(sale && sale.seller === 'مهسا' && sl.length && sl.every(l => l.holder === 'رعنا'), `فروش به نام ${sale && sale.seller} از موجودی ${sl.map(l => l.holder)}`);
  const st = t.v_stock.find(i => i.name === 'ست لاکچری'); ok(st.rem_m === 0 && st.rem_r === 6, `موجودی ست لاکچری: مهسا ${st.rem_m} · رعنا ${st.rem_r}`);
  ok(Math.abs(t.v_totals.check_diff) < 1, 'ترازنامه‌ی کنترلی صفر: ' + t.v_totals.check_diff);
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d/.test(l)); if (real.length) { console.log(real); fails++; }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await page.screenshot({ path: 'shots/fail.png' }); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
