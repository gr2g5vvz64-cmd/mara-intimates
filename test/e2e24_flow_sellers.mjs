import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
try {
  const a = await newPage(browser, url, { logs, viewport: { width: 1280, height: 900 } }); await login(a, 'hamid@example.com', 'hamid-pass-333'); a.setDefaultTimeout(9000); await a.waitForTimeout(1200);
  await a.waitForSelector('.dbody .kpis'); await a.waitForTimeout(500);
  const t = await a.locator('.dbody').innerText();
  ok(t.includes('خرید و فروش') && t.includes('خریدیم') && t.includes('فروختیم'), 'کارت خرید و فروش');
  ok(!t.includes('[object') && t.includes('خرید، فروش و دریافتی'), 'نمودار خرید/فروش/دریافتی');
  ok(t.includes('فروشنده‌ها') && t.includes('مشتری') && t.includes('مهسا') && t.includes('رعنا'), 'جدول فروشنده‌ها (مشتری هر فروشنده)');
  // مقایسه با محاسبه‌ی مستقل
  const r = await a.evaluate(async () => {
    const A = await import('/js/analytics.js'), u = await import('/js/util.js'), st = await import('/js/store.js');
    const P = A.period(365), f = A.flowStats(d => d >= P.from && d <= P.to), res = {};
    for (const p of ['مهسا', 'رعنا']) { const x = A.sellerStats(P.from, P.to, p); const ids = new Set(st.S.vSales.filter(s => !s.voided && s.seller === p && s.customer_id && s.date >= P.from && s.date <= P.to).map(s => s.customer_id)); res[p] = [x.customers, ids.size]; }
    const sold = st.S.vSales.filter(s => !s.voided && s.date >= P.from).reduce((q, s) => q + s.total, 0);
    return { res, f, sold, bought: st.S.vInvoices.filter(i => !i.voided && i.date >= P.from).reduce((q, i) => q + i.goods_total, 0) };
  });
  ok(r.res['مهسا'][0] === r.res['مهسا'][1] && r.res['رعنا'][0] === r.res['رعنا'][1], 'تعداد مشتری هر فروشنده درست: ' + JSON.stringify(r.res));
  ok(Math.abs(r.f.sold - r.sold) < 1 && Math.abs(r.f.bought - r.bought) < 1, `جمع فروش و خرید درست (${Math.round(r.f.sold)} / ${Math.round(r.f.bought)}) ؛ دریافتی ${Math.round(r.f.received)}`);
  await a.screenshot({ path: 'shots/f24_dash.png', fullPage: true });
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message.split('\n')[0]); fails++; }
await browser.close(); srv.close(); console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
