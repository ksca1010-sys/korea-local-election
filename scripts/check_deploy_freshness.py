#!/usr/bin/env python3
"""Block deploys that would publish data older than origin/main.

Manual Pages deploys use the local working tree. If this checkout is behind
GitHub Actions commits, a deploy can overwrite the live site with stale JSON.
This guard compares freshness markers in high-impact data files before deploy.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

WATCHED_FILES = [
    ("data/static/gallup_national_poll.json", "publishDate"),
    ("data/candidates/governor.json", "_meta.lastOfficialSync"),
    ("data/candidates/superintendent.json", "_meta.lastOfficialSync"),
    ("data/candidates/mayor_candidates.json", "_meta.lastOfficialSync"),
    ("data/election_stats.json", "_meta.lastUpdated"),
    ("data/candidates/governor_status.json", "_meta.lastFactCheck"),
    ("data/candidates/mayor_status.json", "_meta.lastFactCheck"),
    ("data/candidates/superintendent_status.json", "_meta.lastFactCheck"),
    ("data/election_overview.json", "meta.lastUpdated"),
    ("data/polls/polls.json", "generated"),
    ("data/candidates/proportional.json", "_meta.lastUpdated"),
]


def run_git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def fetch_origin() -> bool:
    if os.environ.get("SKIP_DEPLOY_FRESHNESS_FETCH"):
        return True
    result = run_git("fetch", "--quiet", "origin", "main")
    if result.returncode != 0:
        print(
            "[deploy-freshness] origin/main fetch failed; "
            "set SKIP_DEPLOY_FRESHNESS=1 only for an emergency deploy.",
            file=sys.stderr,
        )
        print(result.stderr.strip(), file=sys.stderr)
        return False
    return True


def read_local(path: str) -> dict:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def read_origin(path: str) -> dict | None:
    result = run_git("show", f"origin/main:{path}")
    if result.returncode != 0:
        return None
    return json.loads(result.stdout)


def get_nested(data: dict, dotted_path: str):
    cur = data
    for part in dotted_path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def normalize_date(value) -> str:
    if not value:
        return ""
    text = str(value).strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).isoformat()
    except ValueError:
        return text[:10]


def main() -> int:
    if os.environ.get("SKIP_DEPLOY_FRESHNESS"):
        print("[deploy-freshness] skipped by SKIP_DEPLOY_FRESHNESS")
        return 0

    if not fetch_origin():
        return 1

    failures: list[str] = []
    for path, marker in WATCHED_FILES:
        local_path = ROOT / path
        if not local_path.exists():
            failures.append(f"{path}: local file missing")
            continue
        origin_data = read_origin(path)
        if origin_data is None:
            continue

        local_value = normalize_date(get_nested(read_local(path), marker))
        origin_value = normalize_date(get_nested(origin_data, marker))
        if not origin_value:
            continue
        if not local_value:
            failures.append(
                f"{path}: missing freshness marker {marker} "
                f"(local={local_value or '-'}, origin={origin_value or '-'})"
            )
            continue
        if local_value < origin_value:
            failures.append(
                f"{path}: local {marker}={local_value} is older than "
                f"origin/main {origin_value}"
            )

    if failures:
        print("[deploy-freshness] stale deploy blocked", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        print(
            "Pull/rebase the newer automation data before deploying, or set "
            "SKIP_DEPLOY_FRESHNESS=1 only after confirming this is intentional.",
            file=sys.stderr,
        )
        return 1

    print("[deploy-freshness] OK: local high-impact data is not older than origin/main")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
