import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const sleep = (p, ms) => p.waitForTimeout(ms);
try {
  // مدیر
  const pa = await newPage(browser, url, { logs }); await login(pa, 'hamid@example.com', 'hamid-pass-333'); pa.setDefaultTimeout(8000); await sleep(pa, 1000);
  let t = await pa.locator('.dash').innerText();
  ok(await pa.locator('.dash svg.chart').count() >= 2, 'مدیر نمودار می‌بیند: ' + await pa.locator('.dash svg.chart').count());
  ok(['امروز', '۷ روز', '۳۰ روز', '۳ ماه', 'یک سال'].every(x => t.includes(x)), 'چیپ‌های بازه هست');
  ok(/خریدار (جدید|این بازه|فعال)/.test(t) && /تامین‌کننده‌ی (جدید|این بازه)|از چند نفر خریدیم/.test(t), 'کارت آدم‌ها (خریدار/تامین‌کننده)');
  ok(t.includes('نسبت به بازه‌ی قبل') || t.includes('بازه‌ی قبل'), 'مقایسه با بازه‌ی قبل');
  await pa.locator('.chips button, .chip', { hasText: '۷ روز' }).first().click(); await sleep(pa, 500);
  ok((await pa.locator('.dash').innerText()).includes('۷ روز'), 'تغییر بازه کار می‌کند');
  await pa.locator('.chips button, .chip', { hasText: 'ماهانه' }).first().click(); await sleep(pa, 500);
  ok(await pa.locator('.dash svg.chart').count() >= 2, 'روند ماهانه');
  ok(await pa.locator('button.qa', { hasText: 'تحلیل' }).count() === 1, 'دکمه‌ی تحلیل مدیر');
  // شریک‌ها
  for (const [em, pw, me, other] of [['mahsa@example.com', 'mahsa-pass-1', 'مهسا', 'رعنا'], ['rana@example.com', 'rana-pass-22', 'رعنا', 'مهسا']]) {
    const pm = await newPage(browser, url, { logs }); await login(pm, em, pw); await sleep(pm, 1000);
    const x = await pm.locator('.dash').innerText();
    ok(await pm.locator('.dash svg').count() === 0, me + ': بدون نمودار');
    ok(x.includes('امروز من') && x.includes('کارهای من') && x.includes('جنس و پول من') && x.includes('سود من'), me + ': بلوک‌های اصلی');
    ok(x.includes('جنس دست ' + other), me + ': موجودی شریک دیگر دیده می‌شود');
    ok(!x.includes('مقایسه') && !x.includes('کل MARA') && !x.includes('بدهی به تامین'), me + ': مقایسه/کل/بدهی تامین‌کننده نیست');
    ok(await pm.locator('button.qa').count() === 4, me + ': چهار دکمه‌ی بزرگ');
  }
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول' + (real.length ? ': ' + real.slice(0, 2).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message.split('\n')[0]); fails++; }
await browser.close(); srv.close(); console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
