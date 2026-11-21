// خروجی اکسل موجودی انبار: هر کالا نزد مهسا و رعنا و جمع، مرتب‌شده از بیشترین ارزش کل (مهسا + رعنا) به کمترین؛ مانده‌ی صفر نمی‌آید.
import { jstr, jmonthKey, todayISO, toast, sum } from './util.js';
import { S, activeSales } from './store.js';
import { makeXlsx } from './xlsx_mini.js';

const dayN = d => Math.max(0, Math.round((Date.parse(todayISO() + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / 864e5));

/** ردیف‌های موجودی: فقط کالای فعال با مانده‌ی بیشتر از صفر، مرتب بر پایه‌ی ارزش کل (بیشترین اول) */
export function stockRows() {
  const vm = new Map(), vr = new Map(), oldest = new Map(), sold = new Map(), last = new Map(), ids = new Set(activeSales().map(x => x.id));
  (S.lots || []).filter(l => !l.voided).forEach(l => {
    vm.set(l.item_id, (vm.get(l.item_id) || 0) + (Number(l.value_m) || 0)); vr.set(l.item_id, (vr.get(l.item_id) || 0) + (Number(l.value_r) || 0));
    if (l.rem > 0) { const o = oldest.get(l.item_id); if (!o || l.date < o) oldest.set(l.item_id, l.date); }
  });
  S.saleLines.forEach(l => { if (!ids.has(l.sale_id)) return; sold.set(l.item_id, (sold.get(l.item_id) || 0) + l.qty); const d = S.SALE[l.sale_id].date; if (!last.get(l.item_id) || d > last.get(l.item_id)) last.set(l.item_id, d); });
  (S.returns || []).filter(r => !r.voided && r.kind === 'customer').forEach(r => sold.set(r.item_id, (sold.get(r.item_id) || 0) - r.qty));
  return (S.stock || []).filter(i => i.active && i.rem > 0).map(i => {
    const m = Math.round(vm.get(i.id) || 0), r = Math.round(vr.get(i.id) || 0), o = oldest.get(i.id), n = sold.get(i.id) || 0;
    return { name: i.name, cat: i.category || 'بدون دسته', qm: i.rem_m, qr: i.rem_r, q: i.rem, vm: m, vr: r, v: m + r, d: o ? jstr(o) : '', days: o ? dayN(o) : '', sold: n, last: n > 0 && last.get(i.id) ? jstr(last.get(i.id)) : 'هنوز فروخته نشده' };
  }).sort((a, b) => b.v - a.v || b.q - a.q);
}

export function stockWorkbook() {
  const rows = stockRows(), T = k => sum(rows, r => r[k]);
  const items = [['کالا', 'دسته', 'تعداد مهسا', 'تعداد رعنا', 'تعداد کل', 'ارزش مهسا (ریال)', 'ارزش رعنا (ریال)', 'ارزش کل (ریال)', 'قدیمی‌ترین ورود', 'روز مانده', 'خالص فروخته‌شده', 'آخرین فروش'],
    ...rows.map(r => [r.name, r.cat, r.qm, r.qr, r.q, r.vm, r.vr, r.v, r.d, r.days, r.sold, r.last]),
    ['جمع', '', T('qm'), T('qr'), T('q'), T('vm'), T('vr'), T('v'), '', '', '', '']];
  const cat = new Map(); rows.forEach(r => { const o = cat.get(r.cat) || { n: 0, qm: 0, qr: 0, q: 0, vm: 0, vr: 0, v: 0 }; o.n++; ['qm', 'qr', 'q', 'vm', 'vr', 'v'].forEach(k => { o[k] += r[k]; }); cat.set(r.cat, o); });
  const cats = [...cat.entries()].sort((a, b) => b[1].v - a[1].v);
  const bycat = [['دسته', 'تعداد قلم', 'تعداد مهسا', 'تعداد رعنا', 'تعداد کل', 'ارزش مهسا (ریال)', 'ارزش رعنا (ریال)', 'ارزش کل (ریال)'],
    ...cats.map(([k, o]) => [k, o.n, o.qm, o.qr, o.q, o.vm, o.vr, o.v]), ['جمع', rows.length, T('qm'), T('qr'), T('q'), T('vm'), T('vr'), T('v')]];
  return makeXlsx([
    { name: 'موجودی', widths: [38, 14, 12, 12, 12, 18, 18, 18, 16, 11, 14, 18], rows: items, total: true },
    { name: 'خلاصه‌ی دسته‌ها', widths: [20, 12, 12, 12, 12, 18, 18, 18], rows: bycat, total: true }]);
}

export function downloadStockXlsx() {
  try {
    const blob = stockWorkbook(), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'MARA-stock-' + todayISO() + '.xlsx';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('اکسل موجودی آماده شد');
  } catch (e) { console.error(e); toast('ساخت اکسل ناموفق بود: ' + e.message, 'err'); }
}
