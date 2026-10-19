import { serve, launch, newPage, login, API } from './h5.mjs';
import fs from 'fs';
const { srv, url } = await serve(); const browser = await launch(); const logs = [];
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const apiLogin = async (identifier, password) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier, password }) })).json()).data.token;
const tok = await apiLogin('hamid@example.com', 'hamid-pass-333');
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1');
const sleep = ms => page.waitForTimeout(ms); page.setDefaultTimeout(8000);
const go = async h => { await page.evaluate(x => { location.hash = '#/' + x; }, h); await sleep(500); };
const M = page.locator('.ov');
const modalGone = async () => { await page.waitForSelector('.ov', { state: 'detached', timeout: 10000 }).catch(() => {}); await sleep(600); };
const err = async () => (await page.locator('.toast.err').allInnerTexts()).join('|');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const plus = n => { const [y, m, d] = today.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
async function main() {
  // ۱) فروش نسیه به مشتری جدید با سررسید ۵ روز
  
  await go('sales'); await page.click('text=＋ فروش جدید');
  let card = M.locator('.lcard').first();
  await card.locator('.cmb input').fill('سوتین'); await card.locator('.cmb-o').first().click();
  await card.locator('.stp.big .stp-i').fill('2'); await card.locator('.numinp').first().fill('3800000');
  await M.locator('button.chip', { hasText: 'جزئی (نسیه)' }).click();
  await M.locator('.fld', { has: page.locator('.lbl', { hasText: 'مبلغ دریافتی' }) }).locator('input').fill('1000000');
  await M.locator('button', { hasText: 'صدور فاکتور' }).click(); await sleep(500);
  ok((await err()).includes('خریدار'), 'فروش بدون خریدار رد شد: ' + await err());
  const cust = M.locator('.fld', { has: page.locator('.lbl', { hasText: /^خریدار/ }) }).locator('.cmb input');
  await cust.fill('سارا'); await M.locator('.cmb-o.create').first().click(); await sleep(700);
  await M.locator('button.chip', { hasText: /^۵ روز$/ }).click(); await sleep(200);
  const hintTxt = await M.locator('.hint', { hasText: 'سررسید:' }).innerText(); ok(/سررسید/.test(hintTxt), 'نمایش سررسید در فرم: ' + hintTxt);
  await page.screenshot({ path: 'shots/f5_sale_credit.png' });
  await M.locator('button', { hasText: 'صدور فاکتور' }).click(); await modalGone();
  let t = await D(); const sara = t.v_sales.find(s => s.customer === 'سارا');
  ok(sara && sara.outstanding === 6600000 && sara.due_date === plus(5), `فروش نسیه: مانده ${sara && sara.outstanding} سررسید ${sara && sara.due_date} (انتظار ${plus(5)}) ${await err()}`);
  // ۲) صفحه مشتریان و دریافت قسطی
  await go('customers'); await sleep(300);
  const row = page.locator('tbody tr', { hasText: 'سارا' }); ok(await row.count() === 1, 'مشتری سارا در لیست بدهکاران');
  await row.locator('button', { hasText: 'دریافت' }).click(); await sleep(400);
  const amt = M.locator('.numinp').first(); ok((await amt.inputValue()).replace(/,/g, '') === '6600000', 'مبلغ پیش‌فرض = کل بدهی');
  await amt.fill('2000000'); await sleep(200);
  ok(/تسویه|مانده/.test(await M.locator('.sumbox').innerText()), 'پیش‌نمایش تخصیص: ' + (await M.locator('.sumbox').innerText()).replace(/\s+/g, ' '));
  await M.locator('button', { hasText: 'ثبت دریافت' }).click(); await modalGone();
  t = await D(); ok(t.v_customer_balance.find(c => c.name === 'سارا').outstanding === 4600000, 'قسط اول: مانده ۴٫۶م ' + await err());
  await row.click(); await sleep(400);
  ok(/صورت‌حساب سارا/.test(await M.innerText()) && /گردش حساب/.test(await M.innerText()), 'صورت‌حساب مشتری باز شد');
  await page.screenshot({ path: 'shots/f5_customer_statement.png' });
  await M.locator('button', { hasText: 'ثبت دریافت' }).click(); await sleep(400);
  await M.locator('button', { hasText: 'ثبت دریافت' }).click(); await modalGone();
  t = await D(); ok(t.v_customer_balance.find(c => c.name === 'سارا').outstanding === 0, 'قسط آخر: تسویه کامل ' + await err());
  // ۳) پرداخت به تامین‌کننده بدون فاکتور → پخش خودکار
  await go('invoices'); await page.click('text=＋ پرداخت به تامین‌کننده');
  await M.locator('.cmb input').first().click(); await M.locator('.cmb-o', { hasText: 'تولیدی احمدی' }).click(); await sleep(300);
  const before = t.v_supplier_balance.find(s => s.name === 'تولیدی احمدی').balance;
  await M.locator('.numinp').first().fill('5000000'); await sleep(200);
  ok(/F-0002/.test(await M.locator('.sumbox').innerText()), 'پیش‌نمایش پخش روی فاکتور: ' + (await M.locator('.sumbox').innerText()).replace(/\s+/g, ' '));
  await M.locator('button', { hasText: 'ثبت پرداخت' }).click(); await modalGone();
  t = await D(); ok(t.v_supplier_balance.find(s => s.name === 'تولیدی احمدی').balance === before - 5000000, `بدهی تامین‌کننده ${before} → ${t.v_supplier_balance.find(s => s.name === 'تولیدی احمدی').balance} ${await err()}`);
  await page.locator('tbody tr', { hasText: 'تولیدی احمدی' }).first().click({ position: { x: 20, y: 10 } }).catch(() => {}); await sleep(300);
  if (await M.count()) { ok(/صورت‌حساب/.test(await M.first().innerText()), 'صورت‌حساب تامین‌کننده'); await page.keyboard.press('Escape'); await sleep(200); }
  // ۴) خرید نسیه با سررسید
  await go('purchases'); await page.click('text=＋ خرید جدید');
  await M.locator('.cmb input').first().fill('بازار تهران'); await M.locator('.cmb-o', { hasText: 'بازار تهران' }).first().click(); await sleep(200);
  card = M.locator('.dpanel');
  await card.locator('.cmb input').fill('سوتین'); await card.locator('.ilist .cmb-o').first().click();
  await card.locator('.stp.big .stp-i').fill('4'); await card.locator('.sline .numinp').first().fill('2500000'); await card.locator('.add').click(); await sleep(200);
  await M.locator('button.chip', { hasText: 'پرداخت جزئی' }).click(); await sleep(150);
  const p1 = M.locator('.lcard', { hasText: 'پرداخت 1' }); await p1.locator('.numinp').fill('4000000'); await p1.locator('button.chip', { hasText: 'حساب مهسا' }).click();
  await sleep(200); ok(await M.locator('button.chip', { hasText: /^۱۰ روز$/ }).count() === 1, 'سررسید برای باقی‌مانده نمایش داده شد');
  await M.locator('button.chip', { hasText: /^۱۰ روز$/ }).click();
  await M.locator('button', { hasText: 'ثبت فاکتور' }).click(); await modalGone();
  t = await D(); const inv = t.v_invoices.find(i => i.no === 'F-0003'); ok(inv && inv.debt === 6000000 && inv.due_date === plus(10), `خرید نسیه: بدهی ${inv && inv.debt} سررسید ${inv && inv.due_date} ${await err()}`);
  // ۵) تمدید سررسید
  await page.locator('tbody tr', { hasText: 'F-0003' }).first().click(); await sleep(300);
  await M.locator('button', { hasText: 'تغییر سررسید' }).click(); await sleep(300);
  await M.locator('button.chip', { hasText: /^۳۰ روز$/ }).click(); await M.locator('button', { hasText: 'ذخیره‌ی سررسید' }).click(); await modalGone();
  t = await D(); ok(t.v_invoices.find(i => i.no === 'F-0003').due_date === plus(30), 'تمدید سررسید فاکتور ' + await err());
  // ۶) داشبورد هشدار سررسید
  const dp = await newPage(browser, url, { logs }); await login(dp, 'hamid@example.com', 'hamid-pass-333'); await sleep(900); const dash = await dp.locator('#view').innerText(); ok(/سررسید/.test(dash), 'داشبورد مدیر هشدار سررسید دارد'); await page.screenshot({ path: 'shots/f5_dash.png', fullPage: true });
  // ۷) تاریخچه
  await go('history'); await sleep(1200);
  const htxt = await page.locator('#view').innerText(); ok(/سارا/.test(htxt) && /مهسا/.test(htxt) && /دریافت/.test(htxt), 'تاریخچه شامل کار مهسا و مشتری سارا است');
  const hrows = await page.locator('tbody tr').count(); ok(hrows > 10, 'تعداد ردیف تاریخچه: ' + hrows); await page.screenshot({ path: 'shots/f5_history.png' });
  // ۸) اکسل
  await go('help'); const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('text=دانلود اکسل همه‌ی اطلاعات')]);
  const f = '/tmp/mara_dl.xlsx'; await dl.saveAs(f); ok(fs.statSync(f).size > 8000, 'اکسل دانلود شد ' + fs.statSync(f).size + ' بایت');
  // ۹) مرجوعی هنوز کار می‌کند + ابطال دریافت
  await go('pay?tab=col'); await sleep(500);
  await page.locator('tbody tr').first().click(); await sleep(300);
  await M.locator('button', { hasText: 'ابطال' }).click(); await sleep(200);
  await page.locator('.ov').last().locator('button', { hasText: 'باطل کن' }).click(); await sleep(200);
  await page.locator('.ov').last().locator('input').fill('تست'); await page.locator('.ov').last().locator('button', { hasText: 'تأیید' }).click(); await sleep(900);
  t = await D(); ok(t.collections.some(c => c.voided), 'ابطال دریافت کار کرد ' + await err());
  const tt = t.v_totals; ok(Math.abs(tt.check_diff) < 1, 'ترازنامه‌ی کنترلی صفر: ' + tt.check_diff);
  // ۱۰) خطا: ثبت نامعتبر پیام خوانا + کد می‌دهد
  await go('expenses'); await page.click('text=＋ هزینه‌ی جدید'); await M.locator('button', { hasText: 'ثبت هزینه' }).click(); await sleep(400); ok((await err()).length > 3, 'خطای اعتبارسنجی نمایش داده شد: ' + await err());
  await page.keyboard.press('Escape');
  // ۱۱) عیب‌یابی (مدیر)
  const ap = await newPage(browser, url, { logs }); await login(ap, 'hamid@example.com', 'hamid-pass-333');
  await ap.evaluate(() => { location.hash = '#/diag'; }); await ap.waitForTimeout(2500);
  const dtx = await ap.locator('#view').innerText(); ok(/اتصال به دیتابیس/.test(dtx) && /خطاهای اخیر/.test(dtx) && /CRON_KEY/.test(dtx), 'صفحه‌ی عیب‌یابی کامل است'); await ap.screenshot({ path: 'shots/f5_diag.png', fullPage: true });
  const mp0 = await newPage(browser, url, { logs }); await login(mp0, 'rana@example.com', 'rana-pass-22'); await mp0.evaluate(() => { location.hash = '#/diag'; }); await mp0.waitForTimeout(900);
  const rt = await mp0.locator('#view').innerText(); ok(!/اتصال به دیتابیس|CRON_KEY/.test(rt) && !(await mp0.url()).includes('diag'), 'همکار به صفحه‌ی عیب‌یابی نمی‌رسد (برگشت به خانه): ' + mp0.url().split('#')[1]);
  ok(await mp0.locator('a[data-r="diag"]').count() === 0, 'گزینه‌ی عیب‌یابی در منوی همکار نیست');
  ok(await ap.locator('a[data-r="diag"]').count() > 0, 'گزینه‌ی عیب‌یابی در منوی مدیر هست');
  // ۱۱.۵) مهسا و رعنا همه‌چیز همدیگر را می‌بینند
  const tk = async (i, pw) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: i, password: pw }) })).json()).data.token;
  const dat = async t => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + t } })).json()).data.tables;
  const dM = await dat(await tk('mahsa@example.com', 'mahsa-pass-1')), dR = await dat(await tk('rana@example.com', 'rana-pass-22'));
  const strip = t => JSON.stringify({ a: t.v_account_balance, s: t.v_stock, l: t.v_lots, v: t.v_sales });
  ok(strip(dM) === strip(dR), 'سرور برای مهسا و رعنا دقیقاً همان حساب‌ها، موجودی و فروش‌ها را می‌دهد');
  for (const [nm, who, other] of [['rana@example.com', 'رعنا', 'مهسا'], ['mahsa@example.com', 'مهسا', 'رعنا']]) {
    const pp = await newPage(browser, url, { logs }); await login(pp, nm, nm.startsWith('rana') ? 'rana-pass-22' : 'mahsa-pass-1'); await pp.waitForTimeout(900);
    const dx = await pp.locator('.dash').innerText();
    ok(/امروز من/.test(dx) && dx.includes('جنس دست ' + other), `داشبورد ${who}: کارت خودش و موجودی جنس ${other}`);
    ok(!/مقایسه|کل MARA/.test(dx) && await pp.locator('.pg').count() === 0, `داشبورد ${who}: بدون مقایسه‌ی عملکرد`);
    await pp.close();
  }
  const pm = await newPage(browser, url, { viewport: { width: 390, height: 844 }, logs }); await login(pm, 'mahsa@example.com', 'mahsa-pass-1'); await pm.waitForTimeout(700); ok(await pm.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'داشبورد موبایل: بدون سرریز افقی'); await pm.screenshot({ path: 'shots/f5_partners_m.png' }); await pm.close();
  // ۱۲) موبایل
  const mp = await newPage(browser, url, { viewport: { width: 390, height: 844 }, logs }); await login(mp, 'rana@example.com', 'rana-pass-22');
  for (const r of ['customers', 'invoices', 'history']) { await mp.evaluate(x => { location.hash = '#/' + x; }, r); await mp.waitForTimeout(900); ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `موبایل ${r}: بدون سرریز افقی`); await mp.screenshot({ path: `shots/f5_m_${r}.png` }); }
  await mp.click('text=دریافت از مشتری').catch(() => {});
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|403|401|400|404/.test(l)); if (real.length) { console.log('LOGS', [...new Set(real)]); fails++; }
  console.log(fails ? 'FAILS: ' + fails : 'ALL FLOWS OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
}
main().catch(async e => { console.log('ERR', e.message.split('\n')[0]); await page.screenshot({ path: 'shots/fail.png' }); console.log([...new Set(logs.filter(l => !/ERR_FAILED/.test(l)))]); process.exit(1); });
