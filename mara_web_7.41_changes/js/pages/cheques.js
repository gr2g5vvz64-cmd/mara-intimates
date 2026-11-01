// مالی ← چک‌های پرداختی: برگشتی‌ها (قرمز، بالا) · چک‌های باز (پررنگ) · گذشته = پاس‌شده فرض می‌شود (کمرنگ، پایین)
import { h, fmt, sum, toast, todayISO } from '../util.js';
import { S, rpc, bus, errText, canEdit, isViewer } from '../store.js';
import { N, pill, kpi, modal, field, numField, dateField, confirmBox, run, accountPicker } from '../ui.js';
import { voidEntry } from '../forms_misc.js';
import { jdash } from '../cheque_ui.js';
import { head, btn, detail, stamp } from './common.js';

const other = payer => (payer === 'حمیدرضا' ? 'مهدی' : 'حمیدرضا');
const eqText = c => `${other(c.payer)} ← ${c.cap_owner}`;
const ORDER = { bounced: 0, open: 1, passed: 2, bounced_settled: 3 };
const isActive = c => !c.voided && c.state !== 'void';

export function chequeSort(rows) {
  return rows.slice().sort((a, b) => (ORDER[a.state] - ORDER[b.state]) || (a.state === 'open' || a.state === 'bounced' ? (a.due_date < b.due_date ? -1 : 1) : (a.due_date < b.due_date ? 1 : -1)) || a.id - b.id);
}
export const chequeKpis = () => {
  const act = S.cheques.filter(isActive), open = act.filter(c => c.state === 'open'), bad = act.filter(c => c.state === 'bounced');
  const next = open.slice().sort((a, b) => (a.due_date < b.due_date ? -1 : 1))[0];
  return { open, bad, next, openSum: sum(open, c => c.amount), badSum: sum(bad, c => c.amount), waiting: sum(open.filter(c => c.half_left > 1000), c => c.half_left), waitingN: open.filter(c => c.half_left > 1000).length };
};

/* ---------- ثبت واریز برابری (پیش از سررسید) ---------- */
export function prepayForm(c) {
  if (isViewer()) { toast('این حساب فقط برای مشاهده است.', 'err'); return; }
  let date = todayISO();
  const amt = numField({ value: Math.round(c.half_left) });
  const note = h('input', { class: 'inp', placeholder: 'توضیح (اختیاری)' });
  const b = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت واریز');
  b.onclick = async () => {
    if (!amt.get()) return toast('مبلغ را بنویس', 'err');
    const r = await run(b, () => rpc('cheque_prepay', { cheque_id: c.id, amount: amt.get(), date, note: note.value }));
    if (r) { toast('واریز برابری ثبت شد'); m.close(); await bus.refresh(); }
  };
  const m = modal({ title: 'ثبت واریز برابری چک', body: h('div', { class: 'form' },
    h('div', { class: 'hint' }, `چک ${c.payer} به ${c.supplier} · ${fmt(c.amount)} ریال · سررسید ${jdash(c.due_date)}`),
    h('div', { class: 'hint' }, `${other(c.payer)} نصف مبلغ چک (${fmt(c.amount / 2)} ریال) را به حساب شخصی ${c.cap_owner} واریز می‌کند${c.prepaid > 0 ? `؛ تا حالا ${fmt(c.prepaid)} ریال ثبت شده` : ''}. این مبلغ تا روز سررسید «پیش‌پرداخت برابری» حساب می‌شود و یادآوری برعکس نمی‌رود.`),
    field('تاریخ واریز', dateField(date, v => { date = v; })), field('مبلغ (ریال)', amt, `حداکثر ${fmt(c.half_left)} ریال`), field('توضیح', note)), footer: b });
}

/* ---------- برگشت شد / لغو برگشت ---------- */
async function bounce(c, undo = false) {
  const ok = await confirmBox(undo
    ? `برگشتیِ چک ${c.cheque_no} (${c.supplier}) لغو شود؟ دوباره «باز» می‌شود و بدهی تامین‌کننده صفر می‌ماند.`
    : `چک ${c.cheque_no} (${c.supplier}) برگشت خورد؟ بدهی ${fmt(c.amount)} ریالی تامین‌کننده برمی‌گردد${c.state === 'passed' ? ' و سرمایه‌ی ثبت‌شده‌ی این چک کم می‌شود' : ''}.`, undo ? 'بله، لغو برگشت' : 'بله، برگشت خورد', !undo);
  if (!ok) return;
  try { await rpc('bounce_cheque', { id: c.id, undo }); toast(undo ? 'برگشتی لغو شد' : 'چک برگشتی ثبت شد'); await bus.refresh(); } catch (e) { toast(errText(e), 'err'); }
}

/* ---------- تسویه‌ی فوری چک برگشتی ---------- */
function settleBox(c) {
  let method = 'cap_h';
  const bizAcc = S.accounts.filter(a => a.kind !== 'pocket').sort((a, b) => a.sort - b.sort);
  const sel = h('select', { class: 'sel', 'aria-label': 'حساب کسب‌وکار', hidden: true }, bizAcc.map(a => h('option', { value: a.id }, a.name)));
  const bank = bizAcc.find(a => a.kind === 'bank'); if (bank) sel.value = bank.id;
  const defs = [['cap_h', 'از سرمایه‌ی حمیدرضا (← مهسا)'], ['cap_d', 'از سرمایه‌ی مهدی (← رعنا)'], ['biz', 'از حساب کسب‌وکار']];
  const wrap = h('div', { class: 'cq-opts', role: 'radiogroup', 'aria-label': 'نحوه تسویه' });
  const draw = () => {
    wrap.replaceChildren(...defs.map(([v, t]) => h('label', { class: method === v ? 'on' : '' }, h('input', { type: 'radio', name: 'm' + c.id, checked: method === v, onchange: () => { method = v; sel.hidden = v !== 'biz'; draw(); } }), t)), sel, go);
  };
  const go = h('button', { class: 'btn primary', type: 'button' }, 'ثبت تسویه‌ی فوری');
  go.onclick = async () => {
    const r = await run(go, () => rpc('settle_bounced_cheque', { id: c.id, method, account_id: method === 'biz' ? +sel.value : null }));
    if (r) { toast('تسویه‌ی فوری ثبت شد'); await bus.refresh(); }
  };
  draw();
  return h('div', null, h('div', { style: { fontWeight: 800, marginBottom: '8px' } }, 'نحوه‌ی تسویه‌ی فوری (به‌جای چک برگشتی):'), wrap,
    h('p', { class: 'hint' }, 'چک برگشتی دیگر در سرمایه نمی‌آید و تسویه‌ی جدید جایگزینش می‌شود؛ بدهی تامین‌کننده بسته می‌شود.'));
}

/* ---------- جزئیات چک ---------- */
export function chequeDetail(c) {
  const allocs = S.chequeAllocs.filter(a => a.cheque_id === c.id);
  const m = detail({
    title: `چک ${c.cheque_no} · ${c.supplier}`,
    rows: [['وضعیت', stateTag(c)], ['مبلغ', N(c.amount)], ['چک‌دهنده', `${c.payer} (سرمایه‌ی ${c.cap_owner})`], ['نام روی چک', c.payee_name], ['کد ملی', h('span', { dir: 'ltr' }, c.national_id || '')],
      ['بانک / شماره چک', `${c.bank} · ${c.cheque_no}`], ['صیادی', h('span', { dir: 'ltr' }, c.sayadi)], ['تاریخ تحویل', jdash(c.date)], ['سررسید', jdash(c.due_date)],
      ['فاکتور', c.invoice_nos || (c.has_balance ? 'مانده‌ی حساب' : '—')], c.prepaid > 0 ? ['واریز برابری', N(c.prepaid)] : null,
      c.bounced_at ? ['تاریخ برگشت', jdash(c.bounced_at)] : null, c.settled_at ? ['تسویه‌ی فوری', jdash(c.settled_at)] : null, ['ثبت‌کننده', stamp(c)], c.voided ? ['باطل‌شده', c.void_reason || ''] : null],
    extra: allocs.length > 1 ? [h('p', { class: 'hint' }, `این چک روی ${fmt(allocs.length)} ردیف تخصیص یافته است.`)] : [],
    actions: c.voided || !canEdit() ? [] : [c.settled_at ? null : btn('ابطال چک', () => { m.close(); voidEntry('cheque', c, `چک ${c.cheque_no} (${c.supplier})`); }, 'ghost')]
  });
}

function stateTag(c) {
  if (c.voided) return pill('باطل', 'red');
  if (c.state === 'bounced') return pill('برگشتی', 'red');
  if (c.state === 'bounced_settled') return pill('برگشتی، تسویه شد', 'green');
  if (c.state === 'passed') return pill('پاس‌شده', 'green');
  return pill(c.days_left <= 0 ? 'امروز' : `${fmt(c.days_left)} روز`, c.days_left <= 7 ? 'amber' : 'gray');
}

function eqCell(c) {
  if (c.state === 'bounced' || c.state === 'bounced_settled' || c.voided) return c.prepaid > 0 ? h('span', { class: 'hint' }, `${fmt(c.prepaid)} واریز شده بود`) : '—';
  if (c.prepaid > 0 && c.half_left <= 1000) return h('span', null, h('b', { class: 'okt' }, `✓ ${fmt(c.prepaid)} واریز شد`));
  if (c.state === 'passed') return c.prepaid > 0 ? h('span', null, `${fmt(c.prepaid)} واریز شد`) : '—';
  return h('div', null, `${eqText(c)} `, h('span', { class: 'n' }, fmt(c.half_left)), isViewer() ? null : h('div', null, h('button', { class: 'btn cq-pre sm', type: 'button', onclick: e => { e.stopPropagation(); prepayForm(c); } }, 'ثبت واریز')));
}
const actCell = c => {
  if (!canEdit() || c.voided) return '';
  if (c.state === 'bounced') return c.settled_at ? '' : h('button', { class: 'btn ghost sm', type: 'button', onclick: e => { e.stopPropagation(); bounce(c, true); } }, 'لغو برگشت');
  if (c.state === 'bounced_settled') return '';
  return h('button', { class: 'btn cq-bounce sm', type: 'button', onclick: e => { e.stopPropagation(); bounce(c); } }, 'برگشت شد');
};

/* ---------- جدول دسکتاپ ---------- */
function deskTable(rows) {
  const cols = ['تامین‌کننده', 'تحویل', 'بانک', 'شماره چک', 'صیادی', 'چک‌دهنده', 'سررسید', 'مبلغ', 'واریز برابری', 'فاکتور', ''];
  const body = [];
  for (const c of rows) {
    const cls = c.state === 'bounced' ? 'cq-bad' : c.state === 'open' ? 'cq-open' : 'cq-done';
    const tr = h('tr', { class: cls + ' clk', tabindex: 0, role: 'button' },
      h('td', { class: 'main', 'data-l': cols[0] }, c.supplier), h('td', { 'data-l': cols[1] }, h('span', { class: 'n' }, jdash(c.date))), h('td', { 'data-l': cols[2] }, c.bank), h('td', { 'data-l': cols[3] }, h('span', { class: 'n' }, c.cheque_no)),
      h('td', { 'data-l': cols[4] }, h('span', { class: 'n' }, c.sayadi)), h('td', { 'data-l': cols[5] }, c.payer), h('td', { 'data-l': cols[6] }, h('span', { class: 'n' }, jdash(c.due_date)), ' ', stateTag(c)),
      h('td', { class: 'num', 'data-l': cols[7] }, N(c.amount)), h('td', { 'data-l': cols[8] }, eqCell(c)), h('td', { 'data-l': cols[9] }, c.invoice_nos || (c.has_balance ? 'مانده حساب' : '—')), h('td', { 'data-l': cols[10] }, actCell(c)));
    tr.addEventListener('click', () => chequeDetail(c)); tr.addEventListener('keydown', e => { if (e.key === 'Enter') chequeDetail(c); });
    body.push(tr);
    if (c.state === 'bounced' && !c.settled_at && canEdit()) body.push(h('tr', { class: 'cq-setl' }, h('td', { colspan: String(cols.length) }, settleBox(c))));
  }
  return h('div', { class: 'tw cq-desk' }, h('table', { class: 't' }, h('thead', null, h('tr', null, cols.map(t => h('th', { scope: 'col' }, t)))), h('tbody', null, body)));
}

/* ---------- کارت‌های موبایل ---------- */
function mobCards(rows) {
  const rw = (k, v) => h('div', { class: 'rw' }, h('span', null, k), h('span', null, v));
  return h('div', { class: 'cq-mob' }, rows.map(c => {
    const card = h('div', { class: 'cq-mc' + (c.state === 'bounced' ? ' bad' : c.state === 'open' ? '' : ' done') },
      h('div', { class: 'top' }, h('b', null, c.supplier), N(c.amount)),
      rw('سررسید', h('span', null, h('span', { class: 'n' }, jdash(c.due_date)), ' ', stateTag(c))), rw('بانک / چک', h('span', null, `${c.bank} · `, h('span', { class: 'n' }, c.cheque_no))), rw('صیادی', h('span', { class: 'n' }, c.sayadi)),
      rw('پرداخت‌کننده · تحویل', h('span', null, `${c.payer} · `, h('span', { class: 'n' }, jdash(c.date)))), rw('فاکتور', c.invoice_nos || (c.has_balance ? 'مانده حساب' : '—')), rw('واریز برابری', eqCell(c)), ...(actCell(c) ? [actCell(c)] : []));
    if (c.state === 'bounced' && !c.settled_at && canEdit()) card.append(settleBox(c));
    card.addEventListener('click', e => { if (!e.target.closest('button,input,select,label')) chequeDetail(c); });
    return card;
  }));
}

export function render() {
  let who = 'همه'; const host = h('div'), chipsBox = h('div', { class: 'seg', role: 'group', 'aria-label': 'فیلتر چک‌دهنده' });
  const draw = () => {
    chipsBox.replaceChildren(...['همه', 'حمیدرضا', 'مهدی'].map(w => h('button', { type: 'button', class: who === w ? 'on' : '', 'aria-pressed': who === w ? 'true' : 'false', onclick: () => { who = w; draw(); } }, w)));
    const K = chequeKpis();
    const act = chequeSort(S.cheques.filter(c => isActive(c) && (who === 'همه' || c.payer === who)));
    const gone = S.cheques.filter(c => c.voided && (who === 'همه' || c.payer === who));
    host.replaceChildren(...[
      h('div', { class: 'kpis' },
        kpi('چک‌های باز (سررسید نشده)', h('span', null, `${fmt(K.open.length)} چک · `, N(K.openSum))),
        kpi('نزدیک‌ترین سررسید', K.next ? h('span', null, jdash(K.next.due_date), ` (${K.next.days_left <= 0 ? 'امروز' : fmt(K.next.days_left) + ' روز دیگر'})`) : '—'),
        kpi('منتظر واریز برابری', K.waitingN ? h('span', null, `${fmt(K.waitingN)} چک · `, N(K.waiting)) : '—'),
        K.bad.length ? kpi('برگشتی — نیاز به تسویه‌ی فوری', h('span', null, `${fmt(K.bad.length)} چک · `, N(K.badSum)), { tone: 'neg' }) : null),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', margin: '8px 0' } },
        h('div', { class: 'chq-legend', role: 'note' }, h('span', null, h('i', { style: { background: 'var(--red-bg)', border: '1.5px solid var(--red)' } }), 'برگشتی (بالا)'), h('span', null, h('i', { style: { background: 'var(--ink)' } }), 'باز — سررسید نشده (پررنگ)'),
          h('span', null, h('i', { style: { background: 'var(--ink)', opacity: '.4' } }), 'سررسید گذشته = پاس‌شده (کمرنگ، پایین)')), chipsBox),
      act.length ? [deskTable(act), mobCards(act)] : h('div', { class: 'empty' }, 'هنوز چکی ثبت نشده است. از «فاکتور خرید» یا صفحه‌ی تامین‌کننده می‌توانی با چک پرداخت کنی.'),
      h('p', { class: 'hint' }, 'روز سررسید، چک «پاس‌شده» فرض می‌شود و سرمایه‌ی صاحبش (حمیدرضا ← مهسا، مهدی ← رعنا) زیاد می‌شود. «برگشت شد» روی هر ردیف (حتی کمرنگ) آن را قرمز به بالای جدول می‌آورد. «واریز برابری» = نصف مبلغ چک که دو روز قبل از سررسید به سرمایه‌گذار طرف مقابل اعلام می‌شود؛ اگر زودتر واریز کرد همین‌جا «ثبت واریز» را بزن.'),
      gone.length ? h('details', { class: 'voidbox' }, h('summary', null, `چک‌های باطل‌شده (${fmt(gone.length)})`), deskTable(gone.map(c => ({ ...c, state: 'passed' })))) : null].flat().filter(Boolean));
  };
  draw();
  return h('div', { class: 'chq-page' }, head('چک‌های پرداختی', [], 'چک‌هایی که به تامین‌کننده‌ها داده‌ایم · مالی ← چک‌های پرداختی'), host);
}
