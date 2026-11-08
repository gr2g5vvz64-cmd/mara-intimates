import json
from django.core.management.base import BaseCommand, CommandError
from core import backup


class Command(BaseCommand):
    help = ('بازگردانی از فایل پشتیبان (mara-YYYYMMDD.json.gz) داخل یک دیتابیس تازه که migrate شده است.\n'
            'بدون --yes فقط «آزمایش» می‌کند (همه‌چیز را اجرا و کنترل می‌کند ولی برمی‌گرداند)؛ با --yes ثبت نهایی می‌شود.')

    def add_arguments(self, p):
        p.add_argument('json_file', help='فایل داده‌ها: mara-YYYYMMDD.json.gz')
        p.add_argument('--audit', help='فایل تاریخچه: mara-audit-YYYYMMDD.jsonl.gz (اختیاری)')
        p.add_argument('--wipe', action='store_true', help='اگر مقصد داده دارد، اول همه را پاک و جایگزین کن (خطرناک)')
        p.add_argument('--yes', action='store_true', help='ثبت نهایی (بدون آن فقط آزمایش است)')

    def handle(self, *a, **o):
        try: rep = backup.restore(o['json_file'], o.get('audit'), wipe=o['wipe'], commit=o['yes'])
        except Exception as e: raise CommandError(f'بازگردانی انجام نشد و هیچ چیز تغییر نکرد: {e}')
        w = self.stdout.write
        w(f"فایل: قالب {rep['format']} · ساخته‌شده {rep.get('created') or '—'}")
        for t, n in rep['tables'].items():
            if n: w(f'  {t}: {n} ردیف')
        w(f"  تاریخچه: {rep['audit_rows']} ردیف")
        for x in rep['warnings']: w(self.style.WARNING('⚠ ' + x))
        bad = rep['totals_diff']
        if bad: w(self.style.ERROR('✘ مجموع‌ها با فایل نمی‌خوانند: ' + json.dumps(bad, ensure_ascii=False)))
        else: w(self.style.SUCCESS('✔ مجموع‌های مالی (سرمایه، موجودی، طلب، بدهی، …) با فایل پشتیبان یکی است'))
        w((self.style.SUCCESS if abs(rep['check_diff'] or 0) <= 0.5 else self.style.ERROR)(f"اختلاف کنترل حسابداری: {rep['check_diff']} (باید صفر باشد)"))
        if rep['committed']: w(self.style.SUCCESS('✔ ثبت نهایی شد. حالا «python manage.py bootstrap_people» را بزن تا کاربران با رمزهای محیطی ساخته شوند؛ بات‌ها دوباره /start می‌خواهند اگر شناسه‌ی چت‌شان بازگردانده نشد.'))
        else: w(self.style.WARNING('این فقط آزمایش بود و چیزی در دیتابیس نماند. برای ثبت نهایی همان دستور را با --yes بزن.'))
        if bad or abs(rep['check_diff'] or 0) > 0.5: raise CommandError('کنترل‌ها نخواند')
