import { h, toast, jlong, todayISO } from './util.js';
import { S, api, apiBase, apiConfigured, getToken, setToken, loadAll, bus, authBus, errText, reportError } from './store.js';
import * as dash from './pages/dashboard.js';
import * as trade from './pages/trade.js';
import * as stock from './pages/stock.js';
import * as pay from './pages/pay.js';
import * as fin from './pages/finance.js';
import * as master from './pages/master.js';
import * as help from './pages/help.js';
import * as cust from './pages/customers.js';
import * as hist from './pages/history.js';
import * as diag from './pages/diag.js';
import * as savelog from './pages/savelog.js';
import * as calc from './pages/calc.js';
import * as ana from './pages/analysis_page.js';
import * as rep from './pages/reports.js';
import * as meet from './pages/meeting.js';
import * as stk from './pages/stocktake.js';
import { onOutbox, initOutbox, pendingCount, blockedCount, pump, state as obState } from './outbox.js';
import { saleForm, purchaseForm } from './forms_trade.js';
import { navCounts } from './insights.js';
import { THEMES, currentTheme, chooseTheme, loadTheme } from './theme.js';
import { fmt } from './util.js';

const ROUTES = {
  '': { t: 'خانه', i: '⌂', f: () => dash.render() },
  sales: { t: 'فروش', i: '🛍', f: q => trade.sales(q) },
  purchases: { t: 'خرید', i: '📦', f: () => trade.purchases() },
  stock: { t: 'موجودی', i: '▤', f: q => stock.render(q) },
  pay: { t: 'پرداخت‌ها', i: '💳', f: q => pay.render(q, 'sup') },
  expenses: { t: 'هزینه‌ها', i: '🧾', f: q => pay.render(q, 'exp') },
  returns: { t: 'مرجوعی فروش', i: '↩', f: () => pay.returns('customer') },
  sreturns: { t: 'مرجوعی خرید', i: '↪', f: () => pay.returns('supplier') },
  customers: { t: 'مشتریان و طلب‌ها', i: '👥', f: q => cust.render(q) },
  invoices: { t: 'بدهی به تامین‌کننده', i: '📄', f: () => trade.invoices() },
  finance: { t: 'مالی', i: '◎', f: () => fin.render() },
  stocktake: { t: 'انبارگردانی', i: '☑', f: () => stk.render() },
  items: { t: 'کالاها', i: '🏷', f: () => master.items() },
  suppliers: { t: 'تامین‌کنندگان', i: '🏭', f: () => master.suppliers() },
  history: { t: 'تاریخچه', i: '🕘', f: () => hist.render() },
  help: { t: 'راهنما و پشتیبان', i: '?', f: () => help.render() },
  analysis: { t: 'تحلیل', i: '🔍', f: () => ana.render() },
  calc: { t: 'محاسبات و درصد سود', i: '％', f: () => calc.render() },
  pnl: { t: 'صورت سود و زیان', i: '📒', f: () => rep.pnlPage() },
  meeting: { t: 'گزارش جلسه', i: '🧑‍💼', f: () => meet.render() },
  settle: { t: 'حساب‌وکتاب ماهانه', i: '🤝', f: () => rep.settlePage() },
  savelog: { t: 'گزارش ذخیره', i: '✔', f: () => savelog.render() },
  diag: { t: 'عیب‌یابی', i: '🛠', f: () => diag.render() },
  settings: { t: 'تم رنگی', i: '🎨', f: () => h('div', null, h('div', { class: 'phead' }, h('h1', null, 'تنظیمات ظاهر')), h('p', { class: 'hint' }, 'تمی که انتخاب می‌کنی فقط برای خودت و روی همین دستگاه می‌ماند.'), themePanel(true), h('h3', { class: 'sec' }, 'حساب کاربری'), h('div', { class: 'card' }, h('p', null, 'وارد شده با نام «' + S.me.name + '».'), logoutBtn())) }
};
/* منوی کناری در پنج گروه (زیرمجموعه‌ها با کلیک روی عنوان باز و بسته می‌شوند) */
const GROUPS = [
  { id: 'dash', t: 'داشبورد', i: '▦', kids: ['', 'analysis', 'pnl', 'calc'] },
  { id: 'sales', t: 'فروش', i: '🛍', kids: ['sales', 'customers', 'returns'] },
  { id: 'buy', t: 'خرید', i: '📦', kids: ['purchases', 'suppliers', 'sreturns'] },
  { id: 'wh', t: 'انبار', i: '▤', kids: ['stock', 'stocktake', 'items'] },
  { id: 'money', t: 'مالی', i: '◎', kids: ['finance', 'pay', 'invoices', 'settle'] },
  { id: 'set', t: 'تنظیمات', i: '⚙', kids: ['settings', 'history', 'help', 'savelog', 'diag'] }
];
const NAVLBL = { sales: 'فاکتور فروش', purchases: 'فاکتور خرید', finance: 'خلاصه‌ی مالی', pay: 'پرداخت و هزینه', calc: 'محاسبات درصد', pnl: 'سود و زیان ماهانه', meeting: 'گزارش جلسه‌ی دو هفته‌ای', settle: 'حساب‌وکتاب ماهانه' };
const BLBL = { '': 'خانه', sales: 'فروش', purchases: 'خرید', stock: 'موجودی', finance: 'مالی' };
const navLabel = (k, cls) => (cls === 'bl' && BLBL[k]) || (k === '' && isAdmin() ? 'داشبورد مدیریت' : NAVLBL[k] || ROUTES[k].t);
const isAdmin = () => !!(S.me && S.me.role === 'admin');
const groupOf = k => (GROUPS.find(g => g.kids.includes(k)) || {}).id;
let grpEls = [];
const navKey = () => 'mara.nav.' + ((S.me && S.me.name) || '');
function savedOpen() { try { return new Set(JSON.parse(localStorage.getItem(navKey()) || '[]')); } catch (e) { return new Set(); } }
function saveOpen() { try { localStorage.setItem(navKey(), JSON.stringify([...new Set(grpEls.filter(x => x.el.classList.contains('open')).map(x => x.g.id))])); } catch (e) { /* بدون ذخیره هم کار می‌کند */ } }
function setGroup(id, open, persist = true) {
  grpEls.filter(x => x.g.id === id).forEach(x => { x.el.classList.toggle('open', open); x.btn.setAttribute('aria-expanded', String(open)); });
  if (persist) saveOpen();
}
const BOTTOM = ['', 'sales', 'purchases', 'stock', 'finance'];
const app = document.getElementById('app');
let view, navEls = [];

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, ''); const [path, qs] = raw.split('?');
  return { path: path || '', q: new URLSearchParams(qs || '') };
}
function route() {
  if (!view) return;
  let { path, q } = parseHash();
  if ((path === 'diag' || path === 'analysis' || path === 'pnl' || path === 'meeting') && !(S.me && S.me.role === 'admin')) { path = ''; history.replaceState(null, '', '#/'); }
  if (path === 'settle' && (!S.me || S.me.role === 'viewer')) { path = ''; history.replaceState(null, '', '#/'); }
  const r = ROUTES[path] || ROUTES[''];
  const key = ROUTES[path] ? path : '';
  document.title = `${r.t} · MARA INTIMATES`;
  navEls.forEach(a => a.classList.toggle('on', a.dataset.r === key));
  navEls.forEach(a => (a.dataset.r === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const gid = groupOf(key); if (gid) setGroup(gid, true, false); grpEls.forEach(x => x.btn.classList.toggle('hon', x.g.id === gid));
  try { view.replaceChildren(r.f(q)); } catch (e) { console.error(e); reportError('E_UI_RENDER', e.message, 'ui.page.' + key, e.stack); view.replaceChildren(h('div', { class: 'card' }, h('h2', null, 'خطا در نمایش صفحه'), h('p', null, e.message), h('p', { class: 'hint' }, `کد: E_UI_RENDER · صفحه: ${key || 'خانه'} (به‌صورت خودکار برای مدیر ثبت شد)`))); }
  window.scrollTo(0, 0); paintCounts();
}
/* ---- شمارنده‌ی جلوی نام هر زبانه ---- */
const TONE_FA = { red: 'مورد فوری', amber: 'مورد باز', info: 'مورد', zero: 'بدون مورد باز' };
function paintCounts() {
  if (!view || !S.loaded) return;
  let c; try { c = navCounts(); } catch (e) { console.error(e); reportError('E_UI_COUNT', e.message, 'ui.counts', e.stack); return; }
  navEls.forEach(a => {
    const k = a.dataset.r, o = c[k], b = a.querySelector('.cnt'); if (!b || !o) { if (b) b.hidden = true; return; }
    if (!o.q && o.tone !== 'red' && o.tone !== 'amber') { b.hidden = true; return; } // فقط کار باز شمارنده دارد
    b.hidden = false; b.className = 'cnt ' + o.tone; b.textContent = o.q ? '؟' : fmt(o.n);
    b.setAttribute('aria-label', `${o.q ? 'نامشخص' : fmt(o.n)} ${TONE_FA[o.tone]}`);
  });
  grpEls.forEach(x => {
    let n = 0, red = false;
    x.kids.forEach(k => { const o = c[k]; if (o && !o.q && (o.tone === 'red' || o.tone === 'amber')) { n = Math.max(n, o.n); if (o.tone === 'red') red = true; } });
    x.cnt.hidden = !n; x.cnt.className = 'cnt ' + (red ? 'red' : 'amber'); x.cnt.textContent = fmt(n);
    x.cnt.setAttribute('aria-label', `${fmt(n)} مورد باز در ${x.g.t}`);
  });
  const mc = document.getElementById('menucnt');
  if (mc) { const tot = Object.values(c).reduce((a, o) => a + (o.tone === 'red' || o.tone === 'amber' ? o.n : 0), 0); mc.hidden = !tot; mc.textContent = fmt(tot); mc.setAttribute('aria-label', fmt(tot) + ' مورد باز در همه‌ی بخش‌ها'); }
}
async function loadDiagCount() {
  if (!(S.me && S.me.role === 'admin')) return;
  try { const r = await api('/api/diagnostics/'); const since = Date.now() - 24 * 3600 * 1000; S.diagErrors = (r.data.errors || []).filter(e => new Date(e.at).getTime() > since).length; }
  catch { S.diagErrors = null; }
  paintCounts();
}
let staleErr = null, staleTimer = null, staleN = 0;
async function refresh() {
  document.body.classList.add('busy');
  try {
    await loadAll(); route(); loadDiagCount();
    if (staleErr) { staleErr = null; staleN = 0; clearTimeout(staleTimer); toast('اطلاعات دوباره از سرور رسید ✔'); renderBar(); }
  } catch (e) {
    staleErr = e; renderBar(); clearTimeout(staleTimer);
    staleTimer = setTimeout(refresh, Math.min(60000, 6000 * 2 ** staleN++));
  } finally { document.body.classList.remove('busy'); }
}
bus.refresh = refresh;

/* ---- نوار وضعیت ذخیره: ثبت‌های در انتظار، خطاهای نیازمند بررسی، آفلاین بودن، اطلاعات قدیمی ---- */
function renderBar() {
  const bar = document.getElementById('savebar'); if (!bar) return;
  const p = pendingCount(), b = blockedCount(), parts = [];
  const last = obState().items.filter(i => i.status === 'pending').map(i => i.code).filter(Boolean).pop();
  if (!navigator.onLine) parts.push(h('div', { class: 'sb red' }, h('b', null, '📵 اینترنت قطع است. '), 'تا وصل شدن، ثبت‌ها نگه داشته می‌شوند و بعد خودکار ذخیره می‌شوند.'));
  if (staleErr) parts.push(h('div', { class: 'sb amber' }, h('b', null, '⚠ اطلاعات از سرور نیامد. '), `آنچه می‌بینی ممکن است قدیمی باشد؛ خودکار دوباره تلاش می‌کنیم [${staleErr.code || 'E_NETWORK'}]. `,
    h('button', { type: 'button', class: 'btn sm', onclick: () => refresh() }, 'همین حالا')));
  if (p) parts.push(h('div', { class: 'sb amber' }, h('b', null, `⏳ ذخیره نشد! ${p} ثبت هنوز در سرور ننشسته. `), 'صبر کنید و صفحه را نبندید؛ خودکار دوباره تلاش می‌کنیم' + (last ? ` [${last}]` : '') + '. ',
    h('button', { type: 'button', class: 'btn sm', onclick: () => pump(true) }, 'الان تلاش کن'), h('a', { href: '#/savelog', class: 'btn sm' }, 'گزارش ذخیره')));
  if (b) parts.push(h('div', { class: 'sb red' }, h('b', null, `⚠ ${b} ثبت رد شد و ذخیره نشد. `), 'سرور آن را قبول نکرد؛ جزئیات و راه حل در گزارش ذخیره است. ', h('a', { href: '#/savelog', class: 'btn sm' }, 'ببین')));
  bar.hidden = !parts.length; bar.replaceChildren(...parts); paintCounts();
}
onOutbox((type, d) => {
  if (type === 'queued') { toast('ذخیره نشد! این ثبت در صف ذخیره ماند و خودکار دوباره تلاش می‌شود. تا پیام «ذخیره شد» نیامده صفحه را نبند.' + (d.stored ? '' : ' (مرورگر اجازه‌ی نگهداری نمی‌دهد؛ اگر صفحه بسته شود از بین می‌رود.)'), 'warn'); }
  if (type === 'saved') { toast(`✔ ذخیره شد: ${d.item.label}${d.result && d.result.no ? ' · ' + d.result.no : ''}${d.replayed ? ' (قبلاً رسیده بود)' : ''}`, 'ok', 5000); refresh(); }
  if (type === 'blocked') toast(`ذخیره نشد: ${d.item.label}. ${d.item.error}`, 'err', 12000);
  renderBar();
});
window.addEventListener('online', () => { renderBar(); if (staleErr) refresh(); }); window.addEventListener('offline', renderBar);

async function logout() { if (!confirm('از حساب «' + S.me.name + '» خارج می‌شوی؟')) return; try { await api('/api/auth/logout/', { method: 'POST' }); } catch {} setToken(null); location.reload(); }
const logoutBtn = (cls = '') => h('button', { type: 'button', class: 'btn danger ghost sm logout ' + cls, onclick: logout }, '⎋ خروج از حساب');

function themePanel(startOpen = false) {
  const wrap = h('section', { class: 'themebar', 'aria-label': 'تم رنگی' });
  const strip = t => h('span', { class: 'tb-sw', 'aria-hidden': 'true' }, t.sw.map(c => h('i', { style: { background: c } })));
  const draw = open => {
    const cur = currentTheme();
    wrap.replaceChildren(
      h('button', { type: 'button', class: 'tb-btn', id: 'themebtn', 'aria-expanded': String(open), 'aria-controls': 'themegrid', onclick: () => draw(!open) }, strip(cur), h('b', null, '🎨 تم رنگی'), h('small', null, cur.name), h('span', { class: 'tb-arrow', 'aria-hidden': 'true' }, open ? '▲' : '▼')),
      h('div', { class: 'tb-grid', id: 'themegrid', role: 'radiogroup', 'aria-label': 'انتخاب تم رنگی', hidden: !open },
        THEMES.map(t => h('button', { type: 'button', class: 'tb-opt' + (t.id === cur.id ? ' on' : ''), role: 'radio', 'aria-checked': String(t.id === cur.id), 'data-theme-id': t.id,
          onclick: () => { chooseTheme(t.id, S.me.name); toast(`تم «${t.name}» انتخاب شد و برایت می‌ماند ✔`); draw(true); if (!document.querySelector('.ov')) route(); } },
          strip(t), h('b', null, t.name, t.id === cur.id ? h('span', { class: 'ok' }, '✓ فعلی') : null), h('small', null, t.desc)))));
  };
  draw(startOpen); return wrap;
}

function shell() {
  const mk = (k, cls) => { const r = ROUTES[k]; const a = h('a', { href: '#/' + k, 'data-r': k, class: cls }, h('span', { class: 'ni', 'aria-hidden': 'true' }, r.i), h('b', { class: 'cnt zero', 'data-c': k, role: 'status' }, '۰'), h('span', { class: 'nt' }, navLabel(k, cls))); navEls.push(a); return a; };
  navEls = []; grpEls = [];
  const grp = (g, cls) => {
    const kids = g.kids.filter(k => (k !== 'diag' && k !== 'calc' && k !== 'analysis' && k !== 'pnl' && k !== 'meeting') || isAdmin()).filter(k => k !== 'settle' || (S.me && S.me.role !== 'viewer'));
    const cnt = h('b', { class: 'cnt amber', hidden: true, role: 'status' });
    const kidsEl = h('div', { class: 'gk', id: `gk-${cls}-${g.id}` }, kids.map(k => mk(k, cls)));
    const btn = h('button', { type: 'button', class: 'gh', 'aria-expanded': 'false', 'aria-controls': kidsEl.id, onclick: () => setGroup(g.id, !el.classList.contains('open')) },
      h('span', { class: 'ni', 'aria-hidden': 'true' }, g.i), cnt, h('span', { class: 'nt' }, g.t), h('span', { class: 'chev', 'aria-hidden': 'true' }, '▾'));
    const el = h('div', { class: 'grp' }, btn, kidsEl);
    grpEls.push({ g, kids, el, btn, cnt }); return el;
  };
  const navList = cls => GROUPS.map(g => grp(g, cls));
  const drawer = h('div', { class: 'drawer', hidden: true, onclick: e => { if (e.target === drawer || e.target.closest('a')) drawer.hidden = true; } },
    h('nav', { class: 'dnav', 'aria-label': 'همه‌ی بخش‌ها' }, h('div', { class: 'dh' }, h('b', null, 'همه‌ی بخش‌ها'), h('button', { type: 'button', class: 'x', 'aria-label': 'بستن', onclick: () => { drawer.hidden = true; } }, '✕')), navList('dl'), h('div', { class: 'dfoot' }, logoutBtn())));
  document.body.classList.toggle('ro', !!(S.me && S.me.role === 'viewer'));
  view = h('main', { id: 'view', tabindex: '-1' });
  app.replaceChildren(
    h('a', { href: '#view', class: 'skip' }, 'رفتن به محتوا'),
    h('aside', { class: 'side' }, h('div', { class: 'brand' }, h('img', { class: 'brand-mark', src: 'icons/logo-mark.jpg', alt: 'MR', width: 40, height: 40 }), h('div', null, h('b', null, 'MARA'), h('small', null, 'INTIMATES'))),
      h('nav', { 'aria-label': 'بخش‌ها' }, navList('sl')),
      h('div', { class: 'who' }, h('div', { class: 'av' }, S.me.name[0]), h('div', null, h('b', null, S.me.name), h('small', null, jlong(todayISO())))), logoutBtn('side-out')),
    h('header', { class: 'top' }, h('button', { type: 'button', class: 'menu', 'aria-label': 'منو', onclick: () => { drawer.hidden = false; } }, '☰', h('b', { class: 'cnt red', id: 'menucnt', hidden: true })), h('div', { class: 'brand sm' }, h('img', { class: 'brand-mark', src: 'icons/logo-mark.jpg', alt: 'MR', width: 40, height: 40 }), h('b', null, 'MARA')), h('div', { class: 'av' }, S.me.name[0])),
    h('div', { class: 'content' }, h('div', { id: 'savebar', hidden: true, role: 'status', 'aria-live': 'polite' }), view), drawer,
    h('nav', { class: 'bottom', 'aria-label': 'ناوبری اصلی' }, BOTTOM.map(k => mk(k, 'bl'))),
    h('div', { class: 'progress' }));
  const op = savedOpen(); GROUPS.forEach(g => setGroup(g.id, op.has(g.id), false));
}

const brandBig = () => h('div', { class: 'brand big' }, h('img', { class: 'logo-full', src: 'icons/logo-full.jpg', alt: 'MARA INTIMATES', width: 360, height: 233 }));

/* سرور رایگان Render بعد از بی‌کاری می‌خوابد؛ اینجا منتظر بیدار شدنش می‌مانیم و وضعیت را نشان می‌دهیم */
async function wakeServer(setStatus) {
  const t0 = Date.now();
  for (let i = 0; i < 14; i++) {
    try { const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 9000); const r = await fetch(apiBase() + '/api/health/', { signal: ctl.signal }); clearTimeout(tm); let j = null; try { j = await r.json(); } catch {}
      if (j && j.ok) return { ok: true }; if (j && j.db && j.db.ok === false) return { ok: false, code: 'E_DB_DOWN', msg: 'سرور بالاست ولی به دیتابیس وصل نیست. ' + (j.db.hint || '') };
      if (r.status >= 400 && !j) { /* هنوز در حال بالا آمدن */ } } catch {}
    setStatus(Math.round((Date.now() - t0) / 1000));
    await new Promise(r => setTimeout(r, 4000));
  }
  return { ok: false, code: 'E_SERVER_DOWN', msg: 'سرور بعد از ۱٫۵ دقیقه جواب نداد. ۱) آدرس ' + apiBase() + '/api/health/ را در مرورگر باز کن. ۲) در Render وضعیت سرویس «Live» باشد. ۳) API_URL در js/config.js درست باشد.' };
}

function showLogin(msg, mode = 'pass') {
  const ident = h('input', { class: 'inp', type: 'text', autocomplete: 'username', dir: 'ltr', placeholder: 'ایمیل یا شماره‌ی موبایل', 'aria-label': 'ایمیل یا موبایل', required: true });
  const pass = h('input', { class: 'inp', type: 'password', autocomplete: 'current-password', dir: 'ltr', placeholder: 'رمز عبور', 'aria-label': 'رمز عبور' });
  const code = h('input', { class: 'inp', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', dir: 'ltr', placeholder: 'کد ۶ رقمی بله', 'aria-label': 'کد', hidden: true });
  const err = h('div', { class: 'warnbox', hidden: !msg, role: 'alert' }, msg || '');
  const wake = h('div', { class: 'wake', hidden: true });
  const b = h('button', { class: 'btn primary lg', type: 'submit' }, mode === 'pass' ? 'ورود' : 'ارسال کد (بله و تلگرام)');
  let otpSent = false;
  const alt = h('button', { type: 'button', class: 'alt', onclick: () => showLogin('', mode === 'pass' ? 'otp' : 'pass') }, mode === 'pass' ? 'ورود با کد بله (بدون رمز)' : 'ورود با رمز');
  if (mode === 'otp') pass.hidden = true;
  const showErr = e => { err.hidden = false; err.textContent = errText(e); };
  const f = h('form', { class: 'login', onsubmit: async ev => {
    ev.preventDefault(); err.hidden = true; b.disabled = true; const old = b.textContent; b.textContent = 'لطفاً صبر کن…';
    try {
      if (mode === 'pass') { const r = await api('/api/auth/login/', { method: 'POST', body: { identifier: ident.value.trim(), password: pass.value } }); setToken(r.data.token); return start(); }
      if (!otpSent) { await api('/api/auth/otp/request/', { method: 'POST', body: { identifier: ident.value.trim() } }); otpSent = true; code.hidden = false; code.focus(); b.textContent = 'ورود'; b.disabled = false; err.hidden = false; err.textContent = 'کد در بله برایت فرستاده شد.'; err.className = 'wake'; return; }
      const r = await api('/api/auth/otp/verify/', { method: 'POST', body: { identifier: ident.value.trim(), code: code.value.trim() } }); setToken(r.data.token); return start();
    } catch (e) { showErr(e); err.className = 'warnbox'; b.textContent = old; b.disabled = false; }
  } }, brandBig(), h('h1', null, 'ورود به حسابداری'), wake, err, ident, pass, code, b, alt, h('p', { class: 'hint center' }, 'رمز را فراموش کردی؟ از حمیدرضا بخواه عوضش کند.'));
  app.replaceChildren(h('div', { class: 'login-wrap' }, f));
  if (!showLogin.woke) {
    b.disabled = true; wake.hidden = false; wake.textContent = 'در حال اتصال به سرور…';
    wakeServer(sec => { wake.textContent = `سرور رایگان Render در حال بیدار شدن است (${sec} ثانیه)… تا ۱ دقیقه طول می‌کشد.`; }).then(r => {
      if (r.ok) { showLogin.woke = true; wake.hidden = true; b.disabled = false; } else { wake.className = 'wake bad'; wake.textContent = `${r.msg} [کد ${r.code}]`; b.disabled = false; }
    });
  }
}
function showMsg(title, text, extra) { app.replaceChildren(h('div', { class: 'login-wrap' }, h('div', { class: 'login' }, h('h1', null, title), h('p', null, text), extra))); }

async function start() {
  const st = h('p', { class: 'center' }, 'در حال بارگذاری…');
  app.replaceChildren(h('div', { class: 'login-wrap' }, h('div', { class: 'login' }, brandBig(), st)));
  try {
    if (!showLogin.woke) {
      const w = await wakeServer(sec => { st.textContent = `سرور رایگان Render در حال بیدار شدن است (${sec} ثانیه)… تا ۱ دقیقه طول می‌کشد.`; });
      if (!w.ok) return showMsg('سرور جواب نمی‌دهد', `${w.msg} [کد ${w.code}]`, h('button', { class: 'btn primary', onclick: () => location.reload() }, 'تلاش دوباره'));
      showLogin.woke = true;
    }
    await loadAll(); loadTheme(S.me.name); shell(); initOutbox(); renderBar(); pump(true); if (!location.hash) location.hash = '#/'; route();
  } catch (e) {
    if (['E_AUTH_BAD', 'E_AUTH_EXPIRED', 'E_AUTH_REQUIRED'].includes(e.code)) { setToken(null); return showLogin('نشست تمام شده؛ دوباره وارد شو.'); }
    showMsg('خطا در اتصال', errText(e), h('button', { class: 'btn primary', onclick: () => location.reload() }, 'تلاش دوباره'));
  }
}
authBus.onLost = () => { if (S.loaded) { S.loaded = false; setToken(null); showLogin('نشست تمام شده؛ دوباره وارد شو.'); } };

async function boot() {
  if (!apiConfigured()) return showMsg('نصب کامل نشده', 'فایل js/config.js هنوز با آدرس سرور (Render) پر نشده. مرحله‌ی «اتصال فرانت» در راهنما را انجام بده.');
  if (!getToken()) return showLogin();
  start();
}
// هر خطای ناگهانی برنامه به سرور گزارش می‌شود تا در «عیب‌یابی» دیده شود
window.addEventListener('error', e => reportError('E_UI_JS', e.message, 'ui.window ' + (e.filename || '').split('/').pop() + ':' + e.lineno, e.error && e.error.stack));
window.addEventListener('unhandledrejection', e => { const r = e.reason || {}; if (r.code && r.code.startsWith('E_')) return; reportError('E_UI_PROMISE', r.message || String(r), 'ui.promise', r.stack); });
window.addEventListener('hashchange', route);
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (S.loaded && hiddenAt && Date.now() - hiddenAt > 45000 && !document.querySelector('.ov')) refresh();
});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !window.__MARA_API__) navigator.serviceWorker.register('./sw.js').catch(() => {});
boot();
