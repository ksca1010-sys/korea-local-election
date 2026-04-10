#!/usr/bin/env python3
"""
기초단체장 후보자 상태 자동 팩트체크 파이프라인

뉴스 기반으로 시군구 기초단체장 출마 선언·사퇴 등을 자동 감지하여
mayor_candidates.json에 반영합니다. 시도별로 분할 처리.


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from election_overview_utils import call_claude_json
사용법:
  python scripts/candidate_pipeline/factcheck_mayor.py
  python scripts/candidate_pipeline/factcheck_mayor.py --dry-run
  python scripts/candidate_pipeline/factcheck_mayor.py --region seoul

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
CANDIDATES_PATH = BASE_DIR / "data" / "candidates" / "mayor_candidates.json"
STATUS_PATH = BASE_DIR / "data" / "candidates" / "mayor_status.json"
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
PARTY_NAMES = {
    "democratic": "더불어민주당", "ppp": "국민의힘",
    "independent": "무소속", "reform": "조국혁신당",
    "progressive": "진보당", "newReform": "개혁신당",
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
    return init_from_status()


def init_from_status():
    """mayor_status.json에서 현직 기초단체장으로 초기 데이터 생성"""
    data = {"_meta": {"lastUpdated": date.today().isoformat(), "source": "auto-init from mayor_status.json"}, "candidates": {}}
    if STATUS_PATH.exists():
        status = json.loads(STATUS_PATH.read_text(encoding="utf-8"))
        for key, info in status.get("mayors", {}).items():
            region = info.get("region", "")
            district = info.get("district", "")
            if not region or not district:
                continue
            if region not in data["candidates"]:
                data["candidates"][region] = {}
            name = info.get("name") or info.get("electedName", "")
            if not name:
                continue
            party = info.get("party", "independent")
            data["candidates"][region][district] = [{
                "name": name,
                "party": party,
                "career": f"현 {district} {get_title(district)}",
                "status": "EXPECTED",
                "dataSource": "incumbent",
                "pledges": [],
            }]
    return data


def get_title(district):
    if district.endswith("구") or district.endswith("군"):
        return "구청장" if district.endswith("구") else "군수"
    return "시장"


from local_news_search import fetch_mayor_news
from verify_changes import verify_changes_against_news
from factcheck_logger import FactcheckLogger


def build_prompt_for_region(region_key, region_candidates, news=None):
    today_str = date.today().isoformat()
    region_name = REGION_NAMES.get(region_key, region_key)

    lines = []
    info_gaps = []
    for district, candidates in sorted(region_candidates.items()):
        for c in candidates:
            if "_merged" in c:  # 전남광주통합 플레이스홀더 스킵
                continue
            if not c.get("name"):  # name 없는 불완전 레코드 스킵
                print(f"  [경고] name 없는 레코드 스킵 (mayor/{district}): {list(c.keys())}")
                continue
            party = PARTY_NAMES.get(c.get("party", ""), c.get("party", ""))
            career = (c.get("career") or "").strip()
            status_map = {"DECLARED": "출마선언", "EXPECTED": "출마거론", "RUMORED": "하마평", "WITHDRAWN": "사퇴", "NOMINATED": "공천확정"}
            status_label = status_map.get(c.get("status", ""), c.get("status", ""))
            career_tag = f" 경력:{career}" if career else " ⚠경력미상"
            party_tag = "" if party and party != "무소속" else " ⚠정당미상" if c.get("party") == "independent" else ""
            lines.append(f"- {district}: {c['name']} ({party}) [{status_label}]{career_tag}{party_tag}")
            if not career or c.get("party") == "independent":
                info_gaps.append(f"{district}/{c['name']}")

    candidate_text = "\n".join(lines)
    total = sum(len(v) for v in region_candidates.values())
    news_text = "\n".join(f"- {n}" for n in news) if news else "(뉴스 검색 결과 없음)"
    gaps_text = ", ".join(info_gaps[:30]) if info_gaps else "없음"

    return f"""당신은 2026년 6.3 지방선거 기초단체장 전문가입니다. 오늘: {today_str}

{region_name} 기초단체장(시장/구청장/군수) 후보 현황을 아래 최신 뉴스와 비교하여 두 가지를 수행하세요:
(A) 새 후보 발굴 및 상태 변경 감지
(B) ⚠표시된 후보의 경력·정당 정보 보강

## 현재 데이터 ({region_name}, {total}명)
{candidate_text}

## 정보 미비 후보 ({len(info_gaps)}명)
{gaps_text}

## 최신 뉴스 ({region_name} 기초단체장 관련, {len(news) if news else 0}건)
{news_text}

## (A) 찾아야 할 변경사항
1. 뉴스에는 나오지만 현재 데이터에 없는 새 후보 (출마 선언, 예비후보 등록, 출판기념회 등)
2. 사퇴·불출마 선언
3. 상태 변경 (거론 → 출마선언 등)
4. 정당 변경 (탈당·입당·공천)
5. 공천 확정

## (B) 정보 보강
뉴스에서 ⚠경력미상/⚠정당미상 후보의 정보를 찾아 보강하세요:
- 경력: "전 ○○시의원", "현 ○○도의원", "전 ○○부시장", "변호사", "기업인" 등 1줄
- 정당: 뉴스에서 확인되는 소속 정당 (민주당/국민의힘/조국혁신당/무소속 등)

## 출력 형식 (JSON)
(A)와 (B) 모두 하나의 JSON 배열로 출력. 없으면 []. JSON만 출력.

[
  {{
    "district": "시군구명",
    "name": "후보 이름",
    "changeType": "new_candidate|status_change|withdrawn|party_change|nominated|info_update",
    "oldStatus": "이전 상태 (info_update시 생략 가능)",
    "newStatus": "새 상태 (info_update시 생략 가능)",
    "party": "정당명 (한글). 뉴스에서 확인된 정당. 확인 안 되면 생략",
    "career": "경력 1줄. 뉴스에서 확인된 경력. 확인 안 되면 생략",
    "detail": "근거 (뉴스 제목 인용)",
    "sourceUrl": "근거 뉴스 URL (반드시 포함)",
    "sourceLabel": "언론사명",
    "sourcePublishedAt": "뉴스 발행일 (YYYY-MM-DD)"
  }}
]

## 주의사항
- 뉴스에서 확인되는 사실만 반영. 추측 금지
- {region_name} 기초단체장(시장/구청장/군수)만 해당. 광역단체장·교육감·국회의원 제외
- info_update: 뉴스에서 경력 또는 정당이 확인되는 경우만. 추측으로 채우지 말 것

## ⚠️ status 판정 기준 (엄격 적용)
- DECLARED: 본인이 직접 출마를 공식 선언/예비후보 등록한 경우만
- RUMORED: "~출마 확실시", "~거론", "~관측" 수준은 모두 RUMORED
- NOMINATED: 당 공관위/최고위 공식 발표만
- WITHDRAWN: 본인이 직접 불출마/사퇴를 선언한 경우만
- "~확실", "~유력" 같은 표현은 절대 DECLARED로 판정 금지

## 기초단체장 선거 특성 (감지 우선순위)
- 현직 단체장의 재선 불출마·사퇴 여부
- 야당 유력 도전자의 출마 선언
- 국회의원·시도의원의 기초단체장 전환 출마
- 무소속 출마 또는 탈당 후 출마
- 공천 경선 결과
- 출판기념회 개최 (사실상 출마 선언)
- 여론조사 결과에서 언급되는 후보"""



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


def apply_changes(region_candidates, changes, region_key, dry_run=False):
    applied = 0
    region_name = REGION_NAMES.get(region_key, region_key)

    for change in changes:
        district = change.get("district", "")
        name = change.get("name", "")
        change_type = change.get("changeType", "")

        if district not in region_candidates:
            region_candidates[district] = []

        candidates = region_candidates[district]
        existing = next((c for c in candidates if c["name"] == name), None)

        if change_type == "new_candidate":
            if existing:
                continue
            from candidate_guard import check_party
            party = PARTY_MAP.get(change.get("party", ""), "independent")
            party = check_party(name, party)
            new_candidate = {
                "name": name,
                "party": party,
                "career": change.get("career", ""),
                "status": change.get("newStatus", "DECLARED"),
                "dataSource": "claude",
                "pledges": [],
                "sourceUrl": change.get("sourceUrl"),
                "sourceLabel": change.get("sourceLabel"),
                "sourcePublishedAt": change.get("sourcePublishedAt"),
            }
            label = f"[신규] {district}: {name} ({PARTY_NAMES.get(party, party)}) - {change.get('detail', '')}"
            if dry_run:
                print(f"    [DRY] {label}")
            else:
                candidates.append(new_candidate)
                print(f"    {label}")
            applied += 1

        elif change_type in ("status_change", "withdrawn", "nominated"):
            if not existing:
                continue
            old_status = existing.get("status", "?")
            new_status = change.get("newStatus", "WITHDRAWN" if change_type == "withdrawn" else "DECLARED")
            if old_status == new_status:
                continue
            label = f"[상태] {district}: {name} {old_status}→{new_status} - {change.get('detail', '')}"
            if dry_run:
                print(f"    [DRY] {label}")
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
                print(f"    {label}")
            applied += 1

        elif change_type == "party_change":
            if not existing:
                continue
            new_party = PARTY_MAP.get(change.get("party", ""), "independent")
            if existing.get("party") == new_party:
                continue
            label = f"[정당] {district}: {name} → {PARTY_NAMES.get(new_party, new_party)} - {change.get('detail', '')}"
            if dry_run:
                print(f"    [DRY] {label}")
            else:
                existing["party"] = new_party
                print(f"    {label}")
            applied += 1

        elif change_type == "info_update":
            if not existing:
                continue
            updated_fields = []
            new_career = (change.get("career") or "").strip()
            new_party_str = (change.get("party") or "").strip()
            old_career = (existing.get("career") or "").strip()
            if new_career and not old_career:
                if not dry_run:
                    existing["career"] = new_career
                updated_fields.append(f"경력={new_career}")
            if new_party_str:
                new_party = PARTY_MAP.get(new_party_str, None)
                if new_party and existing.get("party") == "independent" and new_party != "independent":
                    if not dry_run:
                        existing["party"] = new_party
                    updated_fields.append(f"정당={PARTY_NAMES.get(new_party, new_party)}")
            if updated_fields:
                label = f"[보강] {district}: {name} {', '.join(updated_fields)} - {change.get('detail', '')}"
                if dry_run:
                    print(f"    [DRY] {label}")
                else:
                    print(f"    {label}")
                applied += 1

    return applied


def main():
    load_env()
    llm_key = os.environ.get("ANTHROPIC_API_KEY", "")
    dry_run = "--dry-run" in sys.argv
    target_region = None
    for arg in sys.argv[1:]:
        if arg.startswith("--region"):
            target_region = arg.split("=")[-1] if "=" in arg else (sys.argv[sys.argv.index(arg) + 1] if sys.argv.index(arg) + 1 < len(sys.argv) else None)

    if not llm_key:
        print("[오류] ANTHROPIC_API_KEY 미설정")
        sys.exit(1)

    print("=" * 60)
    print("기초단체장 후보자 자동 팩트체크 파이프라인")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if dry_run:
        print("[DRY RUN]")
    if target_region:
        print(f"[대상: {REGION_NAMES.get(target_region, target_region)}]")
    print("=" * 60)

    data = load_candidates()
    candidates = data.get("candidates", {})
    logger = FactcheckLogger("mayor", dry_run=dry_run)

    # ── ① 선관위 예비후보 API 동기화 (기초단체장) ──
    try:
        from nec_precand_sync import fetch_precandidates, sync_mayor
        print("\n[1단계] 선관위 예비후보(구시군장) 조회...")
        nec_items = fetch_precandidates("4")
        if nec_items:
            nec_fixes = sync_mayor(data, nec_items)
            if nec_fixes:
                print(f"  {len(nec_fixes)}건 동기화:")
                for nf in nec_fixes[:30]:
                    print(f"    • {nf}")
                if len(nec_fixes) > 30:
                    print(f"    ... 외 {len(nec_fixes) - 30}건")
            else:
                print("  변경 없음")
    except ImportError:
        print("\n[NEC] nec_precand_sync 모듈 없음 — 건너뜀")
    except Exception as e:
        print(f"\n[NEC] 오류: {e}")

    # ── ② 뉴스 기반 팩트체크 ──
    print("\n[2단계] 뉴스 기반 팩트체크...")
    regions_to_process = [target_region] if target_region else sorted(candidates.keys())
    total_applied = 0

    for rk in regions_to_process:
        if rk not in candidates:
            print(f"\n[건너뜀] {rk}: 데이터 없음")
            continue
        region_cands = candidates[rk]
        count = sum(len(v) for v in region_cands.values())
        region_name = REGION_NAMES.get(rk, rk)

        # 시도 전체 뉴스 + 시군구별 개별 뉴스 병합
        news = fetch_mayor_news(rk, region_name)
        seen_titles = set(news)
        districts = list(region_cands.keys())
        for dist in districts:
            dist_news = fetch_mayor_news(rk, region_name, district=dist)
            for title in dist_news:
                if title not in seen_titles:
                    seen_titles.add(title)
                    news.append(title)
            time.sleep(0.1)  # API rate limit

        print(f"\n[{region_name}] {count}명 팩트체크 중... (뉴스 {len(news)}건, {len(districts)}개 시군구)")

        prompt = build_prompt_for_region(rk, region_cands, news)
        detected = verified = applied = 0
        error_msg: str | None = None
        try:
            raw = call_claude_json(prompt, llm_key)
            changes = parse_changes(raw)
            detected = len(changes)
            if not changes:
                print(f"  → 변경 없음")
            else:
                print(f"  → {detected}건 감지 (Claude)")
                changes = verify_changes_against_news(changes, news)
                verified = len(changes)
                print(f"  → {verified}건 검증 통과")
                applied = apply_changes(region_cands, changes, rk, dry_run)
                total_applied += applied
        except Exception as e:
            error_msg = f"{type(e).__name__}: {e}"
            print(f"  [오류] {error_msg}")

        logger.region(
            rk,
            candidate_count=count,
            news_count=len(news),
            changes_detected=detected,
            changes_verified=verified,
            applied=applied,
            error=error_msg,
        )

        time.sleep(1)  # rate limit

    if not dry_run:
        data["_meta"]["lastFactCheck"] = datetime.now().isoformat()
        data["_meta"]["lastUpdated"] = date.today().isoformat()
        CANDIDATES_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"\n총 {total_applied}건 적용")
        print(f"[저장] {CANDIDATES_PATH}")

    logger.run_end(total_applied=total_applied)


if __name__ == "__main__":
    main()
