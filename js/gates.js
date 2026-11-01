// «دروازه‌ی داده‌ی کافی»: هر شاخص تا وقتی داده‌ی کافی ندارد یا نشان داده نمی‌شود، یا کنارش نوشته می‌شود از چه زمانی قابل اندازه‌گیری و استناد است.
import { activeSales } from './store.js';
import { bizDays } from './analytics.js';
import { fmt } from './util.js';

/** حداقل‌ها (روز فعالیت، تعداد فاکتور). بعد از ۶۰ تا ۹۰ روز داده‌ی واقعی مارا بازتنظیم شوند. */
export const GATES = {
  pctInvoices: 10,          // درصد تغییر کل: هر دو بازه حداقل این‌قدر فاکتور
  pctInvoicesPerson: 5,     // درصد تغییر یک فروشنده
  category: { days: 21, invoices: 10 },   // بهترین/کم‌سودترین دسته
  concentration: { buyers: 8 },           // وابستگی به یک خریدار
  repeat: { days: 45, invoices: 20 },     // نرخ خرید مجدد مشتری
  returns: { days: 30, invoices: 20 },    // نرخ مرجوعی
  sellThrough: { days: 60, invoices: 40 },// نرخ فروش هر مدل
  reorder: { days: 60, invoices: 40 },    // نقطه‌ی سفارش
  perCategory: { days: 60, invoices: 40 },// سود هر فروشنده به تفکیک دسته
  cac: { days: 30, invoices: 10 },        // هزینه‌ی جذب مشتری
  stale: { days: 45 },                    // کالای کم‌گردش/مانده
  lowStockActive: { days: 14 }
};
export const dataState = () => ({ days: bizDays(), invoices: activeSales().length });
/** gate({days, invoices}) → { ok, note, st } ؛ note فقط وقتی ok نیست پر است */
export function gate({ days = 0, invoices = 0 } = {}) {
  const st = dataState(), ok = st.days >= days && st.invoices >= invoices;
  const need = [days ? `${fmt(days)} روز فعالیت` : '', invoices ? `${fmt(invoices)} فاکتور` : ''].filter(Boolean).join(' و ');
  return { ok, st, need, note: ok ? '' : `این اطلاعات بعد از حدود ${need} قابل اندازه‌گیری و استناد است (الان ${fmt(st.days)} روز و ${fmt(st.invoices)} فاکتور).` };
}
/** درصد تغییر فقط وقتی هر دو بازه فاکتور کافی دارند معنی دارد */
export const enoughForPct = (a, b, min = GATES.pctInvoices) => a >= min && b >= min;
export const pctNote = (min = GATES.pctInvoices) => `درصد تغییر وقتی نشان داده می‌شود که هر دو بازه حداقل ${fmt(min)} فاکتور داشته باشند.`;
