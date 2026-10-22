// رنگ و سایز کالا: ساخت چند ترکیب با یک بار نوشتن نام، فیلتر در لیست کالا، و دیدن آن‌ها در فرم فروش
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const post = async (tok, path, body) => (await (await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })).json());
const tok = (await post('', '/api/auth/login/', { identifier: 'hamid@example.com', password: 'hamid-pass-333' })).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(8000);
const sleep = ms => page.waitForTimeout(ms), M = page.locator('.ov');
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(500); };
try {
  await go('#/items'); await page.click('text=＋ کالای جدید'); await M.waitFor();
  ok(await M.locator('.z2').count() >= 5, 'فرم کالای جدید کادرهای شماره‌دار دارد');
  const bw = await M.locator('.z2').first().evaluate(e => parseFloat(getComputedStyle(e).borderTopWidth)); ok(bw >= 2, 'کادرها خط دور پررنگ دارند: ' + bw + 'px');
  await M.locator('input.inp').first().fill('سوتین دانتل مدل ۱');
  await M.locator('.chip', { hasText: /^سوتین$/ }).first().click();
  for (const c of ['مشکی', 'کرم']) await M.locator('.chip.optc', { hasText: c }).first().click();
  ok(await M.locator('.z2 .zt', { hasText: 'سایزهای سوتین' }).count() === 1, 'سایز بر اساس دسته: «سایزهای سوتین» (دور + کاپ)');
  ok(await M.locator('.chip.optc', { hasText: /^C$/ }).count() === 1 && await M.locator('.chip.optc.on', { hasText: /^۷۵$/ }).count() === 1, 'سوتین: دور زیر سینه و کاپ با پیش‌فرض رایج (۷۰–۸۵ × B,C)');
  for (const s of ['۷۰', '۷۵']) await M.locator('.chip.optc', { hasText: new RegExp('^' + s + '$') }).first().click();
  await M.locator('.chip.optc', { hasText: /^C$/ }).first().click();
  await sleep(200);
  ok((await M.locator('.hint', { hasText: 'ترکیب ساخته می‌شود' }).innerText()).includes('۴') || /4/.test(await M.locator('.hint', { hasText: 'ترکیب ساخته می‌شود' }).innerText()), 'ماتریس: ۲ رنگ × ۲ سایز = ۴ ترکیب');
  await M.locator('.vmx .vb[aria-label="کرم ۸۵B"]').click(); await sleep(150);
  ok((await M.locator('.hint', { hasText: 'ترکیب ساخته می‌شود' }).innerText()).match(/[3۳] ترکیب/) !== null, 'حذف یک ترکیب → ۳ ترکیب');
  await M.locator('textarea').fill('دانتل فرانسوی، قاب‌دار');
  ok((await M.locator('.sheet-f .btn').first().innerText()).includes('۳') || /3/.test(await M.locator('.sheet-f .btn').first().innerText()), 'دکمه تعداد ترکیب را می‌گوید: ' + await M.locator('.sheet-f .btn').first().innerText());
  await M.locator('.sheet-f .btn').first().click(); await sleep(1800);
  const t = await D(); const made = t.items.filter(i => i.base_name === 'سوتین دانتل مدل ۱');
  ok(made.length === 3, 'سه کالا ساخته شد: ' + made.map(i => i.name).join(' | '));
  ok(new Set(made.map(i => i.code)).size === 3 && made.every(i => /^MR-\d{4}$/.test(i.code || '')), 'هر ترکیب کد یکتا گرفت: ' + made.map(i => i.code).join(','));
  ok(made.every(i => i.description === 'دانتل فرانسوی، قاب‌دار' && i.category === 'سوتین'), 'توضیحات و دسته روی همه‌ی ترکیب‌ها هست');
  ok(!made.some(i => i.color === 'کرم' && i.size === '۸۵B') && made.some(i => i.color === 'مشکی' && i.size === '۸۵B'), 'ترکیب حذف‌شده ساخته نشد');
  await go('#/stock'); await sleep(500); { const body = await page.locator('body').innerText(); ok(!made.some(i => body.includes(i.code)), 'صفحه‌ی موجودی فقط کالاهای دارای موجودی را نشان می‌دهد (کدهای بدون موجودی نیامد)'); ok(body.includes('کالا موجود است'), 'شمارنده‌ی کالاهای موجود دیده می‌شود'); }
  // لیست کالا: فیلتر رنگ و سایز
  await go('#/items'); await sleep(400);
  { const codes = (await page.locator('tbody tr b.icode').allInnerTexts()); ok(codes.length > 3 && codes.every((c, i) => i === 0 || codes[i - 1] <= c), 'کالاها به ترتیب کد مرتب‌اند: ' + codes.slice(0, 5).join(',')); }
  const fchips = page.locator('.vf .fchip'); ok(await fchips.count() >= 3, 'فیلتر رنگ و سایز در لیست کالا هست (' + await fchips.count() + ')');
  { const body = await page.locator('tbody').innerText(); ok(made.every(i => body.includes(i.code)), 'کد کالا در لیست کالاها دیده می‌شود'); }
  await page.locator('input[type=search], .bar input').first().fill(made[0].code); await sleep(350);
  ok((await page.locator('tbody tr').allInnerTexts()).filter(x => x.includes('سوتین دانتل مدل ۱')).length === 1, 'جستجو با کد فقط همان ترکیب را می‌آورد');
  await page.locator('input[type=search], .bar input').first().fill(''); await sleep(350);
  await page.locator('.vf .fchip', { hasText: 'کرم' }).click(); await sleep(250);
  const rows = (await page.locator('tbody tr').allInnerTexts()).filter(x => x.includes('سوتین دانتل مدل ۱'));
  ok(rows.length === 1 && rows[0].includes('کرم'), 'با فیلتر «کرم» فقط ترکیب‌های کرم می‌ماند: ' + rows.length);
  // ویرایش یک کالای رنگ‌دار: رنگ عوض می‌شود و نام نهایی ساخته می‌شود
  await page.locator('tbody tr', { hasText: 'سوتین دانتل مدل ۱' }).first().click(); await M.waitFor();
  ok((await M.locator('input.inp').first().inputValue()) === 'سوتین دانتل مدل ۱', 'در ویرایش، نام پایه نشان داده می‌شود نه نام کامل');
  await M.locator('.chip.optc', { hasText: 'سفید' }).first().click(); await M.locator('.sheet-f .btn.primary').click(); await sleep(1500);
  const t2 = await D(); ok(t2.items.some(i => i.name === 'سوتین دانتل مدل ۱ · سفید · ۸۰B' || i.name === 'سوتین دانتل مدل ۱ · سفید · ۸۵B'), 'ویرایش رنگ: نام ترکیبی تازه ساخته شد');
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/.test(l)); ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  // کالای مشابه: سرور نمی‌سازد؛ مشابه‌های قدیمی در فهرست ⚠️ می‌آید
  { const tk = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'mahsa@example.com', password: 'mahsa-pass-1' }) })).json()).data.token;
    const r = await post(tk, '/api/rpc/save_item/', { name: 'سوتین  دانتل مدل ۱', category: 'سوتین', variants: [{ color: 'مشکی', size: '۸۰B' }] });
    ok(JSON.stringify(r).includes('مشابه'), 'ساخت کالای مشابه رد شد: ' + JSON.stringify(r).slice(0, 120));
    const { execSync } = await import('node:child_process');
    execSync(`python3 -c "import psycopg;c=psycopg.connect('host=/tmp port=5433 user=postgres dbname=mara_e2e',autocommit=True);c.execute(\\"insert into items(name,category,base_name,color,size) values ('سوتین دانتل مدل۱ · مشکی · ۸۰B','سوتین','سوتین دانتل مدل۱','مشکی','۸۰B')\\")"`);
    await page.reload(); await sleep(1500); await go('#/items'); await sleep(600);
    const bt = await page.locator('body').innerText(); ok(bt.includes('کدهای مشابه') && bt.includes('٪ شبیه'), 'فهرست کدهای مشابه (۹۵٪) دیده می‌شود'); }
  // فرم: ترکیب‌های موجود خاکستری می‌شوند و ساخته نمی‌شوند
  { await go('#/items'); await page.click('text=＋ کالای جدید'); await M.waitFor();
    await M.locator('input.inp').first().fill('سوتین  دانتل مدل ۱'); await M.locator('.chip', { hasText: /^سوتین$/ }).first().click();
    await M.locator('.chip.optc', { hasText: 'مشکی' }).first().click(); await M.locator('.chip.optc', { hasText: 'سفید' }).first().click(); await sleep(400);
    ok(await M.locator('.vmx td.ex').count() >= 1, 'ترکیب‌های موجود در جدول «هست» و خاکستری شدند: ' + await M.locator('.vmx td.ex').count());
    ok((await M.locator('.hint', { hasText: 'از قبل در سیستم هست' }).count()) === 1, 'شمارنده‌ی «از قبل هست» دیده می‌شود');
    const btxt = await M.locator('.sheet-f .btn').first().innerText(); ok(/ترکیب/.test(btxt) || btxt.includes('افزودن'), 'دکمه فقط ترکیب‌های جدید را می‌سازد: ' + btxt); }
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close();
console.log(fails ? `FAILS: ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
