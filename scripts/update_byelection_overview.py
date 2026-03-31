#!/usr/bin/env python3
"""
재보궐선거 개요 생성 스크립트
- 5개 재보궐 지역구의 narrative 개요 생성
- election_overview.json의 byelection 섹션에 저장

사용법:
  python scripts/update_byelection_overview.py
  python scripts/update_byelection_overview.py --dry-run
"""

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import date, datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))

from election_overview_utils import (
    OVERVIEW_PATH, MODEL, API_KEY_ENV,
    load_env, search_latest_news, call_llm, parse_response,
    validate_overview, build_narrative_prompt, extract_facts,
)

BYE_STATE_PATH = BASE_DIR / "data" / "byelection_overview_state.json"


def _load_bye_state():
    if BYE_STATE_PATH.exists():
        return json.loads(BYE_STATE_PATH.read_text(encoding="utf-8"))
    return {}


def _save_bye_state(state):
    BYE_STATE_PATH.write_text(
        json.dumps(state, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )


def _content_hash(news, candidates=None):
    parts = ["NEWS:" + "\n".join(sorted(news))]
    if candidates:
        cand_keys = sorted(
            f"{c.get('name','')}|{c.get('party',c.get('partyKey',''))}|{c.get('status','')}"
            for c in candidates if c.get("status") != "WITHDRAWN"
        )
        parts.append("CAND:" + "\n".join(cand_keys))
    return hashlib.md5("\n\n".join(parts).encode()).hexdigest()


def fetch_byelection_news(district_name):
    """재보궐 지역구 뉴스 수집"""
    queries = [
        f'"{district_name}" 재보궐 후보 출마',
        f'"{district_name}" 보궐선거 공천',
        f'"{district_name}" 국회의원 선거',
    ]
    all_news = []
    seen = set()
    for q in queries:
        for item in search_latest_news(q, display=7):
            if item not in seen:
                seen.add(item)
                all_news.append(item)
    return all_news[:15]


def main():
    parser = argparse.ArgumentParser(description="재보궐 개요 생성")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get(API_KEY_ENV, "")
    if not api_key and not args.dry_run:
        print(f"[오류] {API_KEY_ENV} 미설정")
        sys.exit(1)

    bye = json.loads((BASE_DIR / "data/candidates/byelection.json").read_text(encoding="utf-8"))
    overview = json.loads(OVERVIEW_PATH.read_text(encoding="utf-8"))
    bye_state = _load_bye_state()

    if "byelection" not in overview:
        overview["byelection"] = {}

    print("=" * 55)
    print("재보궐선거 개요 생성")
    print("=" * 55)

    skipped = 0
    updated = 0

    for key, dist in bye.get("districts", {}).items():
        district_name = dist["district"]
        print(f"\n[{key}] {district_name}...")

        # 뉴스 수집
        news = fetch_byelection_news(district_name)
        print(f"  뉴스 {len(news)}건")

        if args.dry_run:
            continue

        # 콘텐츠 해시 비교 (뉴스+후보)
        dist_candidates = dist.get("candidates", [])
        nh = _content_hash(news, dist_candidates)
        prev_hash = bye_state.get(key, {}).get("contentHash")
        prev = overview.get("byelection", {}).get(key, {})

        if prev_hash == nh and prev.get("headline"):
            print(f"  변화 없음, 기존 유지")
            skipped += 1
            continue

        # 후보 텍스트
        cand_lines = []
        for c in dist.get("candidates", []):
            if c.get("status") == "WITHDRAWN":
                continue
            if not c.get("name"):
                continue
            party = c.get("partyKey", c.get("party", "independent"))
            cand_lines.append(f"- {c['name']} ({party}, {c.get('status','?')}): {c.get('career','')}")
        cand_text = "\n".join(cand_lines) if cand_lines else "(후보 미정)"

        # 이전 개요
        prev_text = prev.get("narrative", "(없음)")

        extra = f"""## 재보궐선거 특수 원칙
- 이 선거는 {dist.get('subType', '보궐선거')}이다. 사유: {dist.get('reason', '')}
- 전임: {dist.get('previousMember', {}).get('name', '?')} ({dist.get('previousMember', {}).get('party', '?')})
- 지방선거와 동시 실시되는 국회의원 재보궐선거의 특수성을 반영할 것"""

        prompt = build_narrative_prompt(
            region_name=district_name,
            election_type_label="국회의원 재보궐",
            candidates_text=cand_text,
            polls_text="(재보궐 여론조사 별도 수집 안 됨)",
            news_text=chr(10).join(news) if news else "(뉴스 없음)",
            prev_overview_text=prev_text,
            extra_context=extra,
        )

        try:
            raw = call_llm(prompt, api_key, max_tokens=1500,
                          suffix="\n\nJSON만 출력하세요. 다른 텍스트 없이.")
            obj = parse_response(raw)
            if obj and validate_overview(obj):
                obj["facts"] = extract_facts(dist_candidates, [], "byelection")
                overview["byelection"][key] = obj
                bye_state[key] = {
                    "contentHash": nh,
                    "lastUpdated": datetime.now().isoformat(),
                }
                updated += 1
                print(f"  → {obj.get('headline', '')[:30]}")
            else:
                print(f"  [경고] 파싱 실패")
        except Exception as e:
            print(f"  [오류] {e}")

        time.sleep(1)

    if not args.dry_run:
        overview["meta"]["lastUpdated"] = date.today().isoformat()
        OVERVIEW_PATH.write_text(
            json.dumps(overview, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )
        _save_bye_state(bye_state)
        print(f"\n[저장] {OVERVIEW_PATH}")
        print(f"LLM {updated}회, 스킵 {skipped}회")


if __name__ == "__main__":
    main()
