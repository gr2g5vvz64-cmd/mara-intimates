// سرویس‌ورکر ساده: فایل‌های برنامه را کش می‌کند؛ داده‌ها همیشه از اینترنت می‌آیند.
const V = 'mara-v7.1';
const SHELL = ['./', 'index.html', 'css/app.css?v=7.1', 'css/themes.css?v=7.1', 'js/app.js?v=7.1', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;       // API جنگو و CDN را دست نمی‌زنیم
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
