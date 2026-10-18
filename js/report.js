// «تحلیل عملکرد»: هفته / ماه / سال را با دوره‌ی هم‌اندازه‌ی قبل مقایسه می‌کند و به زبان ساده می‌گوید چه شد، چرا شد و چه کار کنیم.
// همه‌ی عددها از داده‌های برنامه (همان که اکنون روی صفحه است) حساب می‌شود؛ حدس و تفسیر هوش مصنوعی در آن نیست.
import { S, activeSales, catOf } from './store.js';
import { fmt, jstr, sum } from './util.js';
import { period, salesStats, buyerStats, supplierStats, buyerTable, supplierTable, concentration, grandTotal, anonStats, stockAge, receivableAge, pct } from './analytics.js';
import { reorderSuggestions } from './insights.js';

export const PERIODS = [{ v: 7, label: 'هفته (۷ روز اخیر)', short: 'هفته', prev: 'هفته‌ی قبل' }, { v: 30, label: 'ماه (۳۰ روز اخیر)', short: 'ماه', prev: 'ماه قبل' }, { v: 365, label: 'سال (۳۶۵ روز اخیر)', short: 'سال', prev: 'سال قبل' }];
const inR = (d, a, b) => d >= a && d <= b;
const M = n => `${fmt(Math.round(n))} ریال`;
const arrow = p => (p == null ? '' : p >= 0 ? `▲ ${Math.abs(p)}٪` : `▼ ${Math.abs(p)}٪`);

function lineStats(a, b) {
  const ok = new Set(activeSales().filter(s => inR(s.date, a, b)).map(s => s.id)), byItem = new Map(), byCat = new Map();
  for (const l of S.saleLines) {
    if (!ok.has(l.sale_id)) continue;
    const it = S.I[l.item_id], rev = l.qty * l.net_unit, cost = l.qty * l.unit_cost, cat = catOf(it);
    for (const [m, k, label] of [[byItem, l.item_id, it ? it.name : '—'], [byCat, cat, cat]]) {
      const o = m.get(k) || { key: k, name: label, qty: 0, rev: 0, profit: 0 }; o.qty += l.qty; o.rev += rev; o.profit += rev - cost; m.set(k, o);
    }
  }
  const arr = m => [...m.values()].map(o => ({ ...o, margin: o.rev > 0 ? o.profit / o.rev * 100 : 0 })).sort((x, y) => y.profit - x.profit);
  return { items: arr(byItem), cats: arr(byCat) };
}
function costStats(a, b) {
  const ss = activeSales().filter(s => inR(s.date, a, b)), gross = new Map();
  for (const l of S.saleLines) gross.set(l.sale_id, (gross.get(l.sale_id) || 0) + l.qty * l.unit_price);
  const goods = sum(ss, s => gross.get(s.id) || 0), disc = sum(ss, s => s.discount || 0), ship = sum(ss, s => (s.courier || 0) + (s.pack || 0));
  const ret = S.returns.filter(r => !r.voided && r.kind === 'customer' && inR(r.date, a, b));
  return { goods, disc, discPct: goods > 0 ? disc / goods * 100 : 0, ship, retCount: ret.length, retLoss: -sum(ret, r => Math.min(0, r.profit_effect || 0)) };
}

export function buildReport(n) {
  const P = period(n), PER = PERIODS.find(x => x.v === n), cur = salesStats(P.from, P.to), prev = salesStats(P.pFrom, P.pTo);
  const cc = costStats(P.from, P.to), pc = costStats(P.pFrom, P.pTo), li = lineStats(P.from, P.to), lp = lineStats(P.pFrom, P.pTo);
  const B = buyerStats(P.from, P.to), Bp = buyerStats(P.pFrom, P.pTo), SU = supplierStats(P.from, P.to);
  const bt = buyerTable(P.from, P.to).filter(r => r.rangeTotal > 0), conc = concentration(bt, grandTotal(P.from, P.to)), an = anonStats(P.from, P.to);
  const lost = buyerTable(P.pFrom, P.pTo).filter(r => r.rangeTotal > 0 && !B.activeSet.has(r.id)).slice(0, 5);
  const T = S.totals || {}, ra = receivableAge(), sa = stockAge();
  const sections = [], advice = [];
  const S1 = (title, rows) => rows.length && sections.push({ title, rows });
  const row = (tone, text) => ({ tone, text });

  // ۱) خلاصه
  const dS = pct(cur.sales, prev.sales), dP = pct(cur.profit, prev.profit);
  const sum1 = [row(cur.sales > 0 ? (dS == null || dS >= 0 ? 'pos' : 'neg') : 'info',
    cur.count ? `${fmt(cur.count)} فاکتور فروختیم؛ فروش ${M(cur.sales)}${dS != null ? ` (${arrow(dS)} نسبت به ${PER.prev})` : ''}.` : `در این ${PER.short} فروشی ثبت نشده.`)];
  if (cur.count || prev.count) sum1.push(row(cur.profit >= 0 ? (dP == null || dP >= 0 ? 'pos' : 'neg') : 'neg',
    `سود خالص ${M(cur.profit)}${dP != null ? ` (${arrow(dP)})` : ''}؛ درصد سود ${cur.margin.toFixed(1)}٪ در برابر ${prev.margin.toFixed(1)}٪ ${PER.prev}.`));
  S1('خلاصه', sum1);

  // ۲) چرا سود این‌طور شد
  const why = [], dm = cur.margin - prev.margin;
  const dGross = cur.gross - prev.gross, dExp = cur.expenses - prev.expenses, dDisc = cc.disc - pc.disc, dShip = cc.ship - pc.ship;
  if (prev.count && cur.count) {
    const parts = [['سود فروش‌ها', dGross], ['هزینه‌های عمومی', -dExp]].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    why.push(row(dGross - dExp >= 0 ? 'pos' : 'neg', `تغییر سود خالص ${(dGross - dExp) >= 0 ? '+' : '−'}${M(Math.abs(dGross - dExp))}؛ مهم‌ترین عامل: ${parts[0][0]} (${parts[0][1] >= 0 ? '+' : '−'}${M(Math.abs(parts[0][1]))}).`));
    if (Math.abs(dm) >= 1) why.push(row(dm >= 0 ? 'pos' : 'neg', `درصد سود ${dm >= 0 ? 'بالا' : 'پایین'} رفت (${dm >= 0 ? '+' : '−'}${Math.abs(dm).toFixed(1)} واحد).`));
    if (cc.discPct > pc.discPct + 1) why.push(row('neg', `تخفیف‌ها بیشتر شد: ${cc.discPct.toFixed(1)}٪ از فروش (قبل ${pc.discPct.toFixed(1)}٪) — ${M(cc.disc)} تخفیف دادیم.`));
    else if (cc.disc > 0) why.push(row('info', `تخفیف‌ها ${M(cc.disc)} بود (${cc.discPct.toFixed(1)}٪ از فروش).`));
    if (cc.ship > 0) why.push(row(cc.ship > pc.ship * 1.3 && dShip > 0 ? 'neg' : 'info', `هزینه‌ی پیک و بسته‌بندی ${M(cc.ship)} (${(cur.sales > 0 ? cc.ship / cur.sales * 100 : 0).toFixed(1)}٪ از فروش).`));
    if (cur.expenses > 0) why.push(row(dExp > 0 && cur.expenses > prev.expenses * 1.3 ? 'neg' : 'info', `هزینه‌های عمومی ${M(cur.expenses)}${prev.expenses ? ` (${arrow(pct(cur.expenses, prev.expenses))})` : ''}.`));
    if (cc.retCount) why.push(row('neg', `${fmt(cc.retCount)} مرجوعی از مشتری ثبت شد${cc.retLoss ? `؛ زیان ${M(cc.retLoss)}` : ''}.`));
  }
  S1('چرا این‌طور شد؟', why);

  // ۳) دسته و کالا
  const it = [], cats = li.cats.filter(c => c.rev > 0), items = li.items.filter(i => i.rev > 0);
  if (cats.length) {
    const best = cats[0], pb = lp.cats.find(c => c.key === best.key);
    it.push(row('pos', `بهترین دسته: «${best.name}» با ${M(best.profit)} سود (${best.margin.toFixed(0)}٪)${pb && pb.profit > 0 ? ` — ${arrow(pct(best.profit, pb.profit))} نسبت به ${PER.prev}` : ''}.`));
    const worst = [...cats].sort((x, y) => x.margin - y.margin)[0]; if (worst.key !== best.key && cats.length > 1) it.push(row(worst.margin < 15 ? 'neg' : 'info', `کم‌سودترین دسته: «${worst.name}» با ${worst.margin.toFixed(0)}٪ سود.`));
  }
  if (items.length) {
    it.push(row('pos', 'پرسودترین کالاها: ' + items.slice(0, 3).map(i => `${i.name} (${M(i.profit)}، ${fmt(i.qty)} عدد)`).join(' · ')));
    const bad = items.filter(i => i.margin < 10 && i.qty >= 2).sort((x, y) => x.margin - y.margin).slice(0, 3);
    if (bad.length) it.push(row('neg', 'کالاهایی که تقریباً بدون سود فروختیم: ' + bad.map(i => `${i.name} (${i.margin.toFixed(0)}٪)`).join(' · ')));
  }
  S1('دسته‌ها و کالاها', it);

  // ۴) خریداران و تامین‌کنندگان
  const pe = [];
  if (B.active) pe.push(row('info', `${fmt(B.active)} خریدار فعال بود (${fmt(B.fresh)} نفر جدید، ${B.repeat}٪ تکراری)؛ ${PER.prev}: ${fmt(Bp.active)} نفر.`));
  if (bt[0]) pe.push(row(bt[0].share >= 40 ? 'neg' : 'info', `بزرگ‌ترین خریدار: ${bt[0].name} (${bt[0].share.toFixed(0)}٪ فروش، ${M(bt[0].rangeTotal)}).`));
  if (an.count) pe.push(row(an.share >= 20 ? 'neg' : 'info', `${fmt(an.count)} فاکتور بدون نام خریدار (${M(an.total)}، ${an.share.toFixed(0)}٪ فروش)؛ سهم خریداران روی کل فروش حساب شده و با ثبت نام دقیق‌تر می‌شود.`));
  if (conc) pe.push(row(conc.share >= 70 ? 'neg' : 'info', `${fmt(conc.k)} نفر از ${fmt(conc.n)} خریدار، ${conc.share}٪ فروش را ساختند.`));
  if (lost.length) pe.push(row('neg', `${PER.prev} خرید کرده بودند ولی این دوره نه: ${lost.map(r => `${r.name} (${M(r.rangeTotal)})`).join('، ')}.`));
  if (SU.active) pe.push(row('info', `از ${fmt(SU.active)} تامین‌کننده ${M(SU.spent)} خرید کردیم (${fmt(SU.count)} فاکتور).`));
  S1('خریداران و تامین‌کنندگان', pe);

  // ۵) پول و موجودی
  const mo = [], newRecv = sum(cur.rows, s => Math.max(0, s.outstanding || 0));
  mo.push(row(T.receivable > 0 ? 'info' : 'pos', `طلب کل از مشتری‌ها: ${M(T.receivable || 0)}${newRecv ? `؛ از فروش‌های همین دوره ${M(newRecv)} هنوز نیامده` : ''}.`));
  if (ra.c > 0) mo.push(row('neg', `${M(ra.c)} بیش از ۸ روز مانده و ${M(ra.b)} بین ۴ تا ۷ روز است.`));
  if ((T.payable || 0) > 0) mo.push(row('info', `بدهی به تامین‌کنندگان: ${M(T.payable)}.`));
  mo.push(row('info', `ارزش موجودی انبار: ${M(T.stock_value || 0)}${sa.old + sa.mid > 0 ? `؛ از آن ${M(sa.old + sa.mid)} بیش از ۱۴ روز مانده (بیش از ۳۰ روز: ${M(sa.old)})` : ''}.`));
  S1('پول و موجودی', mo);

  // ۶) شرکا (فقط مدیر این صفحه را می‌بیند)
  const sh = ['مهسا', 'رعنا'].map(p => { const ss = cur.rows.filter(s => s.seller === p); return { p, n: ss.length, sales: sum(ss, s => s.total), profit: sum(ss, s => s.profit) }; });
  if (sh.some(x => x.n)) S1('مهسا و رعنا', sh.map(x => row('info', `${x.p}: ${fmt(x.n)} فاکتور، فروش ${M(x.sales)}، سود ${M(x.profit)}.`)));

  // ۷) پیشنهادهای عملی
  if (dm <= -3 && cur.count) advice.push('درصد سود حدود ' + Math.abs(dm).toFixed(0) + ' واحد افت کرده؛ تخفیف‌ها و قیمت‌گذاری کالاهای کم‌سود را مرور کن (محاسبات و درصد سود).');
  if (lost.length) advice.push(`با ${lost.slice(0, 3).map(r => r.name).join('، ')} تماس بگیرید؛ ${PER.prev} خرید کرده بودند و این بار نه.`);
  if (bt[0] && bt[0].share >= 40) advice.push(`وابستگی به ${bt[0].name} زیاد است (${bt[0].share.toFixed(0)}٪)؛ خریداران تازه جذب کنید.`);
  if (ra.c > 0) advice.push(`${M(ra.c)} طلب بیش از ۸ روز مانده؛ همین امروز پیگیری کنید.`);
  const re = reorderSuggestions().slice(0, 3); if (re.length) advice.push('خرید مجدد: ' + re.map(r => `${r.item.name} (حدود ${fmt(r.buy)} عدد)`).join('، ') + ' رو به اتمام است.');
  if (sa.old > 0) advice.push(`کالای بیش از ۳۰ روز مانده (${M(sa.old)}) را حراج کنید یا به تامین‌کننده برگردانید.`);
  if (cc.discPct > pc.discPct + 1 && cc.discPct > 5) advice.push('تخفیف‌ها بالا رفته؛ سقف تخفیف برای هر فاکتور تعیین کنید.');
  if (!advice.length && cur.count) advice.push('نکته‌ی نگران‌کننده‌ای نیست؛ روند فعلی را ادامه بدهید.');

  return { n, label: PER.label, from: P.from, to: P.to, pFrom: P.pFrom, pTo: P.pTo, sections, advice,
    kpi: { sales: cur.sales, profit: cur.profit, margin: cur.margin, count: cur.count, prevSales: prev.sales, prevProfit: prev.profit, prevMargin: prev.margin, prevCount: prev.count } };
}

export function reportText(r) {
  const out = [`📈 تحلیل عملکرد — ${r.label}`, `${jstr(r.from)} تا ${jstr(r.to)} (مقایسه با ${jstr(r.pFrom)} تا ${jstr(r.pTo)})`];
  for (const s of r.sections) { out.push('', '▸ ' + s.title); s.rows.forEach(x => out.push('  • ' + x.text)); }
  if (r.advice.length) { out.push('', '✅ پیشنهادها'); r.advice.forEach((a, i) => out.push(`  ${i + 1}. ${a}`)); }
  return out.join('\n');
}
