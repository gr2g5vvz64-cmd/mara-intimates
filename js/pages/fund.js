// صندوق پاداش: پاداش فروش آشنایان هر ماه در آخرین روز ماه شمسی (و بعد از آن) با یک دکمه در صندوق شخصی ذخیره می‌شود.
// هر شریک فقط صندوق خودش را می‌بیند؛ مدیر هر دو را.
import { h, fmt, jstr, toast } from '../util.js';
import { S, api, errText } from '../store.js';
import { N, pill, kpi, dtable, run, confirmBox, promptBox, errorBox } from '../ui.js';
import { head } from './common.js';

const toman = x => fmt(Math.round(Number(x || 0) / 10));
const when = iso => { if (!iso) return ''; const d = new Date(iso); return jstr(iso.slice(0, 10)) + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }); };

/** ذخیره‌ی پاداش یک ماه برای یک نفر (با تأیید). after() بعد از موفقیت صدا زده می‌شود. */
export async function saveBonus(owner, month, title, amount, btnEl, after) {
  const mine = S.me && S.me.name === owner;
  const ok = await confirmBox(`پاداش ${title}${mine ? '' : ' ' + owner} به مبلغ ${toman(amount)} تومان (${fmt(Math.round(amount))} ریال) در صندوق ${mine ? 'شخصی تو' : owner} ذخیره شود؟ بعد از ذخیره از سود برابر قابل خرید مشترک جدا می‌ماند.`, 'بله، ذخیره کن');
  if (!ok) return;
  await run(btnEl, async () => { const r = await api('/api/fund/save/', { method: 'POST', body: { month, owner } }); if (after) await after(); return r; }, 'پاداش در صندوق ذخیره شد');
}

export function saveBtn(owner, month, title, amount, after) {
  const b = h('button', { type: 'button', class: 'btn primary' }, '🎁 ذخیره‌ی پاداش');
  b.onclick = () => saveBonus(owner, month, title, amount, b, after);
  return b;
}

function ownerBox(o, admin, reload) {
  const rows = o.months.filter(m => m.bonus > 0 || m.saved > 0);
  const mt = dtable([
    { label: 'ماه', main: true, render: r => r.title },
    { label: 'پاداش محاسبه‌شده (ریال)', cls: 'num', render: r => N(r.bonus) },
    { label: 'ذخیره‌شده', cls: 'num', render: r => N(r.saved, r.saved ? 'pos' : '') },
    { label: 'مانده‌ی ذخیره‌نشده', cls: 'num', render: r => N(r.pending) },
    { label: 'وضعیت', render: r => (r.pending < 1 ? pill('ذخیره شد', 'green') : r.open ? saveBtn(o.owner, r.month, r.title, r.pending, reload) : pill('تا آخر ماه (' + jstr(r.ends) + ') قفل است', 'gray')) }
  ], rows, { empty: 'هنوز پاداشی برای این صندوق محاسبه نشده است' });
  const en = dtable([
    { label: 'ماه', main: true, render: r => r.title },
    { label: 'مبلغ (ریال)', cls: 'num', render: r => N(r.amount) },
    { label: 'زمان ذخیره', render: r => when(r.saved_at) },
    { label: 'ذخیره‌کننده', render: r => r.saved_by || '' },
    { label: 'وضعیت', render: r => (r.voided ? pill('باطل: ' + (r.void_reason || ''), 'red') : pill('در صندوق', 'green')) },
    ...(admin ? [{ label: '', render: r => (r.voided ? '' : h('button', { type: 'button', class: 'btn ghost sm', onclick: async () => {
      const why = await promptBox('دلیل ابطال این ذخیره؟'); if (!why) return;
      try { await api('/api/fund/void/', { method: 'POST', body: { id: r.id, reason: why } }); toast('ابطال شد'); reload(); } catch (e) { toast(errText(e), 'err'); } } }, 'ابطال')) }] : [])
  ], o.entries, { empty: 'هنوز چیزی در صندوق ذخیره نشده است' });
  return h('div', { class: 'card fundbox' },
    h('h2', null, '🎁 صندوق ' + o.owner),
    h('div', { class: 'kpis' }, kpi('موجودی صندوق', N(o.balance, 'pos'), { sub: toman(o.balance) + ' تومان' }), kpi('پاداش محاسبه‌شده‌ی ذخیره‌نشده', N(o.pending), { sub: o.pending ? 'در پایان ماه ذخیره می‌شود' : 'همه ذخیره شده' })),
    h('h3', { class: 'sec' }, 'پاداش هر ماه'), mt,
    h('h3', { class: 'sec' }, 'ذخیره‌های انجام‌شده'), en);
}

export function render() {
  const root = h('div'); const admin = S.me && S.me.role === 'admin';
  const draw = async () => {
    root.replaceChildren(head('صندوق پاداش', [], 'پاداش فروش آشنایان از سود برابر جداست و از آخرین روز ماه شمسی با دکمهٔ «ذخیرهٔ پاداش» در صندوق شخصی می‌ماند.'), h('div', { class: 'empty' }, 'در حال بارگذاری…'));
    let d; try { d = (await api('/api/fund/')).data; } catch (e) { root.replaceChildren(errorBox(e, draw, 'صندوق پاداش')); return; }
    const boxes = Object.values(d.owners).map(o => ownerBox(o, admin, draw));
    root.replaceChildren(head('صندوق پاداش', [], admin ? 'مدیر هر دو صندوق را می‌بیند؛ هر شریک فقط صندوق خودش را.' : 'فقط خودت و مدیر این صندوق را می‌بینید.'), ...boxes,
      h('div', { class: 'alert info' }, 'ℹ️ پاداش اول از سود کم می‌شود و بقیه ۵۰/۵۰ تقسیم می‌شود؛ پس خرید مشترک جدید فقط از «سود برابر» انجام می‌شود (هر دو نفر به یک اندازه) و پاداش مال فروشنده می‌ماند.'));
  };
  draw(); return root;
}
