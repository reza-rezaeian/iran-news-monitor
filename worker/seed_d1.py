#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""تولید فایل SQL برای پر کردن اولیه D1 از dist/data/*.json"""

import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWS = os.path.join(BASE, "dist", "data", "news.json")
PRICES = os.path.join(BASE, "dist", "data", "prices.json")
OUT = os.path.join(BASE, "worker", "seed.sql")

HIGH_WAR = ["جنگ", "حمله", "موشک", "بمباران", "هجوم", "قصف", "حرب", "اشغال",
            "war", "attack", "missile", "airstrike", "bombing", "invasion",
            "מלחמה", "תקיפה", "טילים", "פיגוע"]
MED_WAR = ["تهدید", "نظامی", "تنش", "تحریم", "پهپاد", "هسته‌ای", "غنی‌سازی",
           "threat", "military", "tension", "sanction", "drone", "nuclear",
           "enrichment", "איום", "צבא", "מתיחות", "סנקציות", "גרעין",
           "تهديد", "عسكري", "توتر", "عقوبات", "نووي"]


def item_id(title):
    norm = "".join(ch for ch in title.lower() if ch.isalnum())[:90]
    h = 5381
    for ch in norm:
        h = ((h * 33) ^ ord(ch)) & 0xFFFFFFFF
    return f"{h:x}"


def q(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def main():
    news = json.load(open(NEWS, encoding="utf-8"))
    prices = json.load(open(PRICES, encoding="utf-8"))

    lines = [
        "DELETE FROM items;",
        "DELETE FROM snapshots;",
    ]

    for it in news["items"]:
        text = (it.get("title", "") + " " + it.get("title_fa", "") + " " +
                it.get("description", "")).lower()
        high = 1 if any(k.lower() in text for k in HIGH_WAR) else 0
        med = 0 if high else (1 if any(k.lower() in text for k in MED_WAR) else 0)

        lines.append(
            "INSERT OR IGNORE INTO items "
            "(id,title,title_fa,title_en,link,source,source_en,lang,flag,published,high,medium) "
            f"VALUES ({q(item_id(it['title']))},{q(it['title'])},{q(it.get('title_fa'))},"
            f"{q(it.get('title_en'))},{q(it.get('link'))},{q(it.get('source'))},"
            f"{q(it.get('source_en'))},{q(it.get('lang'))},{q(it.get('flag'))},"
            f"{q(it.get('published'))},{high},{med});"
        )

    body = json.dumps(news, ensure_ascii=False)
    # D1 یک سقف طول statement دارد؛ اگر بدنه بزرگ بود، assemble آن را می‌سازد
    if len(body) < 90000:
        lines.append(
            "INSERT OR REPLACE INTO snapshots (key,body,updated,count) VALUES "
            f"('news',{q(body)},{q(news['updated'])},{int(news['count'])});"
        )
    else:
        print(f"skip news snapshot ({len(body)} bytes) — assemble will create it")

    pbody = json.dumps(prices, ensure_ascii=False)
    lines.append(
        "INSERT OR REPLACE INTO snapshots (key,body,updated,count) VALUES "
        f"('prices',{q(pbody)},{q(prices.get('updated'))},0);"
    )

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"{len(news['items'])} items -> {OUT} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
