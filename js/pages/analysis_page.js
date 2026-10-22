// صفحه‌ی «تحلیل» (فقط مدیر): تب ۱ = بررسی اشتباهات و مغایرت‌ها (محاسبه‌ی مستقل روی سرور)، تب ۲ = تحلیل عملکرد هفته/ماه/سال
import { h, jlong, todayISO, toast } from '../util.js';
import { S, api } from '../store.js';
import { pill, kpi, chips, tabsBar } from '../ui.js';
import { head, btn } from './common.js';
import { copyAiPack } from '../aipack.js';
import { saleDetail, purchaseDetail } from './trade.js';
import { buildReport, reportText, PERIODS } from '../report.js';
import { errText } from '../store.js';
import { advisorTab } from './advisor.js';

const LV = { error: ['red', '🔴 خطا'], warn: ['amber', '🟠 هشدار'], info: ['gray', '🔵 توضیح'] };
const PAGE = { lot: '#/stock', item: '#/items', account: '#/finance', payment: '#/pay', collection: '#/customers', return: '#/returns' };
let tab = 'advisor', periodN = 7, cache = null;

function goRef(r) {
  if (r.kind === 'sale') return saleDetail(r.id);
  if (r.kind === 'purchase') return purchaseDetail(r.id);
  if (PAGE[r.kind]) { location.hash = PAGE[r.kind]; toast(r.label); }
}
function download(name, obj) {
  const u = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' })), a = h('a', { href: u, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 10);

/* ---------- تب بررسی اشتباهات ---------- */
function auditTab() {
  const host = h('div', null), load = async () => {
    host.replaceChildren(h('div', { class: 'card' }, h('p', { class: 'hint' }, '⏳ در حال بررسی کل دفتر از روی جدول‌های خام…')));
    try { cache = (await api('/api/audit-check/')).data; } catch (e) { host.replaceChildren(h('div', { class: 'alert red' }, '❌ ' + errText(e))); return; }
    const r = cache, c = r.counts, bad = c.error + c.warn;
    const verdict = c.error ? h('div', { class: 'alert red' }, `🔴 ${c.error} خطا و ${c.warn} هشدار پیدا شد. زیر هر مورد نوشته شده به چه کسی بگویی و دکمه‌ی رفتن به همان ثبت هست.`)
      : c.warn ? h('div', { class: 'alert amber' }, `🟠 خطای جدی نیست، ولی ${c.warn} هشدار داریم.`)
        : h('div', { class: 'alert ok' }, `✅ همه‌چیز سالم است؛ ${c.ok} بررسی انجام شد و هیچ مغایرتی نبود.`);
    const card = f => h('div', { class: 'card', style: 'margin:8px 0' },
      h('div', { class: 'ct' }, pill(LV[f.level][1], LV[f.level][0]), ' ', f.title, h('small', null, f.count > 1 ? ` · ${f.count} مورد` : '')),
      h('p', { class: 'hint', style: 'margin:4px 0' }, f.detail),
      f.who.length ? h('p', { class: 'hint', style: 'margin:2px 0' }, '👤 به این‌ها بگو: ', h('b', null, f.who.join('، '))) : null,
      f.fix ? h('p', { class: 'hint', style: 'margin:2px 0;color:var(--green)' }, '🛠 ' + f.fix) : null,
      f.refs.length ? h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-top:6px' }, f.refs.map(x => h('button', { type: 'button', class: 'btn ghost sm', onclick: () => goRef(x) }, x.label.length > 46 ? x.label.slice(0, 44) + '… ›' : x.label + ' ›'))) : null);
    host.replaceChildren(verdict,
      h('div', { class: 'kpis' }, kpi('خطا', h('span', { class: 'n' }, c.error), { tone: c.error ? 'neg' : '' }), kpi('هشدار', h('span', { class: 'n' }, c.warn), { tone: c.warn ? 'warn' : '' }), kpi('توضیح', h('span', { class: 'n' }, c.info)), kpi('بررسی سالم', h('span', { class: 'n' }, c.ok), { tone: 'pos' })),
      ...r.findings.map(card),
      h('details', { class: 'card', style: 'margin:8px 0' }, h('summary', null, `✅ بررسی‌های سالم (${r.ok.length})`), h('ul', { class: 'hint' }, r.ok.map(t => h('li', null, t)))),
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin:10px 0' },
        h('button', { type: 'button', class: 'btn ghost', onclick: load }, '🔄 دوباره بررسی کن'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { download(`mara-audit-${stamp()}.json`, r); toast('✅ فایل دانلود شد؛ آن را در چت Claude بگذار'); } }, '📤 گزارش برای Claude (JSON)')),
      h('p', { class: 'hint' }, 'این بررسی فقط می‌خواند و چیزی را تغییر نمی‌دهد. هر شب هم خودکار انجام می‌شود و نتیجه‌اش به تلگرام/بله می‌آید. ' + (bad ? '' : '')));
  };
  load(); return host;
}

/* ---------- تب تحلیل عملکرد ---------- */
function perfTab() {
  const host = h('div', null), body = h('div', null);
  const draw = () => {
    const r = buildReport(periodN), k = r.kpi, d = (a, b) => (b > 0 ? `${a >= b ? '▲' : '▼'} ${Math.abs(Math.round((a - b) / b * 100))}٪` : '');
    const tone = t => (t === 'pos' ? 'color:var(--green)' : t === 'neg' ? 'color:var(--red)' : '');
    body.replaceChildren(
      h('div', { class: 'kpis' }, kpi('فروش', Math.round(k.sales).toLocaleString('fa-IR'), { sub: d(k.sales, k.prevSales) }), kpi('سود خالص', Math.round(k.profit).toLocaleString('fa-IR'), { sub: d(k.profit, k.prevProfit), tone: k.profit < 0 ? 'neg' : 'pos' }),
        kpi('درصد سود', h('span', { class: 'n' }, k.margin.toFixed(1) + '٪'), { sub: `قبل: ${k.prevMargin.toFixed(1)}٪` }), kpi('فاکتور', h('span', { class: 'n' }, k.count.toLocaleString('fa-IR')), { sub: `قبل: ${k.prevCount.toLocaleString('fa-IR')}` })),
      ...r.sections.map(s => h('div', { class: 'card', style: 'margin:8px 0' }, h('div', { class: 'ct' }, s.title), h('ul', { class: 'plain' }, s.rows.map(x => h('li', { style: 'margin:6px 0;' + tone(x.tone) }, x.text))))),
      r.advice.length ? h('div', { class: 'card', style: 'margin:8px 0;border-color:var(--green)' }, h('div', { class: 'ct' }, '✅ پیشنهادهای عملی'), h('ol', null, r.advice.map(a => h('li', { style: 'margin:6px 0' }, a)))) : null,
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin:10px 0' },
        h('button', { type: 'button', class: 'btn ghost', onclick: async () => { try { await navigator.clipboard.writeText(reportText(r)); toast('✅ گزارش کپی شد'); } catch { toast('کپی نشد', 'err'); } } }, '📋 کپی گزارش'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { download(`mara-performance-${r.n}d-${stamp()}.json`, { ...r, text: reportText(r) }); toast('✅ فایل دانلود شد'); } }, '📤 گزارش برای Claude (JSON)')),
      h('p', { class: 'hint' }, `بازه: ${r.from} تا ${r.to} · مقایسه با دوره‌ی هم‌اندازه‌ی قبل. همه‌ی عددها از داده‌های ثبت‌شده حساب می‌شود.`));
  };
  host.append(chips(PERIODS.map(p => ({ v: p.v, label: p.label })), periodN, v => { periodN = v; draw(); }, { label: 'بازه' }), body); draw(); return host;
}

export function render() {
  if (!S.me || S.me.role !== 'admin') return h('div', { class: 'card' }, 'این صفحه فقط برای مدیر است.');
  const host = h('div', null), body = h('div', null);
  const pick = () => (tab === 'audit' ? auditTab() : tab === 'perf' ? perfTab() : advisorTab());
  const draw = () => { body.replaceChildren(pick()); host.querySelector('.tabs') && host.querySelector('.tabs').replaceWith(bar()); };
  const bar = () => tabsBar([{ id: 'advisor', label: '🧭 مشاور خرید' }, { id: 'perf', label: '📈 تحلیل عملکرد' }, { id: 'audit', label: '🔍 بررسی اشتباهات' }, { id: 'meeting', label: '🧑‍💼 گزارش جلسه‌ی دو هفته‌ای' }], tab, t => { if (t === 'meeting') { location.hash = '#/meeting'; return; } tab = t; draw(); });
  host.append(head('تحلیل', [btn('📤 خروجی برای بررسی هوش مصنوعی', async e => { const b = e.currentTarget; b.disabled = true; try { await copyAiPack(); } catch (er) { toast(errText(er), 'err'); } finally { b.disabled = false; } }, 'ghost'), btn('📤 همان، بدون نام مشتری', async e => { const b = e.currentTarget; b.disabled = true; try { await copyAiPack(true); } catch (er) { toast(errText(er), 'err'); } finally { b.disabled = false; } }, 'ghost')], `${jlong(todayISO())} · فقط مدیر`), bar(), body); body.append(pick()); return host;
}
