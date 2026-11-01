// پیام به مشتری: همه‌چیز دست مدیر؛ پیش‌فرض خاموش؛ حالت هر مشتری؛ لیست آماده‌ی ارسال؛ رد/ثبت دستی؛ شریک دسترسی ندارد
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const post = async (tok, path, body) => (await (await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })).json());
const tok = (await post('', '/api/auth/login/', { identifier: 'hamid@example.com', password: 'hamid-pass-333' })).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
await post(tok, '/api/rpc/save_setting/', { key: 'msg_start', value: 20260901 });
try {
  const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(9000);
  const sleep = ms => page.waitForTimeout(ms);
  await page.evaluate(() => { location.hash = '#/custmsg'; }); await sleep(1500);
  let t = await page.locator('#view').innerText();
  ok(t.includes('پیام به مشتری') && t.includes('خاموش') && t.includes('هیچ پیامی بدون دکمه'), 'صفحه باز شد و پیش‌فرض «خاموش» است');
  ok(/آماده‌ی ارسال \(۰\)|آماده‌ی ارسال \(0\)/.test(t), 'وقتی خاموش است چیزی آماده‌ی ارسال نیست');
  // حالت هر مشتری: اولین مشتری دارای فاکتور → «هر دو»
  let tb = await D(); const withSale = tb.v_sales.find(s => !s.voided && s.customer_id); const cust = tb.customers.find(c => c.id === withSale.customer_id);
  const row = page.locator('tr', { hasText: cust.name }).first(); await row.locator('select').selectOption('both'); await sleep(1500);
  tb = await D(); ok(tb.customers.find(c => c.id === cust.id).msg_mode === 'both', 'حالت «هر دو» برای ' + cust.name + ' ذخیره شد');
  ok(tb.customers.filter(c => c.msg_mode !== 'none').length === 1, 'بقیه‌ی مشتری‌ها همچنان «هیچ» هستند');
  // شروع را عقب می‌بریم تا فاکتورهای seed دیده شوند، بعد روشن می‌کنیم
  await page.locator('button', { hasText: 'روشن کن' }).click(); await sleep(500); await page.locator('.ov button', { hasText: 'روشن کن' }).click(); await sleep(1800);
  tb = await D(); ok(Number(tb.app_settings.find(x => x.key === 'msg_enabled').value) === 1, 'کلید کلی روشن شد (با تأیید)');
  ok(Number(tb.app_settings.find(x => x.key === 'msg_start').value) === 20260901, 'روشن کردن، تاریخ شروعِ از قبل تعیین‌شده را خراب نکرد');
  await page.evaluate(() => { location.hash = '#/'; }); await sleep(400); await page.evaluate(() => { location.hash = '#/custmsg'; }); await sleep(1200);
  t = await page.locator('#view').innerText();
  const mine = tb.v_sales.filter(s => !s.voided && s.customer_id === cust.id).length;
  ok(new RegExp(`آماده‌ی ارسال \\(${String(mine * 2).replace(/\d/g, d => `[${d}${'۰۱۲۳۴۵۶۷۸۹'[d]}]`)}\\)`).test(t), `آماده‌ی ارسال = ${mine * 2} (فاکتور + تشکر برای هر فاکتور ${cust.name})`);
  // باز کردن پنجره، بدون ربات بله: دکمه‌ی بله غیرفعال، واتس‌اپ لینک دارد
  await page.locator('button', { hasText: 'ارسال…' }).first().click(); await page.locator('.ov').waitFor(); await sleep(300);
  const bale = page.locator('.ov button', { hasText: 'ارسال با ربات بله' });
  ok(await bale.isDisabled(), 'مشتریِ وصل‌نشده: دکمه‌ی ارسال با بله غیرفعال است');
  const ta = await page.locator('.ov textarea').inputValue(); ok(ta.includes(cust.name) && !/\{\w+\}/.test(ta), 'متن پیام با نام مشتری پر شده و جای خالی نمانده');
  await page.locator('.ov button', { hasText: 'این را نفرست' }).click(); await sleep(1500);
  tb = await D(); ok(tb.customer_msgs.length === 1 && tb.customer_msgs[0].status === 'skipped' && tb.customer_msgs[0].channel === 'skip', 'رد کردن در تاریخچه ثبت شد (چیزی ارسال نشد)');
  // ثبت دستی ارسال: همان نوع برای همان فاکتور دوباره ممکن نیست
  const again = await post(tok, '/api/rpc/log_customer_msg/', { customer_id: cust.id, sale_id: tb.customer_msgs[0].sale_id, kind: tb.customer_msgs[0].kind, channel: 'manual', status: 'sent', text: 'x' });
  ok(!again.ok, 'تکرار ارسال برای همان فاکتور و همان نوع رد می‌شود');
  // متن‌ها
  await page.locator('button', { hasText: 'متن پیام‌ها' }).click(); await page.locator('.ov').waitFor();
  await page.locator('.ov textarea').first().fill('سلام {name} عزیز، ممنون از خریدتان 🌸'); await page.locator('.ov button', { hasText: 'ذخیره‌ی متن‌ها' }).click(); await sleep(1800);
  tb = await D(); ok(tb.app_texts.find(x => x.key === 'msg_thanks').text.startsWith('سلام {name} عزیز'), 'متن تشکر ویرایش و ذخیره شد');
  // شریک: صفحه بسته است
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR|clipboard/i.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join('|') : ''));
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close(); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
