#!/usr/bin/env python3
"""Validate candidate status JSON shape and freshness for CI workflows."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


KST = timezone(timedelta(hours=9))


def parse_date(value: str, label: str):
    if not value:
        raise ValueError(f"missing {label}")
    try:
        return datetime.fromisoformat(value[:10]).date()
    except ValueError as exc:
        raise ValueError(f"invalid {label}: {value}") from exc


def parse_datetime_date(value: str, label: str):
    if not value:
        raise ValueError(f"missing {label}")
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized).date()
    except ValueError:
        return parse_date(value, label)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_path")
    parser.add_argument("collection_key")
    parser.add_argument("min_count", type=int)
    parser.add_argument("--max-age-days", type=int, default=9)
    parser.add_argument("--warn-only", action="store_true")
    args = parser.parse_args()

    path = Path(args.json_path)
    data = json.loads(path.read_text(encoding="utf-8"))
    collection = data.get(args.collection_key)
    meta = data.get("_meta", {})
    today = datetime.now(KST).date()
    failures: list[str] = []

    if not isinstance(collection, dict) or len(collection) < args.min_count:
        failures.append(f"{path} must contain at least {args.min_count} {args.collection_key}")

    for key, parser_func in (
        ("lastUpdated", parse_date),
        ("lastFactCheck", parse_datetime_date),
    ):
        value = meta.get(key)
        try:
            checked_date = parser_func(value, f"_meta.{key}")
            age = (today - checked_date).days
            if age > args.max_age_days:
                failures.append(f"{path} _meta.{key} is {age} days old (max {args.max_age_days})")
        except ValueError as exc:
            failures.append(str(exc))

    if failures:
        for failure in failures:
            print(f"[status-freshness] {failure}", file=sys.stderr)
        return 0 if args.warn_only else 1

    print(
        f"[status-freshness] OK {path}: {len(collection)} records, "
        f"lastUpdated={meta.get('lastUpdated')}, lastFactCheck={meta.get('lastFactCheck')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
