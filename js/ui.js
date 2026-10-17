// اجزای رابط: مودال، چیپ، فیلد عدد، تاریخ شمسی، کومبو، جدول
import { h, fa2en, parseNum, fmt, norm, todayISO, toJ, fromJ, jMonthLen, JM, toast, addDaysISO, jstr } from './util.js';
import { errText } from './store.js';

/* ---------- مودال / شیت ---------- */
const modalStack = [];
export const closeTopModal = () => { const m = modalStack[modalStack.length - 1]; if (m) m.close(); };
export function modal({ title, body, footer, wide = false, onClose }) {
  const prevFocus = document.activeElement;
  let closed = false; const me = { close: () => close() };
  const onKey = e => { if (e.key !== 'Escape') return; const all = document.querySelectorAll('.ov'); if (all[all.length - 1] === ov) close(); };
  const close = () => { if (closed) return; closed = true; document.removeEventListener('keydown', onKey); const mi = modalStack.indexOf(me); if (mi >= 0) modalStack.splice(mi, 1); ov.remove(); if (!document.querySelector('.ov')) document.body.classList.remove('lock'); if (onClose) onClose(); if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch {} };
  const hd = h('div', { class: 'sheet-h' }, h('h2', null, title), h('button', { class: 'x', type: 'button', 'aria-label': 'بستن', onclick: close }, '✕'));
  const bd = h('div', { class: 'sheet-b' }, body);
  const ft = footer ? h('div', { class: 'sheet-f' }, footer) : null;
  const ov = h('div', { class: 'ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onmousedown: e => { if (e.target === ov) close(); } },
    h('div', { class: 'sheet' + (wide ? ' wide' : '') }, hd, bd, ft));
  document.addEventListener('keydown', onKey); modalStack.push(me);
  document.body.append(ov); document.body.classList.add('lock');
  setTimeout(() => { const f = bd.querySelector('input:not([type=hidden]),select,button'); if (f && window.innerWidth > 800) f.focus(); }, 30);
  return { el: ov, body: bd, footer: ft, close };
}
export function confirmBox(message, okLabel = 'بله، انجام بده', danger = false) {
  return new Promise(res => {
    let done = false;
    const fin = v => { if (done) return; done = true; m.close(); res(v); };
    const m = modal({
      title: 'تأیید', body: h('p', { class: 'confirm-t' }, message),
      footer: [h('button', { class: 'btn ghost', type: 'button', onclick: () => fin(false) }, 'انصراف'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onclick: () => fin(true) }, okLabel)],
      onClose: () => { if (!done) { done = true; res(false); } }
    });
  });
}
export function promptBox(message, placeholder = '') {
  return new Promise(res => {
    let done = false;
    const inp = h('input', { type: 'text', placeholder, class: 'inp' });
    const fin = v => { if (done) return; done = true; m.close(); res(v); };
    const m = modal({
      title: message, body: inp,
      footer: [h('button', { class: 'btn ghost', type: 'button', onclick: () => fin(null) }, 'انصراف'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => fin(inp.value.trim() || null) }, 'تأیید')],
      onClose: () => { if (!done) { done = true; res(null); } }
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') fin(inp.value.trim() || null); });
  });
}

/* ---------- فیلد با برچسب ---------- */
export function field(label, ctrl, hint, cls = '') {
  return h('div', { class: 'fld ' + cls }, label ? h('label', { class: 'lbl' }, label) : null, ctrl, hint ? h('div', { class: 'hint' }, hint) : null);
}

/* ---------- چیپ‌ها (انتخاب تکی) ---------- */
export function chips(options, value, onChange, { cls = '', label = '' } = {}) {
  let cur = value;
  const wrap = h('div', { class: 'chips ' + cls, role: 'radiogroup', 'aria-label': label });
  const draw = () => {
    wrap.replaceChildren(...options.map(o => {
      const on = o.v === cur;
      return h('button', {
        type: 'button', class: 'chip' + (on ? ' on' : ''), role: 'radio', 'aria-checked': on ? 'true' : 'false', disabled: o.disabled || null,
        onclick: () => { cur = o.v; draw(); onChange && onChange(cur); }
      }, o.label, o.sub ? h('small', null, o.sub) : null);
    }));
  };
  draw();
  wrap.get = () => cur; wrap.set = v => { cur = v; draw(); };
  return wrap;
}

/* ---------- انتخاب حساب (شرکت/جیب شخصی) ---------- */
export function accountPicker(accounts, value, onChange, { pockets = true, balances } = {}) {
  const biz = accounts.filter(a => a.kind !== 'pocket'), pk = accounts.filter(a => a.kind === 'pocket');
  let cur = value;
  const wrap = h('div', { class: 'accpick' });
  const draw = () => {
    const mk = list => list.map(a => h('button', {
      type: 'button', class: 'chip' + (a.id === cur ? ' on' : ''), role: 'radio', 'aria-checked': a.id === cur ? 'true' : 'false',
      onclick: () => { cur = a.id; draw(); onChange && onChange(cur); }
    }, a.name, balances ? h('small', null, fmt(balances(a.id))) : null));
    wrap.replaceChildren(
      h('div', { class: 'grp-t' }, 'حساب‌های کسب‌وکار'), h('div', { class: 'chips', role: 'radiogroup' }, mk(biz)),
      ...(pockets && pk.length ? [h('div', { class: 'grp-t' }, 'جیب شخصی (سرمایه‌ی خودشان)'), h('div', { class: 'chips', role: 'radiogroup' }, mk(pk))] : []));
  };
  draw();
  wrap.get = () => cur; wrap.set = v => { cur = v; draw(); };
  return wrap;
}

/* ---------- فیلد عدد با جداکننده ---------- */
export function numField({ value = '', placeholder = '', onInput, unit = 'ریال', cls = '', max } = {}) {
  const inp = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', class: 'inp numinp', placeholder, dir: 'ltr' });
  const wrap = h('div', { class: 'numf ' + cls }, inp, unit ? h('span', { class: 'unit' }, unit) : null);
  const show = n => { inp.value = n === '' || n == null || Number.isNaN(n) ? '' : fmt(n); };
  inp.addEventListener('input', () => {
    const raw = fa2en(inp.value).replace(/[^0-9]/g, '');
    let n = raw === '' ? '' : Number(raw);
    if (max != null && n !== '' && n > max) n = max;
    show(n); onInput && onInput(n === '' ? 0 : n);
  });
  inp.addEventListener('focus', () => setTimeout(() => inp.select && inp.select(), 0));
  show(value);
  wrap.get = () => parseNum(inp.value);
  wrap.set = n => { show(n); };
  wrap.input = inp;
  return wrap;
}
export function intField({ value = 1, min = 0, max = 99999, onChange, big = false } = {}) {
  let v = value;
  const inp = h('input', { type: 'text', inputmode: 'numeric', class: 'inp stp-i', dir: 'ltr', autocomplete: 'off' });
  const set = (n, fire = true) => { n = Math.max(min, Math.min(max, Math.round(Number(n) || 0))); v = n; inp.value = String(n); if (fire && onChange) onChange(n); };
  const wrap = h('div', { class: 'stp' + (big ? ' big' : '') },
    h('button', { type: 'button', 'aria-label': 'کم کن', onclick: () => set(v - 1) }, '−'), inp,
    h('button', { type: 'button', 'aria-label': 'زیاد کن', onclick: () => set(v + 1) }, '+'));
  inp.addEventListener('input', () => { const n = parseNum(inp.value); v = Math.max(min, Math.min(max, n)); if (onChange) onChange(v); });
  inp.addEventListener('blur', () => set(v, false));
  inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
  set(value, false);
  wrap.get = () => v; wrap.set = n => set(n, false); wrap.setMax = m => { max = m; };
  return wrap;
}

/* ---------- تاریخ شمسی ---------- */
export function dateField(iso = todayISO(), onChange) {
  const [jy0, jm0, jd0] = toJ(iso);
  const yNow = toJ(todayISO())[0];
  const sy = h('select', { 'aria-label': 'سال', class: 'sel' }, [yNow - 2, yNow - 1, yNow, yNow + 1].map(y => h('option', { value: y, selected: y === jy0 }, y)));
  const sm = h('select', { 'aria-label': 'ماه', class: 'sel' }, JM.map((n, i) => h('option', { value: i + 1, selected: i + 1 === jm0 }, n)));
  const sd = h('select', { 'aria-label': 'روز', class: 'sel' });
  const fillDays = keep => {
    const len = jMonthLen(+sy.value, +sm.value); const cur = Math.min(keep, len);
    sd.replaceChildren(...Array.from({ length: len }, (_, i) => h('option', { value: i + 1, selected: i + 1 === cur }, i + 1)));
  };
  fillDays(jd0);
  const fire = () => onChange && onChange(get());
  sy.onchange = () => { fillDays(+sd.value); fire(); }; sm.onchange = () => { fillDays(+sd.value); fire(); }; sd.onchange = fire;
  const get = () => fromJ(+sy.value, +sm.value, +sd.value);
  const wrap = h('div', { class: 'jdate' }, sd, sm, sy);
  wrap.get = get;
  return wrap;
}

/* ---------- سررسید (نسیه / قسط): چند روز دیگر یا تاریخ دلخواه ---------- */
export function dueField(getBase, { label = 'تا چه زمانی می‌دهد؟' } = {}) {
  let mode = 'none', custom = null;
  const info = h('div', { class: 'hint' });
  const box = h('div', { hidden: true });
  const opts = [{ v: 'none', label: 'بدون سررسید' }, { v: 3, label: '۳ روز' }, { v: 5, label: '۵ روز' }, { v: 10, label: '۱۰ روز' }, { v: 15, label: '۱۵ روز' }, { v: 30, label: '۳۰ روز' }, { v: 'custom', label: 'تاریخ دلخواه' }];
  const get = () => (mode === 'none' ? null : mode === 'custom' ? custom : addDaysISO(getBase(), mode));
  const show = () => { const d = get(); info.textContent = d ? 'سررسید: ' + jstr(d) : 'سررسید نمی‌گذاری؛ در یادآوری‌ها نمی‌آید.'; };
  const c = chips(opts, 'none', v => { mode = v; box.hidden = v !== 'custom'; if (v === 'custom' && !custom) custom = addDaysISO(getBase(), 7); show(); }, { label });
  const dc = dateField(addDaysISO(getBase(), 7), v => { custom = v; show(); }); box.append(dc);
  const wrap = h('div', null, h('label', { class: 'lbl' }, label), c, box, info);
  wrap.get = get; wrap.refresh = show; show();
  return wrap;
}

/* ---------- کومبوی جستجو‌پذیر ---------- */
export function combo({ options = [], value = null, placeholder = 'جستجو…', onChange, onCreate, createLabel = 'افزودن', emptyText = 'موردی نیست' } = {}) {
  let opts = options, cur = value, open = false, q = '';
  const inp = h('input', { type: 'text', class: 'inp', placeholder, autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false' });
  const list = h('div', { class: 'cmb-list', role: 'listbox', hidden: true });
  const wrap = h('div', { class: 'cmb' }, inp, list);
  const labelOf = v => (opts.find(o => o.v === v) || {}).label || '';
  const render = () => {
    const nq = norm(q);
    const rows = opts.filter(o => !nq || norm(o.label + ' ' + (o.keywords || '') + ' ' + (o.sub || '')).includes(nq)).slice(0, 60);
    list.replaceChildren(...rows.map(o => h('button', {
      type: 'button', role: 'option', class: 'cmb-o' + (o.v === cur ? ' on' : ''), disabled: o.disabled || null,
      onmousedown: e => { e.preventDefault(); },
      onclick: () => { pick(o.v); }
    }, h('span', { class: 'cmb-l' }, o.label), o.sub ? h('small', null, o.sub) : null)));
    if (!rows.length) list.append(h('div', { class: 'cmb-e' }, emptyText));
    if (onCreate && q.trim()) list.append(h('button', { type: 'button', class: 'cmb-o create', onmousedown: e => e.preventDefault(), onclick: async () => { const v = await onCreate(q.trim()); if (v != null) { close(); } } }, `＋ ${createLabel} «${q.trim()}»`));
  };
  const openL = () => { open = true; list.hidden = false; inp.setAttribute('aria-expanded', 'true'); q = ''; render(); };
  const close = () => { open = false; list.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.value = labelOf(cur); };
  const pick = v => { cur = v; close(); onChange && onChange(v); };
  inp.addEventListener('focus', () => { openL(); setTimeout(() => inp.select(), 0); });
  inp.addEventListener('input', () => { q = inp.value; if (!open) openL(); else render(); });
  inp.addEventListener('blur', () => setTimeout(close, 120));
  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape') { inp.blur(); }
    if (e.key === 'Enter') { e.preventDefault(); const f = list.querySelector('.cmb-o:not(.create):not([disabled])'); if (f) f.click(); else { const c = list.querySelector('.create'); if (c) c.click(); } }
  });
  inp.value = labelOf(cur);
  wrap.get = () => cur;
  wrap.set = v => { cur = v; inp.value = labelOf(v); };
  wrap.setOptions = o => { opts = o; inp.value = labelOf(cur); if (open) render(); };
  wrap.input = inp;
  return wrap;
}

/* ---------- جدول (روی موبایل کارت می‌شود) ---------- */
export function dtable(cols, rows, { onRow, empty = 'موردی ثبت نشده است', rowCls, foot } = {}) {
  if (!rows.length) return h('div', { class: 'empty' }, empty);
  const th = h('tr', null, cols.map(c => h('th', { class: (c.cls || '') + (c.hm ? ' hm' : ''), scope: 'col' }, c.label)));
  const body = rows.map(r => {
    const tr = h('tr', { class: (rowCls ? rowCls(r) : '') + (onRow ? ' clk' : ''), tabindex: onRow ? 0 : null, role: onRow ? 'button' : null });
    if (onRow) { tr.addEventListener('click', () => onRow(r)); tr.addEventListener('keydown', e => { if (e.key === 'Enter') onRow(r); }); }
    cols.forEach(c => {
      const v = c.render ? c.render(r) : r[c.k];
      tr.append(h('td', { 'data-l': c.label, class: (c.cls || '') + (c.main ? ' main' : '') + (c.hm ? ' hm' : '') }, v == null || v === '' ? (c.cls && c.cls.includes('num') ? '' : '') : v));
    });
    return tr;
  });
  const tf = foot ? h('tfoot', null, h('tr', null, foot.map((f, i) => h('td', { 'data-l': f === 'جمع' ? '' : (cols[i] ? cols[i].label : ''), class: (cols[i] && cols[i].cls || '') + (cols[i] && cols[i].hm ? ' hm' : '') }, f)))) : null;
  return h('div', { class: 'tw' }, h('table', { class: 't' }, h('thead', null, th), h('tbody', null, body), tf));
}
export const N = (n, cls = '') => h('span', { class: 'n ' + cls + (n < 0 ? ' neg' : '') }, fmt(n));
export const pill = (text, kind = 'gray') => h('span', { class: 'pill ' + kind }, text);

/** شمارنده‌ی کوچک جلوی نام زبانه: {n, tone}؛ tone = red | amber | info | zero */
export function cntBadge(b) { const o = typeof b === 'object' ? b : { n: b, tone: b ? 'amber' : 'zero' }; return h('b', { class: 'cnt ' + o.tone, 'aria-label': fmt(o.n) + ' مورد' }, fmt(o.n)); }
export function tabsBar(tabs, active, onSel) {
  const wrap = h('div', { class: 'tabs', role: 'tablist' });
  tabs.forEach(t => wrap.append(h('button', { type: 'button', role: 'tab', 'aria-selected': t.id === active ? 'true' : 'false', class: t.id === active ? 'on' : '', onclick: () => onSel(t.id) }, t.badge ? cntBadge(t.badge) : null, t.label)));
  return wrap;
}
export function kpi(label, value, { sub = '', tone = '' } = {}) {
  return h('div', { class: 'kpi ' + tone }, h('div', { class: 'k-l' }, label), h('div', { class: 'k-v' }, value), sub ? h('div', { class: 'k-s' }, sub) : null);
}
export function dl(rows) {
  return h('dl', { class: 'dl' }, rows.filter(Boolean).map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
}
export async function run(btn, fn, okMsg) {
  if (btn.disabled) return;
  const old = btn.textContent; btn.disabled = true; btn.textContent = 'در حال ثبت…';
  try {
    const r = await fn();
    if (r && r.queued) { closeTopModal(); return undefined; }   // در صف ذخیره قرار گرفت؛ پیام و پیگیری را outbox/app نشان می‌دهند (فرم بسته می‌شود تا دوباره ثبت نشود)
    if (okMsg) toast(okMsg); return r;
  } catch (e) { toast(errText(e), 'err'); btn.disabled = false; btn.textContent = old; return undefined; }
}

/** کارت خطا با کد، محل و دکمه‌ی «دوباره تلاش کن» — برای هر صفحه‌ای که داده از سرور می‌گیرد */
export function errorBox(e, retry, what = 'این بخش') {
  return h('div', { class: 'card errbox', role: 'alert' }, h('h3', null, `${what} باز نشد`), h('p', null, errText(e)),
    h('p', { class: 'hint' }, 'اطلاعاتی از دست نرفته؛ مشکل فقط در رسیدن به سرور است.'),
    retry ? h('button', { class: 'btn primary', type: 'button', onclick: retry }, 'دوباره تلاش کن') : null);
}
