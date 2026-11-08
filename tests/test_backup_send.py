"""تست ارسال پشتیبان: سه فایل، هر دو کانال (تلگرام و بله)، و رد کردن ارسال تکراری با --if-missing.
اجرا:  bash tests/reseed_and_serve.sh ; python tests/test_backup_send.py"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.update(DATABASE_URL='postgresql://postgres@/mara_e2e?host=/tmp&port=5433', DEBUG='1', SECRET_KEY='t', DJANGO_SETTINGS_MODULE='config.settings')
sys.path.insert(0, ROOT)
import django; django.setup()
from core import views, notify
from core.models import NotifyLog
F = 0
def ok(c, m):
    global F; print('ok  ' if c else 'FAIL', m); F += 0 if c else 1
sent = []
def fake(filename, content, caption='', kind='backup', only_admin=True, channels=('telegram',)):
    sent.append((filename, len(content), tuple(channels)))
    return [{'user': 'مدیر', 'channel': c, 'ok': True} for c in channels]
notify.broadcast_file = fake
NotifyLog.objects.filter(kind='backup').delete()
r = views._backup(only_if_missing=True)
ok(not r.get('skipped') and r['ok'] == 6, 'اولین بار: سه فایل × دو کانال = ۶ ارسال موفق')
ok(len(sent) == 3 and all(set(c) == {'telegram', 'bale'} for _, _, c in sent), 'هر سه فایل همزمان به تلگرام و بله رفتند')
ok([f.split('.', 1)[1] for f, _, _ in sent] == ['xlsx', 'json.gz', 'jsonl.gz'] or [f.endswith(x) for f, x in zip([a for a, _, _ in sent], ('.xlsx', '.json.gz', '.jsonl.gz'))] == [True] * 3, 'نام فایل‌ها درست است')
NotifyLog.objects.create(channel='bale', to='1', ok=True, kind='backup')
sent.clear(); r = views._backup(only_if_missing=True)
ok(r.get('skipped') and not sent, 'با --if-missing: پشتیبانِ ۱۸ ساعت اخیر هست → دوباره نمی‌فرستد')
sent.clear(); r = views._backup()
ok(len(sent) == 3, 'بدون --if-missing همیشه می‌فرستد (کرون اصلی)')
print('ALL OK' if not F else f'FAILS {F}'); sys.exit(1 if F else 0)
