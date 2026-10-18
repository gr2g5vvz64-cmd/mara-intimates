import { h, fmt, jlong, jstr, jmonthKey, jmonthName, todayISO, lastMonths, sum, groupBy, addDaysISO } from '../util.js';
import { S, monthly, itemProfit, businessAccounts, accBalance, activeSales } from '../store.js';
import { N, pill, kpi, tabsBar } from '../ui.js';
import { tok } from '../theme.js';
import { categoryStats } from '../insights.js';
import { analysisModal } from '../analysis.js';
import { chips } from '../ui.js';
import { dueBuckets, topCustomers, goalProgress, reorderSuggestions, dayCloseOpen, negativeAccounts, overdue, soon } from '../insights.js';
import { saleForm, purchaseForm } from '../forms_trade.js';
import { returnForm, expenseForm, supplierPaymentForm, dayCloseForm, goalForm } from '../forms_misc.js';

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, a = {}, ...k) => { const e = document.createElementNS(NS, tag); for (const x in a) e.setAttribute(x, a[x]); k.flat().forEach(c => c != null && e.append(c instanceof Node ? c : document.createTextNode(c))); return e; };
const mil = n => { const v = n / 1e6; return (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toString(); };

function barChart() {
  const keys = lastMonths(6); const M = Object.fromEntries(monthly().map(m => [m.key, m]));
  const data = keys.map(k => ({ k, sales: (M[k] || {}).sales || 0, profit: (M[k] || {}).profit || 0 }));
  const max = Math.max(1, ...data.map(d => Math.max(d.sales, d.profit)));
  const W = 560, H = 230, pb = 38, pt = 18, bw = 26, gap = (W - 20) / data.length;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'نمودار فروش و سود شش ماه اخیر' });
  svg.append(sv('title', {}, 'فروش و سود ماهانه (میلیون ریال)'));
  data.forEach((d, i) => {
    const cx = W - 10 - gap * (i + .5);
    const hs = (H - pb - pt) * d.sales / max, hp = d.profit < 0 ? 4 : (H - pb - pt) * d.profit / max;
    svg.append(sv('rect', { x: cx - bw - 2, y: H - pb - hs, width: bw, height: Math.max(hs, 1), rx: 4, fill: tok('--gold') }));
    svg.append(sv('rect', { x: cx + 2, y: H - pb - hp, width: bw, height: Math.max(hp, 1), rx: 4, fill: d.profit < 0 ? tok('--red') : tok('--green') }));
    svg.append(sv('text', { x: cx - bw / 2 - 2, y: H - pb - hs - 4, 'text-anchor': 'middle', class: 'cv' }, mil(d.sales)));
    svg.append(sv('text', { x: cx + bw / 2 + 2, y: H - pb - hp - 4, 'text-anchor': 'middle', class: 'cv g' }, mil(d.profit)));
    svg.append(sv('text', { x: cx, y: H - 16, 'text-anchor': 'middle', class: 'cl' }, jmonthName(d.k).split(' ')[0]));
  });
  svg.append(sv('line', { x1: 6, x2: W - 6, y1: H - pb, y2: H - pb, stroke: tok('--line') }));
  return h('div', { class: 'card' }, h('div', { class: 'ct' }, 'فروش و سود ماهانه ', h('small', null, '(میلیون ریال)')),
    h('div', { class: 'legend' }, h('i', { class: 'sw gold' }), 'فروش', h('i', { class: 'sw green' }), 'سود'), svg);
}
function hbars(title, rows, color = 'var(--gold)', unit = '') {
  const max = Math.max(1, ...rows.map(r => Math.abs(r.v)));
  return h('div', { class: 'card' }, h('div', { class: 'ct' }, title),
    rows.length ? rows.map(r => h('div', { class: 'hb' }, h('span', { class: 'hl' }, r.l), h('span', { class: 'hbar' }, h('i', { style: { width: Math.max(2, Math.abs(r.v) / max * 100) + '%', background: r.v < 0 ? 'var(--red)' : color } })), h('span', { class: 'hv n' }, fmt(r.v) + unit))) : h('div', { class: 'empty sm' }, 'هنوز داده‌ای نیست'));
}


/* نمودار سررسیدهای ۳۰ روز آینده: بدهی ما به تامین‌کننده و طلب ما از مشتری */
function dueChart() {
  const b = dueBuckets(), max = Math.max(1, ...b.map(x => Math.max(x.payable, x.receivable)));
  const W = 560, H = 190, pb = 28, pt = 12, gap = (W - 12) / b.length, bw = Math.max(3, gap / 2 - 1.5);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart dchart', role: 'img', 'aria-label': 'نمودار سررسیدهای ۳۰ روز آینده' });
  svg.append(sv('title', {}, 'سررسیدهای ۳۰ روز آینده'));
  b.forEach((x, i) => {
    const cx = W - 6 - gap * (i + .5), hp = (H - pb - pt) * x.payable / max, hr = (H - pb - pt) * x.receivable / max;
    if (x.payable) svg.append(sv('rect', { x: cx - bw - .5, y: H - pb - hp, width: bw, height: Math.max(hp, 1), rx: 2, fill: tok('--red') }));
    if (x.receivable) svg.append(sv('rect', { x: cx + .5, y: H - pb - hr, width: bw, height: Math.max(hr, 1), rx: 2, fill: tok('--green') }));
    if (i === 0 || i % 5 === 1) svg.append(sv('text', { x: cx, y: H - 10, 'text-anchor': 'middle' }, i === 0 ? 'گذشته' : jstr(x.date).slice(5)));
  });
  svg.append(sv('line', { x1: 6, x2: W - 6, y1: H - pb, y2: H - pb, stroke: tok('--line') }));
  const totP = sum(b, x => x.payable), totR = sum(b, x => x.receivable);
  return h('div', { class: 'card' }, h('div', { class: 'ct' }, 'سررسیدهای ۳۰ روز آینده'),
    h('div', { class: 'legend' }, h('i', { class: 'sw red' }), `بدهی ما: ${fmt(totP)}`, h('i', { class: 'sw green' }), `طلب ما: ${fmt(totR)} ریال`), svg,
    h('p', { class: 'hint' }, 'ستون «گذشته» یعنی سررسیدهای گذشته که هنوز تسویه نشده‌اند.'));
}
export function topCustomersCard() {
  const rows = topCustomers(5);
  return h('div', { class: 'card' }, h('div', { class: 'ct' }, 'مشتریان برتر ', h('a', { href: '#/customers', class: 'more' }, 'مشتریان ←')),
    rows.length ? h('div', { class: 'rank' }, rows.map(c => h('div', { class: 'li' }, h('div', null, h('b', null, c.name), h('small', null, `${fmt(c.count)} خرید · سود ${fmt(c.profit)}${c.owed > 0 ? ' · بدهکار ' + fmt(c.owed) : ''}`)), N(c.total)))) : h('div', { class: 'empty sm' }, 'هنوز فروشی با نام مشتری ثبت نشده.'));
}
function goalRow(who) {
  const g = goalProgress(who);
  return h('div', { class: 'goalrow' }, h('div', { class: 'gh' }, h('b', null, who), g.goal ? h('span', null, `${fmt(g.done)} از ${fmt(g.goal)} · ${fmt(g.pct)}٪`) : h('span', { class: 'hint' }, 'هدفی تعیین نشده')),
    g.goal ? h('div', { class: 'gbar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.min(100, g.pct), 'aria-label': `پیشرفت هدف ${who}` }, h('i', { class: g.pct >= 100 ? 'done' : '', style: { width: Math.min(100, g.pct) + '%' } })) : null,
    g.goal ? h('div', { class: 'gsub' }, g.pct >= 100 ? '🎉 به هدف رسید' : `${fmt(Math.max(0, g.goal - g.done))} ریال تا هدف مانده`) : null);
}
function goalsCard(only) {
  const mk = jmonthKey(todayISO());
  return h('div', { class: 'card' }, h('div', { class: 'ct' }, `هدف فروش ${jmonthName(mk)}`, h('button', { type: 'button', class: 'mini', onclick: () => goalForm() }, 'تعیین هدف')),
    ...(only ? [goalRow(only)] : [goalRow('مهسا'), goalRow('رعنا')]));
}
function reorderCard() {
  const rows = reorderSuggestions();
  if (!rows.length) return null;
  return h('div', { class: 'card reorder' }, h('div', { class: 'ct' }, 'پیشنهاد خرید مجدد ', h('button', { type: 'button', class: 'mini', onclick: () => purchaseForm() }, 'خرید جدید')),
    h('p', { class: 'hint' }, 'کالاهایی که در ۳۰ روز اخیر فروش رفته‌اند و موجودی‌شان برای حدود یک هفته فروش هم کافی نیست.'),
    rows.slice(0, 6).map(r => h('div', { class: 'li' }, h('div', null, h('b', null, r.item.name), h('small', null, `موجودی ${fmt(r.rem)} · فروش ۳۰ روز ${fmt(r.sold30)}${r.days != null ? ' · کفاف ' + fmt(r.days) + ' روز' : ''}`)), h('span', { class: 'pill amber' }, 'بخر ' + fmt(r.buy)))));
}

/* سود هر دسته‌ی کالا (شورت، سوتین، جوراب، …) در بازه‌ی انتخابی */
let catRange = 'month';
function categoryProfitCard() {
  const host = h('div', { class: 'card' });
  const draw = () => {
    const rows = categoryStats(catRange).filter(r => r.revenue || r.profit || r.qty), best = rows[0];
    host.replaceChildren(h('div', { class: 'ct' }, 'سود به تفکیک دسته‌ی کالا ', h('a', { href: '#/items', class: 'more' }, 'دسته‌ها ←')),
      chips([{ v: 'month', label: 'این ماه' }, { v: '30', label: '۳۰ روز اخیر' }, { v: 'all', label: 'کل' }], catRange, v => { catRange = v; draw(); }, { label: 'بازه' }),
      ...(rows.length ? [h('p', { class: 'hint' }, best && best.profit > 0 ? `بهترین دسته در این بازه: «${best.cat}» با ${fmt(best.profit)} ریال سود.` : 'هنوز فروشی در این بازه نیست.'),
        hbars('سود هر دسته (ریال)', rows.map(r => ({ l: r.cat, v: r.profit })), 'var(--green)'),
        h('div', { class: 'tw sm' }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['دسته', 'فروش', 'سود', 'درصد سود', 'تعداد'].map(x => h('th', null, x)))),
          h('tbody', null, rows.map(r => h('tr', null, h('td', { 'data-l': 'دسته', class: 'main' }, r.cat), h('td', { 'data-l': 'فروش', class: 'num' }, N(r.revenue)), h('td', { 'data-l': 'سود', class: 'num' }, N(r.profit)),
            h('td', { 'data-l': 'درصد سود', class: 'num' }, r.margin == null ? '—' : fmt(Math.round(r.margin * 10) / 10) + '٪'), h('td', { 'data-l': 'تعداد', class: 'num' }, fmt(r.qty)))))))] : [h('div', { class: 'empty sm' }, 'هنوز فروشی در این بازه نیست.')]),
      h('p', { class: 'hint' }, 'درصد سود = سود ÷ فروش همان دسته (بعد از کم کردن مرجوعی‌ها).'));
  };
  draw(); return host;
}

/* مقایسه‌ی مهسا و رعنا: هر دو همیشه حساب و موجودی همدیگر را می‌بینند (سرور هیچ داده‌ای را پنهان نمی‌کند) */
function partnersCard(act, today, mk) {
  const P = ['مهسا', 'رعنا'];
  const accOf = (p, kind) => S.accounts.find(a => a.owner === p && a.kind === kind);
  const bal = (p, kind) => { const a = accOf(p, kind); return a ? accBalance(a.id) : 0; };
  const inM = s => jmonthKey(s.date) === mk;
  const mine = p => act.filter(s => s.seller === p);
  const col = { 'مهسا': 'rem_m', 'رعنا': 'rem_r' };
  const rows = [
    ['حساب بانکی', p => bal(p, 'bank')],
    ['نقد', p => bal(p, 'cash')],
    ['سرمایه‌ی گذاشته‌شده', p => (S.totals || {})[p === 'مهسا' ? 'capital_m' : 'capital_r'] || 0],
    ['جنس در دست (عدد)', p => sum(S.stock, i => i[col[p]] || 0), 'u'],
    ['ارزش جنس', p => sum(S.lots, l => (l[col[p]] || 0) * (l.landed_unit || 0))],
    ['فروش امروز', p => sum(mine(p).filter(s => s.date === today), s => s.total)],
    ['فروش این ماه', p => sum(mine(p).filter(inM), s => s.total)],
    ['سود این ماه', p => sum(mine(p).filter(inM), s => s.profit)],
    ['طلب از مشتریان', p => sum(mine(p), s => s.outstanding || 0)]
  ];
  const cell = (p, v, u) => h('span', { class: 'pc' + (S.me.name === p ? ' me' : '') + (v < 0 ? ' neg' : '') }, u ? String(v) : N(v));
  return h('div', { class: 'card' }, h('div', { class: 'ct' }, 'مهسا و رعنا ', h('a', { href: '#/stock', class: 'more' }, 'ریز موجودی ←')),
    h('p', { class: 'hint' }, 'هر دو نفر حساب و موجودی همدیگر را همیشه می‌بینند.'),
    h('div', { class: 'pg' },
      h('span', null), ...P.map(p => h('b', { class: 'ph' + (S.me.name === p ? ' me' : '') }, p + (S.me.name === p ? ' (تو)' : ''))),
      ...rows.flatMap(([l, f, u]) => [h('span', { class: 'pl' }, l), ...P.map(p => cell(p, f(p), u))])));
}

let savedTab = null;   // تبی که کاربر آخر انتخاب کرده؛ با هر تازه‌سازی داده همان می‌ماند
export function render() {
  const T = S.totals, today = todayISO(), mk = jmonthKey(today);
  const act = activeSales();
  const sToday = sum(act.filter(s => s.date === today), s => s.total), pToday = sum(act.filter(s => s.date === today), s => s.profit);
  const M = monthly().find(m => m.key === mk) || { sales: 0, profit: 0 };
  const biz = businessAccounts();
  const debtSup = S.vSup.filter(x => x.balance > 0), debtTotal = sum(debtSup, x => x.balance);
  const low = S.stock.filter(i => i.active && i.rem <= i.min_stock && i.rem > 0), out = S.stock.filter(i => i.active && i.rem === 0 && S.saleLines.some(l => l.item_id === i.id && S.SALE[l.sale_id] && !S.SALE[l.sale_id].voided && S.SALE[l.sale_id].date >= addDaysISO(today, -30)));
  const owed = act.filter(s => s.outstanding > 0);
  const alerts = [];
  if (debtTotal > 0) alerts.push(h('a', { href: '#/invoices', class: 'alert warn' }, `بدهی به تامین‌کنندگان: ${fmt(debtTotal)} ریال`, h('small', null, debtSup.map(x => x.name).join('، '))));
  const dl = (kind, cmp) => S.due.filter(d => d.kind === kind && d.due_date && cmp(d.days_left));
  const grp = rows => `${fmt(sum(rows, d => d.amount))} ریال — ` + [...new Set(rows.map(d => d.party))].join('، ');
  const oP = dl('payable', x => x < 0), sP = dl('payable', x => x >= 0 && x <= 3), oR = dl('receivable', x => x < 0), sR = dl('receivable', x => x >= 0 && x <= 3);
  if (oP.length) alerts.unshift(h('a', { href: '#/invoices', class: 'alert red' }, '🔴 سررسیدِ گذشته‌ی بدهی ما به تامین‌کننده', h('small', null, grp(oP))));
  if (sP.length) alerts.unshift(h('a', { href: '#/invoices', class: 'alert amber' }, '🟡 تا ۳ روز آینده باید به تامین‌کننده بدهیم', h('small', null, grp(sP))));
  if (oR.length) alerts.unshift(h('a', { href: '#/customers', class: 'alert red' }, '🔴 مشتری‌هایی که سررسیدشان گذشته', h('small', null, grp(oR))));
  if (sR.length) alerts.unshift(h('a', { href: '#/customers', class: 'alert amber' }, '🟡 تا ۳ روز آینده باید از مشتری بگیریم', h('small', null, grp(sR))));
  if (owed.length) alerts.push(h('a', { href: '#/customers', class: 'alert warn' }, `طلب ما از مشتریان: ${fmt(sum(owed, s => s.outstanding))} ریال`, h('small', null, `${S.vCus.filter(c => c.outstanding > 0.5).length} مشتری بدهکار`)));
  if (low.length) alerts.push(h('a', { href: '#/stock', class: 'alert amber' }, `کم‌موجودی: ${low.map(i => `${i.name} (${i.rem})`).join('، ')}`));
  if (out.length) alerts.push(h('a', { href: '#/stock', class: 'alert gray' }, `تمام‌شده: ${out.map(i => i.name).join('، ')}`));
  const rs = reorderSuggestions(), negs = negativeAccounts();
  if (rs.length) alerts.push(h('a', { href: '#/purchases', class: 'alert amber' }, `پیشنهاد خرید مجدد: ${rs.slice(0, 4).map(r => r.item.name).join('، ')}`));
  if (negs.length) alerts.push(h('a', { href: '#/finance', class: 'alert red' }, `حساب منفی: ${negs.map(a => a.name).join('، ')}`));
  if (dayCloseOpen()) alerts.push(h('a', { href: '#/finance', class: 'alert warn' }, 'امروز هنوز بسته نشده؛ موجودی نقد و بانک را بشمار و «بستن روز» بزن.'));
  if (Math.abs(T.check_diff || 0) > 1) alerts.push(h('a', { href: '#/finance', class: 'alert red' }, 'اختلاف در ترازنامه‌ی کنترلی دیده شد؛ صفحه‌ی مالی را ببین.'));
  if (!alerts.length) alerts.push(h('div', { class: 'alert ok' }, 'همه‌چیز مرتب است.'));

  const byCh = [...groupBy(act, s => s.channel)].map(([l, a]) => ({ l, v: sum(a, s => s.total) })).sort((a, b) => b.v - a.v);
  const top = itemProfit().slice(0, 5).map(x => ({ l: x.item.name, v: x.profit }));
  const quick = (label, icon, cls, fn) => h('button', { type: 'button', class: 'qa ' + cls, onclick: fn }, h('span', { class: 'qi', 'aria-hidden': 'true' }, icon), label);
  const lastSales = act.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)).slice(0, 5);
  const lastBuys = S.vInvoices.filter(i => !i.voided).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)).slice(0, 5);

  const kpisEl =
    h('div', { class: 'kpis' }, kpi('فروش امروز', N(sToday), { sub: 'ریال' }), kpi('سود فروش‌های امروز', N(pToday), { sub: 'ریال (قبل از هزینه‌ها)', tone: pToday < 0 ? 'neg' : 'pos' }),
      kpi('فروش این ماه', N(M.sales), { sub: 'ریال' }), kpi('سود خالص این ماه', N(M.profit), { sub: 'ریال (بعد از هزینه‌ها)', tone: M.profit < 0 ? 'neg' : 'pos' }),
      kpi('سود کل', N(T.profit || 0), { sub: 'ریال (بعد از هزینه‌ها)', tone: (T.profit || 0) < 0 ? 'neg' : 'pos' }));
  const allView = () => [partnersCard(act, today, mk), goalsCard(), categoryProfitCard(), reorderCard(),
    h('div', { class: 'grid2' }, dueChart(), topCustomersCard()),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('div', { class: 'ct' }, 'مانده‌ی حساب‌ها ', h('a', { href: '#/finance', class: 'more' }, 'مالی ←')),
        h('div', { class: 'accs' }, biz.map(a => h('div', { class: 'acc' }, h('span', null, a.name), N(accBalance(a.id))))),
        h('div', { class: 'srow bold' }, h('span', null, 'جمع حساب‌های کسب‌وکار'), N(T.business_balance || 0))),
      h('div', { class: 'card' }, h('div', { class: 'ct' }, 'نیاز به توجه'), h('div', { class: 'alerts' }, alerts))),
    h('div', { class: 'grid2' }, barChart(), h('div', null, hbars('فروش به تفکیک محل (از ابتدا)', byCh), hbars('پرسودترین کالاها (از ابتدا)', top, 'var(--green)'))),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('div', { class: 'ct' }, 'آخرین فروش‌ها ', h('a', { href: '#/sales', class: 'more' }, 'همه ←')),
        lastSales.length ? lastSales.map(s => h('div', { class: 'li' }, h('div', null, h('b', null, s.items_text), h('small', null, `${s.no} · ${jstr(s.date)} · ${s.seller} · ${s.channel}`)), N(s.total))) : h('div', { class: 'empty sm' }, 'هنوز فروشی ثبت نشده')),
      h('div', { class: 'card' }, h('div', { class: 'ct' }, 'آخرین خریدها ', h('a', { href: '#/purchases', class: 'more' }, 'همه ←')),
        lastBuys.length ? lastBuys.map(i => h('div', { class: 'li' }, h('div', null, h('b', null, i.supplier), h('small', null, `${i.no} · ${jstr(i.date)} · ${i.nlines} قلم`)), N(i.goods_total))) : h('div', { class: 'empty sm' }, 'هنوز خریدی ثبت نشده')))];

  const personView = who => {
    const k = who === 'مهسا' ? 'rem_m' : 'rem_r', cap = who === 'مهسا' ? T.capital_m : T.capital_r, pay = who === 'مهسا' ? T.payout_m : T.payout_r;
    const mine = act.filter(s => s.seller === who), monthS = mine.filter(s => jmonthKey(s.date) === mk), dayS = mine.filter(s => s.date === today);
    const capT = (T.capital_m || 0) + (T.capital_r || 0), share = capT > 0 ? (T.profit || 0) * (cap || 0) / capT : 0;
    const accs = S.accounts.filter(a => a.owner === who);
    const stockRows = S.stock.filter(i => (i[k] || 0) > 0).sort((a, b) => b[k] - a[k]);
    const stockVal = sum(S.lots, l => (l[k] || 0) * (l.landed_unit || 0));
    const owedS = mine.filter(s => s.outstanding > 0).sort((a, b) => (a.due_date || '9') < (b.due_date || '9') ? -1 : 1);
    const last = mine.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)).slice(0, 6);
    return [
      h('p', { class: 'hint' }, who === S.me.name ? 'حساب و کتاب خودت' : `حساب و کتاب ${who} (فقط برای دیدن؛ همیشه برای هر دو نفر باز است)`),
      h('div', { class: 'kpis' }, kpi('فروش امروز', N(sum(dayS, s => s.total)), { sub: 'ریال' }), kpi('فروش این ماه', N(sum(monthS, s => s.total)), { sub: 'ریال' }),
        kpi('سود فروش‌های این ماه', N(sum(monthS, s => s.profit)), { sub: 'ریال (قبل از هزینه‌ها)', tone: sum(monthS, s => s.profit) < 0 ? 'neg' : 'pos' }), kpi('جنس در دست', String(sum(S.stock, i => i[k] || 0)), { sub: `ارزش ${fmt(stockVal)} ریال` }),
        kpi('طلب از مشتریان', N(sum(owedS, s => s.outstanding)), { sub: `${owedS.length} فاکتور` })),
      goalsCard(who),
      h('div', { class: 'grid2' },
        h('div', { class: 'card' }, h('div', { class: 'ct' }, `حساب‌های ${who} `, h('a', { href: '#/finance', class: 'more' }, 'مالی ←')),
          h('div', { class: 'accs' }, accs.map(a => h('div', { class: 'acc' }, h('span', null, a.name), N(accBalance(a.id))))),
          h('div', { class: 'srow' }, h('span', null, 'سرمایه‌ی او'), N(cap || 0)),
          h('div', { class: 'srow' }, h('span', null, 'سود برداشت‌شده'), N(pay || 0)),
          h('div', { class: 'srow bold' }, h('span', null, 'سهم پیشنهادی از سود کل (بر پایه‌ی سرمایه)'), N(Math.round(share)))),
        h('div', { class: 'card' }, h('div', { class: 'ct' }, `موجودی نزد ${who} `, h('a', { href: '#/stock', class: 'more' }, 'ریز موجودی ←')),
          stockRows.length ? stockRows.map(i => h('div', { class: 'li' }, h('div', null, h('b', null, i.name), h('small', null, i.category || '')), h('b', null, String(i[k])))) : h('div', { class: 'empty sm' }, 'جنسی نزد او نیست.'))),
      h('div', { class: 'grid2' },
        h('div', { class: 'card' }, h('div', { class: 'ct' }, 'آخرین فروش‌ها ', h('a', { href: '#/sales', class: 'more' }, 'همه ←')),
          last.length ? last.map(s => h('div', { class: 'li' }, h('div', null, h('b', null, s.items_text), h('small', null, `${s.no} · ${jstr(s.date)} · ${s.channel}`)), N(s.total))) : h('div', { class: 'empty sm' }, 'هنوز فروشی ثبت نشده.')),
        h('div', { class: 'card' }, h('div', { class: 'ct' }, 'طلب‌های باز ', h('a', { href: '#/customers', class: 'more' }, 'مشتریان ←')),
          owedS.length ? owedS.map(s => h('div', { class: 'li' }, h('div', null, h('b', null, s.customer || '—'), h('small', null, `${s.no} · ${s.due_date ? 'سررسید ' + jstr(s.due_date) : 'بدون سررسید'}`)), N(s.outstanding))) : h('div', { class: 'empty sm' }, 'طلب بازی نیست.')))
    ];
  };

  const openOf = p => act.filter(s => s.seller === p && s.outstanding > 0).length, hot = p => act.some(s => s.seller === p && s.outstanding > 0 && s.due_date && s.due_date < today);
  const nAlerts = alerts.filter(x => !x.classList.contains('ok')).length;
  const TABS = [{ id: 'مهسا', label: 'مهسا', badge: { n: openOf('مهسا'), tone: openOf('مهسا') ? (hot('مهسا') ? 'red' : 'amber') : 'zero' } }, { id: 'رعنا', label: 'رعنا', badge: { n: openOf('رعنا'), tone: openOf('رعنا') ? (hot('رعنا') ? 'red' : 'amber') : 'zero' } },
    { id: 'all', label: 'کل MARA', badge: { n: nAlerts, tone: nAlerts ? (oP.length || oR.length ? 'red' : 'amber') : 'zero' } }];
  let tab = (TABS.some(t => t.id === savedTab) && savedTab) || (TABS.some(t => t.id === S.me.name) ? S.me.name : 'all');
  const tabsHost = h('div'), body = h('div', { class: 'dbody' });
  const draw = () => { tabsHost.replaceChildren(tabsBar(TABS, tab, t => { tab = savedTab = t; draw(); })); const urgent = alerts.some(x => !x.classList.contains('ok')) ? [h('div', { class: 'card' }, h('div', { class: 'ct' }, 'نیاز به توجه'), h('div', { class: 'alerts' }, alerts))] : [];
    body.replaceChildren(...(tab === 'all' ? [kpisEl, ...allView()] : [...urgent, ...personView(tab)]).filter(Boolean)); };
  draw();
  return h('div', { class: 'dash' },
    h('div', { class: 'hello' }, h('div', null, h('h1', null, `سلام ${S.me.name}`), h('p', { class: 'sub' }, jlong(today))), h('img', { class: 'brand-mark', src: 'icons/logo-mark.jpg', alt: 'MR', width: 42, height: 42 })),
    tabsHost,
    h('div', { class: 'qas' }, quick('فروش جدید', '🛍', 'gold', () => saleForm()), quick('خرید جدید', '📦', 'dark', () => purchaseForm()), quick('مرجوعی', '↩', 'line', () => returnForm()), quick('پرداخت / هزینه', '💳', 'line', () => location.hash = '#/pay'), ...(S.me.role === 'admin' ? [quick('تحلیل', '🔍', 'gold', () => analysisModal())] : [])),
    body);
}
