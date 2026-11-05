import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
try {
  const a = await newPage(browser, url, { logs, viewport: { width: 1280, height: 900 } }); await login(a, 'hamid@example.com', 'hamid-pass-333'); a.setDefaultTimeout(9000); await a.waitForTimeout(1500);
  // دادهٔ مصنوعی: سه دسته‌ی فروخته‌شده + یک دسته‌ی بدون فروش
  const r = await a.evaluate(async () => {
    const { S } = await import('/js/store.js'); const { todayISO } = await import('/js/util.js'); const { marginStatus } = await import('/js/dash_widgets.js');
    const t = todayISO(); S.I = {}; S.SALE = {}; S.saleLines = []; S.returns = []; S.stock = []; S.categories = [];
    const mk = (id, cat, sold, left) => { S.I[id] = { id, category: cat }; S.stock.push({ id, category: cat, active: true, rem: left });
      if (sold) { S.SALE[id] = { id, date: t, voided: false }; S.saleLines.push({ sale_id: id, item_id: id, qty: sold, net_unit: 150, unit_cost: 100 }); } };
    mk(1, 'کم', 1, 20);      // 1/21 = 4.8% → کم
    mk(2, 'کافی', 3, 12);    // 3/15 = 20% → کافی
    mk(3, 'مرز', 2, 18);     // 2/20 = 10% دقیقاً → کافی
    mk(4, 'بدون فروش', 0, 9);
    const m = marginStatus(); return m.items.map(i => ({ cat: i.cat, sold: i.sold, left: i.left, pct: Math.round(i.pct * 10) / 10, low: i.low }));
  });
  const g = n => r.find(x => x.cat === n);
  ok(g('کم') && g('کم').sold === 1 && g('کم').left === 20 && g('کم').low, 'فروخته ۱ / مانده ۲۰ → نمونه‌ی کم');
  ok(g('کافی') && g('کافی').pct === 20 && !g('کافی').low, '۳ از ۱۵ = ۲۰٪ → نمونه‌ی کافی');
  ok(g('مرز') && g('مرز').pct === 10 && !g('مرز').low, 'دقیقاً ۱۰٪ → نمونه‌ی کافی');
  ok(!g('بدون فروش'), 'دسته‌ی بدون فروش ردیف ندارد');
  // رندر روی داشبورد
  const html = await a.evaluate(async () => { const { healthCard } = await import('/js/dash_widgets.js'); const el = healthCard(); document.body.append(el); const rows = [...el.querySelectorAll('.hc-bar')].map(b => ({ cat: b.dataset.cat, low: b.classList.contains('low'), hatch: !!b.querySelector('.hc-fill.hatch'), txt: b.innerText.replace(/\s+/g, ' ') })); el.remove(); return rows; });
  const lo = html.find(x => x.cat === 'کم'), hi = html.find(x => x.cat === 'کافی');
  ok(lo && lo.low && lo.hatch && /نمونه‌ی کم/.test(lo.txt) && /فروختیم 1/.test(lo.txt) && /مانده 20/.test(lo.txt) && /موجودی فروخته شد/.test(lo.txt), 'ردیف نمونه‌ی کم: زمینه‌ی زرد + نوار راه‌راه + چیپ‌ها');
  ok(hi && !hi.low && !hi.hatch && /نمونه‌ی کافی/.test(hi.txt), 'ردیف کافی: عادی با نشان ✓');
  // بازشدن جزئیات کالا به کالا با کلیک روی ردیف
  const dd = await a.evaluate(async () => { const { healthCard } = await import('/js/dash_widgets.js'); const el = healthCard(); document.body.append(el); el.querySelector('.hc-bar[data-cat="کم"]').click(); await new Promise(r => setTimeout(r, 300)); const t = document.querySelector('.ov') ? document.querySelector('.ov').innerText : ''; document.querySelector('.ov') && document.querySelector('.ov').remove(); el.remove(); return t; });
  ok(/فروختیم/.test(dd) && /جمع/.test(dd) && /20/.test(dd), 'کلیک روی ردیف: جزئیات فروخته/مانده‌ی کالاها باز می‌شود');
  // برگشتی از فروخته کم می‌شود
  const rq = await a.evaluate(async () => { const { S } = await import('/js/store.js'); const { marginStatus } = await import('/js/dash_widgets.js'); S.saleLines.find(l => l.item_id === 2).returned_qty = 1; return marginStatus().items.find(i => i.cat === 'کافی').sold; });
  ok(rq === 2, 'فروخته = تعداد منهای برگشتی (۳ − ۱ = ۲)');
  // موبایل: خط اول نام و درصد، خط دوم چیپ‌ها
  await a.setViewportSize({ width: 390, height: 800 });
  const lay = await a.evaluate(async () => { const { healthCard } = await import('/js/dash_widgets.js'); const el = healthCard(); document.body.append(el); const b = el.querySelector('.hc-bar'); const n = b.querySelector('.hc-name').getBoundingClientRect(), c = b.querySelector('.hc-chips').getBoundingClientRect(), g = b.querySelector('.hc-mg').getBoundingClientRect(); el.remove(); return { sameLine: Math.abs(n.top - g.top) < 8, chipsBelow: c.top > n.bottom - 2 }; });
  ok(lay.sameLine && lay.chipsBelow, 'موبایل: نام و درصد در خط اول، چیپ‌ها در خط دوم');
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول');
} catch (e) { console.log('ERR', e.message.split('\n')[0]); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
