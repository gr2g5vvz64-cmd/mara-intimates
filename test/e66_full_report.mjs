// گزارش جامع (۷.۷۵)
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const en = s => s.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬،]/g, ',');
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const T = (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
try {
  const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(9000);
  const sleep = ms => page.waitForTimeout(ms);
  await page.evaluate(() => { location.hash = '#/fullreport'; }); await sleep(900);
  ok(await page.locator('#view button', { hasText: 'ساخت گزارش کامل' }).count() === 1, 'دکمه‌ی ساخت هست');
  ok(await page.locator('#view .pack-sec').count() === 0, 'قبل از زدن دکمه گزارشی نیست');
  await page.locator('#view button', { hasText: 'ساخت گزارش کامل' }).click(); await sleep(2500);
  const n = await page.locator('#view .pack-sec').count(); ok(n === 10, 'ده بخش ساخته شد: ' + n);
  const txt = en(await page.locator('#view').innerText());
  const tot = T.v_totals, r = v => Math.round(v || 0).toLocaleString('en-US');
  ok(txt.includes(r(tot.net_worth)), 'کل دارایی خالص در گزارش: ' + r(tot.net_worth));
  ok(txt.includes(r(tot.business_balance)), 'مانده‌ی حساب‌ها در گزارش');
  ok(txt.includes(r(tot.stock_value)), 'ارزش موجودی در گزارش');
  ok(txt.includes(r(tot.profit)), 'سود کل در گزارش');
  const nCh = T.v_cheques.filter(c => !c.voided).length; const chRows = await page.locator('#view .pack-sec').nth(6).locator('tbody tr').count();
  ok(chRows === nCh, `ردیف چک‌ها ${chRows} = ${nCh}`);
  const sec1 = en(await page.locator('#view .pack-sec').nth(2).innerText());
  ok(/سرمایه/.test(sec1) && /طلب/.test(sec1), 'بخش سرمایه');
  for (const b of ['چاپ', 'اکسل کامل', 'کپی برای Claude', 'ذخیره‌ی متن']) ok(await page.locator('#view button', { hasText: b }).count() === 1, 'دکمه‌ی ' + b);
  // بازه‌ی «کل» پیش‌فرض است
  ok(await page.locator('select[aria-label="بازه‌ی جدول‌های ماهانه"]').inputValue() === 'all', 'بازه‌ی جدول ماهانه پیش‌فرض «کل» است');
  ok(/کل: از اولین فعالیت/.test(en(await page.locator('#view .pack-sec').nth(5).innerText())), 'عنوان ماه‌به‌ماه «کل: از اولین فعالیت…» است');
  // جنس مانده: همه‌ی کالاهای دارای موجودی با سن و فروش
  const haveN = T.v_stock.filter(i => i.active && i.rem > 0).length;
  const stRows = await page.locator('#view .pack-sec').nth(4).locator('table').nth(1).locator('tbody tr').count();
  ok(stRows === haveN, `ردیف کالاهای مانده ${stRows} = ${haveN}`);
  const stTxt = en(await page.locator('#view .pack-sec').nth(4).innerText());
  ok(/هرگز فروخته‌نشده/.test(stTxt) && /قدیمی‌ترین ورود/.test(stTxt) && /روز\)/.test(stTxt), 'بخش سن و فروش کالا');
  // خروج: درصد خالی = بر اساس فروش واقعی؛ با درصد، جدول عوض می‌شود
  const exSec = () => page.locator('#view .pack-sec').nth(8);
  ok(await page.locator('input[aria-label="درصد از فروش"]').inputValue() === '', 'درصد پیش‌فرض خالی است');
  ok(/بر اساس فروش واقعی/.test(await exSec().innerText()), 'خروج: بر اساس فروش واقعی');
  await page.locator('input[aria-label="درصد از فروش"]').fill('90'); await page.locator('input[aria-label="درصد از فروش"]').blur(); await sleep(700);
  const ex = en(await exSec().innerText()); ok(/طلب رعنا و مهدی/.test(ex) && /90/.test(ex) && !/بر اساس فروش واقعی/.test(ex), 'خروج با درصد انتخابی');
  await page.locator('input[aria-label="درصد از فروش"]').fill(''); await page.locator('input[aria-label="درصد از فروش"]').blur(); await sleep(700);
  ok(/بر اساس فروش واقعی/.test(await exSec().innerText()), 'خالی کردن درصد دوباره به فروش واقعی برمی‌گردد');
  // دانلود اکسل و متن
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('#view button', { hasText: 'ذخیره‌ی متن' }).click()]);
  const fs = await import('fs'); const p = await dl.path(); const body = fs.readFileSync(p, 'utf8');
  ok(/=== 1\) وضع کلی/.test(en(body)) && body.includes('=== درخواست ==='), 'متن ذخیره‌شده کامل است');
  ok(body.split('\n').length > 60, 'متن حجم کافی دارد: ' + body.split('\n').length + ' خط');
  const [dx] = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), page.locator('#view button', { hasText: 'اکسل کامل' }).click()]);
  ok(fs.statSync(await dx.path()).size > 5000, 'اکسل دانلود شد');
  ok(!logs.some(l => /error/i.test(l) && !/favicon|Failed to load resource/i.test(l)), 'خطای کنسول ندارد');
} catch (e) { console.log('ERR', e.message); fails++; }
await browser.close(); srv.kill && srv.kill();
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
