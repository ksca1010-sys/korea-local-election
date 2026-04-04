#!/usr/bin/env python3
"""
merge_gwangju_jeonnam.py — 전남광주통합특별시 후보 데이터 병합 보정

전남광주통합특별시에서 선거 유형별 병합 정책이 다르다:

- 교육감(superintendent): 광주+전남 통합 단일 교육감 선거 → jeonnam을 gwangju로 병합
- 광역단체장(governor): 광주시장·전남도지사가 별도 선거 → 병합하지 않음 (jeonnam 독립 유지)

자동 업데이트 파이프라인(factcheck, nec_precand_sync 등)이 jeonnam 키에
새 후보를 삽입할 수 있으므로, 이 스크립트를 파이프라인 후반부에 실행하여
superintendent의 jeonnam → gwangju 병합 상태를 복원한다.

멱등성: 이미 병합 완료 상태이면 아무것도 변경하지 않는다.
종료코드: 항상 0 (파이프라인 중단 방지).
"""

import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent
DATA = BASE / "data" / "candidates"

JEONNAM_REDIRECT_GOVERNOR = []
JEONNAM_REDIRECT_SUPERINTENDENT = []


def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def is_redirect(entries: list) -> bool:
    """jeonnam이 이미 병합 완료 상태인지 확인 (빈 배열 또는 구 _merged 플레이스홀더)."""
    if not entries:
        return True  # 빈 배열 = 이미 병합 완료
    if len(entries) == 1 and "_merged" in entries[0]:
        return True  # 구 플레이스홀더 형식 (하위 호환)
    return False


def deduplicate_by_name(existing: list, incoming: list) -> list:
    """이름 기준 중복 제거. 필드가 더 많은 쪽을 유지."""
    by_name: dict[str, dict] = {}
    for c in existing:
        name = c.get("name")
        if name:
            by_name[name] = c

    for c in incoming:
        name = c.get("name")
        if not name:
            continue
        if name in by_name:
            # 필드 수가 더 많은 쪽 유지
            if len(c) > len(by_name[name]):
                c["_mergedFrom"] = "jeonnam"
                by_name[name] = c
        else:
            c["_mergedFrom"] = "jeonnam"
            by_name[name] = c

    # 기존 순서 유지, 신규는 뒤에 추가
    seen = set()
    result = []
    for c in existing:
        name = c.get("name")
        if name and name in by_name:
            result.append(by_name[name])
            seen.add(name)
        else:
            result.append(c)

    for name, c in by_name.items():
        if name not in seen:
            result.append(c)

    return result


def renumber_ids(candidates: list, region: str) -> list:
    """gwangju-1, gwangju-2, ... 순서로 ID 재부여."""
    for i, c in enumerate(candidates, 1):
        if "id" in c:
            c["id"] = f"{region}-{i}"
    return candidates


def merge_candidate_file(path: Path, redirect_template: list) -> str | None:
    """
    후보 JSON 파일의 jeonnam 후보를 gwangju로 병합.
    변경이 있으면 요약 문자열 반환, 없으면 None.
    """
    if not path.exists():
        return None

    data = load_json(path)
    candidates = data.get("candidates", {})

    jeonnam = candidates.get("jeonnam", [])
    if is_redirect(jeonnam):
        return None  # 이미 병합 완료

    # jeonnam에 실제 후보가 있음 → gwangju로 이동
    gwangju = candidates.get("gwangju", [])
    moved_count = len(jeonnam)

    merged = deduplicate_by_name(gwangju, jeonnam)
    merged = renumber_ids(merged, "gwangju")

    candidates["gwangju"] = merged
    candidates["jeonnam"] = redirect_template

    data["candidates"] = candidates
    save_json(path, data)

    return f"moved {moved_count} candidates from jeonnam to gwangju (result: {len(merged)})"


def merge_status_file(path: Path) -> str | None:
    """
    status JSON 파일의 jeonnam에 _merged 필드가 없으면 추가.
    변경이 있으면 요약 문자열, 없으면 None.
    """
    if not path.exists():
        return None

    data = load_json(path)

    # status 파일 구조: 최상위 키가 지역명 (dict of dict)
    # 또는 candidates 키 아래에 있을 수 있음
    # 실제 구조 확인: governor_status.json은 최상위 dict
    jeonnam = data.get("jeonnam")
    if jeonnam is None:
        return None

    if isinstance(jeonnam, dict) and jeonnam.get("_merged") == "gwangju":
        return None  # 이미 설정됨

    if isinstance(jeonnam, dict):
        if "_merged" not in jeonnam:
            jeonnam["_merged"] = "gwangju"
            data["jeonnam"] = jeonnam
            save_json(path, data)
            return "added _merged field to jeonnam"

    return None


def main():
    summary = []

    # 1. superintendent.json
    result = merge_candidate_file(
        DATA / "superintendent.json",
        JEONNAM_REDIRECT_SUPERINTENDENT,
    )
    if result:
        summary.append(f"superintendent: {result}")

    # 2. governor.json — 광주시장·전남도지사는 별도 선거이므로 병합하지 않음

    # 3. superintendent_status.json
    result = merge_status_file(DATA / "superintendent_status.json")
    if result:
        summary.append(f"superintendent_status: {result}")

    # 4. governor_status.json
    result = merge_status_file(DATA / "governor_status.json")
    if result:
        summary.append(f"governor_status: {result}")

    # Summary
    if summary:
        print("[merge_gwangju_jeonnam] Changes:")
        for line in summary:
            print(f"  - {line}")
    else:
        print("[merge_gwangju_jeonnam] No changes needed — already merged.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[merge_gwangju_jeonnam] ERROR: {e}", file=sys.stderr)
        # 파이프라인 중단 방지: 항상 exit 0
    sys.exit(0)
