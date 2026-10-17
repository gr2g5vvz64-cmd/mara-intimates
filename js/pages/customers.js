// مشتریان و طلب‌ها: چه کسی چقدر بدهکار است، سررسیدها، دریافت کامل یا قسطی، صورت‌حساب هر مشتری
import { h, fmt, jstr, sum } from '../util.js';
import { S } from '../store.js';
import { dtable, N, pill, kpi } from '../ui.js';
import { collectCustomerForm, customerForm, collectionForm, setDueForm } from '../forms_misc.js';
import { saleForm } from '../forms_trade.js';
import { head, btn, searchBox, match, detail, accName, dueCell, ledgerTable } from './common.js';
import { saleDetail } from './trade.js';
import { topCustomersCard } from './dashboard.js';

export function render(query) {
  let q = '', onlyDebt = query.get('debt') !== '0', tbl = h('div');
  const debtors = S.vCus.filter(c => c.outstanding > 0.5);
  const total = sum(debtors, c => c.outstanding), over = sum(debtors, c => c.overdue_amount);
  const draw = () => {
    const rows = S.vCus.filter(c => (!onlyDebt || c.outstanding > 0.5) && c.active !== false && match(q, c.name, c.phone, c.note))
      .sort((a, b) => b.overdue_amount - a.overdue_amount || b.outstanding - a.outstanding || a.name.localeCompare(b.name, 'fa'));
    tbl.replaceChildren(dtable([
      { label: 'مشتری', main: true, render: c => c.name }, { label: 'تلفن', render: c => h('span', { dir: 'ltr' }, c.phone || '') },
      { label: 'جمع فروش', cls: 'num', hm: true, render: c => N(c.sales_total) }, { label: 'تسویه‌شده', cls: 'num', hm: true, render: c => N(c.settled) },
      { label: 'مانده‌ی بدهی', cls: 'num', render: c => (c.outstanding > 0.5 ? pill(fmt(c.outstanding), c.overdue_amount > 0 ? 'red' : 'amber') : pill('تسویه', 'green')) },
      { label: 'فروش باز', cls: 'num', render: c => c.open_count || '' }, { label: 'نزدیک‌ترین سررسید', render: c => (c.outstanding > 0.5 && c.next_due ? dueCell(c.next_due) : '') },
      { label: '', render: c => (c.outstanding > 0.5 ? btn('دریافت', e => { e.stopPropagation(); collectCustomerForm(c.id); }, 'gold sm') : '') }
    ], rows, { onRow: c => customerDetail(c.id), empty: onlyDebt ? 'مشتری بدهکاری نداریم 🎉' : 'هنوز مشتری ثبت نشده' }));
  };
  draw();
  return h('div', null, head('مشتریان و طلب‌ها', [btn('＋ مشتری جدید', () => customerForm()), btn('＋ دریافت از مشتری', () => collectCustomerForm(), 'gold')],
    'فروش نسیه که مشتری ۳ یا ۵ یا ۱۰ روز بعد می‌دهد: مانده، سررسید و تسویه‌ی کامل یا قسطی همین‌جاست.'),
    h('div', { class: 'kpis' }, kpi('جمع طلب ما از مشتریان', N(total), { sub: 'ریال', tone: total > 0 ? 'warn' : '' }), kpi('سررسید گذشته', N(over), { sub: 'ریال', tone: over > 0 ? 'neg' : '' }), kpi('مشتریان بدهکار', debtors.length, { sub: 'نفر' })),
    topCustomersCard(),
    h('div', { class: 'bar' }, searchBox(v => { q = v; draw(); }, 'جستجو: نام یا تلفن…'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: onlyDebt || null, onchange: e => { onlyDebt = e.target.checked; draw(); } }), 'فقط بدهکارها')), tbl);
}

export function customerDetail(id) {
  const c = S.CUS[id], b = S.vCus.find(x => x.id === id) || {};
  const sales = S.vSales.filter(s => s.customer_id === id && !s.voided);
  const ev = [];
  sales.forEach(s => {
    ev.push({ date: s.date, ord: 0, text: `فروش ${s.no} — ${s.items_text}` + (s.due_date && s.outstanding > 0 ? ` (سررسید ${jstr(s.due_date)})` : ''), plus: s.total });
    if (s.received > 0) ev.push({ date: s.date, ord: 1, text: `دریافت هنگام فروش → ${accName(s.account_id)}`, minus: s.received });
  });
  S.collections.filter(x => !x.voided && S.SALE[x.sale_id] && S.SALE[x.sale_id].customer_id === id).forEach(x => ev.push({ date: x.date, ord: 2, text: `دریافت برای ${S.SALE[x.sale_id].no} → ${accName(x.account_id)}` + (x.note ? ' · ' + x.note : ''), minus: x.amount }));
  S.returns.filter(r => !r.voided && r.debt_cancel > 0 && r.sale_line_id).forEach(r => { const sl = S.saleLines.find(l => l.id === r.sale_line_id); const s = sl && S.SALE[sl.sale_id]; if (s && s.customer_id === id) ev.push({ date: r.date, ord: 3, text: `مرجوعی ${r.no} (کسر از بدهی)`, minus: r.debt_cancel }); });
  const open = sales.filter(s => s.outstanding > 0.5).sort((a, b2) => (a.date < b2.date ? -1 : 1));
  const m = detail({
    title: `صورت‌حساب ${c.name}`,
    rows: [['مانده‌ی بدهی', b.outstanding > 0.5 ? N(b.outstanding, 'neg') : 'تسویه'], c.phone ? ['تلفن', h('span', { dir: 'ltr' }, c.phone)] : null, c.note ? ['یادداشت', c.note] : null,
      b.overdue_amount > 0 ? ['سررسید گذشته', N(b.overdue_amount, 'neg')] : null, ['جمع فروش به او', N(b.sales_total || 0)]],
    extra: [open.length ? [h('h3', { class: 'sec' }, 'فروش‌های باز (قدیمی‌ترین اول)'), dtable([
      { label: 'فروش', main: true, render: s => s.no }, { label: 'تاریخ', render: s => jstr(s.date) }, { label: 'مانده', cls: 'num', render: s => N(s.outstanding) },
      { label: 'سررسید', render: s => (s.due_date ? dueCell(s.due_date) : 'تعیین نشده') },
      { label: '', render: s => btn('تغییر سررسید', e => { e.stopPropagation(); m.close(); setDueForm('sale', s); }, 'ghost sm') }], open, { onRow: s => { m.close(); saleDetail(s.id); } })] : null,
      h('h3', { class: 'sec' }, 'گردش حساب'), ledgerTable(ev, dtable, { plus: 'فروش (بدهکار شد)', minus: 'دریافت / کسر' })],
    actions: [b.outstanding > 0.5 ? btn('ثبت دریافت', () => { m.close(); collectCustomerForm(id); }, 'gold') : null, btn('فروش جدید به او', () => { m.close(); saleForm({ customer: id }); }, 'ghost'), btn('ویرایش مشتری', () => { m.close(); customerForm(c); }, 'ghost')]
  });
}
