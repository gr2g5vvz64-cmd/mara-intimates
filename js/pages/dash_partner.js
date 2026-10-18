// داشبورد شریک (مهسا/رعنا): ساده، بدون نمودار، فقط کار روزانه و حساب خودِ همان نفر.
// عملکرد و مانده‌ی شریک دیگر نمایش داده نمی‌شود؛ فقط تعداد اجناسِ دستِ او.
import { h, fmt, jlong, jstr, todayISO, sum } from '../util.js';
import { S, activeSales, accBalance } from '../store.js';
import { N, pill } from '../ui.js';
import { saleForm, purchaseForm } from '../forms_trade.js';
import { returnForm, expenseForm, dayCloseForm } from '../forms_misc.js';
import { dayCloseOpen } from '../insights.js';
import { goalsCard } from './dashboard.js';

const ageOf = iso => Math.round((Date.parse(todayISO() + 'T00:00:00Z') - Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z')) / 864e5);

export function partnerTasks(me) {
  const T = [], key = me === 'مهسا' ? 'rem_m' : 'rem_r';
  const mine = activeSales().filter(s => s.seller === me && s.outstanding > 0.5);
  const byCus = new Map();
  for (const s of mine) { const c = s.customer || 'بدون نام', o = byCus.get(c) || { owed: 0, age: 0 }; o.owed += s.outstanding; o.age = Math.max(o.age, ageOf(s.date)); byCus.set(c, o); }
  for (const [c, o] of [...byCus].sort((a, b) => b[1].age - a[1].age)) if (o.age >= 4) T.push({ tone: o.age >= 8 ? 'red' : 'amber', text: `${c} ${fmt(o.age)} روز است ${fmt(o.owed)} ریال نپرداخته`, href: '#/customers' });
  const lots = S.lots.filter(l => !l.voided && l[key] > 0);
  const old = lots.filter(l => ageOf(l.date) >= 14);
  if (old.length) {
    const names = [...new Set(old.map(l => (S.I[l.item_id] || {}).name).filter(Boolean))], serious = old.some(l => ageOf(l.date) >= 30);
    T.push({ tone: serious ? 'red' : 'amber', text: `${fmt(names.length)} جنس بیشتر از ${serious ? 'یک ماه' : 'دو هفته'} دست تو مانده: ${names.slice(0, 3).join('، ')}${names.length > 3 ? ' و …' : ''}`, href: '#/stock' });
  }
  const low = S.stock.filter(i => i.active && i.rem > 0 && i.rem <= i.min_stock);
  if (low.length) T.push({ tone: 'amber', text: `${fmt(low.length)} جنس کم‌موجودی است: ${low.slice(0, 3).map(i => i.name).join('، ')}`, href: '#/stock' });
  if (dayCloseOpen() && S.me.role !== 'viewer') T.push({ tone: 'info', text: 'امروز کار ثبت شده ولی روز بسته نشده', act: () => dayCloseForm() });
  return T.slice(0, 5);
}

export function partnerDashboard(who) {
  const viewer = S.me.role === 'viewer', me = who || S.me.name, own = viewer ? me : 'من',  key = me === 'مهسا' ? 'rem_m' : 'rem_r', other = me === 'مهسا' ? 'رعنا' : 'مهسا', okey = key === 'rem_m' ? 'rem_r' : 'rem_m';
  const today = todayISO(), T = S.totals || {};
  const mineAll = activeSales().filter(s => s.seller === me), todays = mineAll.filter(s => s.date === today);
  const qa = (label, icon, cls, fn) => h('button', { type: 'button', class: 'qa ' + cls, onclick: fn }, h('span', { class: 'qi', 'aria-hidden': 'true' }, icon), label);

  const todayCard = h('div', { class: 'card' }, h('div', { class: 'ct' }, `امروز ${own}`),
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('div', { class: 'k-l' }, 'فروش امروز'), h('div', { class: 'k-v' }, N(sum(todays, s => s.total)))),
      h('div', { class: 'kpi' }, h('div', { class: 'k-l' }, 'تعداد فاکتور'), h('div', { class: 'k-v' }, h('span', { class: 'n' }, fmt(todays.length)))),
      h('div', { class: 'kpi pos' }, h('div', { class: 'k-l' }, `سود ${own} امروز`), h('div', { class: 'k-v' }, N(sum(todays, s => s.profit))))),
    goalsCard(me));

  const tasks = partnerTasks(me);
  const taskCard = h('div', { class: 'card' }, h('div', { class: 'ct' }, `کارهای ${own}`),
    tasks.length ? tasks.map(t => h('div', { class: 'li task ' + t.tone }, h('div', null, t.text), t.act ? h('button', { type: 'button', class: 'mini', onclick: t.act }, 'انجام') : h('a', { class: 'more', href: t.href }, 'ببین ←')))
      : h('div', { class: 'alert ok' }, 'همه‌چیز مرتب است ✓'));

  const myLots = S.lots.filter(l => !l.voided && l[key] > 0), units = sum(S.stock.filter(i => i.active), i => i[key] || 0), val = sum(myLots, l => l[key] * l.landed_unit);
  const accs = S.accounts.filter(a => a.owner === me && a.active !== false), recv = sum(mineAll, s => Math.max(0, s.outstanding || 0));
  const cap = T[key === 'rem_m' ? 'capital_m' : 'capital_r'];
  const otherUnits = sum(S.stock.filter(i => i.active), i => i[okey] || 0);
  const otherItems = S.stock.filter(i => i.active && i[okey] > 0).sort((a, b) => b[okey] - a[okey]);
  const money = h('div', { class: 'card' }, h('div', { class: 'ct' }, `جنس و پول ${own}`),
    h('div', { class: 'srow' }, `جنس دست ${own}`, h('b', null, `${fmt(units)} عدد · ${fmt(val)} ریال`)),
    ...accs.filter(a => a.kind !== 'pocket').map(a => h('div', { class: 'srow' }, a.name, h('b', null, fmt(accBalance(a.id))))),
    h('div', { class: 'srow' }, `طلب ${own} از مشتری‌ها`, h('b', null, fmt(recv))),
    cap != null ? h('div', { class: 'srow' }, `سرمایه‌ی ${own}`, h('b', null, fmt(cap))) : null);

  const otherCard = h('div', { class: 'card' }, h('div', { class: 'ct' }, `جنس دست ${other}`, h('small', null, ` · ${fmt(otherUnits)} عدد`)),
    otherItems.length ? otherItems.slice(0, 12).map(i => h('div', { class: 'srow' }, i.name, h('b', null, fmt(i[okey]) + ' عدد'))) : h('div', { class: 'empty sm' }, 'جنسی دستش نیست.'),
    otherItems.length > 12 ? h('p', { class: 'hint' }, `و ${fmt(otherItems.length - 12)} جنس دیگر`) : null);

  const last = mineAll.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.no || 0) - (a.no || 0))).slice(0, 3);
  const lastCard = h('div', { class: 'card' }, h('div', { class: 'ct' }, `آخرین فروش‌های ${own}`, h('a', { href: '#/sales', class: 'more' }, 'همه ←')),
    last.length ? last.map(s => h('div', { class: 'li' }, h('div', null, h('b', null, s.customer || 'بدون نام'), h('small', null, `${s.no} · ${jstr(s.date)}${s.outstanding > 0.5 ? ' · مانده ' + fmt(s.outstanding) : ''}`)), N(s.total))) : h('div', { class: 'empty sm' }, viewer ? 'هنوز فروشی ثبت نشده.' : 'هنوز فروشی ثبت نکرده‌ای.'));

  return h('div', { class: 'dash partner' },
    h('div', { class: 'hello' }, h('div', null, h('h1', null, `سلام ${S.me.name}`), h('p', { class: 'sub' }, jlong(today) + (viewer ? ` · نمای ${me} (فقط مشاهده)` : ''))), h('img', { class: 'brand-mark', src: 'icons/logo-mark.jpg', alt: 'MR', width: 42, height: 42 })),
    viewer ? null : h('div', { class: 'qas' }, qa('فروش جدید', '🛍', 'gold', () => saleForm()), qa('خرید جدید', '📦', 'dark', () => purchaseForm()), qa('مرجوعی', '↩️', 'line', () => returnForm()), qa('پرداخت / هزینه', '💸', 'line', () => expenseForm())),
    h('div', { class: 'dbody' }, todayCard, taskCard, money, otherCard, lastCard));
}
