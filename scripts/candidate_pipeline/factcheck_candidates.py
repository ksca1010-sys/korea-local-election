#!/usr/bin/env python3
"""
후보자 상태 자동 팩트체크 파이프라인

기존 governor.json의 후보 목록을 Gemini에 보여주고,
출마 선언·사퇴·공천 확정·탈당 등 변경사항을 자동 감지하여 반영합니다.

사용법:
  python scripts/candidate_pipeline/factcheck_candidates.py
  python scripts/candidate_pipeline/factcheck_candidates.py --dry-run

환경변수:
  GEMINI_API_KEY: Gemini API 키
"""

import json
import os
import sys
import time
import re
from datetime import datetime, date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CANDIDATES_PATH = BASE_DIR / "data" / "candidates" / "governor.json"
ENV_FILE = BASE_DIR / ".env"

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

REGION_NAMES = {
    "seoul": "서울특별시", "busan": "부산광역시", "daegu": "대구광역시",
    "incheon": "인천광역시", "gwangju": "광주광역시", "daejeon": "대전광역시",
    "ulsan": "울산광역시", "sejong": "세종특별자치시", "gyeonggi": "경기도",
    "gangwon": "강원특별자치도", "chungbuk": "충청북도", "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도", "jeonnam": "전라남도", "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도", "jeju": "제주특별자치도",
}

PARTY_NAMES = {
    "democratic": "더불어민주당", "ppp": "국민의힘",
    "independent": "무소속", "reform": "조국혁신당",
    "progressive": "진보당", "justice": "정의당",
    "newReform": "개혁신당",
}

PARTY_MAP = {
    "더불어민주당": "democratic", "민주당": "democratic",
    "국민의힘": "ppp", "조국혁신당": "reform",
    "개혁신당": "newReform", "진보당": "progressive",
    "정의당": "justice", "무소속": "independent",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def load_candidates():
    if CANDIDATES_PATH.exists():
        return json.loads(CANDIDATES_PATH.read_text(encoding="utf-8"))
    return {"_meta": {}, "candidates": {}}


def build_prompt(candidates_data):
    today_str = date.today().isoformat()
    regions = candidates_data.get("candidates", {})

    lines = []
    for rk in sorted(regions.keys()):
        region_name = REGION_NAMES.get(rk, rk)
        candidates = regions[rk]
        for c in candidates:
            party = PARTY_NAMES.get(c.get("party", ""), c.get("party", ""))
            status = c.get("status", "UNKNOWN")
            status_map = {
                "DECLARED": "출마선언",
                "EXPECTED": "출마거론",
                "RUMORED": "하마평",
                "WITHDRAWN": "사퇴",
                "PRE": "예비후보",
                "NOMINATED": "공천확정",
            }
            status_label = status_map.get(status, status)
            lines.append(f"- {region_name}: {c['name']} ({party}) [{status_label}]")

    candidate_text = "\n".join(lines)
    total = sum(len(v) for v in regions.values())

    return f"""당신은 2026년 6.3 지방선거 전문가입니다. 오늘: {today_str}

아래는 17개 시도 광역단체장(시도지사) 후보 현황 {total}명입니다.
최근 뉴스를 기반으로 변경사항만 팩트체크하세요:

1. 새로운 출마 선언 (기존 목록에 없는 인물)
2. 사퇴·불출마 선언 (기존 DECLARED/EXPECTED → WITHDRAWN)
3. 상태 변경 (RUMORED → DECLARED, EXPECTED → DECLARED 등)
4. 정당 변경 (탈당·입당·공천)
5. 공천 확정 (DECLARED → NOMINATED)

## 현재 데이터
{candidate_text}

## 출력 형식 (JSON)
변경이 필요한 건만 JSON 배열로 출력. 없으면 []. JSON만 출력.

[
  {{
    "region": "시도 키 (seoul, busan 등)",
    "name": "후보 이름",
    "changeType": "new_candidate|status_change|withdrawn|party_change|nominated",
    "oldStatus": "이전 상태 (변경 시)",
    "newStatus": "새 상태 (DECLARED|EXPECTED|RUMORED|WITHDRAWN|NOMINATED)",
    "party": "정당명 (한글, 새 후보 또는 정당변경 시)",
    "career": "경력 (새 후보 시, 1줄)",
    "detail": "변경 내용 (날짜 포함)"
  }}
]

## 주의사항
- 확인되지 않은 사실 절대 포함 금지
- 이미 반영된 변경사항은 출력 금지
- 2026 지방선거 광역단체장만 해당 (교육감, 기초단체장 제외)
- 공천 확정은 당 공식 발표 기준"""


def call_gemini(prompt, api_key, max_retries=5):
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[prompt],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )
            return getattr(response, "text", "") or ""
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                match = re.search(r"retry.*?(\d+)", err_str, re.IGNORECASE)
                wait = int(match.group(1)) + 5 if match else 30 * (attempt + 1)
                print(f"  [재시도] {min(wait, 120)}초 대기 ({attempt+1}/{max_retries})")
                time.sleep(min(wait, 120))
            else:
                raise
    return "[]"


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


def apply_changes(data, changes, dry_run=False):
    applied = 0
    candidates = data.get("candidates", {})

    for change in changes:
        region = change.get("region", "")
        name = change.get("name", "")
        change_type = change.get("changeType", "")
        region_name = REGION_NAMES.get(region, region)

        if region not in candidates:
            print(f"  [경고] '{region}' 없음")
            continue

        region_list = candidates[region]
        existing = next((c for c in region_list if c["name"] == name), None)

        if change_type == "new_candidate":
            if existing:
                print(f"  [건너뜀] {region_name}: {name} 이미 존재")
                continue
            party = PARTY_MAP.get(change.get("party", ""), "independent")
            new_id = f"{region}-{len(region_list)+1}"
            new_candidate = {
                "id": new_id,
                "name": name,
                "party": party,
                "age": None,
                "career": change.get("career", ""),
                "photo": None,
                "status": change.get("newStatus", "DECLARED"),
                "dataSource": "gemini",
                "pledges": [],
            }
            label = f"[신규] {region_name}: {name} ({PARTY_NAMES.get(party, party)}) - {change.get('detail', '')}"
            if dry_run:
                print(f"  [DRY] {label}")
            else:
                region_list.append(new_candidate)
                print(f"  {label}")
            applied += 1

        elif change_type in ("status_change", "withdrawn", "nominated"):
            if not existing:
                print(f"  [경고] {region_name}: {name} 없음")
                continue
            old_status = existing.get("status", "?")
            new_status = change.get("newStatus", "WITHDRAWN" if change_type == "withdrawn" else "DECLARED")
            if old_status == new_status:
                continue
            label = f"[상태변경] {region_name}: {name} {old_status} → {new_status} - {change.get('detail', '')}"
            if dry_run:
                print(f"  [DRY] {label}")
            else:
                existing["status"] = new_status
                existing["_lastChange"] = {
                    "date": date.today().isoformat(),
                    "type": change_type,
                    "detail": change.get("detail", ""),
                    "previous": old_status,
                }
                print(f"  {label}")
            applied += 1

        elif change_type == "party_change":
            if not existing:
                print(f"  [경고] {region_name}: {name} 없음")
                continue
            new_party = PARTY_MAP.get(change.get("party", ""), "independent")
            old_party = existing.get("party", "?")
            if old_party == new_party:
                continue
            label = f"[정당변경] {region_name}: {name} {PARTY_NAMES.get(old_party, old_party)} → {PARTY_NAMES.get(new_party, new_party)} - {change.get('detail', '')}"
            if dry_run:
                print(f"  [DRY] {label}")
            else:
                existing["party"] = new_party
                print(f"  {label}")
            applied += 1

    return applied


def main():
    load_env()
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    dry_run = "--dry-run" in sys.argv

    if not gemini_key:
        print("[오류] GEMINI_API_KEY 미설정")
        sys.exit(1)

    print("=" * 60)
    print("후보자 상태 자동 팩트체크 파이프라인")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if dry_run:
        print("[DRY RUN]")
    print("=" * 60)

    data = load_candidates()
    total = sum(len(v) for v in data.get("candidates", {}).values())
    print(f"\n현재 후보: {total}명 ({len(data.get('candidates', {}))}개 시도)")

    prompt = build_prompt(data)
    print(f"\nGemini 팩트체크 중... (모델: {GEMINI_MODEL})")

    try:
        raw = call_gemini(prompt, gemini_key)
        changes = parse_changes(raw)

        if not changes:
            print("  → 변경 없음")
        else:
            print(f"  → {len(changes)}건 변경 감지")
            applied = apply_changes(data, changes, dry_run)
            print(f"  → {applied}건 적용")
    except Exception as e:
        print(f"  [오류] {e}")
        return

    if not dry_run and changes:
        data["_meta"]["lastFactCheck"] = datetime.now().isoformat()
        data["_meta"]["lastUpdated"] = date.today().isoformat()
        CANDIDATES_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"\n[저장] {CANDIDATES_PATH}")

    print("\n" + "=" * 60)
    print("완료!")
    print("=" * 60)


if __name__ == "__main__":
    main()
