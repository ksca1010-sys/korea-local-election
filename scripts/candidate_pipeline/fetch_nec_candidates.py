#!/usr/bin/env python3
"""
선관위 정식 후보자 등록현황 동기화.

공식 후보자 정보 API(PofelcddInfoInqireService)를 호출해 등록 후보만
governor/superintendent/mayor/byelection 후보 JSON에 반영한다.

사용법:
  python scripts/candidate_pipeline/fetch_nec_candidates.py
  python scripts/candidate_pipeline/fetch_nec_candidates.py --dry-run
  python scripts/candidate_pipeline/fetch_nec_candidates.py --log-raw
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path

try:
    from nec_precand_sync import SIDO_MAP
except ImportError:
    _HERE = Path(__file__).resolve().parent
    sys.path.insert(0, str(_HERE))
    from nec_precand_sync import SIDO_MAP


PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ENV_FILE = PROJECT_ROOT / ".env"
CANDIDATES_DIR = PROJECT_ROOT / "data" / "candidates"

GOVERNOR_FILE = CANDIDATES_DIR / "governor.json"
SUPERINTENDENT_FILE = CANDIDATES_DIR / "superintendent.json"
MAYOR_FILE = CANDIDATES_DIR / "mayor_candidates.json"
BYELECTION_FILE = CANDIDATES_DIR / "byelection.json"
UNMATCHED_FILE = CANDIDATES_DIR / "unmatched_candidates.json"
RAW_SAMPLE_FILE = CANDIDATES_DIR / "nec_raw_sample.json"

SG_ID = "20260603"
NEC_CANDIDATE_API = (
    "http://apis.data.go.kr/9760000/"
    "PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire"
)
DATA_GO_KR_SOURCE_URL = "https://www.data.go.kr/data/15000908/openapi.do"
OFFICIAL_CANDIDATE_INFO_URL = "https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml"

ELECTION_TYPE_LABELS = {
    "2": "국회의원 재보궐",
    "3": "광역단체장",
    "4": "기초단체장",
    "11": "교육감",
}

SPECIAL_REGION_MAP = {
    "전남광주통합특별시": "gwangju",
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


def load_env():
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def load_json(path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


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
    official_order = candidate.get("officialOrder") or 999999
    detail = candidate.get("ballotNumberDetail") or ""
    detail_order = DETAIL_ORDER.get(detail, 99)
    return (
        ballot is None,
        ballot if ballot is not None else official_order,
        detail_order,
        candidate.get("name", ""),
    )


def fetch_official_candidates(api_key, sg_typecode):
    all_items = []
    page = 1
    while True:
        params = urllib.parse.urlencode({
            "serviceKey": api_key,
            "pageNo": str(page),
            "numOfRows": "1000",
            "sgId": SG_ID,
            "sgTypecode": sg_typecode,
            "resultType": "json",
        })
        url = f"{NEC_CANDIDATE_API}?{params}"
        with urllib.request.urlopen(url, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))

        header = data.get("response", {}).get("header", {})
        result_code = header.get("resultCode")
        if result_code == "INFO-03":
            return []
        if result_code != "INFO-00":
            raise RuntimeError(f"NEC API 오류({sg_typecode}): {header.get('resultMsg')}")

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


def convert_item(item, sg_typecode, unmatched):
    sd_name = clean_text(item.get("sdName"))
    region_key = SIDO_MAP.get(sd_name) or SPECIAL_REGION_MAP.get(sd_name)
    if not region_key:
        unmatched.append({
            "reason": f"SIDO_MAP 미등록 시도: {sd_name}",
            "sgTypecode": sg_typecode,
            "raw": item,
        })
        return None

    name = clean_text(item.get("name"))
    if not name:
        unmatched.append({
            "reason": "후보자 이름 없음",
            "sgTypecode": sg_typecode,
            "raw": item,
        })
        return None

    party_name = clean_text(item.get("jdName"))
    ballot_number = to_int(item.get("giho"))
    ballot_detail = clean_text(item.get("gihoSangse"))
    official_order = to_int(item.get("num"))

    candidate = {
        "name": name,
        "party": normalize_party_key(party_name),
        "partyKey": normalize_party_key(party_name),
        "partyName": party_name,
        "career": combined_career(item),
        "status": "NOMINATED",
        "officialStatus": clean_text(item.get("status")) or "등록",
        "dataSource": "nec_official",
        "sourceUrl": DATA_GO_KR_SOURCE_URL,
        "officialUrl": OFFICIAL_CANDIDATE_INFO_URL,
        "sgId": clean_text(item.get("sgId")) or SG_ID,
        "sgTypecode": sg_typecode,
        "huboid": clean_text(item.get("huboid")),
        "sdName": sd_name,
        "sggName": clean_text(item.get("sggName")),
        "wiwName": clean_text(item.get("wiwName")),
        "regionKey": region_key,
        "officialOrder": official_order,
        "pledges": [],
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
    if sg_typecode == "4":
        candidate["districtName"] = candidate["wiwName"] or candidate["sggName"]

    return candidate


def fetch_nec_official(api_key, log_raw=False):
    result = {"2": [], "3": [], "4": [], "11": [], "unmatched": []}
    raw_samples = {}

    for typecode in ("3", "11", "4", "2"):
        label = ELECTION_TYPE_LABELS[typecode]
        print(f"\n[NEC] {label} 등록 후보 조회 (sgTypecode={typecode})")
        raw_items = fetch_official_candidates(api_key, typecode)
        print(f"  원본 응답: {len(raw_items)}명")
        if raw_items and log_raw:
            raw_samples[typecode] = raw_items[0]

        registered_items = [item for item in raw_items if clean_text(item.get("status")) == "등록"]
        skipped = len(raw_items) - len(registered_items)
        if skipped:
            print(f"  등록 외 상태 제외: {skipped}명")

        converted = []
        for item in registered_items:
            candidate = convert_item(item, typecode, result["unmatched"])
            if candidate:
                converted.append(candidate)
        result[typecode] = converted
        print(f"  변환 완료: {len(converted)}명")

    if log_raw and raw_samples:
        write_json(RAW_SAMPLE_FILE, raw_samples)
        print(f"\n[RAW] 샘플 저장: {RAW_SAMPLE_FILE}")

    return result


def preserve_existing_fields(candidate, existing_candidate):
    if not existing_candidate:
        return candidate
    merged = dict(candidate)
    merged["id"] = existing_candidate.get("id") or candidate.get("id")
    merged["pledges"] = existing_candidate.get("pledges") or candidate.get("pledges") or []
    if "photo" in existing_candidate:
        merged["photo"] = existing_candidate.get("photo")
    if existing_candidate.get("stance"):
        merged["stance"] = existing_candidate.get("stance")
    if existing_candidate.get("pledgeCategories"):
        merged["pledgeCategories"] = existing_candidate.get("pledgeCategories")
    return merged


def merge_regional_list(existing, new_candidates, id_prefix):
    merged = json.loads(json.dumps(existing))
    candidates_map = merged.setdefault("candidates", {})
    by_region = defaultdict(list)
    for candidate in new_candidates:
        by_region[candidate["regionKey"]].append(candidate)

    removed = 0
    for region_key, existing_list in list(candidates_map.items()):
        if region_key in by_region or not isinstance(existing_list, list):
            continue
        removed += len([c for c in existing_list if isinstance(c, dict) and c.get("name")])
        candidates_map[region_key] = []

    for region_key, official_list in by_region.items():
        existing_list = candidates_map.get(region_key, [])
        if not isinstance(existing_list, list):
            existing_list = []
        existing_by_name = {
            c.get("name"): c for c in existing_list
            if isinstance(c, dict) and c.get("name")
        }
        official_names = {c["name"] for c in official_list}
        removed += len(set(existing_by_name) - official_names)

        next_list = []
        for index, candidate in enumerate(sorted(official_list, key=candidate_sort_key), start=1):
            candidate = preserve_existing_fields(candidate, existing_by_name.get(candidate["name"]))
            candidate["id"] = candidate.get("id") or f"{region_key}-{id_prefix}-nec-{index}"
            next_list.append(candidate)
        candidates_map[region_key] = next_list

    stamp_official_meta(merged, removed)
    return merged


def find_mayor_district_key(region_dict, official_name):
    if official_name in region_dict:
        return official_name
    compact_official = official_name.replace(" ", "")
    for key in region_dict:
        if key.replace(" ", "") == compact_official:
            return key
    for key in region_dict:
        compact_key = key.replace(" ", "")
        if compact_official in compact_key or compact_key in compact_official:
            return key
    return official_name


def merge_mayor_candidates(existing, new_candidates):
    merged = json.loads(json.dumps(existing))
    candidates_map = merged.setdefault("candidates", {})
    by_district = defaultdict(list)
    for candidate in new_candidates:
        district = candidate.get("districtName") or candidate.get("sggName")
        by_district[(candidate["regionKey"], district)].append(candidate)

    removed = 0
    touched = set()
    for (region_key, official_district), official_list in by_district.items():
        region_dict = candidates_map.setdefault(region_key, {})
        if not isinstance(region_dict, dict):
            continue
        district_key = find_mayor_district_key(region_dict, official_district)
        existing_list = region_dict.get(district_key, [])
        if not isinstance(existing_list, list):
            existing_list = []
        existing_by_name = {
            c.get("name"): c for c in existing_list
            if isinstance(c, dict) and c.get("name")
        }
        official_names = {c["name"] for c in official_list}
        removed += len(set(existing_by_name) - official_names)

        next_list = []
        for index, candidate in enumerate(sorted(official_list, key=candidate_sort_key), start=1):
            candidate = preserve_existing_fields(candidate, existing_by_name.get(candidate["name"]))
            candidate["id"] = candidate.get("id") or f"{region_key}-{district_key}-nec-{index}"
            candidate["districtName"] = district_key
            next_list.append(candidate)
        region_dict[district_key] = next_list
        touched.add((region_key, district_key))

    for region_key, region_dict in candidates_map.items():
        if not isinstance(region_dict, dict):
            continue
        for district_key, existing_list in list(region_dict.items()):
            if (region_key, district_key) in touched:
                continue
            if isinstance(existing_list, list):
                removed += len([c for c in existing_list if isinstance(c, dict) and c.get("name")])
            region_dict[district_key] = []

    stamp_official_meta(merged, removed)
    return merged


def merge_byelection_candidates(existing, new_candidates, unmatched):
    merged = json.loads(json.dumps(existing))
    districts = merged.setdefault("districts", {})
    by_district = defaultdict(list)
    for candidate in new_candidates:
        by_district[(candidate.get("sdName"), candidate.get("sggName"))].append(candidate)

    index_by_official = {
        (district.get("sdName"), district.get("sggName")): key
        for key, district in districts.items()
        if isinstance(district, dict)
    }

    removed = 0
    for official_key, official_list in by_district.items():
        district_key = index_by_official.get(official_key)
        if not district_key:
            unmatched.extend({
                "reason": "재보궐 선거구 미매핑",
                "candidate": candidate,
            } for candidate in official_list)
            continue

        district = districts[district_key]
        existing_list = district.get("candidates", [])
        if not isinstance(existing_list, list):
            existing_list = []
        existing_by_name = {
            c.get("name"): c for c in existing_list
            if isinstance(c, dict) and c.get("name")
        }
        official_names = {c["name"] for c in official_list}
        removed += len(set(existing_by_name) - official_names)

        next_list = []
        for index, candidate in enumerate(sorted(official_list, key=candidate_sort_key), start=1):
            candidate = preserve_existing_fields(candidate, existing_by_name.get(candidate["name"]))
            candidate["id"] = candidate.get("id") or f"{district_key}-nec-{index}"
            next_list.append(candidate)
        district["candidates"] = next_list
        district["candidateCount"] = len(next_list)
        district["verificationStatus"] = "official_registered_candidates"
        district["dataSource"] = "nec_official"
        district["sourceLabel"] = "중앙선거관리위원회 후보자 정보"
        district["sourceUrl"] = DATA_GO_KR_SOURCE_URL
        district["lastOfficialCandidateSync"] = datetime.now().strftime("%Y-%m-%d")

    stamp_official_meta(merged, removed)
    merged["_meta"]["source"] = "중앙선거관리위원회 후보자 정보 API"
    merged["_meta"]["sourceUrl"] = DATA_GO_KR_SOURCE_URL
    merged["_meta"]["officialCandidateCount"] = sum(
        len(d.get("candidates", [])) for d in districts.values() if isinstance(d, dict)
    )
    return merged


def stamp_official_meta(data, removed_count):
    meta = data.setdefault("_meta", {})
    now = datetime.now()
    meta["lastUpdated"] = now.strftime("%Y-%m-%d")
    meta["lastPipelineRun"] = now.isoformat()
    meta["lastOfficialSync"] = now.isoformat()
    meta["officialSyncMode"] = "replace_registered_candidates"
    meta["officialSource"] = "중앙선거관리위원회 후보자 정보 API"
    meta["officialSourceUrl"] = DATA_GO_KR_SOURCE_URL
    meta["removedPreRegistrationRecords"] = removed_count


def validate_official_only(label, data):
    issues = []
    total = 0

    def walk(value, path):
        nonlocal total
        if isinstance(value, list):
            for index, candidate in enumerate(value):
                if not isinstance(candidate, dict) or not candidate.get("name"):
                    continue
                total += 1
                if candidate.get("status") != "NOMINATED":
                    issues.append(f"{path}[{index}] {candidate.get('name')}: status={candidate.get('status')}")
                if candidate.get("dataSource") != "nec_official":
                    issues.append(f"{path}[{index}] {candidate.get('name')}: dataSource={candidate.get('dataSource')}")
                if candidate.get("officialStatus") != "등록":
                    issues.append(f"{path}[{index}] {candidate.get('name')}: officialStatus={candidate.get('officialStatus')}")
        elif isinstance(value, dict):
            for key, child in value.items():
                walk(child, f"{path}/{key}")

    walk(data.get("candidates") or data.get("districts") or {}, label)
    if issues:
        print(f"[VALIDATE] {label}: {len(issues)}개 문제")
        for issue in issues[:20]:
            print(f"  - {issue}")
        return False

    print(f"[VALIDATE] {label}: 공식 등록 후보 {total}명")
    return True


def save_unmatched(unmatched):
    data = {
        "_meta": {
            "version": "1.0",
            "lastUpdated": datetime.now().strftime("%Y-%m-%d"),
            "description": "선관위 정식 후보자 동기화 미매핑 항목",
        },
        "candidates": unmatched,
    }
    write_json(UNMATCHED_FILE, data)
    print(f"[UNMATCHED] {len(unmatched)}건 저장: {UNMATCHED_FILE.name}")


def main():
    parser = argparse.ArgumentParser(description="선관위 정식 후보자 등록현황 동기화")
    parser.add_argument("--dry-run", action="store_true", help="파일 저장 없이 검증만 수행")
    parser.add_argument("--log-raw", action="store_true", help="타입별 raw 샘플 저장")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("NEC_API_KEY", "")
    if not api_key:
        print("[ERROR] NEC_API_KEY 환경변수가 설정되지 않았습니다.")
        sys.exit(1)

    print("=" * 60)
    print("후보자 데이터 파이프라인 (NEC 정식 후보자 API)")
    print(f"실행 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if args.dry_run:
        print("[DRY-RUN] 파일 저장을 건너뜁니다")
    print("=" * 60)

    nec_data = fetch_nec_official(api_key, log_raw=args.log_raw)
    unmatched = nec_data.get("unmatched", [])

    outputs = {
        "governor": merge_regional_list(
            load_json(GOVERNOR_FILE, {"_meta": {}, "candidates": {}}),
            nec_data.get("3", []),
            "gov",
        ),
        "superintendent": merge_regional_list(
            load_json(SUPERINTENDENT_FILE, {"_meta": {}, "candidates": {}}),
            nec_data.get("11", []),
            "supt",
        ),
        "mayor": merge_mayor_candidates(
            load_json(MAYOR_FILE, {"_meta": {}, "candidates": {}}),
            nec_data.get("4", []),
        ),
        "byelection": merge_byelection_candidates(
            load_json(BYELECTION_FILE, {"_meta": {}, "districts": {}}),
            nec_data.get("2", []),
            unmatched,
        ),
    }

    validations = [
        validate_official_only("governor", outputs["governor"]),
        validate_official_only("superintendent", outputs["superintendent"]),
        validate_official_only("mayor", outputs["mayor"]),
        validate_official_only("byelection", outputs["byelection"]),
    ]

    if not all(validations):
        print("[ERROR] 검증 실패. 파일을 저장하지 않습니다.")
        sys.exit(1)

    if args.dry_run:
        print("\n[DRY-RUN] 저장 건너뜀")
        print(f"미매핑: {len(unmatched)}건")
        return

    write_json(GOVERNOR_FILE, outputs["governor"])
    write_json(SUPERINTENDENT_FILE, outputs["superintendent"])
    write_json(MAYOR_FILE, outputs["mayor"])
    write_json(BYELECTION_FILE, outputs["byelection"])
    save_unmatched(unmatched)

    print("\n[SAVE] governor/superintendent/mayor/byelection 후보 JSON 저장 완료")


if __name__ == "__main__":
    main()
