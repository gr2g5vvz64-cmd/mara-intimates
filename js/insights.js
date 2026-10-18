// محاسبات «هدف‌دار / نمایشی / کنترلی»: شمارنده‌ها، سررسید ۳۰ روز، مشتریان برتر، هدف ماهانه، پیشنهاد خرید، بستن روز
import { S, activeSales, businessAccounts, accBalance, catOf, catNames, NO_CAT } from './store.js';
import { sum, groupBy, jmonthKey, todayISO, addDaysISO } from './util.js';
import { pendingCount, blockedCount } from './outbox.js';

/* ---------- سررسیدها ---------- */
const dueRows = kind => S.due.filter(d => d.kind === kind && d.due_date);
export const overdue = kind => dueRows(kind).filter(d => d.days_left < 0);
export const soon = kind => dueRows(kind).filter(d => d.days_left >= 0 && d.days_left <= 3);

/** ۳۰ روز آینده: ستون اول «گذشته»، بعد امروز تا ۲۹ روز دیگر */
export function dueBuckets() {
  const b = Array.from({ length: 31 }, (_, i) => ({ i, payable: 0, receivable: 0, date: i === 0 ? null : addDaysISO(todayISO(), i - 1) }));
  for (const d of S.due) {
    if (!d.due_date || !(d.amount > 0)) continue;
    const k = d.days_left < 0 ? 0 : d.days_left <= 29 ? d.days_left + 1 : -1;
    if (k >= 0) b[k][d.kind] += d.amount;
  }
  return b;
}

/* ---------- مشتریان برتر ---------- */
export function topCustomers(n = 5) {
  const rows = activeSales().filter(s => (s.customer || '').trim());
  return [...groupBy(rows, s => s.customer.trim())].map(([name, a]) => ({ name, total: sum(a, s => s.total), count: a.length, profit: sum(a, s => s.profit), owed: sum(a, s => s.outstanding || 0), last: a.map(s => s.date).sort().pop() }))
    .sort((x, y) => y.total - x.total).slice(0, n);
}

/* ---------- هدف ماهانه ---------- */
export const goalOf = (owner, month = jmonthKey(todayISO())) => { const g = S.goals.find(x => x.owner === owner && x.month === month); return g ? Number(g.amount) : 0; };
export function goalProgress(owner, month = jmonthKey(todayISO())) {
  const done = sum(activeSales().filter(s => s.seller === owner && jmonthKey(s.date) === month), s => s.total), goal = goalOf(owner, month);
  return { owner, month, goal, done, pct: goal > 0 ? Math.min(999, Math.round(done / goal * 100)) : null };
}

/* ---------- پیشنهاد خرید مجدد ---------- */
export function reorderSuggestions() {
  const since = addDaysISO(todayISO(), -30), ok = new Set(activeSales().filter(s => s.date >= since).map(s => s.id)), sold = new Map();
  for (const l of S.saleLines) if (ok.has(l.sale_id)) sold.set(l.item_id, (sold.get(l.item_id) || 0) + l.qty);
  const out = [];
  for (const i of S.stock) {
    if (!i.active) continue; const q = sold.get(i.id) || 0; if (q <= 0) continue;
    const daily = q / 30, need = Math.max(i.min_stock || 0, Math.ceil(daily * 7));
    if (i.rem <= need) out.push({ item: i, sold30: q, rem: i.rem, buy: Math.max(1, Math.ceil(daily * 21) - i.rem), days: daily > 0 ? Math.floor(i.rem / daily) : null });
  }
  return out.sort((a, b) => (a.days ?? 99) - (b.days ?? 99));
}

/* ---------- بستن روز ---------- */
export const todayClosed = () => S.dayCloses.length && S.dayCloses.some(c => c.date === todayISO());
export function hadActivityToday() {
  const t = todayISO();
  return S.vSales.some(s => !s.voided && s.date === t) || S.collections.some(c => !c.voided && c.date === t) || S.expenses.some(e => !e.voided && e.date === t) || S.payments.some(p => !p.voided && p.date === t);
}
export const dayCloseOpen = () => hadActivityToday() && !todayClosed();
export const negativeAccounts = () => businessAccounts().filter(a => accBalance(a.id) < 0);

/* ---------- هشدار منفی شدن حساب ---------- */
export function willGoNegative(accountId, amount) {
  const a = S.A[accountId]; if (!a || a.kind === 'pocket') return null;
  const bal = accBalance(accountId); return bal - amount < 0 ? { name: a.name, bal, after: bal - amount } : null;
}

/* ---------- شمارنده‌ی هشدارهای خانه (همان فهرست کارت‌های «نیاز به توجه») ---------- */
export function homeAlerts() {
  const T = S.totals || {}, act = activeSales(), a = [];
  if (sum(S.vSup.filter(x => x.balance > 0), x => x.balance) > 0) a.push('debt');
  if (overdue('payable').length) a.push('oP'); if (soon('payable').length) a.push('sP');
  if (overdue('receivable').length) a.push('oR'); if (soon('receivable').length) a.push('sR');
  if (act.some(s => s.outstanding > 0)) a.push('owed');
  if (S.stock.some(i => i.active && i.rem <= i.min_stock && i.rem > 0)) a.push('low');
  if (S.stock.some(i => i.active && i.rem === 0 && S.lines.some(l => l.item_id === i.id))) a.push('out');
  if (Math.abs(T.check_diff || 0) > 1) a.push('diff');
  if (reorderSuggestions().length) a.push('reorder');
  if (negativeAccounts().length) a.push('neg');
  if (dayCloseOpen()) a.push('close');
  return a;
}

/* ---------- شمارنده‌ی هر زبانه: {n, tone} ؛ tone = red | amber | info | zero ---------- */
const mk = (n, hot, info = false) => ({ n, tone: n === 0 ? 'zero' : hot ? 'red' : info ? 'info' : 'amber' });
export function navCounts() {
  const act = activeSales(), t = todayISO();
  const owed = act.filter(s => s.outstanding > 0), debtors = S.vCus.filter(c => c.outstanding > 0.5);
  const unpaid = S.vInvoices.filter(i => !i.voided && i.debt > 0.5), supOwed = S.vSup.filter(x => x.balance > 0.5);
  const od = overdue('payable').length > 0, or = overdue('receivable').length > 0;
  const lowOut = S.stock.filter(i => i.active && (i.rem <= i.min_stock));
  const mk30 = addDaysISO(t, -30), mKey = jmonthKey(t);
  const todayN = act.filter(s => s.date === t).length + S.vInvoices.filter(i => !i.voided && i.date === t).length + S.payments.filter(p => !p.voided && p.date === t).length + S.collections.filter(c => !c.voided && c.date === t).length + S.expenses.filter(e => !e.voided && e.date === t).length + S.returns.filter(r => !r.voided && r.date === t).length;
  const fin = (Math.abs((S.totals || {}).check_diff || 0) > 1 ? 1 : 0) + negativeAccounts().length + (dayCloseOpen() ? 1 : 0);
  const pend = pendingCount(), blk = blockedCount();
  const r = {
    '': mk(homeAlerts().length, od || or),
    sales: mk(owed.length, or),
    purchases: mk(unpaid.length, od),
    stock: mk(lowOut.length, false),
    pay: mk(supOwed.length, od),
    expenses: mk(S.expenses.filter(e => !e.voided && jmonthKey(e.date) === mKey).length, false, true),
    returns: mk(S.returns.filter(x => !x.voided && x.kind === 'customer' && x.date >= mk30).length, false, true),
    sreturns: mk(S.returns.filter(x => !x.voided && x.kind === 'supplier' && x.date >= mk30).length, false, true),
    customers: mk(debtors.length, or),
    invoices: mk(unpaid.length, od),
    finance: mk(fin, Math.abs((S.totals || {}).check_diff || 0) > 1 || negativeAccounts().length > 0),
    items: mk(S.items.filter(i => i.active).length, false, true),
    suppliers: mk(S.suppliers.filter(s => s.active !== false).length, false, true),
    history: mk(todayN, false, true),
    savelog: mk(pend + blk, blk > 0),
    diag: S.diagErrors == null ? { n: 0, tone: 'zero', q: true } : mk(S.diagErrors, S.diagErrors > 0)
  };
  return r;
}


/* ---------- سود به تفکیک دسته‌ی کالا ----------
   range: 'month' (ماه شمسی جاری) | '30' (۳۰ روز اخیر) | 'all'. سود بعد از مرجوعی؛ فروش = جمع قیمت اقلام فروخته‌شده. */
export function categoryStats(range = 'month') {
  const t = todayISO(), mk = jmonthKey(t), since = addDaysISO(t, -30);
  const inR = d => range === 'all' || (range === '30' ? d >= since : jmonthKey(d) === mk);
  const rows = new Map(); const get = c => rows.get(c) || rows.set(c, { cat: c, revenue: 0, profit: 0, qty: 0, cost: 0 }).get(c);
  for (const n of catNames(true)) get(n);
  for (const l of S.saleLines) {
    const s = S.SALE[l.sale_id]; if (!s || s.voided || !inR(s.date)) continue;
    const o = get(catOf(S.I[l.item_id])); o.revenue += l.qty * l.net_unit; o.cost += l.qty * l.unit_cost; o.profit += l.qty * (l.net_unit - l.unit_cost); o.qty += l.qty;
  }
  for (const r of S.returns) { if (r.voided || !inR(r.date)) continue; get(catOf(S.I[r.item_id])).profit += r.profit_effect || 0; }
  const out = [...rows.values()].map(o => ({ ...o, margin: o.revenue > 0 ? o.profit / o.revenue * 100 : null }));
  return out.sort((a, b) => b.profit - a.profit || b.revenue - a.revenue);
}
export { NO_CAT };
