#!/usr/bin/env python3
"""
재보궐 당선 결과를 mayor_candidates/mayor_status에 자동 반영

선관위 WinnerInfoInqireService2 API로 최근 재보궐 기초단체장 당선인을 조회하여
기존 데이터에 자동 병합한다.

사용법:
  python scripts/candidate_pipeline/sync_byelection_winners.py
  python scripts/candidate_pipeline/sync_byelection_winners.py --dry-run
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
MAYOR_CANDIDATES = BASE_DIR / "data" / "candidates" / "mayor_candidates.json"
MAYOR_STATUS = BASE_DIR / "data" / "candidates" / "mayor_status.json"
ENV_FILE = BASE_DIR / ".env"

NEC_API_BASE = "http://apis.data.go.kr/9760000"
WINNER_SERVICE = f"{NEC_API_BASE}/WinnerInfoInqireService2"

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

PARTY_MAP = {
    "더불어민주당": "democratic", "국민의힘": "ppp", "조국혁신당": "reform",
    "개혁신당": "newReform", "진보당": "progressive", "무소속": "independent",
}

# 2022년 이후 재보궐 선거 ID 목록
BYELECTION_IDS = [
    "20250402",  # 2025.4.2 재보궐
    # 향후 추가 시 여기에 append
]


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def fetch_winners(sg_id, api_key):
    """특정 재보궐의 기초단체장 당선인 조회"""
    params = {
        "sgId": sg_id,
        "sgTypecode": "4",
        "numOfRows": "50",
        "pageNo": "1",
        "resultType": "xml",
    }
    qs = urllib.parse.urlencode(params)
    url = f"{WINNER_SERVICE}/getWinnerInfoInqire?serviceKey={urllib.parse.quote(api_key, safe='')}&{qs}"

    try:
        resp = urllib.request.urlopen(url, timeout=15)
        data = resp.read().decode("utf-8")
        root = ET.fromstring(data)
        items = list(root.iter("item"))
        results = []
        for it in items:
            results.append({
                "name": it.findtext("name", "").strip(),
                "district": it.findtext("sggName", "").strip(),
                "region_name": it.findtext("sdName", "").strip(),
                "party_name": it.findtext("jdName", "").strip(),
                "rate": it.findtext("dugyul", ""),
                "sg_id": sg_id,
            })
        return results
    except Exception as e:
        print(f"  [오류] API 호출 실패: {e}")
        return []


def main():
    parser = argparse.ArgumentParser(description="재보궐 당선 결과 동기화")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("NEC_API_KEY", "")
    if not api_key:
        print("[오류] NEC_API_KEY 미설정")
        sys.exit(1)

    mayor = json.loads(MAYOR_CANDIDATES.read_text(encoding="utf-8"))
    status = json.loads(MAYOR_STATUS.read_text(encoding="utf-8"))
    cands = mayor.get("candidates", {})

    print("=" * 55)
    print("재보궐 당선 결과 → 후보자 DB 동기화")
    print("=" * 55)

    total_synced = 0

    for sg_id in BYELECTION_IDS:
        winners = fetch_winners(sg_id, api_key)
        print(f"\n[{sg_id}] {len(winners)}명 당선인")

        for w in winners:
            rk = REGION_MAP.get(w["region_name"], "")
            dist = w["district"]
            name = w["name"]
            party = PARTY_MAP.get(w["party_name"], "independent")

            if not rk:
                continue

            print(f"  {rk}/{dist}: {name} ({w['party_name']})")

            district_cands = cands.get(rk, {}).get(dist, [])

            # 이전 단체장 WITHDRAWN 처리
            for c in district_cands:
                if c["name"] != name and c.get("status") not in ("WITHDRAWN",) and c.get("dataSource") == "incumbent":
                    if not args.dry_run:
                        c["status"] = "WITHDRAWN"
                        c["_note"] = f"재보궐({sg_id})로 {name}에게 교체"
                    print(f"    이전: {c['name']} → WITHDRAWN")

            # 당선자 추가/갱신
            existing = next((c for c in district_cands if c["name"] == name), None)
            if existing:
                if existing.get("party") != party:
                    if not args.dry_run:
                        existing["party"] = party
                    print(f"    정당 수정: → {party}")
            else:
                if not args.dry_run:
                    district_cands.append({
                        "name": name,
                        "party": party,
                        "career": f"현 {dist} 단체장 (재보궐 {sg_id[:4]}.{sg_id[4:6]} 당선)",
                        "status": "EXPECTED",
                        "dataSource": "nec_byelection",
                        "pledges": [],
                    })
                print(f"    추가: {name} ({party})")

            # mayor_status 갱신
            for k, v in status.get("mayors", {}).items():
                if v["region"] == rk and v["district"] == dist:
                    if v.get("name") != name:
                        if not args.dry_run:
                            v["name"] = name
                            v["party"] = party
                            v["acting"] = False
                        print(f"    status: → {name}")
                    break

            total_synced += 1

    if not args.dry_run and total_synced > 0:
        mayor["_meta"]["lastByelectionSync"] = date.today().isoformat()
        MAYOR_CANDIDATES.write_text(json.dumps(mayor, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        MAYOR_STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\n총 {total_synced}건 동기화" + (" [DRY RUN]" if args.dry_run else ""))


if __name__ == "__main__":
    main()
