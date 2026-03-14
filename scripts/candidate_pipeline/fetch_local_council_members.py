#!/usr/bin/env python3
"""
기초의원 현직 의원 데이터 수집 파이프라인

선관위 당선인 API → 2,601명 기초의원 당선인 → 시군구별 집계

사용법:
  python scripts/candidate_pipeline/fetch_local_council_members.py

환경변수:
  NEC_API_KEY: 공공데이터포털 인증키
"""

import json
import os
import sys
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
OUTPUT_PATH = BASE_DIR / "data" / "candidates" / "local_council_members.json"
ENV_FILE = BASE_DIR / ".env"

NEC_API_BASE = "http://apis.data.go.kr/9760000"
WINNER_SERVICE = f"{NEC_API_BASE}/WinnerInfoInqireService2"
SG_ID = "20220601"
SG_TYPECODE = "6"  # 구·시·군의회의원

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
    "더불어민주당": "democratic", "국민의힘": "ppp",
    "무소속": "independent", "진보당": "progressive",
    "정의당": "justice", "조국혁신당": "reform",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def fetch_all_winners(api_key):
    all_items = []
    for page in range(1, 30):
        params = {
            "sgId": SG_ID, "sgTypecode": SG_TYPECODE,
            "numOfRows": "100", "pageNo": str(page), "resultType": "xml",
        }
        qs = urllib.parse.urlencode(params)
        url = f"{WINNER_SERVICE}/getWinnerInfoInqire?serviceKey={urllib.parse.quote(api_key, safe='')}&{qs}"

        try:
            resp = urllib.request.urlopen(url, timeout=30)
            root = ET.fromstring(resp.read().decode("utf-8"))
            items = list(root.iter("item"))
            all_items.extend(items)
            if len(items) < 100:
                break
        except Exception as e:
            print(f"  [오류] 페이지 {page}: {e}")
            break

    return all_items


def build_sigungu_data(items):
    sigungus = {}
    for it in items:
        name = it.findtext("name", "").strip()
        sgg = it.findtext("sggName", "").strip()
        party = it.findtext("jdName", "").strip()
        sd = it.findtext("sdName", "").strip()

        rk = REGION_MAP.get(sd, "")
        if not rk:
            continue
        pk = PARTY_MAP.get(party, "independent")
        key = f"{rk}_{sgg}"

        if key not in sigungus:
            sigungus[key] = {
                "region": rk, "sigungu": sgg,
                "members": [], "parties": {},
            }

        sigungus[key]["members"].append({"name": name, "party": pk})
        sigungus[key]["parties"][pk] = sigungus[key]["parties"].get(pk, 0) + 1

    return sigungus


def save_compact(data, path):
    """시군구별 1줄로 compact 저장"""
    lines = ["{"]
    lines.append('  "_meta": ' + json.dumps(data["_meta"], ensure_ascii=False) + ",")
    lines.append('  "sigungus": {')
    entries = list(data["sigungus"].items())
    for i, (key, sg) in enumerate(entries):
        comma = "," if i < len(entries) - 1 else ""
        lines.append(f'    "{key}": {json.dumps(sg, ensure_ascii=False)}{comma}')
    lines.append("  }")
    lines.append("}")
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    load_env()
    api_key = os.environ.get("NEC_API_KEY", "")
    if not api_key:
        print("[오류] NEC_API_KEY 미설정")
        sys.exit(1)

    print("=" * 60)
    print("기초의원 현직 의원 데이터 수집")
    print(f"실행: {date.today().isoformat()}")
    print("=" * 60)

    print("\n선관위 당선인 API 조회 중...")
    items = fetch_all_winners(api_key)
    print(f"  → {len(items)}명 조회 완료")

    if not items:
        print("[오류] 데이터 없음")
        sys.exit(1)

    sigungus = build_sigungu_data(items)
    print(f"  → {len(sigungus)}개 시군구 집계")

    total_parties = {}
    for sg in sigungus.values():
        for p, c in sg["parties"].items():
            total_parties[p] = total_parties.get(p, 0) + c
    print(f"  → 정당별: {total_parties}")

    output = {
        "_meta": {
            "lastUpdated": date.today().isoformat(),
            "source": "중앙선거관리위원회 당선인정보 API (공식)",
            "baseline": f"제8회 지방선거 ({SG_ID}) 구시군의회의원 당선인",
            "totalMembers": len(items),
            "totalSigungu": len(sigungus),
        },
        "sigungus": sigungus,
    }

    save_compact(output, OUTPUT_PATH)
    size = OUTPUT_PATH.stat().st_size / 1024
    print(f"\n[저장] {OUTPUT_PATH} ({size:.0f}KB)")
    print("=" * 60)


if __name__ == "__main__":
    main()
