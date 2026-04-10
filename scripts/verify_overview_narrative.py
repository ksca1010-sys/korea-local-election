#!/usr/bin/env python3
"""overview_narrative 잔여 레코드를 NEC 예비후보 API 와 교차검증.

흐름:
  1) data/candidates/mayor_candidates.json 에서 dataSource==overview_narrative
     인 레코드 전수 추출
  2) NEC 구시군장 예비후보 API (sg_typecode='4') 호출
  3) 이름 + 지역(regionKey + districtName) 매칭
     - "verified": NEC 에 존재 → dataSource 를 nec_verified 로 승격
     - "not_found": NEC 에 없음 → 제거 후보
  4) 기본 dry-run. --apply 시 실제 mayor_candidates.json 수정.

헌법 §2 준수: NEC 공식 API 로 검증된 것만 DB 에 남김.

사용법:
  python scripts/verify_overview_narrative.py            # dry-run 리포트
  python scripts/verify_overview_narrative.py --apply    # 실제 수정
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MAYOR_PATH = BASE_DIR / "data" / "candidates" / "mayor_candidates.json"
ENV_FILE = BASE_DIR / ".env"

sys.path.insert(0, str(BASE_DIR / "scripts" / "candidate_pipeline"))
from nec_precand_sync import fetch_precandidates, SIDO_MAP, _normalize_party  # noqa: E402


def load_env() -> None:
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def _strip_suffix(name: str) -> str:
    """시/군/구 접미사를 떼고 매칭용 키로 변환."""
    for suf in ("특별시", "광역시", "특별자치시", "특별자치도", "시", "군", "구"):
        if name.endswith(suf):
            return name[: -len(suf)]
    return name


def build_nec_index(nec_items: list[dict]) -> dict[tuple[str, str], dict]:
    """(regionKey, district_stripped) → {name: nec_item} 맵."""
    index: dict[tuple[str, str], dict] = {}
    for item in nec_items:
        sido = item.get("sdName", "")
        rk = SIDO_MAP.get(sido)
        wiw = item.get("wiwName", "")
        name = (item.get("name") or "").strip()
        if not rk or not wiw or not name:
            continue
        key = (rk, _strip_suffix(wiw))
        bucket = index.setdefault(key, {})
        bucket[name] = item
    return index


def lookup_nec(nec_index: dict, region: str, district: str, name: str) -> dict | None:
    stripped = _strip_suffix(district)
    bucket = nec_index.get((region, stripped), {})
    return bucket.get(name)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="검증 결과를 실제로 mayor_candidates.json 에 반영")
    args = parser.parse_args()

    load_env()
    if not os.environ.get("NEC_API_KEY"):
        print("[오류] NEC_API_KEY 미설정 (.env 또는 환경변수 필요)")
        return 1

    data = json.loads(MAYOR_PATH.read_text(encoding="utf-8"))
    cands = data.get("candidates", {})

    # 1) overview_narrative 레코드 추출
    targets: list[tuple[str, str, int, dict]] = []
    for region, districts in cands.items():
        for district, entries in districts.items():
            for idx, e in enumerate(entries):
                if e.get("dataSource") == "overview_narrative":
                    targets.append((region, district, idx, e))

    print(f"=== overview_narrative 레코드: {len(targets)}건 ===")
    if not targets:
        print("(없음)")
        return 0

    # 2) NEC 예비후보 조회
    print("\n[NEC] 구시군장 예비후보 API 조회...")
    nec_items = fetch_precandidates("4")
    if not nec_items:
        print("[오류] NEC 응답 비어있음 — 검증 불가")
        return 1

    nec_index = build_nec_index(nec_items)
    print(f"  NEC index: {len(nec_index)}개 시군구 그룹")

    # 3) 매칭
    # 분류:
    #   verified  — NEC 예비후보 API 에 존재 → nec_verified 로 승격
    #   incumbent — NEC 에 없지만 career 에 "현 " 이 들어간 현직자 → incumbent 로 승격
    #   remove    — NEC 에도 없고 현직자도 아닌 레코드 → 제거
    verified: list[tuple[str, str, int, dict, dict]] = []
    incumbent: list[tuple[str, str, int, dict]] = []
    remove: list[tuple[str, str, int, dict]] = []

    def _looks_like_incumbent(entry: dict) -> bool:
        career = (entry.get("career") or "").strip()
        return career.startswith("현 ") or career.startswith("현재 ")

    for region, district, idx, e in targets:
        name = e.get("name", "")
        hit = lookup_nec(nec_index, region, district, name)
        if hit:
            verified.append((region, district, idx, e, hit))
        elif _looks_like_incumbent(e):
            incumbent.append((region, district, idx, e))
        else:
            remove.append((region, district, idx, e))

    # 4) 리포트
    print(f"\n=== 결과 ===")
    print(f"  ✅ verified (NEC 확인): {len(verified)}건")
    for region, district, _, e, hit in verified:
        career = (hit.get("career1") or "").replace("\n", " ")[:50]
        party = hit.get("jdName", "")
        print(f"    • {region}/{district}/{e['name']}  [{party}] {career}")

    print(f"\n  🟡 incumbent (현직자 추정, 보존): {len(incumbent)}건")
    for region, district, _, e in incumbent:
        career_old = (e.get("career") or "")[:40]
        print(f"    • {region}/{district}/{e['name']}  (career: {career_old!r})")

    print(f"\n  ❌ remove (NEC 에도 없고 현직도 아님): {len(remove)}건")
    for region, district, _, e in remove:
        career_old = (e.get("career") or "")[:40]
        print(f"    • {region}/{district}/{e['name']}  (기존 career: {career_old!r})")

    # 5) 적용
    if not args.apply:
        print("\n(dry-run. --apply 로 실제 반영)")
        return 0

    print("\n[적용] 변경사항 반영 중...")
    applied_verified = 0
    applied_incumbent = 0
    applied_removed = 0

    # 제거는 뒤에서부터 처리 (인덱스 무효화 방지)
    from collections import defaultdict
    to_remove_by_dist: dict[tuple[str, str], list[int]] = defaultdict(list)
    for region, district, idx, _ in remove:
        to_remove_by_dist[(region, district)].append(idx)

    for (region, district), idxs in to_remove_by_dist.items():
        entries = cands[region][district]
        for idx in sorted(idxs, reverse=True):
            removed_entry = entries.pop(idx)
            applied_removed += 1
            print(f"  🗑  {region}/{district}/{removed_entry.get('name')}")

    # verified 승격 — 제거로 인해 인덱스가 틀어질 수 있으니 이름으로 재매칭
    for region, district, _, entry, hit in verified:
        entries = cands[region][district]
        target = next((x for x in entries if x.get("name") == entry.get("name")
                       and x.get("dataSource") == "overview_narrative"), None)
        if target is None:
            continue
        target["dataSource"] = "nec_verified"
        new_career = (hit.get("career1") or "").strip()
        if new_career and not (target.get("career") or "").strip():
            target["career"] = new_career
        new_party = _normalize_party(hit.get("jdName", ""))
        if target.get("party") == "independent" and new_party != "independent":
            target["party"] = new_party
        applied_verified += 1
        print(f"  ✅ {region}/{district}/{target['name']} → nec_verified")

    # incumbent 승격
    for region, district, _, entry in incumbent:
        entries = cands[region][district]
        target = next((x for x in entries if x.get("name") == entry.get("name")
                       and x.get("dataSource") == "overview_narrative"), None)
        if target is None:
            continue
        target["dataSource"] = "incumbent"
        applied_incumbent += 1
        print(f"  🟡 {region}/{district}/{target['name']} → incumbent")

    meta = data.setdefault("_meta", {})
    meta["lastOverviewNarrativeVerification"] = date.today().isoformat()
    meta["lastOverviewNarrativeVerificationNote"] = (
        f"verified {applied_verified} → nec_verified, "
        f"{applied_incumbent} → incumbent, {applied_removed} removed"
    )
    meta["lastUpdated"] = date.today().isoformat()

    MAYOR_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"\n총 nec_verified {applied_verified}건, "
          f"incumbent {applied_incumbent}건, 제거 {applied_removed}건")
    print(f"[저장] {MAYOR_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
