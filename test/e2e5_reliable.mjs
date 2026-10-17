import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tk = async (i, pw) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: i, password: pw }) })).json()).data.token;
const tok = await tk('hamid@example.com', 'hamid-pass-333');
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const M = page.locator('.ov'), sleep = ms => page.waitForTimeout(ms);
const go = async h => { await page.evaluate(x => { location.hash = '#/' + x; }, h); await sleep(500); };
const nSales = async () => (await D()).v_sales.length;
async function fillSale(price = '300000') {
  await go('sales'); await page.click('text=＋ فروش جدید');
  const card = M.locator('.lcard').first();
  await card.locator('.cmb input').fill('جوراب'); await card.locator('.cmb-o').first().click();
  await card.locator('.numinp').first().fill(price);
  await M.locator('button', { hasText: 'ثبت فروش' }).click();
}
const banner = () => page.locator('#savebar').innerText().catch(() => '');
try {
  // ۱) قطع شدن درخواست: صف ← هشدار ← ذخیره‌ی خودکار، فقط یک ثبت
  const n0 = await nSales(); let calls = 0;
  await page.route('**/api/rpc/create_sale/', r => { calls++; if (calls <= 2) return r.abort('failed'); return r.continue(); });
  await fillSale(); await sleep(1500);
  ok(await M.count() === 0, 'فرم بعد از رفتن به صف بسته شد (تا دوباره ثبت نشود)');
  ok(/ذخیره نشد/.test(await banner()) && await page.locator('.toast.warn').count() > 0, 'هشدار «ذخیره نشد» + نوار وضعیت: ' + (await banner()).replace(/\s+/g, ' ').slice(0, 80));
  ok(await nSales() === n0, 'هنوز در سرور نشسته (ثبت در صف است)');
  await page.screenshot({ path: 'shots/f5_queue_banner.png' });
  await page.waitForFunction(() => /ذخیره شد/.test(document.body.innerText) && document.getElementById('savebar').hidden, null, { timeout: 30000 });
  ok(await nSales() === n0 + 1, `بعد از تلاش خودکار دقیقاً یک فروش ثبت شد (تماس‌ها: ${calls})`);
  await page.unroute('**/api/rpc/create_sale/');
  // ۲) سرور ذخیره کرد ولی پاسخ گم شد → تلاش دوباره نباید دوبار ثبت کند
  const n1 = await nSales(); let c2 = 0;
  await page.route('**/api/rpc/create_sale/', async r => { c2++; if (c2 === 1) { await r.fetch(); return r.abort('failed'); } return r.continue(); });
  await fillSale('310000'); await page.waitForFunction(() => document.getElementById('savebar').hidden === true, null, { timeout: 30000 }).catch(() => {}); await sleep(5500);
  ok(await nSales() === n1 + 1, `پاسخ گم‌شده: باز هم فقط یک فروش (تماس‌ها: ${c2})`);
  await page.unroute('**/api/rpc/create_sale/');
  // ۳) رد شدن توسط قوانین هنگام تلاش مجدد: نگه داشته می‌شود
  let c3 = 0; await page.route('**/api/rpc/create_sale/', r => { c3++; if (c3 === 1) return r.abort('failed'); return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'E_BUSINESS', message: 'موجودی کافی نیست (تست)', where: 'db.create_sale', request_id: 'tst123' }) }); });
  await fillSale('320000'); await page.waitForFunction(() => /رد شد/.test(document.getElementById('savebar').innerText), null, { timeout: 30000 });
  ok(/رد شد/.test(await banner()), 'ثبت ردشده در نوار قرمز: ' + (await banner()).replace(/\s+/g, ' ').slice(0, 70));
  await go('savelog'); await sleep(400);
  const sl = await page.locator('#view').innerText(); ok(/موجودی کافی نیست \(تست\)/.test(sl) && /رها کردن/.test(sl) && /دوباره تلاش کن/.test(sl), 'صفحه‌ی گزارش ذخیره: دلیل + گزینه‌ها');
  await page.screenshot({ path: 'shots/f5_savelog.png', fullPage: true });
  // ۴) بسته/باز شدن صفحه: صف می‌ماند
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mara.outbox.v1') || '[]').length); ok(stored === 1, 'ثبت ردشده در حافظه‌ی مرورگر مانده (' + stored + ')');
  await page.reload(); await page.waitForSelector('#view'); await sleep(800);
  ok(/رد شد/.test(await banner()), 'بعد از بازکردن دوباره‌ی صفحه هنوز هشدار هست');
  await page.unroute('**/api/rpc/create_sale/');
  // ۵) اطلاعات قدیمی: ثبت موفق ولی بارگذاری دوباره قطع → هشدار → بازیابی خودکار
  await page.waitForFunction(() => document.getElementById('savebar').hidden === false); 
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('mara.outbox.v1') || '[]').filter(x => x.status !== 'blocked'); localStorage.setItem('mara.outbox.v1', JSON.stringify(s)); });
  await page.reload(); await page.waitForSelector('#view'); await sleep(600);
  let blockData = true; await page.route('**/api/data/', r => (blockData ? r.abort('failed') : r.continue()));
  await go('expenses'); await page.click('text=＋ هزینه‌ی جدید'); await M.locator('.numinp').first().fill('150000'); await M.locator('button', { hasText: 'ثبت هزینه' }).click();
  await page.waitForFunction(() => /اطلاعات از سرور نیامد/.test(document.getElementById('savebar').innerText), null, { timeout: 15000 });
  ok(true, 'هزینه ثبت شد ولی بارگذاری مجدد قطع بود → هشدار «اطلاعات از سرور نیامد»'); await page.screenshot({ path: 'shots/f5_stale.png' });
  blockData = false;
  await page.waitForFunction(() => !/اطلاعات از سرور نیامد/.test(document.getElementById('savebar').innerText), null, { timeout: 30000 });
  ok(true, 'بعد از وصل شدن، اطلاعات خودکار تازه شد');
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); if (real.length) { console.log(real); fails++; }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await page.screenshot({ path: 'shots/fail.png' }); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
