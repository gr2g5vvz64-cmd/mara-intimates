// تطبیق انبار (فقط مدیر ۷.۶۸): برای هر کالا از روی «ثبت‌ها» حساب می‌کند چقدر خریده‌ایم، فروخته‌ایم و باید مانده باشد
// و با «مانده‌ی ثبت‌شده» مقایسه می‌کند. اگر برابر بود یعنی دفتر با خودش هماهنگ است و اختلاف با واقعیتِ قفسه فقط از ثبت‌نشدن/اشتباه‌ثبت‌شدن می‌آید.
import { h, jmonthKey, todayISO } from '../util.js';
import { S, catOf } from '../store.js';
import { N, dtable, kpi, pill } from '../ui.js';
import { head } from './common.js';

export function audit() {
  const mk = jmonthKey(todayISO()), by = new Map();
  const get = id => by.get(id) || by.set(id, { id, bought: 0, sold: 0, soldMonth: 0, retOk: 0, supRet: 0, rem: 0 }).get(id);
  const lotItem = new Map();
  for (const l of S.lots || []) { if (l.voided) continue; lotItem.set(l.id, l.item_id); const o = get(l.item_id); o.bought += l.qty; o.rem += (l.rem_m || 0) + (l.rem_r || 0); }
  for (const l of S.saleLines || []) {
    const sl = S.SALE[l.sale_id]; if (!sl || sl.voided) continue;
    const o = get(l.item_id); o.sold += l.qty; if (jmonthKey(sl.date) === mk) o.soldMonth += Math.max(0, l.qty - (l.returned_qty || 0));
  }
  const saleOk = new Set((S.saleLines || []).filter(l => S.SALE[l.sale_id] && !S.SALE[l.sale_id].voided).map(l => l.id));
  for (const r of S.returns || []) {
    if (r.voided) continue; const o = get(r.item_id);
    if (r.kind === 'supplier') o.supRet += r.qty;
    else if (r.condition === 'سالم' && !r.to_supplier && saleOk.has(r.sale_line_id)) o.retOk += r.qty;
  }
  return [...by.values()].map(o => {
    const it = S.I[o.id] || {}, exp = o.bought - o.sold + o.retOk - o.supRet;
    return { ...o, name: it.name || '#' + o.id, cat: catOf(it), expected: exp, diff: o.rem - exp };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.cat.localeCompare(b.cat, 'fa') || a.name.localeCompare(b.name, 'fa'));
}

export function render() {
  const rows = audit(), bad = rows.filter(r => r.diff !== 0);
  const tot = k => rows.reduce((s, r) => s + r[k], 0);
  return h('div', null,
    head('تطبیق انبار', [], 'هر کالا را از روی ثبت‌ها دوباره می‌شماریم: خریده‌ایم − فروخته‌ایم + برگشتیِ سالم − برگشت به تامین‌کننده = باید مانده باشد'),
    h('div', { class: 'kpis' },
      kpi('کالاهای ناهماهنگ', N(bad.length), { tone: bad.length ? 'warn' : '', sub: bad.length ? 'مانده‌ی ثبت‌شده با حساب ثبت‌ها نمی‌خواند' : 'همه‌ی کالاها با ثبت‌ها می‌خوانند' }),
      kpi('جمع خریده‌ایم', N(tot('bought'))), kpi('جمع فروخته‌ایم', N(tot('sold'))), kpi('جمع مانده‌ی ثبت‌شده', N(tot('rem')))),
    h('div', { class: 'card' },
      h('p', { class: 'hint' }, bad.length
        ? 'اختلاف ≠ ۰ یعنی مانده‌ی انبار با خرید و فروش ثبت‌شده نمی‌خواند (مثلاً فروش یا خریدی ثبت/ویرایش نشده). بالای جدول، بیشترین اختلاف‌هاست.'
        : 'دفتر با خودش هماهنگ است. اگر قفسه‌ی واقعی فرق دارد، یعنی خرید یا فروشی ثبت نشده یا اشتباه ثبت شده؛ با «شمارش انبار» موجودی واقعی را بشمار و مقایسه کن.'),
      dtable([
        { label: 'کالا', main: true, render: r => r.name }, { label: 'دسته', hm: true, render: r => r.cat },
        { label: 'خریده', cls: 'num', render: r => N(r.bought) }, { label: 'فروخته (کل)', cls: 'num', render: r => N(r.sold) },
        { label: 'فروخته‌ی این ماه', cls: 'num', hm: true, render: r => N(r.soldMonth) },
        { label: 'برگشتیِ سالم', cls: 'num', hm: true, render: r => N(r.retOk) }, { label: 'به تامین‌کننده', cls: 'num', hm: true, render: r => N(r.supRet) },
        { label: 'مانده‌ی ثبت‌شده', cls: 'num', render: r => N(r.rem) }, { label: 'مانده‌ی حساب‌شده', cls: 'num', render: r => N(r.expected) },
        { label: 'اختلاف', cls: 'num', render: r => r.diff ? pill((r.diff > 0 ? '+' : '') + r.diff, 'red') : pill('✓', 'green') },
      ], rows, { empty: 'کالایی ثبت نشده است' })));
}
