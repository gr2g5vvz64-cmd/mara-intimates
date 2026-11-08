"""پشتیبان کامل و بازگردانی (۷.۷۰).

dump():    همه‌ی جدول‌های واقعی دیتابیس (نه ویو) را به‌صورت JSON می‌دهد؛ رمزها و توکن‌ها هرگز داخل فایل نیستند.
restore(): همان فایل را داخل یک دیتابیس «تازه» (بعد از migrate) برمی‌گرداند: همه‌ی ردیف‌ها با همان شناسه‌ها، تریگرهای ثبت‌کننده
           خاموش می‌شوند تا تاریخچه دوباره‌نویسی نشود، شمارنده‌ها (sequence) تنظیم می‌شوند و در پایان مجموع‌ها با فایل مقایسه می‌شوند.
فایل‌های قدیمی (قبل از ۷.۷۰) هم خوانده می‌شوند: «sales» و «cheques» از روی ویوها ساخته می‌شوند.
"""
import gzip, io, json
from datetime import datetime
from decimal import Decimal
from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection, transaction

FORMAT = 2
# جدول‌هایی که در پشتیبان نمی‌آیند: رمز/توکن/نشست/لاگ فنی (و خودِ تاریخچه که فایل جدا دارد)
SKIP_PREFIX = ('django_', 'auth_')
SKIP = {'audit_log', 'core_user', 'core_user_groups', 'core_user_user_permissions', 'core_apitoken', 'core_errorlog', 'core_idemkey', 'core_notifylog', 'core_otpcode'}
# اگر مقصد این جدول‌ها ردیف داشته باشد «دیتابیس تازه» نیست
FRESH_CHECK = ('sales', 'purchase_invoices', 'purchase_lines', 'items', 'expenses', 'collections', 'returns')
COUNTER_SRC = {'invoice': 'purchase_invoices', 'lot': 'purchase_lines', 'sale': 'sales', 'return': 'returns'}
USER_COLS = ('display_name', 'role', 'email', 'phone', 'telegram_chat_id', 'bale_chat_id', 'notify')


def q(name):
    return '"' + str(name).replace('"', '""') + '"'


def table_names(cur=None):
    own = cur is None
    if own: cur = connection.cursor()
    cur.execute("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")
    out = [r[0] for r in cur.fetchall() if r[0] not in SKIP and not r[0].startswith(SKIP_PREFIX)]
    if own: cur.close()
    return out


def _j(v):
    # parse_float=Decimal: اعداد اعشاری (قیمت، بهای تمام‌شده) بی‌هیچ گردشدنی ذخیره می‌شوند
    return json.loads(v, parse_float=Decimal) if isinstance(v, (str, bytes)) else v


def dump(version=''):
    out = {'format': FORMAT, 'created': datetime.now().astimezone().isoformat(timespec='seconds'), 'version': version, 'tables': {}, 'users': [], 'views': {}}
    with transaction.atomic(), connection.cursor() as c:
        for t in table_names(c):
            c.execute(f'select coalesce(json_agg(x), \'[]\'::json)::text from (select * from {q(t)} order by 1) x')
            out['tables'][t] = _j(c.fetchone()[0])
        c.execute('select coalesce(json_agg(x), \'[]\'::json)::text from (select ' + ', '.join(USER_COLS) + ' from core_user order by id) x')
        out['users'] = _j(c.fetchone()[0])
        c.execute('select to_json(t)::text from v_totals t limit 1')
        r = c.fetchone(); out['views']['v_totals'] = _j(r[0]) if r else {}
    return out


def audit_gz():
    """تاریخچه‌ی کامل: هر خط یک JSON (فشرده). برمی‌گرداند (bytes, تعداد ردیف)."""
    buf = io.BytesIO(); n = 0
    with gzip.GzipFile(fileobj=buf, mode='wb') as gz, connection.cursor() as c:
        c.execute('select id, at, actor, role, ip, req, table_name, row_id, action, old, new, info from audit_log order by id')
        cols = [x[0] for x in c.description]
        while True:
            rows = c.fetchmany(2000)
            if not rows: break
            for r in rows:
                r = dict(zip(cols, r))
                raw = {k: r.pop(k) for k in ('old', 'new')}      # jsonb را دست‌نخورده (همان متن) می‌نویسیم تا عددها گرد/رشته نشوند
                head = json.dumps(r, ensure_ascii=False, cls=DjangoJSONEncoder, default=str)[:-1]
                line = head + ', "old": ' + (raw['old'] if isinstance(raw['old'], str) else json.dumps(raw['old'], ensure_ascii=False, default=str) if raw['old'] is not None else 'null') + ', "new": ' + (raw['new'] if isinstance(raw['new'], str) else json.dumps(raw['new'], ensure_ascii=False, default=str) if raw['new'] is not None else 'null') + '}'
                gz.write((line + '\n').encode('utf8')); n += 1
    return buf.getvalue(), n


def dump_gz(version=''):
    d = dump(version)
    return gzip.compress(json.dumps(d, ensure_ascii=False, cls=DjangoJSONEncoder).encode('utf8')), d


def _read(path):
    raw = open(path, 'rb').read()
    if raw[:2] == b'\x1f\x8b': raw = gzip.decompress(raw)
    return raw.decode('utf8')


def load_dump(path):
    """هر دو قالب را می‌خواند و به {'tables','users','views','format'} تبدیل می‌کند."""
    d = json.loads(_read(path), parse_float=Decimal)
    if d.get('format') == FORMAT: return d
    # قالب قدیمی: کلیدها نام جدول/ویو بودند
    t = {k: v for k, v in d.items() if isinstance(v, list) and not k.startswith('v_')}
    if 'v_sales' in d: t['sales'] = d['v_sales']        # ستون‌های اضافه‌ی ویو موقع درج نادیده گرفته می‌شود
    if 'v_cheques' in d: t['cheques'] = d['v_cheques']
    return {'format': 1, 'tables': t, 'users': [], 'views': {'v_totals': d.get('v_totals', {})}, 'created': '', 'version': ''}


def _fk_order(cur, tables):
    cur.execute("select conrelid::regclass::text, confrelid::regclass::text from pg_constraint where contype='f' and connamespace='public'::regnamespace")
    deps = {t: set() for t in tables}
    for a, b in cur.fetchall():
        a, b = a.strip('"'), b.strip('"')
        if a in deps and b in deps and a != b: deps[a].add(b)
    order, left = [], dict(deps)
    while left:
        ready = sorted(t for t, d in left.items() if not (d & set(left)))
        if not ready: ready = sorted(left)[:1]           # حلقه (نباید پیش بیاید)
        for t in ready: order.append(t); left.pop(t)
    return order


def _cols(cur, t):
    cur.execute("select column_name from information_schema.columns where table_schema='public' and table_name=%s and is_generated='NEVER' order by ordinal_position", [t])
    return [r[0] for r in cur.fetchall()]


def _insert(cur, t, rows):
    if not rows: return 0
    have = set()
    for r in rows[:50]: have |= set(r)
    cols = [c for c in _cols(cur, t) if c in have]
    if not cols: return 0
    cl = ', '.join(q(c) for c in cols)
    for i in range(0, len(rows), 1000):
        cur.execute(f'insert into {q(t)} ({cl}) overriding system value select {cl} from json_populate_recordset(null::{q(t)}, %s::json)', [json.dumps(rows[i:i + 1000], ensure_ascii=False, cls=DjangoJSONEncoder, default=str)])
    return len(rows)


def _reset_seq(cur, t):
    cur.execute("select a.attname from pg_attribute a where a.attrelid=%s::regclass and a.attnum>0 and not a.attisdropped and pg_get_serial_sequence(%s, a.attname) is not null", [q(t), q(t)])
    for (col,) in cur.fetchall():
        cur.execute(f'select setval(pg_get_serial_sequence(%s, %s), coalesce(max({q(col)}), 1), max({q(col)}) is not null) from {q(t)}', [q(t), col])


def restore(json_path, audit_path=None, wipe=False, commit=False, log=print):
    """بازگردانی. commit=False یعنی «آزمایش»: همه‌چیز اجرا و کنترل می‌شود ولی در پایان برگردانده می‌شود."""
    d = load_dump(json_path); data = d['tables']; rep = {'format': d['format'], 'created': d.get('created'), 'tables': {}, 'warnings': [], 'audit_rows': 0}
    with transaction.atomic():
        with connection.cursor() as c:
            real = table_names(c)
            unknown = [t for t in data if t not in real]
            if unknown: rep['warnings'].append('جدول ناشناس در فایل (نادیده گرفته شد): ' + '، '.join(unknown))
            missing = [t for t in real if t not in data]
            if missing: rep['warnings'].append('در فایل نبود (خالی می‌ماند): ' + '، '.join(missing))
            tabs = [t for t in real if t in data]
            if not wipe:
                for t in FRESH_CHECK:
                    if t in real:
                        c.execute(f'select count(*) from {q(t)}')
                        if c.fetchone()[0]: raise RuntimeError(f'دیتابیس مقصد خالی نیست (جدول {t} ردیف دارد). برای پاک‌کردنِ همه و جایگزینی از --wipe استفاده کن.')
            order = _fk_order(c, tabs)
            c.execute('set constraints all deferred')
            for t in order + ['audit_log']: c.execute(f'alter table {q(t)} disable trigger user')
            c.execute('truncate ' + ', '.join(q(t) for t in order + ['audit_log']) + ' restart identity cascade')
            for t in order:
                rep['tables'][t] = _insert(c, t, data[t]); _reset_seq(c, t)
            if d['format'] == 1 and 'counters' not in data:
                for k, src in COUNTER_SRC.items():
                    if src in real: c.execute(f'update counters set n = (select coalesce(max(id), 0) from {q(src)}) where key = %s', [k])
                rep['warnings'].append('فایل قدیمی است: شمارنده‌ی شماره‌ی فاکتورها از روی بیشینه‌ی شناسه‌ها ساخته شد و جدول‌های «سرمایه‌ی نابرابر» و «انتقال انبارگردانی» و «صندوق پاداش» در آن نبود.')
            if audit_path:
                raw = _read(audit_path)
                lines = [l for l in raw.splitlines() if l.strip()]
                for i in range(0, len(lines), 1000):
                    chunk = lines[i:i + 1000]
                    cols = [x for x in _cols(c, 'audit_log') if x in json.loads(chunk[0])]
                    cl = ', '.join(q(x) for x in cols)
                    c.execute(f'insert into audit_log ({cl}) overriding system value select {cl} from json_populate_recordset(null::audit_log, %s::json)', ['[' + ','.join(chunk) + ']'])
                    rep['audit_rows'] += len(chunk)
                _reset_seq(c, 'audit_log')
            else: rep['warnings'].append('فایل تاریخچه داده نشد؛ تاریخچه‌ی تغییرها خالی ماند (داده‌ها کامل‌اند).')
            for t in order + ['audit_log']: c.execute(f'alter table {q(t)} enable trigger user')
            for u in d.get('users', []):
                c.execute('update core_user set telegram_chat_id=%s, bale_chat_id=%s, notify=%s where display_name=%s', [u.get('telegram_chat_id') or '', u.get('bale_chat_id') or '', bool(u.get('notify', True)), u.get('display_name')])
            # کنترل: مجموع‌های بعد از بازگردانی با مجموع‌های ثبت‌شده در فایل
            c.execute('select to_json(t)::text from v_totals t limit 1'); r = c.fetchone(); now = _j(r[0]) if r else {}
            was = d.get('views', {}).get('v_totals', {}) or {}
            diffs = {k: (was[k], now.get(k)) for k in was if k in now and isinstance(was[k], (int, float)) and abs((was[k] or 0) - (now.get(k) or 0)) > 0.5}
            rep['totals_now'] = now; rep['totals_diff'] = diffs
            rep['check_diff'] = now.get('check_diff')
        if not commit: transaction.set_rollback(True)
    rep['committed'] = bool(commit)
    return rep
