#!/usr/bin/env python3
"""
도전자 후보 집중 발굴 (Claude 활용)
- 1명뿐인 인구 20만+ 시군구 대상
- 시군구별 뉴스 수집 → Gemini가 후보 추출 → 교차검증 후 적용

사용법:
  python scripts/discover_challengers_gemini.py              # dry-run
  python scripts/discover_challengers_gemini.py --apply      # 실적용
  python scripts/discover_challengers_gemini.py --limit=10   # 10곳만
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))
sys.path.insert(0, str(BASE_DIR / "scripts" / "candidate_pipeline"))

from election_overview_utils import load_env, search_latest_news, REGION_NAMES, call_claude_json
from verify_changes import verify_changes_against_news


PARTY_MAP = {
    "더불어민주당": "democratic", "민주당": "democratic",
    "국민의힘": "ppp", "조국혁신당": "reform",
    "개혁신당": "newReform", "진보당": "progressive",
    "무소속": "independent",
}



def fetch_district_news(region_name, district, title):
    """시군구별 집중 뉴스 수집"""
    short = region_name.replace("특별시","").replace("광역시","").replace("특별자치도","").replace("특별자치시","").replace("도","")
    queries = [
        f'"{short}" "{district}" {title} 예비후보 출마',
        f'"{district}" {title} 선거 후보 공천',
        f'"{district}" {title} 출마 선언 도전',
    ]
    all_news = []
    seen = set()
    for q in queries:
        for item in search_latest_news(q, display=7):
            if item not in seen:
                seen.add(item)
                all_news.append(item)
    return all_news[:15]


def build_prompt(region_name, district, title, existing, news):
    existing_text = "\n".join(f"- {c['name']} ({c.get('party','?')}, {c.get('status','?')})" for c in existing)
    news_text = "\n".join(f"- {n}" for n in news)

    return f"""아래 뉴스에서 {region_name} {district} {title} 선거에 출마하거나 출마를 준비 중인 인물을 찾으세요.

## 현재 등록된 후보
{existing_text or "(없음)"}

## 최신 뉴스
{news_text}

## 규칙
- 뉴스에 **명시적으로 나오는 인물만** 추출. 뉴스에 없는 인물 추가 금지.
- {district} {title} 후보만. 다른 지역/선거(도지사, 교육감 등) 제외.
- 현재 등록된 후보와 같은 이름은 제외.
- status 판정: 본인 출마선언/예비후보 등록 = DECLARED, 거론/전망 = RUMORED, 출판기념회 = EXPECTED

## 출력 (JSON 배열, 없으면 [])
[{{"name": "이름", "party": "정당명(한글)", "status": "DECLARED|EXPECTED|RUMORED", "detail": "근거 뉴스 인용"}}]"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=226)
    parser.add_argument("--min-pop", type=int, default=200000, dest="min_pop")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("[오류] ANTHROPIC_API_KEY 미설정")
        sys.exit(1)

    mayor = json.loads((BASE_DIR / "data/candidates/mayor_candidates.json").read_text(encoding="utf-8"))
    cands = mayor["candidates"]

    try:
        sub = json.loads((BASE_DIR / "data/static/sub_regions.json").read_text(encoding="utf-8"))
    except Exception:
        sub = {}

    # 대상 선정
    targets = []
    for rk in sorted(cands.keys()):
        sub_list = sub.get(rk, [])
        pop_map = {s["name"]: s.get("population", 0) for s in sub_list}
        for dist, cl in sorted(cands[rk].items()):
            active = [x for x in cl if x.get("status") != "WITHDRAWN"]
            pop = pop_map.get(dist, 0)
            if len(active) <= 1 and pop >= (args.min_pop if hasattr(args, 'min_pop') else 200000):
                targets.append((rk, dist, pop, active))

    targets.sort(key=lambda x: -x[2])
    targets = targets[:args.limit]

    print(f"대상: {len(targets)}개 시군구\n")

    total_added = 0

    for rk, dist, pop, active in targets:
        rn = REGION_NAMES.get(rk, rk)
        title = "구청장" if dist.endswith("구") else ("군수" if dist.endswith("군") else "시장")
        existing_names = {c["name"] for c in active}

        news = fetch_district_news(rn, dist, title)
        if not news:
            continue

        prompt = build_prompt(rn, dist, title, active, news)

        try:
            raw = call_claude_json(prompt, api_key)
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1]
                if raw.endswith("```"):
                    raw = raw[:-3]
            results = json.loads(raw) if raw else []
            if not isinstance(results, list):
                results = []
        except Exception as e:
            print(f"  [{rk}/{dist}] 오류: {e}")
            continue

        if not results:
            continue

        # 교차검증
        changes = []
        for r in results:
            if r.get("name") in existing_names:
                continue
            changes.append({
                "name": r["name"],
                "changeType": "new_candidate",
                "newStatus": r.get("status", "DECLARED"),
                "party": r.get("party", ""),
                "detail": r.get("detail", ""),
            })

        if changes:
            verified = verify_changes_against_news(changes, news)
        else:
            verified = []

        if verified:
            print(f"[{rk}/{dist}] 인구 {pop:,} — 뉴스 {len(news)}건 → {len(verified)}명")
            for v in verified:
                party_key = PARTY_MAP.get(v.get("party", ""), "independent")
                print(f"  + {v['name']} ({v['newStatus']}, {party_key}) ← {v.get('detail','')[:50]}")

                if args.apply:
                    cands[rk][dist].append({
                        "name": v["name"],
                        "party": party_key,
                        "career": "",
                        "status": v["newStatus"],
                        "dataSource": "claude_discovery",
                        "pledges": [],
                    })
                    total_added += 1

        time.sleep(0.5)

    print(f"\n총 {total_added}명 추가" + (" [적용됨]" if args.apply else " (--apply로 적용)"))

    if args.apply and total_added > 0:
        mayor["_meta"]["lastUpdated"] = date.today().isoformat()
        mayor["_meta"]["lastDiscovery"] = date.today().isoformat()
        (BASE_DIR / "data/candidates/mayor_candidates.json").write_text(
            json.dumps(mayor, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )


if __name__ == "__main__":
    main()
