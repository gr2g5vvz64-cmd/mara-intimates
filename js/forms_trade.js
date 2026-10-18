// فرم‌های اصلی: فروش و خرید
import { h, fmt, parseNum, todayISO, toast, sum, jstr } from './util.js';
import { S, rpc, loadAll, bus, pref, setPref, simulateFifo, holdKey, customers, businessAccounts, CHANNELS, accBalance, errText } from './store.js';
import { modal, field, chips, accountPicker, numField, intField, dateField, dueField, combo, run, promptBox } from './ui.js';
import { pickCategoryDialog } from './forms_misc.js';

const accOf = name => S.accounts.find(a => a.name === name);
const seg = (mode, on, cb, a, b) => chips([{ v: 'a', label: a }, { v: 'b', label: b }], mode, cb, { cls: 'two' });

/* ======================= فروش جدید ======================= */
const MARKUP = 0.20;                                  // فی فروش پیش‌فرض = بهای تمام‌شده + ۲۰٪
const roundK = n => Math.round(n / 1000) * 1000;       // گرد به هزار ریال
export function saleForm(preset = {}) {
  const me = S.me && S.me.name !== 'حمیدرضا' ? S.me.name : 'مهسا';
  let seller = preset.seller || me;
  let date = todayISO();
  const lines = [];
  const linesBox = h('div', { class: 'lines' });
  const warn = h('div', { class: 'warnbox', hidden: true });
  const totalEl = h('b', { class: 'n' }, '0'), profitEl = h('b', { class: 'n' }, '0');
  const discount = numField({ onInput: () => recalc() });
  const discSum = h('div', { class: 'sumbox' });
  const row = (k, v, c = '') => h('div', { class: 'srow ' + c }, h('span', null, k), h('b', { class: 'n' }, fmt(v)));
  const stockAvail = id => { const s = S.stock.find(x => x.id === id); return s ? s : { rem_m: 0, rem_r: 0 }; };

  const sellerChips = chips([{ v: 'مهسا', label: 'مهسا' }, { v: 'رعنا', label: 'رعنا' }], seller, v => { seller = v; lines.forEach(l => l.refreshItems()); defaultAccounts(); recalc(); }, { cls: 'two', label: 'فروشنده' });
  const dateCtl = dateField(date, v => { date = v; due.refresh(); });
  const channel = chips(CHANNELS.map(c => ({ v: c, label: c })), pref('channel', CHANNELS[0]), () => {}, { label: 'محل فروش' });
  const custOpts = () => customers().map(c => { const b = S.vCus.find(x => x.id === c.id); return { v: c.id, label: c.name, sub: (c.phone || '') + (b && b.outstanding > 0 ? ' · بدهکار ' + fmt(b.outstanding) : '') }; });
  const customer = combo({
    placeholder: 'نام مشتری (اختیاری؛ برای نسیه الزامی)', createLabel: 'مشتری جدید', options: custOpts(),
    onCreate: async name => { try { const r = await rpc('save_customer', { name }, { queue: false }); await loadAll(); customer.setOptions(custOpts()); customer.set(r.id); toast('مشتری اضافه شد'); recalc(); return r.id; } catch (e) { toast(errText(e), 'err'); return null; } },
    onChange: () => recalc()
  });
  const custInfo = h('div', { class: 'hint' });
  const due = dueField(() => date, { label: 'مشتری تا چه زمانی می‌دهد؟' });
  let payMode = 'full';
  const payChips = chips([{ v: 'full', label: 'کامل گرفتم' }, { v: 'part', label: 'بخشی / نسیه' }], 'full', v => { payMode = v; partBox.hidden = v === 'full'; recalc(); }, { cls: 'two', label: 'نحوه‌ی دریافت' });
  const received = numField({ onInput: () => recalc() });
  const remainEl = h('div', { class: 'hint' });
  const partBox = h('div', { hidden: true }, field('چقدر گرفتی؟', received, null), remainEl, due);
  const recvAcc = accountPicker(businessAccounts(), null, () => {}, { pockets: false, balances: accBalance });
  const courier = numField({ onInput: () => recalc() }), pack = numField({ onInput: () => recalc() });
  const costAcc = accountPicker(S.accounts, null, () => {}, { pockets: true });
  const costAccBox = h('div', { hidden: true }, field('هزینه‌ی پیک/بسته‌بندی از کدام حساب پرداخت شد؟', costAcc));
  const note = h('input', { class: 'inp', type: 'text', placeholder: 'یادداشت (اختیاری)' });

  function defaultAccounts() {
    const bank = accOf('حساب ' + seller), cash = accOf('نقد ' + seller);
    const pr = pref('recvAcc_' + seller, null);
    recvAcc.set(pr && S.A[pr] ? pr : (bank ? bank.id : null));
    const pc = pref('costAcc_' + seller, null);
    costAcc.set(pc && S.A[pc] ? pc : (cash ? cash.id : null));
  }

  function addLine() {
    const L = { item: null, qty: 1, price: 0, lot: null, holder: null, manual: false, touched: false, unit: 0 };
    const hl = () => L.holder || seller, other = () => (seller === 'مهسا' ? 'رعنا' : 'مهسا');
    const cnt = (who, id = L.item) => { const st = S.stock.find(x => x.id === id); return st ? (who === 'مهسا' ? st.rem_m : st.rem_r) : 0; };
    /* بهای تمام‌شده‌ی هر واحد = قیمت خرید + سهم هزینه‌ی سرشکن‌شده (میانگین وزنی طبق FIFO یا پارت انتخاب‌شده) */
    const unitNow = () => {
      if (!L.item) return 0;
      const f = simulateFifo(L.item, hl(), L.qty, L.lot), got = L.qty - f.short;
      return got > 0 ? f.cost / got : 0;
    };
    const costEl = h('div', { class: 'inp ro', dir: 'ltr', title: 'قیمت خرید + سهم هزینه‌ی سرشکن‌شده', 'aria-label': 'بهای تمام‌شده‌ی هر عدد' }, '—');
    const showCost = () => { L.unit = unitNow(); costEl.textContent = L.unit ? fmt(Math.round(L.unit)) : '—'; };
    /* فی فروش پیشنهادی؛ اگر خودت قیمت را دستی عوض کرده باشی (touched) دست نمی‌زند، مگر force */
    const autoPrice = force => {
      showCost();
      if (!force && L.touched) return;
      const p = L.unit ? roundK(L.unit * (1 + MARKUP)) : 0;
      L.price = p; priceCtl.set(p || ''); if (force) L.touched = false;
    };
    const choose = v => {
      L.item = v; L.lot = null; L.manual = false; L.touched = false; showDesc(); autoHolder();
      autoPrice(true); recalc();
    };
    const sel = combo({ placeholder: 'نام کالا را تایپ کن…', onChange: choose });
    L.pick = v => { sel.set(v); choose(v); };
    const qty = intField({ value: 1, min: 1, onChange: n => { L.qty = n; autoHolder(); autoPrice(false); recalc(); }, big: true });
    const priceCtl = numField({ unit: '', onInput: n => { L.price = n; L.touched = true; recalc(); } });
    const descEl = h('div', { class: 'idesc', hidden: true });
    const showDesc = () => { const d = L.item && S.I[L.item] && S.I[L.item].description; descEl.textContent = d ? '📝 ' + d : ''; descEl.hidden = !d; };
    const lotBox = h('div', { class: 'lotstrip', hidden: true });
    const holdBox = h('div', { class: 'holdbox', hidden: true });
    const prev = h('div', { class: 'prev' });
    const lineTot = h('b', { class: 'n' }, '0'), lineProf = h('span', { class: 'lp' });
    const card = h('div', { class: 'lcard' },
      h('div', { class: 'sline' },
        field('نام کالا', sel, null, 'c-name'), field('تعداد', qty, null, 'c-qty'),
        field('بهای تمام‌شده (ریال)', costEl, null, 'c-cost'), field('فی فروش (ریال)', priceCtl, null, 'c-price'),
        h('button', { class: 'rm', type: 'button', 'aria-label': 'حذف این کالا', onclick: () => { lines.splice(lines.indexOf(L), 1); card.remove(); recalc(); } }, '✕')),
      descEl, lotBox, holdBox, prev, h('div', { class: 'ltot' }, 'جمع این کالا: ', lineTot, ' ریال', lineProf));
    function items() {
      return S.stock.filter(i => i.active).map(i => ({ v: i.id, label: i.name, sub: `مهسا ${i.rem_m} · رعنا ${i.rem_r}` }));
    }
    function autoHolder() {
      if (L.manual) return;
      L.holder = (L.item && cnt(seller) < L.qty && cnt(other()) >= L.qty) ? other() : null;
      drawHolder(); drawLots();
    }
    function drawHolder() {
      holdBox.hidden = !L.item;
      if (!L.item) return;
      const btn = who => h('button', { type: 'button', class: 'chip' + (hl() === who ? ' on' : '') + (cnt(who) < 1 ? ' dim' : ''), 'aria-pressed': hl() === who ? 'true' : 'false',
        onclick: () => { L.holder = who === seller ? null : who; L.manual = true; drawHolder(); drawLots(); autoPrice(false); recalc(); } }, `${who} · ${cnt(who)} عدد`);
      holdBox.replaceChildren(...[h('label', { class: 'lbl' }, 'از موجودی چه کسی برداشته شود؟'), h('div', { class: 'chips two' }, btn(seller), btn(other())),
        hl() !== seller ? h('div', { class: 'hint' }, `این جنس را ${seller} نزد خودش ندارد؛ از موجودی ${hl()} برداشته می‌شود و فروش به نام ${seller} ثبت می‌شود.`) : null].filter(Boolean));
    }
    /* نوار پارت‌ها: وقتی کالا چند خرید جدا دارد؛ هر پارت = شماره‌ی پارت · تعداد نزد برداشت‌کننده · بهای تمام‌شده */
    function drawLots() {
      const key = holdKey(hl());
      const ls = S.lots.filter(l => l.item_id === L.item && !l.voided && l[key] > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
      if (L.lot && !ls.some(l => l.id === L.lot)) L.lot = null;
      lotBox.hidden = ls.length < 2;
      const pick = id => { L.lot = id || null; L.touched = false; drawLots(); autoPrice(true); recalc(); };
      const cell = (lab, val) => h('span', { class: 'lf' }, h('small', null, lab), h('b', null, val));
      const chip = (id, kids) => h('button', { type: 'button', class: 'lotchip' + ((L.lot || 0) === id ? ' on' : ''), 'aria-pressed': String((L.lot || 0) === id), 'data-lot': id, onclick: () => pick(id) }, kids);
      lotBox.replaceChildren(
        h('div', { class: 'lbl' }, `این کالا در چند خرید جدا گرفته شده؛ پارتی را که می‌فروشی بزن (نزد ${hl()})`),
        h('div', { class: 'lotrow' },
          chip(0, [cell('پارت', 'خودکار'), cell('تعداد', 'قدیمی‌ترین اول')]),
          ...ls.map(l => chip(l.id, [cell('پارت', l.lot_no), cell('تعداد', fmt(l[key]) + ' عدد'), cell('بهای تمام‌شده', fmt(Math.round(l.landed_unit)))]))));
    }
    L.refreshItems = () => { sel.setOptions(items()); L.manual = false; autoHolder(); autoPrice(false); };
    L.update = () => {
      const f = L.item ? simulateFifo(L.item, hl(), L.qty, L.lot) : { parts: [], short: 0, cost: 0 };
      L.cost = f.cost; L.short = f.short;
      lineTot.textContent = fmt(L.qty * L.price);
      showCost();
      const lp = L.item && !f.short ? L.qty * L.price - f.cost : null;
      lineProf.textContent = lp == null ? '' : ` · سود این کالا: ${fmt(lp)}`; lineProf.className = 'lp ' + (lp != null && lp < 0 ? 'neg' : '');
      prev.className = 'prev' + (f.short > 0 ? ' bad' : '');
      if (!L.item) prev.textContent = '';
      else if (f.short > 0) prev.textContent = `⚠ موجودی «${S.I[L.item].name}» نزد ${hl()} کافی نیست (${f.short} عدد کم است).` + (cnt(other()) > 0 || cnt(seller) > 0 ? ` نزد ${hl() === seller ? other() : seller} ${cnt(hl() === seller ? other() : seller)} عدد هست؛ بالا همان را انتخاب کن.` : ' این کالا نزد هیچ‌کدام موجود نیست.');
      else prev.textContent = 'کسر از موجودی: ' + f.parts.map(p => `${p.qty} از ${p.lot.lot_no}`).join(' + ') + ` · بهای تمام‌شده: ${fmt(f.cost)}`;
    };
    sel.setOptions(items());
    L.el = card; lines.push(L); linesBox.append(card); drawLots(); recalc();
    return L;
  }

  function totals() {
    const gross = sum(lines, l => l.qty * l.price), cost = sum(lines, l => l.cost);
    const disc = Math.min(discount.get(), gross), total = gross - disc;          // مبلغ فاکتور بعد از تخفیف
    const c = courier.get() + pack.get();
    const recv = payMode === 'full' ? total : Math.min(received.get(), total);
    return { gross, disc, total, cost, c, recv, profit: total - cost - c };
  }
  function recalc() {
    lines.forEach(l => l.update());
    const t = totals();
    totalEl.textContent = fmt(t.total); profitEl.textContent = fmt(t.profit);
    discSum.hidden = !(t.disc > 0 || discount.get() > 0);
    discSum.replaceChildren(row('جمع کالاها', t.gross), row('تخفیف', -t.disc), row('مبلغ فاکتور', t.total, 'bold'));
    profitEl.className = 'n ' + (t.profit < 0 ? 'neg' : 'pos');
    remainEl.textContent = payMode === 'part' ? `باقی‌مانده به‌عنوان بدهی مشتری ثبت می‌شود: ${fmt(Math.max(0, t.total - t.recv))} ریال` : '';
    const cb = customer.get() && S.vCus.find(x => x.id === customer.get());
    custInfo.textContent = cb && cb.outstanding > 0 ? `این مشتری الان ${fmt(cb.outstanding)} ریال بدهکار است` + (cb.overdue_amount > 0 ? ` (${fmt(cb.overdue_amount)} سررسید گذشته!)` : '') : '';
    costAccBox.hidden = t.c <= 0;
    const bad = lines.find(l => l.short > 0);
    warn.hidden = !bad; warn.textContent = bad ? 'موجودی کافی نیست؛ ثبت ممکن نیست.' : '';
  }

  const submit = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت فروش');
  submit.onclick = async () => {
    const t = totals();
    if (!lines.length || lines.some(l => !l.item)) return toast('کالای هر ردیف را انتخاب کن', 'err');
    if (lines.some(l => l.qty < 1)) return toast('تعداد باید حداقل ۱ باشد', 'err');
    if (discount.get() > t.gross) return toast('تخفیف نمی‌تواند از جمع کالاها بیشتر باشد', 'err');
    if (lines.some(l => !l.price)) { if (!confirm0('فی فروش یکی از کالاها صفر است. مطمئنی؟')) return; }
    if (lines.some(l => l.short > 0)) return toast('موجودی کافی نیست', 'err');
    if (t.recv < t.total && !customer.get()) { customer.input.focus(); return toast('برای فروش نسیه مشتری را انتخاب کن یا بساز', 'err'); }
    if (t.recv > 0 && !recvAcc.get()) return toast('حسابی که پول به آن آمد را انتخاب کن', 'err');
    if (t.c > 0 && !costAcc.get()) return toast('حساب پرداخت هزینه را انتخاب کن', 'err');
    const payload = {
      date, seller, channel: channel.get(), customer_id: customer.get(), discount: t.disc, due_date: t.recv < t.total ? due.get() : null, received: t.recv, account_id: t.recv > 0 ? recvAcc.get() : null,
      courier: courier.get(), pack: pack.get(), cost_account_id: t.c > 0 ? costAcc.get() : null, note: note.value.trim(),
      lines: lines.map(l => ({ item_id: l.item, qty: l.qty, unit_price: l.price, lot_id: l.lot, holder: l.holder || seller }))
    };
    const r = await run(submit, () => rpc('create_sale', payload));
    if (!r) return;
    setPref('channel', payload.channel); if (payload.account_id) setPref('recvAcc_' + seller, payload.account_id); if (payload.cost_account_id) setPref('costAcc_' + seller, payload.cost_account_id);
    toast(`فروش ${r.no} ثبت شد`); m.close(); await bus.refresh();
  };
  const m = modal({
    title: 'فروش جدید', wide: true,
    body: h('div', { class: 'form' },
      h('div', { class: 'two-col dt' }, field('فروشنده', sellerChips), field('تاریخ', dateCtl)),
      field('مشتری', [customer, custInfo]),
      h('h3', { class: 'sec' }, 'کالاها'), linesBox,
      h('button', { class: 'btn dashed', type: 'button', onclick: addLine }, '＋ افزودن کالای دیگر'),
      field('تخفیف فروش (ریال)', discount, 'اختیاری؛ از جمع فاکتور کم می‌شود و روی طلب، دریافتی و سود اثر می‌گذارد.'), discSum,
      field('محل فروش', channel),
      h('h3', { class: 'sec' }, 'پول چطور آمد؟'), payChips, partBox,
      field('پول به کدام حساب آمد؟', recvAcc),
      h('h3', { class: 'sec' }, 'هزینه‌ی همین فروش (اختیاری)'),
      h('div', { class: 'two-col' }, field('پیک (ما دادیم)', courier), field('بسته‌بندی', pack)),
      h('div', { class: 'hint' }, 'اگر مشتری خودش کرایه‌ی پیک را می‌دهد، خالی بگذار.'), costAccBox,
      field('یادداشت', note), warn),
    footer: [h('div', { class: 'sum' }, h('div', null, 'جمع فروش ', totalEl, ' ریال'), h('div', { class: 'sm' }, 'سود تقریبی ', profitEl)), submit]
  });
  defaultAccounts(); addLine();
  if (preset.item) lines[0].pick(preset.item);
  if (preset.customer) { customer.set(preset.customer); recalc(); }
  return m;
}
const confirm0 = msg => window.confirm(msg);

/* ======================= خرید جدید ======================= */
export function purchaseForm() {
  let date = todayISO();
  const lines = [], pays = [];
  const linesBox = h('div', { class: 'lines' }), paysBox = h('div', { class: 'lines' });
  const sum1 = h('div', { class: 'sumbox' });
  const dateCtl = dateField(date, v => { date = v; due.refresh(); });
  const supplier = combo({
    placeholder: 'تامین‌کننده را تایپ کن…', createLabel: 'تامین‌کننده‌ی جدید',
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
      placeholder: 'نام کالا را تایپ کن…', createLabel: 'کالای جدید', options: itemOpts(), onChange: v => { L.item = v; showDesc(); recalc(); },
      onCreate: async name => { const category = await pickCategoryDialog(name); if (!category) return null; try { const r = await rpc('save_item', { name, category }, { queue: false }); await loadAll(); sel.setOptions(itemOpts()); sel.set(r.id); L.item = r.id; showDesc(); toast('کالا اضافه شد'); recalc(); return r.id; } catch (e) { toast(errText(e), 'err'); return null; } }
    });
    const descEl = h('div', { class: 'idesc', hidden: true });
    const showDesc = () => { const d = L.item && S.I[L.item] && S.I[L.item].description; descEl.textContent = d ? '📝 ' + d : ''; descEl.hidden = !d; };
    const price = numField({ onInput: n => { L.price = n; recalc(); } });
    const mS = intField({ value: 1, min: 0, onChange: n => { L.m = n; L.r = Math.max(0, L.qty - n); if (L.m > L.qty) { L.m = L.qty; mS.set(L.m); } rS.set(L.r); L.manual = true; recalc(); } });
    const rS = intField({ value: 0, min: 0, onChange: n => { L.r = n; L.m = Math.max(0, L.qty - n); if (L.r > L.qty) { L.r = L.qty; rS.set(L.r); } mS.set(L.m); L.manual = true; recalc(); } });
    const qty = intField({ value: 1, min: 1, big: true, onChange: n => { L.qty = n; if (!L.manual) { L.m = Math.ceil(n / 2); L.r = n - L.m; } else { L.m = Math.min(L.m, n); L.r = n - L.m; } mS.set(L.m); rS.set(L.r); recalc(); } });
    const quick = h('div', { class: 'quick' },
      h('button', { type: 'button', class: 'mini', onclick: () => { L.m = L.qty; L.r = 0; mS.set(L.m); rS.set(0); L.manual = true; recalc(); } }, 'همه مهسا'),
      h('button', { type: 'button', class: 'mini', onclick: () => { L.m = Math.ceil(L.qty / 2); L.r = L.qty - L.m; mS.set(L.m); rS.set(L.r); L.manual = false; recalc(); } }, 'نصف‌نصف'),
      h('button', { type: 'button', class: 'mini', onclick: () => { L.r = L.qty; L.m = 0; mS.set(0); rS.set(L.r); L.manual = true; recalc(); } }, 'همه رعنا'));
    const prev = h('div', { class: 'prev' });
    const tot = h('b', { class: 'n' }, '0');
    L.update = (share, dshare = 0) => { const lt = L.qty * L.price; tot.textContent = fmt(lt); const landed = L.qty ? (lt + share - dshare) / L.qty : 0; prev.textContent = L.item && L.price ? `قیمت تمام‌شده‌ی هر عدد (با سهم حمل` + (dshare > 0 ? ' و تخفیف' : '') + `): ${fmt(Math.round(landed))}` : ''; };
    const card = h('div', { class: 'lcard' },
      h('div', { class: 'lrow' }, sel, h('button', { class: 'rm', type: 'button', 'aria-label': 'حذف این قلم', onclick: () => { lines.splice(lines.indexOf(L), 1); card.remove(); recalc(); } }, '✕')),
      descEl,
      h('div', { class: 'two-col' }, field('تعداد', qty), field('فی خرید', price)),
      h('div', { class: 'two-col' }, field('تحویل مهسا', mS), field('تحویل رعنا', rS)), quick, prev,
      h('div', { class: 'ltot' }, 'جمع این قلم: ', tot, ' ریال'));
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

  const submit = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت فاکتور');
  submit.onclick = async () => {
    if (!supplier.get()) return toast('تامین‌کننده را انتخاب کن', 'err');
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
    const r = await run(submit, () => rpc('create_purchase', payload));
    if (!r) return;
    toast(`فاکتور ${r.no} ثبت شد`); m.close(); await bus.refresh();
  };
  const m = modal({
    title: 'خرید جدید', wide: true,
    body: h('div', { class: 'form' },
      h('div', { class: 'two-col dt' }, field('تامین‌کننده', supplier), field('تاریخ', dateCtl)),
      h('h3', { class: 'sec' }, 'اقلام فاکتور'), linesBox,
      h('button', { class: 'btn dashed', type: 'button', onclick: addLine }, '＋ افزودن قلم'),
      field('تخفیف خرید (ریال)', discount, 'اختیاری؛ از جمع فاکتور و بدهی به تامین‌کننده کم می‌شود و روی قیمت تمام‌شده‌ی اقلام سرشکن می‌شود.'),
      h('h3', { class: 'sec' }, 'هزینه حمل خرید (اختیاری)'), field('مبلغ حمل', ship), shipBox,
      h('h3', { class: 'sec' }, 'پرداخت به تامین‌کننده'), paysBox,
      h('button', { class: 'btn dashed', type: 'button', onclick: addPay }, '＋ پرداخت دیگر (اگر دو نفر پرداخت کردند)'),
      sum1, dueBox, field('یادداشت', note)),
    footer: [submit]
  });
  addLine(); addPay();
  return m;
}
