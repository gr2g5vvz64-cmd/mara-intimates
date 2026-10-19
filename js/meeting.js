// گزارش جلسه‌ی دو هفته‌ای مهسا و رعنا: همه‌ی عددها از داده‌های ثبت‌شده حساب می‌شود و «کجا خوب / کجا ضعیف» با قاعده‌های ثابت نوشته می‌شود.
// هدف فعلی فقط برای فروش به «آشنایان» است؛ پیج اینستاگرام هدف جدا دارد (هنوز تعیین نشده) و فقط عددش نشان داده می‌شود.
import { S, activeSales } from './store.js';
import { fmt, sum, todayISO, addDaysISO, jstr, jmonthName, jmonthKey } from './util.js';
import { period, salesStats, flowStats, stockAge, receivableAge } from './analytics.js';
import { goalProgress, GOAL_CHANNEL, monthElapsed, reorderSuggestions, overdue } from './insights.js';

export const PEOPLE = ['مهسا', 'رعنا'];
export const WINDOWS = [{ v: 7, label: '۷ روز اخیر' }, { v: 14, label: '۱۴ روز اخیر (جلسه‌ی دو هفته‌ای)' }, { v: 30, label: '۳۰ روز اخیر' }];
const inR = (d, a, b) => d >= a && d <= b;
const M = n => fmt(Math.round(n));
export const chg = (c, p) => (p > 0 ? Math.round((c - p) / p * 100) : null);

function firstDates() {
  const f = new Map();
  for (const s of activeSales()) if (s.customer_id) { const x = f.get(s.customer_id); if (!x || s.date < x) f.set(s.customer_id, s.date); }
  return f;
}
function personStats(p, a, b, first, lineSale) {
  const ss = activeSales().filter(s => s.seller === p && inR(s.date, a, b));
  const total = sum(ss, s => s.total), disc = sum(ss, s => s.discount || 0), gross = total + disc;
  const ids = new Set(ss.filter(s => s.customer_id).map(s => s.customer_id));
  const ret = S.returns.filter(r => !r.voided && r.kind === 'customer' && inR(r.date, a, b) && (S.SALE[lineSale.get(r.sale_line_id)] || {}).seller === p);
  const today = todayISO(), mine = activeSales().filter(s => s.seller === p && s.outstanding > 0.5);
  const late = mine.filter(s => s.due_date && s.due_date < today);
  const ch = {}; for (const s of ss) ch[s.channel] = (ch[s.channel] || 0) + s.total;
  return {
    total, count: ss.length, avg: ss.length ? total / ss.length : 0, profit: sum(ss, s => s.profit),
    customers: ids.size, fresh: [...ids].filter(id => first.get(id) >= a).length,
    disc, discPct: gross > 0 ? disc / gross * 100 : 0, anon: ss.filter(s => !s.customer_id).length,
    retCount: ret.length, owed: sum(mine, s => s.outstanding), lateCount: late.length, lateAmt: sum(late, s => s.outstanding), channels: ch
  };
}

export function buildMeeting(n = 14) {
  const P = period(n), first = firstDates(), lineSale = new Map(S.saleLines.map(l => [l.id, l.sale_id]));
  const cur = salesStats(P.from, P.to), prev = salesStats(P.pFrom, P.pTo);
  const F = flowStats(d => inR(d, P.from, P.to)), Fp = flowStats(d => inR(d, P.pFrom, P.pTo));
  const mk = jmonthKey(todayISO()), el = monthElapsed(mk);
  const people = PEOPLE.map(p => {
    const c = personStats(p, P.from, P.to, first, lineSale), q = personStats(p, P.pFrom, P.pTo, first, lineSale), g = goalProgress(p, mk);
    const need = g.goal > 0 ? Math.max(0, g.goal - g.done) : null;
    return { p, c, q, g, need, perDay: need != null && g.left > 0 ? need / g.left : null, per14: need != null && g.left > 0 ? Math.min(need, need / g.left * 14) : need };
  });
  const [A, B] = people;
  /* قاعده‌های «خوب / ضعیف» */
  for (const x of people) {
    const o = people.find(y => y !== x), good = [], weak = [], c = x.c, q = x.q, g = x.g;
    if (g.goal > 0) {
      const t = `${fmt(g.pct)}٪ هدف فروش آشنایان در ${fmt(g.elapsed)}٪ از ماه`;
      if (g.pace.key === 'done') good.push(`هدف ماه محقق شد (${t}).`);
      else if (g.pace.key === 'ahead') good.push(`از برنامه جلوتر است: ${t}.`);
      else if (g.pace.key === 'on') good.push(`در مسیر هدف است: ${t}.`);
      else if (g.pace.key === 'slow') weak.push(`کمی از هدف عقب است: ${t}.`);
      else weak.push(`از هدف خیلی عقب است: ${t}. تا پایان ماه روزی ${M(x.perDay || 0)} ریال فروش به آشنایان لازم است.`);
    } else weak.push('هدف فروش آشنایان این ماه برایش تعیین نشده.');
    const dc = chg(c.total, q.total);
    if (dc != null && dc >= 15) good.push(`فروش نسبت به دوره‌ی قبل ${fmt(dc)}٪ بیشتر شد.`);
    if (dc != null && dc <= -25) weak.push(`فروش نسبت به دوره‌ی قبل ${fmt(-dc)}٪ کمتر شد.`);
    if (c.count === 0) weak.push('در این بازه هیچ فروشی ثبت نکرد.');
    if (c.fresh >= 2) good.push(`${fmt(c.fresh)} مشتری جدید آورد.`);
    if (c.count > 0 && c.fresh === 0 && o.c.fresh > 0) weak.push(`مشتری جدید نداشت (${o.p} ${fmt(o.c.fresh)} مشتری جدید داشت).`);
    const da = chg(c.avg, q.avg);
    if (da != null && da <= -20 && c.count >= 2) weak.push(`میانگین هر فاکتور ${fmt(-da)}٪ کمتر شد.`);
    if (da != null && da >= 20 && c.count >= 2) good.push(`میانگین هر فاکتور ${fmt(da)}٪ بیشتر شد.`);
    if (c.discPct >= 8) weak.push(`تخفیف زیاد داده شده: ${fmt(Math.round(c.discPct))}٪ فروش (${M(c.disc)} ریال).`);
    if (c.anon) weak.push(`${fmt(c.anon)} فاکتور بدون نام خریدار ثبت شده.`);
    if (c.lateAmt > 0) weak.push(`${fmt(c.lateCount)} نسیه سررسیدگذشته دارد: ${M(c.lateAmt)} ریال. پیگیری شود.`);
    else if (c.count > 0) good.push('نسیه‌ی سررسیدگذشته ندارد.');
    if (c.retCount >= 2) weak.push(`${fmt(c.retCount)} مرجوعی در این بازه داشت؛ علت‌ها بررسی شود.`);
    x.good = good; x.weak = weak;
  }
  /* مشکل‌های مشترک: کالا و پول */
  const issues = [], SA = stockAge(), RA = receivableAge(), ro = reorderSuggestions(), od = overdue('payable'), orr = overdue('receivable');
  if (SA.old > 0) issues.push(`کالای بیش از ۳۰ روز مانده: ${M(SA.old)} ریال پول گیر کرده؛ برای فروش آن برنامه بگذاریم.`);
  if (ro.length) issues.push(`${fmt(ro.length)} کالای پرفروش رو به اتمام است: ${ro.slice(0, 4).map(r => r.item.name).join('، ')}.`);
  if (RA.c > 0) issues.push(`طلب‌های بالای ۸ روز: ${M(RA.c)} ریال هنوز وصول نشده.`);
  if (orr.length) issues.push(`${fmt(orr.length)} طلب از مشتریان سررسیدش گذشته.`);
  if (od.length) issues.push(`${fmt(od.length)} بدهی ما به تامین‌کننده سررسیدش گذشته.`);
  /* اینستاگرام: فقط عدد، بدون هدف */
  const ig = a => sum(activeSales().filter(s => s.channel === 'پیج اینستاگرام' && inR(s.date, a[0], a[1])), s => s.total);
  const insta = { cur: ig([P.from, P.to]), prev: ig([P.pFrom, P.pTo]) };
  /* دستور جلسه */
  const agenda = [];
  for (const x of people) if (x.weak.length) agenda.push(`${x.p}: ${x.weak[0]}`);
  if (people.some(x => x.g.goal > 0 && ['slow', 'behind'].includes(x.g.pace.key))) agenda.push('برنامه‌ی جبران هدف آشنایان تا پایان ماه (چه کسانی را باید دوباره دید؟)');
  agenda.push('هدف فروش پیج اینستاگرام برای دو هفته‌ی بعد (هنوز تعیین نشده)');
  if (issues.length) agenda.push('تصمیم درباره‌ی موجودی راکد، کالای رو به اتمام و طلب‌های معوق');
  return { P, n, cur, prev, F, Fp, insta, people, issues, agenda, month: mk, monthName: jmonthName(mk), elapsed: el, from: P.from, to: P.to };
}

/** متنی که می‌شود در چت Claude گذاشت تا تحلیل کامل‌تر و پیشنهاد برای جلسه بنویسد */
export function meetingText(r) {
  const L = [];
  L.push(`گزارش جلسه‌ی ${r.n} روزه مارا اینتیمیتس: ${jstr(r.from)} تا ${jstr(r.to)}`);
  L.push(`از Claude می‌خواهم: بر پایه‌ی همین عددها یک متن کوتاه و محترمانه برای جلسه با مهسا و رعنا بنویسد (کجا خوب بودیم، کجا ضعیف، علت‌های محتمل، پیشنهاد مشخص برای دو هفته‌ی بعد برای هر نفر).`);
  L.push('هدف فعلی فقط برای فروش به «آشنایان» است؛ هدف پیج اینستاگرام هنوز تعیین نشده.', '');
  L.push(`کل: فروش ${M(r.cur.sales)} (قبل ${M(r.prev.sales)}) · سود خالص ${M(r.cur.profit)} (قبل ${M(r.prev.profit)}) · فاکتور ${fmt(r.cur.count)} · خرید ${M(r.F.bought)} · دریافتی ${M(r.F.received)}`);
  L.push(`فروش پیج اینستاگرام در این بازه ${M(r.insta.cur)} (قبل ${M(r.insta.prev)})`, '');
  for (const x of r.people) {
    const c = x.c, g = x.g;
    L.push(`— ${x.p}: فروش ${M(c.total)} (قبل ${M(x.q.total)}) · ${fmt(c.count)} فاکتور · میانگین ${M(c.avg)} · ${fmt(c.customers)} مشتری (${fmt(c.fresh)} جدید) · تخفیف ${fmt(Math.round(c.discPct))}٪ · بدون‌نام ${fmt(c.anon)} · نسیه معوق ${M(c.lateAmt)} · مرجوعی ${fmt(c.retCount)}`);
    L.push(`  هدف آشنایان ماه: ${g.goal ? `${M(g.done)} از ${M(g.goal)} (${fmt(g.pct)}٪ در ${fmt(g.elapsed)}٪ ماه؛ ${g.pace.label})` : 'تعیین نشده'}`);
    L.push(`  خوب: ${x.good.join(' | ') || '—'}`, `  ضعیف: ${x.weak.join(' | ') || '—'}`);
  }
  L.push('', `مشکل‌های مشترک: ${r.issues.join(' | ') || 'ندارد'}`);
  return L.join('\n');
}
export { GOAL_CHANNEL, addDaysISO };
