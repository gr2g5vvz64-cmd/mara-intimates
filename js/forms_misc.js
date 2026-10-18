// فرم‌های جانبی: دریافت، پرداخت، هزینه، انتقال، مرجوعی، جابجایی کالا، کالا/تامین‌کننده، ابطال
import { h, fmt, todayISO, toast, sum, jstr, addDaysISO } from './util.js';
import { S, rpc, bus, pref, setPref, businessAccounts, accBalance, EXPCATS, holdKey, canVoid, canEdit, errText, catNames } from './store.js';
import { willGoNegative } from './insights.js';
import { jmonthKey, jmonthName } from './util.js';
import { modal, field, chips, accountPicker, numField, intField, dateField, dueField, combo, run, confirmBox, promptBox, dl, pill, N } from './ui.js';

const P = (text) => h('p', { class: 'hint' }, text);
const accOf = name => S.accounts.find(a => a.name === name);
/** هشدار نرم: اگر این پرداخت مانده‌ی یک حساب کسب‌وکار را منفی کند، قبل از ثبت می‌پرسد */
async function okNeg(accountId, amount) {
  const w = willGoNegative(accountId, Number(amount) || 0); if (!w) return true;
  return confirmBox(`مانده‌ی «${w.name}» الان ${fmt(w.bal)} ریال است و بعد از این ثبت ${fmt(w.after)} ریال (منفی) می‌شود. شاید حساب اشتباه انتخاب شده یا پولی به آن واریز نشده. مطمئنی؟`, 'بله، ثبت کن');
}
async function finish(m, msg) { toast(msg); m.close(); await bus.refresh(); }

/* ----- دریافت از مشتری (تسویه نسیه) ----- */
export function collectionForm(saleId) {
  let date = todayISO();
  const open = S.vSales.filter(s => !s.voided && s.outstanding > 0);
  if (!open.length) { toast('هیچ مشتری بدهکاری وجود ندارد'); return; }
  const sale = combo({ placeholder: 'مشتری یا شماره فروش…', options: open.map(s => ({ v: s.id, label: `${s.no} · ${s.customer || 'بدون نام'}`, sub: `باقی‌مانده ${fmt(s.outstanding)} · ${jstr(s.date)}`, keywords: s.items_text })), value: saleId || null, onChange: v => { amt.set(S.SALE[v].outstanding); } });
  const amt = numField({ value: saleId ? S.SALE[saleId].outstanding : '' });
  const acc = accountPicker(businessAccounts(), null, () => {}, { pockets: false, balances: accBalance });
  const last = pref('recvAcc_any', null); acc.set(last && S.A[last] ? last : (businessAccounts()[1] || businessAccounts()[0]).id);
  const note = h('input', { class: 'inp', placeholder: 'یادداشت (اختیاری)' });
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت دریافت');
  btn.onclick = async () => {
    if (!sale.get()) return toast('فروش را انتخاب کن', 'err');
    if (!amt.get()) return toast('مبلغ را بنویس', 'err');
    const r = await run(btn, () => rpc('add_collection', { date, sale_id: sale.get(), account_id: acc.get(), amount: amt.get(), note: note.value }));
    if (r) { setPref('recvAcc_any', acc.get()); finish(m, 'دریافت ثبت شد'); }
  };
  const m = modal({ title: 'دریافت از مشتری (تسویه نسیه)', body: h('div', { class: 'form' }, field('تاریخ', dateField(date, v => { date = v; })), field('کدام فروش؟', sale), field('مبلغ دریافتی', amt), field('به کدام حساب آمد؟', acc), field('یادداشت', note)), footer: [btn] });
}

/* ----- پرداخت به تامین‌کننده ----- */
export function supplierPaymentForm(preset = {}) {
  let date = todayISO();
  const sup = combo({ placeholder: 'تامین‌کننده…', options: S.suppliers.map(s => ({ v: s.id, label: s.name })), value: preset.supplier_id || null, onChange: () => { drawInv(); } });
  const inv = h('select', { class: 'sel full', 'aria-label': 'فاکتور' });
  const amt = numField({ value: '', onInput: () => preview() });
  const hint = h('div', { class: 'hint' });
  const drawInv = () => {
    const sid = sup.get();
    const list = S.vInvoices.filter(i => i.supplier_id === sid && !i.voided && i.debt > 0);
    inv.replaceChildren(h('option', { value: '' }, 'خودکار: روی قدیمی‌ترین فاکتورها پخش شود'), ...list.map(i => h('option', { value: i.id }, `${i.no} · ${jstr(i.date)} · مانده ${fmt(i.debt)}`)));
    if (preset.invoice_id && list.some(i => i.id === preset.invoice_id)) inv.value = preset.invoice_id;
    pickInv(); preview();
    const bal = S.vSup.find(x => x.id === sid); hint.textContent = bal ? (bal.balance > 0 ? `کل بدهی فعلی به این تامین‌کننده: ${fmt(bal.balance)} ریال` : bal.balance < 0 ? `این تامین‌کننده ${fmt(-bal.balance)} ریال به ما بدهکار است` : 'بدهی‌ای وجود ندارد') : '';
  };
  const pickInv = () => { const i = S.INV[+inv.value]; if (i) amt.set(i.debt); preview(); };
  inv.onchange = pickInv;
  const prevBox = h('div', { class: 'sumbox', hidden: true });
  function preview() {
    const sid = sup.get(), a = amt.get(); prevBox.replaceChildren(); prevBox.hidden = true;
    if (!sid || !a) return;
    const r = (k, v, c = '') => h('div', { class: 'srow ' + c }, h('span', null, k), h('b', { class: 'n' }, fmt(v)));
    if (inv.value) { const i = S.INV[+inv.value]; prevBox.hidden = false; prevBox.append(r(`مانده‌ی ${i.no} بعد از این پرداخت`, Math.max(0, i.debt - a), i.debt - a < 0 ? 'warn' : 'ok')); if (a > i.debt) prevBox.append(h('div', { class: 'hint' }, 'مبلغ از بدهی این فاکتور بیشتر است؛ «خودکار» را انتخاب کن.')); return; }
    let left = a; const list = S.vInvoices.filter(i => i.supplier_id === sid && !i.voided && i.debt > 0.5).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.id - y.id));
    prevBox.hidden = false;
    for (const i of list) { if (left <= 0) break; const p = Math.min(left, i.debt); prevBox.append(r(`${i.no} (${jstr(i.date)})`, p, p >= i.debt ? 'ok' : '')); left -= p; }
    if (left > 0) prevBox.append(r('اضافه‌پرداخت (پیش‌پرداخت؛ تامین‌کننده بدهکار ما می‌شود)', left, 'info'));
  }
  const acc = accountPicker(S.accounts, null, () => {}, { pockets: true, balances: accBalance });
  const lastA = pref('payAcc', null); acc.set(lastA && S.A[lastA] ? lastA : (businessAccounts()[1] || businessAccounts()[0]).id);
  const note = h('input', { class: 'inp', placeholder: 'یادداشت (اختیاری)' });
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت پرداخت');
  btn.onclick = async () => {
    if (!sup.get()) return toast('تامین‌کننده را انتخاب کن', 'err');
    if (!amt.get()) return toast('مبلغ را بنویس', 'err');
    if (!(await okNeg(acc.get(), amt.get()))) return;
    const r = await run(btn, () => rpc('add_supplier_payment', { date, supplier_id: sup.get(), invoice_id: inv.value || null, account_id: acc.get(), amount: amt.get(), note: note.value }));
    if (r) { setPref('payAcc', acc.get()); finish(m, 'پرداخت ثبت شد'); }
  };
  const m = modal({ title: 'پرداخت بدهی تامین‌کننده', body: h('div', { class: 'form' }, field('تاریخ', dateField(date, v => { date = v; })), field('تامین‌کننده', sup, null), hint, field('مربوط به کدام فاکتور؟', inv, 'برای قسط‌های تکه‌تکه، هر بار فقط مبلغ همان قسط را بنویس.'), field('مبلغ', amt), prevBox, field('از کدام حساب پرداخت شد؟', acc), field('یادداشت', note)), footer: [btn] });
  drawInv();
}

/* ----- هزینه ----- */
export function expenseForm() {
  let date = todayISO(), cat = EXPCATS[0];
  const catChips = chips(EXPCATS.map(c => ({ v: c, label: c })), cat, v => { cat = v; custom.value = ''; });
  const custom = h('input', { class: 'inp', placeholder: 'یا دسته‌ی دیگر را بنویس' });
  custom.oninput = () => { if (custom.value) catChips.set(null); };
  const amt = numField({ value: '' });
  const acc = accountPicker(S.accounts, null, () => {}, { pockets: true, balances: accBalance });
  const lastA = pref('payAcc', null); acc.set(lastA && S.A[lastA] ? lastA : (businessAccounts()[1] || businessAccounts()[0]).id);
  const note = h('input', { class: 'inp', placeholder: 'توضیح (مثلاً تبلیغ استوری)' });
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت هزینه');
  btn.onclick = async () => {
    const c = custom.value.trim() || catChips.get();
    if (!c) return toast('دسته‌ی هزینه را انتخاب کن', 'err');
    if (!amt.get()) return toast('مبلغ را بنویس', 'err');
    if (!(await okNeg(acc.get(), amt.get()))) return;
    const r = await run(btn, () => rpc('add_expense', { date, category: c, amount: amt.get(), account_id: acc.get(), note: note.value }));
    if (r) { setPref('payAcc', acc.get()); finish(m, 'هزینه ثبت شد'); }
  };
  const m = modal({ title: 'هزینه‌ی جدید', body: h('div', { class: 'form' }, field('تاریخ', dateField(date, v => { date = v; })), field('دسته', [catChips, custom]), field('مبلغ', amt), field('از کدام حساب پرداخت شد؟', acc), field('توضیح', note), P('هزینه‌ی پیک و بسته‌بندی هر فروش را در خود فرم فروش بنویس، نه اینجا.')), footer: [btn] });
}

/* ----- انتقال بین حساب‌ها / سرمایه / برداشت سود ----- */
export function transferForm(preset = {}) {
  let date = todayISO(), kind = preset.kind || 'transfer';
  const kindChips = chips([{ v: 'transfer', label: 'انتقال / سرمایه' }, { v: 'profit_payout', label: 'برداشت سود' }], kind, v => { kind = v; hintK(); }, { cls: 'two' });
  const from = accountPicker(S.accounts, preset.from || null, () => {}, { pockets: true, balances: accBalance });
  const to = accountPicker(S.accounts, preset.to || null, () => {}, { pockets: true, balances: accBalance });
  const amt = numField({ value: preset.amount || '' });
  const note = h('input', { class: 'inp', placeholder: 'توضیح (مثلاً سرمایه‌ی اولیه)' });
  const hk = h('div', { class: 'hint' });
  const hintK = () => { hk.textContent = kind === 'profit_payout' ? 'برداشت سود: از یک حساب کسب‌وکار به «جیب شخصی» همان نفر. در سرمایه‌ی او حساب نمی‌شود.' : 'گذاشتن پول شخصی در کسب‌وکار = از «جیب شخصی» به یک حساب (سرمایه‌ی آن نفر بالا می‌رود). انتقال بین مهسا و رعنا یا واریز نقد به حساب هم همین‌جاست.'; };
  hintK();
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت انتقال');
  btn.onclick = async () => {
    if (!from.get() || !to.get()) return toast('مبدأ و مقصد را انتخاب کن', 'err');
    if (!amt.get()) return toast('مبلغ را بنویس', 'err');
    if (!(await okNeg(from.get(), amt.get()))) return;
    const r = await run(btn, () => rpc('add_transfer', { date, from_account_id: from.get(), to_account_id: to.get(), amount: amt.get(), kind, note: note.value }));
    if (r) finish(m, 'انتقال ثبت شد');
  };
  const m = modal({ title: 'انتقال بین حساب‌ها', body: h('div', { class: 'form' }, kindChips, hk, field('تاریخ', dateField(date, v => { date = v; })), field('از حساب', from), field('به حساب', to), field('مبلغ', amt), field('توضیح', note)), footer: [btn] });
}

/* ----- مرجوعی از مشتری ----- */
export function returnForm(saleId, edit) {
  let date = edit ? edit.date : todayISO(), cond = edit ? edit.condition : 'سالم', toSup = edit ? !!edit.to_supplier : false, holder = edit ? edit.holder : null;
  const avail = l => l.qty - l.returned_qty + (edit && l.id === edit.sale_line_id ? edit.qty : 0);   // در ویرایش، تعداد همین مرجوعی هم قابل انتخاب است
  const sales = S.vSales.filter(s => !s.voided);
  const sale = combo({ placeholder: 'کدام فروش؟ شماره، کالا یا مشتری…', options: sales.slice().reverse().map(s => ({ v: s.id, label: `${s.no} · ${jstr(s.date)}`, sub: s.items_text + (s.customer ? ' · ' + s.customer : ''), keywords: s.items_text + ' ' + (s.customer || '') })), value: saleId || null, onChange: () => drawLines() });
  const lineSel = h('select', { class: 'sel full', 'aria-label': 'کالای برگشتی', onchange: () => setupLine() });
  const qty = intField({ value: 1, min: 1, big: true, onChange: () => defaults() });
  const refund = numField({ value: '', onInput: () => preview() });
  const debt = numField({ value: '', onInput: () => preview() });
  const debtBox = h('div', { hidden: true }, field('کسر از بدهی (نسیه‌ی) مشتری', debt, 'اگر مشتری هنوز بدهکار است، می‌توانی به‌جای پس‌دادن پول، از بدهی‌اش کم کنی.'));
  const acc = accountPicker(businessAccounts(), null, () => {}, { pockets: false, balances: accBalance });
  const lastA = pref('payAcc', null); acc.set(lastA && S.A[lastA] ? lastA : (businessAccounts()[1] || businessAccounts()[0]).id);
  const accBox = h('div', null, field('پول از کدام حساب برگشت؟', acc));
  const condC = chips([{ v: 'سالم', label: 'سالم' }, { v: 'معیوب', label: 'معیوب' }], cond, v => { cond = v; preview(); }, { cls: 'two' });
  const supC = chips([{ v: false, label: 'نه، پیش خودمان می‌ماند' }, { v: true, label: 'بله، به تامین‌کننده پس دادیم' }], toSup, v => { toSup = v; preview(); }, { cls: 'two' });
  const holdC = chips([{ v: 'مهسا', label: 'مهسا' }, { v: 'رعنا', label: 'رعنا' }], null, v => { holder = v; preview(); }, { cls: 'two' });
  const holdLbl = h('label', { class: 'lbl' }, '');
  const holdBox = h('div', null, holdLbl, holdC);
  function syncHolder() {
    const l = cur(); const keep = !toSup && cond === 'سالم';
    holdLbl.textContent = keep ? 'کالای برگشتی پیش چه کسی می‌ماند؟' : toSup ? 'چه کسی کالا را به تامین‌کننده پس داد؟' : 'چه کسی کالای معیوب را تحویل گرفت؟';
    if (l && !holder) holder = l.holder;
    holdC.querySelectorAll('button').forEach(b => { const on = b.textContent.trim() === holder; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  }
  const prev = h('div', { class: 'sumbox' });
  const note = h('input', { class: 'inp', placeholder: 'دلیل (مثلاً سایز مناسب نبود)' });
  let lines = [];
  function drawLines() {
    const s = S.SALE[sale.get()];
    lines = s ? S.saleLines.filter(l => l.sale_id === s.id && avail(l) > 0) : [];
    lineSel.replaceChildren(...lines.map(l => h('option', { value: l.id }, `${S.I[l.item_id].name} · ${avail(l)} عدد قابل برگشت · فی ${fmt(Math.round(l.net_unit))}${l.net_unit < l.unit_price ? ' (پس از تخفیف)' : ''} · ${S.LOT[l.lot_id].lot_no}`)));
    debtBox.hidden = !(s && s.outstanding + (edit ? edit.debt_cancel || 0 : 0) > 0);
    setupLine();
  }
  const cur = () => lines.find(l => l.id === +lineSel.value);
  function setupLine() { const l = cur(); holder = l ? l.holder : null; if (l) { qty.setMax(avail(l)); qty.set(1); } defaults(); }
  function defaults() { const l = cur(); if (l) { refund.set(Math.round(qty.get() * l.net_unit)); debt.set(''); } preview(); }
  function preview() {
    const l = cur(); prev.replaceChildren(); syncHolder(); if (!l) return;
    const lot = S.LOT[l.lot_id]; const q = qty.get();
    const rec = toSup ? q * lot.net_price : cond === 'سالم' ? q * lot.landed_unit : 0;
    const eff = rec - refund.get() - debt.get();
    const r = (k, v, c = '') => h('div', { class: 'srow ' + c }, h('span', null, k), h('b', { class: 'n' }, fmt(v)));
    prev.append(r('پول برگشتی به مشتری', refund.get() + debt.get()), r(toSup ? 'اعتبار نزد تامین‌کننده' : cond === 'سالم' ? 'ارزش کالای برگشته به موجودی' : 'ارزش بازیافت‌شده', rec),
      r(eff >= 0 ? 'سود این مرجوعی' : 'ضرر این مرجوعی', Math.abs(eff), eff >= 0 ? 'ok' : 'warn'));
    if (!toSup && cond === 'سالم') prev.append(h('div', { class: 'hint' }, `کالا به موجودی ${holder || l.holder} برمی‌گردد.` + (holder && holder !== l.holder ? ` (در فروش از موجودی ${l.holder} کم شده بود.)` : '')));
  }
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, edit ? 'ذخیره‌ی ویرایش مرجوعی' : 'ثبت مرجوعی');
  btn.onclick = async () => {
    const l = cur(); if (!l) return toast('کالای برگشتی را انتخاب کن', 'err');
    if (refund.get() > 0 && !acc.get()) return toast('حساب بازگشت پول را انتخاب کن', 'err');
    const r = await run(btn, () => rpc(edit ? 'edit_return' : 'create_return', { ...(edit ? { id: edit.id } : {}), date, sale_line_id: l.id, holder: holder || l.holder, qty: qty.get(), condition: cond, to_supplier: toSup, refund_amount: refund.get(), refund_account_id: refund.get() > 0 ? acc.get() : null, debt_cancel: debt.get(), note: note.value }));
    if (r) { setPref('payAcc', acc.get()); finish(m, `مرجوعی ${r.no} ${edit ? 'ویرایش شد' : 'ثبت شد'}`); }
  };
  const m = modal({ title: edit ? `ویرایش مرجوعی ${edit.no}` : 'مرجوعی از مشتری', wide: true, body: h('div', { class: 'form' },
    field('تاریخ', dateField(date, v => { date = v; })), field('کدام فروش؟', sale), field('کدام کالا؟', lineSel), field('چند عدد برگشت؟', qty),
    field('وضعیت کالا', condC, 'سالم = به موجودی برمی‌گردد. معیوب = ضرر ثبت می‌شود.'), field('به تامین‌کننده پس داده شد؟', supC, 'اگر بله، بهای خرید کالا از بدهی همان تامین‌کننده کم می‌شود.'),
    holdBox, field('چقدر به مشتری پس دادیم؟', refund), accBox, debtBox, prev, field('دلیل', note)), footer: [btn] });
  drawLines();
  if (edit) {                                   // پیش‌پر کردن با اطلاعات مرجوعی قبلی
    const sl0 = S.saleLines.find(l => l.id === edit.sale_line_id);
    if (sl0) { sale.set(sl0.sale_id); drawLines(); lineSel.value = String(edit.sale_line_id); setupLine(); }
    qty.set(edit.qty); condC.set(edit.condition); supC.set(!!edit.to_supplier); holder = edit.holder;
    refund.set(edit.refund_amount || ''); debt.set(edit.debt_cancel || '');
    if (edit.refund_account_id && S.A[edit.refund_account_id]) acc.set(edit.refund_account_id);
    note.value = edit.note || ''; preview();
  }
}

/* ----- برگشت کالای فروش‌نرفته به تامین‌کننده ----- */
export function supplierReturnForm(edit) {
  let date = edit ? edit.date : todayISO(), holder = edit ? edit.holder : 'مهسا';
  const lots = () => S.lots.filter(l => !l.voided && (l[holdKey(holder)] > 0 || (edit && l.id === edit.lot_id && holder === edit.holder)));
  const opts = () => lots().map(l => ({ v: l.id, label: `${l.item} · ${l.lot_no}`, sub: `${l.supplier} · فاکتور ${l.invoice_no} · نزد ${holder} ${l[holdKey(holder)]} عدد` }));
  const lot = combo({ placeholder: 'کالا / دسته…', options: opts(), onChange: () => prev() });
  const hold = chips([{ v: 'مهسا', label: 'مهسا' }, { v: 'رعنا', label: 'رعنا' }], holder, v => { holder = v; lot.set(null); lot.setOptions(opts()); prev(); }, { cls: 'two' });
  const qty = intField({ value: 1, min: 1, big: true, onChange: () => prev() });
  const prevE = h('div', { class: 'sumbox' });
  const note = h('input', { class: 'inp', placeholder: 'دلیل' });
  function prev() { const l = S.LOT[lot.get()]; prevE.replaceChildren(); if (!l) return; const cr = qty.get() * l.net_price; prevE.append(h('div', { class: 'srow' }, h('span', null, 'اعتبار از بدهی ' + l.supplier), h('b', { class: 'n' }, fmt(cr)))); }
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت برگشت به تامین‌کننده');
  btn.onclick = async () => { if (!lot.get()) return toast('دسته را انتخاب کن', 'err'); const r = await run(btn, () => rpc(edit ? 'edit_return' : 'create_supplier_return', { ...(edit ? { id: edit.id } : {}), date, lot_id: lot.get(), holder, qty: qty.get(), note: note.value })); if (r) finish(m, `${edit ? 'ویرایش شد' : 'ثبت شد'} (${r.no})`); };
  const m = modal({ title: edit ? `ویرایش برگشت به تامین‌کننده ${edit.no}` : 'برگشت کالا به تامین‌کننده', body: h('div', { class: 'form' }, field('تاریخ', dateField(date, v => { date = v; })), field('چه کسی کالا را به تامین‌کننده پس داد؟ (از موجودی همین نفر کم می‌شود)', hold), field('کدام کالا؟', lot), field('تعداد', qty), prevE, field('دلیل', note), P('مبلغ به‌ازای قیمت خرید از بدهی تامین‌کننده کم می‌شود؛ اگر بدهی صفر شود، تامین‌کننده بدهکار ما می‌شود.')), footer: [btn] });
  if (edit) { lot.setOptions(opts()); lot.set(edit.lot_id); qty.set(edit.qty); note.value = edit.note || ''; hold.set(edit.holder); prev(); }
}

/* ----- جابجایی کالا بین مهسا و رعنا ----- */
export function moveStockForm(lotId) {
  let date = todayISO(), from = 'مهسا';
  const lot = S.LOT[lotId];
  const to = () => (from === 'مهسا' ? 'رعنا' : 'مهسا');
  const fc = chips([{ v: 'مهسا', label: 'از مهسا به رعنا' }, { v: 'رعنا', label: 'از رعنا به مهسا' }], from, v => { from = v; qty.setMax(lot[holdKey(from)]); info(); }, { cls: 'two' });
  const qty = intField({ value: 1, min: 1, max: lot.rem_m || 1, big: true });
  const inf = h('div', { class: 'hint' }); const info = () => { inf.textContent = `موجودی این دسته نزد ${from}: ${lot[holdKey(from)]} عدد`; }; info();
  const note = h('input', { class: 'inp', placeholder: 'توضیح' });
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت جابجایی');
  btn.onclick = async () => { const r = await run(btn, () => rpc('move_stock', { date, lot_id: lotId, from_holder: from, to_holder: to(), qty: qty.get(), note: note.value })); if (r) finish(m, 'جابجایی ثبت شد'); };
  const m = modal({ title: `جابجایی ${lot.item} (${lot.lot_no})`, body: h('div', { class: 'form' }, field('تاریخ', dateField(date, v => { date = v; })), fc, inf, field('چند عدد؟', qty), field('توضیح', note)), footer: [btn] });
}

/* ----- کالا و تامین‌کننده ----- */
/** انتخاب دسته با دکمه‌های آماده (شورت، سوتین، جوراب، …) و «＋ دسته‌ی جدید»؛ دسته‌ی تازه همراه ذخیره‌ی کالا ساخته می‌شود */
export function categoryPicker(value) {
  let cur = value || ''; const extra = [];
  const wrap = h('div');
  const draw = () => {
    const names = [...new Set([...catNames(), ...extra, ...(cur ? [cur] : [])])];
    const ch = chips(names.map(n => ({ v: n, label: n })), cur, v => { cur = v; }, { label: 'دسته‌ی کالا' });
    const add = h('button', { type: 'button', class: 'btn dashed', onclick: async () => {
      const nm = await promptBox('نام دسته‌ی جدید (مثلاً لباس خواب)'); if (!nm || !nm.trim()) return;
      cur = nm.trim(); if (!names.includes(cur)) extra.push(cur); draw();
    } }, '＋ دسته‌ی جدید');
    wrap.replaceChildren(ch, add);
  };
  draw(); wrap.get = () => cur; return wrap;
}

/** پنجره‌ی انتخاب دسته برای کالایی که وسط خرید ساخته می‌شود؛ بدون انتخاب دسته، کالا ساخته نمی‌شود */
export function pickCategoryDialog(itemName) {
  return new Promise(res => {
    let done = false; const pk = categoryPicker('');
    const fin = v => { if (done) return; done = true; m.close(); res(v); };
    const ok = h('button', { type: 'button', class: 'btn primary lg', onclick: () => { if (!pk.get()) return toast('دسته‌ی کالا را انتخاب کن', 'err'); fin(pk.get()); } }, 'ساخت کالا');
    const m = modal({ title: `دسته‌ی «${itemName}» چیست؟`, body: h('div', { class: 'form' }, P('هر کالا باید یک دسته داشته باشد تا سود هر دسته در داشبورد درست حساب شود.'), field('دسته', pk)), footer: [ok], onClose: () => { if (!done) { done = true; res(null); } } });
  });
}

/* ----- مدیریت دسته‌های کالا (افزودن، تغییر نام، فعال/غیرفعال) ----- */
export function categoriesForm() {
  const host = h('div', { class: 'form' });
  const call = async (p, msg) => { try { const r = await rpc('save_category', p); if (r && r.queued) return; await bus.refresh(); toast(msg); draw(); } catch (e) { toast(errText(e), 'err'); } };
  const draw = () => {
    const rows = S.categories.slice().sort((a, b) => a.sort - b.sort || a.id - b.id);
    const used = c => S.items.filter(i => i.category === c.name).length;
    const add = h('button', { type: 'button', class: 'btn primary', onclick: async () => { const nm = await promptBox('نام دسته‌ی جدید'); if (nm && nm.trim()) call({ name: nm.trim() }, 'دسته اضافه شد'); } }, '＋ دسته‌ی جدید');
    host.replaceChildren(P('دسته‌بندی برای دیدن سود هر دسته در داشبورد و فیلتر کردن موجودی است. تغییر نام، دسته‌ی همه‌ی کالاهای آن را هم عوض می‌کند. دسته حذف نمی‌شود؛ فقط غیرفعال می‌شود.'),
      ...(rows.length ? rows.map(c => h('div', { class: 'li' }, h('div', null, h('b', null, c.name, ' ', c.active ? null : pill('غیرفعال', 'gray')), h('small', null, `${used(c)} کالا`)),
        h('div', { class: 'acts' }, h('button', { type: 'button', class: 'mini', onclick: async () => { const nm = await promptBox(`نام جدید برای «${c.name}»`); if (nm && nm.trim() && nm.trim() !== c.name) call({ id: c.id, name: nm.trim() }, 'نام دسته عوض شد'); } }, 'تغییر نام'),
          h('button', { type: 'button', class: 'mini', onclick: () => call({ id: c.id, active: !c.active }, c.active ? 'غیرفعال شد' : 'فعال شد') }, c.active ? 'غیرفعال' : 'فعال')))) : [h('div', { class: 'empty sm' }, 'هنوز دسته‌ای نیست')]), add);
  };
  draw(); modal({ title: 'دسته‌های کالا', body: host });
}

export function itemForm(it) {
  if (it && !canEdit()) { toast("ویرایش فقط برای حمیدرضا و مهسا باز است", "err"); return; }
  const name = h('input', { class: 'inp', value: it ? it.name : '', placeholder: 'مثلاً سوتین اسپرت' });
  const desc = h('input', { class: 'inp', value: it && it.description || '', placeholder: 'مثلاً جنس، رنگ، سایز، مدل (اختیاری)', maxlength: 300 });
  const cat = categoryPicker(it && it.category || '');
  const min = intField({ value: it ? it.min_stock : 3, min: 0 });
  const act = chips([{ v: true, label: 'فعال' }, { v: false, label: 'غیرفعال' }], it ? it.active : true, () => {}, { cls: 'two' });
  const used = it && S.lines.some(l => l.item_id === it.id);
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, it ? 'ذخیره' : 'افزودن کالا');
  btn.onclick = async () => { if (!cat.get()) return toast('دسته‌ی کالا را انتخاب کن', 'err'); const r = await run(btn, () => rpc('save_item', { id: it && it.id, name: name.value, description: desc.value, category: cat.get(), min_stock: min.get(), active: act.get() })); if (r) finish(m, 'ذخیره شد'); };
  const delBtn = h('button', { class: 'btn danger ghost', type: 'button' }, 'حذف کالا');
  delBtn.onclick = async () => { if (!(await confirmBox(`«${it.name}» حذف شود؟ از لیست‌ها کنار می‌رود و سوابق مالی‌اش (فاکتورها و سود) می‌ماند. کالایی که موجودی دارد حذف نمی‌شود.`, 'حذف کن', true))) return; const r = await run(delBtn, () => rpc('save_item', { id: it.id, name: it.name, category: it.category, min_stock: it.min_stock, active: false })); if (r) finish(m, 'کالا حذف شد'); };
  const m = modal({ title: it ? 'ویرایش کالا' : 'کالای جدید', body: h('div', { class: 'form' }, field('نام کالا', name, used && !canEdit() ? 'این کالا در خرید/فروش استفاده شده؛ نامش را فقط حمیدرضا و مهسا می‌توانند عوض کنند.' : null), field('توضیحات کالا', desc, 'در فاکتور خرید و فروش کنار این کالا دیده می‌شود.'), field('دسته', cat), field('هشدار کم‌موجودی از … عدد', min), it ? field('وضعیت', act) : null), footer: [btn, ...(it ? [delBtn] : [])] });
}
export function supplierForm(s) {
  if (s && !canEdit()) { toast("ویرایش فقط برای حمیدرضا و مهسا باز است", "err"); return; }
  const name = h('input', { class: 'inp', value: s ? s.name : '' }), phone = h('input', { class: 'inp', value: s && s.phone || '', dir: 'ltr', inputmode: 'tel' });
  const addr = h('input', { class: 'inp', value: s && s.address || '' }), note = h('input', { class: 'inp', value: s && s.note || '' });
  const act = chips([{ v: true, label: 'فعال' }, { v: false, label: 'غیرفعال' }], s ? s.active : true, () => {}, { cls: 'two' });
  const used = s && S.invoices.some(i => i.supplier_id === s.id);
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, s ? 'ذخیره' : 'افزودن تامین‌کننده');
  btn.onclick = async () => { const r = await run(btn, () => rpc('save_supplier', { id: s && s.id, name: name.value, phone: phone.value, address: addr.value, note: note.value, active: act.get() })); if (r) finish(m, 'ذخیره شد'); };
  const delBtn = h('button', { class: 'btn danger ghost', type: 'button' }, 'حذف تامین‌کننده');
  delBtn.onclick = async () => { if (!(await confirmBox(`«${s.name}» حذف شود؟ از لیست‌ها کنار می‌رود و فاکتورهایش می‌ماند. تا حساب باز دارید حذف نمی‌شود.`, 'حذف کن', true))) return; const r = await run(delBtn, () => rpc('save_supplier', { id: s.id, name: s.name, phone: s.phone, address: s.address, note: s.note, active: false })); if (r) finish(m, 'تامین‌کننده حذف شد'); };
  const m = modal({ title: s ? 'ویرایش تامین‌کننده' : 'تامین‌کننده‌ی جدید', body: h('div', { class: 'form' }, field('نام', name, used && !canEdit() ? 'با این تامین‌کننده فاکتور ثبت شده؛ نامش را فقط حمیدرضا و مهسا می‌توانند عوض کنند.' : null), field('تلفن', phone), field('نشانی', addr), field('یادداشت', note), s ? field('وضعیت', act) : null), footer: [btn, ...(s ? [delBtn] : [])] });
}

/* ----- مشتری ----- */
export function customerForm(c, after) {
  if (c && !canEdit()) { toast("ویرایش فقط برای حمیدرضا و مهسا باز است", "err"); return; }
  const name = h('input', { class: 'inp', value: c ? c.name : '', placeholder: 'نام مشتری' });
  const phone = h('input', { class: 'inp', value: c && c.phone || '', dir: 'ltr', inputmode: 'tel', placeholder: '09…' });
  const note = h('input', { class: 'inp', value: c && c.note || '', placeholder: 'یادداشت (مثلاً اینستاگرام: @sara)' });
  const act = chips([{ v: true, label: 'فعال' }, { v: false, label: 'غیرفعال' }], c ? c.active : true, () => {}, { cls: 'two' });
  const used = c && S.vSales.some(x => x.customer_id === c.id);
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, c ? 'ذخیره' : 'افزودن مشتری');
  btn.onclick = async () => { const r = await run(btn, () => rpc('save_customer', { id: c && c.id, name: name.value, phone: phone.value, note: note.value, active: act.get() })); if (r) { await finish(m, 'ذخیره شد'); after && after(r); } };
  const delBtn = h('button', { class: 'btn danger ghost', type: 'button' }, 'حذف مشتری');
  delBtn.onclick = async () => { if (!(await confirmBox(`«${c.name}» حذف شود؟ از لیست‌ها کنار می‌رود و فروش‌هایش می‌ماند. مشتری بدهکار حذف نمی‌شود.`, 'حذف کن', true))) return; const r = await run(delBtn, () => rpc('save_customer', { id: c.id, name: c.name, phone: c.phone, note: c.note, active: false })); if (r) { await finish(m, 'مشتری حذف شد'); after && after(r); } };
  const m = modal({ title: c ? 'ویرایش مشتری' : 'مشتری جدید', body: h('div', { class: 'form' }, field('نام', name, used && !canEdit() ? 'برای این مشتری فروش ثبت شده؛ نامش را فقط حمیدرضا و مهسا می‌توانند عوض کنند.' : null), field('تلفن', phone), field('یادداشت', note), c ? field('وضعیت', act) : null), footer: [btn, ...(c ? [delBtn] : [])] });
}

/* ----- دریافت کلی از مشتری (کامل یا قسطی؛ روی قدیمی‌ترین بدهی‌ها می‌نشیند) ----- */
export function collectCustomerForm(customerId) {
  const open = S.vCus.filter(c => c.outstanding > 0.5);
  if (!open.length) { toast('هیچ مشتری بدهکاری وجود ندارد'); return; }
  let date = todayISO();
  const outOf = id => (S.vCus.find(c => c.id === id) || {}).outstanding || 0;
  const cus = combo({ placeholder: 'نام مشتری…', options: open.map(c => ({ v: c.id, label: c.name, sub: `بدهکار ${fmt(c.outstanding)}${c.overdue_amount > 0 ? ' · سررسید گذشته ' + fmt(c.overdue_amount) : ''}` })), value: customerId || null, onChange: v => { amt.set(outOf(v)); preview(); } });
  const amt = numField({ value: customerId ? outOf(customerId) : '', onInput: () => preview() });
  const quick = h('div', { class: 'quick' }, h('button', { type: 'button', class: 'mini', onclick: () => { amt.set(outOf(cus.get())); preview(); } }, 'کل بدهی'),
    h('button', { type: 'button', class: 'mini', onclick: () => { amt.set(Math.round(outOf(cus.get()) / 2)); preview(); } }, 'نصف بدهی'));
  const prevBox = h('div', { class: 'sumbox', hidden: true });
  function preview() {
    prevBox.replaceChildren(); const id = cus.get(), a = amt.get(); prevBox.hidden = true; if (!id || !a) return;
    const r = (k, v, c = '') => h('div', { class: 'srow ' + c }, h('span', null, k), h('b', { class: 'n' }, fmt(v)));
    let left = a; prevBox.hidden = false;
    const list = S.vSales.filter(s => s.customer_id === id && !s.voided && s.outstanding > 0.5).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.id - y.id));
    for (const s of list) { if (left <= 0) break; const p = Math.min(left, s.outstanding); prevBox.append(r(`${s.no} (${jstr(s.date)}) ← ${p >= s.outstanding ? 'تسویه' : 'مانده ' + fmt(s.outstanding - p)}`, p, p >= s.outstanding ? 'ok' : '')); left -= p; }
    if (left > 0) prevBox.append(h('div', { class: 'warnbox' }, `مبلغ ${fmt(left)} ریال از کل بدهی مشتری بیشتر است.`));
    else prevBox.append(r('بدهی باقی‌مانده‌ی مشتری', Math.max(0, outOf(id) - a), outOf(id) - a <= 0 ? 'ok' : 'warn'));
  }
  const acc = accountPicker(businessAccounts(), null, () => {}, { pockets: false, balances: accBalance });
  const last = pref('recvAcc_any', null); acc.set(last && S.A[last] ? last : (businessAccounts()[1] || businessAccounts()[0]).id);
  const note = h('input', { class: 'inp', placeholder: 'یادداشت (اختیاری)' });
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت دریافت');
  btn.onclick = async () => {
    if (!cus.get()) return toast('مشتری را انتخاب کن', 'err');
    if (!amt.get()) return toast('مبلغ را بنویس', 'err');
    const r = await run(btn, () => rpc('collect_customer', { date, customer_id: cus.get(), account_id: acc.get(), amount: amt.get(), note: note.value }));
    if (r) { setPref('recvAcc_any', acc.get()); finish(m, 'دریافت ثبت شد'); }
  };
  const m = modal({ title: 'دریافت از مشتری (کامل یا قسطی)', body: h('div', { class: 'form' }, field('تاریخ', dateField(date, v => { date = v; })), field('مشتری', cus), field('مبلغی که امروز داد', [amt, quick]), prevBox, field('به کدام حساب آمد؟', acc), field('یادداشت', note), P('اگر مشتری کم‌کم می‌دهد، هر بار فقط مبلغ همان قسط را بنویس؛ باقی‌مانده سر جایش می‌ماند و از قدیمی‌ترین فروش کم می‌شود.')), footer: [btn] });
  if (customerId) preview();
}

/* ----- تغییر/تمدید سررسید ----- */
export function setDueForm(kind, row) {
  const due = dueField(() => row.date, { label: kind === 'sale' ? 'مشتری تا کی بدهد؟' : 'تا کی باید بدهیم؟' });
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ذخیره‌ی سررسید');
  btn.onclick = async () => { const r = await run(btn, () => rpc('set_due_date', { kind, id: row.id, due_date: due.get() })); if (r) finish(m, 'سررسید ذخیره شد'); };
  const m = modal({ title: `سررسید ${row.no}`, body: h('div', { class: 'form' }, row.due_date ? h('p', { class: 'hint' }, 'سررسید فعلی: ' + jstr(row.due_date)) : null, due), footer: [btn] });
}

/* ----- ابطال ----- */
export async function voidEntry(kind, row, label) {
  if (!canVoid(row)) return toast('ابطال و ویرایش فقط برای حمیدرضا و مهسا باز است', 'err');
  const ok = await confirmBox(`«${label}» باطل شود؟ چیزی پاک نمی‌شود؛ فقط از حساب‌ها کنار می‌رود و در لیست خط‌خورده می‌ماند.`, 'باطل کن', true);
  if (!ok) return;
  const why = await promptBox('دلیل ابطال', 'مثلاً اشتباه در مبلغ');
  if (!why) return toast('دلیل ابطال لازم است', 'err');
  try { const r = await rpc('void_entry', { kind, id: row.id, reason: why }); if (r && r.queued) return true; toast('باطل شد'); await bus.refresh(); return true; }
  catch (e) { toast(errText(e), 'err'); }
}

const has = f => f.input.value.trim() !== '';
/* ----- بستن روز: شمارش واقعی هر حساب با مانده‌ی سیستم مقایسه می‌شود ----- */
export function dayCloseForm() {
  let date = todayISO();
  const rows = businessAccounts().map(a => {
    const sys = accBalance(a.id), inp = numField({ value: '', placeholder: 'اگر نشمردی خالی بگذار', onInput: () => diff() });
    const df = h('span', { class: 'df' }, '—');
    const diff = () => { const v = inp.get(); if (!has(inp)) { df.textContent = '—'; df.className = 'df'; return; } const d = Number(v) - sys; df.textContent = d === 0 ? '✓ می‌خواند' : (d > 0 ? 'اضافه ' : 'کمبود ') + fmt(Math.abs(d)); df.className = 'df ' + (d === 0 ? 'pos' : d < 0 ? 'neg' : ''); };
    return { a, sys, inp, el: h('div', { class: 'acc-r' }, h('div', { class: 'sys' }, h('b', null, a.name), h('span', null, 'سیستم: ', N(sys))), field('موجودی شمارش‌شده (واقعی)', inp), h('div', { class: 'sys' }, h('span', null, 'اختلاف'), df)) };
  });
  const note = h('input', { class: 'inp', placeholder: 'یادداشت (مثلاً کمبود را بعداً پیدا کردیم)' });
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'بستن روز و ثبت');
  btn.onclick = async () => {
    const payload = rows.filter(r => has(r.inp)).map(r => ({ account_id: r.a.id, counted: r.inp.get() }));
    if (!payload.length) return toast('موجودی حداقل یک حساب را بنویس', 'err');
    const r = await run(btn, () => rpc('close_day', { date, rows: payload, note: note.value }));
    if (r) finish(m, 'روز بسته شد ✔');
  };
  const m = modal({ title: 'بستن روز', body: h('div', { class: 'form closeform' }, P('پول نقد و موجودی بانک را با اپ بانک یا شمارش دستی بنویس؛ اختلاف با سیستم همین‌جا ثبت می‌شود تا هیچ ریالی گم نشود.'), field('تاریخ', dateField(date, v => { date = v; })), ...rows.map(r => r.el), field('یادداشت', note)), footer: [btn] });
}

/* ----- هدف فروش ماهانه ----- */
export function goalForm() {
  const mk = jmonthKey(todayISO());
  const cur = p => { const g = S.goals.find(x => x.owner === p && x.month === mk); return g ? Number(g.amount) : ''; };
  const fm = numField({ value: cur('مهسا') }), fr = numField({ value: cur('رعنا') });
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت هدف');
  btn.onclick = async () => {
    const items = [['مهسا', fm], ['رعنا', fr]].filter(([, f]) => has(f));
    if (!items.length) return toast('مبلغ هدف حداقل یک نفر را بنویس', 'err');
    const r = await run(btn, async () => { let last; for (const [owner, f] of items) last = await rpc('set_goal', { month: mk, owner, amount: f.get() }); return last; });
    if (r) finish(m, 'هدف ثبت شد ✔');
  };
  const m = modal({ title: 'هدف فروش ' + jmonthName(mk), body: h('div', { class: 'form' }, P('مبلغی که هر نفر می‌خواهد این ماه بفروشد (ریال). هر وقت خواستی دوباره عوضش کن.'), field('هدف مهسا', fm), field('هدف رعنا', fr)), footer: [btn] });
}


/* ----- ویرایش پرداخت / دریافت / هزینه / انتقال / جابجایی (ابطال نسخه‌ی قبلی + ثبت نسخه‌ی اصلاح‌شده؛ فقط حمیدرضا و مهسا) ----- */
export function editEntryForm(kind, row) {
  if (!canEdit()) { toast('ویرایش فقط برای حمیدرضا و مهسا باز است', 'err'); return; }
  let date = row.date;
  const dateCtl = dateField(date, v => { date = v; });
  const amt = numField({ value: row.amount || '' });
  const note = h('input', { class: 'inp', value: row.note || '', placeholder: 'توضیح' });
  const body = [field('تاریخ', dateCtl)]; let build, title;
  if (kind === 'payment') {
    title = 'ویرایش پرداخت به ' + S.SUP[row.supplier_id].name;
    const acc = accountPicker(S.accounts, row.account_id, () => {}, { pockets: true, balances: accBalance });
    body.push(field('مبلغ', amt), field('از کدام حساب؟', acc), field('توضیح', note));
    build = () => ({ supplier_id: row.supplier_id, invoice_id: row.invoice_id || null, account_id: acc.get(), amount: amt.get(), note: note.value });
  } else if (kind === 'collection') {
    title = 'ویرایش دریافت';
    const acc = accountPicker(businessAccounts(), row.account_id, () => {}, { pockets: false, balances: accBalance });
    body.push(field('مبلغ', amt), field('به کدام حساب آمد؟', acc), field('توضیح', note));
    build = () => ({ sale_id: row.sale_id, account_id: acc.get(), amount: amt.get(), note: note.value });
  } else if (kind === 'expense') {
    title = 'ویرایش هزینه';
    let cat = row.category; const known = EXPCATS.includes(cat);
    const catChips = chips(EXPCATS.map(c => ({ v: c, label: c })), known ? cat : null, v => { cat = v; custom.value = ''; });
    const custom = h('input', { class: 'inp', value: known ? '' : cat, placeholder: 'یا دسته‌ی دیگر را بنویس' });
    custom.oninput = () => { if (custom.value) catChips.set(null); };
    const acc = accountPicker(S.accounts, row.account_id, () => {}, { pockets: true, balances: accBalance });
    body.push(field('دسته', [catChips, custom]), field('مبلغ', amt), field('از کدام حساب؟', acc), field('توضیح', note));
    build = () => ({ category: custom.value.trim() || catChips.get() || cat, amount: amt.get(), account_id: acc.get(), note: note.value });
  } else if (kind === 'transfer') {
    title = 'ویرایش انتقال';
    const from = accountPicker(S.accounts, row.from_account_id, () => {}, { pockets: true, balances: accBalance });
    const to = accountPicker(S.accounts, row.to_account_id, () => {}, { pockets: true, balances: accBalance });
    body.push(field('از حساب', from), field('به حساب', to), field('مبلغ', amt), field('توضیح', note));
    build = () => ({ from_account_id: from.get(), to_account_id: to.get(), amount: amt.get(), kind: row.kind, note: note.value });
  } else if (kind === 'move') {
    title = 'ویرایش جابجایی کالا';
    let from = row.from_holder;
    const fc = chips([{ v: 'مهسا', label: 'از مهسا به رعنا' }, { v: 'رعنا', label: 'از رعنا به مهسا' }], from, v => { from = v; }, { cls: 'two' });
    const q = intField({ value: row.qty, min: 1, big: true });
    body.push(fc, field('چند عدد؟', q), field('توضیح', note));
    build = () => ({ lot_id: row.lot_id, from_holder: from, to_holder: from === 'مهسا' ? 'رعنا' : 'مهسا', qty: q.get(), note: note.value });
  } else return;
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ذخیره‌ی ویرایش');
  btn.onclick = async () => {
    const pl = build();
    if (kind !== 'move' && !pl.amount) return toast('مبلغ را بنویس', 'err');
    const r = await run(btn, () => rpc('edit_entry', { entry: kind, id: row.id, date, ...pl }));
    if (r) finish(m, 'ویرایش شد');
  };
  const m = modal({ title, body: h('div', { class: 'form' }, ...body, P('ویرایش یعنی: ردیف قبلی باطل می‌شود (در تاریخچه می‌ماند) و ردیف اصلاح‌شده ثبت می‌شود.')), footer: [btn] });
}
