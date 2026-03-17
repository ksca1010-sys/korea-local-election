#!/usr/bin/env python3
"""
후보자 데이터 다중 교차 검증

검증 레이어:
  1. mayor_status.json (선관위 공식) vs mayor_candidates.json
     - 당선무효/직위상실/사퇴 → 후보자 DB에서 WITHDRAWN 확인
     - 권한대행 중인데 현직으로 나오면 수정
  2. 중복 후보 검출 (같은 이름이 여러 시군구에 등록)
  3. 광역 출마자가 기초에 남아있는지 교차 확인

사용법:
  python scripts/candidate_pipeline/cross_validate.py           # 검증만
  python scripts/candidate_pipeline/cross_validate.py --fix     # 자동 수정
"""

import argparse
import json
from pathlib import Path
from datetime import date

BASE_DIR = Path(__file__).resolve().parent.parent.parent
MAYOR_STATUS = BASE_DIR / "data" / "candidates" / "mayor_status.json"
MAYOR_CANDIDATES = BASE_DIR / "data" / "candidates" / "mayor_candidates.json"
GOVERNOR_CANDIDATES = BASE_DIR / "data" / "candidates" / "governor.json"
SUPT_CANDIDATES = BASE_DIR / "data" / "candidates" / "superintendent.json"


def check_acting_consistency(fix=False):
    """1. 권한대행 vs 후보자 일관성"""
    status = json.loads(MAYOR_STATUS.read_text(encoding="utf-8"))
    mayor = json.loads(MAYOR_CANDIDATES.read_text(encoding="utf-8"))
    cands = mayor.get("candidates", {})
    issues = []

    for k, v in status.get("mayors", {}).items():
        if not v.get("acting"):
            continue
        rk = v["region"]
        dist = v["district"]
        elected_name = v.get("electedName", "")
        reason = v.get("actingReason", "")

        for c in cands.get(rk, {}).get(dist, []):
            if c["name"] == elected_name and c.get("status") not in ("WITHDRAWN",):
                issues.append({
                    "type": "acting_not_withdrawn",
                    "region": rk, "district": dist,
                    "name": elected_name, "reason": reason,
                    "current_status": c.get("status"),
                })
                if fix:
                    c["status"] = "WITHDRAWN"
                    c["_note"] = reason

    if fix and issues:
        mayor["_meta"]["lastCrossValidation"] = date.today().isoformat()
        MAYOR_CANDIDATES.write_text(
            json.dumps(mayor, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    return issues


def check_governor_overlap(fix=False):
    """2. 광역 출마자가 기초에 남아있는지"""
    gov = json.loads(GOVERNOR_CANDIDATES.read_text(encoding="utf-8"))
    mayor = json.loads(MAYOR_CANDIDATES.read_text(encoding="utf-8"))
    cands = mayor.get("candidates", {})
    issues = []

    # 광역 출마자 이름 수집 (활동 중인 사람만)
    gov_names = set()
    for rk, candidates in gov.get("candidates", {}).items():
        for c in candidates:
            if c.get("status") not in ("WITHDRAWN",):
                gov_names.add(c["name"])

    # 기초에서 같은 이름이 활동 중인지
    for rk, districts in cands.items():
        for dist, candidates in districts.items():
            for c in candidates:
                if c["name"] in gov_names and c.get("status") not in ("WITHDRAWN",):
                    issues.append({
                        "type": "governor_overlap",
                        "region": rk, "district": dist,
                        "name": c["name"],
                        "mayor_status": c.get("status"),
                    })

    return issues


def check_superintendent_overlap():
    """3. 교육감 출마자가 기초에 남아있는지"""
    supt = json.loads(SUPT_CANDIDATES.read_text(encoding="utf-8"))
    mayor = json.loads(MAYOR_CANDIDATES.read_text(encoding="utf-8"))
    cands = mayor.get("candidates", {})
    issues = []

    supt_names = set()
    for rk, candidates in supt.get("candidates", {}).items():
        for c in candidates:
            if c.get("status") not in ("WITHDRAWN",):
                supt_names.add(c["name"])

    for rk, districts in cands.items():
        for dist, candidates in districts.items():
            for c in candidates:
                if c["name"] in supt_names and c.get("status") not in ("WITHDRAWN",):
                    issues.append({
                        "type": "superintendent_overlap",
                        "region": rk, "district": dist,
                        "name": c["name"],
                    })

    return issues


def check_duplicate_names():
    """4. 같은 이름이 여러 시군구에 등록된 경우"""
    mayor = json.loads(MAYOR_CANDIDATES.read_text(encoding="utf-8"))
    cands = mayor.get("candidates", {})

    name_locations = {}
    for rk, districts in cands.items():
        for dist, candidates in districts.items():
            for c in candidates:
                if c.get("status") == "WITHDRAWN":
                    continue
                name = c["name"]
                if name not in name_locations:
                    name_locations[name] = []
                name_locations[name].append(f"{rk}/{dist}")

    issues = []
    for name, locs in name_locations.items():
        if len(locs) > 1:
            issues.append({"type": "duplicate", "name": name, "locations": locs})

    return issues


def main():
    parser = argparse.ArgumentParser(description="후보자 다중 교차 검증")
    parser.add_argument("--fix", action="store_true", help="자동 수정")
    args = parser.parse_args()

    print("=" * 55)
    print("후보자 다중 교차 검증")
    print("=" * 55)

    # 1. 권한대행 일관성
    issues1 = check_acting_consistency(fix=args.fix)
    print(f"\n[1] 권한대행 vs 후보자 불일치: {len(issues1)}건")
    for i in issues1:
        print(f"  ⚠️ {i['region']}/{i['district']}: {i['name']} ({i['current_status']}) — {i['reason']}")

    # 2. 광역 출마자 중복
    issues2 = check_governor_overlap()
    print(f"\n[2] 광역 출마자가 기초에 남아있음: {len(issues2)}건")
    for i in issues2:
        print(f"  ⚠️ {i['region']}/{i['district']}: {i['name']} (기초 {i['mayor_status']})")

    # 3. 교육감 출마자 중복
    issues3 = check_superintendent_overlap()
    print(f"\n[3] 교육감 출마자가 기초에 남아있음: {len(issues3)}건")
    for i in issues3:
        print(f"  ⚠️ {i['region']}/{i['district']}: {i['name']}")

    # 4. 중복 이름
    issues4 = check_duplicate_names()
    print(f"\n[4] 같은 이름 여러 시군구 등록: {len(issues4)}건")
    for i in issues4:
        print(f"  ⚠️ {i['name']}: {', '.join(i['locations'])}")

    total = len(issues1) + len(issues2) + len(issues3) + len(issues4)
    print(f"\n총 이슈: {total}건")
    if args.fix:
        print("(자동 수정 적용됨)")


if __name__ == "__main__":
    main()
