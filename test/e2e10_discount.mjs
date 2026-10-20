import { serve, launch, newPage, login, API, buyer } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const fa = x => String(x).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,\s]/g, '');
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const M = page.locator('.ov').last(), sleep = ms => page.waitForTimeout(ms);
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(500); };
const F = (label) => M.locator('.fld', { hasText: label }).first();
const NAME = 'تاپ توضیح‌دار', DESC = 'نخی، رنگ مشکی، فری‌سایز';
try {
  // ۱) کالای جدید با توضیحات
  await go('#/items'); await page.locator('button', { hasText: '＋ کالای جدید' }).click(); await M.waitFor(); await sleep(300);
  const zt = await M.locator('.z2 > .zt').allInnerTexts();
  ok(zt.findIndex(x => x.includes('توضیحات برای مشتری')) > zt.findIndex(x => x.includes('مشخصات کالا')), 'کادر «توضیحات برای مشتری» بعد از «مشخصات کالا» است: ' + zt.slice(0, 4).map(x => x.replace(/\s+/g, ' ')).join(' | '));
  await F('نام کالا').locator('input').fill(NAME); await M.locator('textarea').fill(DESC);
  await M.locator('.chip', { hasText: 'تاپ' }).first().click(); await sleep(200);
  { const zs = M.locator('.z2').nth(2); while (await zs.locator('.chip.optc.on').count()) { await zs.locator('.chip.optc.on').first().click(); await sleep(60); } }
  await M.locator('button', { hasText: 'افزودن کالا' }).click(); await sleep(1800);
  const t0 = await D(); const item = t0.items.find(i => i.name === NAME);
  ok(item && item.description === DESC, 'توضیحات کالا در دیتابیس ذخیره شد');
  ok((await page.locator('body').innerText()).includes(DESC), 'توضیحات در لیست کالاها دیده می‌شود');

  // ۲) خرید با تخفیف
  await go('#/purchases'); await page.locator('button', { hasText: /خرید جدید/ }).first().click(); await M.waitFor(); await sleep(700);
  await M.locator('.cmb input').first().click(); await M.locator('.cmb-o').first().click(); await sleep(200);
  const c = M.locator('.dpanel'); await c.locator('.cmb input').fill('تاپ'); await c.locator('.ilist .cmb-o').first().click(); await sleep(300);
  ok(await c.locator('.idesc').isVisible() && (await c.locator('.idesc').innerText()).includes(DESC), 'توضیحات کالا زیر نام کالا در فاکتور خرید دیده می‌شود');
  await c.locator('.stp.big .stp-i').fill('10'); await c.locator('.sline .numinp').first().fill('100000'); await sleep(200); await c.locator('.add').click(); await sleep(200);
  const allL = await M.locator('.fld > .lbl').allInnerTexts(); ok(allL.some(x => x.includes('تخفیف خرید')), 'فیلد «تخفیف خرید» در فرم هست');
  await F('تخفیف خرید').locator('input').fill('200000'); await sleep(250);
  const sumTxt = (await M.locator('.sm2').first().innerText()).replace(/\s+/g, ' '); console.log('   ', sumTxt);
  ok(/تخفیف/.test(sumTxt) && fa(sumTxt).includes('800000'), 'خلاصه‌ی فاکتور: جمع پس از تخفیف ۸۰۰٬۰۰۰');
  ok(fa(await M.locator('.pgr2 .irow').first().innerText()).includes('80000'), 'قیمت تمام‌شده‌ی هر عدد پس از تخفیف ۸۰٬۰۰۰');
  await M.locator('.lcard', { hasText: 'پرداخت 1' }).locator('button.chip', { hasText: 'حساب مهسا' }).click(); await sleep(150);
  await M.locator('button', { hasText: 'ثبت فاکتور' }).click(); await sleep(2000);
  const t1 = await D(); const inv = t1.purchase_invoices.filter(i => i.supplier_id).sort((a, b) => b.id - a.id)[0];
  ok(inv && +inv.discount === 200000 && +inv.goods_total === 800000, `فاکتور خرید: تخفیف ${inv && inv.discount} · جمع پس از تخفیف ${inv && inv.goods_total}`);
  const pl = t1.purchase_lines.filter(l => l.invoice_id === inv.id)[0]; ok(Math.round(pl.landed_unit) === 80000, 'بهای تمام‌شده‌ی ثبت‌شده ۸۰٬۰۰۰');
  const pay = t1.supplier_payments.filter(p => p.invoice_id === inv.id).reduce((a, p) => a + +p.amount, 0); ok(pay === 800000, 'پرداخت پیش‌فرض = مبلغ پس از تخفیف (' + pay + ')');

  // ۳) فروش با تخفیف
  await go('#/sales'); await page.click('text=＋ فروش جدید'); await M.waitFor(); await sleep(500);
  const sc = M.locator('.lcard').first(); await sc.locator('.cmb input').fill('تاپ'); await sc.locator('.cmb-o').first().click(); await sleep(400);
  ok(await sc.locator('.idesc').isVisible() && (await sc.locator('.idesc').innerText()).includes(DESC), 'توضیحات کالا در فرم فروش هم دیده می‌شود');
  const costTxt = fa(await sc.locator('.c-cost .ro').innerText()); const price = fa(await sc.locator('.c-price input').inputValue());
  ok(costTxt === '80000' && price === '96000', `بهای تمام‌شده ۸۰٬۰۰۰ و فی فروش پیش‌فرض ۹۶٬۰۰۰ (${costTxt} / ${price})`);
  await sc.locator('.stp.big .stp-i').fill('2'); await sleep(200); await sc.locator('button.add').click(); await sleep(300);
  ok((await M.locator('.fld > .lbl').allInnerTexts()).some(x => x.includes('تخفیف فروش')), 'فیلد «تخفیف فروش» در فرم هست');
  await F('تخفیف فروش').locator('input').fill('42000'); await sleep(300);
  const st = fa(await page.locator('.ov .sm2').last().innerText()); ok(st.includes('192000') && st.includes('42000') && st.includes('150000'), 'خلاصه‌ی پایین فرم: جمع ۱۹۲٬۰۰۰ − تخفیف ۴۲٬۰۰۰ = ۱۵۰٬۰۰۰ ' + st);
  await buyer(page, M);
  await M.locator('button', { hasText: 'صدور فاکتور' }).click(); await sleep(2000);
  const t2 = await D(); const sale = t2.v_sales.sort((a, b) => b.id - a.id)[0];
  ok(+sale.total === 150000 && +sale.discount === 42000, `فروش: مبلغ ${sale.total} · تخفیف ${sale.discount}`);
  ok(Math.round(sale.profit) === 150000 - 160000 + 0 || Math.round(sale.profit) === -10000, 'سود = ۱۵۰٬۰۰۰ − ۲×۸۰٬۰۰۰ = −۱۰٬۰۰۰: ' + sale.profit);
  ok(+t2.v_totals.check_diff === 0, 'check_diff=0 (حساب‌ها بالانس هستند)');

  // ۴) جزئیات فاکتورها
  await go('#/sales'); await page.locator('tr, .li, .row').filter({ hasText: sale.no }).first().click(); await sleep(500);
  const dt = await M.innerText(); ok(dt.includes('تخفیف') && fa(dt).includes('42000') && dt.includes(DESC), 'جزئیات فروش: تخفیف و توضیحات کالا دیده می‌شود');
  await page.keyboard.press('Escape'); await sleep(300);
  await go('#/purchases'); await page.locator('tr, .li, .row').filter({ hasText: inv.no }).first().click(); await sleep(500);
  const pt = await M.innerText(); ok(pt.includes('تخفیف') && fa(pt).includes('200000') && pt.includes(DESC), 'جزئیات فاکتور خرید: تخفیف و توضیحات کالا دیده می‌شود');
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول' + (real.length ? ': ' + real.slice(0, 2).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message.split('\n')[0]); await page.screenshot({ path: '/tmp/e10.png' }); fails++; }
await browser.close(); srv.close();
console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
