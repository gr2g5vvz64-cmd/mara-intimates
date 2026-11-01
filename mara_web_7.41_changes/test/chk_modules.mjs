// بررسی بارگذاری همه‌ی ماژول‌ها در مرورگر (node --check خطای ماژول‌ها را همیشه نمی‌گیرد)
import { serve, launch } from './h5.mjs'; import fs from 'fs';
const { srv, url } = await serve(); const browser = await launch(); const page = await (await browser.newContext()).newPage();
await page.goto(url + '/icons/icon-192.png'); let bad = 0;
const files = [...fs.readdirSync('../js').filter(f => f.endsWith('.js')).map(f => 'js/' + f), ...fs.readdirSync('../js/pages').map(f => 'js/pages/' + f)];
for (const f of files) { const r = await page.evaluate(async u => { try { await import(u); return 'ok'; } catch (e) { return e.name + ': ' + e.message; } }, url + '/' + f + '?x=' + Date.now()); if (r !== 'ok') { console.log('FAIL', f, r); bad++; } }
console.log(bad ? 'MODULES FAIL ' + bad : 'ALL MODULES OK'); await browser.close(); srv.close(); process.exit(bad ? 1 : 0);
