#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
انتشار همین سایت روی Hugging Face Spaces (Docker SDK).

پیش‌نیاز:
    pip install -U huggingface_hub
    hf auth login            # یا: export HF_TOKEN=hf_xxx

اجرا:
    python3 deploy_space.py [--repo iran-news]
"""

import argparse
import os
import shutil
import sys
import tempfile

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SPACE_FILES = ["server.py", "translations_cache.json"]
SPACE_DIRS = ["public"]

try:
    from huggingface_hub import HfApi
except ImportError:
    sys.exit("huggingface_hub نصب نیست:  pip install -U huggingface_hub")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="iran-news")
    ap.add_argument("--private", action="store_true")
    args = ap.parse_args()

    api = HfApi()
    try:
        user = api.whoami()["name"]
    except Exception as e:
        sys.exit(f"ورود به Hugging Face انجام نشده است: {e}")

    repo_id = f"{user}/{args.repo}"
    print(f"[hf] repo: {repo_id}")

    with tempfile.TemporaryDirectory() as tmp:
        shutil.copy(os.path.join(BASE_DIR, "space", "Dockerfile"), tmp)
        shutil.copy(os.path.join(BASE_DIR, "space", "README.md"), tmp)
        for name in SPACE_FILES:
            src = os.path.join(BASE_DIR, name)
            if os.path.exists(src):
                shutil.copy(src, tmp)
        for name in SPACE_DIRS:
            shutil.copytree(os.path.join(BASE_DIR, name),
                            os.path.join(tmp, name),
                            ignore=shutil.ignore_patterns("data", "*.map"))

        api.create_repo(repo_id, repo_type="space", space_sdk="docker",
                        private=args.private, exist_ok=True)
        api.upload_folder(folder_path=tmp, repo_id=repo_id, repo_type="space",
                          commit_message="Deploy Iran News Monitor")

    print(f"✅ منتشر شد: https://huggingface.co/spaces/{repo_id}")
    print(f"   آدرس اجرا: https://{repo_id.replace('/', '-').lower()}.hf.space")


if __name__ == "__main__":
    main()
