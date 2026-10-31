import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tokOf = async (id, pw) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: id, password: pw }) })).json()).data.token;
const tok = await tokOf('hamid@example.com', 'hamid-pass-333');
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
try {
  // ----- مدیر -----
  let page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
  const sleep = ms => page.waitForTimeout(ms);
  await page.evaluate(() => { location.hash = '#/home'; }); await sleep(900);
  let txt = await page.locator('#view').innerText();
  ok(/(صبح|ظهر|عصر|شب) بخیر/.test(txt), 'کارت خوشامد دیده می‌شود');
  ok(await page.locator('.hero2 .hchip').count() > 0, 'چیپ‌های وضعیت هست');
  ok(txt.includes('سلامت سرمایه') && txt.includes('نقطه‌ی سربه‌سر') && txt.includes('هدف'), 'کارت سلامت سرمایه دیده می‌شود');
  ok(await page.locator('.lc').count() === 1 && await page.locator('.dn').count() === 1 && await page.locator('.feed').count() === 1, 'نمودار فروش، دونات و فید هست');
  ok(await page.locator('.kpi .spark').count() >= 2, 'نمودار کوچک روی کارت‌های عدد');
  const p0 = await page.locator('.lc .lc-svg path').nth(2).getAttribute('d');
  await page.locator('.lc .chip', { hasText: 'هفته' }).click(); await sleep(250);
  const p1 = await page.locator('.lc .lc-svg path').nth(2).getAttribute('d');
  ok(p0 !== p1 && (await page.locator('.lc .chip.on').innerText()).includes('هفته'), 'سوییچ روز/هفته/ماه نمودار را عوض می‌کند');
  await page.locator('.lc .chip', { hasText: 'روز' }).click(); await sleep(200);
  ok(await page.locator('.lc .lc-svg circle').count() === 7, 'نمای روز ۷ نقطه دارد');
  await page.screenshot({ path: '/tmp/dash_admin_desktop.png', fullPage: true });
  // هدف انبار
  await page.locator('.hc .mini', { hasText: 'هدف انبار' }).click(); await sleep(400);
  const M = page.locator('.ov').last(); await M.locator('.numinp').fill('45'); await M.locator('button', { hasText: 'ذخیره' }).click(); await sleep(1200);
  const st = (await D()).app_settings.find(s => s.key === 'stock_target_days'); ok(Number(st.value) === 45, 'هدف انبار ۴۵ روز ذخیره شد');
  ok((await page.locator('.hc').innerText()).includes('45'), 'کارت با هدف تازه به‌روز شد');
  // فرم هزینه: نوع خودکار
  await page.evaluate(() => { location.hash = '#/pay'; }); await sleep(700);
  await page.locator('[role=tab], button', { hasText: /^هزینه/ }).first().click().catch(() => {}); await sleep(300); await page.locator('button', { hasText: '＋ هزینه‌ی جدید' }).first().click(); await sleep(500);
  const E = page.locator('.ov').last();
  ok(await E.locator('[aria-label="نوع هزینه"] .chip.on').innerText() === 'متغیر', 'دسته‌ی پیش‌فرض (تبلیغات) → متغیر');
  await E.locator('.chip', { hasText: 'اجاره و تجهیزات' }).click(); await sleep(150);
  ok(await E.locator('[aria-label="نوع هزینه"] .chip.on').innerText() === 'ثابت', 'اجاره → ثابت خودکار');
  await E.locator('.numinp').first().fill('3000000'); await E.locator('button', { hasText: 'ثبت هزینه' }).click(); await sleep(1200);
  const ex = (await D()).expenses.filter(e => e.category === 'اجاره و تجهیزات').pop(); ok(ex && ex.kind === 'fixed' && Number(ex.amount) === 3000000, 'هزینه با نوع «ثابت» ذخیره شد');
  await page.evaluate(() => { location.hash = '#/home'; }); await sleep(900);
  ok((await page.locator('.hc').innerText()).includes('3 میلیون') || (await page.locator('.hc').innerText()).includes('3,000,000'), 'هزینه‌ی ثابت در سلامت سرمایه می‌آید');
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(500);
  await page.screenshot({ path: '/tmp/dash_admin_mobile.png', fullPage: true });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), 'موبایل مدیر: بدون سرریز افقی');
  await page.context().close();
  // ----- مهسا -----
  page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
  await page.waitForTimeout(900); txt = await page.locator('#view').innerText();
  ok(/(صبح|ظهر|عصر|شب) بخیر، مهسا/.test(txt), 'خوشامد مهسا');
  ok(!txt.includes('سلامت سرمایه') && !txt.includes('سربه‌سر') && !txt.includes('بدهی به تامین'), 'مهسا کارت سلامت سرمایه و اعداد کل را نمی‌بیند');
  ok(await page.locator('.lc').count() === 1 && (await page.locator('.lc').innerText()).includes('فروش مهسا') || (await page.locator('.lc').innerText()).includes('فروش من'), 'نمودار فروش خودش');
  await page.screenshot({ path: '/tmp/dash_partner_desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), 'موبایل مهسا: بدون سرریز افقی');
  await page.screenshot({ path: '/tmp/dash_partner_mobile.png', fullPage: true });
  await page.context().close();
  // ----- مهدی (فقط مشاهده) -----
  page = await newPage(browser, url, { logs }); await login(page, 'mahdi@example.com', 'mahdi-pass-44'); await page.waitForTimeout(900);
  txt = await page.locator('#view').innerText(); ok(/بخیر/.test(txt) && !txt.includes('سلامت سرمایه'), 'مهدی: خوشامد و بدون کارت مدیر');
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('ERR', e.message); fails++; }
await browser.close(); srv.close?.(); console.log(fails ? 'FAILS: ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
