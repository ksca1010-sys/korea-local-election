#!/usr/bin/env python3
"""
광역비례대표 후보(현 의원) 경력 보강 스크립트

proportional.json의 council_proportional에서 career가 빈 후보자를 대상으로
Naver 뉴스 검색 → Claude Haiku로 경력 추출

사용법:
  python scripts/candidate_pipeline/fill_proportional_careers.py --region jeju
  python scripts/candidate_pipeline/fill_proportional_careers.py --region jeju --dry-run
  python scripts/candidate_pipeline/fill_proportional_careers.py   # 전체

환경변수:
  GEMINI_API_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
"""

import json
import os
import sys
import time
import re
import argparse
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))
sys.path.insert(0, str(BASE_DIR / "scripts" / "candidate_pipeline"))

from election_overview_utils import call_claude_json

PROPORTIONAL_PATH = BASE_DIR / "data" / "candidates" / "proportional.json"
ENV_FILE = BASE_DIR / ".env"

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
    "reform": "조국혁신당", "justice": "정의당",
    "progressive": "진보당", "newReform": "개혁신당",
    "independent": "무소속", "newFuture": "새로운미래",
    "basicIncome": "기본소득당",
}

COUNCIL_LABEL = {
    "seoul": "서울시의원", "busan": "부산시의원", "daegu": "대구시의원",
    "incheon": "인천시의원", "gwangju": "광주시의원", "daejeon": "대전시의원",
    "ulsan": "울산시의원", "sejong": "세종시의원", "gyeonggi": "경기도의원",
    "gangwon": "강원도의원", "chungbuk": "충북도의원", "chungnam": "충남도의원",
    "jeonbuk": "전북도의원", "jeonnam": "전남도의원", "gyeongbuk": "경북도의원",
    "gyeongnam": "경남도의원", "jeju": "제주도의원",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def naver_news_search(query: str, display: int = 15, retries: int = 3) -> list[str]:
    import httpx, html as _html
    client_id = os.environ.get("NAVER_CLIENT_ID", "")
    client_secret = os.environ.get("NAVER_CLIENT_SECRET", "")
    if not client_id:
        return []
    for attempt in range(retries):
        try:
            resp = httpx.get(
                "https://openapi.naver.com/v1/search/news.json",
                headers={"X-Naver-Client-Id": client_id, "X-Naver-Client-Secret": client_secret},
                params={"query": query, "display": display, "sort": "sim"},
                timeout=10,
            )
            if resp.status_code == 429:
                wait = 2 ** (attempt + 1)
                print(f"    429 Rate limit — {wait}초 후 재시도...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            snippets = []
            for item in resp.json().get("items", []):
                title = _html.unescape(item.get("title", "").replace("<b>", "").replace("</b>", ""))
                desc = _html.unescape(item.get("description", "").replace("<b>", "").replace("</b>", ""))
                pub = item.get("pubDate", "")[:16]
                snippets.append(f"[{pub}] {title} — {desc}")
            return snippets
        except Exception as e:
            print(f"    Naver 검색 오류: {e}")
            return []
    return []


def build_career_prompt(candidates_info: list[dict], news_map: dict[str, list[str]], region_name: str) -> str:
    today = date.today().isoformat()
    lines = []
    for info in candidates_info:
        name = info["name"]
        party = info["party_name"]
        news = news_map.get(name, [])
        news_text = "\n".join(f"  {n}" for n in news[:10]) if news else "  (검색 결과 없음)"
        lines.append(f"## {name} ({party}, {region_name} 비례대표 도의원)\n{news_text}")

    cands_block = "\n\n".join(lines)

    return f"""당신은 2026년 6.3 한국 지방선거 광역의원(비례대표) 후보자 정보 전문가입니다. 오늘: {today}

아래는 {region_name} 광역의회 비례대표 의원(현직)들입니다.
뉴스 검색 결과에서 각 의원의 '경력'을 한 줄로 추출하세요.

경력 형식 예시:
- "現 제주도의원 (비례) / 前 제주시청 공무원"
- "現 제주도의원 (비례) / 변호사"
- "現 제주도의원 (비례) / 시민단체 출신"
- "現 제주도의원 (비례·재선)"

규칙:
- 현직 비례대표 의원이라는 사실은 확정 → "現 도의원 (비례)" 기본 포함
- 뉴스에서 추가 경력(전직, 직업 등)이 확인되면 추가
- 뉴스가 없으면 "現 {region_name.replace('특별자치도','').replace('광역시','').replace('특별시','')}도의원 (비례)" 만 넣기
- 추측 금지. 확인된 사실만.

{cands_block}

JSON 배열로만 출력:
[
  {{
    "name": "이름",
    "career": "경력 1줄",
    "source": "출처 뉴스 제목 일부 (없으면 빈 문자열)"
  }}
]"""


def process_region(region_key: str, region_data: dict, dry_run: bool) -> int:
    region_name = REGION_NAMES.get(region_key, region_key)
    council_label = COUNCIL_LABEL.get(region_key, "도의원")
    parties = region_data.get("parties", [])

    # 경력 빈 후보 수집
    empty = []
    for party_block in parties:
        party_key = party_block.get("party", "")
        party_name = PARTY_NAMES.get(party_key, party_key)
        for cand in party_block.get("candidates", []):
            if not cand.get("career"):
                empty.append({
                    "name": cand["name"],
                    "party_key": party_key,
                    "party_name": party_name,
                    "obj": cand,
                })

    if not empty:
        print(f"  [{region_name}] 경력 미입력 없음")
        return 0

    print(f"\n[{region_name}] 비례대표 경력 미입력 {len(empty)}명 검색 중...")

    # 후보자별 Naver 검색
    news_map: dict[str, list[str]] = {}
    for info in empty:
        name = info["name"]
        party_name = info["party_name"]
        queries = [
            f"{name} {council_label}",
            f"{name} {region_name} 비례대표",
            f"{name} {party_name} {region_name}",
        ]
        combined = []
        for q in queries:
            results = naver_news_search(q, display=10)
            combined.extend(results)
            time.sleep(0.3)

        seen = set()
        unique = []
        for r in combined:
            if r not in seen:
                seen.add(r)
                unique.append(r)
        news_map[name] = unique[:15]
        if unique:
            print(f"  {name} ({party_name}): {len(unique)}건")
        else:
            print(f"  {name} ({party_name}): 검색 결과 없음")

    # 배치 처리 (10명씩)
    updated = 0
    batch_size = 10
    for i in range(0, len(empty), batch_size):
        batch = empty[i:i + batch_size]
        prompt = build_career_prompt(batch, news_map, region_name)
        max_tok = max(2048, len(batch) * 200)
        raw_text = call_claude_json(prompt, max_tokens=max_tok)

        try:
            text = raw_text.strip()
            text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.IGNORECASE)
            text = re.sub(r'\s*```\s*$', '', text)
            raw = json.loads(text.strip())
        except Exception:
            print(f"  Claude 응답 파싱 실패: {raw_text[:80]!r}")
            continue

        if not isinstance(raw, list):
            continue

        for item in raw:
            name = item.get("name", "")
            career = (item.get("career") or "").strip()
            source = item.get("source", "")
            if not career:
                continue

            target = next((info for info in batch if info["name"] == name), None)
            if not target:
                continue

            label = f"  [경력] {name} ({target['party_name']}): {career}"
            if source:
                label += f" (출처: {source[:40]})"

            if dry_run:
                print(f"  [DRY]{label}")
            else:
                target["obj"]["career"] = career
                print(label)
            updated += 1

    return updated


def main():
    parser = argparse.ArgumentParser(description="광역비례대표 경력 보강")
    parser.add_argument("--dry-run", action="store_true", help="데이터 변경 없이 미리보기")
    parser.add_argument("--region", help="특정 광역만 (예: jeju)")
    args = parser.parse_args()

    load_env()

    data = json.loads(PROPORTIONAL_PATH.read_text(encoding="utf-8"))
    council_prop = data.get("council_proportional", {})

    print("=" * 60)
    print("광역비례대표 경력 보강 (Naver + Claude Haiku)")
    print(f"실행: {date.today().isoformat()}")
    if args.dry_run:
        print("[DRY-RUN 모드]")
    print("=" * 60)

    target_regions = [args.region] if args.region else sorted(REGION_NAMES.keys())
    total_updated = 0

    for rk in target_regions:
        if rk not in council_prop:
            continue
        updated = process_region(rk, council_prop[rk], dry_run=args.dry_run)
        total_updated += updated

    print(f"\n총 {total_updated}명 경력 업데이트")

    if not args.dry_run and total_updated > 0:
        data["_meta"]["lastUpdated"] = date.today().isoformat()
        PROPORTIONAL_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        print(f"[저장] {PROPORTIONAL_PATH}")


if __name__ == "__main__":
    main()
