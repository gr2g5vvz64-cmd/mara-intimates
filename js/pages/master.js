import { h, fmt, jstr } from '../util.js';
import { S } from '../store.js';
import { dtable, N, pill } from '../ui.js';
import { itemForm, supplierForm, categoriesForm } from '../forms_misc.js';
import { head, btn, searchBox, match, catFilter, inCat, varFilter, inVar } from './common.js';

export function items() {
  let q = '', showOff = false, cat = ''; const vst = { color: '', size: '' }; const tbl = h('div'), catHost = h('div'), varHost = h('div');
  const draw = () => {
    catHost.replaceChildren(catFilter(cat, v => { cat = v; draw(); }, S.stock.filter(i => showOff || i.active)));
    varHost.replaceChildren(varFilter(vst, draw, S.stock.filter(i => showOff || i.active)));
    const rows = S.stock.filter(i => (showOff || i.active) && inCat(cat, i) && inVar(vst, i) && match(q, i.code, i.name, i.category, i.color, i.size)).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    tbl.replaceChildren(dtable([
      { label: 'کد', hm: false, render: i => h('b', { dir: 'ltr', class: 'icode' }, i.code || '') }, { label: 'کالا', main: true, render: i => h('span', null, i.name, ' ', i.active ? null : pill('غیرفعال', 'gray'), i.description ? h('small', { class: 'idesc-s' }, i.description) : null) }, { label: 'دسته', render: i => i.category || '' }, { label: 'موجودی', cls: 'num', render: i => i.rem },
      { label: 'هشدار از', cls: 'num', hm: true, render: i => i.min_stock }, { label: 'آخرین تمام‌شده', cls: 'num', hm: true, render: i => (i.last_cost ? N(i.last_cost) : '') }, { label: 'آخرین فی فروش', cls: 'num', hm: true, render: i => (i.last_price ? N(i.last_price) : '') }
    ], rows, { onRow: i => itemForm(S.I[i.id]), empty: 'هنوز کالایی تعریف نشده. با «خرید جدید» هم می‌توانی کالا بسازی.' }));
  };
  draw();
  return h('div', null, head('کالاها', [btn('دسته‌ها', () => categoriesForm(), 'ghost'), btn('＋ کالای جدید', () => itemForm())], 'هر ترکیب رنگ و سایز یک کد یکتا دارد؛ با کد، نام، رنگ یا سایز جستجو کن. هر کالا فقط یک بار تعریف می‌شود. نام کالای استفاده‌شده را فقط حمیدرضا، مهسا و رعنا می‌توانند عوض کنند (خرید و فروش‌های قبلی با شناسه به آن وصل‌اند و خراب نمی‌شوند).'),
    h('div', { class: 'bar' }, searchBox(v => { q = v; draw(); }), h('label', { class: 'chk' }, h('input', { type: 'checkbox', onchange: e => { showOff = e.target.checked; draw(); } }), 'نمایش غیرفعال‌ها')), catHost, varHost, tbl);
}
export function suppliers() {
  let q = ''; const tbl = h('div');
  const draw = () => {
    const rows = S.suppliers.filter(s => match(q, s.name, s.phone, s.address)).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    tbl.replaceChildren(dtable([
      { label: 'تامین‌کننده', main: true, render: s => h('span', null, s.name, ' ', s.active ? null : pill('غیرفعال', 'gray')) }, { label: 'تلفن', render: s => h('span', { dir: 'ltr' }, s.phone || '') }, { label: 'نشانی', hm: true, render: s => s.address || '' },
      { label: 'جمع خرید', cls: 'num', hm: true, render: s => N((S.vSup.find(x => x.id === s.id) || {}).goods || 0) },
      { label: 'حساب', cls: 'num', render: s => { const b = (S.vSup.find(x => x.id === s.id) || {}).balance || 0; return b > 0 ? pill('بدهکاریم ' + fmt(b), 'amber') : b < 0 ? pill('طلبکاریم ' + fmt(-b), 'blue') : ''; } }
    ], rows, { onRow: s => supplierForm(s), empty: 'هنوز تامین‌کننده‌ای ثبت نشده' }));
  };
  draw();
  return h('div', null, head('تامین‌کنندگان', [btn('＋ تامین‌کننده‌ی جدید', () => supplierForm())]), h('div', { class: 'bar' }, searchBox(v => { q = v; draw(); })), tbl);
}
