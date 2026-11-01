// پرداخت به تامین‌کننده با «روش‌های ترکیبی»: سرمایه‌ی شخصی / حساب کسب‌وکار / چک — مشترک بین فاکتور خرید و تسویه‌ی تامین‌کننده
// چک: حمیدرضا یا مهدی (سرمایه‌گذار) می‌دهد؛ سرمایه‌ی حمیدرضا به نام مهسا و سرمایه‌ی مهدی به نام رعنا ثبت می‌شود (روز سررسید).
import { h, fmt, fa2en, sum, toJ, fromJ, jMonthLen } from './util.js';
import { S, rpc, errText } from './store.js';
import { field, chips, numField, promptBox } from './ui.js';

const p2 = n => String(n).padStart(2, '0');
export const jdash = iso => { if (!iso) return ''; const [y, m, d] = toJ(iso); return `${y}-${p2(m)}-${p2(d)}`; };
/** «1405-09-05» (ارقام فارسی هم قبول) ← تاریخ میلادی ISO؛ نامعتبر = null */
export function parseJ(t) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(fa2en(String(t || '')).trim().replace(/[/.]/g, '-'));
  if (!m) return null; const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1300 || y > 1500 || mo < 1 || mo > 12 || d < 1 || d > jMonthLen(y, mo)) return null;
  return fromJ(y, mo, d);
}
const digits = s => fa2en(String(s || '')).replace(/[^0-9]/g, '');
export const PAYERS = [{ v: 'حمیدرضا', cap: 'مهسا' }, { v: 'مهدی', cap: 'رعنا' }];
export const capOf = payer => (PAYERS.find(p => p.v === payer) || PAYERS[0]).cap;
const ORD = ['اول', 'دوم', 'سوم'];

export const bankNames = () => (S.chequeBanks || []).map(b => b.name);

/* ====================================================== کارت یک چک ====================================================== */
function chequeCard(ctx) {
  const supDef = () => { const s = S.SUP[ctx.getSupplier && ctx.getSupplier()] || {}; return { payee: s.payee_name || s.name || '', nid: s.national_id || '' }; };
  const d0 = supDef();
  const s = { payer: 'حمیدرضا', payee: d0.payee, nid: d0.nid, bank: '', no: '', sayadi: '', due: '', amount: 0 };
  let strict = false; const touched = new Set(); let lastDef = d0;

  const payer = h('select', { class: 'sel', 'aria-label': 'پرداخت‌کننده‌ی چک' }, PAYERS.map(p => h('option', { value: p.v }, p.v)));
  const payerHint = h('div', { class: 'hint' });
  const dateEl = h('input', { class: 'inp ro ltr', readonly: true, tabindex: '-1', 'aria-label': 'تاریخ تحویل چک' });
  const payee = h('input', { class: 'inp', type: 'text', autocomplete: 'off', 'aria-label': 'نام تامین‌کننده روی چک', value: s.payee });
  const nid = h('input', { class: 'inp ltr', type: 'text', inputmode: 'numeric', maxlength: '10', autocomplete: 'off', 'aria-label': 'کد ملی', value: s.nid });
  const nidHint = h('div', { class: 'hint' });
  const bank = h('select', { class: 'sel', 'aria-label': 'بانک' });
  const no = h('input', { class: 'inp ltr', type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'شماره چک' });
  const sy = h('input', { class: 'inp ltr', type: 'text', inputmode: 'numeric', maxlength: '16', autocomplete: 'off', 'aria-label': 'شماره صیادی ۱۶ رقمی' });
  const syHint = h('div', { class: 'hint' });
  const due = h('input', { class: 'inp ltr', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '1405-09-05', 'aria-label': 'تاریخ سررسید چک' });
  const dueHint = h('div', { class: 'hint' }, 'قالب: سال-ماه-روز');
  const amt = numField({ unit: '', placeholder: '—', onInput: n => { s.amount = n; touched.add('amount'); paint(); ctx.onChange(); } });
  amt.input.setAttribute('aria-label', 'مبلغ چک (ریال)');
  const tag = h('span', { class: 'cq-tag' });
  const title = h('b', null);
  const rm = h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'حذف این چک', onclick: () => ctx.remove(card) }, 'حذف');

  const fillBanks = () => {
    const cur = s.bank;
    bank.replaceChildren(h('option', { value: '' }, 'انتخاب بانک…'), ...bankNames().map(n => h('option', { value: n }, n)), h('option', { value: '__new' }, '＋ افزودن بانک جدید…'));
    bank.value = bankNames().includes(cur) ? cur : '';
  };
  fillBanks();
  bank.addEventListener('change', async () => {
    if (bank.value === '__new') {
      bank.value = s.bank || '';
      const nm = await promptBox('نام بانک جدید', 'مثلاً ملت');
      if (nm) {
        try {
          const r = await rpc('add_cheque_bank', { name: nm }, { queue: false });
          if (!(S.chequeBanks || []).some(b => b.name === r.name)) (S.chequeBanks = S.chequeBanks || []).push({ id: r.id, name: r.name });
          s.bank = r.name; ctx.refreshBanks();
        } catch (e) { ctx.toast(errText(e), 'err'); }
      }
    } else { s.bank = bank.value; touched.add('bank'); }
    paint(); ctx.onChange();
  });
  payer.addEventListener('change', () => { s.payer = payer.value; paint(); ctx.onChange(); });
  payee.addEventListener('input', () => { s.payee = payee.value; touched.add('payee'); paint(); });
  nid.addEventListener('input', () => { nid.value = s.nid = digits(nid.value).slice(0, 10); touched.add('nid'); paint(); });
  no.addEventListener('input', () => { no.value = s.no = digits(no.value); touched.add('no'); paint(); });
  sy.addEventListener('input', () => { sy.value = s.sayadi = digits(sy.value).slice(0, 16); touched.add('sayadi'); paint(); });
  due.addEventListener('input', () => { s.due = fa2en(due.value).replace(/[^0-9\-/.]/g, ''); touched.add('due'); paint(); });
  due.addEventListener('blur', () => { const iso = parseJ(s.due); if (iso) { s.due = jdash(iso); due.value = s.due; } paint(); });
  for (const e of [payee, nid, no, sy, due]) e.addEventListener('blur', () => { touched.add('x'); paint(); });

  const problems = () => {
    const out = [], date = ctx.getDate(), dueISO = parseJ(s.due);
    if (!s.payee.trim()) out.push({ k: 'payee', t: 'نام تامین‌کننده‌ی چک را بنویس' });
    if (s.nid.length !== 10) out.push({ k: 'nid', t: 'کد ملی باید ۱۰ رقم باشد' });
    if (!s.bank) out.push({ k: 'bank', t: 'بانک را انتخاب کن' });
    if (!s.no) out.push({ k: 'no', t: 'شماره‌ی چک را بنویس' });
    if (s.sayadi.length !== 16) out.push({ k: 'sayadi', t: `شماره‌ی صیادی باید ۱۶ رقم باشد (${fmt(s.sayadi.length)} از ۱۶)` });
    else if ((S.cheques || []).some(c => !c.voided && c.sayadi === s.sayadi && !(ctx.ownIds && ctx.ownIds.has(c.id)))) out.push({ k: 'sayadi', t: 'این شماره‌ی صیادی قبلاً ثبت شده است' });
    else if (ctx.cards().some(o => o !== card && o.s.sayadi === s.sayadi)) out.push({ k: 'sayadi', t: 'این شماره‌ی صیادی در چک دیگرِ همین فرم هم هست' });
    if (!dueISO) out.push({ k: 'due', t: 'تاریخ سررسید را به شکل سال-ماه-روز بنویس (مثلاً 1405-09-05)' });
    else if (date && dueISO < date) out.push({ k: 'due', t: 'سررسید نمی‌تواند قبل از تاریخ تحویل باشد' });
    if (!(s.amount > 0)) out.push({ k: 'amount', t: 'مبلغ چک را بنویس' });
    return out;
  };

  function paint() {
    const pr = problems(), bad = k => pr.find(p => p.k === k), show = k => (strict || touched.has(k) || (touched.has('x') && k !== 'amount')) && bad(k);
    dateEl.value = jdash(ctx.getDate());
    payerHint.textContent = `در سرمایه‌ی ${capOf(s.payer)} ثبت می‌شود`;
    const mark = (el, k) => el.classList.toggle('err', !!show(k));
    mark(payee, 'payee'); mark(nid, 'nid'); mark(bank, 'bank'); mark(no, 'no'); mark(sy, 'sayadi'); mark(due, 'due'); mark(amt.input, 'amount');
    nidHint.textContent = show('nid') ? bad('nid').t : ''; nidHint.className = 'hint' + (show('nid') ? ' errt' : '');
    const n = s.sayadi.length;
    syHint.textContent = show('sayadi') ? bad('sayadi').t : n === 16 ? '۱۶ از ۱۶ رقم ✓' : n ? `${fmt(n)} از ۱۶ رقم` : '';
    syHint.className = 'hint' + (show('sayadi') ? ' errt' : n === 16 ? ' okt' : '');
    dueHint.textContent = show('due') ? bad('due').t : 'قالب: سال-ماه-روز'; dueHint.className = 'hint' + (show('due') ? ' errt' : '');
    const ok = !pr.length;
    tag.textContent = ok ? 'کامل' : 'ناقص'; tag.className = 'cq-tag ' + (ok ? 'ok' : 'warn');
    const i = ctx.cards().indexOf(card); title.textContent = 'چک ' + (ORD[i] || (i + 1)); rm.hidden = i <= 0;
  }

  const el = h('div', { class: 'cq-card' },
    h('div', { class: 'cq-h' }, h('span', null, title, ' ', tag), rm),
    h('div', { class: 'cq-grid' },
      field('پرداخت‌کننده', payer, null, 's2'), field('تاریخ تحویل', dateEl, null, 's2'), field('نام تامین‌کننده', payee, null, 's2'), field('کد ملی', h('div', null, nid, nidHint), null, 's2'), field('بانک', bank, null, 's2'),
      field('شماره چک', no, null, 's2'), field('شماره صیادی (۱۶ رقم)', h('div', null, sy, syHint), null, 's3 sy'), field('تاریخ سررسید', h('div', null, due, dueHint), null, 's2'), field('مبلغ (ریال)', amt, null, 's3')));
  el.querySelector('.fld').append(payerHint);
  const card = {
    el, s, paint, problems, fillBanks,
    amount: () => s.amount,
    setAmount(n) { s.amount = n; amt.set(n || ''); paint(); },
    showErrors: () => { strict = true; paint(); },
    data: () => ({ payer: s.payer, payee_name: s.payee.trim(), national_id: s.nid, bank: s.bank, cheque_no: s.no, sayadi: s.sayadi, due_date: parseJ(s.due), amount: s.amount }),
    set(o) {
      s.payer = o.payer || s.payer; payer.value = s.payer; s.payee = o.payee_name || s.payee; payee.value = s.payee; s.nid = o.national_id || s.nid; nid.value = s.nid;
      s.bank = o.bank || ''; if (s.bank && !bankNames().includes(s.bank)) (S.chequeBanks = S.chequeBanks || []).push({ name: s.bank }); fillBanks();
      s.no = o.cheque_no || ''; no.value = s.no; s.sayadi = o.sayadi || ''; sy.value = s.sayadi; s.due = o.due_date ? jdash(o.due_date) : ''; due.value = s.due; s.amount = o.amount || 0; amt.set(s.amount || ''); paint();
    },
    supplierChanged() {   // نام و کد ملیِ پیش‌فرض را فقط اگر کاربر دستی عوضش نکرده عوض کن
      const d = supDef();
      if (!s.payee.trim() || s.payee === lastDef.payee) { s.payee = d.payee; payee.value = d.payee; }
      if (!s.nid || s.nid === lastDef.nid) { s.nid = d.nid; nid.value = d.nid; }
      lastDef = d; paint();
    }
  };
  paint();
  return card;
}

/* ====================================================== بخش چک‌ها (تا ۳ چک) ====================================================== */
export function chequeSection({ getDate, getSupplier, onChange = () => {}, max = 3, toast = () => {}, ownIds = null }) {
  const cards = [];
  const list = h('div', { class: 'cq-list' });
  const addBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => { add(); onChange(); } });
  const ctx = {
    getDate, getSupplier, ownIds, toast, onChange: () => { paintAll(); onChange(); }, cards: () => cards,
    remove: c => { const i = cards.indexOf(c); if (i < 0) return; cards.splice(i, 1); c.el.remove(); paintAll(); onChange(); },
    refreshBanks: () => cards.forEach(c => c.fillBanks())
  };
  function paintAll() { cards.forEach(c => c.paint()); addBtn.hidden = cards.length >= max; addBtn.textContent = `＋ افزودن چک ${ORD[cards.length] || ''}`; }
  function add() { if (cards.length >= max) return null; const c = chequeCard(ctx); cards.push(c); list.append(c.el); paintAll(); return c; }
  const el = h('div', { class: 'cq-sec' }, list, addBtn);
  add();
  return {
    el, add, cards: () => cards,
    data: () => cards.map(c => c.data()),
    total: () => sum(cards, c => c.amount()),
    problems: () => { cards.forEach(c => c.showErrors()); for (let i = 0; i < cards.length; i++) { const p = cards[i].problems(); if (p.length) return `چک ${ORD[i]}: ${p[0].t}`; } return null; },
    supplierChanged: () => cards.forEach(c => c.supplierChanged()),
    refresh: () => paintAll(),
    load(rows) { cards.splice(0).forEach(c => c.el.remove()); (rows.length ? rows : [{}]).slice(0, max).forEach(r => { const c = add(); if (c) c.set(r); }); }
  };
}

/* ====================================================== تقسیم مبلغ بین دو نفر (سرمایه‌ی شخصی / حساب کسب‌وکار) ====================================================== */
function splitPanel({ a, b, onChange, extra }) {
  const v = { a: 0, b: 0 }; let mode = 'a', total = 0, auto = true;
  const sw = chips([{ v: 'a', label: `۱۰۰٪ ${a}` }, { v: 'b', label: `۱۰۰٪ ${b}` }, { v: 'half', label: 'نصف‌نصف' }, { v: 'custom', label: 'مبلغ دلخواه' }], 'a',
    m => { mode = m; auto = false; if (m === 'custom') { ca.set(v.a || ''); cb.set(v.b || ''); } apply(); }, { cls: 'cq-split', label: 'سهم هر نفر' });
  const tot = numField({ onInput: n => { total = n; auto = false; apply(); } });
  const ca = numField({ onInput: n => { v.a = n; auto = false; apply(); } }), cb = numField({ onInput: n => { v.b = n; auto = false; apply(); } });
  const totBox = field('مبلغ (ریال)', tot), customBox = h('div', { class: 'two-col' }, field(a, ca), field(b, cb)); customBox.hidden = true;
  const read = h('div', { class: 'hint cq-read' });
  function apply(fire = true) {
    if (mode === 'custom') total = v.a + v.b;
    else { v.a = mode === 'a' ? total : mode === 'half' ? Math.ceil(total / 2) : 0; v.b = total - v.a; }
    totBox.hidden = mode === 'custom'; customBox.hidden = mode !== 'custom';
    read.textContent = total > 0 ? `${a}: ${fmt(v.a)} ریال · ${b}: ${fmt(v.b)} ریال` : '';
    if (fire) onChange();
  }
  const el = h('div', { class: 'cq-panel' }, sw, totBox, customBox, read, extra || null);
  apply(false);
  return {
    el, vals: () => ({ a: v.a, b: v.b }), total: () => (mode === 'custom' ? v.a + v.b : total),
    isAuto: () => auto,
    setTotal(n, isAuto = true) { auto = isAuto; total = n; if (mode === 'custom') { mode = 'a'; sw.set('a'); } tot.set(n || ''); apply(false); },
    setVals(x, y) { auto = false; v.a = x; v.b = y; total = x + y; mode = x && y ? (Math.abs(x - y) <= 1 ? 'half' : 'custom') : y ? 'b' : 'a'; sw.set(mode); tot.set(total || ''); ca.set(x || ''); cb.set(y || ''); apply(false); }
  };
}

/* ====================================================== روش‌های پرداخت (چندانتخابی) ====================================================== */
/** getTotal: مبلغی که باید پرداخت شود؛ onChange: هر تغییری که جمع را عوض کند */
export function payMethods({ getTotal, getDate, getSupplier, onChange = () => {}, toast = () => {}, ownIds = null }) {
  const on = { cap: false, biz: false, chq: false };
  const pockets = { a: S.accounts.find(x => x.kind === 'pocket' && x.owner === 'مهسا'), b: S.accounts.find(x => x.kind === 'pocket' && x.owner === 'رعنا') };
  const bizOf = owner => S.accounts.filter(x => x.kind !== 'pocket' && x.owner === owner).sort((x, y) => x.sort - y.sort);
  const accSel = owner => {
    const l = bizOf(owner), sel = h('select', { class: 'sel', 'aria-label': 'حساب ' + owner }, l.map(x => h('option', { value: x.id }, x.name)));
    const bank = l.find(x => x.kind === 'bank'); if (bank) sel.value = bank.id; return sel;
  };
  const selM = accSel('مهسا'), selR = accSel('رعنا');

  const cap = splitPanel({ a: 'حمیدرضا', b: 'مهدی', onChange: () => onChange() });
  const biz = splitPanel({ a: 'حساب مهسا', b: 'حساب رعنا', onChange: () => onChange(),
    extra: h('div', { class: 'two-col cq-accsel' }, field('حساب مهسا', selM), field('حساب رعنا', selR)) });
  const chq = chequeSection({ getDate, getSupplier, onChange: () => onChange(), toast, ownIds });

  const capBox = h('section', { class: 'z2 cq-z', hidden: true }, h('div', { class: 'zt' }, h('span', null, 'نقد — از سرمایه‌ی شخصی')), h('div', { class: 'zx' }, cap.el,
    h('div', { class: 'hint' }, 'حمیدرضا از جیب شخصی مهسا و مهدی از جیب شخصی رعنا ثبت می‌شود؛ سرمایه‌ی همان نفر زیاد می‌شود.')));
  const bizBox = h('section', { class: 'z2 cq-z', hidden: true }, h('div', { class: 'zt' }, h('span', null, 'نقد — از حساب کسب‌وکار')), h('div', { class: 'zx' }, biz.el));
  const chqBox = h('section', { class: 'z2 cq-z', hidden: true }, h('div', { class: 'zt' }, h('span', null, 'پرداخت با چک'), h('small', null, 'حداکثر ۳ چک')), h('div', { class: 'zx' },
    h('div', { class: 'hint' }, 'تا روز سررسید، چک سرمایه حساب نمی‌شود و فقط بدهی تامین‌کننده صفر می‌شود. دو روز قبل از سررسید به سرمایه‌گذار طرف مقابل پیام می‌رود تا نصف مبلغ را به حساب شخصی صاحب سرمایه‌ی چک (حمیدرضا ← مهسا، مهدی ← رعنا) واریز کند؛ روز سررسید سرمایه ثبت می‌شود.'), chq.el));
  const boxes = { cap: capBox, biz: bizBox, chq: chqBox };
  const part = k => (k === 'cap' ? cap.total() : k === 'biz' ? biz.total() : chq.total());
  const total = () => ['cap', 'biz', 'chq'].reduce((a, k) => a + (on[k] ? part(k) : 0), 0);
  const remaining = except => Math.max(0, getTotal() - ['cap', 'biz', 'chq'].filter(k => k !== except && on[k]).reduce((a, k) => a + part(k), 0));

  const defs = { cap: 'از سرمایه شخصی', biz: 'از حساب کسب‌وکار', chq: 'چک' };
  const btns = {};
  const row = h('div', { class: 'chips cq-methods', role: 'group', 'aria-label': 'روش‌های پرداخت' });
  for (const k of Object.keys(defs)) {
    btns[k] = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', 'data-m': k, onclick: () => toggle(k) }, defs[k]);
    row.append(btns[k]);
  }
  function toggle(k, force) {
    on[k] = force == null ? !on[k] : force;
    btns[k].classList.toggle('on', on[k]); btns[k].setAttribute('aria-pressed', on[k] ? 'true' : 'false'); btns[k].textContent = (on[k] ? '✓ ' : '') + defs[k];
    boxes[k].hidden = !on[k];
    if (on[k]) {
      const rest = remaining(k);
      if (k === 'cap' && cap.total() === 0) cap.setTotal(rest);
      if (k === 'biz' && biz.total() === 0) biz.setTotal(rest);
      if (k === 'chq') { chq.supplierChanged(); const c = chq.cards()[0]; if (c && !c.amount() && rest > 0) c.setAmount(rest); }
    }
    onChange();
  }
  const el = h('div', { class: 'cq-pm' }, row,
    h('div', { class: 'hint' }, 'می‌توانی چند روش را با هم بزنی (مثلاً مقداری نقد و باقی چک). فرم هر روش فقط وقتی انتخابش کنی باز می‌شود. هر مبلغی که با هیچ روشی پرداخت نشود خودکار «نسیه» می‌ماند.'),
    capBox, bizBox, chqBox);

  return {
    el, on: () => ({ ...on }), total,
    cashTotal: () => (on.cap ? cap.total() : 0) + (on.biz ? biz.total() : 0), chequeTotal: () => (on.chq ? chq.total() : 0),
    payments() {
      const out = [];
      if (on.cap) { const v = cap.vals(); if (v.a > 0 && pockets.a) out.push({ account_id: pockets.a.id, amount: v.a }); if (v.b > 0 && pockets.b) out.push({ account_id: pockets.b.id, amount: v.b }); }
      if (on.biz) { const v = biz.vals(); if (v.a > 0) out.push({ account_id: +selM.value, amount: v.a }); if (v.b > 0) out.push({ account_id: +selR.value, amount: v.b }); }
      return out;
    },
    cheques: () => (on.chq ? chq.data() : []),
    supplierChanged: () => chq.supplierChanged(),
    /** وقتی «مبلغ قابل پرداخت» عوض شد: اگر فقط یک روشِ نقدیِ دست‌نخورده انتخاب شده، همان مبلغ را دنبال می‌کند */
    refresh() {
      chq.refresh();
      const act = Object.keys(on).filter(k => on[k]);
      if (act.length === 1 && act[0] !== 'chq') { const p = act[0] === 'cap' ? cap : biz; if (p.isAuto() && p.total() !== getTotal()) p.setTotal(getTotal(), true); }
    },
    check() {
      if (on.cap && !(cap.total() > 0)) return 'مبلغ «از سرمایه شخصی» را بنویس (یا آن روش را بردار)';
      if (on.biz && !(biz.total() > 0)) return 'مبلغ «از حساب کسب‌وکار» را بنویس (یا آن روش را بردار)';
      if (on.chq) { const p = chq.problems(); if (p) return p; }
      if (total() > getTotal() + 0.5) return `جمع نقد و چک‌ها (${fmt(total())}) از مبلغ فاکتور (${fmt(getTotal())}) بیشتر است`;
      return null;
    },
    /** برای ویرایش: payments = [{account_id, amount}] و cheques = ردیف‌های چک */
    preload({ payments = [], cheques = [] }) {
      let ca = 0, cb = 0, ba = 0, bb = 0, accM = null, accR = null;
      for (const p of payments) {
        const a = S.A[p.account_id]; if (!a) continue;
        if (a.kind === 'pocket') { if (a.owner === 'مهسا') ca += p.amount; else cb += p.amount; }
        else if (a.owner === 'مهسا') { ba += p.amount; accM = a.id; } else { bb += p.amount; accR = a.id; }
      }
      if (ca || cb) { cap.setVals(ca, cb); toggle('cap', true); }
      if (ba || bb) { if (accM) selM.value = accM; if (accR) selR.value = accR; biz.setVals(ba, bb); toggle('biz', true); }
      if (cheques.length) { chq.load(cheques); toggle('chq', true); }
    }
  };
}
