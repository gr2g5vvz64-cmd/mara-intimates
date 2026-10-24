import { serve, launch, newPage, login, API, gridRow, gridNext } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const fa = x => String(x).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,\s]/g, '');
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const M = page.locator('.ov').last(), sleep = ms => page.waitForTimeout(ms);
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(500); };
try {
  const t0 = await D(); const n0 = t0.purchase_invoices.length, items0 = t0.items.length;
  const bases = [...new Set(t0.items.filter(i => i.active).map(i => i.base_name || i.name))];
  console.log('bases:', bases.slice(0, 6).join(' | '));
  await go('#/purchases'); await page.click('text=＋ خرید جدید'); await M.waitFor(); await sleep(600);
  ok(await M.locator('.pgrow').count() === 1, 'فرم با یک ردیف خالی باز می‌شود');
  ok(await M.locator('.pg-head').isVisible(), 'سربرگ ستون‌ها دیده می‌شود');
  const hd = (await M.locator('.pg-head').innerText()).replace(/\s+/g, ' '); ok(hd.includes('سایز') && hd.includes('رنگ') && hd.includes('توضیحات') && hd.indexOf('رنگ') < hd.indexOf('فی') && hd.indexOf('تحویل') < hd.indexOf('توضیحات'), 'ترتیب ستون‌ها و ستون آخر «توضیحات»: ' + hd);
  // ردیف ۱
  await gridRow(page, M, 0, { name: 'سوتین اسپرت', qty: 11, price: 900000, note: 'ارسال با پست پیشتاز ' + 'خیلی طولانی '.repeat(40) });
  ok(await M.locator('.pgrow').count() === 2, 'با پر شدن فی ردیف آخر، ردیف جدید خودکار ساخته شد');
  const r0 = M.locator('.pgrow').first();
  ok(await r0.locator('.c-dl input').nth(0).inputValue() === '6' && await r0.locator('.c-dl input').nth(1).inputValue() === '5', 'تحویل ۱۱ عدد: ۶ و ۵ (فرد)');
  await r0.locator('.c-dl input').nth(0).fill('4'); await sleep(100);
  ok(await r0.locator('.c-dl input').nth(1).inputValue() === '7', 'تحویل دستی ۴ → دیگری ۷');
  // موجودی هر نفر
  let bar = fa(await M.locator('.pgf-s').first().innerText());
  ok(bar.includes('+4عدد') && bar.includes('+7عدد') && bar.includes('3600000') && bar.includes('6300000'), 'نوار موجودی هر نفر: ' + bar.replace(/\n/g, ' '));
  // ردیف ۲: همان کالا با همان سایز/رنگ → تکراری
  ok((await r0.locator('.pg-code').innerText()).startsWith('MR-'), 'کد کالا خودکار در ستون کد: ' + await r0.locator('.pg-code').innerText());
  await gridRow(page, M, 1, { name: 'سوتین اسپرت', qty: 3, price: 800000 }); await sleep(150);
  ok(await M.locator('.pgrow.err').count() === 2 && /تکراری/.test(await M.locator('.pg-msg').first().innerText()), 'همان کد کالا دوبار: ردیف‌ها قرمز و پیام تکراری');
  await gridNext(page, M);
  ok(await M.locator('[data-act=back]').isHidden(), 'با تکراری نمی‌شود وارد مرحله مالی شد');
  await gridRow(page, M, 1, { name: 'جوراب ساق' }); await sleep(150);
  ok(await M.locator('.pgrow.err').count() === 0, 'با عوض شدن کالای ردیف، تکراری رفع شد');
  // ردیف ۳ ناقص (فقط نام)، ردیف ۴ ناقص (فقط فی) — ردیف ۳ فی ندارد
  ok(await M.locator('.pgrow').count() === 3, 'ردیف سوم خودکار');
  await gridRow(page, M, 2, { name: 'شورت پنبه', qty: 6 });
  await M.locator('.pgrow').nth(2).locator('.c-fee input').fill('0'); await sleep(100);
  ok(/فی ندارد/.test(await M.locator('.pgrow').nth(2).innerText()), 'ردیف بدون فی: هشدار «فی ندارد»');
  // تعداد صفر
  await gridRow(page, M, 2, { price: 50000 }); await M.locator('.pgrow').nth(2).locator('.c-qty input').fill('0'); await sleep(120);
  ok(/تعداد را پر کن/.test(await M.locator('.pgrow').nth(2).innerText()), 'تعداد صفر: هشدار');
  await gridNext(page, M);
  ok(await M.locator('[data-act=back]').isHidden(), 'با تعداد صفر هم جلوی ادامه گرفته شد');
  await M.locator('.pgrow').nth(2).locator('.c-qty input').fill('6'); await sleep(100);
  // یک ردیف ناقص (فقط نام) برای تست حذف با تأیید
  const cnt = await M.locator('.pgrow').count();
  await gridRow(page, M, cnt - 1, { name: 'ست لاکچری' });
  ok(/فی ندارد/.test(await M.locator('.pgrow').nth(cnt - 1).innerText()), 'ردیف فقط-نام: هشدار فی ندارد');
  await gridNext(page, M);
  ok(await M.locator('text=ردیف‌های ناقص').count() === 1, 'پنجرهٔ تأیید حذف ردیف ناقص باز شد');
  await page.screenshot({ path: '/tmp/grid_confirm.png' });
  await page.locator('.ov').last().locator('button', { hasText: 'برگرد و تکمیل' }).click(); await sleep(300);
  ok(await M.locator('[data-act=back]').isHidden() && await M.locator('.pgrow').count() === cnt, 'انصراف: همه‌ی ردیف‌ها مانده');
  await gridNext(page, M); await page.locator('.ov').last().locator('button', { hasText: 'بله، حذف کن' }).click(); await sleep(500);
  ok(await M.locator('[data-act=back]').isVisible(), 'تأیید حذف → مرحلهٔ مالی');
  const il = (await M.locator('.pg-il').innerText()); ok(il.includes('ارسال با پست پیشتاز') && il.includes('خیلی طولانی'), 'توضیح بلند کامل در «اقلام در فاکتور»');
  await page.screenshot({ path: '/tmp/grid_fin.png' });
  // مالی
  await M.locator('.pg2 .cmb input').first().fill('بازار تهران'); await M.locator('.cmb-o', { hasText: 'بازار تهران' }).first().click(); await sleep(200);
  await M.locator('.pg2 .lcard').first().locator('button.chip', { hasText: 'حساب مهسا' }).click(); await sleep(150); await M.locator('[data-act=submit]').click(); await sleep(2500);
  const t1 = await D(); const inv = t1.purchase_invoices.sort((a, b) => b.id - a.id)[0];
  ok(t1.purchase_invoices.length === n0 + 1, 'فاکتور ثبت شد');
  const ls = t1.purchase_lines.filter(l => l.invoice_id === inv.id).sort((a, b) => a.id - b.id);
  ok(ls.length === 3 && ls[0].hold_m === 4 && ls[0].hold_r === 7 && ls[0].note && ls[0].note.length > 300, `۳ ردیف، تحویل ۴/۷ و توضیح بلند ذخیره شد (${ls.length})`);
  ok(ls[1].note == null && ls[2].qty === 6, 'ردیف‌ها درست');
  console.log('items:', items0, '->', t1.items.length);
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message.split('\n')[0]); await page.screenshot({ path: '/tmp/grid_fail.png' }).catch(() => {}); fails++; }
await browser.close(); srv.close();
console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
