// عیب‌یابی (فقط مدیر): همه‌چیز را چک می‌کند و می‌گوید «کجا گیر کرده» و چه باید کرد
import { h, jstr, toast } from '../util.js';
import { S, api, errText, apiBase } from '../store.js';
import { dtable, pill, modal, kpi } from '../ui.js';
import { head, btn } from './common.js';

const row = (ok, title, detail, fix) => h('div', { class: 'chk-row' }, h('span', { class: 'ic ' + (ok === true ? 'diag-ok' : ok === false ? 'diag-bad' : 'diag-warn') }, ok === true ? '✔' : ok === false ? '✘' : '⚠'),
  h('div', null, h('b', null, title), detail ? h('small', null, detail) : null, ok !== true && fix ? h('small', { class: 'diag-bad' }, 'چه کنم: ' + fix) : null));
const tm = iso => { const d = new Date(iso); return jstr(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(d)) + ' ' + new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false }).format(d); };

export function render() {
  const root = h('div', null, head('عیب‌یابی', [btn('بررسی دوباره (با بات‌ها)', () => run(true), 'ghost')], 'اگر چیزی کار نکرد، اینجا ببین کدام حلقه می‌لنگد. هر خطا یک «کد» و «کجا» دارد.'), h('div', { class: 'card' }, 'در حال بررسی…'));
  const body = h('div'); root.replaceChildren(root.firstChild, body);
  async function run(bots) {
    body.replaceChildren(h('div', { class: 'card' }, 'در حال بررسی…'));
    const t0 = performance.now(); let d, ms;
    try { const r = await api('/api/diagnostics/' + (bots ? '?bots=1' : '')); d = r.data; ms = Math.round(performance.now() - t0); }
    catch (e) { body.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'ct' }, 'اتصال به سرور'), row(false, 'جواب نگرفتیم', errText(e), 'آدرس ' + apiBase() + '/api/health/ را در مرورگر باز کن؛ اگر باز نشد سرویس Render خاموش/در حال ساخت است.'))); return; }
    const H = d.health, db = H.db, c = H.config;
    const sec = (t, ...k) => h('div', { class: 'card' }, h('div', { class: 'ct' }, t), ...k);
    const parts = [];
    parts.push(sec('۱ · سرور و دیتابیس',
      row(true, 'سرور جواب داد', `نسخه ${H.version} · ${ms} میلی‌ثانیه`),
      row(db.ok, 'اتصال به دیتابیس', db.ok ? `${db.name} · منطقه‌ی زمانی ${db.timezone}` : db.error, db.hint),
      db.ok ? row(db.schema_ok, 'جدول‌ها و توابع حسابداری', `${db.tables_found}/6 جدول · ${db.functions_found}/5 تابع`, 'دستور migrate باید اجرا شود (Render → Manual Deploy).') : null,
      db.ok ? row(Math.abs(db.check_diff || 0) < 1, 'ترازنامه‌ی کنترلی (باید صفر باشد)', 'اختلاف: ' + (Math.abs(db.check_diff || 0) < 1 ? '۰ (کمتر از یک ریال؛ فقط خطای گرد کردن)' : Math.round(db.check_diff).toLocaleString('en') + ' ریال'), 'اختلاف واقعی است: صفحه‌ی «تحلیل › بررسی اشتباهات» نشان می‌دهد کدام ثبت مشکل دارد.') : null,
      db.ok ? row(true, 'تاریخچه', `${db.audit_rows} ردیف ثبت شده`) : null));
    parts.push(sec('۲ · تنظیمات Render (Environment)',
      row(c.users === 3, 'کاربران', `${c.users} نفر · ${c.users_with_email} ایمیل · ${c.users_with_phone} موبایل`, 'متغیرهای MAHSA_/RANA_/HAMID_ را در Render پر کن و دوباره Deploy بزن.'),
      row(c.frontend_origins.length > 0, 'FRONTEND_ORIGINS (آدرس سایت)', c.frontend_origins.join(' , ') || 'خالی', 'آدرس GitHub Pages را (مثل https://نام.github.io) بگذار؛ وگرنه مرورگر درخواست‌ها را مسدود می‌کند.'),
      row(c.cron_key, 'CRON_KEY (کلید کرون‌جاب)', c.cron_key ? 'ثبت شده' : 'خالی', 'یک رمز بلند بساز و در Render بگذار.'),
      row(c.webhook_secret, 'WEBHOOK_SECRET', c.webhook_secret ? 'ثبت شده' : 'خالی', 'یک رمز بلند بساز و در Render بگذار.'),
      row(!!c.public_url, 'PUBLIC_URL (آدرس همین سرویس)', c.public_url || 'خالی', 'آدرس onrender.com همین سرویس را بگذار.'),
      row(c.telegram_token ? true : null, 'توکن بات تلگرام', c.telegram_token ? 'ثبت شده' : 'ثبت نشده (اختیاری)', 'TELEGRAM_BOT_TOKEN را از @BotFather بگیر.'),
      row(c.bale_token ? true : null, 'توکن بات بله', c.bale_token ? 'ثبت شده' : 'ثبت نشده (اختیاری)', 'BALE_BOT_TOKEN را از @botfather بله بگیر.')));
    parts.push(sec('۳ · کاربران و بات‌ها',
      dtable([{ label: 'نام', main: true, render: u => u.name }, { label: 'نقش', render: u => (u.role === 'admin' ? 'مدیر' : 'همکار') }, { label: 'ایمیل', render: u => h('span', { dir: 'ltr' }, u.email || '—') }, { label: 'موبایل', render: u => h('span', { dir: 'ltr' }, u.phone || '—') },
        { label: 'تلگرام', render: u => (u.telegram ? pill('وصل', 'green') : pill('وصل نیست', 'gray')) }, { label: 'بله', render: u => (u.bale ? pill('وصل', 'green') : pill('وصل نیست', 'gray')) }, { label: 'نشست فعال', cls: 'num', render: u => u.active_sessions }], d.users),
      ...['telegram', 'bale'].map(ch => { const b = d.bots[ch]; const nm = ch === 'telegram' ? 'تلگرام' : 'بله'; if (!bots) return null;
        if (!b || !b.configured) return row(null, `بات ${nm}`, 'توکن ثبت نشده'); if (!b.reachable) return row(false, `بات ${nm}`, b.error, ch === 'bale' ? 'اگر بله از سرور خارج پاسخ نمی‌دهد، فقط تلگرام را فعال نگه دار یا با پشتیبانی بله تماس بگیر.' : 'توکن را دوباره از BotFather بگیر.');
        const okw = b.webhook_url && b.webhook_url.includes('/api/' + ch + '/webhook/'); return row(!!okw, `بات ${nm} (@${b.bot || '؟'})`, okw ? `وب‌هوک فعال · پیام در صف: ${b.pending || 0}${b.last_error ? ' · آخرین خطا: ' + b.last_error : ''}` : 'وب‌هوک ثبت نشده', 'دکمه‌ی «راه‌اندازی بات‌ها» را بزن.'); }),
      h('div', { class: 'acts' }, btn('راه‌اندازی بات‌ها (ثبت وب‌هوک)', async e => { e.currentTarget.disabled = true; try { const r = await api('/api/admin/setup-bots/', { method: 'POST' }); toast(r.data.results.map(x => `${x.channel}: ${x.detail}`).join(' | ')); run(true); } catch (er) { toast(errText(er), 'err'); } }, 'gold'),
        btn('پیام آزمایشی تلگرام', () => test('telegram'), 'ghost'), btn('پیام آزمایشی بله', () => test('bale'), 'ghost'))));
    parts.push(sec('۴ · خطاهای اخیر (' + d.errors.length + ')', dtable([
      { label: 'زمان', main: true, render: e => tm(e.at) }, { label: 'کد', render: e => pill(e.code, e.source === 'client' ? 'amber' : 'red') }, { label: 'کجا', render: e => e.where }, { label: 'منبع', hm: true, render: e => ({ server: 'سرور', client: 'برنامه', bot: 'بات', cron: 'کرون' })[e.source] || e.source },
      { label: 'پیام', cls: 'wrap', render: e => e.message }, { label: 'شناسه', hm: true, render: e => h('span', { dir: 'ltr' }, e.request_id) }], d.errors, { onRow: e => modal({ title: `خطا ${e.code}`, wide: true, body: h('div', null, h('p', null, e.message), h('p', { class: 'hint' }, `${tm(e.at)} · ${e.where} · کاربر: ${e.actor || '—'} · ${e.path}`), h('pre', { class: 'json', dir: 'ltr' }, e.detail || '(جزئیاتی نیست)')) }), empty: 'خطایی ثبت نشده 🎉' })));
    parts.push(sec('۵ · آخرین پیام‌های بات', dtable([{ label: 'زمان', main: true, render: x => tm(x.at) }, { label: 'کانال', render: x => (x.channel === 'bale' ? 'بله' : 'تلگرام') }, { label: 'نوع', render: x => x.kind }, { label: 'نتیجه', render: x => (x.ok ? pill('رسید', 'green') : pill('ناموفق', 'red')) }, { label: 'علت', cls: 'wrap', render: x => x.detail || '' }], d.sends, { empty: 'هنوز پیامی فرستاده نشده' })));
    body.replaceChildren(...parts.filter(Boolean));
  }
  async function test(ch) { try { await api('/api/admin/test-send/', { method: 'POST', body: { channel: ch } }); toast('پیام آزمایشی رفت؛ بات را چک کن ✔'); } catch (e) { toast(errText(e), 'err'); } run(true); }
  run(false);
  return root;
}
