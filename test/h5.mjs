import http from 'http'; import fs from 'fs'; import path from 'path'; import { chromium } from 'playwright-core';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
export const API = 'http://localhost:8111';
export function serve() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, () => r({ srv, url: `http://localhost:${srv.address().port}` })));
}
export const launch = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
export async function newPage(browser, url, { viewport = { width: 1280, height: 900 }, logs = [] } = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'fa-IR', timezoneId: 'Asia/Tehran', deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/, r => r.abort());
  await page.addInitScript(a => { window.__MARA_API__ = a; }, API);
  await page.goto(url);
  return page;
}
export async function login(page, ident, pw) {
  await page.fill('input[autocomplete=username]', ident); await page.fill('input[type=password]', pw); await page.click('button[type=submit]');
  await page.waitForSelector('#view', { timeout: 20000 });
}
/** نام خریدار (الزامی در فاکتور فروش): اولین فیلد ترکیبی فرم */
let _b = 0;
export async function buyer(page, M, name = 'خریدار تست ' + (++_b)) {
  const c = M.locator('.cmb input').first(); await c.fill(name); await page.waitForTimeout(250);
  const cr = M.locator('.cmb-o.create'); await (await cr.count() ? cr.first() : M.locator('.cmb-o').first()).click(); await page.waitForTimeout(1500);
}

/** فاکتور خرید جدولی: ردیف i (از ۰) را پر می‌کند. f = {name, qty, price, note, m, r}؛ name = بخشی از نام کالا (اولین پیشنهاد لیست انتخاب می‌شود) */
export async function gridRow(page, M, i, f) {
  const row = M.locator('.pgrow').nth(i), sl = ms => page.waitForTimeout(ms);
  if (f.name != null) { await row.locator('.c-name input').fill(f.name); await sl(200); await page.locator('.cmb-list:not([hidden]) .cmb-o').first().click(); await sl(150); }
  if (f.qty != null) { await row.locator('.c-qty input').fill(String(f.qty)); await sl(80); }
  if (f.m != null) { await row.locator('.c-dl input').nth(0).fill(String(f.m)); await sl(80); }
  if (f.r != null) { await row.locator('.c-dl input').nth(1).fill(String(f.r)); await sl(80); }
  if (f.note != null) { await row.locator('.c-note input').fill(f.note); await sl(50); }
  if (f.price != null) { await row.locator('.c-fee input').fill(String(f.price)); await sl(120); }
}
export const gridNext = async (page, M) => { await M.locator('[data-act=next]').click(); await page.waitForTimeout(500); };
