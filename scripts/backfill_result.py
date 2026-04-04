#!/usr/bin/env python3
"""
여론조사 결과 백필 스크립트

특정 nttId의 결과 PDF가 NESDC에 공개된 후 결과를 파싱하여 polls.json에 반영.
공표 후 24시간 뒤에 결과분석 자료가 공개되므로, 그 이후에 실행해야 함.

사용법:
  python3 scripts/backfill_result.py --nttId 18063          # 단일 항목
  python3 scripts/backfill_result.py --nttId 18063 --force  # 기존 결과 덮어쓰기
  python3 scripts/backfill_result.py --pending              # 최근 14일 미결 항목 자동 처리
  python3 scripts/backfill_result.py --pending --dry-run    # 시뮬레이션
  python3 scripts/backfill_result.py --pending --days 30    # 기간 확장

재시도 상태: data/polls/backfill_state.json (nttId별 시도 횟수 추적, 3회 실패 시 포기)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

# 파이프라인 함수 재사용
sys.path.insert(0, str(Path(__file__).parent))
from nesdc_poll_pipeline import (
    USER_AGENT,
    DATA_DIR,
    PDF_DIR,
    OUTPUT_JSON,
    STATE_PATH,
    find_pdf_links,
    download_pdf,
    parse_pdf_results,
    _validate_poll_results,
    _try_gnews_fallback,
)

NESDC_DETAIL_URL = "https://www.nesdc.go.kr/portal/bbs/B0000005/view.do"
BACKFILL_STATE_PATH = DATA_DIR / "backfill_state.json"
MAX_RETRIES = 3          # 이 횟수 실패 시 해당 nttId 포기
PENDING_WINDOW_DAYS = 14 # --pending 기본 대상 기간

# 중요도 높은 선거 유형 — 미결 경보 대상
CRITICAL_ELECTION_TYPES = {"byelection", "governor", "mayor", "superintendent"}
ALERT_AFTER_DAYS = 7     # 공표 후 N일 이상 결과 없으면 경보


# ── 재시도 상태 관리 ──

def load_backfill_state() -> dict:
    if BACKFILL_STATE_PATH.exists():
        with open(BACKFILL_STATE_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_backfill_state(state: dict) -> None:
    with open(BACKFILL_STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def record_attempt(state: dict, ntt_id: int, success: bool) -> None:
    key = str(ntt_id)
    if key not in state:
        state[key] = {"attempts": 0, "failures": 0, "succeeded": False, "lastAttempt": None}
    state[key]["attempts"] += 1
    state[key]["lastAttempt"] = date.today().isoformat()
    if success:
        state[key]["succeeded"] = True
        state[key]["failures"] = 0
    else:
        state[key]["failures"] += 1


def should_skip(state: dict, ntt_id: int) -> bool:
    """이미 성공했거나 최대 재시도 초과 시 True."""
    entry = state.get(str(ntt_id), {})
    if entry.get("succeeded"):
        return True
    if entry.get("failures", 0) >= MAX_RETRIES:
        return True
    return False


# ── NESDC PDF 처리 ──

def fetch_result_pdf_links(client: httpx.Client, ntt_id: int) -> list[dict]:
    """NESDC 상세 페이지에서 첨부파일 링크 전체 반환."""
    url = f"{NESDC_DETAIL_URL}?nttId={ntt_id}&menuNo=200467"
    resp = client.get(url, follow_redirects=True)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    return find_pdf_links(soup)


def try_parse_attachments(
    client: httpx.Client, ntt_id: int, attachments: list[dict], dry_run: bool
) -> list[dict] | None:
    """첨부파일 목록에서 결과 PDF를 찾아 파싱. 성공 시 results 반환, 실패 시 None."""
    # 1차: 설문지가 아닌 파일 우선 시도
    for att in attachments:
        is_questionnaire = any(
            kw in att["text"] for kw in ["설문", "조사표", "질문지"]
        )
        if is_questionnaire:
            continue
        result = _download_and_parse(client, ntt_id, att, suffix="result", dry_run=dry_run)
        if result is not None:
            return result

    # 2차: 설문지 포함 전체 시도 (설문지+결과 합본 PDF인 경우)
    for att in attachments:
        result = _download_and_parse(client, ntt_id, att, suffix="fallback", dry_run=dry_run)
        if result is not None:
            return result

    return None


def _download_and_parse(
    client: httpx.Client, ntt_id: int, att: dict, suffix: str, dry_run: bool
) -> list[dict] | None:
    """단일 첨부파일 다운로드·파싱. 성공 시 results, 실패 시 None."""
    pdf_path = PDF_DIR / f"{ntt_id}_{suffix}.pdf"
    print(f"    📄 {att['text'][:50]}")

    if dry_run:
        print(f"    [dry-run] Would download {att['url'][:80]}")
        return []  # dry-run에서는 빈 리스트를 "성공"으로 간주

    if not download_pdf(client, att["url"], pdf_path):
        print(f"    ⚠ 다운로드 실패")
        return None

    parsed = parse_pdf_results(pdf_path)
    validated = _validate_poll_results(parsed) if parsed else []
    if validated:
        print(f"    ✅ {len(validated)}명 후보 파싱 성공")
        return validated

    print(f"    ⚠ 파싱/검증 실패")
    return None


# ── polls.json 접근 ──

def load_polls() -> dict:
    with open(OUTPUT_JSON, encoding="utf-8") as f:
        return json.load(f)


def save_polls(data: dict) -> None:
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def sync_results_to_state(polls_data: dict) -> int:
    """polls.json의 results를 state.json에 동기화.

    backfill이 polls.json에 results를 쓴 후 state.json도 업데이트하지 않으면
    파이프라인 재실행(--export-only 등) 시 results가 사라짐.
    이 함수로 polls.json → state.json 단방향 동기화.

    Returns: 업데이트된 poll 수
    """
    if not STATE_PATH.exists():
        return 0

    with open(STATE_PATH, encoding="utf-8") as f:
        state = json.load(f)

    state_polls = state.get("polls", [])
    if not state_polls:
        return 0

    # polls.json에서 nttId → results 인덱스 구성
    results_map: dict[int, list] = {}
    correction_map: dict[int, dict] = {}
    for poll in list(polls_data.get("national", [])) + [
        p for pl in polls_data.get("regions", {}).values() for p in pl
    ]:
        ntt_id = poll.get("nttId")
        if ntt_id and poll.get("results"):
            results_map[ntt_id] = poll["results"]
            # Google News fallback 메타도 동기화
            extra = {}
            if poll.get("_corrected"):
                extra["_corrected"] = poll["_corrected"]
            if poll.get("_correctionSource"):
                extra["_correctionSource"] = poll["_correctionSource"]
            if extra:
                correction_map[ntt_id] = extra

    updated = 0
    for poll in state_polls:
        ntt_id = poll.get("nttId")
        if ntt_id not in results_map:
            continue
        if poll.get("results") == results_map[ntt_id]:
            continue  # 이미 동일
        poll["results"] = results_map[ntt_id]
        if ntt_id in correction_map:
            poll.update(correction_map[ntt_id])
        updated += 1

    if updated:
        with open(STATE_PATH, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)

    return updated


def find_poll_entry(data: dict, ntt_id: int) -> tuple[str, int, dict] | None:
    """polls.json에서 nttId에 해당하는 (region_key, index, entry) 반환."""
    for region_key, region_polls in data.get("regions", {}).items():
        if not isinstance(region_polls, list):
            continue
        for i, poll in enumerate(region_polls):
            if isinstance(poll, dict) and poll.get("nttId") == ntt_id:
                return region_key, i, poll
    # national 배열도 확인
    for i, poll in enumerate(data.get("national", [])):
        if isinstance(poll, dict) and poll.get("nttId") == ntt_id:
            return "_national", i, poll
    return None


def collect_pending(data: dict, window_days: int) -> list[int]:
    """results가 비어있고 publishDate가 window_days 이내인 nttId 목록 반환."""
    cutoff = date.today() - timedelta(days=window_days)
    pending = []

    all_polls: list[dict] = list(data.get("national", []))
    for region_polls in data.get("regions", {}).values():
        if isinstance(region_polls, list):
            all_polls.extend(region_polls)

    for poll in all_polls:
        if not isinstance(poll, dict):
            continue
        if poll.get("results"):
            continue
        ntt_id = poll.get("nttId")
        if not ntt_id:
            continue
        publish_str = poll.get("publishDate") or poll.get("surveyDate", {}).get("end", "")
        if not publish_str:
            continue
        try:
            publish_date = date.fromisoformat(publish_str[:10])
        except ValueError:
            continue
        if publish_date >= cutoff:
            pending.append(ntt_id)

    return sorted(pending, reverse=True)  # 최신 순


# ── 핵심 로직 ──

def backfill_one(
    ntt_id: int,
    data: dict,
    bf_state: dict,
    client: httpx.Client,
    dry_run: bool = False,
    force: bool = False,
) -> bool:
    """단일 nttId 처리. polls.json data를 in-place 수정. 성공 여부 반환."""
    found = find_poll_entry(data, ntt_id)
    if not found:
        print(f"  ❌ nttId={ntt_id} polls.json에 없음")
        return False

    region_key, idx, entry = found

    existing_results = entry.get("results", [])
    if existing_results and not force:
        print(f"  ✅ nttId={ntt_id} 이미 결과 있음 ({len(existing_results)}건) — 스킵")
        return True

    if should_skip(bf_state, ntt_id) and not force:
        failures = bf_state.get(str(ntt_id), {}).get("failures", 0)
        print(f"  ⏭ nttId={ntt_id} 재시도 한도 초과 ({failures}회 실패) — 스킵")
        return False

    print(f"  📥 NESDC 접근 중 nttId={ntt_id}...")
    try:
        attachments = fetch_result_pdf_links(client, ntt_id)
    except Exception as e:
        print(f"  ❌ NESDC 접근 실패: {e}")
        record_attempt(bf_state, ntt_id, success=False)
        return False

    print(f"  첨부파일 {len(attachments)}개")
    if not attachments:
        print(f"  ⚠ 첨부파일 없음 (결과 PDF 미공개)")
        record_attempt(bf_state, ntt_id, success=False)
        return False

    results = try_parse_attachments(client, ntt_id, attachments, dry_run=dry_run)

    if results is None:
        # PDF 파싱 실패 → Google News fallback 시도
        print(f"  🔄 PDF 실패 → Google News fallback 시도...")
        if not dry_run:
            gnews_results = _try_gnews_fallback(entry)
            if gnews_results:
                results = gnews_results
                entry["_corrected"] = True
                entry["_correctionSource"] = "Google News 교차검증 (PDF 파싱 실패 폴백)"
                print(f"  ✅ Google News fallback 성공: {len(results)}건")
            else:
                print(f"  ❌ nttId={ntt_id} Google News fallback도 실패")
                record_attempt(bf_state, ntt_id, success=False)
                return False
        else:
            print(f"  [dry-run] Would try Google News fallback")
            record_attempt(bf_state, ntt_id, success=False)
            return False

    if dry_run:
        print(f"  [dry-run] nttId={ntt_id} 결과 {len(results)}건 — 저장 안 함")
        return True

    if region_key == "_national":
        data["national"][idx]["results"] = results
    else:
        data["regions"][region_key][idx]["results"] = results

    record_attempt(bf_state, ntt_id, success=True)
    print(f"  ✅ nttId={ntt_id} 업데이트 완료 ({len(results)}건)")
    return True


# ── 미결 경보 ──

def check_alerts(data: dict, bf_state: dict) -> list[dict]:
    """중요 선거 유형에서 공표 후 ALERT_AFTER_DAYS일 이상 결과 없는 항목 반환."""
    today = date.today()
    alerts = []

    all_polls: list[dict] = list(data.get("national", []))
    for region_polls in data.get("regions", {}).values():
        if isinstance(region_polls, list):
            all_polls.extend(region_polls)

    for poll in all_polls:
        if not isinstance(poll, dict) or poll.get("results"):
            continue
        election_type = poll.get("electionType", "")
        if election_type not in CRITICAL_ELECTION_TYPES:
            continue
        ntt_id = poll.get("nttId")
        if not ntt_id:
            continue
        publish_str = poll.get("publishDate") or poll.get("surveyDate", {}).get("end", "")
        if not publish_str:
            continue
        try:
            publish_date = date.fromisoformat(publish_str[:10])
        except ValueError:
            continue
        days_elapsed = (today - publish_date).days
        if days_elapsed < ALERT_AFTER_DAYS:
            continue
        failures = bf_state.get(str(ntt_id), {}).get("failures", 0)
        gave_up = failures >= MAX_RETRIES
        alerts.append({
            "nttId": ntt_id,
            "electionType": election_type,
            "pollName": poll.get("pollName", ""),
            "pollOrg": poll.get("pollOrg", ""),
            "publishDate": publish_str[:10],
            "daysElapsed": days_elapsed,
            "failures": failures,
            "gaveUp": gave_up,
        })

    alerts.sort(key=lambda a: a["daysElapsed"], reverse=True)
    return alerts


def print_alerts(alerts: list[dict]) -> None:
    if not alerts:
        print("✅ 미결 경보 없음 (중요 항목 모두 결과 있음)")
        return
    print(f"\n{'='*50}")
    print(f"⚠️  미결 경보: {len(alerts)}건 ({ALERT_AFTER_DAYS}일+ 경과)")
    print(f"{'='*50}")
    for a in alerts:
        gave_up_mark = " [포기됨 — --force 필요]" if a["gaveUp"] else ""
        print(
            f"  nttId={a['nttId']} | {a['electionType']} | {a['daysElapsed']}일 경과"
            f" | 실패 {a['failures']}회{gave_up_mark}"
        )
        print(f"    {a['pollName'][:60]} ({a['pollOrg'][:30]})")
        print(f"    공표: {a['publishDate']}")
    print()


# ── 엔트리포인트 ──

def main() -> None:
    parser = argparse.ArgumentParser(description="여론조사 결과 백필 스크립트")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--nttId", type=int, help="단일 nttId 처리")
    mode.add_argument("--pending", action="store_true", help="최근 미결 항목 자동 일괄 처리")
    mode.add_argument("--report", action="store_true",
                      help=f"중요 항목 미결 경보만 출력 ({ALERT_AFTER_DAYS}일+ 경과)")
    parser.add_argument("--days", type=int, default=PENDING_WINDOW_DAYS,
                        help=f"--pending 대상 기간 (기본: {PENDING_WINDOW_DAYS}일)")
    parser.add_argument("--dry-run", action="store_true", help="실제 저장 없이 시뮬레이션")
    parser.add_argument("--force", action="store_true", help="재시도 한도·기존 결과 무시하고 강제 처리")
    args = parser.parse_args()

    data = load_polls()
    bf_state = load_backfill_state()

    if args.report:
        # 경보 리포트만 출력
        alerts = check_alerts(data, bf_state)
        print_alerts(alerts)
        sys.exit(1 if alerts else 0)

    client = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=20)

    if args.nttId:
        # 단일 모드
        success = backfill_one(args.nttId, data, bf_state, client,
                               dry_run=args.dry_run, force=args.force)
        if not args.dry_run:
            save_polls(data)
            synced = sync_results_to_state(data)
            if synced:
                print(f"  🔄 state.json 동기화: {synced}건")
            save_backfill_state(bf_state)
        sys.exit(0 if success else 1)

    else:
        # --pending 모드
        targets = collect_pending(data, window_days=args.days)

        # 매 실행마다 경보 먼저 출력
        alerts = check_alerts(data, bf_state)
        if alerts:
            print_alerts(alerts)

        if not targets:
            print(f"✅ 최근 {args.days}일 이내 미결 항목 없음")
            sys.exit(1 if alerts else 0)

        print(f"🔍 미결 항목 {len(targets)}건: {targets}")
        succeeded, failed, skipped = 0, 0, 0

        for ntt_id in targets:
            if should_skip(bf_state, ntt_id) and not args.force:
                failures = bf_state.get(str(ntt_id), {}).get("failures", 0)
                print(f"\n[{ntt_id}] ⏭ 재시도 한도 초과 ({failures}회) — 스킵")
                skipped += 1
                continue

            print(f"\n[{ntt_id}]")
            ok = backfill_one(ntt_id, data, bf_state, client,
                              dry_run=args.dry_run, force=args.force)
            if ok:
                succeeded += 1
            else:
                failed += 1
            time.sleep(1)  # NESDC 서버 부하 방지

        if not args.dry_run:
            save_polls(data)
            synced = sync_results_to_state(data)
            if synced:
                print(f"\n🔄 state.json 동기화: {synced}건 업데이트")
            save_backfill_state(bf_state)

        print(f"\n{'='*40}")
        print(f"완료: 성공 {succeeded} / 실패 {failed} / 스킵 {skipped} (총 {len(targets)}건)")
        # 경보가 있거나 실패가 있으면 exit 1
        sys.exit(0 if (failed == 0 and not alerts) else 1)


if __name__ == "__main__":
    main()
