// گزارش ذخیره: هر ثبت کی در جنگو نشست، کدام در انتظار است و کدام رد شد (با دلیل و راه حل)
import { h, jstr, toast } from '../util.js';
import { dtable, pill, confirmBox } from '../ui.js';
import { head, btn } from './common.js';
import { state, mine, onOutbox, retryNow, discard, pump, detailText } from '../outbox.js';

const tm = ms => { const d = new Date(ms); const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
  return jstr(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(d)) + ' ' + t; };
const ST = { saved: ['ذخیره شد ✔', 'green'], queued: ['در صف ذخیره', 'amber'], blocked: ['رد شد', 'red'], rejected: ['رد شد (فرم)', 'red'], discarded: ['حذف‌شده با تأیید', 'gray'] };
const WHY = {
  E_BUSINESS: 'قاعده‌ی حسابداری اجازه نداد (مثلاً موجودی کم شده یا مبلغ بیشتر از مانده است). جزئیات را بخوان، وضعیت را درست کن و همان ثبت را دوباره از فرم بزن.',
  E_INPUT: 'یکی از مقدارها نامعتبر بود. ثبت را از فرم دوباره و با مقدار درست بزن.', E_CHECK: 'مقدار با قوانین حسابداری نمی‌خواند. از فرم دوباره بزن.', E_PERM: 'این کار برای شما مجاز نیست.',
  E_DUP: 'این مورد قبلاً ثبت شده است؛ در «تاریخچه» بگرد.', E_REF: 'یکی از موارد انتخاب‌شده دیگر وجود ندارد.'
};

export function render() {
  const root = h('div'), pend = h('div'), tbl = h('div');
  const copy = async it => { try { await navigator.clipboard.writeText(detailText(it)); toast('جزئیات کپی شد'); } catch { toast('کپی نشد؛ جزئیات را از «گزارش» بخوان', 'err'); } };
  function draw() {
    const its = mine().slice().sort((a, b) => a.created - b.created);
    pend.replaceChildren(...(its.length ? its.map(it => h('div', { class: 'card ' + (it.status === 'blocked' ? 'sl-bad' : 'sl-wait') },
      h('div', { class: 'ct' }, it.label, ' ', pill(it.status === 'blocked' ? 'رد شد' : 'در انتظار ذخیره', it.status === 'blocked' ? 'red' : 'amber')),
      h('p', { class: 'hint' }, `ثبت‌شده: ${tm(it.created)} · تلاش: ${it.attempts} بار · کد: ${it.code || '—'}`),
      h('p', null, it.error || ''),
      it.status === 'blocked' ? h('p', { class: 'warnbox' }, WHY[it.code] || 'سرور این ثبت را نپذیرفت. جزئیات را کپی کن و برای حمیدرضا بفرست.') : h('p', { class: 'hint' }, 'مشکل از رسیدن به سرور است، نه از اطلاعات شما. خودکار دوباره تلاش می‌شود؛ صفحه را نبندید.'),
      h('div', { class: 'acts' }, btn('دوباره تلاش کن', async () => { await retryNow(it.id); draw(); }, 'primary sm'), btn('کپی جزئیات', () => copy(it), 'ghost sm'),
        it.status === 'blocked' ? btn('رها کردن (با تأیید)', async () => { if (await confirmBox('این ثبت از صف حذف شود؟ فقط وقتی بزن که جزئیاتش را کپی کرده‌ای یا دوباره از فرم زده‌ای.', 'بله، رها کن', true)) { discard(it.id); draw(); } }, 'ghost sm') : null)))
      : [h('div', { class: 'card sl-ok' }, h('b', null, '✔ همه‌ی ثبت‌ها در سرور ذخیره شده‌اند.'), h('p', { class: 'hint' }, 'ثبتی در انتظار یا ردشده نیست.'))]));
    const rows = state().log.slice().reverse();
    tbl.replaceChildren(dtable([
      { label: 'زمان', hm: true, render: r => tm(r.t) }, { label: 'عملیات', main: true, render: r => r.label || '—' },
      { label: 'وضعیت', render: r => pill(...(ST[r.status] || [r.status, 'gray'])) }, { label: 'شماره', render: r => (r.no != null ? String(r.no) : '—') },
      { label: 'تلاش', cls: 'num', hm: true, render: r => r.attempts || 1 }, { label: 'شناسه‌ی درخواست', hm: true, render: r => r.rid || '—' }, { label: 'توضیح', render: r => (r.code ? r.code + ' · ' : '') + (r.note || '') }
    ], rows, { empty: 'هنوز ثبتی در این دستگاه انجام نشده.' }));
  }
  draw();
  const off = onOutbox(() => { if (!root.isConnected) return off(); draw(); });
  root.append(head('گزارش ذخیره', [btn('همه را دوباره تلاش کن', () => pump(true), 'ghost')], 'نتیجه‌ی ذخیره‌ی هر ثبت در سرور. اگر ثبتی ذخیره نشود، اینجا می‌ماند و خودکار دوباره تلاش می‌شود؛ هیچ ثبتی بی‌صدا گم نمی‌شود.'),
    h('h3', { class: 'sec' }, 'در انتظار و ردشده'), pend, h('h3', { class: 'sec' }, 'گزارش ذخیره‌ها (روی همین دستگاه)'), tbl);
  return root;
}
