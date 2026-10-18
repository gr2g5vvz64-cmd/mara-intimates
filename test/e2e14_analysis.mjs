import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const sleep = (p, ms) => p.waitForTimeout(ms);
try {
  const pm = await newPage(browser, url, { logs }); await login(pm, 'mahsa@example.com', 'mahsa-pass-1'); await sleep(pm, 800);
  ok(await pm.locator('button.qa', { hasText: 'تحلیل' }).count() === 0, 'مهسا دکمه‌ی «تحلیل» را نمی‌بیند');
  const pa = await newPage(browser, url, { logs }); await login(pa, 'hamid@example.com', 'hamid-pass-333'); pa.setDefaultTimeout(8000); await sleep(pa, 800);
  const b = pa.locator('button.qa', { hasText: 'تحلیل' }); ok(await b.count() === 1, 'مدیر دکمه‌ی «تحلیل» را می‌بیند');
  await b.click(); await sleep(pa, 600);
  const M = pa.locator('.ov').last(); const t = await M.innerText();
  ok(t.includes('تحلیل سلامت سیستم') && t.includes('سالم'), 'پنجره‌ی تحلیل باز شد و بخش «سالم» دارد');
  ok(/مشکل|هشدار|همه‌چیز سالم/.test(t), 'نتیجه‌ی کلی نمایش داده شد: ' + t.split('\n').find(x => /مشکل|هشدار|سالم است/.test(x)));
  // یک فروش زیر قیمت تمام‌شده بسازیم تا تحلیل آن را پیدا کند
  const r = await pa.evaluate(async () => { const st = await import('/js/store.js'); const l = st.S.saleLines[0]; l.net_unit = l.unit_cost - 1000; const a = await import('/js/analysis.js'); return a.analyze().findings.map(f => f.title); });
  ok(r.some(x => x.includes('زیر قیمت تمام‌شده')), 'تحلیل فروش زیر قیمت تمام‌شده را پیدا می‌کند: ' + r.join(' | '));
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول' + (real.length ? ': ' + real.slice(0, 2).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message.split('\n')[0]); fails++; }
await browser.close(); srv.close(); console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
