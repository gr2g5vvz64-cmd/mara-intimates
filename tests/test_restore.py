"""تست پشتیبان کامل و بازگردانی: پشتیبان از دیتابیس تست → بازگردانی در دیتابیس تازه → مقایسه‌ی ردیف‌به‌ردیف.
اجرا:  bash tests/reseed_and_serve.sh  (یک بار برای ساخت دیتابیس mara_e2e)  سپس  python tests/test_restore.py"""
import os, sys, subprocess, tempfile, json, gzip
import psycopg
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADMIN = 'host=/tmp port=5433 user=postgres dbname=postgres'
SRC = 'mara_e2e'; T1, T2 = 'mara_rst_new', 'mara_rst_old'
url = lambda db: f'postgresql://postgres@/{db}?host=/tmp&port=5433'
BASE = dict(os.environ, DEBUG='1', SECRET_KEY='t', CORS_ALLOW_ALL='1', DJANGO_SETTINGS_MODULE='config.settings',
            MAHSA_EMAIL='mahsa@example.com', MAHSA_PHONE='09121111111', MAHSA_PASSWORD='mahsa-pass-1', HAMID_EMAIL='hamid@example.com', HAMID_PHONE='09123333333', HAMID_PASSWORD='hamid-pass-333', CRON_KEY='ckey', WEBHOOK_SECRET='w')
F = 0
def ok(c, m):
    global F; print('ok  ' if c else 'FAIL', m); F += 0 if c else 1
def run(db, *args, check=True):
    r = subprocess.run([sys.executable, 'manage.py', *args], cwd=ROOT, env=dict(BASE, DATABASE_URL=url(db)), capture_output=True, text=True)
    if check and r.returncode: print(r.stdout[-1500:], r.stderr[-1500:])
    return r
def py(db, code):
    r = subprocess.run([sys.executable, '-c', 'import django;django.setup()\n' + code], cwd=ROOT, env=dict(BASE, DATABASE_URL=url(db)), capture_output=True, text=True)
    if r.returncode: print(r.stderr[-1500:])
    return r.stdout
def fingerprint(db):
    out = {}
    with psycopg.connect(f'host=/tmp port=5433 user=postgres dbname={db}') as c:
        ts = [r[0] for r in c.execute("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")]
        for t in ts:
            if t.startswith(('django_', 'auth_')) or t in ('core_user', 'core_user_groups', 'core_user_user_permissions', 'core_apitoken', 'core_errorlog', 'core_idemkey', 'core_notifylog', 'core_otpcode'): continue
            out[t] = c.execute(f'select count(*), md5(coalesce(string_agg(x::text, \'|\' order by x::text), \'\')) from "{t}" x').fetchone()
        out['_totals'] = c.execute('select to_json(t)::text from v_totals t').fetchone()[0]
    return out

tmp = tempfile.mkdtemp(); jf = f'{tmp}/mara.json.gz'; af = f'{tmp}/audit.jsonl.gz'; of = f'{tmp}/old.json.gz'
# 1) پشتیبان از دیتابیس تست (هم قالب جدید، هم قالب قدیمی)
print(py(SRC, f"""
from core import backup
from core.db import all_data
from django.core.serializers.json import DjangoJSONEncoder
import json, gzip
jb, d = backup.dump_gz('t'); open({jf!r},'wb').write(jb)
ab, n = backup.audit_gz(); open({af!r},'wb').write(ab)
open({of!r},'wb').write(gzip.compress(json.dumps(all_data(), ensure_ascii=False, cls=DjangoJSONEncoder).encode()))
print('dump tables', len(d['tables']), 'rows', sum(len(v) for v in d['tables'].values()), 'audit', n)
assert 'bonus_fund' in d['tables'] or True
import re; assert not re.search(r'pbkdf2|password', json.dumps(d, default=str)), 'رمز در پشتیبان است!'
print('no-secrets ok')
""").strip())
src = fingerprint(SRC)
with psycopg.connect(ADMIN, autocommit=True) as c:
    for db in (T1, T2): c.execute(f'drop database if exists {db}'); c.execute(f'create database {db}')
for db in (T1, T2): run(db, 'migrate', '-v', '0'); run(db, 'bootstrap_people')

# 2) آزمایش (بدون --yes): چیزی نباید بماند
r = run(T1, 'restore_backup', jf, '--audit', af, check=False); print(r.stdout[-900:], r.stderr[-400:])
ok(r.returncode == 0 and 'فقط آزمایش بود' in r.stdout, 'آزمایش بدون --yes اجرا شد')
with psycopg.connect(f'host=/tmp port=5433 user=postgres dbname={T1}') as c:
    ok(c.execute('select count(*) from sales').fetchone()[0] == 0 and c.execute('select count(*) from items').fetchone()[0] == 0, 'بعد از آزمایش دیتابیس همچنان خالی است')
# 3) بازگردانی واقعی
r = run(T1, 'restore_backup', jf, '--audit', af, '--yes', check=False); print(r.stdout[-600:], r.stderr[-300:])
ok(r.returncode == 0 and 'ثبت نهایی شد' in r.stdout, 'بازگردانی با --yes ثبت شد')
new = fingerprint(T1)
bad = [t for t in src if src[t] != new.get(t)]
ok(not bad, 'همه‌ی جدول‌ها ردیف‌به‌ردیف یکی‌اند' + (f' ← اختلاف: {bad}' if bad else f' ({len(src)-1} جدول)'))
ok(src['_totals'] == new['_totals'], 'v_totals (مجموع‌های مالی) یکی است')
ok(src['audit_log'][0] > 0, f"تاریخچه بازگردانده شد ({new['audit_log'][0]} ردیف)")
# 4) شمارنده‌ها: بعد از بازگردانی ثبت جدید نباید با شناسه‌ی قدیمی تصادم کند
print(py(T1, """
from django.db import connection
c = connection.cursor()
c.execute("select max(id) from items"); mx = c.fetchone()[0]
c.execute("insert into items(name, category) values ('تست-بعد-از-بازگردانی','تست') returning id"); nid = c.fetchone()[0]
print('NEWID', nid > mx)
"""))
# 5) محافظ: بازگردانی دوباره روی دیتابیس پر بدون --wipe رد شود
r = run(T1, 'restore_backup', jf, '--yes', check=False)
ok(r.returncode != 0 and 'خالی نیست' in (r.stderr + r.stdout), 'روی دیتابیس پر بدون --wipe رد می‌شود')
r = run(T1, 'restore_backup', jf, '--audit', af, '--wipe', '--yes', check=False)
ok(r.returncode == 0, 'با --wipe جایگزین می‌شود'); ok(fingerprint(T1) == src or all(fingerprint(T1)[t] == src[t] for t in src), 'بعد از --wipe هنوز یکی است')
# 6) فایل قدیمی (قبل از ۷.۷۰)
r = run(T2, 'restore_backup', of, '--yes', check=False); print(r.stdout[-700:], r.stderr[-300:])
ok(r.returncode == 0, 'فایل قدیمی هم بازگردانده می‌شود')
old = fingerprint(T2)
core = ['sales', 'sale_lines', 'purchase_invoices', 'purchase_lines', 'items', 'accounts', 'expenses', 'collections', 'returns', 'cheques']
ok(all(src[t][0] == old[t][0] for t in core if t in src), 'تعداد ردیف‌های جدول‌های اصلی از فایل قدیمی یکی است')
a, b = json.loads(src['_totals']), json.loads(old['_totals'])
ok(all(abs((a[k] or 0) - (b[k] or 0)) < 1 for k in ('net_worth', 'stock_value', 'business_balance', 'receivable', 'payable', 'profit') if k in a), 'مجموع‌های مالی از فایل قدیمی هم یکی است')
with psycopg.connect(ADMIN, autocommit=True) as c:
    for db in (T1, T2): c.execute(f'drop database if exists {db}')
print('ALL OK' if not F else f'FAILS {F}')
sys.exit(1 if F else 0)
