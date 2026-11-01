/* کالای مشابه: همان قاعده‌ی سرور (رنگ و سایز یکی، نام پایه ≥ ۹۵٪ شبیه) */
import { S } from './store.js';
const AR = { 'ي': 'ی', 'ك': 'ک', 'ۀ': 'ه' }, DG = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
export const normItem = t => String(t || '').toLowerCase().replace(/[يكۀ]/g, c => AR[c]).replace(/[٠-٩۰-۹]/g, c => String(DG.indexOf(c) % 10)).replace(/[\s‌‏‎·\-_.,،/\\()]+/g, '');
export function levSim(a, b) {
  if (!a.length && !b.length) return 1; if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/** کالای فعال یا غیرفعالی که با این نام/رنگ/سایز یکی یا ≥۹۵٪ شبیه است (یا undefined) */
export function findDup(base, col, siz, exceptId) {
  const b = normItem(base), c = normItem(col), z = normItem(siz);
  return S.stock.find(i => i.id !== exceptId && normItem(i.color) === c && normItem(i.size) === z && levSim(normItem(i.base_name || i.name), b) >= 0.95);
}
