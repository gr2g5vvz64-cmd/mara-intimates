import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
try {
  const a = await newPage(browser, url, { logs, fa: true }); await login(a, 'hamid@example.com', 'hamid-pass-333'); a.setDefaultTimeout(9000); await a.waitForTimeout(2000);
  const pages = ['#/dashboard', '#/stock', '#/sales', '#/cheques', '#/settle', '#/fund'];
  for (const p of pages) {
    await a.evaluate(h => { location.hash = h; }, p); await a.waitForTimeout(1200);
    const bad = await a.evaluate(() => { const out = []; const tw = document.createTreeWalker(document.getElementById('view'), NodeFilter.SHOW_TEXT); for (let n; (n = tw.nextNode());) { if (/[0-9]/.test(n.nodeValue) && !n.parentElement.closest('input,textarea,script,style,[data-latin]')) out.push(n.nodeValue.trim().slice(0, 40)); } return out.slice(0, 5); });
    ok(bad.length === 0, `صفحه‌ی ${p}: عدد لاتین باقی نمانده ${bad.length ? JSON.stringify(bad) : ''}`);
  }
  await a.evaluate(() => { location.hash = '#/dashboard'; }); await a.waitForTimeout(1200);
  const t = await a.locator('#view').innerText();
  ok(/[۰-۹]{1,3}٬[۰-۹]{3}/.test(t), 'مبلغ‌ها با رقم فارسی و جداکننده‌ی «٬»');
  // تغییر پویا (مودال/ابزارک جدید) هم فارسی می‌شود
  await a.evaluate(() => { const d = document.createElement('div'); d.id = 'zz'; d.textContent = 'مبلغ 1,234,567.5 ریال'; document.body.append(d); }); await a.waitForTimeout(200);
  ok(await a.evaluate(() => document.getElementById('zz').textContent) === 'مبلغ ۱٬۲۳۴٬۵۶۷٫۵ ریال', 'عنصر تازه‌اضافه‌شده هم فارسی می‌شود');
  // ورودی دست‌نخورده
  const v = await a.evaluate(() => { const i = document.createElement('input'); i.value = '123'; document.body.append(i); return new Promise(r => setTimeout(() => r(i.value), 200)); });
  ok(v === '123', 'مقدار input لاتین می‌ماند');
  // کپی → لاتین
  const cp = await a.evaluate(() => { const d = document.getElementById('zz'); const r = document.createRange(); r.selectNodeContents(d); const s = getSelection(); s.removeAllRanges(); s.addRange(r); let got = ''; document.addEventListener('copy', e => { got = e.clipboardData.getData('text/plain'); }, { once: true, capture: false }); document.execCommand('copy'); return got; });
  ok(cp.includes('1,234,567.5'), 'کپی‌کردن متن، عدد لاتین می‌دهد');
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول');
} catch (e) { console.log('ERR', e.message.split('\n')[0]); fails++; }
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
