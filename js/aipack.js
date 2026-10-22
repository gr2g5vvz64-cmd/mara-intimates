// «بسته‌ی بررسی» برای دادن به هوش مصنوعی‌های دیگر: داشبورد + تحلیل عملکرد + بررسی اشتباهات + مشاور خرید + گزارش جلسه
import { jstr, todayISO, fmt, toast, sum, addDaysISO } from './util.js';
import { S, activeSales } from './store.js';
import { payableBreakdown, stockMonths, bizDays } from './analytics.js';
import { buildReport, reportText } from './report.js';
import { analyze } from './analysis.js';
import { loadAdvisor, adviceDigest } from './advisor.js';
import { buildMeeting, meetingText } from './meeting.js';

const M = v => fmt(Math.round(v || 0));
const RULES = `قواعد کسب‌وکار (برای اینکه بررسی‌کننده اشتباه نگیرد):
• MARA INTIMATES: فروش لباس زیر و جوراب زنانه از راه اینستاگرام و آشنایان؛ سه شریک/نقش: مدیر (حمیدرضا)، دو شریک فروشنده (مهسا و رعنا).
• قیمت تمام‌شده‌ی کالا به روش FIFO و شامل هزینه‌های رسیدن به انبار (landed cost) است.
• هیچ چیز پاک نمی‌شود؛ فقط ابطال می‌شود و تاریخچه می‌ماند.
• سود خالص بین دو شریک ۵۰/۵۰ تقسیم می‌شود؛ سرمایه‌ی دو شریک با هم برابرسازی می‌شود. برداشت سود/سرمایه فقط با مدیر است.
• شروع فعالیت: مهر ۱۴۰۵؛ بنابراین داده‌ی کم و دوره‌ی کوتاه است و نتیجه‌گیری‌های آماری باید محتاطانه باشد.
• هدف فروش ماهانه فعلاً فقط برای فروش به «آشنایان» است؛ فروش پیج اینستاگرام هدف جدا دارد (هنوز تعیین نشده).
• مبلغ‌ها به ریال است.`;
const ASK = `از تو (هوش مصنوعی بررسی‌کننده) می‌خواهم:
۱) عددها و نتیجه‌گیری‌های بالا را بخوان و هر جا ناسازگاری، خطای محاسبه‌ای یا ادعای بی‌پشتوانه دیدی دقیق بگو (با اشاره به همان بخش).
۲) توصیه‌های «مشاور خرید» و «تحلیل عملکرد» را نقد کن: کدام منطقی است، کدام خطرناک یا زود است؟ آستانه‌ها (حداقل فروش، تعداد روز و مشتری) را قضاوت کن.
۳) با توجه به کم بودن داده (شروع از مهر ۱۴۰۵) بگو کجا نباید به عددها اعتماد کرد.
۴) سه پیشنهاد عملی و کوچک برای بهبود فروش، موجودی یا پول نقد بده، و اگر شاخص یا گزارشی کم است بگو.
۵) هر جا برای قضاوت داده‌ی بیشتری لازم داری، دقیقاً بگو چه داده‌ای.
پاسخ را فارسی، کوتاه و بندبند بده.`;

export async function buildAiPack({ anon = false } = {}) {
  const T = S.totals || {};
  const L = [`بسته‌ی بررسی MARA INTIMATES — ${jstr(todayISO())}`, '', RULES, '', '=== ۱) وضعیت کلی (داشبورد مدیر) ==='];
  L.push(`حساب‌های کسب‌وکار: ${M(T.business_balance)} · ارزش موجودی: ${M(T.stock_value)} · طلب از مشتریان: ${M(T.receivable)} · بدهی به تامین‌کنندگان: ${M(T.payable)}`);
  if (T.net_worth != null) L.push(`کل دارایی خالص: ${M(T.net_worth)}`);
  const act = S.stock.filter(i => i.active && i.rem > 0);
  L.push(`تعداد کالای موجود: ${fmt(act.length)} · جمع تعداد: ${fmt(act.reduce((a, i) => a + i.rem, 0))}`);
  const pb = payableBreakdown(), sm = stockMonths();
  L.push(`بدهی کل به تامین‌کنندگان: ${M(pb.gross)} · اعتبار نزد تامین‌کنندگان: ${M(pb.credit)} · بدهی خالص (در داشبورد): ${M(pb.net)}`);
  L.push(`موجودی انبار معادل ${sm.months == null ? '—' : sm.months.toFixed(1)} ماه فروش (بهای تمام‌شده‌ی ۳۰ روز اخیر) · روزهای فعالیت تا امروز: ${fmt(bizDays())}`);
  const from30 = addDaysISO(todayISO(), -29), s30 = activeSales().filter(s => s.date >= from30);
  L.push('', 'فروش ۳۰ روز اخیر به تفکیک فروشنده و کانال (ریال؛ سود = پس از مرجوعی، پیش از هزینه‌های عمومی):');
  const cell = new Map(); for (const x of s30) { const k = `${x.seller || '—'} · ${x.channel || '—'}`, o = cell.get(k) || { n: 0, t: 0, p: 0 }; o.n++; o.t += x.total; o.p += x.profit || 0; cell.set(k, o); }
  [...cell.entries()].forEach(([k, o]) => L.push(`  • ${k}: ${fmt(o.n)} فاکتور، فروش ${M(o.t)}، سود ${M(o.p)}`));
  const rets = S.returns.filter(r => !r.voided && r.kind === 'customer' && r.date >= from30);
  L.push('', `مرجوعی‌های ۳۰ روز اخیر (${fmt(rets.length)} مورد):`);
  rets.forEach(r => L.push(`  • ${S.I[r.item_id] ? S.I[r.item_id].name : '—'} ×${fmt(r.qty)} · ${r.condition || ''} · علت: ${r.reason || 'ثبت نشده'} · اثر روی سود ${M(r.profit_effect || 0)}`));
  for (const n of [7, 30]) { L.push('', `=== ۲) تحلیل عملکرد ${fmt(n)} روز اخیر ===`); try { L.push(reportText(buildReport(n))); } catch (e) { L.push('(خطا در ساخت گزارش: ' + e.message + ')'); } }
  L.push('', '=== ۳) بررسی اشتباهات (تحلیل خودکار برنامه) ===');
  try { const { findings, ok } = analyze(); findings.forEach(f => L.push(`• [${f.lvl}] ${f.title}: ${f.detail}${f.fix ? ' ← ' + f.fix : ''}`)); L.push(`سالم: ${ok.join(' | ') || '—'}`); } catch (e) { L.push('(خطا: ' + e.message + ')'); }
  L.push('', '=== ۴) مشاور خرید (۳۰ روز) ===');
  try { L.push(adviceDigest(await loadAdvisor(30, true))); } catch (e) { L.push('(مشاور در دسترس نبود: ' + e.message + ')'); }
  L.push('', '=== ۵) گزارش جلسه‌ی ۱۴ روزه ===');
  try { L.push(meetingText(buildMeeting(14))); } catch (e) { L.push('(خطا: ' + e.message + ')'); }
  L.push('', '=== درخواست از بررسی‌کننده ===', ASK);
  let t = L.join('\n');
  if (anon) {   // نام مشتری و تامین‌کننده را بی‌نام می‌کند
    const names = [...new Set([...(S.customersT || []).map(c => c.name), ...(S.suppliers || []).map(c => c.name)].filter(n => n && n.length >= 3))].sort((a, b) => b.length - a.length);
    names.forEach((n, i) => { t = t.split(n).join(`«طرف حساب ${i + 1}»`); });
    t = t.replace(/[^\n]*(?=\n)/, m => m + ' (نام مشتری‌ها و تامین‌کننده‌ها حذف شده)');
  }
  return t;
}
export async function copyAiPack(anon = false) {
  const t = await buildAiPack({ anon });
  try { await navigator.clipboard.writeText(t); toast('✅ کپی شد؛ در Claude، ChatGPT یا Gemini بچسبان'); } catch { toast('کپی نشد؛ فایل را دانلود کن', 'err'); }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' })); a.download = 'MARA-review' + (anon ? '-anon' : '') + '-' + todayISO() + '.txt'; document.body.append(a); a.click(); a.remove();
  return t;
}
