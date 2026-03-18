#!/usr/bin/env python3
"""
기초단체장 역대 차점자 수집 스크립트 (NEC 개표결과 API)

제3회(2002), 제4회(2006) 기초단체장 개표결과에서 차점자(2위) 정보를 추출하여
mayor_history.json에 보강합니다.

사용법:
  python scripts/fetch_mayor_runnerup.py                # 3~4회 전체
  python scripts/fetch_mayor_runnerup.py --election=3    # 3회만
  python scripts/fetch_mayor_runnerup.py --dry-run       # 조회만, 저장 안 함

환경변수:
  NEC_API_KEY: data.go.kr 공공데이터포털 인증키
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlencode, quote

BASE_DIR = Path(__file__).resolve().parent.parent
HISTORY_PATH = BASE_DIR / "data" / "mayor_history.json"
ENV_FILE = BASE_DIR / ".env"

API_BASE = "http://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2/getXmntckSttusInfoInqire"

# 선거 ID (NEC 코드정보 API 확인)
ELECTION_MAP = {
    3: {"sgId": "20020613", "year": 2002},
    4: {"sgId": "20060531", "year": 2006},
}
SG_TYPECODE = "4"  # 구·시·군의장선거

# 시도명 (NEC API 파라미터)
SIDO_NAMES = [
    "서울특별시", "부산광역시", "대구광역시", "인천광역시",
    "광주광역시", "대전광역시", "울산광역시",
    "경기도", "강원도", "충청북도", "충청남도",
    "전라북도", "전라남도", "경상북도", "경상남도", "제주도",
]

# 시도명 → regionKey 매핑
REGION_KEY_MAP = {
    "서울특별시": "seoul", "부산광역시": "busan", "대구광역시": "daegu",
    "인천광역시": "incheon", "광주광역시": "gwangju", "대전광역시": "daejeon",
    "울산광역시": "ulsan", "경기도": "gyeonggi", "강원도": "gangwon",
    "충청북도": "chungbuk", "충청남도": "chungnam", "전라북도": "jeonbuk",
    "전라남도": "jeonnam", "경상북도": "gyeongbuk", "경상남도": "gyeongnam",
    "제주도": "jeju",
    # 4회(2006)부터 변경된 시도명
    "세종특별자치시": "sejong",
    "강원특별자치도": "gangwon",
    "전북특별자치도": "jeonbuk",
    "제주특별자치도": "jeju",
}

# 정당명 → 정규화 키
PARTY_NORMALIZE = {
    "한나라당": "ppp", "새누리당": "ppp", "자유한국당": "ppp", "국민의힘": "ppp",
    "민주당": "democratic", "새정치민주연합": "democratic", "더불어민주당": "democratic",
    "새천년민주당": "democratic", "열린우리당": "democratic", "통합민주당": "democratic",
    "민주노동당": "progressive", "진보신당": "progressive", "정의당": "progressive",
    "자민련": "other", "국민중심당": "other", "자유선진당": "other",
    "무소속": "independent",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def normalize_party(party_name):
    if not party_name:
        return "independent"
    for key, val in PARTY_NORMALIZE.items():
        if key in party_name:
            return val
    return "other"


def fetch_results(api_key, sg_id, sido_name):
    """NEC 개표결과 API 조회 — 한 시도의 모든 기초단체장"""
    import httpx

    params = {
        "ServiceKey": api_key,
        "resultType": "json",
        "sgId": sg_id,
        "sgTypecode": SG_TYPECODE,
        "sdName": sido_name,
        "numOfRows": "300",
    }

    for attempt in range(3):
        try:
            resp = httpx.get(API_BASE, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
            if isinstance(items, dict):
                items = [items]
            return items
        except Exception as e:
            if attempt < 2:
                print(f"    [재시도] {e}")
                time.sleep(3)
            else:
                print(f"    [오류] {e}")
                return []


def extract_top2(item):
    """API 응답에서 1위(당선), 2위(차점자) 추출"""
    candidates = []
    for i in range(1, 20):
        name = item.get(f"hbj{i:02d}", "").strip()
        party = item.get(f"jd{i:02d}", "").strip()
        votes_str = item.get(f"dugsu{i:02d}", "")
        if not name:
            break
        try:
            votes = int(str(votes_str).replace(",", ""))
        except (ValueError, TypeError):
            votes = 0
        candidates.append({"name": name, "party": party, "votes": votes})

    if not candidates:
        return None, None

    # 득표순 정렬
    candidates.sort(key=lambda c: c["votes"], reverse=True)

    yutusu = int(str(item.get("yutusu", "0")).replace(",", "") or "0")

    winner = candidates[0]
    winner["rate"] = round(winner["votes"] / yutusu * 100, 2) if yutusu else 0

    runner = candidates[1] if len(candidates) > 1 else None
    if runner:
        runner["rate"] = round(runner["votes"] / yutusu * 100, 2) if yutusu else 0

    return winner, runner


def main():
    parser = argparse.ArgumentParser(description="기초단체장 차점자 수집 (NEC API)")
    parser.add_argument("--election", type=int, help="특정 회차만 (3 or 4)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("NEC_API_KEY", "")
    if not api_key:
        print("[오류] NEC_API_KEY 미설정")
        sys.exit(1)

    # 기존 데이터 로드
    history = json.loads(HISTORY_PATH.read_text(encoding="utf-8")) if HISTORY_PATH.exists() else {}

    elections = [args.election] if args.election else [3, 4]

    print("=" * 60)
    print("기초단체장 차점자 수집 (NEC 개표결과 API)")
    print("=" * 60)

    total_updated = 0
    total_new = 0

    for election_num in elections:
        info = ELECTION_MAP.get(election_num)
        if not info:
            print(f"[건너뜀] {election_num}회: 미지원")
            continue

        sg_id = info["sgId"]
        year = info["year"]
        print(f"\n제{election_num}회 ({year}) — sgId={sg_id}")

        for sido in SIDO_NAMES:
            region_key = REGION_KEY_MAP.get(sido)
            if not region_key:
                continue

            items = fetch_results(api_key, sg_id, sido)
            print(f"  [{sido}] {len(items)}개 시군구", end="", flush=True)

            if not items:
                print()
                continue

            updated = 0
            for item in items:
                district = item.get("sggName", "").strip() or item.get("wiwName", "").strip()
                if not district:
                    continue

                winner, runner = extract_top2(item)
                if not winner:
                    continue

                # history에서 해당 항목 찾기
                region_data = history.get(region_key, {})
                district_data = region_data.get(district, [])

                entry = next((e for e in district_data if e.get("election") == election_num), None)

                if entry is None:
                    # 새 항목 생성
                    entry = {
                        "election": election_num,
                        "year": year,
                        "winner": normalize_party(winner["party"]),
                        "winnerName": winner["name"],
                        "winnerParty": winner["party"],
                        "rate": winner["rate"],
                        "regionKey": region_key,
                        "district": district,
                    }
                    if runner:
                        entry["runnerName"] = runner["name"]
                        entry["runnerParty"] = runner["party"]
                        entry["runner"] = normalize_party(runner["party"])
                        entry["runnerRate"] = runner["rate"]

                    if region_key not in history:
                        history[region_key] = {}
                    if district not in history[region_key]:
                        history[region_key][district] = []
                    history[region_key][district].append(entry)
                    history[region_key][district].sort(key=lambda e: e.get("election", 0))
                    total_new += 1
                    updated += 1
                else:
                    # 기존 항목에 차점자 보강
                    changed = False

                    # 득표율 보강
                    if entry.get("rate", 0) == 0 and winner["rate"] > 0:
                        entry["rate"] = winner["rate"]
                        changed = True

                    # 차점자 보강
                    if not entry.get("runnerName") and runner:
                        entry["runnerName"] = runner["name"]
                        entry["runnerParty"] = runner["party"]
                        entry["runner"] = normalize_party(runner["party"])
                        entry["runnerRate"] = runner["rate"]
                        changed = True

                    if changed:
                        updated += 1

            total_updated += updated
            print(f" → {updated}건 보강")
            time.sleep(0.3)

    # 저장
    if not args.dry_run and (total_updated + total_new) > 0:
        # 메타 업데이트
        if "_meta" not in history:
            history["_meta"] = {}
        history["_meta"]["note"] = "제3~8회 기초단체장 역대선거 데이터. 차점자는 NEC API + XLSX 기반"

        HISTORY_PATH.write_text(
            json.dumps(history, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )

    print("\n" + "=" * 60)
    print(f"완료: 보강 {total_updated}건, 신규 {total_new}건")
    if not args.dry_run:
        print(f"[저장] {HISTORY_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()
