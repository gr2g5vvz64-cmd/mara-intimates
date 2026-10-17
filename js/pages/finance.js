import { h, fmt, jstr, jmonthName, sum } from '../util.js';
import { S, businessAccounts, pockets, accBalance, monthly } from '../store.js';
import { dtable, N, pill, kpi } from '../ui.js';
import { transferForm, collectionForm, supplierPaymentForm, dayCloseForm } from '../forms_misc.js';
import { dayCloseOpen, negativeAccounts } from '../insights.js';
import { head, btn } from './common.js';

export function render() {
  const T = S.totals; const biz = businessAccounts(), pk = pockets();
  const capM = T.capital_m || 0, capR = T.capital_r || 0, capT = capM + capR, profit = T.profit || 0;
  const sh = (c) => (capT > 0 ? c / capT : 0);
  const part = (name, cap, payout, pocketId) => ({ name, cap, share: sh(cap), suggest: profit * sh(cap), payout, left: profit * sh(cap) - payout, pocketId });
  const rows = [part('مهسا', capM, T.payout_m || 0, pk.find(a => a.owner === 'مهسا')), part('رعنا', capR, T.payout_r || 0, pk.find(a => a.owner === 'رعنا'))];
  const ok = Math.abs(T.check_diff || 0) <= 1;
  const R = (k, v, c = '') => h('div', { class: 'srow ' + c }, h('span', null, k), N(v));
  const debts = S.vSales.filter(s => !s.voided && s.outstanding > 0);
  return h('div', null,
    head('مالی و سرمایه', [btn('بستن روز', () => dayCloseForm()), btn('انتقال / برداشت سود', () => transferForm({ kind: 'transfer' })), btn('دریافت نسیه', () => collectionForm(), 'ghost')], 'سود کل کسب‌وکار از روی فروش حساب می‌شود و به میزان سرمایه ربطی ندارد؛ سهم‌ها فقط پیشنهاد است.'),
    dayCloseOpen() ? h('div', { class: 'alert warn' }, 'امروز هنوز بسته نشده؛ موجودی نقد و بانک را بشمار و «بستن روز» را بزن.') : null,
    negativeAccounts().length ? h('div', { class: 'alert red' }, 'مانده‌ی این حساب‌ها منفی است: ' + negativeAccounts().map(a => a.name).join('، ') + ' — احتمالاً ثبتی با حساب اشتباه یا دریافتی ثبت‌نشده داریم.') : null,
    h('div', { class: 'kpis' }, kpi('سود کل', N(profit), { tone: profit < 0 ? 'neg' : 'pos' }), kpi('جمع حساب‌های کسب‌وکار', N(T.business_balance)), kpi('ارزش موجودی', N(T.stock_value)), kpi('ارزش خالص', N(T.net_worth), { sub: 'حساب‌ها + موجودی + طلب − بدهی' })),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('div', { class: 'ct' }, 'حساب‌ها'),
        h('div', { class: 'accs' }, biz.map(a => h('div', { class: 'acc' }, h('span', null, a.name), N(accBalance(a.id))))),
        h('div', { class: 'srow bold' }, h('span', null, 'جمع'), N(T.business_balance)),
        h('div', { class: 'ct sub2' }, 'جیب‌های شخصی ', h('small', null, '(منفی = پولی که خودشان در کسب‌وکار گذاشته‌اند)')),
        h('div', { class: 'accs' }, pk.map(a => h('div', { class: 'acc' }, h('span', null, a.name), N(accBalance(a.id)))))),
      h('div', { class: 'card' }, h('div', { class: 'ct' }, 'سود چطور ساخته شد'),
        R('جمع فروش', T.revenue), R('− بهای تمام‌شده‌ی کالاهای فروخته‌شده', -T.cogs), R('− پیک و بسته‌بندی فروش‌ها', -T.sale_costs), R('− هزینه‌ها', -T.expenses), R('± مرجوعی‌ها', T.returns_effect), R('سود کل', profit, 'bold'),
        h('div', { class: 'checkline ' + (ok ? 'ok' : 'bad') }, ok ? '✓ کنترل حسابداری: ارزش خالص − سرمایه + برداشت‌ها = سود. اختلاف صفر است.' : `⚠ اختلاف کنترلی: ${fmt(T.check_diff)} ریال. با حمیدرضا تماس بگیر.`))),
    h('h3', { class: 'sec' }, 'سرمایه و سهم پیشنهادی از سود'),
    dtable([
      { label: 'نفر', main: true, render: r => r.name }, { label: 'سرمایه‌ی گذاشته‌شده', cls: 'num', render: r => N(r.cap) }, { label: 'سهم از سرمایه', cls: 'num', render: r => h('span', { class: 'n' }, capT > 0 ? (r.share * 100).toFixed(1) + '%' : '') },
      { label: 'سهم پیشنهادی از سود', cls: 'num', render: r => N(r.suggest) }, { label: 'برداشت‌شده تا حالا', cls: 'num', render: r => N(r.payout) }, { label: 'باقی‌مانده برای برداشت', cls: 'num', render: r => N(r.left) },
      { label: '', render: r => btn('ثبت برداشت', () => transferForm({ kind: 'profit_payout', to: r.pocketId && r.pocketId.id }), 'ghost sm') }
    ], rows, { empty: '' }),
    h('p', { class: 'hint' }, 'سرمایه = پولی که هر نفر از جیب شخصی‌اش در کسب‌وکار گذاشته (خرید، حمل یا انتقال)، منهای آنچه پس گرفته. سود بین دو نفر به نسبت سرمایه پیشنهاد می‌شود؛ اگر بخواهید برابر تقسیم کنید، هر نفر نصف سود است: ' + fmt(profit / 2) + ' ریال.'),
    h('h3', { class: 'sec' }, 'مشتری‌های بدهکار (نسیه)'),
    dtable([{ label: 'فروش', main: true, render: s => s.no }, { label: 'تاریخ', render: s => jstr(s.date) }, { label: 'مشتری', render: s => s.customer || '' }, { label: 'کالاها', hm: true, render: s => s.items_text }, { label: 'مانده', cls: 'num', render: s => N(s.outstanding) }, { label: '', render: s => btn('دریافت', () => collectionForm(s.id), 'gold sm') }], debts, { empty: 'مشتری بدهکاری وجود ندارد' }),
    h('h3', { class: 'sec' }, 'حساب با تامین‌کنندگان'),
    dtable([{ label: 'تامین‌کننده', main: true, render: s => s.name }, { label: 'وضعیت', cls: 'num', render: s => (s.balance > 0 ? pill('بدهکاریم ' + fmt(s.balance), 'amber') : s.balance < 0 ? pill('طلبکاریم ' + fmt(-s.balance), 'blue') : pill('تسویه', 'green')) }, { label: '', render: s => (s.balance > 0 ? btn('پرداخت', () => supplierPaymentForm({ supplier_id: s.id }), 'gold sm') : '') }], S.vSup.filter(s => s.goods || s.paid), { empty: 'هنوز خریدی نیست' }),
    h('h3', { class: 'sec' }, 'بستن روزها (شمارش واقعی در برابر سیستم)'),
    dtable([{ label: 'تاریخ', main: true, render: c => jstr(c.date) }, { label: 'حساب', render: c => (S.A[c.account_id] || {}).name || '' }, { label: 'سیستم', cls: 'num', render: c => N(c.system_balance) }, { label: 'شمارش‌شده', cls: 'num', render: c => N(c.counted) },
      { label: 'اختلاف', cls: 'num', render: c => (Math.round(c.diff) === 0 ? pill('می‌خواند ✓', 'green') : pill((c.diff > 0 ? 'اضافه ' : 'کمبود ') + fmt(Math.abs(c.diff)), c.diff > 0 ? 'blue' : 'red')) }, { label: 'ثبت‌کننده', hm: true, render: c => c.created_by || '' }, { label: 'یادداشت', hm: true, render: c => c.note || '' }],
      S.dayCloses.slice().sort((a, b) => b.id - a.id).slice(0, 30), { empty: 'هنوز روزی بسته نشده؛ دکمه‌ی «بستن روز» بالای صفحه است.' }),
    h('h3', { class: 'sec' }, 'ماه به ماه'),
    dtable([{ label: 'ماه', main: true, render: m => jmonthName(m.key) }, { label: 'تعداد فروش', cls: 'num', render: m => m.count }, { label: 'فروش', cls: 'num', render: m => N(m.sales) }, { label: 'هزینه‌ها', cls: 'num', render: m => N(m.expenses) }, { label: 'سود', cls: 'num', render: m => N(m.profit, m.profit < 0 ? 'neg' : 'pos') }], monthly().reverse(), { empty: 'هنوز داده‌ای نیست' }));
}
