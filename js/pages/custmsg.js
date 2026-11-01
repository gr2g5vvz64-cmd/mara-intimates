// پیام به مشتری (فقط مدیر): همه‌ی متغیرها دست مدیر است و تا او دکمه را نزند هیچ پیامی نمی‌رود
import { h, toast, jstr, todayISO, fmt } from '../util.js';
import { S, rpc, api, bus, errText, settingNum } from '../store.js';
import { modal, field, run, pill, dtable, confirmBox, kpi } from '../ui.js';
import { head, btn } from './common.js';
import * as M from '../custmsg.js';

const stamp8 = () => todayISO().replace(/-/g, '');
const refresh = async () => { await bus.refresh(); };
const copy = async t => { try { await navigator.clipboard.writeText(t); toast('✅ کپی شد'); } catch { toast('کپی نشد', 'err'); } };

/* ---- پنجره‌ی ارسال یک پیام (دستی؛ هر مشتری و هر فاکتوری) ---- */
export function sendModal(sale, kind) {
  const c = S.CUS[sale.customer_id] || {}, linked = !!c.bale_chat_id;
  const ta = h('textarea', { class: 'inp', rows: 9, style: 'width:100%;direction:rtl' }); ta.value = M.messageFor(kind, sale);
  const log = (channel, status) => rpc('log_customer_msg', { customer_id: sale.customer_id, sale_id: sale.id, kind, channel, status, text: ta.value });
  const wa = M.waLink(c.phone, ta.value);
  const bBale = h('button', { class: 'btn primary', type: 'button', disabled: !linked }, '📨 ارسال با ربات بله');
  bBale.onclick = async () => {
    const r = await run(bBale, () => api('/api/customer-msg/send/', { method: 'POST', body: { customer_id: sale.customer_id, sale_id: sale.id, kind, text: ta.value } }));
    if (r) { toast('✅ ارسال شد'); m.close(); await refresh(); }
  };
  const bWa = h('a', { class: 'btn ghost', href: wa || '#', target: '_blank', rel: 'noopener', onclick: e => { if (!wa) { e.preventDefault(); toast('شماره‌ی مشتری معتبر نیست', 'err'); } } }, '🟢 باز کردن واتس‌اپ');
  const bDone = h('button', { class: 'btn ghost', type: 'button' }, '✔ دستی فرستادم؛ ثبت کن');
  bDone.onclick = async () => { const r = await run(bDone, () => log('manual', 'sent')); if (r) { m.close(); await refresh(); } };
  const bSkip = h('button', { class: 'btn ghost', type: 'button' }, '⏭ این را نفرست');
  bSkip.onclick = async () => { const r = await run(bSkip, () => log('skip', 'skipped')); if (r) { m.close(); await refresh(); } };
  const m = modal({ title: `${M.KIND_LBL[kind]} برای ${c.name || ''} · ${sale.no}`, body: h('div', { class: 'form' },
    h('p', { class: 'hint' }, linked ? '✅ این مشتری ربات بله را فعال کرده؛ می‌توانی مستقیم بفرستی.' : '⚠️ این مشتری هنوز ربات بله را فعال نکرده؛ از واتس‌اپ یا کپی متن استفاده کن.'),
    field('متن پیام (قبل از ارسال هر چه خواستی عوض کن)', ta),
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, bBale, bWa, h('button', { class: 'btn ghost', type: 'button', onclick: () => copy(ta.value) }, '📋 کپی متن'), bDone, bSkip)) });
}

/* ---- ویرایش شماره‌ی مشتری ---- */
function phoneForm(c) {
  const inp = h('input', { class: 'inp', type: 'tel', value: c.phone || '', placeholder: '09123456789', dir: 'ltr' });
  const b = h('button', { class: 'btn primary lg', type: 'button' }, 'ذخیره‌ی شماره');
  b.onclick = async () => { const r = await run(b, () => rpc('set_customer_msg', { customer_id: c.id, mode: c.msg_mode || 'none', phone: inp.value })); if (r) { m.close(); await refresh(); } };
  const m = modal({ title: 'شماره‌ی ' + c.name, body: h('div', { class: 'form' }, field('شماره‌ی موبایل (همان شماره‌ای که در بله دارد)', inp, 'اتصال ربات بله فقط از روی همین شماره انجام می‌شود.'), b) });
}

/* ---- ویرایش متن‌ها ---- */
function textsForm() {
  const t1 = h('textarea', { class: 'inp', rows: 5, style: 'width:100%' }), t2 = h('textarea', { class: 'inp', rows: 7, style: 'width:100%' });
  t1.value = M.tplText('msg_thanks'); t2.value = M.tplText('msg_invoice');
  const b = h('button', { class: 'btn primary lg', type: 'button' }, 'ذخیره‌ی متن‌ها');
  b.onclick = async () => { const r = await run(b, async () => { await rpc('save_text', { key: 'msg_thanks', text: t1.value }); return rpc('save_text', { key: 'msg_invoice', text: t2.value }); }); if (r) { m.close(); await refresh(); toast('✅ متن‌ها ذخیره شد'); } };
  const m = modal({ title: 'متن پیام‌ها', wide: true, body: h('div', { class: 'form' },
    h('p', { class: 'hint' }, 'جاهای خالی که خودکار پر می‌شوند: {name} نام مشتری · {no} شماره‌ی فاکتور · {date} تاریخ · {lines} فهرست کالاها · {total} جمع · {due} مانده/سررسید (فقط اگر مانده دارد).'),
    field('متن تشکر', t1), field('متن فاکتور', t2), b) });
}

/* ---- تنظیمات کلی: کلید، فاصله‌ی روز ---- */
function settingsBox() {
  const on = M.isOn(), st = M.startISO();
  const delay = h('input', { class: 'inp', type: 'number', min: 0, max: 30, value: M.delayDays(), style: 'width:70px' });
  delay.onchange = async () => { try { await rpc('save_setting', { key: 'msg_delay_days', value: Number(delay.value) }); toast('✅ ذخیره شد'); await refresh(); } catch (e) { toast(errText(e), 'err'); } };
  const tog = h('button', { class: 'btn ' + (on ? 'ghost' : 'gold'), type: 'button' }, on ? '⏹ خاموش کن' : '▶ روشن کن (از امروز به بعد)');
  tog.onclick = async () => {
    if (!on && !(await confirmBox('با روشن کردن، فقط فاکتورهای از امروز به بعد در «آماده‌ی ارسال» می‌آیند و باز هم هیچ پیامی بدون زدن دکمه‌ی تو نمی‌رود. فاکتورهای قبلی دست‌نخورده می‌مانند. روشن شود؟', 'روشن کن'))) return;
    const r = await run(tog, async () => { await rpc('save_setting', { key: 'msg_enabled', value: on ? 0 : 1 }); if (!on && !st) await rpc('save_setting', { key: 'msg_start', value: Number(stamp8()) }); return true; });
    if (r) { await refresh(); toast(on ? 'خاموش شد' : 'روشن شد'); }
  };
  const link = M.botLink();
  return h('div', { class: 'card', style: 'margin:8px 0' },
    h('div', { class: 'ct' }, 'کنترل کلی ', pill(on ? 'روشن' : 'خاموش', on ? 'green' : 'gray')),
    h('p', { class: 'hint' }, on ? `لیست «آماده‌ی ارسال» از ${jstr(st)} به بعد ساخته می‌شود؛ ولی پیامی خودکار نمی‌رود، فقط با دکمه‌ی تو.` : 'خاموش است: هیچ فاکتوری در لیست آماده‌ی ارسال نمی‌آید. دکمه‌ی دستی هر فاکتور در بخش پایین همیشه کار می‌کند.'),
    h('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap;align-items:center' }, tog, h('span', null, 'فاصله از ثبت فاکتور تا نوبت پیام: '), delay, h('span', null, 'روز'),
      btn('✏️ متن پیام‌ها', textsForm, 'ghost')),
    link ? h('p', { class: 'hint', style: 'margin-top:8px' }, 'لینک ربات بله برای مشتری‌ها: ', h('b', { dir: 'ltr' }, link), ' ', h('button', { class: 'btn ghost sm', type: 'button', onclick: () => copy(link) }, 'کپی لینک')) : h('p', { class: 'hint' }, 'نام ربات بله (BALE_BOT_USERNAME) هنوز در Render ثبت نشده.'));
}

/* ---- آماده‌ی ارسال ---- */
function dueBox() {
  const list = M.dueList(), host = h('div', { class: 'card', style: 'margin:8px 0' });
  host.append(h('div', { class: 'ct' }, `📬 آماده‌ی ارسال (${fmt(list.length)})`));
  if (!M.isOn()) { host.append(h('p', { class: 'hint' }, 'کلید کلی خاموش است.')); return host; }
  if (!list.length) { host.append(h('p', { class: 'hint' }, 'الان چیزی نوبتش نیست؛ یا همه ارسال شده یا حالت مشتری‌ها «هیچ» است.')); return host; }
  const sendable = list.filter(x => x.cust.bale_chat_id);
  if (sendable.length) {
    const b = h('button', { class: 'btn gold', type: 'button' }, `📨 ارسال همه‌ی ${fmt(sendable.length)} مورد بله‌دار`);
    b.onclick = async () => {
      if (!(await confirmBox(`${fmt(sendable.length)} پیام از راه ربات بله برای مشتری‌ها فرستاده می‌شود. ادامه؟`, 'بفرست'))) return;
      b.disabled = true; let ok = 0, bad = 0;
      for (const x of sendable) { try { await api('/api/customer-msg/send/', { method: 'POST', body: { customer_id: x.cust.id, sale_id: x.sale.id, kind: x.kind, text: M.messageFor(x.kind, x.sale) } }); ok++; } catch { bad++; } }
      toast(`ارسال شد: ${fmt(ok)} · ناموفق: ${fmt(bad)}`, bad ? 'err' : undefined); await refresh();
    };
    host.append(b);
  }
  host.append(dtable([{ label: 'مشتری', render: r => r.cust.name }, { label: 'فاکتور', render: r => `${r.sale.no} · ${jstr(r.sale.date)}` }, { label: 'پیام', render: r => pill(M.KIND_LBL[r.kind], r.kind === 'invoice' ? 'blue' : 'green') },
    { label: 'بله', render: r => (r.cust.bale_chat_id ? '✅' : '—') }, { label: '', render: r => h('button', { class: 'btn ghost sm', type: 'button', onclick: () => sendModal(r.sale, r.kind) }, 'ارسال…') }], list));
  return host;
}

/* ---- مشتری‌ها: شماره، اتصال، حالت ---- */
function custBox() {
  const rows = S.customersT.filter(c => c.active).sort((a, b) => a.name.localeCompare(b.name, 'fa')), host = h('div', { class: 'card', style: 'margin:8px 0' });
  host.append(h('div', { class: 'ct' }, `👥 مشتری‌ها (${fmt(rows.length)})`), h('p', { class: 'hint' }, 'برای هر مشتری انتخاب کن چه چیزی بعد از خرید برایش برود. پیش‌فرض همه «هیچ» است.'));
  const sel = c => {
    const s = h('select', { class: 'inp' }, Object.entries(M.MODES).map(([k, v]) => h('option', { value: k, selected: (c.msg_mode || 'none') === k }, v)));
    s.onchange = async () => { try { await rpc('set_customer_msg', { customer_id: c.id, mode: s.value }); toast('✅ ذخیره شد'); await refresh(); } catch (e) { toast(errText(e), 'err'); } };
    return s;
  };
  host.append(dtable([{ label: 'مشتری', render: c => c.name }, { label: 'شماره', render: c => h('span', null, h('span', { dir: 'ltr' }, c.phone || '—'), ' ', h('button', { class: 'btn ghost sm', type: 'button', onclick: () => phoneForm(c) }, c.phone ? '✏️' : '➕ شماره')) },
    { label: 'ربات بله', render: c => (c.bale_chat_id ? pill('وصل', 'green') : pill('وصل نیست', 'gray')) }, { label: 'پیام بعد از خرید', render: sel }], rows));
  return host;
}

/* ---- همه‌ی فاکتورهای فروش از اول (برای ارسال دستی) و تاریخچه ---- */
function salesBox() {
  const sales = S.vSales.filter(s => !s.voided && s.customer_id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 200), host = h('div', { class: 'card', style: 'margin:8px 0' });
  host.append(h('div', { class: 'ct' }, `🧾 همه‌ی فاکتورهای فروش (${fmt(sales.length)} مورد اخیر)`), h('p', { class: 'hint' }, 'برای هر فاکتور، تشکر یا فاکتور را دستی بفرست. اگر قبلاً رفته باشد علامت ✔ دارد.'));
  const cell = (s, kind) => { const d = M.doneRow(s.id, kind); return d ? pill(d.status === 'sent' ? '✔ رفت' : '⏭ رد شد', d.status === 'sent' ? 'green' : 'gray') : h('button', { class: 'btn ghost sm', type: 'button', onclick: () => sendModal(s, kind) }, M.KIND_LBL[kind] + '…'); };
  host.append(dtable([{ label: 'فاکتور', render: s => `${s.no} · ${jstr(s.date)}` }, { label: 'مشتری', render: s => (S.CUS[s.customer_id] || {}).name || s.customer }, { label: 'جمع', render: s => fmt(Math.round(s.total)) }, { label: 'فاکتور', render: s => cell(s, 'invoice') }, { label: 'تشکر', render: s => cell(s, 'thanks') }], sales));
  const hist = [...S.custMsgs].sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, 30);
  host.append(h('details', { style: 'margin-top:10px' }, h('summary', null, `🕘 تاریخچه‌ی ارسال‌ها (${fmt(S.custMsgs.length)})`),
    dtable([{ label: 'زمان', render: r => jstr(String(r.created_at).slice(0, 10)) }, { label: 'مشتری', render: r => (S.CUS[r.customer_id] || {}).name || '' }, { label: 'نوع', render: r => M.KIND_LBL[r.kind] }, { label: 'راه', render: r => ({ bale: 'بله', manual: 'دستی', skip: 'رد شد' }[r.channel]) }, { label: 'وضعیت', render: r => (r.status === 'sent' ? '✔' : r.status === 'failed' ? '❌ ' + (r.error || '') : '⏭') }], hist)));
  return host;
}

export function render() {
  if (!S.me || S.me.role !== 'admin') return h('div', { class: 'card' }, 'این صفحه فقط برای مدیر است.');
  const linked = S.customersT.filter(c => c.active && c.bale_chat_id).length, withPhone = S.customersT.filter(c => c.active && c.phone).length, nOn = S.customersT.filter(c => c.active && (c.msg_mode || 'none') !== 'none').length;
  return h('div', null, head('پیام به مشتری', [], `${jstr(todayISO())} · فقط مدیر · هیچ پیامی بدون دکمه‌ی تو نمی‌رود`),
    h('div', { class: 'kpis' }, kpi('مشتری با شماره', h('span', { class: 'n' }, fmt(withPhone))), kpi('وصل به ربات بله', h('span', { class: 'n' }, fmt(linked))), kpi('دارای پیام فعال', h('span', { class: 'n' }, fmt(nOn)))),
    settingsBox(), dueBox(), custBox(), salesBox());
}
