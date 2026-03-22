#!/usr/bin/env python3
"""
광역의원 + 기초의원 후보자 일괄 수집 (선관위 API)

후보자 등록 기간(5/14~15) 이후 실행하여 공식 후보자 데이터를 수집합니다.
선관위 공공데이터포털 API에서 후보자 정보를 가져와
data/candidates/council/*.json 및 data/candidates/local_council/*.json에 저장합니다.

사용법:
  # 전체 수집 (광역 + 기초)
  python scripts/candidate_pipeline/fetch_council_candidates_nec.py

  # 광역의원만
  python scripts/candidate_pipeline/fetch_council_candidates_nec.py --type council

  # 기초의원만
  python scripts/candidate_pipeline/fetch_council_candidates_nec.py --type localCouncil

  # 특정 시도만
  python scripts/candidate_pipeline/fetch_council_candidates_nec.py --region jeju

  # 미리보기
  python scripts/candidate_pipeline/fetch_council_candidates_nec.py --dry-run

환경변수:
  NEC_API_KEY: 공공데이터포털 인증키 (필수)

선관위 API:
  - 후보자정보 조회: CandInfoInqireService2/getCandInfoInqire
  - sgId: 20260603 (9대 지선)
  - sgTypecode: 4(시도의원), 6(구시군의원)
"""

import json
import os
import sys
import time
import argparse
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"

# 선관위 API
NEC_API_BASE = "http://apis.data.go.kr/9760000"
CAND_SERVICE = f"{NEC_API_BASE}/CandInfoInqireService2"

# 제9회 전국동시지방선거
SG_ID = "20260603"

# sgTypecode: 4=시도의원, 6=구시군의원
SG_TYPECODE = {
    "council": "4",
    "localCouncil": "6",
}

REGION_MAP = {
    "서울특별시": "seoul", "부산광역시": "busan", "대구광역시": "daegu",
    "인천광역시": "incheon", "광주광역시": "gwangju", "대전광역시": "daejeon",
    "울산광역시": "ulsan", "세종특별자치시": "sejong", "경기도": "gyeonggi",
    "강원특별자치도": "gangwon", "강원도": "gangwon",
    "충청북도": "chungbuk", "충청남도": "chungnam",
    "전북특별자치도": "jeonbuk", "전라북도": "jeonbuk",
    "전라남도": "jeonnam", "경상북도": "gyeongbuk",
    "경상남도": "gyeongnam", "제주특별자치도": "jeju",
}

REGION_NAMES = {
    "seoul": "서울특별시", "busan": "부산광역시", "daegu": "대구광역시",
    "incheon": "인천광역시", "gwangju": "광주광역시", "daejeon": "대전광역시",
    "ulsan": "울산광역시", "sejong": "세종특별자치시", "gyeonggi": "경기도",
    "gangwon": "강원특별자치도", "chungbuk": "충청북도", "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도", "jeonnam": "전라남도", "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도", "jeju": "제주특별자치도",
}

PARTY_MAP = {
    "더불어민주당": "democratic", "국민의힘": "ppp",
    "무소속": "independent", "진보당": "progressive",
    "정의당": "justice", "조국혁신당": "reform",
    "개혁신당": "newReform", "새로운미래": "newFuture",
    "기본소득당": "basicIncome",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def fetch_candidates(api_key, election_type, sd_name=None):
    """선관위 API에서 후보자 전체 조회 (페이지네이션)"""
    typecode = SG_TYPECODE[election_type]
    all_items = []

    for page in range(1, 100):
        params = {
            "sgId": SG_ID,
            "sgTypecode": typecode,
            "numOfRows": "100",
            "pageNo": str(page),
            "resultType": "xml",
        }
        if sd_name:
            params["sdName"] = sd_name

        qs = urllib.parse.urlencode(params)
        url = f"{CAND_SERVICE}/getCandInfoInqire?serviceKey={urllib.parse.quote(api_key, safe='')}&{qs}"

        try:
            resp = urllib.request.urlopen(url, timeout=30)
            body = resp.read().decode("utf-8")
            root = ET.fromstring(body)

            # 에러 체크
            result_code = root.findtext(".//resultCode", "")
            if result_code and result_code != "00":
                msg = root.findtext(".//resultMsg", "")
                print(f"  [API 오류] {result_code}: {msg}")
                break

            items = list(root.iter("item"))
            all_items.extend(items)

            total_count = int(root.findtext(".//totalCount", "0"))
            if len(all_items) >= total_count or len(items) < 100:
                break

        except Exception as e:
            print(f"  [오류] 페이지 {page}: {e}")
            break

        time.sleep(0.3)

    return all_items


def parse_candidate(item):
    """XML item → 후보자 딕셔너리"""
    name = (item.findtext("name") or item.findtext("candNm") or "").strip()
    party = (item.findtext("jdName") or item.findtext("partyNm") or "무소속").strip()
    sd = (item.findtext("sdName") or "").strip()
    sgg = (item.findtext("sggName") or "").strip()
    wiwName = (item.findtext("wiwName") or "").strip()  # 선거구명
    giho = (item.findtext("giho") or item.findtext("candNo") or "").strip()
    career = (item.findtext("career") or item.findtext("career1") or "").strip()
    age = (item.findtext("age") or "").strip()
    gender = (item.findtext("gender") or "").strip()

    region_key = REGION_MAP.get(sd, "")
    party_key = PARTY_MAP.get(party, "independent")

    return {
        "name": name,
        "party": party_key,
        "partyName": party,
        "career": career,
        "age": int(age) if age.isdigit() else None,
        "gender": gender,
        "giho": giho,
        "regionKey": region_key,
        "sdName": sd,
        "sggName": sgg,
        "wiwName": wiwName,
        "status": "NOMINATED",
        "dataSource": "nec_api",
        "isIncumbent": False,
        "pledges": [],
    }


def build_district_key(cand, election_type):
    """후보자 정보에서 선거구 키 생성"""
    sgg = cand["sggName"]
    wiw = cand["wiwName"]

    if election_type == "council":
        # 광역의원: "제주시 제1선거구" 형태
        if wiw:
            return wiw
        return sgg
    else:
        # 기초의원: "영암군가선거구" 또는 "종로구제1선거구" 형태
        if wiw:
            return wiw
        return sgg


def group_by_region_and_district(candidates, election_type):
    """후보자 목록을 시도별 > 선거구별로 그룹화"""
    regions = {}
    for cand in candidates:
        rk = cand["regionKey"]
        if not rk:
            continue

        if rk not in regions:
            regions[rk] = {}

        dist_key = build_district_key(cand, election_type)
        if dist_key not in regions[rk]:
            regions[rk][dist_key] = []

        # JSON 저장용으로 내부 필드 제거
        entry = {
            "name": cand["name"],
            "party": cand["party"],
            "career": cand["career"],
            "status": cand["status"],
            "dataSource": cand["dataSource"],
            "isIncumbent": cand["isIncumbent"],
            "pledges": cand["pledges"],
        }
        if cand["age"]:
            entry["age"] = cand["age"]
        if cand["giho"]:
            entry["giho"] = cand["giho"]

        regions[rk][dist_key].append(entry)

    return regions


def save_region(region_key, candidates_by_district, election_type, dry_run):
    """시도별 JSON 파일 저장"""
    folder = "council" if election_type == "council" else "local_council"
    label = "광역의원" if election_type == "council" else "기초의원"
    out_dir = BASE_DIR / "data" / "candidates" / folder
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{region_key}.json"

    total = sum(len(v) for v in candidates_by_district.values())
    districts = len(candidates_by_district)

    if dry_run:
        print(f"  [DRY] {REGION_NAMES.get(region_key, region_key)} {label}: "
              f"{districts}개 선거구, {total}명")
        for dist, members in sorted(candidates_by_district.items()):
            names = ", ".join(f"{m['name']}({m['party']})" for m in members)
            print(f"    {dist}: {names}")
        return total

    data = {
        "_meta": {
            "lastUpdated": date.today().isoformat(),
            "source": f"선관위 공공데이터포털 API (sgId={SG_ID})",
            "region": region_key,
            "electionType": election_type,
            "totalCandidates": total,
            "totalDistricts": districts,
        },
        "candidates": candidates_by_district,
    }

    out_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"  [{REGION_NAMES.get(region_key, region_key)}] {label}: "
          f"{districts}개 선거구, {total}명 → {out_path.name}")
    return total


def main():
    parser = argparse.ArgumentParser(description="광역/기초의원 후보자 일괄 수집 (선관위 API)")
    parser.add_argument("--type", choices=["council", "localCouncil", "both"],
                        default="both", help="수집 대상 (기본: both)")
    parser.add_argument("--region", help="특정 시도만 (예: jeju)")
    parser.add_argument("--dry-run", action="store_true", help="미리보기 모드")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("NEC_API_KEY", "")
    if not api_key:
        print("[오류] NEC_API_KEY 환경변수가 설정되지 않았습니다.")
        print("  공공데이터포털(data.go.kr)에서 '선거후보자정보조회' API 키를 발급받으세요.")
        sys.exit(1)

    types = []
    if args.type in ("council", "both"):
        types.append("council")
    if args.type in ("localCouncil", "both"):
        types.append("localCouncil")

    print("=" * 60)
    print("광역/기초의원 후보자 일괄 수집 (선관위 API)")
    print(f"선거: 제9회 전국동시지방선거 (sgId={SG_ID})")
    print(f"실행: {date.today().isoformat()}")
    print(f"대상: {', '.join(types)}")
    if args.region:
        print(f"시도: {REGION_NAMES.get(args.region, args.region)}")
    if args.dry_run:
        print("[DRY-RUN 모드]")
    print("=" * 60)

    grand_total = 0

    for election_type in types:
        label = "광역의원" if election_type == "council" else "기초의원"
        typecode = SG_TYPECODE[election_type]
        print(f"\n{'─' * 40}")
        print(f"[{label}] sgTypecode={typecode}")
        print(f"{'─' * 40}")

        # 시도 제한
        if args.region:
            sd_name = REGION_NAMES.get(args.region)
            if not sd_name:
                print(f"  [오류] 알 수 없는 시도: {args.region}")
                continue
            print(f"  {sd_name} 후보자 조회 중...")
            items = fetch_candidates(api_key, election_type, sd_name=sd_name)
        else:
            print(f"  전국 후보자 조회 중...")
            items = fetch_candidates(api_key, election_type)

        if not items:
            print(f"  후보자 데이터 없음 (아직 등록 기간 전일 수 있습니다)")
            continue

        print(f"  API 응답: {len(items)}명")

        # 파싱
        candidates = [parse_candidate(it) for it in items]
        candidates = [c for c in candidates if c["name"] and c["regionKey"]]
        print(f"  유효 후보: {len(candidates)}명")

        # 시도별 그룹화
        regions = group_by_region_and_district(candidates, election_type)

        # 시도 필터
        if args.region:
            regions = {k: v for k, v in regions.items() if k == args.region}

        # 저장
        type_total = 0
        for rk in sorted(regions.keys()):
            count = save_region(rk, regions[rk], election_type, args.dry_run)
            type_total += count

        print(f"\n  {label} 합계: {type_total}명")
        grand_total += type_total

    print(f"\n{'=' * 60}")
    print(f"총 {grand_total}명 수집 완료")
    if not args.dry_run and grand_total > 0:
        print("데이터 저장 완료. 사이트 새로고침 시 반영됩니다.")
    elif grand_total == 0:
        print("후보자가 없습니다. 후보자 등록 기간(5/14~15)을 확인하세요.")
    print("=" * 60)


if __name__ == "__main__":
    main()
