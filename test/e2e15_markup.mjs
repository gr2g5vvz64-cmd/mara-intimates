import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const fa = x => String(x).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,\s]/g, '');
const roundK = n => Math.round(n / 1000) * 1000;
const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
const M = page.locator('.ov').last(), sleep = ms => page.waitForTimeout(ms);
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(700); };
const priceFor = async name => {
  await go('#/sales'); await page.click('text=＋ فروش جدید'); await M.waitFor(); await sleep(500);
  const c = M.locator('.lcard').first(); await c.locator('.cmb input').fill(name); await c.locator('.cmb-o').first().click(); await sleep(500);
  const cost = +fa(await c.locator('.c-cost .ro').innerText()), price = +fa(await c.locator('.c-price input').inputValue());
  await page.keyboard.press('Escape'); await sleep(300); return { cost, price };
};
try {
  await go('#/calc'); const body = await page.locator('body').innerText();
  ok(body.includes('درصد سود هر دسته') && body.includes('شورت') && body.includes('جوراب'), 'صفحه‌ی محاسبات: همه‌ی دسته‌ها با فیلد درصد');
  const a0 = await priceFor('شورت'); ok(a0.price === roundK(a0.cost * 1.2), `پیش‌فرض ۲۰٪: ${a0.cost} → ${a0.price}`);
  await go('#/calc'); const row = page.locator('.li', { hasText: 'شورت' }).first(); await row.locator('input').fill('40'); await row.locator('button', { hasText: 'ذخیره' }).click(); await sleep(1500);
  const a1 = await priceFor('شورت'); ok(a1.price === roundK(a1.cost * 1.4), `بعد از ۴۰٪ برای شورت: ${a1.cost} → ${a1.price}`);
  const j = await priceFor('جوراب'); ok(j.price === roundK(j.cost * 1.2), `جوراب (بدون درصد جدا) هنوز ۲۰٪: ${j.cost} → ${j.price}`);
  await go('#/calc'); const row2 = page.locator('.li', { hasText: 'جوراب' }).first(); await row2.locator('input').fill('5'); await row2.locator('button', { hasText: 'ذخیره' }).click(); await sleep(1500);
  const j2 = await priceFor('جوراب'); ok(j2.price === roundK(j2.cost * 1.05), `جوراب ۵٪: ${j2.cost} → ${j2.price}`);
  await go('#/calc'); await page.locator('input[aria-label="درصد سود پیش‌فرض کل"]').fill('30'); await page.locator('button', { hasText: 'ذخیره‌ی پیش‌فرض' }).click(); await sleep(1500);
  const t = await priceFor('ست'); ok(t.price === roundK(t.cost * 1.3), `پیش‌فرض کل ۳۰٪ برای دسته‌ی بدون درصد: ${t.cost} → ${t.price}`);
  // مهسا
  const pm = await newPage(browser, url, { logs }); await login(pm, 'mahsa@example.com', 'mahsa-pass-1'); await pm.evaluate(() => { location.hash = '#/calc'; }); await sleep(800);
  ok((await pm.locator('body').innerText()).includes('فقط برای مدیر'), 'مهسا اجازه‌ی تغییر درصد ندارد');
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول' + (real.length ? ': ' + real.slice(0, 2).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message.split('\n')[0]); await page.screenshot({ path: '/tmp/e15.png' }); fails++; }
await browser.close(); srv.close(); console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
