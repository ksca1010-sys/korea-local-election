#!/usr/bin/env python3
"""Run data_health_check.py in DRY_RUN mode and verify it does not mutate data JSON."""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def snapshot_data_json() -> dict[str, str]:
    return {
        str(path.relative_to(BASE_DIR)): file_hash(path)
        for path in sorted(DATA_DIR.rglob("*.json"))
        if path.is_file()
    }


def main() -> int:
    before = snapshot_data_json()
    result = subprocess.run(
        [sys.executable, "scripts/data_health_check.py", "--dry-run"],
        cwd=BASE_DIR,
        env=os.environ,
        text=True,
        capture_output=True,
        check=False,
    )

    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)

    after = snapshot_data_json()
    changed = sorted(path for path, digest in before.items() if after.get(path) != digest)
    added = sorted(set(after) - set(before))
    removed = sorted(set(before) - set(after))

    if changed or added or removed:
        print("[data-health-dry-run] FAIL: DRY_RUN mutated data files", file=sys.stderr)
        for path in changed:
            print(f"  changed: {path}", file=sys.stderr)
        for path in added:
            print(f"  added: {path}", file=sys.stderr)
        for path in removed:
            print(f"  removed: {path}", file=sys.stderr)
        return 1

    print("[data-health-dry-run] OK: no data JSON files changed")

    if result.returncode != 0:
        return result.returncode

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
