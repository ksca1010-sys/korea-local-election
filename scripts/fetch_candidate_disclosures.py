#!/usr/bin/env python3
"""
후보자 공보물 정보 수집 (선관위 CandSrchInfoInqireService2)

공보물에 포함된 전과·재산·병역·납세·학력 정보를 수집하여
data/candidates/disclosures.json에 저장합니다.

사용법:
  # 실데이터 수집 (5/16 본후보 등록 마감 후 실행)
  python scripts/fetch_candidate_disclosures.py

  # 특정 선거 유형만
  python scripts/fetch_candidate_disclosures.py --type governor

  # API 연결 테스트 (2022년 데이터로 검증)
  python scripts/fetch_candidate_disclosures.py --dry-run

  # 첫 응답 필드명 출력 (실데이터 수집 후 스키마 검증용)
  python scripts/fetch_candidate_disclosures.py --log-raw

  # UI 개발용 mock 데이터 생성
  python scripts/fetch_candidate_disclosures.py --mock

환경변수:
  NEC_API_KEY: 공공데이터포털 인증키 (필수, --mock 제외)

선관위 API:
  서비스명: CandSrchInfoInqireService2/getCandSrchInfo
  sgId: 20260603 (9대 지선)
  sgTypecode: 3=광역단체장, 4=기초단체장, 11=교육감
"""

import json
import os
import sys
import time
import argparse
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"

# 선관위 API
NEC_API_BASE = "http://apis.data.go.kr/9760000"
DISCLOSURE_SERVICE = f"{NEC_API_BASE}/CandSrchInfoInqireService2"

# 제9회 전국동시지방선거
SG_ID = "20260603"
# 연결 테스트용 (제8회)
SG_ID_DRY = "20220601"

# sgTypecode
SG_TYPECODE = {
    "governor":       "3",   # 광역단체장
    "mayor":          "4",   # 기초단체장
    "superintendent": "11",  # 교육감
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

OUTPUT_PATH = BASE_DIR / "data" / "candidates" / "disclosures.json"


def load_api_key():
    """환경변수 또는 .env 파일에서 NEC_API_KEY 로드"""
    key = os.environ.get("NEC_API_KEY")
    if key:
        return key
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if line.startswith("NEC_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def fetch_xml(url, params):
    """선관위 API 호출 → ElementTree 반환"""
    full_url = url + "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(full_url, timeout=15) as resp:
            raw = resp.read()
        return ET.fromstring(raw), raw
    except Exception as e:
        print(f"  [ERROR] API 호출 실패: {e}", file=sys.stderr)
        return None, None


def parse_criminal(raw_text):
    """
    전과 텍스트 파싱.
    실제 API 필드명은 --log-raw 로 확인 후 조정 필요.
    형식 예: "업무방해(2019.03.15 확정, 벌금 200만원)"
    """
    if not raw_text or raw_text.strip() in ("없음", "해당없음", "0", ""):
        return {"hasRecord": False, "count": 0, "records": [], "rawText": raw_text or "없음"}
    return {"hasRecord": True, "count": 1, "records": [], "rawText": raw_text}


def parse_property(raw_text):
    """재산 텍스트 파싱 (단위: 만원)"""
    if not raw_text:
        return {"totalAmountManWon": None, "rawText": ""}
    # 간단한 추출: 숫자만 파싱하는 로직은 --log-raw로 실제 포맷 확인 후 구현
    return {"totalAmountManWon": None, "rawText": raw_text}


def parse_tax(raw_text):
    """납세 텍스트 파싱"""
    if not raw_text or raw_text.strip() in ("없음", "해당없음", "0", ""):
        return {"arrearsManWon": 0, "hasArrears": False, "rawText": raw_text or "없음"}
    return {"arrearsManWon": None, "hasArrears": True, "rawText": raw_text}


def item_to_disclosure(item):
    """
    XML <item> 요소 → disclosure dict.
    실제 필드명은 --log-raw 로 확인 필요.
    아래 필드명은 NEC API 문서 기준 추정값 — 5/16 이후 --log-raw로 검증.
    """
    def txt(tag):
        el = item.find(tag)
        return el.text.strip() if el is not None and el.text else ""

    name = txt("rhgcandiNm") or txt("name") or txt("candidateName")
    giho_str = txt("giho") or txt("jdgmnPreventCn") or ""
    try:
        giho = int(giho_str)
    except ValueError:
        giho = None

    criminal_raw = txt("crcvrCn") or txt("criminalRecord") or ""
    property_raw = txt("pptyTotValue") or txt("propertyTotal") or ""
    military_raw = txt("milServiceCn") or txt("militaryService") or ""
    tax_raw = txt("taxDelinqYn") or txt("taxArrears") or ""
    edu_raw = txt("eduCn") or txt("education") or ""

    return {
        "name": name,
        "giho": giho,
        "criminal": parse_criminal(criminal_raw),
        "property": parse_property(property_raw),
        "military": {"status": military_raw or "정보 없음", "rawText": military_raw},
        "tax": parse_tax(tax_raw),
        "education": {"finalDegree": edu_raw or "정보 없음", "rawText": edu_raw},
    }


def fetch_disclosures_for_type(api_key, sg_id, election_type, region_key=None, log_raw=False):
    """지정 선거 유형의 공보물 전체 수집"""
    typecode = SG_TYPECODE[election_type]
    result = {}

    target_regions = [region_key] if region_key else list(REGION_NAMES.keys())

    for rkey in target_regions:
        rname = REGION_NAMES[rkey]
        print(f"  [{election_type}] {rname} 수집 중...", end=" ", flush=True)

        params = {
            "serviceKey": api_key,
            "pageNo": "1",
            "numOfRows": "200",
            "sgId": sg_id,
            "sgTypecode": typecode,
            "sggName": rname,
            "type": "xml",
        }

        tree, raw_bytes = fetch_xml(f"{DISCLOSURE_SERVICE}/getCandSrchInfo", params)
        if tree is None:
            print("실패")
            result[rkey] = []
            continue

        if log_raw and raw_bytes:
            items = tree.findall(".//item")
            if items:
                tags = [child.tag for child in items[0]]
                print(f"\n  [log-raw] {rname} 필드명: {tags}")

        items = tree.findall(".//item")
        print(f"{len(items)}건")

        result[rkey] = [item_to_disclosure(it) for it in items]
        time.sleep(0.3)

    return result


def generate_mock():
    """UI 개발용 mock 데이터 생성"""
    kst = timezone(timedelta(hours=9))
    now = datetime.now(kst).strftime("%Y-%m-%dT%H:%M:%S+09:00")

    mock_data = {
        "_meta": {
            "version": "1.0.0",
            "generatedAt": now,
            "source": "선관위 CandSrchInfoInqireService2",
            "mode": "mock",
            "note": "5/16 이후 실데이터로 교체 예정. 현재 UI 개발용 mock 데이터."
        },
        "disclosures": {
            "governor": {
                "seoul": [
                    {
                        "name": "홍길동",
                        "giho": 1,
                        "criminal": {
                            "hasRecord": True, "count": 1,
                            "records": [
                                {"crime": "업무방해", "sentence": "벌금 200만원", "confirmedAt": "2019-03-15"}
                            ],
                            "rawText": "업무방해(2019.03.15 확정, 벌금 200만원)"
                        },
                        "property": {"totalAmountManWon": 85000, "rawText": "총 8억 5천만원"},
                        "military": {"status": "현역 복무 완료", "rawText": "육군 만기전역"},
                        "tax": {"arrearsManWon": 0, "hasArrears": False, "rawText": "없음"},
                        "education": {"finalDegree": "대학원 졸업", "rawText": "서울대학교 대학원 행정학 석사"}
                    },
                    {
                        "name": "김민준",
                        "giho": 2,
                        "criminal": {"hasRecord": False, "count": 0, "records": [], "rawText": "없음"},
                        "property": {"totalAmountManWon": 42000, "rawText": "총 4억 2천만원"},
                        "military": {"status": "공중보건의", "rawText": "공중보건의사 복무 완료"},
                        "tax": {"arrearsManWon": 0, "hasArrears": False, "rawText": "없음"},
                        "education": {"finalDegree": "대학교 졸업", "rawText": "연세대학교 법학과 졸업"}
                    }
                ]
            },
            "superintendent": {},
            "mayor": {}
        }
    }

    # 나머지 광역단체장 지역은 빈 배열로 초기화
    for rkey in REGION_NAMES:
        if rkey not in mock_data["disclosures"]["governor"]:
            mock_data["disclosures"]["governor"][rkey] = []
        if rkey not in mock_data["disclosures"]["superintendent"]:
            mock_data["disclosures"]["superintendent"][rkey] = []

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(mock_data, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"[mock] {OUTPUT_PATH} 생성 완료")


def main():
    parser = argparse.ArgumentParser(description="선관위 공보물 정보 수집")
    parser.add_argument("--type", choices=["governor", "mayor", "superintendent"],
                        help="특정 선거 유형만 수집 (기본: 전체)")
    parser.add_argument("--region", choices=list(REGION_NAMES.keys()),
                        help="특정 시도만 수집")
    parser.add_argument("--dry-run", action="store_true",
                        help="2022년 데이터로 API 연결 테스트 (저장 안 함)")
    parser.add_argument("--log-raw", action="store_true",
                        help="첫 응답 XML 필드명 출력 (스키마 검증용)")
    parser.add_argument("--mock", action="store_true",
                        help="UI 개발용 mock 데이터 생성 (API 불필요)")
    args = parser.parse_args()

    if args.mock:
        generate_mock()
        return

    api_key = load_api_key()
    if not api_key:
        print("[ERROR] NEC_API_KEY 없음. .env 파일 또는 환경변수를 확인하세요.", file=sys.stderr)
        sys.exit(1)

    sg_id = SG_ID_DRY if args.dry_run else SG_ID
    if args.dry_run:
        print(f"[dry-run] 2022년 데이터({sg_id})로 API 연결 테스트 (저장 안 함)")

    types = [args.type] if args.type else list(SG_TYPECODE.keys())

    kst = timezone(timedelta(hours=9))
    now = datetime.now(kst).strftime("%Y-%m-%dT%H:%M:%S+09:00")

    result = {
        "_meta": {
            "version": "1.0.0",
            "generatedAt": now,
            "source": "선관위 CandSrchInfoInqireService2",
            "mode": "dry-run" if args.dry_run else "live",
        },
        "disclosures": {}
    }

    for election_type in types:
        print(f"\n▶ {election_type} 공보물 수집 시작")
        data = fetch_disclosures_for_type(
            api_key=api_key,
            sg_id=sg_id,
            election_type=election_type,
            region_key=args.region,
            log_raw=args.log_raw,
        )
        result["disclosures"][election_type] = data

    if args.dry_run:
        print("\n[dry-run] 완료 — 파일 저장 생략")
        total = sum(len(v) for t in result["disclosures"].values() for v in t.values())
        print(f"[dry-run] 총 {total}건 응답")
        return

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    total = sum(len(v) for t in result["disclosures"].values() for v in t.values())
    print(f"\n✅ 저장 완료: {OUTPUT_PATH} (총 {total}건)")


if __name__ == "__main__":
    main()
