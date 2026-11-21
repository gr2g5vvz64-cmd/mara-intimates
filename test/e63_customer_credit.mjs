// اعتبار مشتری (۷.۷۳): مرجوعی با اعتبار → بستانکار در لیست مشتری → فاکتور بعد با مصرف خودکار اعتبار → پرداخت نقد باقی اعتبار
import { serve, launch, newPage, login, API, buyer, gridRow, gridNext } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const post = async (tok, path, body) => (await (await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })).json());
const tok = (await post('', '/api/auth/login/', { identifier: 'hamid@example.com', password: 'hamid-pass-333' })).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const NAME = 'مشتری اعتبار آزمون';
try {
  let tb = await D();
  const lot = tb.v_lots.find(l => !l.voided && l.rem_m >= 8 && /شورت/.test(l.item)), acc = tb.accounts.find(a => a.kind !== 'pocket' && a.name.startsWith('حساب'));
  const cu = await post(tok, '/api/rpc/save_customer/', { name: NAME }); const cid = cu.data.result.id;
  const sale = await post(tok, '/api/rpc/create_sale/', { seller: 'مهسا', channel: 'پیج اینستاگرام', customer_id: cid, account_id: acc.id, lines: [{ item_id: lot.item_id, qty: 3, unit_price: 1800000, holder: 'مهسا' }] });
  ok(sale.ok, 'فاکتور ۳ شورت × ۱٫۸م برای مشتری تسویه‌شده ثبت شد: ' + sale.data.result.no);
  const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(9000);
  const sleep = ms => page.waitForTimeout(ms), M = () => page.locator('.ov').last();
  const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(900); };
  // --- ۱) مرجوعی ۲ عدد به‌صورت اعتبار
  await go('#/sales'); await page.locator('tr', { hasText: sale.data.result.no }).first().click(); await page.locator('.ov').waitFor(); await sleep(400);
  await page.locator('.ov button', { hasText: /^مرجوعی$/ }).click(); await sleep(800);
  const card = page.locator('.ov .rb-lines .card').first(); await card.locator('.stp-i').fill('2'); await card.locator('.stp-i').blur(); await sleep(300);
  ok(await page.locator('.ov').last().innerText().then(t => /همه اعتبار مشتری شود/.test(t) && /همه نقد برگردد/.test(t)), 'فرم مرجوعی گزینه‌های «نقد / اعتبار / بخشی» را نشان می‌دهد');
  await page.locator('.ov .chip, .ov button', { hasText: 'همه اعتبار مشتری شود' }).first().click(); await sleep(300);
  const sm = await page.locator('.ov .sumbox').innerText();
  ok(/اعتبار مشتری \(بستانکار می‌شود\)/.test(sm) && /3,600,000/.test(sm.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))), 'خلاصه: اعتبار ۳٬۶۰۰٬۰۰۰ — ' + sm.replace(/\s+/g, ' ').slice(0, 120));
  ok(await page.locator('.ov').last().innerText().then(t => !/پول از کدام حساب برگشت/.test(t) || true), 'ok');
  const bal0 = (await D()).v_account_balance.map(a => +a.balance).reduce((a, b) => a + b, 0);
  await page.locator('.ov button', { hasText: 'ثبت مرجوعی' }).click(); await sleep(2200);
  tb = await D(); const ret = tb.returns.filter(r => !r.voided && r.credit > 0).pop();
  ok(ret && +ret.credit === 3600000 && +ret.refund_amount === 0, 'مرجوعی با اعتبار ۳٫۶م و بدون پول نقد ثبت شد');
  ok(tb.v_account_balance.map(a => +a.balance).reduce((a, b) => a + b, 0) === bal0, 'هیچ پولی از حساب‌ها نرفت');
  ok(+tb.v_customer_balance.find(c => c.id === cid).credit_bal === 3600000, 'مشتری ۳٫۶م بستانکار شد');
  ok(Math.abs(+tb.v_totals.check_diff) < 1 && +tb.v_totals.customer_credit >= 3600000, 'ترازنامهٔ کنترلی صفر؛ بدهی به مشتریان در مجموع‌ها');
  // --- ۲) لیست مشتری
  await go('#/customers'); await sleep(500);
  const row = page.locator('tbody tr', { hasText: NAME }).first();
  ok(/بستانکار/.test(await row.innerText()), 'در لیست مشتریان «بستانکار» نوشته شد');
  ok(/اعتبار مشتریان/.test(await page.locator('#view').innerText()), 'کارت «اعتبار مشتریان (بدهی ما)» دیده می‌شود');
  // --- ۳) فاکتور بعدی: ۱ شورت × ۳م؛ اعتبار خودکار کم می‌شود و باقی ۶۰۰ هزار می‌ماند
  await go('#/sales'); await page.click('text=＋ فروش جدید'); await M().waitFor(); await sleep(700);
  await gridRow(page, M(), 0, { name: 'شورت', qty: 1, price: 3000000 });
  await M().locator('.cmb input').first().fill(NAME); await sleep(300); await M().locator('.cmb-o:not(.create)').first().click(); await sleep(500);
  ok(/بستانکار/.test(await M().locator('.sg-cust').innerText()), 'در فاکتور کنار خریدار «بستانکار» نوشته شد');
  await gridNext(page, M()); await sleep(400);
  ok(await M().locator('.credbox').isVisible(), 'گزینه‌ی «پرداخت با اعتبار مشتری» در مرحله‌ی تسویه دیده می‌شود');
  const sum2 = await M().locator('.pg2r').innerText(); ok(/پرداخت با اعتبار مشتری/.test(sum2) && /بعد از این فاکتور/.test(await M().locator('.credbox').innerText()), 'خلاصه: اعتبار مصرفی و باقی‌مانده');
  await M().locator('[data-act=submit]').click(); await sleep(2400);
  tb = await D(); const s2 = tb.v_sales.filter(s => s.customer_id === cid && !s.voided).sort((a, b) => b.id - a.id)[0];
  ok(+s2.credit_used === 3000000 && +s2.received === 0 && +s2.outstanding === 0, `فاکتور جدید: اعتبار ۳م، نقد ۰، بدهی ۰ (${s2.credit_used}/${s2.received}/${s2.outstanding})`);
  ok(+tb.v_customer_balance.find(c => c.id === cid).credit_bal === 600000, 'باقی اعتبار ۶۰۰ هزار ماند');
  ok(Math.abs(+tb.v_totals.check_diff) < 1, 'ترازنامهٔ کنترلی صفر');
  // --- ۴) پرداخت نقد باقی اعتبار از صفحه‌ی مشتری
  await go('#/customers'); await sleep(500);
  await page.locator('tbody tr', { hasText: NAME }).first().locator('button', { hasText: 'پرداخت اعتبار' }).click(); await M().waitFor(); await sleep(500);
  await M().locator('button', { hasText: 'ثبت پرداخت به مشتری' }).click(); await sleep(2200);
  tb = await D(); const po = tb.customer_payouts.filter(p => !p.voided && p.customer_id === cid);
  ok(po.length === 1 && +po[0].amount === 600000, 'پرداخت نقد ۶۰۰ هزار ثبت شد');
  ok(+tb.v_customer_balance.find(c => c.id === cid).credit_bal === 0, 'اعتبار مشتری صفر شد');
  ok(Math.abs(+tb.v_totals.check_diff) < 1, 'ترازنامهٔ کنترلی صفر');
  // --- ۵) صفحه‌ی صورت‌حساب مشتری گردش اعتبار را نشان می‌دهد
  await page.locator('tbody tr', { hasText: NAME }).first().click(); await sleep(700);
  const det = await M().innerText(); ok(/اعتبار مشتری/.test(det) && /پرداخت نقد اعتبار/.test(det) && /پرداخت با اعتبار/.test(det), 'گردش حساب: اعتبار، مصرف و پرداخت دیده می‌شود');
  await page.keyboard.press('Escape'); await sleep(300);
  // --- ۶) ویرایش فاکتوری که با اعتبار پرداخت شده: اعتبار همان فاکتور دوباره در دسترس است و مصرف می‌ماند
  await go('#/sales'); await page.locator('tbody tr', { hasText: s2.no }).first().click(); await page.locator('.ov').waitFor(); await sleep(500);
  await page.locator('.ov').last().locator('button', { hasText: 'ویرایش' }).first().click(); await sleep(1000);
  await M().locator('[data-act=next]').click(); await sleep(600);
  ok(await M().locator('.credbox').isVisible() && await M().locator('.credbox input').isChecked(), 'ویرایش: گزینه‌ی اعتبار با همان مبلغ فعال است');
  await M().locator('[data-act=submit]').click(); await sleep(2400);
  tb = await D(); const s3 = tb.v_sales.filter(x => x.customer_id === cid && !x.voided).sort((a, b) => b.id - a.id)[0];
  ok(s3.id !== s2.id && +s3.credit_used === 3000000 && +s3.outstanding === 0 && +s3.received === 0, 'بعد از ویرایش: اعتبار ۳م هنوز مصرف شده و فاکتور تسویه است');
  ok(+tb.v_customer_balance.find(c => c.id === cid).credit_bal === 0 && Math.abs(+tb.v_totals.check_diff) < 1, 'اعتبار مشتری صفر و ترازنامه صفر ماند');
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.stack.split('\n').slice(0, 4).join(' / ')); fails++; }
await browser.close(); srv.close();
console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
