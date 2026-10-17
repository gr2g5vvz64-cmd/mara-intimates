import { h, fmt, jstr, norm, daysUntil } from '../util.js';
import { modal, N, pill, chips } from '../ui.js';
import { S, catNames, NO_CAT } from '../store.js';

export function head(title, actions = [], sub = '') {
  return h('div', { class: 'phead' }, h('div', null, h('h1', null, title), sub ? h('p', { class: 'sub' }, sub) : null), h('div', { class: 'acts' }, actions));
}
export const btn = (label, onclick, cls = 'primary') => h('button', { type: 'button', class: 'btn ' + cls, onclick }, label);
export function searchBox(onInput, placeholder = 'جستجو…') {
  const i = h('input', { type: 'search', class: 'inp search', placeholder, 'aria-label': placeholder });
  i.addEventListener('input', () => onInput(i.value));
  return i;
}
export const match = (q, ...parts) => !norm(q) || norm(parts.join(' ')).includes(norm(q));
export const sortNew = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id);
export const who = r => r.created_by || '';
export function voidTag(r) { return r.voided ? pill('باطل', 'red') : null; }
/** فیلتر دسته با شمارنده: «همه | شورت (۳) | سوتین (۲) | … | بدون دسته» */
export function catFilter(value, onChange, rows, catOfRow = r => (S.I[r.id] || r).category) {
  const names = catNames(), cnt = c => rows.filter(r => (c === NO_CAT ? !catOfRow(r) : catOfRow(r) === c)).length;
  const opts = [{ v: '', label: `همه (${fmt(rows.length)})` }, ...names.map(n => ({ v: n, label: `${n} (${fmt(cnt(n))})` }))];
  if (cnt(NO_CAT)) opts.push({ v: NO_CAT, label: `${NO_CAT} (${fmt(cnt(NO_CAT))})` });
  return chips(opts, value, onChange, { cls: 'catf', label: 'دسته' });
}
export const inCat = (cat, it) => !cat || (cat === NO_CAT ? !it.category : it.category === cat);
export const accName = id => (S.A[id] ? S.A[id].name : '');
export function detail({ title, rows, extra = [], actions = [] }) {
  const dl = h('dl', { class: 'dl' }, rows.filter(Boolean).map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
  return modal({ title, body: h('div', { class: 'detail' }, dl, extra), footer: actions.length ? actions : null });
}
export function stamp(r) { return `${r.created_by || ''}${r.created_at ? ' · ' + jstr(String(r.created_at).slice(0, 10)) : ''}`; }
export function totalsRow(label, n) { return h('div', { class: 'srow' }, h('span', null, label), N(n)); }
export function rowCls(r) { return r.voided ? 'void' : ''; }

/** برچسب سررسید: قرمز = گذشته، زرد = تا ۳ روز دیگر، خاکستری = بعداً */
export function dueCell(iso) {
  if (!iso) return '';
  const d = daysUntil(iso);
  if (d < 0) return pill(`${-d} روز گذشته · ${jstr(iso)}`, 'red');
  if (d === 0) return pill('امروز · ' + jstr(iso), 'amber');
  if (d <= 3) return pill(`${d} روز دیگر · ${jstr(iso)}`, 'amber');
  return pill(`${d} روز دیگر · ${jstr(iso)}`, 'gray');
}
/** دفتر حساب با مانده‌ی تجمعی. events: [{date, text, plus, minus}] */
export function ledgerTable(events, dtable, labels = e0) {
  const ev = events.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ord || 0) - (b.ord || 0)));
  let bal = 0; const rows = ev.map(e => { bal += (e.plus || 0) - (e.minus || 0); return { ...e, bal }; });
  return dtable([
    { label: 'تاریخ', main: true, render: r => jstr(r.date) }, { label: 'شرح', cls: 'wrap', render: r => r.text },
    { label: labels.plus, cls: 'num', render: r => (r.plus ? N(r.plus) : '') }, { label: labels.minus, cls: 'num', render: r => (r.minus ? N(r.minus) : '') },
    { label: 'مانده', cls: 'num', render: r => N(r.bal, r.bal > 0 ? 'neg' : '') }
  ], rows, { empty: 'گردشی ثبت نشده' });
}
const e0 = { plus: 'افزایش', minus: 'کاهش' };
