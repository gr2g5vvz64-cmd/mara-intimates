// تب «مشاور خرید» در صفحه‌ی تحلیل
import { h, fmt, toast } from '../util.js';
import { S, api, errText } from '../store.js';
import { pill, kpi, chips, dtable } from '../ui.js';
import { loadAdvisor, VERDICT, MODEL_STATUS, adviceDigest } from '../advisor.js';
import { gate, GATES } from '../gates.js';
import { analysisSettingsForm } from '../forms_misc.js';
import { purchaseForm } from '../forms_trade.js';

let days = 30;
const WIN = [{ v: 14, label: '۲ هفته' }, { v: 30, label: '۳۰ روز' }, { v: 60, label: '۶۰ روز' }];
const trend = o => (o.trend === 'up' ? '▲ رو به رشد' : o.trend === 'down' ? '▼ کم شده' : '');

export function advisorTab() {
  const host = h('div'), body = h('div');
  let last = null;
  const draw = async (fresh = false) => {
    body.replaceChildren(h('div', { class: 'card' }, h('p', { class: 'hint' }, '⏳ در حال تحلیل فروش…')));
    let r; try { r = last = await loadAdvisor(days, fresh); } catch (e) { body.replaceChildren(h('div', { class: 'alert red' }, '❌ ' + errText(e))); return; }
    const g = k => r.items.filter(o => o.verdict === k), buy = [...g('urgent'), ...g('buy')], avoid = g('avoid'), hold = g('hold'), weak = g('weak'), okk = g('ok');
    const reasonCell = o => h('span', { class: 'rs' }, o.reason, trend(o) ? h('small', null, trend(o)) : null);
    const baseCols = [{ label: 'کالا', main: true, render: o => h('span', null, o.name, h('small', { class: 'idesc-s' }, [o.category, o.color, o.size].filter(Boolean).join(' · '))) }];
    const buyTable = dtable([...baseCols,
      { label: 'وضعیت', render: o => pill(VERDICT[o.verdict][1], VERDICT[o.verdict][0]) }, { label: 'موجودی', cls: 'num', render: o => fmt(o.rem) },
      { label: `فروش ${r.days} روز`, cls: 'num', render: o => fmt(o.sold) }, { label: 'مشتری', cls: 'num', hm: true, render: o => fmt(o.customers) }, { label: 'هفته‌ای', cls: 'num', hm: true, render: o => fmt(o.per_week) },
      { label: 'پیشنهاد خرید', cls: 'num', render: o => h('b', null, fmt(o.buy_qty) + ' عدد') },
      { label: 'چرا', hm: true, render: reasonCell },
      { label: '', render: o => h('button', { type: 'button', class: 'btn ghost sm', onclick: ev => { ev.stopPropagation(); purchaseForm({ item: o.id, qty: o.buy_qty }); } }, 'ثبت خرید') }], buy, { empty: '✅ فعلاً کالایی نیست که هم خوب بفروشد و هم رو به اتمام باشد.' });
    const simple = (arr, empty) => dtable([...baseCols, { label: 'موجودی', cls: 'num', render: o => fmt(o.rem) }, { label: `فروش ${r.days} روز`, cls: 'num', render: o => fmt(o.sold) },
      { label: 'آخرین فروش', cls: 'num', hm: true, render: o => (o.last_sold_days == null ? 'هنوز نشده' : o.last_sold_days + ' روز پیش') }, { label: 'نظر مشاور', render: reasonCell }], arr, { empty });
    const grp = (title, arr) => (arr.length ? h('div', { class: 'card' }, h('div', { class: 'ct' }, title), h('div', { class: 'chips' }, arr.slice(0, 10).map(x => h('span', { class: 'chip', style: 'cursor:default' }, x.name, h('small', null, `فروش ${x.sold} · موجودی ${x.rem}`))))) : null);
    const gST = gate(GATES.sellThrough), gROP = gate(GATES.reorder), M = r.models || [];
    const part = (t, cls) => h('span', { class: 'mpart ' + cls }, t);
    const modelTable = dtable([
      { label: 'مدل', main: true, render: m => h('span', null, m.model, h('small', { class: 'idesc-s' }, `${fmt(m.variants)} رنگ/سایز`)) },
      { label: '① تقاضا', render: m => h('span', null, `فروش ${fmt(m.demand.sold)} عدد · ${fmt(m.demand.sale_days)} روز · ${fmt(m.demand.customers)} مشتری`, h('small', { class: 'idesc-s' }, `${m.demand.tier_label} · هفته‌ای ${fmt(m.demand.per_week)}${m.demand.trend === 'up' ? ' ▲' : m.demand.trend === 'down' ? ' ▼' : ''}`)) },
      { label: '② موجودی', render: m => h('span', null, `موجودی ${fmt(m.stock.rem)}${m.stock.cover_days != null ? ` · کافی برای ${fmt(m.stock.cover_days)} روز` : ''}`, h('small', { class: 'idesc-s' }, [m.stock.oldest_days != null ? `قدیمی‌ترین ${fmt(m.stock.oldest_days)} روز` : '', gST.ok ? (m.stock.sell_through != null ? `فروخته‌شده ${fmt(m.stock.sell_through)}٪ از واردشده` : '') : '', gROP.ok && m.stock.reorder_point != null ? `نقطه‌ی سفارش ${fmt(m.stock.reorder_point)}` : ''].filter(Boolean).join(' · '))) },
      { label: '③ تصمیم', render: m => h('span', { class: 'rs' }, pill(m.decision.label, MODEL_STATUS[m.decision.status] || 'gray'), m.decision.buy_qty ? h('b', null, ` ${fmt(m.decision.buy_qty)} عدد`) : null, h('small', null, m.decision.reason)) }
    ], M.filter(m => m.decision.status !== 'wait' || m.demand.sold > 0), { empty: 'مدلی با فروش ثبت نشده.' });
    const waitModels = M.filter(m => m.decision.status === 'wait' && m.demand.sold === 0);
    const lockNote = !(gST.ok && gROP.ok) ? h('p', { class: 'hint' }, `⏳ «فروخته‌شده از واردشده» و «نقطه‌ی سفارش» بعد از ${fmt(GATES.sellThrough.days)} روز فعالیت و ${fmt(GATES.sellThrough.invoices)} فاکتور قابل استناد می‌شوند (الان ${fmt(gST.st.days)} روز و ${fmt(gST.st.invoices)} فاکتور)؛ تا آن موقع نشان داده نمی‌شوند.`) : null;
    const tierLine = Object.entries(r.tiers || {}).map(([k, t]) => `${t.label}: ${fmt(t.qty)} عدد، ${fmt(t.days)} روز، ${fmt(t.customers)} مشتری${t.open ? '' : ` (بعد از ${fmt(t.min_age)} روز فعالیت باز می‌شود)`}`).join(' · ');
    body.replaceChildren(...[
      h('div', { class: 'kpis' }, kpi('بخرید', h('span', { class: 'n' }, fmt(buy.length)), { sub: buy.length ? `${fmt(r.buy_units)} عدد در کل` : 'فعلاً چیزی نیست', tone: buy.length ? 'pos' : '' }),
        kpi('خرید نکنید', h('span', { class: 'n' }, fmt(avoid.length)), { tone: avoid.length ? 'warn' : '' }), kpi('پرفروش با سود کم', h('span', { class: 'n' }, fmt(hold.length))), kpi('فروش کم', h('span', { class: 'n' }, fmt(weak.length)), { sub: 'پیشنهاد خرید ندارند' })),
      r.age_days && r.age_days < 45 ? h('div', { class: 'alert amber', style: 'margin:8px 0' }, `⚠️ فقط ${fmt(r.age_days)} روز از اولین فروش گذشته؛ همه‌ی پیشنهادها «اطمینان کم» و فقط راهنما هستند، نه حکم.`) : null,
      h('div', { class: 'alert ok', style: 'margin:8px 0' }, `قاعده: «امیدوارکننده» یعنی در ${r.days} روز اخیر حداقل ${r.thresholds.min_qty} عدد، در حداقل ${r.thresholds.min_days} روز مختلف و برای حداقل ${r.thresholds.min_cust} مشتری فروخته شده. فروش یک یا دو عددی (یا چند عدد فقط به یک نفر) هیچ‌وقت پیشنهاد خرید نمی‌شود. «خرید مجدد» کامل فقط برای مدلِ پرفروش با سابقه‌ی کافی است؛ تا آن موقع فقط «خرید محدود».`),
      h('h3', { class: 'sec' }, '🧭 تصمیم خرید به تفکیک مدل: تقاضا ← موجودی ← تصمیم'), modelTable, lockNote,
      waitModels.length ? h('p', { class: 'hint' }, `⏳ ${fmt(waitModels.length)} مدل هنوز فروشی نداشته‌اند و تازه وارد شده‌اند یا کمتر از ${fmt(r.grace_days)} روز از ورودشان گذشته؛ برایشان قضاوت نمی‌کنم.`) : null,
      h('p', { class: 'hint' }, `سطح‌بندی فروش: ${tierLine}. این عددها اولیه‌اند و بعد از ۶۰ تا ۹۰ روز داده‌ی واقعی بازتنظیم می‌شوند. زمان تأمین ${fmt(r.lead_days)} روز و روز اطمینان ${fmt(r.safety_days)} (از «تنظیمات تحلیل»).`),
      h('h3', { class: 'sec' }, '🛒 بخرید (پرفروش و رو به اتمام؛ به تفکیک رنگ/سایز)'), buyTable,
      hold.length ? h('div', null, h('h3', { class: 'sec' }, '⚠️ پرفروش ولی سود کم'), simple(hold)) : null,
      h('h3', { class: 'sec' }, `⛔ خرید نکنید (فروش‌نرفته و بیش از ${fmt(r.grace_days)} روز از ورودش گذشته)`), simple(avoid, '✅ فعلاً کالای راکدی نداریم (کالای تازه‌وارد تا ' + fmt(r.grace_days) + ' روز «نخر» نمی‌خورد).'),
      g('size').length ? h('details', { class: 'card', style: 'margin:8px 0' }, h('summary', null, `🧩 سایز/رنگ ناقص: مدل پرفروش است ولی این ترکیب فروش نرفته (${g('size').length})`), simple(g('size'))) : null,
      g('wait').length ? h('details', { class: 'card', style: 'margin:8px 0' }, h('summary', null, `⏳ هنوز زود است: تازه وارد شده‌اند (${g('wait').length})`), simple(g('wait'))) : null,
      grp('رنگ‌های پرفروش', r.colors), grp('سایزهای پرفروش', r.sizes),
      weak.length ? h('details', { class: 'card', style: 'margin:8px 0' }, h('summary', null, `فروش کم؛ هنوز پیشنهاد خرید نمی‌دهم (${weak.length})`), simple(weak)) : null,
      okk.length ? h('details', { class: 'card', style: 'margin:8px 0' }, h('summary', null, `خوب می‌فروشند ولی موجودی کافی است (${okk.length})`), simple(okk)) : null,
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin:10px 0' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => draw(true) }, '🔄 دوباره تحلیل کن'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => analysisSettingsForm() }, '⚙️ تنظیمات تحلیل (زمان تأمین)'),
        h('button', { type: 'button', class: 'btn ghost', onclick: async () => { try { await navigator.clipboard.writeText(adviceDigest(last)); toast('✅ کپی شد؛ در چت Claude بچسبان'); } catch { toast('کپی نشد', 'err'); } } }, '📋 متن برای Claude'),
        h('button', { type: 'button', class: 'btn gold', onclick: async ev => { const b = ev.currentTarget; b.disabled = true; try { const x = (await api('/api/advisor/send/', { method: 'POST', body: { days } })).data; toast(x.empty ? 'چیزی برای فرستادن نبود' : (x.sent.some(s => s.ok) ? '✅ به بله/تلگرام فرستاده شد' : 'فرستاده نشد؛ بات را در تنظیمات بررسی کن'), x.sent.some(s => s.ok) || x.empty ? 'ok' : 'err'); } catch (e) { toast(errText(e), 'err'); } b.disabled = false; } }, '📨 همین الان به بله/تلگرام بفرست')),
      h('p', { class: 'hint' }, 'مشاور فقط می‌خواند و چیزی را تغییر نمی‌دهد. هر هفته هم خودکار به بله و تلگرام شما می‌آید (کرون «weekly» یا «advisor»)؛ در بات هم بنویس «مشاور».')].filter(Boolean));
  };
  host.append(chips(WIN, days, v => { days = v; draw(); }, { label: 'بازه' }), body); draw(); return host;
}
