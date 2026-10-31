import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
try {
  const page = await newPage(browser, url, { logs }); await page.addInitScript(() => { window.__MARA_ACTIVE_MS = 7000; window.__MARA_REFRESH_MS = 600; window.__MARA_IDLE_MS = 200; });
  await page.reload(); await login(page, 'mahsa@example.com', 'mahsa-pass-1'); let n = 0, pings = 0;
  page.on('request', r => { if (/\/api\/data\//.test(r.url())) n++; if (/\/api\/ping\//.test(r.url())) pings++; });
  await page.mouse.click(10, 10); await page.waitForTimeout(3500); const during = n;
  await page.waitForTimeout(13000); const after = n - during;
  ok(during >= 1, `وقتی کاربر فعال است به‌روزرسانی هست (${during})`);
  ok(after <= 1, `بعد از بی‌کاری (۷ ثانیه) به‌روزرسانی خودکار متوقف شد (${after})`);
  await page.mouse.click(10, 10); await page.waitForTimeout(5500); ok(n - during - after >= 1, 'با کار دوباره، به‌روزرسانی برمی‌گردد');
} catch (e) { ok(false, 'exception ' + e.message); }
await browser.close(); srv.close(); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
