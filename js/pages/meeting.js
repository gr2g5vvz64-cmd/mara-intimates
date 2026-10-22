// گزارش جلسه‌ی دو هفته‌ای (فقط مدیر): برگه‌ی قابل چاپ برای نشست با مهسا و رعنا
import { h, fmt, jstr, jlong, todayISO, toast } from '../util.js';
import { N, pill, chips, dtable } from '../ui.js';
import { head, btn } from './common.js';
import { buildMeeting, meetingText, WINDOWS, chg } from '../meeting.js';

let winN = 14;
const TONE = { done: 'green', ahead: 'green', on: 'green', slow: 'amber', behind: 'red' };
const dl = (c, p, goodUp = true) => {
  const x = chg(c, p); if (x == null) return '—';
  return h('span', { class: 'dlt ' + ((x >= 0) === goodUp ? 'up' : 'dn') }, (x >= 0 ? '▲ ' : '▼ ') + fmt(Math.abs(x)) + '٪');
};
const list = (items, cls, empty) => (items.length ? h('ul', { class: 'mt-list ' + cls }, items.map(t => h('li', null, t))) : h('p', { class: 'hint' }, empty));
const ruled = n => h('div', { class: 'mt-lines' }, Array.from({ length: n }, () => h('div', { class: 'mt-line' })));

function goalBlock(x) {
  const g = x.g;
  if (!(g.goal > 0)) return h('div', { class: 'goalrow' }, h('div', { class: 'gh' }, h('b', null, x.p), h('span', { class: 'hint' }, 'هدف فروش آشنایان این ماه تعیین نشده')));
  return h('div', { class: 'goalrow' },
    h('div', { class: 'gh' }, h('b', null, x.p), h('span', null, `${fmt(Math.round(g.done))} از ${fmt(g.goal)} · ${fmt(g.pct)}٪ `, pill(g.pace.label, TONE[g.pace.key] || 'gray'))),
    h('div', { class: 'gbar mt-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.min(100, g.pct), 'aria-label': `پیشرفت هدف ${x.p}` },
      h('i', { class: g.pct >= 100 ? 'done' : '', style: { width: Math.min(100, g.pct) + '%' } }), h('b', { class: 'mt-mark', style: { insetInlineStart: Math.min(100, g.elapsed) + '%' }, title: 'سهم گذشته‌ی ماه' })),
    h('div', { class: 'gsub' }, `خط عمودی = ${fmt(g.elapsed)}٪ از ماه گذشته است؛ پیشرفت ${g.pct >= g.elapsed ? 'بالاتر' : 'پایین‌تر'} از این خط یعنی ${g.pct >= g.elapsed ? 'جلوتریم' : 'عقبیم'}.`));
}

export function render() {
  const root = h('div', { class: 'rep mt' }), body = h('div');
  let last = null;
  const draw = () => {
    const r = last = buildMeeting(winN), [A, B] = r.people;
    const row = (label, f, goodUp = true, fmtv = v => N(v)) => ({ label, a: f(A.c), b: f(B.c), fm: fmtv });
    const cmp = [
      row('فروش', c => c.total), row('تعداد فاکتور', c => c.count, true, v => fmt(v)), row('میانگین هر فاکتور', c => c.avg),
      row('سود فاکتورها (پیش از هزینه‌های عمومی)', c => c.profit), row('مشتری (نفر)', c => c.customers, true, v => fmt(v)), row('مشتری جدید', c => c.fresh, true, v => fmt(v)),
      row('تخفیف داده‌شده (٪ فروش)', c => c.discPct, false, v => fmt(Math.round(v)) + '٪'), row('فاکتور بدون نام خریدار', c => c.anon, false, v => fmt(v)),
      row('نسیه‌ی سررسیدگذشته', c => c.lateAmt, false), row('مرجوعی', c => c.retCount, false, v => fmt(v))
    ];
    const team = [
      ['فروش', r.cur.sales, r.prev.sales, true], ['سود خالص', r.cur.profit, r.prev.profit, true], ['تعداد فاکتور', r.cur.count, r.prev.count, true],
      ['خرید', r.F.bought, r.Fp.bought, true], ['پول دریافتی', r.F.received, r.Fp.received, true], ['فروش پیج اینستاگرام (هدف جدا دارد)', r.insta.cur, r.insta.prev, true]
    ];
    body.replaceChildren(
      h('div', { class: 'mt-title' }, h('img', { src: 'icons/logo-mark.jpg', alt: '', width: 40, height: 40 }), h('div', null, h('h2', null, 'گزارش جلسه‌ی دو هفته‌ای'), h('p', { class: 'hint' }, `از ${jstr(r.from)} تا ${jstr(r.to)} · مقایسه با ${fmt(r.n)} روز قبل از آن · چاپ شده: ${jlong(todayISO())}`))),

      h('h3', { class: 'sec' }, '۱ · خلاصه‌ی کل'),
      dtable([{ label: 'شاخص', main: true, render: x => x[0] }, { label: 'این دوره', cls: 'num', render: x => (x[0] === 'تعداد فاکتور' ? fmt(x[1]) : N(x[1])) },
        { label: 'دوره‌ی قبل', cls: 'num', hm: true, render: x => (x[0] === 'تعداد فاکتور' ? fmt(x[2]) : N(x[2])) }, { label: 'تغییر', cls: 'num', render: x => dl(x[1], x[2], x[3]) }], team),

      h('h3', { class: 'sec' }, `۲ · هدف فروش به آشنایان ${r.monthName}`),
      h('div', { class: 'card' }, ...r.people.map(goalBlock), h('p', { class: 'hint' }, 'فقط فروش با محل «آشنایان» به هدف حساب می‌شود. وضعیت = پیشرفت هدف نسبت به سهم گذشته‌ی ماه: ۵۰٪ هدف در ۵۰٪ ماه یعنی «در مسیر»، بالاتر یعنی «جلوتر» و ۱۰٪ هدف در ۵۰٪ ماه یعنی «خیلی عقب».')),

      h('h3', { class: 'sec' }, '۳ · مقایسه‌ی مهسا و رعنا'),
      dtable([{ label: 'شاخص', main: true, render: x => x.label }, { label: 'مهسا', cls: 'num', render: x => x.fm(x.a) }, { label: 'رعنا', cls: 'num', render: x => x.fm(x.b) }], cmp),
      h('p', { class: 'hint' }, 'فروش بیشتر به‌تنهایی به معنای عملکرد بهتر نیست؛ کانال فروش، نوع مشتری، قیمت کالا و مرجوعی هر نفر فرق می‌کند.'),

      h('h3', { class: 'sec' }, '۴ · کجا خوب بودیم و کجا ضعیف'),
      h('div', { class: 'grid2' }, ...r.people.map(x => h('div', { class: 'card' }, h('div', { class: 'ct' }, x.p),
        h('div', { class: 'mt-h good' }, 'خوب بود'), list(x.good, 'good', 'مورد برجسته‌ای نبود.'),
        h('div', { class: 'mt-h weak' }, 'باید بهتر شود'), list(x.weak, 'weak', 'مورد ضعفی دیده نشد.')))),

      h('h3', { class: 'sec' }, '۵ · مشکل‌های مشترک (کالا و پول)'),
      h('div', { class: 'card' }, list(r.issues, 'weak', 'مشکل مشترکی دیده نشد.')),

      h('h3', { class: 'sec' }, '۶ · هدف دو هفته‌ی بعد'),
      dtable([{ label: 'نفر', main: true, render: x => x.p }, { label: 'تا هدف آشنایان مانده', cls: 'num', render: x => (x.need == null ? 'هدف ندارد' : N(x.need)) },
        { label: 'روز مانده', cls: 'num', render: x => (x.g.left ? fmt(x.g.left) : '—') }, { label: 'لازم در هر روز', cls: 'num', hm: true, render: x => (x.perDay == null ? '—' : N(x.perDay)) },
        { label: 'سهم دو هفته‌ی بعد', cls: 'num', render: x => (x.per14 == null ? '—' : N(x.per14)) }], r.people),
      h('p', { class: 'mt-fill' }, 'هدف پیج اینستاگرام برای دو هفته‌ی بعد: ………………………………… (مهسا) ………………………………… (رعنا)'),

      h('h3', { class: 'sec' }, '۷ · دستور جلسه'),
      h('div', { class: 'card' }, h('ol', { class: 'mt-list' }, r.agenda.map(t => h('li', null, t)))),
      h('h3', { class: 'sec' }, '۸ · یادداشت و تصمیم‌های جلسه'),
      h('div', { class: 'card' }, ruled(7)),
      h('p', { class: 'hint' }, 'تاریخ جلسه‌ی بعد: ………………………… · امضا: ………………………')
    );
  };
  const copy = btn('📋 متن برای Claude', async () => { try { await navigator.clipboard.writeText(meetingText(last)); toast('✅ کپی شد؛ در چت Claude بچسبان'); } catch { toast('کپی نشد', 'err'); } }, 'ghost');
  const bar = chips(WINDOWS.map(w => ({ v: w.v, label: w.label })), winN, v => { winN = v; draw(); }, { label: 'بازه' });
  root.append(head('گزارش جلسه', [copy, btn('🖨 چاپ / ذخیره‌ی PDF', () => window.print(), 'ghost')], 'برای نشست دو هفته‌ای با مهسا و رعنا · فقط مدیر'), h('div', { class: 'no-print' }, bar), body);
  draw(); return root;
}
