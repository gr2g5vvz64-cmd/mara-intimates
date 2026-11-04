// ابزارک‌های داشبورد ۷.۳۲: کارت خوشامد، سلامت سرمایه، نمودار فروش (روز/هفته/ماه)، سهم دسته‌ها، جریان رویدادها، نمودار کوچک
import { h, fmt, sum, todayISO, addDaysISO, jmonthKey, lastMonths, toJ, toast } from './util.js';
import { S, activeSales, defaultMarkup, expKindOf, stockTargetDays, rpc, bus, errText } from './store.js';
import { N, modal, field, numField, chips, run } from './ui.js';
import { categoryStats } from './insights.js';
import { salesStats } from './analytics.js';

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, a = {}, ...k) => { const e = document.createElementNS(NS, tag); for (const x in a) e.setAttribute(x, a[x]); k.flat().forEach(c => c != null && e.append(c instanceof Node ? c : document.createTextNode(String(c)))); return e; };
const R1 = v => (Math.round(v * 10) / 10).toLocaleString('en-US');
const dec = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 });
export const money = v => (Math.abs(v) >= 1e6 ? `${dec(v / 1e6)} میلیون ریال` : `${fmt(Math.round(v))} ریال`);
const isAdmin = () => !!(S.me && S.me.role === 'admin');
const monthStart = () => { const t = todayISO(); return addDaysISO(t, -(toJ(t)[2] - 1)); };
const sameDayIn = (d, a, b) => d >= a && d <= b;

/* ---------- نمودار کوچک ---------- */
export function sparkline(vals, tone = '') {
  const v = vals.length > 1 ? vals : [0, ...vals, 0], mx = Math.max(...v), mn = Math.min(...v), rg = (mx - mn) || 1;
  const d = v.map((x, i) => (i ? 'L' : 'M') + (i * (116 / (v.length - 1)) + 2).toFixed(1) + ' ' + (30 - ((x - mn) / rg) * 26).toFixed(1)).join(' ');
  const col = tone === 'neg' ? 'var(--red)' : tone === 'pos' ? 'var(--green)' : 'var(--gold)';
  return sv('svg', { viewBox: '0 0 120 34', class: 'spark', 'aria-hidden': 'true', preserveAspectRatio: 'none' }, sv('path', { d, fill: 'none', stroke: col, 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}
/* فروش و سود روزانه‌ی n روز اخیر (برای نمودار کوچک کارت‌ها) */
export function dailySeries(n = 14, key = 'total', seller = null) {
  const t = todayISO(), by = new Map();
  for (const s of activeSales()) if (!seller || s.seller === seller) by.set(s.date, (by.get(s.date) || 0) + (Number(s[key]) || 0));
  return Array.from({ length: n }, (_, i) => by.get(addDaysISO(t, -(n - 1 - i))) || 0);
}

/* ---------- کارت خوشامد ---------- */
export const greeting = () => { const hr = new Date().getHours(); return hr < 5 ? 'شب بخیر' : hr < 12 ? 'صبح بخیر' : hr < 17 ? 'ظهر بخیر' : hr < 20 ? 'عصر بخیر' : 'شب بخیر'; };
export function heroCard({ name, headline, chips: cs = [], stats = [], sub = '' }) {
  const chip = c => (c.href ? h('a', { class: 'hchip ' + (c.tone || ''), href: c.href }, c.text) : h('span', { class: 'hchip ' + (c.tone || '') }, c.text));
  return h('section', { class: 'hero2', 'aria-label': 'خلاصه‌ی امروز' },
    h('div', { class: 'hero-main' },
      h('div', { class: 'hero-greet' }, `${greeting()}، ${name}`, sub ? h('small', null, ' · ' + sub) : null),
      h('h1', { class: 'hero-h' }, headline),
      cs.length ? h('div', { class: 'hero-chips' }, cs.map(chip)) : null),
    stats.length ? h('div', { class: 'hero-stats' }, stats.map(s => h('div', { class: 'hs' }, h('small', null, s.l), h('b', null, N(s.v))))) : null);
}

/* ---------- حاشیه‌ی سودِ هدف در برابر واقعی (روی بهای تمام‌شده) ---------- */
export const catTarget = name => { const c = (S.categories || []).find(x => x.name === name); return c && c.markup_pct != null ? Number(c.markup_pct) : defaultMarkup(); };
export function marginStatus() {
  const rows = categoryStats('month').filter(r => r.cost > 0 && r.revenue > 0);
  const cost = sum(rows, r => r.cost), profit = sum(rows, r => r.profit);
  const items = rows.map(r => ({ cat: r.cat, real: r.profit / r.cost * 100, target: catTarget(r.cat), cost: r.cost }));
  const target = cost > 0 ? sum(items, i => i.target * i.cost) / cost : defaultMarkup();
  return { items, real: cost > 0 ? profit / cost * 100 : null, target, below: items.filter(i => i.real < i.target - 1), has: cost > 0 };
}

/* ---------- سلامت سرمایه ---------- */
export function healthData() {
  const today = todayISO(), from = monthStart(), T = S.totals || {};
  const st = salesStats(from, today), rows = st.rows;
  const saleCosts = sum(rows, s => (s.courier || 0) + (s.pack || 0)), cogs = sum(rows, s => s.cogs || 0);
  const ex = S.expenses.filter(e => !e.voided && !e.stocktake_id && sameDayIn(e.date, from, today));
  const fixed = sum(ex.filter(e => expKindOf(e) === 'fixed'), e => e.amount), varX = sum(ex.filter(e => expKindOf(e) === 'variable'), e => e.amount);
  const cm = st.gross - varX, cmPct = st.sales > 0 ? cm / st.sales : null;
  const be = fixed > 0 && cmPct != null && cmPct > 0 ? fixed / cmPct : null;
  const stock = T.stock_value || 0, recv = T.receivable || 0, cash = Math.max(0, T.business_balance || 0);
  const s30 = addDaysISO(today, -29), sold30 = activeSales().filter(s => s.date >= s30);
  const days = Math.max(1, Math.min(30, Math.round((Date.parse(today) - Date.parse(S.sales.length ? S.sales.map(s => s.date).sort()[0] : today)) / 864e5) + 1));
  const daily = sum(sold30, s => s.cogs || 0) / days, target = stockTargetDays();
  const cover = stock > 0 && daily > 0 ? stock / daily : null, ideal = daily * target;
  const ids = new Set(S.saleLines.filter(l => { const s = S.SALE[l.sale_id]; return s && !s.voided && s.date >= s30; }).map(l => l.item_id));
  const dead = sum(S.lots.filter(l => !l.voided && l.rem > 0 && !ids.has(l.item_id)), l => l.value);
  return { st, saleCosts, cogs, fixed, varX, be, stock, recv, cash, cover, ideal, target, dead, daily };
}

function targetForm() {
  let v = stockTargetDays(); const f = numField({ value: v, unit: 'روز', onInput: n => { v = n; } });
  const b = h('button', { class: 'btn primary lg', type: 'button' }, 'ذخیره');
  b.onclick = async () => { const r = await run(b, () => rpc('save_setting', { key: 'stock_target_days', value: v })); if (r) { toast('هدف انبار ذخیره شد'); m.close(); await bus.refresh(); } };
  const m = modal({ title: 'هدف انبار (روز فروش)', body: h('div', { class: 'form' }, h('div', { class: 'hint' }, 'انبار مناسب یعنی کالایی که با سرعت فروش این ماه برای این‌همه روز کافی باشد. معمولاً ۴۵ تا ۷۵ روز: کمتر از آن خطر تمام شدن کالا، بیشتر از آن سرمایه‌ی خوابیده.'), field('تعداد روز', f)), footer: b });
}

export function healthCard() {
  const D = healthData(), M = marginStatus(), st = D.st;
  const capTotal = Math.max(1, D.stock + D.recv + D.cash);
  const capParts = [['انبار', D.stock, 'var(--gold)'], ['طلب از مشتری', D.recv, 'var(--lux)'], ['پول حساب‌ها', D.cash, 'var(--green)']];
  const verdict = (() => {
    if (!st.count) return { tone: 'info', text: 'این ماه هنوز فروشی ثبت نشده.' };
    const lines = [st.profit >= 0 ? `در سود هستید ✓ — ${money(st.profit)} سود از ${money(st.sales)} فروش این ماه` : `این ماه تا الان در ضرر هستید: ${money(-st.profit)} کسری از ${money(st.sales)} فروش`];
    if (D.be) lines.push(`فروش ${R1(st.sales / D.be)} برابر نقطه‌ی سربه‌سر است`);
    return { tone: st.profit >= 0 ? 'ok' : 'bad', text: lines.join(' · ') + '.' };
  })();
  const notes = [];
  if (M.has && M.below.length) notes.push(`حاشیه‌ی سود ${R1(M.real)}٪ است و زیر هدف ${R1(M.target)}٪ می‌ماند؛ پایین‌تر از هدف: ${M.below.slice(0, 3).map(i => i.cat).join('، ')}.`);
  if (D.cover != null) notes.push(D.cover > D.target * 1.25 ? `انبار ${fmt(Math.round(D.cover))} روز فروش است و از هدف ${fmt(D.target)} روز بیشتر است: حدود ${money(Math.max(0, D.stock - D.ideal))} اضافه خوابیده.` : D.cover < D.target * 0.6 ? `انبار فقط ${fmt(Math.round(D.cover))} روز فروش است؛ کمتر از هدف ${fmt(D.target)} روز، خطر تمام شدن کالا هست.` : `انبار ${fmt(Math.round(D.cover))} روز فروش است و با هدف ${fmt(D.target)} روز متعادل است ✓`);
  if (D.dead > 0) notes.push(`کالای راکد (۳۰ روز بی‌فروش): ${money(D.dead)} — این بخش واقعاً خوابیده است.`);
  if (D.fixed === 0 && st.count) notes.push('هنوز هزینه‌ی ثابتی (مثل اجاره) برای این ماه ثبت نشده؛ نقطه‌ی سربه‌سر دقیق نیست.');
  const mx = Math.max(40, ...M.items.map(i => Math.max(i.real, i.target * 1.5)));
  const catRows = M.items.slice(0, 6).map(i => {
    const ok = i.real >= i.target - 1;
    return h('div', { class: 'hc-bar' }, h('div', { class: 'hc-bl' }, h('span', null, i.cat), h('span', null, h('b', { class: 'n' }, R1(i.real) + '٪'), h('small', null, ok ? ' · به هدف رسید' : ' · زیر هدف'))),
      h('div', { class: 'hc-track' }, h('div', { class: 'hc-fill ' + (ok ? 'ok' : i.real < i.target * .7 ? 'bad' : 'mid'), style: { width: Math.max(2, Math.min(100, i.real / mx * 100)) + '%' } }), h('i', { class: 'hc-mark', style: { insetInlineStart: Math.min(100, i.target / mx * 100) + '%' } })));
  });
  const rowsEc = [['فروش این ماه', money(st.sales)], ['نقطه‌ی سربه‌سر', D.be ? money(D.be) : '—'], ['هزینه‌ی ثابت (اجاره، تجهیزات)', money(D.fixed)], ['هزینه‌ی متغیر (پیک، بسته‌بندی، تبلیغات)', money(D.varX + D.saleCosts)], ['سود ناخالص', money(st.sales - D.cogs)], ['سود خالص', money(st.profit)]];
  return h('section', { class: 'card hc', 'aria-label': 'سلامت سرمایه' },
    h('div', { class: 'ct' }, 'سلامت سرمایه ', h('small', null, '(این ماه)'), isAdmin() ? h('button', { type: 'button', class: 'mini', onclick: targetForm }, `هدف انبار: ${fmt(D.target)} روز · تغییر`) : null),
    h('div', { class: 'alert ' + ({ bad: 'red', ok: 'ok', info: '' }[verdict.tone] || '') }, verdict.text),
    notes.length ? h('ul', { class: 'hc-notes' }, notes.map(n => h('li', null, n))) : null,
    h('div', { class: 'hc-grid' },
      h('div', { class: 'hc-col' }, h('div', { class: 'hc-t' }, '۱) سود: هدف در برابر واقعی'),
        M.has ? [h('div', { class: 'hc-big' }, h('span', { class: 'n ' + (M.real < M.target - 1 ? 'neg' : 'pos') }, R1(M.real) + '٪'), h('small', null, ` واقعی · هدف ${R1(M.target)}٪ (روی بهای تمام‌شده) · یعنی حدود ${R1(M.real / (100 + M.real) * 100)}٪ از قیمت فروش`)), ...catRows,
          h('p', { class: 'hint' }, 'خط تیره = هدف. ۲۰٪ روی بهای تمام‌شده فقط حدود ۱۶٫۷٪ از قیمت فروش است.')] : h('p', { class: 'hint' }, 'هنوز فروشی با بهای تمام‌شده در این ماه نیست.')),
      h('div', { class: 'hc-col' }, h('div', { class: 'hc-t' }, '۲) سرمایه کجاست'),
        h('div', { class: 'hc-stack', role: 'img', 'aria-label': 'سهم انبار، طلب و پول حساب‌ها' }, capParts.map(([, v, c]) => h('div', { style: { width: (v / capTotal * 100) + '%', background: c } }))),
        capParts.map(([l, v, c]) => h('div', { class: 'hc-leg' }, h('i', { style: { background: c } }), h('span', null, l), h('b', null, money(v)), h('small', null, R1(v / capTotal * 100) + '٪'))),
        D.cover != null ? h('div', { class: 'hint' }, `انبار مناسب برای ${fmt(D.target)} روز فروش: ${money(D.ideal)} · الان ${money(D.stock)} (${fmt(Math.round(D.cover))} روز)`) : null),
      h('div', { class: 'hc-col' }, h('div', { class: 'hc-t' }, '۳) فروش در برابر هزینه‌ها'),
        rowsEc.map(([k, v]) => h('div', { class: 'srow' }, k, h('b', null, v))),
        h('p', { class: 'hint' }, 'سربه‌سر = هزینه‌ی ثابت ÷ (سود ناخالص − هزینه‌ی متغیر، به‌نسبت فروش). نوع هزینه را هنگام ثبت هزینه انتخاب می‌کنی.'))));
}

/* ---------- نمودار فروش با سوییچ روز / هفته / ماه ---------- */
const WD = ['یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
const prevMonthKey = k => { let [y, m] = k.split('-').map(Number); m--; if (m < 1) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };
function seriesFor(kind, seller) {
  const t = todayISO(), all = activeSales().filter(s => !seller || s.seller === seller);
  const inR = (a, b) => sum(all.filter(s => s.date >= a && s.date <= b), s => s.total);
  const win = (a, b) => inR(a, b);   // جمع فروش یک بازه (برای مقایسه با «بازه‌ی قبلی هم‌اندازه»)
  if (kind === 'day') return { sub: '۷ روز اخیر', prevTotal: win(addDaysISO(t, -13), addDaysISO(t, -7)), pts: Array.from({ length: 7 }, (_, k) => { const d = addDaysISO(t, -(6 - k)); return { label: WD[new Date(d + 'T00:00:00Z').getUTCDay()], cur: inR(d, d), prev: inR(addDaysISO(d, -7), addDaysISO(d, -7)) }; }) };
  if (kind === 'week') return { sub: '۸ هفته‌ی اخیر', prevTotal: win(addDaysISO(t, -111), addDaysISO(t, -56)), pts: Array.from({ length: 8 }, (_, k) => { const to = addDaysISO(t, -7 * (7 - k)), from = addDaysISO(to, -6), [, jm, jd] = toJ(to); return { label: `${jm}/${jd}`, cur: inR(from, to), prev: inR(addDaysISO(from, -7), addDaysISO(to, -7)) }; }) };
  const by = new Map(); for (const s of all) { const k = jmonthKey(s.date); by.set(k, (by.get(k) || 0) + s.total); }
  const JM = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const keys6 = lastMonths(6), back6 = k => { let x = k; for (let i = 0; i < 6; i++) x = prevMonthKey(x); return x; };
  return { sub: '۶ ماه اخیر', prevTotal: keys6.reduce((a, k) => a + (by.get(back6(k)) || 0), 0), pts: lastMonths(6).map(k => ({ label: JM[Number(k.split('-')[1]) - 1], cur: by.get(k) || 0, prev: by.get(prevMonthKey(k)) || 0 })) };
}
export function salesLineCard({ title = 'روند فروش', seller = null, note = '' } = {}) {
  let kind = 'month'; const host = h('section', { class: 'card lc', 'aria-label': title });
  const draw = () => {
    const { sub, pts, prevTotal } = seriesFor(kind, seller), n = pts.length, X0 = 30, X1 = 610, Y0 = 20, Y1 = 190;
    const mx = Math.max(1, ...pts.map(p => Math.max(p.cur, p.prev))) * 1.1;
    const pt = (v, i) => [X0 + i * ((X1 - X0) / Math.max(1, n - 1)), Y1 - (v / mx) * (Y1 - Y0)];
    const path = k => pts.map((p, i) => { const [x, y] = pt(p[k], i); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join(' ');
    const cur = sum(pts, p => p.cur), prev = prevTotal, d = prev > 0 ? Math.round((cur - prev) / prev * 100) : null;   // مقایسه‌ی کل بازه با بازه‌ی قبلیِ هم‌اندازه (نه جمع نقطه‌های جابه‌جاشده)
    const svg = sv('svg', { viewBox: '0 0 640 230', class: 'lc-svg', role: 'img', 'aria-label': `${title}: ${sub}، جمع ${money(cur)}` });
    svg.append(sv('path', { d: 'M0 40H640M0 90H640M0 140H640M0 190H640', stroke: 'var(--line)', 'stroke-width': '1', fill: 'none' }),
      sv('path', { d: path('cur') + ` L${X1} ${Y1} L${X0} ${Y1} Z`, fill: 'var(--gold)', 'fill-opacity': '.10' }),
      sv('path', { d: path('prev'), fill: 'none', stroke: 'var(--brown)', 'stroke-width': '2', 'stroke-dasharray': '6 5', 'stroke-linecap': 'round', opacity: '.7' }),
      sv('path', { d: path('cur'), fill: 'none', stroke: 'var(--gold)', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    pts.forEach((p, i) => { const [x, y] = pt(p.cur, i); svg.append(sv('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: '4.5', fill: '#fff', stroke: 'var(--gold)', 'stroke-width': '2.5' }), sv('text', { x: x.toFixed(1), y: '222', 'text-anchor': 'middle', class: 'cl' }, p.label)); });
    host.replaceChildren(h('div', { class: 'ct' }, title, h('small', null, ' ' + sub + (note ? ' · ' + note : ''))),
      chips([{ v: 'day', label: 'روز' }, { v: 'week', label: 'هفته' }, { v: 'month', label: 'ماه' }], kind, v => { kind = v; draw(); }, { label: 'بازه‌ی نمودار' }),
      h('div', { class: 'lc-tot' }, h('b', { class: 'n' }, money(cur)), d == null ? null : h('span', { class: 'delta ' + (d >= 0 ? 'pos' : 'neg') }, `${d >= 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}٪ نسبت به دوره‌ی قبل`)),
      svg, h('div', { class: 'lc-leg' }, h('span', null, h('i', { class: 'cur' }), 'این دوره'), h('span', null, h('i', { class: 'prv' }), 'دوره‌ی قبل')));
  };
  draw(); return host;
}

/* ---------- سهم دسته‌ها (دونات) ---------- */
export function donutCard() {
  const rows = categoryStats('month').filter(r => r.revenue > 0), tot = sum(rows, r => r.revenue);
  const COL = ['var(--gold)', '#5E2B4D', 'var(--lux)', 'var(--blue)', 'var(--green)', '#A8909C'];
  let parts = rows.slice().sort((a, b) => b.revenue - a.revenue).map(r => ({ name: r.cat, v: r.revenue }));
  if (parts.length > 5) parts = [...parts.slice(0, 5), { name: 'سایر', v: sum(parts.slice(5), p => p.v) }];
  const card = h('section', { class: 'card dn', 'aria-label': 'سهم دسته‌ها' }, h('div', { class: 'ct' }, 'سهم دسته‌ها از فروش ', h('small', null, '(این ماه)')));
  if (!tot) { card.append(h('div', { class: 'empty sm' }, 'این ماه هنوز فروشی نیست.')); return card; }
  let acc = 0; const svg = sv('svg', { viewBox: '0 0 42 42', class: 'dn-svg', role: 'img', 'aria-label': 'نمودار دایره‌ای سهم دسته‌ها' }, sv('circle', { cx: 21, cy: 21, r: 15.9155, fill: 'none', stroke: 'var(--tint)', 'stroke-width': 6 }));
  parts.forEach((p, i) => { const pc = p.v / tot * 100; svg.append(sv('circle', { cx: 21, cy: 21, r: 15.9155, fill: 'none', stroke: COL[i % COL.length], 'stroke-width': 6, 'stroke-dasharray': `${pc} ${100 - pc}`, 'stroke-dashoffset': String(-acc), transform: 'rotate(-90 21 21)' })); acc += pc; });
  svg.append(sv('text', { x: 21, y: 23, 'text-anchor': 'middle', class: 'dn-c' }, Math.round(parts[0].v / tot * 100).toLocaleString('en-US') + '٪'));
  card.append(h('div', { class: 'dn-body' }, svg, h('div', { class: 'dn-leg' }, parts.map((p, i) => h('div', { class: 'hc-leg' }, h('i', { style: { background: COL[i % COL.length] } }), h('span', null, p.name), h('b', { class: 'n' }, Math.round(p.v / tot * 100).toLocaleString('en-US') + '٪'))))));
  return card;
}

/* ---------- جریان رویدادها ---------- */
const ago = iso => { const n = Math.round((Date.parse(todayISO() + 'T00:00:00Z') - Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z')) / 864e5); return n <= 0 ? 'امروز' : n === 1 ? 'دیروز' : `${fmt(n)} روز پیش`; };
export function activityCard({ limit = 7, seller = null, title = 'جریان رویدادها' } = {}) {
  const items = [];
  for (const s of activeSales()) if (!seller || s.seller === seller) items.push({ date: s.date, id: s.id, ic: '＋', tone: 'g', title: `فروش به ${s.customer || 'بدون نام'}`, sub: `${s.no || ''}${s.seller ? ' · ' + s.seller : ''}`, amt: s.total });
  if (!seller) {
    for (const i of S.vInvoices) if (!i.voided) items.push({ date: i.date, id: i.id, ic: '↓', tone: 'p', title: `خرید از ${(S.SUP[i.supplier_id] || {}).name || 'تامین‌کننده'}`, sub: i.no || '', amt: i.total != null ? i.total : i.goods_total });
    for (const e of S.expenses) if (!e.voided) items.push({ date: e.date, id: e.id, ic: '−', tone: 'r', title: `هزینه: ${e.category}`, sub: e.note || '', amt: e.amount });
    for (const t of S.transfers) if (!t.voided && t.kind === 'capital') items.push({ date: t.date, id: t.id, ic: '⇄', tone: 'y', title: 'واریز سرمایه', sub: t.note || '', amt: t.amount });
  }
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.id || 0) - (a.id || 0)));
  const card = h('section', { class: 'card feed', 'aria-label': title }, h('div', { class: 'ct' }, title, h('a', { class: 'more', href: '#/history' }, 'همه‌ی تاریخچه ←')));
  if (!items.length) card.append(h('div', { class: 'empty sm' }, 'هنوز رویدادی ثبت نشده.'));
  items.slice(0, limit).forEach(x => card.append(h('div', { class: 'fe' }, h('span', { class: 'fi ' + x.tone, 'aria-hidden': 'true' }, x.ic), h('div', { class: 'ft' }, h('b', null, x.title), h('small', null, [x.sub, ago(x.date)].filter(Boolean).join(' · '))), x.amt != null ? h('b', { class: 'fa' }, N(x.amt)) : null)));
  return card;
}

/* ---------- خوشامد مدیر و شریک ---------- */
const fa = n => Number(n).toLocaleString('en-US');
export function adminHero() {
  const today = todayISO(), ts = activeSales().filter(s => s.date === today), cs = [];
  const due = S.cheques.filter(c => !c.voided && c.state === 'open' && c.days_left <= 2), bad = S.cheques.filter(c => !c.voided && c.state === 'bounced');
  if (bad.length) cs.push({ tone: 'bad', text: `${fa(bad.length)} چک برگشتی منتظر تسویه است`, href: '#/cheques' });
  if (due.length) cs.push({ tone: 'warn', text: `${fa(due.length)} چک تا ۲ روز دیگر سررسید دارد`, href: '#/cheques' });
  const od = sum(S.vCus || [], c => c.overdue_amount || 0); if (od > 0) cs.push({ tone: 'warn', text: `${money(od)} طلب از سررسید گذشته`, href: '#/customers' });
  const low = S.stock.filter(i => i.active && i.min_stock > 0 && i.rem <= i.min_stock); if (low.length) cs.push({ tone: 'warn', text: `${fa(low.length)} کالا رو به اتمام است`, href: '#/stock' });
  const T = S.totals || {}, diff = Math.abs((T.capital_m || 0) - (T.capital_r || 0)) / 2;
  if (diff > 1000) cs.push({ tone: 'warn', text: 'سرمایه‌ی مهسا و رعنا برابر نیست', href: '#/finance' }); else cs.push({ tone: 'ok', text: 'تعادل سرمایه برقرار است ✓' });
  const M = marginStatus(); if (M.has && M.below.length) cs.push({ tone: 'warn', text: `حاشیه‌ی سود ${M.below.slice(0, 2).map(i => i.cat).join(' و ')} زیر هدف است`, href: '#/analysis' });
  const need = cs.filter(c => c.tone === 'warn' || c.tone === 'bad').length;
  return heroCard({ name: (S.me && S.me.name) || '', headline: `امروز ${fa(ts.length)} فروش ثبت شده${need ? `؛ ${fa(need)} مورد نیاز به توجه تو دارد.` : '؛ مورد فوری نیست.'}`, chips: cs.slice(0, 6),
    stats: [{ l: 'فروش امروز', v: sum(ts, s => s.total) }, { l: 'سود امروز (تقریبی)', v: sum(ts, s => s.profit) }] });
}
export function partnerHero({ me, tasks, own, viewer }) {
  const today = todayISO(), ts = activeSales().filter(s => s.date === today && s.seller === me), cs = tasks.slice(0, 3).map(t => ({ tone: t.tone === 'red' ? 'bad' : t.tone === 'amber' ? 'warn' : 'info', text: t.text, href: t.href }));
  const T = S.totals || {}, diff = Math.abs((T.capital_m || 0) - (T.capital_r || 0)) / 2;
  cs.push(diff > 1000 ? { tone: 'warn', text: 'سرمایه‌ی مهسا و رعنا برابر نیست', href: '#/finance' } : { tone: 'ok', text: 'تعادل سرمایه‌ی تو و شریکت برقرار است ✓' });
  const need = tasks.length;
  return heroCard({ name: viewer ? me : (S.me && S.me.name) || me, sub: viewer ? 'نمای فقط‌مشاهده' : '', headline: `امروز ${fa(ts.length)} فروش ${viewer ? 'ثبت شده' : 'ثبت کردی'}.${need ? ` ${fa(need)} کار منتظر ${viewer ? me : 'توست'}.` : ' کار معوقی نیست.'}`, chips: cs,
    stats: [{ l: `فروش ${own}، امروز`, v: sum(ts, s => s.total) }, { l: `سود ${own}، امروز`, v: sum(ts, s => s.profit) }] });
}
