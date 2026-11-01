// پیام به مشتری (فقط مدیر): هیچ پیامی خودکار نمی‌رود؛ این ماژول فقط «چه چیزی آماده‌ی ارسال است» و متن هر پیام را می‌سازد
import { S, settingNum } from './store.js';
import { todayISO, addDaysISO, fmt, jstr } from './util.js';

export const MODES = { none: 'هیچ', thanks: 'فقط تشکر', invoice: 'فقط فاکتور', both: 'هر دو' };
export const KIND_LBL = { invoice: 'فاکتور', thanks: 'تشکر' };
export const wants = (mode, kind) => mode === 'both' || mode === kind;
export const isOn = () => settingNum('msg_enabled', 0) === 1;
export const delayDays = () => settingNum('msg_delay_days', 1);
export const startISO = () => { const v = String(settingNum('msg_start', 0)); return v.length === 8 ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null; };
export const tplText = k => ((S.texts || []).find(x => x.key === k) || {}).text || '';
export const doneRow = (saleId, kind) => (S.custMsgs || []).find(m => m.sale_id === saleId && m.kind === kind && (m.status === 'sent' || m.status === 'skipped'));
const dig = s => String(s || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
export const last10 = p => { const d = dig(p); return d.length >= 10 ? d.slice(-10) : d; };
export const waLink = (phone, text) => { const k = last10(phone); return k.length === 10 ? `https://wa.me/98${k}?text=${encodeURIComponent(text)}` : null; };
export const botLink = () => { const u = S.bots && S.bots.bale && S.bots.bale.username; return u ? `https://ble.ir/${String(u).replace(/^@/, '')}` : null; };

const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
export function linesOf(sale) {
  return S.saleLines.filter(l => l.sale_id === sale.id).map(l => `• ${(S.I[l.item_id] || {}).name || 'کالا'} × ${fmt(l.qty)} — ${fmt(Math.round((l.net_unit != null ? l.net_unit : l.unit_price) * l.qty))} ریال`).join('\n');
}
export function messageFor(kind, sale) {
  const c = S.CUS[sale.customer_id] || {}, out = Number(sale.outstanding) > 0.5;
  return fill(tplText(kind === 'invoice' ? 'msg_invoice' : 'msg_thanks'), {
    name: c.name || sale.customer || '', no: sale.no, date: jstr(sale.date), lines: linesOf(sale), total: fmt(Math.round(sale.total)),
    due: out ? `\nمانده‌ی حساب این فاکتور: ${fmt(Math.round(sale.outstanding))} ریال${sale.due_date ? ' · سررسید ' + jstr(sale.due_date) : ''}` : ''
  }).trim();
}
/** فاکتورهای «امروز نوبتشان است»: بعد از شروعِ تعیین‌شده‌ی مدیر + فاصله‌ی روز، طبق حالت هر مشتری، و هنوز ارسال/رد نشده */
export function dueList() {
  if (!isOn() || !startISO()) return [];
  const st = startISO(), lim = addDaysISO(todayISO(), -delayDays()), out = [];
  for (const s of S.vSales) {
    if (s.voided || !s.customer_id || s.date < st || s.date > lim) continue;
    const c = S.CUS[s.customer_id]; if (!c || !c.active) continue;
    for (const kind of ['invoice', 'thanks']) if (wants(c.msg_mode, kind) && !doneRow(s.id, kind)) out.push({ sale: s, cust: c, kind });
  }
  return out.sort((a, b) => (a.sale.date < b.sale.date ? -1 : 1));
}
