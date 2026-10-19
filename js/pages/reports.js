// گزارش‌های ماهانه: «صورت سود و زیان» (فقط مدیر) و «حساب‌وکتاب ماهانه‌ی شرکا» (مدیر و شریک‌ها)
// همه‌ی عددها را سرور از همان ویوهای حسابداری می‌سازد؛ این صفحه فقط نشان می‌دهد و قابل چاپ/ذخیره‌ی PDF است.
import { h, fmt, jmonthName, lastMonths, todayISO, jmonthKey, toast } from '../util.js';
import { S, api, errText } from '../store.js';
import { N, pill, kpi, dtable, run } from '../ui.js';
import { head, btn } from './common.js';

const cache = new Map();
async function load(month) {
  if (cache.has(month)) return cache.get(month);
  const r = await api('/api/report/month/?month=' + encodeURIComponent(month));
  cache.set(month, r.data); return r.data;
}
const prevKey = k => { let [y, m] = k.split('-').map(Number); m--; if (m < 1) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };
const delta = (cur, prev) => {
  if (!prev) return '';
  const p = Math.round((cur - prev) / Math.abs(prev) * 100);
  return h('span', { class: 'dlt ' + (p >= 0 ? 'up' : 'dn') }, (p >= 0 ? '▲ ' : '▼ ') + fmt(Math.abs(p)) + '٪');
};
const monthPicker = (cur, onPick) => {
  const keys = lastMonths(12).reverse();
  const s = h('select', { class: 'sel no-print', 'aria-label': 'ماه' }, keys.map(k => h('option', { value: k, selected: k === cur }, jmonthName(k))));
  s.onchange = () => onPick(s.value); return s;
};
const wrapPage = (title, sub, month, onPick, extraActs, body) => h('div', { class: 'rep' },
  head(title, [monthPicker(month, onPick), ...extraActs, btn('🖨 چاپ / ذخیره‌ی PDF', () => window.print(), 'ghost')], sub), body);

/* ================= صورت سود و زیان ================= */
export function pnlPage() {
  let month = jmonthKey(todayISO());
  const box = h('div', null, h('div', { class: 'empty' }, 'در حال ساخت گزارش…'));
  const root = h('div');
  const draw = async () => {
    box.replaceChildren(h('div', { class: 'empty' }, 'در حال ساخت گزارش…'));
    let d; try { d = await load(month); } catch (e) { box.replaceChildren(h('div', { class: 'card' }, h('p', null, errText(e)))); return; }
    const p = d.pnl, q = d.prev, s = d.settlement;
    const row = (label, cur, prev, { sign = '', bold = false, sub = false, neg = false } = {}) => ({ label, cur, prev, sign, bold, sub, neg });
    const lines = [
      row('فروش ناخالص (جمع قیمت اقلام)', p.gross, q.gross), row('تخفیف فاکتورها', -p.discount, -q.discount, { sign: '−' }),
      row('فروش خالص', p.revenue, q.revenue, { bold: true, sign: '=' }),
      row('بهای تمام‌شده‌ی کالای فروخته‌شده', -p.cogs, -q.cogs, { sign: '−' }),
      row('سود ناخالص', p.gross_profit, q.gross_profit, { bold: true, sign: '=' }),
      row('هزینه‌ی پیک', -p.courier, -q.courier, { sign: '−' }), row('هزینه‌ی بسته‌بندی', -p.pack, -q.pack, { sign: '−' }),
      row('هزینه‌های عمومی', -p.expenses_total, -q.expenses_total, { sign: '−' }),
      ...p.expenses.map(e => row('· ' + e.category, -e.amount, -((q.expenses.find(x => x.category === e.category) || {}).amount || 0), { sub: true })),
      ...(Math.abs(p.returns_effect) >= 1 || Math.abs(q.returns_effect) >= 1 ? [row('اثر مرجوعی‌ها', p.returns_effect, q.returns_effect, { sign: '±' })] : []),
      row('سود خالص ماه', p.net_profit, q.net_profit, { bold: true, sign: '=' })
    ];
    box.replaceChildren(...[
      d.locked ? h('div', { class: 'alert info' }, '🔒 این ماه بسته شده است؛ عددهای آن دیگر تغییر نمی‌کند.') : null,
      p.nameless.count ? h('div', { class: 'alert warn' }, `⚠️ ${fmt(p.nameless.count)} فاکتور بدون نام خریدار (${fmt(p.nameless.total)} ریال) هست؛ اسم خریدار را در «فاکتور فروش» ثبت کن.`) : null,
      h('div', { class: 'kpis' },
        kpi('فروش خالص', N(p.revenue), { sub: jmonthName(month) }), kpi('سود ناخالص', N(p.gross_profit), { sub: p.revenue ? fmt(Math.round(p.gross_profit / p.revenue * 100)) + '٪ فروش' : '' }),
        kpi('سود خالص', N(p.net_profit, p.net_profit < 0 ? 'neg' : 'pos'), { tone: p.net_profit < 0 ? 'neg' : 'ok', sub: p.margin_pct == null ? '' : 'حاشیه ' + fmt(Math.round(p.margin_pct)) + '٪' }),
        kpi('سهم هر شریک (۵۰٪)', N(s.half), { sub: 'مهسا و رعنا' })),
      h('h3', { class: 'sec' }, `صورت سود و زیان ${jmonthName(month)}`),
      dtable([
        { label: 'بند', main: true, render: r => h('span', { class: (r.bold ? 'b ' : '') + (r.sub ? 'subl' : '') }, r.sign ? h('span', { class: 'sg' }, r.sign + ' ') : null, r.label) },
        { label: jmonthName(month), cls: 'num', render: r => h('span', { class: r.bold ? 'b' : '' }, N(r.cur, r.bold && r.cur > 0 ? 'pos' : '')) },
        { label: jmonthName(prevKey(month)), cls: 'num', hm: true, render: r => (r.prev ? N(r.prev) : '—') },
        { label: 'تغییر', cls: 'num', hm: true, render: r => (r.sub ? '' : delta(r.cur, r.prev)) }
      ], lines, { empty: 'در این ماه ثبتی نیست' }),
      h('h3', { class: 'sec' }, 'به تفکیک فروشنده'),
      dtable([{ label: 'فروشنده', main: true, render: r => r.seller }, { label: 'فاکتور', cls: 'num', render: r => fmt(r.count) }, { label: 'فروش', cls: 'num', render: r => N(r.revenue) },
        { label: 'سود (قبل از هزینه‌های عمومی)', cls: 'num', render: r => N(r.profit, r.profit < 0 ? 'neg' : 'pos') }], p.by_seller, { empty: 'فروشی ثبت نشده' }),
      h('h3', { class: 'sec' }, 'به تفکیک محل فروش'),
      dtable([{ label: 'محل', main: true, render: r => r.channel }, { label: 'فاکتور', cls: 'num', render: r => fmt(r.count) }, { label: 'فروش', cls: 'num', render: r => N(r.revenue) },
        { label: 'سهم', cls: 'num', render: r => (p.revenue ? fmt(Math.round(r.revenue / (p.revenue + p.discount) * 100)) + '٪' : '') }], p.by_channel, { empty: 'فروشی ثبت نشده' }),
      h('h3', { class: 'sec' }, 'پرسودترین کالاها'),
      dtable([{ label: 'کالا', main: true, render: r => r.name }, { label: 'تعداد', cls: 'num', render: r => fmt(r.qty) }, { label: 'فروش', cls: 'num', render: r => N(r.revenue) },
        { label: 'سود', cls: 'num', render: r => N(r.profit, r.profit < 0 ? 'neg' : 'pos') }], p.top_items, { empty: 'فروشی ثبت نشده' }),
      h('h3', { class: 'sec' }, 'خرید و وصول در همین ماه'),
      h('div', { class: 'kpis' }, kpi('خرید از تامین‌کننده', N(p.purchases.goods), { sub: fmt(p.purchases.count) + ' فاکتور خرید' }), kpi('پرداخت به تامین‌کننده', N(p.purchases.paid_to_suppliers)),
        kpi('دریافت نسیه از مشتری‌ها', N(p.collections)), kpi('میانگین هر فاکتور فروش', N(Math.round(p.avg_invoice)))),
      h('p', { class: 'hint' }, 'سود خالص = فروش خالص − بهای تمام‌شده − پیک و بسته‌بندی − هزینه‌ها ± مرجوعی. جمع سود همه‌ی ماه‌ها دقیقاً با «سود کل» صفحه‌ی مالی برابر است.')].filter(Boolean));
  };
  const rebuild = () => { root.replaceChildren(wrapPage('صورت سود و زیان ماهانه', 'فقط برای مدیر. مقایسه با ماه قبل، فروشنده، محل فروش و پرسودترین کالاها.', month, v => { month = v; rebuild(); }, [sendBtn(() => month)], box)); draw(); };
  rebuild(); return root;
}

const sendBtn = getMonth => {
  if (!(S.me && S.me.role === 'admin')) return null;
  const b = h('button', { type: 'button', class: 'btn ghost no-print' }, '📨 ارسال در ربات');
  b.onclick = () => run(b, async () => { const r = await api('/api/report/month/send/', { method: 'POST', body: { month: getMonth() } }); const n = (r.data.sent || []).filter(x => x.ok).length; toast(n ? `گزارش برای ${fmt(n)} پیام ارسال شد` : 'ارسال نشد؛ ربات به حساب‌ها وصل نیست'); return r; });
  return b;
};

/* ================= حساب‌وکتاب ماهانه‌ی شرکا ================= */
export function settlePage() {
  let month = jmonthKey(todayISO());
  const box = h('div', null, h('div', { class: 'empty' }, 'در حال ساخت گزارش…'));
  const root = h('div');
  const draw = async () => {
    box.replaceChildren(h('div', { class: 'empty' }, 'در حال ساخت گزارش…'));
    let d; try { d = await load(month); } catch (e) { box.replaceChildren(h('div', { class: 'card' }, h('p', null, errText(e)))); return; }
    const s = d.settlement, P = s.people;
    const cell = (label, fn, tone) => ({ label, fn, tone });
    const rows = [
      ['فروش این ماه', x => N(x.sales_total)], ['تعداد فاکتور این ماه', x => fmt(x.sales_count)], ['سهم از سود خالص این ماه (۵۰٪)', x => N(x.profit_share, x.profit_share < 0 ? 'neg' : 'pos')],
      ['سرمایه‌ی وارد‌شده تا امروز', x => N(x.capital)], ['پول نقد و بانک دست او', x => N(x.cash + x.bank)], ['جنس دست او (قیمت تمام‌شده)', x => N(x.stock_value)],
      ['جیب شخصی (مانده)', x => N(x.pocket)], ['سهم او از سود کل تا امروز', x => N(x.profit_share_total)], ['برداشت سود این ماه', x => N(x.payout_month)], ['برداشت سود تا امروز', x => N(x.payout_total)]
    ].map(([label, fn]) => ({ label, a: fn(P[0]), b: fn(P[1]) }));
    box.replaceChildren(...[
      d.locked ? h('div', { class: 'alert info' }, '🔒 این ماه بسته شده است.') : null,
      h('div', { class: 'kpis' }, kpi('سود خالص ' + jmonthName(month), N(s.net_profit, s.net_profit < 0 ? 'neg' : 'pos')), kpi('سهم هر نفر (۵۰٪)', N(s.half)),
        kpi('ارزش خالص کسب‌وکار', N(s.net_worth), { sub: 'نقد و بانک + انبار + طلب − بدهی' }), kpi('اختلاف سرمایه‌ی دو نفر', N(Math.abs(s.capital_diff)), { tone: Math.abs(s.capital_diff) > 1000 ? 'warn' : 'ok' })),
      s.equalize
        ? h('div', { class: 'alert warn' }, `⚖️ برای برابر شدن سرمایه: ${s.equalize.from} مبلغ ${fmt(Math.round(s.equalize.amount / 10))} تومان (${fmt(Math.round(s.equalize.amount))} ریال) به حساب شخصی ${s.equalize.to} واریز کند و بعد در «مالی › انتقال سرمایه» ثبت شود.`)
        : h('div', { class: 'alert ok' }, '⚖️ سرمایه‌ی مهسا و رعنا برابر است.'),
      h('h3', { class: 'sec' }, `حساب‌وکتاب ${jmonthName(month)}`),
      dtable([{ label: 'بند', main: true, render: r => r.label }, { label: P[0].name, cls: 'num', render: r => r.a }, { label: P[1].name, cls: 'num', render: r => r.b }], rows),
      h('div', { class: 'alert info' }, 'ℹ️ برداشت سود فعلاً بسته است تا کسب‌وکار قوی شود؛ سهم سود هر نفر در کسب‌وکار می‌ماند و جزو سرمایه‌ی او حساب می‌شود.'),
      h('p', { class: 'hint' }, 'سرمایه، نقد، جنس و جیب‌ها «وضعیت امروز» هستند؛ فروش و سود، مربوط به همین ماه‌اند. هر شب گزارش روزانه و در آخر هر ماه این گزارش در ربات می‌آید.')].filter(Boolean));
  };
  const rebuild = () => { root.replaceChildren(wrapPage('حساب‌وکتاب ماهانه', 'سهم سود، سرمایه، جنس و پول دست مهسا و رعنا و مبلغ برابرسازی سرمایه.', month, v => { month = v; rebuild(); }, [sendBtn(() => month)], box)); draw(); };
  rebuild(); return root;
}
