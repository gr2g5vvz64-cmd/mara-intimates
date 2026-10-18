// داشبورد تحلیلی مدیر: شاخص‌ها با مقایسه‌ی بازه‌ی قبل، آدم‌ها (خریداران/تامین‌کنندگان)، روندها، نمودارها، سلامت سیستم
import { h, fmt, jlong, jstr, todayISO, sum } from '../util.js';
import { S, businessAccounts, accBalance } from '../store.js';
import { N, pill, kpi, chips, dtable } from '../ui.js';
import { tok } from '../theme.js';
import { RANGES, period, salesStats, buyerStats, supplierStats, buyerTable, supplierTable, concentration, monthTrend, weekTrend, peopleTrend, rangeOfMonthKey, pct, stockAge, receivableAge } from '../analytics.js';
import { analyze } from '../analysis.js';
import { saleForm, purchaseForm } from '../forms_trade.js';
import { sv, mil, hbars, dueChart, categoryProfitCard, reorderCard, goalsCard } from './dashboard.js';

let rangeN = 30, trendKind = 'week', tableTab = 'buyers', tableSort = 'range';

/* نمودار ستونیِ چندسری: data = [{label, a, b}] ؛ series = [{key,label,color}] */
function groupedBars(title, sub, data, series, fmtv = mil) {
  const max = Math.max(1, ...data.flatMap(d => series.map(s => Math.max(0, d[s.key] || 0))));
  const W = 560, H = 230, pb = 40, pt = 20, gap = (W - 20) / data.length, bw = Math.min(26, (gap - 8) / series.length);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': title });
  svg.append(sv('title', {}, title));
  data.forEach((d, i) => {
    const cx = W - 10 - gap * (i + .5);
    series.forEach((s, j) => {
      const v = d[s.key] || 0, hh = Math.max(v < 0 ? 4 : 1, (H - pb - pt) * Math.max(0, v) / max), x = cx + (j - series.length / 2) * (bw + 2) + 1;
      svg.append(sv('rect', { x, y: H - pb - hh, width: bw, height: hh, rx: 4, fill: v < 0 ? tok('--red') : s.color }));
      svg.append(sv('text', { x: x + bw / 2, y: H - pb - hh - 4, 'text-anchor': 'middle', class: 'cv' }, fmtv(v)));
    });
    svg.append(sv('text', { x: cx, y: H - 16, 'text-anchor': 'middle', class: 'cl' }, d.label.includes('-') ? d.label.split('-')[1] : d.label));
  });
  svg.append(sv('line', { x1: 6, x2: W - 6, y1: H - pb, y2: H - pb, stroke: tok('--line') }));
  return h('div', { class: 'card' }, h('div', { class: 'ct' }, title, sub ? h('small', null, ' ' + sub) : null),
    h('div', { class: 'legend' }, ...series.flatMap(s => [h('i', { class: 'sw', style: `background:${s.color}` }), s.label])), svg);
}

const delta = (cur, prev, goodUp = true) => {
  const p = pct(cur, prev); if (p == null) return { sub: 'بازه‌ی قبل: —', tone: '' };
  const up = p >= 0; return { sub: `${up ? '▲' : '▼'} ${Math.abs(p)}٪ نسبت به بازه‌ی قبل`, tone: (up === goodUp) ? 'pos' : 'neg' };
};
const mini = (label, v, sub) => h('div', { class: 'kpi' }, h('div', { class: 'k-l' }, label), h('div', { class: 'k-v' }, v), sub ? h('div', { class: 'k-s' }, sub) : null);

function tables(P) {
  const host = h('div', { class: 'card' });
  const draw = () => {
    const isB = tableTab === 'buyers', rows = (isB ? buyerTable(P.from, P.to) : supplierTable(P.from, P.to));
    const key = { range: r => r.rangeTotal, all: r => r.total, count: r => r.count, last: r => r.last, owed: r => (r.owed ?? r.debt ?? 0) };
    rows.sort((a, b) => { const f = key[tableSort] || key.range, x = f(a), y = f(b); return x < y ? 1 : x > y ? -1 : 0; });
    const cols = [
      { label: isB ? 'خریدار' : 'تامین‌کننده', main: true, render: r => r.name },
      { label: 'در این بازه', cls: 'num', render: r => (r.rangeTotal ? N(r.rangeTotal) : '') }, { label: 'تعداد فاکتور', cls: 'num', hm: true, render: r => r.rangeCount || '' },
      { label: 'سهم', cls: 'num', hm: true, render: r => (r.share ? r.share.toFixed(1) + '٪' : '') },
      { label: 'جمع از ابتدا', cls: 'num', hm: true, render: r => N(r.total) }, { label: 'آخرین', hm: true, render: r => jstr(r.last) },
      { label: isB ? 'مانده‌ی نسیه' : 'بدهی ما', cls: 'num', render: r => { const v = isB ? r.owed : r.debt; return v > 0.5 ? pill(fmt(v), 'amber') : ''; } }];
    host.replaceChildren(h('div', { class: 'ct' }, 'گزارش کامل ', h('small', null, `(${P.label})`)),
      chips([{ v: 'buyers', label: `خریداران (${buyerTable(P.from, P.to).length})` }, { v: 'sup', label: `تامین‌کنندگان (${supplierTable(P.from, P.to).length})` }], tableTab, v => { tableTab = v; draw(); }, { label: 'گزارش' }),
      chips([{ v: 'range', label: 'بیشترین در بازه' }, { v: 'all', label: 'بیشترین از ابتدا' }, { v: 'count', label: 'بیشترین تعداد' }, { v: 'last', label: 'جدیدترین' }, { v: 'owed', label: isB ? 'بیشترین نسیه' : 'بیشترین بدهی' }], tableSort, v => { tableSort = v; draw(); }, { label: 'مرتب‌سازی' }),
      dtable(cols, rows, { empty: 'موردی نیست' }));
  };
  draw(); return host;
}

export function adminDashboard() {
  const host = h('div', { class: 'dash' }), body = h('div', { class: 'dbody' });
  const today = todayISO();
  const draw = () => {
    const P = period(rangeN), label = RANGES.find(r => r.v === rangeN).label; P.label = label;
    const cur = salesStats(P.from, P.to), prev = salesStats(P.pFrom, P.pTo);
    const B = buyerStats(P.from, P.to), Bp = buyerStats(P.pFrom, P.pTo), SU = supplierStats(P.from, P.to), SUp = supplierStats(P.pFrom, P.pTo);
    const T = S.totals || {};

    const kp = h('div', { class: 'kpis' },
      kpi('فروش', N(cur.sales), { ...delta(cur.sales, prev.sales) }), kpi('سود خالص', N(cur.profit), { ...delta(cur.profit, prev.profit), tone: cur.profit < 0 ? 'neg' : 'pos' }),
      kpi('درصد سود', h('span', { class: 'n' }, cur.margin.toFixed(1) + '٪'), { sub: `قبل: ${prev.margin.toFixed(1)}٪` }),
      kpi('تعداد فاکتور', h('span', { class: 'n' }, fmt(cur.count)), { ...delta(cur.count, prev.count) }), kpi('میانگین هر فاکتور', N(cur.avg), { ...delta(cur.avg, prev.avg) }));

    const people = h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('div', { class: 'ct' }, '👥 خریداران ', h('small', null, `(${label})`)),
        h('div', { class: 'kpis' }, mini('کل خریداران ما', fmt(B.total), 'از ابتدا'), mini('خریدار فعال', fmt(B.active), `قبل: ${fmt(Bp.active)}`), mini('خریدار جدید', fmt(B.fresh), `قبل: ${fmt(Bp.fresh)}`), mini('مشتری تکراری', B.repeat + '٪', 'از فعال‌ها')),
        h('p', { class: 'hint' }, B.active ? `در ${label} به ${fmt(B.active)} نفر فروختیم؛ ${fmt(B.fresh)} نفرشان برای اولین بار خرید کردند.` : `در ${label} فروشی نداشتیم.`)),
      h('div', { class: 'card' }, h('div', { class: 'ct' }, '🏭 تامین‌کنندگان ', h('small', null, `(${label})`)),
        h('div', { class: 'kpis' }, mini('کل تامین‌کنندگان', fmt(SU.total), 'فعال'), mini('از چند نفر خریدیم', fmt(SU.active), `قبل: ${fmt(SUp.active)}`), mini('تامین‌کننده‌ی جدید', fmt(SU.fresh), `قبل: ${fmt(SUp.fresh)}`), mini('جمع خرید', N(SU.spent), `${fmt(SU.count)} فاکتور`)),
        h('p', { class: 'hint' }, SU.active ? `در ${label} از ${fmt(SU.active)} تامین‌کننده خرید کردیم.` : `در ${label} خریدی نداشتیم.`)));

    /* روند هفتگی / ماهانه */
    const tr = trendKind === 'week' ? weekTrend() : monthTrend();
    const pt = peopleTrend(tr, x => (trendKind === 'week' ? [x.a, x.b] : rangeOfMonthKey(x.key)));
    const trendCards = h('div', { class: 'grid2' },
      groupedBars(`فروش و سود ${trendKind === 'week' ? 'هفتگی' : 'ماهانه'}`, '(میلیون ریال)', tr, [{ key: 'sales', label: 'فروش', color: tok('--gold') }, { key: 'profit', label: 'سود خالص', color: tok('--green') }]),
      groupedBars(`خریداران و تامین‌کنندگان ${trendKind === 'week' ? 'هفتگی' : 'ماهانه'}`, '(نفر)', tr.map((x, i) => ({ label: x.label, ...pt[i] })), [{ key: 'active', label: 'خریدار فعال', color: tok('--gold') }, { key: 'fresh', label: 'خریدار جدید', color: tok('--green') }, { key: 'sup', label: 'تامین‌کننده‌ی فعال', color: tok('--blue') || '#4a78c9' }], v => String(v)));

    /* برترین‌ها */
    const bt = buyerTable(P.from, P.to).filter(r => r.rangeTotal > 0), st = supplierTable(P.from, P.to).filter(r => r.rangeTotal > 0), conc = concentration(bt);
    const tops = h('div', { class: 'grid2' },
      h('div', null, hbars(`خریداران برتر (${label})`, bt.slice(0, 8).map(r => ({ l: `${r.name} · ${r.share.toFixed(0)}٪`, v: r.rangeTotal }))),
        conc ? h('p', { class: 'hint' }, `📌 ${fmt(conc.k)} نفر از ${fmt(conc.n)} خریدار (۲۰٪) حدود ${conc.share}٪ فروش این بازه را ساخته‌اند.`) : null),
      hbars(`تامین‌کنندگان برتر (${label}) · مبلغ خرید`, st.slice(0, 8).map(r => ({ l: `${r.name} · ${r.share.toFixed(0)}٪`, v: r.rangeTotal })), 'var(--blue)'));

    /* فروشنده‌ها و کانال‌ها */
    const sellers = ['مهسا', 'رعنا'].map(p => ({ p, st: salesStats(P.from, P.to) })), bySeller = ['مهسا', 'رعنا'].map(p => { const ss = cur.rows.filter(s => s.seller === p); return { l: `${p} (${ss.length} فاکتور)`, v: sum(ss, s => s.total), pr: sum(ss, s => s.profit) }; });
    const chan = [...new Map(cur.rows.map(s => [s.channel, 0])).keys()].map(c => ({ l: c, v: sum(cur.rows.filter(s => s.channel === c), s => s.total) })).sort((a, b) => b.v - a.v);
    const mid = h('div', { class: 'grid2' }, categoryProfitCard(), h('div', null, hbars('فروش مهسا و رعنا', bySeller), hbars('فروش به تفکیک محل', chan)));

    /* ثروت و سن‌ها */
    const SA = stockAge(), RA = receivableAge();
    const worth = h('div', { class: 'grid2' },
      hbars('ارزش خالص چطور ساخته شده', [{ l: 'حساب‌های کسب‌وکار', v: T.business_balance || 0 }, { l: 'ارزش موجودی', v: T.stock_value || 0 }, { l: 'طلب از مشتریان', v: T.receivable || 0 }, { l: 'بدهی به تامین‌کنندگان (−)', v: -(T.payable || 0) }, { l: `ارزش خالص = ${fmt(T.net_worth || 0)}`, v: T.net_worth || 0 }], 'var(--gold)'),
      h('div', null, hbars('سن طلب‌ها (ریال)', [{ l: 'تا ۳ روز', v: RA.a }, { l: '۴ تا ۷ روز', v: RA.b }, { l: '۸ روز و بیشتر', v: RA.c }], 'var(--amber, #d9a21b)'),
        hbars('سن موجودی: پول گیر کرده (ریال)', [{ l: 'کمتر از ۱۴ روز', v: SA.new }, { l: '۱۴ تا ۳۰ روز', v: SA.mid }, { l: 'بیش از ۳۰ روز', v: SA.old }], 'var(--red)')));

    /* سلامت */
    const A = analyze().findings, nE = A.filter(f => f.lvl === 'err').length, nW = A.filter(f => f.lvl === 'warn').length;
    const health = h('div', { class: 'card' }, h('div', { class: 'ct' }, '🔍 سلامت سیستم ', h('button', { type: 'button', class: 'mini', onclick: () => { location.hash = '#/analysis'; } }, 'تحلیل کامل')),
      nE || nW ? h('div', { class: 'alert ' + (nE ? 'red' : 'amber') }, `${nE ? '🔴 ' + nE + ' مشکل' : ''}${nE && nW ? ' · ' : ''}${nW ? '🟡 ' + nW + ' هشدار' : ''} — ${A.filter(f => f.lvl !== 'info').slice(0, 3).map(f => f.title).join('، ')}`)
        : h('div', { class: 'alert ok' }, '✅ مشکل یا هشداری نیست.'));

    body.replaceChildren(kp, goalsCard(), people,
      chips([{ v: 'week', label: 'هفتگی' }, { v: 'month', label: 'ماهانه' }], trendKind, v => { trendKind = v; draw(); }, { label: 'روند' }), trendCards,
      tops, mid, worth, health, reorderCard(), dueChart(), tables(P));
  };
  const rangeBar = chips(RANGES.map(r => ({ v: r.v, label: r.label })), rangeN, v => { rangeN = v; draw(); }, { label: 'بازه' });
  const quick = (label, icon, cls, fn) => h('button', { type: 'button', class: 'qa ' + cls, onclick: fn }, h('span', { class: 'qi', 'aria-hidden': 'true' }, icon), label);
  host.append(h('div', { class: 'hello' }, h('div', null, h('h1', null, `سلام ${S.me.name}`), h('p', { class: 'sub' }, jlong(today) + ' · داشبورد تحلیلی')), h('img', { class: 'brand-mark', src: 'icons/logo-mark.jpg', alt: 'MR', width: 42, height: 42 })),
    h('div', { class: 'qas' }, quick('فروش جدید', '🛍', 'gold', () => saleForm()), quick('خرید جدید', '📦', 'dark', () => purchaseForm()), quick('تحلیل', '🔍', 'line', () => { location.hash = '#/analysis'; })),
    rangeBar, body);
  draw(); return host;
}
