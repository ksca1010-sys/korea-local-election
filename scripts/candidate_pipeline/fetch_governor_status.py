#!/usr/bin/env python3
"""
광역단체장 현황 2단계 검증 파이프라인

[1단계] 선관위 당선인 API → 17명 공식 당선 데이터
[2단계] Gemini → 당선 이후 변경사항만 검증 (사퇴, 탈당, 권한대행 등)


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from election_overview_utils import call_claude_json
사용법:
  python scripts/candidate_pipeline/fetch_governor_status.py
  python scripts/candidate_pipeline/fetch_governor_status.py --dry-run
  python scripts/candidate_pipeline/fetch_governor_status.py --baseline-only

환경변수:
  NEC_API_KEY:   공공데이터포털 인증키 (1단계)
  GEMINI_API_KEY: Gemini API 키 (2단계)
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
GOVERNOR_STATUS_PATH = BASE_DIR / "data" / "candidates" / "governor_status.json"
ENV_FILE = BASE_DIR / ".env"


NEC_API_BASE = "http://apis.data.go.kr/9760000"
WINNER_SERVICE = f"{NEC_API_BASE}/WinnerInfoInqireService2"
SG_ID = "20220601"
SG_TYPECODE = "3"  # 시·도지사

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

PARTY_MAP = {
    "더불어민주당": "democratic", "민주당": "democratic",
    "국민의힘": "ppp", "조국혁신당": "reform",
    "개혁신당": "newReform", "무소속": "independent",
}

PARTY_NAMES = {
    "democratic": "더불어민주당", "ppp": "국민의힘",
    "independent": "무소속", "reform": "조국혁신당",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def load_current():
    if GOVERNOR_STATUS_PATH.exists():
        return json.loads(GOVERNOR_STATUS_PATH.read_text(encoding="utf-8"))
    return {"_meta": {}, "governors": {}}


def normalize_party(name):
    if not name:
        return "independent"
    for k, v in PARTY_MAP.items():
        if k in name:
            return v
    return "independent"


# ============================================
# 1단계: 선관위 당선인 API
# ============================================
def fetch_nec_winners(api_key):
    params = {
        "sgId": SG_ID,
        "sgTypecode": SG_TYPECODE,
        "numOfRows": "100",
        "pageNo": "1",
        "resultType": "xml",
    }
    qs = urllib.parse.urlencode(params)
    url = f"{WINNER_SERVICE}/getWinnerInfoInqire?serviceKey={urllib.parse.quote(api_key, safe='')}&{qs}"

    try:
        resp = urllib.request.urlopen(url, timeout=30)
        data = resp.read().decode("utf-8")
        root = ET.fromstring(data)
    except Exception as e:
        print(f"  [오류] NEC API: {e}")
        return None

    governors = {}
    for it in root.iter("item"):
        name = it.findtext("name", "").strip()
        sd = it.findtext("sdName", "").strip()
        party = it.findtext("jdName", "").strip()

        region_key = REGION_MAP.get(sd, "")
        if not region_key:
            continue

        party_key = normalize_party(party)
        governors[region_key] = {
            "region": region_key,
            "name": name,
            "party": party_key,
            "electedParty": party_key,
            "electedName": name,
            "_source": "NEC_API",
        }

    return governors


def merge_baseline(nec_data, existing):
    if not nec_data:
        return existing

    merged = {"_meta": existing.get("_meta", {}), "governors": {}}
    existing_govs = existing.get("governors", {})

    for key, nec_entry in nec_data.items():
        entry = dict(nec_entry)
        prev = existing_govs.get(key, {})
        if prev.get("acting"):
            entry["name"] = None
            entry["acting"] = True
            entry["actingReason"] = prev.get("actingReason", "")
            entry["party"] = "independent"  # 권한대행 = 무소속
        if prev.get("_lastChange"):
            entry["_lastChange"] = prev["_lastChange"]
            if not entry.get("acting"):
                if prev.get("name") and prev["name"] != nec_entry["name"]:
                    entry["name"] = prev["name"]
                if prev.get("party") != nec_entry.get("electedParty"):
                    entry["party"] = prev["party"]
        merged["governors"][key] = entry

    return merged


# ============================================
# 2단계: Gemini 변경사항 탐지
# ============================================
def build_gemini_prompt(governors):
    today_str = date.today().isoformat()

    lines = []
    for key, g in governors.items():
        region_name = REGION_NAMES.get(key, key)
        name = g.get("name") or "(권한대행)"
        elected_name = g.get("electedName", name)
        party = PARTY_NAMES.get(g.get("party", ""), g.get("party", ""))
        elected_party = PARTY_NAMES.get(g.get("electedParty", ""), "")
        acting = g.get("acting", False)
        reason = g.get("actingReason", "")

        status_parts = []
        if acting:
            status_parts.append(f"권한대행 ({reason})")
        if name != elected_name:
            status_parts.append(f"보궐당선 (원 당선인: {elected_name})")
        if g.get("party") != g.get("electedParty"):
            status_parts.append(f"정당 변경 ({elected_party} → {party})")
        status = ", ".join(status_parts) if status_parts else "재직"

        lines.append(f"- {region_name}: {name} ({party}) [{status}]")

    governor_text = "\n".join(lines)

    return f"""당신은 대한민국 지방자치 전문가입니다. 오늘: {today_str}

아래는 선관위 공식 당선인 데이터 기반 17개 시도 광역단체장(시도지사) 현황입니다.
2022년 제8회 지방선거 이후의 변경사항만 팩트체크하세요:

1. 사퇴 → 권한대행 전환 (2026 지방선거 출마 위한 사퇴 포함)
2. 탈당·입당 등 소속정당 변경
3. 당선무효·직위상실
4. 부지사/행정부지사 권한대행 전환

## 현재 데이터 (선관위 공식 + 기존 변경 반영)
{governor_text}

## 출력 형식 (JSON)
변경이 필요한 건만 JSON 배열로 출력. 없으면 []. JSON만 출력.

[
  {{
    "region": "시도 키 (seoul, busan 등)",
    "name": "현재 단체장 (권한대행이면 null)",
    "party": "현재 정당명",
    "acting": false,
    "actingHead": "권한대행자 이름 (해당 시만)",
    "actingReason": "사유",
    "changeType": "party_change|resigned|invalidated|restored",
    "changeDetail": "변경 내용 (날짜 포함)"
  }}
]

## 주의사항
- 확인되지 않은 사실 절대 포함 금지
- 이미 반영된 변경사항은 출력 금지
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


def apply_changes(data, changes):
    applied = 0
    governors = data.get("governors", {})

    for change in changes:
        region = change.get("region", "")
        if region not in governors:
            print(f"    [경고] '{region}' 매칭 실패")
            continue

        entry = governors[region]
        region_name = REGION_NAMES.get(region, region)
        old_name = entry.get("name", "?")
        old_party = entry.get("party", "?")

        if change.get("acting"):
            entry["name"] = None
            entry["acting"] = True
            entry["actingReason"] = change.get("actingReason", change.get("changeDetail", ""))
            entry["party"] = "independent"  # 권한대행 = 무소속
            if change.get("actingHead"):
                entry["actingHead"] = change["actingHead"]
        else:
            entry["name"] = change.get("name", entry.get("name"))
            entry.pop("acting", None)
            entry.pop("actingReason", None)
            entry.pop("actingHead", None)

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
        print(f"    [변경] {region_name}: {old_name}({old_party}) → {new_name}({entry.get('party')}) [{change.get('changeType','')}]")
        applied += 1

    return applied


def main():
    load_env()
    nec_key = os.environ.get("NEC_API_KEY", "")
    llm_key = os.environ.get("GEMINI_API_KEY", "")
    dry_run = "--dry-run" in sys.argv
    baseline_only = "--baseline-only" in sys.argv

    print("=" * 60)
    print("광역단체장 현황 2단계 검증 파이프라인")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if dry_run:
        print("[DRY RUN]")
    if baseline_only:
        print("[BASELINE ONLY]")
    print("=" * 60)

    existing = load_current()

    # ── 1단계 ──
    print("\n[1단계] 선관위 당선인정보 API (공식 베이스라인)")
    if not nec_key:
        print("  [건너뜀] NEC_API_KEY 미설정")
        data = existing
    else:
        print("  조회 중...")
        nec_data = fetch_nec_winners(nec_key)
        if nec_data:
            print(f"  → {len(nec_data)}명 당선인 조회 완료")
            data = merge_baseline(nec_data, existing)
        else:
            print("  [오류] NEC API 실패, 기존 데이터 사용")
            data = existing

    acting = sum(1 for g in data.get("governors", {}).values() if g.get("acting"))
    print(f"  → 현재 권한대행: {acting}명")

    if baseline_only:
        data["_meta"].update({
            "lastUpdated": date.today().isoformat(),
            "source": "중앙선거관리위원회 당선인정보 API (공식)",
            "totalCount": len(data.get("governors", {})),
            "actingCount": acting,
        })
        if not dry_run:
            GOVERNOR_STATUS_PATH.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            print(f"\n[저장] {GOVERNOR_STATUS_PATH}")
        return

    # ── 2단계 ──
    if not llm_key:
        print("  [건너뜀] GEMINI_API_KEY 미설정")
    else:
        prompt = build_gemini_prompt(data.get("governors", {}))
        try:
            raw = call_claude_json(prompt, llm_key)
            changes = parse_changes(raw)

            if not changes:
                print("  → 변경 없음")
            else:
                print(f"  → {len(changes)}건 변경 감지")
                if dry_run:
                    for c in changes:
                        print(f"    [DRY] {REGION_NAMES.get(c.get('region',''), c.get('region',''))}: {c.get('changeType')} - {c.get('changeDetail')}")
                else:
                    apply_changes(data, changes)
        except Exception as e:
            print(f"  [오류] {e}")

    # ── 저장 ──
    data["_meta"].update({
        "lastUpdated": date.today().isoformat(),
        "lastFactCheck": datetime.now().isoformat(),
        "source": "중앙선거관리위원회 당선인정보 API + Gemini 변경사항 검증",
        "totalCount": len(data.get("governors", {})),
        "actingCount": sum(1 for g in data.get("governors", {}).values() if g.get("acting")),
    })

    if not dry_run:
        GOVERNOR_STATUS_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"\n[저장] {GOVERNOR_STATUS_PATH}")

    print("\n" + "=" * 60)
    print("완료!")
    print("=" * 60)


if __name__ == "__main__":
    main()
