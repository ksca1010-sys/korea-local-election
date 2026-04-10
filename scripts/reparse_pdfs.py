#!/usr/bin/env python3
"""기존 수집 데이터에서 results가 비어있는 조사의 PDF를 재다운로드·재파싱한다.

재시도 큐 (data/polls/parse_queue.json):
    각 nttId 의 재시도 이력을 기록한다. 3회 이상 실패한 조사는 auto-reparse
    대상에서 제외되어 매 실행마다 똑같은 PDF를 재요청하는 낭비를 막는다.
    운영자는 --reset-queue 로 큐를 초기화하거나, parse_queue.json 의
    해당 항목을 직접 편집해 status 를 "retry" 로 되돌릴 수 있다.
"""
from __future__ import annotations

import json
import time
from datetime import date
from pathlib import Path

# nesdc_poll_pipeline 모듈 임포트
import sys
sys.path.insert(0, str(Path(__file__).parent))
from nesdc_poll_pipeline import (
    load_state, save_state, export_frontend_json,
    download_pdf, parse_pdf_results, fetch, find_pdf_links,
    DATA_DIR, PDF_DIR, BASE_DETAIL_URL, USER_AGENT, DELAY,
)

import httpx
from bs4 import BeautifulSoup


# ── 재시도 큐 ──────────────────────────────────────────────────────
# DATA_DIR == <repo>/data/polls (nesdc_poll_pipeline.DATA_DIR 재사용)
QUEUE_PATH = DATA_DIR / "parse_queue.json"
DEFAULT_MAX_ATTEMPTS = 3


def load_queue() -> dict:
    if QUEUE_PATH.exists():
        try:
            return json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"[경고] {QUEUE_PATH} 파싱 실패, 빈 큐로 초기화")
    return {"entries": {}}


def save_queue(queue: dict) -> None:
    QUEUE_PATH.parent.mkdir(parents=True, exist_ok=True)
    QUEUE_PATH.write_text(
        json.dumps(queue, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def queue_should_skip(queue: dict, ntt_id: int, max_attempts: int) -> tuple[bool, str]:
    entry = queue.get("entries", {}).get(str(ntt_id))
    if not entry:
        return False, ""
    if entry.get("status") == "abandoned":
        return True, f"abandoned after {entry.get('attempts', 0)} attempts: {entry.get('lastReason', '?')}"
    if entry.get("attempts", 0) >= max_attempts:
        return True, f"attempts >= {max_attempts} ({entry.get('lastReason', '?')})"
    return False, ""


def queue_record_failure(queue: dict, ntt_id: int, reason: str, max_attempts: int) -> None:
    entries = queue.setdefault("entries", {})
    entry = entries.get(str(ntt_id), {
        "firstSeenAt": date.today().isoformat(),
        "attempts": 0,
        "status": "retry",
    })
    entry["attempts"] = entry.get("attempts", 0) + 1
    entry["lastAttemptAt"] = date.today().isoformat()
    entry["lastReason"] = reason
    if entry["attempts"] >= max_attempts:
        entry["status"] = "abandoned"
    entries[str(ntt_id)] = entry


def queue_record_success(queue: dict, ntt_id: int) -> None:
    entries = queue.get("entries", {})
    if str(ntt_id) in entries:
        del entries[str(ntt_id)]


def main():
    import argparse
    parser = argparse.ArgumentParser(description="PDF 미파싱 조사 재파싱")
    parser.add_argument("--limit", type=int, default=0, help="최대 처리 건수 (0=전부)")
    parser.add_argument("--dry-run", action="store_true", help="다운로드 없이 대상 건수만 확인")
    parser.add_argument("--max-attempts", type=int, default=DEFAULT_MAX_ATTEMPTS,
                        help=f"큐의 최대 재시도 횟수 (기본 {DEFAULT_MAX_ATTEMPTS})")
    parser.add_argument("--reset-queue", action="store_true",
                        help="parse_queue.json 을 빈 상태로 초기화하고 종료")
    args = parser.parse_args()

    if args.reset_queue:
        save_queue({"entries": {}})
        print(f"[reset] {QUEUE_PATH} 초기화 완료")
        return

    state = load_state()
    polls = state.get("polls", [])
    if not polls:
        print("No existing data.")
        return

    queue = load_queue()

    # results가 비어있는 조사 찾기 (party_support 제외)
    skipped = sum(1 for p in polls if not p.get("results") and p.get("electionType") == "party_support")
    empty_all = [p for p in polls if not p.get("results") and p.get("electionType") != "party_support"]

    # 재시도 큐에서 abandoned/초과 건은 자동 제외
    empty = []
    abandoned_skipped = 0
    for p in empty_all:
        skip, reason = queue_should_skip(queue, p.get("nttId", 0), args.max_attempts)
        if skip:
            abandoned_skipped += 1
        else:
            empty.append(p)

    abandoned_total = sum(
        1 for e in queue.get("entries", {}).values() if e.get("status") == "abandoned"
    )

    print(f"전체 {len(polls)}건 중 results 미파싱: {len(empty_all) + skipped}건")
    print(f"Skipped {skipped} party_support polls")
    print(f"처리 대상(지역조사): {len(empty)}건")
    print(f"재시도 큐: {len(queue.get('entries', {}))}건 등록 "
          f"(abandoned {abandoned_total}건, 이번 실행에서 스킵 {abandoned_skipped}건)")

    if args.dry_run:
        return

    PDF_DIR.mkdir(parents=True, exist_ok=True)
    client = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30)
    updated = 0
    failed = 0

    def _record_failure_and_save(ntt_id: int, reason: str) -> None:
        queue_record_failure(queue, ntt_id, reason, args.max_attempts)

    try:
        for i, poll in enumerate(empty):
            if args.limit and updated >= args.limit:
                break

            ntt_id = poll.get("nttId", 0)
            title = (poll.get("title") or "")[:50]
            print(f"\n[{i+1}/{len(empty)}] nttId={ntt_id} {title}")

            # 1) 이미 다운로드된 PDF가 있는지 확인
            pdf_path = PDF_DIR / f"{ntt_id}.pdf"
            if pdf_path.exists():
                results = parse_pdf_results(pdf_path)
                if results:
                    poll["results"] = results
                    queue_record_success(queue, ntt_id)
                    updated += 1
                    print(f"  ✅ 기존 PDF에서 {len(results)}건 파싱 성공")
                    continue

            # 2) 상세 페이지에서 PDF 링크 찾기
            source_url = poll.get("sourceUrl", "")
            if not source_url:
                print(f"  ⏭ sourceUrl 없음")
                _record_failure_and_save(ntt_id, "sourceUrl 없음")
                failed += 1
                continue

            try:
                time.sleep(DELAY)
                html = fetch(client, source_url, delay=0)
                soup = BeautifulSoup(html, "html.parser")
                pdf_links = find_pdf_links(soup)
            except Exception as e:
                reason = f"상세페이지 fetch 실패: {type(e).__name__}"
                print(f"  ⚠ {reason}: {e}")
                _record_failure_and_save(ntt_id, reason)
                failed += 1
                continue

            if not pdf_links:
                print(f"  ⏭ PDF 첨부 없음")
                _record_failure_and_save(ntt_id, "PDF 첨부 없음")
                failed += 1
                continue

            # 3) PDF 다운로드 + 파싱
            parsed = False
            for att in pdf_links:
                if download_pdf(client, att["url"], pdf_path):
                    results = parse_pdf_results(pdf_path)
                    if results:
                        poll["results"] = results
                        queue_record_success(queue, ntt_id)
                        updated += 1
                        parsed = True
                        print(f"  ✅ {len(results)}건 파싱 성공")
                        break
                    else:
                        print(f"  ⚠ PDF 다운로드 성공, 파싱 실패")

            if not parsed:
                _record_failure_and_save(ntt_id, "PDF 파싱 실패")
                failed += 1

            # 50건마다 중간 저장
            if updated > 0 and updated % 50 == 0:
                print(f"\n  💾 중간 저장 ({updated}건 업데이트)...")
                save_state({"last_id": state.get("last_id", 0), "polls": polls})
                export_frontend_json(polls)
                save_queue(queue)

    finally:
        client.close()

    print(f"\n{'='*50}")
    print(f"완료: {updated}건 업데이트, {failed}건 실패")

    if updated > 0:
        save_state({"last_id": state.get("last_id", 0), "polls": polls})
        export_frontend_json(polls)
        print("✅ state + polls.json 저장 완료")

    save_queue(queue)
    abandoned_now = sum(
        1 for e in queue.get("entries", {}).values() if e.get("status") == "abandoned"
    )
    print(f"[queue] 저장 — 전체 {len(queue.get('entries', {}))}건, abandoned {abandoned_now}건")


if __name__ == "__main__":
    main()
