import { h, fmt, jstr, jmonthKey, jmonthName, sum } from '../util.js';
import { S, canEdit } from '../store.js';
import { dtable, N, pill, chips, kpi, tabsBar } from '../ui.js';
import { saleForm, purchaseForm } from '../forms_trade.js';
import { collectionForm, returnForm, supplierPaymentForm, voidEntry, moveStockForm, setDueForm, setBuyerForm } from '../forms_misc.js';
import { showStatement, invoiceSpec } from '../statement.js';
import { head, btn, searchBox, match, sortNew, detail, stamp, accName, rowCls, dueCell, ledgerTable } from './common.js';

const sel = (opts, cur, cb, label) => {
  const s = h('select', { class: 'sel', 'aria-label': label }, opts.map(o => h('option', { value: o.v, selected: o.v === cur }, o.label)));
  s.onchange = () => cb(s.value); return s;
};

/* ============ فروش ============ */
export function sales(query) {
  const st = { q: '', seller: '', ch: '', month: '', cust: '', open: query.get('open') === '1', voided: false };
  const tbl = h('div');
  const months = [...new Set(S.vSales.map(s => jmonthKey(s.date)))].sort().reverse();
  const buyers = [...new Set(S.vSales.filter(s => s.customer).map(s => s.customer))].sort((a, b) => a.localeCompare(b, 'fa'));
  const channels = [...new Set(S.vSales.map(s => s.channel))];
  const draw = () => {
    const rows = S.vSales.filter(s => (st.voided || !s.voided) && (!st.seller || s.seller === st.seller) && (!st.ch || s.channel === st.ch) && (!st.month || jmonthKey(s.date) === st.month) && (!st.cust || (st.cust === '__none' ? !s.customer : s.customer === st.cust))
      && (!st.open || s.outstanding > 0) && match(st.q, s.no, s.customer, s.items_text, s.seller, s.channel)).sort(sortNew);
    const act = rows.filter(r => !r.voided);
    tbl.replaceChildren(dtable([
      { k: 'no', label: 'شماره', main: true, render: r => h('span', null, r.no, ' ', r.voided ? pill('باطل', 'red') : null) },
      { label: 'تاریخ', render: r => jstr(r.date) }, { k: 'seller', label: 'فروشنده' }, { k: 'channel', label: 'محل فروش', hm: true },
      { label: 'خریدار', render: r => r.customer || (r.voided ? pill('بدون خریدار', 'red') : h('span', null, pill('بدون خریدار', 'red'), ' ', canEdit() ? btn('ثبت نام', e => { e.stopPropagation(); setBuyerForm(r); }, 'gold sm') : null)) }, { label: 'کالاها', cls: 'wrap', render: r => r.items_text },
      { label: 'جمع فروش', cls: 'num', render: r => N(r.total) }, { label: 'دریافتی', cls: 'num', hm: true, render: r => N(r.received + r.collected) },
      { label: 'نسیه‌ی باز', cls: 'num', render: r => (r.outstanding > 0 && !r.voided ? pill(fmt(r.outstanding), 'amber') : '') },
      { label: 'سررسید', render: r => (r.outstanding > 0 && !r.voided ? dueCell(r.due_date) : '') },
      { label: 'هزینه‌ی فروش', cls: 'num', hm: true, render: r => (r.courier + r.pack ? N(r.courier + r.pack) : '') },
      { label: 'سود', cls: 'num', render: r => N(r.profit, r.profit < 0 ? 'neg' : 'pos') }, { k: 'created_by', label: 'ثبت‌کننده', hm: true }
    ], rows, { onRow: r => saleDetail(r.id), rowCls, empty: 'فروشی با این فیلتر پیدا نشد', foot: rows.length ? ['', '', '', '', '', 'جمع', N(sum(act, r => r.total)), '', N(sum(act, r => r.outstanding)), '', '', N(sum(act, r => r.profit)), ''] : null }));
  };
  const ctr = h('div', { class: 'bar' }, searchBox(v => { st.q = v; draw(); }, 'جستجو: شماره، مشتری، کالا…'),
    sel([{ v: '', label: 'همه‌ی فروشنده‌ها' }, { v: 'مهسا', label: 'مهسا' }, { v: 'رعنا', label: 'رعنا' }], '', v => { st.seller = v; draw(); }, 'فروشنده'),
    sel([{ v: '', label: 'همه‌ی محل‌ها' }, ...channels.map(c => ({ v: c, label: c }))], '', v => { st.ch = v; draw(); }, 'محل فروش'),
    sel([{ v: '', label: 'همه‌ی خریداران' }, ...buyers.map(c => ({ v: c, label: c })), ...(S.vSales.some(s => !s.customer) ? [{ v: '__none', label: '⚠ بدون خریدار' }] : [])], '', v => { st.cust = v; draw(); }, 'خریدار'),
    sel([{ v: '', label: 'همه‌ی ماه‌ها' }, ...months.map(m => ({ v: m, label: jmonthName(m) }))], '', v => { st.month = v; draw(); }, 'ماه'),
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: st.open || null, onchange: e => { st.open = e.target.checked; draw(); } }), 'فقط نسیه‌ی باز'),
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', onchange: e => { st.voided = e.target.checked; draw(); } }), 'نمایش باطل‌شده‌ها'));
  draw();
  return h('div', null, head('فاکتور فروش', [btn('＋ فروش جدید', () => saleForm())], 'جدیدترین بالا است. ردیف‌ها قابل حذف یا ویرایش نیستند؛ فقط باطل می‌شوند.'), ctr, tbl);
}

const itemCell = (id, name) => { const d = S.I[id] && S.I[id].description; return d ? h('span', null, name || S.I[id].name, h('small', { class: 'idesc-s' }, d)) : (name || S.I[id].name); };

export function saleDetail(id) {
  const s = S.SALE[id]; const lines = S.saleLines.filter(l => l.sale_id === id);
  const cols = S.collections.filter(c => c.sale_id === id);
  const rets = S.returns.filter(r => r.sale_line_id && lines.some(l => l.id === r.sale_line_id));
  const m = detail({
    title: `فروش ${s.no}`,
    rows: [['تاریخ', jstr(s.date)], ['فروشنده', s.seller], ['محل فروش', s.channel], s.customer ? ['مشتری', s.customer] : null,
      ...(s.discount > 0 ? [['جمع کالاها', N(s.total + s.discount)], ['تخفیف', N(-s.discount, 'neg')]] : []),
      ['مبلغ فاکتور' + (s.discount > 0 ? ' (پس از تخفیف)' : ''), N(s.total)], ['دریافتی هنگام فروش', h('span', null, N(s.received), s.account_id ? ' → ' + accName(s.account_id) : '')],
      s.outstanding > 0 && !s.voided ? ['سررسید', s.due_date ? dueCell(s.due_date) : 'تعیین نشده'] : null,
      s.courier ? ['پیک', N(s.courier)] : null, s.pack ? ['بسته‌بندی', N(s.pack)] : null, (s.courier + s.pack) ? ['هزینه از حساب', accName(s.cost_account_id)] : null,
      ['بهای تمام‌شده‌ی کالا', N(s.cogs)], ['سود این فروش', N(s.profit, s.profit < 0 ? 'neg' : 'pos')], s.outstanding > 0 && !s.voided ? ['نسیه‌ی باز', N(s.outstanding, 'neg')] : null,
      s.note ? ['یادداشت', s.note] : null, ['ثبت‌کننده', stamp(s)], s.voided ? ['باطل‌شده', `${s.void_reason || ''}`] : null],
    extra: [h('h3', { class: 'sec' }, 'ردیف‌های فروش'), dtable([
      { label: 'کالا', main: true, render: l => itemCell(l.item_id) }, { label: 'دسته', render: l => S.LOT[l.lot_id].lot_no }, { label: 'تعداد', cls: 'num', render: l => l.qty },
      { label: 'فی فروش', cls: 'num', render: l => N(l.unit_price) }, { label: 'تمام‌شده', cls: 'num', render: l => N(l.unit_cost) }, { label: 'جمع', cls: 'num', render: l => N(l.qty * l.unit_price) },
      { label: 'برگشتی', cls: 'num', render: l => l.returned_qty || '' }], lines),
    cols.length ? [h('h3', { class: 'sec' }, 'دریافت‌های بعدی'), dtable([{ label: 'تاریخ', render: c => jstr(c.date) }, { label: 'مبلغ', cls: 'num', render: c => N(c.amount) }, { label: 'حساب', render: c => accName(c.account_id) }, { label: 'وضعیت', render: c => c.voided ? pill('باطل', 'red') : '' }], cols)] : null,
    rets.length ? [h('h3', { class: 'sec' }, 'مرجوعی‌ها'), dtable([{ label: 'شماره', render: r => r.no }, { label: 'تاریخ', render: r => jstr(r.date) }, { label: 'تعداد', cls: 'num', render: r => r.qty }, { label: 'وضعیت', render: r => r.condition + (r.to_supplier ? ' · به تامین‌کننده' : '') }, { label: 'اثر بر سود', cls: 'num', render: r => N(r.profit_effect) }], rets)] : null],
    actions: s.voided ? [] : [s.customer_id ? btn('🧾 صورت‌حساب برای مشتری', () => showStatement(invoiceSpec(id)), 'ghost') : (canEdit() ? btn('ثبت نام خریدار', () => { m.close(); setBuyerForm(s); }, 'gold') : null), s.outstanding > 0 ? btn('ثبت دریافت', () => { m.close(); collectionForm(id); }, 'gold') : null, s.outstanding > 0 && canEdit() ? btn('تغییر سررسید', () => { m.close(); setDueForm('sale', s); }, 'ghost') : null, btn('مرجوعی', () => { m.close(); returnForm(id); }, 'ghost'), ...(canEdit() ? [btn('ویرایش', () => { m.close(); saleForm({ edit: id }); }, 'ghost'), btn('ابطال فروش', async () => { if (await voidEntry('sale', s, `فروش ${s.no}`)) m.close(); }, 'danger ghost')] : [])]
  });
}

/* ============ خرید ============ */
export function purchases() {
  const st = { q: '', sup: '', voided: false };
  const tbl = h('div');
  const draw = () => {
    const rows = S.vInvoices.filter(i => (st.voided || !i.voided) && (!st.sup || String(i.supplier_id) === st.sup) && match(st.q, i.no, i.supplier, i.created_by)).sort(sortNew);
    const act = rows.filter(r => !r.voided);
    tbl.replaceChildren(dtable([
      { label: 'فاکتور', main: true, render: r => h('span', null, r.no, ' ', r.voided ? pill('باطل', 'red') : null) }, { label: 'تاریخ', render: r => jstr(r.date) }, { k: 'supplier', label: 'تامین‌کننده' },
      { label: 'اقلام', cls: 'num', hm: true, render: r => r.nlines }, { label: 'جمع کالا (قبل از تخفیف)', cls: 'num', hm: true, render: r => N((r.goods_total || 0) + (r.discount || 0)) }, { label: 'تخفیف', cls: 'num', hm: true, render: r => (r.discount ? N(-r.discount) : '') }, { label: 'بدهی کالا به تامین‌کننده', cls: 'num', render: r => N(r.goods_total) },
      { label: 'هزینه حمل (پرداخت‌کننده)', cls: 'num', hm: true, render: r => (r.ship_cost ? h('span', null, N(r.ship_cost), r.ship_account ? h('small', { style: 'display:block;color:var(--brown)' }, r.ship_account) : null) : '') },
      { label: 'قیمت تمام‌شده (کالا + حمل)', cls: 'num', hm: true, render: r => N(r.landed_total) }, { label: 'پرداخت‌شده به تامین‌کننده', cls: 'num', render: r => N(r.paid) },
      { label: 'بدهی', cls: 'num', render: r => (r.voided ? '' : r.debt > 0 ? pill(fmt(r.debt), 'amber') : r.debt < 0 ? pill('طلب ' + fmt(-r.debt), 'blue') : pill('تسویه', 'green')) }, { label: 'سررسید', render: r => (!r.voided && r.debt > 0 ? dueCell(r.due_date) : '') }, { k: 'created_by', label: 'ثبت‌کننده', hm: true }
    ], rows, { onRow: r => purchaseDetail(r.id), rowCls, empty: 'فاکتوری پیدا نشد', foot: rows.length ? ['', '', 'جمع', '', N(sum(act, r => (r.goods_total || 0) + (r.discount || 0))), N(-sum(act, r => r.discount || 0)), N(sum(act, r => r.goods_total)), N(sum(act, r => r.ship_cost)), N(sum(act, r => r.landed_total)), N(sum(act, r => r.paid)), N(sum(act, r => r.debt)), '', ''] : null }));
  };
  const ctr = h('div', { class: 'bar' }, searchBox(v => { st.q = v; draw(); }, 'جستجو: شماره یا تامین‌کننده…'),
    sel([{ v: '', label: 'همه‌ی تامین‌کننده‌ها' }, ...S.suppliers.map(s => ({ v: String(s.id), label: s.name }))], '', v => { st.sup = v; draw(); }, 'تامین‌کننده'),
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', onchange: e => { st.voided = e.target.checked; draw(); } }), 'نمایش باطل‌شده‌ها'));
  draw();
  return h('div', null, head('فاکتور خرید', [btn('＋ خرید جدید', () => purchaseForm())], 'هر فاکتور شامل چند قلم است. «بدهی کالا» = جمع کالا − تخفیف، همان مبلغی که به تامین‌کننده می‌دهیم. کرایه (حمل) را جداگانه به باربر می‌دهیم و فقط روی قیمت تمام‌شده‌ی اقلام سرشکن می‌شود: قیمت تمام‌شده = بدهی کالا + حمل. پس «پرداخت‌شده» می‌تواند از «قیمت تمام‌شده» کمتر باشد و بدهی باز هم تسویه است.'), ctr, tbl);
}

export function purchaseDetail(id) {
  const i = S.INV[id]; const ls = S.lots.filter(l => l.invoice_id === id); const pays = S.payments.filter(p => p.invoice_id === id);
  const full = S.invoices.find(x => x.id === id);
  const m = detail({
    title: `فاکتور ${i.no} · ${i.supplier}`,
    rows: [['تاریخ', jstr(i.date)], ...(i.discount > 0 ? [['جمع کالاها', N(i.goods_total + i.discount)], ['تخفیف', N(-i.discount, 'neg')]] : []), ['جمع کالا' + (i.discount > 0 ? ' (پس از تخفیف)' : ''), N(i.goods_total)], i.ship_cost ? ['هزینه حمل', h('span', null, N(i.ship_cost), ' ← ', i.ship_account)] : null, ['قیمت تمام‌شده', N(i.landed_total)],
      ['پرداخت‌شده', N(i.paid)], i.credit ? ['اعتبار مرجوعی', N(i.credit)] : null, ['مانده‌ی بدهی', N(i.debt, i.debt > 0 ? 'neg' : '')], i.debt > 0 && !i.voided ? ['سررسید', i.due_date ? dueCell(i.due_date) : 'تعیین نشده'] : null, i.note ? ['یادداشت', i.note] : null, ['ثبت‌کننده', stamp(i)], i.voided ? ['باطل‌شده', full.void_reason || ''] : null],
    extra: [h('h3', { class: 'sec' }, 'اقلام و دسته‌ها'), dtable([
      { label: 'دسته', main: true, render: l => l.lot_no }, { label: 'کالا', render: l => itemCell(l.item_id, l.item) }, { label: 'تعداد', cls: 'num', render: l => l.qty }, { label: 'فی خرید', cls: 'num', render: l => N(l.unit_price) },
      { label: 'سهم حمل', cls: 'num', hm: true, render: l => N(l.ship_share) },
      ...(i.discount > 0 ? [{ label: 'سهم تخفیف', cls: 'num', hm: true, render: l => N(-(S.lines.find(x => x.id === l.id) || {}).disc_share) }] : []), { label: 'تمام‌شده‌ی هر عدد', cls: 'num', render: l => N(l.landed_unit) },
      { label: 'تحویل م/ر', cls: 'num', hm: true, render: l => `${l.hold_m} / ${l.hold_r}` },
      ...(ls.some(l => l.note) ? [{ label: 'توضیحات', render: l => h('div', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', minWidth: '160px' } }, l.note || '') }] : []), { label: 'مانده م/ر', cls: 'num', render: l => `${l.rem_m} / ${l.rem_r}` }], ls),
    pays.length ? [h('h3', { class: 'sec' }, 'پرداخت‌ها'), dtable([{ label: 'تاریخ', render: p => jstr(p.date) }, { label: 'مبلغ', cls: 'num', render: p => N(p.amount) }, { label: 'از حساب', render: p => accName(p.account_id) }, { label: 'ثبت‌کننده', render: p => p.created_by }, { label: 'وضعیت', render: p => (p.voided ? pill('باطل', 'red') : '') }], pays)] : null],
    actions: i.voided ? [] : [i.debt > 0 ? btn('ثبت پرداخت', () => { m.close(); supplierPaymentForm({ supplier_id: i.supplier_id, invoice_id: id }); }, 'gold') : null, i.debt > 0 && canEdit() ? btn('تغییر سررسید', () => { m.close(); setDueForm('purchase', i); }, 'ghost') : null, ...(canEdit() ? [btn('ویرایش', () => { m.close(); purchaseForm({ edit: id }); }, 'ghost'), btn('ابطال فاکتور', async () => { if (await voidEntry('purchase', full, `فاکتور ${i.no}`)) m.close(); }, 'danger ghost')] : [])]
  });
}

/* ============ فاکتورها و بدهی ============ */
export function invoices() {
  const debt = sum(S.vSup.filter(s => s.balance > 0), s => s.balance), credit = sum(S.vSup.filter(s => s.balance < 0), s => -s.balance);
  let showPaid = false; const tbl = h('div');
  const draw = () => {
    const rows = S.vInvoices.filter(i => !i.voided && (showPaid || i.debt !== 0)).sort((a, b) => (a.date < b.date ? -1 : 1));
    tbl.replaceChildren(dtable([
      { label: 'فاکتور', main: true, render: r => r.no }, { label: 'تاریخ', render: r => jstr(r.date) }, { k: 'supplier', label: 'تامین‌کننده' }, { label: 'جمع کالا', cls: 'num', render: r => N(r.goods_total) },
      { label: 'پرداخت‌شده', cls: 'num', render: r => N(r.paid) }, { label: 'اعتبار مرجوعی', cls: 'num', hm: true, render: r => (r.credit ? N(r.credit) : '') },
      { label: 'مانده', cls: 'num', render: r => (r.debt > 0 ? pill(fmt(r.debt), 'amber') : r.debt < 0 ? pill('طلب ' + fmt(-r.debt), 'blue') : pill('تسویه', 'green')) },
      { label: 'سررسید', render: r => (r.debt > 0 ? dueCell(r.due_date) : '') },
      { label: '', render: r => (r.debt > 0 ? btn('پرداخت', e => { e.stopPropagation(); supplierPaymentForm({ supplier_id: r.supplier_id, invoice_id: r.id }); }, 'gold sm') : '') }
    ], rows, { onRow: r => purchaseDetail(r.id), empty: 'فاکتور بازی وجود ندارد 🎉' }));
  };
  draw();
  const supT = dtable([
    { label: 'تامین‌کننده', main: true, render: s => s.name }, { label: 'جمع خرید', cls: 'num', render: s => N(s.goods) }, { label: 'پرداخت‌شده', cls: 'num', render: s => N(s.paid) }, { label: 'اعتبار مرجوعی', cls: 'num', hm: true, render: s => (s.credit ? N(s.credit) : '') },
    { label: 'وضعیت حساب', cls: 'num', render: s => (s.balance > 0 ? pill('بدهکاریم ' + fmt(s.balance), 'amber') : s.balance < 0 ? pill('طلبکاریم ' + fmt(-s.balance), 'blue') : pill('تسویه', 'green')) },
    { label: '', render: s => (s.balance > 0.5 ? btn('پرداخت', e => { e.stopPropagation(); supplierPaymentForm({ supplier_id: s.id }); }, 'gold sm') : '') }
  ], S.vSup.filter(s => s.goods || s.paid), { onRow: s => supplierStatement(s.id), empty: 'تامین‌کننده‌ای با گردش حساب نیست' });
  return h('div', null, head('فاکتورها و بدهی', [btn('＋ پرداخت به تامین‌کننده', () => supplierPaymentForm())], 'بدهی هر فاکتور = جمع کالا − پرداختی‌ها − اعتبار مرجوعی. هزینه حمل جدا پرداخت می‌شود و در بدهی نیست.'),
    h('div', { class: 'kpis' }, kpi('بدهی ما به تامین‌کنندگان', N(debt), { tone: debt > 0 ? 'neg' : '' }), kpi('طلب ما از تامین‌کنندگان', N(credit), { tone: 'pos' })),
    h('h3', { class: 'sec' }, 'حساب هر تامین‌کننده (روی هر ردیف بزن تا صورت‌حساب کامل را ببینی)'), supT,
    h('div', { class: 'sechead' }, h('h3', { class: 'sec' }, 'فاکتورها'), h('label', { class: 'chk' }, h('input', { type: 'checkbox', onchange: e => { showPaid = e.target.checked; draw(); } }), 'نمایش تسویه‌شده‌ها')), tbl);
}

/* ============ صورت‌حساب تامین‌کننده ============ */
export function supplierStatement(id) {
  const sup = S.SUP[id]; const ev = [];
  S.vInvoices.filter(i => i.supplier_id === id && !i.voided).forEach(i => ev.push({ date: i.date, ord: 0, text: `فاکتور ${i.no}` + (i.due_date ? ` (سررسید ${jstr(i.due_date)})` : ''), plus: i.goods_total }));
  S.payments.filter(p => p.supplier_id === id && !p.voided).forEach(p => ev.push({ date: p.date, ord: 1, text: 'پرداخت از ' + accName(p.account_id) + (p.invoice_id && S.INV[p.invoice_id] ? ` ← ${S.INV[p.invoice_id].no}` : '') + (p.note ? ' · ' + p.note : ''), minus: p.amount }));
  S.returns.filter(r => !r.voided && r.supplier_credit > 0 && S.LOT[r.lot_id] && S.LOT[r.lot_id].supplier_id === id).forEach(r => ev.push({ date: r.date, ord: 2, text: `اعتبار مرجوعی ${r.no}`, minus: r.supplier_credit }));
  const bal = (S.vSup.find(x => x.id === id) || {}).balance || 0;
  const dues = S.due.filter(d => d.kind === 'payable' && d.party_id === id);
  const m = detail({
    title: `صورت‌حساب ${sup.name}`,
    rows: [['وضعیت حساب', bal > 0 ? h('span', null, 'بدهکاریم ', N(bal, 'neg')) : bal < 0 ? h('span', null, 'طلبکاریم ', N(-bal)) : 'تسویه'], sup.phone ? ['تلفن', h('span', { dir: 'ltr' }, sup.phone)] : null],
    extra: [dues.length ? [h('h3', { class: 'sec' }, 'فاکتورهای باز'), dtable([{ label: 'فاکتور', main: true, render: d => d.ref_no }, { label: 'مانده', cls: 'num', render: d => N(d.amount) }, { label: 'سررسید', render: d => (d.due_date ? dueCell(d.due_date) : 'تعیین نشده') }], dues)] : null,
      h('h3', { class: 'sec' }, 'گردش حساب'), ledgerTable(ev, dtable, { plus: 'خرید (بدهکار شدیم)', minus: 'پرداخت / اعتبار' })],
    actions: bal > 0.5 ? [btn('ثبت پرداخت', () => { m.close(); supplierPaymentForm({ supplier_id: id }); }, 'gold')] : []
  });
}
