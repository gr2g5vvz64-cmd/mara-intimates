// گزارش مدیریتی (فقط مدیر): همهٔ داده‌های برنامه در چند شاخص کاربردی + «تصمیم‌های امروز». همه‌چیز از همان جدول‌های حسابداری حساب می‌شود.
import { h, fmt, todayISO, addDaysISO, sum, lastMonths, jmonthKey, jmonthName } from '../util.js';
import { S, activeSales, businessAccounts, accBalance } from '../store.js';
import { N, kpi, chips, dtable, pill, tabsBar } from '../ui.js';
import { period, salesStats, buyerStats, flowStats, sellerStats, stockAge, receivableAge, dataStart, buyerTable, concentration, grandTotal, profitWordShort, STALE_OLD } from '../analytics.js';
import { head } from './common.js';

const RG = [{ v: 30, label: '۳۰ روز اخیر' }, { v: 90, label: '۳ ماه اخیر' }, { v: 365, label: 'یک سال' }, { v: 0, label: 'از روز اول' }];
const R1 = v => (Math.round(v * 10) / 10).toLocaleString('fa-IR');
const inR = (d, a, b) => d >= a && d <= b;
const dlt = (cur, prev) => (prev ? `${cur >= prev ? '▲' : '▼'} ${R1(Math.abs((cur - prev) / Math.abs(prev) * 100))}٪ نسبت به دورهٔ قبل` : 'دورهٔ قبل داده ندارد');

function compute(n) {
  const to = todayISO(), from = n ? addDaysISO(to, -(n - 1)) : dataStart(), days = n || Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1);
  const P = n ? period(n) : { from, to, pFrom: null, pTo: null };
  const cur = salesStats(P.from, P.to), prev = n ? salesStats(P.pFrom, P.pTo) : null, T = S.totals || {};
  const flow = flowStats(d => inR(d, P.from, P.to)), B = buyerStats(P.from, P.to);
  const ss = cur.rows, saleIds = new Set(ss.map(s => s.id));
  const cogs = sum(ss, s => s.cogs), disc = sum(ss, s => s.discount), gross = cur.sales + disc;
  const soldQ = sum(S.saleLines.filter(l => saleIds.has(l.sale_id)), l => l.qty), retQ = sum(S.saleLines.filter(l => saleIds.has(l.sale_id)), l => l.returned_qty || 0);
  const cap = (T.capital_m || 0) + (T.capital_r || 0), profit = T.profit || 0, stockVal = T.stock_value || 0;
  const overdueAmt = sum(S.vCus, c => c.overdue_amount), ra = receivableAge(), sa = stockAge();
  const soldIn = new Set(S.saleLines.filter(l => { const s = S.SALE[l.sale_id]; return s && !s.voided && s.date >= addDaysISO(to, -29); }).map(l => l.item_id));
  const act = S.stock.filter(i => i.active), dead = S.lots.filter(l => !l.voided && l.rem > 0 && !soldIn.has(l.item_id));
  const deadVal = sum(dead, l => l.value), low = act.filter(i => i.rem <= (i.min_stock || 0) && soldIn.has(i.id)), zero = act.filter(i => i.rem <= 0 && soldIn.has(i.id));
  const byCh = {}; for (const s of ss) { const o = byCh[s.channel || '—'] || (byCh[s.channel || '—'] = { t: 0, p: 0 }); o.t += s.total; o.p += s.profit; }
  const chs = Object.entries(byCh).sort((a, b) => b[1].t - a[1].t);
  const rows = buyerTable(P.from, P.to), conc = concentration(rows, grandTotal(P.from, P.to));
  const itemP = new Map(); for (const l of S.saleLines) if (saleIds.has(l.sale_id)) itemP.set(l.item_id, (itemP.get(l.item_id) || 0) + l.qty * (l.net_unit - l.unit_cost));
  const top = [...itemP.entries()].sort((a, b) => b[1] - a[1])[0];
  return { P, cur, prev, T, flow, B, cogs, disc, gross, soldQ, retQ, cap, profit, stockVal, overdueAmt, ra, sa, dead, deadVal, low, zero, chs, conc, top, days, days30: n === 0 ? days : n,
    turn: stockVal > 0 && cogs > 0 ? cogs / stockVal : null, cover: stockVal > 0 && cogs > 0 ? stockVal / (cogs / days) : null,
    sellers: ['مهسا', 'رعنا'].map(w => sellerStats(P.from, P.to, w)), cash: T.business_balance || 0, rec: T.receivable || 0, pay: T.payable || 0, worth: T.net_worth != null ? T.net_worth : cap + profit };
}

function insights(c) {
  const L = [], add = (tone, text, href) => L.push({ tone, text, href });
  const diff = Math.abs((c.T.capital_m || 0) - (c.T.capital_r || 0)) / 2;
  if (diff > 1000) add('warn', `سرمایهٔ مهسا و رعنا برابر نیست؛ ${fmt(Math.round(diff / 10))} تومان باید واریز شود.`, '#/finance');
  if (c.overdueAmt > 0) add('bad', `${fmt(Math.round(c.overdueAmt))} ریال از طلب‌ها از سررسید گذشته؛ پیگیری وصول لازم است.`, '#/customers');
  const soon = S.due.filter(d => d.kind !== 'sale' && d.days_left >= 0 && d.days_left <= 7);
  if (soon.length) add('warn', `${fmt(soon.length)} پرداخت به تامین‌کننده تا ۷ روز آینده سررسید دارد (جمع ${fmt(Math.round(sum(soon, d => d.amount)))} ریال).`, '#/suppliers');
  if (c.zero.length) add('bad', `${fmt(c.zero.length)} کالایی که این ماه فروش داشته الان تمام شده: ${c.zero.slice(0, 3).map(i => i.name).join('، ')}${c.zero.length > 3 ? ' …' : ''}`, '#/stock');
  else if (c.low.length) add('warn', `${fmt(c.low.length)} کالای پرفروش به حداقل موجودی رسیده؛ زمان سفارش است.`, '#/stock');
  if (c.deadVal > 0 && c.stockVal > 0 && c.deadVal / c.stockVal >= 0.2) add('warn', `${R1(c.deadVal / c.stockVal * 100)}٪ از ارزش انبار (${fmt(Math.round(c.deadVal))} ریال) کالایی است که ۳۰ روز اخیر فروش نداشته؛ تخفیف یا تبلیغ فکر کن.`, '#/stock');
  if (c.cur.margin < 0) add('bad', profitWordShort() + ' این بازه منفی است (هزینه‌ها از سود فروش بیشتر بوده).', '#/pnl');
  if (c.conc && c.conc.share >= 70) add('warn', `${c.conc.share}٪ فروش به ${fmt(c.conc.k)} خریدار بزرگ وابسته است؛ ریسک وابستگی.`, '#/customers');
  const open = S.monthlyCounts.filter(m => m.status === 'open');
  if (open.length) add('warn', `انبارگردانی ${open.map(m => m.title).join(' و ')} هنوز بسته نشده.`, '#/monthcount');
  const neg = businessAccounts().filter(a => accBalance(a.id) < 0);
  if (neg.length) add('bad', `حساب ${neg.map(a => a.name).join('، ')} منفی است.`, '#/finance');
  if (!L.length) add('ok', 'مورد فوری نیست؛ همه‌چیز در وضعیت مناسب است ✓');
  return L;
}

function kpiView(rg) {
  const body = h('div');
  const draw = () => {
    const c = compute(rg), pos = v => (v < 0 ? 'neg' : 'pos'), ins = insights(c), roi = c.cap > 0 ? c.profit / c.cap * 100 : null;
    const sec = (title, sub, ...k) => h('div', { class: 'card' }, h('div', { class: 'ct' }, title, sub ? h('small', null, ' ' + sub) : null), h('div', { class: 'kpis' }, ...k));
    const top = c.top ? S.I[c.top[0]] : null, ch = c.chs[0];
    body.replaceChildren(
      h('div', { class: 'card' }, h('div', { class: 'ct' }, 'تصمیم‌های امروز ', h('small', null, '(خودکار از روی همهٔ داده‌ها)')),
        ins.map(x => h('div', { class: 'li task ' + (x.tone === 'bad' ? 'bad' : x.tone === 'warn' ? 'warn' : '') }, h('div', null, x.text), x.href ? h('a', { class: 'more', href: x.href }, 'ببین ←') : null))),
      sec('۱ · سرمایه و بازده', '(از روز اول)',
        kpi('جمع سرمایه', N(c.cap)), kpi('سود کل', N(c.profit), { tone: pos(c.profit) }),
        kpi('بازده سرمایه', h('span', { class: 'n' }, roi == null ? '—' : R1(roi) + '٪'), { sub: roi == null ? '' : `از هر ۱۰۰ تومان سرمایه ${R1(roi)} تومان` }),
        kpi('ارزش کسب‌وکار', N(c.worth), { sub: `${fmt(Math.round(c.worth - c.cap))} نسبت به سرمایه` })),
      sec('۲ · فروش و سودآوری', `(${RG.find(r => r.v === rg).label})`,
        kpi('فروش', N(c.cur.sales), { sub: c.prev ? dlt(c.cur.sales, c.prev.sales) : `${fmt(c.cur.count)} فاکتور` }),
        kpi(profitWordShort(), N(c.cur.profit), { tone: pos(c.cur.profit), sub: c.prev ? dlt(c.cur.profit, c.prev.profit) : '' }),
        kpi('حاشیهٔ ' + profitWordShort(), h('span', { class: 'n' }, R1(c.cur.margin) + '٪'), { sub: 'از هر ۱۰۰ تومان فروش، چند تومان سود می‌ماند' }),
        kpi('حاشیهٔ سود ناخالص', h('span', { class: 'n' }, c.cur.sales > 0 ? R1(c.cur.gross / c.cur.sales * 100) + '٪' : '—'), { sub: 'پیش از هزینه‌ها' }),
        kpi('هزینه به فروش', h('span', { class: 'n' }, c.cur.sales > 0 ? R1(c.cur.expenses / c.cur.sales * 100) + '٪' : '—'), { sub: `${fmt(Math.round(c.cur.expenses))} ریال هزینه` }),
        kpi('تخفیف داده‌شده', h('span', { class: 'n' }, c.gross > 0 ? R1(c.disc / c.gross * 100) + '٪' : '—'), { sub: `${fmt(Math.round(c.disc))} ریال` }),
        kpi('نرخ مرجوعی', h('span', { class: 'n' }, c.soldQ > 0 ? R1(c.retQ / c.soldQ * 100) + '٪' : '—'), { sub: `${fmt(c.retQ)} از ${fmt(c.soldQ)} عدد` }),
        kpi('میانگین هر فاکتور', N(c.cur.avg))),
      sec('۳ · پول و نقدینگی', '(الان)',
        kpi('پول حساب‌ها', N(c.cash), { tone: pos(c.cash) }), kpi('طلب از مشتری‌ها', N(c.rec), { sub: `معوق: ${fmt(Math.round(c.overdueAmt))}`, tone: c.overdueAmt > 0 ? 'neg' : '' }),
        kpi('بدهی به تامین‌کننده‌ها', N(c.pay)), kpi('خالص نقدی', N(c.cash + c.rec - c.pay), { sub: 'حساب‌ها + طلب − بدهی', tone: pos(c.cash + c.rec - c.pay) }),
        kpi('وصول فروش', h('span', { class: 'n' }, c.flow.sold > 0 ? R1(Math.min(100, c.flow.received / c.flow.sold * 100)) + '٪' : '—'), { sub: 'دریافتی نسبت به فروش همین بازه' }),
        kpi('طلب بالای ۸ روز', N(c.ra.c), { tone: c.ra.c > 0 ? 'neg' : '' })),
      sec('۴ · انبار', '(الان)',
        kpi('ارزش انبار', N(c.stockVal), { sub: c.worth > 0 ? `${R1(c.stockVal / c.worth * 100)}٪ از ارزش کسب‌وکار` : '' }),
        kpi('گردش موجودی', h('span', { class: 'n' }, c.turn == null ? '—' : R1(c.turn) + ' بار'), { sub: 'بهای فروش‌رفته ÷ ارزش انبار در این بازه' }),
        kpi('انبار برای چند روز؟', h('span', { class: 'n' }, c.cover == null ? '—' : fmt(Math.round(c.cover)) + ' روز'), { sub: 'با سرعت فروش همین بازه' }),
        kpi('کالای راکد (۳۰ روز بی‌فروش)', N(c.deadVal), { sub: c.stockVal > 0 ? `${R1(c.deadVal / c.stockVal * 100)}٪ انبار` : '', tone: c.deadVal > 0 ? 'neg' : '' }),
        kpi(`انبار بالای ${fmt(STALE_OLD)} روز مانده`, N(c.sa.old)), kpi('پرفروش‌های تمام‌شده / رو به اتمام', h('span', { class: 'n' }, `${fmt(c.zero.length)} / ${fmt(c.low.length)}`))),
      sec('۵ · مشتری و کانال', `(${RG.find(r => r.v === rg).label})`,
        kpi('خریدار فعال', h('span', { class: 'n' }, fmt(c.B.active)), { sub: `${fmt(c.B.fresh)} نفر جدید` }), kpi('خریدار تکراری', h('span', { class: 'n' }, c.B.repeat + '٪'), { sub: 'از خریداران فعال' }),
        kpi('وابستگی به خریداران بزرگ', h('span', { class: 'n' }, c.conc ? c.conc.share + '٪' : '—'), { sub: c.conc ? `${fmt(c.conc.k)} نفر از ${fmt(c.conc.n)}` : 'خریدار کافی نیست' }),
        kpi('بهترین کانال فروش', h('span', { class: 'n' }, ch ? ch[0] : '—'), { sub: ch ? `${fmt(Math.round(ch[1].t))} ریال · سود ${fmt(Math.round(ch[1].p))}` : '' }),
        kpi('پرسودترین کالا', h('span', { class: 'n' }, top ? top.name : '—'), { sub: c.top ? `${fmt(Math.round(c.top[1]))} ریال سود` : '' })),
      sec('۶ · شرکا', `(${RG.find(r => r.v === rg).label})`,
        ...c.sellers.flatMap(s => [kpi(`فروش ${s.seller}`, N(s.total), { sub: `${fmt(s.count)} فاکتور · ${fmt(s.customers)} خریدار` }), kpi(`سود فروش ${s.seller}`, N(s.profit), { tone: pos(s.profit) })]),
        kpi('ارزش جنس دست مهسا / رعنا', h('span', { class: 'n' }, `${fmt(Math.round(sum(S.stock, i => i.value_m)))} / ${fmt(Math.round(sum(S.stock, i => i.value_r)))}`)),
        kpi('سرمایهٔ مهسا / رعنا', h('span', { class: 'n' }, `${fmt(c.T.capital_m || 0)} / ${fmt(c.T.capital_r || 0)}`))));
  };
  draw();
  return body;
}

/* ============ جریان نقدینگی ماهانه: پول واقعاً از کجا آمد و کجا رفت (۶ ماه اخیر) ============ */
function cashView() {
  const keys = lastMonths(6), z = () => Object.fromEntries(keys.map(k => [k, 0])), add = (o, d, v) => { const k = jmonthKey(d); if (k in o) o[k] += Number(v) || 0; };
  const R = { sale: z(), coll: z(), sup: z(), ship: z(), exp: z(), cour: z(), ref: z(), cap: z(), out: z() };
  const pk = id => (S.A[id] || {}).kind === 'pocket';
  const inn = (o, d, v, acc) => { add(o, d, v); if (pk(acc)) add(R.out, d, v); };        // پول به جیب شخصی رفته = برداشت
  const outt = (o, d, v, acc) => { add(o, d, v); if (pk(acc)) add(R.cap, d, v); };       // از جیب شخصی داده شده = سرمایه‌ی واردشده
  for (const s of activeSales()) { inn(R.sale, s.date, s.received, s.account_id); outt(R.cour, s.date, (s.courier || 0) + (s.pack || 0), s.cost_account_id); }
  for (const c of S.collections) if (!c.voided) inn(R.coll, c.date, c.amount, c.account_id);
  for (const p of S.payments) if (!p.voided && p.account_id) outt(R.sup, p.date, p.amount, p.account_id);
  /* چک پرداختی: پول از جیب سرمایه‌گذار در روز سررسید (پاس‌شده فرض می‌شود) خرج تامین‌کننده می‌شود؛ قبلش نه */
  const pkOf = o => (S.accounts.find(a => a.kind === 'pocket' && a.owner === o) || {}).id;
  for (const c of S.cheques) if (!c.voided && c.status === 'open' && c.days_left <= 0) outt(R.sup, c.due_date, c.amount, pkOf(c.cap_owner));
  for (const i of S.vInvoices) if (!i.voided && i.ship_account_id) outt(R.ship, i.date, i.ship_cost, i.ship_account_id);
  for (const e of S.expenses) if (!e.voided) outt(R.exp, e.date, e.amount, e.account_id);
  for (const r of S.returns) if (!r.voided) outt(R.ref, r.date, r.refund_amount, r.refund_account_id);
  for (const t of S.transfers) if (!t.voided) { const f = S.A[t.from_account_id], to = S.A[t.to_account_id]; if (!f || !to) continue; if (f.kind === 'pocket' && to.kind !== 'pocket') add(R.cap, t.date, t.amount); else if (f.kind !== 'pocket' && to.kind === 'pocket') add(R.out, t.date, t.amount); }
  const tot = o => sum(Object.values(o)), cell = v => h('td', { class: 'num' }, v ? fmt(Math.round(v)) : '—');
  const line = (label, o, { sign = 1, cls = '' } = {}) => h('tr', { class: cls }, h('th', { scope: 'row' }, label), ...keys.map(k => cell(sign * o[k])), h('td', { class: 'num main' }, tot(o) ? fmt(Math.round(sign * tot(o))) : '—'));
  const net = k => R.sale[k] + R.coll[k] - R.sup[k] - R.ship[k] - R.exp[k] - R.cour[k] - R.ref[k], total = {}; keys.forEach(k => { total[k] = net(k); });
  const own = {}; keys.forEach(k => { own[k] = R.cap[k] - R.out[k]; });
  const chg = {}; keys.forEach(k => { chg[k] = net(k) + own[k]; });
  const head = h('tr', null, h('th', null, ''), ...keys.map(k => h('th', { class: 'num' }, jmonthName(k))), h('th', { class: 'num' }, 'جمع'));
  const good = keys.filter(k => net(k) > 0).length;
  return h('div', null,
    h('div', { class: 'card' }, h('div', { class: 'ct' }, 'جریان نقدینگی ماهانه ', h('small', null, '(پول واقعی؛ نه سود حسابداری)')),
      h('div', { class: 'tw' }, h('table', { class: 't' }, h('thead', null, head), h('tbody', null,
        line('+ فروش نقدی (هنگام فروش)', R.sale), line('+ وصول طلب نسیه', R.coll),
        line('− پرداخت به تامین‌کننده', R.sup), line('− هزینهٔ حمل خرید', R.ship), line('− هزینه‌ها', R.exp), line('− پیک و بسته‌بندی', R.cour), line('− برگشت پول به مشتری', R.ref),
        line('= جریان عملیاتی', total, { cls: 'bold' }), line('+ سرمایه‌ی واردشده (از جیب شخصی) − برداشت (به جیب شخصی)', own), line('= تغییر پول حساب‌ها', chg, { cls: 'bold' })))),
      h('p', { class: 'hint' }, `در ${fmt(good)} ماه از ${fmt(keys.length)} ماه اخیر، پول عملیاتی مثبت بوده. اگر سود دارید ولی جریان منفی است یعنی پولتان در موجودی کالا یا طلب مشتری‌ها گیر کرده.`)),
    h('div', { class: 'card' }, h('div', { class: 'ct' }, 'پول گیرکرده'), h('div', { class: 'kpis' },
      kpi('در انبار', N(S.totals.stock_value || 0)), kpi('در طلب مشتری‌ها', N(S.totals.receivable || 0)), kpi('بدهی به تامین‌کننده', N(S.totals.payable || 0)),
      kpi('پول در حساب‌ها', N(S.totals.business_balance || 0)))));
}

/* ============ سودآوری هر خریدار ============ */
function custView(rg) {
  const to = todayISO(), from = rg ? addDaysISO(to, -(rg - 1)) : dataStart(), map = new Map();
  for (const s of activeSales().filter(x => inR(x.date, from, to))) {
    const k = s.customer_id || 0, o = map.get(k) || { id: k, name: k ? (S.CUS[k] || {}).name || '؟' : 'بدون نام', n: 0, total: 0, profit: 0, disc: 0, last: '' };
    o.n++; o.total += s.total; o.profit += s.profit; o.disc += s.discount || 0; if (s.date > o.last) o.last = s.date; map.set(k, o);
  }
  const bal = Object.fromEntries(S.vCus.map(c => [c.id, c])), t0 = Date.parse(to);
  const rows = [...map.values()].map(o => ({ ...o, owe: (bal[o.id] || {}).outstanding || 0, over: (bal[o.id] || {}).overdue_amount || 0, since: o.last ? Math.round((t0 - Date.parse(o.last)) / 864e5) : 0, margin: o.total > 0 ? o.profit / o.total * 100 : 0, dr: o.total + o.disc > 0 ? o.disc / (o.total + o.disc) * 100 : 0 })).sort((a, b) => b.profit - a.profit);
  const totP = sum(rows, r => r.profit), top3 = sum(rows.slice(0, 3), r => r.profit);
  const flag = r => [r.over > 0 ? pill('طلب معوق', 'red') : null, r.dr >= 10 ? pill('تخفیف زیاد', 'amber') : null, r.id && r.n >= 2 && r.since > 30 ? pill('مدتی نخریده', 'gray') : null, r.margin >= 25 && r.n >= 2 ? pill('خریدار خوب', 'green') : null].filter(Boolean);
  return h('div', { class: 'card' }, h('div', { class: 'ct' }, 'سودآوری هر خریدار ', h('small', null, `(${RG.find(r => r.v === rg).label})`)),
    totP > 0 && rows.length >= 3 ? h('p', { class: 'hint' }, `۳ خریدار اول ${R1(top3 / totP * 100)}٪ سود را ساخته‌اند.`) : null,
    dtable([{ label: 'خریدار', main: true, render: r => r.name }, { label: 'فاکتور', cls: 'num', render: r => fmt(r.n) }, { label: 'فروش', cls: 'num', render: r => fmt(Math.round(r.total)) },
      { label: 'سود', cls: 'num', render: r => N(Math.round(r.profit)) }, { label: 'حاشیه', cls: 'num', hm: true, render: r => R1(r.margin) + '٪' }, { label: 'تخفیف گرفته', cls: 'num', hm: true, render: r => (r.disc ? fmt(Math.round(r.disc)) : '—') },
      { label: 'طلب ما', cls: 'num', render: r => (r.owe > 0 ? N(Math.round(r.owe)) : '—') }, { label: 'آخرین خرید', hm: true, render: r => (r.last ? `${fmt(r.since)} روز پیش` : '—') }, { label: 'برچسب', render: r => h('span', null, flag(r)) }], rows, { empty: 'در این بازه فروشی نیست' }));
}

/* ============ ABC کالاها: کدام کالاها سود اصلی را می‌سازند ============ */
function abcView(rg) {
  const to = todayISO(), from = rg ? addDaysISO(to, -(rg - 1)) : dataStart(), ids = new Set(activeSales().filter(s => inR(s.date, from, to)).map(s => s.id)), m = new Map();
  for (const l of S.saleLines) if (ids.has(l.sale_id)) { const o = m.get(l.item_id) || { id: l.item_id, q: 0, rev: 0, p: 0 }; const q = l.qty - (l.returned_qty || 0); o.q += q; o.rev += q * l.net_unit; o.p += q * (l.net_unit - l.unit_cost); m.set(l.item_id, o); }
  const rows = [...m.values()].sort((a, b) => b.p - a.p), tot = sum(rows.filter(r => r.p > 0), r => r.p); let cum = 0;
  rows.forEach(r => { cum += Math.max(0, r.p); r.share = tot > 0 ? Math.max(0, r.p) / tot * 100 : 0; r.cum = tot > 0 ? cum / tot * 100 : 0; r.cls = r.p <= 0 ? 'C' : r.cum - r.share < 80 ? 'A' : r.cum - r.share < 95 ? 'B' : 'C'; r.it = S.I[r.id] || {}; r.st = S.stock.find(x => x.id === r.id) || {}; });
  const nA = rows.filter(r => r.cls === 'A').length, sold = new Set(rows.map(r => r.id)), idle = S.stock.filter(i => i.active && i.rem > 0 && !sold.has(i.id)).sort((a, b) => b.value - a.value);
  const tone = c => (c === 'A' ? 'green' : c === 'B' ? 'amber' : 'gray');
  return h('div', null, h('div', { class: 'card' }, h('div', { class: 'ct' }, 'تحلیل ABC کالاها ', h('small', null, `(${RG.find(r => r.v === rg).label})`)),
    rows.length ? h('p', { class: 'hint' }, `${fmt(nA)} کالا از ${fmt(rows.length)} کالای فروخته‌شده، ۸۰٪ سود را ساخته‌اند (گروه A). روی همین‌ها موجودی کافی نگه دار؛ گروه C کم‌سود است یا زیان‌ده.`) : null,
    dtable([{ label: '#', cls: 'num', render: (r, i) => '' }, { label: 'کالا', main: true, render: r => r.it.name || '؟' }, { label: 'گروه', render: r => pill(r.cls, tone(r.cls)) }, { label: 'تعداد خالص', cls: 'num', render: r => fmt(r.q) },
      { label: 'فروش خالص', cls: 'num', hm: true, render: r => fmt(Math.round(r.rev)) }, { label: 'سود', cls: 'num', render: r => N(Math.round(r.p)) }, { label: 'سهم از سود', cls: 'num', render: r => R1(r.share) + '٪' },
      { label: 'موجودی', cls: 'num', hm: true, render: r => fmt(r.st.rem || 0) }].slice(1), rows, { empty: 'در این بازه فروشی نیست' })),
    h('div', { class: 'card' }, h('div', { class: 'ct' }, 'موجودی بدون فروش در این بازه ', h('small', null, `(${fmt(idle.length)} کالا · ${fmt(Math.round(sum(idle, i => i.value)))} ریال سرمایه)`)),
      dtable([{ label: 'کالا', main: true, render: i => i.name }, { label: 'موجودی', cls: 'num', render: i => fmt(i.rem) }, { label: 'ارزش', cls: 'num', render: i => fmt(Math.round(i.value)) }], idle.slice(0, 15), { empty: 'همهٔ کالاهای موجود فروش داشته‌اند ✓' })));
}

/* ============ پیش‌بینی خرید: کدام کالا کی تمام می‌شود و چقدر باید سفارش داد ============ */
function buyView(cover, onCover) {
  const to = todayISO(), span = Math.min(30, Math.max(1, Math.round((Date.parse(to) - Date.parse(dataStart())) / 864e5) + 1)), from = addDaysISO(to, -(span - 1));
  const ids = new Set(activeSales().filter(s => inR(s.date, from, to)).map(s => s.id)), q = new Map();
  for (const l of S.saleLines) if (ids.has(l.sale_id)) q.set(l.item_id, (q.get(l.item_id) || 0) + l.qty - (l.returned_qty || 0));
  const rows = S.stock.filter(i => i.active && q.get(i.id) > 0).map(i => { const v = q.get(i.id) / span, left = i.rem / v, need = Math.max(0, Math.ceil(v * cover - i.rem)); return { i, v, left, need, cost: need * (i.last_cost || 0) }; })
    .filter(r => r.left < cover).sort((a, b) => a.left - b.left);
  const state = r => (r.i.rem <= 0 ? pill('تمام شده', 'red') : r.left < 7 ? pill('کمتر از یک هفته', 'red') : r.left < 14 ? pill('کمتر از دو هفته', 'amber') : pill('رو به اتمام', 'gray'));
  return h('div', { class: 'card' }, h('div', { class: 'ct' }, 'پیش‌بینی خرید ', h('small', null, `(با سرعت فروش ${fmt(span)} روز اخیر)`)),
    h('div', { class: 'bar' }, chips([{ v: 14, label: 'برای ۱۴ روز' }, { v: 30, label: 'برای ۳۰ روز' }, { v: 45, label: 'برای ۴۵ روز' }], cover, onCover, { cls: 'catf', label: 'پوشش' })),
    rows.length ? h('p', { class: 'hint' }, `برای اینکه ${fmt(cover)} روز موجودی داشته باشی، حدود ${fmt(Math.round(sum(rows, r => r.cost)))} ریال خرید لازم است (با آخرین قیمت خرید).`) : null,
    dtable([{ label: 'کالا', main: true, render: r => r.i.name }, { label: 'وضعیت', render: r => state(r) }, { label: 'موجودی', cls: 'num', render: r => fmt(r.i.rem) }, { label: 'فروش روزانه', cls: 'num', hm: true, render: r => R1(r.v) },
      { label: 'تا اتمام', cls: 'num', render: r => (r.i.rem <= 0 ? '۰ روز' : fmt(Math.round(r.left)) + ' روز') }, { label: 'سفارش پیشنهادی', cls: 'num', render: r => fmt(r.need) + ' عدد' }, { label: 'هزینهٔ تقریبی', cls: 'num', hm: true, render: r => fmt(Math.round(r.cost)) }], rows, { empty: 'هیچ کالای پرفروشی تا ' + fmt(cover) + ' روز آینده تمام نمی‌شود ✓' }));
}

export function render() {
  const st = { tab: 'kpi', rg: 30, cover: 30 }, tabs = h('div'), bar = h('div'), pane = h('div');
  const T = [{ id: 'kpi', label: 'شاخص‌ها' }, { id: 'cash', label: 'جریان نقدینگی' }, { id: 'cust', label: 'سودآوری خریداران' }, { id: 'abc', label: 'کالاها (ABC)' }, { id: 'buy', label: 'پیش‌بینی خرید' }];
  const draw = () => {
    tabs.replaceChildren(tabsBar(T, st.tab, t => { st.tab = t; draw(); }));
    const needRg = ['kpi', 'cust', 'abc'].includes(st.tab);
    bar.replaceChildren(...(needRg ? [h('div', { class: 'bar' }, chips(RG, st.rg, v => { st.rg = v; draw(); }, { cls: 'catf', label: 'بازه' }))] : []));
    pane.replaceChildren(st.tab === 'kpi' ? kpiView(st.rg) : st.tab === 'cash' ? cashView() : st.tab === 'cust' ? custView(st.rg) : st.tab === 'abc' ? abcView(st.rg) : buyView(st.cover, v => { st.cover = v; draw(); }));
  };
  draw();
  return h('div', null, head('گزارش مدیریتی', [], 'شاخص‌های مهم، جریان پول، خریداران، کالاها و پیش‌بینی خرید از روی همهٔ داده‌ها.'), tabs, bar, pane);
}
