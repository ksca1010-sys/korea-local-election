#!/usr/bin/env python3
"""
도전자 후보 집중 발굴 스크립트
- 1명뿐인 인구 20만+ 시군구 대상
- 네이버 뉴스에서 도전자/예비후보를 검색하여 추가

사용법:
  python scripts/discover_challengers.py              # 분석만
  python scripts/discover_challengers.py --apply       # 실제 적용
  python scripts/discover_challengers.py --region=seoul # 특정 시도만
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))

from election_overview_utils import load_env, search_latest_news, REGION_NAMES

COMMON_SURNAMES = set("김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하주우구신임나탁변천민")
NOT_NAMES = {
    "야당","여당","후보","현직","구청장","군수","시장","무소속","민주당","국민의힘",
    "조국혁신당","진보당","개혁신당","서울시장","부산시장","인천시장",
    # 직위/지명 오탐 방지
    "남구청장","북구청장","동구청장","서구청장","중구청장",
    "천안시장","천구청장","정구청장","문구청장",
    "주자들","전시의원","주중","서울시장",
    # 일반 단어 오탐
    "하남시장","광주시장","대전시장","울산시장",
}

PARTY_MAP = {
    "더불어민주당": "democratic", "민주당": "democratic",
    "국민의힘": "ppp", "조국혁신당": "reform",
    "개혁신당": "newReform", "진보당": "progressive",
    "무소속": "independent",
}


def is_valid_name(name):
    if name in NOT_NAMES or len(name) < 2 or len(name) > 4:
        return False
    if not re.match(r'^[가-힣]+$', name):
        return False
    if name[0] not in COMMON_SURNAMES:
        return False
    return True


def extract_candidates_from_news(news_titles, existing_names):
    """뉴스 제목에서 후보자 추출"""
    found = []
    seen = set()

    for title in news_titles:
        # 패턴: "OOO 예비후보", "OOO 출마", "OOO 후보"
        patterns = [
            (r'([가-힣]{2,4})\s*(예비후보|예비 후보)', "DECLARED"),
            (r'([가-힣]{2,4})\s*(?:의원|전 시장|전 구청장|전 군수)\s*[,\s]?\s*(?:출마|도전)', "DECLARED"),
            (r'([가-힣]{2,4})\s*(?:출마 선언|출사표|출마를 선언)', "DECLARED"),
            (r'([가-힣]{2,4})\s*\((국민의힘|민주당|더불어민주당|무소속|조국혁신당)\)', "EXPECTED"),
            (r'([가-힣]{2,4})\s*(?:출판기념회)', "EXPECTED"),
        ]

        for pat, status in patterns:
            for m in re.finditer(pat, title):
                name = m.group(1)
                if is_valid_name(name) and name not in existing_names and name not in seen:
                    party = "independent"
                    # 정당 추출 시도
                    for pname, pkey in PARTY_MAP.items():
                        if pname in title:
                            party = pkey
                            break
                    seen.add(name)
                    found.append({
                        "name": name,
                        "status": status,
                        "party": party,
                        "source": title[:60],
                    })

    return found


def main():
    parser = argparse.ArgumentParser(description="도전자 후보 집중 발굴")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--region", type=str, help="특정 시도만")
    args = parser.parse_args()

    load_env()

    mayor = json.loads((BASE_DIR / "data/candidates/mayor_candidates.json").read_text(encoding="utf-8"))
    cands = mayor["candidates"]

    # subRegionData에서 인구 정보
    try:
        sub = json.loads((BASE_DIR / "data/static/sub_regions.json").read_text(encoding="utf-8"))
    except Exception:
        sub = {}

    # 우선 대상: 1명뿐 + 인구 20만+
    targets = []
    for rk in sorted(cands.keys()):
        if args.region and rk != args.region:
            continue
        districts = cands[rk]
        sub_list = sub.get(rk, [])
        pop_map = {s["name"]: s.get("population", 0) for s in sub_list}
        for dist, cl in sorted(districts.items()):
            active = [x for x in cl if x.get("status") != "WITHDRAWN"]
            pop = pop_map.get(dist, 0)
            if len(active) <= 1 and pop >= 200000:
                targets.append((rk, dist, pop, active))

    targets.sort(key=lambda x: -x[2])
    print(f"대상: {len(targets)}개 시군구 (1명뿐 + 인구 20만+)\n")

    total_found = 0
    total_added = 0

    for rk, dist, pop, active in targets:
        rn = REGION_NAMES.get(rk, rk)
        title = "구청장" if dist.endswith("구") else ("군수" if dist.endswith("군") else "시장")
        short_region = rn.replace("특별시","").replace("광역시","").replace("특별자치도","").replace("특별자치시","").replace("도","")
        existing_names = {c["name"] for c in active}

        # 집중 뉴스 검색
        queries = [
            f'"{short_region}" "{dist}" {title} 출마 예비후보',
            f'"{dist}" {title} 선거 후보 공천',
            f'"{dist}" {title} 출마 선언 도전',
        ]

        all_news = []
        seen_titles = set()
        for q in queries:
            for item in search_latest_news(q, display=5):
                if item not in seen_titles:
                    seen_titles.add(item)
                    all_news.append(item)

        # 뉴스에서 후보 추출
        found = extract_candidates_from_news(all_news, existing_names)

        if found:
            print(f"[{rk}/{dist}] 인구 {pop:,} — 뉴스 {len(all_news)}건 → {len(found)}명 발견")
            for f in found:
                print(f"  + {f['name']} ({f['status']}, {f['party']}) ← {f['source']}")
                total_found += 1

                if args.apply:
                    cands[rk][dist].append({
                        "name": f["name"],
                        "party": f["party"],
                        "career": "",
                        "status": f["status"],
                        "dataSource": "news_discovery",
                        "pledges": [],
                    })
                    total_added += 1

        time.sleep(0.3)

    print(f"\n발견: {total_found}명")
    if args.apply and total_added > 0:
        mayor["_meta"]["lastUpdated"] = date.today().isoformat()
        mayor["_meta"]["lastDiscovery"] = date.today().isoformat()
        (BASE_DIR / "data/candidates/mayor_candidates.json").write_text(
            json.dumps(mayor, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"적용: {total_added}명 → mayor_candidates.json")
    elif not args.apply and total_found > 0:
        print("(--apply로 실제 적용)")


if __name__ == "__main__":
    main()
