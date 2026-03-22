#!/usr/bin/env python3
"""
경력 미입력 후보자 자동 보강 스크립트

mayor_candidates.json에서 career가 빈 후보자를 대상으로
후보자 이름으로 직접 Naver 검색 → Claude Haiku로 경력 추출

사용법:
  python scripts/candidate_pipeline/fill_missing_careers.py
  python scripts/candidate_pipeline/fill_missing_careers.py --dry-run
  python scripts/candidate_pipeline/fill_missing_careers.py --region gangwon
"""

import json
import os
import sys
import time
import argparse
from pathlib import Path
from datetime import date

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))
sys.path.insert(0, str(BASE_DIR / "scripts" / "candidate_pipeline"))

from election_overview_utils import call_claude_json

CANDIDATES_PATH = BASE_DIR / "data" / "candidates" / "mayor_candidates.json"
ENV_FILE = BASE_DIR / ".env"

REGION_NAMES = {
    "seoul": "서울특별시", "busan": "부산광역시", "daegu": "대구광역시",
    "incheon": "인천광역시", "gwangju": "광주광역시", "daejeon": "대전광역시",
    "ulsan": "울산광역시", "sejong": "세종특별자치시", "gyeonggi": "경기도",
    "gangwon": "강원특별자치도", "chungbuk": "충청북도", "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도", "jeonnam": "전라남도", "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도", "jeju": "제주특별자치도",
}

NAVER_API_URL = "https://openapi.naver.com/v1/search/news.json"


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def naver_news_search(query: str, display: int = 15, retries: int = 3) -> list[str]:
    """Naver 뉴스 검색 → 제목+본문 스니펫 리스트 반환 (429 재시도 포함)"""
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
                wait = 2 ** attempt  # 1s, 2s, 4s
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


def get_title(district: str) -> str:
    if district.endswith("구"):
        return "구청장"
    if district.endswith("군"):
        return "군수"
    return "시장"


def build_career_prompt(candidates_info: list[dict], news_map: dict[str, list[str]]) -> str:
    """후보자 이름 기반으로 경력 추출 프롬프트 생성"""
    today = date.today().isoformat()
    lines = []
    for info in candidates_info:
        name = info["name"]
        district = info["district"]
        title = get_title(district)
        news = news_map.get(name, [])
        news_text = "\n".join(f"  {n}" for n in news[:10]) if news else "  (검색 결과 없음)"
        lines.append(f"## {name} ({district}{title} 후보)\n{news_text}")

    cands_block = "\n\n".join(lines)

    return f"""당신은 2026년 6.3 한국 지방선거 기초단체장 후보자 정보 전문가입니다. 오늘: {today}

아래 후보자들의 뉴스 검색 결과에서 각 후보자의 '경력'을 한 줄로 추출하세요.

경력 형식 예시:
- "現 춘천시의원 (3선) / 前 강원도청 공무원"
- "前 원주시 부시장 / 기업인"
- "현직 교장 / 교육계 출신"
- "변호사 / 前 시민단체 대표"
- "現 도의원 (2선)"

뉴스가 없거나 경력이 확인 안 되면 career 필드를 생략하세요.

{cands_block}

JSON 배열로만 출력 (없으면 []):
[
  {{
    "name": "후보자 이름",
    "district": "시군구명",
    "career": "경력 1줄 (뉴스에서 확인된 것만)",
    "source": "출처 뉴스 제목 일부"
  }}
]"""


def process_region(region_key: str, region_candidates: dict, dry_run: bool) -> int:
    """광역 내 경력 미입력 후보 처리 → 업데이트 건수 반환"""
    region_name = REGION_NAMES.get(region_key, region_key)

    # 경력 빈 후보 수집
    empty = []
    for district, cands in region_candidates.items():
        for c in cands:
            if not c.get("career"):
                empty.append({"name": c["name"], "district": district, "obj": c})

    if not empty:
        return 0

    print(f"\n[{region_name}] 경력 미입력 {len(empty)}명 검색 중...")

    # 후보자별 Naver 검색 (이름 + 지역명 + 직책)
    news_map: dict[str, list[str]] = {}
    for info in empty:
        name = info["name"]
        district = info["district"]
        title = get_title(district)
        queries = [
            f"{name} {district}{title}",
            f"{name} {district} 출마",
            f"{name} {district} 경력",
        ]
        combined = []
        for q in queries:
            results = naver_news_search(q, display=10)
            combined.extend(results)
            time.sleep(0.5)
        # 중복 제거
        seen = set()
        unique = []
        for r in combined:
            if r not in seen:
                seen.add(r)
                unique.append(r)
        news_map[name] = unique[:15]
        if unique:
            print(f"  {name} ({district}): {len(unique)}건")
        else:
            print(f"  {name} ({district}): 검색 결과 없음")

    # 뉴스가 하나도 없으면 스킵
    has_any_news = any(len(v) > 0 for v in news_map.values())
    if not has_any_news:
        print(f"  → 뉴스 없음, 스킵")
        return 0

    # Claude Haiku로 경력 추출
    prompt = build_career_prompt(empty, news_map)
    # 후보 수 × 약 150토큰, 최소 2048
    max_tok = max(2048, len(empty) * 150)
    raw_text = call_claude_json(prompt, max_tokens=max_tok)

    # call_claude_json은 문자열 반환 → JSON 파싱 필요
    try:
        import re as _re
        text = raw_text.strip()
        # 마크다운 코드블록 제거 (```json ... ``` 형태)
        text = _re.sub(r'^```(?:json)?\s*', '', text, flags=_re.IGNORECASE)
        text = _re.sub(r'\s*```\s*$', '', text)
        text = text.strip()
        raw = json.loads(text)
    except Exception:
        print(f"  → Claude 응답 파싱 실패: {raw_text[:80]!r}")
        return 0

    if not isinstance(raw, list):
        print(f"  → Claude 응답이 리스트 아님: {type(raw)}")
        return 0

    # 결과 적용
    updated = 0
    for item in raw:
        name = item.get("name", "")
        career = (item.get("career") or "").strip()
        source = item.get("source", "")
        if not career:
            continue

        # 후보자 객체 찾기
        target = next((info for info in empty if info["name"] == name), None)
        if not target:
            continue

        label = f"  [경력] {target['district']}: {name} → {career}"
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
    parser = argparse.ArgumentParser(description="경력 미입력 후보자 자동 보강")
    parser.add_argument("--dry-run", action="store_true", help="데이터 변경 없이 미리보기")
    parser.add_argument("--region", help="특정 광역만 처리 (예: gangwon)")
    args = parser.parse_args()

    load_env()

    data = json.loads(CANDIDATES_PATH.read_text(encoding="utf-8"))
    cands_data = data["candidates"]

    print("=" * 60)
    print("경력 미입력 후보자 자동 보강")
    print(f"실행: {date.today().isoformat()}")
    if args.dry_run:
        print("⚠️  DRY-RUN 모드 (저장 안 함)")
    print("=" * 60)

    target_regions = [args.region] if args.region else list(REGION_NAMES.keys())
    total_updated = 0

    for region_key in target_regions:
        if region_key not in cands_data:
            continue
        updated = process_region(region_key, cands_data[region_key], dry_run=args.dry_run)
        total_updated += updated

    print(f"\n총 {total_updated}명 경력 업데이트")

    if not args.dry_run and total_updated > 0:
        data["_meta"]["lastUpdated"] = date.today().isoformat()
        CANDIDATES_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        print(f"[저장] {CANDIDATES_PATH}")


if __name__ == "__main__":
    main()
