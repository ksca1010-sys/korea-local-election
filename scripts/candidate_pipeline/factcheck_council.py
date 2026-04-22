#!/usr/bin/env python3
"""
광역의원 후보자 팩트체크 + 신규 출마자 발굴 파이프라인

council/*.json의 현직 의원 상태를 뉴스 기반으로 업데이트하고,
신규 출마 선언자를 발굴해 추가합니다.

전략:
  시도별로 "[시도] [시군구] 도의원/시의원 출마" 뉴스를 수집 →
  Claude가 선거구별 후보 변동사항(신규/상태변경) 추출

사용법:
  python scripts/candidate_pipeline/factcheck_council.py
  python scripts/candidate_pipeline/factcheck_council.py --dry-run
  python scripts/candidate_pipeline/factcheck_council.py --region gyeonggi

환경변수:
  GEMINI_API_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
"""

import json
import os
import sys
import time
import re
from datetime import datetime, date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from election_overview_utils import call_claude_json

BASE_DIR = Path(__file__).resolve().parent.parent.parent
COUNCIL_DIR = BASE_DIR / "data" / "candidates" / "council"
ENV_FILE = BASE_DIR / ".env"

REGION_NAMES = {
    "seoul": "서울특별시", "busan": "부산광역시", "daegu": "대구광역시",
    "incheon": "인천광역시", "gwangju": "광주광역시", "daejeon": "대전광역시",
    "ulsan": "울산광역시", "sejong": "세종특별자치시", "gyeonggi": "경기도",
    "gangwon": "강원특별자치도", "chungbuk": "충청북도", "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도", "jeonnam": "전라남도", "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도", "jeju": "제주특별자치도",
}

# 광역의회 명칭
COUNCIL_LABEL = {
    "seoul": "서울시의원", "busan": "부산시의원", "daegu": "대구시의원",
    "incheon": "인천시의원", "gwangju": "광주시의원", "daejeon": "대전시의원",
    "ulsan": "울산시의원", "sejong": "세종시의원", "gyeonggi": "경기도의원",
    "gangwon": "강원도의원", "chungbuk": "충북도의원", "chungnam": "충남도의원",
    "jeonbuk": "전북도의원", "jeonnam": "전남도의원", "gyeongbuk": "경북도의원",
    "gyeongnam": "경남도의원", "jeju": "제주도의원",
}

PARTY_MAP = {
    "더불어민주당": "democratic", "민주당": "democratic",
    "국민의힘": "ppp", "조국혁신당": "reform",
    "개혁신당": "newReform", "진보당": "progressive",
    "정의당": "justice", "무소속": "independent",
    "새로운미래": "newFuture", "기본소득당": "basicIncome",
}
PARTY_NAMES = {v: k for k, v in PARTY_MAP.items()}
PARTY_NAMES["democratic"] = "더불어민주당"
PARTY_NAMES["ppp"] = "국민의힘"
PARTY_NAMES["independent"] = "무소속"

STATUS_KR = {
    "EXPECTED": "출마예상(현직)", "RUMORED": "출마설",
    "DECLARED": "출마선언", "NOMINATED": "공천확정",
    "ELECTED": "당선", "WITHDRAWN": "사퇴",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def naver_search(query: str, display: int = 30) -> list[str]:
    import httpx, html as _html
    cid = os.environ.get("NAVER_CLIENT_ID", "")
    csec = os.environ.get("NAVER_CLIENT_SECRET", "")
    if not cid:
        return []
    for attempt in range(3):
        try:
            resp = httpx.get(
                "https://openapi.naver.com/v1/search/news.json",
                headers={"X-Naver-Client-Id": cid, "X-Naver-Client-Secret": csec},
                params={"query": query, "display": display, "sort": "date"},
                timeout=10,
            )
            if resp.status_code == 429:
                wait = 2 ** attempt
                print(f"    429 — {wait}초 대기...")
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
            print(f"    Naver 오류: {e}")
            return []
    return []


def fetch_region_news(region_key: str, region_name: str) -> list[str]:
    """시도 전체 광역의원 출마 뉴스 수집"""
    label = COUNCIL_LABEL.get(region_key, "도의원")
    queries = [
        f"{region_name} {label} 출마 선언",
        f"{region_name} {label} 예비후보 등록",
        f"{region_name} {label} 공천 신청",
        f"{region_name} {label} 출마",
    ]
    seen = set()
    results = []
    for q in queries:
        for item in naver_search(q, display=30):
            if item not in seen:
                seen.add(item)
                results.append(item)
        time.sleep(0.4)
    return results[:80]


def build_prompt(region_name: str, label: str, existing: dict, news: list[str]) -> str:
    today = date.today().isoformat()

    # 현직 의원 목록 (선거구 + 이름 + 정당)
    existing_lines = []
    for seat, cands in existing.items():
        for c in cands:
            status_kr = STATUS_KR.get(c.get("status", ""), c.get("status", ""))
            party_kr = PARTY_NAMES.get(c.get("party", ""), c.get("party", ""))
            existing_lines.append(f"  [{seat}] {c['name']} ({party_kr}) — {status_kr}")

    existing_block = "\n".join(existing_lines) if existing_lines else "  (현직 없음)"
    news_block = "\n".join(f"  {n}" for n in news[:60]) if news else "  (뉴스 없음)"

    return f"""당신은 2026년 6.3 한국 지방선거 {region_name} 광역의원 후보 정보 전문가입니다. 오늘: {today}

## 현재 등록된 {region_name} {label} 후보/현직
{existing_block}

## 최신 뉴스 ({len(news)}건)
{news_block}

위 뉴스에서 다음을 추출하세요:

1. **신규 출마 선언자** — 현재 목록에 없는 인물이 {label} 출마를 선언한 경우
2. **상태 변경** — 현재 목록의 인물 상태가 변경된 경우 (출마선언/공천확정/사퇴 등)
3. **경력 보강** — 뉴스에서 확인된 현직/전직 경력

조건:
- 반드시 뉴스에 명확히 언급된 경우만 포함
- 선거구명은 뉴스에서 추론하거나 기존 목록의 형식과 일치하게 작성
- 정당은 한글 그대로 (더불어민주당/국민의힘/무소속 등)

변경사항이 없으면 빈 배열 [] 반환.

JSON 배열로만 출력:
[
  {{
    "type": "신규" | "상태변경" | "경력보강",
    "seat": "선거구명 (예: 강남구 제1선거구)",
    "name": "후보자명",
    "party": "정당명",
    "status": "DECLARED" | "NOMINATED" | "WITHDRAWN" | "RUMORED",
    "career": "경력 (선택)",
    "evidence": "근거 뉴스 제목 일부"
  }}
]"""


def parse_json_response(text: str):
    text = text.strip()
    text = re.sub(r'^```[^\n]*\n?', '', text)
    text = re.sub(r'\n?```$', '', text)
    try:
        return json.loads(text)
    except Exception:
        return None


def apply_changes(data: dict, changes: list, region_name: str, dry_run: bool) -> int:
    updated = 0
    cands = data.setdefault("candidates", {})

    for ch in changes:
        ch_type = ch.get("type", "")
        seat = ch.get("seat", "").strip()
        name = ch.get("name", "").strip()
        party_kr = ch.get("party", "").strip()
        status = ch.get("status", "DECLARED")
        career = ch.get("career", "").strip()
        evidence = ch.get("evidence", "")

        if not seat or not name:
            continue

        party_key = PARTY_MAP.get(party_kr, "independent")
        label = f"[{ch_type}] {seat}: {name} ({party_kr})"
        if evidence:
            label += f" — {evidence[:50]}"

        if ch_type == "신규":
            # 이미 있으면 스킵
            existing_names = [c["name"] for c in cands.get(seat, [])]
            if name in existing_names:
                continue
            new_cand = {
                "name": name, "party": party_key,
                "career": career, "status": status,
                "dataSource": "verified",
                "isIncumbent": False, "pledges": [],
                "sourceUrl": None, "sourceLabel": evidence[:80] if evidence else None,
                "sourcePublishedAt": date.today().isoformat(),
            }
            if dry_run:
                print(f"  [DRY] {label}")
            else:
                cands.setdefault(seat, []).append(new_cand)
                print(f"  {label}")
            updated += 1

        elif ch_type == "상태변경":
            seat_cands = cands.get(seat, [])
            target = next((c for c in seat_cands if c["name"] == name), None)
            if not target:
                # 없으면 신규로 추가
                new_cand = {
                    "name": name, "party": party_key,
                    "career": career, "status": status,
                    "dataSource": "verified",
                    "isIncumbent": False, "pledges": [],
                    "sourceUrl": None, "sourceLabel": evidence[:80] if evidence else None,
                    "sourcePublishedAt": date.today().isoformat(),
                }
                if dry_run:
                    print(f"  [DRY] [신규+상태] {label}")
                else:
                    cands.setdefault(seat, []).append(new_cand)
                    print(f"  [신규+상태] {label}")
                updated += 1
                continue
            old_status = target.get("status", "")
            if old_status == status and (not career or target.get("career")):
                continue
            if dry_run:
                print(f"  [DRY] {old_status}→{status} {label}")
            else:
                target["status"] = status
                if career and not target.get("career"):
                    target["career"] = career
                print(f"  {old_status}→{status} {label}")
            updated += 1

        elif ch_type == "경력보강":
            seat_cands = cands.get(seat, [])
            target = next((c for c in seat_cands if c["name"] == name), None)
            if not target or target.get("career"):
                continue
            if dry_run:
                print(f"  [DRY] 경력 {seat}: {name} → {career}")
            else:
                target["career"] = career
                print(f"  경력 {seat}: {name} → {career}")
            updated += 1

    return updated


def process_region(region_key: str, dry_run: bool) -> int:
    region_name = REGION_NAMES[region_key]
    label = COUNCIL_LABEL.get(region_key, "도의원")
    path = COUNCIL_DIR / f"{region_key}.json"
    if not path.exists():
        print(f"  [{region_name}] 파일 없음, 스킵")
        return 0

    data = json.loads(path.read_text(encoding="utf-8"))
    existing = data.get("candidates", {})
    total_existing = sum(len(v) for v in existing.values())

    print(f"\n[{region_name}] {label} {total_existing}명 팩트체크 중...")
    news = fetch_region_news(region_key, region_name)
    print(f"  뉴스 {len(news)}건 수집")

    if not news:
        print(f"  → 뉴스 없음, 스킵")
        return 0

    prompt = build_prompt(region_name, label, existing, news)
    raw_text = call_claude_json(prompt, max_tokens=2048)
    changes = parse_json_response(raw_text)

    if changes is None:
        print(f"  → Claude 응답 파싱 실패: {raw_text[:60]!r}")
        return 0
    if not changes:
        print(f"  → 변경 없음")
        return 0

    print(f"  → {len(changes)}건 감지")
    updated = apply_changes(data, changes, region_name, dry_run)

    if not dry_run and updated > 0:
        data.setdefault("_meta", {})["lastUpdated"] = date.today().isoformat()
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    return updated


def main():
    import argparse
    parser = argparse.ArgumentParser(description="광역의원 팩트체크 + 신규 후보 발굴")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--region", help="특정 시도만 (예: gyeonggi)")
    args = parser.parse_args()

    load_env()

    print("=" * 60)
    print("광역의원 후보자 팩트체크 파이프라인")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if args.dry_run:
        print("⚠️  DRY-RUN 모드")
    print("=" * 60)

    targets = [args.region] if args.region else list(REGION_NAMES.keys())
    total = 0

    for region_key in targets:
        if region_key not in REGION_NAMES:
            print(f"알 수 없는 지역: {region_key}")
            continue
        updated = process_region(region_key, args.dry_run)
        total += updated

    print(f"\n총 {total}건 업데이트")


if __name__ == "__main__":
    main()
