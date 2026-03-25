#!/usr/bin/env python3
"""
교육감 후보 공약 자동 수집 + 카테고리 분류

뉴스 검색 → Claude로 공약 추출 + 카테고리 분류 → superintendent.json 반영

카테고리: 무상급식, 자사고/특목고, 교권보호, 디지털교육, 돌봄, 기타

사용법:
  python scripts/candidate_pipeline/collect_superintendent_pledges.py
  python scripts/candidate_pipeline/collect_superintendent_pledges.py --region=seoul
  python scripts/candidate_pipeline/collect_superintendent_pledges.py --dry-run
"""

import json
import os
import sys
import time
from datetime import datetime, date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CANDIDATES_PATH = BASE_DIR / "data" / "candidates" / "superintendent.json"
ENV_FILE = BASE_DIR / ".env"

REGION_NAMES = {
    "seoul": "서울특별시", "busan": "부산광역시", "daegu": "대구광역시",
    "incheon": "인천광역시", "gwangju": "광주광역시", "daejeon": "대전광역시",
    "ulsan": "울산광역시", "sejong": "세종특별자치시", "gyeonggi": "경기도",
    "gangwon": "강원특별자치도", "chungbuk": "충청북도", "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도", "jeonnam": "전라남도", "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도", "jeju": "제주특별자치도",
}

PLEDGE_CATEGORIES = ["무상급식", "자사고/특목고", "교권보호", "디지털교육", "돌봄", "기타"]

sys.path.insert(0, str(BASE_DIR / "scripts" / "candidate_pipeline"))
sys.path.insert(0, str(BASE_DIR / "scripts"))
from election_overview_utils import call_claude_json
from local_news_search import search_naver_news


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


def fetch_pledge_news(name, region_name):
    short = (region_name
        .replace("특별시","").replace("광역시","")
        .replace("특별자치도","").replace("특별자치시","").replace("도",""))
    queries = [
        f'"{name}" 교육감 공약',
        f'"{name}" "{short}" 교육 정책',
    ]
    all_titles = []
    seen = set()
    for q in queries:
        for item in search_naver_news(q, display=8):
            t = item.get("title", "")
            if t not in seen:
                seen.add(t)
                all_titles.append(t)
    return all_titles[:10]


def build_batch_prompt(region_name, candidates_with_news):
    sections = []
    for name, news_titles in candidates_with_news:
        news_text = "\n".join(f"  - {t}" for t in news_titles) if news_titles else "  (뉴스 없음)"
        sections.append(f"### {name}\n{news_text}")

    candidates_section = "\n\n".join(sections)
    names_list = ", ".join(f'"{name}"' for name, _ in candidates_with_news)

    return f"""아래 뉴스에서 {region_name} 교육감 후보들의 공약(정책 약속)을 추출하고 카테고리를 분류하세요.

## 후보별 뉴스 제목

{candidates_section}

## 카테고리
- 무상급식: 급식, 친환경 급식, 무상급식 확대 등
- 자사고/특목고: 자사고 폐지/유지, 특목고 정책, 고교 다양화 등
- 교권보호: 교권, 교사 보호, 악성 민원, 교원 처우 등
- 디지털교육: AI 교육, 스마트 교실, 디지털 리터러시 등
- 돌봄: 방과후, 늘봄, 돌봄 교실, 유아교육 등
- 기타: 위 카테고리에 해당하지 않는 교육 공약

## 규칙
- 뉴스 제목에서 직접 확인 가능한 공약만 추출
- 추측하거나 일반적인 공약을 만들어내지 말 것
- 각 공약은 10~25자 이내의 핵심 키워드로 압축
- "교육 발전", "학생 중심" 같은 범용 표현 금지
- 후보별 최소 0개 ~ 최대 5개
- 뉴스에서 공약을 찾을 수 없으면 빈 배열 [] 반환

## 출력 (JSON만, 다른 텍스트 없이)
{{
  {names_list.replace('"', '').replace(', ', ': [...], ').rstrip(']').rstrip('.') + ': [...]'}
}}

각 항목 형식: {{"text": "공약 내용", "category": "카테고리명"}}
예: {{"text": "AI 교육 전담교사 배치", "category": "디지털교육"}}"""


def parse_batch_result(text, names):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        result = json.loads(text)
        if isinstance(result, dict):
            out = {}
            for name in names:
                pledges = result.get(name, [])
                if isinstance(pledges, list):
                    out[name] = [
                        p if isinstance(p, dict) else {"text": str(p), "category": "기타"}
                        for p in pledges
                        if (isinstance(p, dict) and p.get("text")) or (isinstance(p, str) and len(p) >= 4)
                    ][:5]
                else:
                    out[name] = []
            return out
    except json.JSONDecodeError:
        pass
    return {}


def main():
    load_env()
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    dry_run = "--dry-run" in sys.argv
    target_region = None
    for arg in sys.argv[1:]:
        if arg.startswith("--region"):
            target_region = arg.split("=")[-1] if "=" in arg else None

    if not api_key:
        print("[오류] ANTHROPIC_API_KEY 미설정")
        sys.exit(1)

    print("=" * 55)
    print("교육감 후보 공약 수집 + 카테고리 분류")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if dry_run: print("[DRY RUN]")
    print("=" * 55)

    data = load_candidates()
    candidates = data.get("candidates", {})
    total_collected = 0

    regions = [target_region] if target_region else sorted(candidates.keys())

    for rk in regions:
        if rk not in candidates:
            continue
        region_name = REGION_NAMES.get(rk, rk)
        cands = candidates[rk]

        # 공약이 없는 후보만 수집 (증분)
        need_pledges = [(c["name"], c) for c in cands
                        if not c.get("pledges") or len(c["pledges"]) == 0]

        if not need_pledges:
            continue

        print(f"\n[{region_name}] 공약 미수집 {len(need_pledges)}명")

        # 뉴스 수집
        candidates_with_news = []
        for name, _ in need_pledges:
            news = fetch_pledge_news(name, region_name)
            candidates_with_news.append((name, news))
            print(f"  {name}: 뉴스 {len(news)}건")
            time.sleep(0.3)

        if not candidates_with_news:
            continue

        # Claude 배치 처리
        prompt = build_batch_prompt(region_name, candidates_with_news)
        try:
            raw = call_claude_json(prompt, api_key)
            names = [name for name, _ in candidates_with_news]
            result = parse_batch_result(raw, names)

            for name, cand_obj in need_pledges:
                pledges = result.get(name, [])
                if pledges:
                    if dry_run:
                        print(f"  [DRY] {name}: {len(pledges)}건 — {pledges}")
                    else:
                        # pledges를 문자열 배열 + pledgeCategories 분리 저장
                        cand_obj["pledges"] = [
                            p["text"] if isinstance(p, dict) else str(p)
                            for p in pledges
                        ]
                        cand_obj["pledgeCategories"] = [
                            {"text": p.get("text",""), "category": p.get("category","기타")}
                            if isinstance(p, dict) else {"text": str(p), "category": "기타"}
                            for p in pledges
                        ]
                        print(f"  {name}: {len(pledges)}건 수집")
                    total_collected += len(pledges)
                else:
                    print(f"  {name}: 공약 없음 (뉴스 부족)")

        except Exception as e:
            print(f"  [오류] {e}")

        time.sleep(1)

    if not dry_run and total_collected > 0:
        data["_meta"]["lastPledgeCollection"] = datetime.now().isoformat()
        CANDIDATES_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"\n총 {total_collected}건 공약 수집")
        print(f"[저장] {CANDIDATES_PATH}")
    else:
        print(f"\n총 {total_collected}건 {'(DRY RUN)' if dry_run else ''}")

    print("=" * 55)


if __name__ == "__main__":
    main()
