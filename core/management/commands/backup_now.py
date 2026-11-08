import json
from django.core.management.base import BaseCommand, CommandError
from core.views import _backup


class Command(BaseCommand):
    help = 'پشتیبان کامل را همین الان به تلگرام و بله می‌فرستد (همان که کرون شبانه صدا می‌زند).'

    def add_arguments(self, p):
        p.add_argument('--if-missing', action='store_true', help='اگر در ۱۸ ساعت گذشته پشتیبان موفق رفته، دوباره نفرست (برای کرونِ یدک در GitHub)')

    def handle(self, *a, **o):
        r = _backup(only_if_missing=o['if_missing'])
        self.stdout.write(json.dumps(r, ensure_ascii=False, indent=2, default=str))
        if not r.get('skipped') and not r.get('ok'): raise CommandError('هیچ فایلی به هیچ کانالی نرسید (توکن بات‌ها یا شناسه‌ی چت مدیر را بررسی کن).')
