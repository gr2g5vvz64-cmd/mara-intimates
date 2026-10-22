// صف ذخیره‌ی امن: هر ثبت (فروش، خرید، پرداخت…) تا وقتی در جنگو ننشسته، در این صف می‌ماند و خودکار دوباره تلاش می‌شود.
// هیچ ثبتی بی‌صدا حذف نمی‌شود. هر ثبت یک «کلید یکتا» دارد، پس اگر پاسخ سرور گم شد، ثبت دوبار نمی‌نشیند.
import { api, S, errText } from './store.js';
import { jstr } from './util.js';

const QK = 'mara.outbox.v1', LK = 'mara.savelog.v1';
const mem = {};
const rd = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : []; } catch { return mem[k] || []; } };
const wr = (k, v) => { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

let items = rd(QK), log = rd(LK);
const subs = new Set();
const emit = (type, data) => subs.forEach(f => { try { f(type, data); } catch (e) { console.error(e); } });
export const onOutbox = f => { subs.add(f); return () => subs.delete(f); };

export const LABELS = {
  create_sale: 'فروش', edit_sale: 'ویرایش فروش', edit_purchase: 'ویرایش فاکتور خرید', edit_return: 'ویرایش مرجوعی', edit_entry: 'ویرایش ثبت', create_purchase: 'فاکتور خرید', add_collection: 'دریافت از مشتری', collect_customer: 'دریافت از مشتری', add_supplier_payment: 'پرداخت به تامین‌کننده',
  add_expense: 'هزینه', add_transfer: 'انتقال بین حساب‌ها', move_stock: 'جابجایی کالا', create_return: 'مرجوعی از مشتری', create_supplier_return: 'برگشت به تامین‌کننده',
  void_entry: 'ابطال', set_due_date: 'تغییر سررسید', save_item: 'کالا', save_supplier: 'تامین‌کننده', save_customer: 'مشتری', set_sale_customer: 'ثبت نام خریدار', lock_month: 'بستن ماه', unlock_month: 'باز کردن ماه'
};
const RETRYABLE = new Set(['E_NETWORK', 'E_TIMEOUT', 'E_SERVER_DOWN', 'E_DB_DOWN', 'E_SERVER', 'E_DB', 'E_BAD_RESPONSE']);
const AUTH = new Set(['E_AUTH_BAD', 'E_AUTH_EXPIRED', 'E_AUTH_REQUIRED']);
export const isRetryable = e => !!e && (RETRYABLE.has(e.code) || e.status >= 502);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
const delay = n => Math.min(60000, 3000 * 2 ** Math.max(0, n - 1));

/** شرح کوتاه ثبت برای نمایش به کاربر */
export function describe(fn, p = {}) {
  const bits = [LABELS[fn] || fn];
  const money = n => Math.round(n).toLocaleString('en-US');
  if (fn === 'create_sale' && Array.isArray(p.lines)) bits.push(money(p.lines.reduce((a, l) => a + (l.qty || 0) * (l.unit_price || 0), 0) - (p.discount || 0)) + ' ریال');
  else if (fn === 'create_purchase' && Array.isArray(p.lines)) bits.push(money(p.lines.reduce((a, l) => a + (l.qty || 0) * (l.unit_price || 0), 0) - (p.discount || 0)) + ' ریال');
  else if (p.amount) bits.push(money(p.amount) + ' ریال');
  if (p.date) bits.push(jstr(p.date));
  return bits.join(' · ');
}

const persist = () => { const a = wr(QK, items); wr(LK, log.slice(-150)); return a; };
function addLog(e) { log.push({ t: Date.now(), ...e }); if (log.length > 150) log = log.slice(-150); persist(); emit('log', e); }

export const state = () => ({ items, log });
export const mine = () => items.filter(i => i.user === (S.me && S.me.name));
export const pendingCount = () => mine().filter(i => i.status === 'pending').length;
export const blockedCount = () => mine().filter(i => i.status === 'blocked').length;

async function send(fn, payload, id) {
  return api('/api/rpc/' + fn + '/', { method: 'POST', body: payload === undefined ? {} : payload, headers: { 'X-Idempotency-Key': id }, timeout: 45000 });
}

/** ثبت یک عملیات. نتیجه یا خود پاسخ است، یا {queued:true} وقتی در صف ذخیره قرار گرفته. خطای کاربر (مثل موجودی ناکافی) پرتاب می‌شود تا فرم نشان دهد. */
export async function rpc(fn, payload, { queue = true } = {}) {
  if (S.me && S.me.role === 'viewer') { const e = new Error('این حساب فقط برای مشاهده است.'); e.code = 'E_PERM'; throw e; }
  const id = uid(), t0 = performance.now();
  try {
    const j = await send(fn, payload, id);
    addLog({ id, status: 'saved', label: describe(fn, payload), no: j.data.result && (j.data.result.no || j.data.result.id), rid: j._rid || '', ms: Math.round(performance.now() - t0), attempts: 1 });
    return j.data.result;
  } catch (e) {
    if (queue && isRetryable(e)) {
      const it = { id, fn, payload, label: describe(fn, payload), user: S.me && S.me.name, created: Date.now(), attempts: 1, status: 'pending', code: e.code, error: errText(e), next: Date.now() + delay(1) };
      const stored = (items.push(it), persist());
      addLog({ id, status: 'queued', label: it.label, code: e.code, note: errText(e), attempts: 1 });
      emit('queued', { item: it, stored });
      return { queued: true, id };
    }
    addLog({ id, status: 'rejected', label: describe(fn, payload), code: e.code, note: errText(e), rid: e.request_id || '' });
    throw e;
  }
}

let busy = false;
async function attempt(it) {
  it.attempts++; it.last = Date.now();
  try {
    const j = await send(it.fn, it.payload, it.id);
    items = items.filter(x => x.id !== it.id);
    const res = j.data.result || {};
    addLog({ id: it.id, status: 'saved', label: it.label, no: res.no || res.id, rid: j._rid || '', attempts: it.attempts, note: j.data.replayed ? 'قبلاً در سرور نشسته بود؛ دوباره ثبت نشد' : '' });
    emit('saved', { item: it, result: res, replayed: !!j.data.replayed });
  } catch (e) {
    it.code = e.code; it.error = errText(e); it.rid = e.request_id || '';
    if (isRetryable(e)) { it.next = Date.now() + delay(it.attempts); emit('retry', { item: it }); }
    else if (AUTH.has(e.code)) { it.next = Date.now() + 5000; emit('auth', { item: it }); }
    else if (it.fn === 'save_item' && /قبلاً ثبت شده|مشابه/.test(it.error || '')) {
      items = items.filter(x => x.id !== it.id); addLog({ id: it.id, status: 'discarded', label: it.label, note: 'این کالا از قبل بود؛ ثبت تکراری لازم نیست. ' + it.error }); emit('dupitem', { item: it });
    }
    else { it.status = 'blocked'; addLog({ id: it.id, status: 'blocked', label: it.label, code: e.code, note: it.error, rid: it.rid, attempts: it.attempts }); emit('blocked', { item: it }); }
  }
  persist();
}

export async function pump(force = false) {
  if (busy || !S.me) return; busy = true;
  try {
    for (const it of mine().filter(x => x.status === 'pending').sort((a, b) => a.created - b.created)) {
      if (!force && it.next > Date.now()) continue;
      await attempt(it);
      if (it.status === 'pending' && it.code === 'E_NETWORK') break;   // اینترنت قطع است؛ بقیه را الکی امتحان نکن
    }
  } finally { busy = false; emit('tick', {}); }
}
export const retryNow = async id => { const it = items.find(x => x.id === id); if (it) { if (it.status === 'blocked') it.status = 'pending'; await attempt(it); persist(); emit('tick', {}); } };
export const discard = id => { const it = items.find(x => x.id === id); if (!it) return; items = items.filter(x => x.id !== id); addLog({ id, status: 'discarded', label: it.label, note: 'با تأیید کاربر از صف حذف شد' }); emit('tick', {}); };
export const detailText = it => JSON.stringify({ fn: it.fn, payload: it.payload, id: it.id, error: it.error, code: it.code }, null, 2);

let started = false;
export function initOutbox() {
  if (started) return; started = true;
  setInterval(() => { if (pendingCount()) pump(); }, 2000);
  window.addEventListener('online', () => pump(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pump(true); });
  window.addEventListener('beforeunload', e => { if (pendingCount() || blockedCount()) { e.preventDefault(); e.returnValue = ''; } });
}
