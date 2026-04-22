#!/usr/bin/env python3
"""
기초의원 후보자 팩트체크 + 신규 출마자 발굴 파이프라인

local_council/*.json의 현직 의원 상태를 뉴스 기반으로 업데이트하고
신규 출마 선언자를 발굴해 추가합니다.

전략:
  선거구(1030개)가 너무 많으므로 시군구(226개) 단위로 묶어 뉴스 검색 →
  Claude가 선거구별 후보 변동사항 추출

사용법:
  python scripts/candidate_pipeline/factcheck_local_council.py
  python scripts/candidate_pipeline/factcheck_local_council.py --dry-run
  python scripts/candidate_pipeline/factcheck_local_council.py --region seoul
  python scripts/candidate_pipeline/factcheck_local_council.py --region gyeonggi --district 수원시

환경변수:
  GEMINI_API_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
"""

import json
import os
import re
import sys
import time
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from election_overview_utils import call_claude_json

BASE_DIR = Path(__file__).resolve().parent.parent.parent
LOCAL_DIR = BASE_DIR / "data" / "candidates" / "local_council"
ENV_FILE = BASE_DIR / ".env"

REGION_NAMES = {
    "seoul": "서울특별시", "busan": "부산광역시", "daegu": "대구광역시",
    "incheon": "인천광역시", "gwangju": "광주광역시", "daejeon": "대전광역시",
    "ulsan": "울산광역시", "gyeonggi": "경기도",
    "gangwon": "강원특별자치도", "chungbuk": "충청북도", "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도", "jeonnam": "전라남도", "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도",
}

# 기초의원 직책명 (광역시 자치구 → 구의원, 일반 시 → 시의원, 군 → 군의원)
def get_council_label(district: str) -> str:
    if district.endswith("구"):
        return "구의원"
    if district.endswith("군"):
        return "군의원"
    return "시의원"

PARTY_MAP = {
    "더불어민주당": "democratic", "민주당": "democratic",
    "국민의힘": "ppp", "조국혁신당": "reform",
    "개혁신당": "newReform", "진보당": "progressive",
    "정의당": "justice", "무소속": "independent",
    "새로운미래": "newFuture", "기본소득당": "basicIncome",
}
PARTY_NAMES = {v: k for k, v in PARTY_MAP.items()}
PARTY_NAMES.update({"democratic": "더불어민주당", "ppp": "국민의힘", "independent": "무소속"})

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


def naver_search(query: str, display: int = 20) -> list[str]:
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


def extract_district_name(seat: str) -> str:
    """선거구명에서 시군구명 추출. 예: '종로구가선거구' → '종로구', '수원시 제1선거구' → '수원시'"""
    # "수원시 제1선거구" 형태
    m = re.match(r'^([가-힣]+(?:시|군|구))\s', seat)
    if m:
        return m.group(1)
    # "종로구가선거구" 형태 (붙어있음)
    m = re.match(r'^([가-힣]+(?:시|군|구))[가-힣]', seat)
    if m:
        return m.group(1)
    return seat


def group_seats_by_district(candidates: dict) -> dict[str, list[str]]:
    """선거구 → 시군구로 그룹핑. {시군구: [선거구1, 선거구2, ...]}"""
    groups: dict[str, list[str]] = defaultdict(list)
    for seat in candidates:
        dist = extract_district_name(seat)
        groups[dist].append(seat)
    return dict(groups)


def fetch_district_news(district: str, region_name: str) -> list[str]:
    """시군구별 기초의원 출마 뉴스 수집"""
    label = get_council_label(district)
    queries = [
        f"{district} {label} 출마 선언",
        f"{district} {label} 예비후보",
        f"{district} {label} 공천",
    ]
    seen = set()
    results = []
    for q in queries:
        for item in naver_search(q, display=15):
            if item not in seen:
                seen.add(item)
                results.append(item)
        time.sleep(0.4)
    return results[:40]


def build_prompt(district: str, label: str, seats: list[str],
                 existing: dict, news: list[str]) -> str:
    today = date.today().isoformat()

    # 현직 목록
    existing_lines = []
    for seat in seats:
        for c in existing.get(seat, []):
            status_kr = STATUS_KR.get(c.get("status", ""), c.get("status", ""))
            party_kr = PARTY_NAMES.get(c.get("party", ""), c.get("party", ""))
            existing_lines.append(f"  [{seat}] {c['name']} ({party_kr}) — {status_kr}")
    existing_block = "\n".join(existing_lines) if existing_lines else "  (현직 없음)"
    news_block = "\n".join(f"  {n}" for n in news[:30]) if news else "  (뉴스 없음)"

    return f"""당신은 2026년 6.3 한국 지방선거 {district} 기초의원({label}) 후보 정보 전문가입니다. 오늘: {today}

## 현재 등록된 {district} {label} 후보/현직
{existing_block}

## 최신 뉴스 ({len(news)}건)
{news_block}

위 뉴스에서 {district} {label} 관련 변동사항을 추출하세요:

1. **신규 출마 선언자** — 현재 목록에 없는 인물
2. **상태 변경** — 출마선언/공천확정/사퇴 등
3. **경력 보강** — 뉴스에서 확인된 경력

조건:
- 반드시 {district} {label} 출마로 명확히 언급된 경우만 포함
- 선거구는 "가선거구", "제1선거구" 등 뉴스에서 추론 (불명확하면 "{district}선거구"로 표기)
- 변경사항 없으면 [] 반환

JSON 배열로만 출력:
[
  {{
    "type": "신규" | "상태변경" | "경력보강",
    "seat": "선거구명 (예: {seats[0] if seats else district+'가선거구'})",
    "name": "후보자명",
    "party": "정당명",
    "status": "DECLARED" | "NOMINATED" | "WITHDRAWN",
    "career": "경력 (선택)",
    "evidence": "근거 뉴스 제목 일부"
  }}
]"""


def parse_json_response(text: str):
    text = text.strip()
    text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\s*```\s*$', '', text)
    try:
        return json.loads(text.strip())
    except Exception:
        return None


def apply_changes(data: dict, changes: list, dry_run: bool) -> int:
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
        label_str = f"[{ch_type}] {seat}: {name} ({party_kr})"
        if evidence:
            label_str += f" — {evidence[:50]}"

        if ch_type == "신규":
            existing_names = [c["name"] for c in cands.get(seat, [])]
            if name in existing_names:
                continue
            new_cand = {
                "name": name, "party": party_key, "career": career,
                "status": status, "dataSource": "verified",
                "isIncumbent": False, "pledges": [],
                "sourceUrl": None,
                "sourceLabel": evidence[:80] if evidence else None,
                "sourcePublishedAt": date.today().isoformat(),
            }
            if dry_run:
                print(f"  [DRY] {label_str}")
            else:
                cands.setdefault(seat, []).append(new_cand)
                print(f"  {label_str}")
            updated += 1

        elif ch_type == "상태변경":
            seat_list = cands.get(seat, [])
            target = next((c for c in seat_list if c["name"] == name), None)
            if not target:
                # 없으면 신규 추가
                new_cand = {
                    "name": name, "party": party_key, "career": career,
                    "status": status, "dataSource": "verified",
                    "isIncumbent": False, "pledges": [],
                    "sourceUrl": None,
                    "sourceLabel": evidence[:80] if evidence else None,
                    "sourcePublishedAt": date.today().isoformat(),
                }
                if dry_run:
                    print(f"  [DRY][신규] {label_str}")
                else:
                    cands.setdefault(seat, []).append(new_cand)
                    print(f"  [신규] {label_str}")
                updated += 1
                continue
            old = target.get("status", "")
            if old == status and (not career or target.get("career")):
                continue
            if dry_run:
                print(f"  [DRY] {old}→{status} {label_str}")
            else:
                target["status"] = status
                if career and not target.get("career"):
                    target["career"] = career
                print(f"  {old}→{status} {label_str}")
            updated += 1

        elif ch_type == "경력보강":
            seat_list = cands.get(seat, [])
            target = next((c for c in seat_list if c["name"] == name), None)
            if not target or target.get("career"):
                continue
            if dry_run:
                print(f"  [DRY] 경력 {seat}: {name} → {career}")
            else:
                target["career"] = career
                print(f"  경력 {seat}: {name} → {career}")
            updated += 1

    return updated


def process_region(region_key: str, only_district: str | None, dry_run: bool) -> int:
    region_name = REGION_NAMES[region_key]
    path = LOCAL_DIR / f"{region_key}.json"
    if not path.exists():
        return 0

    data = json.loads(path.read_text(encoding="utf-8"))
    cands = data.get("candidates", {})
    district_groups = group_seats_by_district(cands)

    if only_district:
        district_groups = {k: v for k, v in district_groups.items() if only_district in k}
        if not district_groups:
            print(f"  [{region_name}] '{only_district}' 시군구 없음")
            return 0

    total_districts = len(district_groups)
    print(f"\n[{region_name}] 기초의원 {total_districts}개 시군구 팩트체크 중...")

    total_updated = 0
    for district, seats in district_groups.items():
        label = get_council_label(district)
        news = fetch_district_news(district, region_name)
        if not news:
            continue

        prompt = build_prompt(district, label, seats, cands, news)
        max_tok = max(1024, len(seats) * 80)
        raw_text = call_claude_json(prompt, max_tokens=max_tok)
        changes = parse_json_response(raw_text)

        if not changes:
            continue
        if not isinstance(changes, list):
            continue

        u = apply_changes(data, changes, dry_run)
        if u:
            print(f"    {district}: {u}건")
            total_updated += u

        time.sleep(0.3)

    if not dry_run and total_updated > 0:
        data.setdefault("_meta", {})["lastUpdated"] = date.today().isoformat()
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    return total_updated


def main():
    import argparse
    parser = argparse.ArgumentParser(description="기초의원 팩트체크 + 신규 후보 발굴")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--region", help="특정 시도 (예: gyeonggi)")
    parser.add_argument("--district", help="특정 시군구 (예: 수원시)")
    args = parser.parse_args()

    load_env()
    print("=" * 60)
    print("기초의원 후보자 팩트체크 파이프라인")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if args.dry_run:
        print("⚠️  DRY-RUN 모드")
    print("=" * 60)

    targets = [args.region] if args.region else list(REGION_NAMES.keys())
    total = 0
    for region_key in targets:
        if region_key not in REGION_NAMES:
            continue
        updated = process_region(region_key, args.district, args.dry_run)
        total += updated

    print(f"\n총 {total}건 업데이트")


if __name__ == "__main__":
    main()
