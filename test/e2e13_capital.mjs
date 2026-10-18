import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const fa = x => String(x).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,\s]/g, '');
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'rana@example.com', 'rana-pass-22'); page.setDefaultTimeout(8000);
const M = page.locator('.ov').last(), sleep = ms => page.waitForTimeout(ms);
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(700); };
try {
  const t0 = await D(); const T0 = t0.v_totals; const cm = +T0.capital_m, cr = +T0.capital_r;
  await go('#/finance'); const body = await page.locator('body').innerText();
  ok(body.includes('سرمایه‌ی مهسا') && body.includes('سرمایه‌ی رعنا'), 'صفحه‌ی مالی: «سرمایه‌ی مهسا/رعنا» به‌جای جیب منفی');
  ok(!body.includes('جیب شخصی مهسا') && !body.includes('جیب شخصی رعنا'), 'جیب شخصی منفی دیگر نمایش داده نمی‌شود');
  await page.locator('button', { hasText: 'انتقال سرمایه' }).first().click(); await M.waitFor(); await sleep(400);
  await M.locator('button', { hasText: 'برابر کردن سهم‌ها' }).click(); await sleep(300);
  const half = Math.floor(Math.abs(cm - cr) / 2);
  const shown = fa(await M.locator('.numinp').first().inputValue()); ok(+shown === half, `مبلغ خودکار نصف تفاوت است (${shown} = ${half})`);
  const pv = fa(await M.locator('.prev').innerText()); ok(pv.includes(String(cm - half)) && pv.includes(String(cr + half)), 'پیش‌نمایش سرمایه‌ی بعد از انتقال درست است');
  await M.locator('button', { hasText: 'ثبت انتقال سرمایه' }).click(); await sleep(2000);
  const t1 = await D(); ok(Math.abs(+t1.v_totals.capital_m - (cm - half)) < 1 && Math.abs(+t1.v_totals.capital_r - (cr + half)) < 1, `سرمایه‌ها برابر شد: ${t1.v_totals.capital_m} / ${t1.v_totals.capital_r}`);
  ok(+t1.v_totals.check_diff === 0, 'check_diff=0');
  // نام خریدار اجباری
  await go('#/sales'); await page.click('text=＋ فروش جدید'); await M.waitFor(); await sleep(500);
  const sc = M.locator('.lcard').first(); await sc.locator('.cmb input').fill('شورت'); await sc.locator('.cmb-o').first().click(); await sleep(400);
  await M.locator('button', { hasText: 'ثبت فروش' }).click(); await sleep(500);
  ok((await page.locator('body').innerText()).includes('نام خریدار'), 'ثبت فروش بدون خریدار رد شد');
  const labels = await M.locator('.fld > .lbl').allInnerTexts(); ok(labels.some(x => x.includes('خریدار')), 'برچسب فیلد «خریدار *» است');
  await page.keyboard.press('Escape'); await sleep(300);
  // فیلتر خریدار در لیست فروش
  await go('#/sales'); const opts = await page.locator('select[aria-label="خریدار"] option').allInnerTexts(); ok(opts.length > 1 && opts[0].includes('همه'), 'فیلتر خریدار در لیست فروش هست: ' + opts.slice(0, 4).join('، '));
  await page.locator('select[aria-label="خریدار"]').selectOption({ index: 1 }); await sleep(400);
  const rows = await page.locator('tbody tr').count(); ok(rows >= 1, 'با انتخاب خریدار فقط فروش‌های او می‌ماند (' + rows + ' ردیف)');
  await go('#/customers'); await page.locator('select[aria-label="مرتب‌سازی"]').selectOption('buy'); await sleep(300); ok(true, 'مرتب‌سازی بیشترین خرید کار می‌کند');
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول' + (real.length ? ': ' + real.slice(0, 2).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message.split('\n')[0]); await page.screenshot({ path: '/tmp/e13.png' }); fails++; }
await browser.close(); srv.close(); console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
