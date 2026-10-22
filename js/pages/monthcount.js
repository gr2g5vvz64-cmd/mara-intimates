/* انبارگردانی ماهانه: اول هر ماه شمسی مهسا و رعنا اموال خودشان را می‌شمارند؛ مدیر مقایسه و نتیجه را می‌بیند و تأیید می‌کند */
import { h, fmt, jstr, toast, parseNum, sum } from '../util.js';
import { S, rpc, api, bus, errText } from '../store.js';
import { N, pill, chips, field, run, kpi, dtable, confirmBox } from '../ui.js';
import { head, btn, stamp } from './common.js';
import { diffValue } from './stocktake.js';
import { invTabs } from './invtabs.js';

const isAdmin = () => !!(S.me && S.me.role === 'admin');
const isPartner = () => !!(S.me && ['مهسا', 'رعنا'].includes(S.me.name) && S.me.role !== 'viewer');
const dt = ts => { if (!ts) return '—'; try { return new Date(ts).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return String(ts).slice(0, 16); } };
const partsOf = id => (S.monthlyParts || []).filter(p => p.count_id === id);
const linesOf = (id, holder) => (S.monthlyLines || []).filter(l => l.count_id === id && l.holder === holder);
const nameOf = id => (S.I[id] || {}).name || '';
const variant = id => { const i = S.I[id] || {}; return [i.color, i.size].filter(Boolean).join(' · '); };
const holdKey = hd => (hd === 'مهسا' ? 'rem_m' : 'rem_r');

/** تعداد کار باز برای نشان‌گر منو: شریک ← شمارش تکمیل‌نشده‌ی خودش؛ مدیر ← ماه بازی که نیاز به اقدام دارد */
export function openCount() {
  const open = (S.monthlyCounts || []).filter(c => c.status === 'open'); if (!open.length) return { n: 0, red: false };
  if (isPartner()) { const mine = open.filter(c => { const p = partsOf(c.id).find(x => x.holder === S.me.name); return p && !p.completed_at; }); return { n: mine.length, red: mine.length > 0 }; }
  if (isAdmin()) { const act = open.filter(c => partsOf(c.id).filter(p => p.completed_at).length === 2); return { n: open.length, red: act.length > 0 }; }
  return { n: 0, red: false };
}

export function render(query) {
  const root = h('div'); let counts = [];
  const reload = () => { counts = (S.monthlyCounts || []).slice().sort((a, b) => b.id - a.id); };
  reload();
  let sel = Number(query && query.get('c')) || (counts[0] && counts[0].id) || 0;
  const show = () => {
    reload(); const cnt = counts.find(c => c.id === sel);
    root.replaceChildren(...[invTabs('monthcount'), head('شروع انبارگردانی ماهانه', isAdmin() ? [btn('＋ شروع و ارسال پیام این ماه', startNow)] : [], 'اول هر ماه شمسی به مهسا و رعنا پیام می‌رسد تا اموال خودشان را بشمارند؛ نتیجه برای مدیر گزارش می‌شود.'),
      counts.length ? chips(counts.map(c => ({ v: c.id, label: c.title + (c.status === 'open' ? ' · باز' : ' · بسته') })), sel, v => { sel = v; show(); }, { cls: 'catf', label: 'ماه' }) : null,
      !cnt ? h('div', { class: 'card' }, h('p', null, 'هنوز انبارگردانی ماهانه‌ای شروع نشده.'), isAdmin() ? h('p', { class: 'hint' }, 'اول هر ماه شمسی خودکار ساخته می‌شود (با کرون «nightly» یا «monthly_count»). برای شروع دستی «＋ شروع و ارسال پیام این ماه» را بزن.') : null)
        : (isPartner() ? partnerView(cnt, show) : adminView(cnt, show))].filter(Boolean));
  };
  const startNow = async () => {
    if (!(await confirmBox('انبارگردانی این ماه شروع و پیام برای مهسا و رعنا (بله و تلگرام) ارسال شود؟', 'شروع و ارسال'))) return;
    try { const r = await api('/api/monthly-count/start/', { method: 'POST', body: {} }); toast('پیام ارسال شد ✔'); await bus.refresh(); sel = r.data.count_id; show(); } catch (e) { toast(errText(e), 'err'); }
  };
  show(); return root;
}

/* ---------------- شریک: جدول شمارش اموال خودش ---------------- */
function partnerView(cnt, redraw) {
  const me = S.me.name, part = partsOf(cnt.id).find(p => p.holder === me);
  const wrap = h('div');
  if (!part) return h('div', { class: 'card' }, 'برای تو شمارشی در این ماه تعریف نشده.');
  if (part.completed_at || cnt.status !== 'open') {
    const ls = linesOf(cnt.id, me), bad = ls.filter(l => l.diff !== 0);
    wrap.append(h('div', { class: 'card' }, h('div', { class: 'ct' }, `✅ انبارگردانی ${cnt.title} · ${me}`),
      h('div', { class: 'srow' }, h('span', null, 'وضعیت'), pill(part.completed_at ? 'تکمیل شد' : 'تکمیل نشد', part.completed_at ? 'green' : 'amber')), h('div', { class: 'srow' }, h('span', null, 'زمان تکمیل'), h('b', null, dt(part.completed_at))),
      h('div', { class: 'srow' }, h('span', null, 'اختلاف با سیستم'), h('b', null, bad.length ? fmt(bad.length) + ' قلم' : 'ندارد ✓')),
      part.completed_at ? h('p', { class: 'hint' }, 'ممنون که اموالت را دقیق شمردی 🌷. اگر اشتباهی شده از مدیر بخواه شمارش را دوباره باز کند.') : null),
      ls.length ? h('div', { class: 'card' }, h('div', { class: 'ct' }, 'اعداد ثبت‌شده‌ی من'), dtable([{ label: 'کالا', main: true, render: l => nameOf(l.item_id) }, { label: 'سیستم', cls: 'num', render: l => l.sys_qty }, { label: 'شمارش من', cls: 'num', render: l => h('b', null, l.counted) },
        { label: 'اختلاف', cls: 'num', render: l => h('span', { class: 'n ' + (l.diff < 0 ? 'neg' : l.diff > 0 ? 'pos' : '') }, l.diff === 0 ? '✓' : (l.diff > 0 ? '+' : '') + l.diff) }], ls, { empty: '' })) : null);
    return wrap;
  }
  const key = `mara.mc.${cnt.id}.${me}`, draft = (() => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } })();
  const counted = new Map(Object.entries(draft).map(([k, v]) => [Number(k), Number(v)]));
  const items = S.stock.filter(i => i.active).map(i => ({ i, sys: i[holdKey(me)] }));
  const mine = items.filter(x => x.sys > 0).sort((a, b) => a.i.name.localeCompare(b.i.name, 'fa')), extra = items.filter(x => x.sys === 0).sort((a, b) => a.i.name.localeCompare(b.i.name, 'fa'));
  let okChk = false; const submit = h('button', { class: 'btn primary lg', type: 'button' }, `ثبت و تکمیل انبارگردانی ${cnt.title}`);
  const saveDraft = () => { try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(counted))); } catch { /* بدون پیش‌نویس هم کار می‌کند */ } };
  const info = h('div'), prog = h('div', { class: 'prog' }, h('i', { style: 'width:0%' }));
  const row = x => {
    const id = x.i.id, inp = h('input', { class: 'inp stk-in', type: 'text', inputmode: 'numeric', dir: 'ltr', placeholder: '—', autocomplete: 'off', 'aria-label': 'تعداد شمارش‌شده ' + x.i.name, value: counted.has(id) ? String(counted.get(id)) : '' });
    const dif = h('span'), el = h('div', { class: 'stk-row' });
    const paint = () => { const has = counted.has(id), d = has ? counted.get(id) - x.sys : 0; el.className = 'stk-row' + (has && d !== 0 ? ' dif' : '') + (has ? ' done' : ''); dif.textContent = !has ? '' : d === 0 ? '✓ می‌خواند' : (d > 0 ? '+' : '') + fmt(d); dif.className = 'stk-df ' + (!has || d >= 0 ? 'pos' : 'neg'); };
    inp.addEventListener('input', () => { const s = inp.value.trim(); if (s === '') counted.delete(id); else counted.set(id, Math.max(0, Math.round(parseNum(s) || 0))); saveDraft(); paint(); status(); });
    el.append(h('div', { class: 'stk-n' }, h('b', null, x.i.name), h('small', null, [x.i.color, x.i.size].filter(Boolean).join(' · '))), h('div', { class: 'stk-s' }, h('small', null, 'سیستم'), h('b', null, String(x.sys))), h('div', { class: 'stk-c' }, h('small', null, 'شمارش'), inp), h('div', { class: 'stk-d' }, dif)); paint(); return el;
  };
  const status = () => {
    const done = mine.filter(x => counted.has(x.i.id)).length, total = mine.length, diffs = [...counted].filter(([id, c]) => { const x = items.find(y => y.i.id === id); return x && c !== x.sys; });
    prog.firstChild.style.width = (total ? Math.round(done / total * 100) : 100) + '%';
    info.replaceChildren(...[h('div', { class: 'srow' }, h('span', null, 'شمرده‌شده'), h('b', null, `${fmt(done)} از ${fmt(total)} قلم`)), h('div', { class: 'srow' }, h('span', null, 'قلم دارای اختلاف'), h('b', { class: diffs.length ? 'neg' : '' }, fmt(diffs.length))),
      diffs.length ? h('p', { class: 'hint warn' }, 'قلم‌های دارای اختلاف: ' + diffs.map(([id]) => nameOf(id)).join('، ') + '. اگر درست شمرده‌ای همین را تأیید کن؛ مدیر بررسی می‌کند.') : null].filter(Boolean));
    submit.disabled = !(okChk && done === total);
  };
  const ck = h('label', { class: 'ck' }, h('input', { type: 'checkbox', onchange: e => { okChk = e.target.checked; status(); } }), h('span', null, 'تأیید می‌کنم که اموال و موجودی دستم را یکی‌یکی شمرده‌ام و اعداد بالا درست است.'));
  submit.onclick = async () => {
    const lines = [...counted].map(([item_id, c]) => ({ item_id, counted: c }));
    const r = await run(submit, () => rpc('submit_monthly_count', { count_id: cnt.id, confirm: true, lines }, { queue: false }));
    if (!r) return; try { localStorage.removeItem(key); } catch { /* */ } toast('انبارگردانی ثبت شد؛ ممنون 🙏'); const pt = partsOf(cnt.id).find(x => x.holder === me); if (pt) pt.completed_at = new Date().toISOString(); redraw(); await bus.refresh(); redraw();
  };
  wrap.append(h('div', { class: 'z2' }, h('div', { class: 'zt' }, h('i', null, '۱'), `جدول شمارش اموال من (${me})`, h('small', null, 'اگر بسته شد، اعدادت می‌ماند')), h('div', { class: 'zx' },
    h('p', { class: 'hint' }, 'برای هر کالا تعداد واقعی که دستت هست را بنویس. جلوی هر کالا تعداد سیستم را می‌بینی.'), h('div', { class: 'stk-rows' }, ...mine.map(row)), prog, info,
    extra.length ? h('details', { class: 'mcx' }, h('summary', null, `کالای دیگری هم دارم که در سیستم نزد من صفر است (${fmt(extra.length)} کالا)`), h('div', { class: 'stk-rows' }, ...extra.map(row))) : null)),
    h('div', { class: 'z2', style: 'margin-top:12px' }, h('div', { class: 'zt' }, h('i', null, '۲'), 'تأیید نهایی'), h('div', { class: 'zx' }, ck, h('div', { style: 'margin-top:10px' }, submit))));
  status(); return wrap;
}

/* ---------------- مدیر (و مشاهده‌گر): وضعیت، مقایسه، تصمیم ---------------- */
function adminView(cnt, redraw) {
  const wrap = h('div'), parts = partsOf(cnt.id), open = cnt.status === 'open', both = parts.filter(p => p.completed_at).length === 2;
  const waive = new Set();
  const who = h('div', { class: 'card' }, h('div', { class: 'ct' }, `وضعیت ${cnt.title}`, h('small', null, open ? 'باز' : `بسته شد ${dt(cnt.resolved_at)}`)),
    dtable([{ label: 'شریک', main: true, render: p => p.holder }, { label: 'پیام انبارگردانی رفت', render: p => (p.sent_at ? h('span', null, dt(p.sent_at), h('small', null, ' ', [p.sent_tg ? 'تلگرام ✓' : '', p.sent_bale ? 'بله ✓' : ''].filter(Boolean).join(' '))) : '—') },
      { label: 'تکمیل شد', render: p => (p.completed_at ? h('b', { class: 'pos' }, '✓ ' + dt(p.completed_at)) : pill('هنوز نه', 'amber')) }, { label: 'قلم', cls: 'num', hm: true, render: p => linesOf(cnt.id, p.holder).length },
      { label: 'اختلاف', cls: 'num', render: p => { const n = linesOf(cnt.id, p.holder).filter(l => l.diff !== 0).length; return p.completed_at ? h('b', { class: n ? 'neg' : 'pos' }, n ? fmt(n) + ' قلم' : 'ندارد ✓') : '—'; } },
      { label: 'یادآوری', hm: true, render: p => (p.remind_n ? `${fmt(p.remind_n)} بار · ${dt(p.remind_at)}` : '—') },
      { label: '', render: p => (!isAdmin() || !open ? '' : h('span', null, !p.completed_at ? btn('یادآوری', () => remind(p.holder), 'ghost sm') : btn('باز کردن مجدد', () => reopen(p.holder), 'ghost sm'))) }], parts, { empty: '' }));
  const remind = async holder => { try { await api('/api/monthly-count/remind/', { method: 'POST', body: { count_id: cnt.id, holder } }); toast('یادآوری ارسال شد'); await bus.refresh(); redraw(); } catch (e) { toast(errText(e), 'err'); } };
  const reopen = async holder => { if (!(await confirmBox(`شمارش ${holder} دوباره باز شود تا اصلاح کند؟`, 'باز کن'))) return; try { await rpc('reopen_monthly_part', { count_id: cnt.id, holder }, { queue: false }); toast('باز شد'); await bus.refresh(); redraw(); } catch (e) { toast(errText(e), 'err'); } };
  wrap.append(who);
  if (!parts.some(p => p.completed_at)) { wrap.append(h('div', { class: 'card' }, h('p', null, 'هنوز هیچ‌کدام شمارش را تکمیل نکرده‌اند؛ به‌محض تکمیل، گزارش برایت در بله و تلگرام می‌آید.'))); return wrap; }
  // جدول مقایسه
  const live = open ? (S.monthlyCls || []).filter(c => c.count_id === cnt.id) : [];
  const resRows = !open ? (S.monthlyResults || []).filter(r => r.count_id === cnt.id) : [];
  const ids = [...new Set((open ? live.map(r => r.item_id) : (S.monthlyLines || []).filter(l => l.count_id === cnt.id).map(l => l.item_id)))].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fa'));
  const val = (id, h2, q) => (q > 0 ? Math.round(-diffValue(id, h2, -q)) : 0);
  const lossVal = (r, side) => { const q = side === 'm' ? r.loss_m : r.loss_r; return val(r.item_id, side === 'm' ? 'مهسا' : 'رعنا', q); };
  const cmp = [];
  for (const id of ids) {
    if (open) {
      const r = live.find(x => x.item_id === id); if (!r) continue;
      const tags = []; let eff = '';
      if (r.transfer_qty > 0) tags.push(h('span', { class: 'tag y' }, `${fmt(r.transfer_qty)} جابجایی ثبت‌نشده (از ${r.transfer_from})`));
      if (r.loss_m > 0) tags.push(h('span', { class: 'tag r' }, `${fmt(r.loss_m)} کسری مهسا`)); if (r.loss_r > 0) tags.push(h('span', { class: 'tag r' }, `${fmt(r.loss_r)} کسری رعنا`));
      if (r.gain_m > 0) tags.push(h('span', { class: 'tag g' }, `${fmt(r.gain_m)} اضافه مهسا`)); if (r.gain_r > 0) tags.push(h('span', { class: 'tag g' }, `${fmt(r.gain_r)} اضافه رعنا`));
      if (!tags.length) tags.push(h('span', { class: 'tag k' }, 'درست ✓'));
      cmp.push({ id, r, tags });
    }
  }
  const lossAmt = { 'مهسا': 0, 'رعنا': 0 }; let gainAmt = 0, trCnt = 0;
  if (open) for (const c of cmp) { lossAmt['مهسا'] += lossVal(c.r, 'm'); lossAmt['رعنا'] += lossVal(c.r, 'r'); gainAmt += Math.round(diffValue(c.id, 'مهسا', c.r.gain_m) + diffValue(c.id, 'رعنا', c.r.gain_r)); trCnt += c.r.transfer_qty; }
  const dcell = d => (d == null ? '—' : h('b', { class: d < 0 ? 'neg' : d > 0 ? 'pos' : '' }, d === 0 ? '۰' : (d > 0 ? '+' : '') + d));
  if (open) {
    wrap.append(h('div', { class: 'card' }, h('div', { class: 'ct' }, 'مقایسه‌ی کالا به کالا (مهسا و رعنا کنار هم)', h('small', null, 'موجودی سیستم «همین حالا»')),
      dtable([{ label: 'کالا', main: true, render: c => h('span', null, nameOf(c.id), h('small', null, ' ', variant(c.id))) },
        { label: 'سیستم مهسا', cls: 'num', hm: true, render: c => c.r.sys_m ?? '—' }, { label: 'شمارش مهسا', cls: 'num', render: c => c.r.cnt_m ?? '—' }, { label: 'اختلاف مهسا', cls: 'num', render: c => dcell(c.r.d_m) },
        { label: 'سیستم رعنا', cls: 'num', hm: true, render: c => c.r.sys_r ?? '—' }, { label: 'شمارش رعنا', cls: 'num', render: c => c.r.cnt_r ?? '—' }, { label: 'اختلاف رعنا', cls: 'num', render: c => dcell(c.r.d_r) },
        { label: 'تشخیص سیستم', render: c => h('span', null, ...c.tags.flatMap(t => [t, ' '])) },
        { label: 'اعتراض', render: c => { const out = []; for (const [hd, q] of [['مهسا', c.r.loss_m], ['رعنا', c.r.loss_r]]) if (q > 0 && isAdmin()) { const k = hd + ':' + c.id; out.push(h('label', { class: 'chp' }, h('input', { type: 'checkbox', onchange: e => { e.target.checked ? waive.add(k) : waive.delete(k); } }), ` ${hd}: کسر نشود`)); } return h('span', null, ...out); } }], cmp, { empty: 'همه‌چیز می‌خواند ✓' }),
      h('p', { class: 'hint' }, 'جابجایی ثبت‌نشده: یکی کم و دیگری زیاد دارد. کسری واقعی: طرف مقابل زیاد ندارد و از سود همان شریک کسر می‌شود. «اعتراض»: اگر شریک می‌گوید درست شمرده‌ام و تو می‌پذیری، کسر از سود انجام نمی‌شود (کالا همچنان از انبار کم می‌شود و ضرر مشترک است).')));
  } else {
    wrap.append(h('div', { class: 'card' }, h('div', { class: 'ct' }, 'نتیجه‌ی تأییدشده'),
      dtable([{ label: 'کالا', main: true, render: r => nameOf(r.item_id) }, { label: 'شریک', render: r => r.holder }, { label: 'نوع', render: r => (r.kind === 'transfer' ? pill('جابجایی اصلاح‌شد', 'amber') : r.kind === 'loss' ? pill('کسری', 'red') : pill('اضافه', 'green')) },
        { label: 'تعداد', cls: 'num', render: r => r.qty }, { label: 'ارزش', cls: 'num', render: r => N(r.value) }, { label: 'کسر از سود', render: r => (r.kind !== 'loss' ? '' : r.waived ? pill('کسر نشد (اعتراض)', 'gray') : pill('کسر شد', 'red')) }], resRows, { empty: 'اختلافی نبود ✓' })));
  }
  // نمره‌ها
  const sc = p => (S.monthlyScores || []).filter(x => x.partner === p).reduce((a, x) => a + x.points, 0);
  const side = h('div', { class: 'card' }, h('div', { class: 'ct' }, 'خلاصه و تصمیم'),
    open ? [h('div', { class: 'srow' }, h('span', null, 'جابجایی ثبت‌نشده'), h('b', null, `${fmt(trCnt)} عدد`)), h('div', { class: 'srow' }, h('span', null, 'کسری واقعی مهسا (کسر از سود)'), N(-lossAmt['مهسا'])), h('div', { class: 'srow' }, h('span', null, 'کسری واقعی رعنا (کسر از سود)'), N(-lossAmt['رعنا'])), h('div', { class: 'srow' }, h('span', null, 'اضافه‌ی واقعی (وارد انبار)'), N(gainAmt))] : null,
    h('div', { class: 'srow' }, h('span', null, 'نمره‌ی انتقال‌نزده · مهسا'), h('b', { class: sc('مهسا') < 0 ? 'neg' : '' }, fmt(sc('مهسا')))), h('div', { class: 'srow' }, h('span', null, 'نمره‌ی انتقال‌نزده · رعنا'), h('b', { class: sc('رعنا') < 0 ? 'neg' : '' }, fmt(sc('رعنا')))),
    h('p', { class: 'hint' }, 'نمره فعلاً فقط ثبت و نمایش داده می‌شود. هر جابجایی ثبت‌نشده یک نمره‌ی منفی برای هر دو شریک است.'),
    open && isAdmin() ? h('div', null, h('p', { class: 'hint' }, 'مهلت ۲ روزه تا ثبت «جابجایی کالا» توسط خودشان؛ بعدش (یا همین حالا) می‌توانی نتیجه را تأیید کنی: جابجایی‌ها ثبت و نمره‌ی منفی داده می‌شود، کسری واقعی از سود شریک کسر و اضافه وارد انبار می‌شود.'), (() => {
      const b = h('button', { class: 'btn primary lg', type: 'button', disabled: !both }, 'تأیید نتیجه و اعمال');
      b.onclick = async () => { if (!(await confirmBox('نتیجه تأیید و اعمال شود؟ موجودی اصلاح، جابجایی‌ها ثبت و کسری‌ها از سود شریک کسر می‌شود (قابل ابطال از «انبارگردانی» در تاریخچه).', 'تأیید و اعمال'))) return;
        const r = await run(b, () => rpc('resolve_monthly_count', { id: cnt.id, waive: [...waive] }, { queue: false })); if (!r) return; toast('انبارگردانی ماه بسته شد ✔'); await bus.refresh(); redraw(); };
      return both ? b : h('div', null, b, h('div', { class: 'hint' }, 'بعد از تکمیل هر دو شریک فعال می‌شود.')); })()) : null);
  wrap.append(side);
  return wrap;
}
