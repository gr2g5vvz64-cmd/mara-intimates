import hmac, random, time
from datetime import timedelta
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from . import notify, reports, bots
from .api import api, ok, same
from .db import rpc, rpc_idem, all_data, audit_rows, log_event, fetch_json, DATA_SOURCES
from .errors import ApiError, record, log, tb
from .models import User, ApiToken, OtpCode, ErrorLog, NotifyLog, last10, digits
from .summary import load_names, summarize, LABEL

VERSION = '7.70'


def user_json(u):
    return {'id': u.id, 'name': u.display_name, 'role': u.role, 'can_edit': u.can_edit, 'email': u.email, 'phone': u.phone,
            'telegram': bool(u.telegram_chat_id), 'bale': bool(u.bale_chat_id),
            'view_as': settings.VIEWER_AS if u.role == 'viewer' else ''}


def find_user(ident):
    ident = (ident or '').strip()
    if not ident: return None
    qs = User.objects.filter(is_active=True)
    u = qs.filter(email__iexact=ident).first() or qs.filter(username__iexact=ident).first() or qs.filter(display_name=ident).first()
    if u: return u
    key = last10(ident)
    if len(key) >= 10: return next((x for x in qs if last10(x.phone) == key), None)
    return None


def throttle(request, ident, limit=8, window=600):
    import hashlib
    k = 'login:' + hashlib.sha1(f'{request.client_ip}:{(ident or "").lower()}'.encode()).hexdigest()
    n = cache.get(k, 0)
    if n >= limit: raise ApiError('E_LOCKED', '', 'auth.throttle')
    return k, n


def fail_login(request, k, n, ident):
    cache.set(k, n + 1, 600)
    log_event(None, 'auth', 'LOGIN_FAIL', f'ورود ناموفق برای «{ident[:40]}»', request.client_ip, request.request_id)


# ------------------------------- auth -------------------------------
@api(('POST',), auth=None)
def login(request):
    ident = str(request.data.get('identifier', '')).strip(); pw = str(request.data.get('password', ''))
    k, n = throttle(request, ident)
    u = find_user(ident)
    if not u or not u.check_password(pw):
        fail_login(request, k, n, ident); raise ApiError('E_AUTH_BAD', 'ایمیل/موبایل یا رمز اشتباه است.', 'auth.login')
    cache.delete(k)
    key = ApiToken.issue(u, request.client_ip, request.META.get('HTTP_USER_AGENT', ''))
    log_event(u, 'auth', 'LOGIN', f'ورود {u.display_name} با رمز', request.client_ip, request.request_id)
    return {'token': key, 'user': user_json(u)}


@api(('POST',), auth=None)
def otp_request(request):
    ident = str(request.data.get('identifier', '')).strip()
    k, n = throttle(request, 'otp:' + ident, 5)
    u = find_user(ident)
    cache.set(k, n + 1, 600)
    if not u: raise ApiError('E_AUTH_BAD', 'کاربر پیدا نشد.', 'auth.otp_request')
    chans = [ch for ch in ('bale', 'telegram') if getattr(u, notify.CH[ch][2])]
    if not chans: raise ApiError('E_OTP_NOCHAT', '', 'auth.otp_request')
    last = OtpCode.objects.filter(user=u).order_by('-id').first()
    if last and (timezone.now() - last.created).total_seconds() < 45: raise ApiError('E_OTP', 'کمی صبر کن و دوباره بزن (۴۵ ثانیه).', 'auth.otp_request')
    code = f'{random.SystemRandom().randrange(100000, 1000000)}'
    OtpCode.objects.create(user=u, code_hash=OtpCode.hash(u.id, code))
    sent = [notify.send_text(ch, getattr(u, notify.CH[ch][2]), f'کد ورود MARA INTIMATES: {code}\n(۵ دقیقه معتبر است؛ به کسی نگو)', 'otp') for ch in chans]
    if not any(ok_ for ok_, _ in sent): raise ApiError('E_BOT_SEND', f'ارسال کد انجام نشد: {sent[0][1]}', 'auth.otp_request', detail=str(sent[0][1]))
    return {'sent': True}


@api(('POST',), auth=None)
def otp_verify(request):
    ident = str(request.data.get('identifier', '')).strip(); code = digits(request.data.get('code'))
    u = find_user(ident)
    if not u: raise ApiError('E_OTP', '', 'auth.otp_verify')
    o = OtpCode.objects.filter(user=u, used=False, created__gte=timezone.now() - timedelta(minutes=5)).order_by('-id').first()
    if not o or o.attempts >= 5: raise ApiError('E_OTP', 'کد منقضی شده؛ کد جدید بگیر.', 'auth.otp_verify')
    o.attempts += 1
    if not hmac.compare_digest(o.code_hash, OtpCode.hash(u.id, code)):
        o.save(update_fields=['attempts']); raise ApiError('E_OTP', '', 'auth.otp_verify')
    o.used = True; o.save(update_fields=['used', 'attempts'])
    key = ApiToken.issue(u, request.client_ip, request.META.get('HTTP_USER_AGENT', ''), via='otp')
    log_event(u, 'auth', 'LOGIN', f'ورود {u.display_name} با کد بله', request.client_ip, request.request_id)
    return {'token': key, 'user': user_json(u)}


@api(('POST',))
def logout(request):
    request.api_token.revoked = True; request.api_token.save(update_fields=['revoked'])
    log_event(request.api_user, 'auth', 'LOGOUT', f'خروج {request.api_user.display_name}', request.client_ip, request.request_id)
    return {'bye': True}


@api(('POST',))
def change_password(request):
    old, new = str(request.data.get('old', '')), str(request.data.get('new', ''))
    u = request.api_user
    if not u.check_password(old): raise ApiError('E_AUTH_BAD', 'رمز فعلی درست نیست.', 'auth.password')
    if len(new) < 8: raise ApiError('E_INPUT', 'رمز جدید حداقل ۸ کاراکتر باشد.', 'auth.password')
    u.set_password(new); u.save()
    ApiToken.objects.filter(user=u).exclude(pk=request.api_token.pk).update(revoked=True)
    log_event(u, 'auth', 'PASSWORD', f'{u.display_name} رمزش را عوض کرد', request.client_ip, request.request_id)
    return {'changed': True}


@api(('GET',))
def me(request): return {'user': user_json(request.api_user)}


# ------------------------------- data -------------------------------
@api(('GET',))
def data(request):
    d = all_data()
    bots_ = {'telegram': {'username': settings.TELEGRAM_BOT_USERNAME}, 'bale': {'username': settings.BALE_BOT_USERNAME}}
    try: fnet = reports.fund_net() if request.api_user.role != 'viewer' else None
    except Exception: fnet = None
    return {'user': user_json(request.api_user), 'tables': d, 'fund_net': fnet, 'bots': bots_, 'server_time': timezone.now().isoformat(), 'version': VERSION}


def _is_change(fn, data):
    """ذخیره‌ی کالا/تامین‌کننده/مشتری فقط وقتی «ویرایش» است که شناسه داشته باشد (ثبت تازه پیام نمی‌خواهد)."""
    if fn in ('save_item', 'save_supplier', 'save_customer', 'save_category'): return bool(data.get('id'))
    return True


@api(('POST',))
def rpc_view(request, fn):
    t0 = time.time()
    key = request.META.get('HTTP_X_IDEMPOTENCY_KEY') or None
    chg_before = None
    if fn in reports.CHANGE_FNS and request.api_user.role != 'viewer':
        try: chg_before = reports.change_before(fn, request.data)
        except Exception: chg_before = None
    res, replayed = rpc_idem(request.api_user, fn, request.data, request.client_ip, request.request_id, key)
    if fn in reports.CHANGE_FNS and not replayed and _is_change(fn, request.data) and request.api_user.role != 'admin':   # گزارش کامل تغییر (چه کسی، کی، قبل ← بعد) فقط برای مدیر؛ هیچ‌وقت ثبت اصلی را خراب نمی‌کند
        try:
            txt = reports.change_text(fn, request.data, res, chg_before, request.api_user.display_name, request.request_id)
            notify.broadcast_async(txt, 'void' if fn == 'void_entry' else ('edit' if fn.startswith(('edit_', 'save_', 'set_')) else 'change'), only_admin=True)
        except Exception as e: log.error('change notice failed: %r', e)
    if fn in ('submit_monthly_count', 'resolve_monthly_count') and not replayed:   # پیام تشکر/گزارش مدیر؛ هیچ‌وقت ثبت اصلی را خراب نمی‌کند
        try:
            from . import monthly
            if fn == 'submit_monthly_count': monthly.on_submitted(request.api_user.display_name)
            else: monthly.on_resolved(int(request.data.get('id')))
        except Exception as e: log.error('monthly notice failed: %r', e)
    return {'result': res, 'replayed': replayed, 'ms': int((time.time() - t0) * 1000)}


@api(('GET',), auth='admin')
def audit_check(request):
    from .audit import run_audit
    return run_audit()


@api(('GET',), auth='admin')
def advisor_view(request):
    """مشاور خرید: پیشنهاد خرید و هشدار «خرید نکن» از روی فروش واقعی (days=۷..۱۲۰)"""
    from .advisor import compute
    try: d = int(request.GET.get('days') or 30)
    except ValueError: raise ApiError('E_INPUT', 'بازه نامعتبر است.', 'advisor')
    return compute(d)


@api(('POST',), auth='admin')
def advisor_send(request):
    """فرستادن همین الانِ گزارش مشاور خرید به بات‌های مدیر"""
    from .advisor import advisor_text
    try: d = int(request.data.get('days') or 30)
    except (TypeError, ValueError): raise ApiError('E_INPUT', 'بازه نامعتبر است.', 'advisor')
    t = advisor_text(d)
    return {'sent': notify.broadcast(t, 'advisor', only_admin=True) if t else [], 'empty': not t}


@api(('GET',))
def month_report_view(request):
    """گزارش ماهانه: مدیر هم سود و زیان و هم حساب‌وکتاب؛ شریک فقط حساب‌وکتاب؛ مشاهده‌گر هیچ."""
    u = request.api_user
    if u.role == 'viewer': raise ApiError('E_PERM', '', 'api.report')
    key = request.GET.get('month') or ''
    try: r = reports.month_report(key)
    except ValueError: raise ApiError('E_INPUT', 'ماه نامعتبر است (مثل 1405-07).', 'api.report')
    if u.role != 'admin': r.pop('pnl', None); r.pop('prev', None)
    return r


@api(('POST',), auth='admin')
def month_send(request):
    """ارسال دستی گزارش ماهانه در ربات (مدیر: سود و زیان + حساب‌وکتاب؛ شریک‌ها: حساب‌وکتاب)."""
    month = str(request.data.get('month') or '')
    if not month: raise ApiError('E_INPUT', 'ماه را مشخص کن.', 'api.report')
    return _monthly(month)


@api(('GET',))
def audit(request):
    u = request.api_user
    try: limit = min(int(request.GET.get('limit', 200)), 1000); offset = int(request.GET.get('offset', 0))
    except ValueError: raise ApiError('E_INPUT', '', 'api.audit')
    actor = request.GET.get('actor') or None
    if u.role != 'admin': actor = u.display_name
    rows = audit_rows(limit=limit + 1, offset=offset, table=request.GET.get('table') or None, actor=actor, row_id=request.GET.get('row_id') or None)
    names = load_names(); out = []
    hide = request.GET.get('noise') != '1'
    for r in rows[:limit]:
        text, noise = summarize(r, names)
        if noise and hide: continue
        out.append({'id': r['id'], 'at': r['at'], 'actor': r['actor'], 'role': r['role'], 'ip': r['ip'], 'req': r['req'], 'table': r['table_name'],
                    'label': LABEL.get(r['table_name'], r['table_name']), 'row_id': r['row_id'], 'action': r['action'], 'text': text, 'noise': noise,
                    'old': r['old'] if u.role == 'admin' else None, 'new': r['new'] if u.role == 'admin' else None})
    return {'rows': out, 'more': len(rows) > limit}


@api(('GET',))
def export_xlsx(request):
    from .exports import build_xlsx
    blob, _ = build_xlsx(request.api_user)
    log_event(request.api_user, 'export', 'EXPORT', f'{request.api_user.display_name} خروجی اکسل گرفت', request.client_ip, request.request_id)
    r = HttpResponse(blob, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    r['Content-Disposition'] = 'attachment; filename="mara-intimates.xlsx"'
    return r


# ------------------------------- diagnostics -------------------------------
def health_info(deep=False):
    h = {'version': VERSION, 'time': timezone.now().isoformat(), 'db': {'ok': False}, 'config': {}}
    try:
        with connection.cursor() as c:
            c.execute('select current_database(), version(), current_setting(\'TimeZone\')'); db, ver, tz = c.fetchone()
            c.execute("select count(*) from information_schema.tables where table_schema='public' and table_name in ('sales','purchase_invoices','customers','audit_log','v_totals','v_due')"); nt = c.fetchone()[0]
            c.execute("select count(*) from pg_proc where proname in ('create_sale','create_purchase','collect_customer','add_supplier_payment','void_entry')"); nf = c.fetchone()[0]
            c.execute('select check_diff from v_totals'); diff = c.fetchone()
            c.execute('select count(*) from audit_log'); na = c.fetchone()[0]
        h['db'] = {'ok': True, 'name': db, 'timezone': tz, 'schema_ok': nt == 6 and nf == 5, 'tables_found': nt, 'functions_found': nf,
                   'check_diff': float(diff[0]) if diff else None, 'audit_rows': na}
    except Exception as e:
        h['db'] = {'ok': False, 'error': str(e)[:300], 'hint': 'DATABASE_URL را در Render بررسی کن (باید Session pooler Supabase باشد) و مطمئن شو migrate اجرا شده.'}
    users = list(User.objects.filter(is_active=True))
    h['config'] = {'users': len(users), 'users_with_phone': sum(1 for u in users if u.phone), 'users_with_email': sum(1 for u in users if u.email),
                   'telegram_token': notify.configured('telegram'), 'bale_token': notify.configured('bale'), 'cron_key': bool(settings.CRON_KEY),
                   'webhook_secret': bool(settings.WEBHOOK_SECRET), 'public_url': settings.PUBLIC_URL or None, 'frontend_origins': settings.CORS_ALLOWED_ORIGINS}
    return h


_BOOT = time.time()


def ping(request):
    """سبک و بدون دیتابیس: برای کرون‌جاب، UptimeRobot و HealthCheck رندر. HEAD بدنه ندارد (هشدار gunicorn نمی‌دهد)."""
    if request.method == 'HEAD': return HttpResponse(status=200)
    return JsonResponse({'ok': True, 'version': VERSION, 'up_s': int(time.time() - _BOOT)})


@api(('GET', 'HEAD'), auth=None)
def health(request):
    h = health_info()
    if request.method == 'HEAD': return HttpResponse(status=200 if h['db'].get('ok') else 503)
    return JsonResponse({'ok': h['db'].get('ok', False), **h}, status=200 if h['db'].get('ok') else 503, json_dumps_params={'ensure_ascii': False})


@api(('GET',), auth='admin')
def diagnostics(request):
    h = health_info()
    users = [{**user_json(u), 'last_login': None, 'active_sessions': u.tokens.filter(revoked=False, expires__gt=timezone.now()).count()} for u in User.objects.all()]
    errs = list(ErrorLog.objects.all()[:60].values('at', 'request_id', 'code', 'where', 'message', 'actor', 'path', 'status', 'source', 'detail'))
    sends = list(NotifyLog.objects.all()[:40].values('at', 'channel', 'to', 'ok', 'kind', 'detail'))
    bots_ = {}
    if request.GET.get('bots') == '1':
        bots_ = {ch: bots.webhook_status(ch) for ch in ('telegram', 'bale')}
    return {'health': h, 'users': users, 'errors': errs, 'sends': sends, 'bots': bots_}


KIND_LABEL = {'capital': 'سرمایه', 'monthly_count': 'انبارگردانی', 'edit': 'ویرایش', 'void': 'ابطال/حذف', 'change': 'تغییر دیگر', 'report': 'گزارش', 'backup': 'پشتیبان'}


@api(('GET',), auth='admin')
def notify_log(request):
    """فهرست پیام‌های فرستاده‌شده‌ی بات‌ها: به چه کسی، کی، چه نوعی، موفق یا ناموفق و متن پیام."""
    kind = request.GET.get('kind') or ''; who = request.GET.get('user') or ''
    try: limit = min(int(request.GET.get('limit', 100)), 300); offset = int(request.GET.get('offset', 0))
    except ValueError: raise ApiError('E_INPUT', '', 'api.notify_log')
    owner = {}
    for u in User.objects.all():
        for ch, f in (('telegram', u.telegram_chat_id), ('bale', u.bale_chat_id)):
            if f: owner[(ch, str(f))] = u.display_name
    qs = NotifyLog.objects.all()
    if kind == 'other': qs = qs.exclude(kind__in=['capital', 'monthly_count', 'edit', 'void'])
    elif kind: qs = qs.filter(kind=kind)
    if who:
        ids = [(ch, cid) for (ch, cid), n in owner.items() if n == who]
        from django.db.models import Q
        cond = Q(pk__in=[])
        for ch, cid in ids: cond |= Q(channel=ch, to=cid)
        qs = qs.filter(cond)
    rows = list(qs[offset:offset + limit + 1])
    out = [{'id': r.id, 'at': r.at, 'user': owner.get((r.channel, r.to), '؟ ' + r.to), 'channel': r.channel, 'ok': r.ok, 'kind': r.kind,
            'label': KIND_LABEL.get(r.kind, r.kind or '—'), 'detail': r.detail, 'text': r.text} for r in rows[:limit]]
    users = [{'name': u.display_name, 'role': u.role, 'telegram': bool(u.telegram_chat_id), 'bale': bool(u.bale_chat_id), 'notify': u.notify}
             for u in User.objects.filter(is_active=True).order_by('id')]
    return {'rows': out, 'more': len(rows) > limit, 'users': users, 'bots': {ch: notify.configured(ch) for ch in ('telegram', 'bale')}}


@api(('POST',), auth='admin')
def capital_notice_send(request):
    """همین الان وضعیت سرمایه و مبلغ برابرسازی را برای همه (مهسا، رعنا، مهدی و مدیر) می‌فرستد."""
    txt = reports.capital_status_text()
    res = notify.broadcast(txt, 'capital', viewers=True)
    got = sorted({r['user'] for r in res if r['ok']}); users = [u.display_name for u in notify.recipients(False, True)]
    return {'sent': res, 'got': got, 'missing': [n for n in users if n not in got]}


@api(('POST',), auth='admin')
def customer_msg_send(request):
    """فقط وقتی مدیر دکمه را می‌زند: یک پیام (تشکر یا فاکتور) را از راه ربات بله برای مشتری می‌فرستد و در تاریخچه ثبت می‌کند."""
    from django.db import connection
    d = request.data; cid = int(d.get('customer_id') or 0); sid = d.get('sale_id'); kind = d.get('kind'); text = str(d.get('text') or '').strip()
    if kind not in ('thanks', 'invoice') or not text: raise ApiError('E_INPUT', 'نوع پیام یا متن خالی است.', 'api.customer_msg_send')
    with connection.cursor() as c:
        c.execute('select name, bale_chat_id from customers where id = %s', [cid]); row = c.fetchone()
        if not row: raise ApiError('E_NOT_FOUND', 'مشتری پیدا نشد.', 'api.customer_msg_send')
        if sid:
            c.execute("select 1 from customer_msgs where sale_id = %s and kind = %s and status in ('sent','skipped')", [int(sid), kind])
            if c.fetchone(): raise ApiError('E_DUP', 'این پیام قبلاً برای همین فاکتور ارسال یا رد شده است.', 'api.customer_msg_send')
    if not row[1]: raise ApiError('E_BOT_SEND', f'«{row[0]}» هنوز ربات بله را فعال نکرده؛ از دکمه‌ی باز کردن چت استفاده کن.', 'api.customer_msg_send')
    if not notify.configured('bale'): raise ApiError('E_BOT_CONF', 'توکن بات بله ثبت نشده.', 'api.customer_msg_send')
    ok_, det = notify.send_text('bale', row[1], text, 'customer')
    rpc(request.api_user, 'log_customer_msg', {'customer_id': cid, 'sale_id': sid, 'kind': kind, 'channel': 'bale', 'status': 'sent' if ok_ else 'failed', 'text': text, 'error': '' if ok_ else str(det)})
    if not ok_: raise ApiError('E_BOT_SEND', str(det), 'api.customer_msg_send', detail=str(det))
    return {'sent': True}


@api(('POST',), auth='admin')
def setup_bots(request):
    return {'results': [bots.setup_webhook(ch) for ch in ('telegram', 'bale')]}


@api(('POST',), auth='admin')
def test_send(request):
    ch = request.data.get('channel'); u = request.api_user
    if ch not in ('telegram', 'bale'): raise ApiError('E_INPUT', '', 'api.test_send')
    cid = getattr(u, notify.CH[ch][2])
    if not notify.configured(ch): raise ApiError('E_BOT_CONF', f'توکن بات {notify.NAME[ch]} ثبت نشده.', 'api.test_send')
    if not cid: raise ApiError('E_BOT_SEND', f'تو هنوز بات {notify.NAME[ch]} را فعال نکرده‌ای: در بات /start بزن و شماره‌ات را بفرست.', 'api.test_send')
    ok_, d = notify.send_text(ch, cid, '✅ پیام آزمایشی MARA INTIMATES — بات درست کار می‌کند.', 'test')
    if not ok_: raise ApiError('E_BOT_SEND', str(d), 'api.test_send', detail=str(d))
    return {'sent': True}


@api(('POST',), auth=None)
def client_error(request):
    n = cache.get('cerr', 0)
    if n > 40: return {'dropped': True}
    cache.set('cerr', n + 1, 60)
    d = request.data
    record(request, str(d.get('code') or 'E_CLIENT')[:30], str(d.get('message', ''))[:1500], str(d.get('where', ''))[:80], int(d.get('status') or 0),
           str(d.get('detail', ''))[:5000], source='client')
    return {'saved': True}


# ------------------------------- cron -------------------------------
def _backup(only_if_missing=False):
    """پشتیبان کامل: اکسل همه‌ی صفحه‌ها + JSON کامل (قابل بازگردانی با restore_backup) + تاریخچه‌ی کامل — همزمان به تلگرام و بله.
    only_if_missing: اگر در ۱۸ ساعت گذشته با موفقیت فرستاده شده، دوباره نمی‌فرستد (برای کرونِ پشتیبان که به‌جای کرون اصلی کار می‌کند)."""
    from .exports import build_xlsx
    from . import backup as bk
    from .models import NotifyLog
    if only_if_missing and NotifyLog.objects.filter(kind='backup', ok=True, at__gte=timezone.now() - timedelta(hours=18)).exists():
        return {'skipped': True, 'reason': 'پشتیبان امروز قبلاً فرستاده شده'}
    blob, _d = build_xlsx(); del _d
    stamp = timezone.localtime().strftime('%Y%m%d')
    jb, d = bk.dump_gz(VERSION); ntab = sum(len(v) for v in d['tables'].values()); del d
    ab, n = bk.audit_gz()
    ch = ('telegram', 'bale')
    s1 = notify.broadcast_file(f'mara-{stamp}.xlsx', blob, 'پشتیبان پایان روز (اکسل: همه‌ی صفحه‌ها)', channels=ch)
    s2 = notify.broadcast_file(f'mara-{stamp}.json.gz', jb, 'پشتیبان پایان روز (داده‌ها، فشرده gz — قابل بازگردانی؛ با ۷-زیپ یا unzip هم باز می‌شود)', channels=ch)
    s3 = notify.broadcast_file(f'mara-audit-{stamp}.jsonl.gz', ab, f'پشتیبان تاریخچه‌ی کامل ({n} ردیف، فشرده gz)', channels=ch)
    sent = s1 + s2 + s3
    return {'sent': sent, 'ok': sum(1 for x in sent if x.get('ok')), 'bytes': len(blob), 'json_bytes': len(jb), 'rows': ntab, 'audit_rows': n, 'audit_bytes': len(ab)}


def _monthly(month=None):
    """گزارش ماهانه. اگر month ندهند، فقط در آخرین روز ماه شمسی چیزی می‌فرستد (کرون روزانه کافی است)؛ با month=1405-07 هر ماهی را می‌فرستد."""
    from .jalali import g2j
    if not month:
        today = timezone.localtime().date(); y, m, d = g2j(today.year, today.month, today.day)
        ty, tm, _ = g2j(*(today + timedelta(days=1)).timetuple()[:3])
        if (ty, tm) == (y, m): return {'skipped': True, 'why': 'امروز آخر ماه شمسی نیست'}
        month = f'{y:04d}-{m:02d}'
    try: reports.jmonth_range(month)
    except ValueError: raise ApiError('E_INPUT', 'ماه نامعتبر است (مثل 1405-07).', 'cron')
    admin_txt = reports.month_text(month, admin=True); partner_txt = reports.month_text(month, admin=False)
    sent = notify.broadcast(admin_txt, 'monthly', only_admin=True) + notify.broadcast(partner_txt, 'monthly', only_admin=True)   # مدیر هر دو نسخه را می‌گیرد: کامل و تسویه
    from .models import User
    for u in notify.recipients():
        if u.role == 'admin': continue
        for ch in ('telegram', 'bale'):
            cid = getattr(u, notify.CH[ch][2])
            if cid and notify.configured(ch):
                ok_, dd = notify.send_text(ch, cid, partner_txt, 'monthly')
                sent.append({'user': u.display_name, 'channel': ch, 'ok': ok_, 'detail': '' if ok_ else dd})
    return {'month': month, 'sent': sent}


def run_task(task, request_month=None):
    if task == 'ping': return {'pong': True}
    if task == 'nightly':
        from .models import IdemKey
        IdemKey.objects.filter(created__lt=timezone.now() - timedelta(days=60)).delete()   # کلیدهای قدیمی ثبت
        try:
            from . import monthly; mc = monthly.tick()
        except Exception as e: log.error('monthly tick failed: %r', e); mc = {'error': repr(e)}
        try:
            from . import fund; fc = fund.tick()
        except Exception as e: log.error('fund tick failed: %r', e); fc = {'error': repr(e)}
        return {'sent': notify.broadcast(reports.daily_text(), 'nightly', viewers=True), 'monthly_count': mc, 'bonus_fund': fc}
    if task == 'due':
        t = reports.due_text(compact=True)
        return {'sent': notify.broadcast(t, 'due', viewers=True) if t else [], 'empty': not t}
    if task == 'aging':
        t = reports.aging_text()
        return {'sent': notify.broadcast(t, 'aging', viewers=True) if t else [], 'empty': not t}
    if task == 'backup': return _backup()
    if task == 'capital':
        from . import capital, cheque_notice
        res = capital.tick()
        try: res['cheques'] = cheque_notice.tick()
        except Exception as e: log.error('cheque tick failed: %r', e); res['cheques'] = {'error': repr(e)}
        return res
    if task == 'monthly_count':
        from . import monthly
        return monthly.start(request_month, True) if request_month else monthly.tick()
    if task == 'setup_bots': return {'results': [bots.setup_webhook(ch) for ch in ('telegram', 'bale')]}
    if task == 'audit':
        from .audit import run_audit, audit_text
        return {'sent': notify.broadcast(audit_text(run_audit()), 'audit', only_admin=True)}
    if task == 'weekly':
        from .advisor import advisor_text
        t = reports.weekly_text(); adv = advisor_text(30)
        return {'sent': notify.broadcast(t + ('\n\n' + adv if adv else ''), 'weekly', only_admin=True)}
    if task == 'advisor':
        from .advisor import advisor_text
        t = advisor_text(30)
        return {'sent': notify.broadcast(t, 'advisor', only_admin=True) if t else [], 'empty': not t}
    if task == 'monthly': return _monthly(request_month)
    raise ApiError('E_NOT_FOUND', f'کار «{task}» وجود ندارد (ping, nightly, due, aging, weekly, advisor, monthly, monthly_count, audit, backup, setup_bots).', 'cron')


@api(('GET',))
def fund_view(request):
    """صندوق پاداش: هر شریک فقط صندوق خودش را می‌بیند؛ مدیر هر دو."""
    from . import fund
    return fund.info(request.api_user)


@api(('POST',))
def fund_save(request):
    from . import fund
    return fund.save(request.api_user, str(request.data.get('month') or ''), str(request.data.get('owner') or ''))


@api(('POST',), auth='admin')
def fund_void(request):
    from . import fund
    return fund.void(request.api_user, request.data.get('id'), str(request.data.get('reason') or ''))


@api(('POST',), auth='admin')
def monthly_count_start(request):
    """مدیر: شروع دستی انبارگردانی (ماه جاری یا ماه داده‌شده) و فرستادن پیام به مهسا و رعنا"""
    from . import monthly
    return monthly.start(request.data.get('month') or None, True)


@api(('POST',), auth='admin')
def monthly_count_remind(request):
    from . import monthly
    return {'sent': monthly.remind(request.data.get('count_id') or None, request.data.get('holder') or None)}


@api(('GET', 'POST'), auth=None)
def cron(request, task):
    if not settings.CRON_KEY: raise ApiError('E_CRON_KEY', 'CRON_KEY در Render ثبت نشده است.', 'cron')
    if not same(request.GET.get('key') or request.META.get('HTTP_X_CRON_KEY'), settings.CRON_KEY): raise ApiError('E_CRON_KEY', '', 'cron')
    res = run_task(task, request.GET.get('month'))
    log_event(None, 'system', 'CRON', f'کرون «{task}» اجرا شد', request.client_ip, request.request_id)
    return res


# ------------------------------- webhooks -------------------------------
def _webhook(request, ch, secret):
    if not same(secret, settings.WEBHOOK_SECRET): raise ApiError('E_WEBHOOK', '', f'webhook.{ch}')
    try: bots.handle_update(ch, request.data)
    except Exception as e:
        record(request, 'E_BOT', repr(e), f'webhook.{ch}', 500, tb(), source='bot')
    return {'received': True}


@api(('POST',), auth=None)
def telegram_webhook(request, secret): return _webhook(request, 'telegram', secret)


@api(('POST',), auth=None)
def bale_webhook(request, secret): return _webhook(request, 'bale', secret)


@api(('GET',), auth=None)
def root(request): return {'service': 'MARA INTIMATES API', 'version': VERSION, 'health': '/api/health/'}
