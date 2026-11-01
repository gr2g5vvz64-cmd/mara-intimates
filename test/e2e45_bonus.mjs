import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tokOf = async (id, pw) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: id, password: pw }) })).json()).data.token;
const tok = await tokOf('hamid@example.com', 'hamid-pass-333');
const H = { 'content-type': 'application/json', authorization: 'Bearer ' + tok };
const rpc = async (fn, p) => { const r = await fetch(API + '/api/rpc/' + fn + '/', { method: 'POST', headers: H, body: JSON.stringify(p) }); return { r, j: await r.json() }; };
const D = async () => (await (await fetch(API + '/api/data/', { headers: H })).json()).data.tables;
const fa = s => String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,]/g, '');
try {
  const T = await D(); const it = T.v_stock.filter(x => x.rem >= 12).sort((a, b) => b.rem - a.rem)[0]; const cost = it.value / it.rem, price = Math.round(cost * 1.3);
  const bank = T.accounts.find(a => a.kind !== 'pocket').id;
  const parts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const key = parts.find(p => p.type === 'year').value.replace(/\D/g, '').slice(0, 4) + '-' + parts.find(p => p.type === 'month').value;
  const goal = price * 5;
  for (const o of ['مهسا', 'رعنا']) await rpc('set_goal', { month: key, owner: o, amount: goal });
  const sale = async (seller, qty, channel = 'آشنایان') => (await rpc('create_sale', { seller, channel, customer: 'تست پاداش ' + seller, received: price * qty, account_id: bank, lines: [{ item_id: it.id, qty, unit_price: price }] })).r.status === 200;
  ok(await sale('مهسا', 7) && await sale('رعنا', 3) && await sale('رعنا', 1, 'پیج اینستاگرام'), 'فروش‌های آزمایشی ثبت شد (آشنایان مهسا ' + fmtN(price * 7) + ')');
  function fmtN(n) { return Math.round(n).toLocaleString('en-US'); }
  // مقدار سمت سرور برای مقایسه
  const rep = await (await fetch(API + `/api/report/month/?month=${key}`, { headers: H })).json(); const R = rep.data || rep; if (!R.settlement) console.log('REP', JSON.stringify(rep).slice(0, 200), key);
  const sv = Object.fromEntries(R.settlement.people.map(p => [p.name, p.bonus]));
  ok(sv['مهسا'].is_star && sv['مهسا'].total > sv['مهسا'].base && !sv['رعنا'].is_star, 'سرور: مهسا ستاره‌ی ماه است و پاداشش از پلکانی بیشتر');
  // ----- مدیر -----
  let page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
  const sleep = ms => page.waitForTimeout(ms);
  await page.evaluate(() => { location.hash = '#/home'; }); await sleep(1200);
  const card = page.locator('.card', { hasText: 'فروشنده‌ها و هدف فروش به آشنایان' }).first();
  const txt = await card.innerText();
  ok(txt.includes('پاداش آشنایان این ماه') && txt.includes('برتر ماه'), 'کارت فروشنده‌های مدیر: ستون پاداش و ستاره‌ی مهسا');
  const rowOf = n => card.locator('tr', { hasText: n }).first();
  const lastNum = async n => { const cells = await rowOf(n).locator('td').allInnerTexts(); return Number(fa(cells[cells.length - 1]).replace(/[^\d]/g, '').replace(/^(\d+)$/, '$1')); };
  const mv = await lastNum('مهسا'), rv = await lastNum('رعنا');
  ok(Math.abs(mv - Math.round(sv['مهسا'].total)) <= 1 || String(mv).startsWith(String(Math.round(sv['مهسا'].total))), `عدد مهسا با سرور یکی است (${mv} در برابر ${Math.round(sv['مهسا'].total)})`);
  ok(Math.abs(rv - Math.round(sv['رعنا'].total)) <= 1, `عدد رعنا با سرور یکی است (${rv} در برابر ${Math.round(sv['رعنا'].total)})`);
  ok(await card.locator('button', { hasText: 'تنظیم پاداش' }).count() === 1, 'دکمه‌ی تنظیم پاداش برای مدیر');
  await card.locator('button', { hasText: 'تنظیم پاداش' }).click(); await sleep(400);
  const M = page.locator('.ov').last(); const inputs = M.locator('.numinp');
  await inputs.nth(0).fill('6'); await M.locator('button', { hasText: 'ذخیره' }).click(); await sleep(1500);
  const st = Object.fromEntries((await D()).app_settings.map(s => [s.key, Number(s.value)]));
  ok(st.bonus_rate_base === 6 && st.bonus_rate_above === 15 && st.bonus_on === 1, 'تنظیم تازه ذخیره شد (۶٪ / ۱۵٪)');
  await rpc('save_setting', { key: 'bonus_rate_base', value: 5 });
  // تسویه
  await page.evaluate(() => { location.hash = '#/settle'; }); await sleep(1800);
  const st2 = await page.locator('#view').innerText();
  ok(st2.includes('پاداش فروش آشنایان') && st2.includes('فروشنده‌ی برتر ماه') && st2.includes('سهم پایه‌ی هر نفر'), 'حساب‌وکتاب ماهانه: ردیف پاداش و ستاره');
  await page.reload(); await sleep(1500); await page.evaluate(() => { location.hash = '#/finance'; }); await sleep(1500);
  const fin = page.locator('#view table').filter({ hasText: 'سهم از سود' }).first(); const ft = await fin.innerText();
  ok(ft.includes('۵۰٪ + پاداش'), 'صفحه‌ی مالی: ستون سهم از سود با پاداش');
  const shares = [];
  for (const n of ['مهسا', 'رعنا']) { const cells = await fin.locator('tr', { hasText: n }).first().locator('td').allInnerTexts(); shares.push(Number(fa(cells[3]).replace(/[^\d]/g, ''))); }
  ok(shares[0] > shares[1] && Math.abs(shares[0] - shares[1] - Math.round(sv['مهسا'].total - sv['رعنا'].total)) <= 2, `سهم‌ها دیگر برابر نیست (${shares.join(' / ')}) و اختلافشان همان اختلاف پاداش‌هاست`);
  // گزارش جلسه
  await page.evaluate(() => { location.hash = '#/meeting'; }); await sleep(1800);
  ok((await page.locator('#view').innerText()).includes('پاداش آشنایان تا الان'), 'گزارش جلسه پاداش را نشان می‌دهد');
  await page.screenshot({ path: '/tmp/bonus_admin.png', fullPage: true });
  await page.context().close();
  // ----- مهسا و رعنا -----
  page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000); await page.waitForTimeout(1500);
  let t = await page.locator('#view').innerText();
  ok(t.includes('پاداش تا الان') && t.includes('فروشنده‌ی برتر ماه هستی'), 'مهسا: پاداش و ستاره را می‌بیند');
  ok(!t.includes('تنظیم پاداش'), 'مهسا دکمه‌ی تنظیم پاداش ندارد');
  await page.context().close();
  page = await newPage(browser, url, { logs }); await login(page, 'rana@example.com', 'rana-pass-22'); page.setDefaultTimeout(8000); await page.waitForTimeout(1500);
  t = await page.locator('#view').innerText();
  ok(t.includes('پاداش تا الان') && !t.includes('فروشنده‌ی برتر ماه هستی') && !t.includes('تنظیم پاداش'), 'رعنا: فقط پاداش خودش، بدون ستاره و بدون تنظیم');
  ok(!/مهسا/.test(await page.locator('.card', { hasText: 'هدف فروش به آشنایان' }).first().innerText()), 'رعنا اطلاعات هدف/پاداش مهسا را نمی‌بیند');
  await page.context().close();
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول ' + errs.slice(0, 2).join('|'));
} catch (e) { console.log('ERR', e.message); fails++; }
await browser.close(); srv.close?.(); console.log(fails ? 'FAILS: ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
