// سایز بر اساس دسته: شورت، سوتین، جوراب، لباس خواب؛ نوع سایز در مدیریت دسته‌ها
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
const sleep = ms => page.waitForTimeout(ms), M = page.locator('.ov').last();
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(500); };
const sizeZone = () => M.locator('.z2').nth(2);
try {
  await go('#/items'); await page.click('text=＋ کالای جدید'); await M.waitFor(); await sleep(300);
  ok((await sizeZone().innerText()).includes('اول دسته'), 'قبل از انتخاب دسته: سایزی نشان داده نمی‌شود');
  await M.locator('.chip', { hasText: /^شورت$/ }).first().click(); await sleep(200);
  let t = await sizeZone().innerText();
  ok(t.includes('سایزهای شورت') && t.includes('3XL') && t.includes('XS') && /دور باسن/.test(t), 'شورت: XS تا 3XL و راهنمای دور باسن');
  ok(await sizeZone().locator('.chip.optc.on').count() === 4, 'شورت: S تا XL از پیش انتخاب است');
  await M.locator('.chip', { hasText: /^سوتین$/ }).first().click(); await sleep(200);
  t = await sizeZone().innerText(); ok(t.includes('دور زیر سینه') && t.includes('کاپ') && !t.includes('3XL'), 'سوتین: دور زیر سینه و کاپ');
  ok(await sizeZone().locator('.vmx .vb').count() === 8, 'سوتین: جدول ۴ دور × ۲ کاپ = ۸ ترکیب');
  await M.locator('.chip', { hasText: /^جوراب$/ }).first().click(); await sleep(200);
  t = await sizeZone().innerText(); ok(t.includes('فری') && t.includes('۳۶–۴۰') && !t.includes('دور زیر سینه'), 'جوراب: فری و شماره‌ی کفش');
  // دسته‌ی لباس خواب (حرفی با سینه/کمر/باسن)
  await M.locator('button', { hasText: '＋ دسته‌ی جدید' }).click(); await page.locator('.ov').last().locator('input').fill('لباس خواب');
  await page.locator('.ov').last().locator('button', { hasText: /تأیید|ثبت|باشه|بله|افزودن|اوکی/ }).last().click(); await sleep(400);
  t = await sizeZone().innerText(); ok(t.includes('سایزهای لباس خواب') && /سینه/.test(t) && /کمر/.test(t) && !t.includes('3XL'), 'لباس خواب: XS تا XXL با سینه، کمر، باسن');
  await page.screenshot({ path: '/tmp/sizes_night.png' });
  await page.keyboard.press('Escape'); await sleep(300);
  // مدیریت دسته‌ها: نوع سایز عوض می‌شود و ماندگار است
  await page.locator('button', { hasText: /^دسته‌ها$/ }).click(); await M.waitFor(); await sleep(300);
  ok((await M.innerText()).includes('جمع‌بندی سایز هر دسته'), 'جمع‌بندی سایز در مدیریت دسته‌ها هست');
  const row = M.locator('.li', { hasText: 'تاپ' }).first();
  await row.locator('.kindrow .chip', { hasText: 'فقط فری' }).click(); await sleep(1500);
  const t1 = await D(); ok((t1.categories.find(c => c.name === 'تاپ') || {}).size_kind === 'free', 'نوع سایز دسته‌ی تاپ در دیتابیس «فقط فری» شد');
  await page.screenshot({ path: '/tmp/sizes_cats.png' });
  await page.keyboard.press('Escape'); await sleep(300);
  await page.click('text=＋ کالای جدید'); await M.waitFor(); await M.locator('.chip', { hasText: /^تاپ$/ }).first().click(); await sleep(200);
  t = await sizeZone().innerText(); ok(t.includes('فری') && !t.includes('XXL') && /محدوده/.test(t), 'تاپ با نوع «فقط فری»: فقط فری و تذکر فری‌سایز');
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close();
console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
