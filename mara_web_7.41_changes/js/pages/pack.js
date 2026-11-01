// بسته‌ی گزارش ماهانه (فقط مدیر): سود و زیان + حساب‌وکتاب شرکا + هدف و پاداش آشنایان + نکته‌های تحلیل، یک‌جا برای ذخیره‌ی PDF.
// عددها همان‌هایی است که در صفحه‌های خودشان می‌بینی؛ این صفحه فقط پشت هم می‌چیند (هیچ فرمول تازه‌ای ندارد).
import { h, fmt, jmonthName, lastMonths, todayISO, jlong, jmonthKey } from '../util.js';
import { S, errText } from '../store.js';
import { N, dtable, pill } from '../ui.js';
import { head, btn } from './common.js';
import { load, pnlBody, settleBody } from './reports.js';
import { goalProgress, bonusMonth } from '../insights.js';
import { analyze } from '../analysis.js';

const LV = { err: ['red', 'مهم'], warn: ['amber', 'توجه'], info: ['gray', 'اطلاع'] };

function goalSection(month) {
  const B = bonusMonth(month), people = ['مهسا', 'رعنا'];
  const rows = people.map(n => ({ n, g: goalProgress(n, month), b: B[n] }));
  return [
    h('p', { class: 'hint' }, 'فقط فروش با محل «آشنایان» که سودِ مثبت و حاشیه‌ی کافی دارد در هدف می‌آید. پاداش از سودِ وصول‌شده است: ' +
      `${fmt(B.cfg.base)}٪ تا هدف، ${fmt(B.cfg.above)}٪ برای بخش بالاتر از هدف، و ${fmt(B.cfg.star)}٪ اضافه برای فروشنده‌ی برتر ماه. ` + (B.cfg.on ? '' : '(پاداش الان خاموش است.)')),
    dtable([
      { label: 'نفر', main: true, render: r => r.n }, { label: 'هدف ماه', cls: 'num', render: r => (r.g.goal ? N(r.g.goal) : '—') },
      { label: 'فروش آشنایان (حساب‌شده)', cls: 'num', render: r => N(Math.round(r.g.done)) }, { label: 'تحقق', cls: 'num', render: r => (r.g.goal ? fmt(r.g.pct) + '٪' : '—') },
      { label: 'پاداش پلکانی', cls: 'num', render: r => N(Math.round(r.b.base)) }, { label: 'فروشنده‌ی برتر', cls: 'num', render: r => (r.b.isStar ? '⭐ ' + fmt(Math.round(r.b.star)) : '—') },
      { label: 'جمع پاداش', cls: 'num', render: r => N(Math.round(r.b.total), 'pos') }, { label: 'فروش کنار‌رفته', cls: 'num', hm: true, render: r => fmt(r.g.excluded || 0) }
    ], rows, { empty: '' })
  ];
}
function analysisSection() {
  const { findings, ok } = analyze();
  return [
    findings.length ? h('ul', { class: 'mt-list' }, findings.map(f => h('li', null, pill(LV[f.lvl][1], LV[f.lvl][0]), ' ', h('b', null, f.title), ' — ', f.detail, f.fix ? h('div', { class: 'hint' }, 'راه‌حل: ' + f.fix) : null)))
      : h('p', { class: 'hint' }, 'مورد بازی پیدا نشد.'),
    ok.length ? h('p', { class: 'hint' }, `${fmt(ok.length)} بررسی سالم است.`) : null
  ];
}

export function render() {
  if (!S.me || S.me.role !== 'admin') return h('div', { class: 'card' }, 'این صفحه فقط برای مدیر است.');
  let month = jmonthKey(todayISO());
  const root = h('div', { class: 'rep pack' }), box = h('div', null, h('div', { class: 'empty' }, 'در حال ساخت بسته‌ی گزارش…'));
  const sec = (n, t, ...k) => h('section', { class: 'pack-sec' }, h('h2', { class: 'pack-h' }, `${n} · ${t}`), ...k);
  const draw = async () => {
    box.replaceChildren(h('div', { class: 'empty' }, 'در حال ساخت بسته‌ی گزارش…'));
    let d; try { d = await load(month); } catch (e) { box.replaceChildren(h('div', { class: 'card' }, h('p', null, errText(e)))); return; }
    box.replaceChildren(
      h('div', { class: 'pack-cover' }, h('h1', null, 'بسته‌ی گزارش ماهانه · MARA INTIMATES'), h('p', null, `${jmonthName(month)} · چاپ‌شده: ${jlong(todayISO())} · محرمانه، فقط مدیر`)),
      sec('۱', `صورت سود و زیان ${jmonthName(month)}`, ...pnlBody(d, month)),
      sec('۲', `حساب‌وکتاب ماهانه‌ی شرکا ${jmonthName(month)}`, ...settleBody(d, month)),
      sec('۳', `هدف فروش و پاداش آشنایان ${jmonthName(month)}`, ...goalSection(month)),
      sec('۴', 'نکته‌های تحلیل (وضعیت امروز)', ...analysisSection()),
      h('p', { class: 'hint' }, 'گزارش مدیریتی (تب‌های تعاملی) و داشبورد در این بسته نیستند؛ هر کدام را از صفحه‌ی خودش با Ctrl+P ذخیره کن.'));
  };
  const picker = (() => { const s = h('select', { class: 'sel no-print', 'aria-label': 'ماه' }, lastMonths(12).reverse().map(k => h('option', { value: k, selected: k === month }, jmonthName(k)))); s.onchange = () => { month = s.value; draw(); }; return s; })();
  root.append(head('بسته‌ی گزارش ماهانه', [picker, btn('🖨 چاپ / ذخیره‌ی PDF', () => window.print(), 'ghost')], 'سود و زیان، حساب‌وکتاب شرکا، هدف و پاداش و نکته‌های تحلیل؛ همه پشت‌سرهم برای یک PDF.'), box);
  draw(); return root;
}
