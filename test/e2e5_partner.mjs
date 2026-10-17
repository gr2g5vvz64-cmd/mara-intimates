import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tk = async (i, pw) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: i, password: pw }) })).json()).data.token;
const tok = await tk('hamid@example.com', 'hamid-pass-333');
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const M = page.locator('.ov'), sleep = ms => page.waitForTimeout(ms);
try {
  // تب‌های داشبورد
  const tabs = (await page.locator('.tabs button').allInnerTexts()).map(x => x.replace(/[0-9۰-۹\s]/g, '')); ok(tabs.join('|') === 'مهسا|رعنا|کلMARA', 'سه تب: ' + tabs.join(' | '));
  ok((await page.locator('.tabs button.on').innerText()).replace(/[0-9۰-۹\s]/g, '') === 'مهسا', 'تب پیش‌فرض مهسا = خودش');
  ok(/حساب‌های مهسا/.test(await page.locator('.dbody').innerText()), 'تب مهسا: حساب‌های خودش');
  await page.locator('.tabs button', { hasText: 'رعنا' }).click(); await sleep(300);
  let tx = await page.locator('.dbody').innerText(); ok(/حساب‌های رعنا/.test(tx) && /ست لاکچری/.test(tx) && /حساب رعنا/.test(tx), 'تب رعنا: حساب و موجودی رعنا (ست لاکچری) را می‌بیند');
  await page.locator('.tabs button', { hasText: 'کل MARA' }).click(); await sleep(300);
  ok(await page.locator('.pg').count() === 1 && /فروش امروز/.test(await page.locator('.dbody').innerText()), 'تب کل MARA: مقایسه و خلاصه‌ی کل');
  await page.screenshot({ path: 'shots/f5_tabs_all.png' });
  await page.locator('.tabs button', { hasText: 'رعنا' }).click(); await sleep(300); await page.screenshot({ path: 'shots/f5_tabs_rana.png', fullPage: true });
  // فروش از موجودی رعنا توسط مهسا
  await page.evaluate(() => { location.hash = '#/sales'; }); await sleep(500); await page.click('text=＋ فروش جدید');
  const card = M.locator('.lcard').first();
  await card.locator('.cmb input').fill('ست'); await card.locator('.cmb-o').first().click(); await sleep(300);
  await card.locator('.numinp').first().fill('5000000');
  const hb = (await card.locator('.holdbox').innerText()).replace(/\s+/g, ' ');
  ok(/مهسا · 0 عدد/.test(hb) && /رعنا · 8 عدد/.test(hb), 'موجودی هر دو نفر نمایش داده شد: ' + hb);
  ok(/نزد خودش ندارد/.test(hb) && await card.locator('.holdbox .chip.on').innerText().then(x => x.includes('رعنا')), 'خودکار روی موجودی رعنا رفت');
  ok(await M.locator('.warn').filter({ hasText: 'کافی نیست' }).isVisible().catch(() => false) === false, 'هشدار کمبود موجودی ندارد');
  await card.locator('.stp.big .stp-i').fill('9'); await sleep(300);
  ok(/کافی نیست/.test(await card.locator('.prev').innerText()), 'تعداد بیش از موجودی رعنا: هشدار');
  await card.locator('.stp.big .stp-i').fill('2'); await sleep(300);
  await M.locator('button', { hasText: 'ثبت فروش' }).click(); await sleep(1200);
  const t = await D(); const sale = t.v_sales.filter(s => s.items_text && s.items_text.includes('ست لاکچری')).sort((a, b) => b.id - a.id)[0];
  const sl = t.sale_lines.filter(l => l.sale_id === sale.id);
  ok(sale && sale.seller === 'مهسا' && sl.length && sl.every(l => l.holder === 'رعنا'), `فروش به نام ${sale && sale.seller} از موجودی ${sl.map(l => l.holder)}`);
  const st = t.v_stock.find(i => i.name === 'ست لاکچری'); ok(st.rem_m === 0 && st.rem_r === 6, `موجودی ست لاکچری: مهسا ${st.rem_m} · رعنا ${st.rem_r}`);
  ok(Math.abs(t.v_totals.check_diff) < 1, 'ترازنامه‌ی کنترلی صفر: ' + t.v_totals.check_diff);
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d/.test(l)); if (real.length) { console.log(real); fails++; }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await page.screenshot({ path: 'shots/fail.png' }); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
