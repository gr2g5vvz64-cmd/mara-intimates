import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const fa = x => String(x).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const sleep = ms => page.waitForTimeout(ms);
const GH = (pg, root, name) => pg.locator(root + ' .gh').filter({ has: pg.locator('.nt', { hasText: new RegExp('^' + name + '$') }) });
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(400); };
try {
  const heads = (await page.locator('.side nav .gh .nt').allInnerTexts()).map(x => x.trim());
  ok(heads.join('|') === 'فروش|خرید|انبار|مالی|تنظیمات', 'پنج گروه به ترتیب: ' + heads.join('|'));
  ok(await page.locator('.side nav > a[data-r=""]').count() === 1, 'خانه جدا و بالای گروه‌ها است');
  await go('#/'); await page.evaluate(() => localStorage.removeItem('mara.nav.مهسا')); await page.reload(); await page.waitForSelector('#view'); await sleep(500);
  ok(await page.locator('.side .grp.open').count() === 0, 'در صفحه‌ی خانه همه‌ی گروه‌ها بسته‌اند');
  ok(await page.locator('.side a[data-r="sales"]').isHidden(), 'زیرمجموعه‌ی بسته دیده نمی‌شود');
  // رفتن به صفحه‌ی داخل یک گروه، گروه خودکار باز می‌شود
  await go('#/customers');
  ok(await page.locator('.side .grp.open .nt', { hasText: /^مشتریان/ }).count() === 1, 'گروه «فروش» با رفتن به مشتریان خودکار باز شد');
  ok(await page.locator('.side .gh.hon .nt').innerText() === 'فروش', 'عنوان گروه فعال مشخص است');
  // باز و بسته کردن با کلیک و ماندگاری
  await GH(page, '.side', 'خرید').click(); await sleep(200);
  ok(await page.locator('.side a[data-r="returns"]').isVisible() && await page.locator('.side a[data-r="invoices"]').isVisible(), 'کلیک روی «خرید» زیرمجموعه‌ها (مرجوعی، بدهی به تامین‌کننده) را باز کرد');
  ok(await page.locator('.side .gh[aria-expanded=true]').count() === 2, 'aria-expanded درست است (۲ گروه باز)');
  await page.reload(); await page.waitForSelector('#view'); await sleep(600);
  ok(await page.locator('.side a[data-r="returns"]').isVisible(), 'باز بودن گروه «خرید» بعد از رفرش یادش می‌ماند');
  await GH(page, '.side', 'خرید').click(); await sleep(200);
  ok(await page.locator('.side a[data-r="returns"]').isHidden(), 'کلیک دوباره گروه را بست');
  // جابه‌جایی
  const where = {}; for (const k of ['sales', 'customers', 'purchases', 'invoices', 'suppliers', 'returns', 'stock', 'items', 'finance', 'pay', 'expenses', 'history', 'help', 'savelog', 'diag'])
    where[k] = await page.locator(`.side .grp:has(a[data-r="${k}"]) .gh .nt`).first().innerText().catch(() => null);
  const exp = { sales: 'فروش', customers: 'فروش', purchases: 'خرید', invoices: 'خرید', suppliers: 'خرید', returns: 'خرید', stock: 'انبار', items: 'انبار', finance: 'مالی', pay: 'مالی', expenses: 'مالی', history: 'مالی', help: 'تنظیمات', savelog: 'تنظیمات', diag: null };
  ok(Object.keys(exp).every(k => (where[k] || null) === exp[k]), 'هر صفحه در گروه درست است ' + JSON.stringify(where));
  ok(await page.locator('.side a[data-r="diag"]').count() === 0, 'عیب‌یابی برای همکار اصلاً در منو نیست');
  // رفتن با کلیک روی زیرمجموعه
  await GH(page, '.side', 'انبار').click(); await page.locator('.side a[data-r="items"]').click(); await sleep(400);
  ok(page.url().endsWith('#/items') && await page.locator('.side a[data-r="items"].on').count() === 1, 'کلیک روی «کالاها» صفحه را باز و فعال کرد');
  // شمارنده‌ی گروه
  const gc = await page.locator('.side .gh .cnt').evaluateAll(a => a.map(x => ({ h: x.hidden, t: x.innerText, c: x.className })));
  console.log('   ', JSON.stringify(gc));
  const gcS = await GH(page, '.side', 'فروش').locator('.cnt'); const own = await page.locator('.side a[data-r="sales"] .cnt').innerText();
  ok((fa(own) === '0') === await gcS.isHidden(), `شمارنده‌ی گروه فروش وقتی فروش باز دارد دیده می‌شود (sales=${own})`);
  // موبایل: منوی کشویی هم گروه‌بندی است
  const mp = await newPage(browser, url, { logs, viewport: { width: 390, height: 800 } }); await login(mp, 'rana@example.com', 'rana-pass-22'); mp.setDefaultTimeout(8000);
  await mp.click('.top .menu'); await mp.waitForSelector('.dnav');
  ok(await mp.locator('.dnav .gh').count() === 5, 'منوی کشویی گوشی هم ۵ گروه دارد');
  await GH(mp, '.dnav', 'مالی').click(); await mp.waitForTimeout(200);
  ok(await mp.locator('.dnav a[data-r="expenses"]').isVisible(), 'در گوشی گروه مالی باز شد');
  await mp.locator('.dnav a[data-r="expenses"]').click(); await mp.waitForTimeout(400);
  ok(mp.url().endsWith('#/expenses') && await mp.locator('.dnav').count() === 0 || await mp.locator('.drawer[hidden]').count() === 1, 'کلیک روی زیرمجموعه صفحه را باز و منو را بست');
  ok(await mp.locator('.bottom a').count() === 5, 'نوار پایین گوشی همان ۵ دکمه است');
  // مدیر: عیب‌یابی زیر تنظیمات
  const ap = await newPage(browser, url, { logs }); await login(ap, 'hamid@example.com', 'hamid-pass-333'); await ap.waitForTimeout(500);
  ok(await ap.locator('.side .grp:has(a[data-r="diag"]) .gh .nt').innerText() === 'تنظیمات', 'برای مدیر عیب‌یابی زیر «تنظیمات» است');
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close();
console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
