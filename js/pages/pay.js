import { h, fmt, jstr, sum, jmonthKey, todayISO } from '../util.js';
import { overdue } from '../insights.js';
import { S, canEdit } from '../store.js';
import { dtable, N, pill, tabsBar, kpi } from '../ui.js';
import { supplierPaymentForm, expenseForm, collectionForm, transferForm, returnForm, supplierReturnForm, voidEntry, editEntryForm } from '../forms_misc.js';
import { head, btn, searchBox, match, sortNew, detail, stamp, accName, rowCls } from './common.js';

function entryDetail(kind, title, rows, row) {
  const m = detail({ title, rows: [...rows, ['ثبت‌کننده', stamp(row)], row.voided ? ['باطل‌شده', row.void_reason || ''] : null], actions: row.voided || !canEdit() ? [] : [btn('ویرایش', () => { m.close(); if (kind === 'return') (row.kind === 'customer' ? returnForm(S.saleLines.find(l => l.id === row.sale_line_id).sale_id, row) : supplierReturnForm(row)); else editEntryForm(kind, row); }, 'ghost'), btn('ابطال', async () => { if (await voidEntry(kind, row, title)) m.close(); }, 'danger ghost')] });
}

export function render(query, defTab = 'sup') {
  let tab = query.get('tab') || defTab, q = '';
  const root = h('div'), body = h('div'), tabsHost = h('div');
  const bd = (n, hot = false, info = false) => ({ n, tone: n === 0 ? 'zero' : hot ? 'red' : info ? 'info' : 'amber' });
  const TABS = [{ id: 'sup', label: 'پرداخت به تامین‌کننده', badge: bd(S.vSup.filter(x => x.balance > 0.5).length, overdue('payable').length > 0) }, { id: 'exp', label: 'هزینه‌ها', badge: bd(S.expenses.filter(e => !e.voided && jmonthKey(e.date) === jmonthKey(todayISO())).length, false, true) },
    { id: 'col', label: 'دریافت از مشتری', badge: bd(S.vCus.filter(c => c.outstanding > 0.5).length, overdue('receivable').length > 0) }, { id: 'trf', label: 'انتقال و سرمایه', badge: bd(S.transfers.filter(t => !t.voided && jmonthKey(t.date) === jmonthKey(todayISO())).length, false, true) }];
  const addBtn = h('span');
  const draw = () => {
    tabsHost.replaceChildren(tabsBar(TABS, tab, t => { tab = t; draw(); }));
    const lists = {
      sup: () => dtable([
        { label: 'تاریخ', main: true, render: r => h('span', null, jstr(r.date), ' ', r.voided ? pill('باطل', 'red') : null) }, { label: 'تامین‌کننده', render: r => S.SUP[r.supplier_id].name }, { label: 'فاکتور', hm: true, render: r => (r.invoice_id ? S.INV[r.invoice_id].no : 'کلی') },
        { label: 'مبلغ', cls: 'num', render: r => N(r.amount) }, { label: 'از حساب', render: r => accName(r.account_id) }, { label: 'توضیح', hm: true, render: r => r.note || '' }, { label: 'ثبت‌کننده', hm: true, render: r => r.created_by }
      ], S.payments.filter(r => match(q, S.SUP[r.supplier_id].name, r.note, accName(r.account_id))).sort(sortNew), { onRow: r => entryDetail('payment', 'پرداخت به ' + S.SUP[r.supplier_id].name, [['تاریخ', jstr(r.date)], ['مبلغ', N(r.amount)], ['از حساب', accName(r.account_id)], r.invoice_id ? ['فاکتور', S.INV[r.invoice_id].no] : null, r.note ? ['توضیح', r.note] : null], r), rowCls, empty: 'پرداختی ثبت نشده' }),
      exp: () => dtable([
        { label: 'تاریخ', main: true, render: r => h('span', null, jstr(r.date), ' ', r.voided ? pill('باطل', 'red') : null) }, { label: 'دسته', render: r => r.category }, { label: 'مبلغ', cls: 'num', render: r => N(r.amount) },
        { label: 'از حساب', render: r => accName(r.account_id) }, { label: 'توضیح', hm: true, render: r => r.note || '' }, { label: 'ثبت‌کننده', hm: true, render: r => r.created_by }
      ], S.expenses.filter(r => match(q, r.category, r.note, accName(r.account_id))).sort(sortNew), { onRow: r => entryDetail('expense', 'هزینه: ' + r.category, [['تاریخ', jstr(r.date)], ['مبلغ', N(r.amount)], ['از حساب', accName(r.account_id)], r.note ? ['توضیح', r.note] : null], r), rowCls, empty: 'هزینه‌ای ثبت نشده',
        foot: S.expenses.length ? ['جمع', '', N(sum(S.expenses.filter(e => !e.voided), e => e.amount)), '', '', ''] : null }),
      col: () => dtable([
        { label: 'تاریخ', main: true, render: r => h('span', null, jstr(r.date), ' ', r.voided ? pill('باطل', 'red') : null) }, { label: 'فروش', render: r => S.SALE[r.sale_id].no }, { label: 'مشتری', render: r => S.SALE[r.sale_id].customer || '' },
        { label: 'مبلغ', cls: 'num', render: r => N(r.amount) }, { label: 'به حساب', render: r => accName(r.account_id) }, { label: 'ثبت‌کننده', hm: true, render: r => r.created_by }
      ], S.collections.filter(r => match(q, S.SALE[r.sale_id].no, S.SALE[r.sale_id].customer, r.note)).sort(sortNew), { onRow: r => entryDetail('collection', 'دریافت ' + S.SALE[r.sale_id].no, [['تاریخ', jstr(r.date)], ['مشتری', S.SALE[r.sale_id].customer || ''], ['مبلغ', N(r.amount)], ['به حساب', accName(r.account_id)], r.note ? ['توضیح', r.note] : null], r), rowCls, empty: 'دریافتی ثبت نشده' }),
      trf: () => dtable([
        { label: 'تاریخ', main: true, render: r => h('span', null, jstr(r.date), ' ', r.voided ? pill('باطل', 'red') : null) }, { label: 'از', render: r => accName(r.from_account_id) }, { label: 'به', render: r => accName(r.to_account_id) },
        { label: 'مبلغ', cls: 'num', render: r => N(r.amount) }, { label: 'نوع', render: r => (r.kind === 'profit_payout' ? pill('برداشت سود', 'gold') : r.kind === 'capital' ? pill('انتقال سرمایه', 'blue') : S.A[r.from_account_id].kind === 'pocket' ? pill('سرمایه', 'green') : S.A[r.to_account_id].kind === 'pocket' ? pill('برگشت سرمایه', 'amber') : pill('انتقال', 'gray')) },
        { label: 'توضیح', hm: true, render: r => r.note || '' }, { label: 'ثبت‌کننده', hm: true, render: r => r.created_by }
      ], S.transfers.filter(r => match(q, accName(r.from_account_id), accName(r.to_account_id), r.note)).sort(sortNew), { onRow: r => entryDetail('transfer', 'انتقال', [['تاریخ', jstr(r.date)], ['از', accName(r.from_account_id)], ['به', accName(r.to_account_id)], ['مبلغ', N(r.amount)], r.note ? ['توضیح', r.note] : null], r), rowCls, empty: 'انتقالی ثبت نشده' })
    };
    body.replaceChildren(lists[tab]());
    const adders = { sup: ['＋ پرداخت به تامین‌کننده', () => supplierPaymentForm()], exp: ['＋ هزینه‌ی جدید', () => expenseForm()], col: ['＋ دریافت از مشتری', () => collectionForm()], trf: ['＋ انتقال / سرمایه', () => transferForm()] };
    addBtn.replaceChildren(btn(adders[tab][0], adders[tab][1]));
  };
  root.append(head('پرداخت و هزینه', [addBtn], 'همه‌ی جابه‌جایی‌های پول جز خود فروش و خرید: پرداخت به تامین‌کننده، هزینه، دریافت نسیه و انتقال بین حساب‌ها.'), h('div', { class: 'bar' }, searchBox(v => { q = v; draw(); })), tabsHost, body);
  draw();
  return root;
}

export function returns() {
  let q = ''; const tbl = h('div');
  const draw = () => {
    const rows = S.returns.filter(r => match(q, r.no, S.I[r.item_id].name, r.holder)).sort(sortNew);
    tbl.replaceChildren(dtable([
      { label: 'شماره', main: true, render: r => h('span', null, r.no, ' ', r.voided ? pill('باطل', 'red') : null) }, { label: 'تاریخ', render: r => jstr(r.date) },
      { label: 'نوع', render: r => (r.kind === 'customer' ? pill('از مشتری', 'blue') : pill('به تامین‌کننده', 'gray')) }, { label: 'کالا', render: r => S.I[r.item_id].name }, { label: 'تعداد', cls: 'num', render: r => r.qty },
      { label: 'وضعیت', hm: true, render: r => (r.kind === 'customer' ? r.condition + (r.to_supplier ? ' · به تامین‌کننده' : '') : '') },
      { label: 'پول برگشتی', cls: 'num', render: r => (r.refund_amount + r.debt_cancel ? N(r.refund_amount + r.debt_cancel) : '') }, { label: 'اعتبار تامین‌کننده', cls: 'num', hm: true, render: r => (r.supplier_credit ? N(r.supplier_credit) : '') },
      { label: 'سود / ضرر', cls: 'num', render: r => N(r.profit_effect, r.profit_effect < 0 ? 'neg' : 'pos') }, { label: 'ثبت‌کننده', hm: true, render: r => r.created_by }
    ], rows, { rowCls, empty: 'مرجوعی ثبت نشده', onRow: r => entryDetail('return', 'مرجوعی ' + r.no, [['تاریخ', jstr(r.date)], ['کالا', S.I[r.item_id].name + ' × ' + r.qty], ['دسته', S.LOT[r.lot_id].lot_no], r.sale_line_id ? ['فروش', S.SALE[S.saleLines.find(l => l.id === r.sale_line_id).sale_id].no] : null,
      r.kind === 'customer' ? ['وضعیت', r.condition + (r.to_supplier ? ' · به تامین‌کننده پس داده شد' : ' · پیش خودمان')] : null,
      r.refund_amount ? ['پول برگشتی', h('span', null, N(r.refund_amount), ' از ', accName(r.refund_account_id))] : null, r.debt_cancel ? ['کسر از بدهی مشتری', N(r.debt_cancel)] : null, r.supplier_credit ? ['اعتبار نزد تامین‌کننده', N(r.supplier_credit)] : null,
      ['اثر بر سود', N(r.profit_effect, r.profit_effect < 0 ? 'neg' : 'pos')], r.note ? ['توضیح', r.note] : null], r) }));
  };
  draw();
  return h('div', null, head('مرجوعی', [btn('برگشت به تامین‌کننده', () => supplierReturnForm(), 'ghost'), btn('＋ مرجوعی از مشتری', () => returnForm())], 'کالای سالم به موجودی برمی‌گردد؛ معیوب ضرر می‌شود؛ اگر به تامین‌کننده پس بدهیم، از بدهی او کم می‌شود.'),
    h('div', { class: 'bar' }, searchBox(v => { q = v; draw(); })), tbl);
}
