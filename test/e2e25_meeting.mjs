import { serve, launch, newPage, login } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const sleep = (p, ms) => p.waitForTimeout(ms);
try {
  const a = await newPage(browser, url, { logs, viewport: { width: 1280, height: 900 } }); await login(a, 'hamid@example.com', 'hamid-pass-333'); a.setDefaultTimeout(9000); await sleep(a, 900);
  ok(await a.locator('.side a[data-r="meeting"]').count() === 0, 'مدیر: «گزارش جلسه» دیگر در منوی کناری تکراری نیست (فقط تب تحلیل)');
  // هدف: مهسا خیلی بالا (عقب)، رعنا خیلی کم (محقق)
  const info = await a.evaluate(async () => {
    const st = await import('/js/store.js'), u = await import('/js/util.js'), ins = await import('/js/insights.js'); const mk = u.jmonthKey(u.todayISO());
    await st.rpc('set_goal', { month: mk, owner: 'مهسا', amount: 5e9 }, { queue: false }); await st.rpc('set_goal', { month: mk, owner: 'رعنا', amount: 1000 }, { queue: false });
    await st.loadAll();
    const manual = p => st.S.vSales.filter(s => !s.voided && s.seller === p && s.channel === 'آشنایان' && u.jmonthKey(s.date) === mk).reduce((q, s) => q + s.total, 0);
    return { g: ['مهسا', 'رعنا'].map(p => ({ p, done: ins.goalProgress(p).done, manual: manual(p), pace: ins.goalProgress(p).pace.key })), all: st.S.vSales.filter(s => !s.voided && s.channel !== 'آشنایان').length };
  });
  ok(info.g.every(x => Math.abs(x.done - x.manual) < 1), 'هدف فقط فروش «آشنایان» را می‌شمارد: ' + JSON.stringify(info.g.map(x => [x.p, x.done, x.pace])));
  ok(info.g[0].pace === 'behind' && info.g[1].pace === 'done', 'وضعیت: مهسا خیلی عقب، رعنا محقق');
  await a.evaluate(() => { location.hash = '#/meeting'; }); await a.waitForSelector('.mt .mt-title', { timeout: 15000 }); await sleep(a, 500);
  const t = await a.locator('.mt').innerText();
  ok(t.includes('گزارش جلسه‌ی دو هفته‌ای') && t.includes('خلاصه‌ی کل') && t.includes('مقایسه‌ی مهسا و رعنا') && t.includes('کجا خوب بودیم') && t.includes('هدف دو هفته‌ی بعد') && t.includes('دستور جلسه') && t.includes('یادداشت و تصمیم‌ها'), 'همه‌ی بخش‌های برگه');
  ok(t.includes('خیلی عقب') && t.includes('هدف محقق شد'), 'وضعیت هدف دو نفر در برگه');
  ok(t.includes('هدف پیج اینستاگرام') && t.includes('هدف جدا'), 'اینستاگرام: بدون هدف و جداگانه');
  ok(await a.locator('.mt .mt-mark').count() === 2 && await a.locator('.mt .mt-line').count() === 7, 'نشانگر زمان ماه و خطوط یادداشت');
  const txt = await a.evaluate(async () => { const m = await import('/js/meeting.js'); return m.meetingText(m.buildMeeting(14)); });
  ok(txt.includes('مهسا') && txt.includes('رعنا') && txt.includes('هدف آشنایان ماه'), 'متن برای Claude ساخته شد');
  for (const w of ['۷ روز اخیر', '۳۰ روز اخیر']) { await a.locator('.chips button', { hasText: w }).first().click(); await sleep(a, 300); ok((await a.locator('.mt').innerText()).includes('گزارش جلسه‌ی دو هفته‌ای'), 'بازه ' + w); }
  await a.screenshot({ path: 'shots/f25_meeting.png', fullPage: true });
  await a.emulateMedia({ media: 'print' }); await a.screenshot({ path: 'shots/f25_meeting_print.png', fullPage: true });
  // داشبورد هدف
  await a.emulateMedia({ media: 'screen' }); await a.evaluate(() => { location.hash = '#/'; }); await sleep(a, 900);
  const d = await a.locator('.dbody').innerText(); ok(d.includes('هدف فروش به آشنایان') && d.includes('خیلی عقب'), 'داشبورد: هدف آشنایان و وضعیت');
  // شریک
  const m = await newPage(browser, url, { logs, viewport: { width: 1280, height: 900 } }); await login(m, 'mahsa@example.com', 'mahsa-pass-1'); await sleep(m, 900);
  ok(await m.locator('.side a[data-r="meeting"]').count() === 0, 'مهسا: گزارش جلسه ندارد');
  await m.evaluate(() => { location.hash = '#/meeting'; }); await sleep(m, 600); ok(!(await m.locator('.mt').count()), 'مهسا با آدرس مستقیم هم باز نمی‌کند');
  const real = logs.filter(l => !/ERR_FAILED|net::ERR|40\d|Failed to load resource/.test(l)); ok(real.length === 0, 'بدون خطای کنسول' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('FAIL exception', e.message.split('\n')[0]); fails++; }
await browser.close(); srv.close(); console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
