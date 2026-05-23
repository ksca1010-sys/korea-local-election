#!/usr/bin/env python3
"""Audit source provenance for official candidate records."""

from __future__ import annotations

import json
import sys
from pathlib import Path


BASE = Path(__file__).resolve().parent.parent


SPECS = [
    {
        "name": "governor",
        "path": BASE / "data" / "candidates" / "governor.json",
        "official_mode": "replace_registered_candidates",
        "sg_types": {"3"},
    },
    {
        "name": "superintendent",
        "path": BASE / "data" / "candidates" / "superintendent.json",
        "official_mode": "replace_registered_candidates",
        "sg_types": {"11"},
    },
    {
        "name": "mayor",
        "path": BASE / "data" / "candidates" / "mayor_candidates.json",
        "official_mode": "replace_registered_candidates",
        "sg_types": {"4"},
    },
    {
        "name": "byelection",
        "path": BASE / "data" / "candidates" / "byelection.json",
        "official_mode": "replace_registered_candidates",
        "sg_types": {"2"},
    },
    {
        "name": "proportional",
        "path": BASE / "data" / "candidates" / "proportional.json",
        "official_mode": "replace_registered_proportional_candidates",
        "sg_types": {"8", "9"},
    },
    {
        "name": "council",
        "path": BASE / "data" / "candidates" / "council",
        "kind": "district_council",
        "official_mode": "replace_registered_candidates",
        "placeholder_modes": {"merged_into_gwangju"},
        "sg_types": {"5"},
    },
    {
        "name": "local_council",
        "path": BASE / "data" / "candidates" / "local_council",
        "kind": "district_council",
        "official_mode": "replace_registered_candidates",
        "sg_types": {"6"},
    },
]


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def iter_candidates(kind: str, data: dict):
    if kind == "district_council":
        for district_name, candidates in data.get("candidates", {}).items():
            for index, candidate in enumerate(candidates or []):
                yield f"{district_name}[{index}]", candidate
        return

    if kind in {"governor", "superintendent"}:
        for region_key, candidates in data.get("candidates", {}).items():
            for index, candidate in enumerate(candidates or []):
                yield f"{region_key}[{index}]", candidate
        return

    if kind == "mayor":
        for region_key, districts in data.get("candidates", {}).items():
            for district_name, candidates in (districts or {}).items():
                for index, candidate in enumerate(candidates or []):
                    yield f"{region_key}/{district_name}[{index}]", candidate
        return

    if kind == "byelection":
        for district_key, district in data.get("districts", {}).items():
            for index, candidate in enumerate(district.get("candidates", []) or []):
                yield f"{district_key}[{index}]", candidate
        return

    if kind == "proportional":
        for region_key, region in data.get("council_proportional", {}).items():
            for party in region.get("parties", []) or []:
                party_name = party.get("partyName") or party.get("party") or "unknown-party"
                for index, candidate in enumerate(party.get("candidates", []) or []):
                    yield f"council/{region_key}/{party_name}[{index}]", candidate

        for region_key, region in data.get("local_council_proportional", {}).items():
            for sigungu_name, sigungu in (region.get("sigungus", {}) or {}).items():
                for party in sigungu.get("parties", []) or []:
                    party_name = party.get("partyName") or party.get("party") or "unknown-party"
                    for index, candidate in enumerate(party.get("candidates", []) or []):
                        yield f"local/{region_key}/{sigungu_name}/{party_name}[{index}]", candidate


def expected_candidate_count(meta: dict) -> int | None:
    for key in ("officialCandidateCount", "totalCandidates"):
        if isinstance(meta.get(key), int):
            return meta[key]
    return None


def audit_data(spec: dict, data: dict, label_prefix: str) -> tuple[int, list[str]]:
    meta = data.get("_meta", {})
    errors: list[str] = []
    count = 0
    kind = spec.get("kind", spec["name"])
    mode = meta.get("officialSyncMode")

    if mode in spec.get("placeholder_modes", set()):
        if not (meta.get("officialSourceUrl") or meta.get("sourceUrl")):
            errors.append(f"{label_prefix}: missing official source URL in metadata")
        candidates = list(iter_candidates(kind, data))
        if candidates:
            errors.append(f"{label_prefix}: placeholder file contains candidate records")
        return 0, errors

    if mode != spec["official_mode"]:
        errors.append(
            f"{label_prefix}: officialSyncMode={mode!r}"
        )

    if not (meta.get("officialSourceUrl") or meta.get("sourceUrl")):
        errors.append(f"{label_prefix}: missing official source URL in metadata")

    for location, candidate in iter_candidates(kind, data):
        count += 1
        label = f"{label_prefix}:{location}:{candidate.get('name', '?')}"

        if not candidate.get("name"):
            errors.append(f"{label}: missing name")
        if candidate.get("status") != "NOMINATED":
            errors.append(f"{label}: status={candidate.get('status')!r}")
        if candidate.get("officialStatus") != "등록":
            errors.append(f"{label}: officialStatus={candidate.get('officialStatus')!r}")
        if candidate.get("dataSource") != "nec_official":
            errors.append(f"{label}: dataSource={candidate.get('dataSource')!r}")
        if not str(candidate.get("huboid") or "").strip():
            errors.append(f"{label}: missing NEC huboid")
        if not (candidate.get("sourceUrl") or candidate.get("officialUrl")):
            errors.append(f"{label}: missing sourceUrl/officialUrl")
        if str(candidate.get("sgTypecode", "")) not in spec["sg_types"]:
            errors.append(f"{label}: sgTypecode={candidate.get('sgTypecode')!r}")

    if count == 0:
        errors.append(f"{label_prefix}: no candidate records found")

    official_count = expected_candidate_count(meta)
    if isinstance(official_count, int) and official_count != count:
        errors.append(f"{label_prefix}: candidate count {count} != metadata {official_count}")

    return count, errors


def audit_spec(spec: dict) -> tuple[int, list[str]]:
    path = spec["path"]
    if path.is_dir():
        total = 0
        errors: list[str] = []
        files = sorted(path.glob("*.json"))
        if not files:
            return 0, [f"{spec['name']}: no JSON files found"]
        for file_path in files:
            count, file_errors = audit_data(
                spec,
                load_json(file_path),
                f"{spec['name']}:{file_path.stem}",
            )
            total += count
            errors.extend(file_errors)
        return total, errors

    return audit_data(spec, load_json(path), spec["name"])


def main() -> int:
    total = 0
    errors: list[str] = []

    for spec in SPECS:
        count, spec_errors = audit_spec(spec)
        total += count
        errors.extend(spec_errors)
        print(f"[candidate-source-audit] {spec['name']}: {count} records")

    if errors:
        print(f"\n[candidate-source-audit] FAIL: {len(errors)} provenance issue(s)")
        for error in errors[:30]:
            print(f"  - {error}")
        if len(errors) > 30:
            print(f"  ... {len(errors) - 30} more")
        return 1

    print(f"\n[candidate-source-audit] OK: {total} official candidate records")
    return 0


if __name__ == "__main__":
    sys.exit(main())
