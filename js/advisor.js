// مشاور خرید (فقط مدیر): داده از سرور می‌آید (/api/advisor/) تا متن بات و برنامه یکی باشد
import { api, S } from './store.js';

const cache = new Map();
export const isAdminUser = () => !!(S.me && S.me.role === 'admin');
export async function loadAdvisor(days = 30, fresh = false) {
  const c = cache.get(days);
  if (!fresh && c && Date.now() - c.t < 5 * 60000) return c.d;
  const d = (await api('/api/advisor/?days=' + days)).data;
  cache.set(days, { t: Date.now(), d }); return d;
}
/** برای فرم خرید: نظر مشاور درباره‌ی یک کالا (null اگر چیزی برای گفتن نیست) */
export async function adviceFor(itemId) {
  if (!isAdminUser()) return null;
  try { const d = await loadAdvisor(30); const o = d.items.find(x => x.id === itemId); return o && o.verdict !== 'none' ? o : null; } catch { return null; }
}
export const VERDICT = {
  urgent: ['red', '🔴 تمام شده؛ بخرید'], buy: ['green', '🛒 بخرید'], hold: ['amber', '⚠️ سود کم'], ok: ['blue', '✅ موجودی کافی'],
  weak: ['gray', 'فروش کم'], avoid: ['red', '⛔ خرید نکن']
};
export function adviceText(o) {
  if (!o) return '';
  if (o.verdict === 'urgent' || o.verdict === 'buy') return `🛒 مشاور: خوب فروش می‌رود؛ پیشنهاد خرید ${o.buy_qty} عدد. ${o.reason}`;
  if (o.verdict === 'avoid') return `⛔ مشاور: خرید نکن. ${o.reason}`;
  if (o.verdict === 'hold') return `⚠️ مشاور: ${o.reason}`;
  if (o.verdict === 'weak') return `ℹ️ مشاور: ${o.reason}`;
  return `✅ مشاور: ${o.reason}`;
}
export function adviceDigest(r) {
  const it = r.items, g = k => it.filter(o => o.verdict === k);
  const L = [`مشاور خرید MARA — ${r.days} روز اخیر (تا ${r.today})`, `قاعده: پرفروش = حداقل ${r.thresholds.min_qty} عدد، در حداقل ${r.thresholds.min_days} روز مختلف، برای حداقل ${r.thresholds.min_cust} مشتری.`];
  const sec = (t, arr, f) => { if (arr.length) { L.push('', t); arr.forEach(o => L.push('• ' + f(o))); } };
  sec('بخرید:', [...g('urgent'), ...g('buy')], o => `${o.name}: موجودی ${o.rem}، فروش ${o.sold}، مشتری ${o.customers}، هفته‌ای ${o.per_week} ← ${o.buy_qty} عدد`);
  sec('پرفروش با سود کم:', g('hold'), o => `${o.name}: سود ${o.margin}٪`);
  sec('خرید نکنید:', g('avoid'), o => `${o.name}: ${o.reason}`);
  sec('فروش کم (پیشنهاد نمی‌دهم):', g('weak'), o => `${o.name}: ${o.sold} عدد`);
  return L.join('\n');
}
