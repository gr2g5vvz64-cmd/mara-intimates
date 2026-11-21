// مرجوعی چندردیفی: یک فاکتور فروش ← همه‌ی قلم‌هایش در یک جدول ← تعداد برگشتی هر قلم ← یک‌جا ثبت (همه یا هیچ)
import { h, fmt, jstr, todayISO, toast } from './util.js';
import { S, rpc, bus, pref, setPref, businessAccounts, accBalance, creditOf } from './store.js';
import { modal, field, chips, combo, accountPicker, numField, intField, dateField, run, pill } from './ui.js';

const STATES = [['ok', 'سالم (به موجودی برمی‌گردد)'], ['bad', 'معیوب (ضرر)'], ['sup', 'به تامین‌کننده پس داده شد']];

export function returnBatchForm(saleId) {
  let date = todayISO(), reason = '';
  const sales = S.vSales.filter(s => !s.voided);
  const sale = combo({ placeholder: 'کدام فروش؟ شماره، کالا یا مشتری…', options: sales.slice().reverse().map(s => ({ v: s.id, label: `${s.no} · ${jstr(s.date)}`, sub: (s.items_text || '') + (s.customer ? ' · ' + s.customer : ''), keywords: (s.items_text || '') + ' ' + (s.customer || '') })), value: saleId || null, onChange: () => drawLines() });
  const box = h('div', { class: 'rb-lines' }), sum = h('div', { class: 'sumbox' });
  const debt = numField({ value: '', onInput: () => preview() });
  const debtBox = h('div', { hidden: true }, field('کسر از بدهی (نسیه‌ی) مشتری', debt, 'اگر مشتری هنوز بدهکار است، می‌توانی به‌جای پس‌دادن پول، از بدهی‌اش کم کنی. بقیه‌ی مبلغ از حساب پایین پس داده می‌شود.'));
  /* باقی‌مانده (بعد از کسر بدهی): نقد برگردد، یا به‌صورت اعتبار (بستانکاری) برای مشتری بماند و در فاکتور بعد کم شود، یا ترکیبی */
  let mode = 'cash';
  const cashPart = numField({ value: '', onInput: () => preview() });
  const cashPartBox = h('div', { hidden: true }, field('چقدرش نقد برگردد؟ (باقی اعتبار می‌شود)', cashPart));
  const modeC = chips([{ v: 'cash', label: 'همه نقد برگردد' }, { v: 'credit', label: 'همه اعتبار مشتری شود' }, { v: 'split', label: 'بخشی نقد، بخشی اعتبار' }], 'cash', v => { mode = v; cashPartBox.hidden = v !== 'split'; preview(); }, { cls: 'wrap' });
  const modeBox = h('div', null, field('باقی مبلغ چه شود؟', modeC, 'اعتبار یعنی مشتری از ما بستانکار می‌شود: هیچ پولی از حساب نمی‌رود و در فاکتور فروش بعدی خودکار کم می‌شود (یا بعداً نقد پرداخت می‌شود).'), cashPartBox);
  const acc = accountPicker(businessAccounts(), null, () => {}, { pockets: false, balances: accBalance });
  const lastA = pref('payAcc', null); acc.set(lastA && S.A[lastA] ? lastA : (businessAccounts()[1] || businessAccounts()[0]).id);
  const accBox = h('div', null, field('پول از کدام حساب برگشت؟', acc));
  const reasonC = chips([{ v: '', label: 'نامشخص' }, { v: 'سایز نشد', label: 'سایز نشد' }, { v: 'ایراد داشت', label: 'ایراد داشت' }, { v: 'پشیمان شد', label: 'پشیمان شد' }, { v: 'رنگ/مدل فرق داشت', label: 'رنگ/مدل فرق داشت' }, { v: 'اشتباه ارسال شد', label: 'اشتباه ارسال شد' }], reason, v => { reason = v; }, { cls: 'wrap' });
  const note = h('input', { class: 'inp', placeholder: 'توضیح (اختیاری)' });
  let rows = [];   // { l, qty, state, holder, el }
  const net = r => r.l.net_unit != null ? r.l.net_unit : r.l.unit_price;
  const money = r => Math.round(r.qty.get() * net(r));
  const eff = r => { const lot = S.LOT[r.l.lot_id], q = r.qty.get(), st = r.state.value; return (st === 'sup' ? q * lot.unit_price : st === 'ok' ? q * lot.landed_unit : 0) - money(r); };
  function drawLines() {
    const s = S.SALE[sale.get()]; box.replaceChildren(); rows = [];
    if (!s) { preview(); return; }
    const lines = S.saleLines.filter(l => l.sale_id === s.id && l.qty - l.returned_qty > 0);
    debtBox.hidden = !(s.outstanding > 0.5); debt.set('');
    if (!lines.length) box.append(h('div', { class: 'empty' }, 'همه‌ی قلم‌های این فاکتور قبلاً برگشت خورده‌اند.'));
    for (const l of lines) {
      const av = l.qty - l.returned_qty, r = { l };
      r.qty = intField({ value: 0, min: 0, max: av, onChange: () => { r.card.classList.toggle('on', r.qty.get() > 0); preview(); } });
      r.state = h('select', { class: 'sel', 'aria-label': 'وضعیت کالا', onchange: () => preview() }, STATES.map(([v, t]) => h('option', { value: v }, t)));
      r.holder = h('select', { class: 'sel', 'aria-label': 'پیش چه کسی' }, ['مهسا', 'رعنا'].map(n => h('option', { value: n, selected: n === l.holder || null }, 'پیش ' + n)));
      r.card = h('div', { class: 'card', style: 'margin:6px 0;padding:10px' },
        h('div', { class: 'row', style: 'justify-content:space-between;gap:8px;flex-wrap:wrap' }, h('b', null, (S.I[l.item_id] || {}).name || 'کالا'), h('span', { class: 'hint' }, `قابل برگشت ${fmt(av)} از ${fmt(l.qty)} · فی ${fmt(Math.round(net(r)))}${net(r) < l.unit_price ? ' (پس از تخفیف)' : ''}`)),
        h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px' }, r.qty, r.state, r.holder));
      rows.push(r); box.append(r.card);
    }
    if (lines.length > 1) box.prepend(h('div', { class: 'row', style: 'gap:8px;margin-bottom:6px' },
      h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { rows.forEach(r => { r.qty.set(r.l.qty - r.l.returned_qty); r.card.classList.add('on'); }); preview(); } }, 'همه‌ی قلم‌ها'),
      h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { rows.forEach(r => { r.qty.set(0); r.card.classList.remove('on'); }); preview(); } }, 'پاک کردن')));
    preview();
  }
  const picked = () => rows.filter(r => r.qty.get() > 0);
  /* تقسیم مبلغ هر قلم: اول کسر از بدهی، بعد نقد، باقی اعتبار؛ جمع سه بخش همیشه دقیقاً برابر مبلغ قلم است */
  function alloc(ps) {
    const total = ps.reduce((a, r) => a + money(r), 0); let dleft = Math.min(debt.get() || 0, total);
    const rem = ps.map(r => { const amt = money(r), dc = Math.min(dleft, amt); dleft -= dc; return { r, amt, dc, rem: amt - dc }; });
    const remTotal = rem.reduce((a, x) => a + x.rem, 0);
    let cashLeft = mode === 'cash' ? remTotal : mode === 'credit' ? 0 : Math.min(Math.max(cashPart.get() || 0, 0), remTotal);
    return rem.map(x => { const cash = Math.min(cashLeft, x.rem); cashLeft -= cash; return { ...x, cash, cr: x.rem - cash }; });
  }
  function preview() {
    sum.replaceChildren(); const ps = picked(); if (!ps.length) { sum.append(h('div', { class: 'hint' }, 'تعداد برگشتیِ هر قلم را بزن؛ قلم‌هایی که صفر باشند ثبت نمی‌شوند.')); accBox.hidden = false; return; }
    const al = alloc(ps), total = al.reduce((a, x) => a + x.amt, 0), dc = al.reduce((a, x) => a + x.dc, 0), cash = al.reduce((a, x) => a + x.cash, 0), cr = al.reduce((a, x) => a + x.cr, 0), e = ps.reduce((a, r) => a + eff(r), 0);
    const cid = (S.SALE[sale.get()] || {}).customer_id, was = cid ? creditOf(cid) : 0;
    const x = (k, v, c = '') => h('div', { class: 'srow ' + c }, h('span', null, k), h('b', { class: 'n' }, fmt(v)));
    sum.append(...[x(`جمع برگشتی (${fmt(ps.length)} قلم)`, total), dc > 0 ? x('کسر از بدهی مشتری', dc) : null, x('پول نقد پس‌داده‌شده به مشتری', cash), cr > 0 ? x('اعتبار مشتری (بستانکار می‌شود)', cr, 'ok') : null,
      cr > 0 ? x('اعتبار کل مشتری بعد از ثبت', was + cr) : null, x(e >= 0 ? 'سود این مرجوعی' : 'ضرر این مرجوعی', Math.abs(e), e >= 0 ? 'ok' : 'warn')].filter(Boolean));
    accBox.hidden = cash <= 0;
  }
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت مرجوعی');
  btn.onclick = async () => {
    const ps = picked(); if (!ps.length) return toast('حداقل برای یک قلم تعداد برگشتی بزن', 'err');
    const al = alloc(ps);
    if (mode === 'split' && (cashPart.get() || 0) > al.reduce((a, x) => a + x.rem, 0) + 0.5) return toast('مبلغ نقد از باقی‌مانده بیشتر است', 'err');
    if (al.some(x => x.cash > 0) && !acc.get()) return toast('حساب بازگشت پول را انتخاب کن', 'err');
    const lines = al.map(x => ({ sale_line_id: x.r.l.id, qty: x.r.qty.get(), holder: x.r.holder.value, condition: x.r.state.value === 'bad' ? 'معیوب' : 'سالم', to_supplier: x.r.state.value === 'sup', refund_amount: x.cash, debt_cancel: x.dc, credit: x.cr }));
    const need = lines.some(x => x.refund_amount > 0);
    const r = await run(btn, () => rpc('create_return_batch', { date, reason, note: note.value, refund_account_id: need ? acc.get() : null, lines }));
    if (r) { setPref('payAcc', acc.get()); toast(`مرجوعی ثبت شد (${fmt(lines.length)} قلم)` + (lines.some(x => x.credit > 0) ? ' · اعتبار مشتری ثبت شد' : '')); m.close(); await bus.refresh(); }
  };
  const m = modal({ title: 'مرجوعی از مشتری (چند قلم با هم)', wide: true, body: h('div', { class: 'form' },
    field('تاریخ', dateField(date, v => { date = v; })), field('کدام فروش؟', sale), field('کدام قلم‌ها برگشت خورد؟', box), field('علت برگشت', reasonC), debtBox, modeBox, accBox, sum, field('توضیح', note)), footer: [btn] });
  drawLines();
}
