// فرم‌های جانبی: دریافت، پرداخت، هزینه، انتقال، مرجوعی، جابجایی کالا، کالا/تامین‌کننده، ابطال
import { h, fmt, todayISO, toast, sum, jstr, addDaysISO } from './util.js';
import { S, rpc, bus, loadAll, customers, pref, setPref, businessAccounts, accBalance, EXPCATS, holdKey, canVoid, canEdit, errText, catNames } from './store.js';
import { willGoNegative } from './insights.js';
import { findDup } from './dup.js';
import { jmonthKey, jmonthName } from './util.js';
import { modal, field, chips, accountPicker, numField, intField, dateField, dueField, combo, run, confirmBox, promptBox, dl, pill, N } from './ui.js';
import { KINDS, BANDS, CUPS, BRA_COMMON, ALPHA_START, SOCK, alphaList, kindOf, hintOf, bandHint, groupOf, SUMMARY, FREE_NOTE } from './sizes.js';

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
  const adm = !!(S.me && S.me.role === 'admin'); if (!adm) kind = 'transfer';   // برداشت سود و سرمایه فقط مدیر
  const kindChips = adm ? chips([{ v: 'transfer', label: 'انتقال / سرمایه' }, { v: 'profit_payout', label: 'برداشت سود' }], kind, v => { kind = v; hintK(); }, { cls: 'two' }) : h('div', { class: 'hint' }, 'برداشت سود و سرمایه فقط توسط حمیدرضا انجام می‌شود.');
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

/* ----- انتقال سرمایه / برابر کردن سهم‌ها -----
   دو راه برای رسیدن به سهم برابر:
   ۱) «پرداخت به شریک»: یکی از جیب خودش مبلغی (هر مقدار دلخواه) به دیگری می‌دهد؛ پول کسب‌وکار تغییر نمی‌کند، سرمایه‌ی گیرنده کم و پرداخت‌کننده زیاد می‌شود. برابر شدن کامل = نصفِ تفاوت.
   ۲) «واریز به کسب‌وکار»: شریکِ کم‌سرمایه پول تازه به حساب کسب‌وکار می‌ریزد؛ برابر شدن کامل = کل تفاوت. */
export function capitalForm() {
  const T = S.totals || {}, capM = T.capital_m || 0, capR = T.capital_r || 0;
  const cap = p => (p === 'مهسا' ? capM : capR), other = p => (p === 'مهسا' ? 'رعنا' : 'مهسا');
  const pocketOf = o => S.accounts.find(a => a.kind === 'pocket' && a.owner === o);
  let date = todayISO(), mode = 'pay', payer = capM >= capR ? 'رعنا' : 'مهسا';
  const modeChips = chips([{ v: 'pay', label: 'پرداخت به شریک (از جیب خودش)' }, { v: 'inject', label: 'واریز پول تازه به کسب‌وکار' }], mode, v => { mode = v; layout(); prev(); }, { cls: 'two' });
  const who = chips([{ v: 'مهسا', label: 'مهسا' }, { v: 'رعنا', label: 'رعنا' }], payer, v => { payer = v; prev(); }, { cls: 'two' });
  const amt = numField({ value: '', onInput: () => prev() });
  const acc = accountPicker(businessAccounts(), null, () => {}, { pockets: false, balances: accBalance });
  const accBox = h('div', null, field('به کدام حساب کسب‌وکار واریز شد؟', acc));
  const note = h('input', { class: 'inp', placeholder: 'توضیح (اختیاری)' });
  const pv = h('div', { class: 'prev' }), hint = h('div', { class: 'hint' });
  const diff = () => Math.abs(capM - capR), small = () => (capM <= capR ? 'مهسا' : 'رعنا'), big = () => other(small());
  const layout = () => {
    accBox.hidden = mode !== 'inject';
    hint.textContent = mode === 'pay'
      ? 'هر مبلغ دلخواهی را می‌توانی بنویسی (مثلاً ۳ میلیون). پول از جیب شخصی پرداخت‌کننده به دیگری می‌رود؛ پول و حساب‌های کسب‌وکار تغییری نمی‌کند، فقط سرمایه‌ی دو نفر جابه‌جا می‌شود. برای سهم کاملاً برابر، دکمه‌ی زیر نصفِ تفاوت را می‌نویسد.'
      : 'پول تازه‌ای که یک نفر از جیب خودش به حساب کسب‌وکار می‌ریزد؛ سرمایه‌ی او زیاد می‌شود و حساب کسب‌وکار هم همان مقدار بالا می‌رود. برای سهم کاملاً برابر، دکمه‌ی زیر کل تفاوت را می‌نویسد.';
    equal.textContent = mode === 'pay' ? 'برابر کردن کامل (نصفِ تفاوت)' : 'برابر کردن کامل (کل تفاوت)';
  };
  const equal = h('button', { type: 'button', class: 'btn ghost', onclick: () => {
    if (diff() < 1) return toast('سرمایه‌ها همین حالا برابرند');
    if (mode === 'pay') { payer = small(); amt.set(Math.floor(diff() / 2)); } else { payer = small(); amt.set(Math.round(diff())); }
    who.set(payer); prev();
  } });
  const after = () => {
    const a = amt.get() || 0; let m = capM, r = capR;
    if (mode === 'pay') { if (payer === 'مهسا') { m += a; r -= a; } else { r += a; m -= a; } } else { if (payer === 'مهسا') m += a; else r += a; }
    return { m, r, a };
  };
  const prev = () => {
    const { m, r, a } = after();
    pv.textContent = `سرمایه پس از این ثبت: مهسا ${fmt(m)} · رعنا ${fmt(r)}` + (a && Math.abs(m - r) < 1 ? '  ✓ برابر' : a ? `  (تفاوت ${fmt(Math.abs(m - r))})` : '');
    pv.classList.toggle('bad', m < 0 || r < 0);
  };
  layout(); prev();
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت');
  btn.onclick = async () => {
    const { a, m, r } = after();
    if (!a) return toast('مبلغ را بنویس', 'err');
    if (m < 0 || r < 0) return toast('این مبلغ بیشتر از سرمایه‌ی گیرنده است', 'err');
    const from = pocketOf(payer); if (!from) return toast('جیب شخصی پیدا نشد', 'err');
    let payload;
    if (mode === 'pay') { const to = pocketOf(other(payer)); if (!to) return toast('جیب شخصی پیدا نشد', 'err'); payload = { from_account_id: from.id, to_account_id: to.id, amount: a, kind: 'capital', note: note.value }; }
    else { if (!acc.get()) return toast('حساب کسب‌وکار را انتخاب کن', 'err'); payload = { from_account_id: from.id, to_account_id: acc.get(), amount: a, kind: 'transfer', note: note.value || 'سرمایه‌ی تازه' }; }
    const res = await run(btn, () => rpc('add_transfer', { date, ...payload }));
    if (res) finish(m_, 'ثبت شد');
  };
  const m_ = modal({ title: 'انتقال سرمایه / برابر کردن سهم‌ها', body: h('div', { class: 'form' },
    h('div', { class: 'hint' }, `سرمایه‌ی فعلی: مهسا ${fmt(capM)} · رعنا ${fmt(capR)} ریال (تفاوت ${fmt(diff())})`),
    modeChips, hint, equal, field(mode === 'pay' ? 'چه کسی می‌پردازد؟' : 'چه کسی واریز می‌کند؟', who), field('تاریخ', dateField(date, v => { date = v; })),
    field('مبلغ (ریال)', amt), accBox, pv, field('توضیح', note)), footer: btn });
  return m_;
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
export function moveStockForm(lotId0) {
  let date = todayISO(), from = 'مهسا', lotId = lotId0 || null;
  const to = () => (from === 'مهسا' ? 'رعنا' : 'مهسا');
  const lot = () => S.LOT[lotId];
  const lots = () => S.lots.filter(l => !l.voided && l.rem > 0).sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : a.date < b.date ? -1 : a.id - b.id));
  const mx = () => (lot() ? lot()[holdKey(from)] || 0 : 0);
  const qty = intField({ value: 1, min: 1, max: 1, big: true });
  const inf = h('div', { class: 'hint' });
  const info = () => { qty.setMax(Math.max(mx(), 1)); inf.textContent = lot() ? `موجودی این دسته نزد ${from}: ${mx()} عدد · قیمت تمام‌شده‌ی هر عدد: ${fmt(Math.round(lot().landed_unit || 0))}` : 'اول کالا را انتخاب کن'; };
  const fc = chips([{ v: 'مهسا', label: 'از مهسا به رعنا' }, { v: 'رعنا', label: 'از رعنا به مهسا' }], from, v => { from = v; info(); }, { cls: 'two' });
  let pick = null;
  if (!lotId0) {
    const L = lots(); if (!L.length) return toast('کالایی با موجودی نداریم', 'err');
    lotId = L[0].id;
    pick = h('select', { class: 'sel full', 'aria-label': 'کالا و دسته' }, L.map(l => h('option', { value: l.id }, `${l.item} · ${l.lot_no} · مهسا ${l.rem_m} · رعنا ${l.rem_r}`)));
    pick.onchange = () => { lotId = +pick.value; info(); };
  }
  info();
  const note = h('input', { class: 'inp', placeholder: 'توضیح' });
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت جابجایی');
  btn.onclick = async () => { if (!lot()) return toast('کالا را انتخاب کن', 'err'); if (mx() < 1) return toast(`نزد ${from} از این دسته موجودی نیست`, 'err'); const r = await run(btn, () => rpc('move_stock', { date, lot_id: lotId, from_holder: from, to_holder: to(), qty: qty.get(), note: note.value })); if (r) finish(m, 'جابجایی ثبت شد'); };
  const m = modal({ title: lotId0 ? `جابجایی ${lot().item} (${lot().lot_no})` : 'جابجایی کالا بین مهسا و رعنا', body: h('div', { class: 'form' }, field('تاریخ', dateField(date, v => { date = v; })), pick ? field('کدام کالا؟', pick) : null, fc, inf, field('چند عدد؟', qty), field('توضیح', note)), footer: [btn] });
}

/* ----- کالا و تامین‌کننده ----- */
/** انتخاب دسته با دکمه‌های آماده (شورت، سوتین، جوراب، …) و «＋ دسته‌ی جدید»؛ دسته‌ی تازه همراه ذخیره‌ی کالا ساخته می‌شود */
export function categoryPicker(value, onChange) {
  let cur = value || ''; const extra = [];
  const wrap = h('div');
  const draw = () => {
    const names = [...new Set([...catNames(), ...extra, ...(cur ? [cur] : [])])];
    const ch = chips(names.map(n => ({ v: n, label: n })), cur, v => { cur = v; onChange && onChange(v); }, { label: 'دسته‌ی کالا' });
    const add = h('button', { type: 'button', class: 'btn dashed', onclick: async () => {
      const nm = await promptBox('نام دسته‌ی جدید (مثلاً لباس خواب)'); if (!nm || !nm.trim()) return;
      cur = nm.trim(); if (!names.includes(cur)) extra.push(cur); draw(); onChange && onChange(cur);
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
    const add = h('button', { type: 'button', class: 'btn primary', onclick: async () => { const nm = await promptBox('نام دسته‌ی جدید'); if (nm && nm.trim()) call({ name: nm.trim(), size_kind: kindOf(nm.trim()) }, 'دسته اضافه شد (نوع سایز را در همین لیست می‌توانی عوض کنی)'); } }, '＋ دسته‌ی جدید');
    host.replaceChildren(P('دسته‌بندی برای دیدن سود هر دسته در داشبورد و فیلتر کردن موجودی است. تغییر نام، دسته‌ی همه‌ی کالاهای آن را هم عوض می‌کند. دسته حذف نمی‌شود؛ فقط غیرفعال می‌شود.'),
      ...(rows.length ? rows.map(c => h('div', { class: 'li' }, h('div', null, h('b', null, c.name, ' ', c.active ? null : pill('غیرفعال', 'gray')), h('small', null, `${used(c)} کالا`), h('div', { class: 'chips kindrow', role: 'radiogroup', 'aria-label': 'نوع سایزبندی ' + c.name }, ...Object.entries(KINDS).map(([k, kv]) => h('button', { type: 'button', class: 'chip optc' + (kindOf(c.name) === k ? ' on' : ''), role: 'radio', 'aria-checked': kindOf(c.name) === k ? 'true' : 'false', onclick: () => { if (kindOf(c.name) !== k) call({ id: c.id, size_kind: k }, 'نوع سایزبندی عوض شد'); } }, kv.short)))),
        h('div', { class: 'acts' }, h('button', { type: 'button', class: 'mini', onclick: async () => { const nm = await promptBox(`نام جدید برای «${c.name}»`); if (nm && nm.trim() && nm.trim() !== c.name) call({ id: c.id, name: nm.trim() }, 'نام دسته عوض شد'); } }, 'تغییر نام'),
          h('button', { type: 'button', class: 'mini', onclick: () => call({ id: c.id, active: !c.active }, c.active ? 'غیرفعال شد' : 'فعال شد') }, c.active ? 'غیرفعال' : 'فعال')))) : [h('div', { class: 'empty sm' }, 'هنوز دسته‌ای نیست')]), add,
      h('section', { class: 'z2', style: { marginTop: '12px' } }, h('div', { class: 'zt' }, h('i', null, '؟'), h('span', null, 'جمع‌بندی سایز هر دسته'), h('small', null, 'راهنمای تقریبی؛ با جدول تامین‌کننده تطبیق بده')), h('div', { class: 'zx' }, ...SUMMARY.map(([a, b]) => h('div', { class: 'hint' }, h('b', null, a + ': '), b)), h('div', { class: 'hint' }, FREE_NOTE))));
  };
  draw(); modal({ title: 'دسته‌های کالا', body: host });
}

/* ----- رنگ و سایز کالا: گزینه‌های آماده + گزینه‌هایی که خودت اضافه می‌کنی ----- */
const COLOR_HEX = { 'مشکی': '#111111', 'سفید': '#FFFFFF', 'کرم': '#F3E3D3', 'بژ': '#D8BFA0', 'صورتی': '#E3A9BC', 'زرشکی': '#8E1B3A', 'قرمز': '#C62828', 'طوسی': '#9E9E9E', 'سرمه‌ای': '#1F2A5A', 'آبی': '#2F6FB5', 'سبز': '#3C7A4E', 'یاسی': '#B79AD6', 'نباتی': '#C2185B', 'قهوه‌ای': '#6D4C41' };
const DEF_COLORS = ['مشکی', 'کرم', 'سفید', 'صورتی', 'زرشکی', 'بژ', 'طوسی', 'سرمه‌ای'];
const DEF_SIZES = ['۷۰', '۷۵', '۸۰', '۸۵', '۹۰', 'S', 'M', 'L', 'XL', 'فری'];
const faDigits = s => String(s).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]).trim();
function optionList(prefKey, defaults, field, strict) {
  const custom = pref(prefKey, []), fromItems = strict ? [] : S.items.map(i => i[field]).filter(Boolean);
  return [...new Set([...defaults, ...custom, ...fromItems])];
}
/** چیپ‌های چندانتخابی/تک‌انتخابی با دکمه‌ی «＋ افزودن» */
function optionPicker({ label, prefKey, defaults, field, multi, value, swatch, strict, onChange }) {
  const sel = new Set(value ? [].concat(value).filter(Boolean) : []); let opts = optionList(prefKey, defaults, field, strict);
  sel.forEach(v => { if (!opts.includes(v)) opts.push(v); });
  const wrap = h('div', { class: 'chips opt' });
  const draw = () => {
    wrap.replaceChildren(...opts.map(o => h('button', { type: 'button', class: 'chip optc' + (sel.has(o) ? ' on' : ''), role: multi ? 'checkbox' : 'radio', 'aria-checked': sel.has(o) ? 'true' : 'false',
      onclick: () => { if (multi) { sel.has(o) ? sel.delete(o) : sel.add(o); } else { const was = sel.has(o); sel.clear(); if (!was) sel.add(o); } draw(); onChange && onChange(); } },
      swatch ? h('u', { class: 'dotc', style: { background: COLOR_HEX[o] || '#C9B5BE' } }) : null, o)),
    h('button', { type: 'button', class: 'chip add', onclick: async () => {
      const nm = await promptBox(swatch ? 'نام رنگ جدید (مثلاً شیری)' : 'سایز جدید (مثلاً ۹۵ یا XXL)'); if (!nm || !nm.trim()) return;
      const v = faDigits(nm); setPref(prefKey, [...new Set([...pref(prefKey, []), v])]); if (!opts.includes(v)) opts.push(v); if (multi) sel.add(v); else { sel.clear(); sel.add(v); } draw(); onChange && onChange();
    } }, swatch ? '＋ رنگ جدید' : '＋ سایز جدید'));
  };
  draw();
  return Object.assign(wrap, { values: () => opts.filter(o => sel.has(o)), first: () => opts.find(o => sel.has(o)) || '' });
}
const zone2 = (n, title, sub, ...kids) => h('section', { class: 'z2' }, h('div', { class: 'zt' }, h('i', null, n), h('span', null, title), sub ? h('small', null, sub) : null), h('div', { class: 'zx' }, ...kids));


/** سوتین: دور زیر سینه + کاپ، با جدول لمسی برای ترکیب‌هایی که واقعاً می‌خری. در ویرایش یک کالا فقط یک دور و یک کاپ */
function braPicker({ single, value, onChange }) {
  const v0 = String(value || ''), m0 = v0.match(/^([۰-۹]+)\s*([A-Za-z])$/);
  const bands = new Set(m0 ? [m0[1]] : (single ? [] : BRA_COMMON.bands)), cups = new Set(m0 ? [m0[2].toUpperCase()] : (single ? [] : BRA_COMMON.cups)), off = new Set();
  const wrap = h('div'), hint = h('div', { class: 'hint' });
  const row = (lab, arr, set) => h('div', null, h('span', { class: 'lb' }, lab), h('div', { class: 'chips opt' }, ...arr.map(o => h('button', { type: 'button', class: 'chip optc' + (set.has(o) ? ' on' : ''), role: 'checkbox', 'aria-checked': set.has(o) ? 'true' : 'false',
    onclick: () => { if (single) { const was = set.has(o); set.clear(); if (!was) set.add(o); } else { set.has(o) ? set.delete(o) : set.add(o); } draw(); onChange && onChange(); } }, o))));
  const list = () => (single ? [...bands].flatMap(b => [...cups].map(c => b + c)) : BANDS.filter(b => bands.has(b)).flatMap(b => CUPS.filter(c => cups.has(c) && !off.has(b + c)).map(c => b + c)));
  function draw() {
    const bs = BANDS.filter(b => bands.has(b)), cs = CUPS.filter(c => cups.has(c));
    const kids = [row('دور زیر سینه', BANDS, bands), row('کاپ', CUPS, cups)];
    if (!single && bs.length && cs.length) {
      kids.push(h('div', { class: 'hint' }, 'جدول را لمس کن؛ فقط ترکیب‌هایی که واقعاً می‌خری ✓ بماند (مثلاً ۷۵B).'),
        h('table', { class: 'vmx' }, h('tr', null, h('th'), ...cs.map(c => h('th', null, c))), ...bs.map(b => h('tr', null, h('th', null, b), ...cs.map(c => { const o = off.has(b + c); return h('td', { class: o ? 'x' : '' }, h('button', { type: 'button', class: 'vb', 'aria-label': 'سایز ' + b + c, 'aria-pressed': o ? 'false' : 'true', onclick: () => { o ? off.delete(b + c) : off.add(b + c); draw(); onChange && onChange(); } }, o ? '—' : '✓')); })))),
        h('button', { type: 'button', class: 'chip add', onclick: () => { bands.clear(); cups.clear(); off.clear(); BRA_COMMON.bands.forEach(x => bands.add(x)); BRA_COMMON.cups.forEach(x => cups.add(x)); draw(); onChange && onChange(); } }, 'فقط سایزهای رایج بازار (۷۰ تا ۸۵ × B و C)'));
    }
    hint.textContent = bs.length ? bs.map(b => `${b} ≈ ${bandHint(b)}`).slice(0, 4).join(' · ') + (bs.length > 4 ? ' …' : '') : '';
    wrap.replaceChildren(...kids, hint);
  }
  draw();
  return Object.assign(wrap, { values: list, first: () => list()[0] || '' });
}
/** انتخاب‌گر سایز بر اساس دسته: سوتین ← دور+کاپ، جوراب، فری، و حرفی (با راهنمای سانتی‌متر) */
function sizePicker(catName, { multi, value, onChange }) {
  const kind = kindOf(catName);
  if (kind === 'bra') return braPicker({ single: !multi, value, onChange });
  const defaults = kind === 'sock' ? SOCK : kind === 'free' ? ['فری'] : alphaList(catName);
  const start = kind === 'sock' ? ['فری'] : kind === 'free' ? ['فری'] : ALPHA_START;
  const box = h('div'), hint = h('div', { class: 'szhint' });
  const pk = optionPicker({ label: 'سایز', prefKey: 'sizes_' + kind, defaults, field: 'size', multi, value: value ? [value] : (multi ? start : []), strict: true, onChange: () => { drawHints(); onChange && onChange(); } });
  const drawHints = () => { hint.replaceChildren(...pk.values().map(v => hintOf(catName, v) ? h('div', null, h('b', null, v + ': '), hintOf(catName, v)) : null).filter(Boolean)); };
  box.append(pk, hint); drawHints();
  return Object.assign(box, { values: pk.values, first: pk.first });
}
export function itemForm(it) {
  if (it && !canEdit()) { toast("ویرایش فقط برای حمیدرضا، مهسا و رعنا باز است", "err"); return; }
  const baseOf = x => (x.base_name || x.name);
  const name = h('input', { class: 'inp', value: it ? baseOf(it) : '', placeholder: 'مثلاً سوتین دانتل' });
  const desc = h('textarea', { class: 'inp ta', rows: 3, maxlength: 300, placeholder: 'مثلاً جنس، مدل، ویژگی‌ها؛ مشتری در فاکتور می‌بیند چه خریده (اختیاری)' }); desc.value = it && it.description || '';
  const cat = categoryPicker(it && it.category || '', () => buildSizes());
  const min = intField({ value: it ? it.min_stock : 3, min: 0 });
  const act = chips([{ v: true, label: 'فعال' }, { v: false, label: 'غیرفعال' }], it ? it.active : true, () => {}, { cls: 'two' });
  const used = it && S.lines.some(l => l.item_id === it.id);
  const matrix = h('div', { class: 'vmxw' }), cntHint = h('div', { class: 'hint' });
  const skip = new Set();                                             // ترکیب‌هایی که نداریم: «رنگ|سایز»
  const colors = optionPicker({ label: 'رنگ', prefKey: 'colors', defaults: DEF_COLORS, field: 'color', multi: !it, value: it && it.color, swatch: true, onChange: () => draw() });
  let sizes = { values: () => [], first: () => '' };
  const sizeHost = h('div'), sizeTitle = h('span', null, it ? 'سایز' : 'سایزها'), sizeSub = h('small', null, '');
  function buildSizes() {
    const c = cat.get();
    if (!c) { sizes = { values: () => [], first: () => '' }; sizeHost.replaceChildren(h('div', { class: 'hint' }, 'اول دسته‌ی کالا را انتخاب کن؛ سایزها از روی دسته می‌آید (سوتین: دور + کاپ، شورت: حرفی، …).')); sizeTitle.textContent = it ? 'سایز' : 'سایزها'; sizeSub.textContent = ''; skip.clear(); draw(); return; }
    const k = kindOf(c);
    sizeTitle.textContent = (it ? 'سایز ' : 'سایزهای ') + c; sizeSub.textContent = KINDS[k] ? KINDS[k].label : '';
    sizes = sizePicker(c, { multi: !it, value: it && it.category === c ? it.size : '', onChange: () => draw() });
    sizeHost.replaceChildren(sizes); skip.clear(); draw();
  }
  const combos = () => {
    const cs = colors.values(), ss = sizes.values(), out = [];
    for (const c of (cs.length ? cs : [''])) for (const s of (ss.length ? ss : [''])) { if ((c || s) && !skip.has(c + '|' + s) && !existing(c, s)) out.push({ color: c, size: s }); }
    return out;
  };
  /* ترکیبی که از قبل (یکی یا ≥۹۵٪ شبیه) در سیستم هست؛ ساخته نمی‌شود */
  const existing = (c, s) => (it || !name.value.trim() ? null : findDup(name.value.trim(), c, s));
  name.addEventListener('input', () => draw());
  function draw() {
    if (it) { matrix.replaceChildren(); cntHint.textContent = ''; return; }
    const cs = colors.values(), ss = sizes.values(), n = combos().length;
    const exN = [...cs.length ? cs : [''] ].flatMap(c => (ss.length ? ss : ['']).map(s => (c || s) && !skip.has(c + '|' + s) && existing(c, s) ? 1 : 0)).reduce((a, b) => a + b, 0);
    cntHint.textContent = exN ? `${exN} ترکیب از قبل در سیستم هست و ساخته نمی‌شود (در جدول خاکستری است). ${n ? n + ' ترکیب جدید ساخته می‌شود.' : 'ترکیب جدیدی نمانده.'}` : n ? `${cs.length || 1} رنگ × ${ss.length || 1} سایز = ${n} ترکیب ساخته می‌شود. موجودی هر ترکیب جدا در «خرید» ثبت می‌شود.` : 'اگر رنگ یا سایزی نمی‌زنی، کالا بدون رنگ/سایز ساخته می‌شود.';
    if (cs.length && ss.length) {
      matrix.replaceChildren(h('table', { class: 'vmx' }, h('tr', null, h('th'), ...ss.map(s => h('th', null, s))),
        ...cs.map(c => h('tr', null, h('th', null, c), ...ss.map(s => { const off = skip.has(c + '|' + s); const ex = !off && existing(c, s); if (ex) return h('td', { class: 'x ex', title: `از قبل هست: ${ex.name} (${ex.code || ''})` }, h('span', { class: 'vb' }, 'هست')); return h('td', { class: off ? 'x' : '' }, h('button', { type: 'button', class: 'vb', 'aria-label': `${c} ${s}`, 'aria-pressed': off ? 'false' : 'true', onclick: () => { off ? skip.delete(c + '|' + s) : skip.add(c + '|' + s); draw(); } }, off ? '—' : '✓')); })))),
        h('div', { class: 'hint' }, 'ترکیبی که نداری (مثلاً کرم ۸۵) را با یک ضربه حذف کن.'));
    } else matrix.replaceChildren();
    btn.textContent = n > 1 ? `افزودن کالا (${n} ترکیب)` : 'افزودن کالا'; btn.disabled = !!(cs.length && ss.length && n === 0) || (exN > 0 && n === 0);
  }
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, it ? 'ذخیره' : 'افزودن کالا');
  btn.onclick = async () => {
    if (!name.value.trim()) return toast('نام کالا را بنویس', 'err');
    if (!cat.get()) return toast('دسته‌ی کالا را انتخاب کن', 'err');
    const base = { description: desc.value, category: cat.get(), min_stock: min.get() };
    let p;
    if (it) { const c = colors.first(), s = sizes.first(); p = { ...base, id: it.id, name: [name.value.trim(), c, s].filter(Boolean).join(' · '), base_name: c || s ? name.value.trim() : '', color: c, size: s, active: act.get() }; }
    else { const vs = combos(); if (!vs.length && (colors.values().length || sizes.values().length)) return toast('همه‌ی این ترکیب‌ها از قبل در سیستم هست؛ چیزی برای ساخت نمانده', 'err'); p = { ...base, name: name.value.trim(), variants: vs.length ? vs.map(v => ({ color: v.color, size: v.size })) : undefined }; }
    const r = await run(btn, () => rpc('save_item', p)); if (r) finish(m, it ? 'ذخیره شد' : (r.ids && r.ids.length > 1 ? `${r.ids.length} کالا ساخته شد` : 'ذخیره شد'));
  };
  const delBtn = h('button', { class: 'btn danger ghost', type: 'button' }, 'حذف کالا');
  if (it) delBtn.onclick = async () => { if (!(await confirmBox(`«${it.name}» حذف شود؟ از لیست‌ها کنار می‌رود و سوابق مالی‌اش (فاکتورها و سود) می‌ماند. کالایی که موجودی دارد حذف نمی‌شود.`, 'حذف کن', true))) return; const r = await run(delBtn, () => rpc('save_item', { id: it.id, name: it.name, category: it.category, min_stock: it.min_stock, active: false })); if (r) finish(m, 'کالا حذف شد'); };
  const m = modal({ title: it ? 'ویرایش کالا' : 'کالای جدید', body: h('div', { class: 'form itemf' },
    zone2('۱', 'مشخصات کالا', null, field('نام کالا *', name, used && !canEdit() ? 'این کالا در خرید/فروش استفاده شده؛ نامش را فقط حمیدرضا، مهسا و رعنا می‌توانند عوض کنند.' : (it ? 'کد کالا: ' + (it.code || '—') + ' · نام نهایی = نام کالا · رنگ · سایز' : 'کد هر ترکیب خودکار ساخته می‌شود (MR-0001 …)')), field('دسته', cat)),
    zone2('۲', it ? 'رنگ' : 'رنگ‌ها', 'برای فیلتر و گزارش', colors),
    h('section', { class: 'z2' }, h('div', { class: 'zt' }, h('i', null, '۳'), sizeTitle, sizeSub), h('div', { class: 'zx' }, sizeHost, cntHint, matrix)),
    zone2('۴', 'توضیحات برای مشتری', 'اختیاری', desc, h('div', { class: 'hint' }, 'در فاکتور و پیام مشتری، توضیحات همراه رنگ و سایز دیده می‌شود: «سوتین دانتل · مشکی · ۸۰».')),
    zone2('۵', 'هشدار کم‌موجودی', null, field('هشدار از … عدد (برای هر ترکیب)', min)),
    it ? zone2('۶', 'وضعیت', null, act) : null), footer: [btn, ...(it ? [delBtn] : [])] });
  buildSizes();
}
export function supplierForm(s) {
  if (s && !canEdit()) { toast("ویرایش فقط برای حمیدرضا، مهسا و رعنا باز است", "err"); return; }
  const name = h('input', { class: 'inp', value: s ? s.name : '' }), phone = h('input', { class: 'inp', value: s && s.phone || '', dir: 'ltr', inputmode: 'tel' });
  const addr = h('input', { class: 'inp', value: s && s.address || '' }), note = h('input', { class: 'inp', value: s && s.note || '' });
  const act = chips([{ v: true, label: 'فعال' }, { v: false, label: 'غیرفعال' }], s ? s.active : true, () => {}, { cls: 'two' });
  const used = s && S.invoices.some(i => i.supplier_id === s.id);
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, s ? 'ذخیره' : 'افزودن تامین‌کننده');
  btn.onclick = async () => { const r = await run(btn, () => rpc('save_supplier', { id: s && s.id, name: name.value, phone: phone.value, address: addr.value, note: note.value, active: act.get() })); if (r) finish(m, 'ذخیره شد'); };
  const delBtn = h('button', { class: 'btn danger ghost', type: 'button' }, 'حذف تامین‌کننده');
  delBtn.onclick = async () => { if (!(await confirmBox(`«${s.name}» حذف شود؟ از لیست‌ها کنار می‌رود و فاکتورهایش می‌ماند. تا حساب باز دارید حذف نمی‌شود.`, 'حذف کن', true))) return; const r = await run(delBtn, () => rpc('save_supplier', { id: s.id, name: s.name, phone: s.phone, address: s.address, note: s.note, active: false })); if (r) finish(m, 'تامین‌کننده حذف شد'); };
  const m = modal({ title: s ? 'ویرایش تامین‌کننده' : 'تامین‌کننده‌ی جدید', body: h('div', { class: 'form' }, field('نام', name, used && !canEdit() ? 'با این تامین‌کننده فاکتور ثبت شده؛ نامش را فقط حمیدرضا، مهسا و رعنا می‌توانند عوض کنند.' : null), field('تلفن', phone), field('نشانی', addr), field('یادداشت', note), s ? field('وضعیت', act) : null), footer: [btn, ...(s ? [delBtn] : [])] });
}

/* ----- مشتری ----- */
export function customerForm(c, after) {
  if (c && !canEdit()) { toast("ویرایش فقط برای حمیدرضا، مهسا و رعنا باز است", "err"); return; }
  const name = h('input', { class: 'inp', value: c ? c.name : '', placeholder: 'نام مشتری' });
  const phone = h('input', { class: 'inp', value: c && c.phone || '', dir: 'ltr', inputmode: 'tel', placeholder: '09…' });
  const note = h('input', { class: 'inp', value: c && c.note || '', placeholder: 'یادداشت (مثلاً اینستاگرام: @sara)' });
  const act = chips([{ v: true, label: 'فعال' }, { v: false, label: 'غیرفعال' }], c ? c.active : true, () => {}, { cls: 'two' });
  const used = c && S.vSales.some(x => x.customer_id === c.id);
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, c ? 'ذخیره' : 'افزودن مشتری');
  btn.onclick = async () => { const r = await run(btn, () => rpc('save_customer', { id: c && c.id, name: name.value, phone: phone.value, note: note.value, active: act.get() })); if (r) { await finish(m, 'ذخیره شد'); after && after(r); } };
  const delBtn = h('button', { class: 'btn danger ghost', type: 'button' }, 'حذف مشتری');
  delBtn.onclick = async () => { if (!(await confirmBox(`«${c.name}» حذف شود؟ از لیست‌ها کنار می‌رود و فروش‌هایش می‌ماند. مشتری بدهکار حذف نمی‌شود.`, 'حذف کن', true))) return; const r = await run(delBtn, () => rpc('save_customer', { id: c.id, name: c.name, phone: c.phone, note: c.note, active: false })); if (r) { await finish(m, 'مشتری حذف شد'); after && after(r); } };
  const m = modal({ title: c ? 'ویرایش مشتری' : 'مشتری جدید', body: h('div', { class: 'form' }, field('نام', name, used && !canEdit() ? 'برای این مشتری فروش ثبت شده؛ نامش را فقط حمیدرضا، مهسا و رعنا می‌توانند عوض کنند.' : null), field('تلفن', phone), field('یادداشت', note), c ? field('وضعیت', act) : null), footer: [btn, ...(c ? [delBtn] : [])] });
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
  if (!canVoid(row)) return toast('ابطال و ویرایش فقط برای حمیدرضا، مهسا و رعنا باز است', 'err');
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
  const m = modal({ title: 'هدف فروش به آشنایان ' + jmonthName(mk), body: h('div', { class: 'form' }, P('مبلغی که هر نفر می‌خواهد این ماه به آشنایان بفروشد (ریال)؛ فقط فروش با محل «آشنایان» حساب می‌شود. هر وقت خواستی دوباره عوضش کن.'), field('هدف مهسا', fm), field('هدف رعنا', fr)), footer: [btn] });
}


/* ----- ویرایش پرداخت / دریافت / هزینه / انتقال / جابجایی (ابطال نسخه‌ی قبلی + ثبت نسخه‌ی اصلاح‌شده؛ فقط حمیدرضا، مهسا و رعنا) ----- */
export function editEntryForm(kind, row) {
  if (!canEdit()) { toast('ویرایش فقط برای حمیدرضا، مهسا و رعنا باز است', 'err'); return; }
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


/* ----- ثبت نام خریدار روی فاکتور فروشِ بدون‌نام (بدون ابطال و ثبت دوباره؛ شماره و حساب‌ها دست‌نخورده می‌مانند) ----- */
export function setBuyerForm(sale) {
  const opts = () => customers().map(c => { const b = S.vCus.find(x => x.id === c.id); return { v: c.id, label: c.name, sub: (c.phone || '') + (b && b.outstanding > 0 ? ' · بدهکار ' + fmt(b.outstanding) : '') }; });
  const customer = combo({
    placeholder: 'نام خریدار را تایپ کن یا انتخاب کن (الزامی)', createLabel: 'مشتری جدید', options: opts(),
    onCreate: async name => { try { const r = await rpc('save_customer', { name }, { queue: false }); await loadAll(); customer.setOptions(opts()); customer.set(r.id); toast('مشتری اضافه شد'); return r.id; } catch (e) { toast(errText(e), 'err'); return null; } }
  });
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت نام خریدار');
  btn.onclick = async () => {
    if (!customer.get()) { customer.input.focus(); return toast('نام خریدار را انتخاب کن یا بساز', 'err'); }
    const r = await run(btn, () => rpc('set_sale_customer', { id: sale.id, customer_id: customer.get() }, { queue: false }));
    if (r) finish(m, 'نام خریدار ثبت شد ✔');
  };
  const m = modal({ title: `خریدار فاکتور ${sale.no}`, body: h('div', { class: 'form' }, P(`فاکتور ${sale.no} (${jstr(sale.date)}، ${fmt(sale.total)} ریال) خریدار ندارد. نام را که ثبت کنی، فاکتور ابطال نمی‌شود و شماره و حساب‌ها همان می‌ماند؛ فقط اسم به آن اضافه می‌شود و در تاریخچه ثبت می‌شود.`), field('خریدار *', customer)), footer: [btn] });
}
