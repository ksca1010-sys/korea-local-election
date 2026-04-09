#!/usr/bin/env python3
"""
기초단체장(시장·구청장·군수) 개요 독립 스크립트
- 226개 시군구 대상, 지역언론 강화 뉴스 수집
- 증분 업데이트, 품질 검증, 중간 저장
"""

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, date
from pathlib import Path

from election_overview_utils import (
    BASE_DIR, OVERVIEW_PATH, MAYOR_CANDIDATES_PATH, POLLS_PATH,
    MODEL, API_KEY_ENV, ELECTION_DATE, REGION_NAMES,
    load_env, search_latest_news, get_local_media_info_merged,
    call_llm, parse_response, validate_overview, load_current_overview,
    build_narrative_prompt, extract_facts,
)
from local_media_pool import get_media_text, get_media_list, get_media_pool

STATE_PATH = BASE_DIR / "data" / "mayor_overview_state.json"

# ── 품질 검증용 블랙리스트 ──
# 정확 일치
GENERIC_ISSUES = {
    "교통", "복지", "경제 활성화", "일자리", "주차", "환경", "안전",
    "교육", "문화", "의료", "주거", "고령화", "인구감소",
}
# 부분 일치 — 이 패턴이 keyIssue 전체와 거의 같으면 generic 판정
GENERIC_PATTERNS = [
    "주차난 해소", "도로·교통 개선", "도로·교통 정책", "도로·교통 인프라",
    "지역 경제 활성화", "지역경제 활성화", "경제 활성화",
    "재개발·정비사업 추진", "주민 생활 편의", "생활 인프라 개선",
    "주민 복지 확대", "지역 발전 전략", "복지·일자리",
    "일자리 창출", "일자리·경제", "일자리·지역경제",
    "도시 재개발 사업", "도심 활성화 방안",
]


# ═══════════════════════════════════════════
# 3a. 강화된 뉴스 수집
# ═══════════════════════════════════════════

def fetch_news_v2(region_name, district, region_key):
    """3단계 강화 뉴스 수집 (지역당 최대 12 API 호출)"""
    title = "구청장" if district.endswith("구") else ("군수" if district.endswith("군") else "시장")
    media = get_local_media_info_merged(region_key, district)
    all_news = []
    seen = set()

    # 동일 이름 다른 지역 구분용 (예: 대전 동구 vs 대구 동구)
    short_region = region_name.replace("특별시","").replace("광역시","").replace("특별자치도","").replace("특별자치시","").replace("도","")

    # 동명이구 목록 (여러 시도에 같은 이름이 존재하는 구)
    AMBIGUOUS_DISTRICTS = {"동구","서구","중구","남구","북구"}

    def _is_relevant(item):
        """해당 시군구와 관련 있는 뉴스인지 필터"""
        if district not in item:
            return False
        # 동명이구가 아니면 district만 포함되면 OK
        if district not in AMBIGUOUS_DISTRICTS:
            return True
        # 동명이구: 우리 시도명이 있으면 OK
        if short_region in item:
            return True
        # 다른 시도명 + district 조합이 있으면 제외
        other_regions = ["서울","부산","대구","인천","광주","대전","울산",
                         "경기","강원","충북","충남","전북","전남","경북","경남","제주"]
        for other in other_regions:
            if other != short_region and other in item:
                return False
        # 아무 시도명도 없으면 허용 (로컬 뉴스일 가능성)
        return True

    def _add(items, tag=None):
        for item in items:
            if item not in seen:
                seen.add(item)
                if _is_relevant(item):
                    if tag:
                        all_news.append(f"[{tag}] {item}")
                    else:
                        all_news.append(item)

    # 단계 1: 기본 선거 쿼리 (4 호출) — 시도명 포함으로 정밀화
    base_queries = [
        f'"{short_region}" "{district}" {title} 선거',
        f'"{short_region}" "{district}" {title} 공천 출마',
        f'"{district}" 현안 쟁점 사업',
        f'"{district}" {title} 공약 정책',
    ]
    for q in base_queries:
        _add(search_latest_news(q, display=5))

    # 단계 2: 언론사명 쿼리 — local_media_pool (자체+광역) + registry 병합
    pool_names = get_media_list(district)[:5]
    registry_names = media.get("names", [])[:3]
    all_outlet_names = list(dict.fromkeys(pool_names + registry_names))[:6]
    for name in all_outlet_names:
        _add(search_latest_news(f"{name} {district} {title}", display=3), tag=f"지역·{name}")

    # 단계 3: site: 도메인 검색 (최대 5 호출)
    hosts = media.get("hosts", [])[:5]
    for host in hosts:
        _add(search_latest_news(f"site:{host} {district}", display=3), tag=f"지역·{host}")

    # 단계 4: 뉴스가 너무 적으면 (4건 미만) 보충 검색
    if len(all_news) < 4:
        supplement_queries = [
            f"{short_region} {district} 현안",
            f"{short_region} {district} 개발 사업",
            f"{short_region} {district} 주민",
        ]
        for q in supplement_queries:
            _add(search_latest_news(q, display=5))
            if len(all_news) >= 8:
                break

    return all_news[:15]


def compute_content_hash(news_items, candidates=None, polls=None):
    """뉴스+후보+여론조사 통합 MD5 해시"""
    parts = ["NEWS:" + "\n".join(sorted(news_items))]
    if candidates:
        cand_keys = sorted(
            f"{c.get('name','')}|{c.get('party','')}|{c.get('status','')}"
            for c in candidates if c.get("status") != "WITHDRAWN"
        )
        parts.append("CAND:" + "\n".join(cand_keys))
    if polls:
        poll_keys = sorted(
            f"{p.get('publishDate','')}|{p.get('pollOrg','')}"
            for p in polls
        )
        parts.append("POLL:" + "\n".join(poll_keys))
    return hashlib.md5("\n\n".join(parts).encode()).hexdigest()


# ═══════════════════════════════════════════
# 3b. 강화된 프롬프트
# ═══════════════════════════════════════════

def build_prompt_v2(region_key, region_name, district, candidates, current_overview,
                    news=None, polls=None, prev_updated=None):
    """기초단체장 프롬프트 — build_narrative_prompt 기반"""
    title = "구청장" if district.endswith("구") else ("군수" if district.endswith("군") else "시장")

    # 후보자 텍스트
    party_map = {"democratic": "민주당", "ppp": "국민의힘", "independent": "무소속", "reform": "조국혁신당"}
    cand_lines = []
    for c in candidates:
        if c.get("status") == "WITHDRAWN":
            continue
        if not c.get("name"):
            continue
        party = party_map.get(c.get("party", ""), c.get("party", ""))
        pledges = ", ".join(c.get("pledges", [])[:3])
        career = c.get("career", "")
        cand_lines.append(f"- {c['name']} ({party}, {c.get('status', '?')}): {career}" + (f" / 공약: {pledges}" if pledges else ""))
    cand_text = "\n".join(cand_lines) if cand_lines else "(후보자 데이터 없음)"

    # 여론조사 텍스트
    poll_text = "(여론조사 데이터 없음)"
    if polls:
        poll_lines = []
        for p in polls:
            results_str = ", ".join(
                f"{r.get('name', r.get('candidateName','?'))}({r.get('party', '?')}) {r.get('rate', r.get('support','?'))}%"
                for r in (p.get("results") or [])[:5]
            )
            poll_lines.append(f"- [{p.get('publishDate', '?')}] {p.get('pollOrg', '?')} (n={p.get('sampleSize', '?')}) {results_str}")
        poll_text = "\n".join(poll_lines)

    # 이전 개요
    prev = current_overview.get("mayor", {}).get(region_key, {}).get(district, {})
    prev_text = prev.get("narrative") or prev.get("summary", "(없음)")

    # 미디어 — local_media_pool 우선, fallback으로 기존 registry
    media_text = get_media_text(district)
    if "(정보 없음)" in media_text:
        media = get_local_media_info_merged(region_key, district)
        media_names = media.get("names", [])
        media_text = f"지역 주요 언론: {', '.join(media_names)}" if media_names else ""

    news_text = chr(10).join(news) if news else "(뉴스 검색 결과 없음)"

    extra = f"""## 기초단체장 특수 원칙
- {title} 선거만 다룰 것. {region_name} 도지사/시장/교육감 선거 내용 절대 혼입 금지.
- 뉴스에 다른 지역(동명이구 등) 내용이 섞여 있으면 무시할 것.
- [지역·...] 태그 뉴스는 지역언론 기사. 우선 반영."""

    return build_narrative_prompt(
        region_name=region_name,
        election_type_label=title,
        district=district,
        candidates_text=cand_text,
        polls_text=poll_text,
        news_text=news_text,
        prev_overview_text=prev_text,
        media_text=media_text,
        extra_context=extra,
    )


# ═══════════════════════════════════════════
# 3c. 품질 검증
# ═══════════════════════════════════════════

def validate_quality(obj, news_provided=False):
    """
    품질 검증. 반환: (pass: bool, reason: str, severity: 'retry'|'warn')
    """
    headline = obj.get("headline", "")
    summary = obj.get("summary", "")
    issues = obj.get("keyIssues", [])

    # 반복 이슈: 정확 일치 + 패턴 매칭
    def _is_generic(iss):
        s = iss.strip()
        if s in GENERIC_ISSUES:
            return True
        for pat in GENERIC_PATTERNS:
            if s == pat or (len(s) <= len(pat) + 4 and pat in s):
                return True
        return False

    generic_count = sum(1 for iss in issues if _is_generic(iss))
    if generic_count >= 2:
        return False, f"keyIssues {generic_count}개가 generic ({issues})", "retry"

    # 광역 혼입: headline/summary에 "도지사" 포함
    for text in [headline, summary]:
        if "도지사" in text:
            return False, f"광역 혼입 감지: '도지사' in '{text[:40]}'", "retry"

    # 길이 경고
    if len(headline) > 30:
        return True, f"headline {len(headline)}자 (>30)", "warn"

    if len(summary) < 40:
        return True, f"summary {len(summary)}자 (<40)", "warn"

    # 뉴스 근거: 뉴스 제공했는데 headline에 고유명사 0개 (간이 체크)
    if news_provided and headline:
        # headline에서 district명 제외하고 한글 고유명사 있는지
        # 간이 체크: headline에 '-' 뒤에 2글자 이상 단어가 있는지
        after_dash = headline.split("—")[-1] if "—" in headline else headline
        words = [w for w in after_dash.split() if len(w) >= 2]
        if len(words) < 2:
            return True, "headline에 구체적 내용 부족", "warn"

    return True, "", ""


# ═══════════════════════════════════════════
# 3d. 증분 업데이트 상태 관리
# ═══════════════════════════════════════════

def load_state():
    """상태 파일 로드"""
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {}


def save_state(state):
    """상태 파일 저장"""
    STATE_PATH.write_text(
        json.dumps(state, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )


def is_stale(state, region_key, district, stale_days=2):
    """지역이 stale(갱신 필요)인지 확인"""
    key = f"{region_key}/{district}"
    entry = state.get(key)
    if not entry:
        return True
    last = entry.get("lastUpdated")
    if not last:
        return True
    try:
        last_date = datetime.fromisoformat(last).date()
        return (date.today() - last_date).days >= stale_days
    except (ValueError, TypeError):
        return True


# ═══════════════════════════════════════════
# 여론조사 로드
# ═══════════════════════════════════════════

def load_district_polls():
    """여론조사 데이터 로드 — 시군구별 mayor 최신 3건

    polls.json 구조:
      - regions: {regionKey: [poll, ...]}
      - poll.municipality: 시군구 이름 (예: "천안시")
      - poll.electionType: "mayor" 인 것만 사용
    """
    if not POLLS_PATH.exists():
        return {}
    data = json.loads(POLLS_PATH.read_text(encoding="utf-8"))
    district_polls = {}

    for rk, polls in data.get("regions", {}).items():
        for poll in polls:
            if poll.get("electionType") != "mayor":
                continue
            dk = poll.get("municipality") or poll.get("districtKey") or poll.get("district")
            if not dk:
                continue
            key = f"{rk}/{dk}"
            if key not in district_polls:
                district_polls[key] = []
            district_polls[key].append({
                "title": poll.get("title", ""),
                "pollOrg": poll.get("pollOrg", ""),
                "publishDate": poll.get("publishDate", ""),
                "sampleSize": (poll.get("method") or {}).get("sampleSize", 0),
                "results": poll.get("results", []),
            })

    for key in district_polls:
        district_polls[key] = sorted(
            district_polls[key],
            key=lambda p: p.get("publishDate", ""),
            reverse=True
        )[:3]
    return district_polls


# ═══════════════════════════════════════════
# 메인 로직
# ═══════════════════════════════════════════

def process_district(region_key, region_name, district, candidates, current,
                     api_key, polls=None, prev_updated=None, dry_run=False):
    """단일 시군구 처리. 반환: (result_obj | None, content_hash)"""
    news = fetch_news_v2(region_name, district, region_key)
    content_hash = compute_content_hash(news, candidates, polls)
    print(f"  {district} (뉴스 {len(news)}건)...", end="", flush=True)

    if dry_run:
        print(f" [dry-run] hash={content_hash[:8]}")
        return None, content_hash

    prompt = build_prompt_v2(
        region_key, region_name, district, candidates, current,
        news=news, polls=polls, prev_updated=prev_updated
    )

    max_attempts = 2
    for attempt in range(max_attempts):
        try:
            raw = call_llm(prompt, api_key, max_tokens=1500,
                          suffix="\n\nJSON만 출력하세요. 다른 텍스트 없이.")
            obj = parse_response(raw)
            if not obj or not obj.get("headline"):
                print(" [경고] 파싱 실패")
                return None, content_hash

            # narrative 모드에서는 validate_overview 사용
            if not validate_overview(obj):
                print(" [경고] 필수 필드 누락")
                return None, content_hash

            passed, reason, severity = validate_quality(obj, news_provided=bool(news))

            if not passed and severity == "retry" and attempt < max_attempts - 1:
                print(f" [재시도:{reason}]", end="", flush=True)
                # 프롬프트에 경고 추가하여 재시도
                prompt += f"\n\n## ⚠️ 이전 시도 문제: {reason}\n위 문제를 반드시 수정하세요."
                time.sleep(0.5)
                continue

            if reason and severity == "warn":
                print(f" [경고:{reason}]", end="")

            if not passed:
                print(f" [품질실패:{reason}]")
                # 실패해도 결과는 반환 (기존 데이터보다 나을 수 있음)
                return obj, content_hash

            print(f" {obj['headline'][:20]}")
            return obj, content_hash

        except Exception as e:
            print(f" [오류] {e}")
            return None, content_hash

    return None, content_hash


def main():
    parser = argparse.ArgumentParser(description="기초단체장 개요 업데이트")
    parser.add_argument("--region", type=str, nargs="+", help="특정 시도만 처리 (예: gyeonggi gyeongnam)")
    parser.add_argument("--district", type=str, help="단일 시군구만 처리 (예: 강남구)")
    parser.add_argument("--stale-only", action="store_true", help="2일 이상 미갱신 지역만")
    parser.add_argument("--dry-run", action="store_true", help="뉴스 수집만, LLM 미호출")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get(API_KEY_ENV, "")
    if not api_key and not args.dry_run:
        print(f"[오류] {API_KEY_ENV} 미설정")
        sys.exit(1)

    print("=" * 55)
    print("기초단체장 개요 업데이트 v2")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"모델: {MODEL}")
    if args.stale_only:
        print("모드: stale-only (2일+ 미갱신)")
    if args.dry_run:
        print("모드: dry-run (뉴스 수집만)")
    if args.region:
        print(f"대상: {args.region}")
    if args.district:
        print(f"대상: {args.district}")
    print("=" * 55)

    # 데이터 로드
    mayor_data = {}
    if MAYOR_CANDIDATES_PATH.exists():
        mayor_data = json.loads(MAYOR_CANDIDATES_PATH.read_text(encoding="utf-8")).get("candidates", {})

    current = load_current_overview()
    state = load_state()
    district_polls = load_district_polls()

    # 대상 시도 결정
    if args.region:
        target_regions = args.region if isinstance(args.region, list) else [args.region]
    else:
        target_regions = sorted(mayor_data.keys())

    updated_mayor = current.get("mayor", {})
    total_processed = 0
    total_updated = 0
    total_skipped = 0

    for rk in target_regions:
        if rk not in mayor_data:
            print(f"\n[{rk}] 후보자 데이터 없음, 건너뜀")
            continue

        rn = REGION_NAMES.get(rk, rk)
        districts = mayor_data[rk]

        # --district 필터
        if args.district:
            if args.district not in districts:
                continue
            districts = {args.district: districts[args.district]}

        print(f"\n[{rk}] {rn} ({len(districts)}개 시군구)")

        if rk not in updated_mayor:
            updated_mayor[rk] = {}

        for district, candidates in sorted(districts.items()):
            state_key = f"{rk}/{district}"

            # --stale-only 체크
            if args.stale_only and not is_stale(state, rk, district):
                total_skipped += 1
                continue

            # 뉴스 해시 비교
            prev_entry = state.get(state_key, {})
            prev_updated = prev_entry.get("lastUpdated")

            # 여론조사
            polls = district_polls.get(state_key, [])

            obj, content_hash = process_district(
                rk, rn, district, candidates, current,
                api_key, polls=polls, prev_updated=prev_updated,
                dry_run=args.dry_run
            )

            total_processed += 1

            if args.dry_run:
                continue

            # 뉴스 해시 동일하면 LLM 결과가 None이어도 스킵
            if obj is None and prev_entry.get("contentHash") == content_hash:
                print(f"  {district} — 뉴스 변화 없음, 기존 유지")
                total_skipped += 1
                continue

            if obj:
                obj["facts"] = extract_facts(candidates, polls, "district_mayor")
                updated_mayor[rk][district] = obj
                state[state_key] = {
                    "lastUpdated": datetime.now().isoformat(),
                    "contentHash": content_hash,
                }
                total_updated += 1

            time.sleep(0.5)

        # 시도 완료 시 중간 저장 (크래시 복구)
        if not args.dry_run and total_updated > 0:
            current["mayor"] = updated_mayor
            current["meta"]["lastUpdated"] = date.today().isoformat()
            OVERVIEW_PATH.write_text(
                json.dumps(current, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8"
            )
            save_state(state)
            print(f"  [중간저장] {rn} 완료")

    # 최종 저장
    if not args.dry_run and total_updated > 0:
        current["mayor"] = updated_mayor
        current["meta"]["lastUpdated"] = date.today().isoformat()
        OVERVIEW_PATH.write_text(
            json.dumps(current, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )
        save_state(state)

    print("\n" + "=" * 55)
    print(f"완료: 처리 {total_processed}, 갱신 {total_updated}, 스킵 {total_skipped}")
    if not args.dry_run:
        print(f"저장: {OVERVIEW_PATH}")
    print("=" * 55)


if __name__ == "__main__":
    main()
