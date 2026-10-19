import { h, fmt, jstr, jmonthName, sum, lastMonths, fromJ, jMonthLen, jmonthKey, toast } from '../util.js';
import { S, businessAccounts, pockets, accBalance, monthly, rpc, bus, errText } from '../store.js';
import { dtable, N, pill, kpi, confirmBox, promptBox } from '../ui.js';
import { transferForm, capitalForm, collectionForm, dayCloseForm } from '../forms_misc.js';
import { dayCloseOpen, negativeAccounts } from '../insights.js';
import { ex } from '../explain.js';
import { head, btn } from './common.js';

export function render() {
  const T = S.totals; const biz = businessAccounts(), pk = pockets();
  const capM = T.capital_m || 0, capR = T.capital_r || 0, capT = capM + capR, profit = T.profit || 0;
  const sh = (c) => (capT > 0 ? c / capT : 0);
  // سود بین مهسا و رعنا همیشه برابر (۵۰–۵۰) است؛ سرمایه فقط برای برابر کردن پول گذاشته‌شده است.
  const part = (name, cap, payout, pocketId) => ({ name, cap, share: sh(cap), suggest: profit / 2, payout, left: profit / 2 - payout, pocketId });
  const capDiff = capM - capR, hiName = capDiff > 0 ? 'مهسا' : 'رعنا', loName = capDiff > 0 ? 'رعنا' : 'مهسا', eqAmt = Math.abs(capDiff) / 2;
  const rows = [part('مهسا', capM, T.payout_m || 0, pk.find(a => a.owner === 'مهسا')), part('رعنا', capR, T.payout_r || 0, pk.find(a => a.owner === 'رعنا'))];
  const ok = Math.abs(T.check_diff || 0) <= 1;
  const R = (k, v, c = '', key = '') => h('div', { class: 'srow ' + c }, h('span', null, k), key ? ex(N(v), key) : N(v));
  return h('div', null,
    head('مالی و سرمایه', [btn('بستن روز', () => dayCloseForm()), btn('انتقال / برداشت سود', () => transferForm({ kind: 'transfer' })), btn('انتقال سرمایه', () => capitalForm(), 'ghost'), ...(S.me.role === 'admin' ? [btn('🔍 تحلیل', () => { location.hash = '#/analysis'; }, 'ghost')] : []), btn('دریافت نسیه', () => collectionForm(), 'ghost')], 'سود بین مهسا و رعنا برابر (نصف–نصف) تقسیم می‌شود. روی هر عدد بزنی (مدیر) محاسبه‌اش را می‌بینی.'),
    dayCloseOpen() ? h('div', { class: 'alert warn' }, 'امروز هنوز بسته نشده؛ موجودی نقد و بانک را بشمار و «بستن روز» را بزن.') : null,
    negativeAccounts().length ? h('div', { class: 'alert red' }, 'مانده‌ی این حساب‌ها منفی است: ' + negativeAccounts().map(a => a.name).join('، ') + ' — احتمالاً ثبتی با حساب اشتباه یا دریافتی ثبت‌نشده داریم.') : null,
    eqAmt > 1000 ? h('div', { class: 'alert warn' }, `سرمایه‌ی وارد‌شده برابر نیست: ${hiName} ${fmt(Math.max(capM, capR))} ریال و ${loName} ${fmt(Math.min(capM, capR))} ریال. برای برابر شدن، ${loName} باید ${fmt(Math.round(eqAmt / 10))} تومان (${fmt(Math.round(eqAmt))} ریال) به حساب شخصی ${hiName} واریز کند و بعد «انتقال سرمایه» ثبت شود.`) : null,
    h('div', { class: 'kpis' }, kpi('سود کل', ex(N(profit), 'profit'), { tone: profit < 0 ? 'neg' : 'pos' }), kpi('مانده حساب‌ها', ex(N(T.business_balance), 'business_balance')), kpi('ارزش موجودی انبار', ex(N(T.stock_value), 'stock_value')), kpi('کل دارایی کسب‌وکار', ex(N(T.net_worth), 'net_worth'), { sub: 'حساب‌ها + موجودی + طلب − بدهی' })),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('div', { class: 'ct' }, 'حساب‌ها'),
        h('div', { class: 'accs' }, biz.map(a => h('div', { class: 'acc' }, h('span', null, a.name), ex(N(accBalance(a.id)), 'acc', a.id)))),
        h('div', { class: 'srow bold' }, h('span', null, 'جمع'), ex(N(T.business_balance), 'business_balance')),
        h('div', { class: 'ct sub2' }, 'سرمایه‌ی شرکا ', h('small', null, '(پولی که هر نفر از جیب خودش در کسب‌وکار گذاشته)')),
        h('div', { class: 'accs' }, h('div', { class: 'acc' }, h('span', null, 'سرمایه‌ی مهسا'), ex(N(capM), 'capital', 'm')), h('div', { class: 'acc' }, h('span', null, 'سرمایه‌ی رعنا'), ex(N(capR), 'capital', 'r'))),
        h('div', { class: 'srow bold' }, h('span', null, 'جمع سرمایه'), ex(N(capT), 'capital_total')),
        h('div', { style: 'margin-top:10px' }, btn('انتقال سرمایه بین مهسا و رعنا', () => capitalForm(), 'ghost sm'))),
      h('div', { class: 'card' }, h('div', { class: 'ct' }, 'سود چطور ساخته شد'),
        R('جمع فروش', T.revenue, '', 'revenue'), R('− بهای تمام‌شده‌ی کالاهای فروخته‌شده', -T.cogs, '', 'cogs'), R('− پیک و بسته‌بندی فروش‌ها', -T.sale_costs, '', 'sale_costs'), R('− هزینه‌ها', -T.expenses, '', 'expenses'), R('± مرجوعی‌ها', T.returns_effect, '', 'returns'), R('سود کل', profit, 'bold', 'profit'),
        h('div', { class: 'checkline xpchk ' + (ok ? 'ok' : 'bad') }, ok ? '✓ کنترل حسابداری: کل دارایی − سرمایه + برداشت‌ها = سود. اختلاف صفر است.' : `⚠ اختلاف کنترلی: ${fmt(T.check_diff)} ریال. با حمیدرضا تماس بگیر.`))),
    h('h3', { class: 'sec' }, 'سرمایه و سهم از سود (برابر)'),
    dtable([
      { label: 'نفر', main: true, render: r => r.name }, { label: 'سرمایه‌ی گذاشته‌شده', cls: 'num', render: r => N(r.cap) }, { label: 'سهم از سرمایه', cls: 'num', render: r => h('span', { class: 'n' }, capT > 0 ? (r.share * 100).toFixed(1) + '%' : '') },
      { label: 'سهم از سود (برابر ۵۰٪)', cls: 'num', render: r => ex(N(r.suggest), 'share', r) }, { label: 'برداشت‌شده تا حالا', cls: 'num', render: r => ex(N(r.payout), 'share', r) }, { label: 'باقی‌مانده برای برداشت', cls: 'num', render: r => ex(N(r.left), 'share', r) },
      { label: '', render: r => btn('ثبت برداشت', () => transferForm({ kind: 'profit_payout', to: r.pocketId && r.pocketId.id }), 'ghost sm') }
    ], rows, { empty: '' }),
    h('p', { class: 'hint' }, 'سرمایه = پولی که هر نفر از جیب شخصی‌اش در کسب‌وکار گذاشته، منهای آنچه پس گرفته. سود همیشه برابر تقسیم می‌شود: سهم هر نفر ' + fmt(profit / 2) + ' ریال. اگر یکی بیشتر سرمایه گذاشته باشد، نفر دیگر با واریز نصفِ تفاوت به حساب شخصی او سرمایه را برابر می‌کند.'),
    h('h3', { class: 'sec' }, 'بستن روزها (شمارش واقعی در برابر سیستم)'),
    dtable([{ label: 'تاریخ', main: true, render: c => jstr(c.date) }, { label: 'حساب', render: c => (S.A[c.account_id] || {}).name || '' }, { label: 'سیستم', cls: 'num', render: c => N(c.system_balance) }, { label: 'شمارش‌شده', cls: 'num', render: c => N(c.counted) },
      { label: 'اختلاف', cls: 'num', render: c => (Math.round(c.diff) === 0 ? pill('می‌خواند ✓', 'green') : pill((c.diff > 0 ? 'اضافه ' : 'کمبود ') + fmt(Math.abs(c.diff)), c.diff > 0 ? 'blue' : 'red')) }, { label: 'ثبت‌کننده', hm: true, render: c => c.created_by || '' }, { label: 'یادداشت', hm: true, render: c => c.note || '' }],
      S.dayCloses.slice().sort((a, b) => b.id - a.id).slice(0, 30), { empty: 'هنوز روزی بسته نشده؛ دکمه‌ی «بستن روز» بالای صفحه است.' }),
    ...lockSection(),
    h('h3', { class: 'sec' }, 'ماه به ماه'),
    dtable([{ label: 'ماه', main: true, render: m => jmonthName(m.key) }, { label: 'تعداد فروش', cls: 'num', render: m => m.count }, { label: 'فروش', cls: 'num', render: m => N(m.sales) }, { label: 'هزینه‌ها', cls: 'num', render: m => N(m.expenses) }, { label: 'سود', cls: 'num', render: m => N(m.profit, m.profit < 0 ? 'neg' : 'pos') }], monthly().reverse(), { empty: 'هنوز داده‌ای نیست' }));
}


/* ---------- قفل پایان ماه: ماهِ بسته‌شده دیگر ثبت، ویرایش یا ابطال نمی‌پذیرد؛ بازکردنش فقط با مدیر و با دلیل ---------- */
function lockSection() {
  const admin = !!(S.me && S.me.role === 'admin');
  const locks = Object.fromEntries((S.periodLocks || []).filter(l => l.active).map(l => [l.label, l]));
  const keys = lastMonths(13).slice(0, -1).reverse();   // ماه‌های تمام‌شده (ماه جاری را نمی‌شود بست)
  const span = k => { const [jy, jm] = k.split('-').map(Number); return [fromJ(jy, jm, 1), fromJ(jy, jm, jMonthLen(jy, jm))]; };
  const doLock = async k => {
    const [a, b] = span(k); const nameless = S.vSales.filter(x => !x.voided && !x.customer_id && x.date >= a && x.date <= b).length;
    const msg = `ماه «${jmonthName(k)}» بسته شود؟ بعد از بستن، ثبت و ویرایش و ابطال در این ماه ممکن نیست مگر اینکه مدیر آن را دوباره باز کند.` + (nameless ? ` ⚠️ ${fmt(nameless)} فاکتور فروش این ماه هنوز بدون نام خریدار است؛ بهتر است اول نامشان را ثبت کنی.` : '');
    if (!(await confirmBox(msg, 'ماه را ببند'))) return;
    try { await rpc('lock_month', { label: k, title: jmonthName(k), d_from: a, d_to: b }, { queue: false }); toast('ماه بسته شد 🔒'); await bus.refresh(); } catch (e) { toast(errText(e), 'err'); }
  };
  const doUnlock = async k => {
    const why = await promptBox('دلیل باز کردن ' + jmonthName(k), 'مثلاً اصلاح یک فاکتور'); if (!why) return;
    try { await rpc('unlock_month', { label: k, reason: why }, { queue: false }); toast('ماه باز شد 🔓'); await bus.refresh(); } catch (e) { toast(errText(e), 'err'); }
  };
  return [h('h3', { class: 'sec' }, 'قفل پایان ماه'),
    h('p', { class: 'hint' }, 'بعد از بستن یک ماه، عددهای آن ماه دیگر عوض نمی‌شود. فقط مدیر می‌تواند ماه را ببندد یا (با نوشتن دلیل) باز کند. تغییرها در تاریخچه و ربات مدیر می‌آید.'),
    dtable([{ label: 'ماه', main: true, render: k => jmonthName(k) },
      { label: 'وضعیت', render: k => (locks[k] ? pill('🔒 بسته', 'green') : pill('باز', 'amber')) },
      { label: 'بسته‌شده توسط', hm: true, render: k => (locks[k] ? `${locks[k].locked_by || ''} · ${jstr(String(locks[k].locked_at).slice(0, 10))}` : '') },
      { label: '', render: k => (!admin ? '' : locks[k] ? btn('باز کردن ماه', () => doUnlock(k), 'ghost sm') : btn('بستن ماه', () => doLock(k), 'gold sm')) }], keys, { empty: '' })];
}
