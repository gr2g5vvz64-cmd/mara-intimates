// لایه‌ی داده: ارتباط با بک‌اند جنگو (MARA INTIMATES API)، بارگذاری کامل جدول‌ها و محاسبات مشتق
import { API_URL } from './config.js';
import { sum, groupBy, jmonthKey, todayISO } from './util.js';

const TOKEN_KEY = 'mara.token';
export const apiBase = () => String(window.__MARA_API__ || API_URL).replace(/\/+$/, '');
export const apiConfigured = () => !/^PASTE/.test(apiBase());
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return window.__tok || null; } };
export const setToken = t => { window.__tok = t; try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

/* ---------- خطای API: کد + «کجا گیر کرد» + شناسه‌ی درخواست ---------- */
const FRIENDLY = new Set(['E_BUSINESS', 'E_INPUT', 'E_CHECK', 'E_DUP', 'E_REF', 'E_PERM', 'E_AUTH_BAD', 'E_AUTH_REQUIRED', 'E_AUTH_EXPIRED', 'E_LOCKED', 'E_OTP', 'E_OTP_NOCHAT']);
export class ApiErr extends Error {
  constructor(o) { super(o.message || 'خطا'); Object.assign(this, { code: o.code || 'E_UNKNOWN', where: o.where || '', request_id: o.request_id || '', status: o.status || 0, hint: o.hint || '' }); }
  /** متنی که به کاربر نشان می‌دهیم؛ برای خطاهای فنی، کد و شناسه هم کنارش است تا بشود پیگیری کرد */
  display() { return FRIENDLY.has(this.code) ? this.message : `${this.message} [کد ${this.code}${this.where ? ' · ' + this.where : ''}${this.request_id ? ' · ' + this.request_id : ''}]`; }
}
export const errText = e => (e && e.display ? e.display() : (e && e.message) || 'خطا');
export const authBus = { onLost: () => {} };

/* سرور رایگان Render بعد از بی‌کاری می‌خوابد و اولین درخواست «ERR_CONNECTION_RESET» می‌گیرد. خواندن‌ها (GET) تا ~۱٫۵ دقیقه خودکار دوباره تلاش می‌شوند و نوار «در حال بیدار شدن» نشان داده می‌شود؛ ثبت‌ها از صف امن (outbox) می‌گذرند. */
let wakeEl = null;
function wakeBanner(on, sec = 0) {
  try {
    if (!on) { if (wakeEl) { wakeEl.remove(); wakeEl = null; } return; }
    if (!wakeEl) { wakeEl = document.createElement('div'); wakeEl.setAttribute('role', 'status'); wakeEl.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7a4b00;color:#fff;text-align:center;padding:8px 12px;font:600 14px system-ui,sans-serif'; document.body.appendChild(wakeEl); }
    wakeEl.textContent = `سرور در حال بیدار شدن است… (${sec} ثانیه) خودش دوباره تلاش می‌کند، صفحه را نبند.`;
  } catch { /* نمایش اختیاری است */ }
}
const sleepMs = ms => new Promise(r => setTimeout(r, ms));

export async function api(path, { method = 'GET', body, timeout = 60000, raw = false, headers: extra = {}, retries = 9 } = {}) {
  if (!apiConfigured()) throw new ApiErr({ code: 'E_CONFIG', message: 'آدرس سرور (API_URL) در js/config.js تنظیم نشده.', where: 'client.config' });
  const headers = { 'Content-Type': 'application/json', ...extra }; const t = getToken(); if (t) headers.Authorization = 'Bearer ' + t;
  const retryable = method === 'GET'; const tries = retryable ? retries : 1; const t0 = Date.now();
  let res, lastAborted = false;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), retryable ? Math.min(timeout, 25000) : timeout);
    try { res = await fetch(apiBase() + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal }); lastAborted = false; }
    catch (e) { lastAborted = ctl.signal.aborted; res = null; }
    finally { clearTimeout(tm); }
    if (res && !(retryable && [502, 503, 504].includes(res.status))) break;
    if (i < tries - 1) { wakeBanner(true, Math.round((Date.now() - t0) / 1000)); await sleepMs(4000); }
  }
  wakeBanner(false);
  if (!res) throw new ApiErr({ code: lastAborted ? 'E_TIMEOUT' : 'E_NETWORK', where: 'client.fetch ' + path,
    message: lastAborted ? 'سرور دیر جواب داد (شاید در حال بیدار شدن است؛ ۱ دقیقه بعد دوباره امتحان کن).' : 'به سرور وصل نشد. اینترنت را چک کن؛ اگر درست است، سرور Render خواب است یا آدرس API_URL غلط است.' });
  if (raw && res.ok) return res;
  let j = null; try { j = await res.json(); } catch {}
  if (!j) throw new ApiErr({ code: 'E_BAD_RESPONSE', status: res.status, where: 'client.parse ' + path, message: `پاسخ نامعتبر از سرور (HTTP ${res.status}). آدرس API_URL درست است؟ آدرس /api/health/ را در مرورگر باز کن.` });
  if (!res.ok || j.ok === false) {
    const err = new ApiErr({ ...j, status: res.status });
    if (['E_AUTH_BAD', 'E_AUTH_EXPIRED', 'E_AUTH_REQUIRED'].includes(err.code) && t) authBus.onLost(err);
    throw err;
  }
  j._rid = res.headers.get('x-request-id') || '';
  return j;
}

/* گزارش خطای برنامه (جاوااسکریپت) به سرور تا در «عیب‌یابی» دیده شود */
const sent = new Set();
export async function reportError(code, message, where, detail = '') {
  const key = code + where + message; if (sent.has(key) || sent.size > 15) return; sent.add(key);
  try { await fetch(apiBase() + '/api/client-error/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, message: String(message).slice(0, 800), where, detail: String(detail).slice(0, 3000) }) }); } catch {}
}

export const S = {
  me: null, loaded: false, bots: {},
  accounts: [], items: [], suppliers: [], customersT: [], invoices: [], lines: [], payments: [], sales: [], saleLines: [],
  collections: [], returns: [], expenses: [], transfers: [], moves: [], stocktakes: [], stocktakeLines: [], goals: [], dayCloses: [], categories: [], settings: [], diagErrors: null,
  lots: [], stock: [], vInvoices: [], vSup: [], vCus: [], due: [], bal: [], vSales: [], totals: {},
  A: {}, I: {}, SUP: {}, LOT: {}, SALE: {}, INV: {}, CUS: {}
};

export async function loadAll({ retries = 9 } = {}) {
  const r = await api('/api/data/', { retries });
  const t = r.data.tables;
  Object.assign(S, {
    accounts: t.accounts, items: t.items, suppliers: t.suppliers, customersT: t.customers, invoices: t.purchase_invoices, lines: t.purchase_lines, payments: t.supplier_payments,
    saleLines: t.sale_lines, collections: t.collections, returns: t.returns, expenses: t.expenses, transfers: t.transfers, moves: t.stock_moves, stocktakes: t.stocktakes || [], stocktakeLines: t.stocktake_lines || [],
    lots: t.v_lots, stock: t.v_stock, vInvoices: t.v_invoices, vSup: t.v_supplier_balance, vCus: t.v_customer_balance, due: t.v_due, bal: t.v_account_balance,
    vSales: t.v_sales, goals: t.goals || [], dayCloses: t.day_closes || [], periodLocks: t.period_locks || [], categories: t.categories || [], settings: t.app_settings || [], totals: t.v_totals || {}, me: r.data.user, bots: r.data.bots || {}
  });
  S.sales = S.vSales;
  S.A = Object.fromEntries(S.accounts.map(x => [x.id, x]));
  S.I = Object.fromEntries(S.items.map(x => [x.id, x]));
  S.SUP = Object.fromEntries(S.suppliers.map(x => [x.id, x]));
  S.CUS = Object.fromEntries(S.customersT.map(x => [x.id, x]));
  S.LOT = Object.fromEntries(S.lots.map(x => [x.id, x]));
  S.SALE = Object.fromEntries(S.vSales.map(x => [x.id, x]));
  S.INV = Object.fromEntries(S.vInvoices.map(x => [x.id, x]));
  /* فی خالص هر ردیف فروش = فی فروش منهای سهم تخفیف فاکتور (تناسبی)؛ برای سود دسته‌ها و مرجوعی */
  const gross = new Map();
  for (const l of S.saleLines) gross.set(l.sale_id, (gross.get(l.sale_id) || 0) + l.qty * l.unit_price);
  for (const l of S.saleLines) { const s = S.SALE[l.sale_id], g = gross.get(l.sale_id) || 0; l.net_unit = s && s.discount > 0 && g > 0 ? l.unit_price * (1 - s.discount / g) : l.unit_price; }
  S.loaded = true;
}

/* ثبت‌ها از صف ذخیره‌ی امن می‌گذرند (outbox.js): تلاش مجدد خودکار، کلید یکتا، گزارش ذخیره */
export { rpc } from './outbox.js';

/* ---------- محاسبات مشتق ---------- */
export const businessAccounts = () => S.accounts.filter(a => a.kind !== 'pocket').sort((a, b) => a.sort - b.sort);
export const pockets = () => S.accounts.filter(a => a.kind === 'pocket').sort((a, b) => a.sort - b.sort);
export const accBalance = id => (S.bal.find(b => b.id === id) || {}).balance || 0;
export const activeSales = () => S.vSales.filter(s => !s.voided);
export const holdKey = h => (h === 'مهسا' ? 'rem_m' : 'rem_r');

// پیش‌نمایش FIFO در فرم فروش (همان منطق سرور)
export function simulateFifo(itemId, seller, qty, prefLot) {
  const key = holdKey(seller);
  let lots = S.lots.filter(l => l.item_id === itemId && !l.voided && l[key] > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  if (prefLot) { const p = lots.find(l => l.id === prefLot); if (p) lots = [p, ...lots.filter(l => l.id !== prefLot)]; }
  let need = qty; const parts = [];
  for (const l of lots) { if (need <= 0) break; const t = Math.min(need, l[key]); parts.push({ lot: l, qty: t, cost: l.landed_unit }); need -= t; }
  return { parts, short: need, cost: sum(parts, p => p.qty * p.cost) };
}

export function monthly() {
  const m = new Map();
  const get = k => m.get(k) || m.set(k, { key: k, sales: 0, profit: 0, expenses: 0, count: 0 }).get(k);
  for (const s of activeSales()) { const o = get(jmonthKey(s.date)); o.sales += s.total; o.profit += s.profit; o.count++; }
  for (const e of S.expenses) if (!e.voided) { const o = get(jmonthKey(e.date)); o.expenses += e.amount; o.profit -= e.amount; }
  for (const r of S.returns) if (!r.voided && r.kind === 'supplier') { get(jmonthKey(r.date)).profit += r.profit_effect; }
  return [...m.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}
export function itemProfit() {
  const lineProfit = new Map();
  const saleOk = new Set(activeSales().map(s => s.id));
  for (const l of S.saleLines) if (saleOk.has(l.sale_id)) lineProfit.set(l.item_id, (lineProfit.get(l.item_id) || 0) + l.qty * (l.net_unit - l.unit_cost));
  for (const r of S.returns) if (!r.voided) lineProfit.set(r.item_id, (lineProfit.get(r.item_id) || 0) + r.profit_effect);
  return [...lineProfit.entries()].map(([id, p]) => ({ item: S.I[id], profit: p })).sort((a, b) => b.profit - a.profit);
}
/** دسته‌های کالا: ثبت‌شده‌ها (فعال) + دسته‌هایی که فقط روی کالاها نوشته شده؛ به ترتیب نمایش */
export const NO_CAT = 'بدون دسته';
export const catNames = (withOff = false) => {
  const reg = S.categories.filter(c => withOff || c.active).sort((a, b) => a.sort - b.sort || a.id - b.id).map(c => c.name), seen = new Set(reg);
  for (const i of S.items) if (i.category && !seen.has(i.category)) { seen.add(i.category); reg.push(i.category); }
  return reg;
};
export const catOf = it => (it && it.category) || NO_CAT;
export const customers = () => S.customersT.filter(c => c.active);
/** ویرایش و ابطال: فقط حمیدرضا، مهسا و رعنا (سرور هم همین را اجرا می‌کند). رعنا فقط ثبت و مشاهده دارد. */
export const isViewer = () => !!(S.me && S.me.role === 'viewer');
export const canEdit = () => !!(S.me && (S.me.can_edit || S.me.role === 'admin'));
export const canVoid = () => canEdit();
/** درصد سود پیش‌فرض (عدد؛ مثلاً 20): اول درصد دسته‌ی کالا، اگر نبود درصد پیش‌فرض کل، اگر آن هم نبود ۲۰ */
export const defaultMarkup = () => { const r = (S.settings || []).find(x => x.key === 'default_markup'); return r && r.value != null ? Number(r.value) : 20; };
export const markupOf = itemId => {
  const it = S.I && S.I[itemId], c = it && it.category ? S.categories.find(x => x.name === it.category) : null;
  return c && c.markup_pct != null ? Number(c.markup_pct) : defaultMarkup();
};
export const today = todayISO;

export const bus = { refresh: async () => {} };
export function pref(k, def) { try { const v = localStorage.getItem('mara.' + k); return v == null ? def : JSON.parse(v); } catch { return def; } }
export function setPref(k, v) { try { localStorage.setItem('mara.' + k, JSON.stringify(v)); } catch {} }
export const CHANNELS = ['پیج اینستاگرام', 'پیج تلگرام', 'پیج بله', 'آشنایان'];
export const EXPCATS = ['تبلیغات', 'بسته‌بندی (خرید عمده)', 'رفت‌وآمد', 'اجاره و تجهیزات', 'سایر'];
