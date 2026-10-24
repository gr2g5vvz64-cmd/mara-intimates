// فاکتور فروش جدولی (۷.۲۳): مرحلهٔ ۱ = خریدار + جدول کالاها، مرحلهٔ ۲ = تسویه و هزینه‌ها
// هر ردیف = یک «کد کالا»؛ «برداشت از» = چه تعداد از موجودی مهسا و چه تعداد از رعنا (پیش‌فرض: اول فروشنده، باقی از دیگری).
// بهای تمام‌شده با FIFO حساب می‌شود؛ هر ردیف در دیتابیس به یک یا دو خط (به‌ازای هر نگه‌دارنده) تبدیل می‌شود.
import { h, fmt, parseNum, todayISO, toast, sum } from './util.js';
import { S, rpc, loadAll, bus, pref, setPref, holdKey, customers, businessAccounts, CHANNELS, accBalance, errText, canEdit, markupOf } from './store.js';
import { modal, field, chips, accountPicker, numField, dateField, dueField, combo, run } from './ui.js';
import { itemForm } from './forms_misc.js';
import { COLOR_HEX } from './purchase_grid.js';

const roundK = n => Math.round(n / 1000) * 1000;       // گرد به هزار ریال
const accOf = name => S.accounts.find(a => a.name === name);

/* شبیه‌ساز FIFO که ردیف‌های قبلیِ همین فاکتور را هم از موجودی کم می‌کند (used: «شناسه‌ی پارت|کلید» ← تعداد) */
function simUsed(itemId, holder, qty, used) {
  const key = holdKey(holder), cap = l => l[key] - (used.get(l.id + key) || 0);
  const lots = S.lots.filter(l => l.item_id === itemId && !l.voided && cap(l) > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  let need = qty; const parts = [];
  for (const l of lots) { if (need <= 0) break; const t = Math.min(need, cap(l)); parts.push({ lot: l, qty: t, cost: l.landed_unit }); need -= t; }
  return { parts, short: need, cost: parts.reduce((a, p) => a + p.qty * p.cost, 0) };
}

export function saleForm(preset = {}) {
  const me = S.me && S.me.name !== 'حمیدرضا' ? S.me.name : 'مهسا';
  const edit = preset.edit ? S.SALE[preset.edit] : null;          // ویرایش یک فروش موجود (فقط حمیدرضا، مهسا و رعنا)
  if (edit && !canEdit()) { toast('ویرایش فقط برای حمیدرضا، مهسا و رعنا باز است', 'err'); return; }
  if (edit && (S.collections.some(c => c.sale_id === edit.id && !c.voided) || S.returns.some(r => !r.voided && r.sale_line_id && S.saleLines.some(l => l.id === r.sale_line_id && l.sale_id === edit.id)))) {
    toast('این فروش دریافت یا مرجوعی دارد؛ اول آن‌ها را باطل کن، بعد ویرایش کن.', 'err'); return;
  }
  let seller = edit ? edit.seller : (preset.seller || me);
  let date = edit ? edit.date : todayISO();
  let rows = [], uid = 0, step = 1, payMode = 'full';
  /* در ویرایش، کالای همین فروش را موقتاً به موجودی برمی‌گردانیم تا فرم موجودی درست نشان دهد (با بستن فرم برمی‌گردد) */
  const undo = [];
  if (edit) for (const l of S.saleLines.filter(x => x.sale_id === edit.id)) {
    const lot = S.LOT[l.lot_id], k = holdKey(l.holder), st = S.stock.find(x => x.id === l.item_id);
    if (lot) { lot[k] += l.qty; lot.rem += l.qty; undo.push(() => { lot[k] -= l.qty; lot.rem -= l.qty; }); }
    if (st) { st[k] += l.qty; st.rem += l.qty; undo.push(() => { st[k] -= l.qty; st.rem -= l.qty; }); }
  }
  const other = () => (seller === 'مهسا' ? 'رعنا' : 'مهسا');

  /* ================= منبع کالاها ================= */
  const stockOf = id => S.stock.find(x => x.id === id);
  const availOf = (id, who) => { const st = stockOf(id); return st ? (who === 'مهسا' ? st.rem_m : st.rem_r) : 0; };
  const itemOpts = () => S.stock.filter(i => i.active).sort((a, b) => ((b.rem_m + b.rem_r) > 0) - ((a.rem_m + a.rem_r) > 0) || a.name.localeCompare(b.name, 'fa'))
    .map(i => { const x = S.I[i.id] || {}, z = i.rem_m + i.rem_r < 1; return { v: i.id, label: i.name, sub: `${x.code || ''} · ${z ? 'تمام شده · ' : ''}م ${i.rem_m} · ر ${i.rem_r}`, keywords: `${x.code || ''} ${i.category || ''} ${x.description || ''}` }; });
  /* فی پیشنهادی (فقط راهنما، به‌صورت متن کمرنگ): بهای تمام‌شده‌ی قدیمی‌ترین پارت + درصد سود دسته */
  function suggestPrice(id) {
    const l = S.lots.filter(x => x.item_id === id && !x.voided && (x.rem_m + x.rem_r) > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))[0];
    return l ? roundK(l.landed_unit * (1 + markupOf(id) / 100)) : 0;
  }
  function priceHint(pc, id) { const inp = pc.querySelector('input'), p = id ? suggestPrice(id) : 0; inp.placeholder = p ? fmt(p) : '—'; inp.title = p ? 'فی پیشنهادی (بهای تمام‌شده + سود دسته)؛ فقط راهنما است، فی را خودت بنویس' : ''; inp.classList.toggle('lastp', !!p); }

  /* ================= ردیف‌ها ================= */
  const body1 = h('div', { class: 'pg-rows' });
  const newRow = () => ({ id: ++uid, item: 0, qty: 0, price: 0, m: 0, r: 0, manual: false, note: '', cost: 0, cm: 0, cr: 0, short: 0, ui: null });
  const isBlank = r => !r.item && !r.price;
  const isPartial = r => (!!r.item) !== (r.price > 0);
  const mineOf = r => (seller === 'مهسا' ? r.m : r.r);

  function allocate(r) {    // پیش‌فرض: اول از موجودی فروشنده، باقی از نفر دیگر
    if (!r.item) { r.m = 0; r.r = 0; return; }
    const mine = Math.min(r.qty, availOf(r.item, seller)), rest = r.qty - mine;
    if (seller === 'مهسا') { r.m = mine; r.r = rest; } else { r.r = mine; r.m = rest; }
  }
  function sync(r) { const u = r.ui; u.mi.value = r.qty ? String(r.m) : ''; u.ri.value = r.qty ? String(r.r) : ''; }
  function setQty(r, n) { r.qty = n; if (!r.manual) allocate(r); else { r.m = Math.min(r.m, n); r.r = n - r.m; } sync(r); }
  function addRow(init = {}) { const r = Object.assign(newRow(), init); rows.push(r); body1.append(mkRow(r)); return r; }
  function ensureTail() { if (!rows.length || !isBlank(rows[rows.length - 1])) addRow(); }
  function pickItem(r, id) { r.item = id || 0; r.manual = false; r.ui.nameC.set(id || null); priceHint(r.ui.pc, id); allocate(r); sync(r); }

  function mkRow(r) {
    const num = (val, cb, lab) => { const e = h('input', { class: 'inp qi', type: 'text', inputmode: 'numeric', dir: 'ltr', value: val ? String(val) : '', placeholder: '—', 'aria-label': lab }); e.addEventListener('input', () => cb(Math.max(0, parseNum(e.value)))); e.addEventListener('focus', () => setTimeout(() => e.select(), 0)); return e; };
    const qi = num(r.qty, n => { setQty(r, n); paint(); }, 'تعداد');
    const mi = num(r.m, n => { r.m = Math.min(n, r.qty); r.r = r.qty - r.m; r.manual = true; ri.value = String(r.r); paint(); }, 'برداشت از موجودی مهسا');
    const ri = num(r.r, n => { r.r = Math.min(n, r.qty); r.m = r.qty - r.r; r.manual = true; mi.value = String(r.m); paint(); }, 'برداشت از موجودی رعنا');
    const nameC = combo({ placeholder: 'نام یا کد کالا را بنویس تا لیست بیاید…', options: itemOpts(), emptyText: 'کالایی با این نام نیست؛ از دکمهٔ «＋ کالای جدید» بالای جدول بساز',
      onChange: id => { r.item = id; r.manual = false; priceHint(pc, id); allocate(r); sync(r); paint(); } });
    const pc = numField({ unit: '', value: r.price || '', placeholder: '—', onInput: n => { r.price = n; if (n > 0 && rows[rows.length - 1] === r) addRow(); paint(); } });
    const noteI = h('input', { class: 'inp pg-note', type: 'text', placeholder: 'توضیحات', 'aria-label': 'توضیحات ردیف', value: r.note || '' });
    noteI.addEventListener('input', () => { r.note = noteI.value; });
    const idx = h('span', { class: 'rn' }), codeEl = h('div', { class: 'pg-code' }, 'کد خودکار'), vr = h('div', { class: 'pg-vr' });
    const totEl = h('b', { class: 'tot' }), pfEl = h('div', { class: 'sg-pf' }), msg = h('div', { class: 'pg-msg', hidden: true });
    const rm = h('button', { class: 'rm', type: 'button', 'aria-label': 'حذف این ردیف', onclick: () => { rows.splice(rows.indexOf(r), 1); r.el.remove(); ensureTail(); paint(); } }, '✕');
    const cell = (cls, lab, ...k) => h('div', { class: 'pgc ' + cls }, h('em', null, lab), ...k);
    r.el = h('div', { class: 'pgrow sgr' }, cell('c-ix', '', idx), cell('c-code', 'کد', codeEl), cell('c-name', 'نام کالا', nameC, vr), cell('c-qty', 'تعداد', qi), cell('c-fee', 'فی فروش (ریال)', pc),
      cell('c-tot', 'جمع (ریال)', totEl), cell('c-dl', 'برداشت از مهسا · رعنا', h('div', { class: 'pg-dl' }, h('label', null, h('small', null, 'مهسا'), mi), h('label', null, h('small', null, 'رعنا'), ri), h('span', { class: 'pg-dls' }))),
      cell('c-pf', 'سود ردیف', pfEl), cell('c-note', 'توضیحات', noteI), cell('c-rm', '', rm), msg);
    r.ui = { idx, codeEl, vr, totEl, pfEl, msg, mi, ri, qi, nameC, pc, noteI, dls: r.el.querySelector('.pg-dls') };
    return r.el;
  }

  /* ================= هزینه‌ی FIFO و تحلیل ردیف‌ها ================= */
  function evalRows() {
    const used = new Map();
    for (const r of rows) {
      r.cm = r.cr = r.cost = 0; r.short = 0;
      if (!r.item || !(r.price > 0) || !(r.qty > 0)) continue;
      for (const [who, q] of [['مهسا', r.m], ['رعنا', r.r]]) {
        if (!(q > 0)) continue;
        const f = simUsed(r.item, who, q, used); r.short += f.short;
        for (const p of f.parts) used.set(p.lot.id + holdKey(who), (used.get(p.lot.id + holdKey(who)) || 0) + p.qty);
        if (who === 'مهسا') r.cm = f.cost; else r.cr = f.cost;
      }
      r.cost = r.cm + r.cr;
    }
  }
  const stats = { rows: h('b', null, '0'), qty: h('b', null, '0'), total: h('b', { class: 'key' }, '0'), profit: h('b', { class: 'pos' }, '0'), mq: h('b', { class: 'neg' }, ''), mv: h('b', null, ''), rq: h('b', { class: 'neg' }, ''), rv: h('b', null, '') };
  const probs = h('div', { class: 'pg-probs', hidden: true });
  let probList = [];
  function analyse() {
    const groups = new Map();
    rows.forEach((r, i) => { if (r.item) (groups.get(r.item) || groups.set(r.item, []).get(r.item)).push(i); });
    const out = rows.map(() => []);
    rows.forEach((r, i) => {
      const n = i + 1;
      if (isBlank(r)) return;
      if (r.item && !(r.price > 0)) out[i].push({ lvl: 'warn', t: 'فی ندارد — فی فروش را بنویس، وگرنه با «ادامه» (پس از تأیید تو) حذف می‌شود' });
      else if (!r.item) out[i].push({ lvl: 'warn', t: 'کالا انتخاب نشده — از لیست انتخاب کن، وگرنه با «ادامه» (پس از تأیید تو) حذف می‌شود' });
      else {
        const it = S.I[r.item] || {};
        if (!(r.qty > 0)) out[i].push({ lvl: 'warn', t: 'تعداد را پر کن', block: true, short: `ردیف ${fmt(n)}: تعداد را پر کن` });
        else if (r.m + r.r !== r.qty) out[i].push({ lvl: 'warn', t: `جمع برداشت مهسا و رعنا باید برابر تعداد (${fmt(r.qty)}) باشد`, block: true, short: `ردیف ${fmt(n)}: جمع برداشت با تعداد نمی‌خواند` });
        else {
          const am = availOf(r.item, 'مهسا'), ar = availOf(r.item, 'رعنا');
          if (am + ar < r.qty) out[i].push({ lvl: 'err', t: `موجودی کل «${it.name || ''}» ${fmt(am + ar)} عدد است (مهسا ${fmt(am)} · رعنا ${fmt(ar)}) و ${fmt(r.qty - am - ar)} عدد کم داری؛ تعداد را کم کن یا برای باقی‌مانده فاکتور جدا بزن`, block: true, short: `ردیف ${fmt(n)}: موجودی کافی نیست` });
          else if (r.m > am || r.r > ar) out[i].push({ lvl: 'err', t: r.m > am ? `موجودی مهسا ${fmt(am)} عدد است؛ ${fmt(r.m - am)} عدد را به ستون رعنا ببر` : `موجودی رعنا ${fmt(ar)} عدد است؛ ${fmt(r.r - ar)} عدد را به ستون مهسا ببر`, block: true, short: `ردیف ${fmt(n)}: موجودی ${r.m > am ? 'مهسا' : 'رعنا'} کم است` });
          else if (!r.manual && r.qty > 0 && mineOf(r) < r.qty) out[i].push({ lvl: 'note', t: `موجودی ${seller} ${fmt(availOf(r.item, seller))} عدد است؛ ${fmt(r.qty - mineOf(r))} عدد باقی‌مانده از موجودی ${other()} برداشته می‌شود` });
        }
        const g = groups.get(r.item);
        if (g && g.length > 1) out[i].push({ lvl: 'err', t: `تکراری: «${it.name || ''}»${it.code ? ' (' + it.code + ')' : ''} در ردیف ${g.filter(x => x !== i).map(x => fmt(x + 1)).join(' و ')} هم آمده؛ تعدادها را در یک ردیف جمع کن یا کالای دیگری بگذار`, block: true, short: `ردیف ${fmt(n)}: تکراری است` });
      }
    });
    return out;
  }
  function paint() {
    evalRows();
    const an = analyse(); probList = [];
    const okRows = rows.filter(r => r.item && r.price > 0 && r.qty > 0);
    rows.forEach((r, i) => {
      const u = r.ui, st = an[i], blank = isBlank(r), it = r.item ? S.I[r.item] : null, sk = r.item ? stockOf(r.item) : null;
      u.idx.textContent = String(i + 1); u.idx.classList.toggle('dim', blank);
      u.codeEl.textContent = it ? (it.code || '—') : 'کد خودکار'; u.codeEl.classList.toggle('ph', !it);
      u.vr.replaceChildren(...(it ? [it.color ? h('span', { class: 'pg-v' }, h('i', { class: 'pg-dot', style: { background: COLOR_HEX[it.color] || '#C9B5BE' } }), it.color) : null, it.size ? h('span', { class: 'pg-sz' }, it.size) : null, sk ? h('span', { class: 'pg-stk' }, `موجودی: م ${fmt(sk.rem_m)} · ر ${fmt(sk.rem_r)}`) : null, it.description ? h('span', { class: 'pg-desc', title: it.description }, '📝 ' + it.description) : null].filter(Boolean) : []));
      const has = r.price > 0 && r.qty > 0 && r.item, tot = has ? r.qty * r.price : 0;
      u.totEl.textContent = has ? fmt(tot) : '—';
      if (has && !r.short) { const pf = tot - r.cost; u.pfEl.className = 'sg-pf' + (pf < 0 ? ' neg' : ''); u.pfEl.replaceChildren(h('b', null, (pf < 0 ? '' : '+') + fmt(pf)), h('small', null, 'بها ' + fmt(Math.round(r.cost / r.qty)))); } else { u.pfEl.className = 'sg-pf'; u.pfEl.replaceChildren(h('b', null, '—')); }
      r.el.classList.toggle('blank', blank);
      const hasErr = st.some(x => x.lvl === 'err'), hasWarn = st.some(x => x.lvl === 'warn');
      r.el.classList.toggle('err', hasErr); r.el.classList.toggle('warn', hasWarn && !hasErr);
      u.msg.hidden = !st.length; u.msg.replaceChildren(...st.map(x => h('div', { class: x.lvl }, (x.lvl === 'note' ? '⚠ ' : '⚠ ') + x.t)));
      u.mi.classList.toggle('amb', !r.manual && r.qty > 0 && !!r.item && mineOf(r) < r.qty); u.ri.classList.toggle('amb', !r.manual && r.qty > 0 && !!r.item && mineOf(r) < r.qty);
      u.dls.textContent = r.qty > 0 && r.item && r.m + r.r === r.qty ? '✓' : '';
      st.filter(x => x.block).forEach(x => probList.push(x.short));
    });
    const gross = sum(okRows, r => r.qty * r.price), cost = sum(okRows, r => r.cost);
    stats.rows.textContent = fmt(okRows.length); stats.qty.textContent = fmt(sum(okRows, r => r.qty)); stats.total.textContent = fmt(gross);
    stats.profit.textContent = (gross - cost < 0 ? '' : '+') + fmt(gross - cost);
    stats.mq.textContent = '−' + fmt(sum(okRows, r => r.m)) + ' عدد'; stats.mv.textContent = 'بها ' + fmt(Math.round(sum(okRows, r => r.cm))) + ' ریال';
    stats.rq.textContent = '−' + fmt(sum(okRows, r => r.r)) + ' عدد'; stats.rv.textContent = 'بها ' + fmt(Math.round(sum(okRows, r => r.cr))) + ' ریال';
    const partials = rows.map((r, i) => (isPartial(r) ? i + 1 : 0)).filter(Boolean);
    const msgs = [...probList, ...partials.map(n => `ردیف ${fmt(n)}: ناقص است (کالا یا فی ندارد)`)];
    probs.hidden = !msgs.length; probs.replaceChildren(...msgs.map(t => h('span', null, '⚠ ' + t)));
    nextBtn.classList.toggle('off', probList.length > 0);
    if (step === 2) recalc();
  }

  /* ================= سربرگ مرحلهٔ ۱ ================= */
  const sellerChips = chips([{ v: 'مهسا', label: 'مهسا' }, { v: 'رعنا', label: 'رعنا' }], seller, v => { seller = v; rows.forEach(r => { r.manual = false; allocate(r); if (r.ui) sync(r); }); defaultAccounts(); paint(); }, { cls: 'two', label: 'فروشنده' });
  const dateCtl = dateField(date, v => { date = v; due.refresh(); });
  const channel = chips(CHANNELS.map(c => ({ v: c, label: c })), edit ? edit.channel : pref('channel', CHANNELS[0]), () => {}, { label: 'کانال فروش' });
  const custOpts = () => customers().map(c => { const b = S.vCus.find(x => x.id === c.id); return { v: c.id, label: c.name, sub: (c.phone || '') + (b && b.outstanding > 0 ? ' · بدهکار ' + fmt(b.outstanding) : '') }; });
  const customer = combo({
    placeholder: 'نام خریدار (الزامی)', createLabel: 'مشتری جدید', options: custOpts(),
    onCreate: async name => { try { const r = await rpc('save_customer', { name }, { queue: false }); await loadAll(); customer.setOptions(custOpts()); customer.set(r.id); custInfoDraw(); toast('مشتری اضافه شد'); recalc(); return r.id; } catch (e) { toast(errText(e), 'err'); return null; } },
    onChange: () => { custInfoDraw(); recalc(); }
  });
  const custInfo = h('div', { class: 'inp ro bal' }, '—');
  function custInfoDraw() {
    const cid = customer.get(), cb = cid && S.vCus.find(x => x.id === cid);
    custInfo.textContent = !cid ? '—' : (cb && cb.outstanding > 0 ? `${fmt(cb.outstanding)} ریال بدهکار` + (cb.overdue_amount > 0 ? ` (${fmt(cb.overdue_amount)} سررسید گذشته!)` : '') : 'تسویه');
    custInfo.classList.toggle('debt', !!(cb && cb.outstanding > 0));
  }
  function newItem() {    // همان فرم کالا؛ بعد از بسته شدن، فهرست‌ها تازه می‌شوند
    const before = new Set(S.stock.map(i => i.id)), im = itemForm();
    if (!im || !im.el) return;
    const t = setInterval(() => {
      if (document.body.contains(im.el)) return; clearInterval(t);
      setTimeout(() => {
        const opts = itemOpts(); rows.forEach(r => r.ui.nameC.setOptions(opts));
        const fresh = S.stock.filter(i => !before.has(i.id));
        if (fresh.length) toast(`${fmt(fresh.length)} کالای تازه ساخته شد؛ موجودی‌اش صفر است و بعد از ثبت خرید قابل فروش می‌شود`);
        paint();
      }, 1200);
    }, 300);
  }
  const topHead = h('div', { class: 'sg-head' },
    field('فروشنده', sellerChips), field('تاریخ', dateCtl), field('کانال فروش', channel),
    h('div', { class: 'sg-cust' }, field('خریدار (الزامی) *', customer), field('مانده‌ی قبلی خریدار', custInfo)));
  const topBar = h('div', { class: 'pg-top' },
    h('div', null, h('b', null, 'اقلام فاکتور'), h('div', { class: 'hint' }, 'کالا را با نام یا کد جستجو کن؛ کد، رنگ، سایز و موجودی همان کالا خودکار می‌آید · «برداشت از» پیش‌فرض از موجودی فروشنده است و اگر کم بود، باقی خودکار از نفر دیگر می‌آید (هر عددی را می‌توانی دستی بنویسی) · سود هر ردیف با بهای تمام‌شده (FIFO) حساب می‌شود · عدد کمرنگ داخل «فی» فقط فی پیشنهادی است')),
    h('div', { class: 'pg-tb' },
      h('button', { class: 'btn gold', type: 'button', onclick: newItem }, '＋ کالای جدید'),
      h('button', { class: 'btn ghost dashed2', type: 'button', onclick: () => { addRow(); paint(); } }, '＋ افزودن ردیف دستی')));
  const head1 = h('div', { class: 'pg-head sgh' }, ...['ردیف', 'کد کالا', 'نام کالا (جستجو) · رنگ · سایز', 'تعداد', 'فی فروش (ریال)', 'جمع (ریال)', 'برداشت از (جمع = تعداد)', 'سود ردیف', 'توضیحات', ''].map(x => h('span', null, x)));
  const step1 = h('div', { class: 'pg1' }, topHead, topBar, h('div', { class: 'pg-tbl' }, head1, body1, h('div', { class: 'pg-foot' }, h('span', null, 'تعداد یا فی خالی/صفر → هشدار «پر کن» · ردیف خالی آخر با «ادامه» خودکار حذف می‌شود'))), probs);

  /* ================= مرحلهٔ ۲ · تسویه و هزینه ================= */
  const due = dueField(() => date, { label: 'تاریخ سررسید مانده' });
  const payChips = chips([{ v: 'full', label: 'تسویه‌ی کامل (نقدی)' }, { v: 'part', label: 'تسویه‌ی جزئی (نسیه)' }], 'full', v => { payMode = v; partBox.hidden = v === 'full'; recalc(); }, { cls: 'two', label: 'نحوه‌ی تسویه' });
  const received = numField({ onInput: () => recalc() });
  const remainEl = h('div', { class: 'hint' });
  const partBox = h('div', { hidden: true }, field('مبلغ دریافتی (ریال)', received, null), remainEl, due);
  const recvAcc = accountPicker(businessAccounts(), null, () => {}, { pockets: false, balances: accBalance });
  const discount = numField({ onInput: () => recalc() });
  const courier = numField({ onInput: () => recalc() }), pack = numField({ onInput: () => recalc() });
  const costAcc = accountPicker(S.accounts, null, () => {}, { pockets: true });
  const costAccBox = h('div', { hidden: true }, field('پرداخت هزینه از', costAcc));
  const note = h('input', { class: 'inp', type: 'text', placeholder: 'توضیحات (اختیاری)', 'aria-label': 'توضیحات فاکتور' });
  function defaultAccounts() {
    const bank = accOf('حساب ' + seller), cash = accOf('نقد ' + seller);
    const pr = pref('recvAcc_' + seller, null); recvAcc.set(pr && S.A[pr] ? pr : (bank ? bank.id : null));
    const pc = pref('costAcc_' + seller, null); costAcc.set(pc && S.A[pc] ? pc : (cash ? cash.id : null));
  }
  const S2 = { who: h('div', { class: 'sm-who' }, ''), cnt: h('span', null, ''), gross: h('b', { class: 'n' }, '0'), disc: h('b', { class: 'n' }, '0'), total: h('b', { class: 'n' }, '0'), recv: h('b', { class: 'n' }, '0'), left: h('b', { class: 'n' }, '0'), gp: h('b', { class: 'n' }, '0'), exp: h('b', { class: 'n' }, '0'), profit: h('b', { class: 'n' }, '0'), mq: h('span', null, ''), rq: h('span', null, '') };
  const itemsList = h('div', { class: 'pg-il' });
  const done = () => rows.filter(r => r.item && r.price > 0 && r.qty > 0);
  function totals() {
    const ds = done(), gross = sum(ds, r => r.qty * r.price), cost = sum(ds, r => r.cost);
    const disc = Math.min(discount.get(), gross), total = gross - disc, c = courier.get() + pack.get();
    const recv = payMode === 'full' ? total : Math.min(received.get(), total);
    return { gross, disc, total, cost, c, recv, profit: total - cost - c };
  }
  function recalc() {
    if (step !== 2) return;
    const t = totals(), ds = done();
    S2.who.textContent = `${customer.input.value || '—'} · ${channel.get()} · فروشنده ${seller}`;
    S2.cnt.textContent = `جمع کالاها (${fmt(ds.length)} ردیف · ${fmt(sum(ds, r => r.qty))} عدد)`;
    S2.gross.textContent = fmt(t.gross); S2.disc.textContent = '−' + fmt(t.disc); S2.total.textContent = fmt(t.total); S2.recv.textContent = fmt(t.recv); S2.left.textContent = fmt(Math.max(0, t.total - t.recv));
    S2.gp.textContent = fmt(t.total - t.cost); S2.exp.textContent = '−' + fmt(t.c); S2.profit.textContent = fmt(t.profit); S2.profit.className = 'n ' + (t.profit < 0 ? 'neg' : 'pos');
    S2.mq.textContent = `−${fmt(sum(ds, r => r.m))} عدد · بها ${fmt(Math.round(sum(ds, r => r.cm)))} ریال`; S2.rq.textContent = `−${fmt(sum(ds, r => r.r))} عدد · بها ${fmt(Math.round(sum(ds, r => r.cr)))} ریال`;
    remainEl.textContent = payMode === 'part' ? `مانده‌ی فاکتور به حساب بدهکاری مشتری منتقل می‌شود: ${fmt(Math.max(0, t.total - t.recv))} ریال` : '';
    costAccBox.hidden = t.c <= 0;
  }
  function drawItemsList() {
    itemsList.replaceChildren(...done().map((r, i) => { const it = S.I[r.item] || {}; return h('div', { class: 'sr' }, h('div', { class: 'srl' }, h('span', null, `${fmt(i + 1)} · ${it.code || ''} · ${it.name || ''}`), h('b', null, `${fmt(r.qty)} × ${fmt(r.price)}`)), r.note && r.note.trim() ? h('div', { class: 'pg-nt' }, 'توضیح: ' + r.note.trim()) : null); }));
  }
  function zone(n, title, sub, ...kids) { return h('section', { class: 'z2' }, h('div', { class: 'zt' }, n ? h('i', null, n) : null, h('span', null, title), sub ? h('small', null, sub) : null), h('div', { class: 'zx' }, ...kids)); }
  const step2 = h('div', { class: 'pg2', hidden: true },
    h('div', { class: 'pg2l' },
      zone('۱', 'تسویه با خریدار', 'دریافت وجه از مشتری', payChips, partBox, field('دریافت وجه در (تنخواه / حساب بانکی)', recvAcc)),
      zone('۲', 'تخفیف و هزینه‌های جانبی', 'اختیاری', field('تخفیف فروش (ریال)', discount, 'از جمع ردیف‌ها کم می‌شود و روی طلب، دریافتی و سود اثر می‌گذارد.'),
        h('div', { class: 'two-col' }, field('هزینه‌ی ارسال (پیک)', courier), field('هزینه‌ی بسته‌بندی', pack)), h('div', { class: 'hint' }, 'اگر مشتری کرایه‌ی ارسال را مستقیم می‌پردازد، خالی بگذار.'), costAccBox),
      zone('۳', 'توضیحات فاکتور', null, note)),
    h('div', { class: 'pg2r' },
      h('section', { class: 'z2 dk' }, h('div', { class: 'zt dark' }, h('span', null, 'خلاصهٔ فاکتور')), h('div', { class: 'zx' }, S2.who,
        h('div', { class: 'sr' }, S2.cnt, S2.gross), h('div', { class: 'sr' }, h('span', null, 'تخفیف'), S2.disc), h('div', { class: 'sr' }, h('span', null, 'مبلغ فاکتور'), S2.total),
        h('div', { class: 'sr' }, h('span', null, 'دریافتی'), S2.recv), h('div', { class: 'sr' }, h('span', null, 'مانده (نسیه)'), S2.left),
        h('div', { class: 'sr' }, h('span', null, 'سود ناخالص'), S2.gp), h('div', { class: 'sr' }, h('span', null, 'هزینه (پیک + بسته‌بندی)'), S2.exp), h('div', { class: 'sr' }, h('span', null, 'سود این فاکتور'), S2.profit))),
      zone('', 'اثر روی موجودی (پس از ثبت)', null, h('div', { class: 'sr' }, h('span', null, 'مهسا'), S2.mq), h('div', { class: 'sr' }, h('span', null, 'رعنا'), S2.rq), h('div', { class: 'hint' }, 'بها با روش FIFO (قدیمی‌ترین پارت اول) حساب شده است.')),
      zone('', 'اقلام در فاکتور', null, itemsList)));

  /* ================= پیمایش ================= */
  const nextBtn = h('button', { class: 'btn primary lg', type: 'button', 'data-act': 'next' }, 'ادامه ← تسویه و هزینه‌ها');
  const backBtn = h('button', { class: 'btn ghost lg', type: 'button', 'data-act': 'back' }, '→ بازگشت به کالاها');
  const submit = h('button', { class: 'btn primary lg', type: 'button', 'data-act': 'submit' }, edit ? 'ذخیره‌ی ویرایش فاکتور' : 'ثبت فاکتور فروش');
  function setStep(n) {
    step = n; step1.hidden = n !== 1; step2.hidden = n !== 2; bar1.hidden = n !== 1; bar2.hidden = n !== 2;
    chip1.className = 'pg-chip' + (n === 1 ? ' on' : ' dn'); chip2.className = 'pg-chip' + (n === 2 ? ' on' : '');
    chip1.textContent = n === 2 ? '۱ · خریدار و کالاها ✓' : '۱ · خریدار و کالاها';
    if (n === 2) { drawItemsList(); recalc(); } else paint();
    const sb = m.el && m.el.querySelector('.sheet-b'); if (sb) sb.scrollTop = 0;
  }
  function confirmPartials(list) {
    return new Promise(res => {
      let fin = false; const end = v => { if (fin) return; fin = true; mm.close(); res(v); };
      const items = list.map(r => { const it = S.I[r.item]; return h('div', null, h('b', null, 'ردیف ' + fmt(rows.indexOf(r) + 1)), ' · ', it ? `${it.name}${r.qty ? ' · ' + fmt(r.qty) + ' عدد' : ''} — ` : `فقط فی ${fmt(r.price)} — `, h('span', { class: 'amb' }, it ? 'فی ندارد' : 'کالا انتخاب نشده')); });
      const mm = modal({ title: 'ردیف‌های ناقص', body: h('div', { class: 'form' }, h('div', null, 'این ردیف‌ها ناقص‌اند و اگر ادامه بدهی ', h('b', { class: 'neg' }, 'حذف می‌شوند'), ':'), h('div', { class: 'pg-plist' }, ...items), h('div', { class: 'hint' }, 'ردیف خالیِ آخر بدون پرسش حذف می‌شود.')),
        footer: [h('button', { class: 'btn primary lg', type: 'button', onclick: () => end(true) }, 'بله، حذف کن و برو مرحلهٔ تسویه'), h('button', { class: 'btn ghost lg', type: 'button', onclick: () => end(false) }, 'برگرد و تکمیل می‌کنم')], onClose: () => { if (!fin) { fin = true; res(false); } } });
    });
  }
  nextBtn.onclick = async () => {
    paint();
    if (probList.length) { toast(probList[0] + (probList.length > 1 ? ` (و ${fmt(probList.length - 1)} مورد دیگر)` : ''), 'err'); return; }
    if (!customer.get()) { customer.input.focus(); return toast('نام خریدار را انتخاب کن یا بساز؛ هر فاکتور فروش باید خریدار داشته باشد', 'err'); }
    const partials = rows.filter(isPartial);
    if (partials.length && !(await confirmPartials(partials))) return;
    rows.filter(r => isBlank(r) || isPartial(r)).forEach(r => r.el.remove()); rows = rows.filter(r => !isBlank(r) && !isPartial(r));
    if (!rows.length) { ensureTail(); paint(); return toast('حداقل یک کالا با فی لازم است', 'err'); }
    ensureTail(); setStep(2);
  };
  backBtn.onclick = () => setStep(1);

  /* ================= ثبت ================= */
  submit.onclick = async () => {
    const ds = done(); if (!ds.length) return toast('حداقل یک کالا به فاکتور اضافه کن', 'err');
    paint(); if (probList.length) return toast(probList[0], 'err');
    if (!customer.get()) { customer.input.focus(); return toast('نام خریدار را انتخاب کن یا بساز؛ هر فاکتور فروش باید خریدار داشته باشد', 'err'); }
    const t = totals();
    if (discount.get() > t.gross) return toast('تخفیف نمی‌تواند از جمع ردیف‌ها بیشتر باشد', 'err');
    if (t.recv > 0 && !recvAcc.get()) return toast('حسابی که پول به آن آمد را انتخاب کن', 'err');
    if (t.c > 0 && !costAcc.get()) return toast('حساب پرداخت هزینه را انتخاب کن', 'err');
    const lines = [];
    ds.forEach(r => { const nt = (r.note || '').trim(); if (r.m > 0) lines.push({ item_id: r.item, qty: r.m, unit_price: r.price, holder: 'مهسا', note: nt }); if (r.r > 0) lines.push({ item_id: r.item, qty: r.r, unit_price: r.price, holder: 'رعنا', note: nt }); });
    const payload = { date, seller, channel: channel.get(), customer_id: customer.get(), discount: t.disc, due_date: t.recv < t.total ? due.get() : null, received: t.recv, account_id: t.recv > 0 ? recvAcc.get() : null,
      courier: courier.get(), pack: pack.get(), cost_account_id: t.c > 0 ? costAcc.get() : null, note: note.value.trim(), lines };
    const r0 = await run(submit, () => rpc(edit ? 'edit_sale' : 'create_sale', edit ? { ...payload, id: edit.id } : payload));
    if (!r0) return;
    setPref('channel', payload.channel); if (payload.account_id) setPref('recvAcc_' + seller, payload.account_id); if (payload.cost_account_id) setPref('costAcc_' + seller, payload.cost_account_id);
    toast(`فروش ${r0.no} ${edit ? 'ویرایش شد' : 'ثبت شد'}`); m.close(); await bus.refresh();
  };

  /* ================= پوستهٔ مودال ================= */
  const chip1 = h('span', { class: 'pg-chip on' }, '۱ · خریدار و کالاها'), chip2 = h('span', { class: 'pg-chip' }, '۲ · تسویه و هزینه‌ها');
  const bar1 = h('div', { class: 'pgf' },
    h('div', { class: 'pgf-s sg' }, h('div', null, h('small', null, 'ردیف'), stats.rows), h('div', null, h('small', null, 'جمع تعداد'), stats.qty), h('div', null, h('small', null, 'جمع کالا (ریال)'), stats.total), h('div', null, h('small', null, 'سود ناخالص'), stats.profit),
      h('div', { class: 'pc' }, h('small', null, 'از موجودی مهسا کم می‌شود'), h('span', null, stats.mq, ' · ', stats.mv)), h('div', { class: 'pc' }, h('small', null, 'از موجودی رعنا کم می‌شود'), h('span', null, stats.rq, ' · ', stats.rv))), nextBtn);
  const bar2 = h('div', { class: 'pgf', hidden: true }, backBtn, submit);
  const m = modal({ title: edit ? `ویرایش فروش ${edit.no}` : 'فاکتور فروش جدید', wide: true, onClose: () => undo.forEach(f => f()),
    body: h('div', { class: 'form pgx' }, h('div', { class: 'pg-steps' }, chip1, h('span', { class: 'ar' }, '←'), chip2), step1, step2), footer: [bar1, bar2] });
  const sh0 = m.el.querySelector && m.el.querySelector('.sheet'); if (sh0) sh0.classList.add('xwide');

  /* ================= شروع ================= */
  defaultAccounts();
  if (!edit) {
    addRow();
    if (preset.item && S.I[preset.item]) { const r = rows[0]; pickItem(r, preset.item); }
    if (preset.customer) customer.set(preset.customer);
    ensureTail(); custInfoDraw(); paint();
  } else {   // پیش‌پر کردن فرم؛ ردیف‌های هر کالا (پارت‌های مختلف و دو نگه‌دارنده) در یک ردیف جمع می‌شوند
    const by = new Map();
    for (const l of S.saleLines.filter(x => x.sale_id === edit.id)) {
      let r = by.get(l.item_id); if (!r) { r = { item: l.item_id, qty: 0, price: l.unit_price, m: 0, r: 0, manual: true, note: l.note || '' }; by.set(l.item_id, r); }
      r.qty += l.qty; if (l.holder === 'مهسا') r.m += l.qty; else r.r += l.qty; if (!r.note && l.note) r.note = l.note;
    }
    for (const d of by.values()) {
      const r = addRow(d); r.ui.nameC.set(r.item); r.ui.qi.value = String(r.qty); r.ui.mi.value = String(r.m); r.ui.ri.value = String(r.r); r.ui.pc.set(r.price); r.ui.noteI.value = r.note; priceHint(r.ui.pc, r.item);
    }
    if (edit.customer_id) customer.set(edit.customer_id);
    discount.set(edit.discount || '');
    if (edit.received < edit.total) { payMode = 'part'; payChips.set('part'); partBox.hidden = false; received.set(edit.received); }
    if (edit.due_date) due.setDate(edit.due_date);
    if (edit.account_id) recvAcc.set(edit.account_id);
    courier.set(edit.courier || ''); pack.set(edit.pack || ''); if (edit.cost_account_id) costAcc.set(edit.cost_account_id);
    note.value = edit.note || ''; ensureTail(); custInfoDraw(); paint();
  }
  return m;
}
