import { h, toast, todayISO } from '../util.js';
import { S, api, errText, setToken, apiBase } from '../store.js';
import { head, btn } from './common.js';
import { modal, field, run } from '../ui.js';

async function download(path, filename, label) {
  try {
    const res = await api(path, { raw: true, timeout: 120000 }); const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.append(a); a.click(); a.remove();
    toast(label + ' آماده شد');
  } catch (e) { toast(errText(e), 'err'); }
}
async function exportJson() {
  try {
    const r = await api('/api/data/'); const blob = new Blob([JSON.stringify(r.data.tables)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `MARA_backup_${todayISO()}.json`; document.body.append(a); a.click(); a.remove(); toast('پشتیبان JSON آماده شد');
  } catch (e) { toast(errText(e), 'err'); }
}
function passwordForm() {
  const o = h('input', { class: 'inp', type: 'password', autocomplete: 'current-password', dir: 'ltr' }), n = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password', dir: 'ltr' });
  const b = h('button', { class: 'btn primary lg', type: 'button' }, 'تغییر رمز');
  b.onclick = async () => { const r = await run(b, () => api('/api/auth/password/', { method: 'POST', body: { old: o.value, new: n.value } })); if (r) { toast('رمز عوض شد؛ دوباره وارد شو'); setTimeout(() => { setToken(null); location.reload(); }, 800); } };
  modal({ title: 'تغییر رمز', body: h('div', { class: 'form' }, field('رمز فعلی', o), field('رمز جدید (حداقل ۸ کاراکتر)', n)), footer: [b] });
}
const sec = (t, ...k) => h('section', { class: 'card help' }, h('div', { class: 'ct' }, t), ...k);
const li = (...k) => h('li', null, ...k);

export function render() {
  const me = S.me, bots = S.bots || {};
  const botLine = (ch, nm, host) => { const b = bots[ch] || {}; return li(h('b', null, 'بات ' + nm), ': ', me[ch] ? 'وصل است ✔' : 'هنوز وصل نیست — ', !me[ch] && b.username ? h('a', { href: `https://${host}/${b.username}`, target: '_blank', rel: 'noopener' }, `باز کردن @${b.username}`) : null, !me[ch] ? ' و دکمه‌ی «ارسال شماره‌ی من» را بزن.' : ''); };
  return h('div', null, head('راهنما و پشتیبان', []),
    sec('خروجی اکسل و پشتیبان', h('p', null, 'اکسل کامل از روی خود دیتابیس ساخته می‌شود: همه‌ی بخش‌ها (فروش، خرید، پرداخت، دریافت، موجودی، بدهکاران، بستانکاران، سررسیدها…) و برگه‌ی «تاریخچه‌ی کامل». شبانه هم خودکار برای مدیر در تلگرام/بله می‌رسد.'),
      h('div', { class: 'acts' }, btn('دانلود اکسل همه‌ی اطلاعات', e => { const b = e.currentTarget; b.disabled = true; download('/api/export.xlsx', `MARA-INTIMATES-${todayISO()}.xlsx`, 'اکسل').finally(() => { b.disabled = false; }); }, 'primary'), btn('پشتیبان کامل (JSON)', exportJson, 'ghost'))),
    sec('هر چیز کجا ثبت می‌شود؟', h('ul', null,
      li(h('b', null, 'فروش'), ': هر فروش با کالا، تعداد، فی، محل فروش، مشتری، حساب دریافت و (اگر بود) هزینه‌ی پیک و بسته‌بندی. فروش خودکار از قدیمی‌ترین دسته‌ی خرید کم می‌شود (FIFO).'),
      li(h('b', null, 'فروش نسیه'), ': اگر مشتری همه‌ی پول را نداد، «بخشی / نسیه» را بزن، مشتری و سررسید (۳، ۵، ۱۰… روز دیگر یا تاریخ دلخواه) را مشخص کن. مانده در «مشتریان و طلب‌ها» می‌ماند و هر بار که پول داد (کامل یا قسطی) «دریافت از مشتری» را بزن.'),
      li(h('b', null, 'خرید'), ': یک فاکتور با چند قلم. هزینه‌ی حمل خودکار سرشکن می‌شود. اگر همه‌ی پول را ندادی، سررسید بگذار؛ باقی‌مانده بدهی تامین‌کننده می‌شود و با «پرداخت به تامین‌کننده» قسط‌قسط یا یکجا تسویه می‌شود.'),
      li(h('b', null, 'پرداخت و هزینه'), ': پرداخت بدهی تامین‌کننده، هزینه‌ها، دریافت‌ها و انتقال پول بین حساب‌ها.'),
      li(h('b', null, 'مرجوعی'), ': سالم به موجودی برمی‌گردد، معیوب ضرر ثبت می‌شود، به تامین‌کننده پس بدهی از بدهی او کم می‌شود.'))),
    sec('سرمایه و سود', h('ul', null,
      li('«جیب شخصی» یعنی پول شخصی خودتان؛ خرج از آن = سرمایه‌ی شما در کسب‌وکار.'),
      li('سود کل از روی فروش‌ها محاسبه می‌شود و به سرمایه ربطی ندارد؛ فقط برای تقسیم، سهم پیشنهادی بر اساس سرمایه نشان داده می‌شود.'),
      li('پول وقتی از کسب‌وکار به جیب شخصی می‌رود با «برداشت سود» ثبت شود.'))),
    sec('قفل‌ها و تاریخچه', h('ul', null,
      li('هیچ ردیفی پاک یا ویرایش نمی‌شود. اشتباه را «ابطال» کن (دلیل لازم است): ثبت‌کننده تا ۲۴ ساعت و حمیدرضا همیشه.'),
      li('هر کار هر نفر (ورود، ثبت، ابطال، خروجی) با زمان و IP در «تاریخچه» می‌ماند و هرگز پاک نمی‌شود.'))),
    sec('حساب من', h('p', null, `وارد شده‌ای با نام ${me.name} (${me.role === 'admin' ? 'مدیر' : 'همکار'}).`),
      h('ul', null, botLine('telegram', 'تلگرام', 't.me'), botLine('bale', 'بله', 'ble.ir')),
      h('div', { class: 'acts' }, btn('تغییر رمز', passwordForm, 'ghost'), btn('خروج', async () => { try { await api('/api/auth/logout/', { method: 'POST' }); } catch {} setToken(null); location.reload(); }, 'danger ghost'))),
    sec('نصب روی گوشی', h('p', null, 'در مرورگر گوشی منوی اشتراک‌گذاری/سه‌نقطه را بزن و «افزودن به صفحه‌ی اصلی» را انتخاب کن تا مثل یک برنامه باز شود.')),
    h('p', { class: 'hint center' }, `MARA INTIMATES · نسخه‌ی ۵٫۰ · سرور: ${apiBase().replace(/^https?:\/\//, '')}`));
}
