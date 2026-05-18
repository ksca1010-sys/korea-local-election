#!/usr/bin/env python3
"""
선관위 정식 후보자 등록현황에서 비례대표 후보 명부를 동기화한다.

대상:
  - sgTypecode=8: 광역의원 비례대표
  - sgTypecode=9: 기초의원 비례대표

사용법:
  python3 scripts/candidate_pipeline/fetch_proportional_candidates.py
  python3 scripts/candidate_pipeline/fetch_proportional_candidates.py --dry-run
"""

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import OrderedDict, defaultdict
from datetime import datetime, timezone
from pathlib import Path

try:
    from nec_precand_sync import SIDO_MAP
except ImportError:
    _HERE = Path(__file__).resolve().parent
    sys.path.insert(0, str(_HERE))
    from nec_precand_sync import SIDO_MAP


PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ENV_FILE = PROJECT_ROOT / ".env"
OUTPUT_FILE = PROJECT_ROOT / "data" / "candidates" / "proportional.json"
COUNCIL_BASE_FILE = PROJECT_ROOT / "data" / "proportional_council.json"
LOCAL_BASE_FILE = PROJECT_ROOT / "data" / "proportional_local_council.json"

SG_ID = "20260603"
NEC_CANDIDATE_API = (
    "http://apis.data.go.kr/9760000/"
    "PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire"
)
DATA_GO_KR_SOURCE_URL = "https://www.data.go.kr/data/15000908/openapi.do"
OFFICIAL_CANDIDATE_INFO_URL = "https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml"

TYPE_COUNCIL_PROPORTIONAL = "8"
TYPE_LOCAL_COUNCIL_PROPORTIONAL = "9"

PARTY_KEYS = {
    "더불어민주당": "democratic",
    "국민의힘": "ppp",
    "조국혁신당": "reform",
    "개혁신당": "newReform",
    "진보당": "progressive",
    "정의당": "justice",
    "새로운미래": "newFuture",
    "새미래민주당": "newFuture",
    "기본소득당": "basicIncome",
    "노동당": "labor",
    "녹색당": "green",
    "사회민주당": "socialDemocratic",
    "자유통일당": "freedomUnification",
    "자유와혁신": "freedomInnovation",
    "공화당": "republican",
    "기독당": "christian",
    "국민당": "peopleParty",
    "국민대통합당": "grandNationalUnity",
    "국민연합": "nationalUnion",
    "거지당": "geojidang",
    "대한국민당": "koreanPeople",
    "친미연합": "proAmericaUnion",
    "한국독립당": "koreaIndependence",
    "한나라당": "hannara",
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


def load_json(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def clean_text(value):
    return str(value or "").strip()


def to_int(value):
    text = clean_text(value)
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def party_key(party_name):
    party_name = clean_text(party_name)
    if not party_name:
        return "independent"
    if party_name in PARTY_KEYS:
        return PARTY_KEYS[party_name]
    digest = hashlib.sha1(party_name.encode("utf-8")).hexdigest()[:10]
    return f"party_{digest}"


def combined_career(item):
    parts = []
    for key in ("career1", "career2"):
        value = clean_text(item.get(key))
        if value and value not in parts:
            parts.append(value)
    return " / ".join(parts)


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


def candidate_from_item(item, sg_typecode, region_key):
    party_name = clean_text(item.get("jdName"))
    normalized_party = party_key(party_name)
    candidate = {
        "name": clean_text(item.get("name")),
        "party": normalized_party,
        "partyKey": normalized_party,
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
        "sdName": clean_text(item.get("sdName")),
        "sggName": clean_text(item.get("sggName")),
        "wiwName": clean_text(item.get("wiwName")),
        "regionKey": region_key,
        "officialOrder": to_int(item.get("num")),
        "pledges": [],
    }

    for source_key, target_key in (("giho", "ballotNumber"), ("age", "age")):
        value = to_int(item.get(source_key))
        if value is not None:
            candidate[target_key] = value
    for source_key, target_key in (("gender", "gender"), ("job", "job"), ("edu", "education")):
        value = clean_text(item.get(source_key))
        if value:
            candidate[target_key] = value
    return candidate


def candidate_sort_key(candidate):
    ballot = candidate.get("ballotNumber")
    official_order = candidate.get("officialOrder")
    return (
        ballot is None,
        ballot if ballot is not None else 999999,
        official_order if official_order is not None else 999999,
        candidate.get("name", ""),
    )


def party_sort_key(party):
    first = party["candidates"][0] if party["candidates"] else {}
    ballot = first.get("officialOrder")
    return (
        ballot is None,
        ballot if ballot is not None else 999999,
        party.get("partyName", ""),
    )


def region_key_for_item(item):
    sd_name = clean_text(item.get("sdName"))
    return SIDO_MAP.get(sd_name)


def build_party_groups(candidates):
    grouped = OrderedDict()
    for candidate in sorted(candidates, key=candidate_sort_key):
        name = candidate["partyName"] or "무소속"
        if name not in grouped:
            grouped[name] = {
                "party": candidate["party"],
                "partyName": name,
                "candidates": [],
            }
        grouped[name]["candidates"].append(candidate)

    parties = list(grouped.values())
    parties.sort(key=party_sort_key)
    return parties


def build_party_entries(parties):
    return [
        {
            "party": party["party"],
            "partyName": party["partyName"],
            "candidates": party["candidates"],
        }
        for party in parties
    ]


def build_council_data(items, base):
    candidates_by_region = defaultdict(list)
    unmatched = []
    for item in items:
        if clean_text(item.get("status")) != "등록":
            continue
        region_key = region_key_for_item(item)
        if not region_key:
            unmatched.append(item)
            continue
        candidate = candidate_from_item(item, TYPE_COUNCIL_PROPORTIONAL, region_key)
        if candidate["name"]:
            candidates_by_region[region_key].append(candidate)

    output = OrderedDict()
    for region_key, base_region in (base.get("regions") or {}).items():
        parties = build_party_groups(candidates_by_region.get(region_key, []))
        output[region_key] = {
            "name": base_region.get("name"),
            "totalSeats": base_region.get("totalSeats", 0),
            "parties": build_party_entries(parties),
        }
    return output, unmatched


def build_local_data(items, base):
    candidates_by_region_sigungu = defaultdict(lambda: defaultdict(list))
    unmatched = []
    for item in items:
        if clean_text(item.get("status")) != "등록":
            continue
        region_key = region_key_for_item(item)
        sigungu_name = clean_text(item.get("wiwName")) or clean_text(item.get("sggName"))
        if not region_key or not sigungu_name:
            unmatched.append(item)
            continue
        candidate = candidate_from_item(item, TYPE_LOCAL_COUNCIL_PROPORTIONAL, region_key)
        candidate["districtName"] = sigungu_name
        if candidate["name"]:
            candidates_by_region_sigungu[region_key][sigungu_name].append(candidate)

    output = OrderedDict()
    for region_key, base_region in (base.get("regions") or {}).items():
        sigungus = OrderedDict()
        for sigungu_name, base_sigungu in (base_region.get("sigungus") or {}).items():
            parties = build_party_groups(candidates_by_region_sigungu[region_key].get(sigungu_name, []))
            sigungus[sigungu_name] = {
                "totalSeats": base_sigungu.get("totalSeats", 0),
                "parties": build_party_entries(parties),
            }

        for sigungu_name in sorted(candidates_by_region_sigungu.get(region_key, {})):
            if sigungu_name in sigungus:
                continue
            parties = build_party_groups(candidates_by_region_sigungu[region_key][sigungu_name])
            sigungus[sigungu_name] = {
                "totalSeats": 0,
                "parties": parties,
            }

        output[region_key] = {
            "name": base_region.get("name"),
            "totalSeats": sum(s.get("totalSeats", 0) for s in sigungus.values()),
            "sigungus": sigungus,
        }
    return output, unmatched


def count_candidates(data):
    council = sum(
        len(party.get("candidates", []))
        for region in data["council_proportional"].values()
        for party in region.get("parties", [])
    )
    local = sum(
        len(party.get("candidates", []))
        for region in data["local_council_proportional"].values()
        for sigungu in region.get("sigungus", {}).values()
        for party in sigungu.get("parties", [])
    )
    return council, local


def validate_generated(data, expected_council, expected_local):
    council_count, local_count = count_candidates(data)
    errors = []
    if council_count != expected_council:
        errors.append(f"광역비례 후보 수 불일치: {council_count} != {expected_council}")
    if local_count != expected_local:
        errors.append(f"기초비례 후보 수 불일치: {local_count} != {expected_local}")

    for bucket, regions in (
        ("council_proportional", data["council_proportional"]),
        ("local_council_proportional", data["local_council_proportional"]),
    ):
        if bucket == "council_proportional":
            party_lists = ((region_key, None, region.get("parties", [])) for region_key, region in regions.items())
        else:
            party_lists = (
                (region_key, sigungu_name, sigungu.get("parties", []))
                for region_key, region in regions.items()
                for sigungu_name, sigungu in region.get("sigungus", {}).items()
            )
        for region_key, sigungu_name, parties in party_lists:
            for party in parties:
                for candidate in party.get("candidates", []):
                    location = f"{region_key} {sigungu_name or ''} {party.get('partyName')}".strip()
                    if candidate.get("officialStatus") != "등록":
                        errors.append(f"{location} {candidate.get('name')}: officialStatus가 등록이 아님")
                    if candidate.get("status") != "NOMINATED":
                        errors.append(f"{location} {candidate.get('name')}: status가 NOMINATED가 아님")
                    if candidate.get("dataSource") != "nec_official":
                        errors.append(f"{location} {candidate.get('name')}: dataSource가 nec_official이 아님")

    if errors:
        raise RuntimeError("\n".join(errors[:20]))


def build_dataset(api_key):
    council_base = load_json(COUNCIL_BASE_FILE)
    local_base = load_json(LOCAL_BASE_FILE)

    print("[NEC] 광역의원 비례대표 등록 후보 조회")
    council_raw = fetch_official_candidates(api_key, TYPE_COUNCIL_PROPORTIONAL)
    council_registered = [item for item in council_raw if clean_text(item.get("status")) == "등록"]
    print(f"  원본 {len(council_raw)}명 / 등록 {len(council_registered)}명")

    print("[NEC] 기초의원 비례대표 등록 후보 조회")
    local_raw = fetch_official_candidates(api_key, TYPE_LOCAL_COUNCIL_PROPORTIONAL)
    local_registered = [item for item in local_raw if clean_text(item.get("status")) == "등록"]
    print(f"  원본 {len(local_raw)}명 / 등록 {len(local_registered)}명")

    council_data, council_unmatched = build_council_data(council_registered, council_base)
    local_data, local_unmatched = build_local_data(local_registered, local_base)

    now = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    output = {
        "_meta": {
            "lastUpdated": "2026-05-18",
            "lastPipelineRun": now,
            "source": "중앙선거관리위원회 후보자 정보 API",
            "sourceUrl": DATA_GO_KR_SOURCE_URL,
            "officialUrl": OFFICIAL_CANDIDATE_INFO_URL,
            "sgId": SG_ID,
            "officialSyncMode": "replace_registered_proportional_candidates",
            "officialCounts": {
                "councilProportional": len(council_registered),
                "localCouncilProportional": len(local_registered),
            },
            "note": "선관위 정식 후보자 등록현황의 등록 후보만 반영합니다.",
        },
        "council_proportional": council_data,
        "local_council_proportional": local_data,
    }

    validate_generated(output, len(council_registered), len(local_registered))
    return output, council_unmatched + local_unmatched


def print_summary(data, unmatched):
    council_count, local_count = count_candidates(data)
    council_regions = {
        region_key: sum(len(party.get("candidates", [])) for party in region.get("parties", []))
        for region_key, region in data["council_proportional"].items()
    }
    local_regions = {
        region_key: sum(
            len(party.get("candidates", []))
            for sigungu in region.get("sigungus", {}).values()
            for party in sigungu.get("parties", [])
        )
        for region_key, region in data["local_council_proportional"].items()
    }

    print("\n[SUMMARY]")
    print(f"  광역의원 비례대표 후보: {council_count}명")
    print(f"  기초의원 비례대표 후보: {local_count}명")
    print("  광역비례 지역별:", ", ".join(f"{k}={v}" for k, v in council_regions.items() if v))
    print("  기초비례 지역별:", ", ".join(f"{k}={v}" for k, v in local_regions.items() if v))
    if unmatched:
        print(f"  미매칭 원본: {len(unmatched)}건")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 결과만 검증")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("NEC_API_KEY")
    if not api_key:
        raise SystemExit("NEC_API_KEY가 필요합니다. .env 또는 환경변수에 설정하세요.")

    data, unmatched = build_dataset(api_key)
    print_summary(data, unmatched)

    if args.dry_run:
        print("\n[DRY-RUN] 파일을 쓰지 않았습니다.")
        return

    write_json(OUTPUT_FILE, data)
    print(f"\n[WRITE] {OUTPUT_FILE.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
