// تاریخچه: هر کاری که هر نفر کرده (چه کسی، کی، چه چیزی، از کدام IP) — با جزئیات «قبل و بعد» برای مدیر
import { h, jstr, toast } from '../util.js';
import { S, api, errText } from '../store.js';
import { dtable, pill, modal, errorBox, tabsBar } from '../ui.js';
import { CHANGELOG } from '../changelog.js';
import { head, btn } from './common.js';

const ACT = { INSERT: ['ثبت', 'green'], UPDATE: ['ویرایش/ابطال', 'amber'], DELETE: ['حذف', 'red'], LOGIN: ['ورود', 'blue'], LOGIN_FAIL: ['ورود ناموفق', 'red'], LOGOUT: ['خروج', 'gray'], EXPORT: ['خروجی', 'gold'], PASSWORD: ['رمز', 'amber'], LINK: ['اتصال بات', 'blue'], LINK_FAIL: ['اتصال ناموفق', 'red'], CRON: ['کرون', 'gray'] };
const TABLES = [['', 'همه‌ی بخش‌ها'], ['sales', 'فروش'], ['purchase_invoices', 'فاکتور خرید'], ['supplier_payments', 'پرداخت به تامین‌کننده'], ['collections', 'دریافت از مشتری'], ['returns', 'مرجوعی'],
  ['expenses', 'هزینه'], ['transfers', 'انتقال'], ['stock_moves', 'جابجایی کالا'], ['items', 'کالا'], ['suppliers', 'تامین‌کننده'], ['customers', 'مشتری'], ['auth', 'ورود و خروج'], ['export', 'خروجی اکسل'], ['bot', 'بات‌ها']];
const tm = iso => { const d = new Date(iso); const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false }).format(d); return jstr(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(d)) + ' ' + t; };

export function render() {
  const st = { actor: '', table: '', noise: false, offset: 0, shown: 10, tab: 'log', clShown: 10 };
  const box = h('div'), more = h('div', { class: 'center' });
  let rows = [];
  async function load(reset) {
    if (reset) { st.offset = 0; rows = []; st.shown = 10; }
    box.classList.add('loading');
    try {
      const qs = new URLSearchParams({ limit: 100, offset: st.offset }); if (st.actor) qs.set('actor', st.actor); if (st.table) qs.set('table', st.table); if (st.noise) qs.set('noise', '1');
      const r = await api('/api/audit/?' + qs);
      rows = rows.concat(r.data.rows); st.offset += 100; draw(r.data.more);
    } catch (e) { box.replaceChildren(errorBox(e, () => load(true), 'تاریخچه')); }
    box.classList.remove('loading');
  }
  function draw(hasMore) {
    box.replaceChildren(dtable([
      { label: 'زمان', main: true, render: r => tm(r.at) }, { label: 'کاربر', render: r => r.actor || '—' }, { label: 'بخش', render: r => r.label },
      { label: 'عمل', render: r => { const a = ACT[r.action] || [r.action, 'gray']; return pill(a[0], a[1]); } },
      { label: 'شرح', cls: 'wrap', render: r => r.text }, { label: 'IP', hm: true, render: r => h('span', { dir: 'ltr' }, r.ip || '') }
    ], rows.slice(0, st.shown), { onRow: S.me.role === 'admin' ? detailOf : null, empty: 'هنوز چیزی ثبت نشده' }));
    more.replaceChildren(rows.length > st.shown || hasMore ? btn('نمایش بیشتر', () => { st.shown += 10; if (st.shown > rows.length && hasMore) load(false); else draw(hasMore); }, 'ghost') : null);
  }
  function detailOf(r) {
    const pre = o => h('pre', { class: 'json', dir: 'ltr' }, o ? JSON.stringify(o, null, 2) : '—');
    modal({ title: `جزئیات ثبت #${r.id}`, wide: true, body: h('div', null,
      h('dl', { class: 'dl' }, [['زمان', tm(r.at)], ['کاربر', `${r.actor || '—'} (${r.role === 'admin' ? 'مدیر' : r.role ? 'همکار' : 'سیستم'})`], ['بخش / شناسه‌ی ردیف', `${r.label} / ${r.row_id || '—'}`], ['IP', r.ip || '—'], ['شناسه‌ی درخواست', r.req || '—']].map(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
      h('p', null, r.text), h('h3', { class: 'sec' }, 'قبل'), pre(r.old), h('h3', { class: 'sec' }, 'بعد'), pre(r.new)) });
  }
  const names = ['', 'مهسا', 'رعنا', 'حمیدرضا'];
  const sel = (opts, cb, label) => { const s = h('select', { class: 'sel', 'aria-label': label }, opts.map(o => h('option', { value: o[0] }, o[1]))); s.onchange = () => cb(s.value); return s; };
  const dl = btn('دانلود اکسل (همه‌چیز + تاریخچه)', async e => {
    const b = e.currentTarget; b.disabled = true;
    try { const res = await api('/api/export.xlsx', { raw: true }); const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'MARA-INTIMATES.xlsx'; document.body.append(a); a.click(); a.remove(); toast('اکسل آماده شد'); }
    catch (er) { toast(errText(er), 'err'); } finally { b.disabled = false; }
  }, 'primary');
  load(true);
  const logHead = head('تاریخچه', [dl], S.me.role === 'admin' ? 'هر عمل هر نفر با زمان و IP ذخیره می‌شود و هرگز پاک یا ویرایش نمی‌شود. روی هر ردیف بزن تا «قبل و بعد» را ببینی.' : 'کارهایی که خودت انجام داده‌ای.');
  const logPane = h('div', null,
    h('div', { class: 'bar' }, S.me.role === 'admin' ? sel(names.map(n => [n, n || 'همه‌ی افراد']), v => { st.actor = v; load(true); }, 'کاربر') : null, sel(TABLES, v => { st.table = v; load(true); }, 'بخش'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', onchange: e => { st.noise = e.target.checked; load(true); } }), 'نمایش ریزهای فنی')), box, more);
  const clBox = h('div'), clMore = h('div', { class: 'center' });
  function drawCl() {
    clBox.replaceChildren(dtable([
      { label: 'تاریخ', main: true, render: r => r.d }, { label: 'نسخه', render: r => pill(r.v, 'blue') },
      { label: 'اصلاح', cls: 'wrap', render: r => h('div', null, h('b', null, r.t), h('div', { class: 'muted' }, r.x)) }
    ], CHANGELOG.slice(0, st.clShown), { empty: 'موردی نیست' }));
    clMore.replaceChildren(CHANGELOG.length > st.clShown ? btn('نمایش بیشتر', () => { st.clShown += 10; drawCl(); }, 'ghost') : null);
  }
  drawCl();
  const clPane = h('div', null, h('p', { class: 'muted' }, 'فهرست به‌ترتیب تاریخ (جدیدترین اول): چه چیزی در کدام نسخه اصلاح یا اضافه شد.'), clBox, clMore);
  const pane = h('div'), tabs = h('div');
  function show(t) {
    st.tab = t;
    tabs.replaceChildren(tabsBar([{ id: 'log', label: 'تاریخچه' }, { id: 'changes', label: 'اصلاحات MARA' }], t, show));
    pane.replaceChildren(t === 'log' ? logPane : clPane);
  }
  show('log');
  return h('div', null, logHead, tabs, pane);
}
