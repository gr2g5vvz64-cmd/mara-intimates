// تسویه‌ی خروج رعنا و مهدی (فقط مدیر): قفل ۳۰ آبان، یک عدد بدهی ثابت، انتقال کالا به مهسا، پرداخت مرحله‌ای.
import { h, fmt, jstr, todayISO, fromJ, sum, toast, parseNum } from '../util.js';
import { S, api, rpc, loadAll, errText, pockets, activeSales } from '../store.js';
import { dtable, N, pill, kpi, confirmBox, dateField, numField, field } from '../ui.js';
import { makeXlsx } from '../xlsx_mini.js';
import { transferForm } from '../forms_misc.js';
import { head, btn } from './common.js';
import { partners, planRows, PLAN } from './full_report.js';
import { exitRec, exitPaid, exitLeft, exitPayments, exitCheques, exitChequeTotal } from '../exit.js';

const R = v => fmt(Math.round(Number(v) || 0));
const CUT0 = fromJ(1405, 8, 30);   // ۳۰ آبان ۱۴۰۵

function lateCounts(cut) {
  const g = a => a.filter(x => !x.voided && x.date && x.date > cut).length;
  return { sales: activeSales().filter(s => s.date > cut).length, purchases: g(S.invoices || []), expenses: g(S.expenses || []), returns: g(S.returns || []) };
}
const stockR = () => ({ units: sum(S.lots, l => l.rem_r || 0), val: sum(S.lots, l => (l.rem_r || 0) * (l.landed_unit || 0)) });

function snapshotXlsx(rec) {
  const rows = [['کالا', 'تعداد', 'بهای واحد (ریال)', 'ارزش (ریال)'], ...(rec.stock_snapshot || []).map(x => [x.item, x.qty, Math.round(x.unit_cost), Math.round(x.qty * x.unit_cost)]), ['جمع', Number(rec.stock_units), '', Number(rec.stock_value)]];
  const blob = makeXlsx([{ name: 'کالای منتقل‌شده به مهسا', widths: [40, 10, 18, 18], rows, total: true }]);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'MARA-exit-stock-' + todayISO() + '.xlsx';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function render() {
  const root = h('div');
  const draw = () => { const rec = exitRec(); root.replaceChildren(head('تسویه خروج رعنا و مهدی', [], rec ? 'عدد بدهی ثابت شده؛ هر پرداخت از آن کم می‌شود.' : 'یک بار عدد را قفل کن؛ بعد از آن فقط یک عدد می‌ماند.'), ...(rec ? doneView(rec) : setupView())); };
  const reload = async () => { await loadAll({ retries: 2 }); draw(); };

  /* ---------- پیش از ثبت ---------- */
  function setupView() {
    const Pr = partners()[1], sk = stockR(), cut = { v: CUT0 };
    const cap = numField({ value: Math.round(Pr.cap), onInput: () => upd() }), share = numField({ value: Math.round(Pr.share), onInput: () => upd() }), pay = numField({ value: Math.round(Pr.payout), onInput: () => upd() });
    const note = h('input', { class: 'inp', placeholder: 'توضیح (اختیاری)' });
    const owedBox = h('div', { class: 'kpis' }), lateBox = h('div');
    const upd = () => {
      const o = cap.get() + share.get() - pay.get(), lc = lateCounts(cut.v), nl = lc.sales + lc.purchases + lc.expenses + lc.returns;
      owedBox.replaceChildren(kpi('بدهی ما به رعنا و مهدی', N(o), { sub: 'ریال · سرمایه + سهم سود − برداشت‌شده', tone: 'warn' }), kpi('کالای رعنا که به مهسا می‌رود', String(sk.units), { sub: 'ارزش ' + R(sk.val) + ' ریال' }), kpi('چک‌های مهدی (جدا)', N(exitChequeTotal()), { sub: 'ریال · ' + exitCheques().length + ' چک' }));
      lateBox.replaceChildren(nl ? h('div', { class: 'alert warn' }, `از ${jstr(cut.v)} به بعد ${fmt(lc.sales)} فروش، ${fmt(lc.purchases)} خرید، ${fmt(lc.expenses)} هزینه و ${fmt(lc.returns)} مرجوعی ثبت شده. عددهای بالا تا «امروز» محاسبه می‌شوند؛ اگر لازم است سرمایه و سهم را دستی اصلاح کن.`) : h('div', { class: 'hint' }, 'بعد از تاریخ قطع تراکنشی ثبت نشده.'));
    };
    upd();
    const go = h('button', { type: 'button', class: 'btn primary lg' }, 'ثبت و قفل تسویه');
    go.onclick = async () => {
      const o = cap.get() + share.get() - pay.get();
      if (!(await confirmBox(`از ${jstr(cut.v)} رعنا و مهدی از نرم‌افزار خارج می‌شوند. عدد بدهی ${R(o)} ریال ثابت می‌شود و ${fmt(sk.units)} عدد کالای رعنا به مهسا منتقل می‌شود. برگشت ندارد (فقط ابطال ثبت). ادامه؟`, 'بله، قفل کن', true))) return;
      go.disabled = true;
      try { await rpc('exit_settle', { partner: 'رعنا', cutoff: cut.v, cap: cap.get(), share: share.get(), payout: pay.get(), paid_base: (S.totals || {}).payout_r || 0, note: note.value }, { queue: false }); toast('تسویه ثبت و قفل شد'); await reload(); }
      catch (e) { toast(errText(e), 'err'); go.disabled = false; }
    };
    return [
      h('p', { class: 'hint' }, 'عددها از همان فرمول صفحه‌ی «مالی» پر شده‌اند. اگر با حساب دستی‌ات فرق دارد، همین‌جا اصلاح کن؛ بعد از ثبت ثابت می‌شوند.'),
      owedBox,
      h('section', { class: 'card' }, h('div', { class: 'ct' }, 'عددهای روز قطع'),
        h('div', { class: 'form' }, field('تاریخ قطع', dateField(cut.v, v => { cut.v = v; upd(); })), field('سرمایه‌ی آورده‌شده‌ی رعنا و مهدی', cap), field('سهم از سود تا روز قطع', share), field('برداشت‌شده تا حالا', pay), field('توضیح', note)), lateBox),
      h('section', { class: 'card' }, h('div', { class: 'ct' }, 'چک‌های مهدی'), chequeTable(), h('p', { class: 'hint' }, 'این چک‌ها در عدد بدهی نیستند. سررسید که شد خودمان با مهدی تسویه می‌کنیم و دیگر یادآور واریز برابری نمی‌رود.')),
      h('div', { class: 'row-actions' }, go)];
  }

  function chequeTable() {
    return dtable([{ label: 'سررسید', main: true, render: c => jstr(c.due_date) }, { label: 'بانک / تحویل', hm: true, render: c => [c.bank, c.supplier].filter(Boolean).join(' · ') }, { label: 'مبلغ (ریال)', cls: 'num', render: c => N(c.amount) }, { label: 'وضعیت', hm: true, render: c => pill(c.state === 'open' ? 'باز' : c.state === 'passed' ? 'سررسید گذشته' : 'برگشتی', c.state === 'bounced' ? 'red' : 'amber') }],
      exitCheques(), { onRow: () => { location.hash = '#/cheques'; }, empty: 'چک بازِ مهدی نداریم', foot: ['جمع', '', N(exitChequeTotal()), ''] });
  }

  /* ---------- بعد از ثبت ---------- */
  function doneView(rec) {
    const owed = Number(rec.owed), paid = exitPaid(rec), left = exitLeft(rec), pctPaid = owed > 0 ? Math.min(100, Math.round(paid / owed * 100)) : 100;
    const rp = pockets().find(a => a.owner === 'رعنا'), pays = exitPayments(rec), plan = planRows(left);
    return [
      h('div', { class: 'kpis' },
        kpi('بدهی ثابت‌شده', N(owed), { sub: 'ریال · قطع ' + jstr(rec.cutoff) }), kpi('پرداخت‌شده از آن روز', N(paid), { sub: 'ریال · ' + fmt(pctPaid) + '٪', tone: 'pos' }),
        kpi('مانده برای پرداخت', N(left), { sub: 'ریال', tone: left > 0 ? 'warn' : 'pos' }), kpi('چک‌های مهدی (جدا)', N(exitChequeTotal()), { sub: 'ریال · ' + exitCheques().length + ' چک' })),
      h('div', { class: 'xbar' }, h('div', { class: 'xfill', style: `width:${pctPaid}%` })),
      h('div', { class: 'row-actions' },
        btn('ثبت پرداخت به رعنا / مهدی', () => transferForm({ kind: 'profit_payout', to: rp && rp.id }), 'primary'),
        btn('اکسل کالای منتقل‌شده', () => snapshotXlsx(rec), 'ghost'),
        btn('بستن ورود رعنا و مهدی', async () => {
          if (!(await confirmBox('ورود رعنا و مهدی بسته و پیام‌های بات‌شان خاموش می‌شود. سوابق‌شان می‌ماند. ادامه؟', 'بله، ببند', true))) return;
          try { const r = await api('/api/exit/deactivate/', { method: 'POST', body: { names: ['رعنا', 'مهدی'] } }); toast('ورود بسته شد: ' + ((r.data && r.data.deactivated) || []).join('، ') || 'انجام شد'); } catch (e) { toast(errText(e), 'err'); }
        }, 'ghost')),
      h('section', { class: 'card' }, h('div', { class: 'ct' }, 'عددهای قفل‌شده'),
        ...[['سرمایه‌ی آورده‌شده', rec.cap], ['+ سهم از سود تا قطع', rec.share], ['− برداشت‌شده تا قطع', -rec.payout], ['= بدهی در روز قطع', rec.owed]].map(([k, v], i) => h('div', { class: 'srow' + (i === 3 ? ' bold' : '') }, h('span', null, k), N(v))),
        h('p', { class: 'hint' }, `ثبت‌کننده: ${rec.created_by || ''} · ${jstr(String(rec.created_at).slice(0, 10))}${rec.note ? ' · ' + rec.note : ''}`)),
      h('section', { class: 'card' }, h('div', { class: 'ct' }, 'پرداخت‌های بعد از قطع'),
        dtable([{ label: 'تاریخ', main: true, render: t => jstr(t.date) }, { label: 'مبلغ (ریال)', cls: 'num', render: t => N(t.amount) }, { label: 'توضیح', hm: true, render: t => t.note || '' }], pays, { empty: 'هنوز پرداختی ثبت نشده', foot: pays.length ? ['جمع', N(paid), ''] : undefined }),
        h('p', { class: 'hint' }, 'هر «برداشت سود» به جیب رعنا بعد از ثبت این تسویه، خودکار از بدهی کم می‌شود.')),
      left > 0 ? h('section', { class: 'card' }, h('div', { class: 'ct' }, 'برنامه‌ی پیشنهادی پرداخت (بر اساس فروش واقعی)'),
        h('div', { class: 'form' }, field('درصد ثابت از فروش ماهانه (خالی = بر اساس فروش واقعی)', h('input', { class: 'inp', dir: 'ltr', inputmode: 'decimal', value: PLAN.pct, oninput: e => { PLAN.pct = e.target.value; draw(); } })), field('حداقل پرداخت ماهانه (ریال)', numField({ value: PLAN.min, onInput: v => { PLAN.min = v; } }))),
        plan.rows.length ? dtable([{ label: 'ماه', main: true, render: r => r[0] }, { label: 'پرداخت (ریال)', cls: 'num', render: r => r[1] }, { label: 'مانده (ریال)', cls: 'num', render: r => r[2] }], plan.rows.slice(0, 12), {}) : h('div', { class: 'hint' }, 'برای برنامه، فروش ماهانه‌ی کافی ثبت نشده.')) : null,
      h('section', { class: 'card' }, h('div', { class: 'ct' }, 'چک‌های مهدی'), chequeTable(), h('p', { class: 'hint' }, 'این چک‌ها در عدد بدهی نیستند؛ سررسید که شد جدا با مهدی تسویه می‌شود.')),
      h('section', { class: 'card' }, h('div', { class: 'ct' }, `کالای منتقل‌شده به مهسا (${fmt(rec.stock_units)} عدد · ${R(rec.stock_value)} ریال)`),
        dtable([{ label: 'کالا', main: true, render: x => x.item }, { label: 'تعداد', cls: 'num', render: x => fmt(x.qty) }, { label: 'ارزش (ریال)', cls: 'num', render: x => N(x.qty * x.unit_cost) }], [...(rec.stock_snapshot || [])].sort((a, b) => b.qty * b.unit_cost - a.qty * a.unit_cost), {}))];
  }

  draw();
  return root;
}
