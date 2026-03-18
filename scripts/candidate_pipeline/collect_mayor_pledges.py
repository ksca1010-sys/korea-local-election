#!/usr/bin/env python3
"""
기초단체장 후보 공약 자동 수집 스크립트

뉴스 검색 → Gemini로 공약 추출 → mayor_candidates.json 반영
- 공약이 이미 있는 후보 스킵 (증분)
- 뉴스에서 확인 불가능하면 빈 배열 유지

사용법:
  python scripts/candidate_pipeline/collect_mayor_pledges.py
  python scripts/candidate_pipeline/collect_mayor_pledges.py --region=gyeonggi
  python scripts/candidate_pipeline/collect_mayor_pledges.py --district=강남구
  python scripts/candidate_pipeline/collect_mayor_pledges.py --dry-run
  python scripts/candidate_pipeline/collect_mayor_pledges.py --force  # 기존 공약 있어도 재수집

환경변수:
  GEMINI_API_KEY: Gemini API 키
  NAVER_CLIENT_ID / NAVER_CLIENT_SECRET: 네이버 검색 API
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CANDIDATES_PATH = BASE_DIR / "data" / "candidates" / "mayor_candidates.json"
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


# ── 뉴스 검색 ──

sys.path.insert(0, str(BASE_DIR / "scripts" / "candidate_pipeline"))
sys.path.insert(0, str(BASE_DIR / "scripts"))
from local_news_search import search_naver_news


def fetch_pledge_news(name, district, region_name):
    """후보별 공약 관련 뉴스 검색 (2쿼리)"""
    short_region = (region_name
        .replace("특별시","").replace("광역시","")
        .replace("특별자치도","").replace("특별자치시","").replace("도",""))

    queries = [
        f'"{name}" "{district}" 공약',
        f'"{name}" "{short_region}" 공약 정책',
    ]
    all_titles = []
    seen = set()
    for q in queries:
        for item in search_naver_news(q, display=5):
            t = item["title"]
            if t not in seen:
                seen.add(t)
                all_titles.append(t)
    return all_titles[:8]


# ── Gemini 공약 추출 ──

def build_pledge_prompt(name, district, region_name, news_titles):
    """공약 추출 프롬프트"""
    title = "구청장" if district.endswith("구") else ("군수" if district.endswith("군") else "시장")
    news_text = "\n".join(f"- {t}" for t in news_titles) if news_titles else "(뉴스 없음)"

    return f"""아래 뉴스에서 {region_name} {district} {title} 후보 {name}의 공약(정책 약속)을 추출하세요.

## 뉴스 제목
{news_text}

## 규칙
- 뉴스 제목에서 직접 확인 가능한 공약만 추출
- 추측하거나 일반적인 공약을 만들어내지 말 것
- 각 공약은 10~25자 이내의 핵심 키워드로 압축 (예: "GTX-B 조기 착공", "공공의료원 설립")
- "지역 발전", "주민 복지" 같은 모든 후보에 해당하는 범용 표현 금지
- 최소 0개 ~ 최대 5개
- 뉴스에서 공약을 찾을 수 없으면 빈 배열 [] 반환

## 출력 (JSON만)
["공약1", "공약2", ...]"""


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
                    temperature=0.0,
                    response_mime_type="application/json",
                ),
            )
            return getattr(response, "text", "") or "[]"
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                match = re.search(r"retry.*?(\d+)", err_str, re.IGNORECASE)
                wait = int(match.group(1)) + 5 if match else 30 * (attempt + 1)
                print(f"    [재시도] {min(wait, 120)}초 대기 ({attempt+1}/{max_retries})")
                time.sleep(min(wait, 120))
            else:
                raise
    return "[]"


def parse_pledges(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return [p for p in result if isinstance(p, str) and len(p) >= 4][:5]
    except json.JSONDecodeError:
        pass
    return []


# ── 배치 처리 (시군구 단위) ──

def build_batch_prompt(district, region_name, candidates_with_news):
    """한 시군구의 여러 후보를 한 번에 처리"""
    title = "구청장" if district.endswith("구") else ("군수" if district.endswith("군") else "시장")

    sections = []
    for name, news_titles in candidates_with_news:
        news_text = "\n".join(f"  - {t}" for t in news_titles) if news_titles else "  (뉴스 없음)"
        sections.append(f"### {name}\n{news_text}")

    candidates_section = "\n\n".join(sections)
    names_list = ", ".join(f'"{name}"' for name, _ in candidates_with_news)

    return f"""아래 뉴스에서 {region_name} {district} {title} 후보들의 공약(정책 약속)을 추출하세요.

## 후보별 뉴스 제목

{candidates_section}

## 규칙
- 뉴스 제목에서 직접 확인 가능한 공약만 추출
- 추측하거나 일반적인 공약을 만들어내지 말 것
- 각 공약은 10~25자 이내의 핵심 키워드로 압축 (예: "GTX-B 조기 착공", "공공의료원 설립")
- "지역 발전", "주민 복지" 같은 모든 후보에 해당하는 범용 표현 금지
- 후보당 최소 0개 ~ 최대 5개
- 뉴스에서 공약을 찾을 수 없는 후보는 빈 배열 []

## 출력 (JSON만)
{{{", ".join(f'"{name}": ["공약1", ...]' for name, _ in candidates_with_news)}}}"""


def parse_batch_pledges(text, names):
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
                    out[name] = [p for p in pledges if isinstance(p, str) and len(p) >= 4][:5]
                else:
                    out[name] = []
            return out
    except json.JSONDecodeError:
        pass
    return {name: [] for name in names}


# ── 메인 ──

def main():
    parser = argparse.ArgumentParser(description="기초단체장 공약 수집")
    parser.add_argument("--region", type=str, help="특정 시도만 (예: gyeonggi)")
    parser.add_argument("--district", type=str, help="단일 시군구 (예: 강남구)")
    parser.add_argument("--dry-run", action="store_true", help="수집만, 저장 안 함")
    parser.add_argument("--force", action="store_true", help="기존 공약 있어도 재수집")
    args = parser.parse_args()

    load_env()
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        print("[오류] GEMINI_API_KEY 미설정")
        sys.exit(1)

    print("=" * 60)
    print("기초단체장 공약 자동 수집")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"모델: {GEMINI_MODEL}")
    if args.dry_run:
        print("[DRY RUN]")
    if args.force:
        print("[FORCE: 기존 공약 덮어쓰기]")
    print("=" * 60)

    data = load_candidates()
    candidates = data.get("candidates", {})

    regions = [args.region] if args.region else sorted(candidates.keys())

    total_candidates = 0
    total_collected = 0
    total_skipped = 0
    total_empty = 0

    for rk in regions:
        if rk not in candidates:
            continue
        region_name = REGION_NAMES.get(rk, rk)
        districts = candidates[rk]

        if args.district:
            if args.district not in districts:
                continue
            districts = {args.district: districts[args.district]}

        print(f"\n[{rk}] {region_name} ({len(districts)}개 시군구)")

        for district, cands in sorted(districts.items()):
            # 공약 수집 대상 필터
            targets = []
            for c in cands:
                if c.get("status") == "WITHDRAWN":
                    continue
                if c.get("pledges") and not args.force:
                    total_skipped += 1
                    continue
                targets.append(c)

            if not targets:
                continue

            total_candidates += len(targets)

            # 후보별 뉴스 수집
            candidates_with_news = []
            for c in targets:
                news = fetch_pledge_news(c["name"], district, region_name)
                candidates_with_news.append((c["name"], news))

            news_count = sum(len(n) for _, n in candidates_with_news)
            print(f"  {district}: {len(targets)}명 (뉴스 {news_count}건)...", end="", flush=True)

            if args.dry_run:
                print(f" [dry-run]")
                for name, news in candidates_with_news:
                    print(f"    {name}: 뉴스 {len(news)}건")
                continue

            # 배치 또는 개별 처리
            try:
                if len(candidates_with_news) > 1:
                    # 배치: 한 시군구 후보들을 한 번에
                    prompt = build_batch_prompt(district, region_name, candidates_with_news)
                    raw = call_gemini(prompt, gemini_key)
                    names = [name for name, _ in candidates_with_news]
                    pledges_map = parse_batch_pledges(raw, names)
                else:
                    # 개별: 1명
                    name, news = candidates_with_news[0]
                    prompt = build_pledge_prompt(name, district, region_name, news)
                    raw = call_gemini(prompt, gemini_key)
                    pledges_map = {name: parse_pledges(raw)}

                # 결과 반영
                results = []
                for c in targets:
                    pledges = pledges_map.get(c["name"], [])
                    if pledges:
                        c["pledges"] = pledges
                        total_collected += 1
                        results.append(f"{c['name']}({len(pledges)})")
                    else:
                        total_empty += 1
                        results.append(f"{c['name']}(0)")

                print(f" {', '.join(results)}")

            except Exception as e:
                print(f" [오류] {e}")
                total_empty += len(candidates_with_news)

            time.sleep(0.3)

    # 저장
    if not args.dry_run and total_collected > 0:
        data["_meta"]["lastPledgeCollection"] = datetime.now().isoformat()
        data["_meta"]["lastUpdated"] = date.today().isoformat()
        CANDIDATES_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print("\n" + "=" * 60)
    print(f"완료: 대상 {total_candidates}명")
    print(f"  수집 성공: {total_collected}명")
    print(f"  뉴스 부족(빈 배열): {total_empty}명")
    print(f"  기존 공약 스킵: {total_skipped}명")
    if not args.dry_run and total_collected > 0:
        print(f"[저장] {CANDIDATES_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()
