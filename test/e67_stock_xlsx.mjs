// اکسل موجودی (۷.۷۷): مرتب از بیشترین ارزش کل، بدون مانده‌ی صفر، جمع‌ها درست، فایل معتبر
import { serve, launch, newPage, login, API } from './h5.mjs';
import { execFileSync } from 'child_process'; import fs from 'fs';
const { srv, url } = await serve(); const browser = await launch(); const logs = []; let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tok = (await (await fetch(API + '/api/auth/login/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'hamid@example.com', password: 'hamid-pass-333' }) })).json()).data.token;
const T = (await (await fetch(API + '/api/data/', { headers: { authorization: 'Bearer ' + tok } })).json()).data.tables;
try {
  const page = await newPage(browser, url, { logs }); await login(page, 'hamid@example.com', 'hamid-pass-333'); page.setDefaultTimeout(9000);
  await page.evaluate(() => { location.hash = '#/stock'; }); await page.waitForTimeout(900);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('#view button', { hasText: 'اکسل موجودی' }).click()]);
  fs.copyFileSync(await dl.path(), '/tmp/stock_test.xlsx'); ok(dl.suggestedFilename().endsWith('.xlsx'), 'فایل ' + dl.suggestedFilename());
  const py = `
import openpyxl, json
wb = openpyxl.load_workbook('/tmp/stock_test.xlsx'); ws = wb['موجودی']
rows = list(ws.iter_rows(values_only=True))
print(json.dumps({'sheets': wb.sheetnames, 'head': rows[0], 'body': rows[1:-1], 'total': rows[-1], 'rtl': ws.sheet_view.rightToLeft, 'cat': [list(r) for r in wb['خلاصه‌ی دسته‌ها'].iter_rows(values_only=True)]}, ensure_ascii=False))`;
  const R = JSON.parse(execFileSync('python3', ['-c', py]).toString());
  ok(R.sheets.length === 2 && R.rtl, 'دو برگه و راست‌به‌چپ'); ok(R.head[7].includes('ارزش کل'), 'سرستون ارزش کل');
  const have = T.v_stock.filter(i => i.active && i.rem > 0);
  ok(R.body.length === have.length, `ردیف‌ها ${R.body.length} = کالاهای دارای موجودی ${have.length}`);
  ok(R.body.every(r => r[4] > 0), 'هیچ مانده‌ی صفری نیست');
  const v = R.body.map(r => r[7]); ok(v.every((x, i) => i === 0 || v[i - 1] >= x), 'مرتب از بیشترین ارزش کل به کمترین: ' + v.slice(0, 4).join(' ≥ '));
  ok(R.body.every(r => r[7] === r[5] + r[6] && r[4] === r[2] + r[3]), 'ارزش و تعداد کل = مهسا + رعنا');
  const sq = have.reduce((a, i) => a + i.rem, 0), sm = have.reduce((a, i) => a + i.rem_m, 0), sr = have.reduce((a, i) => a + i.rem_r, 0);
  ok(R.total[0] === 'جمع' && R.total[4] === sq && R.total[2] === sm && R.total[3] === sr, `جمع تعداد ${R.total[4]} = ${sq} (مهسا ${sm}، رعنا ${sr})`);
  ok(Math.abs(R.total[7] - T.v_totals.stock_value) <= 5, `جمع ارزش ${R.total[7]} ≈ ارزش موجودی صفحه‌ی مالی ${Math.round(T.v_totals.stock_value)}`);
  const cs = R.cat; ok(cs[cs.length - 1][0] === 'جمع' && cs[cs.length - 1][7] === R.total[7], 'برگه‌ی دسته‌ها: جمع برابر');
} catch (e) { console.log('ERR', e.message); fails++; }
await browser.close(); srv.kill && srv.kill();
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
