// دکمه‌ی «؟» در همه‌ی صفحه‌ها (۷.۷۴)
import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
try {
  const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(9000);
  const sleep = ms => page.waitForTimeout(ms);
  const keys = ['', 'sales', 'purchases', 'stock', 'pay', 'expenses', 'returns', 'sreturns', 'customers', 'invoices', 'finance', 'cheques', 'stocktake', 'monthcount', 'items', 'suppliers', 'history', 'help', 'mgmt', 'analysis', 'custmsg', 'calc', 'pack', 'pnl', 'meeting', 'settle', 'fund', 'savelog', 'stockaudit', 'diag', 'settings'];
  for (const k of keys) {
    await page.evaluate(x => { location.hash = x; }, '#/' + k); await sleep(900);
    const n = await page.locator('#view .qhelp').count();
    if (n !== 1) { ok(false, `صفحه «${k || 'خانه'}»: دکمه‌ی ؟ ${n} عدد`); continue; }
    await page.locator('#view .qhelp').click(); await sleep(200);
    const t = await page.locator('.ov').last().innerText();
    ok(/چه کار می‌شود کرد|این|صفحه|;/.test(t) && t.length > 60, `صفحه «${k || 'خانه'}»: ؟ باز می‌شود (${t.length} نویسه)`);
    await page.keyboard.press('Escape'); await sleep(150);
  }
} catch (e) { console.log('ERR', e.message); fails++; }
await browser.close(); srv.kill && srv.kill();
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
