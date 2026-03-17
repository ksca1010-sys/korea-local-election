#!/usr/bin/env python3
"""
후보자 현황 확인 스크립트
사용법: python scripts/check_candidates.py
"""

import json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent


def main():
    print("=== 후보자 수집 현황 ===\n")

    # ① 광역단체장
    gov = json.loads((BASE / "data/candidates/governor.json").read_text(encoding="utf-8"))
    active = sum(1 for v in gov["candidates"].values() for c in v if c.get("status") != "WITHDRAWN")
    withdrawn = sum(1 for v in gov["candidates"].values() for c in v if c.get("status") == "WITHDRAWN")
    print(f"① 광역단체장: {active}명 활동 / {withdrawn}명 사퇴")
    print(f"   업데이트: {gov.get('_meta', {}).get('lastUpdated', '?')}")
    print()

    # ② 교육감
    supt = json.loads((BASE / "data/candidates/superintendent.json").read_text(encoding="utf-8"))
    total = sum(len(v) for v in supt["candidates"].values())
    print(f"② 교육감: {total}명")
    print(f"   업데이트: {supt.get('_meta', {}).get('lastUpdated', '?')}")
    print()

    # ③ 기초단체장
    mayor = json.loads((BASE / "data/candidates/mayor_candidates.json").read_text(encoding="utf-8"))
    total_c = sum(len(c) for v in mayor["candidates"].values() for c in v.values())
    active_c = sum(1 for v in mayor["candidates"].values() for c in v.values() for x in c if x.get("status") != "WITHDRAWN")
    multi = sum(1 for v in mayor["candidates"].values() for c in v.values() if len([x for x in c if x.get("status") != "WITHDRAWN"]) >= 2)
    single = 226 - multi
    print(f"③ 기초단체장: {active_c}명 활동 / {total_c}명 전체")
    print(f"   2명+ 시군구: {multi}/226 ({multi/226*100:.0f}%)")
    print(f"   1명만: {single}/226 ({single/226*100:.0f}%)")
    print(f"   업데이트: {mayor.get('_meta', {}).get('lastUpdated', '?')}")
    print()

    # ④ 재보궐
    bye = json.loads((BASE / "data/candidates/byelection.json").read_text(encoding="utf-8"))
    total_b = sum(len(d.get("candidates", [])) for d in bye.get("districts", {}).values())
    print(f"④ 재보궐: {total_b}명 / {len(bye.get('districts', {}))}개 지역구")
    print()

    # 시도별 기초단체장 상세
    print("=== 기초단체장 시도별 ===")
    cands = mayor["candidates"]

    # subRegionData에서 인구 정보
    try:
        sub = json.loads((BASE / "data/static/sub_regions.json").read_text(encoding="utf-8"))
    except Exception:
        sub = {}

    for rk in sorted(cands.keys()):
        districts = cands[rk]
        total_d = len(districts)
        multi_d = sum(1 for c in districts.values() if len([x for x in c if x.get("status") != "WITHDRAWN"]) >= 2)
        print(f"  {rk}: {total_d}개 시군구, 2명+ {multi_d}개 ({multi_d/max(total_d,1)*100:.0f}%)")

    # 1명뿐인 인구 20만+ 시군구
    print("\n=== 우선 수집 대상 (1명뿐 + 인구 20만+) ===")
    priority = []
    for rk in sorted(cands.keys()):
        districts = cands[rk]
        sub_list = sub.get(rk, [])
        pop_map = {s["name"]: s.get("population", 0) for s in sub_list}
        for dist, cl in sorted(districts.items()):
            active_count = len([x for x in cl if x.get("status") != "WITHDRAWN"])
            pop = pop_map.get(dist, 0)
            if active_count <= 1 and pop >= 200000:
                incumbent = next((x["name"] for x in cl if x.get("status") != "WITHDRAWN"), "?")
                priority.append((rk, dist, pop, incumbent))

    priority.sort(key=lambda x: -x[2])
    for rk, dist, pop, inc in priority:
        print(f"  {rk}/{dist}: 인구 {pop:,} — 현직 {inc}만 있음")
    print(f"\n총 {len(priority)}개 시군구 우선 수집 필요")


if __name__ == "__main__":
    main()
