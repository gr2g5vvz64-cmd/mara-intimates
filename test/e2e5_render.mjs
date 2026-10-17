import { serve, launch, newPage, login } from './h5.mjs';
import fs from 'fs';
fs.mkdirSync(new URL('./shots', import.meta.url).pathname, { recursive: true });
const { srv, url } = await serve(); const b = await launch(); const logs = [];
const out = [];
for (const [name, vp] of [['m', { width: 390, height: 844 }], ['d', { width: 1280, height: 900 }]]) {
  const page = await newPage(b, url, { viewport: vp, logs });
  await login(page, 'mahsa@example.com', 'mahsa-pass-1'); await page.waitForTimeout(400);
  const t = await page.title(); out.push(`title(${name}) = ${t}`);
  for (const r of ['', 'sales', 'purchases', 'customers', 'invoices', 'history', 'stock', 'finance', 'help', 'pay']) {
    await page.evaluate(h => { location.hash = '#/' + h; }, r); await page.waitForTimeout(600);
    const txt = await page.locator('#view').innerText(); if (/خطا در نمایش/.test(txt)) out.push(`✘ page ${r} failed (${name})`);
    await page.screenshot({ path: new URL(`./shots/${name}_${r || 'home'}.png`, import.meta.url).pathname, fullPage: false });
  }
  // table centring check
  await page.evaluate(() => { location.hash = '#/sales'; }); await page.waitForTimeout(500);
  const al = await page.evaluate(() => { const c = [...document.querySelectorAll('.t td, .t th')].filter(e => e.offsetParent); return [...new Set(c.map(e => getComputedStyle(e).textAlign))]; });
  out.push(`text-align in tables (${name}): ${JSON.stringify(al)}`);
  await page.context().close();
}
console.log(out.join('\n')); console.log('LOGS:', logs.filter(l => !/ERR_FAILED|net::ERR|fonts/.test(l)).slice(0, 10));
await b.close(); srv.close();
