// ابزارهای عمومی: عدد، تاریخ شمسی، ساخت المان
export const div = (a, b) => Math.trunc(a / b);

/* ---------- ارقام و عدد ---------- */
const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
export function fa2en(s) {
  return String(s ?? '').replace(/[۰-۹]/g, c => FA.indexOf(c)).replace(/[٠-٩]/g, c => AR.indexOf(c))
    .replace(/[٬،,]/g, ',').replace(/٫/g, '.');
}
export function parseNum(s) {
  if (typeof s === 'number') return s;
  const t = fa2en(s).replace(/[^0-9.\-]/g, '');
  if (t === '' || t === '-' || t === '.') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}
export function fmt(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('en-US');
}
export const fmtz = n => (Math.round(Number(n) || 0) === 0 ? '' : fmt(n));
export const pct = n => (Math.round(n * 10) / 10).toString() + '٪';

/* ---------- تاریخ شمسی ---------- */
export function g2j(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + gdm[gm - 1];
  jy += 33 * div(days, 12053); days %= 12053;
  jy += 4 * div(days, 1461); days %= 1461;
  if (days > 365) { jy += div(days - 1, 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}
export function j2g(jy, jm, jd) {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days = 365 * jy + div(jy, 33) * 8 + div((jy % 33) + 3, 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * div(days, 146097); days %= 146097;
  if (days > 36524) { gy += 100 * div(--days, 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * div(days, 1461); days %= 1461;
  if (days > 365) { gy += div(days - 1, 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const sal = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (; gm < 13 && gd > sal[gm]; gm++) gd -= sal[gm];
  return [gy, gm, gd];
}
export const JM = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const WD = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const p2 = n => String(n).padStart(2, '0');
export function todayISO() {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date()); }
  catch { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
}
const parts = iso => String(iso).slice(0, 10).split('-').map(Number);
export function toJ(iso) { const [y, m, d] = parts(iso); return g2j(y, m, d); }
export function fromJ(jy, jm, jd) { const [y, m, d] = j2g(jy, jm, jd); return `${y}-${p2(m)}-${p2(d)}`; }
export function jstr(iso) { if (!iso) return ''; const [y, m, d] = toJ(iso); return `${y}/${p2(m)}/${p2(d)}`; }
export function jlong(iso) {
  const [y, m, d] = toJ(iso); const [gy, gm, gd] = parts(iso);
  const wd = WD[new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay()];
  return `${wd} ${d} ${JM[m - 1]} ${y}`;
}
export function jmonthKey(iso) { const [y, m] = toJ(iso); return `${y}-${p2(m)}`; }
export function jmonthName(key) { const [y, m] = key.split('-').map(Number); return `${JM[m - 1]} ${y}`; }
export function jMonthLen(jy, jm) {
  if (jm <= 6) return 31; if (jm <= 11) return 30;
  const [y, m, d] = j2g(jy, 12, 30); const back = g2j(y, m, d);
  return back[0] === jy && back[1] === 12 && back[2] === 30 ? 30 : 29;
}
export function addDaysISO(iso, n) {
  const [y, m, d] = parts(iso); const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}
export function daysUntil(iso) {
  const [y, m, d] = parts(iso), [ty, tm, td] = parts(todayISO());
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
}
export const START_MONTH = '1405-07';   // شروع کار: مهر ۱۴۰۵؛ ماه‌های قبل از آن در هیچ‌جا نمی‌آید
export function lastMonths(n) {
  const [jy, jm] = toJ(todayISO()); const out = [];
  for (let i = n - 1; i >= 0; i--) { let m = jm - i, y = jy; while (m < 1) { m += 12; y--; } out.push(`${y}-${p2(m)}`); }
  const ok = out.filter(k => k >= START_MONTH);
  return ok.length ? ok : out.slice(-1);
}

/* ---------- DOM ---------- */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const num = n => h('span', { class: 'n' }, fmt(n));
export function toast(msg, kind = 'ok', ms) {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + kind, role: kind === 'ok' ? 'status' : 'alert' }, msg);
  const life = ms || (kind === 'err' ? 6500 : kind === 'warn' ? 9000 : 2600);
  box.append(t); setTimeout(() => t.classList.add('out'), life); setTimeout(() => t.remove(), life + 400);
}
export function groupBy(arr, fn) { const m = new Map(); for (const x of arr) { const k = fn(x); (m.get(k) || m.set(k, []).get(k)).push(x); } return m; }
export const sum = (arr, fn = x => x) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
export function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function norm(s) { return fa2en(s).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌\s]+/g, ' ').trim(); }
