// «بسته‌ی بررسی» برای دادن به هوش مصنوعی‌های دیگر: داشبورد + تحلیل عملکرد + بررسی اشتباهات + مشاور خرید + گزارش جلسه
import { jstr, todayISO, fmt, toast, sum, addDaysISO } from './util.js';
import { S, activeSales } from './store.js';
import { payableBreakdown, stockMonths, stockCoverText, bizDays, noExpensesYet } from './analytics.js';
import { indicatorsText, bonusRulesText } from './indicators.js';
import { buildReport, reportText } from './report.js';
import { analyze } from './analysis.js';
import { loadAdvisor, adviceDigest } from './advisor.js';
import { buildMeeting, meetingText } from './meeting.js';

const M = v => fmt(Math.round(v || 0));
const RULES = `قواعد کسب‌وکار (برای اینکه بررسی‌کننده اشتباه نگیرد):
• MARA INTIMATES: فروش لباس زیر و جوراب زنانه از راه اینستاگرام و آشنایان؛ سه شریک/نقش: مدیر (حمیدرضا)، دو شریک فروشنده (مهسا و رعنا).
• قیمت تمام‌شده‌ی کالا به روش FIFO و شامل هزینه‌های رسیدن به انبار (landed cost) است.
• هیچ چیز پاک نمی‌شود؛ فقط ابطال می‌شود و تاریخچه می‌ماند.
• سود قابل تقسیم (پس از کسر هزینه‌ها و پاداش آشنایان) بین دو شریک ۵۰/۵۰ تقسیم می‌شود؛ سرمایه‌ی دو شریک با هم برابرسازی می‌شود. برداشت سود/سرمایه فقط با مدیر است.
• شروع فعالیت: مهر ۱۴۰۵؛ بنابراین داده‌ی کم و دوره‌ی کوتاه است و نتیجه‌گیری‌های آماری باید محتاطانه باشد.
• هدف فروش ماهانه فعلاً فقط برای فروش به «آشنایان» است؛ فروش پیج اینستاگرام هدف جدا دارد (هنوز تعیین نشده).
• مبلغ‌ها به ریال است.
• هر شاخصی که داده‌ی کافی ندارد یا نشان داده نمی‌شود یا کنارش نوشته «بعد از N روز قابل اندازه‌گیری است»؛ آن‌ها را مبنای نتیجه‌گیری نکن.`;
const ASK = `از تو (هوش مصنوعی بررسی‌کننده) می‌خواهم:
۱) عددها و نتیجه‌گیری‌های بالا را بخوان و هر جا ناسازگاری، خطای محاسبه‌ای یا ادعای بی‌پشتوانه دیدی دقیق بگو (با اشاره به همان بخش).
۲) توصیه‌های «مشاور خرید» و «تحلیل عملکرد» را نقد کن: کدام منطقی است، کدام خطرناک یا زود است؟ آستانه‌ها (حداقل فروش، تعداد روز و مشتری) را قضاوت کن.
۳) با توجه به کم بودن داده (شروع از مهر ۱۴۰۵) بگو کجا نباید به عددها اعتماد کرد.
۴) سه پیشنهاد عملی و کوچک برای بهبود فروش، موجودی یا پول نقد بده، و اگر شاخص یا گزارشی کم است بگو.
۵) هر جا برای قضاوت داده‌ی بیشتری لازم داری، دقیقاً بگو چه داده‌ای.
پاسخ را فارسی، کوتاه و بندبند بده.`;

/* هر بخش جدا قابل خروجی است؛ «کل MARA» همه را پشت هم می‌گذارد */
const safe = async f => { try { return await f(); } catch (e) { return '(خطا: ' + e.message + ')'; } };
export const SECTIONS = [
  { id: 'status', icon: '🏦', title: 'وضعیت کلی (داشبورد مدیر)', hint: 'حساب‌ها، موجودی، طلب و بدهی، فروش به تفکیک فروشنده/کانال، مرجوعی‌ها', build: async () => {
    const T = S.totals || {}, L = [];
    L.push(`حساب‌های کسب‌وکار: ${M(T.business_balance)} · ارزش موجودی: ${M(T.stock_value)} · طلب از مشتریان: ${M(T.receivable)} · بدهی به تامین‌کنندگان: ${M(T.payable)}`);
    if (T.net_worth != null) L.push(`کل دارایی خالص: ${M(T.net_worth)}`);
    const act = S.stock.filter(i => i.active && i.rem > 0);
    L.push(`تعداد کالای موجود: ${fmt(act.length)} · جمع تعداد: ${fmt(act.reduce((a, i) => a + i.rem, 0))}`);
    const pb = payableBreakdown(), sm = stockMonths();
    L.push(`بدهی کل به تامین‌کنندگان: ${M(pb.gross)} · اعتبار نزد تامین‌کنندگان: ${M(pb.credit)} · بدهی خالص (در داشبورد): ${M(pb.net)}`);
    L.push(`موجودی انبار معادل: ${stockCoverText(sm)} · روزهای فعالیت تا امروز: ${fmt(bizDays())}${noExpensesYet() ? ' · هنوز هیچ هزینه‌ی عمومی ثبت نشده (سود نشان‌داده‌شده پیش از هزینه‌هاست)' : ''}`);
    L.push(bonusRulesText());
    const from30 = addDaysISO(todayISO(), -29), s30 = activeSales().filter(s => s.date >= from30);
    L.push('', 'فروش ۳۰ روز اخیر به تفکیک فروشنده و کانال (ریال؛ سود = پس از مرجوعی، پیش از هزینه‌های عمومی):');
    const cell = new Map(); for (const x of s30) { const k = `${x.seller || '—'} · ${x.channel || '—'}`, o = cell.get(k) || { n: 0, t: 0, p: 0 }; o.n++; o.t += x.total; o.p += x.profit || 0; cell.set(k, o); }
    [...cell.entries()].forEach(([k, o]) => L.push(`  • ${k}: ${fmt(o.n)} فاکتور، فروش ${M(o.t)}، سود ${M(o.p)}`));
    const rets = S.returns.filter(r => !r.voided && r.kind === 'customer' && r.date >= from30);
    L.push('', `مرجوعی‌های ۳۰ روز اخیر (${fmt(rets.length)} مورد):`);
    rets.forEach(r => L.push(`  • ${S.I[r.item_id] ? S.I[r.item_id].name : '—'} ×${fmt(r.qty)} · ${r.condition || ''} · علت: ${r.reason || 'ثبت نشده'} · اثر روی سود ${M(r.profit_effect || 0)}`));
    return L.join('\n'); } },
  { id: 'perf7', icon: '📈', title: 'تحلیل عملکرد ۷ روز اخیر', hint: 'فروش، سود، مشتری‌ها، کالاها و پیشنهادهای عملی', build: async () => reportText(buildReport(7)) },
  { id: 'perf30', icon: '📈', title: 'تحلیل عملکرد ۳۰ روز اخیر', hint: 'همان گزارش برای یک ماه', build: async () => reportText(buildReport(30)) },
  { id: 'perf365', icon: '📈', title: 'تحلیل عملکرد ۳۶۵ روز اخیر', hint: 'سالانه (فعلاً داده‌ی کم)', all: false, build: async () => reportText(buildReport(365)) },
  { id: 'audit', icon: '🔍', title: 'بررسی اشتباهات', hint: 'مغایرت‌ها و هشدارهای دفتر + بخش «هنوز قابل سنجش نیست»', build: async () => {
    const { findings, ok, pending } = analyze(), L = findings.map(f => `• [${f.lvl}] ${f.title}: ${f.detail}${f.fix ? ' ← ' + f.fix : ''}`);
    L.push(`سالم: ${ok.join(' | ') || '—'}`); if (pending.length) L.push(`هنوز قابل سنجش نیست: ${pending.map(x => `${x.title} (${x.note})`).join(' | ')}`); return L.join('\n'); } },
  { id: 'advisor', icon: '🧭', title: 'مشاور خرید (۳۰ روز)', hint: 'مدل‌ها: تقاضا، موجودی، تصمیم؛ رنگ/سایزها', build: async () => adviceDigest(await loadAdvisor(30, true)) },
  { id: 'meeting', icon: '🧑‍💼', title: 'گزارش جلسه‌ی ۱۴ روزه', hint: 'مقایسه‌ی مهسا و رعنا، هدف و پاداش', build: async () => meetingText(buildMeeting(14)) },
  { id: 'ind', icon: '📊', title: 'شاخص‌های تکمیلی', hint: 'نقدینگی آزاد، تقویم بدهی، مرجوعی، کانال‌ها، قیف دایرکت و شاخص‌های «در انتظار داده»', build: async () => indicatorsText() }
];
export const anonymize = t => {   // نام مشتری و تامین‌کننده را بی‌نام می‌کند
  const names = [...new Set([...(S.customersT || []).map(c => c.name), ...(S.suppliers || []).map(c => c.name)].filter(n => n && n.length >= 3))].sort((a, b) => b.length - a.length);
  names.forEach((n, i) => { t = t.split(n).join(`«طرف حساب ${i + 1}»`); });
  return t;
};
/** یک بخش (یا چند بخش) را به متن تبدیل می‌کند؛ با RULES و درخواست برای دادن به هوش مصنوعی */
export async function buildSections(ids, { anon = false, ask = true } = {}) {
  const list = SECTIONS.filter(x => ids.includes(x.id));
  const L = [`گزارش MARA INTIMATES — ${jstr(todayISO())}${anon ? ' (نام مشتری‌ها و تامین‌کننده‌ها حذف شده)' : ''}`, '', RULES];
  let n = 0;
  for (const s of list) { n++; L.push('', `=== ${fmt(n)}) ${s.title} ===`, await safe(s.build)); }
  if (ask) L.push('', '=== درخواست از بررسی‌کننده ===', ASK);
  const t = L.join('\n'); return anon ? anonymize(t) : t;
}
export const ALL_IDS = SECTIONS.filter(s => s.all !== false).map(s => s.id);
export const buildAiPack = ({ anon = false } = {}) => buildSections(ALL_IDS, { anon });
export function saveText(t, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' })); a.download = name; document.body.append(a); a.click(); a.remove();
}
export async function copyAiPack(anon = false) {
  const t = await buildAiPack({ anon });
  try { await navigator.clipboard.writeText(t); toast('✅ کپی شد؛ در Claude، ChatGPT یا Gemini بچسبان'); } catch { toast('کپی نشد؛ فایل را دانلود کن', 'err'); }
  saveText(t, 'MARA-review' + (anon ? '-anon' : '') + '-' + todayISO() + '.txt');
  return t;
}
