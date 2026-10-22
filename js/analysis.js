// «تحلیل سلامت سیستم» (فقط مدیر): همه‌ی داده‌ها را می‌گردد و می‌گوید چه چیزی غلط یا مشکوک است و به چه کسی بگویی اصلاح کند
import { h, fmt, jstr, todayISO, addDaysISO, sum } from './util.js';
import { S, activeSales, businessAccounts, accBalance } from './store.js';
import { pendingCount, blockedCount } from './outbox.js';
import { stockMonths, bizDays } from './analytics.js';
import { modal, pill } from './ui.js';
import { toast } from './util.js';

const days = iso => Math.max(0, Math.round((Date.parse(todayISO() + 'T00:00:00Z') - Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z')) / 864e5));
const names = (arr, f, n = 6) => { const a = [...new Set(arr.map(f).filter(Boolean))]; return a.slice(0, n).join('، ') + (a.length > n ? ` و ${a.length - n} مورد دیگر` : ''); };
const by = (arr, f = x => x.created_by) => [...new Set(arr.map(f).filter(Boolean))];

/** خروجی: [{ lvl: 'err'|'warn'|'info', title, detail, who: [نام‌ها], fix, href }]  +  ok: فهرست بررسی‌های سالم */
export function analyze() {
  const F = [], OK = [], T = S.totals || {}, today = todayISO(), act = activeSales();
  const add = (lvl, title, detail, o = {}) => F.push({ lvl, title, detail, who: o.who || [], fix: o.fix || '', href: o.href || '' });
  const check = (okText, bad) => { if (bad) return; OK.push(okText); };

  // ۱) ترازنامه‌ی کنترلی
  const diff = Math.abs(T.check_diff || 0);
  if (diff > 1) add('err', 'اختلاف در ترازنامه‌ی کنترلی', `اختلاف ${fmt(T.check_diff)} ریال؛ یعنی جایی پول یا کالا درست ثبت نشده.`, { fix: 'ثبت‌های امروز و دیروز را مرور کن؛ اگر پیدا نشد از «تشخیص مشکل» خروجی بگیر.', href: '#/finance' });
  check('ترازنامه‌ی کنترلی بالانس است (اختلاف صفر)', diff > 1);

  // ۲) حساب‌های منفی
  const neg = businessAccounts().filter(a => accBalance(a.id) < -1);
  if (neg.length) add('err', 'حساب کسب‌وکار منفی است', neg.map(a => `${a.name}: ${fmt(accBalance(a.id))}`).join(' · '), { who: by(neg, a => a.owner), fix: 'یا دریافتی/انتقالی ثبت نشده، یا پرداختی از حساب اشتباه ثبت شده. ثبت‌های همان حساب را بررسی و اصلاح کنند.', href: '#/finance' });
  check('هیچ حساب کسب‌وکاری منفی نیست', neg.length);

  // ۳) فروش بدون خریدار (قدیمی‌ها)
  const noBuyer = act.filter(s => !(s.customer || '').trim());
  if (noBuyer.length) add('warn', 'فروش بدون نام خریدار', `${noBuyer.length} فاکتور: ${names(noBuyer, s => s.no)}`, { who: by(noBuyer), fix: 'هر فاکتور را باز کنند، «ویرایش» بزنند و نام خریدار را وارد کنند.', href: '#/sales' });
  check('همه‌ی فاکتورهای فروش نام خریدار دارند', noBuyer.length);

  // ۴) فروش زیر قیمت تمام‌شده یا قیمت عجیب
  const lines = S.saleLines.filter(l => S.SALE[l.sale_id] && !S.SALE[l.sale_id].voided);
  const below = lines.filter(l => l.net_unit < l.unit_cost - 0.5);
  if (below.length) { const ss = [...new Set(below.map(l => S.SALE[l.sale_id]))]; add('warn', 'فروش زیر قیمت تمام‌شده (ضرر)', `${ss.length} فاکتور: ${names(ss, s => s.no)} — مثلاً ${S.I[below[0].item_id].name} با فی ${fmt(Math.round(below[0].net_unit))} در برابر تمام‌شده ${fmt(Math.round(below[0].unit_cost))}`, { who: by(ss), fix: 'اگر عمدی نبوده (تخفیف زیاد یا اشتباه در فی)، فاکتور را ویرایش کنند.', href: '#/sales' }); }
  const odd = lines.filter(l => l.unit_cost > 0 && l.unit_price > l.unit_cost * 4);
  if (odd.length) { const ss = [...new Set(odd.map(l => S.SALE[l.sale_id]))]; add('warn', 'فی فروش بیش از ۴ برابر تمام‌شده (احتمال اشتباه صفر)', `${names(ss, s => s.no)}`, { who: by(ss), fix: 'فی را با فاکتور واقعی تطبیق دهند؛ ممکن است یک صفر اضافه تایپ شده باشد.', href: '#/sales' }); }
  check('هیچ فروشی زیر قیمت تمام‌شده یا با فی عجیب نیست', below.length || odd.length);

  // ۵) تخفیف سنگین
  const heavy = act.filter(s => s.discount > 0 && s.discount / (s.total + s.discount) > 0.25);
  if (heavy.length) add('info', 'تخفیف بیش از ۲۵٪', `${names(heavy, s => `${s.no} (${Math.round(s.discount / (s.total + s.discount) * 100)}٪)`)}`, { who: by(heavy), fix: 'اگر با هماهنگی بوده مشکلی نیست.', href: '#/sales' });

  // ۶) طلب مشتریان: سررسید گذشته / مدت بی‌پرداختی
  const overdueC = S.due.filter(d => d.kind === 'receivable' && d.due_date && d.days_left < 0);
  if (overdueC.length) add('err', 'سررسید مشتری گذشته', `${fmt(sum(overdueC, d => d.amount))} ریال — ${names(overdueC, d => d.party)}`, { who: by(overdueC.map(d => S.vSales.find(s => s.no === d.ref_no)).filter(Boolean)), fix: 'پیگیری و وصول؛ بعد «ثبت دریافت».', href: '#/customers' });
  const aging = new Map();
  for (const s of act) if (s.outstanding > 0.5) { const k = (s.customer || 'بدون نام'); const a = aging.get(k) || { age: 0, owed: 0, who: new Set() }; a.age = Math.max(a.age, days(s.date)); a.owed += s.outstanding; a.who.add(s.seller); aging.set(k, a); }
  const hot = [...aging].filter(([, a]) => a.age >= 8), warm = [...aging].filter(([, a]) => a.age >= 4 && a.age < 8);
  if (hot.length) add('err', 'مشتریانی که بیش از ۸ روز پول نداده‌اند', hot.map(([k, a]) => `${k} (${a.age} روز، ${fmt(a.owed)})`).join(' · '), { who: [...new Set(hot.flatMap(([, a]) => [...a.who]))], fix: 'امروز پیگیری کنند.', href: '#/customers' });
  if (warm.length) add('warn', 'مشتریانی که بیش از ۴ روز پول نداده‌اند', warm.map(([k, a]) => `${k} (${a.age} روز، ${fmt(a.owed)})`).join(' · '), { who: [...new Set(warm.flatMap(([, a]) => [...a.who]))], fix: 'یادآوری مؤدبانه.', href: '#/customers' });
  check('هیچ مشتری‌ای بیش از ۴ روز بی‌پرداخت نمانده', hot.length || warm.length || overdueC.length);
  const noDue = act.filter(s => s.outstanding > 0.5 && !s.due_date);
  if (noDue.length) add('info', 'نسیه‌ی بدون سررسید', `${noDue.length} فاکتور: ${names(noDue, s => s.no)}`, { who: by(noDue), fix: 'در جزئیات فاکتور «تغییر سررسید» را بزنند تا یادآوری فعال شود.', href: '#/customers' });

  // ۷) بدهی به تامین‌کننده
  const overdueS = S.due.filter(d => d.kind === 'payable' && d.due_date && d.days_left < 0);
  if (overdueS.length) add('err', 'سررسید پرداخت به تامین‌کننده گذشته', `${fmt(sum(overdueS, d => d.amount))} ریال — ${names(overdueS, d => d.party)}`, { fix: 'پرداخت کنید یا سررسید را اصلاح کنید.', href: '#/invoices' });
  const noDueP = S.vInvoices.filter(i => !i.voided && i.debt > 0.5 && !i.due_date);
  if (noDueP.length) add('info', 'فاکتور خرید بدهکار بدون سررسید', `${noDueP.length} فاکتور: ${names(noDueP, i => i.no)}`, { who: by(noDueP), fix: 'سررسید ثبت شود.', href: '#/invoices' });
  check('سررسید گذشته‌ای به تامین‌کننده نداریم', overdueS.length);

  // ۸) موجودی
  const negStock = S.lots.filter(l => !l.voided && (l.rem_m < 0 || l.rem_r < 0));
  if (negStock.length) add('err', 'موجودی منفی', names(negStock, l => `${l.item} (${l.lot_no})`), { fix: 'نباید رخ دهد؛ فوراً «تشخیص مشکل» را ببین.', href: '#/stock' });
  const ages = new Map();
  for (const l of S.lots) if (!l.voided && l.rem > 0) { const a = days(l.date), c = ages.get(l.item); if (!c || a > c.age) ages.set(l.item, { age: a }); }
  const old30 = [...ages].filter(([, a]) => a.age >= 30), old14 = [...ages].filter(([, a]) => a.age >= 14 && a.age < 30);
  if (old30.length) add('warn', 'کالای بیش از یک ماه مانده', old30.map(([k, a]) => `${k} (${a.age} روز)`).join(' · '), { fix: 'تخفیف، پست استوری یا پیشنهاد ویژه برای فروش.', href: '#/stock' });
  if (old14.length) add('info', 'کالای بیش از دو هفته مانده', old14.map(([k, a]) => `${k} (${a.age} روز)`).join(' · '), { href: '#/stock' });
  const low = S.stock.filter(i => i.active && i.rem > 0 && i.rem <= i.min_stock);
  if (low.length) add('info', 'کم‌موجودی', low.map(i => `${i.name} (${i.rem})`).join(' · '), { href: '#/stock' });
  check('موجودی منفی و کالای راکد (بیش از ۳۰ روز) نداریم', negStock.length || old30.length);

  // ۹) بستن روز
  const last = S.dayCloses.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!last) add('info', 'هنوز هیچ روزی بسته نشده', 'شمارش واقعی نقد و بانک با سیستم مقایسه نشده.', { who: ['مهسا', 'رعنا'], fix: 'آخر هر روز «بستن روز».', href: '#/finance' });
  else {
    const bad = S.dayCloses.filter(c => days(c.date) <= 14 && Math.abs(c.diff) >= 1);
    if (bad.length) add('err', 'اختلاف در بستن روز (شمارش با سیستم نمی‌خواند)', bad.slice(0, 5).map(c => `${jstr(c.date)} ${(S.A[c.account_id] || {}).name || ''}: ${c.diff > 0 ? 'اضافه' : 'کمبود'} ${fmt(Math.abs(c.diff))}`).join(' · '), { who: by(bad), fix: 'علت اختلاف را پیدا کنند (دریافتی یا هزینه‌ی ثبت‌نشده).', href: '#/finance' });
    if (days(last.date) > 3) add('warn', `آخرین بستن روز ${days(last.date)} روز پیش بوده`, jstr(last.date), { who: ['مهسا', 'رعنا'], fix: 'روزها بسته شود.', href: '#/finance' });
    check('بستن روز اخیر بدون اختلاف است', bad.length);
  }

  // ۱۰) سرمایه شرکا
  const cm = T.capital_m || 0, cr = T.capital_r || 0;
  if (cm < 0 || cr < 0) add('err', 'سرمایه‌ی منفی برای یک شریک', `مهسا ${fmt(cm)} · رعنا ${fmt(cr)}`, { fix: 'برداشت‌ها بیشتر از سرمایه ثبت شده؛ صحت برداشت‌ها را بررسی کن.', href: '#/finance' });
  const dif = Math.abs(cm - cr);
  if (cm + cr > 0 && dif > Math.max(1000000, (cm + cr) * 0.05)) add('info', 'سرمایه‌ی دو شریک برابر نیست', `مهسا ${fmt(cm)} · رعنا ${fmt(cr)} (تفاوت ${fmt(dif)})`, { fix: 'اگر قرار است برابر باشد: مالی ← «انتقال سرمایه» ← «برابر کردن سهم‌ها».', href: '#/finance' });

  // ۱۱) ثبت‌های دیرهنگام و احتمال دوباره‌کاری
  const late = act.filter(s => s.created_at && days(s.created_at) < 30 && (Date.parse(String(s.created_at).slice(0, 10)) - Date.parse(s.date)) / 864e5 > 3);
  if (late.length) add('info', 'فروش با تاریخ خیلی قبل‌تر از ثبت', names(late, s => s.no), { who: by(late), fix: 'اگر تاریخ را اشتباه زده‌اند، ویرایش کنند.', href: '#/sales' });
  const seen = new Map(), dup = [];
  for (const s of act) { const k = `${s.customer}|${s.date}|${s.total}`; if (seen.has(k)) dup.push([seen.get(k), s]); else seen.set(k, s); }
  if (dup.length) add('warn', 'احتمال ثبت دوباره‌ی یک فروش', dup.map(([a, b]) => `${a.no} و ${b.no}`).join(' · '), { who: by(dup.map(d => d[1])), fix: 'اگر تکراری است، یکی را «ابطال» کنند.', href: '#/sales' });
  check('فروش تکراری مشکوک نداریم', dup.length);

  // ۱۲) سیستم و ثبت‌های ارسال‌نشده
  const pend = pendingCount(), blk = blockedCount();
  if (blk) add('err', 'ثبت رد‌شده در صف این دستگاه', `${blk} ثبت توسط سرور رد شده و ذخیره نشده.`, { fix: 'نوار «ذخیره نشد» یا صفحه‌ی «ذخیره‌ها» را ببین.', href: '#/savelog' });
  else if (pend) add('warn', 'ثبت ارسال‌نشده', `${pend} ثبت هنوز در سرور ننشسته.`, { fix: 'اینترنت را چک کن و صفحه را باز نگه دار.', href: '#/savelog' });
  if (S.diagErrors > 0) add('warn', 'خطاهای سیستمی ثبت شده', `${S.diagErrors} خطا در تشخیص مشکل.`, { href: '#/diag' });
  check('هیچ ثبت ارسال‌نشده یا خطای سیستمی نداریم', blk || pend || S.diagErrors > 0);
  const sm = stockMonths();
  if (sm.months != null && sm.months >= 2) add(sm.months >= 3 ? 'warn' : 'info', 'سرمایه‌ی زیادی در انبار خوابیده', `موجودی انبار ${fmt(Math.round(sm.value))} ریال است و با سرعت فروش ۳۰ روز اخیر معادل حدود ${sm.months.toFixed(1)} ماه فروش می‌شود${bizDays() < 60 ? ' (فعالیت تازه است؛ تقریبی)' : ''}.`, { fix: 'فعلاً خرید جدید نکنید و کالای کم‌گردش را با پیشنهاد هدفمند بفروشید؛ جزئیات در «مشاور خرید».', href: '#/analysis' });

  const order = { err: 0, warn: 1, info: 2 };
  F.sort((a, b) => order[a.lvl] - order[b.lvl]);
  return { findings: F, ok: OK };
}

/** متن آماده‌ی پیام برای مهسا و رعنا */
export function messageFor(findings, who) {
  const mine = findings.filter(f => f.lvl !== 'info' && f.fix && (f.who.includes(who) || !f.who.length));
  if (!mine.length) return '';
  return `سلام ${who} جان 🌸\nچند مورد در سیستم MARA نیاز به اصلاح دارد:\n\n` + mine.map((f, i) => `${i + 1}. ${f.title}\n   ${f.detail}\n   ← ${f.fix}`).join('\n\n') + '\n\nممنون 🙏';
}

const LV = { err: ['red', '🔴 مشکل'], warn: ['amber', '🟡 هشدار'], info: ['gray', 'ℹ️ نکته'] };
export function analysisModal() {
  if (!S.me || S.me.role !== 'admin') return toast('تحلیل فقط برای مدیر است', 'err');
  const { findings, ok } = analyze();
  const nErr = findings.filter(f => f.lvl === 'err').length, nWarn = findings.filter(f => f.lvl === 'warn').length;
  const verdict = nErr ? h('div', { class: 'alert red' }, `🔴 ${nErr} مشکل جدی و ${nWarn} هشدار پیدا شد. در زیر نوشته شده به چه کسی بگویی چه چیزی را اصلاح کند.`)
    : nWarn ? h('div', { class: 'alert amber' }, `🟡 مشکل جدی نیست، ولی ${nWarn} هشدار داریم.`) : h('div', { class: 'alert ok' }, '✅ همه‌چیز سالم است؛ مشکل یا هشداری پیدا نشد.');
  const card = f => h('div', { class: 'card', style: 'margin:8px 0' },
    h('div', { class: 'ct' }, pill(LV[f.lvl][1], LV[f.lvl][0]), ' ', f.title),
    h('p', { class: 'hint', style: 'margin:4px 0' }, f.detail),
    f.who.length ? h('p', { class: 'hint', style: 'margin:2px 0' }, '👤 به این‌ها بگو: ', h('b', null, f.who.join('، '))) : null,
    f.fix ? h('p', { class: 'hint', style: 'margin:2px 0;color:var(--green)' }, '🛠 ' + f.fix) : null,
    f.href ? h('a', { href: f.href, class: 'more', onclick: () => m.close() }, 'برو به صفحه ←') : null);
  const msgBtn = who => { const t = messageFor(findings, who); return t ? h('button', { type: 'button', class: 'btn ghost', onclick: async () => { try { await navigator.clipboard.writeText(t); toast(`پیام ${who} کپی شد؛ در تلگرام یا بله بفرست`); } catch { prompt('این متن را کپی کن', t); } } }, `📋 کپی پیام برای ${who}`) : null; };
  const body = h('div', null, verdict, ...findings.map(card),
    findings.length ? h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin:10px 0' }, msgBtn('مهسا'), msgBtn('رعنا')) : null,
    h('h3', { class: 'sec' }, `✅ سالم (${ok.length})`), h('ul', { class: 'hint' }, ok.map(t => h('li', null, t))),
    h('p', { class: 'hint' }, 'این تحلیل فقط می‌خواند و چیزی را تغییر نمی‌دهد. هر بار دکمه را بزنی از روی آخرین داده‌ها دوباره حساب می‌شود.'));
  const m = modal({ title: 'تحلیل سلامت سیستم', body, wide: true });
  return m;
}
