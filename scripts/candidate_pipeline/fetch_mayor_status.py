#!/usr/bin/env python3
"""
기초단체장 현황 2단계 검증 파이프라인

[1단계] 선관위 당선인 API → 공식 당선 데이터 (100% 정확한 베이스라인)
[2단계] Gemini → 당선 이후 변경사항만 검증 (사퇴, 탈당, 당선무효 등)


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from election_overview_utils import call_claude_json
이 구조로 기본 데이터는 공식 소스에서 가져오고,
AI는 변경사항 탐지 보조 역할만 수행합니다.

사용법:
  python scripts/candidate_pipeline/fetch_mayor_status.py
  python scripts/candidate_pipeline/fetch_mayor_status.py --dry-run
  python scripts/candidate_pipeline/fetch_mayor_status.py --region seoul
  python scripts/candidate_pipeline/fetch_mayor_status.py --baseline-only  # NEC API만

환경변수:
  NEC_API_KEY:   공공데이터포털 인증키 (1단계 필수)
  ANTHROPIC_API_KEY: Anthropic API 키 (2단계 필수)
"""

import json
import os
import sys
import time
import re
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from election_overview_utils import call_claude_json

BASE_DIR = Path(__file__).resolve().parent.parent.parent
MAYOR_STATUS_PATH = BASE_DIR / "data" / "candidates" / "mayor_status.json"
ENV_FILE = BASE_DIR / ".env"


# 선관위 API
NEC_API_BASE = "http://apis.data.go.kr/9760000"
WINNER_SERVICE = f"{NEC_API_BASE}/WinnerInfoInqireService2"
SG_ID = "20220601"  # 제8회 지방선거
SG_TYPECODE = "4"    # 구·시·군의 장

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
    "seoul": "서울", "busan": "부산", "daegu": "대구",
    "incheon": "인천", "gwangju": "광주", "daejeon": "대전",
    "ulsan": "울산", "sejong": "세종", "gyeonggi": "경기",
    "gangwon": "강원", "chungbuk": "충북", "chungnam": "충남",
    "jeonbuk": "전북", "jeonnam": "전남", "gyeongbuk": "경북",
    "gyeongnam": "경남", "jeju": "제주",
}

PARTY_MAP = {
    "더불어민주당": "democratic", "민주당": "democratic",
    "국민의힘": "ppp",
    "조국혁신당": "reform", "개혁신당": "newReform",
    "진보당": "progressive", "정의당": "justice",
    "새로운미래": "newFuture", "무소속": "independent",
}

PARTY_NAMES = {
    "democratic": "더불어민주당", "ppp": "국민의힘",
    "independent": "무소속", "reform": "조국혁신당",
    "newReform": "개혁신당", "progressive": "진보당",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def load_current():
    if MAYOR_STATUS_PATH.exists():
        return json.loads(MAYOR_STATUS_PATH.read_text(encoding="utf-8"))
    return {"_meta": {}, "mayors": {}}


def normalize_party(name):
    if not name:
        return "independent"
    for k, v in PARTY_MAP.items():
        if k in name:
            return v
    return "independent"


# ============================================
# 1단계: 선관위 당선인 API (공식 베이스라인)
# ============================================
def fetch_nec_winners(api_key):
    """선관위 당선인정보 API에서 226명 기초단체장 당선 데이터 조회"""
    all_items = []
    for page in range(1, 5):
        params = {
            "sgId": SG_ID,
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
            items = list(root.iter("item"))
            all_items.extend(items)
            if len(items) < 100:
                break
        except Exception as e:
            print(f"  [오류] NEC API 페이지 {page}: {e}")
            break

    if not all_items:
        return None

    mayors = {}
    for it in all_items:
        name = it.findtext("name", "").strip()
        sgg = it.findtext("sggName", "").strip()
        party = it.findtext("jdName", "").strip()
        sd = it.findtext("sdName", "").strip()

        region_key = REGION_MAP.get(sd, "")
        if not region_key or not sgg:
            continue

        party_key = normalize_party(party)
        key = f"{region_key}_{sgg}"

        mayors[key] = {
            "region": region_key,
            "district": sgg,
            "name": name,
            "party": party_key,
            "electedParty": party_key,
            "electedName": name,
            "_source": "NEC_API",
        }

    return mayors


def merge_baseline(nec_data, existing):
    """NEC 공식 데이터를 베이스로, 기존 변경사항(권한대행 등)을 병합"""
    if not nec_data:
        return existing

    merged = {"_meta": existing.get("_meta", {}), "mayors": {}}
    existing_mayors = existing.get("mayors", {})

    for key, nec_entry in nec_data.items():
        entry = dict(nec_entry)

        # 기존에 권한대행/변경 기록이 있으면 유지
        prev = existing_mayors.get(key, {})
        if prev.get("acting"):
            entry["name"] = None
            entry["acting"] = True
            entry["actingReason"] = prev.get("actingReason", "")
            entry["party"] = "independent"  # 권한대행 = 무소속
        if prev.get("_lastChange"):
            entry["_lastChange"] = prev["_lastChange"]
            # 변경된 정당/이름이 있으면 적용
            change = prev["_lastChange"]
            if not entry.get("acting"):
                if prev.get("name") and prev["name"] != nec_entry["name"]:
                    entry["name"] = prev["name"]  # 보궐 당선자
                if prev.get("party") != nec_entry.get("electedParty"):
                    entry["party"] = prev["party"]  # 탈당 등

        merged["mayors"][key] = entry

    return merged


# ============================================
# 2단계: Gemini 변경사항 탐지 (보조)
# ============================================
def build_gemini_prompt(region_key, mayors_in_region):
    region_name = REGION_NAMES.get(region_key, region_key)
    today_str = date.today().isoformat()

    lines = []
    for key, m in mayors_in_region.items():
        district = m.get("district", "?")
        name = m.get("name") or "(권한대행)"
        elected_name = m.get("electedName", name)
        party = PARTY_NAMES.get(m.get("party", ""), m.get("party", ""))
        elected_party = PARTY_NAMES.get(m.get("electedParty", ""), "")
        acting = m.get("acting", False)
        reason = m.get("actingReason", "")

        status_parts = []
        if acting:
            status_parts.append(f"권한대행 ({reason})")
        if name != elected_name:
            status_parts.append(f"보궐당선 (원 당선인: {elected_name})")
        if m.get("party") != m.get("electedParty"):
            status_parts.append(f"정당 변경 ({elected_party} → {party})")
        status = ", ".join(status_parts) if status_parts else "재직"

        lines.append(f"- {district}: {name} ({party}) [{status}]")

    mayor_text = "\n".join(lines)

    return f"""당신은 대한민국 지방자치 전문가입니다. 오늘: {today_str}

아래는 선관위 공식 당선인 데이터 기반 {region_name}의 기초단체장 현황입니다.
2022년 제8회 지방선거 이후의 변경사항만 팩트체크하세요:

1. 사퇴·당선무효·직위상실 → 권한대행 전환
2. 보궐선거 당선으로 단체장 교체
3. 탈당·입당 등 소속정당 변경
4. 기타 신분 변동

## 현재 데이터 (선관위 공식 + 기존 변경 반영)
{mayor_text}

## 출력 형식 (JSON)
변경이 필요한 건만 JSON 배열로 출력. 없으면 []. JSON만 출력.

[
  {{
    "district": "구/시/군 이름",
    "name": "현재 단체장 (권한대행이면 null)",
    "party": "현재 정당명",
    "acting": false,
    "actingReason": "사유 (권한대행이면 기입)",
    "changeType": "party_change|resigned|invalidated|byelection_winner|restored",
    "changeDetail": "변경 내용 (날짜 포함)"
  }}
]

## 주의사항
- 확인되지 않은 사실 절대 포함 금지
- 이미 반영된 변경사항은 출력하지 마세요 (위 데이터에 이미 있는 것)
- 새로 발생한 변경사항만 출력"""



def parse_changes(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        result = json.loads(text)
        return result if isinstance(result, list) else []
    except json.JSONDecodeError:
        return []


def apply_changes(data, region_key, changes):
    applied = 0
    mayors = data.get("mayors", {})

    for change in changes:
        district = change.get("district", "")
        lookup = f"{region_key}_{district}"

        if lookup not in mayors:
            for k in mayors:
                if k.startswith(region_key + "_") and district in k:
                    lookup = k
                    break

        if lookup not in mayors:
            print(f"    [경고] '{district}' 매칭 실패")
            continue

        entry = mayors[lookup]
        old_name = entry.get("name", "?")
        old_party = entry.get("party", "?")

        if change.get("acting"):
            entry["name"] = None
            entry["acting"] = True
            entry["actingReason"] = change.get("actingReason", change.get("changeDetail", ""))
            entry["party"] = "independent"  # 권한대행 = 무소속
        else:
            entry["name"] = change.get("name", entry.get("name"))
            entry.pop("acting", None)
            entry.pop("actingReason", None)

        new_party = normalize_party(change.get("party", ""))
        if new_party:
            entry["party"] = new_party

        entry["_lastChange"] = {
            "date": date.today().isoformat(),
            "type": change.get("changeType", ""),
            "detail": change.get("changeDetail", ""),
            "previous": {"name": old_name, "party": old_party},
        }

        new_name = entry.get("name") or "권한대행"
        print(f"    [변경] {district}: {old_name}({old_party}) → {new_name}({entry.get('party')}) [{change.get('changeType','')}]")
        applied += 1

    return applied


# ============================================
# Main
# ============================================
def main():
    load_env()
    nec_key = os.environ.get("NEC_API_KEY", "")
    llm_key = os.environ.get("ANTHROPIC_API_KEY", "")
    dry_run = "--dry-run" in sys.argv
    baseline_only = "--baseline-only" in sys.argv
    target_region = None

    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == "--region" and i < len(sys.argv) - 1:
            target_region = sys.argv[i + 1]
        elif arg.startswith("--region="):
            target_region = arg.split("=")[1]

    print("=" * 60)
    print("기초단체장 현황 2단계 검증 파이프라인")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    flags = []
    if dry_run:
        flags.append("DRY RUN")
    if baseline_only:
        flags.append("BASELINE ONLY")
    if target_region:
        flags.append(f"REGION={target_region}")
    if flags:
        print(f"[{' | '.join(flags)}]")
    print("=" * 60)

    existing = load_current()

    # ── 1단계: 선관위 당선인 API ──
    print("\n[1단계] 선관위 당선인정보 API (공식 베이스라인)")
    if not nec_key:
        print("  [건너뜀] NEC_API_KEY 미설정, 기존 데이터 사용")
        data = existing
    else:
        print("  조회 중...")
        nec_data = fetch_nec_winners(nec_key)
        if nec_data:
            print(f"  → {len(nec_data)}명 당선인 조회 완료")
            data = merge_baseline(nec_data, existing)
            parties = {}
            for m in data["mayors"].values():
                p = m.get("electedParty", "?")
                parties[p] = parties.get(p, 0) + 1
            print(f"  → 정당별: {parties}")
        else:
            print("  [오류] NEC API 조회 실패, 기존 데이터 사용")
            data = existing

    acting = sum(1 for m in data.get("mayors", {}).values() if m.get("acting"))
    print(f"  → 현재 권한대행: {acting}명")

    if baseline_only:
        # 1단계만 실행하고 저장
        data["_meta"]["lastUpdated"] = date.today().isoformat()
        data["_meta"]["source"] = "중앙선거관리위원회 당선인정보 API (공식)"
        data["_meta"]["baseline"] = f"제8회 지방선거 ({SG_ID}) 당선인"
        data["_meta"]["totalCount"] = len(data.get("mayors", {}))
        data["_meta"]["actingCount"] = acting

        if not dry_run:
            MAYOR_STATUS_PATH.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            print(f"\n[저장] {MAYOR_STATUS_PATH}")
        print("\n[완료] 1단계(베이스라인)만 실행")
        return

    # ── 2단계: Gemini 변경사항 탐지 ──
    if not llm_key:
        print("  [건너뜀] ANTHROPIC_API_KEY 미설정")
    else:
        mayors = data.get("mayors", {})
        region_groups = {}
        for key, m in mayors.items():
            rk = m.get("region", key.split("_")[0])
            if target_region and rk != target_region:
                continue
            if rk not in region_groups:
                region_groups[rk] = {}
            region_groups[rk][key] = m

        total_changes = 0
        errors = []

        for region_key, region_mayors in region_groups.items():
            rname = REGION_NAMES.get(region_key, region_key)
            print(f"  [{region_key}] {rname} ({len(region_mayors)}개) 체크 중...")

            prompt = build_gemini_prompt(region_key, region_mayors)

            try:
                raw = call_claude_json(prompt, llm_key)
                changes = parse_changes(raw)

                if not changes:
                    print(f"    → 변경 없음")
                    continue

                print(f"    → {len(changes)}건 변경 감지")

                if dry_run:
                    for c in changes:
                        print(f"    [DRY] {c.get('district')}: {c.get('changeType')} - {c.get('changeDetail')}")
                else:
                    applied = apply_changes(data, region_key, changes)
                    total_changes += applied

            except Exception as e:
                print(f"    [오류] {e}")
                errors.append(region_key)

            time.sleep(1)

        print(f"\n  2단계 결과: {total_changes}건 변경 반영")
        if errors:
            print(f"  오류 시도: {', '.join(errors)}")

    # ── 저장 ──
    data["_meta"]["lastUpdated"] = date.today().isoformat()
    data["_meta"]["lastFactCheck"] = datetime.now().isoformat()
    data["_meta"]["source"] = "중앙선거관리위원회 당선인정보 API + Gemini 변경사항 검증"
    data["_meta"]["baseline"] = f"제8회 지방선거 ({SG_ID}) 당선인"
    data["_meta"]["totalCount"] = len(data.get("mayors", {}))
    data["_meta"]["actingCount"] = sum(
        1 for m in data.get("mayors", {}).values() if m.get("acting")
    )

    if not dry_run:
        MAYOR_STATUS_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"\n[저장] {MAYOR_STATUS_PATH}")

    print("\n" + "=" * 60)
    print("완료!")
    print("=" * 60)


if __name__ == "__main__":
    main()
