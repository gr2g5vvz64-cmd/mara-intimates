// «تحلیل عملکرد»: هفته / ماه / سال را با دوره‌ی هم‌اندازه‌ی قبل مقایسه می‌کند و به زبان ساده می‌گوید چه شد، چرا شد و چه کار کنیم.
// همه‌ی عددها از داده‌های برنامه (همان که اکنون روی صفحه است) حساب می‌شود؛ حدس و تفسیر هوش مصنوعی در آن نیست.
import { S, activeSales, catOf } from './store.js';
import { fmt, jstr, sum, todayISO, jmonthKey } from './util.js';
import { period, salesStats, buyerStats, supplierStats, buyerTable, supplierTable, concentration, grandTotal, anonStats, stockAge, receivableAge, pct, bizDays, payableBreakdown, stockMonths, stockCoverText, profitWordShort, noExpensesYet, STALE_MID, STALE_OLD } from './analytics.js';
import { gate, GATES, enoughForPct, pctNote } from './gates.js';
import { profitStructure, liquidity } from './indicators.js';
import { reorderSuggestions } from './insights.js';

export const PERIODS = [{ v: 7, label: 'هفته (۷ روز اخیر)', short: 'هفته', prev: 'هفته‌ی قبل' }, { v: 30, label: 'ماه (۳۰ روز اخیر)', short: 'ماه', prev: 'ماه قبل' }, { v: 365, label: 'سال (۳۶۵ روز اخیر)', short: 'سال', prev: 'سال قبل' }];
const inR = (d, a, b) => d >= a && d <= b;
const M = n => `${fmt(Math.round(n))} ریال`;
const arrow = p => (p == null ? '' : p >= 0 ? `▲ ${Math.abs(p)}٪` : `▼ ${Math.abs(p)}٪`);

function lineStats(a, b) {
  const ok = new Set(activeSales().filter(s => inR(s.date, a, b)).map(s => s.id)), byItem = new Map(), byCat = new Map();
  for (const l of S.saleLines) {
    if (!ok.has(l.sale_id)) continue;
    const q = l.qty - (l.returned_qty || 0); if (q <= 0) continue;   // فروش خالص: مرجوعی کم می‌شود (هم‌خوان با مشاور خرید)
    const it = S.I[l.item_id], rev = q * l.net_unit, cost = q * l.unit_cost, cat = catOf(it);
    for (const [m, k, label] of [[byItem, l.item_id, it ? it.name : '—'], [byCat, cat, cat]]) {
      const o = m.get(k) || { key: k, name: label, qty: 0, rev: 0, profit: 0 }; o.qty += q; o.rev += rev; o.profit += rev - cost; m.set(k, o);
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
  return { goods, disc, discPct: goods > 0 ? disc / goods * 100 : 0, ship, retCount: ret.length, retLoss: -sum(ret, r => Math.min(0, r.profit_effect || 0)), retWhy: [...ret.reduce((m, r) => m.set(r.reason || 'علت ثبت نشده', (m.get(r.reason || 'علت ثبت نشده') || 0) + 1), new Map())].map(([k, n]) => `${k} ${fmt(n)}`).join('، ') };
}

export function buildReport(n) {
  const P = period(n), PER = PERIODS.find(x => x.v === n), cur = salesStats(P.from, P.to), prev = salesStats(P.pFrom, P.pTo);
  const cc = costStats(P.from, P.to), pc = costStats(P.pFrom, P.pTo), li = lineStats(P.from, P.to), lp = lineStats(P.pFrom, P.pTo);
  const B = buyerStats(P.from, P.to), Bp = buyerStats(P.pFrom, P.pTo), SU = supplierStats(P.from, P.to);
  const bt = buyerTable(P.from, P.to).filter(r => r.rangeTotal > 0), conc = concentration(bt, grandTotal(P.from, P.to)), an = anonStats(P.from, P.to);
  const lost = buyerTable(P.pFrom, P.pTo).filter(r => r.rangeTotal > 0 && !B.activeSet.has(r.id)).slice(0, 5);
  const T = S.totals || {}, ra = receivableAge(), sa = stockAge();
  const sections = [], advice = [], BD = bizDays(), young = BD < 60, hasPrev = prev.count > 0, thin = cur.count < 8 || BD < 45;
  const okPct = hasPrev && enoughForPct(cur.count, prev.count), PW = profitWordShort(), catGate = gate(GATES.category), catOk = catGate.ok && cur.count >= 8;
  const S1 = (title, rows) => rows.length && sections.push({ title, rows });
  const row = (tone, text) => ({ tone, text });

  // ۱) خلاصه (درصد تغییر فقط وقتی هر دو بازه فاکتور کافی دارند)
  const dS = pct(cur.sales, prev.sales), dP = pct(cur.profit, prev.profit);
  const cmp = (txt, a, b) => (okPct && a != null ? ` (${txt})` : hasPrev ? ` (${PER.prev}: ${M(b)}؛ درصد تغییر نشان داده نمی‌شود چون ${fmt(cur.count)} فاکتور در برابر ${fmt(prev.count)} فاکتور است)` : ' (دوره‌ی قبل فعالیتی نبود؛ مقایسه‌ای نیست)');
  const sum1 = [row(cur.sales > 0 ? (!okPct || dS == null || dS >= 0 ? 'pos' : 'neg') : 'info',
    cur.count ? `${fmt(cur.count)} فاکتور فروختیم؛ فروش ${M(cur.sales)}${cmp(`${arrow(dS)} نسبت به ${PER.prev}${prev.count < 5 && dS >= 50 ? '؛ پایه‌ی مقایسه کوچک است و درصد گمراه‌کننده است' : ''}`, dS, prev.sales)}.` : `در این ${PER.short} فروشی ثبت نشده.`)];
  if (cur.count || prev.count) sum1.push(row(cur.profit >= 0 ? (!okPct || dP == null || dP >= 0 ? 'pos' : 'neg') : 'neg',
    `${PW} ${M(cur.profit)}${cmp(arrow(dP), dP, prev.profit)}؛ درصد سود ${cur.margin.toFixed(1)}٪${hasPrev ? ` در برابر ${prev.margin.toFixed(1)}٪ ${PER.prev}` : ''}.`));
  if (noExpensesYet() && cur.count) sum1.push(row('info', 'هنوز هیچ هزینه‌ی عمومی (بسته‌بندی، ارسال، تبلیغ…) ثبت نشده؛ این عدد «سود پیش از هزینه‌ها»ست و سود واقعی کمتر است.'));
  S1('خلاصه', sum1);

  // ۲) چرا سود این‌طور شد
  const why = [], dm = cur.margin - prev.margin;
  const dGross = cur.gross - prev.gross, dExp = cur.expenses - prev.expenses, dDisc = cc.disc - pc.disc, dShip = cc.ship - pc.ship;
  if (prev.count && cur.count && !okPct) why.push(row('info', `مقایسه‌ی علت‌ها نشان داده نمی‌شود؛ ${pctNote()}`));
  if (prev.count && cur.count && okPct) {
    const parts = [['سود فروش‌ها', dGross], ['هزینه‌های عمومی', -dExp]].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    if (cur.expenses === 0 && prev.expenses === 0) why.push(row(dGross >= 0 ? 'pos' : 'neg', `تغییر ${PW} ${dGross >= 0 ? '+' : '−'}${M(Math.abs(dGross))} است و همه‌اش از تغییر سود فروش‌هاست (هزینه‌ای ثبت نشده).`));
    else why.push(row(dGross - dExp >= 0 ? 'pos' : 'neg', `تغییر ${PW} ${(dGross - dExp) >= 0 ? '+' : '−'}${M(Math.abs(dGross - dExp))}؛ مهم‌ترین عامل: ${parts[0][0]} (${parts[0][1] >= 0 ? '+' : '−'}${M(Math.abs(parts[0][1]))}).`));
    if (Math.abs(dm) >= 1) why.push(row(dm >= 0 ? 'pos' : 'neg', `درصد سود ${dm >= 0 ? 'بالا' : 'پایین'} رفت (${dm >= 0 ? '+' : '−'}${Math.abs(dm).toFixed(1)} واحد).`));
    if (cc.discPct > pc.discPct + 1) why.push(row('neg', `تخفیف‌ها بیشتر شد: ${cc.discPct.toFixed(1)}٪ از فروش (قبل ${pc.discPct.toFixed(1)}٪) — ${M(cc.disc)} تخفیف دادیم.`));
    else if (cc.disc > 0) why.push(row('info', `تخفیف‌ها ${M(cc.disc)} بود (${cc.discPct.toFixed(1)}٪ از فروش).`));
    if (cc.ship > 0) why.push(row(cc.ship > pc.ship * 1.3 && dShip > 0 ? 'neg' : 'info', `هزینه‌ی پیک و بسته‌بندی ${M(cc.ship)} (${(cur.sales > 0 ? cc.ship / cur.sales * 100 : 0).toFixed(1)}٪ از فروش).`));
    if (cur.expenses > 0) why.push(row(dExp > 0 && cur.expenses > prev.expenses * 1.3 ? 'neg' : 'info', `هزینه‌های عمومی ${M(cur.expenses)}${prev.expenses ? ` (${arrow(pct(cur.expenses, prev.expenses))})` : ''}.`));
    if (cc.retCount) why.push(row('neg', `${fmt(cc.retCount)} مرجوعی از مشتری ثبت شد${cc.retLoss ? `؛ زیان ${M(cc.retLoss)}` : ''} (علت‌ها: ${cc.retWhy}).`));
  }
  S1('چرا این‌طور شد؟', why);

  // ۳) دسته و کالا
  const it = [], cats = li.cats.filter(c => c.rev > 0), items = li.items.filter(i => i.rev > 0);
  if (!catOk && (cats.length || items.length)) it.push(row('info', `بهترین/کم‌سودترین دسته و کالا: ${catGate.ok ? `در این بازه فقط ${fmt(cur.count)} فاکتور داریم و رتبه‌بندی معنی ندارد (حداقل ۸ فاکتور لازم است).` : catGate.note}`));
  if (catOk && cats.length) {
    const best = cats[0], pb = lp.cats.find(c => c.key === best.key);
    it.push(row('pos', `بهترین دسته: «${best.name}» با ${M(best.profit)} سود (${best.margin.toFixed(0)}٪)${pb && pb.profit > 0 ? ` — ${arrow(pct(best.profit, pb.profit))} نسبت به ${PER.prev}` : ''}.`));
    const worst = [...cats].sort((x, y) => x.margin - y.margin)[0]; if (worst.key !== best.key && cats.length > 1) it.push(row(worst.margin < 15 ? 'neg' : 'info', `کم‌سودترین دسته: «${worst.name}» با ${worst.margin.toFixed(0)}٪ سود.`));
  }
  if (catOk && items.length) {
    it.push(row('pos', 'پرسودترین کالاها: ' + items.slice(0, 3).map(i => `${i.name} (${M(i.profit)}، ${fmt(i.qty)} عدد)`).join(' · ')));
    const bad = items.filter(i => i.margin < 10 && i.qty >= 2).sort((x, y) => x.margin - y.margin).slice(0, 3);
    if (bad.length) it.push(row('neg', 'کالاهایی که تقریباً بدون سود فروختیم: ' + bad.map(i => `${i.name} (${i.margin.toFixed(0)}٪)`).join(' · ')));
  }
  S1('دسته‌ها و کالاها', it);

  // ۴) خریداران و تامین‌کنندگان
  const pe = [];
  if (B.active) pe.push(row('info', `${fmt(B.active)} خریدار فعال بود (${fmt(B.fresh)} نفر جدید${young ? '؛ تکراری بودن هنوز قابل سنجش نیست چون فعالیت تازه است' : `، ${B.repeat}٪ تکراری`})${hasPrev ? `؛ ${PER.prev}: ${fmt(Bp.active)} نفر` : ''}.`));
  if (bt[0]) pe.push(row(bt[0].share >= 40 && B.active >= GATES.concentration.buyers ? 'neg' : 'info', `بزرگ‌ترین خریدار: ${bt[0].name} (${bt[0].share.toFixed(0)}٪ فروش، ${M(bt[0].rangeTotal)}).`));
  if (an.count) pe.push(row(an.share >= 20 ? 'neg' : 'info', `${fmt(an.count)} فاکتور بدون نام خریدار (${M(an.total)}، ${an.share.toFixed(0)}٪ فروش)؛ سهم خریداران روی کل فروش حساب شده و با ثبت نام دقیق‌تر می‌شود.`));
  if (conc) pe.push(row(conc.share >= 70 && conc.n >= GATES.concentration.buyers ? 'neg' : 'info', `${fmt(conc.k)} نفر از ${fmt(conc.n)} خریدار، ${conc.share}٪ فروش را ساختند (${conc.names.map(x => `${x.name} ${M(x.total)}`).join('، ')})${conc.n < 20 ? '؛ با کمتر از ۲۰ خریدار این نسبت طبیعی و کم‌اهمیت است' : ''}.`));
  if (lost.length) pe.push(row(n <= 7 ? 'info' : 'neg', `${PER.prev} خرید کرده بودند ولی این دوره نه: ${lost.map(r => `${r.name} (${M(r.rangeTotal)} در ${PER.prev})`).join('، ')}${n <= 7 ? ' — برای لباس زیر فاصله‌ی یک هفته بین دو خرید طبیعی است' : ''}.`));
  if (SU.active) pe.push(row('info', `از ${fmt(SU.active)} تامین‌کننده ${M(SU.spent)} خرید کردیم (${fmt(SU.count)} فاکتور).`));
  S1('خریداران و تامین‌کنندگان', pe);

  // ۵) پول و موجودی
  const mo = [], newRecv = sum(cur.rows, s => Math.max(0, s.outstanding || 0));
  mo.push(row(T.receivable > 0 ? 'info' : 'pos', `طلب کل از مشتری‌ها: ${M(T.receivable || 0)}${newRecv ? `؛ از فروش‌های همین دوره ${M(newRecv)} هنوز نیامده` : ''}.`));
  if (ra.c > 0) mo.push(row('neg', `${M(ra.c)} بیش از ۸ روز مانده و ${M(ra.b)} بین ۴ تا ۷ روز است.`));
  const pb = payableBreakdown();
  if (pb.gross > 0 || pb.credit > 0) mo.push(row('info', pb.credit > 0.5 ? `بدهی به تامین‌کنندگان: ${M(pb.gross)}، منهای اعتبار ${M(pb.credit)} نزد تامین‌کننده‌ها (مثلاً از برگشت کالا) = خالص ${M(pb.net)}.` : `بدهی به تامین‌کنندگان: ${M(pb.gross)}.`));
  mo.push(row('info', `ارزش موجودی انبار: ${M(T.stock_value || 0)}${sa.old + sa.mid > 0 ? `؛ از آن ${M(sa.old + sa.mid)} بیش از ${fmt(STALE_MID)} روز مانده (بیش از ${fmt(STALE_OLD)} روز: ${M(sa.old)})` : ''}.`));
  if (BD < STALE_MID) mo.push(row('info', `کالای مانده/کم‌گردش: بعد از ${fmt(STALE_MID)} روز فعالیت قابل اندازه‌گیری است (الان ${fmt(BD)} روز)؛ تا آن موقع «راکد» حساب نمی‌شود.`));
  const sm = stockMonths();
  if (sm.months30 != null) mo.push(row(sm.months30 >= 3 ? 'neg' : 'info', `موجودی (${M(sm.value)}) معادل ${stockCoverText(sm)}${thin ? ' (با داده‌ی کم؛ تقریبی)' : ''}.`));
  { const L = liquidity(); mo.push(row(L.free < 0 ? 'neg' : 'info', `نقدینگی آزاد: ${M(L.free)} (حساب‌ها ${M(L.cash)} منهای بدهی‌های سررسیددار تا ۳۰ روز ${M(L.committed)}${L.noDue > 0.5 ? `؛ بدهی بدون سررسید ${M(L.noDue)} هم هست` : ''}).`)); }
  S1('پول و موجودی', mo);

  // ساختار سود ماه جاری: ناخالص ← هزینه ← پاداش ← قابل تقسیم
  { const ps = profitStructure(); if (ps.count || ps.expenses) S1('ساختار سود (' + ps.name + ')', [row('info', `سود ناخالص فروش‌ها (پس از مرجوعی) ${M(ps.gross)}.`), row(ps.expenses > 0 ? 'info' : 'neg', ps.expenses > 0 ? `هزینه‌های عمومی ${M(ps.expenses)}.` : 'هزینه‌های عمومی: هنوز ثبت نشده (بسته‌بندی، ارسال، تبلیغ…).'), row('info', `پاداش فروشندگان آشنایان تا الان ${M(ps.bonus)} (پیش از تقسیم ۵۰/۵۰ کسر می‌شود).`), row('pos', `سود قابل تقسیم میان شرکا (تقریبی) ${M(ps.distributable)}.`)]); }

  // ۶) شرکا (فقط مدیر این صفحه را می‌بیند)
  const sh = ['مهسا', 'رعنا'].map(p => { const ss = cur.rows.filter(s => s.seller === p); return { p, n: ss.length, sales: sum(ss, s => s.total), profit: sum(ss, s => s.profit) }; });
  if (sh.some(x => x.n)) S1('مهسا و رعنا', sh.map(x => row('info', `${x.p}: ${fmt(x.n)} فاکتور، فروش ${M(x.sales)}، سود ${M(x.profit)} (پس از مرجوعی، پیش از هزینه‌های عمومی).`)));

  // ۷) پیشنهادهای عملی
  if (dm <= -3 && cur.count && okPct) advice.push('درصد سود حدود ' + Math.abs(dm).toFixed(0) + ' واحد افت کرده؛ تخفیف‌ها و قیمت‌گذاری کالاهای کم‌سود را مرور کن (محاسبات و درصد سود).');
  { const dAgo = r => Math.round((Date.parse(todayISO() + 'T00:00:00Z') - Date.parse(r.last + 'T00:00:00Z')) / 864e5), old = lost.filter(r => dAgo(r) >= 21), fresh = lost.filter(r => dAgo(r) < 21);
    if (old.length) advice.push(`با ${old.slice(0, 3).map(r => r.name).join('، ')} تماس بگیرید؛ بیش از ۳ هفته است خرید نکرده‌اند (معرفی محصول تازه + پرسیدن نظرشان).`);
    if (fresh.length) advice.push(`برای ${fresh.slice(0, 3).map(r => r.name).join('، ')} فقط پیام تشکر و رضایت‌سنجی بفرستید (بدون پیشنهاد خرید)؛ پیشنهاد خرید دوباره را ۳ تا ۴ هفته بعد از خریدشان بدهید.`); }
  if (bt[0] && bt[0].share >= 40 && B.active >= GATES.concentration.buyers) advice.push(`وابستگی به ${bt[0].name} زیاد است (${bt[0].share.toFixed(0)}٪)؛ خریداران تازه جذب کنید.`);
  if (ra.c > 0) advice.push(`${M(ra.c)} طلب بیش از ۸ روز مانده؛ همین امروز پیگیری کنید.`);
  const re = reorderSuggestions().slice(0, 3); if (re.length) advice.push('خرید مجدد: ' + re.map(r => `${r.item.name} (حدود ${fmt(r.buy)} عدد)`).join('، ') + ' رو به اتمام است.');
  if (sa.old > 0) advice.push(`کالایی که بیش از ${fmt(STALE_OLD)} روز از خریدش گذشته و مانده (${M(sa.old)}) را با پیشنهاد هدفمند بفروشید یا به تامین‌کننده برگردانید.`);
  if (cc.discPct > pc.discPct + 1 && cc.discPct > 5) advice.push('تخفیف‌ها بالا رفته؛ سقف تخفیف برای هر فاکتور تعیین کنید.');
  if (sm.months30 != null && sm.months30 >= 3) advice.push(`موجودی معادل ${sm.months30.toFixed(1)} ماه فروش (بهای واقعی ۳۰ روز اخیر) است؛ فعلاً خرید جدید نکنید و کالای کم‌گردش را با پیشنهاد هدفمند (نه تخفیف عمومی) بفروشید.`);
  if (thin && cur.count) advice.push(`داده هنوز کم است (${fmt(cur.count)} فاکتور در ${fmt(BD)} روز فعالیت)؛ این عددها را مبنای تصمیم بزرگ نکنید.`);
  else if (!advice.length && cur.count) advice.push('نکته‌ی نگران‌کننده‌ای نیست؛ روند فعلی را ادامه بدهید.');

  return { n, label: PER.label, from: P.from, to: P.to, pFrom: P.pFrom, pTo: P.pTo, sections, advice,
    kpi: { sales: cur.sales, profit: cur.profit, margin: cur.margin, count: cur.count, prevSales: prev.sales, prevProfit: prev.profit, prevMargin: prev.margin, prevCount: prev.count } };
}

export function reportText(r) {
  const out = [`📈 تحلیل عملکرد — ${r.label}`, `${jstr(r.from)} تا ${jstr(r.to)} (مقایسه با ${jstr(r.pFrom)} تا ${jstr(r.pTo)})`];
  for (const s of r.sections) { out.push('', '▸ ' + s.title); s.rows.forEach(x => out.push('  • ' + x.text)); }
  if (r.advice.length) { out.push('', '✅ پیشنهادها'); r.advice.forEach((a, i) => out.push(`  ${i + 1}. ${a}`)); }
  return out.join('\n');
}
