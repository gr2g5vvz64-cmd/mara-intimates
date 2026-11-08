# MARA INTIMATES — API حسابداری

Django + Postgres (Supabase). منطق حسابداری در توابع plpgsql است (`ledger/sql/schema.sql`) و از مسیر `/api/rpc/<fn>/` صدا زده می‌شود.

- استقرار: `render.yaml` را روی Render به‌عنوان Blueprint بده یا دستی بساز (Build: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate --noinput`، Start: `python manage.py bootstrap_people && gunicorn config.wsgi --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 90 --keep-alive 5`).
- سلامت: `GET /api/health/` — عیب‌یابی (مدیر): `GET /api/diagnostics/`.
- کرون: `/api/cron/<ping|nightly|due|aging|weekly|audit|backup|setup_bots>/?key=CRON_KEY`.
- تست محلی: `tests/reseed_and_serve.sh` سپس تست‌های `tests/`.


## نسخه‌ی ۵.۱۹
- **مهدی (مشاهده‌گر):** نقش `viewer`؛ همه‌چیز را مثل رعنا می‌بیند ولی هیچ ثبتی ندارد (سرور هم رد می‌کند). در Render این‌ها را اضافه کن: `MAHDI_EMAIL` (یا `MAHDI_PHONE`) و `MAHDI_PASSWORD` (حداقل ۸ کاراکتر)؛ بعد سرویس را Deploy کن تا ساخته شود.
- **بررسی شبانه‌ی اشتباهات:** کرون `audit` → `/api/cron/audit/?key=CRON_KEY`؛ هر شب نتیجه به تلگرام/بله‌ی مدیر می‌رود (سالم یا فهرست مغایرت‌ها). همین بررسی در برنامه: تحلیل › بررسی اشتباهات.


## v5.20
- سود بین مهسا و رعنا برابر (۵۰–۵۰)؛ توضیح محاسبه‌ی هر عدد برای مدیر؛ خط/جدول پررنگ‌تر.
- بعد از هر ثبتی که سرمایه‌ی یک شریک را زیاد کند، پیام «چقدر واریز شود تا سرمایه برابر شود» برای مدیر، مهسا، رعنا و مهدی در بات می‌رود (مهدی باید بات را در «حساب من» وصل کند).
- ویرایش مبلغ‌های فاکتور خرید (تخفیف، حمل، پرداخت) حتی بعد از فروش کالا؛ مایگریشن 0008.

## پشتیبان‌گیری و بازگردانی (۷٫۷۰)
**هر شب** (کرون `backup`) سه فایل **همزمان به تلگرام و بله‌ی مدیر** می‌رود: اکسل همه‌ی صفحه‌ها، `mara-YYYYMMDD.json.gz` (همه‌ی جدول‌ها، قابل بازگردانی) و `mara-audit-YYYYMMDD.jsonl.gz` (تاریخچه‌ی کامل). رمز و توکن هیچ‌وقت داخل فایل‌ها نیست.

**پشتیبان یدک (GitHub):** فایل `.github/workflows/backup-fallback.yml` ساعت ۰۱:۰۰ تهران خودش از دیتابیس پشتیبان می‌گیرد و اگر امشب نرفته باشد می‌فرستد (`python manage.py backup_now --if-missing`)؛ پس حتی اگر Render یا کرون کار نکند پشتیبان می‌رسد. مخزن باید Private باشد و سه Secret بگیرد: `DATABASE_URL`، `TELEGRAM_BOT_TOKEN`، `BALE_BOT_TOKEN` (Settings › Secrets and variables › Actions). اگر هیچ فایلی به هیچ کانالی نرسد، کار قرمز می‌شود و GitHub ایمیل می‌دهد. اجرای دستی: تب Actions › «پشتیبان یدک» › Run workflow.

**بازگردانی (روی یک دیتابیس تازه):**
1. دیتابیس جدید بساز و `DATABASE_URL` را به آن بده، سپس `python manage.py migrate` و `python manage.py bootstrap_people`.
2. آزمایش (چیزی ثبت نمی‌کند، فقط همه‌چیز را اجرا و کنترل می‌کند):
   `python manage.py restore_backup mara-YYYYMMDD.json.gz --audit mara-audit-YYYYMMDD.jsonl.gz`
3. اگر «✔ مجموع‌های مالی با فایل یکی است» و «اختلاف کنترل = ۰» آمد، همان دستور را با `--yes` بزن تا ثبت شود.
4. اگر مقصد داده دارد و می‌خواهی جایگزین شود: `--wipe` (خطرناک).

فایل‌های قدیمی‌تر از ۷٫۷۰ هم بازگردانده می‌شوند، ولی جدول‌های «سرمایه‌ی نابرابر»، «انتقال انبارگردانی» و «صندوق پاداش» در آن‌ها نبود. کاربران را `bootstrap_people` از متغیرهای محیطی می‌سازد؛ اگر بات‌ها پیام نفرستادند، هر کاربر یک بار در بات `/start` بزند. تست: `python tests/test_restore.py`.

## شماره‌گذاری نسخه
نسخه‌ها به‌صورت «اصلی.فرعی» هستند: ۶٫۰ ← ۶٫۱ ← … ← ۶٫۱۰ و بعد ۷٫۰ و همین‌طور ادامه. نسخه‌ی فعلی ۶٫۱ است.
- ۶٫۱: دکمه‌ی «ثبت پرداخت» در صورت‌حساب تامین‌کننده فقط وقتی بدهی داریم.
