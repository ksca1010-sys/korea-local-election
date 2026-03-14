#!/usr/bin/env python3
"""
선거 통계(election_stats.json) 자동 갱신 스크립트

선관위 공공데이터 API를 호출하여 선거구 수, 의석수 등을 자동으로 수집합니다.
- 공공데이터포털 선관위 코드정보 API: 선거구 목록 조회
- 공공데이터포털 선관위 후보자 API: 선거구별 후보자 수 → 선거구 수 역산
- 선거구 획정이 확정되지 않은 경우 기존 데이터 유지

사용법:
  python scripts/fetch_election_stats.py
  python scripts/fetch_election_stats.py --dry-run   # API 호출만, 파일 미수정

환경변수:
  NEC_API_KEY: 공공데이터포털 인증키 (data.go.kr에서 발급)
"""

import json
import os
import sys
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
STATS_FILE = PROJECT_ROOT / "data" / "election_stats.json"
ENV_FILE = PROJECT_ROOT / ".env"

# 선관위 공공데이터 API
NEC_API_BASE = "http://apis.data.go.kr/9760000"
CODE_SERVICE = f"{NEC_API_BASE}/CommonCodeService"
CANDIDATE_SERVICE = f"{NEC_API_BASE}/PofelcddInfoInqireService"

# 제9회 지방선거 ID (2026.06.03)
SG_ID = "20260603"

# 선거종류코드 (sgTypecode) - 선관위 API 기준
SG_TYPE_CODES = {
    "governor":       "3",    # 시·도지사선거
    "mayor":          "4",    # 구·시·군의 장선거
    "council":        "5",    # 시·도의회의원선거 (지역구)
    "localCouncil":   "6",    # 구·시·군의회의원선거 (지역구)
    "superintendent": "11",   # 교육감선거
    "councilProportional":      "8",   # 광역의원비례대표선거
    "localCouncilProportional": "9",   # 기초의원비례대표선거
    "byElection":     "2",    # 국회의원선거 (재보궐)
}

# 선거종류코드 → 한국어명
SG_TYPE_NAMES = {
    "governor": "광역단체장",
    "mayor": "기초단체장",
    "council": "광역의원",
    "localCouncil": "기초의원",
    "superintendent": "교육감",
    "councilProportional": "광역의원 비례대표",
    "localCouncilProportional": "기초의원 비례대표",
    "byElection": "재보궐선거",
}


def load_env():
    """Load .env file if present"""
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def load_existing():
    """기존 election_stats.json 로드"""
    if STATS_FILE.exists():
        return json.loads(STATS_FILE.read_text(encoding="utf-8"))
    return None


def call_nec_api(endpoint, params, api_key):
    """
    선관위 API 호출 (XML 응답 파싱)

    Returns: (items, totalCount) tuple
      - items: list of dict (각 item의 하위 요소를 딕셔너리로 변환)
      - totalCount: int (API가 보고하는 전체 건수)
    """
    params["numOfRows"] = params.get("numOfRows", "1000")
    params["pageNo"] = params.get("pageNo", "1")
    params["resultType"] = "xml"

    # serviceKey는 이미 인코딩된 상태로 전달해야 함 (quote 처리)
    qs = urllib.parse.urlencode(params)
    url = f"{endpoint}?serviceKey={urllib.parse.quote(api_key, safe='')}&{qs}"

    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read().decode("utf-8")
    except Exception as e:
        print(f"  [오류] API 호출 실패: {e}")
        return None, 0

    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        print(f"  [오류] XML 파싱 실패")
        return None, 0

    # 에러 확인
    result_code = root.findtext(".//resultCode") or root.findtext(".//result_code")
    if result_code and result_code not in ("00", "INFO-000", "INFO-00"):
        result_msg = root.findtext(".//resultMsg") or root.findtext(".//result_msg") or ""
        print(f"  [오류] API 오류: {result_code} - {result_msg}")
        return None, 0

    # totalCount 추출 (API 응답의 전체 건수, 페이징 무관)
    total_count = int(root.findtext(".//totalCount") or "0")

    # item 추출
    items = []
    for item in root.iter("item"):
        row = {}
        for child in item:
            row[child.tag] = child.text or ""
        items.append(row)

    return items, total_count


def fetch_district_count(sg_typecode, api_key):
    """
    코드정보 API로 선거구 수 조회 (totalCount 활용)

    엔드포인트: getCommonSggCodeList (선거구코드 목록)
    totalCount가 실제 전체 선거구 수를 반환 (페이징 무관)
    """
    endpoint = f"{CODE_SERVICE}/getCommonSggCodeList"
    params = {
        "sgId": SG_ID,
        "sgTypecode": sg_typecode,
    }

    items, total_count = call_nec_api(endpoint, params, api_key)
    if items is None:
        return None

    # totalCount 우선 사용 (API가 보고하는 전체 건수)
    if total_count > 0:
        return total_count

    return None


# API totalCount가 우리 표시값과 동일 메트릭인 선거종류
# (선거구 수 = 표시 수)
DIRECT_COUNT_TYPES = {"governor", "mayor", "council", "superintendent", "byElection"}

# API totalCount가 다른 메트릭인 선거종류:
#   localCouncil: API=선거구 수(중선거구), 표시=의석 수
#   councilProportional: API=시도 수, 표시=총 의석 수
#   localCouncilProportional: API=시군구 수, 표시=총 의석 수
INDIRECT_COUNT_TYPES = {"localCouncil", "councilProportional", "localCouncilProportional"}


def fetch_all_stats(api_key):
    """모든 선거종류에 대해 선거구 수 조회"""
    results = {}

    for type_key, sg_code in SG_TYPE_CODES.items():
        type_name = SG_TYPE_NAMES[type_key]
        print(f"  [{type_key}] {type_name} (sgTypecode={sg_code}) 조회 중...")

        count = fetch_district_count(sg_code, api_key)

        if count and count > 0:
            if type_key in DIRECT_COUNT_TYPES:
                print(f"    → {count}개 (직접 반영)")
                results[type_key] = count
            else:
                # 간접 메트릭: 선거구 수 ≠ 의석 수
                # API 값을 참고용으로 출력하되, 기존 의석 수는 유지
                print(f"    → API 선거구 수: {count}개 (의석 수와 다른 메트릭, 기존값 유지)")
                results[type_key] = None
        else:
            print(f"    → 데이터 없음 (선거구 획정 미확정 또는 API 미공개)")
            results[type_key] = None

    return results


def update_stats_file(api_results, existing, dry_run=False):
    """
    API 결과로 election_stats.json 업데이트

    규칙:
    - API에서 유효한 값이 있으면 → 업데이트
    - API에서 None이면 → 기존 값 유지
    - 변경이 있으면 lastUpdated 갱신
    """
    if not existing:
        print("[오류] 기존 election_stats.json이 없습니다.")
        return False

    changed = False
    election_types = existing.get("electionTypes", {})

    for type_key, new_count in api_results.items():
        if new_count is None:
            continue

        current = election_types.get(type_key, {})
        old_count = current.get("count")

        if old_count != new_count:
            print(f"  [변경] {SG_TYPE_NAMES[type_key]}: {old_count} → {new_count}")
            current["count"] = new_count
            changed = True

            # detail 텍스트 내 숫자도 갱신
            if old_count and current.get("detail"):
                current["detail"] = current["detail"].replace(
                    f"{old_count}개", f"{new_count}개"
                )
        else:
            print(f"  [동일] {SG_TYPE_NAMES[type_key]}: {old_count}")

    # 기초단체장 수 → officialStats.sigungu 동기화
    mayor_count = election_types.get("mayor", {}).get("count")
    if mayor_count and existing.get("officialStats", {}).get("sigungu") != mayor_count:
        existing["officialStats"]["sigungu"] = mayor_count
        changed = True

    # redistrictingStatus 갱신
    any_found = any(v is not None for v in api_results.values())
    if any_found:
        existing.setdefault("redistrictingStatus", {})
        existing["redistrictingStatus"]["lastChecked"] = date.today().isoformat()
        # 모든 선거종류에서 데이터가 있으면 확정으로 판단
        all_found = all(v is not None for v in api_results.values())
        if all_found:
            existing["redistrictingStatus"]["finalized"] = True
            existing["redistrictingStatus"]["note"] = f"선관위 API 기준 선거구 획정 확정 ({date.today().isoformat()})"

    if changed:
        existing["_meta"]["lastUpdated"] = date.today().isoformat()
        existing["_meta"]["source"] = "중앙선거관리위원회 공공데이터 API (자동 갱신)"

        if dry_run:
            print("\n[DRY RUN] 파일 미수정 (변경 사항 있음)")
            print(json.dumps(existing, ensure_ascii=False, indent=2)[:2000])
        else:
            STATS_FILE.write_text(
                json.dumps(existing, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8"
            )
            print(f"\n[저장] {STATS_FILE}")
    else:
        print("\n[변경 없음] 기존 데이터와 동일합니다.")

    return changed


def main():
    load_env()
    api_key = os.environ.get("NEC_API_KEY", "")
    dry_run = "--dry-run" in sys.argv

    if not api_key:
        print("[오류] NEC_API_KEY 환경변수가 설정되지 않았습니다.")
        print("   1. https://www.data.go.kr 에서 회원가입")
        print("   2. '중앙선거관리위원회 코드정보' API 활용 신청")
        print("   3. .env 파일에 NEC_API_KEY=발급받은키 추가")
        sys.exit(1)

    print("=" * 60)
    print("선거 통계 자동 갱신 (선관위 공공데이터 API)")
    print(f"실행 시각: {date.today().isoformat()}")
    print(f"선거ID: {SG_ID} (제9회 전국동시지방선거)")
    if dry_run:
        print("[DRY RUN 모드]")
    print("=" * 60)

    # 기존 데이터 로드
    existing = load_existing()
    if not existing:
        print("[오류] data/election_stats.json 파일을 찾을 수 없습니다.")
        sys.exit(1)

    print(f"\n현재 데이터 기준일: {existing.get('_meta', {}).get('lastUpdated', '?')}")
    print()

    # API 조회
    print("[1/2] 선관위 API에서 선거구 수 조회...")
    api_results = fetch_all_stats(api_key)

    # 결과 적용
    print("\n[2/2] 결과 반영...")
    update_stats_file(api_results, existing, dry_run=dry_run)

    print("\n" + "=" * 60)
    found = sum(1 for v in api_results.values() if v is not None)
    print(f"조회 완료: {found}/{len(api_results)} 선거종류 데이터 확인")
    print("=" * 60)


if __name__ == "__main__":
    main()
