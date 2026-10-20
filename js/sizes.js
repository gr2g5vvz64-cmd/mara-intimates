// سایزبندی هر دسته: سوتین (دور زیر سینه + کاپ)، شورت/لباس خواب/تاپ/شلوارک (حرفی)، جوراب، فری. اندازه‌ها تقریبی‌اند و باید با جدول تامین‌کننده تطبیق داده شوند.
import { S } from './store.js';

export const KINDS = {
  bra: { label: 'دور زیر سینه + کاپ', short: 'دور + کاپ' },
  alpha: { label: 'حرفی (XS، S، M، L …)', short: 'حرفی' },
  sock: { label: 'جوراب (فری / S M L / شماره‌ی کفش)', short: 'جوراب' },
  free: { label: 'فقط فری', short: 'فقط فری' }
};
export const BANDS = ['۶۰', '۶۵', '۷۰', '۷۵', '۸۰', '۸۵', '۹۰', '۹۵', '۱۰۰', '۱۰۵', '۱۱۰'];
export const CUPS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const BRA_COMMON = { bands: ['۷۰', '۷۵', '۸۰', '۸۵'], cups: ['B', 'C'] };
export const ALPHA = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'فری'];
export const ALPHA_START = ['S', 'M', 'L', 'XL'];
export const SOCK = ['فری', 'S', 'M', 'L', '۳۶–۴۰', '۴۱–۴۵'];
export const FREE_NOTE = 'فری‌سایز یعنی مناسب برای یک محدوده‌ی سایزی مشخص، نه همه‌ی اندام‌ها؛ محدوده را در توضیحات بنویس.';

const faD = s => String(s).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const T = (rows) => rows;   // [سینه, کمر, باسن]
const BODY = { XS: [[76, 82], [58, 64], [82, 88]], S: [[82, 88], [64, 70], [88, 94]], M: [[88, 94], [70, 76], [94, 100]], L: [[94, 102], [76, 84], [100, 108]], XL: [[102, 110], [84, 92], [108, 116]], XXL: [[110, 118], [92, 100], [116, 124]] };
const PANTY = { XS: [80, 86], S: [86, 92], M: [92, 98], L: [98, 104], XL: [104, 112], XXL: [112, 120], '3XL': [120, 128] };
const FOOT = { S: [21, 23], M: [23, 25], L: [25, 27], 'فری': [22, 26] };
const r = a => faD(a[0] + '–' + a[1]);

/** گروه دسته از روی نامش: bra / panty / night / top / shorts / sock / other */
export function groupOf(name) {
  const n = String(name || '');
  if (n.includes('سوتین')) return 'bra';
  if (n.includes('جوراب')) return 'sock';
  if (n.includes('شورت')) return 'panty';
  if (n.includes('تاپ') && n.includes('شلوارک')) return 'night';
  if (n.includes('خواب') || n.includes('شب')) return 'night';
  if (n.includes('تاپ')) return 'top';
  if (n.includes('شلوارک')) return 'shorts';
  return 'other';
}
/** نوع سایزبندی دسته: اول از مقدار ذخیره‌شده در «مدیریت دسته‌ها»، وگرنه از روی نام */
export function kindOf(catName) {
  const c = (S.categories || []).find(x => x.name === catName);
  if (c && c.size_kind) return c.size_kind;
  const g = groupOf(catName);
  return g === 'bra' ? 'bra' : g === 'sock' ? 'sock' : 'alpha';
}
/** توضیح اندازه‌ی یک سایز (سانتی‌متر)، یا '' */
export function hintOf(catName, size) {
  const g = groupOf(catName), b = BODY[size];
  if (g === 'panty' && PANTY[size]) return 'دور باسن ' + r(PANTY[size]);
  if (g === 'night' && b) return `سینه ${r(b[0])} · کمر ${r(b[1])} · باسن ${r(b[2])}`;
  if (g === 'top' && b) return `سینه ${r(b[0])} · کمر ${r(b[1])}`;
  if (g === 'shorts' && b) return `کمر ${r(b[1])} · باسن ${r(b[2])}`;
  if (g === 'sock' && FOOT[size]) return 'طول پا ' + r(FOOT[size]) + ' سانتی‌متر';
  if (size === 'فری') return FREE_NOTE;
  return '';
}
export function bandHint(b) { const n = Number(String(b).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))); return n ? `زیر سینه ${faD(n - 2)}–${faD(n + 2)} سانتی‌متر` : ''; }
/** جمع‌بندی همگانی (برای نمایش در مدیریت دسته‌ها) */
export const SUMMARY = [
  ['سوتین', 'دور زیر سینه ۶۰ تا ۱۱۰ × کاپ A تا F؛ شروع: ۷۰ تا ۸۵ × B و C'],
  ['شورت', 'XS تا 3XL (شروع: S تا XL) + دور باسن'],
  ['لباس شب و خواب', 'XS تا XXL + فری؛ سینه، کمر، باسن'],
  ['تاپ', 'XS تا XXL + فری؛ سینه و کمر'],
  ['شلوارک', 'XS تا XXL + فری؛ کمر و باسن'],
  ['جوراب', 'فری، S، M، L یا شماره‌ی کفش؛ طول پا']
];
/** فهرست سایزهای حرفی هر دسته (شورت تا 3XL، بقیه تا XXL) */
export const alphaList = catName => (groupOf(catName) === 'panty' ? ALPHA : ALPHA.filter(x => x !== '3XL'));
