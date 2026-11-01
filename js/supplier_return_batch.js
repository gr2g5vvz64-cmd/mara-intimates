// برگشت چندردیفی به تامین‌کننده: تامین‌کننده (یا یک فاکتور خرید) ← همه‌ی دسته‌های موجودش در یک جدول ← تعداد هر ردیف ← یک‌جا (همه یا هیچ)
// اعتبار هر ردیف = فی همان فاکتور خرید (تخفیف نقدی کل فاکتور از فی کم نمی‌شود)
import { h, fmt, jstr, todayISO, toast } from './util.js';
import { S, rpc, bus } from './store.js';
import { modal, field, combo, intField, dateField, run } from './ui.js';

export function supplierReturnBatchForm({ supplierId = null, invoiceId = null } = {}) {
  let date = todayISO();
  const active = S.lots.filter(l => !l.voided && l.rem > 0), supIds = [...new Set(active.map(l => l.supplier_id))];
  const sup = combo({ placeholder: 'کدام تامین‌کننده؟', options: supIds.map(id => ({ v: id, label: (S.SUP[id] || {}).name || '—', sub: `${fmt(active.filter(l => l.supplier_id === id).length)} دسته‌ی موجود` })), value: supplierId || (invoiceId && (S.INV[invoiceId] || {}).supplier_id) || null, onChange: () => draw() });
  const box = h('div', { class: 'rb-lines' }), sum = h('div', { class: 'sumbox' }), note = h('input', { class: 'inp', placeholder: 'دلیل / توضیح' });
  let rows = [];
  const hold = (l, who) => (who === 'مهسا' ? l.rem_m : l.rem_r);
  function draw() {
    box.replaceChildren(); rows = []; const id = sup.get();
    if (!id) { preview(); return; }
    const lots = active.filter(l => l.supplier_id === id && (!invoiceId || l.invoice_id === invoiceId)).sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!lots.length) box.append(h('div', { class: 'empty' }, 'کالای موجودی از این تامین‌کننده نمانده است.'));
    for (const l of lots) {
      const r = { l }, def = l.rem_m >= l.rem_r ? 'مهسا' : 'رعنا';
      r.holder = h('select', { class: 'sel', 'aria-label': 'از موجودی چه کسی', onchange: () => { r.qty.setMax(hold(l, r.holder.value)); r.qty.set(Math.min(r.qty.get(), hold(l, r.holder.value))); mark(r); preview(); } },
        ['مهسا', 'رعنا'].map(n => h('option', { value: n, selected: n === def || null, disabled: hold(l, n) <= 0 || null }, `از موجودی ${n} (${fmt(hold(l, n))} عدد)`)));
      r.qty = intField({ value: 0, min: 0, max: hold(l, def), onChange: () => { mark(r); preview(); } });
      r.card = h('div', { class: 'card', style: 'margin:6px 0;padding:10px' },
        h('div', { class: 'row', style: 'justify-content:space-between;gap:8px;flex-wrap:wrap' }, h('b', null, l.item), h('span', { class: 'hint' }, `${l.lot_no} · فاکتور ${l.invoice_no} · ${jstr(l.date)} · فی ${fmt(Math.round(l.unit_price))}`)),
        h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px' }, r.qty, r.holder));
      rows.push(r); box.append(r.card);
    }
    preview();
  }
  const mark = r => r.card.classList.toggle('on', r.qty.get() > 0);
  const picked = () => rows.filter(r => r.qty.get() > 0);
  function preview() {
    sum.replaceChildren(); const ps = picked();
    if (!ps.length) { sum.append(h('div', { class: 'hint' }, 'تعداد برگشتیِ هر دسته را بزن؛ ردیف‌های صفر ثبت نمی‌شوند. مبلغ هر ردیف همان فی فاکتور خرید است.')); return; }
    const total = ps.reduce((a, r) => a + Math.round(r.qty.get() * r.l.unit_price), 0);
    sum.append(h('div', { class: 'srow' }, h('span', null, `اعتبار از بدهی ${(S.SUP[sup.get()] || {}).name} (${fmt(ps.length)} ردیف)`), h('b', { class: 'n' }, fmt(total))),
      h('div', { class: 'hint' }, 'اگر بدهی صفر شود، تامین‌کننده بدهکار ما می‌شود.'));
  }
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت برگشت به تامین‌کننده');
  btn.onclick = async () => {
    const ps = picked(); if (!ps.length) return toast('حداقل برای یک ردیف تعداد برگشتی بزن', 'err');
    const lines = ps.map(r => ({ lot_id: r.l.id, holder: r.holder.value, qty: r.qty.get() }));
    const r = await run(btn, () => rpc('create_supplier_return_batch', { date, note: note.value, lines }));
    if (r) { toast(`برگشت به تامین‌کننده ثبت شد (${fmt(lines.length)} ردیف)`); m.close(); await bus.refresh(); }
  };
  const m = modal({ title: 'برگشت کالا به تامین‌کننده (چند ردیف با هم)', wide: true, body: h('div', { class: 'form' }, field('تاریخ', dateField(date, v => { date = v; })), field('تامین‌کننده', sup), field('کدام کالاها برگشت خورد؟', box), sum, field('دلیل', note)), footer: [btn] });
  draw();
}
