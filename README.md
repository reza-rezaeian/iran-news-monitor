# خبر ایران | Iran News Monitor

**نسخه آنلاین:** https://iran-news.rezaariaii.workers.dev

تجمیع اخبار ایران از منابع فارسی، انگلیسی، عبری و عربی، با ترجمه خودکار عنوان‌ها، قیمت طلا/نفت و شاخص نزدیکی جنگ. رابط کاربری دوزبانه (فارسی/انگلیسی).

کل سامانه روی **Cloudflare Workers پلن رایگان** اجرا می‌شود؛ بدون GitHub Actions، بدون سرور و بدون سرویس خارجی.

## معماری

```
Cron هر ۱ دقیقه   → یک فید (چرخشی، هر ۲۱ دقیقه همه فیدها)
                     fetch → parse → فیلتر ایران → ترجمه → D1

Cron هر ۵ دقیقه   → assemble: ساخت JSON نهایی داخل SQLite (json_group_array)
                     → جدول snapshots

Cron هر ۱۰ دقیقه  → قیمت طلا/نفت → snapshots

GET /api/news     → یک ردیف آماده از snapshots (بدون پردازش)
GET /api/prices   → همان
```

### چرا پلن رایگان کافی است

سقف پلن رایگان Workers **۱۰ میلی‌ثانیه CPU در هر invocation** است. به‌جای پردازش همه ۲۱ فید در یک اجرا، هر اجرا فقط یک فید را پردازش می‌کند و کار سنگین تجمیع به SQLite سپرده می‌شود (CPU دیتابیس جزو سهمیه Worker حساب نمی‌شود).

اندازه‌گیری واقعی با `wrangler tail`:

| اجرا | CPU |
|---|---|
| ingest یک فید (۳۰ آیتم) | ۲–۳ms |
| ingest با ۲۷ ترجمه جدید (worst case) | ۵ms |
| assemble (۱۶۰ آیتم، ۹۵KB) | ۳ms |
| prices | ۰–۱ms |
| `/api/news` | ~۱ms |

## انتشار از صفر

```bash
cd worker
npx wrangler d1 create iran-news          # database_id را در wrangler.jsonc بگذارید
npx wrangler d1 execute iran-news --remote --file=schema.sql
npx wrangler deploy
npx wrangler secret put ADMIN_KEY          # برای اجرای دستی و تست
```

پر کردن اولیه دیتابیس (اختیاری، برای اینکه سایت از لحظه اول پر باشد):

```bash
python3 build_static.py                    # ساخت dist/data/*.json
python3 worker/seed_d1.py                  # تولید worker/seed.sql
cd worker && npx wrangler d1 execute iran-news --remote --file=seed.sql
curl "https://iran-news.<subdomain>.workers.dev/api/admin/run?mode=assemble&key=$ADMIN_KEY"
```

## اجرای محلی

```bash
python3 server.py          # http://localhost:8080
```

بار اول ۲۰–۶۰ ثانیه طول می‌کشد، بعد از آن از `news_cache.json` فوری پاسخ می‌دهد.

## مدیریت

| کار | دستور |
|---|---|
| اجرای دستی یک فید | `/api/admin/run?mode=ingest&i=4&key=...` |
| ساخت snapshot | `/api/admin/run?mode=assemble&key=...` |
| به‌روزرسانی قیمت‌ها | `/api/admin/run?mode=prices&key=...` |
| وضعیت | `/api/health` |

## منابع

بی‌بی‌سی فارسی، دویچه‌وله فارسی، ایران اینترنشنال، یورونیوز فارسی، ایرنا، ایسنا، BBC World/Middle East، Al Jazeera (EN/AR)، The Guardian، New York Times، Euronews، Jerusalem Post، Ynet، Maariv، Rotter، BBC Arabic، RT Arabic، Asharq Al-Awsat، Sputnik Arabic.

## نکته‌ها

- همه خبرها با فیلتر کلیدواژه‌ای (۱۶۰ عبارت در چهار زبان) فقط درباره ایران انتخاب می‌شوند.
- ترجمه با Google Translate (بدون کلید) انجام می‌شود؛ هر آیتم فقط یک‌بار ترجمه و در D1 ذخیره می‌شود.
- شاخص نزدیکی جنگ یک تخمین آماری بر پایه کلمات کلیدی است، نه پیش‌بینی.
- قیمت‌ها از منابع عمومی (gold-api.com، open.er-api.com، CNBC، Yahoo) گرفته می‌شوند.
- آیتم‌های قدیمی‌تر از ۴ روز به‌صورت خودکار پاک می‌شوند.
