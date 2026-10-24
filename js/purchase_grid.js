// فاکتور خرید جدولی (۷.۲۰): مرحلهٔ ۱ = جدول کالاها (مثل نرم‌افزار حسابداری)، مرحلهٔ ۲ = مالی (تامین‌کننده، حمل، پرداخت)
// هر ردیف = یک «کد کالا» (نام + رنگ + سایز همان کد است)؛ فاکتور خودش کالا نمی‌سازد، کالای تازه فقط با «＋ کالای جدید».
import { h, fmt, parseNum, todayISO, toast, sum } from './util.js';
import { S, rpc, loadAll, bus, accBalance, errText, canEdit } from './store.js';
import { modal, field, chips, accountPicker, numField, dateField, dueField, combo, run } from './ui.js';
import { itemForm } from './forms_misc.js';
import { adviceFor, adviceText } from './advisor.js';

const ceilHalf = n => Math.ceil(n / 2);
const COLOR_HEX = { 'مشکی': '#111111', 'سفید': '#FFFFFF', 'کرم': '#F3E3D3', 'بژ': '#D8BFA0', 'صورتی': '#E3A9BC', 'زرشکی': '#8E1B3A', 'قرمز': '#C62828', 'طوسی': '#9E9E9E', 'سرمه‌ای': '#1F2A5A', 'آبی': '#2F6FB5', 'سبز': '#3C7A4E', 'یاسی': '#B79AD6', 'نباتی': '#C2185B', 'قهوه‌ای': '#6D4C41' };

export function purchaseForm(preset = {}) {
  const edit = preset.edit ? S.INV[preset.edit] : null;
  if (edit && !canEdit()) { toast('ویرایش فقط برای حمیدرضا، مهسا و رعنا باز است', 'err'); return; }
  let date = edit ? edit.date : todayISO();
  let rows = [], uid = 0, step = 1;
  const pays = [];

  /* ================= منبع کالاها ================= */
  const stockOf = id => S.stock.find(x => x.id === id);
  const itemOpts = () => S.stock.filter(i => i.active).sort((a, b) => a.name.localeCompare(b.name, 'fa')).map(i => { const x = S.I[i.id] || {}; return { v: i.id, label: i.name, sub: `${x.code || ''} · م ${i.rem_m} · ر ${i.rem_r}`, keywords: `${x.code || ''} ${i.category || ''} ${x.description || ''}` }; });
  const lastPrice = id => { const ls = S.lines.filter(l => l.item_id === id && S.INV[l.invoice_id] && !S.INV[l.invoice_id].voided).sort((a, b) => (S.INV[b.invoice_id].date < S.INV[a.invoice_id].date ? -1 : S.INV[b.invoice_id].date > S.INV[a.invoice_id].date ? 1 : b.id - a.id)); return ls.length ? ls[0].unit_price : 0; };

  /* ================= ردیف‌ها ================= */
  const body1 = h('div', { class: 'pg-rows' });
  const newRow = () => ({ id: ++uid, item: 0, qty: 0, price: 0, m: 0, r: 0, manual: false, note: '', ui: null });
  const isBlank = r => !r.item && !r.price;
  const isPartial = r => (!!r.item) !== (r.price > 0);

  function setQty(r, n) {
    r.qty = n;
    if (!r.manual) { r.m = ceilHalf(n); r.r = n - r.m; } else { r.m = Math.min(r.m, n); r.r = n - r.m; }
    r.ui.mi.value = r.m ? String(r.m) : (n ? '0' : ''); r.ui.ri.value = r.r ? String(r.r) : (n ? '0' : '');
  }
  function addRow(init = {}) { const r = Object.assign(newRow(), init); rows.push(r); body1.append(mkRow(r)); return r; }
  function ensureTail() { if (!rows.length || !isBlank(rows[rows.length - 1])) addRow(); }
  /* آخرین قیمت خرید فقط به‌صورت متن کمرنگ (placeholder) نشان داده می‌شود؛ مقدار فیلد نیست و کاربر باید خودش فی را بنویسد */
  function priceHint(pc, id) { const inp = pc.querySelector('input'), lp = id ? lastPrice(id) : 0; inp.placeholder = lp ? fmt(lp) : '—'; inp.title = lp ? 'آخرین قیمت خرید این کالا (فقط راهنما؛ فی را خودت بنویس)' : ''; inp.classList.toggle('lastp', !!lp); }
  function pickItem(r, id) {
    r.item = id || 0; r.ui.nameC.set(id || null);
    priceHint(r.ui.pc, id);
  }
  function mkRow(r) {
    const num = (val, cb, lab) => { const e = h('input', { class: 'inp qi', type: 'text', inputmode: 'numeric', dir: 'ltr', value: val ? String(val) : '', placeholder: '—', 'aria-label': lab }); e.addEventListener('input', () => cb(Math.max(0, parseNum(e.value)))); e.addEventListener('focus', () => setTimeout(() => e.select(), 0)); return e; };
    const qi = num(r.qty, n => { setQty(r, n); paint(); }, 'تعداد');
    const mi = num(r.m, n => { r.m = Math.min(n, r.qty); r.r = r.qty - r.m; r.manual = true; ri.value = String(r.r); paint(); }, 'تحویل به مهسا');
    const ri = num(r.r, n => { r.r = Math.min(n, r.qty); r.m = r.qty - r.r; r.manual = true; mi.value = String(r.m); paint(); }, 'تحویل به رعنا');
    const nameC = combo({ placeholder: 'نام یا کد کالا را بنویس تا لیست بیاید…', options: itemOpts(), emptyText: 'کالایی با این نام نیست؛ از دکمهٔ «＋ کالای جدید» بالای جدول بساز',
      onChange: id => { r.item = id; priceHint(pc, id); paint(); } });
    const pc = numField({ unit: '', value: r.price || '', placeholder: '—', onInput: n => { r.price = n; if (n > 0 && rows[rows.length - 1] === r) addRow(); paint(); } });
    const noteI = h('input', { class: 'inp pg-note', type: 'text', placeholder: 'توضیحات', 'aria-label': 'توضیحات ردیف', value: r.note || '' });
    noteI.addEventListener('input', () => { r.note = noteI.value; });
    const idx = h('span', { class: 'rn' }), codeEl = h('div', { class: 'pg-code' }, 'کد خودکار'), vr = h('div', { class: 'pg-vr' });
    const totEl = h('b', { class: 'tot' }), msg = h('div', { class: 'pg-msg', hidden: true }), adv = h('div', { class: 'advbox', hidden: true });
    const rm = h('button', { class: 'rm', type: 'button', 'aria-label': 'حذف این ردیف', onclick: () => { rows.splice(rows.indexOf(r), 1); r.el.remove(); ensureTail(); paint(); } }, '✕');
    const cell = (cls, lab, ...k) => h('div', { class: 'pgc ' + cls }, h('em', null, lab), ...k);
    r.el = h('div', { class: 'pgrow' }, cell('c-ix', '', idx), cell('c-code', 'کد', codeEl), cell('c-name', 'نام کالا', nameC, vr), cell('c-qty', 'تعداد', qi), cell('c-fee', 'فی (ریال)', pc),
      cell('c-tot', 'جمع (ریال)', totEl), cell('c-dl', 'تحویل به مهسا · رعنا', h('div', { class: 'pg-dl' }, h('label', null, h('small', null, 'مهسا'), mi), h('label', null, h('small', null, 'رعنا'), ri), h('span', { class: 'pg-dls' }))),
      cell('c-note', 'توضیحات', noteI), cell('c-rm', '', rm), msg, adv);
    r.ui = { idx, codeEl, vr, totEl, msg, adv, mi, ri, qi, nameC, pc, noteI, dls: r.el.querySelector('.pg-dls') };
    return r.el;
  }

  /* ================= وضعیت و محاسبه ================= */
  const stats = { rows: h('b', null, '0'), qty: h('b', null, '0'), total: h('b', { class: 'key' }, '0'), mq: h('b', { class: 'pos' }, ''), mv: h('b', null, ''), rq: h('b', { class: 'pos' }, ''), rv: h('b', null, '') };
  const probs = h('div', { class: 'pg-probs', hidden: true });
  let probList = [];
  function analyse() {
    const groups = new Map();
    rows.forEach((r, i) => { if (r.item) (groups.get(r.item) || groups.set(r.item, []).get(r.item)).push(i); });
    const out = rows.map(() => []);
    rows.forEach((r, i) => {
      const n = i + 1;
      if (isBlank(r)) return;
      if (r.item && !(r.price > 0)) out[i].push({ lvl: 'warn', t: 'فی ندارد — فی را بنویس، وگرنه با «ادامه» (پس از تأیید تو) حذف می‌شود' });
      else if (!r.item) out[i].push({ lvl: 'warn', t: 'کالا انتخاب نشده — از لیست انتخاب کن، وگرنه با «ادامه» (پس از تأیید تو) حذف می‌شود' });
      else {
        if (!(r.qty > 0)) out[i].push({ lvl: 'warn', t: 'تعداد را پر کن', block: true, short: `ردیف ${fmt(n)}: تعداد را پر کن` });
        if (r.m + r.r !== r.qty) out[i].push({ lvl: 'warn', t: `جمع تحویل مهسا و رعنا باید برابر تعداد (${fmt(r.qty)}) باشد`, block: true, short: `ردیف ${fmt(n)}: جمع تحویل با تعداد نمی‌خواند` });
        const g = groups.get(r.item);
        if (g && g.length > 1) { const it = S.I[r.item] || {}; out[i].push({ lvl: 'err', t: `تکراری: «${it.name || ''}»${it.code ? ' (' + it.code + ')' : ''} در ردیف ${g.filter(x => x !== i).map(x => fmt(x + 1)).join(' و ')} هم آمده؛ تعدادها را در یک ردیف جمع کن یا کالای دیگری بگذار`, block: true, short: `ردیف ${fmt(n)}: تکراری است` }); }
      }
    });
    return out;
  }
  function paint() {
    const an = analyse(); probList = [];
    const okRows = rows.filter(r => r.item && r.price > 0);
    rows.forEach((r, i) => {
      const u = r.ui, st = an[i], blank = isBlank(r), it = r.item ? S.I[r.item] : null, sk = r.item ? stockOf(r.item) : null;
      u.idx.textContent = String(i + 1); u.idx.classList.toggle('dim', blank);
      u.codeEl.textContent = it ? (it.code || '—') : 'کد خودکار'; u.codeEl.classList.toggle('ph', !it);
      u.vr.replaceChildren(...(it ? [it.color ? h('span', { class: 'pg-v' }, h('i', { class: 'pg-dot', style: { background: COLOR_HEX[it.color] || '#C9B5BE' } }), it.color) : null, it.size ? h('span', { class: 'pg-sz' }, it.size) : null, sk ? h('span', { class: 'pg-stk' }, `موجودی: م ${fmt(sk.rem_m)} · ر ${fmt(sk.rem_r)}`) : null].filter(Boolean) : []));
      u.totEl.textContent = r.price > 0 && r.qty > 0 ? fmt(r.qty * r.price) : '—';
      r.el.classList.toggle('blank', blank);
      r.el.classList.toggle('err', st.some(x => x.lvl === 'err')); r.el.classList.toggle('warn', st.some(x => x.lvl === 'warn') && !st.some(x => x.lvl === 'err'));
      u.msg.hidden = !st.length; u.msg.replaceChildren(...st.map(x => h('div', { class: x.lvl }, '⚠ ' + x.t)));
      u.dls.textContent = r.qty > 0 && r.item && r.m + r.r === r.qty ? '✓' : '';
      const id = r.item;
      if (id) { if (r.advId !== id) { r.advId = id; adviceFor(id).then(o => { if (r.advId === id && o) { u.adv.textContent = adviceText(o); u.adv.className = 'advbox ' + o.verdict; u.adv.hidden = !['avoid', 'hold', 'buy', 'urgent'].includes(o.verdict); } }).catch(() => {}); } } else { r.advId = 0; u.adv.hidden = true; }
      st.filter(x => x.block).forEach(x => probList.push(x.short));
    });
    stats.rows.textContent = fmt(okRows.length); stats.qty.textContent = fmt(sum(okRows, r => r.qty)); stats.total.textContent = fmt(sum(okRows, r => r.qty * r.price));
    stats.mq.textContent = '+' + fmt(sum(okRows, r => r.m)) + ' عدد'; stats.mv.textContent = fmt(sum(okRows, r => r.m * r.price)) + ' ریال';
    stats.rq.textContent = '+' + fmt(sum(okRows, r => r.r)) + ' عدد'; stats.rv.textContent = fmt(sum(okRows, r => r.r * r.price)) + ' ریال';
    const partials = rows.map((r, i) => (isPartial(r) ? i + 1 : 0)).filter(Boolean);
    const msgs = [...probList, ...partials.map(n => `ردیف ${fmt(n)}: ناقص است (کالا یا فی ندارد)`)];
    probs.hidden = !msgs.length; probs.replaceChildren(...msgs.map(t => h('span', null, '⚠ ' + t)));
    nextBtn.classList.toggle('off', probList.length > 0);
    if (step === 2) recalc();
  }

  /* ================= دکمه‌های بالای جدول ================= */
  function newItem() {    // همان فرم کالا (چند رنگ × چند سایز با هم)؛ بعد از بسته شدن، فهرست‌ها تازه می‌شوند
    const before = new Set(S.stock.map(i => i.id)), im = itemForm();
    if (!im || !im.el) return;
    const t = setInterval(() => {
      if (document.body.contains(im.el)) return; clearInterval(t);
      setTimeout(finish, 1200);
    }, 300);
    const finish = () => {
      const opts = itemOpts(); rows.forEach(r => r.ui.nameC.setOptions(opts));
      const fresh = S.stock.filter(i => !before.has(i.id));
      if (fresh.length === 1) { const r = rows.find(isBlank) || addRow(); pickItem(r, fresh[0].id); ensureTail(); toast('کالا ساخته شد؛ تعداد و فی را بنویس'); }
      else if (fresh.length > 1) toast(`${fmt(fresh.length)} کالا ساخته شد؛ در جستجوی ردیف‌ها پیدا می‌شوند`);
      paint();
    };
  }
  const topBar = h('div', { class: 'pg-top' },
    h('div', null, h('b', null, 'اقلام فاکتور'), h('div', { class: 'hint' }, 'نام کالا را بنویس و از لیست انتخاب کن؛ کد، رنگ و سایز همان کالا خودکار می‌آید · با پر شدن «فی» ردیف آخر، ردیف تازه ساخته می‌شود · تحویل را هر عددی می‌توانی دستی بنویسی · توضیحات بدون محدودیت طول است و در فاکتور کامل نمایش داده می‌شود')),
    h('div', { class: 'pg-tb' },
      h('button', { class: 'btn gold', type: 'button', onclick: newItem }, '＋ کالای جدید'),
      h('button', { class: 'btn ghost dashed2', type: 'button', onclick: () => { addRow(); paint(); } }, '＋ افزودن ردیف دستی')));
  const head1 = h('div', { class: 'pg-head' }, ...['ردیف', 'کد کالا', 'نام کالا (جستجو) · رنگ · سایز', 'تعداد', 'فی (ریال)', 'جمع (ریال)', 'تحویل به (جمع = تعداد)', 'توضیحات', ''].map(x => h('span', null, x)));
  const halfAll = h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { rows.forEach(r => { if (r.item) { r.manual = false; setQty(r, r.qty); } }); paint(); } }, 'نصف / نصف برای همهٔ ردیف‌ها');
  const step1 = h('div', { class: 'pg1' }, topBar, h('div', { class: 'pg-tbl' }, head1, body1, h('div', { class: 'pg-foot' }, h('span', null, 'تعداد یا فی خالی/صفر → هشدار «پر کن» · ردیف خالی آخر با «ادامه» خودکار حذف می‌شود'), halfAll)), probs);

  /* ================= مرحلهٔ ۲ · مالی ================= */
  const dateCtl = dateField(date, v => { date = v; due.refresh(); });
  const supOpts = () => S.suppliers.filter(s => s.active).map(s => ({ v: s.id, label: s.name, sub: s.phone || '' }));
  const supplier = combo({ placeholder: 'نام تامین‌کننده (الزامی)', createLabel: 'تامین‌کننده‌ی جدید', options: supOpts(), onChange: () => recalc(),
    onCreate: async name => { try { const r = await rpc('save_supplier', { name }, { queue: false }); await loadAll(); supplier.setOptions(supOpts()); supplier.set(r.id); toast('تامین‌کننده اضافه شد'); recalc(); return r.id; } catch (e) { toast(errText(e), 'err'); return null; } } });
  const supInfo = h('div', { class: 'inp ro bal' }, '—');
  const ship = numField({ onInput: () => recalc() }), discount = numField({ onInput: () => recalc() });
  const shipAcc = accountPicker(S.accounts, null, () => {}, { pockets: true });
  const shipBox = h('div', { hidden: true }, field('هزینه‌ی حمل را چه کسی / از کدام حساب داد؟', shipAcc, 'روی قیمت هر قلم سرشکن می‌شود و قیمت تمام‌شده را می‌سازد.'));
  const note = h('input', { class: 'inp', type: 'text', placeholder: 'شماره‌ی فاکتور تامین‌کننده / یادداشت (اختیاری)', 'aria-label': 'توضیحات فاکتور' });
  let payMode = 'full';
  const due = dueField(() => date, { label: 'سررسید پرداخت مانده' }), dueBox = h('div', { hidden: true }, due);
  const remainEl = h('div', { class: 'hint' }), paysBox = h('div', { class: 'paylist' });
  const morePay = h('button', { class: 'btn dashed', type: 'button', hidden: true, onclick: () => addPay() }, '＋ پرداخت دیگر (اگر دو نفر پرداخت کردند)');
  const payChips = chips([{ v: 'full', label: 'پرداخت کامل' }, { v: 'part', label: 'پرداخت جزئی (مانده بدهی می‌ماند)' }], 'full', v => { payMode = v; syncPayMode(); recalc(); }, { cls: 'two', label: 'نحوه‌ی پرداخت' });
  function syncPayMode() { const full = payMode === 'full'; pays.forEach((P, i) => { P.card.hidden = full && i > 0; P.ctl.input.disabled = full; }); morePay.hidden = full; }
  function addPay() {
    const P = { acc: null, amt: 0 };
    const acc = accountPicker(S.accounts, null, v => { P.acc = v; }, { pockets: true, balances: accBalance });
    const amt = numField({ onInput: n => { P.amt = n; recalc(); } }); P.ctl = amt;
    const rmBtn = pays.length ? h('button', { class: 'rm', type: 'button', 'aria-label': 'حذف این پرداخت', onclick: () => { pays.splice(pays.indexOf(P), 1); P.card.remove(); recalc(); } }, '✕') : null;
    P.card = h('div', { class: 'lcard' }, h('div', { class: 'lrow' }, h('b', null, 'پرداخت ' + (pays.length + 1)), rmBtn), field('مبلغ پرداخت‌شده (ریال)', amt), field('پرداخت از (تنخواه / حساب بانکی / جیب شخصی)', acc));
    P.set = (a, n) => { acc.set(a); P.acc = a; amt.set(n); P.amt = n; };
    pays.push(P); paysBox.append(P.card); syncPayMode(); recalc(); return P;
  }
  const S2 = { goods: h('b', { class: 'n' }, '0'), disc: h('b', { class: 'n' }, '0'), ship: h('b', { class: 'n' }, '0'), landed: h('b', { class: 'n' }, '0'), paid: h('b', { class: 'n' }, '0'), debt: h('b', { class: 'n' }, '0'), cnt: h('span', null, ''), mq: h('span', null, ''), rq: h('span', null, '') };
  const itemsList = h('div', { class: 'pg-il' });
  const done = () => rows.filter(r => r.item && r.price > 0);
  const goods = () => sum(done(), r => r.qty * r.price);
  function recalc() {
    if (step !== 2) return;
    const g0 = goods(), sh = ship.get(), dc = Math.min(discount.get(), g0), g = g0 - dc;
    shipBox.hidden = sh <= 0;
    let mv = 0, rv = 0; done().forEach(r => { const lt = r.qty * r.price, landed = g0 > 0 ? (lt + sh * lt / g0 - dc * lt / g0) / r.qty : r.price; mv += r.m * landed; rv += r.r * landed; });
    if (payMode === 'full' && pays[0]) { pays[0].amt = g; pays[0].ctl.set(g || ''); }
    const paid = payMode === 'full' ? g : sum(pays, p => p.amt), left = g - paid;
    S2.goods.textContent = fmt(g0); S2.disc.textContent = fmt(dc); S2.ship.textContent = fmt(sh); S2.landed.textContent = fmt(g + sh); S2.paid.textContent = fmt(paid);
    S2.debt.textContent = fmt(Math.abs(left)); S2.debt.className = 'n ' + (left > 0 ? 'neg' : left < 0 ? 'pos' : '');
    S2.cnt.textContent = `جمع کالاها (${fmt(done().length)} ردیف · ${fmt(sum(done(), r => r.qty))} عدد)`;
    S2.mq.textContent = `+${fmt(sum(done(), r => r.m))} عدد · ${fmt(Math.round(mv))} ریال`; S2.rq.textContent = `+${fmt(sum(done(), r => r.r))} عدد · ${fmt(Math.round(rv))} ریال`;
    remainEl.textContent = left > 0 ? `مانده‌ی فاکتور به حساب بدهی ما به تامین‌کننده می‌رود: ${fmt(left)} ریال` : left < 0 ? `اضافه‌پرداخت: تامین‌کننده ${fmt(-left)} ریال به ما بدهکار می‌شود` : '';
    dueBox.hidden = payMode === 'full' || left <= 0;
    const sid = supplier.get(), sb = sid && S.vSup.find(x => x.id === sid);
    supInfo.textContent = !sid ? '—' : (sb && sb.balance > 0.5 ? `${fmt(sb.balance)} ریال بدهکاریم` : sb && sb.balance < -0.5 ? `${fmt(-sb.balance)} ریال طلبکاریم` : 'تسویه'); supInfo.classList.toggle('debt', !!(sb && sb.balance > 0.5));
  }
  function drawItemsList() {
    itemsList.replaceChildren(...done().map((r, i) => { const it = S.I[r.item] || {}; return h('div', { class: 'sr' }, h('div', { class: 'srl' }, h('span', null, `${fmt(i + 1)} · ${it.code || ''} · ${it.name || ''}`), h('b', null, `${fmt(r.qty)} × ${fmt(r.price)}`)), r.note && r.note.trim() ? h('div', { class: 'pg-nt' }, 'توضیح: ' + r.note.trim()) : null); }));
  }
  function zone(n, title, sub, ...kids) { return h('section', { class: 'z2' }, h('div', { class: 'zt' }, n ? h('i', null, n) : null, h('span', null, title), sub ? h('small', null, sub) : null), h('div', { class: 'zx' }, ...kids)); }
  const step2 = h('div', { class: 'pg2', hidden: true },
    h('div', { class: 'pg2l' },
      zone('۱', 'مشخصات خرید', null, h('div', { class: 'two-col dt' }, field('تامین‌کننده (فروشنده‌ی کالا) *', supplier), field('مانده‌ی قبلی تامین‌کننده', supInfo)), h('div', { class: 'two-col dt' }, field('تاریخ خرید', dateCtl), field('شماره‌ی فاکتور / یادداشت', note))),
      zone('۲', 'تخفیف و هزینه‌ی حمل', 'اختیاری · سرشکن روی اقلام', h('div', { class: 'two-col dt' }, field('تخفیف خرید (ریال)', discount, 'از جمع فاکتور و بدهی به تامین‌کننده کم می‌شود.'), field('هزینه‌ی حمل (ریال)', ship)), shipBox),
      zone('۳', 'پرداخت به تامین‌کننده', 'چقدر دادی؟ از کدام حساب؟', payChips, paysBox, morePay, remainEl, dueBox)),
    h('div', { class: 'pg2r' },
      h('section', { class: 'z2 dk' }, h('div', { class: 'zt dark' }, h('span', null, 'خلاصهٔ فاکتور')), h('div', { class: 'zx' },
        h('div', { class: 'sr' }, S2.cnt, S2.goods), h('div', { class: 'sr' }, h('span', null, 'تخفیف'), S2.disc), h('div', { class: 'sr' }, h('span', null, 'هزینه‌ی حمل'), S2.ship),
        h('div', { class: 'sr' }, h('span', null, 'قیمت تمام‌شده‌ی فاکتور'), S2.landed), h('div', { class: 'sr' }, h('span', null, 'پرداخت‌شده'), S2.paid), h('div', { class: 'sr' }, h('span', null, 'مانده بدهی به تامین‌کننده'), S2.debt))),
      zone('', 'اثر روی موجودی (پس از ثبت)', null, h('div', { class: 'sr' }, h('span', null, 'مهسا'), S2.mq), h('div', { class: 'sr' }, h('span', null, 'رعنا'), S2.rq), h('div', { class: 'hint' }, 'ارزش هر نفر با سهم حمل (قیمت تمام‌شده) حساب شده است.')),
      zone('', 'اقلام در فاکتور', null, itemsList)));

  /* ================= پیمایش بین مرحله‌ها ================= */
  const nextBtn = h('button', { class: 'btn primary lg', type: 'button', 'data-act': 'next' }, 'ادامه ← مرحلهٔ مالی');
  const backBtn = h('button', { class: 'btn ghost lg', type: 'button', 'data-act': 'back' }, '→ بازگشت به جدول کالاها');
  const submit = h('button', { class: 'btn primary lg', type: 'button', 'data-act': 'submit' }, edit ? 'ذخیره‌ی ویرایش فاکتور' : 'ثبت و صدور فاکتور خرید');
  function setStep(n) {
    step = n; step1.hidden = n !== 1; step2.hidden = n !== 2; bar1.hidden = n !== 1; bar2.hidden = n !== 2;
    chip1.className = 'pg-chip' + (n === 1 ? ' on' : ' dn'); chip2.className = 'pg-chip' + (n === 2 ? ' on' : '');
    chip1.textContent = n === 2 ? '۱ · کالاها ✓' : '۱ · کالاها';
    if (n === 2) { drawItemsList(); recalc(); } else paint();
    const sb = m.el && m.el.querySelector('.sheet-b'); if (sb) sb.scrollTop = 0;
  }
  function confirmPartials(list) {
    return new Promise(res => {
      let fin = false; const end = v => { if (fin) return; fin = true; mm.close(); res(v); };
      const items = list.map(r => { const it = S.I[r.item]; return h('div', null, h('b', null, 'ردیف ' + fmt(rows.indexOf(r) + 1)), ' · ', it ? `${it.name}${r.qty ? ' · ' + fmt(r.qty) + ' عدد' : ''} — ` : `فقط فی ${fmt(r.price)} — `, h('span', { class: 'amb' }, it ? 'فی ندارد' : 'کالا انتخاب نشده')); });
      const mm = modal({ title: 'ردیف‌های ناقص', body: h('div', { class: 'form' }, h('div', null, 'این ردیف‌ها ناقص‌اند و اگر ادامه بدهی ', h('b', { class: 'neg' }, 'حذف می‌شوند'), ':'), h('div', { class: 'pg-plist' }, ...items), h('div', { class: 'hint' }, 'ردیف خالیِ آخر بدون پرسش حذف می‌شود.')),
        footer: [h('button', { class: 'btn primary lg', type: 'button', onclick: () => end(true) }, 'بله، حذف کن و برو مرحلهٔ مالی'), h('button', { class: 'btn ghost lg', type: 'button', onclick: () => end(false) }, 'برگرد و تکمیل می‌کنم')], onClose: () => { if (!fin) { fin = true; res(false); } } });
    });
  }
  nextBtn.onclick = async () => {
    paint();
    if (probList.length) { toast(probList[0] + (probList.length > 1 ? ` (و ${fmt(probList.length - 1)} مورد دیگر)` : ''), 'err'); return; }
    const partials = rows.filter(isPartial);
    if (partials.length && !(await confirmPartials(partials))) return;
    rows.filter(r => isBlank(r) || isPartial(r)).forEach(r => r.el.remove()); rows = rows.filter(r => !isBlank(r) && !isPartial(r));
    if (!rows.length) { ensureTail(); paint(); return toast('حداقل یک کالا با فی لازم است', 'err'); }
    ensureTail(); setStep(2);
  };
  backBtn.onclick = () => setStep(1);

  /* ================= ثبت ================= */
  submit.onclick = async () => {
    if (!supplier.get()) { supplier.input.focus(); return toast('تامین‌کننده را انتخاب کن یا بساز؛ هر فاکتور خرید باید تامین‌کننده داشته باشد', 'err'); }
    const ds = done(); if (!ds.length) return toast('حداقل یک کالا به فاکتور اضافه کن', 'err');
    const sh = ship.get(), g0 = goods();
    if (discount.get() > g0) return toast('تخفیف نمی‌تواند از جمع کالاها بیشتر باشد', 'err');
    if (sh > 0 && !shipAcc.get()) return toast('حساب پرداخت‌کننده‌ی هزینه حمل را انتخاب کن', 'err');
    const used = (payMode === 'full' ? pays.slice(0, 1) : pays).filter(p => p.amt > 0);
    if (used.some(p => !p.acc)) return toast('حساب هر پرداخت را انتخاب کن', 'err');
    const left = g0 - discount.get() - sum(used, p => p.amt);
    const payload = { date, supplier_id: supplier.get(), ship_cost: sh, discount: discount.get(), ship_account_id: sh > 0 ? shipAcc.get() : null, due_date: left > 0 ? due.get() : null, note: note.value.trim(),
      lines: ds.map(r => ({ item_id: r.item, qty: r.qty, unit_price: r.price, hold_m: r.m, hold_r: r.r, note: (r.note || '').trim() })), payments: used.map(p => ({ account_id: p.acc, amount: p.amt })) };
    const r0 = await run(submit, () => rpc(edit ? 'edit_purchase' : 'create_purchase', edit ? { ...payload, id: edit.id } : payload));
    if (!r0) return;
    toast(`فاکتور ${r0.no} ${edit ? 'ویرایش شد' : 'ثبت شد'}`); m.close(); await bus.refresh();
  };

  /* ================= پوستهٔ مودال ================= */
  const chip1 = h('span', { class: 'pg-chip on' }, '۱ · کالاها'), chip2 = h('span', { class: 'pg-chip' }, '۲ · مالی (تامین‌کننده، حمل، پرداخت)');
  const bar1 = h('div', { class: 'pgf' },
    h('div', { class: 'pgf-s' }, h('div', null, h('small', null, 'ردیف'), stats.rows), h('div', null, h('small', null, 'جمع تعداد'), stats.qty), h('div', null, h('small', null, 'جمع کل (ریال)'), stats.total),
      h('div', { class: 'pc' }, h('small', null, 'موجودی مهسا پس از این فاکتور'), h('span', null, stats.mq, ' · ', stats.mv)), h('div', { class: 'pc' }, h('small', null, 'موجودی رعنا پس از این فاکتور'), h('span', null, stats.rq, ' · ', stats.rv)),
      h('div', { class: 'pgf-n' }, 'بدون هزینهٔ حمل؛ سهم حمل در مرحلهٔ مالی اضافه می‌شود')), nextBtn);
  const bar2 = h('div', { class: 'pgf', hidden: true }, backBtn, submit);
  const m = modal({ title: edit ? `ویرایش فاکتور ${edit.no}` : 'فاکتور خرید جدید', wide: true,
    body: h('div', { class: 'form pgx' }, h('div', { class: 'pg-steps' }, chip1, h('span', { class: 'ar' }, '←'), chip2), step1, step2), footer: [bar1, bar2] });
  const sh0 = m.el.querySelector && m.el.querySelector('.sheet'); if (sh0) sh0.classList.add('xwide');

  /* ================= شروع ================= */
  if (!edit) {
    addPay(); addRow();
    if (preset.item && S.I[preset.item]) { const r = rows[0]; pickItem(r, preset.item); if (preset.qty) { r.ui.qi.value = String(preset.qty); setQty(r, preset.qty); } }
    ensureTail(); paint();
  } else {
    supplier.set(edit.supplier_id);
    for (const l of S.lines.filter(x => x.invoice_id === edit.id)) {
      const r = addRow({ item: l.item_id, qty: l.qty, price: l.unit_price, m: l.hold_m, r: l.hold_r, manual: true, note: l.note || '' });
      r.ui.nameC.set(r.item); r.ui.qi.value = String(r.qty); r.ui.mi.value = String(r.m); r.ui.ri.value = String(r.r); r.ui.pc.set(r.price); r.ui.noteI.value = r.note;
    }
    discount.set(edit.discount || ''); ship.set(edit.ship_cost || ''); if (edit.ship_account_id) shipAcc.set(edit.ship_account_id);
    const old = S.payments.filter(p => p.invoice_id === edit.id && !p.voided);
    const gEdit = edit.goods_total || sum(rows, r => r.qty * r.price) - (edit.discount || 0);
    if (old.length) old.forEach(p => addPay().set(p.account_id, p.amount)); else addPay();
    if (old.length > 1 || sum(old, p => p.amount) < gEdit - 0.5) { payMode = 'part'; payChips.set('part'); syncPayMode(); }
    if (edit.due_date) due.setDate(edit.due_date);
    note.value = edit.note || ''; ensureTail(); paint();
  }
  return m;
}
