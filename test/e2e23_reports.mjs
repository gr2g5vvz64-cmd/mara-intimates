import { execSync } from 'child_process';
import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const sleep = (p, ms) => p.waitForTimeout(ms);
const psql = q => execSync(`psql -h /tmp -p 5433 -U postgres mara_e2e -tAc "${q}"`).toString().trim();
try {
  // یک فروش «بدون‌نام» (مثل داده‌های قدیمی) بساز
  psql("alter table sales disable trigger audit_row; update sales set customer = null, customer_id = null where id = (select min(id) from sales where not voided); alter table sales enable trigger audit_row;");
  const nameless = psql("select no from sales where customer_id is null and not voided order by id limit 1");
  // ---- مدیر: سود و زیان ----
  const a = await newPage(browser, url, { logs, viewport: { width: 1280, height: 900 } }); await login(a, 'hamid@example.com', 'hamid-pass-333'); a.setDefaultTimeout(9000); await sleep(a, 900);
  ok(await a.locator('.side a[data-r="pnl"]').count() === 1 && await a.locator('.side a[data-r="settle"]').count() === 1, 'مدیر: «سود و زیان ماهانه» و «حساب‌وکتاب ماهانه» در منو');
  await a.evaluate(() => { location.hash = '#/pnl'; }); await a.waitForSelector('.rep .kpis', { timeout: 15000 }); await sleep(a, 400);
  let t = await a.locator('.rep').innerText();
  ok(t.includes('صورت سود و زیان') && t.includes('فروش خالص') && t.includes('بهای تمام‌شده') && t.includes('سود ناخالص') && t.includes('سود خالص ماه'), 'صفحه‌ی سود و زیان: بندهای اصلی');
  ok(t.includes('بدون نام خریدار'), 'هشدار فروش بدون نام خریدار در سود و زیان');
  const net = await a.evaluate(async () => { const st = await import('/js/store.js'); const r = await st.api('/api/report/month/?month=' + new Date().toISOString().slice(0, 4)); return null; }).catch(() => null);
  const rep = await a.evaluate(async () => {
    const st = await import('/js/store.js'), u = await import('/js/util.js'); const key = u.jmonthKey(u.todayISO());
    const r = await st.api('/api/report/month/?month=' + key); return { net: r.data.pnl.net_profit, tot: st.S.totals.profit };
  });
  ok(Math.abs(rep.net - rep.tot) < 1, `سود خالص ماه = سود کل (${Math.round(rep.net)})`);
  await a.screenshot({ path: 'shots/f23_pnl.png', fullPage: true });
  // ---- حساب‌وکتاب ماهانه ----
  await a.evaluate(() => { location.hash = '#/settle'; }); await a.waitForSelector('.rep .alert', { timeout: 15000 }); await sleep(a, 400);
  t = await a.locator('.rep').innerText();
  ok(t.includes('حساب‌وکتاب') && t.includes('سرمایه') && t.includes('برداشت سود تا امروز') && t.includes('برداشت سود فعلاً بسته'), 'حساب‌وکتاب ماهانه: سرمایه، برداشت و یادداشت بسته بودن برداشت');
  await a.screenshot({ path: 'shots/f23_settle.png', fullPage: true });
  // ---- قفل ماه ----
  await a.evaluate(() => { location.hash = '#/finance'; }); await sleep(a, 900);
  { const ft = await a.locator('#view').innerText(); ok(ft.includes('قفل پایان ماه') && !/۱۴۰۴|1404/.test(ft.split('قفل پایان ماه')[1] || ''), 'قفل پایان ماه فقط ماه‌های بعد از شروع کار (مهر ۱۴۰۵) را دارد'); }
  // ---- ثبت نام خریدار ----
  await a.evaluate(() => { location.hash = '#/sales'; }); await sleep(a, 900);
  const setBtn = a.locator('button', { hasText: 'ثبت نام' }).first(); ok(await setBtn.count() === 1, `فاکتور بدون خریدار (${nameless}): دکمه‌ی «ثبت نام»`);
  await setBtn.click(); await sleep(a, 400);
  const M = a.locator('.ov').last(); await M.locator('.cmb input').first().fill('محبوبه صادقی'); await sleep(a, 300);
  const cr = M.locator('.cmb-o.create'); await (await cr.count() ? cr.first() : M.locator('.cmb-o').first()).click(); await sleep(a, 1500);
  await M.locator('button', { hasText: 'ثبت نام خریدار' }).click();
  await a.waitForFunction(n => { const r = [...document.querySelectorAll('#view tbody tr')].find(t => t.textContent.includes(n)); return r && r.textContent.includes('محبوبه صادقی'); }, nameless, { timeout: 9000 }).catch(() => {});
  const rowTxt = await a.locator('#view tbody tr', { hasText: nameless }).first().innerText();
  ok(rowTxt.includes('محبوبه صادقی'), 'نام خریدار روی فاکتور قدیمی ثبت شد: ' + rowTxt.replace(/\s+/g, ' ').slice(0, 60));
  ok(psql(`select count(*) from sales where no='${nameless}' and voided`) === '0', 'فاکتور باطل نشد و شماره‌اش همان ماند');
  // ---- صورت‌حساب مشتری ----
  await a.locator('#view tbody tr', { hasText: nameless }).first().click(); await sleep(a, 500);
  await a.locator('.ov button', { hasText: 'صورت‌حساب برای مشتری' }).click(); await a.waitForSelector('.stm-img[src^="blob:"]', { timeout: 15000 }); await sleep(a, 600);
  const dim = await a.evaluate(() => { const i = document.querySelector('.stm-img'); return [i.naturalWidth, i.naturalHeight]; });
  ok(dim[0] === 1800 && dim[1] > 600, `پیش‌نمایش فاکتور ساخته شد: ${dim.join('×')}`);
  await a.locator('.stm-img').screenshot({ path: 'shots/f23_invoice.png' });
  ok(await a.locator('.ov a[download]').count() === 1 && await a.locator('.ov button', { hasText: 'ارسال' }).count() === 1, 'دکمه‌های ارسال، ذخیره و چاپ');
  await a.locator('.ov .x').last().click(); await sleep(a, 300); await a.keyboard.press('Escape'); await sleep(a, 300);
  await a.evaluate(() => { location.hash = '#/customers?debt=0'; }); await sleep(a, 900);
  await a.locator('#view tbody tr', { hasText: 'محبوبه صادقی' }).first().click(); await sleep(a, 500);
  await a.locator('.ov button', { hasText: 'صورت‌حساب برای ارسال' }).click(); await a.waitForSelector('.stm-img[src^="blob:"]', { timeout: 15000 }); await sleep(a, 600);
  await a.locator('.stm-img').screenshot({ path: 'shots/f23_statement.png' });
  ok(true, 'صورت‌حساب گردش حساب مشتری ساخته شد');
  // ---- شریک و مشاهده‌گر ----
  const m = await newPage(browser, url, { logs, viewport: { width: 1280, height: 900 } }); await login(m, 'mahsa@example.com', 'mahsa-pass-1'); await sleep(m, 900);
  ok(await m.locator('.side a[data-r="pnl"]').count() === 0 && await m.locator('.side a[data-r="settle"]').count() === 1, 'مهسا: سود و زیان ندارد، حساب‌وکتاب دارد');
  await m.evaluate(() => { location.hash = '#/pnl'; }); await sleep(m, 600); ok(!(await m.locator('.rep').count()), 'مهسا با آدرس مستقیم هم سود و زیان را باز نمی‌کند');
  await m.evaluate(() => { location.hash = '#/settle'; }); await m.waitForSelector('.rep .alert', { timeout: 15000 });
  const mt = await m.locator('.rep').innerText(); ok(mt.includes('حساب‌وکتاب') && !mt.includes('صورت سود و زیان'), 'مهسا حساب‌وکتاب را می‌بیند');
  const v = await newPage(browser, url, { logs, viewport: { width: 1280, height: 900 } }); await login(v, 'mahdi@example.com', 'mahdi-pass-44'); await sleep(v, 900);
  ok(await v.locator('.side a[data-r="pnl"]').count() === 0 && await v.locator('.side a[data-r="settle"]').count() === 0, 'مهدی: هیچ‌کدام از گزارش‌های ماهانه را ندارد');
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message.split('\n')[0]); fails++; }
await browser.close(); srv.close(); console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
