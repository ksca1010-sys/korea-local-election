#!/usr/bin/env python3
"""
선거 개요(election_overview.json) 자동 갱신 스크립트
- 광역단체장 + 교육감 개요 담당 (narrative 모드)
- 기초단체장은 update_mayor_overview.py로 분리됨
"""

import hashlib
import json
import os
import sys
import time
from datetime import datetime, date
from pathlib import Path

from election_overview_utils import (
    BASE_DIR, OVERVIEW_PATH, CANDIDATES_PATH, SUPERINTENDENT_PATH, POLLS_PATH,
    MODEL, API_KEY_ENV, ELECTION_DATE, REGION_NAMES,
    load_env, search_latest_news, get_local_media_info,
    call_llm, parse_response, validate_overview, load_current_overview,
    build_narrative_prompt,
)
from local_media_pool import get_media_text, METRO_MEDIA

# ── 뉴스 해시 기반 스킵을 위한 상태 관리 ──
GOV_STATE_PATH = BASE_DIR / "data" / "governor_overview_state.json"


def _load_gov_state():
    if GOV_STATE_PATH.exists():
        return json.loads(GOV_STATE_PATH.read_text(encoding="utf-8"))
    return {}


def _save_gov_state(state):
    GOV_STATE_PATH.write_text(
        json.dumps(state, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )


def _content_hash(news, candidates=None, polls=None):
    parts = ["NEWS:" + "\n".join(sorted(news))]
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


def fetch_news_for_region(region_name, election_type="governor"):
    """선거 유형별 최신 뉴스 검색"""
    queries = {
        "governor": [
            f"{region_name} 지방선거 시장 도지사 후보",
            f"{region_name} 지방선거 공천 경선",
            f"{region_name} 선거 현안 쟁점",
        ],
        "superintendent": [
            f"{region_name} 교육감 선거 후보",
            f"{region_name} 교육감 출마",
            f"{region_name} 교육 현안",
        ],
    }
    q_list = queries.get(election_type, [f"{region_name} 지방선거"])
    all_news = []
    seen = set()
    for q in q_list:
        for item in search_latest_news(q, display=5):
            if item not in seen:
                seen.add(item)
                all_news.append(item)
    return all_news[:10]


def load_candidates():
    """후보자 데이터 로드"""
    if not CANDIDATES_PATH.exists():
        return {}
    data = json.loads(CANDIDATES_PATH.read_text(encoding="utf-8"))
    return data.get("candidates", {})


def load_polls():
    """여론조사 데이터 로드 — 지역별 최신 3건씩"""
    if not POLLS_PATH.exists():
        return {}
    data = json.loads(POLLS_PATH.read_text(encoding="utf-8"))
    region_polls = {}
    all_polls = data.get("national", []) + data.get("regional", [])
    for poll in all_polls:
        rk = poll.get("regionKey")
        if not rk:
            continue
        if rk not in region_polls:
            region_polls[rk] = []
        region_polls[rk].append({
            "title": poll.get("title", ""),
            "pollOrg": poll.get("pollOrg", ""),
            "clientOrg": poll.get("clientOrg", ""),
            "publishDate": poll.get("publishDate", ""),
            "method": poll.get("method", {}).get("type", ""),
            "sampleSize": poll.get("method", {}).get("sampleSize", 0),
            "results": poll.get("results", []),
        })
    for rk in region_polls:
        region_polls[rk] = sorted(
            region_polls[rk],
            key=lambda p: p.get("publishDate", ""),
            reverse=True
        )[:3]
    return region_polls


def format_candidates_text(candidates, election_type="governor"):
    """후보자 목록을 텍스트로 포맷"""
    party_map = {
        "democratic": "더불어민주당", "ppp": "국민의힘",
        "reform": "조국혁신당", "newReform": "새로운미래",
        "progressive": "진보당", "independent": "무소속"
    }
    lines = []
    for c in candidates:
        if c.get("status") == "WITHDRAWN":
            continue
        if election_type == "superintendent":
            lines.append(f"- {c['name']} (성향:{c.get('stance', '?')}, {c.get('status', '?')}): {c.get('career', '')}")
        else:
            party = party_map.get(c.get("party", ""), c.get("party", ""))
            pledges = ", ".join(c.get("pledges", [])[:3])
            lines.append(f"- {c['name']} ({party}, {c.get('status', '?')}): {c.get('career', '')}" + (f" / 공약: {pledges}" if pledges else ""))
    return "\n".join(lines) if lines else "(후보자 데이터 없음)"


def format_polls_text(polls):
    """여론조사 목록을 텍스트로 포맷"""
    if not polls:
        return "(여론조사 데이터 없음)"
    lines = []
    for p in polls:
        results_str = ""
        if p.get("results"):
            results_str = ", ".join(
                f"{r.get('candidateName', r.get('name', '?'))}({r.get('party', '?')}) {r.get('support', r.get('rate', '?'))}%"
                for r in p["results"][:5]
            )
        lines.append(
            f"- [{p.get('publishDate', '?')}] {p.get('pollOrg', '?')} "
            f"(의뢰: {p.get('clientOrg', '?')}, n={p.get('sampleSize', '?')}) "
            f"{results_str}"
        )
    return "\n".join(lines)


def main():
    load_env()
    api_key = os.environ.get(API_KEY_ENV, "")
    if not api_key:
        print(f"[오류] {API_KEY_ENV} 환경변수가 설정되지 않았습니다.")
        sys.exit(1)

    print("=" * 55)
    print("선거 개요 자동 업데이트 (광역단체장) — narrative 모드")
    print(f"실행 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"모델: {MODEL}")
    print("=" * 55)

    candidates = load_candidates()
    polls = load_polls()
    current = load_current_overview()
    gov_state = _load_gov_state()

    updated_regions = {}
    errors = []
    skipped = 0

    for region_key, region_name in REGION_NAMES.items():
        print(f"\n[{region_key}] {region_name} 처리 중...")

        region_candidates = candidates.get(region_key, [])
        region_polls = polls.get(region_key, [])
        news = fetch_news_for_region(region_name, "governor")
        print(f"  뉴스 {len(news)}건 수집")

        # 콘텐츠 해시 비교 (뉴스+후보+여론조사) — 변화 없으면 LLM 스킵
        nh = _content_hash(news, region_candidates, region_polls)
        state_key = f"governor/{region_key}"
        prev_hash = gov_state.get(state_key, {}).get("contentHash")
        prev = current.get("regions", {}).get(region_key, {})

        if prev_hash == nh and prev.get("headline"):
            print(f"  변화 없음, 기존 유지")
            updated_regions[region_key] = prev
            skipped += 1
            continue

        cand_text = format_candidates_text(region_candidates, "governor")
        poll_text = format_polls_text(region_polls)
        news_text = chr(10).join(news) if news else "(뉴스 검색 결과 없음)"

        prev_text = prev.get("narrative") or prev.get("summary", "(없음)")

        prompt = build_narrative_prompt(
            region_name=region_name,
            election_type_label="시도지사",
            candidates_text=cand_text,
            polls_text=poll_text,
            news_text=news_text,
            prev_overview_text=prev_text,
            media_text=get_media_text(region_name),
        )

        try:
            raw = call_llm(prompt, api_key, max_tokens=1500,
                          suffix="\n\nJSON만 출력하세요. 다른 텍스트 없이.")
            obj = parse_response(raw)

            if not obj or not validate_overview(obj):
                print(f"  [경고] 유효하지 않은 응답, 기존 데이터 유지")
                if prev:
                    updated_regions[region_key] = prev
                errors.append(region_key)
                continue

            updated_regions[region_key] = obj
            gov_state[state_key] = {
                "contentHash": nh,
                "lastUpdated": datetime.now().isoformat(),
            }
            print(f"  -> {obj['headline']}")

        except Exception as e:
            print(f"  [오류] {e}")
            if prev:
                updated_regions[region_key] = prev
            errors.append(region_key)

        time.sleep(1)

    # 결과 저장 — 기존 mayor/superintendent 섹션 보존
    current["meta"] = {
        "lastUpdated": date.today().isoformat(),
        "electionDate": "2026-06-03",
        "note": "중립적 관점의 선거 쟁점 개요. 특정 정당·후보 지지 없음.",
        "generatedBy": f"Claude ({MODEL})"
    }
    current["regions"] = updated_regions

    OVERVIEW_PATH.write_text(
        json.dumps(current, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )
    _save_gov_state(gov_state)

    print("\n" + "=" * 55)
    print(f"완료! {len(updated_regions)}개 지역 (LLM {len(updated_regions) - skipped}회, 스킵 {skipped}회)")
    if errors:
        print(f"오류 발생 지역 ({len(errors)}): {', '.join(errors)}")
    print(f"저장: {OVERVIEW_PATH}")
    print("=" * 55)


def update_superintendent_overview(api_key, current):
    """교육감 개요 업데이트 — narrative 모드"""
    print("\n" + "=" * 55)
    print("교육감 개요 업데이트 — narrative 모드")
    print("=" * 55)

    supt_data = {}
    if SUPERINTENDENT_PATH.exists():
        supt_data = json.loads(SUPERINTENDENT_PATH.read_text(encoding="utf-8")).get("candidates", {})

    gov_state = _load_gov_state()
    updated = {}
    skipped = 0

    for rk, rn in REGION_NAMES.items():
        candidates = supt_data.get(rk, [])
        news = fetch_news_for_region(rn, "superintendent")
        print(f"\n[{rk}] {rn} 교육감... (뉴스 {len(news)}건)")

        # 콘텐츠 해시 비교 (뉴스+후보)
        nh = _content_hash(news, candidates)
        state_key = f"superintendent/{rk}"
        prev_hash = gov_state.get(state_key, {}).get("contentHash")
        prev = current.get("superintendent", {}).get(rk, {})

        if prev_hash == nh and prev.get("headline"):
            print(f"  변화 없음, 기존 유지")
            updated[rk] = prev
            skipped += 1
            continue

        cand_text = format_candidates_text(candidates, "superintendent")
        news_text = chr(10).join(news) if news else "(뉴스 검색 결과 없음)"

        prev_text = prev.get("narrative") or prev.get("summary", "(없음)")

        extra = """## 교육감 선거 특수 원칙
- 정당 공천 없음. 진보/보수/중도 성향으로만 분류.
- 학부모가 관심 가질 구체적 교육 현안(학교 안전, 교육과정, 학교 폐교, 급식 등)을 반드시 포함.
- "진보 vs 보수" 같은 단순 구도 금지. 구체적 교육 정책 차이를 서술."""

        prompt = build_narrative_prompt(
            region_name=rn,
            election_type_label="교육감",
            candidates_text=cand_text,
            polls_text="(교육감 여론조사 별도 수집 안 됨)",
            news_text=news_text,
            prev_overview_text=prev_text,
            media_text=get_media_text(rn),
            extra_context=extra,
        )

        try:
            raw = call_llm(prompt, api_key, max_tokens=1500,
                          suffix="\n\nJSON만 출력하세요. 다른 텍스트 없이.")
            obj = parse_response(raw)
            if obj and validate_overview(obj):
                updated[rk] = obj
                gov_state[state_key] = {
                    "contentHash": nh,
                    "lastUpdated": datetime.now().isoformat(),
                }
                print(f"  -> {obj['headline']}")
            else:
                if prev:
                    updated[rk] = prev
                print(f"  [경고] 유효하지 않은 응답")
        except Exception as e:
            print(f"  [오류] {e}")
            if prev:
                updated[rk] = prev
        time.sleep(1)

    _save_gov_state(gov_state)
    print(f"\n교육감: LLM {len(updated) - skipped}회, 스킵 {skipped}회")
    return updated


def main_extended():
    """교육감 개요 업데이트"""
    load_env()
    api_key = os.environ.get(API_KEY_ENV, "")
    if not api_key:
        print(f"[오류] {API_KEY_ENV} 미설정")
        sys.exit(1)

    current = load_current_overview()
    target_type = None
    for arg in sys.argv[1:]:
        if arg.startswith("--type="):
            target_type = arg.split("=")[1]

    if target_type == "superintendent" or target_type == "all":
        supt = update_superintendent_overview(api_key, current)
        current["superintendent"] = supt

    if target_type in ("superintendent", "all"):
        current["meta"]["lastUpdated"] = date.today().isoformat()
        OVERVIEW_PATH.write_text(
            json.dumps(current, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )
        print(f"\n[저장] {OVERVIEW_PATH}")


if __name__ == "__main__":
    if any(arg.startswith("--type=") for arg in sys.argv):
        main_extended()
    else:
        main()
