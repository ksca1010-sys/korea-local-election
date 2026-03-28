#!/usr/bin/env python3
"""
기초단체장 역대 선거 결과 수집 스크립트
- 선관위 당선인정보 API (WinnerInfoInqireService2)로 1~8회 기초단체장 당선인 조회
- 결과를 data/mayor_history.json 에 저장
- js/data.js에서 로드하여 역대비교 탭에 표시

사용법:
  python scripts/fetch_mayor_history.py                # 전체 8회
  python scripts/fetch_mayor_history.py --election=8   # 특정 회차만
  python scripts/fetch_mayor_history.py --dry-run      # API 호출만, 파일 미저장

환경변수:
  NEC_API_KEY: 공공데이터포털 인증키 (data.go.kr에서 발급)
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shared import BASE_DIR, DATA_DIR, REGION_MAP, load_env, load_json, save_json  # noqa: E402

OUTPUT_PATH = DATA_DIR / "mayor_history.json"

NEC_API_BASE = "http://apis.data.go.kr/9760000"
WINNER_SERVICE = f"{NEC_API_BASE}/WinnerInfoInqireService2"
SG_TYPECODE = "4"  # 구·시·군의 장

# 역대 지방선거 ID (선거일 기준)
ELECTIONS = {
    1: {"sgId": "19950627", "year": 1995, "label": "제1회 (1995)"},
    2: {"sgId": "19980604", "year": 1998, "label": "제2회 (1998)"},
    3: {"sgId": "20020613", "year": 2002, "label": "제3회 (2002)"},
    4: {"sgId": "20060531", "year": 2006, "label": "제4회 (2006)"},
    5: {"sgId": "20100602", "year": 2010, "label": "제5회 (2010)"},
    6: {"sgId": "20140604", "year": 2014, "label": "제6회 (2014)"},
    7: {"sgId": "20180613", "year": 2018, "label": "제7회 (2018)"},
    8: {"sgId": "20220601", "year": 2022, "label": "제8회 (2022)"},
}

    # REGION_MAP → shared.py에서 import

# 정당 정규화
PARTY_NORMALIZE = {
    # 민주 계열
    "더불어민주당": "democratic", "민주당": "democratic", "새정치민주연합": "democratic",
    "민주통합당": "democratic", "열린우리당": "democratic", "새천년민주당": "democratic",
    "새정치국민회의": "democratic", "민주자유당": "democratic",
    "통합민주당": "democratic", "대통합민주신당": "democratic",
    # 보수 계열
    "국민의힘": "ppp", "자유한국당": "ppp", "새누리당": "ppp",
    "한나라당": "ppp", "신한국당": "ppp", "민주자유당": "ppp",
    "미래통합당": "ppp", "바른정당": "ppp",
    # 기타
    "무소속": "independent",
}


def normalize_party(party_name):
    """정당명 → 정당키 정규화"""
    for k, v in PARTY_NORMALIZE.items():
        if k in party_name:
            return v
    return "other"


def fetch_winners_for_election(sg_id, api_key):
    """특정 선거의 기초단체장 당선인 전체 조회"""
    all_items = []
    for page in range(1, 10):  # 최대 900명 (여유)
        params = {
            "sgId": sg_id,
            "sgTypecode": SG_TYPECODE,
            "numOfRows": "100",
            "pageNo": str(page),
            "resultType": "xml",
        }
        qs = urllib.parse.urlencode(params)
        url = f"{WINNER_SERVICE}/getWinnerInfoInqire?serviceKey={urllib.parse.quote(api_key, safe='')}&{qs}"

        try:
            resp = urllib.request.urlopen(url, timeout=30)
            data = resp.read().decode("utf-8")
            root = ET.fromstring(data)

            # 에러 확인
            result_code = root.findtext(".//resultCode") or ""
            if result_code not in ("", "00", "INFO-000", "INFO-00"):
                result_msg = root.findtext(".//resultMsg") or ""
                print(f"    [API 오류] {result_code}: {result_msg}")
                break

            items = list(root.iter("item"))
            all_items.extend(items)
            if len(items) < 100:
                break
        except Exception as e:
            print(f"    [오류] 페이지 {page}: {e}")
            break

        time.sleep(0.3)  # rate limit

    return all_items


def parse_winners(items, election_num, year):
    """XML items → 시군구별 당선인 dict"""
    results = {}

    for it in items:
        name = it.findtext("name", "").strip()
        sgg = it.findtext("sggName", "").strip()
        party = it.findtext("jdName", "").strip()
        sd = it.findtext("sdName", "").strip()
        vote_rate = it.findtext("dugyul", "").strip()  # 득표율 (%)
        vote_count = it.findtext("dugsu", "").strip()  # 득표수

        region_key = REGION_MAP.get(sd, "")
        if not region_key or not sgg or not name:
            continue

        party_key = normalize_party(party)

        # 득표율 파싱
        rate = 0.0
        if vote_rate:
            try:
                rate = float(vote_rate.replace("%", "").replace(",", ""))
            except ValueError:
                pass

        key = f"{region_key}/{sgg}"
        results[key] = {
            "election": election_num,
            "year": year,
            "winner": party_key,
            "winnerName": name,
            "winnerParty": party,
            "rate": rate,
            "regionKey": region_key,
            "district": sgg,
        }

    return results


def fetch_runner_up(sg_id, region_key, sgg_name, api_key):
    """개표결과 API로 차점자 조회 (가능한 경우)"""
    # 당선인 API만으로는 차점자 정보가 없음
    # 개표결과 API (getVoteResultInfoInqire)가 있으면 사용 가능
    # 현재는 차점자 없이 당선인만 수집
    return None


def main():
    parser = argparse.ArgumentParser(description="기초단체장 역대 선거 결과 수집")
    parser.add_argument("--election", type=int, help="특정 회차만 (1-8)")
    parser.add_argument("--dry-run", action="store_true", help="API 호출만, 파일 미저장")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("NEC_API_KEY", "")
    if not api_key:
        print("[오류] NEC_API_KEY 환경변수가 필요합니다.")
        print("  공공데이터포털(data.go.kr)에서 '선거 당선인정보' API 키를 발급받으세요.")
        sys.exit(1)

    print("=" * 55)
    print("기초단체장 역대 선거 결과 수집")
    print(f"API: {WINNER_SERVICE}")
    print("=" * 55)

    # 기존 데이터 로드
    existing = {}
    if OUTPUT_PATH.exists():
        existing = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))

    # 대상 회차
    if args.election:
        target = {args.election: ELECTIONS[args.election]}
    else:
        target = ELECTIONS

    all_history = existing.get("history", {})

    for num, info in sorted(target.items()):
        sg_id = info["sgId"]
        year = info["year"]
        print(f"\n[{info['label']}] sgId={sg_id}")

        items = fetch_winners_for_election(sg_id, api_key)
        print(f"  → {len(items)}명 당선인 조회")

        if not items:
            print("  [경고] 데이터 없음, 건너뜀")
            continue

        results = parse_winners(items, num, year)
        print(f"  → {len(results)}개 시군구 파싱 완료")

        # 시군구별로 history에 추가
        for key, entry in results.items():
            if key not in all_history:
                all_history[key] = []

            # 같은 회차 데이터가 이미 있으면 교체
            all_history[key] = [h for h in all_history[key] if h["election"] != num]
            all_history[key].append(entry)
            all_history[key].sort(key=lambda h: h["election"])

        time.sleep(1)  # 회차 간 간격

    if args.dry_run:
        # 통계만 출력
        total_districts = len(all_history)
        total_records = sum(len(v) for v in all_history.values())
        print(f"\n[dry-run] {total_districts}개 시군구, {total_records}건 레코드")
        return

    # 저장
    output = {
        "_meta": {
            "lastUpdated": date.today().isoformat(),
            "source": "중앙선거관리위원회 당선인정보 API",
            "elections": {str(k): v for k, v in ELECTIONS.items()},
        },
        "history": all_history,
    }

    OUTPUT_PATH.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )

    total_districts = len(all_history)
    total_records = sum(len(v) for v in all_history.values())
    print(f"\n{'=' * 55}")
    print(f"완료: {total_districts}개 시군구, {total_records}건 레코드")
    print(f"저장: {OUTPUT_PATH}")
    print("=" * 55)


if __name__ == "__main__":
    main()
