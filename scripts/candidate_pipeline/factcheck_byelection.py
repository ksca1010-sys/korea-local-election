#!/usr/bin/env python3
"""
재보궐선거 후보자 팩트체크 파이프라인
- 광역단체장 팩트체크와 동일한 구조
- 뉴스 기반 변경사항 감지 + 교차검증

사용법:
  python scripts/candidate_pipeline/factcheck_byelection.py
  python scripts/candidate_pipeline/factcheck_byelection.py --dry-run
"""

import json
import os
import re
import sys
import time
from datetime import datetime, date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
BYELECTION_PATH = BASE_DIR / "data" / "candidates" / "byelection.json"
ENV_FILE = BASE_DIR / ".env"

sys.path.insert(0, str(BASE_DIR / "scripts"))
sys.path.insert(0, str(BASE_DIR / "scripts" / "candidate_pipeline"))

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

PARTY_MAP = {
    "더불어민주당": "democratic", "민주당": "democratic",
    "국민의힘": "ppp", "조국혁신당": "reform",
    "개혁신당": "newReform", "진보당": "progressive",
    "정의당": "justice", "무소속": "independent",
}

PARTY_NAMES = {v: k for k, v in PARTY_MAP.items()}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def fetch_news(district_name):
    """지역구별 뉴스 수집"""
    from local_news_search import search_naver_news

    queries = [
        f'"{district_name}" 재보궐 후보 출마',
        f'"{district_name}" 국회의원 공천 경선',
        f'"{district_name}" 보궐선거 예비후보',
        f'"{district_name}" 출판기념회',
    ]
    all_news = []
    seen = set()
    for q in queries:
        for item in search_naver_news(q, display=7):
            title = item.get("title", "")
            if title not in seen:
                seen.add(title)
                all_news.append(title)
    return all_news[:15]


def build_prompt(dist, news):
    today_str = date.today().isoformat()
    candidates = dist.get("candidates", [])

    cand_lines = []
    for c in candidates:
        party = PARTY_NAMES.get(c.get("party", ""), c.get("party", c.get("partyKey", "?")))
        status_map = {"DECLARED": "출마선언", "EXPECTED": "출마거론", "RUMORED": "하마평", "WITHDRAWN": "사퇴", "NOMINATED": "공천확정"}
        status = status_map.get(c.get("status", ""), c.get("status", "?"))
        cand_lines.append(f"- {c['name']} ({party}) [{status}]: {c.get('career', '')}")

    candidate_text = "\n".join(cand_lines) if cand_lines else "(후보 없음)"
    news_text = "\n".join(f"- {n}" for n in news) if news else "(뉴스 없음)"

    return f"""당신은 2026년 6.3 재보궐선거 전문가입니다. 오늘: {today_str}

{dist['district']} 국회의원 재보궐선거 후보 현황을 아래 최신 뉴스와 비교하여 변경사항을 찾으세요.

## 🚨 사실 소스 규칙
- 아래 "최신 뉴스"에 **명시적으로 나오는 사실만** 변경사항으로 출력
- 뉴스에 없는 변경사항은 출력 금지

## 지역구 정보
- 선거구: {dist['district']}
- 유형: {dist['type']} ({dist['subType']})
- 사유: {dist['reason']}
- 전임: {dist.get('previousMember', {}).get('name', '?')} ({dist.get('previousMember', {}).get('party', '?')})

## 현재 데이터 ({len(candidates)}명)
{candidate_text}

## 최신 뉴스 (이 뉴스에서 확인되는 변경만 출력)
{news_text}

## 찾아야 할 변경사항
1. 뉴스에 나오지만 현재 데이터에 없는 새 후보
2. 사퇴·불출마 선언
3. 상태 변경 (RUMORED → DECLARED 등)
4. 정당 변경 (탈당·입당)
5. 공천 확정

## 출력 (JSON 배열, 없으면 [])
[
  {{
    "name": "후보 이름",
    "changeType": "new_candidate|status_change|withdrawn|party_change|nominated",
    "oldStatus": "이전 상태",
    "newStatus": "DECLARED|EXPECTED|RUMORED|WITHDRAWN|NOMINATED",
    "party": "정당명 (한글)",
    "career": "경력 (새 후보 시)",
    "detail": "변경 근거 — 뉴스 제목 인용"
  }}
]

## ⚠️ status 판정 기준
- DECLARED: 본인 출마 선언/예비후보 등록만
- RUMORED: "~확실시" "~거론" "~유력"은 모두 RUMORED
- NOMINATED: 당 공식 공천 발표만
- WITHDRAWN: 본인 직접 사퇴/불출마 선언만
- 출판기념회 개최 → EXPECTED"""


def call_gemini(prompt, api_key):
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    for attempt in range(5):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL, contents=[prompt],
                config=types.GenerateContentConfig(temperature=0.1, response_mime_type="application/json"),
            )
            return getattr(response, "text", "") or ""
        except Exception as e:
            if "429" in str(e) or "503" in str(e):
                wait = min(60 * (attempt + 1), 120)
                print(f"    [재시도] {wait}초 대기")
                time.sleep(wait)
            else:
                raise
    return "[]"


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


def apply_changes(dist, changes, dry_run=False):
    from verify_changes import verify_changes_against_news
    applied = 0
    candidates = dist.get("candidates", [])
    existing_names = {c["name"] for c in candidates}

    for change in changes:
        name = change.get("name", "")
        change_type = change.get("changeType", "")
        new_status = change.get("newStatus", "DECLARED")
        party_raw = change.get("party", "")
        party_key = PARTY_MAP.get(party_raw, "independent")

        if change_type == "new_candidate":
            if name in existing_names:
                continue
            label = f"[신규] {name} ({party_raw}, {new_status}) — {change.get('detail', '')[:50]}"
            if dry_run:
                print(f"    [DRY] {label}")
            else:
                candidates.append({
                    "name": name,
                    "party": party_key,
                    "partyKey": party_key,
                    "career": change.get("career", ""),
                    "status": new_status,
                    "dataSource": "news_factcheck",
                    "pledges": [],
                })
                print(f"    {label}")
            applied += 1

        elif change_type in ("status_change", "withdrawn", "nominated"):
            existing = next((c for c in candidates if c["name"] == name), None)
            if not existing:
                continue
            old_status = existing.get("status", "?")
            if old_status == new_status:
                continue
            label = f"[상태] {name} {old_status}→{new_status} — {change.get('detail', '')[:50]}"
            if dry_run:
                print(f"    [DRY] {label}")
            else:
                existing["status"] = new_status
                print(f"    {label}")
            applied += 1

        elif change_type == "party_change":
            existing = next((c for c in candidates if c["name"] == name), None)
            if not existing:
                continue
            if dry_run:
                print(f"    [DRY] [정당] {name} → {party_raw}")
            else:
                existing["party"] = party_key
                existing["partyKey"] = party_key
                print(f"    [정당] {name} → {party_raw}")
            applied += 1

    return applied


def main():
    load_env()
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    dry_run = "--dry-run" in sys.argv

    if not gemini_key:
        print("[오류] GEMINI_API_KEY 미설정")
        sys.exit(1)

    print("=" * 55)
    print("재보궐 후보자 팩트체크 파이프라인")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if dry_run:
        print("[DRY RUN]")
    print("=" * 55)

    bye = json.loads(BYELECTION_PATH.read_text(encoding="utf-8"))
    total_applied = 0

    for key, dist in bye.get("districts", {}).items():
        district_name = dist["district"]

        # 뉴스 수집
        news = fetch_news(district_name)
        print(f"\n[{key}] {district_name} (뉴스 {len(news)}건, 후보 {len(dist.get('candidates', []))}명)")

        # Gemini 팩트체크
        prompt = build_prompt(dist, news)
        try:
            raw = call_gemini(prompt, gemini_key)
            changes = parse_changes(raw)

            if not changes:
                print("    → 변경 없음")
                continue

            print(f"    → {len(changes)}건 감지 (Gemini)")

            # 교차검증
            from verify_changes import verify_changes_against_news
            changes = verify_changes_against_news(changes, news)
            print(f"    → {len(changes)}건 검증 통과")

            applied = apply_changes(dist, changes, dry_run)
            total_applied += applied

        except Exception as e:
            print(f"    [오류] {e}")

        time.sleep(1)

    print(f"\n총 {total_applied}건 적용")

    if not dry_run and total_applied > 0:
        bye["_meta"]["lastFactCheck"] = datetime.now().isoformat()
        bye["_meta"]["lastUpdated"] = date.today().isoformat()
        BYELECTION_PATH.write_text(
            json.dumps(bye, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"[저장] {BYELECTION_PATH}")


if __name__ == "__main__":
    main()
