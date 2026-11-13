#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سرور خبر ایران (دوزبانه)
- جمع‌آوری RSS از منابع فارسی/انگلیسی/عبری/عربی
- فیلتر خبرهای مرتبط با ایران
- ترجمه خودکار عناوین به فارسی و انگلیسی (Google Translate + کش)
- قیمت طلا (دلار) و نفت، شاخص نزدیکی جنگ
- سرو کردن فایل‌های استاتیک
اجرا:  python3 server.py
"""

import os
import re
import json
import time
import html
import shutil
import socket
import subprocess
import threading
import urllib.parse
import urllib.request
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor, as_completed
import xml.etree.ElementTree as ET

# ترجیح IPv4 برای جلوگیری از تایم‌اوت هندشیک TLS روی بعضی شبکه‌ها
_orig_gai = socket.getaddrinfo


def _gai(host, port, family=0, type=0, proto=0, flags=0):
    if family in (0, socket.AF_UNSPEC):
        family = socket.AF_INET
    return _orig_gai(host, port, family, type, proto, flags)


socket.getaddrinfo = _gai

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE = os.path.join(BASE_DIR, "translations_cache.json")
NEWS_FILE = os.path.join(BASE_DIR, "news_cache.json")
PORT = int(os.environ.get("PORT", "8080"))

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
_CURL = shutil.which("curl")

# ----------------------------- منابع خبری -----------------------------
FEEDS = [
    # فارسی — رسانه‌های ایران‌محور
    {"name": "بی‌بی‌سی فارسی", "name_en": "BBC Persian", "url": "http://feeds.bbci.co.uk/persian/rss.xml", "lang": "fa", "flag": "🇬🇧", "iran": False},
    {"name": "دویچه‌وله فارسی", "name_en": "DW Persian", "url": "https://rss.dw.com/xml/rss-per-all", "lang": "fa", "flag": "🇩🇪", "iran": False},
    {"name": "ایران اینترنشنال", "name_en": "Iran International", "url": "https://www.iranintl.com/feed", "lang": "fa", "flag": "🇮🇷", "iran": True},
    {"name": "یورونیوز فارسی", "name_en": "Euronews Persian", "url": "https://parsi.euronews.com/rss", "lang": "fa", "flag": "🇪🇺", "iran": False},
    {"name": "ایرنا", "name_en": "IRNA", "url": "https://www.irna.ir/rss", "lang": "fa", "flag": "🇮🇷", "iran": True},
    {"name": "ایسنا", "name_en": "ISNA", "url": "https://www.isna.ir/rss", "lang": "fa", "flag": "🇮🇷", "iran": True},
    # انگلیسی
    {"name": "BBC World", "name_en": "BBC World", "url": "https://feeds.bbci.co.uk/news/world/rss.xml", "lang": "en", "flag": "🇬🇧", "iran": False},
    {"name": "BBC Middle East", "name_en": "BBC Middle East", "url": "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", "lang": "en", "flag": "🇬🇧", "iran": False},
    {"name": "Al Jazeera English", "name_en": "Al Jazeera English", "url": "https://www.aljazeera.com/xml/rss/all.xml", "lang": "en", "flag": "🇶🇦", "iran": False},
    {"name": "The Guardian", "name_en": "The Guardian", "url": "https://www.theguardian.com/world/rss", "lang": "en", "flag": "🇬🇧", "iran": False},
    {"name": "New York Times", "name_en": "New York Times", "url": "https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml", "lang": "en", "flag": "🇺🇸", "iran": False},
    {"name": "Euronews", "name_en": "Euronews", "url": "https://www.euronews.com/rss?level=theme&name=news", "lang": "en", "flag": "🇪🇺", "iran": False},
    {"name": "Jerusalem Post", "name_en": "Jerusalem Post", "url": "https://www.jpost.com/rss/rssfeedsfrontpage.aspx", "lang": "en", "flag": "🇮🇱", "iran": False},
    # عبری
    {"name": "Ynet", "name_en": "Ynet", "url": "https://www.ynet.co.il/Integration/StoryRss1854.xml", "lang": "he", "flag": "🇮🇱", "iran": False},
    {"name": "Maariv", "name_en": "Maariv", "url": "https://www.maariv.co.il/Rss/RssFeedsChadashot", "lang": "he", "flag": "🇮🇱", "iran": False},
    {"name": "Rotter", "name_en": "Rotter", "url": "https://rotter.net/rss/rotternews.xml", "lang": "he", "flag": "🇮🇱", "iran": False},
    # عربی
    {"name": "الجزیره", "name_en": "Al Jazeera Arabic", "url": "https://www.aljazeera.net/aljazeerarss/aba1290c-f2d2-4bb6-8cc4-6b6c0d1c2cbf", "lang": "ar", "flag": "🇶🇦", "iran": False},
    {"name": "BBC عربی", "name_en": "BBC Arabic", "url": "https://feeds.bbci.co.uk/arabic/rss.xml", "lang": "ar", "flag": "🇬🇧", "iran": False},
    {"name": "RT عربی", "name_en": "RT Arabic", "url": "https://arabic.rt.com/rss/", "lang": "ar", "flag": "🇷🇺", "iran": False},
    {"name": "الشرق الأوسط", "name_en": "Asharq Al-Awsat", "url": "https://aawsat.com/feed", "lang": "ar", "flag": "🇸🇦", "iran": False},
    {"name": "سبوتنيك عربی", "name_en": "Sputnik Arabic", "url": "https://arabic.sputniknews.com/export/rss2/archive/index.xml", "lang": "ar", "flag": "🇷🇺", "iran": False},
]

# ----------------------------- کلمات کلیدی -----------------------------
IRAN_TERMS = [
    "ایران", "ایرانی", "تهران", "سپاه", "پاسداران", "بسیج", "خامنه", "خمینی",
    "رئیسی", "پزشکیان", "قالیباف", "احمدی‌نژاد", "ظریف", "عراقچی", "برجام",
    "ریال", "تومان", "هسته‌ای ایران", "غنی‌سازی", "سازمان انرژی اتمی",
    "بانک مرکزی", "مجلس شورای اسلامی", "شورای نگهبان", "قوه قضائیه",
    "نیروی انتظامی", "ارتش ایران", "وزارت خارجه", "خلیج فارس", "تنگه هرمز",
    "نفت ایران", "آبادان", "اهواز", "اصفهان", "مشهد", "شیراز", "تبریز",
    "کرمانشاه", "اردبیل", "بندرعباس", "قم", "کرج", "رشت", "یزد", "کرمان",
    "همدان", "زاهدان", "بوشهر", "ساری", "ارومیه", "سنندج", "گرگان", "قزوین",
    "اراک", "بجنورد", "بیرجند", "ایلام", "شهرکرد", "سمنان", "زنجان", "بابل",
    "آمل", "رفسنجان", "خرمشهر", "ماهشهر", "عسلویه", "کیش", "قشم", "چابهار",
    "انزلی", "مراغه", "خوی", "سیستان", "بلوچستان", "مازندران", "گیلان",
    "خوزستان", "گلستان", "نطنز", "فردو", "بوشهر", "پارچین", "دامغان", "iran",
    "iranian", "tehran", "teheran", "irgc", "khamenei", "khomeini", "pezeshkian",
    "raisi", "rouhani", "zarif", "araghchi", "islamic republic", "persian gulf",
    "strait of hormuz", "jcpoa", "iran nuclear", "iranian oil", "mahsa amini",
    "morality police", "revolutionary guard", "ayatollah", "quds force", "basij",
    "natanz", "fordow", "Isfahan", "tabriz", "mashhad", "shiraz", "ahvaz",
    "abadan", "kermanshah", "hormuz", "khuzestan", "baluchistan", "caspian",
    "arak", "bushehr", "إيران", "إيراني", "طهران", "الحرس الثوري", "خامنئي",
    "بزشكيان", "عراقجي", "الخليج الفارسي", "مضيق هرمز", "الاتفاق النووي",
    "تخصيب اليورانيوم", "أصفهان", "تبريز", "مشهد", "شيراز", "الأهواز", "عبادان",
    "كرمانشاه", "هرمز", "نطنز", "فردو", "איראן", "איראני", "טהרן", "חמינאי",
    "משמרות המהפכה", "פזשכיאן", "ראיסי", "זריף", "המפרץ הפרסי", "מצר הורמוז",
    "הגרעין האיראני", "איספהאן", "טהראן", "ח'וזיסטן", "נתנז", "פורדו",
]

HIGH_WAR = ["جنگ", "حمله", "موشک", "بمباران", "هجوم", "قصف", "حرب", "اشغال",
            "war", "attack", "missile", "airstrike", "bombing", "invasion",
            "מלחמה", "תקיפה", "טילים", "פיגוע"]
MED_WAR = ["تهدید", "نظامی", "تنش", "تحریم", "پهپاد", "هسته‌ای", "غنی‌سازی",
           "threat", "military", "tension", "sanction", "drone", "nuclear",
           "enrichment", "איום", "צבא", "מתיחות", "סנקציות", "גרעין",
           "تهديد", "عسكري", "توتر", "عقوبات", "نووي"]


def _term_pattern(term):
    """مرز واژه برای عبارت‌های کوتاه تا «قم» با «برقم» تطبیق نکند."""
    t = term.lower()
    e = re.escape(t)
    if re.fullmatch(r"[a-z0-9 .'-]+", t) and len(t) <= 4:
        return rf"\b{e}\b"
    if len(t) <= 2:
        return rf"(?<!\w){e}(?!\w)"
    return e


IRAN_RE = re.compile("|".join(_term_pattern(t) for t in IRAN_TERMS), re.I)
HIGH_RE = re.compile("|".join(_term_pattern(t) for t in HIGH_WAR), re.I)
MED_RE = re.compile("|".join(_term_pattern(t) for t in MED_WAR), re.I)

# ----------------------------- ترجمه -----------------------------
_trans_lock = threading.Lock()
_trans_cache = {}

GOOGLE_TR = "https://clients5.google.com/translate_a/t"


def load_cache():
    global _trans_cache
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            _trans_cache = json.load(f)
    except Exception:
        _trans_cache = {}


def save_cache():
    try:
        tmp = CACHE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_trans_cache, f, ensure_ascii=False)
        os.replace(tmp, CACHE_FILE)
    except Exception as e:
        print("[cache] save failed:", e)


def http_get(url, timeout=15, headers=None, retries=2):
    """دریافت ساده GET با curl (پایدارتر) و fallback به urllib."""
    global _CURL
    if _CURL:
        for i in range(retries):
            try:
                res = subprocess.run(
                    [_CURL, "-sL", "--compressed", "--max-time", str(timeout),
                     "-A", UA, url],
                    capture_output=True, timeout=timeout + 5,
                )
                if res.returncode == 0 and res.stdout:
                    return res.stdout
                if res.returncode not in (0, 28, 6, 7):
                    break
            except Exception:
                pass
            if i < retries - 1:
                time.sleep(0.4 * (i + 1))

    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers or {"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            last = e
            if i < retries - 1:
                time.sleep(0.5 * (i + 1))
    raise last


def translate_items(items, src, target, field):
    """ترجمه دسته‌ای عناوین به زبان هدف با Google Translate و کش."""
    if not items or src == target:
        return

    missing = []
    for it in items:
        text = (it.get("title") or "").strip()
        if not text:
            it[field] = it.get("title", "")
            continue
        key = f"{src}:{target}:{text}"
        with _trans_lock:
            cached = _trans_cache.get(key)
        if cached:
            it[field] = cached
        else:
            missing.append(it)

    i = 0
    while i < len(missing):
        chunk, size = [], 0
        while i < len(missing) and len(chunk) < 12 and size < 1400:
            text = (missing[i].get("title") or "")[:300]
            chunk.append((missing[i], text))
            size += len(text) + 4
            i += 1

        params = [("client", "dict-chrome-ex"), ("sl", src), ("tl", target)]
        params += [("q", t) for _, t in chunk]

        try:
            url = GOOGLE_TR + "?" + urllib.parse.urlencode(params)
            data = json.loads(http_get(url, timeout=12, retries=2)
                              .decode("utf-8", "replace"))
            if isinstance(data, str):
                data = [data]
            if not isinstance(data, list):
                raise ValueError("unexpected translation payload")

            for (it, text), out in zip(chunk, data):
                out = html.unescape(str(out)).strip()
                if out:
                    it[field] = out
                    with _trans_lock:
                        _trans_cache[f"{src}:{target}:{text}"] = out
                else:
                    it[field] = it.get("title", "")
        except Exception as e:
            print(f"[translate:{src}->{target}] {e}")
            for it, _ in chunk:
                it.setdefault(field, it.get("title", ""))
        time.sleep(0.1)


# ----------------------------- RSS -----------------------------
def _local(tag):
    return tag.split("}")[-1].lower()


def _child_text(el, names):
    for c in el:
        if _local(c.tag) in names:
            return (c.text or "").strip()
    return ""


def _child_link(el):
    for c in el:
        if _local(c.tag) == "link":
            href = c.get("href")
            if href:
                return href
            if c.text:
                return c.text.strip()
    return ""


def _strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def _parse_date(s):
    if not s:
        return None
    try:
        dt = parsedate_to_datetime(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ",
                "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            continue
    return None


def parse_feed(content, feed):
    try:
        root = ET.fromstring(content)
    except Exception:
        return []

    items = []
    for el in root.iter():
        if _local(el.tag) not in ("item", "entry"):
            continue

        title = _strip_html(_child_text(el, {"title"}))
        link = _child_link(el)
        desc = _strip_html(_child_text(el, {"description", "summary", "content"}))
        date_s = _child_text(el, {"pubdate", "published", "updated", "date"})
        dt = _parse_date(date_s)

        if not title:
            continue

        items.append({
            "title": title,
            "link": link or "#",
            "description": desc[:280],
            "published": (dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                          if dt else None),
            "_ts": dt.timestamp() if dt else 0,
            "source": feed["name"],
            "source_en": feed.get("name_en", feed["name"]),
            "lang": feed["lang"],
            "flag": feed.get("flag", "🌐"),
            "feed_iran": feed.get("iran", False),
        })
    return items


def is_iran_related(text):
    return bool(IRAN_RE.search(text))


def compute_war_index(items):
    def scrub(it):
        return (it["title"] + " " + it.get("title_fa", "") + " " +
                it.get("description", "")).lower()

    iran_items = [it for it in items if it.get("iran")]
    scope = iran_items if len(iran_items) >= 5 else items

    high = med = 0
    for it in scope:
        text = scrub(it)
        if HIGH_RE.search(text):
            high += 1
        elif MED_RE.search(text):
            med += 1

    total = max(len(scope), 1)
    score = (high * 3.0 + med * 1.0) / total * 30.0
    score = int(max(0, min(100, round(score))))

    if score < 20:
        label_fa, label_en, color = "کم", "Low", "#2e7d32"
    elif score < 40:
        label_fa, label_en, color = "نسبتاً کم", "Fairly low", "#689f38"
    elif score < 60:
        label_fa, label_en, color = "متوسط", "Moderate", "#f9a825"
    elif score < 80:
        label_fa, label_en, color = "بالا", "High", "#ef6c00"
    else:
        label_fa, label_en, color = "بسیار بالا", "Very high", "#c62828"

    return {"score": score, "label": label_fa, "label_fa": label_fa,
            "label_en": label_en, "color": color,
            "high": high, "medium": med, "total": len(scope),
            "scope": "iran"}


# ----------------------------- کش خبرها -----------------------------
_news_lock = threading.Lock()
_news_cache = {"ts": 0, "data": None}
NEWS_TTL = 1800  # ۳۰ دقیقه


def build_news(force_translate_limit=160):
    collected = []

    def worker(feed):
        try:
            raw = http_get(feed["url"], timeout=12, retries=2)
            return parse_feed(raw, feed)
        except Exception as e:
            print(f"[feed] {feed['name']}: {e}")
            return []

    executor = ThreadPoolExecutor(max_workers=10)
    futures = [executor.submit(worker, f) for f in FEEDS]
    try:
        for fut in as_completed(futures, timeout=50):
            try:
                collected.extend(fut.result())
            except Exception as e:
                print("[feed-future]", e)
    except Exception as e:
        print("[feeds] timeout:", e)
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    # حذف تکراری‌ها
    seen, unique = set(), []
    for it in collected:
        key = re.sub(r"\W+", "", it["title"].lower())[:80] or it["link"]
        if key in seen:
            continue
        seen.add(key)
        unique.append(it)

    # فقط اخبار مرتبط با ایران
    iran_items = []
    for it in unique:
        it.pop("feed_iran", None)
        related = is_iran_related(it["title"] + " " + it.get("description", ""))
        if related:
            it["iran"] = True
            it["sensitive"] = bool(HIGH_RE.search(it["title"] + " " + it.get("description", "")))
            iran_items.append(it)
    unique = iran_items
    unique.sort(key=lambda x: x["_ts"], reverse=True)
    unique = unique[:force_translate_limit]

    # ترجمه به دو زبان
    for it in unique:
        if it["lang"] == "fa":
            it["title_fa"] = it["title"]
        if it["lang"] == "en":
            it["title_en"] = it["title"]

    tasks = []
    for target, field in (("fa", "title_fa"), ("en", "title_en")):
        for lang in ("fa", "en", "he", "ar"):
            if lang == target:
                continue
            group = [it for it in unique if it["lang"] == lang]
            if group:
                tasks.append((group, lang, target, field))

    if tasks:
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda t: translate_items(*t), tasks))

    for it in unique:
        it.pop("_ts", None)
        it.setdefault("title_fa", it["title"])
        it.setdefault("title_en", it["title"])

    war = compute_war_index(unique)

    return {
        "updated": datetime.now(timezone.utc).isoformat(),
        "count": len(unique),
        "items": unique,
        "war": war,
        "sources": [
            {"name": f["name"], "name_en": f.get("name_en", f["name"]),
             "lang": f["lang"], "flag": f["flag"]}
            for f in FEEDS
        ],
    }


_news_refreshing = False


def _write_news_cache(data):
    try:
        tmp = NEWS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"ts": time.time(), "data": data}, f, ensure_ascii=False)
        os.replace(tmp, NEWS_FILE)
    except Exception as e:
        print("[news-cache] write failed:", e)


def load_news_cache():
    try:
        with open(NEWS_FILE, "r", encoding="utf-8") as f:
            obj = json.load(f)
        if obj.get("data"):
            _news_cache["data"] = obj["data"]
            _news_cache["ts"] = float(obj.get("ts", 0))
            print("[news-cache] loaded", len(obj["data"].get("items", [])), "items")
    except Exception:
        pass


def _rebuild_news():
    global _news_refreshing
    try:
        data = build_news()
        save_cache()
        _write_news_cache(data)
        with _news_lock:
            _news_cache["data"] = data
            _news_cache["ts"] = time.time()
    except Exception as e:
        print("[news-refresh]", e)
    finally:
        with _news_lock:
            _news_refreshing = False


def get_news(force=False):
    global _news_refreshing
    with _news_lock:
        now = time.time()
        data = _news_cache["data"]
        ts = _news_cache["ts"]
        fresh = bool(data) and now - ts < NEWS_TTL
        if not force and fresh:
            return data, ts
        if not force and data and not _news_refreshing:
            # نمایش فوری داده قبلی و به‌روزرسانی در پس‌زمینه
            _news_refreshing = True
            threading.Thread(target=_rebuild_news, daemon=True).start()
            return data, ts
    # بارگذاری اول یا درخواست صریح به‌روزرسانی
    _rebuild_news()
    with _news_lock:
        return _news_cache["data"], _news_cache["ts"]


# ----------------------------- قیمت‌ها -----------------------------
_prices_lock = threading.Lock()
_prices_cache = {"ts": 0, "data": None}
PRICES_TTL = 60


def fetch_json(url, timeout=12, retries=3):
    last = None
    for i in range(retries):
        try:
            return json.loads(http_get(url, timeout=timeout).decode("utf-8", "replace"))
        except Exception as e:
            last = e
            if i < retries - 1:
                time.sleep(0.6 * (i + 1))
    raise last


def yahoo_price(symbol):
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{urllib.parse.quote(symbol)}?interval=1d&range=1d")
    d = fetch_json(url, timeout=12)
    meta = d["chart"]["result"][0]["meta"]
    return {
        "price": meta.get("regularMarketPrice"),
        "change": meta.get("regularMarketChangePercent"),
        "symbol": symbol,
    }


def cnbc_price(symbol):
    """قیمت کالا از CNBC؛ نمادها: @CL.1 نفت WTI و @LCO.1 برنت."""
    url = ("https://quote.cnbc.com/quote-html-webservice/restQuote/"
           "symbolType/symbol?symbols=" + urllib.parse.quote(symbol, safe="") +
           "&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1"
           "&output=json&events=1")
    d = fetch_json(url, timeout=12)
    q = d["FormattedQuoteResult"]["FormattedQuote"][0]
    pct = (q.get("change_pct") or "").replace("%", "").strip()
    try:
        pct = float(pct)
    except Exception:
        pct = None
    return {
        "price": float(q.get("last")),
        "change": pct,
        "symbol": symbol,
        "name": q.get("name"),
    }


def get_prices():
    with _prices_lock:
        if _prices_cache["data"] and time.time() - _prices_cache["ts"] < PRICES_TTL:
            return _prices_cache["data"]

    out = {"updated": datetime.now(timezone.utc).isoformat()}

    # طلا: دلار بر اونس + گرم ۱۸ عیار به تومان
    try:
        g = fetch_json("https://api.gold-api.com/price/XAU")
        usd_oz = float(g["price"])
        out["gold_usd_oz"] = round(usd_oz, 2)
        try:
            fx = fetch_json("https://open.er-api.com/v6/latest/USD")
            irr_per_usd = float(fx["rates"]["IRR"])
            usd_toman = irr_per_usd / 10.0
            gram24_usd = usd_oz / 31.1034768
            out["gold_18k_toman"] = round(gram24_usd * 0.75 * usd_toman)
            out["gold_18k_usd"] = round(gram24_usd * 0.75, 2)
            out["usd_toman"] = round(usd_toman)
        except Exception as e:
            print("[gold-fx]", e)
    except Exception as e:
        print("[gold]", e)

    # نفت: WTI و برنت (CNBC با جایگزین Yahoo)
    for key, cnbc_sym, y_sym in (("oil_wti", "@CL.1", "CL=F"),
                                 ("oil_brent", "@LCO.1", "BZ=F")):
        ok = False
        try:
            out[key] = cnbc_price(cnbc_sym)
            ok = True
        except Exception as e:
            print(f"[{key}-cnbc]", e)
        if not ok:
            try:
                out[key] = yahoo_price(y_sym)
            except Exception as e:
                print(f"[{key}-yahoo]", e)

    with _prices_lock:
        _prices_cache["data"] = out
        _prices_cache["ts"] = time.time()
    return out


# ----------------------------- HTTP -----------------------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=os.path.join(BASE_DIR, "public"), **kw)

    def log_message(self, fmt, *args):
        pass  # لاگ ساکت

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        if path == "/api/news":
            try:
                force = qs.get("refresh", ["0"])[0] == "1"
                data, ts = get_news(force=force)
                data = dict(data)
                data["cached_at"] = datetime.fromtimestamp(ts, timezone.utc).isoformat()
                self._json(data)
            except Exception as e:
                self._json({"error": str(e)}, 500)
            return

        if path == "/api/prices":
            try:
                self._json(get_prices())
            except Exception as e:
                self._json({"error": str(e)}, 500)
            return

        if path == "/api/health":
            self._json({"ok": True})
            return

        return super().do_GET()

    def end_headers(self):
        if self.path.startswith("/api/"):
            self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


def main():
    load_cache()
    load_news_cache()
    print(f"خبر ایران روی http://localhost:{PORT} اجرا شد")
    print(f"تعداد منابع: {len(FEEDS)}")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nخداحافظ")


if __name__ == "__main__":
    main()
