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
