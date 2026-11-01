/* انبارگردانی (شمارش واقعی انبار): جنس هر نفر را می‌شماری، با سیستم می‌سنجی و اختلاف به‌صورت «کسری/مازاد موجودی» در سود ثبت می‌شود */
import { h, fmt, jstr, todayISO, toast, parseNum, sum } from '../util.js';
import { S, rpc, bus, simulateFifo, canEdit, errText } from '../store.js';
import { N, pill, chips, dateField, field, modal, run, kpi, dtable, confirmBox, promptBox } from '../ui.js';
import { head, btn, searchBox, match, sortNew, stamp, detail, rowCls } from './common.js';
import { voidEntry } from '../forms_misc.js';
import { invTabs } from './invtabs.js';

export const REASONS = ['گم‌شده', 'خراب', 'خطای ثبت', 'نمونه/هدیه', 'برگشتی'];
const isAdmin = () => !!(S.me && S.me.role === 'admin');
const isViewer = () => !!(S.me && S.me.role === 'viewer');
const limit = () => { const r = (S.settings || []).find(x => x.key === 'stocktake_limit'); return r ? Number(r.value) : 5000000; };
const holdKey = hd => (hd === 'مهسا' ? 'rem_m' : 'rem_r');
const itemName = i => i.name;
const lastCost = id => { const ls = S.lots.filter(l => l.item_id === id && !l.voided).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)); return ls.length ? ls[0].landed_unit : 0; };
/** ارزش اختلاف یک کالا: کسری از قدیمی‌ترین دسته (FIFO)، مازاد با قیمت تمام‌شده‌ی آخرین دسته */
export function diffValue(itemId, holder, diff) {
  if (diff < 0) return -simulateFifo(itemId, holder, -diff).cost;
  if (diff > 0) return diff * lastCost(itemId);
  return 0;
}
const STATUS = { pending: ['در انتظار تأیید', 'amber'], posted: ['ثبت‌شده', 'green'], rejected: ['ردشده', 'red'] };
const stPill = t => (t.voided && t.status !== 'rejected' ? pill('باطل', 'red') : pill(...(STATUS[t.status] || [t.status, 'gray'])));
const linesOf = id => (S.stocktakeLines || []).filter(l => l.stocktake_id === id);
const accuracy = id => { const ls = linesOf(id); return ls.length ? Math.round(ls.filter(l => l.diff === 0).length / ls.length * 100) : null; };

export function render() {
  const root = h('div');
  let mode = 'list';
  const show = () => {
    root.replaceChildren(
      invTabs('stocktake'),
      head('گزارش انبارگردانی', isViewer() ? [] : [btn('＋ شروع شمارش', () => { mode = 'count'; show(); })],
        'جنس واقعی هر نفر را بشمار و با سیستم بسنج. کسری از قدیمی‌ترین دسته (FIFO) کم می‌شود و در سود می‌آید؛ هیچ‌چیز پاک نمی‌شود و هر انبارگردانی قابل ابطال است.'),
      mode === 'count' ? countForm(() => { mode = 'list'; show(); }) : list(() => show()));
  };
  show();
  return root;
}

function list(redraw) {
  const T = (S.stocktakes || []).slice().sort(sortNew);
  const posted = T.filter(t => t.status === 'posted' && !t.voided), pending = T.filter(t => t.status === 'pending' && !t.voided);
  const accs = posted.map(t => accuracy(t.id)).filter(x => x != null), acc = accs.length ? Math.round(sum(accs) / accs.length) : null;
  const wrap = h('div');
  wrap.append(h('div', { class: 'kpis' },
    kpi('دقت انبار (میانگین)', acc == null ? '—' : fmt(acc) + '٪', { sub: acc == null ? 'هنوز شمارشی ثبت نشده' : 'سهم کالاهایی که شمارش با سیستم می‌خواند', tone: acc != null && acc < 90 ? 'neg' : '' }),
    kpi('در انتظار تأیید', fmt(pending.length), { tone: pending.length ? 'neg' : '' }),
    kpi('کسری ثبت‌شده', fmt(Math.round(sum(posted, t => t.loss_value))), { sub: 'جمع انبارگردانی‌های ثبت‌شده' }),
    kpi('مازاد ثبت‌شده', fmt(Math.round(sum(posted, t => t.gain_value))))));
  const cols = [
    { label: 'شماره', main: true, render: t => h('span', null, t.no, ' ', stPill(t)) }, { label: 'تاریخ', render: t => jstr(t.date) }, { label: 'انبار', render: t => t.holder },
    { label: 'کالا', cls: 'num', hm: true, render: t => linesOf(t.id).length }, { label: 'دقت', cls: 'num', hm: true, render: t => (accuracy(t.id) == null ? '—' : accuracy(t.id) + '٪') },
    { label: 'کسری', cls: 'num', render: t => N(t.loss_value) }, { label: 'مازاد', cls: 'num', render: t => N(t.gain_value) }, { label: 'ثبت‌کننده', hm: true, render: t => t.created_by }];
  wrap.append(h('div', { class: 'card' }, h('div', { class: 'ct' }, 'تاریخچه‌ی انبارگردانی'), dtable(cols, T, { onRow: t => view(t, redraw), rowCls, empty: 'هنوز انبارگردانی انجام نشده. «شروع شمارش» را بزن.' })));
  return wrap;
}

function view(t, redraw) {
  const ls = linesOf(t.id);
  const tbl = dtable([
    { label: 'کالا', main: true, render: l => (S.I[l.item_id] || {}).name || '' }, { label: 'سیستم', cls: 'num', render: l => l.sys_qty }, { label: 'شمارش', cls: 'num', render: l => h('b', null, l.counted) },
    { label: 'اختلاف', cls: 'num', render: l => h('span', { class: 'n ' + (l.diff < 0 ? 'neg' : l.diff > 0 ? 'pos' : '') }, (l.diff > 0 ? '+' : '') + l.diff) }, { label: 'ارزش', cls: 'num', render: l => N(l.value) }, { label: 'دلیل', render: l => l.reason || '' }], ls, { empty: '' });
  const acts = [];
  if (t.status === 'pending' && !t.voided) {
    if (isAdmin()) acts.push(btn('تأیید و ثبت', async () => { if (!(await confirmBox('تأیید شود؟ موجودی و سود همین حالا اصلاح می‌شود (قابل ابطال).', 'تأیید و ثبت'))) return; try { await rpc('approve_stocktake', { id: t.id }); toast('انبارگردانی ثبت شد'); m.close(); await bus.refresh(); } catch (e) { toast(errText(e), 'err'); } }));
    if (canEdit()) acts.push(btn('رد کردن', async () => { const why = await promptBox('دلیل رد', 'مثلاً دوباره بشمار'); if (!why) return; try { await rpc('reject_stocktake', { id: t.id, reason: why }); toast('رد شد'); m.close(); await bus.refresh(); } catch (e) { toast(errText(e), 'err'); } }, 'danger ghost'));
  } else if (t.status === 'posted' && !t.voided && canEdit()) acts.push(btn('ابطال انبارگردانی', async () => { if (await voidEntry('stocktake', t, 'انبارگردانی ' + t.no)) m.close(); }, 'danger ghost'));
  const m = detail({ title: `انبارگردانی ${t.no}`, rows: [['وضعیت', stPill(t)], ['تاریخ', jstr(t.date)], ['انبار', t.holder], t.scope ? ['محدوده', t.scope] : null, ['شمارش کور', t.blind ? 'بله' : 'خیر'], ['کسری', N(t.loss_value)], ['مازاد', N(t.gain_value)], ['خالص اثر روی سود', N(t.gain_value - t.loss_value)],
    ['ثبت‌کننده', stamp(t)], t.posted_by ? ['تأییدکننده', t.posted_by] : null, t.voided ? ['باطل/رد', t.void_reason || ''] : null], extra: [tbl], actions: acts });
}

function countForm(done) {
  const meName = S.me && S.me.name;
  let holder = meName === 'رعنا' ? 'رعنا' : 'مهسا', date = todayISO(), cat = '', blind = false, q = '';
  const counted = new Map(), reason = new Map();   // item_id → عدد / دلیل
  const catsAll = [...new Set(S.stock.filter(i => i.active).map(i => i.category || 'بدون دسته'))];
  const sys = i => i[holdKey(holder)];
  const scoped = () => S.stock.filter(i => i.active && (!cat || (i.category || 'بدون دسته') === cat) && match(q, i.code, i.name, i.category, i.color, i.size))
    .sort((a, b) => (sys(b) > 0) - (sys(a) > 0) || a.name.localeCompare(b.name, 'fa'));
  const calc = () => {
    let sh = 0, shV = 0, su = 0, suV = 0, n = 0, bad = 0;
    for (const [id, c] of counted) { const i = S.I[id]; if (!i) continue; const st = S.stock.find(x => x.id === id); n++; const d = c - sys(st); if (d !== 0) { bad++; const v = diffValue(id, holder, d); if (d < 0) { sh += -d; shV += -v; } else { su += d; suV += v; } } }
    return { n, bad, sh, shV, su, suV, net: suV - shV };
  };
  const setup = h('div'), rowsHost = h('div', { class: 'stk-rows' }), side = h('div', { class: 'stk-side' }), submit = h('button', { class: 'btn primary lg', type: 'button' }, 'ثبت انبارگردانی');
  const rowEl = i => {
    const id = i.id, st = S.stock.find(x => x.id === id), has = counted.has(id), c = counted.get(id), d = has ? c - sys(st) : 0;
    const inp = h('input', { class: 'inp stk-in', type: 'text', inputmode: 'numeric', dir: 'ltr', placeholder: '—', autocomplete: 'off', 'aria-label': 'تعداد شمارش‌شده ' + i.name, value: has ? String(c) : '' });
    inp.addEventListener('input', () => { const s = inp.value.trim(); if (s === '') counted.delete(id); else counted.set(id, Math.max(0, Math.round(parseNum(s) || 0))); if (!counted.has(id)) reason.delete(id); paintRow(); paintSide(); });
    const row = h('div', { class: 'stk-row' + (has && d !== 0 ? ' dif' : '') });
    const paintRow = () => {
      const has2 = counted.has(id), d2 = has2 ? counted.get(id) - sys(st) : 0;
      row.className = 'stk-row' + (has2 && d2 !== 0 ? ' dif' : '') + (has2 ? ' done' : '');
      dif.textContent = !has2 ? '' : d2 === 0 ? '✓ می‌خواند' : (d2 > 0 ? '+' : '') + fmt(d2);
      dif.className = 'stk-df ' + (!has2 || d2 === 0 ? 'pos' : d2 < 0 ? 'neg' : 'pos');
      val.textContent = has2 && d2 !== 0 ? fmt(Math.round(diffValue(id, holder, d2))) : '';
      rs.replaceChildren(...(has2 && d2 !== 0 ? [chips(REASONS.map(r => ({ v: r, label: r })), reason.get(id) || '', v => { reason.set(id, v); paintSide(); }, { cls: 'stk-rs', label: 'دلیل اختلاف' })] : []));
    };
    const dif = h('span'), val = h('span', { class: 'n stk-v' }), rs = h('div', { class: 'stk-rsw' });
    row.append(h('div', { class: 'stk-n' }, h('b', null, itemName(i)), h('small', null, [i.color, i.size].filter(Boolean).join(' · '))),
      h('div', { class: 'stk-s' }, h('small', null, 'سیستم'), h('b', null, blind ? '؟' : String(sys(st)))), h('div', { class: 'stk-c' }, h('small', null, 'شمارش'), inp), h('div', { class: 'stk-d' }, dif, val), rs);
    paintRow(); return row;
  };
  const paintSide = () => {
    const c = calc(), over = Math.max(c.shV, c.suV) > limit(), needAppr = !isAdmin() && (!canEdit() || over), miss = [...counted.keys()].filter(id => { const st = S.stock.find(x => x.id === id); return counted.get(id) !== sys(st) && !reason.get(id); }).length;
    const total = scoped().length;
    side.replaceChildren(h('div', { class: 'z2' }, h('div', { class: 'zt dark' }, h('i', null, '∑'), 'نتیجه‌ی شمارش'),
      h('div', { class: 'zx' },
        h('div', { class: 'srow' }, h('span', null, 'شمارش‌شده'), h('b', null, `${fmt(c.n)} از ${fmt(total)}`)),
        h('div', { class: 'srow' }, h('span', null, 'کالای دارای اختلاف'), h('b', null, fmt(c.bad))),
        h('div', { class: 'srow' }, h('span', null, `کسری · ${fmt(c.sh)} عدد`), N(-c.shV)),
        h('div', { class: 'srow' }, h('span', null, `مازاد · ${fmt(c.su)} عدد`), N(c.suV)),
        h('div', { class: 'srow tot' }, h('b', null, 'خالص اثر روی سود'), N(c.net)),
        h('div', { class: 'srow' }, h('span', null, 'سهم هر شریک (۵۰/۵۰)'), N(c.net / 2)),
        h('p', { class: 'hint' }, 'کسری از قدیمی‌ترین دسته (FIFO) کم و با عنوان «کسری موجودی» هزینه می‌شود؛ مازاد با قیمت تمام‌شده‌ی آخرین دسته وارد و «مازاد انبارگردانی» می‌شود. پول حساب‌ها تغییر نمی‌کند و همه‌چیز قابل ابطال است.'),
        needAppr ? h('p', { class: 'hint warn' }, !canEdit() ? 'شمارش تو برای تأیید مدیر ارسال می‌شود و تا تأیید، موجودی تغییر نمی‌کند.' : 'اختلاف از سقف مجاز بیشتر است؛ برای تأیید مدیر ارسال می‌شود.') : null,
        miss ? h('p', { class: 'hint warn' }, `برای ${fmt(miss)} کالا دلیل اختلاف را انتخاب کن.`) : null, submit)));
    submit.textContent = needAppr ? 'ارسال برای تأیید مدیر' : 'ثبت انبارگردانی'; submit.disabled = c.n === 0 || miss > 0;
  };
  const drawSetup = () => setup.replaceChildren(h('div', { class: 'z2' }, h('div', { class: 'zt' }, h('i', null, '۱'), 'تنظیم شمارش'), h('div', { class: 'zx stk-set' },
    field('انبارِ چه کسی؟', chips([{ v: 'مهسا', label: 'مهسا' }, { v: 'رعنا', label: 'رعنا' }], holder, v => { holder = v; counted.clear(); reason.clear(); drawRows(); paintSide(); }, { cls: 'two' })),
    field('تاریخ', dateField(date, v => { date = v; })),
    field('محدوده', chips([{ v: '', label: 'همه‌ی کالاها' }, ...catsAll.map(c => ({ v: c, label: c }))], cat, v => { cat = v; drawRows(); paintSide(); }, { label: 'محدوده' })),
    field('شمارش کور', chips([{ v: false, label: 'سیستم دیده شود' }, { v: true, label: 'کور (موجودی سیستم پنهان)' }], blind, v => { blind = v; drawRows(); }, { cls: 'two', label: 'شمارش کور' }), 'در شمارش کور موجودی سیستم تا ثبت دیده نمی‌شود تا شمارنده تحت تأثیر قرار نگیرد.'))));
  const drawRows = () => rowsHost.replaceChildren(...scoped().map(rowEl));
  submit.onclick = async () => {
    const lines = [...counted].map(([item_id, c]) => ({ item_id, counted: c, reason: reason.get(item_id) || '' }));
    const r = await run(submit, () => rpc('save_stocktake', { date, holder, scope: cat || 'همه‌ی کالاها', blind, lines }));
    if (!r) return;
    toast(r.status === 'pending' ? 'برای تأیید مدیر ارسال شد' : 'انبارگردانی ثبت شد ✔'); await bus.refresh(); done();
  };
  drawSetup(); drawRows(); paintSide();
  const sb = searchBox(v => { q = v; drawRows(); }, 'جستجوی کالا…');
  return h('div', { class: 'stk' }, h('div', { class: 'stk-main' }, setup,
    h('div', { class: 'z2' }, h('div', { class: 'zt' }, h('i', null, '۲'), 'شمارش کالاها', h('small', null, 'خالی بگذار = نشمردم')), h('div', { class: 'zx' }, sb, rowsHost)),
    h('div', null, btn('انصراف', done, 'ghost'))), side);
}
