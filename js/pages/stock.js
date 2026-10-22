import { h, fmt, jstr } from '../util.js';
import { S, canEdit } from '../store.js';
import { dtable, N, pill, tabsBar, kpi } from '../ui.js';
import { moveStockForm, supplierReturnForm, editEntryForm, voidEntry } from '../forms_misc.js';
import { saleForm, purchaseForm } from '../forms_trade.js';
import { head, btn, searchBox, match, detail, catFilter, inCat, varFilter, inVar } from './common.js';
import { catNames, catOf, NO_CAT } from '../store.js';

const status = i => (i.rem === 0 ? pill('تمام شد', 'gray') : i.rem <= i.min_stock ? pill('کم‌موجودی', 'amber') : pill('موجود', 'green'));


/* ارزش جنس نزد هر نفر به قیمت تمام‌شده‌ی همان دسته‌ی خرید (جمع «مانده × قیمت تمام‌شده‌ی هر دسته») */
const valOf = (lots, key) => lots.reduce((a, l) => a + (l[key] || 0) * (l.landed_unit || 0), 0);
const liveLots = () => S.lots.filter(l => !l.voided);
function warehouseCard() {
  const L = liveLots();
  const rows = [['مهسا', 'rem_m'], ['رعنا', 'rem_r']].map(([n, k]) => { const q = L.reduce((a, l) => a + (l[k] || 0), 0), v = valOf(L, k); return { n, q, v, avg: q ? v / q : 0 }; });
  const tq = rows[0].q + rows[1].q, tv = rows[0].v + rows[1].v;
  return h('div', { class: 'card' }, h('div', { class: 'ct' }, 'انبار: جنس دست هر نفر', h('small', null, 'به قیمت تمام‌شده‌ی خرید')),
    dtable([{ label: 'دست چه کسی', main: true, render: r => r.n }, { label: 'تعداد جنس', cls: 'num', render: r => h('b', null, fmt(r.q)) }, { label: 'ارزش (قیمت تمام‌شده)', cls: 'num', render: r => N(r.v) }, { label: 'میانگین هر عدد', cls: 'num', hm: true, render: r => N(Math.round(r.avg)) }],
      [...rows, { n: 'جمع کل', q: tq, v: tv, avg: tq ? tv / tq : 0 }], { empty: '' }));
}

/* گردش کل کالا: چقدر خریدیم، چقدرش را فروختیم، چقدر مانده و دست کیست (همه به تفکیک مهسا و رعنا) */
function flowCard() {
  const L = liveLots(), okSale = new Set(S.vSales.filter(x => !x.voided).map(x => x.id));
  const rows = [['مهسا', 'hold_m', 'rem_m'], ['رعنا', 'hold_r', 'rem_r']].map(([n, hk, rk]) => {
    const bought = L.reduce((a, l) => a + (l[hk] || 0), 0), boughtV = L.reduce((a, l) => a + (l[hk] || 0) * (l.landed_unit || 0), 0);
    const ls = S.saleLines.filter(x => okSale.has(x.sale_id) && x.holder === n);
    const sold = ls.reduce((a, x) => a + x.qty, 0), soldV = ls.reduce((a, x) => a + x.qty * x.net_unit, 0);
    const rem = L.reduce((a, l) => a + (l[rk] || 0), 0), remV = valOf(L, rk);
    // جابجایی بین مهسا و رعنا: تعداد و ارزش (قیمت تمام‌شده‌ی همان دسته) از یکی کم و به دیگری اضافه می‌شود
    let mq = 0, mv = 0;
    for (const m of (S.moves || [])) { if (m.voided) continue; const lot = S.LOT && S.LOT[m.lot_id]; const c = lot ? lot.landed_unit || 0 : 0, sg = m.to_holder === n ? 1 : m.from_holder === n ? -1 : 0; mq += sg * m.qty; mv += sg * m.qty * c; }
    return { n, bought, boughtV, sold, soldV, mq, mv, other: rem - bought + sold - mq, rem, remV };
  });
  const tot = rows.reduce((a, r) => ({ n: 'جمع کل', bought: a.bought + r.bought, boughtV: a.boughtV + r.boughtV, sold: a.sold + r.sold, soldV: a.soldV + r.soldV, mq: a.mq + r.mq, mv: a.mv + r.mv, other: a.other + r.other, rem: a.rem + r.rem, remV: a.remV + r.remV }), { bought: 0, boughtV: 0, sold: 0, soldV: 0, mq: 0, mv: 0, other: 0, rem: 0, remV: 0 });
  const pct = tot.bought ? Math.round(tot.sold / tot.bought * 100) : 0;
  return h('div', { class: 'card' }, h('div', { class: 'ct' }, 'گردش کل کالا: خرید ← فروش ← مانده', h('small', null, tot.bought ? `${pct}٪ از کل خرید فروخته شده` : '')),
    dtable([
      { label: 'دست چه کسی', main: true, render: r => r.n },
      { label: 'خریدیم (تعداد)', cls: 'num', render: r => h('b', null, fmt(r.bought)) }, { label: 'ارزش خرید', cls: 'num', render: r => N(r.boughtV) },
      { label: 'فروختیم (تعداد)', cls: 'num', render: r => h('b', null, fmt(r.sold)) }, { label: 'مبلغ فروش', cls: 'num', render: r => N(r.soldV) },
      { label: 'جابجایی (+ورودی / −خروجی)', cls: 'num', render: r => h('span', { class: 'n' }, (r.mq > 0 ? '+' : '') + fmt(r.mq)) }, { label: 'ارزش جابجایی', cls: 'num', render: r => N(r.mv) },
      { label: 'مرجوعی', cls: 'num', hm: true, render: r => h('span', { class: 'n' }, (r.other > 0 ? '+' : '') + fmt(r.other)) },
      { label: 'مانده (تعداد)', cls: 'num', render: r => h('b', null, fmt(r.rem)) }, { label: 'ارزش مانده', cls: 'num', render: r => N(r.remV) }
    ], [...rows, tot], { empty: '' }),
    h('p', { class: 'hint' }, 'خریدیم = جنسی که از ابتدا دست هر نفر رفته؛ مانده = خرید − فروش ± جابجایی ± مرجوعی. وقتی جنسی از یکی به دیگری می‌رود، تعداد و ارزشش (به قیمت تمام‌شده) از مانده‌ی فرستنده کم و به مانده‌ی گیرنده اضافه می‌شود؛ فروش‌ها همیشه به نام کسی می‌مانند که فروخته است. ارزش خرید و مانده به قیمت تمام‌شده است.'));
}

function byCategoryCard() {
  const L = liveLots(), rows = [...catNames(true), NO_CAT].map(c => {
    const ls = L.filter(l => catOf(S.I[l.item_id]) === c), qm = ls.reduce((a, l) => a + (l.rem_m || 0), 0), qr = ls.reduce((a, l) => a + (l.rem_r || 0), 0);
    return { c, qm, qr, q: qm + qr, v: valOf(ls, 'rem_m') + valOf(ls, 'rem_r') };
  }).filter(r => r.q > 0 || r.c !== NO_CAT);
  if (!rows.length) return null;
  return h('div', { class: 'card' }, h('div', { class: 'ct' }, 'انبار به تفکیک دسته', h('small', null, 'تعداد و ارزش به قیمت تمام‌شده')),
    dtable([{ label: 'دسته', main: true, render: r => r.c }, { label: 'نزد مهسا', cls: 'num', render: r => r.qm }, { label: 'نزد رعنا', cls: 'num', render: r => r.qr }, { label: 'جمع تعداد', cls: 'num', render: r => h('b', null, r.q) }, { label: 'ارزش', cls: 'num', render: r => N(r.v) }], rows.filter(r => r.q > 0 || r.c !== NO_CAT), { empty: '' }));
}

export function render(query) {
  let tab = query.get('tab') === 'lots' ? 'lots' : 'items', q = '', hideZero = false, cat = ''; const vst = { color: '', size: '' };
  const root = h('div'); const body = h('div'), catHost = h('div');
  const T = S.stock.filter(i => i.active);
  const draw = () => {
    root.querySelector('.tabs') && root.querySelector('.tabs').replaceWith(tabsBar([{ id: 'items', label: 'به تفکیک کالا', badge: (n => ({ n, tone: n ? 'amber' : 'zero' }))(S.stock.filter(i => i.active && i.rem <= i.min_stock).length) }, { id: 'lots', label: 'دسته‌های خرید (FIFO)', badge: { n: S.lots.filter(l => !l.voided && l.rem > 0).length, tone: 'info' } }], tab, t => { tab = t; draw(); }));
    if (tab === 'items') {
      catHost.replaceChildren(catFilter(cat, v => { cat = v; draw(); }, S.stock.filter(i => i.active)), varFilter(vst, draw, S.stock.filter(i => i.active)));
      const rows = S.stock.filter(i => i.active && inCat(cat, i) && inVar(vst, i) && match(q, i.code, i.name, i.category, i.color, i.size) && (!hideZero || i.rem > 0)).sort((a, b) => (a.rem === 0) - (b.rem === 0) || a.name.localeCompare(b.name, 'fa'));
      body.replaceChildren(dtable([
        { label: 'کالا', main: true, render: i => i.name }, { label: 'دسته', hm: true, render: i => i.category || '' }, { label: 'تعداد نزد مهسا', cls: 'num', render: i => i.rem_m }, { label: 'تعداد نزد رعنا', cls: 'num', render: i => i.rem_r },
        { label: 'جمع تعداد', cls: 'num', render: i => h('b', null, i.rem) }, { label: 'آخرین تمام‌شده', cls: 'num', hm: true, render: i => (i.last_cost ? N(i.last_cost) : '') }, { label: 'آخرین فی فروش', cls: 'num', hm: true, render: i => (i.last_price ? N(i.last_price) : '') },
        { label: 'ارزش نزد مهسا', cls: 'num', render: i => N(valOf(liveLots().filter(l => l.item_id === i.id), 'rem_m')) }, { label: 'ارزش نزد رعنا', cls: 'num', render: i => N(valOf(liveLots().filter(l => l.item_id === i.id), 'rem_r')) },
        { label: 'ارزش موجودی', cls: 'num', render: i => N(i.value) }, { label: 'وضعیت', render: status }
      ], rows, { onRow: i => itemDetail(i.id), empty: 'کالایی ثبت نشده است', foot: rows.length ? ['جمع', '', '', '', h('b', null, rows.reduce((a, i) => a + i.rem, 0)), '', '', N(valOf(liveLots(), 'rem_m')), N(valOf(liveLots(), 'rem_r')), N(rows.reduce((a, i) => a + i.value, 0)), ''] : null }));
    } else {
      catHost.replaceChildren();
      const rows = S.lots.filter(l => !l.voided && l.rem > 0 && inCat(cat, S.I[l.item_id] || {}) && match(q, l.item, l.lot_no, l.supplier, l.invoice_no)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
      body.replaceChildren(dtable([
        { label: 'دسته', main: true, render: l => l.lot_no }, { label: 'کالا', render: l => l.item }, { label: 'فاکتور', hm: true, render: l => l.invoice_no }, { label: 'تاریخ', hm: true, render: l => jstr(l.date) }, { label: 'تامین‌کننده', hm: true, render: l => l.supplier },
        { label: 'تمام‌شده', cls: 'num', render: l => N(l.landed_unit) }, { label: 'نزد مهسا', cls: 'num', render: l => l.rem_m }, { label: 'نزد رعنا', cls: 'num', render: l => l.rem_r }, { label: 'ارزش', cls: 'num', render: l => N(l.value) },
        { label: '', render: l => btn('جابجایی', e => { e.stopPropagation(); moveStockForm(l.id); }, 'ghost sm') }
      ], rows, { empty: 'دسته‌ی دارای موجودی نیست' }));
      const mv = (S.moves || []).filter(x => !x.voided).sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 15);
      if (canEdit() && mv.length) body.append(h('h3', { class: 'sec' }, 'آخرین جابجایی‌ها'), dtable([
        { label: 'تاریخ', main: true, render: x => jstr(x.date) }, { label: 'کالا', render: x => (S.LOT[x.lot_id] ? S.LOT[x.lot_id].item : '') },
        { label: 'از ← به', render: x => `${x.from_holder} ← ${x.to_holder}` }, { label: 'تعداد', cls: 'num', render: x => x.qty },
        { label: '', render: x => h('span', { class: 'row-actions' }, btn('ویرایش', () => editEntryForm('move', x), 'ghost sm'), btn('ابطال', async () => { if (await voidEntry('move', x, 'جابجایی کالا')) draw(); }, 'danger ghost sm')) }
      ], mv, { empty: '' }));
    }
  };
  const tot = S.totals.stock_value || 0;
  root.append(head('موجودی', [btn('برگشت به تامین‌کننده', () => supplierReturnForm(), 'ghost'), btn('＋ خرید', () => purchaseForm(), 'primary')], 'فروش از قدیمی‌ترین دسته شروع می‌شود (FIFO) و با قیمت تمام‌شده‌ی همان دسته حساب می‌شود.'),
    flowCard(), warehouseCard(), byCategoryCard(),
    h('div', { class: 'kpis' }, kpi('ارزش کل موجودی', N(tot), { sub: 'به قیمت تمام‌شده' }), kpi('تعداد کل', h('span', { class: 'n' }, fmt(S.stock.reduce((a, i) => a + i.rem, 0)))), kpi('کم‌موجودی', h('span', { class: 'n' }, T.filter(i => i.rem > 0 && i.rem <= i.min_stock).length), { tone: 'warn' })),
    h('div', { class: 'bar' }, searchBox(v => { q = v; draw(); }, 'جستجو در نام کالا یا دسته…'), h('label', { class: 'chk' }, h('input', { type: 'checkbox', onchange: e => { hideZero = e.target.checked; draw(); } }), 'پنهان کردن تمام‌شده‌ها')),
    h('div', { class: 'tabs' }), catHost, body);
  draw();
  return root;
}

function itemDetail(id) {
  const i = S.stock.find(x => x.id === id); const ls = S.lots.filter(l => l.item_id === id && !l.voided).sort((a, b) => (a.date < b.date ? -1 : 1));
  const m = detail({
    title: i.name, rows: [['نزد مهسا', `${i.rem_m} عدد · ارزش ${fmt(valOf(ls, 'rem_m'))}`], ['نزد رعنا', `${i.rem_r} عدد · ارزش ${fmt(valOf(ls, 'rem_r'))}`], ['ارزش موجودی', N(i.value)], i.last_cost ? ['آخرین قیمت تمام‌شده', N(i.last_cost)] : null, i.last_price ? ['آخرین فی فروش', N(i.last_price)] : null, ['هشدار کم‌موجودی از', i.min_stock + ' عدد']],
    extra: [h('h3', { class: 'sec' }, 'دسته‌های خرید'), dtable([
      { label: 'دسته', main: true, render: l => l.lot_no }, { label: 'فاکتور', render: l => l.invoice_no }, { label: 'تاریخ', render: l => jstr(l.date) }, { label: 'تمام‌شده', cls: 'num', render: l => N(l.landed_unit) },
      { label: 'مهسا', cls: 'num', render: l => l.rem_m }, { label: 'رعنا', cls: 'num', render: l => l.rem_r }, { label: '', render: l => (l.rem > 0 ? btn('جابجایی', () => { m.close(); moveStockForm(l.id); }, 'ghost sm') : '') }], ls)],
    actions: [btn('فروش این کالا', () => { m.close(); saleForm({ item: id }); }, 'gold')]
  });
}
