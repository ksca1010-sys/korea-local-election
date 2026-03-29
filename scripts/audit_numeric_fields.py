#!/usr/bin/env python3
"""
pollSource 없는 부동소수점 퍼센트 값 감지

polls.json의 모든 results를 순회하면서:
- support 필드가 부동소수점(float)인데
- 해당 poll에 sourceUrl 또는 nttId(NESDC 등록번호)가 없으면
exit code 1을 반환한다.

용도: pre-deploy 훅에서 검증되지 않은 수치가 배포되는 것을 방지
"""

import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
POLLS_PATH = BASE / "data" / "polls" / "polls.json"


def check_polls():
    """pollSource(sourceUrl 또는 nttId) 없는 support 값 탐지.

    Returns:
        list[dict]: 위반 항목 리스트
    """
    if not POLLS_PATH.exists():
        print("[audit] polls.json 없음 — 건너뜀")
        return []

    data = json.loads(POLLS_PATH.read_text(encoding="utf-8"))
    regions = data.get("regions", {})
    violations = []

    for region_key, poll_list in regions.items():
        for poll in poll_list:
            ntt_id = poll.get("nttId")
            source_url = poll.get("sourceUrl", "")
            has_source = bool(ntt_id) or bool(source_url)

            for result in poll.get("results", []):
                support = result.get("support")
                if support is None:
                    continue
                # 부동소수점 퍼센트 값인데 소스가 없는 경우
                if isinstance(support, float) and not has_source:
                    violations.append({
                        "region": region_key,
                        "candidate": result.get("candidateName", "?"),
                        "support": support,
                        "poll_title": poll.get("title", "?"),
                    })

    return violations


def check_candidates():
    """candidates/*.json 내 support 필드가 pollSource 없이 존재하는지 탐지."""
    candidates_dir = BASE / "data" / "candidates"
    if not candidates_dir.exists():
        return []

    violations = []
    for json_file in candidates_dir.glob("*.json"):
        data = json.loads(json_file.read_text(encoding="utf-8"))
        # candidates JSON 구조: 지역별 candidates 배열
        if isinstance(data, dict):
            for region_key, region_data in data.items():
                if region_key.startswith("_"):
                    continue
                candidates = []
                if isinstance(region_data, list):
                    candidates = region_data
                elif isinstance(region_data, dict):
                    candidates = region_data.get("candidates", [])

                for c in candidates:
                    if not isinstance(c, dict):
                        continue
                    support = c.get("support")
                    poll_source = c.get("pollSource")
                    if support is not None and isinstance(support, (int, float)) and not poll_source:
                        violations.append({
                            "file": json_file.name,
                            "region": region_key,
                            "candidate": c.get("name", c.get("candidateName", "?")),
                            "support": support,
                        })

    return violations


def main():
    poll_violations = check_polls()
    candidate_violations = check_candidates()

    total = len(poll_violations) + len(candidate_violations)

    if poll_violations:
        print(f"\n[audit] polls.json: pollSource 없는 support 값 {len(poll_violations)}건")
        for v in poll_violations[:10]:
            print(f"  - {v['region']} / {v['candidate']}: {v['support']}%")
        if len(poll_violations) > 10:
            print(f"  ... 외 {len(poll_violations) - 10}건")

    if candidate_violations:
        print(f"\n[audit] candidates: pollSource 없는 support 값 {len(candidate_violations)}건")
        for v in candidate_violations[:10]:
            print(f"  - {v['file']} / {v['region']} / {v['candidate']}: {v['support']}%")
        if len(candidate_violations) > 10:
            print(f"  ... 외 {len(candidate_violations) - 10}건")

    if total == 0:
        print("[audit] OK — pollSource 없는 수치 없음")
        sys.exit(0)
    else:
        print(f"\n[audit] FAIL — 총 {total}건의 미검증 수치 발견")
        sys.exit(1)


if __name__ == "__main__":
    main()
