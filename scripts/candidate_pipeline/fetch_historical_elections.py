#!/usr/bin/env python3
"""
역대 전국동시지방선거 투개표 + 당선인 데이터 수집 (공공데이터포털 API)

공공데이터포털 선관위 API에서 제3회~제8회 지방선거의 실제 데이터를 수집하여
data/static/historical_elections.json을 팩트 기반으로 재구축합니다.

수집 데이터:
  1. 코드 정보 — 선거ID, 선거구 목록
  2. 투표 현황 — 시도별 투표율, 선거인수, 투표자수
  3. 개표 현황 — 후보별 득표수/득표율
  4. 당선인 정보 — 당선자 성명, 정당, 득표수, 득표율

사용법:
  python scripts/candidate_pipeline/fetch_historical_elections.py
  python scripts/candidate_pipeline/fetch_historical_elections.py --type governor
  python scripts/candidate_pipeline/fetch_historical_elections.py --election 20220601
  python scripts/candidate_pipeline/fetch_historical_elections.py --dry-run

환경변수:
  NEC_API_KEY: 공공데이터포털 인증키 (필수, .env에서 자동 로드)
"""

import json
import os
import sys
import time
import argparse
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"
OUTPUT_DIR = BASE_DIR / "data" / "static"

# ── 선관위 API 엔드포인트 ──
NEC_API_BASE = "http://apis.data.go.kr/9760000"
CODE_SERVICE = f"{NEC_API_BASE}/CommonCodeService"
VOTE_SERVICE = f"{NEC_API_BASE}/VoteXmntckInfoInqireService2"
WINNER_SERVICE = f"{NEC_API_BASE}/WinnerInfoInqireService2"

# ── 역대 전국동시지방선거 ID (선거일 YYYYMMDD) ──
LOCAL_ELECTIONS = {
    "19950627": {"name": "제1회 전국동시지방선거", "year": 1995, "nth": 1},
    "19980604": {"name": "제2회 전국동시지방선거", "year": 1998, "nth": 2},
    "20020613": {"name": "제3회 전국동시지방선거", "year": 2002, "nth": 3},
    "20060531": {"name": "제4회 전국동시지방선거", "year": 2006, "nth": 4},
    "20100602": {"name": "제5회 전국동시지방선거", "year": 2010, "nth": 5},
    "20140604": {"name": "제6회 전국동시지방선거", "year": 2014, "nth": 6},
    "20180613": {"name": "제7회 전국동시지방선거", "year": 2018, "nth": 7},
    "20220601": {"name": "제8회 전국동시지방선거", "year": 2022, "nth": 8},
}

# ── 선거종류코드 (공공데이터포털 API 기준) ──
SG_TYPECODES = {
    "governor":       "3",   # 시도지사
    "mayor":          "4",   # 구시군의장
    "council":        "5",   # 시도의원 지역구
    "localCouncil":   "6",   # 구시군의원 지역구
    "superintendent": "11",  # 교육감 (제5회/2010부터)
}

# ── 시도명 → 프로젝트 키 ──
REGION_MAP = {
    "서울특별시": "seoul", "부산광역시": "busan", "대구광역시": "daegu",
    "인천광역시": "incheon", "광주광역시": "gwangju", "대전광역시": "daejeon",
    "울산광역시": "ulsan", "세종특별자치시": "sejong", "경기도": "gyeonggi",
    "강원특별자치도": "gangwon", "강원도": "gangwon",
    "충청북도": "chungbuk", "충청남도": "chungnam",
    "전라북도": "jeonbuk", "전북특별자치도": "jeonbuk",
    "전라남도": "jeonnam", "경상북도": "gyeongbuk",
    "경상남도": "gyeongnam", "제주특별자치도": "jeju", "제주도": "jeju",
}

# ── 정당명 정규화 ──
PARTY_NORMALIZE = {
    # 더불어민주당 계열
    "더불어민주당": "democratic", "민주당": "democratic",
    "새정치민주연합": "democratic", "민주통합당": "democratic",
    "대통합민주신당": "democratic", "열린우리당": "democratic",
    "새천년민주당": "democratic",
    # 국민의힘 계열
    "국민의힘": "ppp", "자유한국당": "ppp", "새누리당": "ppp",
    "한나라당": "ppp", "자유민주연합": "ppp",
    # 기타
    "국민의당": "peopleparty", "바른미래당": "bareunmirae",
    "정의당": "justice", "진보당": "progressive",
    "무소속": "independent",
}

REQUEST_DELAY = 0.3  # API 호출 간 딜레이 (초)


def load_env():
    """환경변수 로드 (.env 파일)"""
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def api_call(url, max_retries=3):
    """API 호출 + 재시도 + XML 파싱"""
    for attempt in range(max_retries):
        try:
            resp = urllib.request.urlopen(url, timeout=30)
            body = resp.read().decode("utf-8")
            root = ET.fromstring(body)

            result_code = root.findtext(".//resultCode", "")
            # INFO-00 = 정상, INFO-200 = 정상 (데이터 있음)
            if result_code not in ("00", "INFO-00", "INFO-200", ""):
                msg = root.findtext(".//resultMsg", "Unknown error")
                if "데이터 정보가 없습니다" in msg:
                    return [], 0
                print(f"  [API 에러] {result_code}: {msg}")
                return None

            items = root.findall(".//item")
            total_count = int(root.findtext(".//totalCount", "0"))
            return items, total_count

        except Exception as e:
            if attempt < max_retries - 1:
                print(f"  [재시도 {attempt+1}/{max_retries}] {e}")
                time.sleep(1)
            else:
                print(f"  [실패] {e}")
                return None
    return None


def fetch_all_pages(base_url, api_key, params, label=""):
    """페이지네이션으로 전체 데이터 수집"""
    all_items = []
    page = 1
    total = None

    while True:
        params_copy = dict(params)
        params_copy["pageNo"] = str(page)
        params_copy["numOfRows"] = "100"
        params_copy["resultType"] = "xml"
        qs = urllib.parse.urlencode(params_copy)
        url = f"{base_url}?serviceKey={urllib.parse.quote(api_key, safe='')}&{qs}"

        result = api_call(url)
        if result is None:
            break

        items, total_count = result
        if total is None:
            total = total_count

        if not items:
            break

        all_items.extend(items)

        if len(all_items) >= total:
            break

        page += 1
        time.sleep(REQUEST_DELAY)

    if label:
        print(f"  {label}: {len(all_items)}건 수집 (총 {total or 0}건)")
    return all_items


def normalize_party(name):
    """정당명 → 프로젝트 키"""
    if not name:
        return "independent"
    for key, val in PARTY_NORMALIZE.items():
        if key in name:
            return val
    return name


def region_key(sd_name):
    """시도명 → 프로젝트 리전 키"""
    if not sd_name:
        return None
    return REGION_MAP.get(sd_name.strip(), sd_name.strip())


def fetch_vote_status(api_key, sg_id, sg_typecode):
    """투표 현황 (시도별 투표율)"""
    params = {"sgId": sg_id, "sgTypecode": sg_typecode}
    items = fetch_all_pages(
        f"{VOTE_SERVICE}/getVoteSttusInfoInqire",
        api_key, params,
        label=f"투표현황 sgId={sg_id} type={sg_typecode}"
    )

    results = []
    for item in items:
        sd = item.findtext("sdName", "").strip()
        if not sd or sd == "합계" or sd == "전국":
            # 전국 합계도 저장
            results.append({
                "region": "national" if (sd in ("합계", "전국")) else region_key(sd),
                "sdName": sd,
                "totalVoters": int(item.findtext("totSunsu", "0").replace(",", "")),
                "totalVoted": int(item.findtext("totTusu", "0").replace(",", "")),
                "turnout": float(item.findtext("turnout", "0") or "0"),
            })
        else:
            results.append({
                "region": region_key(sd),
                "sdName": sd,
                "totalVoters": int(item.findtext("totSunsu", "0").replace(",", "")),
                "totalVoted": int(item.findtext("totTusu", "0").replace(",", "")),
                "turnout": float(item.findtext("turnout", "0") or "0"),
            })
    return results


def fetch_winners(api_key, sg_id, sg_typecode):
    """당선인 정보 수집"""
    params = {"sgId": sg_id, "sgTypecode": sg_typecode}
    items = fetch_all_pages(
        f"{WINNER_SERVICE}/getWinnerInfoInqire",
        api_key, params,
        label=f"당선인 sgId={sg_id} type={sg_typecode}"
    )

    results = []
    for item in items:
        sd = item.findtext("sdName", "").strip()
        wiw = item.findtext("wiwName", "").strip()
        results.append({
            "region": region_key(sd),
            "sdName": sd,
            "wiwName": wiw,
            "sggName": item.findtext("sggName", "").strip(),
            "name": item.findtext("name", "").strip(),
            "party": item.findtext("jdName", "").strip(),
            "partyKey": normalize_party(item.findtext("jdName", "").strip()),
            "giho": item.findtext("giho", "").strip(),
            "votes": int(item.findtext("dugsu", "0").replace(",", "")),
            "voteRate": float(item.findtext("dugyul", "0") or "0"),
            "gender": item.findtext("gender", "").strip(),
            "age": item.findtext("age", "").strip(),
        })
    return results


def fetch_count_results(api_key, sg_id, sg_typecode):
    """개표 현황 (후보별 득표)"""
    params = {"sgId": sg_id, "sgTypecode": sg_typecode}
    items = fetch_all_pages(
        f"{VOTE_SERVICE}/getXmntckSttusInfoInqire",
        api_key, params,
        label=f"개표현황 sgId={sg_id} type={sg_typecode}"
    )

    results = []
    for item in items:
        sd = item.findtext("sdName", "").strip()
        entry = {
            "region": region_key(sd),
            "sdName": sd,
            "wiwName": item.findtext("wiwName", "").strip(),
            "sggName": item.findtext("sggName", "").strip(),
        }
        # 후보별 득표 (giho1~gihoN)
        candidates = []
        for i in range(1, 20):
            name = item.findtext(f"jdName{i}", "").strip()
            votes = item.findtext(f"dugsu{i}", "").replace(",", "").strip()
            if name and votes:
                candidates.append({
                    "party": name,
                    "partyKey": normalize_party(name),
                    "votes": int(votes) if votes.isdigit() else 0,
                })
        entry["candidates"] = candidates
        results.append(entry)
    return results


def build_historical_data(api_key, election_types, election_ids, dry_run=False):
    """전체 역대 선거 데이터 구축"""
    output = {
        "_meta": {
            "source": "공공데이터포털 선관위 API (apis.data.go.kr/9760000)",
            "lastUpdated": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            "description": "역대 전국동시지방선거 투개표·당선인 실데이터",
            "elections": {},
        },
        "elections": {},
    }

    for sg_id, info in LOCAL_ELECTIONS.items():
        if election_ids and sg_id not in election_ids:
            continue

        nth = info["nth"]
        year = info["year"]
        name = info["name"]
        print(f"\n{'='*60}")
        print(f"📊 {name} ({year}) — sgId={sg_id}")
        print(f"{'='*60}")

        election_data = {
            "sgId": sg_id,
            "name": name,
            "year": year,
            "nth": nth,
            "types": {},
        }

        for type_name, typecode in SG_TYPECODES.items():
            if election_types and type_name not in election_types:
                continue

            # 교육감은 4회(2010)부터
            if type_name == "superintendent" and nth < 5:
                continue
            # 세종시는 6회(2014)부터
            # (API가 알아서 처리)

            print(f"\n  ── {type_name} (sgTypecode={typecode}) ──")

            if dry_run:
                print(f"  [DRY-RUN] 스킵")
                continue

            type_data = {}

            # 1) 투표 현황
            try:
                vote_status = fetch_vote_status(api_key, sg_id, typecode)
                type_data["voteStatus"] = vote_status
                time.sleep(REQUEST_DELAY)
            except Exception as e:
                print(f"  [투표현황 에러] {e}")
                type_data["voteStatus"] = []

            # 2) 당선인 정보
            try:
                winners = fetch_winners(api_key, sg_id, typecode)
                type_data["winners"] = winners
                time.sleep(REQUEST_DELAY)
            except Exception as e:
                print(f"  [당선인 에러] {e}")
                type_data["winners"] = []

            # 3) 요약 통계
            national_vote = [v for v in type_data["voteStatus"]
                           if v["region"] == "national"]
            if national_vote:
                type_data["nationalTurnout"] = national_vote[0]["turnout"]

            # 정당별 당선자 수
            party_wins = {}
            for w in type_data["winners"]:
                pk = w["partyKey"]
                party_wins[pk] = party_wins.get(pk, 0) + 1
            type_data["partyWins"] = party_wins
            type_data["totalWinners"] = len(type_data["winners"])

            election_data["types"][type_name] = type_data
            print(f"  ✅ {type_name}: 투표현황 {len(type_data['voteStatus'])}건, "
                  f"당선인 {len(type_data['winners'])}건")

        output["elections"][sg_id] = election_data
        output["_meta"]["elections"][sg_id] = {
            "name": name, "year": year, "nth": nth
        }

    return output


def build_summary(full_data):
    """프론트엔드용 요약 데이터 생성 (historical_elections.json 호환)"""
    summary = {
        "_meta": {
            "source": "공공데이터포털 선관위 API — 팩트 데이터",
            "lastUpdated": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            "note": "역대 전국동시지방선거 시도별 당선 정당·투표율 요약",
        },
        "regions": {},
    }

    # 지역별로 정리
    regions = set()
    for sg_id, election in full_data["elections"].items():
        for type_name, type_data in election.get("types", {}).items():
            for w in type_data.get("winners", []):
                if w["region"] and w["region"] != "national":
                    regions.add(w["region"])

    for region in sorted(regions):
        region_history = []
        for sg_id in sorted(LOCAL_ELECTIONS.keys()):
            election = full_data["elections"].get(sg_id)
            if not election:
                continue

            entry = {
                "year": election["year"],
                "nth": election["nth"],
                "sgId": sg_id,
            }

            # 광역단체장 당선인
            gov_data = election.get("types", {}).get("governor", {})
            gov_winners = [w for w in gov_data.get("winners", [])
                          if w["region"] == region]
            if gov_winners:
                w = gov_winners[0]
                entry["governor"] = {
                    "name": w["name"],
                    "party": w["party"],
                    "partyKey": w["partyKey"],
                    "votes": w["votes"],
                    "voteRate": w["voteRate"],
                }

            # 투표율
            gov_vote = [v for v in gov_data.get("voteStatus", [])
                       if v["region"] == region]
            if gov_vote:
                entry["turnout"] = gov_vote[0]["turnout"]

            # 교육감 당선인
            sup_data = election.get("types", {}).get("superintendent", {})
            sup_winners = [w for w in sup_data.get("winners", [])
                          if w["region"] == region]
            if sup_winners:
                w = sup_winners[0]
                entry["superintendent"] = {
                    "name": w["name"],
                    "party": w["party"],
                    "partyKey": w["partyKey"],
                }

            if len(entry) > 3:  # year, nth, sgId 외에 데이터가 있으면
                region_history.append(entry)

        if region_history:
            summary["regions"][region] = region_history

    return summary


def main():
    parser = argparse.ArgumentParser(
        description="역대 전국동시지방선거 데이터 수집 (공공데이터포털 API)"
    )
    parser.add_argument("--type", nargs="+",
                       choices=list(SG_TYPECODES.keys()),
                       help="수집할 선거 유형 (미지정 시 전체)")
    parser.add_argument("--election", nargs="+",
                       choices=list(LOCAL_ELECTIONS.keys()),
                       help="수집할 선거 ID (미지정 시 전체)")
    parser.add_argument("--dry-run", action="store_true",
                       help="실제 API 호출 없이 계획만 출력")
    parser.add_argument("--output", default=None,
                       help="출력 파일 경로 (기본: data/static/)")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("NEC_API_KEY")
    if not api_key:
        print("❌ NEC_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")
        sys.exit(1)

    print("🗳️  역대 전국동시지방선거 데이터 수집")
    print(f"  API 키: {api_key[:8]}...{api_key[-4:]}")
    print(f"  대상 선거: {', '.join(args.election) if args.election else '전체 (3~8회)'}")
    print(f"  대상 유형: {', '.join(args.type) if args.type else '전체'}")
    if args.dry_run:
        print("  ⚠️  DRY-RUN 모드")

    # 수집
    full_data = build_historical_data(
        api_key,
        election_types=args.type,
        election_ids=args.election,
        dry_run=args.dry_run,
    )

    if args.dry_run:
        print("\n[DRY-RUN] 완료. 실제 수집은 --dry-run 플래그를 제거하세요.")
        return

    # 저장 — 전체 데이터
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    full_path = OUTPUT_DIR / "historical_elections_full.json"
    with open(full_path, "w", encoding="utf-8") as f:
        json.dump(full_data, f, ensure_ascii=False, indent=2)
    print(f"\n💾 전체 데이터 저장: {full_path}")

    # 저장 — 프론트엔드용 요약
    summary = build_summary(full_data)
    summary_path = OUTPUT_DIR / "historical_elections.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"💾 요약 데이터 저장: {summary_path}")

    # 통계 출력
    total_winners = 0
    total_vote_records = 0
    for sg_id, election in full_data["elections"].items():
        for type_data in election.get("types", {}).values():
            total_winners += len(type_data.get("winners", []))
            total_vote_records += len(type_data.get("voteStatus", []))

    print(f"\n📈 수집 완료:")
    print(f"  당선인 데이터: {total_winners:,}건")
    print(f"  투표현황 데이터: {total_vote_records:,}건")
    print(f"  대상 선거: {len(full_data['elections'])}회")


if __name__ == "__main__":
    main()
