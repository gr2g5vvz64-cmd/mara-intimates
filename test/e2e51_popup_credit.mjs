// ۱) لیست بازشوی جستجو در تم شیشه‌ای مات است و با زیرش قاطی نمی‌شود  ۲) اعتبار برگشت به تامین‌کننده با فی فاکتور (تخفیف کل فاکتور از فی کم نمی‌شود)
import { serve, launch, newPage, login, API } from './h5.mjs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const post = async (tok, path, body) => (await (await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })).json());
const tok = (await post('', '/api/auth/login/', { identifier: 'hamid@example.com', password: 'hamid-pass-333' })).data.token;
const D = async () => (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
try {
  const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(9000);
  const sleep = ms => page.waitForTimeout(ms);
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 't10'); location.hash = '#/sreturns'; }); await sleep(1200);
  await page.locator('button', { hasText: 'برگشت به تامین‌کننده' }).first().click(); await page.locator('.ov').waitFor(); await sleep(300);
  await page.locator('.ov .cmb .inp').first().click(); await sleep(400);
  const bg = await page.evaluate(() => { const l = document.querySelector('.ov .cmb-list'), o = document.querySelector('.ov .cmb-o'); const a = s => { const m = getComputedStyle(s).backgroundColor.match(/[\d.]+/g).map(Number); return m.length > 3 ? m[3] : 1; }; return { list: l && !l.hidden ? a(l) : null, opt: o ? a(o) : null }; });
  ok(bg.list === 1 && (bg.opt === 1 || bg.opt === null), `لیست بازشو در تم شیشه‌ای کاملاً مات است (آلفا ${bg.list}/${bg.opt})`);
  // اعتبار: فاکتور با تخفیف، برگشت یک عدد → ۲۰۰٬۰۰۰ (فی فاکتور)
  const tb = await D(); const lot = tb.v_lots.find(l => !l.voided && l.rem_m > 0);
  const before = tb.v_lots.find(l => l.id === lot.id);
  const r = await post(tok, '/api/rpc/create_supplier_return/', { lot_id: lot.id, holder: 'مهسا', qty: 1 });
  const t2 = await D(); const ret = t2.returns.filter(x => x.lot_id === lot.id && x.kind === 'supplier').pop();
  ok(r.ok && Math.round(ret.supplier_credit) === Math.round(lot.unit_price), `اعتبار برگشت = فی فاکتور (${Math.round(ret.supplier_credit)} = ${Math.round(lot.unit_price)}) نه فی پس از تخفیف (${Math.round(lot.net_price)})`);
  const errs = logs.filter(l => !/Failed to load resource|fonts|net::ERR/i.test(l)); ok(errs.length === 0, 'بدون خطای کنسول');
} catch (e) { console.log('FAIL exception', e.message); fails++; }
await browser.close(); srv.close(); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
