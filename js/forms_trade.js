// فرم‌های اصلی: فروش و خرید
import { h, fmt, parseNum, todayISO, toast, sum, jstr, norm } from './util.js';
import { S, rpc, loadAll, bus, pref, setPref, simulateFifo, holdKey, customers, businessAccounts, CHANNELS, accBalance, errText, canEdit, markupOf } from './store.js';
import { modal, field, chips, accountPicker, numField, intField, dateField, dueField, combo, run, promptBox } from './ui.js';
import { pickCategoryDialog } from './forms_misc.js';
import { adviceFor, adviceText } from './advisor.js';

const accOf = name => S.accounts.find(a => a.name === name);
const seg = (mode, on, cb, a, b) => chips([{ v: 'a', label: a }, { v: 'b', label: b }], mode, cb, { cls: 'two' });

/* ======================= فروش جدید (فاکتور فروش با پنل افزودن کالا) ======================= */
// فی فروش پیش‌فرض = بهای تمام‌شده + درصد سودِ دسته‌ی کالا (از تنظیمات؛ پیش‌فرض ۲۰٪)
const roundK = n => Math.round(n / 1000) * 1000;       // گرد به هزار ریال
/* شبیه‌ساز FIFO که ردیف‌های قبلیِ همین فاکتور را هم از موجودی کم می‌کند (used: «شناسه‌ی پارت|کلید» ← تعداد) */
function simUsed(itemId, holder, qty, prefLot, used) {
  const key = holdKey(holder), cap = l => l[key] - (used.get(l.id + key) || 0);
  let lots = S.lots.filter(l => l.item_id === itemId && !l.voided && cap(l) > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  if (prefLot) { const p = lots.find(l => l.id === prefLot); if (p) lots = [p, ...lots.filter(l => l.id !== prefLot)]; }
  let need = qty; const parts = [];
  for (const l of lots) { if (need <= 0) break; const t = Math.min(need, cap(l)); parts.push({ lot: l, qty: t, cost: l.landed_unit, cap: cap(l) }); need -= t; }
  return { parts, short: need, cost: sum(parts, p => p.qty * p.cost), lots };
}
const zone = (n, title, sub, ...kids) => h('section', { class: 'z2' }, h('div', { class: 'zt' }, h('i', null, n), h('span', null, title), sub ? h('small', null, sub) : null), h('div', { class: 'zx' }, ...kids));

export function saleForm(preset = {}) {
  const me = S.me && S.me.name !== 'حمیدرضا' ? S.me.name : 'مهسا';
  const edit = preset.edit ? S.SALE[preset.edit] : null;          // ویرایش یک فروش موجود (فقط حمیدرضا و مهسا)
  if (edit && !canEdit()) { toast('ویرایش فقط برای حمیدرضا و مهسا باز است', 'err'); return; }
  if (edit && (S.collections.some(c => c.sale_id === edit.id && !c.voided) || S.returns.some(r => !r.voided && r.sale_line_id && S.saleLines.some(l => l.id === r.sale_line_id && l.sale_id === edit.id)))) {
    toast('این فروش دریافت یا مرجوعی دارد؛ اول آن‌ها را باطل کن، بعد ویرایش کن.', 'err'); return;
  }
  let seller = edit ? edit.seller : (preset.seller || me);
  let date = edit ? edit.date : todayISO();
  const rows = [];                                                  // ردیف‌های فاکتور
  /* در ویرایش، کالای همین فروش را موقتاً به موجودی برمی‌گردانیم تا فرم موجودی درست نشان دهد (با بستن فرم برمی‌گردد) */
  const undo = [];
  if (edit) for (const l of S.saleLines.filter(x => x.sale_id === edit.id)) {
    const lot = S.LOT[l.lot_id], k = holdKey(l.holder), st = S.stock.find(x => x.id === l.item_id);
    if (lot) { lot[k] += l.qty; lot.rem += l.qty; undo.push(() => { lot[k] -= l.qty; lot.rem -= l.qty; }); }
    if (st) { st[k] += l.qty; st.rem += l.qty; undo.push(() => { st[k] -= l.qty; st.rem -= l.qty; }); }
  }
  const other = () => (seller === 'مهسا' ? 'رعنا' : 'مهسا');
  const warn = h('div', { class: 'warnbox', hidden: true });
  const discount = numField({ onInput: () => recalc() });
  const stat = { gross: h('b', { class: 'n' }, '0'), disc: h('b', { class: 'n' }, '0'), total: h('b', { class: 'n' }, '0'), recv: h('b', { class: 'n' }, '0'), left: h('b', { class: 'n' }, '0'), profit: h('b', { class: 'n' }, '0') };
  const stripBox = (lab, el) => h('div', { class: 'b' }, h('small', null, lab), el);

  /* ---- ۱ · سربرگ ---- */
  const sellerChips = chips([{ v: 'مهسا', label: 'مهسا' }, { v: 'رعنا', label: 'رعنا' }], seller, v => { seller = v; rows.forEach(r => { r.manual = false; }); defaultAccounts(); drawHolder(); recalc(); }, { cls: 'two', label: 'فروشنده' });
  const dateCtl = dateField(date, v => { date = v; due.refresh(); });
  const channel = chips(CHANNELS.map(c => ({ v: c, label: c })), edit ? edit.channel : pref('channel', CHANNELS[0]), () => {}, { label: 'کانال فروش' });
  const custOpts = () => customers().map(c => { const b = S.vCus.find(x => x.id === c.id); return { v: c.id, label: c.name, sub: (c.phone || '') + (b && b.outstanding > 0 ? ' · بدهکار ' + fmt(b.outstanding) : '') }; });
  const customer = combo({
    placeholder: 'نام خریدار را تایپ کن یا انتخاب کن (الزامی)', createLabel: 'مشتری جدید', options: custOpts(),
    onCreate: async name => { try { const r = await rpc('save_customer', { name }, { queue: false }); await loadAll(); customer.setOptions(custOpts()); customer.set(r.id); toast('مشتری اضافه شد'); recalc(); return r.id; } catch (e) { toast(errText(e), 'err'); return null; } },
    onChange: () => recalc()
  });
  const custInfo = h('div', { class: 'inp ro bal' }, '—');
  const forEl = h('small', null, '');

  /* ---- ۳ · تسویه ---- */
  const due = dueField(() => date, { label: 'تاریخ سررسید مانده' });
  let payMode = 'full';
  const payChips = chips([{ v: 'full', label: 'تسویه‌ی کامل (نقدی)' }, { v: 'part', label: 'تسویه‌ی جزئی (نسیه)' }], 'full', v => { payMode = v; partBox.hidden = v === 'full'; recalc(); }, { cls: 'two', label: 'نحوه‌ی تسویه' });
  const received = numField({ onInput: () => recalc() });
  const remainEl = h('div', { class: 'hint' });
  const partBox = h('div', { hidden: true }, field('مبلغ دریافتی (ریال)', received, null), remainEl, due);
  const recvAcc = accountPicker(businessAccounts(), null, () => {}, { pockets: false, balances: accBalance });
  /* ---- ۴ · هزینه‌ها و ۵ · توضیحات ---- */
  const courier = numField({ onInput: () => recalc() }), pack = numField({ onInput: () => recalc() });
  const costAcc = accountPicker(S.accounts, null, () => {}, { pockets: true });
  const costAccBox = h('div', { hidden: true }, field('پرداخت هزینه از', costAcc));
  const note = h('input', { class: 'inp', type: 'text', placeholder: 'توضیحات (اختیاری)', 'aria-label': 'توضیحات فاکتور' });

  function defaultAccounts() {
    const bank = accOf('حساب ' + seller), cash = accOf('نقد ' + seller);
    const pr = pref('recvAcc_' + seller, null);
    recvAcc.set(pr && S.A[pr] ? pr : (bank ? bank.id : null));
    const pc = pref('costAcc_' + seller, null);
    costAcc.set(pc && S.A[pc] ? pc : (cash ? cash.id : null));
  }

  /* ---------------- ۲ · اقلام فاکتور ---------------- */
  const gridBox = h('div', { class: 'igrid' });
  const emptyRow = h('div', { class: 'inew' }, 'ردیف بعدی با «افزودن به فاکتور» از پنل کنار پر می‌شود…');
  const countEl = h('small', null, '');
  const resolved = r => r.holder || seller;
  function evalRows() {            // هزینه‌ی هر ردیف با کسر ردیف‌های قبلی
    const used = new Map();
    for (const r of rows) {
      const hd = resolved(r), f = r.item ? simUsed(r.item, hd, r.qty, r.lot, used) : { parts: [], short: 0, cost: 0 };
      r.f = f; r.cost = f.cost; r.short = f.short;
      for (const p of f.parts) used.set(p.lot.id + holdKey(hd), (used.get(p.lot.id + holdKey(hd)) || 0) + p.qty);
    }
    return used;
  }
  function mkRow(r) {
    const qi = h('input', { class: 'inp qi', type: 'text', inputmode: 'numeric', dir: 'ltr', value: String(r.qty), 'aria-label': 'تعداد' });
    qi.addEventListener('input', () => { r.qty = Math.max(0, parseNum(qi.value)); recalc(); });
    qi.addEventListener('blur', () => { qi.value = String(r.qty); });
    qi.addEventListener('focus', () => setTimeout(() => qi.select(), 0));
    const pc = numField({ unit: '', value: r.price || '', onInput: n => { r.price = n; recalc(); } });
    const idx = h('span', { class: 'ix' }), nameEl = h('span', { class: 'in' }), lotEl = h('span', { class: 'chp' }), holdEl = h('span', null), totEl = h('b', { class: 'n' }), profEl = h('span', { class: 'n' });
    const rm = h('button', { class: 'rm', type: 'button', 'aria-label': 'حذف این ردیف', onclick: () => { rows.splice(rows.indexOf(r), 1); r.el.remove(); recalc(); } }, '✕');
    const cell = (lab, ...k) => h('span', { class: 'ic' }, h('em', null, lab), ...k);
    r.el = h('div', { class: 'irow' }, idx, nameEl, cell('شماره پارت', lotEl), cell('انبار', holdEl), cell('تعداد', qi), h('span', { class: 'ic c-price' }, h('em', null, 'فی (ریال)'), pc), cell('مبلغ ردیف', totEl), cell('سود ناخالص', profEl), rm);
    r.ui = { idx, nameEl, lotEl, holdEl, totEl, profEl, qi, pc };
    return r.el;
  }
  function paintRows() {
    let n = 0, prev = null;
    for (const r of rows) {
      const sub = prev === r.item; prev = r.item; if (!sub) n++;
      r.el.classList.toggle('sub', sub); r.el.classList.toggle('bad', r.short > 0);
      const u = r.ui, it = S.I[r.item] || {};
      u.idx.textContent = sub ? '' : String(n);
      u.nameEl.replaceChildren(sub ? h('small', { class: 'nx' }, '↳ پارت بعدی همین کالا') : h('span', null, it.name || '', it.description ? h('small', null, it.description) : null));
      u.lotEl.textContent = r.f && r.f.parts.length ? r.f.parts.map(p => p.lot.lot_no).join(' + ') : (r.lot && S.LOT[r.lot] ? S.LOT[r.lot].lot_no : '—');
      u.holdEl.textContent = resolved(r);
      const tot = r.qty * r.price, pf = r.short > 0 ? null : tot - r.cost;
      u.totEl.textContent = fmt(tot); u.profEl.textContent = pf == null ? '⚠' : fmt(pf); u.profEl.className = 'n ' + (pf != null && pf < 0 ? 'neg' : 'pos');
    }
    emptyRow.hidden = false;
    countEl.textContent = rows.length ? `${new Set(rows.map(r => r.item)).size} کالا · ${rows.length} ردیف` : '';
  }
  function addRow(d) {
    const r = { item: d.item, qty: d.qty, price: d.price, lot: d.lot || null, holder: d.holder || null, manual: false, cost: 0, short: 0, f: null };
    rows.push(r); gridBox.insertBefore(mkRow(r), emptyRow); return r;
  }

  /* ---------------- پنل «افزودن کالا به فاکتور» ---------------- */
  const D = { item: null, lot: null, holder: null, manual: false, qty: 1, price: 0, touched: false, unit: 0, color: '', size: '' };
  const dHold = () => D.holder || seller;
  let usedNow = new Map();
  const avail = (who, id = D.item) => { const st = S.stock.find(x => x.id === id); if (!st) return 0; let n = who === 'مهسا' ? st.rem_m : st.rem_r; for (const r of rows) if (r.item === id && resolved(r) === who) n -= r.qty; return Math.max(0, n); };
  const dSim = () => (D.item ? simUsed(D.item, dHold(), D.qty, D.lot, usedNow) : { parts: [], short: 0, cost: 0, lots: [] });
  const costEl = h('div', { class: 'inp ro', dir: 'ltr', title: 'قیمت خرید + سهم هزینه‌ی سرشکن‌شده', 'aria-label': 'بهای تمام‌شده‌ی هر عدد' }, '—');
  const priceCtl = numField({ unit: '', onInput: n => { D.price = n; D.touched = true; drawPrev(); } });
  const qtyCtl = intField({ value: 1, min: 1, big: true, onChange: n => { D.qty = n; autoHolder(); autoPrice(false); drawPrev(); } });
  const descEl = h('div', { class: 'idesc', hidden: true });
  const lotBox = h('div', { class: 'lotstrip', hidden: true });
  const holdBox = h('div', { class: 'holdbox', hidden: true });
  const prev = h('div', { class: 'prev' });
  const lineNote = h('div', { class: 'hint ltot' });
  const addBtn = h('button', { class: 'btn primary lg add', type: 'button', disabled: true }, '＋ افزودن به فاکتور');
  const detail = h('div', { class: 'sel', hidden: true });
  const q = h('input', { type: 'text', class: 'inp', placeholder: 'نام یا کد کالا را بنویس…', autocomplete: 'off', 'aria-label': 'جستجوی کالا' });
  const ilist = h('div', { class: 'ilist', role: 'listbox' });
  const filt = h('div', { class: 'ifilt' });
  const card = h('div', { class: 'lcard dpanel' }, h('div', { class: 'cmb inl' }, q, ilist), filt, detail);

  const fields = () => S.stock.filter(i => i.active);
  function drawFilters() {
    const act = fields(), cols = [...new Set(act.map(i => i.color).filter(Boolean))], sizes = [...new Set(act.map(i => i.size).filter(Boolean))];
    const mk = (lab, arr, key) => (arr.length ? h('div', { class: 'frow' }, h('small', null, lab), ...arr.map(v => h('button', { type: 'button', class: 'fchip' + (D[key] === v ? ' on' : ''), onclick: () => { D[key] = D[key] === v ? '' : v; drawFilters(); drawList(); } }, v))) : null);
    filt.replaceChildren(...[mk('رنگ', cols, 'color'), mk('سایز', sizes, 'size')].filter(Boolean));
  }
  function drawList() {
    const nq = norm(q.value), sel = D.item;
    let arr = fields().filter(i => (!D.color || i.color === D.color) && (!D.size || i.size === D.size) && (!nq || norm([i.name, i.category, i.description, i.color, i.size].join(' ')).includes(nq)));
    arr.sort((a, b) => (b.rem > 0) - (a.rem > 0) || a.name.localeCompare(b.name, 'fa'));
    const out = arr.slice(0, 40).map(i => {
      const parts = S.lots.filter(l => l.item_id === i.id && !l.voided && l.rem > 0).length;
      return h('button', { type: 'button', role: 'option', class: 'cmb-o' + (i.id === sel ? ' on' : '') + (i.rem < 1 ? ' dim' : ''), onmousedown: e => e.preventDefault(), onclick: () => choose(i.id) },
        h('span', { class: 'cmb-l' }, i.name, h('small', null, [i.category, parts > 1 ? parts + ' پارت' : null].filter(Boolean).join(' · '))), h('span', { class: 'cn' }, 'مهسا ', h('b', null, String(avail('مهسا', i.id))), ' · رعنا ', h('b', null, String(avail('رعنا', i.id)))));
    });
    if (!arr.length) out.push(h('div', { class: 'cmb-e' }, 'کالایی با این مشخصات نیست'));
    const t = q.value.trim();
    if (t && !fields().some(i => norm(i.name) === norm(t))) out.push(h('button', { type: 'button', class: 'cmb-o create', onmousedown: e => e.preventDefault(), onclick: () => createItem(t) }, `＋ کالای جدید «${t}»`));
    ilist.replaceChildren(...out);
  }
  async function createItem(name) {
    const category = await pickCategoryDialog(name); if (!category) return;
    try { const r = await rpc('save_item', { name, category }, { queue: false }); await loadAll(); toast('کالا اضافه شد'); drawFilters(); choose(r.id); } catch (e) { toast(errText(e), 'err'); }
  }
  let choose = function (id) {
    D.item = id; D.lot = null; D.manual = false; D.touched = false; D.qty = 1; qtyCtl.set(1);
    q.value = S.I[id] ? S.I[id].name : ''; drawList();
    const d = S.I[id] && S.I[id].description; descEl.textContent = d ? '📝 ' + d : ''; descEl.hidden = !d;
    autoHolder(); autoPrice(true); drawPrev();
  };
  function autoHolder() {
    if (D.manual) return;
    D.holder = (D.item && avail(seller) < D.qty && avail(other()) >= D.qty) ? other() : null;
    drawHolder();
  }
  function drawHolder() {
    detail.hidden = !D.item; holdBox.hidden = !D.item;
    if (!D.item) return;
    const btn = who => h('button', { type: 'button', class: 'chip' + (dHold() === who ? ' on' : '') + (avail(who) < 1 ? ' dim' : ''), 'aria-pressed': dHold() === who ? 'true' : 'false',
      onclick: () => { D.holder = who === seller ? null : who; D.manual = true; D.lot = null; drawHolder(); autoPrice(false); drawPrev(); } }, `${who} · ${avail(who)} عدد`);
    holdBox.replaceChildren(...[h('label', { class: 'lbl' }, 'از موجودی (انبار) چه کسی برداشته شود؟'), h('div', { class: 'chips two' }, btn(seller), btn(other())),
      dHold() !== seller ? h('div', { class: 'hint' }, `این جنس را ${seller} نزد خودش ندارد؛ از موجودی ${dHold()} برداشته می‌شود و فروش به نام ${seller} ثبت می‌شود.`) : null].filter(Boolean));
    drawLots();
  }
  function drawLots() {
    const key = holdKey(dHold());
    const ls = S.lots.filter(l => l.item_id === D.item && !l.voided && l[key] - (usedNow.get(l.id + key) || 0) > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    if (D.lot && !ls.some(l => l.id === D.lot)) D.lot = null;
    lotBox.hidden = ls.length < 2;
    const pick = id => { D.lot = id || null; D.touched = false; drawLots(); autoPrice(true); drawPrev(); };
    const cellf = (lab, val) => h('span', { class: 'lf' }, h('small', null, lab), h('b', null, val));
    const chip = (id, kids) => h('button', { type: 'button', class: 'lotchip' + ((D.lot || 0) === id ? ' on' : ''), 'aria-pressed': String((D.lot || 0) === id), 'data-lot': id, onclick: () => pick(id) }, kids);
    lotBox.replaceChildren(
      h('div', { class: 'lbl' }, `این کالا در چند خرید جدا گرفته شده؛ شماره‌ی پارتی را که می‌فروشی بزن (نزد ${dHold()})`),
      h('div', { class: 'lotrow' }, chip(0, [cellf('پارت', 'خودکار'), cellf('تعداد', 'قدیمی‌ترین اول')]),
        ...ls.map(l => chip(l.id, [cellf('پارت', l.lot_no), cellf('تعداد', fmt(l[key] - (usedNow.get(l.id + key) || 0)) + ' عدد'), cellf('بهای تمام‌شده', fmt(Math.round(l.landed_unit)))]))));
  }
  const unitNow = () => { const f = dSim(), got = D.qty - f.short; return got > 0 && D.item ? f.cost / got : 0; };
  function showCost() { D.unit = unitNow(); costEl.textContent = D.unit ? fmt(Math.round(D.unit)) : '—'; }
  function autoPrice(force) {
    showCost();
    if (!force && D.touched) return;
    const p = D.unit ? roundK(D.unit * (1 + markupOf(D.item) / 100)) : 0;
    D.price = p; priceCtl.set(p || ''); if (force) D.touched = false;
  }
  function drawPrev() {
    showCost();
    const f = dSim(); D.short = f.short;
    const lp = D.item && !f.short ? D.qty * D.price - f.cost : null;
    lineNote.textContent = D.item ? `مبلغ ردیف ${fmt(D.qty * D.price)} ریال` + (lp == null ? '' : ` · سود ناخالص ${fmt(lp)}`) : '';
    prev.className = 'prev' + (f.short > 0 ? ' bad' : '');
    const o = dHold() === seller ? other() : seller;
    if (!D.item) prev.textContent = '';
    else if (f.short > 0) prev.textContent = `⚠ موجودی «${S.I[D.item].name}» نزد ${dHold()} کافی نیست (${f.short} عدد کم است).` + (avail(o) > 0 ? ` نزد ${o} ${avail(o)} عدد هست؛ بالا همان را انتخاب کن.` : ' این کالا نزد هیچ‌کدام موجود نیست.');
    else prev.textContent = 'کسر از موجودی: ' + f.parts.map(p => `${p.qty} از ${p.lot.lot_no}`).join(' + ') + ` · بهای تمام‌شده: ${fmt(f.cost)}`;
    addBtn.disabled = !D.item || f.short > 0 || D.qty < 1;
  }
  addBtn.onclick = () => {
    if (!D.item) return toast('اول کالا را از لیست انتخاب کن', 'err');
    if (D.qty < 1) return toast('تعداد باید حداقل ۱ باشد', 'err');
    if (D.short > 0) return toast('موجودی کافی نیست', 'err');
    addRow({ item: D.item, qty: D.qty, price: D.price, lot: D.lot, holder: D.holder });
    D.qty = 1; qtyCtl.set(1); D.lot = null; D.touched = false;
    recalc(); autoHolder(); autoPrice(true); drawPrev(); drawList();
  };
  q.addEventListener('input', () => drawList());
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const f = ilist.querySelector('.cmb-o:not(.create)') || ilist.querySelector('.create'); if (f) f.click(); } });
  detail.append(h('div', { class: 'sh' }, h('b', { class: 'sname' }, ''), h('small', null, '')), descEl, lotBox, holdBox,
    h('div', { class: 'sline' }, field('تعداد', qtyCtl, null, 'c-qty'), field('بهای تمام‌شده (ریال)', costEl, null, 'c-cost'), field('فی فروش (ریال)', priceCtl, null, 'c-price')),
    lineNote, prev, addBtn);
  const shName = detail.querySelector('.sname'), shSub = detail.querySelector('.sh small');
  const _choose = choose;
  choose = id => { _choose(id); const st = S.stock.find(x => x.id === id); shName.textContent = S.I[id] ? S.I[id].name : ''; shSub.textContent = st ? `موجودی کل ${st.rem} عدد` : ''; };

  /* ---------------- محاسبه‌ی کل ---------------- */
  function totals() {
    const gross = sum(rows, r => r.qty * r.price), cost = sum(rows, r => r.cost);
    const disc = Math.min(discount.get(), gross), total = gross - disc;          // مبلغ فاکتور بعد از تخفیف
    const c = courier.get() + pack.get();
    const recv = payMode === 'full' ? total : Math.min(received.get(), total);
    return { gross, disc, total, cost, c, recv, profit: total - cost - c };
  }
  function recalc() {
    usedNow = evalRows(); paintRows();
    const t = totals();
    stat.gross.textContent = fmt(t.gross); stat.disc.textContent = fmt(t.disc); stat.total.textContent = fmt(t.total); stat.recv.textContent = fmt(t.recv); stat.left.textContent = fmt(Math.max(0, t.total - t.recv)); stat.profit.textContent = fmt(t.profit);
    stat.profit.className = 'n ' + (t.profit < 0 ? 'neg' : 'pos');
    remainEl.textContent = payMode === 'part' ? `مانده‌ی فاکتور به حساب بدهکاری مشتری منتقل می‌شود: ${fmt(Math.max(0, t.total - t.recv))} ریال` : '';
    const cid = customer.get(), cb = cid && S.vCus.find(x => x.id === cid);
    custInfo.textContent = !cid ? '—' : (cb && cb.outstanding > 0 ? `${fmt(cb.outstanding)} ریال بدهکار` + (cb.overdue_amount > 0 ? ` (${fmt(cb.overdue_amount)} سررسید گذشته!)` : '') : 'تسویه');
    custInfo.classList.toggle('debt', !!(cb && cb.outstanding > 0));
    const cn = cid && S.CUS[cid];
    forEl.textContent = cn ? 'برای: ' + cn.name : '';
    costAccBox.hidden = t.c <= 0;
    const bad = rows.find(r => r.short > 0);
    warn.hidden = !bad; warn.textContent = bad ? 'موجودی کافی نیست؛ ثبت ممکن نیست.' : '';
    if (D.item) { drawHolder(); if (!D.touched) autoPrice(false); drawPrev(); drawList(); }
  }

  const submit = h('button', { class: 'btn primary lg', type: 'button' }, edit ? 'ذخیره‌ی ویرایش فاکتور' : 'ثبت و صدور فاکتور');
  submit.onclick = async () => {
    // کالایی که در پنل انتخاب شده ولی دکمه‌ی «افزودن» زده نشده، اگر فاکتور خالی باشد خودش ردیف می‌شود
    if (!rows.length && D.item && D.qty > 0 && !D.short) { addRow({ item: D.item, qty: D.qty, price: D.price, lot: D.lot, holder: D.holder }); recalc(); }
    const t = totals();
    if (!rows.length) return toast('حداقل یک کالا به فاکتور اضافه کن', 'err');
    if (rows.some(r => r.qty < 1)) return toast('تعداد باید حداقل ۱ باشد', 'err');
    if (discount.get() > t.gross) return toast('تخفیف نمی‌تواند از جمع ردیف‌ها بیشتر باشد', 'err');
    if (rows.some(r => !r.price)) { if (!confirm0('فی فروش یکی از کالاها صفر است. مطمئنی؟')) return; }
    if (rows.some(r => r.short > 0)) return toast('موجودی کافی نیست', 'err');
    if (!customer.get()) { customer.input.focus(); return toast('نام خریدار را انتخاب کن یا بساز؛ هر فاکتور فروش باید خریدار داشته باشد', 'err'); }
    if (t.recv > 0 && !recvAcc.get()) return toast('حسابی که پول به آن آمد را انتخاب کن', 'err');
    if (t.c > 0 && !costAcc.get()) return toast('حساب پرداخت هزینه را انتخاب کن', 'err');
    const payload = {
      date, seller, channel: channel.get(), customer_id: customer.get(), discount: t.disc, due_date: t.recv < t.total ? due.get() : null, received: t.recv, account_id: t.recv > 0 ? recvAcc.get() : null,
      courier: courier.get(), pack: pack.get(), cost_account_id: t.c > 0 ? costAcc.get() : null, note: note.value.trim(),
      lines: rows.map(r => ({ item_id: r.item, qty: r.qty, unit_price: r.price, lot_id: r.lot, holder: r.holder || seller }))
    };
    const r = await run(submit, () => rpc(edit ? 'edit_sale' : 'create_sale', edit ? { ...payload, id: edit.id } : payload));
    if (!r) return;
    setPref('channel', payload.channel); if (payload.account_id) setPref('recvAcc_' + seller, payload.account_id); if (payload.cost_account_id) setPref('costAcc_' + seller, payload.cost_account_id);
    toast(`فروش ${r.no} ${edit ? 'ویرایش شد' : 'ثبت شد'}`); m.close(); await bus.refresh();
  };

  const hdrZone = zone('۱', 'سربرگ فاکتور', 'مشخصات طرف حساب و فروشنده',
    h('div', { class: 'two-col dt' }, field('فروشنده', sellerChips), field('تاریخ', dateCtl)),
    h('div', { class: 'two-col dt' }, field('خریدار (طرف حساب) *', customer), field('مانده‌ی قبلی طرف حساب', custInfo)),
    field('کانال فروش', channel));
  const itemsZone = zone('۲', 'اقلام فاکتور', null,
    h('div', { class: 'ihead' }, ...['ردیف', 'شرح کالا', 'شماره پارت', 'انبار', 'تعداد', 'فی (ریال)', 'مبلغ ردیف', 'سود ناخالص', ''].map(x => h('span', null, x))),
    gridBox, h('div', { class: 'ifoot' }, countEl, field('تخفیف فروش (ریال)', discount, 'اختیاری؛ از جمع ردیف‌ها کم می‌شود و روی طلب، دریافتی و سود اثر می‌گذارد.')), warn);
  gridBox.append(emptyRow);
  const panZone = h('section', { class: 'z2 pan' }, h('div', { class: 'zt dark' }, h('span', null, 'افزودن کالا به فاکتور'), forEl), h('div', { class: 'zx' }, card));
  const payZone = h('div', { class: 'pay2' },
    zone('۳', 'تسویه‌ی فاکتور', 'دریافت وجه از مشتری', payChips, partBox, field('دریافت وجه در (تنخواه / حساب بانکی)', recvAcc)),
    h('div', { class: 'pay2c' },
      zone('۴', 'هزینه‌های جانبی فروش', 'اختیاری', h('div', { class: 'two-col' }, field('هزینه‌ی ارسال (پیک)', courier), field('هزینه‌ی بسته‌بندی', pack)), h('div', { class: 'hint' }, 'اگر مشتری کرایه‌ی ارسال را مستقیم می‌پردازد، خالی بگذار.'), costAccBox),
      zone('۵', 'توضیحات فاکتور', null, note)));
  const m = modal({
    title: edit ? `ویرایش فروش ${edit.no}` : 'فروش جدید', wide: true, onClose: () => undo.forEach(f => f()),
    body: h('div', { class: 'form sale2' }, h('div', { class: 'a-hdr' }, hdrZone), h('div', { class: 'a-pan' }, panZone), h('div', { class: 'a-itm' }, itemsZone), h('div', { class: 'a-pay' }, payZone)),
    footer: [h('div', { class: 'sm2' }, stripBox('جمع ردیف‌ها', stat.gross), stripBox('تخفیف', stat.disc), stripBox('مبلغ قابل پرداخت', stat.total), stripBox('دریافتی', stat.recv), stripBox('مانده‌ی فاکتور', stat.left), stripBox('سود ناخالص (برآورد)', stat.profit)), submit]
  });
  const sh = m.el.querySelector && m.el.querySelector('.sheet'); if (sh) sh.classList.add('xwide');
  defaultAccounts(); drawFilters(); drawList(); recalc();
  if (preset.item && !edit) choose(preset.item);
  if (preset.customer) { customer.set(preset.customer); recalc(); }
  if (edit) {   // پیش‌پر کردن فرم با اطلاعات فروش قبلی؛ هر پارتِ فروخته‌شده یک ردیف
    for (const l of S.saleLines.filter(x => x.sale_id === edit.id)) addRow({ item: l.item_id, qty: l.qty, price: l.unit_price, lot: l.lot_id, holder: l.holder !== seller ? l.holder : null });
    if (edit.customer_id) customer.set(edit.customer_id);
    discount.set(edit.discount || '');
    if (edit.received < edit.total) { payMode = 'part'; payChips.set('part'); partBox.hidden = false; received.set(edit.received); }
    if (edit.due_date) due.setDate(edit.due_date);
    if (edit.account_id) recvAcc.set(edit.account_id);
    courier.set(edit.courier || ''); pack.set(edit.pack || ''); if (edit.cost_account_id) costAcc.set(edit.cost_account_id);
    note.value = edit.note || ''; recalc();
  }
  return m;
}
const confirm0 = msg => window.confirm(msg);

/* ======================= خرید جدید ======================= */
export function purchaseForm(preset = {}) {
  const edit = preset.edit ? S.INV[preset.edit] : null;           // ویرایش یک فاکتور خرید موجود (فقط حمیدرضا و مهسا)
  if (edit && !canEdit()) { toast('ویرایش فقط برای حمیدرضا و مهسا باز است', 'err'); return; }
  let date = edit ? edit.date : todayISO();
  const lines = [], pays = [];
  const linesBox = h('div', { class: 'lines' }), paysBox = h('div', { class: 'lines' });
  const sum1 = h('div', { class: 'sumbox' });
  const dateCtl = dateField(date, v => { date = v; due.refresh(); });
  const supplier = combo({
    placeholder: 'نام تامین‌کننده را تایپ کن یا انتخاب کن (الزامی)', createLabel: 'تامین‌کننده‌ی جدید',
    options: S.suppliers.filter(s => s.active).map(s => ({ v: s.id, label: s.name, sub: s.phone || '' })),
    onCreate: async name => { try { const r = await rpc('save_supplier', { name }, { queue: false }); await loadAll(); supplier.setOptions(S.suppliers.filter(s => s.active).map(s => ({ v: s.id, label: s.name, sub: s.phone || '' }))); supplier.set(r.id); toast('تامین‌کننده اضافه شد'); return r.id; } catch (e) { toast(errText(e), 'err'); return null; } }
  });
  const itemOpts = () => S.items.filter(i => i.active).map(i => ({ v: i.id, label: i.name, sub: [i.category, i.description].filter(Boolean).join(' · ') }));
  const ship = numField({ onInput: () => recalc() });
  const discount = numField({ onInput: () => recalc() });
  const shipAcc = accountPicker(S.accounts, null, () => {}, { pockets: true });
  const shipBox = h('div', { hidden: true }, field('هزینه‌ی حمل را چه کسی / از کدام حساب پرداخت کرد؟', shipAcc, 'روی قیمت هر قلم سرشکن می‌شود و قیمت تمام‌شده را می‌سازد.'));
  const note = h('input', { class: 'inp', type: 'text', placeholder: 'یادداشت (اختیاری)' });
  const due = dueField(() => date, { label: 'تا چه زمانی باید باقی‌مانده را بدهیم؟' });
  const dueBox = h('div', { hidden: true }, due);

  function addLine() {
    const L = { item: null, qty: 1, price: 0, m: 1, r: 0, manual: false };
    const sel = combo({
      placeholder: 'نام کالا را تایپ کن…', createLabel: 'کالای جدید', options: itemOpts(), onChange: v => { L.item = v; showDesc(); showAdvice(); recalc(); },
      onCreate: async name => { const category = await pickCategoryDialog(name); if (!category) return null; try { const r = await rpc('save_item', { name, category }, { queue: false }); await loadAll(); sel.setOptions(itemOpts()); sel.set(r.id); L.item = r.id; showDesc(); showAdvice(); toast('کالا اضافه شد'); recalc(); return r.id; } catch (e) { toast(errText(e), 'err'); return null; } }
    });
    const descEl = h('div', { class: 'idesc', hidden: true });
    const showDesc = () => { const d = L.item && S.I[L.item] && S.I[L.item].description; descEl.textContent = d ? '📝 ' + d : ''; descEl.hidden = !d; };
    const advEl = h('div', { class: 'advbox', hidden: true });
    const showAdvice = async () => { const id = L.item; advEl.hidden = true; if (!id) return; const o = await adviceFor(id); if (L.item !== id || !o) return; advEl.textContent = adviceText(o); advEl.className = 'advbox ' + o.verdict; advEl.hidden = false; };
    L.advice = showAdvice;
    const price = numField({ onInput: n => { L.price = n; recalc(); } });
    const mS = intField({ value: 1, min: 0, onChange: n => { L.m = n; L.r = Math.max(0, L.qty - n); if (L.m > L.qty) { L.m = L.qty; mS.set(L.m); } rS.set(L.r); L.manual = true; recalc(); } });
    const rS = intField({ value: 0, min: 0, onChange: n => { L.r = n; L.m = Math.max(0, L.qty - n); if (L.r > L.qty) { L.r = L.qty; rS.set(L.r); } mS.set(L.m); L.manual = true; recalc(); } });
    const qty = intField({ value: 1, min: 1, big: true, onChange: n => { L.qty = n; if (!L.manual) { L.m = Math.ceil(n / 2); L.r = n - L.m; } else { L.m = Math.min(L.m, n); L.r = n - L.m; } mS.set(L.m); rS.set(L.r); recalc(); } });
    const quick = h('div', { class: 'quick' },
      h('button', { type: 'button', class: 'mini', onclick: () => { L.m = L.qty; L.r = 0; mS.set(L.m); rS.set(0); L.manual = true; recalc(); } }, 'همه مهسا'),
      h('button', { type: 'button', class: 'mini', onclick: () => { L.m = Math.ceil(L.qty / 2); L.r = L.qty - L.m; mS.set(L.m); rS.set(L.r); L.manual = false; recalc(); } }, 'نصف'),
      h('button', { type: 'button', class: 'mini', onclick: () => { L.r = L.qty; L.m = 0; mS.set(0); rS.set(L.r); L.manual = true; recalc(); } }, 'همه رعنا'));
    const prev = h('div', { class: 'prev' });
    const tot = h('b', { class: 'n' }, '0');
    L.update = (share, dshare = 0) => { const lt = L.qty * L.price; tot.textContent = fmt(lt); const landed = L.qty ? (lt + share - dshare) / L.qty : 0; prev.textContent = L.item && L.price ? `تمام‌شده‌ی هر عدد` + (share || dshare > 0 ? ' (با حمل/تخفیف)' : '') + `: ${fmt(Math.round(landed))}` : ''; };
    const card = h('div', { class: 'lcard pline' },
      h('div', { class: 'lrow' }, sel, h('button', { class: 'rm', type: 'button', 'aria-label': 'حذف این قلم', onclick: () => { lines.splice(lines.indexOf(L), 1); card.remove(); recalc(); } }, '✕')),
      descEl, advEl,
      h('div', { class: 'pgrid' }, field('تعداد', qty), field('فی خرید (ریال)', price), field('مهسا', mS), field('رعنا', rS)),
      h('div', { class: 'pfoot' }, h('span', { class: 'ltot' }, 'جمع: ', tot), quick), prev);
    L.pickItem = (id, n) => { sel.set(id); L.item = id; if (n) { L.qty = n; qty.set(n); L.m = Math.ceil(n / 2); L.r = n - L.m; mS.set(L.m); rS.set(L.r); } showDesc(); showAdvice(); recalc(); };
    L.prefill = d => {   // پر کردن قلم هنگام ویرایش
      sel.set(d.item); L.item = d.item; L.qty = d.qty; qty.set(d.qty); L.price = d.price; price.set(d.price);
      L.m = d.m; L.r = d.r; L.manual = true; mS.set(d.m); rS.set(d.r); showDesc(); showAdvice(); recalc();
    };
    L.setHold = () => {}; L.el = card; lines.push(L); linesBox.append(card); recalc(); return L;
  }

  function addPay() {
    const P = { acc: null, amt: 0, touched: false };
    const acc = accountPicker(S.accounts, null, v => { P.acc = v; }, { pockets: true });
    const amt = numField({ onInput: n => { P.amt = n; P.touched = true; recalc(true); } });
    P.ctl = amt;
    const card = h('div', { class: 'lcard' },
      h('div', { class: 'lrow' }, h('b', null, 'پرداخت ' + (pays.length + 1)), pays.length ? h('button', { class: 'rm', type: 'button', 'aria-label': 'حذف', onclick: () => { pays.splice(pays.indexOf(P), 1); card.remove(); recalc(); } }, '✕') : null),
      field('مبلغ پرداخت‌شده به تامین‌کننده', amt), field('از کدام حساب؟ (شرکت یا جیب شخصی)', acc));
    P.set = (a, n) => { acc.set(a); P.acc = a; amt.set(n); P.amt = n; P.touched = true; };
    pays.push(P); paysBox.append(card); recalc(); return P;
  }

  const goods = () => sum(lines, l => l.qty * l.price);
  function recalc(fromPay) {
    const g0 = goods(), sh = ship.get(), dc = Math.min(discount.get(), g0), g = g0 - dc;   // g = مبلغ فاکتور بعد از تخفیف = بدهی به تامین‌کننده
    shipBox.hidden = sh <= 0;
    if (pays[0] && !pays[0].touched && !fromPay) { pays[0].amt = g; pays[0].ctl.set(g || ''); }
    lines.forEach(l => { const lt = l.qty * l.price; l.update(g0 > 0 ? sh * lt / g0 : 0, g0 > 0 ? dc * lt / g0 : 0); });
    const paid = sum(pays, p => p.amt);
    dueBox.hidden = g - paid <= 0;
    sum1.replaceChildren(
      row('جمع کالا', g0), ...(dc > 0 ? [row('تخفیف', -dc), row('جمع پس از تخفیف (بدهی کالا)', g, 'bold')] : []), row('هزینه حمل (سرشکن)', sh), row('قیمت تمام‌شده‌ی فاکتور', g + sh, 'bold'), row('پرداخت‌شده به تامین‌کننده', paid),
      row(g - paid >= 0 ? 'بدهی به تامین‌کننده' : 'اضافه‌پرداخت (تامین‌کننده بدهکار شد)', Math.abs(g - paid), g - paid > 0 ? 'warn' : g - paid < 0 ? 'info' : 'ok'));
  }
  const row = (k, v, c = '') => h('div', { class: 'srow ' + c }, h('span', null, k), h('b', { class: 'n' }, fmt(v)));

  const submit = h('button', { class: 'btn primary lg', type: 'button' }, edit ? 'ذخیره‌ی ویرایش فاکتور' : 'ثبت فاکتور');
  submit.onclick = async () => {
    if (!supplier.get()) { supplier.input.focus(); return toast('تامین‌کننده را انتخاب کن یا بساز؛ هر فاکتور خرید باید تامین‌کننده داشته باشد', 'err'); }
    if (!lines.length || lines.some(l => !l.item)) return toast('کالای هر قلم را انتخاب کن', 'err');
    if (lines.some(l => !l.price)) return toast('قیمت خرید هر قلم را بنویس', 'err');
    if (lines.some(l => l.m + l.r !== l.qty)) return toast('جمع تحویل مهسا و رعنا باید برابر تعداد باشد', 'err');
    const sh = ship.get();
    if (discount.get() > goods()) return toast('تخفیف نمی‌تواند از جمع کالاها بیشتر باشد', 'err');
    if (sh > 0 && !shipAcc.get()) return toast('حساب پرداخت‌کننده‌ی هزینه حمل را انتخاب کن', 'err');
    const used = pays.filter(p => p.amt > 0);
    if (used.some(p => !p.acc)) return toast('حساب هر پرداخت را انتخاب کن', 'err');
    const payload = {
      date, supplier_id: supplier.get(), ship_cost: sh, discount: discount.get(), ship_account_id: sh > 0 ? shipAcc.get() : null, due_date: goods() - discount.get() - sum(used, p => p.amt) > 0 ? due.get() : null, note: note.value.trim(),
      lines: lines.map(l => ({ item_id: l.item, qty: l.qty, unit_price: l.price, hold_m: l.m, hold_r: l.r })),
      payments: used.map(p => ({ account_id: p.acc, amount: p.amt }))
    };
    const r = await run(submit, () => rpc(edit ? 'edit_purchase' : 'create_purchase', edit ? { ...payload, id: edit.id } : payload));
    if (!r) return;
    toast(`فاکتور ${r.no} ${edit ? 'ویرایش شد' : 'ثبت شد'}`); m.close(); await bus.refresh();
  };
  const m = modal({
    title: edit ? `ویرایش فاکتور ${edit.no}` : 'خرید جدید', wide: true,
    body: h('div', { class: 'form' },
      h('div', { class: 'two-col dt' }, field('تامین‌کننده *', supplier), field('تاریخ', dateCtl)),
      h('h3', { class: 'sec' }, 'اقلام فاکتور'), linesBox,
      h('button', { class: 'btn dashed', type: 'button', onclick: addLine }, '＋ افزودن قلم'),
      field('تخفیف خرید (ریال)', discount, 'اختیاری؛ از جمع فاکتور و بدهی به تامین‌کننده کم می‌شود و روی قیمت تمام‌شده‌ی اقلام سرشکن می‌شود.'),
      h('h3', { class: 'sec' }, 'هزینه حمل خرید (اختیاری)'), field('مبلغ حمل', ship), shipBox,
      h('h3', { class: 'sec' }, 'پرداخت به تامین‌کننده'), paysBox,
      h('button', { class: 'btn dashed', type: 'button', onclick: addPay }, '＋ پرداخت دیگر (اگر دو نفر پرداخت کردند)'),
      sum1, dueBox, field('یادداشت', note)),
    footer: [submit]
  });
  if (!edit) { const l0 = addLine(); addPay(); if (preset.item) l0.pickItem(preset.item, preset.qty); }
  else {   // پیش‌پر کردن فرم با اطلاعات فاکتور قبلی
    supplier.set(edit.supplier_id);
    for (const l of S.lines.filter(x => x.invoice_id === edit.id)) addLine().prefill({ item: l.item_id, qty: l.qty, price: l.unit_price, m: l.hold_m, r: l.hold_r });
    discount.set(edit.discount || ''); ship.set(edit.ship_cost || ''); if (edit.ship_account_id) shipAcc.set(edit.ship_account_id);
    const old = S.payments.filter(p => p.invoice_id === edit.id && !p.voided);
    if (old.length) old.forEach(p => addPay().set(p.account_id, p.amount)); else addPay();
    if (edit.due_date) due.setDate(edit.due_date);
    note.value = edit.note || ''; recalc();
  }
  return m;
}
