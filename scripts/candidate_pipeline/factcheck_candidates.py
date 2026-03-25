#!/usr/bin/env python3
"""
후보자 상태 자동 팩트체크 파이프라인

기존 governor.json의 후보 목록을 Gemini에 보여주고,
출마 선언·사퇴·공천 확정·탈당 등 변경사항을 자동 감지하여 반영합니다.


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from election_overview_utils import call_claude_json
사용법:
  python scripts/candidate_pipeline/factcheck_candidates.py
  python scripts/candidate_pipeline/factcheck_candidates.py --dry-run

환경변수:
  ANTHROPIC_API_KEY: Anthropic API 키
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
CANDIDATES_PATH = BASE_DIR / "data" / "candidates" / "governor.json"
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
    "independent": "무소속", "reform": "조국혁신당",
    "progressive": "진보당", "justice": "정의당",
    "newReform": "개혁신당",
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


def load_candidates():
    if CANDIDATES_PATH.exists():
        return json.loads(CANDIDATES_PATH.read_text(encoding="utf-8"))
    return {"_meta": {}, "candidates": {}}


def fetch_governor_news():
    """전체 17개 시도 광역단체장 관련 최신 뉴스 수집"""
    from local_news_search import search_naver_news
    all_news = []
    seen = set()

    queries = [
        "지방선거 시도지사 공천 출마 2026",
        "지방선거 광역단체장 후보 경선",
        "지방선거 도지사 시장 출마선언 사퇴",
        "국민의힘 민주당 지방선거 공천",
    ]
    for rk, rn in REGION_NAMES.items():
        queries.append(f"{rn} 시장 도지사 후보 출마")

    for q in queries:
        for item in search_naver_news(q, display=10):
            title = item.get("title", "")
            if title not in seen:
                seen.add(title)
                all_news.append(title)

    return all_news[:60]


def build_prompt(candidates_data, news=None):
    today_str = date.today().isoformat()
    regions = candidates_data.get("candidates", {})

    lines = []
    for rk in sorted(regions.keys()):
        region_name = REGION_NAMES.get(rk, rk)
        candidates = regions[rk]
        for c in candidates:
            party = PARTY_NAMES.get(c.get("party", ""), c.get("party", ""))
            status = c.get("status", "UNKNOWN")
            status_map = {
                "DECLARED": "출마선언",
                "EXPECTED": "출마거론",
                "RUMORED": "하마평",
                "WITHDRAWN": "사퇴",
                "PRE": "예비후보",
                "NOMINATED": "공천확정",
            }
            status_label = status_map.get(status, status)
            lines.append(f"- {region_name}: {c['name']} ({party}) [{status_label}]")

    candidate_text = "\n".join(lines)
    total = sum(len(v) for v in regions.values())
    news_text = "\n".join(f"- {n}" for n in news) if news else "(뉴스 없음)"

    return f"""당신은 2026년 6.3 지방선거 전문가입니다. 오늘: {today_str}

아래는 17개 시도 광역단체장(시도지사) 후보 현황 {total}명과, 오늘 기준 최신 뉴스입니다.
**뉴스에서 확인되는 변경사항만** 팩트체크하세요.

## 🚨 사실 소스 규칙
- 아래 "최신 뉴스" 섹션에 **명시적으로 나오는 사실만** 변경사항으로 출력
- 뉴스에 없는 변경사항은 당신이 아무리 확신하더라도 출력 금지
- 학습 데이터에서 기억나는 사실을 추가하지 말 것

## 찾아야 할 변경사항
1. 뉴스에 나오지만 현재 데이터에 없는 새 후보 (출마 선언)
2. 사퇴·불출마 선언
3. 상태 변경 (RUMORED → DECLARED, EXPECTED → DECLARED 등)
4. 정당 변경 (탈당·입당·공천)
5. 공천 확정 (DECLARED → NOMINATED)

## 현재 데이터
{candidate_text}

## 최신 뉴스 (이 뉴스에서 확인되는 변경만 출력)
{news_text}

## 출력 형식 (JSON)
변경이 필요한 건만 JSON 배열로 출력. 없으면 []. JSON만 출력.

[
  {{
    "region": "시도 키 (seoul, busan 등)",
    "name": "후보 이름",
    "changeType": "new_candidate|status_change|withdrawn|party_change|nominated",
    "oldStatus": "이전 상태 (변경 시)",
    "newStatus": "새 상태 (DECLARED|EXPECTED|RUMORED|WITHDRAWN|NOMINATED)",
    "party": "정당명 (한글, 새 후보 또는 정당변경 시)",
    "career": "경력 (새 후보 시, 1줄)",
    "detail": "변경 근거 — 뉴스 제목 인용",
    "sourceUrl": "근거 뉴스 URL (반드시 포함)",
    "sourceLabel": "언론사명",
    "sourcePublishedAt": "뉴스 발행일 (YYYY-MM-DD)"
  }}
]

## 주의사항
- 뉴스에서 확인된 사실만 출력. 뉴스에 없으면 출력 금지.
- 이미 반영된 변경사항은 출력 금지
- 2026 지방선거 광역단체장만 해당 (교육감, 기초단체장 제외)
- 공천 확정은 당 공식 발표 기준

## ⚠️ status 판정 기준 (엄격 적용)
- **DECLARED**: 본인이 직접 출마를 공식 선언한 경우만. 기자회견·SNS·예비후보 등록 등
- **RUMORED**: 언론인/평론가 전망, "~출마 확실시", "~거론" 수준은 모두 RUMORED
- **NOMINATED**: 당 공관위/최고위가 공식 발표한 경우만
- **WITHDRAWN**: 본인이 직접 불출마/사퇴를 선언한 경우만. "컷오프"는 당의 결정이지 사퇴가 아님 — 본인이 수용 발언을 했는지 확인
- "~확실", "~유력", "~관측" 같은 표현은 **절대 DECLARED로 판정하지 말 것** → RUMORED"""



def parse_changes(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        result = json.loads(text)
        return result if isinstance(result, list) else []
    except json.JSONDecodeError:
        return []


REVERSE_REGION = {v: k for k, v in REGION_NAMES.items()}


def verify_changes_against_news(changes, news):
    """
    Gemini가 제안한 변경사항을 뉴스와 교차 검증.
    뉴스에서 근거를 찾을 수 없는 변경은 필터링.
    """
    if not news:
        return changes

    news_text = " ".join(news).lower()
    verified = []

    for change in changes:
        name = change.get("name", "")
        change_type = change.get("changeType", "")
        new_status = change.get("newStatus", "")
        region = change.get("region", "")
        region_name = REGION_NAMES.get(region, REVERSE_REGION.get(region, region))

        # 1. 이름이 뉴스에 있는지 확인
        if name and name not in news_text:
            print(f"  [필터] {name}: 뉴스에 이름 없음 → 제외")
            continue

        # 2. WITHDRAWN: "사퇴" "불출마" "포기" 등 본인 행위 키워드 필요
        if new_status == "WITHDRAWN":
            withdraw_keywords = ["사퇴", "불출마", "출마 포기", "출마를 접", "출마 안"]
            has_withdraw = any(kw in news_text for kw in withdraw_keywords if name in news_text)
            # "컷오프"는 당 결정이지 본인 사퇴가 아님
            is_cutoff_only = "컷오프" in news_text and not has_withdraw
            if is_cutoff_only:
                print(f"  [필터] {name}: 컷오프는 당 결정. 본인 사퇴 확인 안 됨 → 제외")
                continue

        # 3. NOMINATED: "공천" "단수" "확정" 등 키워드 + 이름 근접 확인
        if new_status == "NOMINATED":
            nominate_keywords = ["공천", "단수", "확정"]
            # 이름과 공천 키워드가 같은 뉴스 문장에 있는지
            found_in_same_news = False
            for n in news:
                n_lower = n.lower()
                if name in n_lower and any(kw in n_lower for kw in nominate_keywords):
                    found_in_same_news = True
                    break
            if not found_in_same_news:
                print(f"  [필터] {name}: 공천 뉴스에서 이름+공천 동시 확인 안 됨 → 제외")
                continue

        # 4. new_candidate (DECLARED): "출마 선언" "예비후보 등록" 등 본인 행위 필요
        if change_type == "new_candidate" and new_status in ("DECLARED", None, ""):
            declare_keywords = ["출마 선언", "출마를 선언", "예비후보 등록", "출사표", "출마 공식"]
            has_declare = any(kw in news_text for kw in declare_keywords if name in news_text)
            # "확실" "유력" "거론"은 RUMORED
            speculation = ["확실", "유력", "거론", "관측", "가능성"]
            is_speculation = any(kw in news_text for kw in speculation if name in news_text) and not has_declare
            if is_speculation:
                print(f"  [필터] {name}: 전망/관측 수준 → DECLARED→RUMORED로 변경")
                change["newStatus"] = "RUMORED"
            elif not has_declare:
                print(f"  [필터] {name}: 출마 선언 근거 부족 → RUMORED로 변경")
                change["newStatus"] = "RUMORED"

        verified.append(change)

    return verified


def apply_changes(data, changes, dry_run=False):
    applied = 0
    candidates = data.get("candidates", {})

    for change in changes:
        region = change.get("region", "")
        # 한국어 시도명 → 영문 키 변환
        if region not in candidates and region in REVERSE_REGION:
            region = REVERSE_REGION[region]
        name = change.get("name", "")
        change_type = change.get("changeType", "")
        region_name = REGION_NAMES.get(region, region)

        if region not in candidates:
            print(f"  [경고] '{region}' 없음")
            continue

        region_list = candidates[region]
        existing = next((c for c in region_list if c["name"] == name), None)

        if change_type == "new_candidate":
            if existing:
                print(f"  [건너뜀] {region_name}: {name} 이미 존재")
                continue
            from candidate_guard import check_party
            party = PARTY_MAP.get(change.get("party", ""), "independent")
            party = check_party(name, party)
            new_id = f"{region}-{len(region_list)+1}"
            new_candidate = {
                "id": new_id,
                "name": name,
                "party": party,
                "age": None,
                "career": change.get("career", ""),
                "photo": None,
                "status": change.get("newStatus", "DECLARED"),
                "dataSource": "claude",
                "pledges": [],
                "sourceUrl": change.get("sourceUrl"),
                "sourceLabel": change.get("sourceLabel"),
                "sourcePublishedAt": change.get("sourcePublishedAt"),
            }
            label = f"[신규] {region_name}: {name} ({PARTY_NAMES.get(party, party)}) - {change.get('detail', '')}"
            if dry_run:
                print(f"  [DRY] {label}")
            else:
                region_list.append(new_candidate)
                print(f"  {label}")
            applied += 1

        elif change_type in ("status_change", "withdrawn", "nominated"):
            if not existing:
                print(f"  [경고] {region_name}: {name} 없음")
                continue
            old_status = existing.get("status", "?")
            new_status = change.get("newStatus", "WITHDRAWN" if change_type == "withdrawn" else "DECLARED")
            if old_status == new_status:
                continue
            label = f"[상태변경] {region_name}: {name} {old_status} → {new_status} - {change.get('detail', '')}"
            if dry_run:
                print(f"  [DRY] {label}")
            else:
                existing["status"] = new_status
                existing["_lastChange"] = {
                    "date": date.today().isoformat(),
                    "type": change_type,
                    "detail": change.get("detail", ""),
                    "previous": old_status,
                    "sourceUrl": change.get("sourceUrl"),
                    "sourceLabel": change.get("sourceLabel"),
                    "sourcePublishedAt": change.get("sourcePublishedAt"),
                }
                print(f"  {label}")
            applied += 1

        elif change_type == "party_change":
            if not existing:
                print(f"  [경고] {region_name}: {name} 없음")
                continue
            new_party = PARTY_MAP.get(change.get("party", ""), "independent")
            old_party = existing.get("party", "?")
            if old_party == new_party:
                continue
            label = f"[정당변경] {region_name}: {name} {PARTY_NAMES.get(old_party, old_party)} → {PARTY_NAMES.get(new_party, new_party)} - {change.get('detail', '')}"
            if dry_run:
                print(f"  [DRY] {label}")
            else:
                existing["party"] = new_party
                print(f"  {label}")
            applied += 1

    return applied


def main():
    load_env()
    llm_key = os.environ.get("ANTHROPIC_API_KEY", "")
    dry_run = "--dry-run" in sys.argv

    if not llm_key:
        print("[오류] ANTHROPIC_API_KEY 미설정")
        sys.exit(1)

    print("=" * 60)
    print("후보자 상태 자동 팩트체크 파이프라인")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if dry_run:
        print("[DRY RUN]")
    print("=" * 60)

    data = load_candidates()
    total = sum(len(v) for v in data.get("candidates", {}).values())
    print(f"\n현재 후보: {total}명 ({len(data.get('candidates', {}))}개 시도)")

    # ── ① 선관위 예비후보 API 동기화 ──
    try:
        from nec_precand_sync import fetch_precandidates, sync_governor
        print("\n[1단계] 선관위 예비후보(시도지사) 조회...")
        nec_items = fetch_precandidates("3")
        if nec_items:
            nec_fixes = sync_governor(data, nec_items)
            if nec_fixes:
                print(f"  {len(nec_fixes)}건 동기화:")
                for nf in nec_fixes[:20]:
                    print(f"    • {nf}")
                if len(nec_fixes) > 20:
                    print(f"    ... 외 {len(nec_fixes) - 20}건")
            else:
                print("  변경 없음")
    except ImportError:
        print("\n[NEC] nec_precand_sync 모듈 없음 — 건너뜀")
    except Exception as e:
        print(f"\n[NEC] 오류: {e}")

    # ── ② 뉴스 기반 팩트체크 ──
    print("\n[2단계] 뉴스 수집 중...")
    news = fetch_governor_news()
    print(f"  → {len(news)}건 수집")

    prompt = build_prompt(data, news=news)

    try:
        raw = call_claude_json(prompt, llm_key)
        changes = parse_changes(raw)

        if not changes:
            print("  → 변경 없음")
        else:
            print(f"  → {len(changes)}건 변경 감지 (Gemini)")
            print("\n뉴스 교차 검증 중...")
            changes = verify_changes_against_news(changes, news)
            print(f"  → {len(changes)}건 검증 통과")
            applied = apply_changes(data, changes, dry_run)
            print(f"  → {applied}건 적용")
    except Exception as e:
        print(f"  [오류] {e}")
        return

    if not dry_run and changes:
        data["_meta"]["lastFactCheck"] = datetime.now().isoformat()
        data["_meta"]["lastUpdated"] = date.today().isoformat()
        CANDIDATES_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"\n[저장] {CANDIDATES_PATH}")

    print("\n" + "=" * 60)
    print("완료!")
    print("=" * 60)


if __name__ == "__main__":
    main()
