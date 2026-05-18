#!/usr/bin/env python3
"""
공식/구조화 데이터 기반 election_overview.json 갱신 스크립트.

Naver News API나 외부 LLM 없이 현재 저장소의 검증된 JSON만 사용한다.
AI narrative 생성기가 실패하거나 비용 문제로 비활성화되어도 후보 확정,
등록 여론조사, 직전 선거 결과 기반 개요는 최신 상태로 유지하는 안전망이다.
"""

import argparse
import json
import re
from copy import deepcopy
from datetime import date
from pathlib import Path

from election_overview_utils import (
    BASE_DIR,
    CANDIDATES_PATH,
    ELECTION_DATE,
    MAYOR_CANDIDATES_PATH,
    OVERVIEW_PATH,
    POLLS_PATH,
    REGION_NAMES,
    SUPERINTENDENT_PATH,
    extract_facts,
)

REGIONS_PATH = BASE_DIR / "data" / "static" / "regions.json"
SUB_REGIONS_PATH = BASE_DIR / "data" / "static" / "sub_regions.json"
SUPERINTENDENT_HISTORY_PATH = BASE_DIR / "data" / "static" / "superintendent_history.json"
BYELECTION_PATH = BASE_DIR / "data" / "candidates" / "byelection.json"
POLL_DISPLAY_START_DATE = "2026-05-18"

PARTY_MAP = {
    "democratic": "더불어민주당",
    "ppp": "국민의힘",
    "reform": "조국혁신당",
    "newReform": "개혁신당",
    "newFuture": "새로운미래",
    "progressive": "진보당",
    "justice": "정의당",
    "independent": "무소속",
    "other": "기타",
}

REGION_SHORT = {
    "seoul": "서울",
    "busan": "부산",
    "daegu": "대구",
    "incheon": "인천",
    "gwangju": "광주",
    "daejeon": "대전",
    "ulsan": "울산",
    "sejong": "세종",
    "gyeonggi": "경기",
    "gangwon": "강원",
    "chungbuk": "충북",
    "chungnam": "충남",
    "jeonbuk": "전북",
    "jeonnam": "전남",
    "gyeongbuk": "경북",
    "gyeongnam": "경남",
    "jeju": "제주",
}


def load_json(path, default):
    if not path.exists():
        return deepcopy(default)
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def active_candidates(candidates):
    return [
        c for c in (candidates or [])
        if c.get("name") and c.get("status") != "WITHDRAWN"
    ]


def party_label(candidate):
    return (
        candidate.get("partyName")
        or PARTY_MAP.get(candidate.get("party") or candidate.get("partyKey"), "")
        or candidate.get("party")
        or candidate.get("partyKey")
        or ""
    )


def candidate_names(candidates, limit=4, superintendent=False):
    names = []
    for candidate in active_candidates(candidates)[:limit]:
        if superintendent:
            stance = candidate.get("stance")
            names.append(f"{candidate['name']}({stance})" if stance else candidate["name"])
        else:
            party = party_label(candidate)
            names.append(f"{candidate['name']}({party})" if party else candidate["name"])
    remaining = max(0, len(active_candidates(candidates)) - limit)
    if remaining:
        names.append(f"외 {remaining}명")
    return ", ".join(names) if names else "등록 후보 없음"


def normalize_text(value):
    return re.sub(r"\s+", "", value or "").replace("선거구", "")


def sort_polls(polls):
    return sorted(
        polls or [],
        key=lambda poll: poll.get("publishDate", ""),
        reverse=True,
    )


def normalize_poll(poll):
    method = poll.get("method") or {}
    return {
        "title": poll.get("title", ""),
        "pollOrg": poll.get("pollOrg", ""),
        "clientOrg": poll.get("clientOrg", ""),
        "publishDate": poll.get("publishDate", ""),
        "sampleSize": poll.get("sampleSize") or method.get("sampleSize"),
        "method": method,
        "results": poll.get("results", []),
        "municipality": poll.get("municipality") or poll.get("districtKey") or poll.get("district") or "",
        "electionType": poll.get("electionType", ""),
    }


def is_display_poll(poll):
    return (poll.get("publishDate") or "")[:10] >= POLL_DISPLAY_START_DATE


def load_poll_index():
    data = load_json(POLLS_PATH, {})
    index = {
        "governor": {},
        "superintendent": {},
        "mayor": {},
        "byelection_raw": {},
    }

    for region_key, polls in data.get("regions", {}).items():
        for raw in polls:
            if not is_display_poll(raw):
                continue
            election_type = raw.get("electionType") or ""
            poll = normalize_poll(raw)
            if election_type == "governor":
                index["governor"].setdefault(region_key, []).append(poll)
            elif election_type == "superintendent":
                index["superintendent"].setdefault(region_key, []).append(poll)
            elif election_type == "mayor":
                district = poll.get("municipality")
                if district:
                    index["mayor"].setdefault(f"{region_key}/{district}", []).append(poll)
            elif election_type in {"byelection", "byElection"}:
                index["byelection_raw"].setdefault(region_key, []).append(poll)

    for section in ("governor", "superintendent", "mayor", "byelection_raw"):
        for key, polls in index[section].items():
            index[section][key] = sort_polls(polls)

    return index


def find_byelection_polls(district, poll_index):
    region_key = district.get("region")
    raw_polls = poll_index["byelection_raw"].get(region_key, [])
    if not raw_polls:
        return []

    district_norm = normalize_text(district.get("district", ""))
    short = REGION_SHORT.get(region_key, "")
    local_norm = district_norm
    if short and local_norm.startswith(short):
        local_norm = local_norm[len(short):]

    matched = []
    for poll in raw_polls:
        muni = normalize_text(poll.get("municipality", ""))
        title = normalize_text(poll.get("title", ""))
        if not local_norm:
            continue
        if muni == local_norm or local_norm in muni or muni in local_norm or local_norm in title:
            matched.append(poll)
    return sort_polls(matched)


def dedupe(items, limit=4):
    result = []
    seen = set()
    for item in items:
        if not item:
            continue
        text = str(item).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
        if len(result) >= limit:
            break
    return result


def format_prev(prev, election_label="직전 선거"):
    def subject_marker(label):
        if not label:
            return "는"
        code = ord(label[-1])
        if 0xAC00 <= code <= 0xD7A3:
            return "은" if (code - 0xAC00) % 28 else "는"
        return "는"

    if not prev:
        return f"{election_label} 결과는 공식 데이터 검증 후 표시합니다."
    marker = subject_marker(election_label)
    winner = prev.get("winnerName")
    rate = prev.get("rate")
    runner = prev.get("runnerName")
    runner_rate = prev.get("runnerRate")
    if winner and rate is not None and runner and runner_rate is not None:
        return f"{election_label}{marker} {winner} {rate}% 대 {runner} {runner_rate}%였습니다."
    if winner and rate is not None:
        return f"{election_label}{marker} {winner} 후보가 {rate}%로 당선됐습니다."
    if winner:
        return f"{election_label} 당선자는 {winner}입니다."
    return f"{election_label} 결과는 공식 데이터 검증 후 표시합니다."


def poll_sentence(polls):
    if not polls:
        return "등록 여론조사는 없습니다."
    latest = polls[0]
    org = latest.get("pollOrg") or "조사기관 미상"
    published = latest.get("publishDate") or "공표일 미상"
    return f"최신 등록 여론조사는 {published} {org} 조사입니다."


def base_facts(candidates, polls, election_type):
    facts = extract_facts(candidates, polls, election_type)
    for entry, candidate in zip(facts.get("topCandidates", []), active_candidates(candidates)):
        if election_type != "superintendent":
            entry["party"] = party_label(candidate)
    facts["dataSource"] = "data/candidates/*.json + data/polls/polls.json + data/static/*.json"
    return facts


def build_governor_overview(region_key, candidates, polls, region_static, merged_target=None):
    region_name = REGION_NAMES.get(region_key, region_key)
    active = active_candidates(candidates)
    if merged_target and not active:
        target_name = REGION_NAMES.get(merged_target, merged_target)
        summary = (
            f"{region_name} 후보 데이터는 병합 메타에 따라 {target_name} 항목과 함께 관리됩니다. "
            "별도 후보자 수는 0명으로 저장되어 있으며, 화면의 후보 탭은 후보자 JSON을 기준으로 표시합니다."
        )
        risk = "병합 관리 지역은 후보자 수 해석 시 병합 대상 항목을 함께 확인해야 합니다."
    else:
        summary = (
            f"선관위 후보자 정보 기준으로 {region_name} 광역단체장 선거에는 후보 {len(active)}명이 등록되어 있습니다. "
            f"주요 후보는 {candidate_names(active)}입니다. {poll_sentence(polls)} "
            f"{format_prev((region_static or {}).get('prevElection'))}"
        )
        risk = (
            "후보 등록 이후에는 기호순·공식 후보 기준으로 표시하며, 여론조사는 여심위 등록 조사만 반영합니다."
            if polls else
            "등록 여론조사가 없는 지역은 후보 등록 현황과 직전 선거 결과 중심으로만 해석해야 합니다."
        )
    issues = dedupe(
        (region_static or {}).get("keyIssues", [])
        + ["공식 후보 등록 현황", "등록 여론조사 여부", "직전 선거 결과 비교"],
        limit=4,
    )
    return {
        "regionName": region_name,
        "generatedBy": "structured_data",
        "trend": "공식 후보 등록",
        "headline": f"{region_name} 광역단체장 선거: 공식 후보 {len(active)}명 등록",
        "summary": summary,
        "keyIssues": issues,
        "riskFactor": risk,
        "facts": base_facts(active, polls, "governor"),
    }


def build_superintendent_overview(region_key, candidates, polls, history, merged_target=None):
    region_name = REGION_NAMES.get(region_key, region_key)
    active = active_candidates(candidates)
    last_history = history[-1] if history else None
    if merged_target and not active:
        target_name = REGION_NAMES.get(merged_target, merged_target)
        summary = (
            f"{region_name} 교육감 후보 데이터는 병합 메타에 따라 {target_name} 항목과 함께 관리됩니다. "
            "별도 후보자 수는 0명으로 저장되어 있습니다."
        )
        risk = "병합 관리 지역은 교육감 후보자 수 해석 시 병합 대상 항목을 함께 확인해야 합니다."
    else:
        summary = (
            f"선관위 후보자 정보 기준으로 {region_name} 교육감 선거에는 후보 {len(active)}명이 등록되어 있습니다. "
            f"등록 후보는 {candidate_names(active, superintendent=True)}입니다. {poll_sentence(polls)} "
            f"{format_prev(last_history)} 교육감 선거는 정당 추천 없이 치러집니다."
        )
        risk = (
            "교육감 선거는 정당 공천이 없으므로 후보 성향·교육정책·단일화 여부를 별도로 확인해야 합니다."
            if active else
            "공식 후보 데이터가 비어 있는 지역은 후보자 동기화 상태를 우선 확인해야 합니다."
        )
    issues = dedupe([
        "공식 후보 등록 현황",
        "교육 정책·학교 현안",
        "등록 여론조사 여부",
        "직전 교육감 선거 결과 비교",
    ])
    return {
        "regionName": region_name,
        "generatedBy": "structured_data",
        "trend": "공식 후보 등록",
        "headline": f"{region_name} 교육감 선거: 공식 후보 {len(active)}명 등록",
        "summary": summary,
        "keyIssues": issues,
        "riskFactor": risk,
        "facts": {
            **base_facts(active, polls, "superintendent"),
            "previousElection": last_history,
        },
    }


def district_title(district):
    if district.endswith("구"):
        return "구청장"
    if district.endswith("군"):
        return "군수"
    return "시장"


def build_mayor_overview(region_key, district, candidates, polls, sub_region):
    region_name = REGION_NAMES.get(region_key, region_key)
    full_name = f"{region_name} {district}"
    active = active_candidates(candidates)
    title = district_title(district)
    current_mayor = (sub_region or {}).get("mayor") or {}
    mayor_name = current_mayor.get("name")
    key_issue = (sub_region or {}).get("keyIssue")
    prev_turnout = ((sub_region or {}).get("prevElection") or {}).get("turnout")

    context = []
    if mayor_name:
        context.append(f"현 단체장은 {mayor_name}입니다.")
    if key_issue and key_issue != "지역 현안":
        context.append(f"지역 현안 키워드는 {key_issue}입니다.")
    if prev_turnout is not None:
        context.append(f"직전 선거 투표율은 {prev_turnout}%였습니다.")
    context_text = " ".join(context) if context else "지역 기본 정보는 후보자·여론조사 데이터와 함께 표시합니다."

    summary = (
        f"선관위 후보자 정보 기준으로 {full_name} {title} 선거에는 후보 {len(active)}명이 등록되어 있습니다. "
        f"주요 후보는 {candidate_names(active)}입니다. {poll_sentence(polls)} {context_text}"
    )
    issues = dedupe([
        key_issue if key_issue != "지역 현안" else None,
        "공식 후보 등록 현황",
        "등록 여론조사 여부",
        "기초행정 연속성",
    ])
    return {
        "regionName": full_name,
        "generatedBy": "structured_data",
        "trend": "공식 후보 등록",
        "headline": f"{full_name} {title} 선거: 공식 후보 {len(active)}명 등록",
        "summary": summary,
        "keyIssues": issues,
        "riskFactor": (
            "기초단체장 여론조사는 지역별 등록 여부와 표본 규모 차이가 커서 후보 등록 현황과 함께 해석해야 합니다."
            if polls else
            "등록 여론조사가 없는 시군구는 후보 등록 현황과 지역 기본 정보 중심으로 표시합니다."
        ),
        "facts": {
            **base_facts(active, polls, "district_mayor"),
            "district": district,
            "currentMayor": current_mayor,
            "keyIssue": key_issue,
            "previousTurnout": prev_turnout,
        },
    }


def build_byelection_overview(key, district, polls):
    district_name = district.get("district") or key
    active = active_candidates(district.get("candidates", []))
    reason = district.get("reason") or "공석 사유는 공식 데이터 확인 후 표시합니다."
    previous = district.get("prevElection") or {}
    summary = (
        f"선관위 후보자 정보 기준으로 {district_name} 국회의원 재보궐선거에는 후보 {len(active)}명이 등록되어 있습니다. "
        f"주요 후보는 {candidate_names(active)}입니다. 사유: {reason} "
        f"{format_prev(previous, '직전 총선')} {poll_sentence(polls)}"
    )
    issues = dedupe(
        (district.get("keyIssues") or [])
        + [
            "공식 후보 등록 현황",
            "직전 총선 결과 비교",
            "재보궐 사유",
            "등록 여론조사 여부",
        ],
        limit=4,
    )
    return {
        "regionName": district_name,
        "generatedBy": "structured_data",
        "trend": "공식 후보 등록",
        "headline": f"{district_name} 재보궐: 공식 후보 {len(active)}명 등록",
        "summary": summary,
        "keyIssues": issues,
        "riskFactor": (
            "재보궐 여론조사는 선거구 표기 차이로 분류 누락 가능성이 있어 후보 탭·여론조사 탭을 함께 확인해야 합니다."
            if polls else
            "등록 여론조사가 없는 선거구는 직전 총선 결과와 공식 후보 등록 현황 중심으로 표시합니다."
        ),
        "facts": {
            **base_facts(active, polls, "byelection"),
            "vacancyReason": reason,
            "previousElection": previous,
            "districtType": district.get("type"),
            "subType": district.get("subType"),
        },
    }


def sub_region_lookup(sub_regions):
    lookup = {}
    for region_key, items in (sub_regions or {}).items():
        lookup[region_key] = {item.get("name"): item for item in items if item.get("name")}
    return lookup


def refresh_overview(scope):
    overview = load_json(OVERVIEW_PATH, {"meta": {}, "regions": {}, "superintendent": {}, "mayor": {}, "byelection": {}})
    regions_static = load_json(REGIONS_PATH, {})
    sub_regions = sub_region_lookup(load_json(SUB_REGIONS_PATH, {}))
    polls = load_poll_index()

    governor_data = load_json(CANDIDATES_PATH, {}).get("candidates", {})
    governor_meta = load_json(CANDIDATES_PATH, {}).get("_meta", {})
    governor_merged = governor_meta.get("mergedRegions", {})

    superintendent_file = load_json(SUPERINTENDENT_PATH, {})
    superintendent_data = superintendent_file.get("candidates", {})
    superintendent_merged = (superintendent_file.get("_meta") or {}).get("mergedRegions", {})
    superintendent_history = load_json(SUPERINTENDENT_HISTORY_PATH, {})

    mayor_data = load_json(MAYOR_CANDIDATES_PATH, {}).get("candidates", {})
    byelection_data = load_json(BYELECTION_PATH, {}).get("districts", {})

    def selected(section):
        return scope == "all" or scope == section

    if selected("governor"):
        overview["regions"] = {}
        for region_key in REGION_NAMES:
            overview["regions"][region_key] = build_governor_overview(
                region_key,
                governor_data.get(region_key, []),
                polls["governor"].get(region_key, []),
                regions_static.get(region_key, {}),
                merged_target=governor_merged.get(region_key),
            )

    if selected("superintendent"):
        overview["superintendent"] = {}
        for region_key in REGION_NAMES:
            overview["superintendent"][region_key] = build_superintendent_overview(
                region_key,
                superintendent_data.get(region_key, []),
                polls["superintendent"].get(region_key, []),
                superintendent_history.get(region_key, []),
                merged_target=superintendent_merged.get(region_key),
            )

    if selected("mayor"):
        overview["mayor"] = {}
        for region_key in sorted(mayor_data):
            overview["mayor"][region_key] = {}
            for district, candidates in sorted(mayor_data[region_key].items()):
                overview["mayor"][region_key][district] = build_mayor_overview(
                    region_key,
                    district,
                    candidates,
                    polls["mayor"].get(f"{region_key}/{district}", []),
                    sub_regions.get(region_key, {}).get(district, {}),
                )

    if selected("byelection"):
        overview["byelection"] = {}
        for key, district in sorted(byelection_data.items()):
            overview["byelection"][key] = build_byelection_overview(
                key,
                district,
                find_byelection_polls(district, polls),
            )

    overview["meta"] = {
        **(overview.get("meta") or {}),
        "lastUpdated": date.today().isoformat(),
        "electionDate": ELECTION_DATE.isoformat(),
        "note": "중립적 관점의 선거 쟁점 개요. 특정 정당·후보 지지 없음.",
        "generatedBy": "structured_data",
        "pollDisplayStartDate": POLL_DISPLAY_START_DATE,
        "source": "중앙선거관리위원회 후보자 JSON, 여심위 등록 여론조사 JSON, 정적 선거 이력 JSON",
    }

    return overview


def main():
    parser = argparse.ArgumentParser(description="구조화 데이터 기반 election_overview.json 갱신")
    parser.add_argument(
        "--scope",
        choices=["all", "governor", "superintendent", "mayor", "byelection"],
        default="all",
        help="갱신 범위",
    )
    parser.add_argument("--dry-run", action="store_true", help="파일 저장 없이 검증 출력만 수행")
    args = parser.parse_args()

    overview = refresh_overview(args.scope)
    counts = {
        "regions": len(overview.get("regions", {})),
        "superintendent": len(overview.get("superintendent", {})),
        "mayor_regions": len(overview.get("mayor", {})),
        "mayor_entries": sum(len(v) for v in overview.get("mayor", {}).values()),
        "byelection": len(overview.get("byelection", {})),
    }

    if args.dry_run:
        print(json.dumps({"meta": overview.get("meta"), "counts": counts}, ensure_ascii=False, indent=2))
        return

    save_json(OVERVIEW_PATH, overview)
    print(f"[저장] {OVERVIEW_PATH}")
    print(json.dumps(counts, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
