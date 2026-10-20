// انبارگردانی ماهانه: مدیر شروع می‌کند، مهسا و رعنا می‌شمارند، مدیر مقایسه را می‌بیند و تأیید می‌کند
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const sleepP = (p, ms) => p.waitForTimeout(ms);
const go = async (p, h) => { await p.evaluate(x => { location.hash = x; }, h); await sleepP(p, 700); };
const partner = async (email, pass, delta) => {
  const p = await newPage(browser, url, { logs }); await login(p, email, pass); p.setDefaultTimeout(8000);
  await go(p, '#/monthcount'); const rows = p.locator('.stk-row:visible'); const n = await rows.count();
  ok(n > 0, email + ': جدول شمارش آمد (' + n + ' قلم)');
  ok(await p.locator('button.primary.lg').isDisabled(), email + ': بدون شمارش و تأیید، ثبت قفل است');
  let changed = false;
  for (let i = 0; i < n; i++) { const s = parseInt((await rows.nth(i).locator('.stk-s b').innerText()).replace(/[^\d]/g, ''), 10); const v = (!changed && delta && s >= 2) ? s + delta : s; if (v !== s) changed = true; await rows.nth(i).locator('.stk-in').fill(String(v)); }
  await sleepP(p, 300); await p.locator('.ck input').check(); await sleepP(p, 300);
  ok(!(await p.locator('button.primary.lg').isDisabled()), email + ': بعد از شمارش همه و تأیید، ثبت باز شد');
  await p.screenshot({ path: '/tmp/mc_partner_' + email.split('@')[0] + '.png' });
  await p.locator('button.primary.lg').click(); await sleepP(p, 2500); await p.screenshot({ path: '/tmp/mc_after_' + email.split('@')[0] + '.png' });
  ok((await p.locator('body').innerText()).includes('تکمیل شد'), email + ': کارت تکمیل و تشکر دیده شد');
  return p;
};
const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
try {
  await go(page, '#/monthcount');
  ok((await page.locator('body').innerText()).includes('انبارگردانی ماهانه'), 'مدیر: صفحه باز شد');
  page.on('dialog', d => d.accept());
  await page.click('text=＋ شروع و ارسال پیام این ماه'); await sleepP(page, 500);
  const cb = page.locator('.ov').last().locator('button.primary, button', { hasText: /شروع و ارسال/ }).last(); if (await cb.count()) await cb.click(); await sleepP(page, 2000);
  let t = await D(); ok((t.monthly_counts || []).length === 1 && (t.monthly_count_parts || []).length === 2, 'انبارگردانی ماه با دو بخش ساخته شد');
  const pm = await partner('mahsa@example.com', 'mahsa-pass-1', -1);
  const pr = await partner('rana@example.com', 'rana-pass-22', 0);
  t = await D(); ok(t.monthly_count_parts.every(x => x.completed_at), 'هر دو تکمیل شدند');
  await page.reload(); await sleepP(page, 1500); await go(page, '#/monthcount');
  ok(await page.locator('.tag.r').count() > 0, 'مدیر: کسری مهسا در مقایسه دیده شد');
  await page.screenshot({ path: '/tmp/mc_admin.png', fullPage: true });
  await page.locator('input[type=checkbox]').last().check().catch(() => {});
  await page.locator('button.primary.lg', { hasText: 'تأیید نتیجه' }).click(); await sleepP(page, 400);
  const cb2 = page.locator('.ov').last().locator('button', { hasText: 'تأیید و اعمال' }).last(); if (await cb2.count()) await cb2.click(); await sleepP(page, 2200);
  t = await D(); ok(t.monthly_counts[0].status === 'closed', 'مدیر: ماه بسته شد');
  ok((t.partner_charges || []).length + (t.monthly_count_results || []).filter(r => r.waived).length >= 1, 'کسر از سود یا ردِ اعتراض ثبت شد');
  ok(Math.abs(t.v_totals.check_diff) < 1, 'ترازنامه بالانس ماند');
  await page.setViewportSize({ width: 390, height: 800 }); await go(page, '#/monthcount');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), 'گوشی: اسکرول افقی ندارد');
  await page.screenshot({ path: '/tmp/mc_mobile.png' });
  ok(logs.filter(l => /pageerror/i.test(l)).length === 0, 'خطای جاوااسکریپت نبود');
} catch (e) { console.log('EXC', e.message); fails++; }
await browser.close(); srv.close(); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
