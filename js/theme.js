// تم‌های رنگی: پنج مدل؛ انتخاب هر نفر روی همین دستگاه برای خودش می‌ماند و هر وقت خواست عوض می‌کند
export const THEMES = [
  { id: 't7', name: 'تمشکی و مشکی', desc: 'مدل فعلی؛ پررنگ و شیک', sw: ['#FFF5F8', '#C2185B', '#2A1520', '#C9A24B'] },
  { id: 't4', name: 'قهوه‌ای و طلایی (لوگو)', desc: 'همان رنگ‌های اصلی لوگو', sw: ['#FBF4E8', '#C9A24B', '#3B2A1E', '#7A5C12'] },
  { id: 't5', name: 'مشکی لوکس', desc: 'تیره؛ مناسب شب', sw: ['#1A1416', '#C9A24B', '#0F0B0D', '#E8B4C0'] },
  { id: 't6', name: 'یاسی ملایم', desc: 'آرام و نرم', sw: ['#F6F1F8', '#6D4A8A', '#2B1E36', '#E0B7D2'] },
  { id: 't8', name: 'شکلاتی و کرم', desc: 'قهوه‌ای پررنگ با کرم، گرم و جدی', sw: ['#F7EFE6', '#6B4226', '#2E1B10', '#C9A24B'] }
];
const LAST = 'mara.theme.last';
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
export const themeById = id => THEMES.find(t => t.id === id) || THEMES[0];
export const currentTheme = () => themeById(document.documentElement.getAttribute('data-theme') || 't7');
export function applyTheme(id) {
  const t = themeById(id); document.documentElement.setAttribute('data-theme', t.id);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', t.sw[2]);
  return t;
}
/** بعد از ورود: تم ذخیره‌ی همین کاربر را می‌گذارد (اگر نداشت، تم فعلی می‌ماند) */
export function loadTheme(user) { const id = get('mara.theme.' + user); if (id) applyTheme(id); }
export function chooseTheme(id, user) { const t = applyTheme(id); put('mara.theme.' + user, t.id); put(LAST, t.id); return t; }
/** رنگ فعلی یک متغیر CSS (برای نمودارهای SVG) */
export const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
