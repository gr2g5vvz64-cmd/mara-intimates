// تسویه‌ی خروج رعنا (و سرمایه‌گذارش مهدی): عدد بدهی در روز قطع ثابت می‌ماند؛ پرداخت‌های بعدی (برداشت سود به رعنا) از آن کم می‌شود.
import { S } from './store.js';
import { sum } from './util.js';

export const exitRec = () => (S.exits || []).find(x => !x.voided && x.partner === 'رعنا') || null;

/* برداشت‌هایی که رعنا بعد از قطع گرفته (همان «برداشت سود» به جیب رعنا) */
export function exitPaid(rec = exitRec()) {
  if (!rec) return 0;
  return Math.max(0, (S.totals || {}).payout_r - (rec.paid_base || 0)) || 0;
}
export const exitLeft = (rec = exitRec()) => (rec ? Math.max(0, Number(rec.owed) - exitPaid(rec)) : 0);

export function exitPayments(rec = exitRec()) {
  if (!rec) return [];
  const own = id => (S.A[id] || {}).owner === 'رعنا';
  return (S.transfers || []).filter(t => !t.voided && t.kind === 'profit_payout' && own(t.to_account_id) && String(t.created_at || '') >= String(rec.created_at || ''))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
}

/* چک‌های مهدی که هنوز باز است (جدا از عدد بدهی؛ سررسید که شد خودمان تسویه می‌کنیم) */
export const exitCheques = () => (S.cheques || []).filter(c => !c.voided && c.state !== 'void' && c.cap_owner === 'رعنا' && (c.state === 'open' || c.state === 'passed' || c.state === 'bounced'))
  .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
export const exitChequeTotal = () => sum(exitCheques(), c => c.amount);

/* سهم‌ها بعد از خروج: سهم رعنا ثابت؛ هر چه از سود مانده مال مهسا */
export function exitShareFix(profit, BLfull, rec = exitRec()) {
  if (!rec) return null;
  return { ranaShare: Number(rec.share), mahsaShare: profit - ((BLfull['مهسا'] || 0) + (BLfull['رعنا'] || 0)) - Number(rec.share) };
}
