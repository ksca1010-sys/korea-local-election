#!/usr/bin/env python3
"""
광역의원/기초의원 정식 후보자 등록현황 수집.

선관위 후보자 정보 API(PofelcddInfoInqireService)에서 등록 후보만 가져와
data/candidates/council/*.json 및 data/candidates/local_council/*.json에 저장한다.
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"

NEC_CANDIDATE_API = (
    "http://apis.data.go.kr/9760000/"
    "PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire"
)
SG_ID = "20260603"
DATA_GO_KR_SOURCE_URL = "https://www.data.go.kr/data/15000908/openapi.do"
OFFICIAL_CANDIDATE_INFO_URL = "https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml"

SG_TYPECODE = {
    "council": "5",
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
    "전남광주통합특별시": "gwangju",
}

REGION_NAMES = {
    "seoul": "서울특별시", "busan": "부산광역시", "daegu": "대구광역시",
    "incheon": "인천광역시", "gwangju": "광주광역시", "daejeon": "대전광역시",
    "ulsan": "울산광역시", "sejong": "세종특별자치시", "gyeonggi": "경기도",
    "gangwon": "강원특별자치도", "chungbuk": "충청북도", "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도", "jeonnam": "전라남도", "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도", "jeju": "제주특별자치도",
}

PARTY_KEYWORDS = {
    "더불어민주당": "democratic",
    "민주당": "democratic",
    "국민의힘": "ppp",
    "조국혁신당": "reform",
    "개혁신당": "newReform",
    "진보당": "progressive",
    "정의당": "justice",
    "새로운미래": "newFuture",
    "새미래민주당": "newFuture",
    "무소속": "independent",
}

DETAIL_ORDER = {
    "": 0,
    "가": 1,
    "나": 2,
    "다": 3,
    "라": 4,
    "마": 5,
    "바": 6,
    "사": 7,
    "아": 8,
}

API_MAX_ATTEMPTS = 4
API_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
API_RETRY_BASE_DELAY_SECONDS = 3


def load_env():
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def clean_text(value):
    return str(value or "").strip()


def to_int(value):
    value = clean_text(value)
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def normalize_party_key(party_name):
    party_name = clean_text(party_name)
    if not party_name:
        return "independent"
    for keyword, key in PARTY_KEYWORDS.items():
        if keyword in party_name:
            return key
    return "other"


def combined_career(item):
    parts = []
    for key in ("career1", "career2"):
        value = clean_text(item.get(key))
        if value and value not in parts:
            parts.append(value)
    return " / ".join(parts)


def candidate_sort_key(candidate):
    ballot = candidate.get("ballotNumber")
    detail = candidate.get("ballotNumberDetail") or ""
    return (
        ballot is None,
        ballot if ballot is not None else candidate.get("officialOrder", 999999),
        DETAIL_ORDER.get(detail, 99),
        candidate.get("name", ""),
    )


def fetch_json_with_retries(url, context):
    for attempt in range(1, API_MAX_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            retryable = exc.code in API_RETRYABLE_STATUS_CODES
            if not retryable or attempt == API_MAX_ATTEMPTS:
                raise RuntimeError(f"{context}: HTTP {exc.code}") from exc
            delay = API_RETRY_BASE_DELAY_SECONDS * attempt
            print(f"  [RETRY] {context}: HTTP {exc.code}, {delay}초 후 재시도 ({attempt}/{API_MAX_ATTEMPTS})")
            time.sleep(delay)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            if attempt == API_MAX_ATTEMPTS:
                raise RuntimeError(f"{context}: {exc}") from exc
            delay = API_RETRY_BASE_DELAY_SECONDS * attempt
            print(f"  [RETRY] {context}: {exc}, {delay}초 후 재시도 ({attempt}/{API_MAX_ATTEMPTS})")
            time.sleep(delay)

    raise RuntimeError(f"{context}: 재시도 실패")


def fetch_candidates(api_key, election_type, sd_name=None):
    typecode = SG_TYPECODE[election_type]
    all_items = []
    page = 1

    while True:
        params = {
            "serviceKey": api_key,
            "pageNo": str(page),
            "numOfRows": "1000",
            "sgId": SG_ID,
            "sgTypecode": typecode,
            "resultType": "json",
        }
        if sd_name:
            params["sdName"] = sd_name

        url = f"{NEC_CANDIDATE_API}?{urllib.parse.urlencode(params)}"
        data = fetch_json_with_retries(url, f"{election_type} sgTypecode={typecode} page={page}")

        header = data.get("response", {}).get("header", {})
        result_code = header.get("resultCode")
        if result_code == "INFO-03":
            return []
        if result_code != "INFO-00":
            raise RuntimeError(f"NEC API 오류({typecode}): {header.get('resultMsg')}")

        body = data.get("response", {}).get("body", {})
        items = body.get("items", {}).get("item", [])
        if isinstance(items, dict):
            items = [items]
        all_items.extend(items)

        total_count = int(body.get("totalCount") or 0)
        if len(all_items) >= total_count or not items:
            break
        page += 1
        time.sleep(0.2)

    return all_items


def parse_candidate(item, election_type):
    sd_name = clean_text(item.get("sdName"))
    region_key = REGION_MAP.get(sd_name, "")
    party_name = clean_text(item.get("jdName"))
    ballot_number = to_int(item.get("giho"))
    ballot_detail = clean_text(item.get("gihoSangse"))
    typecode = SG_TYPECODE[election_type]

    candidate = {
        "name": clean_text(item.get("name")),
        "party": normalize_party_key(party_name),
        "partyKey": normalize_party_key(party_name),
        "partyName": party_name,
        "career": combined_career(item),
        "status": "NOMINATED",
        "officialStatus": clean_text(item.get("status")) or "등록",
        "dataSource": "nec_official",
        "sourceUrl": DATA_GO_KR_SOURCE_URL,
        "officialUrl": OFFICIAL_CANDIDATE_INFO_URL,
        "isIncumbent": False,
        "pledges": [],
        "regionKey": region_key,
        "sdName": sd_name,
        "sggName": clean_text(item.get("sggName")),
        "wiwName": clean_text(item.get("wiwName")),
        "sgId": clean_text(item.get("sgId")) or SG_ID,
        "sgTypecode": typecode,
        "huboid": clean_text(item.get("huboid")),
        "officialOrder": to_int(item.get("num")),
    }

    age = to_int(item.get("age"))
    if age is not None:
        candidate["age"] = age
    for source_key, target_key in (("gender", "gender"), ("job", "job"), ("edu", "education")):
        value = clean_text(item.get(source_key))
        if value:
            candidate[target_key] = value
    if ballot_number is not None:
        candidate["ballotNumber"] = ballot_number
        candidate["giho"] = str(ballot_number)
    if ballot_detail:
        candidate["ballotNumberDetail"] = ballot_detail
        candidate["gihoSangse"] = ballot_detail

    return candidate


def build_district_key(candidate):
    return candidate.get("sggName") or candidate.get("wiwName") or "미분류"


def group_by_region_and_district(candidates):
    regions = defaultdict(lambda: defaultdict(list))
    for candidate in candidates:
        region_key = candidate.get("regionKey")
        if not region_key:
            continue
        district_key = build_district_key(candidate)
        regions[region_key][district_key].append(candidate)

    grouped = {}
    for region_key, districts in regions.items():
        grouped[region_key] = {}
        for district_key, members in districts.items():
            grouped[region_key][district_key] = sorted(members, key=candidate_sort_key)
    return grouped


def save_region(region_key, candidates_by_district, election_type, dry_run):
    folder = "council" if election_type == "council" else "local_council"
    label = "광역의원" if election_type == "council" else "기초의원"
    out_dir = BASE_DIR / "data" / "candidates" / folder
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{region_key}.json"

    total = sum(len(members) for members in candidates_by_district.values())
    districts = len(candidates_by_district)

    if dry_run:
        print(f"  [DRY] {REGION_NAMES.get(region_key, region_key)} {label}: {districts}개 선거구, {total}명")
        return total

    data = {
        "_meta": {
            "lastUpdated": datetime.now().strftime("%Y-%m-%d"),
            "lastOfficialSync": datetime.now().isoformat(),
            "source": "중앙선거관리위원회 후보자 정보 API",
            "sourceUrl": DATA_GO_KR_SOURCE_URL,
            "region": region_key,
            "electionType": election_type,
            "sgId": SG_ID,
            "sgTypecode": SG_TYPECODE[election_type],
            "officialSyncMode": "replace_registered_candidates",
            "totalCandidates": total,
            "totalDistricts": districts,
        },
        "candidates": candidates_by_district,
    }

    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  [{REGION_NAMES.get(region_key, region_key)}] {label}: {districts}개 선거구, {total}명 -> {out_path.name}")
    return total


def save_merged_council_placeholder(dry_run):
    """전남 광역의원은 선관위 통합 선거구(gwangju.json)를 사용한다."""
    out_path = BASE_DIR / "data" / "candidates" / "council" / "jeonnam.json"
    data = {
        "_meta": {
            "lastUpdated": datetime.now().strftime("%Y-%m-%d"),
            "lastOfficialSync": datetime.now().isoformat(),
            "source": "중앙선거관리위원회 후보자 정보 API",
            "sourceUrl": DATA_GO_KR_SOURCE_URL,
            "region": "jeonnam",
            "electionType": "council",
            "sgId": SG_ID,
            "sgTypecode": SG_TYPECODE["council"],
            "officialSyncMode": "merged_into_gwangju",
            "mergedRegionKey": "gwangju",
            "note": "광역의원 공식 후보자는 선관위 전남광주통합특별시 기준으로 gwangju.json에 저장됩니다.",
        },
        "candidates": {},
    }
    if dry_run:
        print("  [DRY] 전남 광역의원: 전남광주통합특별시 공식 후보(gwangju.json) 사용")
        return
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("  [전라남도] 광역의원: 전남광주통합특별시 공식 후보(gwangju.json) 사용")


def validate_official_only(regions):
    issues = []
    total = 0
    for region_key, districts in regions.items():
        for district_key, members in districts.items():
            for candidate in members:
                total += 1
                if candidate.get("status") != "NOMINATED":
                    issues.append(f"{region_key}/{district_key}/{candidate.get('name')}: status={candidate.get('status')}")
                if candidate.get("dataSource") != "nec_official":
                    issues.append(f"{region_key}/{district_key}/{candidate.get('name')}: dataSource={candidate.get('dataSource')}")
                if candidate.get("officialStatus") != "등록":
                    issues.append(f"{region_key}/{district_key}/{candidate.get('name')}: officialStatus={candidate.get('officialStatus')}")
    if issues:
        print(f"[검증 오류] {len(issues)}건")
        for issue in issues[:20]:
            print(f"  - {issue}")
        return False
    print(f"[검증] 공식 등록 후보 {total}명")
    return True


def main():
    parser = argparse.ArgumentParser(description="광역/기초의원 정식 후보자 등록현황 수집")
    parser.add_argument("--type", choices=["council", "localCouncil", "both"], default="both")
    parser.add_argument("--region", help="특정 시도만 수집 (예: jeju)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("NEC_API_KEY", "")
    if not api_key:
        print("[오류] NEC_API_KEY 환경변수가 설정되지 않았습니다.")
        sys.exit(1)

    types = []
    if args.type in ("council", "both"):
        types.append("council")
    if args.type in ("localCouncil", "both"):
        types.append("localCouncil")

    print("=" * 60)
    print("광역/기초의원 후보자 일괄 수집 (NEC 정식 후보자 API)")
    print(f"선거: 제9회 전국동시지방선거 (sgId={SG_ID})")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
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
        print(f"\n[{label}] sgTypecode={typecode}")

        sd_name = None
        if args.region:
            sd_name = REGION_NAMES.get(args.region)
            if not sd_name:
                print(f"  [오류] 알 수 없는 시도: {args.region}")
                continue

        items = fetch_candidates(api_key, election_type, sd_name=sd_name)
        print(f"  API 응답: {len(items)}명")
        registered_items = [item for item in items if clean_text(item.get("status")) == "등록"]
        skipped = len(items) - len(registered_items)
        if skipped:
            print(f"  등록 외 상태 제외: {skipped}명")
        candidates = [parse_candidate(item, election_type) for item in registered_items]
        candidates = [c for c in candidates if c.get("name") and c.get("regionKey")]
        print(f"  유효 후보: {len(candidates)}명")

        regions = group_by_region_and_district(candidates)
        if args.region:
            regions = {key: value for key, value in regions.items() if key == args.region}
            candidates = [c for c in candidates if c.get("regionKey") == args.region]

        if not candidates:
            print(f"  [오류] {label} 공식 후보가 0명입니다. API 응답/sgTypecode를 확인하세요.")
            sys.exit(1)

        if not validate_official_only(regions):
            sys.exit(1)

        type_total = 0
        for region_key in sorted(regions):
            type_total += save_region(region_key, regions[region_key], election_type, args.dry_run)

        if election_type == "council" and not args.region:
            save_merged_council_placeholder(args.dry_run)

        print(f"  {label} 합계: {type_total}명")
        grand_total += type_total

    print("=" * 60)
    print(f"총 {grand_total}명 수집 완료")
    print("=" * 60)


if __name__ == "__main__":
    main()
