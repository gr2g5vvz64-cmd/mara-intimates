// شاخص‌های تکمیلی مدیر. هر شاخص یا آماده است (عدد دارد) یا «در انتظار داده» است و کنارش نوشته می‌شود از چه زمانی قابل اندازه‌گیری و استناد است.
import { S, activeSales, settingNum } from './store.js';
import { fmt, sum, todayISO, addDaysISO, jmonthKey, jmonthName } from './util.js';
import { stockMonths, stockCoverText, buyerStats, bizDays, noExpensesYet } from './analytics.js';
import { bonusMonth, bonusCfg, GOAL_CHANNEL } from './insights.js';
import { gate, GATES } from './gates.js';

const M = n => `${fmt(Math.round(n))} ریال`;
const P1 = n => (Math.round(n * 10) / 10).toLocaleString('fa-IR') + '٪';
export const PAGE_CHANNEL = 'پیج اینستاگرام';

/** تقویم بدهی به تامین‌کنندگان: گذشته، تا ۷ روز، ۸ تا ۱۴، ۱۵ تا ۳۰ روز و بدون سررسید */
export function payCalendar() {
  const o = { overdue: 0, d7: 0, d14: 0, d30: 0, later: 0, noDue: 0 };
  for (const d of S.due) {
    if (d.kind !== 'payable' || !(d.amount > 0)) continue;
    if (!d.due_date) { o.noDue += d.amount; continue; }
    const k = d.days_left < 0 ? 'overdue' : d.days_left <= 7 ? 'd7' : d.days_left <= 14 ? 'd14' : d.days_left <= 30 ? 'd30' : 'later'; o[k] += d.amount;
  }
  // فاکتورهای بدهکار بدون سررسید ممکن است در v_due نیامده باشند
  const inDue = new Set(S.due.filter(d => d.kind === 'payable').map(d => d.ref_no));
  for (const i of S.vInvoices) if (!i.voided && i.debt > 0.5 && !i.due_date && !inDue.has(i.no)) o.noDue += i.debt;
  o.in30 = o.overdue + o.d7 + o.d14 + o.d30;
  return o;
}
/** نقدینگی آزاد = حساب‌های کسب‌وکار منهای بدهی‌های سررسیددار تا ۳۰ روز آینده (و گذشته) */
export function liquidity() {
  const cal = payCalendar(), cash = (S.totals || {}).business_balance || 0;
  return { cash, committed: cal.in30, free: cash - cal.in30, noDue: cal.noDue, freeAll: cash - cal.in30 - cal.noDue, cal };
}
/** ساختار سود یک ماه شمسی: ناخالص فروش‌ها ← هزینه‌های عمومی ← اثر مرجوعی به تامین‌کننده ← پاداش ← سود قابل تقسیم */
export function profitStructure(mk = jmonthKey(todayISO())) {
  const ss = activeSales().filter(s => jmonthKey(s.date) === mk);
  const gross = sum(ss, s => s.profit), expenses = sum(S.expenses.filter(e => !e.voided && jmonthKey(e.date) === mk), e => e.amount);
  const supRet = sum(S.returns.filter(r => !r.voided && r.kind === 'supplier' && jmonthKey(r.date) === mk), r => r.profit_effect);
  const b = bonusMonth(mk), bonus = (b['مهسا'].total || 0) + (b['رعنا'].total || 0), net = gross - expenses + supRet;
  return { mk, name: jmonthName(mk), gross, expenses, supRet, bonus, net, distributable: net - bonus, cfg: b.cfg, count: ss.length };
}
/** قواعد پاداش به‌صورت متن (برای چاپ در گزارش‌ها تا قابل راستی‌آزمایی باشد) */
export function bonusRulesText() {
  const c = bonusCfg();
  if (!c.on) return 'پاداش فروش آشنایان خاموش است.';
  return `قواعد پاداش آشنایان (بر پایه‌ی «سود وصول‌شده»، ماهانه، پیش از تقسیم ۵۰/۵۰ از استخر سود کسر می‌شود؛ پس هر دو شریک سهم دارند): تا هدف ماهانه ${c.base}٪ ، بالای هدف ${c.above}٪ ، فروشنده‌ی برتر ماه (در صورت رسیدن به هدف) ${c.star}٪ اضافه؛ فروش با سود ≤ ۰ یا حاشیه‌ی کمتر از ${c.minMk}٪ روی بها شمرده نمی‌شود.`;
}

/** فهرست شاخص‌ها: { id, title, ready, value, detail, note, needs } */
export function buildIndicators() {
  const out = [], to = todayISO(), from30 = addDaysISO(to, -29), act = activeSales(), s30 = act.filter(s => s.date >= from30);
  const add = o => out.push({ ready: true, value: '', detail: '', note: '', needs: '', ...o });
  const wait = (id, title, g, extra = '') => add({ id, title, ready: false, note: (g && g.note) || extra, needs: (g && g.need) || '' });

  // ۱) موجودی چند ماه فروش است (برچسب و فرمول یکی)
  { const sm = stockMonths();
    add({ id: 'cover', title: 'موجودی انبار معادل چند ماه فروش', value: stockCoverText(sm), detail: `ارزش موجودی ${M(sm.value)} · بهای تمام‌شده‌ی فروش ۳۰ روز اخیر ${M(sm.cogs30)} · ۷ روز اخیر ${M(sm.cogs7)}`,
      note: sm.young ? `فعالیت فقط ${fmt(sm.days)} روز است؛ عدد ۳۰ روزه کامل نیست و سه عدد بالا را باید کنار هم دید. بعد از ۳۰ تا ۶۰ روز قابل اتکاست.` : '' }); }

  // ۲) تقویم بدهی ۳۰ روز آینده + نقدینگی آزاد
  { const L = liquidity(), c = L.cal;
    if (c.in30 + c.noDue + c.later > 0.5) add({ id: 'paycal', title: 'تقویم بدهی به تامین‌کنندگان (۳۰ روز آینده)', value: `سررسید گذشته ${M(c.overdue)} · تا ۷ روز ${M(c.d7)} · ۸ تا ۱۴ روز ${M(c.d14)} · ۱۵ تا ۳۰ روز ${M(c.d30)}`, detail: c.noDue > 0.5 ? `بدهی بدون سررسید ${M(c.noDue)} (برایش سررسید ثبت کنید)` : '', });
    else add({ id: 'paycal', title: 'تقویم بدهی به تامین‌کنندگان (۳۰ روز آینده)', value: 'بدهی سررسیددار نداریم' });
    add({ id: 'free', title: 'نقدینگی آزاد', value: M(L.free), detail: `حساب‌های کسب‌وکار ${M(L.cash)} منهای بدهی‌های سررسیددار تا ۳۰ روز آینده ${M(L.committed)}${L.noDue > 0.5 ? ` · اگر بدهی بدون سررسید (${M(L.noDue)}) را هم بدهید: ${M(L.freeAll)}` : ''}`, note: L.free < 0 ? 'منفی است: برای پرداخت‌ها پول کافی نداریم.' : '' }); }

  // ۳) نرخ مرجوعی
  { const g = gate(GATES.returns);
    if (!g.ok) wait('returns', 'نرخ مرجوعی', g);
    else { const ids = new Set(s30.map(s => s.id)), units = sum(S.saleLines.filter(l => ids.has(l.sale_id)), l => l.qty), rets = S.returns.filter(r => !r.voided && r.kind === 'customer' && r.date >= from30), ru = sum(rets, r => r.qty);
      add({ id: 'returns', title: 'نرخ مرجوعی (۳۰ روز)', value: units > 0 ? `${P1(ru / units * 100)} (${fmt(rets.length)} مرجوعی، ${fmt(ru)} عدد از ${fmt(units)} عدد فروش)` : '—', note: rets.length === 0 ? 'هیچ مرجوعی ثبت نشده؛ در لباس زیر معمولاً تعویض سایز هست. مطمئن شوید مرجوعی و تعویض هم ثبت می‌شود.' : '' }); } }

  // ۴) سهم پاداش از سود
  { const mk = jmonthKey(to), b = bonusMonth(mk), pc = (b['مهسا'].profitCollected || 0) + (b['رعنا'].profitCollected || 0), tot = (b['مهسا'].total || 0) + (b['رعنا'].total || 0);
    if (b.cfg.on && pc > 0 && (b['مهسا'].goal > 0 || b['رعنا'].goal > 0)) add({ id: 'bonusShare', title: 'سهم پاداش از سود آشنایان (ماه جاری)', value: `${P1(tot / pc * 100)} از سود وصول‌شده`, detail: `پاداش ${M(tot)} از ${M(pc)} سود وصول‌شده‌ی آشنایان` });
    else wait('bonusShare', 'سهم پاداش از سود آشنایان (ماه جاری)', null, 'وقتی هدف ماهانه تعیین و فروش آشنایان ثبت شود محاسبه می‌شود.'); }

  // ۵) سهم کانال‌ها
  { const tot = sum(s30, s => s.total);
    if (tot > 0) { const by = {}; for (const s of s30) by[s.channel || '—'] = (by[s.channel || '—'] || 0) + s.total; const page = by[PAGE_CHANNEL] || 0;
      add({ id: 'channels', title: 'سهم کانال‌ها از فروش (۳۰ روز)', value: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${P1(v / tot * 100)}`).join(' · '), note: page === 0 ? 'پیج اینستاگرام هنوز فروشی ثبت نکرده؛ صفر فروش یعنی ناموفق نیست، آمار دایرکت (پایین) را ثبت کنید.' : '' }); }
    else wait('channels', 'سهم کانال‌ها از فروش (۳۰ روز)', null, 'فروشی ثبت نشده.'); }

  // ۶) میانگین تعداد کالا در هر فاکتور
  { const g = gate({ invoices: 10 });
    if (!g.ok) wait('basket', 'میانگین تعداد کالا در هر فاکتور', g);
    else { const per = {}; for (const s of s30) { const o = per[s.seller] || (per[s.seller] = { n: 0, q: 0 }); o.n++; }
      const byId = new Map(s30.map(s => [s.id, s])); for (const l of S.saleLines) { const s = byId.get(l.sale_id); if (s) per[s.seller].q += l.qty - (l.returned_qty || 0); }
      const all = Object.values(per).reduce((a, o) => ({ n: a.n + o.n, q: a.q + o.q }), { n: 0, q: 0 });
      add({ id: 'basket', title: 'میانگین تعداد کالا در هر فاکتور (۳۰ روز)', value: `${(all.q / all.n).toFixed(1)} عدد`, detail: Object.entries(per).map(([k, o]) => `${k}: ${(o.q / o.n).toFixed(1)}`).join(' · '), note: 'هر چه بیشتر، فروش مکمل (شورت + جوراب + ست) بهتر است.' }); } }

  // ۷) نرخ خرید مجدد
  { const g = gate(GATES.repeat);
    if (!g.ok) wait('repeat', 'نرخ خرید مجدد مشتری', g);
    else { const by = new Map(); for (const s of act) if (s.customer_id) { const o = by.get(s.customer_id) || { first: s.date, days: new Set() }; if (s.date < o.first) o.first = s.date; o.days.add(s.date); by.set(s.customer_id, o); }
      const old = [...by.values()].filter(o => o.first <= addDaysISO(to, -30));
      if (old.length < 5) wait('repeat', 'نرخ خرید مجدد مشتری', null, 'حداقل ۵ مشتری با ۳۰ روز سابقه لازم است.');
      else add({ id: 'repeat', title: 'نرخ خرید مجدد مشتری', value: `${P1(old.filter(o => o.days.size >= 2).length / old.length * 100)} از ${fmt(old.length)} مشتری قدیمی‌تر از ۳۰ روز دوباره خریده‌اند` }); } }

  // ۸) هزینه‌ی جذب مشتری
  { const g = gate(GATES.cac), ads = sum(S.expenses.filter(e => !e.voided && e.date >= from30 && /تبلیغ|ads|اینستا/i.test(e.category || '')), e => e.amount), fresh = buyerStats(from30, to).fresh;
    if (ads > 0 && g.ok && fresh >= 3) add({ id: 'cac', title: 'هزینه‌ی جذب هر مشتری جدید (۳۰ روز)', value: M(ads / fresh), detail: `تبلیغات ${M(ads)} ÷ ${fmt(fresh)} مشتری جدید` });
    else wait('cac', 'هزینه‌ی جذب هر مشتری جدید', ads > 0 ? g : null, ads > 0 ? '' : 'وقتی هزینه‌ی تبلیغات (دسته‌ی «تبلیغات») ثبت شود و حداقل ۳ مشتری جدید باشد محاسبه می‌شود.'); }

  // ۹) سود هر فروشنده به تفکیک دسته
  { const g = gate(GATES.perCategory);
    if (!g.ok) wait('sellerCat', 'سود هر فروشنده به تفکیک دسته', g);
    else { const ok = new Map(act.map(s => [s.id, s])), by = {}; for (const l of S.saleLines) { const s = ok.get(l.sale_id); if (!s) continue; const q = l.qty - (l.returned_qty || 0); if (q <= 0) continue; const it = S.I[l.item_id], cat = (it && it.category) || '—', k = s.seller + '|' + cat, o = by[k] || (by[k] = { seller: s.seller, cat, rev: 0, profit: 0 }); o.rev += q * l.net_unit; o.profit += q * (l.net_unit - l.unit_cost); }
      const txt = n => Object.values(by).filter(o => o.seller === n && o.rev > 0).sort((a, b) => b.profit - a.profit).slice(0, 3).map(o => `${o.cat} ${P1(o.profit / o.rev * 100)}`).join(' · ') || '—';
      add({ id: 'sellerCat', title: 'سود هر فروشنده به تفکیک دسته', value: `مهسا: ${txt('مهسا')} | رعنا: ${txt('رعنا')}` }); } }

  // ۱۰) دایرکت و نرخ تبدیل پیج
  { const rows = (S.pageStats || []).filter(r => r.week_start >= addDaysISO(to, -27)), n = sum(rows, r => r.dms);
    if (rows.length >= 2 && n > 0) { const buys = act.filter(s => s.channel === PAGE_CHANNEL && s.date >= addDaysISO(to, -27)).length, asks = sum(rows, r => r.price_asks);
      add({ id: 'funnel', title: 'قیف فروش پیج (۴ هفته اخیر)', value: `${fmt(n)} دایرکت ← ${fmt(asks)} درخواست قیمت ← ${fmt(buys)} خرید (${P1(buys / n * 100)} از دایرکت‌ها)`, detail: `بازدید پروفایل: ${fmt(sum(rows, r => r.visits))} · ${fmt(rows.length)} هفته ثبت شده` }); }
    else wait('funnel', 'نرخ تبدیل دایرکت به خرید (پیج)', null, 'هر هفته آمار دایرکت، درخواست قیمت و بازدید را وارد کنید (دکمه‌ی «ثبت آمار پیج»)؛ بعد از ۲ هفته ثبت قابل استناد می‌شود.'); }

  // ۱۱) هدف پیج
  { const goal = settingNum('page_goal', 0), mk = jmonthKey(to);
    if (goal > 0) { const done = sum(act.filter(s => s.channel === PAGE_CHANNEL && jmonthKey(s.date) === mk), s => s.total);
      add({ id: 'pageGoal', title: `هدف فروش پیج (${jmonthName(mk)})`, value: `${M(done)} از ${M(goal)} (${P1(done / goal * 100)})` }); }
    else wait('pageGoal', 'هدف فروش پیج', null, 'هنوز تعیین نشده. بعد از دو هفته ثبت آمار دایرکت و دیدن ریتم واقعی پیج، با دکمه‌ی «تنظیمات تحلیل» تعیین شود.'); }

  // ۱۲) ساختار سود ماه جاری
  { const p = profitStructure();
    add({ id: 'profitLayers', title: `ساختار سود ${p.name}`, value: `ناخالص فروش‌ها ${M(p.gross)} − هزینه‌های عمومی ${M(p.expenses)}${p.supRet ? ` + اثر مرجوعی به تامین‌کننده ${M(p.supRet)}` : ''} = ${M(p.net)} ← منهای پاداش آشنایان ${M(p.bonus)} = قابل تقسیم میان شرکا ${M(p.distributable)}`,
      note: noExpensesYet() ? 'هنوز هیچ هزینه‌ی عمومی (بسته‌بندی، ارسال، تبلیغ…) ثبت نشده؛ سود واقعی کمتر از این است.' : '' }); }
  return out;
}
export function indicatorsText() {
  const L = [], items = buildIndicators(), ready = items.filter(x => x.ready), wait = items.filter(x => !x.ready);
  ready.forEach(x => L.push(`• ${x.title}: ${x.value}${x.detail ? ' — ' + x.detail : ''}${x.note ? ' (' + x.note + ')' : ''}`));
  if (wait.length) { L.push('', 'در انتظار داده (هنوز قابل اندازه‌گیری و استناد نیست):'); wait.forEach(x => L.push(`• ${x.title}: ${x.note}`)); }
  return L.join('\n');
}
