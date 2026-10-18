// «این عدد از کجا آمد؟» — فقط برای مدیر: روی هر عددِ محاسبه‌ای بزنی، پنجره‌ای محاسبات سازنده‌اش را نشان می‌دهد.
import { h, fmt } from './util.js';
import { S, businessAccounts, accBalance } from './store.js';
import { modal, N } from './ui.js';

const isAdmin = () => S.me && S.me.role === 'admin';
const T = () => S.totals || {};
const ton = (x) => fmt(Math.round(Math.abs(x) / 10));

function row(label, value, note = '', cls = '') {
  return h('div', { class: 'xrow ' + cls }, h('div', { class: 'xl' }, h('b', null, label), note ? h('small', null, note) : null), typeof value === 'number' ? N(value) : (value || ''));
}
function box(formula, rows, extra = []) {
  return h('div', { class: 'xp-body' }, formula ? h('div', { class: 'xform' }, formula) : null, h('div', { class: 'xrows' }, rows), ...extra.filter(Boolean));
}
const live = (a) => a.filter(x => !x.voided);
const stockByItem = () => {
  const m = new Map();
  for (const l of S.lots) if (!l.voided && l.rem > 0) { const v = l.rem * l.landed_unit; const k = l.item_id; const c = m.get(k) || { v: 0, q: 0 }; c.v += v; c.q += l.rem; m.set(k, c); }
  return [...m.entries()].map(([k, c]) => ({ name: ((S.I && S.I[k]) || {}).name || ('کالا ' + k), ...c })).sort((a, b) => b.v - a.v);
};

const BUILD = {
  profit: () => { const t = T(); return ['سود کل', box('سود = جمع فروش − بهای تمام‌شده − پیک/بسته‌بندی − هزینه‌ها ± مرجوعی‌ها', [
    row('جمع فروش', t.revenue, `مجموع «خالصِ» ${live(S.vSales).length} فاکتور فعال (بعد از تخفیف، بدون ابطال‌شده‌ها)`),
    row('− بهای تمام‌شده', -t.cogs, 'قیمت تمام‌شده‌ی همان کالاهایی که فروخته شد (FIFO از دسته‌ی خرید، با حمل و هزینه‌های ورود)'),
    row('− پیک و بسته‌بندی', -t.sale_costs, 'هزینه‌هایی که روی خودِ فروش‌ها ثبت شده'),
    row('− هزینه‌ها', -t.expenses, `جمع ${live(S.expenses || []).length} هزینه‌ی ثبت‌شده`),
    row('± مرجوعی‌ها', t.returns_effect, 'برگشتی‌ها: بازپرداخت به مشتری منهای ارزش کالای سالمِ برگشته به موجودی'),
    row('= سود کل', t.profit, '', 'sum')], [h('p', { class: 'hint' }, 'سود به سرمایه ربطی ندارد؛ سهم شرکا برابر (نصف–نصف) است.')])]; },
  revenue: () => ['جمع فروش', box('جمع «فروش.خالص» همه‌ی فروش‌های فعال', [row('جمع فروش', T().revenue, `${live(S.vSales).length} فاکتور · ابطال‌شده‌ها حساب نمی‌شوند`)])],
  cogs: () => ['بهای تمام‌شده', box('برای هر ردیف فروش: تعداد × قیمت تمام‌شده‌ی دسته‌ی خرید (FIFO)', [row('بهای تمام‌شده', T().cogs, 'قیمت تمام‌شده = قیمت خرید + سهم حمل/گمرک و هزینه‌های ورود')])],
  sale_costs: () => ['پیک و بسته‌بندی فروش', box('جمع هزینه‌ی پیک + بسته‌بندی ثبت‌شده روی فروش‌ها', [row('جمع', T().sale_costs)])],
  expenses: () => ['هزینه‌ها', box('جمع هزینه‌های ثبت‌شده (بدون ابطال‌شده)', [row('جمع', T().expenses, `${live(S.expenses || []).length} ردیف`)])],
  returns: () => ['مرجوعی‌ها', box('اثر مرجوعی بر سود', [row('اثر خالص', T().returns_effect, 'مبلغ بازپرداخت‌شده منهای بهای کالای سالمِ برگشته به انبار')])],
  business_balance: () => { const t = T(); const rows = businessAccounts().map(a => row(a.name, accBalance(a.id), 'فروش‌های دریافتی + دریافت نسیه + انتقال‌های ورودی − پرداخت تامین‌کننده − هزینه‌ها − حمل − مرجوعی − انتقال‌های خروجی'));
    return ['جمع حساب‌های کسب‌وکار', box('جمع مانده‌ی همه‌ی حساب‌های کسب‌وکار (کیف‌های شخصی جدا هستند)', [...rows, row('= جمع', t.business_balance, '', 'sum')])]; },
  acc: (id) => { const a = (S.A || {})[id] || {}; return ['مانده‌ی ' + (a.name || 'حساب'), box('مانده = ورودی‌ها − خروجی‌ها', [
    row('+ دریافت از فروش‌ها', '', 'مبلغ‌هایی که با این حساب دریافت شد'), row('+ دریافت نسیه', '', 'وصول بدهی مشتری‌ها به این حساب'), row('+ انتقال ورودی', '', 'از حساب/جیب دیگر'),
    row('− پرداخت به تامین‌کننده', '', ''), row('− هزینه‌ها، حمل، پیک/بسته‌بندی، مرجوعی', '', ''), row('− انتقال خروجی', '', ''),
    row('= مانده', accBalance(id), '', 'sum')])]; },
  stock_value: () => { const t = T(), top = stockByItem().slice(0, 8);
    return ['ارزش موجودی', box('ارزش = برای هر دسته‌ی خرید: تعدادِ مانده × قیمت تمام‌شده، جمعِ همه‌ی دسته‌ها (انبار مهسا + رعنا)', [row('ارزش کل موجودی', t.stock_value, '', 'sum')], [
      top.length ? h('div', { class: 'xsub' }, 'بیشترین ارزش:') : null, ...top.map(i => row(i.name, i.v, fmt(i.q) + ' عدد'))])]; },
  net_worth: () => { const t = T(); return ['ارزش خالص', box('ارزش خالص = جمع حساب‌ها + ارزش موجودی + طلب از مشتری‌ها − بدهی به تامین‌کننده‌ها', [
    row('جمع حساب‌های کسب‌وکار', t.business_balance), row('+ ارزش موجودی', t.stock_value), row('+ طلب از مشتری‌ها', t.receivable, 'نسیه‌های وصول‌نشده'), row('− بدهی به تامین‌کننده‌ها', -t.payable, 'خرید‌های پرداخت‌نشده'), row('= ارزش خالص', t.net_worth, '', 'sum')],
    [h('p', { class: 'hint' }, 'کنترل: ارزش خالص − سرمایه‌ها + برداشت‌ها باید با سود کل برابر باشد. اختلاف الان: ' + fmt(t.check_diff || 0) + ' ریال.')])]; },
  receivable: () => ['طلب از مشتری‌ها', box('جمع مانده‌ی فاکتورهای نسیه', [row('جمع', T().receivable, 'فروش خالص − دریافت‌های ثبت‌شده، برای فاکتورهای فعال')])],
  payable: () => ['بدهی به تامین‌کننده‌ها', box('جمع خریدهای پرداخت‌نشده', [row('جمع', T().payable, 'ارزش کالای خریداری‌شده − پرداخت‌ها − اعتبار مرجوعی به تامین‌کننده')])],
  capital: (who) => { const t = T(); const m = who === 'm'; const nm = m ? 'مهسا' : 'رعنا';
    return ['سرمایه‌ی ' + nm, box('سرمایه = آنچه از جیب شخصی‌اش در کسب‌وکار گذاشته − آنچه پس گرفته (برداشت سود/انتقال)', [row('سرمایه‌ی ' + nm, m ? t.capital_m : t.capital_r, 'خرید، حمل، هزینه یا انتقال با پول شخصی'), row('برداشت‌های سود (جدا از سرمایه)', m ? t.payout_m : t.payout_r)])]; },
  capital_total: () => ['جمع سرمایه', box('سرمایه‌ی مهسا + سرمایه‌ی رعنا', [row('مهسا', T().capital_m), row('رعنا', T().capital_r), row('= جمع', (T().capital_m || 0) + (T().capital_r || 0), '', 'sum')])],
  share: (r) => ['سهم از سود — ' + r.name, box('سود بین مهسا و رعنا برابر تقسیم می‌شود', [row('سود کل', T().profit), row('× ۵۰٪', r.suggest, 'سهم ' + r.name, 'sum'), row('− برداشت‌شده تا حالا', -r.payout), row('= باقی‌مانده برای برداشت', r.left, '', 'sum')], [h('p', { class: 'hint' }, 'سرمایه فقط برای برابر کردن پول گذاشته‌شده است (پیام بات)، نه برای تقسیم سود.')])],
  check: () => ['کنترل حسابداری', box('اختلاف = ارزش خالص − (سرمایه‌ها) + برداشت‌ها − سود', [row('ارزش خالص', T().net_worth), row('− جمع سرمایه‌ها', -((T().capital_m || 0) + (T().capital_r || 0))), row('+ برداشت‌های سود', (T().payout_m || 0) + (T().payout_r || 0)), row('− سود کل', -T().profit), row('= اختلاف', T().check_diff || 0, 'باید صفر باشد', 'sum')])],
  sales: () => ['فروش دوره', box('جمع «خالصِ» فاکتورهای فعالِ همین بازه', [row('فروش', '', 'از «فروش.خالص»، بدون ابطال‌شده؛ مرجوعی جدا حساب می‌شود')])],
  dprofit: () => ['سود خالص دوره', box('همان فرمول سود کل، فقط برای فاکتورها/هزینه‌های همین بازه', [row('سود', '', 'فروش − بهای تمام‌شده − پیک/بسته‌بندی − هزینه‌ها ± مرجوعی')])],
};

export function explainModal(key, arg) {
  const f = BUILD[key]; if (!f) return;
  const [title, body] = f(arg);
  modal({ title: '🔍 ' + title, body: h('div', { class: 'xp-wrap' }, body), wide: false });
}

// node را قابل‌کلیک می‌کند (فقط مدیر)
export function ex(node, key, arg) {
  if (!isAdmin() || !node || !BUILD[key]) return node;
  node.classList.add('xp'); node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0'); node.title = 'این عدد از کجا آمد؟';
  const go = (e) => { e.stopPropagation(); e.preventDefault(); explainModal(key, arg); };
  node.addEventListener('click', go); node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(e); });
  return node;
}
