// صورت‌حساب مشتری: «فاکتور یک فروش» یا «گردش حساب یک مشتری» به‌صورت عکس (PNG) با پیش‌نمایش؛
// قابل ارسال از همان منوی اشتراک‌گذاری گوشی (واتساپ، اینستاگرام، تلگرام…)، ذخیره‌ی عکس و چاپ/PDF.
// هیچ بهای تمام‌شده، سود یا اطلاعات داخلی روی عکس نیست؛ فقط آنچه مشتری باید ببیند.
import { h, fmt, jstr, toast } from './util.js';
import { S } from './store.js';
import { modal, field } from './ui.js';

const W = 900, SC = 2, PAD = 44;
const INK = '#2A1520', MUTED = '#7b6670', LINE = '#e6d3da', ACC = '#B4466B', TINT = '#fdf1f5', RED = '#B3261E', GREEN = '#1B7F4B';
const FONT = "'Vazirmatn',Tahoma,sans-serif";
const NOTE_KEY = 'mara.statement.note';
const getNote = () => { try { return localStorage.getItem(NOTE_KEY) || ''; } catch { return ''; } };
const setNote = v => { try { localStorage.setItem(NOTE_KEY, v); } catch { /* بدون ذخیره هم کار می‌کند */ } };

/* ---------- داده‌ی دو نوع صورت‌حساب ---------- */
export function invoiceSpec(saleId) {
  const s = S.SALE[saleId]; const lines = S.saleLines.filter(l => l.sale_id === saleId);
  const gross = lines.reduce((a, l) => a + l.qty * l.unit_price, 0);
  const cust = S.CUS[s.customer_id] || {};
  const paid = (s.received || 0) + (s.collected || 0);
  return {
    kind: 'invoice', title: 'فاکتور فروش', no: s.no, date: s.date, buyer: s.customer || cust.name || '', phone: cust.phone || '',
    cols: [{ k: 'n', label: '#', w: 50, align: 'center' }, { k: 'name', label: 'کالا', w: 0 }, { k: 'qty', label: 'تعداد', w: 90, align: 'center' }, { k: 'unit', label: 'فی (ریال)', w: 160, align: 'left' }, { k: 'sum', label: 'جمع (ریال)', w: 170, align: 'left' }],
    rows: lines.map((l, i) => ({ n: String(i + 1), name: (S.I[l.item_id] || {}).name || '', qty: fmt(l.qty), unit: fmt(l.unit_price), sum: fmt(l.qty * l.unit_price) })),
    totals: [['جمع کالاها', fmt(gross)], ...(s.discount > 0 ? [['تخفیف', '− ' + fmt(s.discount)]] : []), ['مبلغ فاکتور', fmt(s.total), 'strong'],
      ['پرداخت‌شده', fmt(paid)], s.outstanding > 0.5 ? ['مانده‌ی قابل پرداخت', fmt(s.outstanding), 'due'] : ['وضعیت', 'تسویه ✓', 'ok']],
    extra: s.outstanding > 0.5 && s.due_date ? 'سررسید پرداخت: ' + jstr(s.due_date) : ''
  };
}
export function customerSpec(custId) {
  const c = S.CUS[custId] || {}; const sales = S.vSales.filter(s => s.customer_id === custId && !s.voided);
  const ev = [];
  sales.forEach(s => {
    ev.push({ date: s.date, ord: 0, text: `فاکتور ${s.no} — ${s.items_text || ''}`, plus: s.total });
    if (s.received > 0) ev.push({ date: s.date, ord: 1, text: `پرداخت هنگام خرید (${s.no})`, minus: s.received });
  });
  S.collections.filter(x => !x.voided && S.SALE[x.sale_id] && S.SALE[x.sale_id].customer_id === custId).forEach(x => ev.push({ date: x.date, ord: 2, text: `پرداخت برای فاکتور ${S.SALE[x.sale_id].no}`, minus: x.amount }));
  S.returns.filter(r => !r.voided && r.debt_cancel > 0 && r.sale_line_id).forEach(r => {
    const sl = S.saleLines.find(l => l.id === r.sale_line_id), s = sl && S.SALE[sl.sale_id];
    if (s && s.customer_id === custId) ev.push({ date: r.date, ord: 3, text: `مرجوعی کالا (${s.no})`, minus: r.debt_cancel });
  });
  ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ord - b.ord));
  let bal = 0; const rows = ev.map(e => { bal += (e.plus || 0) - (e.minus || 0); return { date: jstr(e.date), text: e.text, plus: e.plus ? fmt(e.plus) : '', minus: e.minus ? fmt(e.minus) : '', bal: fmt(bal) }; });
  const open = sales.reduce((a, s) => a + (s.outstanding > 0.5 ? s.outstanding : 0), 0);
  return {
    kind: 'statement', title: 'صورت‌حساب مشتری', no: '', date: new Date().toISOString().slice(0, 10), buyer: c.name || '', phone: c.phone || '',
    cols: [{ k: 'date', label: 'تاریخ', w: 120, align: 'center' }, { k: 'text', label: 'شرح', w: 0 }, { k: 'plus', label: 'فاکتور', w: 130, align: 'left' }, { k: 'minus', label: 'پرداخت', w: 130, align: 'left' }, { k: 'bal', label: 'مانده', w: 140, align: 'left' }],
    rows, totals: [['جمع فاکتورها', fmt(sales.reduce((a, s) => a + s.total, 0))], open > 0.5 ? ['مانده‌ی قابل پرداخت', fmt(open), 'due'] : ['وضعیت', 'تسویه ✓', 'ok']], extra: ''
  };
}

/* ---------- نقاشی روی بوم ---------- */
function wrapText(ctx, text, maxW) {
  const words = String(text).split(/\s+/), out = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur); return out.length ? out : [''];
}
function loadLogo() {
  return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'icons/logo-mark.jpg'; });
}
export async function drawStatement(spec, payNote) {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch { /* ادامه با فونت پیش‌فرض */ }
  const logo = await loadLogo();
  const meas = document.createElement('canvas').getContext('2d'); meas.font = `500 22px ${FONT}`; meas.direction = 'rtl';
  const colsW = spec.cols.map(c => c.w); const fixed = colsW.reduce((a, b) => a + b, 0); const flex = W - 2 * PAD - fixed;
  const cols = spec.cols.map(c => ({ ...c, w: c.w || flex }));
  // ارتفاع هر ردیف (شرح بلند چند خطی می‌شود)
  const nameCol = cols.find(c => c.k === 'name' || c.k === 'text');
  const rowsLay = spec.rows.map(r => { const lines = wrapText(meas, r[nameCol.k], nameCol.w - 24); return { r, lines, hgt: Math.max(48, 18 + lines.length * 32) }; });
  const bodyH = rowsLay.reduce((a, x) => a + x.hgt, 0);
  const noteLines = payNote ? wrapText(meas, payNote, W - 2 * PAD - 40) : [];
  const tableY = spec.phone ? 262 : 226;
  const H = tableY + 56 + bodyH + (rowsLay.length ? 0 : 60) + 26 + spec.totals.length * 50 + (spec.extra ? 50 : 0) + (noteLines.length ? 40 + noteLines.length * 32 : 0) + 90;
  const cv = document.createElement('canvas'); cv.width = W * SC; cv.height = H * SC;
  const ctx = cv.getContext('2d'); ctx.scale(SC, SC); ctx.direction = 'rtl'; ctx.textBaseline = 'middle';
  const font = (w, px) => { ctx.font = `${w} ${px}px ${FONT}`; };
  const txt = (t, x, y, { align = 'right', color = INK, w = 500, px = 22 } = {}) => { font(w, px); ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(String(t), x, y); };
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  // سربرگ
  ctx.fillStyle = TINT; ctx.fillRect(0, 0, W, 150); ctx.fillStyle = ACC; ctx.fillRect(0, 0, W, 8);
  if (logo) { ctx.save(); ctx.beginPath(); ctx.arc(W - PAD - 40, 80, 40, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(logo, W - PAD - 80, 40, 80, 80); ctx.restore(); }
  txt('MARA INTIMATES', W - PAD - 100, 66, { w: 800, px: 30, color: ACC }); txt('مارا — لباس زیر زنانه', W - PAD - 100, 104, { px: 20, color: MUTED });
  txt(spec.title, PAD, 60, { align: 'left', w: 800, px: 30 }); if (spec.no) txt(spec.no, PAD, 100, { align: 'left', px: 22, color: MUTED });
  // مشخصات
  let y = 190; txt('خریدار:', W - PAD, y, { px: 20, color: MUTED }); txt(spec.buyer || '—', W - PAD - 90, y, { w: 700, px: 24 });
  txt('تاریخ:', PAD + 230, y, { align: 'right', px: 20, color: MUTED }); ctx.direction = 'ltr'; txt(jstr(spec.date), PAD + 170, y, { align: 'right', w: 700, px: 22 }); ctx.direction = 'rtl';
  if (spec.phone) { y += 38; txt('تلفن:', W - PAD, y, { px: 20, color: MUTED }); ctx.direction = 'ltr'; txt(spec.phone, W - PAD - 90, y, { align: 'right', px: 22 }); ctx.direction = 'rtl'; }
  y = tableY;
  // سرستون جدول
  ctx.fillStyle = ACC; ctx.fillRect(PAD, y, W - 2 * PAD, 56);
  let x = W - PAD; const edges = [];
  cols.forEach(c => { edges.push({ c, right: x, left: x - c.w }); x -= c.w; });
  edges.forEach(e => { const cx = e.c.align === 'center' ? (e.left + e.right) / 2 : e.c.align === 'left' ? e.left + 14 : e.right - 14; txt(e.c.label, cx, y + 28, { align: e.c.align === 'center' ? 'center' : e.c.align === 'left' ? 'left' : 'right', color: '#fff', w: 700, px: 20 }); });
  y += 56;
  rowsLay.forEach((rl, i) => {
    if (i % 2) { ctx.fillStyle = '#fbf6f8'; ctx.fillRect(PAD, y, W - 2 * PAD, rl.hgt); }
    edges.forEach(e => {
      const v = rl.r[e.c.k]; if (v === '' || v == null) return;
      if (e.c.k === 'name' || e.c.k === 'text') { rl.lines.forEach((ln, j) => txt(ln, e.right - 14, y + 24 + j * 32, { px: 21 })); return; }
      const num = ['qty', 'unit', 'sum', 'plus', 'minus', 'bal'].includes(e.c.k);
      ctx.direction = num ? 'ltr' : 'rtl';
      const cx = e.c.align === 'center' ? (e.left + e.right) / 2 : e.c.align === 'left' ? e.left + 14 : e.right - 14;
      txt(v, cx, y + rl.hgt / 2, { align: e.c.align === 'center' ? 'center' : e.c.align === 'left' ? 'left' : 'right', px: 21, w: e.c.k === 'bal' || e.c.k === 'sum' ? 700 : 500 });
      ctx.direction = 'rtl';
    });
    ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PAD, y + rl.hgt); ctx.lineTo(W - PAD, y + rl.hgt); ctx.stroke();
    y += rl.hgt;
  });
  if (!rowsLay.length) { txt('موردی ثبت نشده است', W / 2, y + 30, { align: 'center', color: MUTED }); y += 60; }
  // جمع‌ها
  y += 26;
  spec.totals.forEach(([k, v, tone]) => {
    const strong = tone === 'strong' || tone === 'due'; const color = tone === 'due' ? RED : tone === 'ok' ? GREEN : INK;
    if (strong) { ctx.fillStyle = tone === 'due' ? '#fdecea' : TINT; ctx.fillRect(PAD, y - 8, W - 2 * PAD, 48); }
    txt(k, W - PAD - 14, y + 16, { w: strong ? 800 : 500, px: strong ? 24 : 22, color: strong ? color : MUTED });
    ctx.direction = 'ltr'; txt(v + (/\d/.test(v) ? '  ریال' : ''), PAD + 14, y + 16, { align: 'left', w: 800, px: strong ? 26 : 22, color }); ctx.direction = 'rtl';
    y += 50;
  });
  if (spec.extra) { txt('⏰ ' + spec.extra, W - PAD - 14, y + 14, { px: 21, color: RED }); y += 50; }
  if (noteLines.length) {
    y += 6; ctx.strokeStyle = LINE; ctx.setLineDash([6, 6]); ctx.strokeRect(PAD, y, W - 2 * PAD, 24 + noteLines.length * 32); ctx.setLineDash([]);
    noteLines.forEach((ln, j) => txt(ln, W - PAD - 20, y + 28 + j * 32, { px: 21 })); y += 24 + noteLines.length * 32 + 10;
  }
  txt('از خرید شما سپاسگزاریم 🌸', W / 2, H - 40, { align: 'center', px: 21, color: MUTED });
  return cv;
}

/* ---------- پیش‌نمایش و ارسال ---------- */
export async function showStatement(spec) {
  if (!spec.buyer) return toast('این فاکتور خریدار ندارد؛ اول نام خریدار را ثبت کن', 'err');
  const note = h('textarea', { class: 'inp', rows: 2, placeholder: 'اختیاری: شماره کارت / توضیح پرداخت که روی عکس بیاید', value: getNote() });
  const img = h('img', { class: 'stm-img', alt: 'پیش‌نمایش صورت‌حساب' });
  const status = h('p', { class: 'hint' }, 'در حال ساخت…');
  let blob = null, cvRef = null, seq = 0;
  const redraw = async () => {
    const my = ++seq; status.textContent = 'در حال ساخت…';
    try {
      const cv = await drawStatement(spec, note.value.trim()); if (my !== seq) return; cvRef = cv;
      blob = await new Promise(r => cv.toBlob(r, 'image/png')); img.src = URL.createObjectURL(blob); status.textContent = 'همین عکس ارسال می‌شود.';
    } catch (e) { status.textContent = 'ساخت عکس ممکن نشد: ' + (e && e.message || e); }
  };
  let t; note.addEventListener('input', () => { setNote(note.value); clearTimeout(t); t = setTimeout(redraw, 350); });
  const fname = `${spec.kind === 'invoice' ? 'فاکتور-' + spec.no : 'صورت‌حساب-' + spec.buyer}.png`.replace(/\s+/g, '-');
  const share = h('button', { class: 'btn primary', type: 'button' }, '📤 ارسال (واتساپ، اینستاگرام…)');
  share.onclick = async () => {
    if (!blob) return;
    const file = new File([blob], fname, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: spec.title + ' ' + spec.buyer }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    save.click(); toast('این دستگاه اشتراک‌گذاری مستقیم ندارد؛ عکس ذخیره شد، از گالری بفرست');
  };
  const save = h('a', { class: 'btn ghost', download: fname, href: '#', role: 'button' }, '💾 ذخیره‌ی عکس');
  save.addEventListener('click', e => { if (!blob) { e.preventDefault(); return; } save.href = URL.createObjectURL(blob); });
  const pr = h('button', { class: 'btn ghost', type: 'button' }, '🖨 چاپ / PDF');
  pr.onclick = () => {
    if (!blob) return; const w = window.open('', '_blank'); if (!w) return toast('اجازه‌ی باز شدن پنجره را بده', 'err');
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${spec.title}</title><style>body{margin:0}img{width:100%}@page{margin:8mm}</style><img src="${URL.createObjectURL(blob)}" onload="setTimeout(()=>print(),150)">`); w.document.close();
  };
  const m = modal({ title: `${spec.title}${spec.no ? ' ' + spec.no : ''} — پیش‌نمایش`, wide: true, body: h('div', { class: 'stm' }, field('توضیح پرداخت (روی عکس می‌آید)', note), status, h('div', { class: 'stm-wrap' }, img)), footer: [share, save, pr] });
  redraw(); return m;
}
