#!/usr/bin/env python3
"""
재보궐선거 후보·현황 자동 업데이트 파이프라인
- Gemini로 각 재보궐 지역구의 최신 뉴스를 검색·분석
- 후보자 출마 선언, 사퇴, 공천 확정 등 상태 변화 반영
- data/candidates/byelection.json 자동 갱신
"""

import json
import os
import sys
import time
import re
from datetime import datetime, date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))
from election_overview_utils import call_claude_json

BYELECTION_PATH = BASE_DIR / "data" / "candidates" / "byelection.json"
ENV_FILE = BASE_DIR / ".env"
API_KEY_ENV = "ANTHROPIC_API_KEY"

PARTY_MAP = {
    "더불어민주당": "democratic", "민주당": "democratic",
    "국민의힘": "ppp",
    "조국혁신당": "reform",
    "개혁신당": "newReform",
    "진보당": "progressive",
    "정의당": "justice",
    "새로운미래": "newFuture",
    "무소속": "independent",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def load_current():
    if BYELECTION_PATH.exists():
        return json.loads(BYELECTION_PATH.read_text(encoding="utf-8"))
    return {"_meta": {}, "districts": {}}


def fetch_byelection_news(district_name):
    """재보궐 지역구 관련 뉴스 수집"""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from local_news_search import search_naver_news

    all_news = []
    seen = set()
    queries = [
        f"{district_name} 재보궐 후보 출마",
        f"{district_name} 국회의원 보궐선거",
        f"{district_name} 공천 경선",
    ]
    for q in queries:
        for item in search_naver_news(q, display=10):
            title = item.get("title", "")
            if title not in seen:
                seen.add(title)
                all_news.append(title)
    return all_news[:15]


def build_prompt(key, dist, news=None):
    today_str = date.today().isoformat()

    # 기존 후보 정보
    existing_candidates = dist.get("candidates", [])
    if existing_candidates:
        cand_lines = []
        for c in existing_candidates:
            party_name = c.get("partyName", c.get("party", ""))
            status = c.get("status", "DECLARED")
            pledges = ", ".join(c.get("pledges", []))
            cand_lines.append(f"- {c['name']} ({party_name}, {status}): {c.get('career', '')} / 공약: {pledges}")
        existing_text = "\n".join(cand_lines)
    else:
        existing_text = "(아직 수집된 후보 없음)"

    news_text = "\n".join(f"- {n}" for n in news) if news else "(뉴스 없음)"

    return f"""당신은 한국 재보궐선거 전문 리서처입니다.

아래 재보궐선거 지역구의 후보자 목록을 최신 뉴스와 비교하여 업데이트하세요.

## 🚨 사실 소스 규칙
- 아래 "최신 뉴스" 섹션에 나오는 사실만 사용
- 뉴스에 없는 후보/사건을 추가하지 말 것

## 지역구 정보
- 선거구: {dist['district']}
- 선거 유형: {dist['type']} ({dist['subType']})
- 사유: {dist['reason']}
- 전임: {dist['previousMember']['name']} ({dist['previousMember']['party']})
- 오늘 날짜: {today_str}
- 선거일: 2026-06-03

## 기존 수집 후보
{existing_text}

## 최신 뉴스 (이 뉴스에서 확인되는 사실만 사용)
{news_text}

## 출력 형식 (JSON)
다른 텍스트 없이 JSON만 출력하세요:
{{
  "candidates": [
    {{
      "name": "후보 이름",
      "party": "정당명",
      "career": "주요 경력 1줄",
      "pledges": ["공약1", "공약2"],
      "status": "DECLARED|NOMINATED|RUMORED|WITHDRAWN",
      "dataSource": "news"
    }}
  ],
  "keyIssues": ["이슈1", "이슈2"],
  "statusNote": "현재 동향 1~2문장"
}}

## ⚠️ status 판정 기준
- DECLARED: 본인 공식 출마 선언/예비후보 등록만
- RUMORED: "~확실시", "~거론", "~유력"은 모두 RUMORED
- NOMINATED: 당 공식 공천 발표만
- WITHDRAWN: 본인 직접 사퇴/불출마 선언만

## ⚠️ 정당(party) 판정 규칙
- 반드시 뉴스에서 확인된 정당만 기재
- 탈당/복당/제명이 뉴스에 나오면 반드시 최신 정당으로 기재
- 무소속 출마 선언은 "무소속"으로 기재 (이전 소속 정당 아님)
- 정당을 확인할 수 없으면 "미확인"으로 기재 (추측 금지)"""



def parse_response(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def normalize_party_key(party_name):
    if not party_name:
        return "independent"
    for name, key in PARTY_MAP.items():
        if name in party_name:
            return key
    return "independent"


def merge_candidates(existing, new_candidates):
    """기존 후보 목록에 신규 후보 병합 (이름 기준 dedup)"""
    by_name = {c["name"]: c for c in existing}

    for nc in new_candidates:
        name = nc.get("name", "").strip()
        if not name:
            continue

        # 당적 정규화: party(내부키), partyKey, partyName 3개 필드 일관성 보장
        raw_party = nc.get("party", "")
        party_key = normalize_party_key(raw_party)
        nc["party"] = party_key
        nc["partyKey"] = party_key
        nc["partyName"] = raw_party  # 원본 정당명 보존
        nc.setdefault("dataSource", "news")
        nc.setdefault("pledges", [])
        nc.setdefault("status", "DECLARED")
        nc.setdefault("career", "")

        if name in by_name:
            # 기존 후보 업데이트 (status, pledges, career 등)
            old = by_name[name]
            if nc.get("status") == "WITHDRAWN":
                old["status"] = "WITHDRAWN"
            elif nc.get("status") == "NOMINATED" and old.get("status") != "WITHDRAWN":
                old["status"] = "NOMINATED"
            if nc.get("career") and nc["career"] != old.get("career", ""):
                old["career"] = nc["career"]
            if nc.get("pledges") and len(nc["pledges"]) > len(old.get("pledges", [])):
                old["pledges"] = nc["pledges"]
            # 당적 3개 필드 동기화
            old["party"] = nc["party"]
            old["partyKey"] = nc["partyKey"]
            old["partyName"] = nc["partyName"]
        else:
            by_name[name] = nc

    return list(by_name.values())


def cross_check_party_via_news(districts):
    """뉴스 검색으로 각 후보의 당적을 교차검증.

    후보 이름 + 선거구로 검색하여 뉴스 제목에서 정당명을 추출,
    현재 데이터와 불일치하면 경고를 출력한다.
    """
    try:
        import sys as _sys
        _sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from local_news_search import search_naver_news
    except ImportError:
        print("  [당적검증] local_news_search 미사용 — 건너뜀")
        return []

    PARTY_KEYWORDS = {
        "더불어민주당": "democratic", "민주당": "democratic",
        "국민의힘": "ppp", "조국혁신당": "reform",
        "진보당": "progressive", "정의당": "justice",
        "개혁신당": "newReform", "무소속": "independent",
        "자유와혁신": "other", "새로운미래": "newFuture",
    }

    warnings = []
    for key, dist in districts.items():
        district_name = dist.get("district", "")
        for c in dist.get("candidates", []):
            name = c.get("name", "")
            current_party = c.get("party", "")
            if not name or c.get("status") == "WITHDRAWN":
                continue

            # 뉴스 검색: "후보이름" "선거구" 정당
            query = f'"{name}" "{district_name.split(" ")[-1]}"'
            try:
                results = search_naver_news(query, display=5)
            except Exception:
                continue

            # 뉴스 제목에서 정당 키워드 추출
            found_parties = {}
            for item in results:
                title = item.get("title", "")
                if name not in title.replace("<b>", "").replace("</b>", ""):
                    continue
                for kw, pk in PARTY_KEYWORDS.items():
                    if kw in title:
                        found_parties[pk] = found_parties.get(pk, 0) + 1

            if not found_parties:
                continue

            # 가장 많이 언급된 정당
            top_party = max(found_parties, key=found_parties.get)
            top_count = found_parties[top_party]

            if top_party != current_party and top_count >= 2:
                # 2건 이상 일치하면 불일치 경고
                display = {v: k for k, v in PARTY_KEYWORDS.items()}.get(top_party, top_party)
                current_display = {v: k for k, v in PARTY_KEYWORDS.items()}.get(current_party, current_party)
                msg = f"{district_name} {name}: 현재='{current_display}' vs 뉴스='{display}'({top_count}건)"
                warnings.append(msg)

                # 자동 교정 (3건 이상 일치 시)
                if top_count >= 3:
                    c["party"] = top_party
                    c["partyKey"] = top_party
                    party_name = {v: k for k, v in PARTY_KEYWORDS.items()}.get(top_party, top_party)
                    c["partyName"] = party_name
                    msg += " → 자동 교정"
                    warnings[-1] = msg

            time.sleep(0.3)  # API rate limit

    return warnings


def verify_party_consistency(districts):
    """모든 후보의 party/partyKey/partyName 일관성 검증 + 자동 교정.

    규칙:
    1. party와 partyKey는 항상 동일한 내부키여야 함 (democratic, ppp, etc.)
    2. partyName이 PARTY_MAP에 있으면 party/partyKey는 매핑값과 일치해야 함
    3. partyName이 내부키 형태(democratic 등)면 실제 정당명으로 교체
    """
    PARTY_DISPLAY = {
        "democratic": "더불어민주당", "ppp": "국민의힘",
        "reform": "조국혁신당", "progressive": "진보당",
        "justice": "정의당", "independent": "무소속",
        "newReform": "개혁신당", "newFuture": "새로운미래",
    }
    fixes = []

    for key, dist in districts.items():
        for c in dist.get("candidates", []):
            name = c.get("name", "?")
            party = c.get("party", "")
            partyKey = c.get("partyKey", "")
            partyName = c.get("partyName", "")
            changed = False

            # partyName → 내부키 역매핑
            expected_key = normalize_party_key(partyName) if partyName else None

            # 규칙1: partyName에서 정규화한 키가 party와 다르면 교정
            if expected_key and expected_key != "independent" and party != expected_key:
                fixes.append(f"{dist['district']} {name}: party '{party}'→'{expected_key}' (partyName='{partyName}')")
                c["party"] = expected_key
                c["partyKey"] = expected_key
                changed = True

            # 규칙2: party와 partyKey 불일치 → party 기준으로 통일
            if not changed and party and partyKey != party:
                fixes.append(f"{dist['district']} {name}: partyKey '{partyKey}'→'{party}'")
                c["partyKey"] = party
                changed = True

            # 규칙3: partyName이 내부키 형태면 표시명으로 교체
            if partyName in PARTY_DISPLAY:
                display = PARTY_DISPLAY[partyName]
                fixes.append(f"{dist['district']} {name}: partyName '{partyName}'→'{display}'")
                c["partyName"] = display
            elif not partyName and party in PARTY_DISPLAY:
                c["partyName"] = PARTY_DISPLAY[party]
                fixes.append(f"{dist['district']} {name}: partyName 빈값→'{c['partyName']}'")

    return fixes


def main():
    load_env()
    api_key = os.environ.get(API_KEY_ENV, "")
    if not api_key:
        print(f"[오류] {API_KEY_ENV} 환경변수가 설정되지 않았습니다.")
        sys.exit(1)

    print("=" * 55)
    print("재보궐선거 후보·현황 자동 업데이트 (Claude)")
    print(f"실행 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 55)

    current = load_current()
    districts = current.get("districts", {})
    errors = []
    updated_count = 0

    for key, dist in districts.items():
        print(f"\n[{key}] {dist['district']} 처리 중...")

        news = fetch_byelection_news(dist['district'])
        print(f"  뉴스 {len(news)}건 수집")

        prompt = build_prompt(key, dist, news=news)

        try:
            raw = call_claude_json(prompt, api_key)
            obj = parse_response(raw)

            if not obj:
                print("  [경고] 유효하지 않은 응답, 기존 데이터 유지")
                errors.append(key)
                continue

            # 후보 병합
            new_candidates = obj.get("candidates", [])
            existing_candidates = dist.get("candidates", [])
            merged = merge_candidates(existing_candidates, new_candidates)
            dist["candidates"] = merged

            # 이슈 업데이트 (Gemini가 새 이슈를 줬으면 교체)
            if obj.get("keyIssues") and len(obj["keyIssues"]) >= 3:
                dist["keyIssues"] = obj["keyIssues"][:4]

            # 상태 노트
            if obj.get("statusNote"):
                dist["statusNote"] = obj["statusNote"]

            active = [c for c in merged if c.get("status") != "WITHDRAWN"]
            print(f"  -> 후보 {len(active)}명 (활성), {len(merged) - len(active)}명 (사퇴)")
            if obj.get("statusNote"):
                print(f"  -> 동향: {obj['statusNote'][:60]}...")

            updated_count += 1

        except Exception as e:
            print(f"  [오류] {e}")
            errors.append(key)

        time.sleep(1)

    # ── 당적 뉴스 교차검증 ──
    print("\n[당적 교차검증] 뉴스 기반 당적 확인 중...")
    party_warnings = cross_check_party_via_news(districts)
    if party_warnings:
        print(f"  {len(party_warnings)}건 감지:")
        for pw in party_warnings:
            print(f"  ⚠ {pw}")
    else:
        print("  불일치 없음")

    # ── 당적 일관성 검증 + 자동 교정 ──
    party_fixes = verify_party_consistency(districts)
    if party_fixes:
        print(f"\n[당적 일관성] {len(party_fixes)}건 자동 교정:")
        for pf in party_fixes:
            print(f"  • {pf}")

    # 저장
    current["_meta"]["lastUpdated"] = date.today().isoformat()
    current["_meta"]["source"] = "뉴스 기반 수집 (Claude)"
    current["districts"] = districts

    BYELECTION_PATH.write_text(
        json.dumps(current, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )

    print("\n" + "=" * 55)
    print(f"완료! {updated_count}/{len(districts)}개 지역구 업데이트")
    if party_fixes:
        print(f"당적 교정: {len(party_fixes)}건")
    if errors:
        print(f"오류 발생 지역 ({len(errors)}): {', '.join(errors)}")
    print(f"저장: {BYELECTION_PATH}")
    print("=" * 55)


if __name__ == "__main__":
    main()
