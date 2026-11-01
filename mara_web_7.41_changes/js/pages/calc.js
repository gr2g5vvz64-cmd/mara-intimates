// تنظیمات ← محاسبات: درصد سود پیش‌فرض هر دسته (فقط مدیر)
import { h, fmt, toast } from '../util.js';
import { S, rpc, bus, errText, defaultMarkup } from '../store.js';
import { head } from './common.js';
import { run } from '../ui.js';

const roundK = n => Math.round(n / 1000) * 1000;

export function render() {
  if (!S.me || S.me.role !== 'admin') return h('div', { class: 'card' }, 'این صفحه فقط برای مدیر است.');
  const host = h('div');
  const save = async (btn, payload, msg) => { const r = await run(btn, () => rpc('save_markup', payload)); if (r) { toast(msg); await bus.refresh(); } };
  const row = c => {
    const inp = h('input', { class: 'inp', type: 'text', inputmode: 'decimal', dir: 'ltr', placeholder: `پیش‌فرض (${defaultMarkup()}٪)`, value: c.markup_pct == null ? '' : String(Number(c.markup_pct)), style: 'max-width:130px;text-align:center', 'aria-label': 'درصد سود ' + c.name });
    const ex = h('small', { class: 'hint' });
    const pct = () => { const t = inp.value.trim().replace(/[٪%]/g, ''); return t === '' ? null : Number(t.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))); };
    const show = () => { const p = pct(), eff = p == null ? defaultMarkup() : p; ex.textContent = `مثلاً تمام‌شده ۱٬۰۰۰٬۰۰۰ ← فی پیشنهادی ${fmt(roundK(1e6 * (1 + eff / 100)))}`; };
    inp.addEventListener('input', show); show();
    const b = h('button', { type: 'button', class: 'btn primary sm' }, 'ذخیره');
    b.onclick = () => { const p = pct(); if (p != null && !Number.isFinite(p)) return toast('عدد درست بنویس', 'err'); save(b, { category_id: c.id, pct: p }, p == null ? `«${c.name}» به درصد پیش‌فرض برگشت` : `درصد «${c.name}» شد ${p}٪`); };
    const n = S.items.filter(i => i.category === c.name && i.active).length;
    return h('div', { class: 'li', style: 'gap:10px;flex-wrap:wrap;align-items:center' }, h('div', { style: 'min-width:120px' }, h('b', null, c.name), h('small', null, `${n} کالا`)), inp, h('span', null, '٪'), b, ex);
  };
  const def = h('input', { class: 'inp', type: 'text', inputmode: 'decimal', dir: 'ltr', value: String(defaultMarkup()), style: 'max-width:130px;text-align:center', 'aria-label': 'درصد سود پیش‌فرض کل' });
  const dBtn = h('button', { type: 'button', class: 'btn primary' }, 'ذخیره‌ی پیش‌فرض');
  dBtn.onclick = () => { const v = Number(def.value.replace(/[٪%]/g, '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))); if (!Number.isFinite(v)) return toast('عدد درست بنویس', 'err'); save(dBtn, { pct: v }, `درصد پیش‌فرض کل شد ${v}٪`); };
  const draw = () => {
    const cats = S.categories.filter(c => c.active).sort((a, b) => a.sort - b.sort || a.id - b.id);
    host.replaceChildren(
      h('section', { class: 'card' }, h('div', { class: 'ct' }, 'درصد سود پیش‌فرض کل'),
        h('p', { class: 'hint' }, 'برای دسته‌هایی که درصد جدا ندارند. فی فروش در فرم فروش = بهای تمام‌شده + این درصد (گرد‌شده به هزار ریال). فروشنده همیشه می‌تواند فی را دستی عوض کند.'),
        h('div', { class: 'row', style: 'gap:8px;align-items:center;flex-wrap:wrap' }, def, h('span', null, '٪'), dBtn)),
      h('section', { class: 'card' }, h('div', { class: 'ct' }, 'درصد سود هر دسته'),
        h('p', { class: 'hint' }, 'جلوی هر دسته درصد دلخواه را بنویس و «ذخیره» بزن؛ از آن لحظه کالاهای همان دسته در فاکتور فروش با این درصد پیشنهاد می‌شوند. خالی بگذاری و ذخیره کنی، به درصد پیش‌فرض کل برمی‌گردد. دسته‌ی جدید که ساخته شود همین‌جا ظاهر می‌شود. فروش‌های قبلی تغییر نمی‌کنند.'),
        cats.length ? cats.map(row) : h('div', { class: 'empty sm' }, 'هنوز دسته‌ای نیست؛ از صفحه‌ی کالاها دسته بساز.')));
  };
  draw();
  return h('div', null, head('محاسبات و درصد سود', [], 'درصد سودِ پیشنهادی فی فروش را برای هر دسته جدا تعیین کن.'), host);
}
