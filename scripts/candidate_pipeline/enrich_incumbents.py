#!/usr/bin/env python3
"""
현직자 정보 보강 — 8회 당선인 + 보궐 API + 현재 상태 교차 검증

역할:
  1. historical_elections_full.json에서 8회(2022) 당선인 추출
  2. 선관위 보궐선거 당선인 API로 궐위/교체 자동 감지 (2023~현재)
  3. governor_status.json / mayor_status.json / superintendent.json의 현직 상태와 대조
  4. 현직 여부(isIncumbent), 소속정당 변경, 사퇴/직무대행 반영
  5. data/static/incumbents.json 생성 — 프론트엔드에서 현직자 표시에 사용

사용법:
  python scripts/candidate_pipeline/enrich_incumbents.py
  python scripts/candidate_pipeline/enrich_incumbents.py --dry-run
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = DATA_DIR / "static"
CANDIDATES_DIR = DATA_DIR / "candidates"
ENV_FILE = BASE_DIR / ".env"

NEC_API_BASE = "http://apis.data.go.kr/9760000"
WINNER_SERVICE = f"{NEC_API_BASE}/WinnerInfoInqireService2"

# 8회 이후 보궐선거 일정 (sgId)
BYELECTION_DATES = [
    "20230405",  # 2023 보궐
    "20240410",  # 2024 총선 동시 보궐
    "20241016",  # 2024.10 보궐
]

REGION_MAP = {
    "서울특별시": "seoul", "부산광역시": "busan", "대구광역시": "daegu",
    "인천광역시": "incheon", "광주광역시": "gwangju", "대전광역시": "daejeon",
    "울산광역시": "ulsan", "세종특별자치시": "sejong", "경기도": "gyeonggi",
    "강원특별자치도": "gangwon", "강원도": "gangwon",
    "충청북도": "chungbuk", "충청남도": "chungnam",
    "전북특별자치도": "jeonbuk", "전라북도": "jeonbuk",
    "전라남도": "jeonnam", "경상북도": "gyeongbuk",
    "경상남도": "gyeongnam", "제주특별자치도": "jeju", "제주도": "jeju",
}

REGION_NAMES_KR = {
    "seoul": "서울", "busan": "부산", "daegu": "대구",
    "incheon": "인천", "gwangju": "광주", "daejeon": "대전",
    "ulsan": "울산", "sejong": "세종", "gyeonggi": "경기",
    "gangwon": "강원", "chungbuk": "충북", "chungnam": "충남",
    "jeonbuk": "전북", "jeonnam": "전남", "gyeongbuk": "경북",
    "gyeongnam": "경남", "jeju": "제주",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def fetch_byelection_winners(api_key):
    """보궐선거 당선인 API로 8회 이후 궐위/교체 자동 감지"""
    replacements = {
        "governor": {},      # region → winner
        "mayor": {},         # region_district → winner
        "superintendent": {},# region → winner
    }

    typecode_map = {
        "3": "governor",
        "4": "mayor",
        "11": "superintendent",
    }

    print("\n🔍 보궐선거 당선인 API 조회 (8회 이후 궐위 자동 감지)")

    for sg_id in BYELECTION_DATES:
        for typecode, type_name in typecode_map.items():
            params = {
                "sgId": sg_id,
                "sgTypecode": typecode,
                "numOfRows": "100",
                "resultType": "xml",
            }
            qs = urllib.parse.urlencode(params)
            url = (f"{WINNER_SERVICE}/getWinnerInfoInqire?"
                   f"serviceKey={urllib.parse.quote(api_key, safe='')}&{qs}")

            try:
                resp = urllib.request.urlopen(url, timeout=15)
                body = resp.read().decode("utf-8")
                root = ET.fromstring(body)
                total = int(root.findtext(".//totalCount", "0"))

                if total > 0:
                    items = root.findall(".//item")
                    for item in items:
                        sd = item.findtext("sdName", "").strip()
                        wiw = item.findtext("wiwName", "").strip()
                        name = item.findtext("name", "").strip()
                        party = item.findtext("jdName", "").strip()
                        region = REGION_MAP.get(sd, sd)

                        winner_info = {
                            "name": name,
                            "party": party,
                            "sgId": sg_id,
                            "sdName": sd,
                            "wiwName": wiw,
                            "byelectionDate": f"{sg_id[:4]}-{sg_id[4:6]}-{sg_id[6:8]}",
                        }

                        if type_name == "mayor":
                            key = f"{region}_{wiw}"
                            replacements["mayor"][key] = winner_info
                        else:
                            replacements[type_name][region] = winner_info

                        print(f"  [{sg_id}] {type_name}: {sd} {wiw} → {name} ({party})")

            except Exception:
                pass
            time.sleep(0.3)

    total_found = sum(len(v) for v in replacements.values())
    print(f"  보궐 당선인 {total_found}건 감지\n")
    return replacements


def load_json(path):
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_8th_winners(full_data):
    """8회(2022) 당선인 추출"""
    election = full_data.get("elections", {}).get("20220601", {})
    winners = {}
    for type_name, type_data in election.get("types", {}).items():
        winners[type_name] = type_data.get("winners", [])
    return winners


def enrich_governors(api_winners, status_data, regions_data, byelection_replacements=None):
    """광역단체장 현직 정보 보강"""
    byelections = byelection_replacements or {}
    results = {}
    governors = status_data.get("governors", {})

    for winner in api_winners:
        region = winner["region"]
        if not region or region == "national":
            continue

        status_info = governors.get(region, {})
        regions_info = {}
        for r in regions_data:
            if r.get("id") == region:
                regions_info = r.get("currentGovernor", {})
                break

        # 보궐선거 API로 교체 확인
        bye = byelections.get(region)
        is_incumbent = True
        current_party = winner["partyKey"]
        current_name = winner["name"]
        resigned = False
        acting = False
        acting_reason = None
        replaced_by_byelection = None

        if bye:
            is_incumbent = False
            current_name = bye["name"]
            resigned = True
            replaced_by_byelection = bye

        # status에서 현재 상태 확인
        if status_info:
            status_name = status_info.get("name", "")
            status_party = status_info.get("party", "")
            elected_name = status_info.get("electedName", status_info.get("name", ""))

            # 사퇴한 경우 (name이 null이거나 다른 사람)
            if not status_name or (elected_name and elected_name != winner["name"]):
                # 보궐이나 대행 가능
                if status_info.get("acting"):
                    acting = True
                    acting_reason = status_info.get("actingReason", "")
                    is_incumbent = False
                elif status_name and status_name != winner["name"]:
                    # 보궐 당선자
                    is_incumbent = False
                    current_name = status_name
                    current_party = status_party

            # 소속정당 변경 확인
            if status_party and status_party != winner["partyKey"]:
                current_party = status_party

        entry = {
            "electedName": winner["name"],
            "electedParty": winner["party"],
            "electedPartyKey": winner["partyKey"],
            "electedVotes": winner["votes"],
            "electedVoteRate": winner["voteRate"],
            "currentName": current_name,
            "currentPartyKey": current_party,
            "isIncumbent": is_incumbent,
            "resigned": resigned,
            "acting": acting,
            "actingReason": acting_reason,
            "electionYear": 2022,
            "position": "광역단체장",
        }
        if replaced_by_byelection:
            entry["replacedByByelection"] = replaced_by_byelection
        results[region] = entry

    return results


def enrich_mayors(api_winners, status_data, byelection_replacements=None):
    """기초단체장 현직 정보 보강"""
    byelections = byelection_replacements or {}
    results = {}
    mayors = status_data.get("mayors", {})

    for winner in api_winners:
        region = winner["region"]
        wiw = winner["wiwName"]
        if not region or not wiw:
            continue

        status_key = f"{region}_{wiw}"
        status_info = mayors.get(status_key, {})

        # 보궐선거 API로 교체 확인
        bye = byelections.get(status_key)
        is_incumbent = True
        current_party = winner["partyKey"]
        current_name = winner["name"]
        acting = False
        acting_reason = None
        replaced_by_byelection = None

        if bye:
            is_incumbent = False
            current_name = bye["name"]
            replaced_by_byelection = bye

        if status_info:
            elected_name = status_info.get("electedName", status_info.get("name", ""))

            if status_info.get("acting"):
                acting = True
                acting_reason = status_info.get("actingReason", "")
                is_incumbent = False
            elif status_info.get("name") and status_info["name"] != winner["name"]:
                is_incumbent = False
                current_name = status_info["name"]

            if status_info.get("party") and status_info["party"] != winner["partyKey"]:
                current_party = status_info["party"]

        entry = {
            "region": region,
            "district": wiw,
            "electedName": winner["name"],
            "electedParty": winner["party"],
            "electedPartyKey": winner["partyKey"],
            "electedVotes": winner["votes"],
            "electedVoteRate": winner["voteRate"],
            "currentName": current_name,
            "currentPartyKey": current_party,
            "isIncumbent": is_incumbent,
            "acting": acting,
            "actingReason": acting_reason,
            "electionYear": 2022,
            "position": "기초단체장",
        }
        if replaced_by_byelection:
            entry["replacedByByelection"] = replaced_by_byelection
        results[status_key] = entry

    return results


def enrich_superintendents(api_winners, superintendent_data):
    """교육감 현직 정보 보강"""
    results = {}
    candidates = superintendent_data.get("candidates", {})

    for winner in api_winners:
        region = winner["region"]
        if not region or region == "national":
            continue

        is_incumbent = True
        current_name = winner["name"]

        # 교육감 후보자 데이터에서 현직 확인
        region_candidates = candidates.get(region, [])
        for c in region_candidates:
            if c.get("dataSource") == "incumbent":
                if c["name"] != winner["name"]:
                    # 보궐 등으로 교육감 교체
                    is_incumbent = False
                    current_name = c["name"]
                break

        results[region] = {
            "electedName": winner["name"],
            "electedParty": winner["party"],
            "electedPartyKey": winner["partyKey"],
            "currentName": current_name,
            "isIncumbent": is_incumbent,
            "electionYear": 2022,
            "position": "교육감",
        }

    return results


def main():
    dry_run = "--dry-run" in sys.argv

    print("🏛️  현직자 정보 보강 — 8회 당선인 × 보궐 API × 현재 상태 교차 검증")

    load_env()
    api_key = os.environ.get("NEC_API_KEY")

    # 데이터 로드
    full_data = load_json(STATIC_DIR / "historical_elections_full.json")
    governor_status = load_json(CANDIDATES_DIR / "governor_status.json")
    mayor_status = load_json(CANDIDATES_DIR / "mayor_status.json")
    superintendent = load_json(CANDIDATES_DIR / "superintendent.json")
    regions = load_json(STATIC_DIR / "regions.json")
    if isinstance(regions, dict):
        regions_list = regions.get("regions", [])
    else:
        regions_list = regions

    # 8회 당선인 추출
    winners_8th = get_8th_winners(full_data)
    if not winners_8th:
        print("❌ 8회 당선인 데이터가 없습니다. fetch_historical_elections.py를 먼저 실행하세요.")
        sys.exit(1)

    print(f"  8회 당선인: governor={len(winners_8th.get('governor', []))}명, "
          f"mayor={len(winners_8th.get('mayor', []))}명, "
          f"superintendent={len(winners_8th.get('superintendent', []))}명")

    # 보궐선거 API로 궐위 자동 감지
    byelection_replacements = {"governor": {}, "mayor": {}, "superintendent": {}}
    if api_key:
        byelection_replacements = fetch_byelection_winners(api_key)
    else:
        print("  ⚠️  NEC_API_KEY 없음 — 보궐 자동 감지 스킵, status 파일만 사용")

    # 보강
    incumbents = {
        "_meta": {
            "source": "8회 지선 당선인(선관위 API) + 현직 상태(뉴스/공식발표)",
            "lastUpdated": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            "description": "현직자 정보 — 당선 시 정당, 현재 정당, 사퇴/대행 여부",
        },
    }

    # 광역단체장
    gov_incumbents = enrich_governors(
        winners_8th.get("governor", []), governor_status, regions_list,
        byelection_replacements.get("governor", {}))
    incumbents["governor"] = gov_incumbents

    # 기초단체장
    mayor_incumbents = enrich_mayors(
        winners_8th.get("mayor", []), mayor_status,
        byelection_replacements.get("mayor", {}))
    incumbents["mayor"] = mayor_incumbents

    # 교육감
    sup_incumbents = enrich_superintendents(
        winners_8th.get("superintendent", []), superintendent)
    incumbents["superintendent"] = sup_incumbents

    # 통계
    gov_resigned = sum(1 for v in gov_incumbents.values() if not v["isIncumbent"])
    gov_acting = sum(1 for v in gov_incumbents.values() if v["acting"])
    gov_party_changed = sum(1 for v in gov_incumbents.values()
                           if v["electedPartyKey"] != v["currentPartyKey"])
    mayor_resigned = sum(1 for v in mayor_incumbents.values() if not v["isIncumbent"])
    mayor_acting = sum(1 for v in mayor_incumbents.values() if v["acting"])
    mayor_party_changed = sum(1 for v in mayor_incumbents.values()
                             if v["electedPartyKey"] != v["currentPartyKey"])

    print(f"\n📊 현직 분석 결과:")
    print(f"  광역단체장: {len(gov_incumbents)}명 중 사퇴/교체 {gov_resigned}명, "
          f"직무대행 {gov_acting}명, 정당변경 {gov_party_changed}명")
    print(f"  기초단체장: {len(mayor_incumbents)}명 중 사퇴/교체 {mayor_resigned}명, "
          f"직무대행 {mayor_acting}명, 정당변경 {mayor_party_changed}명")
    print(f"  교육감: {len(sup_incumbents)}명")

    # 사퇴/대행 상세
    if gov_resigned or gov_acting:
        print(f"\n  [광역단체장 변동]")
        for region, v in gov_incumbents.items():
            if not v["isIncumbent"]:
                reason = f" ({v['actingReason']})" if v["actingReason"] else ""
                status = "직무대행" if v["acting"] else "교체"
                print(f"    {REGION_NAMES_KR.get(region, region)}: "
                      f"{v['electedName']}({v['electedParty']}) → {status}{reason}")

    if mayor_acting:
        print(f"\n  [기초단체장 직무대행]")
        for key, v in mayor_incumbents.items():
            if v["acting"]:
                reason = f" ({v['actingReason']})" if v["actingReason"] else ""
                print(f"    {v['district']}: {v['electedName']} → 직무대행{reason}")

    if dry_run:
        print("\n[DRY-RUN] 파일 저장 스킵")
        return

    # 저장
    output_path = STATIC_DIR / "incumbents.json"
    save_json(output_path, incumbents)
    print(f"\n💾 저장: {output_path}")


if __name__ == "__main__":
    main()
