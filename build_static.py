#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ساخت داده‌های استاتیک برای انتشار روی Cloudflare Workers / GitHub Actions

خروجی:
    dist/data/news.json     → همان ساختار /api/news
    dist/data/prices.json   → همان ساختار /api/prices
    translations_cache.json → کش ترجمه (باید بین اجراها نگه داشته شود)

اجرا:
    python3 build_static.py
"""

import json
import os
import sys
import time

import server

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, "dist", "data")
PREV_NEWS = os.path.join(DIST_DIR, "news.json")

MIN_ITEMS = 25


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def previous_count():
    try:
        with open(PREV_NEWS, encoding="utf-8") as f:
            return int(json.load(f).get("count", 0))
    except Exception:
        return 0


def main():
    started = time.time()
    server.load_cache()

    print("[build] collecting feeds...")
    try:
        news = server.build_news()
    except Exception as e:
        print("[build] news failed:", e)
        return 1

    server.save_cache()

    count = int(news.get("count", 0))
    print(f"[build] {count} Iran items from "
          f"{len({i['source'] for i in news.get('items', [])})} sources "
          f"in {time.time() - started:.1f}s")

    if count < MIN_ITEMS:
        old = previous_count()
        print(f"[build] too few items ({count} < {MIN_ITEMS}); "
              f"keeping previous data ({old} items)")
        return 1 if old < MIN_ITEMS else 0

    write_json(os.path.join(DIST_DIR, "news.json"), news)

    print("[build] prices...")
    try:
        prices = server.get_prices()
    except Exception as e:
        print("[build] prices failed:", e)
        prices = {"updated": news["updated"]}
    write_json(os.path.join(DIST_DIR, "prices.json"), prices)

    print(f"[build] done in {time.time() - started:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
