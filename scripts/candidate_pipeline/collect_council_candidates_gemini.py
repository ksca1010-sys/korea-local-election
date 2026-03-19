#!/usr/bin/env python3
"""
광역의원/기초의원 후보 수집 — Gemini 2.5 Flash + 토속언론

뉴스 검색(네이버 API) → Gemini 분석 → 교차검증 → JSON 반영

사용법:
  python scripts/candidate_pipeline/collect_council_candidates_gemini.py
  python scripts/candidate_pipeline/collect_council_candidates_gemini.py --type council
  python scripts/candidate_pipeline/collect_council_candidates_gemini.py --type localCouncil
  python scripts/candidate_pipeline/collect_council_candidates_gemini.py --region seoul
  python scripts/candidate_pipeline/collect_council_candidates_gemini.py --dry-run

환경변수:
  GEMINI_API_KEY: Google Gemini API 키
  NAVER_CLIENT_ID / NAVER_CLIENT_SECRET: 네이버 검색 API
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import date
from pathlib import Path

import httpx

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"

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


def call_gemini(prompt, api_key, max_tokens=2000, retries=3):
    """Gemini 2.5 Flash API 호출"""
    client = httpx.Client(verify=False, timeout=60)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"

    for attempt in range(retries):
        try:
            resp = client.post(url, json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.1}
            })
            if resp.status_code == 200:
                text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                return text.strip()
            elif resp.status_code == 503:
                time.sleep(5 * (attempt + 1))
                continue
            else:
                print(f"    Gemini {resp.status_code}: {resp.text[:100]}")
                return None
        except Exception as e:
            print(f"    Gemini 오류: {e}")
            time.sleep(3)
    return None


def search_news(district, region_name, election_type="council"):
    """토속언론 우선 뉴스 검색"""
    sys.path.insert(0, str(BASE_DIR / "scripts" / "candidate_pipeline"))
    sys.path.insert(0, str(BASE_DIR / "scripts"))
    import local_news_search as lns

    role = "시의원" if "시" in region_name else "도의원"
    if election_type == "localCouncil":
        role = "구의원" if district.endswith("구") else "군의원" if district.endswith("군") else "시의원"

    queries = [
        f'"{district}" {role} 출마',
        f'"{district}" {role} 예비후보',
        f'"{district}" 광역의원 6.3' if election_type == "council" else f'"{district}" 기초의원 출마',
    ]

    all_titles = []
    seen = set()
    for q in queries:
        try:
            results = lns.search_naver_news(q, display=10)
            for r in results:
                title = r.get("title", "").replace("<b>", "").replace("</b>", "")
                if title and title not in seen:
                    seen.add(title)
                    all_titles.append(title)
        except Exception:
            pass
        time.sleep(0.2)

    return all_titles


def parse_gemini_response(text):
    """Gemini 응답에서 JSON 추출"""
    if not text:
        return []
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


def build_prompt(district, region_name, news_titles, election_type):
    role = "광역의원(시도의원)" if election_type == "council" else "기초의원(구시군의원)"
    news_text = "\n".join(f"- {t}" for t in news_titles[:25]) if news_titles else "(뉴스 없음)"

    return f"""2026년 6.3 지방선거 {region_name} {district} {role} 예비후보/출마 선언자를 찾으세요.

## 최신 뉴스
{news_text}

## 출력 (JSON)
뉴스에서 확인되는 {role} 출마자만 포함. 추측 금지.
[
  {{"name":"이름","party":"정당명","district":"{district}제N선거구","status":"DECLARED","career":"경력 1줄","detail":"근거 뉴스 제목"}}
]
없으면 []. JSON만 출력.

## 주의
- 뉴스에서 확인되는 사실만. 추측 금지.
- {role}만 해당. 구청장/시장/군수/교육감/도지사 제외.
- DECLARED: 출마선언/예비후보등록 확인. EXPECTED: 출마 거론."""


def process_district(rk, district, region_name, election_type, gemini_key, dry_run=False):
    """시군구 단위로 뉴스 검색 + Gemini 분석"""
    news = search_news(district, region_name, election_type)

    if not news:
        return []

    prompt = build_prompt(district, region_name, news, election_type)
    raw = call_gemini(prompt, gemini_key)
    candidates = parse_gemini_response(raw)

    if not candidates:
        return []

    # 교차검증: 뉴스에 이름이 있는지
    news_text = " ".join(news)
    verified = []
    for c in candidates:
        name = c.get("name", "")
        if name and name in news_text:
            verified.append(c)
        else:
            print(f"    [필터] {name}: 뉴스에 이름 없음 → 제외")

    return verified


def main():
    load_env()
    gemini_key = os.environ.get("GEMINI_API_KEY", "")

    parser = argparse.ArgumentParser(description="광역/기초의원 후보 수집 (Gemini)")
    parser.add_argument("--type", choices=["council", "localCouncil"], default="council")
    parser.add_argument("--region", type=str, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not gemini_key:
        print("[오류] GEMINI_API_KEY 미설정")
        sys.exit(1)

    election_type = args.type
    folder = "council" if election_type == "council" else "local_council"
    label = "광역의원" if election_type == "council" else "기초의원"

    print("=" * 60)
    print(f"{label} 후보 수집 (Gemini 2.5 Flash + 토속언론)")
    print(f"실행: {date.today().isoformat()}")
    if args.dry_run:
        print("[DRY RUN]")
    print("=" * 60)

    regions = [args.region] if args.region else sorted(REGION_NAMES.keys())
    total_new = 0

    for rk in regions:
        if rk in ("sejong", "jeju") and election_type == "localCouncil":
            continue

        region_name = REGION_NAMES.get(rk, rk)
        cand_path = BASE_DIR / "data" / "candidates" / folder / f"{rk}.json"

        if cand_path.exists():
            data = json.loads(cand_path.read_text(encoding="utf-8"))
        else:
            data = {"_meta": {}, "candidates": {}}

        existing = data.get("candidates", {})

        # 시군구 목록 (district_mapping에서)
        if election_type == "council":
            mapping_path = BASE_DIR / "data" / "council" / f"district_mapping_{rk}.json"
        else:
            mapping_path = BASE_DIR / "data" / "basic_council" / f"basic_district_mapping_{rk}.json"

        if mapping_path.exists():
            mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
            sigungus = sorted(set(d.get("sigungu", "") for d in mapping.get("districts", [])))
        else:
            sigungus = sorted(set(
                k.split(" ")[0] if " " in k else re.sub(r"제?\d+선거구$", "", k)
                for k in existing.keys()
            ))

        sigungus = [s for s in sigungus if s]
        print(f"\n[{region_name}] {len(sigungus)}개 시군구")

        region_new = 0
        for sgg in sigungus:
            candidates = process_district(rk, sgg, region_name, election_type, gemini_key, args.dry_run)

            if not candidates:
                continue

            for c in candidates:
                dist_name = c.get("district", "")
                name = c.get("name", "")
                party = PARTY_MAP.get(c.get("party", ""), "independent")

                if not dist_name or not name:
                    continue

                # 기존 후보에 있는지 체크
                dist_list = existing.get(dist_name, [])
                if any(ex["name"] == name for ex in dist_list):
                    continue

                new_candidate = {
                    "name": name,
                    "party": party,
                    "career": c.get("career", ""),
                    "status": c.get("status", "DECLARED"),
                    "dataSource": "gemini_news",
                    "isIncumbent": False,
                    "pledges": [],
                }

                if args.dry_run:
                    print(f"  [DRY] {dist_name}: {name} ({c.get('party', '')})")
                else:
                    if dist_name not in existing:
                        existing[dist_name] = []
                    existing[dist_name].append(new_candidate)
                    print(f"  [신규] {dist_name}: {name} ({c.get('party', '')})")

                region_new += 1

            time.sleep(2)  # rate limit

        total_new += region_new
        print(f"  → {region_name}: {region_new}명 추가")

    if not args.dry_run and total_new > 0:
        for rk in regions:
            if rk in ("sejong", "jeju") and election_type == "localCouncil":
                continue
            cand_path = BASE_DIR / "data" / "candidates" / folder / f"{rk}.json"
            if cand_path.exists():
                data = json.loads(cand_path.read_text(encoding="utf-8"))
                data["_meta"]["lastUpdated"] = date.today().isoformat()
                data["_meta"]["source"] = "gemini_news (Gemini 2.5 Flash + 토속언론)"
                cand_path.write_text(
                    json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )

    print(f"\n총 {total_new}명 신규 후보 {'발견' if args.dry_run else '추가'}")


if __name__ == "__main__":
    main()
