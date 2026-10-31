import { serve, launch, newPage, login, API, gridRow, gridNext } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tokOf = async (id, pw) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: id, password: pw }) })).json()).data.token;
const tok = await tokOf('hamid@example.com', 'hamid-pass-333');
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const sleep = ms => page.waitForTimeout(ms);
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(600); };
const jd = async n => page.evaluate(async n => { const u = await import('./js/util.js'), c = await import('./js/cheque_ui.js'); return c.jdash(u.addDaysISO(u.todayISO(), n)); }, n);
const M = () => page.locator('.ov').last();
try {
  const t0 = await D(); const inv0 = t0.purchase_invoices.length;
  await go('#/purchases'); await page.click('text=＋ خرید جدید'); await M().waitFor(); await sleep(600);
  await gridRow(page, M(), 0, { name: 'جوراب', qty: 10, price: 100000 }); await gridNext(page, M());
  const P = M();
  // تامین‌کننده
  await P.locator('.pg2 .cmb input').first().fill('بازار تهران'); await P.locator('.pg2 .cmb-o', { hasText: 'بازار تهران' }).first().click(); await sleep(300);
  // فرم هیچ روشی باز نیست
  ok(await P.locator('.cq-z:visible').count() === 0 && await P.locator('.cq-card').count() > 0 && !(await P.locator('.cq-card').first().isVisible()), 'قبل از انتخاب روش، فرم‌های پرداخت بسته است');
  ok((await P.locator('.pg2 .hint', { hasText: 'نسیه' }).first().innerText()).includes('نسیه'), 'مانده‌ی بدون پرداخت = نسیه');
  // سرمایه‌ی شخصی + چک
  await P.locator('.cq-methods .chip[data-m=cap]').click(); await sleep(200);
  ok(await P.locator('.cq-z').nth(0).isVisible() && !(await P.locator('.cq-z').nth(2).isVisible()), 'فقط فرم سرمایه‌ی شخصی باز شد');
  ok((await P.locator('.cq-z').nth(0).locator('.numf input').first().inputValue()) === '1,000,000', 'مبلغ سرمایه‌ی شخصی با کل فاکتور پر شد');
  await P.locator('.cq-z').nth(0).locator('.numf input').first().fill('200000'); await sleep(150);
  await P.locator('.cq-methods .chip[data-m=chq]').click(); await sleep(250);
  ok(await P.locator('.cq-card').first().isVisible(), 'با زدن «چک» فرم چک باز شد');
  const C = P.locator('.cq-card').first();
  ok((await C.locator('.cq-grid input').last().inputValue()) === '800,000', 'مبلغ چک اول = مانده‌ی فاکتور (۸۰۰٬۰۰۰)');
  ok((await C.locator('.cq-grid .hint').first().innerText()).includes('مهسا'), 'راهنمای پرداخت‌کننده: در سرمایه‌ی مهسا');
  await page.screenshot({ path: '/tmp/chq_form_desktop.png', fullPage: false });
  // اعتبارسنجی
  await P.locator('[data-act=submit]').click(); await sleep(400);
  ok((await page.locator('#toasts').innerText()).includes('چک اول'), 'ثبت با فرم ناقص رد شد: ' + (await page.locator('#toasts').innerText()).slice(0, 60));
  const fill = async (label, v) => { await C.locator(`[aria-label="${label}"]`).fill(v); };
  await fill('نام تامین‌کننده روی چک', 'علی کریمی'); await fill('کد ملی', '۰۰۷۶۵۴۳۲۱۰'); await C.locator('select[aria-label=بانک]').selectOption({ label: 'بانک سپه' });
  await fill('شماره چک', '110428'); await fill('شماره صیادی ۱۶ رقمی', '123456789012345'); await sleep(150);
  ok((await C.locator('.cq-grid .hint', { hasText: 'رقم' }).first().innerText()).includes('15'), 'شمارنده‌ی صیادی: ۱۵ از ۱۶');
  const bad = await jd(-3); await fill('تاریخ سررسید چک', bad); await sleep(150);
  ok((await C.innerText()).includes('قبل از تاریخ تحویل'), 'سررسید قبل از فاکتور رد می‌شود');
  await fill('شماره صیادی ۱۶ رقمی', '1234567890123456'); await fill('تاریخ سررسید چک', await jd(60)); await sleep(200);
  ok((await C.locator('.cq-tag').innerText()) === 'کامل', 'برچسب چک: کامل');
  // چک دوم
  await P.locator('button', { hasText: '＋ افزودن چک دوم' }).click(); await sleep(200);
  ok(await P.locator('.cq-card').count() === 2, 'چک دوم اضافه شد');
  await P.locator('button', { hasText: '＋ افزودن چک سوم' }).click(); await sleep(150);
  ok(await P.locator('button', { hasText: /افزودن چک/ }).isHidden(), 'بعد از چک سوم دکمه‌ی افزودن ناپدید شد');
  await P.locator('.cq-card').nth(2).locator('button', { hasText: 'حذف' }).click(); await P.locator('.cq-card').nth(1).locator('button', { hasText: 'حذف' }).click(); await sleep(150);
  ok(await P.locator('.cq-card').count() === 1, 'حذف چک‌های دوم و سوم');
  await page.screenshot({ path: '/tmp/chq_form_desktop2.png' });
  await P.locator('[data-act=submit]').click(); await sleep(2500);
  const t1 = await D(); const inv = t1.purchase_invoices.sort((a, b) => b.id - a.id)[0];
  ok(t1.purchase_invoices.length === inv0 + 1, 'فاکتور ثبت شد');
  const vi = t1.v_invoices.find(i => i.id === inv.id); ok(Math.abs(vi.debt) < 1 && Math.abs(vi.paid - 1000000) < 1, `بدهی فاکتور صفر (debt=${vi.debt})`);
  const ch = t1.v_cheques.find(c => c.cheque_no === '110428');
  ok(ch && ch.amount === 800000 && ch.payer === 'حمیدرضا' && ch.cap_owner === 'مهسا' && ch.national_id === '0076543210' && ch.bank === 'بانک سپه' && ch.state === 'open', 'چک درست ذخیره شد (ارقام فارسی انگلیسی شد)');
  const sup = t1.suppliers.find(s => s.id === inv.supplier_id); ok(sup.national_id === '0076543210' && sup.payee_name === 'علی کریمی', 'کد ملی روی تامین‌کننده ذخیره شد');
  ok(Math.abs(t1.v_totals.capital_m - t0.v_totals.capital_m - 200000) < 1 && Math.abs(t1.v_totals.check_diff) < 1, 'سرمایه فقط ۲۰۰ هزار زیاد شد، check_diff=0');
  // صفحه‌ی چک‌ها
  await go('#/cheques'); await sleep(500);
  const body = await page.locator('#view').innerText();
  ok(body.includes('علی کریمی') === false && body.includes('بازار تهران') && body.includes('110428') && body.includes('بانک سپه'), 'چک در صفحه‌ی چک‌های پرداختی دیده می‌شود');
  await page.screenshot({ path: '/tmp/chq_page_desktop.png', fullPage: true });
  // خرید بعدی: نام و کد ملی خودکار
  await go('#/purchases'); await page.click('text=＋ خرید جدید'); await M().waitFor(); await sleep(500);
  await gridRow(page, M(), 0, { name: 'جوراب', qty: 2, price: 50000 }); await gridNext(page, M());
  await M().locator('.pg2 .cmb input').first().fill('بازار تهران'); await M().locator('.pg2 .cmb-o', { hasText: 'بازار تهران' }).first().click(); await sleep(300);
  await M().locator('.cq-methods .chip[data-m=chq]').click(); await sleep(250);
  const C2 = M().locator('.cq-card').first();
  ok((await C2.locator('[aria-label="کد ملی"]').inputValue()) === '0076543210' && (await C2.locator('[aria-label="نام تامین‌کننده روی چک"]').inputValue()) === 'علی کریمی', 'نام و کد ملی تامین‌کننده بار بعد خودکار پر شد');
  await C2.locator('[aria-label="شماره صیادی ۱۶ رقمی"]').fill('1234567890123456'); await C2.locator('[aria-label="شماره چک"]').click(); await sleep(150);
  ok((await C2.innerText()).includes('قبلاً ثبت شده'), 'صیادی تکراری رد می‌شود');
  await page.keyboard.press('Escape'); await sleep(300);
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.stack.split('\n').slice(0, 4).join(' / ')); fails++; await page.screenshot({ path: '/tmp/chq_fail.png' }); }
await browser.close(); srv.close();
console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
