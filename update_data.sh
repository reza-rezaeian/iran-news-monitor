#!/usr/bin/env bash
# ساخت داده تازه و انتشار در برنچ data (همان چیزی که GitHub Actions انجام می‌دهد)
set -euo pipefail
cd "$(dirname "$0")"

python3 build_static.py

rm -rf .publish
mkdir -p .publish
cp dist/data/*.json translations_cache.json .publish/

cd .publish
git init -q
git checkout -q -b data
git add -A
git -c user.name="Iran News Bot" -c user.email="bot@users.noreply.github.com" \
    commit -q -m "data: $(date -u +%Y-%m-%dT%H:%MZ)"
git push -q -f "https://github.com/reza-rezaeian/iran-news-monitor.git" data

echo "✅ داده‌ها منتشر شد. Worker حداکثر تا ۵ دقیقه دیگر نسخه تازه را نشان می‌دهد."
