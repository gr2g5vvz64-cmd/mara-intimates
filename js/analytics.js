// محاسبات داشبورد تحلیلی مدیر: بازه، شاخص‌ها با مقایسه‌ی بازه‌ی قبل، خریداران و تامین‌کنندگان، روندها
import { S, activeSales } from './store.js';
import { todayISO, addDaysISO, sum, jmonthKey, lastMonths } from './util.js';

export const RANGES = [
  { v: 1, label: 'امروز' }, { v: 7, label: '۷ روز اخیر' }, { v: 30, label: '۳۰ روز اخیر' }, { v: 90, label: '۳ ماه اخیر' }, { v: 365, label: 'یک سال' }
];
/** بازه‌ی n روزه که امروز تمام می‌شود + بازه‌ی هم‌اندازه‌ی قبل از آن */
export function period(n) {
  const to = todayISO(), from = addDaysISO(to, -(n - 1)), pTo = addDaysISO(from, -1), pFrom = addDaysISO(pTo, -(n - 1));
  return { n, from, to, pFrom, pTo };
}
const inR = (d, a, b) => d >= a && d <= b;
const pct = (a, b) => (b > 0 ? Math.round((a - b) / b * 1000) / 10 : null);

/** فروش و سود بین دو تاریخ: سود خالص = سود فروش‌ها − هزینه‌ها + اثر مرجوعی به تامین‌کننده (همان منطق monthly) */
export function salesStats(a, b) {
  const ss = activeSales().filter(s => inR(s.date, a, b));
  const expenses = sum(S.expenses.filter(e => !e.voided && inR(e.date, a, b)), e => e.amount);
  const supRet = sum(S.returns.filter(r => !r.voided && r.kind === 'supplier' && inR(r.date, a, b)), r => r.profit_effect);
  const sales = sum(ss, s => s.total), gross = sum(ss, s => s.profit), profit = gross - expenses + supRet;
  return { sales, gross, expenses, profit, count: ss.length, avg: ss.length ? sales / ss.length : 0, margin: sales > 0 ? profit / sales * 100 : 0, rows: ss };
}

/** خریداران: فعال در بازه، جدید (اولین خریدشان در بازه)، تکراری */
export function buyerStats(a, b) {
  const all = activeSales().filter(s => s.customer_id), first = new Map();
  for (const s of all) { const f = first.get(s.customer_id); if (!f || s.date < f) first.set(s.customer_id, s.date); }
  const active = new Set(all.filter(s => inR(s.date, a, b)).map(s => s.customer_id));
  const fresh = [...active].filter(id => inR(first.get(id), a, b));
  return { total: first.size, active: active.size, fresh: fresh.length, repeat: active.size ? Math.round((active.size - fresh.length) / active.size * 100) : 0, activeSet: active, freshSet: new Set(fresh) };
}
export function supplierStats(a, b) {
  const all = S.vInvoices.filter(i => !i.voided), first = new Map();
  for (const i of all) { const f = first.get(i.supplier_id); if (!f || i.date < f) first.set(i.supplier_id, i.date); }
  const inv = all.filter(i => inR(i.date, a, b)), active = new Set(inv.map(i => i.supplier_id));
  const fresh = [...active].filter(id => inR(first.get(id), a, b));
  return { total: S.suppliers.filter(s => s.active !== false).length, active: active.size, fresh: fresh.length, spent: sum(inv, i => i.goods_total), count: inv.length };
}

/** جدول خریداران برای بازه */
export function buyerTable(a, b) {
  const by = new Map();
  for (const s of activeSales()) {
    if (!s.customer_id) continue;
    const o = by.get(s.customer_id) || { id: s.customer_id, name: s.customer, count: 0, total: 0, profit: 0, last: '', first: s.date, owed: 0, rangeTotal: 0, rangeCount: 0 };
    o.count++; o.total += s.total; o.profit += s.profit; o.owed += s.outstanding || 0; if (s.date > o.last) o.last = s.date; if (s.date < o.first) o.first = s.date;
    if (inR(s.date, a, b)) { o.rangeTotal += s.total; o.rangeCount++; }
    by.set(s.customer_id, o);
  }
  // سهم هر خریدار از «کل فروش بازه» حساب می‌شود (فروش‌های بدون نام خریدار هم در مخرج هستند)
  const rows = [...by.values()].sort((x, y) => y.rangeTotal - x.rangeTotal || y.total - x.total), tot = grandTotal(a, b);
  rows.forEach(r => { r.share = tot > 0 ? r.rangeTotal / tot * 100 : 0; });
  return rows;
}
/** جمع کل فروش بازه (با و بدون نام خریدار) */
export function grandTotal(a, b) { return sum(activeSales().filter(s => inR(s.date, a, b)), s => s.total); }
/** فروش‌های بدون نام خریدار در بازه */
export function anonStats(a, b) {
  const ss = activeSales().filter(s => !s.customer_id && inR(s.date, a, b)), total = sum(ss, s => s.total), g = grandTotal(a, b);
  return { count: ss.length, total, share: g > 0 ? total / g * 100 : 0 };
}
export function supplierTable(a, b) {
  const by = new Map();
  for (const i of S.vInvoices.filter(x => !x.voided)) {
    const o = by.get(i.supplier_id) || { id: i.supplier_id, name: i.supplier, count: 0, total: 0, last: '', rangeTotal: 0, rangeCount: 0, debt: 0 };
    o.count++; o.total += i.goods_total; o.debt += i.debt > 0 ? i.debt : 0; if (i.date > o.last) o.last = i.date;
    if (inR(i.date, a, b)) { o.rangeTotal += i.goods_total; o.rangeCount++; }
    by.set(i.supplier_id, o);
  }
  const rows = [...by.values()].sort((x, y) => y.rangeTotal - x.rangeTotal || y.total - x.total), tot = sum(rows, r => r.rangeTotal);
  rows.forEach(r => { r.share = tot > 0 ? r.rangeTotal / tot * 100 : 0; });
  return rows;
}
/** «۲۰٪ خریداران چند درصد فروش را ساخته‌اند» */
export function concentration(rows, grand) {
  const r = rows.filter(x => x.rangeTotal > 0); if (r.length < 3) return null;
  const k = Math.max(1, Math.round(r.length * 0.2)), top = sum(r.slice(0, k), x => x.rangeTotal), tot = grand > 0 ? grand : sum(r, x => x.rangeTotal);
  return { k, n: r.length, share: Math.round(top / tot * 100) };
}

/** خرید، فروش و پول دریافتی؛ ok(d) تعیین می‌کند تاریخ داخل بازه است.
    دریافتی = پولی که هنگام فروش گرفتیم + نسیه‌هایی که بعداً وصول شد (به تاریخ وصول) */
export function flowStats(ok) {
  const ss = activeSales().filter(s => ok(s.date)), inv = S.vInvoices.filter(i => !i.voided && ok(i.date));
  const atSale = sum(ss, s => s.received || 0), later = sum(S.collections.filter(c => !c.voided && ok(c.date)), c => c.amount);
  const sold = sum(ss, s => s.total);
  return { bought: sum(inv, i => i.goods_total), boughtN: inv.length, sold, soldN: ss.length, received: atSale + later, atSale, later, owed: sum(ss, s => Math.max(0, s.outstanding || 0)) };
}
/** هر فروشنده به چند مشتری (نام‌دار) فروخته: مشتری یکتا، فاکتور، فروش، فاکتور بدون نام */
export function sellerStats(a, b, seller) {
  const ss = activeSales().filter(s => s.seller === seller && inR(s.date, a, b)), ids = new Set(ss.filter(s => s.customer_id).map(s => s.customer_id));
  const before = new Set(activeSales().filter(s => s.customer_id && s.date < a).map(s => s.customer_id));
  return { seller, customers: ids.size, fresh: [...ids].filter(id => !before.has(id)).length, count: ss.length, total: sum(ss, s => s.total), profit: sum(ss, s => s.profit), anon: ss.filter(s => !s.customer_id).length };
}

/** روند ماهانه‌ی شمسی با کلید ماه */
export function monthTrend() {
  return lastMonths(6).map(k => {
    const ss = activeSales().filter(s => jmonthKey(s.date) === k);
    const exp = sum(S.expenses.filter(e => !e.voided && jmonthKey(e.date) === k), e => e.amount);
    const sup = sum(S.returns.filter(r => !r.voided && r.kind === 'supplier' && jmonthKey(r.date) === k), r => r.profit_effect);
    const dates = ss.map(s => s.date).concat(S.vInvoices.filter(i => !i.voided && jmonthKey(i.date) === k).map(i => i.date)).sort();
    return { label: k, ...(({ bought, received }) => ({ bought, received }))(flowStats(d => jmonthKey(d) === k)), sales: sum(ss, s => s.total), profit: sum(ss, s => s.profit) - exp + sup, a: dates[0] || null, b: dates[dates.length - 1] || null, key: k };
  });
}
/** روند هفتگی: ۸ بازه‌ی ۷ روزه */
export function weekTrend() {
  const to = todayISO(), out = [];
  for (let i = 7; i >= 0; i--) { const b = addDaysISO(to, -7 * i), a = addDaysISO(b, -6), st = salesStats(a, b); { const f = flowStats(d => d >= a && d <= b); out.push({ label: i === 0 ? 'این هفته' : i === 1 ? 'پیش' : `${i} پیش`, a, b, sales: st.sales, profit: st.profit, bought: f.bought, received: f.received }); } }
  return out;
}
/** خریداران فعال و جدید در هر بازه‌ی روند */
export function peopleTrend(buckets, getRange) {
  return buckets.map(x => { const [a, b] = getRange(x); if (!a) return { label: x.label, active: 0, fresh: 0, sup: 0 }; const bs = buyerStats(a, b), ss = supplierStats(a, b); return { label: x.label, active: bs.active, fresh: bs.fresh, sup: ss.active }; });
}
export const rangeOfMonthKey = key => {
  const ds = [...activeSales().map(s => s.date), ...S.vInvoices.filter(i => !i.voided).map(i => i.date)].filter(d => jmonthKey(d) === key).sort();
  return ds.length ? [ds[0], ds[ds.length - 1]] : [null, null];
};
export { pct };

/** پول گیر کرده در کالای مانده و سن طلب‌ها */
export function stockAge() {
  const t = Date.parse(todayISO() + 'T00:00:00Z'), by = new Map();
  for (const l of S.lots) if (!l.voided && l.rem > 0) { const age = Math.round((t - Date.parse(l.date + 'T00:00:00Z')) / 864e5), k = age >= 30 ? 'old' : age >= 14 ? 'mid' : 'new'; by.set(k, (by.get(k) || 0) + l.rem * l.landed_unit); }
  return { old: by.get('old') || 0, mid: by.get('mid') || 0, new: by.get('new') || 0 };
}
export function receivableAge() {
  const t = Date.parse(todayISO() + 'T00:00:00Z'), o = { a: 0, b: 0, c: 0 };
  for (const s of activeSales()) if (s.outstanding > 0.5) { const age = Math.round((t - Date.parse(s.date + 'T00:00:00Z')) / 864e5); o[age >= 8 ? 'c' : age >= 4 ? 'b' : 'a'] += s.outstanding; }
  return o;
}
