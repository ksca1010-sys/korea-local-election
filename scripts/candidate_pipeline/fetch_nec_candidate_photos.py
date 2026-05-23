#!/usr/bin/env python3
"""Fetch official candidate photo URLs from NEC candidate detail pages.

This script only uses NEC identifiers already present in candidate JSON files:
sgId + huboid. It stores the discovered NEC CDN thumbnail URL and the candidate
detail page URL, leaving candidates without a published NEC photo unchanged.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests


BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data" / "candidates"
DETAIL_URL_TEMPLATE = "https://info.nec.go.kr/electioninfo/candidate_detail_info.xhtml?electionId=00{sg_id}&huboId={huboid}"
PHOTO_SOURCE_LABEL = "중앙선거관리위원회 선거통계시스템 후보자 사진"
USER_AGENT = "Mozilla/5.0 (compatible; korea-local-election-photo-sync/1.0)"


def today_kst() -> str:
    return datetime.now().astimezone().strftime("%Y-%m-%d")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def iter_candidate_files() -> list[Path]:
    files = [
        DATA_DIR / "governor.json",
        DATA_DIR / "superintendent.json",
        DATA_DIR / "mayor_candidates.json",
        DATA_DIR / "byelection.json",
        DATA_DIR / "proportional.json",
    ]
    files.extend(sorted((DATA_DIR / "council").glob("*.json")))
    files.extend(sorted((DATA_DIR / "local_council").glob("*.json")))
    return [path for path in files if path.exists()]


def iter_candidates(node: Any, path: Path):
    if isinstance(node, dict):
        if node.get("huboid") and node.get("sgId") and node.get("name"):
            yield node, path
        for value in node.values():
            yield from iter_candidates(value, path)
    elif isinstance(node, list):
        for value in node:
            yield from iter_candidates(value, path)


def normalize_photo_url(src: str, detail_url: str) -> str:
    url = urljoin(detail_url, src.strip())
    if url.startswith("http://cdn.nec.go.kr/"):
        url = "https://" + url[len("http://"):]
    return url


def extract_photo_url(html: str, detail_url: str) -> str | None:
    for img_tag in re.findall(r"<img\b[^>]*>", html, flags=re.IGNORECASE):
        if "후보자 사진" not in img_tag and "photo_" not in img_tag and "thumbnail" not in img_tag:
            continue
        src_match = re.search(r"\bsrc\s*=\s*['\"]([^'\"]+)['\"]", img_tag, flags=re.IGNORECASE)
        if not src_match:
            continue
        src = src_match.group(1)
        if "error_h1" in src:
            continue
        return normalize_photo_url(src, detail_url)
    return None


def verify_image(session: requests.Session, photo_url: str) -> bool:
    try:
        response = session.get(photo_url, timeout=12, stream=True)
        content_type = response.headers.get("content-type", "")
        ok = response.ok and content_type.startswith("image/")
        response.close()
        return ok
    except requests.RequestException:
        return False


def fetch_photo(task: dict[str, str]) -> dict[str, str | bool]:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Referer": "https://info.nec.go.kr/"})
    detail_url = DETAIL_URL_TEMPLATE.format(sg_id=task["sgId"], huboid=task["huboid"])
    try:
        response = session.get(detail_url, timeout=15)
        if not response.ok:
            return {**task, "ok": False, "reason": f"detail_http_{response.status_code}", "detailUrl": detail_url}
        photo_url = extract_photo_url(response.text, detail_url)
        if not photo_url:
            return {**task, "ok": False, "reason": "photo_not_found", "detailUrl": detail_url}
        if not verify_image(session, photo_url):
            return {**task, "ok": False, "reason": "photo_verify_failed", "detailUrl": detail_url, "photoUrl": photo_url}
        return {**task, "ok": True, "detailUrl": detail_url, "photoUrl": photo_url}
    except requests.RequestException as exc:
        return {**task, "ok": False, "reason": exc.__class__.__name__, "detailUrl": detail_url}


def build_tasks(file_data: dict[Path, Any], force: bool) -> tuple[list[dict[str, str]], dict[tuple[str, str], list[dict[str, Any]]]]:
    tasks: list[dict[str, str]] = []
    refs: dict[tuple[str, str], list[dict[str, Any]]] = {}
    seen: set[tuple[str, str]] = set()

    for path, data in file_data.items():
        for candidate, _ in iter_candidates(data, path):
            sg_id = str(candidate.get("sgId") or "").strip()
            huboid = str(candidate.get("huboid") or "").strip()
            if not sg_id or not huboid:
                continue
            refs.setdefault((sg_id, huboid), []).append(candidate)
            if not force and candidate.get("photoUrl"):
                continue
            key = (sg_id, huboid)
            if key in seen:
                continue
            seen.add(key)
            tasks.append({
                "sgId": sg_id,
                "huboid": huboid,
                "name": str(candidate.get("name") or ""),
            })
    return tasks, refs


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch NEC official candidate photo URLs.")
    parser.add_argument("--apply", action="store_true", help="write photo fields to candidate JSON files")
    parser.add_argument("--force", action="store_true", help="refresh candidates that already have photoUrl")
    parser.add_argument("--limit", type=int, default=0, help="limit candidates fetched for smoke tests")
    parser.add_argument("--workers", type=int, default=6, help="parallel fetch workers")
    parser.add_argument("--sleep", type=float, default=0.0, help="sleep between result handling, useful for throttling")
    args = parser.parse_args()

    files = iter_candidate_files()
    file_data = {path: load_json(path) for path in files}
    tasks, refs = build_tasks(file_data, args.force)
    if args.limit:
        tasks = tasks[: args.limit]

    print(f"candidate files={len(files)} fetch_tasks={len(tasks)} apply={args.apply}")
    if not tasks:
        return 0

    updated = 0
    missing = 0
    failed = 0
    fetched_at = today_kst()

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = [executor.submit(fetch_photo, task) for task in tasks]
        for index, future in enumerate(as_completed(futures), start=1):
            result = future.result()
            if args.sleep:
                time.sleep(args.sleep)
            if result.get("ok") and result.get("photoUrl"):
                key = (str(result["sgId"]), str(result["huboid"]))
                for candidate in refs.get(key, []):
                    candidate["photoUrl"] = result["photoUrl"]
                    candidate["photoSourceUrl"] = result["detailUrl"]
                    candidate["photoSourceLabel"] = PHOTO_SOURCE_LABEL
                    candidate["photoFetchedAt"] = fetched_at
                updated += len(refs.get(key, []))
            elif result.get("reason") == "photo_not_found":
                missing += 1
            else:
                failed += 1

            if index % 100 == 0 or index == len(tasks):
                print(f"progress {index}/{len(tasks)} updated_refs={updated} missing={missing} failed={failed}")

    if args.apply:
        for path, data in file_data.items():
            write_json(path, data)
        print(f"wrote {len(file_data)} files")
    else:
        print("dry-run only; pass --apply to write JSON")
    print(f"summary updated_refs={updated} missing={missing} failed={failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
