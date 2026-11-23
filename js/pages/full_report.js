// گزارش جامع (فقط مدیر): با یک دکمه همه‌ی خرید، فروش، پول، چک، سرمایه و جنس یک‌جا ساخته می‌شود.
// خروجی‌ها: گزارش چاپی/PDF، اکسل کامل (همان اکسل همه‌چیز)، و متن آماده برای دادن به Claude.
// عددها از همان منبع‌های صفحه‌ی «مالی»، «موجودی» و «بدهکاران و بستانکاران» می‌آیند؛ هیچ فرمول جدیدی برای سود نیست.
import { h, fmt, jstr, jmonthName, jmonthKey, lastMonths, todayISO, jlong, sum, toast, parseNum } from '../util.js';
import { S, api, errText, loadAll, businessAccounts, pockets, accBalance, monthly, activeSales } from '../store.js';
import { dtable } from '../ui.js';
import { bonusLifetime } from '../insights.js';
import { analyze } from '../analysis.js';
import { head, btn } from './common.js';
import { exitRec, exitPaid, exitLeft, exitShareFix } from '../exit.js';

const R = v => fmt(Math.round(Number(v) || 0));
const RY = v => R(v) + ' ریال';
const CH_STATE = { open: 'باز', passed: 'سررسید گذشته', bounced: 'برگشتی', bounced_settled: 'برگشتی تسویه‌شده' };
const LV = { err: 'مهم', warn: 'توجه', info: 'اطلاع' };

/* ---------- سرمایه و سهم هر نفر (همان فرمول صفحه‌ی مالی) ---------- */
export function partners() {
  const T = S.totals || {}, profit = T.profit || 0;
  const chg = n => sum((S.charges || []).filter(c => !c.voided && c.partner === n), c => Number(c.amount) || 0);
  const BL = bonusLifetime(), baseHalf = (profit + chg('مهسا') + chg('رعنا') - (BL['مهسا'] + BL['رعنا'])) / 2;
  const mk = (name, cap, payout) => { const share = baseHalf - chg(name); return { name, cap: cap || 0, share, payout: payout || 0, owed: (cap || 0) + share - (payout || 0), bonus: (S.fundNet || BL)[name] || 0 }; };
  const P = [mk('مهسا', T.capital_m, T.payout_m), mk('رعنا', T.capital_r, T.payout_r)], rec = exitRec();
  if (rec) {   // رعنا خارج شده: عددهایش ثابت است و مانده‌اش همان بدهی باقی‌مانده
    const fx = exitShareFix(profit, BL, rec);
    P[1] = { ...P[1], cap: Number(rec.cap), share: fx.ranaShare, payout: Number(rec.payout) + exitPaid(rec), owed: exitLeft(rec), exited: true };
    P[0] = { ...P[0], share: fx.mahsaShare, owed: P[0].cap + fx.mahsaShare - P[0].payout };
  }
  return P;
}

/* ---------- پیش‌فرض‌های محاسبه‌ی خروج (قابل تغییر در صفحه) ---------- */
export const PLAN = { pct: '', min: 0 };   // درصد خالی = بر اساس فروش واقعی (سهم سرمایه از بهای کالای فروخته‌شده)
function avgMonthlySales() {
  const m = monthly().filter(x => x.sales > 0), cur = jmonthKey(todayISO());
  const full = m.filter(x => x.key !== cur).slice(-3), use = full.length ? full : m.slice(-1);
  return use.length ? sum(use, x => x.sales) / use.length : 0;
}
function avgMonthlyCogs() {   // میانگین بهای تمام‌شده‌ی کالای فروخته‌شده در ماه (سه ماه تمام‌شده‌ی اخیر)
  const by = new Map(), ids = new Set(activeSales().map(x => x.id));
  S.saleLines.forEach(l => { if (!ids.has(l.sale_id)) return; const k = jmonthKey(S.SALE[l.sale_id].date); by.set(k, (by.get(k) || 0) + l.qty * (l.unit_cost || 0)); });
  const cur = jmonthKey(todayISO()), ks = [...by.keys()].sort(), full = ks.filter(k => k !== cur).slice(-3), use = full.length ? full : ks.slice(-1);
  return use.length ? sum(use, k => by.get(k)) / use.length : 0;
}
export function planRows(owed) {
  const P = partners(), capT = P[0].cap + P[1].cap, share = capT > 0 ? P[1].cap / capT : 0;
  const avg = avgMonthlySales(), cogs = avgMonthlyCogs(), byPct = String(PLAN.pct).trim() !== '';
  const base = byPct ? (Number(PLAN.pct) || 0) / 100 * avg : share * cogs;   // خالی: هر چه از جنس فروخته شود، سهم سرمایه‌ی این طرف از بهای آن برمی‌گردد
  const per = Math.max(Number(PLAN.min) || 0, base), rows = [];
  let left = Math.max(owed, 0);
  if (per <= 0) return { avg, cogs, share, byPct, per, rows };
  for (let i = 1; i <= 36 && left > 0.5; i++) { const pay = Math.min(per, left); left -= pay; rows.push([`ماه ${fmt(i)}`, R(pay), R(left)]); }
  return { avg, cogs, share, byPct, per, rows };
}

/* ---------- ساخت بخش‌ها ---------- */
// هر بخش: { id, title, note, kv:[[k,v]], tables:[{ title, head:[[label, isNum]], rows:[[...]], foot }], warn:[] }
export function build(from) {
  const T = S.totals || {}, P = partners(), today = todayISO(), out = [];
  const cur = jmonthKey(today), isAll = from === 'all';
  const dates = [...activeSales().map(x => x.date), ...(S.vInvoices || []).filter(i => !i.voided).map(i => i.date), ...(S.expenses || []).filter(e => !e.voided).map(e => e.date),
    ...(S.payments || []).filter(p => !p.voided).map(p => p.date), ...(S.collections || []).filter(c => !c.voided).map(c => c.date), ...(S.returns || []).filter(r => !r.voided).map(r => r.date)].filter(Boolean).sort();
  const firstK = dates.length ? jmonthKey(dates[0]) : cur, lastK = dates.length ? jmonthKey(dates[dates.length - 1]) : cur;
  if (isAll) from = firstK;
  const keys = lastMonths(24).filter(k => k >= from && k <= (isAll ? lastK : cur));
  const ok = Math.abs(T.check_diff || 0) <= 1;

  out.push({ id: 'status', title: 'وضع کلی (تا امروز)', kv: [
    ['مانده‌ی حساب‌های کسب‌وکار', RY(T.business_balance)], ['ارزش جنس موجود (به‌قیمت خرید)', RY(T.stock_value)],
    ['طلب از مشتریان', RY(T.receivable)], ['بدهی به تامین‌کننده‌ها', RY(T.payable)], ['اعتبار مشتریان (بدهی ما)', RY(T.customer_credit)],
    ['کل دارایی خالص', RY(T.net_worth)], ['سود کل', RY(T.profit)],
    ['کنترل حسابداری', ok ? 'اختلاف صفر است ✓' : 'اختلاف ' + RY(T.check_diff) + ' — بررسی شود']] });

  out.push({ id: 'profit', title: 'سود چطور ساخته شد', kv: [
    ['جمع فروش', RY(T.revenue)], ['− بهای تمام‌شده‌ی کالای فروخته‌شده', RY(T.cogs)], ['− پیک و بسته‌بندی فروش‌ها', RY(T.sale_costs)],
    ['− هزینه‌ها', RY(T.expenses)], ['± اثر مرجوعی‌ها', RY(T.returns_effect)], ['= سود کل', RY(T.profit)]] });

  out.push({ id: 'capital', title: 'سرمایه و سهم هر نفر',
    note: 'سود بین مهسا و رعنا ۵۰/۵۰ است. «طلب» = سرمایه + سهم از سود − برداشت‌های انجام‌شده. پاداش آشنایان جدا از این و در صندوق خودش است.',
    tables: [{ head: [['نفر'], ['سرمایه (ریال)', 1], ['سهم از سود (ریال)', 1], ['برداشت‌شده (ریال)', 1], ['طلب / حق (ریال)', 1], ['پاداش آشنایان — جدا (ریال)', 1]],
      rows: P.map(p => [p.name, R(p.cap), R(p.share), R(p.payout), R(p.owed), R(p.bonus)]),
      foot: ['جمع', R(sum(P, p => p.cap)), R(sum(P, p => p.share)), R(sum(P, p => p.payout)), R(sum(P, p => p.owed)), R(sum(P, p => p.bonus))] }] });

  const biz = businessAccounts(), pk = pockets();
  out.push({ id: 'accounts', title: 'حساب‌ها و جیب‌ها', tables: [{ head: [['حساب'], ['نوع'], ['مانده (ریال)', 1]],
    rows: [...biz.map(a => [a.name, 'حساب کسب‌وکار', R(accBalance(a.id))]), ...pk.map(a => [a.name, 'جیب شخصی', R(accBalance(a.id))])],
    foot: ['جمع حساب‌های کسب‌وکار', '', R(T.business_balance)] }] });

  const act = (S.stock || []).filter(i => i.active), have = act.filter(i => i.rem > 0), cat = new Map();
  have.forEach(i => { const k = i.category || 'بدون دسته', o = cat.get(k) || { n: 0, q: 0, v: 0 }; o.n++; o.q += i.rem; o.v += i.value || 0; cat.set(k, o); });
  const ids = new Set(activeSales().map(x => x.id)), sold = new Map(), lastSale = new Map(), dayN = d => Math.max(0, Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / 864e5));
  S.saleLines.forEach(l => { if (!ids.has(l.sale_id)) return; sold.set(l.item_id, (sold.get(l.item_id) || 0) + l.qty); const d = S.SALE[l.sale_id].date; if (!lastSale.get(l.item_id) || d > lastSale.get(l.item_id)) lastSale.set(l.item_id, d); });
  (S.returns || []).filter(r => !r.voided && r.kind === 'customer').forEach(r => sold.set(r.item_id, (sold.get(r.item_id) || 0) - r.qty));
  const oldest = new Map(); (S.lots || []).filter(l => !l.voided && l.rem > 0).forEach(l => { const o = oldest.get(l.item_id); if (!o || l.date < o) oldest.set(l.item_id, l.date); });
  const aged = have.map(i => { const d = oldest.get(i.id), n = sold.get(i.id) || 0; return { i, d, days: d ? dayN(d) : 0, n, last: lastSale.get(i.id) }; })
    .sort((a, b) => ((a.n > 0) - (b.n > 0)) || (b.days - a.days) || ((b.i.value || 0) - (a.i.value || 0)));
  const ageRows = aged.map(x => [x.i.name, fmt(x.i.rem), fmt(x.i.rem_m), fmt(x.i.rem_r), R(x.i.value), x.d ? `${jstr(x.d)} (${fmt(x.days)} روز)` : '', fmt(x.n), x.n > 0 && x.last ? jstr(x.last) : 'هنوز فروخته نشده']);
  const never = aged.filter(x => x.n <= 0), over = (n) => aged.filter(x => x.days >= n);
  out.push({ id: 'stock', title: 'جنس موجود (به‌قیمت خرید)',
    note: 'سن = از قدیمی‌ترین سری خریدی که هنوز از آن مانده. «خالص فروخته‌شده» = فروش منهای مرجوعی. ارزش‌ها به‌قیمت تمام‌شده‌اند، نه قیمت فروش.',
    kv: [['هرگز فروخته‌نشده', `${fmt(never.length)} قلم · ${fmt(sum(never, x => x.i.rem))} عدد · ${RY(sum(never, x => x.i.value))}`],
      ['مانده‌ی بیش از ۳۰ روز', `${fmt(over(30).length)} قلم · ${fmt(sum(over(30), x => x.i.rem))} عدد · ${RY(sum(over(30), x => x.i.value))}`],
      ['مانده‌ی بیش از ۶۰ روز', `${fmt(over(60).length)} قلم · ${fmt(sum(over(60), x => x.i.rem))} عدد · ${RY(sum(over(60), x => x.i.value))}`],
      ['نزد مهسا', `${fmt(sum(have, i => i.rem_m))} عدد · ${RY(sum(S.lots.filter(l => !l.voided), l => l.value_m))}`], ['نزد رعنا', `${fmt(sum(have, i => i.rem_r))} عدد · ${RY(sum(S.lots.filter(l => !l.voided), l => l.value_r))}`],
      ['کالاهای موجود', fmt(have.length) + ' قلم'], ['جمع تعداد', fmt(sum(have, i => i.rem)) + ' عدد'], ['ارزش کل', RY(sum(have, i => i.value))],
      ['کالاهای تمام‌شده', fmt(act.filter(i => i.rem <= 0).length) + ' قلم'], ['کالاهای زیر حداقل موجودی', fmt(act.filter(i => i.min_stock > 0 && i.rem > 0 && i.rem < i.min_stock).length) + ' قلم']],
    tables: [
      { title: 'به‌تفکیک دسته', head: [['دسته'], ['قلم', 1], ['تعداد', 1], ['ارزش (ریال)', 1]], rows: [...cat.entries()].sort((a, b) => b[1].v - a[1].v).map(([k, o]) => [k, fmt(o.n), fmt(o.q), R(o.v)]) },
      { title: 'همه‌ی کالاهای مانده: چندتا، چه مبلغ، از کی مانده و فروش', head: [['کالا'], ['مانده', 1], ['نزد مهسا', 1], ['نزد رعنا', 1], ['ارزش (ریال)', 1], ['قدیمی‌ترین ورود (روز مانده)', 1], ['خالص فروخته‌شده', 1], ['آخرین فروش']], rows: ageRows }] });

  const mon = new Map(monthly().map(m => [m.key, m])), pur = new Map(), ret = new Map();
  (S.vInvoices || []).filter(i => !i.voided).forEach(i => { const k = jmonthKey(i.date); pur.set(k, (pur.get(k) || 0) + (Number(i.landed_total) || 0)); });
  (S.returns || []).filter(r => !r.voided && r.kind === 'customer').forEach(r => { const k = jmonthKey(r.date), o = ret.get(k) || { n: 0, p: 0 }; o.n++; o.p += r.profit_effect || 0; ret.set(k, o); });
  const rows = keys.map(k => { const m = mon.get(k) || { count: 0, sales: 0, expenses: 0, profit: 0 }, r = ret.get(k) || { n: 0, p: 0 };
    return [jmonthName(k), fmt(m.count), R(m.sales), R(pur.get(k) || 0), R(m.expenses), fmt(r.n), R(m.profit)]; });
  const tot = keys.reduce((a, k) => { const m = mon.get(k) || { count: 0, sales: 0, expenses: 0, profit: 0 }; a[0] += m.count; a[1] += m.sales; a[2] += pur.get(k) || 0; a[3] += m.expenses; a[4] += (ret.get(k) || { n: 0 }).n; a[5] += m.profit; return a; }, [0, 0, 0, 0, 0, 0]);
  out.push({ id: 'months', title: isAll ? `ماه به ماه (کل: از اولین فعالیت ${dates.length ? jstr(dates[0]) : ''} تا آخرین سند ${dates.length ? jstr(dates[dates.length - 1]) : ''})` : `ماه به ماه (از ${jmonthName(keys[0] || cur)})`,
    note: 'خرید = بهای رسیده‌ی فاکتورهای خرید (با هزینه‌ی حمل). سود ماه = سود فروش − هزینه‌ها ± مرجوعی خرید (همان جدول صفحه‌ی مالی).',
    tables: [{ head: [['ماه'], ['فاکتور فروش', 1], ['فروش (ریال)', 1], ['خرید (ریال)', 1], ['هزینه (ریال)', 1], ['مرجوعی فروش', 1], ['سود (ریال)', 1]], rows,
      foot: ['جمع', fmt(tot[0]), R(tot[1]), R(tot[2]), R(tot[3]), fmt(tot[4]), R(tot[5])] }] });

  const ch = (S.cheques || []).filter(c => !c.voided).sort((a, b) => (a.due_date < b.due_date ? -1 : 1)), openCh = ch.filter(c => c.state === 'open' || c.state === 'bounced');
  out.push({ id: 'cheques', title: 'چک‌های پرداختی', kv: [['چک‌های باز یا برگشتی', fmt(openCh.length) + ' فقره'], ['جمع مبلغ آن‌ها', RY(sum(openCh, c => c.amount))]],
    tables: [{ head: [['تامین‌کننده'], ['مبلغ (ریال)', 1], ['سررسید'], ['وضعیت'], ['صادرکننده'], ['روز مانده', 1]],
      rows: ch.map(c => [c.supplier || '', R(c.amount), jstr(c.due_date), CH_STATE[c.state] || c.state, c.payer || '', c.state === 'open' ? fmt(c.days_left) : '']) }] });

  const cus = S.vCus || [], sup = S.vSup || [];
  const owe = [...cus.filter(c => c.outstanding > 0.5).map(c => ['مشتری', c.name, R(c.outstanding), c.overdue_amount > 0.5 ? R(c.overdue_amount) : '']), ...sup.filter(s => s.balance < -0.5).map(s => ['تامین‌کننده', s.name, R(-s.balance), ''])];
  const due = [...cus.filter(c => c.credit_bal > 0.5).map(c => ['مشتری (اعتبار)', c.name, R(c.credit_bal)]), ...sup.filter(s => s.balance > 0.5).map(s => ['تامین‌کننده', s.name, R(s.balance)])];
  const sOwe = sum(cus.filter(c => c.outstanding > 0.5), c => c.outstanding) + sum(sup.filter(s => s.balance < -0.5), s => -s.balance);
  const sDue = sum(cus.filter(c => c.credit_bal > 0.5), c => c.credit_bal) + sum(sup.filter(s => s.balance > 0.5), s => s.balance);
  out.push({ id: 'debts', title: 'بدهکاران و بستانکاران', kv: [['باید به ما بدهند', RY(sOwe)], ['ما باید بدهیم', RY(sDue)], ['خالص', RY(sOwe - sDue)]],
    tables: [
      { title: 'بدهکاران (باید به ما بدهند)', head: [['نوع'], ['نام'], ['مبلغ (ریال)', 1], ['سررسید گذشته (ریال)', 1]], rows: owe.sort((a, b) => parseNum(b[2]) - parseNum(a[2])) },
      { title: 'بستانکاران (ما باید بدهیم)', head: [['نوع'], ['نام'], ['مبلغ (ریال)', 1]], rows: due.sort((a, b) => parseNum(b[2]) - parseNum(a[2])) }] });

  const rana = P[1], pr = planRows(rana.owed);
  out.push({ id: 'exit', title: 'محاسبه‌ی خروج رعنا و مهدی (پرداخت مرحله‌ای)',
    note: 'برآورد است، نه تعهد: مبلغ از «طلب» رعنا در بخش سرمایه می‌آید. اگر درصدی ننویسی، پرداخت ماهانه از روی فروش واقعی حساب می‌شود (سهم سرمایه × بهای کالای فروخته‌شده)؛ اگر درصد بنویسی، آن درصد از فروش ماهانه است. در هر دو حالت بیشترِ آن و «حداقل ماهانه» ملاک است. سود جنس نفروخته در این رقم نیست. قبل از اجرا انبارگردانی بزن و ماه را ببند.',
    kv: [['سرمایه‌ی طرف رعنا و مهدی', RY(rana.cap)], ['+ سهم از سود تا امروز', RY(rana.share)], ['− برداشت‌های انجام‌شده', RY(rana.payout)], ['= طلب رعنا و مهدی', RY(rana.owed)],
      ...(pr.byPct ? [['میانگین فروش ماهانه (سه ماه تمام‌شده‌ی اخیر)', RY(pr.avg)], ['درصد پرداخت از فروش (انتخاب شما)', fmt(PLAN.pct) + '٪']]
        : [['روش: بر اساس فروش واقعی', 'هر چه از جنس فروخته شود، سهم سرمایه‌ی این طرف از بهای آن برمی‌گردد'], ['سهم سرمایه‌ی طرف رعنا و مهدی از کل سرمایه', (pr.share * 100).toFixed(1) + '٪'],
          ['میانگین بهای کالای فروخته‌شده در ماه (سه ماه تمام‌شده‌ی اخیر)', RY(pr.cogs)]]), ['حداقل پرداخت ماهانه', RY(PLAN.min)],
      ['پرداخت ماهانه در این برآورد', RY(pr.per)], ['زمان تسویه', pr.rows.length ? fmt(pr.rows.length) + ' ماه' + (pr.rows.length >= 36 ? ' یا بیشتر' : '') : 'نامشخص (پرداخت ماهانه صفر است)']],
    tables: pr.rows.length ? [{ title: 'جدول پرداخت پیشنهادی', head: [['ماه'], ['پرداخت (ریال)', 1], ['مانده‌ی طلب (ریال)', 1]], rows: pr.rows }] : [] });

  let an = { findings: [], ok: [] }; try { an = analyze(); } catch (e) { /* بدون هشدار هم گزارش کامل است */ }
  out.push({ id: 'warn', title: 'هشدارها و بررسی داده', kv: [['بررسی‌های سالم', fmt((an.ok || []).length)], ['موارد باز', fmt((an.findings || []).length)]],
    warn: (an.findings || []).map(f => `[${LV[f.lvl] || f.lvl}] ${f.title}: ${f.detail}${f.fix ? ' ← ' + f.fix : ''}`) });
  return out;
}

/* ---------- خروجی متنی برای Claude ---------- */
export function toText(secs, from) {
  const fromLbl = from === 'all' ? 'کل (از اولین فعالیت تا آخرین سند)' : 'از ' + jmonthName(from);
  const L = [`گزارش جامع MARA INTIMATES — ${jlong(todayISO())} — جدول‌های ماهانه: ${fromLbl}`,
    'همه‌ی مبلغ‌ها ریال است. موجودی و بدهی‌ها «تا امروز»اند. سود از فروش واقعی است و سود جنس نفروخته را شامل نمی‌شود.',
    'قواعد: سود بین مهسا و رعنا ۵۰/۵۰ است؛ حمیدرضا (سرمایه‌گذار مهسا) و مهدی (سرمایه‌گذار رعنا)؛ برداشت فقط با مدیر؛ پاداش آشنایان جدا و در صندوق هر نفر است. رعنا و مهدی در حال خروج‌اند و می‌خواهند اصل سرمایه‌شان مرحله‌ای برگردد.', ''];
  secs.forEach((s, i) => {
    L.push(`=== ${fmt(i + 1)}) ${s.title} ===`); if (s.note) L.push(s.note);
    (s.kv || []).forEach(([k, v]) => L.push(`• ${k}: ${v}`));
    (s.tables || []).forEach(t => { if (t.title) L.push(`— ${t.title}`); const hd = t.head.map(x => x[0]); L.push(hd.join(' | ')); t.rows.forEach(r => L.push(r.join(' | '))); if (t.foot) L.push(t.foot.join(' | ')); });
    (s.warn || []).forEach(w => L.push('• ' + w)); L.push('');
  });
  L.push('=== درخواست ===', 'این گزارش را بخوان، عددها را با هم تطبیق بده و ناهماهنگی‌ها را بگو. بعد پیشنهاد روشن بده (فارسی، دقیق، با ریال کامل). سؤال من:  ');
  return L.join('\n');
}

/* ---------- نمایش ---------- */
function secEl(s, n) {
  const cols = hd => hd.map(([label, num]) => ({ label, cls: num ? 'num' : '', render: null }));
  return h('section', { class: 'pack-sec' },
    h('h2', { class: 'pack-h' }, `${fmt(n)} · ${s.title}`),
    s.note ? h('p', { class: 'hint' }, s.note) : null,
    ...(s.kv || []).map(([k, v]) => h('div', { class: 'srow' }, h('span', null, k), h('span', { class: 'n' }, v))),
    ...(s.tables || []).map(t => {
      const c = t.head.map(([label, num], i) => ({ label, cls: num ? 'num' : '', main: i === 0, render: r => r[i] }));
      return h('div', null, t.title ? h('h3', { class: 'sec' }, t.title) : null, dtable(c, t.rows, { empty: 'موردی نیست', foot: t.foot }));
    }),
    s.warn && s.warn.length ? h('ul', { class: 'mt-list' }, s.warn.map(w => h('li', null, w))) : (s.id === 'warn' ? h('p', { class: 'hint' }, 'مورد بازی پیدا نشد.') : null));
}

export function render() {
  if (!S.me || S.me.role !== 'admin') return h('div', { class: 'card' }, 'این صفحه فقط برای مدیر است.');
  const all = lastMonths(24);
  let from = 'all', secs = null, text = '';
  const out = h('div'), bar = h('div', { class: 'acts no-print', style: 'margin:12px 0' });
  const sel = h('select', { class: 'sel', 'aria-label': 'بازه‌ی جدول‌های ماهانه' }, h('option', { value: 'all', selected: true }, 'کل (از اولین فعالیت تا آخرین سند)'), all.map(k => h('option', { value: k }, 'از ' + jmonthName(k))));
  sel.onchange = () => { from = sel.value; if (secs) draw(); };
  const pct = h('input', { class: 'inp', inputmode: 'numeric', value: String(PLAN.pct), placeholder: 'خالی = بر اساس فروش واقعی', style: 'width:210px', 'aria-label': 'درصد از فروش' });
  const min = h('input', { class: 'inp', inputmode: 'numeric', value: PLAN.min ? R(PLAN.min) : '', placeholder: 'ریال', style: 'width:150px', 'aria-label': 'حداقل ماهانه (ریال)' });
  const upd = () => { PLAN.pct = pct.value.trim() === '' ? '' : Math.min(100, Math.max(0, parseNum(pct.value) || 0)); PLAN.min = Math.max(0, parseNum(min.value) || 0); if (secs) draw(true); };
  pct.onchange = upd; min.onchange = upd;
  const planBox = h('div', { class: 'card no-print', style: 'margin:10px 0' }, h('div', { class: 'ct' }, 'تنظیم پرداخت مرحله‌ای (برای بخش «محاسبه‌ی خروج»)'),
    h('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap;align-items:center' }, h('span', null, 'درصد از فروش ماهانه (اختیاری):'), pct, h('span', null, '٪'), h('span', null, 'حداقل پرداخت ماهانه:'), min, h('span', null, 'ریال')));
  function draw() {
    secs = build(from); text = toText(secs, from);
    out.replaceChildren(
      h('div', { class: 'pack-cover' }, h('h1', null, 'گزارش جامع · MARA INTIMATES'), h('p', null, `چاپ‌شده: ${jlong(todayISO())} · محرمانه، فقط مدیر`)),
      ...secs.map((s, i) => secEl(s, i + 1)));
  }
  const mk = btn('📊 ساخت گزارش کامل', async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'در حال ساخت…';
    try { await loadAll({ retries: 2 }); } catch (er) { /* با داده‌ی فعلی ادامه می‌دهیم */ }   // داده‌ی تازه بدون بازسازی صفحه
    try { draw(); bar.style.display = ''; toast('گزارش ساخته شد'); } catch (er) { console.error(er); out.replaceChildren(h('div', { class: 'card' }, h('p', null, 'ساخت گزارش ناموفق بود: ' + er.message))); }
    finally { b.disabled = false; b.textContent = '📊 ساخت دوباره‌ی گزارش'; }
  }, 'primary lg');
  const copyBtn = btn('📋 کپی برای Claude', async () => { try { await navigator.clipboard.writeText(text); toast('کپی شد؛ در گفتگو با Claude بچسبان'); } catch { toast('کپی نشد؛ «ذخیره‌ی متن» را بزن', 'err'); } }, 'ghost');
  const txtBtn = btn('⬇ ذخیره‌ی متن', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); a.download = 'MARA-full-report-' + todayISO() + '.txt'; document.body.append(a); a.click(); a.remove(); }, 'ghost');
  const xlsBtn = btn('📥 اکسل کامل', async e => { const b = e.currentTarget; b.disabled = true; try { const res = await api('/api/export.xlsx', { raw: true }); const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'MARA-INTIMATES-' + todayISO() + '.xlsx'; document.body.append(a); a.click(); a.remove(); toast('اکسل آماده شد'); } catch (er) { toast(errText(er), 'err'); } finally { b.disabled = false; } }, 'ghost');
  bar.style.display = 'none'; bar.append(btn('🖨 چاپ / ذخیره‌ی PDF', () => window.print(), 'ghost'), xlsBtn, copyBtn, txtBtn);
  const top = h('div', { class: 'card no-print' }, h('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap;align-items:center' }, h('span', null, 'بازه‌ی جدول ماهانه:'), sel), h('div', { style: 'margin-top:12px' }, mk));
  return h('div', { class: 'rep pack' }, head('گزارش جامع', [], 'همه‌ی خرید، فروش، پول، چک، سرمایه و جنس‌ها با یک دکمه؛ چاپی، اکسل و متن برای Claude.'), top, planBox, bar, out);
}
