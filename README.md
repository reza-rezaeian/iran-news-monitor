# خبر ایران | Iran News Monitor

تجمیع لحظه‌ای اخبار ایران از منابع فارسی، انگلیسی، عبری و عربی، با ترجمه خودکار عنوان‌ها، قیمت طلا/نفت و شاخص نزدیکی جنگ. رابط کاربری دوزبانه (فارسی/انگلیسی).

## معماری

```
Iranian RSS feeds (21 sources)
        │
        ▼  هر ۳۰ دقیقه در GitHub Actions
   build_static.py  ──►  news.json / prices.json  ──►  برنچ data
        │
        ▼
Cloudflare Worker  ──►  /api/news , /api/prices  (با کش لبه)
        │
        ▼
   static site (public/)  ──►  https://iran-news.<subdomain>.workers.dev
```

- **GitHub Actions**: اجرای `build_static.py` طبق زمان‌بندی `*/30 * * * *` و انتشار خروجی در برنچ `data` (تک‌کامیت، بدون رشد تاریخچه).
- **Cloudflare Worker**: سرو فایل‌های استاتیک + دو endpoint که داده را از برنچ `data` می‌خوانند و در حافظه و Cache API لبه کش می‌کنند. اگر منبع در دسترس نباشد، آخرین نسخه کش‌شده برگردانده می‌شود.
- **اجرای محلی**: `python3 server.py` (بدون نیاز به کلادفلر).

## اجرا روی کلادفلر

```bash
cd worker
npx wrangler deploy
```

Worker به‌صورت خودکار `public/` را سرو می‌کند و داده را از این آدرس می‌خواند:

```
https://raw.githubusercontent.com/reza-rezaeian/iran-news-monitor/data/news.json
```

برای تغییر آدرس، مقدار `DATA_BASE` را در `worker/wrangler.jsonc` عوض کنید.

## اجرای محلی

```bash
python3 server.py          # http://localhost:8080
```

بار اول ۲۰–۶۰ ثانیه طول می‌کشد، بعد از آن از `news_cache.json` فوری پاسخ می‌دهد.

## ساخت داده به‌صورت دستی

```bash
python3 build_static.py    # خروجی: dist/data/*.json
```

## منابع

بی‌بی‌سی فارسی، دویچه‌وله فارسی، ایران اینترنشنال، یورونیوز فارسی، ایرنا، ایسنا، BBC World/Middle East، Al Jazeera (EN/AR)، The Guardian، New York Times، Euronews، Jerusalem Post، Ynet، Maariv، Rotter، BBC Arabic، RT Arabic، Asharq Al-Awsat، Sputnik Arabic.

## نکته‌ها

- همه خبرها با فیلتر کلیدواژه‌ای سخت‌گیرانه فقط درباره ایران انتخاب می‌شوند.
- ترجمه‌ها با Google Translate (بدون کلید) انجام و در `translations_cache.json` نگهداری می‌شوند.
- شاخص نزدیکی جنگ یک تخمین آماری بر پایه کلمات کلیدی است، نه پیش‌بینی.
- قیمت‌ها از منابع عمومی (gold-api.com، open.er-api.com، CNBC، Yahoo) گرفته می‌شوند.
