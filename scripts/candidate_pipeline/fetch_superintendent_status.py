#!/usr/bin/env python3
"""
교육감 현황 2단계 검증 파이프라인

[1단계] 선관위 당선인 API → 17명 공식 당선 데이터 + 보궐선거 반영
[2단계] Gemini → 당선 이후 변경사항만 검증 (사퇴, 직위상실 등)


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from election_overview_utils import call_claude_json
교육감 특이사항: 무소속 (정당 추천 없음), 성향(진보/보수/중도)으로 구분

사용법:
  python scripts/candidate_pipeline/fetch_superintendent_status.py
  python scripts/candidate_pipeline/fetch_superintendent_status.py --dry-run
  python scripts/candidate_pipeline/fetch_superintendent_status.py --baseline-only

환경변수:
  NEC_API_KEY:   공공데이터포털 인증키 (1단계)
  ANTHROPIC_API_KEY: Anthropic API 키 (2단계)
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
STATUS_PATH = BASE_DIR / "data" / "candidates" / "superintendent_status.json"
ENV_FILE = BASE_DIR / ".env"


NEC_API_BASE = "http://apis.data.go.kr/9760000"
WINNER_SERVICE = f"{NEC_API_BASE}/WinnerInfoInqireService2"
SG_TYPECODE = "11"  # 교육감

# 제8회 + 이후 보궐 선거 ID
ELECTION_IDS = [
    ("20220601", "제8회 지방선거"),
    ("20241016", "2024 보궐선거"),
]

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
    "seoul": "서울", "busan": "부산", "daegu": "대구", "incheon": "인천",
    "gwangju": "광주", "daejeon": "대전", "ulsan": "울산", "sejong": "세종",
    "gyeonggi": "경기", "gangwon": "강원", "chungbuk": "충북", "chungnam": "충남",
    "jeonbuk": "전북", "jeonnam": "전남", "gyeongbuk": "경북",
    "gyeongnam": "경남", "jeju": "제주",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def load_current():
    if STATUS_PATH.exists():
        return json.loads(STATUS_PATH.read_text(encoding="utf-8"))
    return {"_meta": {}, "superintendents": {}}


# ============================================
# 1단계: 선관위 당선인 API
# ============================================
def fetch_nec_winners(api_key):
    supers = {}

    for sg_id, label in ELECTION_IDS:
        params = {
            "sgId": sg_id, "sgTypecode": SG_TYPECODE,
            "numOfRows": "100", "pageNo": "1", "resultType": "xml",
        }
        qs = urllib.parse.urlencode(params)
        url = f"{WINNER_SERVICE}/getWinnerInfoInqire?serviceKey={urllib.parse.quote(api_key, safe='')}&{qs}"

        try:
            resp = urllib.request.urlopen(url, timeout=30)
            root = ET.fromstring(resp.read().decode("utf-8"))
            count = 0
            for it in root.iter("item"):
                name = it.findtext("name", "").strip()
                sd = it.findtext("sdName", "").strip()
                rk = REGION_MAP.get(sd, "")
                if not rk:
                    continue

                if rk in supers:
                    # 보궐 당선 → 기존 데이터 업데이트
                    supers[rk]["name"] = name
                    supers[rk]["note"] = f"{label} 당선, {supers[rk]['electedName']} 후임"
                    supers[rk]["_source"] = f"NEC_API_{sg_id}"
                else:
                    supers[rk] = {
                        "region": rk,
                        "name": name,
                        "electedName": name,
                        "electedYear": int(sg_id[:4]),
                        "_source": f"NEC_API_{sg_id}",
                    }
                count += 1
            print(f"  {label} ({sg_id}): {count}명")
        except Exception as e:
            print(f"  {label}: 오류 - {e}")

    return supers if supers else None


def merge_baseline(nec_data, existing):
    if not nec_data:
        return existing

    merged = {"_meta": existing.get("_meta", {}), "superintendents": {}}
    existing_supers = existing.get("superintendents", {})

    for key, nec_entry in nec_data.items():
        entry = dict(nec_entry)
        prev = existing_supers.get(key, {})
        # 성향 정보 유지
        if prev.get("stance"):
            entry["stance"] = prev["stance"]
        if prev.get("acting"):
            entry["name"] = None
            entry["acting"] = True
            entry["actingReason"] = prev.get("actingReason", "")
        if prev.get("note") and "note" not in entry:
            entry["note"] = prev["note"]
        if prev.get("_lastChange"):
            entry["_lastChange"] = prev["_lastChange"]
        merged["superintendents"][key] = entry

    return merged


# ============================================
# 2단계: Gemini 변경사항 탐지
# ============================================
def build_gemini_prompt(supers):
    today_str = date.today().isoformat()

    lines = []
    for key, s in supers.items():
        region_name = REGION_NAMES.get(key, key)
        name = s.get("name") or "(권한대행)"
        stance = s.get("stance", "?")
        acting = s.get("acting", False)
        note = s.get("note", "")
        reason = s.get("actingReason", "")

        status = f"권한대행 ({reason})" if acting else "재직"
        extra = f" [{note}]" if note else ""

        lines.append(f"- {region_name}: {name} (성향: {stance}) [{status}]{extra}")

    text = "\n".join(lines)

    return f"""당신은 대한민국 교육자치 전문가입니다. 오늘: {today_str}

아래는 선관위 공식 데이터 기반 17개 시도 교육감 현황입니다.
2022년 제8회 지방선거 이후의 변경사항만 팩트체크하세요:

1. 사퇴·직위상실 → 권한대행 전환
2. 보궐선거 당선으로 교육감 교체
3. 임기 중 성향 변화 (해당 시만)
4. 연임 제한 대상 여부 (3선 불가)

## 현재 데이터 (선관위 공식 + 기존 변경 반영)
{text}

## 출력 형식 (JSON)
변경이 필요한 건만 JSON 배열. 없으면 []. JSON만 출력.

[
  {{
    "region": "시도 키",
    "name": "현재 교육감 (권한대행이면 null)",
    "stance": "진보|보수|중도",
    "acting": false,
    "actingReason": "사유",
    "changeType": "resigned|invalidated|byelection_winner|restored",
    "changeDetail": "변경 내용 (날짜 포함)"
  }}
]

주의: 확인되지 않은 사실 절대 포함 금지. 이미 반영된 변경은 출력 금지."""



def parse_changes(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
    try:
        result = json.loads(text.strip())
        return result if isinstance(result, list) else []
    except json.JSONDecodeError:
        return []


def apply_changes(data, changes):
    applied = 0
    supers = data.get("superintendents", {})

    for change in changes:
        region = change.get("region", "")
        if region not in supers:
            print(f"    [경고] '{region}' 매칭 실패")
            continue

        entry = supers[region]
        rname = REGION_NAMES.get(region, region)
        old_name = entry.get("name", "?")

        if change.get("acting"):
            entry["name"] = None
            entry["acting"] = True
            entry["actingReason"] = change.get("actingReason", change.get("changeDetail", ""))
        else:
            entry["name"] = change.get("name", entry.get("name"))
            entry.pop("acting", None)
            entry.pop("actingReason", None)

        if change.get("stance"):
            entry["stance"] = change["stance"]

        entry["_lastChange"] = {
            "date": date.today().isoformat(),
            "type": change.get("changeType", ""),
            "detail": change.get("changeDetail", ""),
        }

        new_name = entry.get("name") or "권한대행"
        print(f"    [변경] {rname}: {old_name} → {new_name} [{change.get('changeType','')}]")
        applied += 1
    return applied


def main():
    load_env()
    nec_key = os.environ.get("NEC_API_KEY", "")
    llm_key = os.environ.get("ANTHROPIC_API_KEY", "")
    dry_run = "--dry-run" in sys.argv
    baseline_only = "--baseline-only" in sys.argv

    print("=" * 60)
    print("교육감 현황 2단계 검증 파이프라인")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if dry_run: print("[DRY RUN]")
    if baseline_only: print("[BASELINE ONLY]")
    print("=" * 60)

    existing = load_current()

    # ── 1단계 ──
    print("\n[1단계] 선관위 당선인정보 API")
    if not nec_key:
        print("  [건너뜀] NEC_API_KEY 미설정")
        data = existing
    else:
        nec_data = fetch_nec_winners(nec_key)
        if nec_data:
            data = merge_baseline(nec_data, existing)
            print(f"  → {len(data.get('superintendents', {}))}명 완료")
        else:
            data = existing

    if baseline_only or not llm_key:
        if not llm_key and not baseline_only:
            print("\n[2단계] [건너뜀] ANTHROPIC_API_KEY 미설정")
    else:
        # ── 2단계 ──
        prompt = build_gemini_prompt(data.get("superintendents", {}))
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
        "totalCount": len(data.get("superintendents", {})),
        "note": "교육감은 무소속 (정당 추천 없음), stance=성향",
    })

    if not dry_run:
        STATUS_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"\n[저장] {STATUS_PATH}")

    print("\n" + "=" * 60)
    print("완료!")
    print("=" * 60)


if __name__ == "__main__":
    main()
