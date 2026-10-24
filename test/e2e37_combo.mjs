// فهرست جستجوی خریدار روی همه‌چیز می‌نشیند و بریده نمی‌شود
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tokOf = async (e, p) => (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: e, password: p }) })).json()).data.token;
const rpc = async (tk, fn, body) => (await fetch(API + '/api/rpc/' + fn + '/', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tk }, body: JSON.stringify(body) })).json();
const page = await newPage(browser, url, { logs }); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); page.setDefaultTimeout(8000);
const sleep = ms => page.waitForTimeout(ms), go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(700); };
try {
  for (const vw of [{ width: 1280, height: 800 }, { width: 390, height: 780 }]) {
    await page.setViewportSize(vw); await page.reload(); await sleep(1500); await go('#/sales'); await page.click('text=＋ فروش جدید'); await sleep(900);
    const inp = page.locator('.ov input[placeholder*="نام خریدار"]').first(); await inp.click(); await sleep(400);
    const r = await page.evaluate(() => {
      const l = document.querySelector('.ov .cmb-list:not([hidden])'); if (!l) return { none: true };
      const b = l.getBoundingClientRect(), cs = getComputedStyle(l); const opts = [...l.querySelectorAll('.cmb-o')];
      const o = opts[Math.min(1, opts.length - 1)]; const ob = o ? o.getBoundingClientRect() : null;
      const top = ob ? document.elementFromPoint(ob.left + ob.width / 2, ob.top + ob.height / 2) : null;
      return { fixed: cs.position === 'fixed', inView: b.left >= 0 && b.right <= innerWidth + 1 && b.top >= 0 && b.bottom <= innerHeight + 1, n: opts.length, covered: !!(top && !l.contains(top)) };
    });
    ok(!r.none && r.fixed && r.inView, `${vw.width}px: فهرست ثابت و داخل صفحه است ` + JSON.stringify(r));
    ok(!r.covered, `${vw.width}px: هیچ کارت دیگری روی فهرست نیست`);
    await page.screenshot({ path: `/tmp/pdfx/combo_${vw.width}.png` }); await page.keyboard.press('Escape'); await sleep(200);
  }
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close(); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
