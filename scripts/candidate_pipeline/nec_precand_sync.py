#!/usr/bin/env python3
"""
선관위 예비후보 등록현황 API 공통 모듈

선거유형별(시도지사/구시군장/국회의원) 예비후보를 조회하고,
기존 후보 데이터와 동기화(신규 추가, 당적 교정, status 승격)한다.

사용법:
  from nec_precand_sync import fetch_precandidates, sync_governor, sync_mayor
"""

import json
import os
import urllib.request
import urllib.parse
from pathlib import Path

NEC_API_BASE = "http://apis.data.go.kr/9760000"
NEC_SERVICE = f"{NEC_API_BASE}/PofelcddInfoInqireService/getPoelpcddRegistSttusInfoInqire"
SG_ID = "20260603"

PARTY_MAP = {
    "더불어민주당": "democratic", "민주당": "democratic",
    "국민의힘": "ppp", "조국혁신당": "reform",
    "개혁신당": "newReform", "진보당": "progressive",
    "정의당": "justice", "새로운미래": "newFuture",
    "자유와혁신": "other", "무소속": "independent",
}

# 시도명 → regionKey
SIDO_MAP = {
    "서울특별시": "seoul", "부산광역시": "busan", "대구광역시": "daegu",
    "인천광역시": "incheon", "광주광역시": "gwangju", "대전광역시": "daejeon",
    "울산광역시": "ulsan", "세종특별자치시": "sejong", "경기도": "gyeonggi",
    "강원특별자치도": "gangwon", "강원도": "gangwon",
    "충청북도": "chungbuk", "충청남도": "chungnam",
    "전북특별자치도": "jeonbuk", "전라북도": "jeonbuk",
    "전라남도": "jeonnam", "경상북도": "gyeongbuk",
    "경상남도": "gyeongnam", "제주특별자치도": "jeju",
}


def _normalize_party(name):
    if not name:
        return "independent"
    for k, v in PARTY_MAP.items():
        if k in name:
            return v
    return "independent"


def fetch_precandidates(sg_typecode, nec_key=None):
    """선관위 예비후보 API 조회.

    Args:
        sg_typecode: "2"=국회의원, "3"=시도지사, "4"=구시군장, "10"=교육감
        nec_key: API 키 (없으면 환경변수에서)

    Returns:
        list[dict]: 예비후보 원본 항목 리스트
    """
    if not nec_key:
        nec_key = os.environ.get("NEC_API_KEY", "")
    if not nec_key:
        print("  [NEC] NEC_API_KEY 미설정 — 건너뜀")
        return []

    all_items = []
    page = 1
    while True:
        params = urllib.parse.urlencode({
            "serviceKey": nec_key,
            "pageNo": str(page),
            "numOfRows": "100",
            "sgId": SG_ID,
            "sgTypecode": sg_typecode,
            "resultType": "json",
        })
        url = f"{NEC_SERVICE}?{params}"
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"  [NEC] API 호출 실패: {e}")
            break

        header = data.get("response", {}).get("header", {})
        if header.get("resultCode") != "INFO-00":
            print(f"  [NEC] API 오류: {header.get('resultMsg')}")
            break

        body = data["response"]["body"]
        items = body.get("items", {}).get("item", [])
        if isinstance(items, dict):
            items = [items]
        all_items.extend(items)

        total = body.get("totalCount", 0)
        if len(all_items) >= total:
            break
        page += 1

    print(f"  [NEC] 예비후보 {len(all_items)}명 조회 (typecode={sg_typecode})")
    return all_items


def sync_governor(governor_data, nec_items):
    """광역단체장 예비후보 → governor.json 동기화.

    Args:
        governor_data: governor.json의 전체 dict (candidates 키 포함)
        nec_items: fetch_precandidates("3")의 결과

    Returns:
        list[str]: 변경 로그
    """
    candidates = governor_data.get("candidates", {})
    fixes = []

    # regionKey별 그룹핑
    by_region = {}
    for item in nec_items:
        sido = item.get("sdName", "")
        rk = SIDO_MAP.get(sido)
        if not rk:
            continue
        by_region.setdefault(rk, []).append(item)

    for rk, items in by_region.items():
        if rk not in candidates:
            continue
        existing = {c["name"]: c for c in candidates[rk]}

        for item in items:
            name = item.get("name", "")
            party_name = item.get("jdName", "")
            party_key = _normalize_party(party_name)
            career = item.get("career1", "")
            regdate = item.get("regdate", "")

            if name in existing:
                old = existing[name]
                # 당적 교정
                if old.get("party") != party_key:
                    old_display = old.get("partyName", old.get("party", "?"))
                    fixes.append(f"[광역] {SIDO_MAP.get(rk, rk)} {name}: 당적 '{old_display}'→'{party_name}' (선관위)")
                    old["party"] = party_key
                    old["partyKey"] = party_key
                    old["partyName"] = party_name
                # status 승격
                if old.get("status") in ("RUMORED", "EXPECTED"):
                    fixes.append(f"[광역] {name}: {old['status']}→DECLARED (예비후보 {regdate})")
                    old["status"] = "DECLARED"
                # career 보강
                if career and (not old.get("career") or old["career"] in ("", "미상")):
                    old["career"] = career
            else:
                # 신규 추가
                candidates[rk].append({
                    "name": name,
                    "party": party_key,
                    "partyKey": party_key,
                    "partyName": party_name,
                    "career": career,
                    "status": "DECLARED",
                    "dataSource": "nec_precand",
                    "pledges": [],
                })
                fixes.append(f"[광역] {SIDO_MAP.get(rk, rk)} {name}: 신규 ({party_name}, {regdate})")

    return fixes


def sync_mayor(mayor_data, nec_items):
    """기초단체장 예비후보 → mayor_candidates.json 동기화.

    Args:
        mayor_data: mayor_candidates.json의 전체 dict (candidates 키 포함)
        nec_items: fetch_precandidates("4")의 결과

    Returns:
        list[str]: 변경 로그
    """
    candidates = mayor_data.get("candidates", {})
    fixes = []

    # regionKey/wiwName별 그룹핑
    by_district = {}  # (regionKey, wiwName) → [items]
    for item in nec_items:
        sido = item.get("sdName", "")
        rk = SIDO_MAP.get(sido)
        wiw = item.get("wiwName", "")
        if not rk or not wiw:
            continue
        by_district.setdefault((rk, wiw), []).append(item)

    for (rk, wiw), items in by_district.items():
        if rk not in candidates:
            continue

        # mayor_candidates.json의 키는 "regionKey/시군구명" 형태
        dist_key = f"{rk}/{wiw}"
        if dist_key not in candidates.get(rk, {}):
            # 시/군/구 접미사 변형 시도
            for suffix in ["시", "군", "구"]:
                alt = f"{rk}/{wiw}{suffix}" if not wiw.endswith(suffix) else None
                if alt and alt in candidates.get(rk, {}):
                    dist_key = alt
                    break
            else:
                # 하위 키에서 검색
                found = False
                for dk in candidates.get(rk, {}):
                    if wiw in dk:
                        dist_key = dk
                        found = True
                        break
                if not found:
                    continue

        existing_list = candidates[rk].get(dist_key.split("/", 1)[-1], [])
        if not isinstance(existing_list, list):
            continue
        existing = {c["name"]: c for c in existing_list}

        for item in items:
            name = item.get("name", "")
            party_name = item.get("jdName", "")
            party_key = _normalize_party(party_name)
            career = item.get("career1", "")
            regdate = item.get("regdate", "")

            if name in existing:
                old = existing[name]
                if old.get("party") != party_key:
                    old_display = old.get("partyName", old.get("party", "?"))
                    fixes.append(f"[기초] {wiw} {name}: 당적 '{old_display}'→'{party_name}'")
                    old["party"] = party_key
                    old["partyKey"] = party_key
                    old["partyName"] = party_name
                if old.get("status") in ("RUMORED", "EXPECTED"):
                    fixes.append(f"[기초] {wiw} {name}: {old['status']}→DECLARED")
                    old["status"] = "DECLARED"
                if career and (not old.get("career") or old["career"] in ("", "미상")):
                    old["career"] = career
            else:
                existing_list.append({
                    "name": name,
                    "party": party_key,
                    "partyKey": party_key,
                    "partyName": party_name,
                    "career": career,
                    "status": "DECLARED",
                    "dataSource": "nec_precand",
                    "pledges": [],
                })
                fixes.append(f"[기초] {wiw} {name}: 신규 ({party_name})")

    return fixes


if __name__ == "__main__":
    """독립 실행: 선관위 API로 광역+기초+교육감 예비후보 동기화 (Claude 불필요)"""
    from datetime import datetime
    import argparse
    parser = argparse.ArgumentParser(description="선관위 예비후보 동기화")
    parser.add_argument("--dry-run", action="store_true", help="변경 사항 출력만 (파일 저장 안 함)")
    args = parser.parse_args()

    BASE = Path(__file__).resolve().parent.parent.parent / "data" / "candidates"
    all_fixes = []

    # 1) 광역단체장 (sgTypecode=3)
    gov_path = BASE / "governor.json"
    if gov_path.exists():
        print("[광역단체장] 예비후보 조회...")
        gov_data = json.loads(gov_path.read_text(encoding="utf-8"))
        nec_gov = fetch_precandidates("3")
        fixes = sync_governor(gov_data, nec_gov)
        all_fixes.extend(fixes)
        if fixes and not args.dry_run:
            gov_data.setdefault("meta", {})["lastUpdated"] = datetime.now().strftime("%Y-%m-%d")
            gov_path.write_text(json.dumps(gov_data, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  governor.json 저장 ({len(fixes)}건 변경)")
    else:
        print("[광역단체장] governor.json 없음 — 건너뜀")

    # 2) 기초단체장 (sgTypecode=4)
    mayor_path = BASE / "mayor_candidates.json"
    if mayor_path.exists():
        print("[기초단체장] 예비후보 조회...")
        mayor_data = json.loads(mayor_path.read_text(encoding="utf-8"))
        nec_mayor = fetch_precandidates("4")
        fixes = sync_mayor(mayor_data, nec_mayor)
        all_fixes.extend(fixes)
        if fixes and not args.dry_run:
            mayor_data.setdefault("meta", {})["lastUpdated"] = datetime.now().strftime("%Y-%m-%d")
            mayor_path.write_text(json.dumps(mayor_data, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  mayor_candidates.json 저장 ({len(fixes)}건 변경)")
    else:
        print("[기초단체장] mayor_candidates.json 없음 — 건너뜀")

    # 3) 교육감 (sgTypecode=10)
    supt_path = BASE / "superintendent.json"
    if supt_path.exists():
        print("[교육감] 예비후보 조회...")
        supt_data = json.loads(supt_path.read_text(encoding="utf-8"))
        nec_supt = fetch_precandidates("10")
        fixes = sync_governor(supt_data, nec_supt)
        all_fixes.extend(fixes)
        if fixes and not args.dry_run:
            supt_data.setdefault("meta", {})["lastUpdated"] = datetime.now().strftime("%Y-%m-%d")
            supt_path.write_text(json.dumps(supt_data, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  superintendent.json 저장 ({len(fixes)}건 변경)")
    else:
        print("[교육감] superintendent.json 없음 — 건너뜀")

    if all_fixes:
        print(f"\n총 {len(all_fixes)}건 변경:")
        for f in all_fixes:
            print(f"  {f}")
    else:
        print("\n변경 없음")
