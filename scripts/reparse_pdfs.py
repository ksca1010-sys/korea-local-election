#!/usr/bin/env python3
"""기존 수집 데이터에서 results가 비어있는 조사의 PDF를 재다운로드·재파싱한다."""
from __future__ import annotations

import json
import time
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


def main():
    import argparse
    parser = argparse.ArgumentParser(description="PDF 미파싱 조사 재파싱")
    parser.add_argument("--limit", type=int, default=0, help="최대 처리 건수 (0=전부)")
    parser.add_argument("--dry-run", action="store_true", help="다운로드 없이 대상 건수만 확인")
    args = parser.parse_args()

    state = load_state()
    polls = state.get("polls", [])
    if not polls:
        print("No existing data.")
        return

    # results가 비어있는 조사 찾기
    empty = [p for p in polls if not p.get("results")]
    print(f"전체 {len(polls)}건 중 results 미파싱: {len(empty)}건")

    if args.dry_run:
        return

    PDF_DIR.mkdir(parents=True, exist_ok=True)
    client = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30)
    updated = 0
    failed = 0

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
                    updated += 1
                    print(f"  ✅ 기존 PDF에서 {len(results)}건 파싱 성공")
                    continue

            # 2) 상세 페이지에서 PDF 링크 찾기
            source_url = poll.get("sourceUrl", "")
            if not source_url:
                print(f"  ⏭ sourceUrl 없음")
                failed += 1
                continue

            try:
                time.sleep(DELAY)
                html = fetch(client, source_url, delay=0)
                soup = BeautifulSoup(html, "html.parser")
                pdf_links = find_pdf_links(soup)
            except Exception as e:
                print(f"  ⚠ 상세페이지 fetch 실패: {e}")
                failed += 1
                continue

            if not pdf_links:
                print(f"  ⏭ PDF 첨부 없음")
                failed += 1
                continue

            # 3) PDF 다운로드 + 파싱
            parsed = False
            for att in pdf_links:
                if download_pdf(client, att["url"], pdf_path):
                    results = parse_pdf_results(pdf_path)
                    if results:
                        poll["results"] = results
                        updated += 1
                        parsed = True
                        print(f"  ✅ {len(results)}건 파싱 성공")
                        break
                    else:
                        print(f"  ⚠ PDF 다운로드 성공, 파싱 실패")

            if not parsed:
                failed += 1

            # 50건마다 중간 저장
            if updated > 0 and updated % 50 == 0:
                print(f"\n  💾 중간 저장 ({updated}건 업데이트)...")
                save_state({"last_id": state.get("last_id", 0), "polls": polls})
                export_frontend_json(polls)

    finally:
        client.close()

    print(f"\n{'='*50}")
    print(f"완료: {updated}건 업데이트, {failed}건 실패")

    if updated > 0:
        save_state({"last_id": state.get("last_id", 0), "polls": polls})
        export_frontend_json(polls)
        print("✅ state + polls.json 저장 완료")


if __name__ == "__main__":
    main()
