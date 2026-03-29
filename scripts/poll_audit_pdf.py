#!/usr/bin/env python3
"""
여론조사 PDF 원본 vs polls.json 비교 검증

NESDC PDF 통계표에서 후보별 지지율을 재추출하고
polls.json의 수치와 비교하여 불일치를 감지합니다.

원칙: PDF 원본이 1순위 소스. 불일치 시 PDF가 정답.

사용법:
  python scripts/poll_audit_pdf.py                    # 전체 검증
  python scripts/poll_audit_pdf.py --region jeonnam   # 특정 지역
  python scripts/poll_audit_pdf.py --fix              # 불일치 자동 교정
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("pdfplumber 필요: pip install pdfplumber")
    sys.exit(1)

BASE = Path(__file__).resolve().parent.parent
POLLS_PATH = BASE / "data" / "polls" / "polls.json"
PDF_DIR = BASE / "data" / "polls" / "pdfs"


def extract_support_from_pdf(pdf_path):
    """PDF 통계표에서 [표1] 후보 지지도의 전체 행을 추출.

    Returns:
        list[dict]: [{"name": "홍길동", "support": 45.2}, ...] or None
    """
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    if not table or len(table) < 2:
                        continue

                    # "전체" 행 찾기 — 통계표의 전체 집계 행
                    for row_idx, row in enumerate(table):
                        row_text = ' '.join(str(c or '') for c in row)
                        if '전체' in row_text or '■' in row_text:
                            # 헤더 행에서 후보명 추출
                            header = table[0] if row_idx > 0 else None
                            if not header:
                                continue

                            # 후보명 + 지지율 매칭
                            results = []
                            for col_idx, cell in enumerate(row):
                                if cell is None:
                                    continue
                                cell_str = str(cell).strip()
                                # 숫자인지 확인 (지지율)
                                try:
                                    val = float(cell_str)
                                    if 1 <= val <= 90:
                                        # 해당 열의 헤더에서 후보명 가져오기
                                        if header and col_idx < len(header):
                                            name_raw = str(header[col_idx] or '').strip()
                                            # 후보명 정리: "우승희\n현\n영암군수" → "우승희"
                                            name = name_raw.split('\n')[0].strip()
                                            # 비후보 제거
                                            if name and len(name) >= 2 and len(name) <= 4 and re.match(r'^[가-힣]+$', name):
                                                if name not in {'없다', '모름', '기타', '소계', '합계', '전체', '사례수'}:
                                                    results.append({"name": name, "support": val})
                                except (ValueError, TypeError):
                                    pass

                            if results:
                                return results

            # 테이블 추출 실패 시 텍스트 기반 추출 시도
            for page in pdf.pages:
                text = page.extract_text() or ''
                if '표1' in text or '후보' in text:
                    # "전체" 행의 숫자들을 찾기
                    lines = text.split('\n')
                    for line in lines:
                        if '전체' in line or '■' in line:
                            numbers = re.findall(r'(\d{1,2}(?:\.\d)?)', line)
                            if len(numbers) >= 2:
                                return [{"name": f"후보{i+1}", "support": float(n)}
                                        for i, n in enumerate(numbers) if 1 <= float(n) <= 90]
    except Exception as e:
        return None

    return None


def compare_results(pdf_results, json_results):
    """PDF 추출 결과와 polls.json 결과 비교.

    Returns:
        list[dict]: 불일치 목록
    """
    if not pdf_results or not json_results:
        return []

    mismatches = []

    # PDF 결과를 이름→지지율 매핑
    pdf_map = {r["name"]: r["support"] for r in pdf_results}

    for r in json_results:
        name = r.get("candidateName", "")
        json_support = r.get("support", 0)

        if not name or json_support <= 0:
            continue

        if name in pdf_map:
            pdf_support = pdf_map[name]
            diff = abs(json_support - pdf_support)
            if diff >= 0.5:  # 0.5%p 이상 차이
                mismatches.append({
                    "candidate": name,
                    "pdf": pdf_support,
                    "json": json_support,
                    "diff": diff
                })

    return mismatches


def main():
    import argparse
    parser = argparse.ArgumentParser(description="PDF vs polls.json 검증")
    parser.add_argument("--region", help="특정 지역만")
    parser.add_argument("--fix", action="store_true", help="불일치 자동 교정")
    parser.add_argument("--limit", type=int, default=0, help="최대 검증 건수")
    parser.add_argument("--batch", action="store_true", help="전체 PDF 일괄 처리, audit_report.json 생성")
    args = parser.parse_args()

    # --batch 모드에서는 limit 무시 (전체 처리)
    if args.batch:
        args.limit = 0

    polls_data = json.loads(POLLS_PATH.read_text(encoding="utf-8"))

    regions = {args.region: polls_data["regions"][args.region]} if args.region else polls_data.get("regions", {})

    checked = 0
    mismatched = 0
    fixed = 0
    no_pdf = 0

    all_issues = []

    for region_key, poll_list in regions.items():
        for poll in poll_list:
            ntt_id = poll.get("nttId")
            results = poll.get("results", [])
            if not ntt_id or len(results) < 2:
                continue

            pdf_path = PDF_DIR / f"{ntt_id}.pdf"
            if not pdf_path.exists():
                no_pdf += 1
                continue

            if args.limit and checked >= args.limit:
                break

            checked += 1

            pdf_results = extract_support_from_pdf(pdf_path)
            if not pdf_results:
                continue

            mismatches = compare_results(pdf_results, results)

            if mismatches:
                mismatched += 1
                org = poll.get("pollOrg", "?")
                muni = poll.get("municipality") or region_key
                print(f"\n⚠️  [{ntt_id}] {org} — {muni}")

                for m in mismatches:
                    print(f"   {m['candidate']}: polls.json={m['json']}% → PDF={m['pdf']}% (차이 {m['diff']:.1f}%p)")

                all_issues.append({"nttId": ntt_id, "region": region_key, "mismatches": mismatches})

                if args.fix:
                    pdf_map = {r["name"]: r["support"] for r in pdf_results}
                    for r in results:
                        name = r.get("candidateName", "")
                        if name in pdf_map:
                            old = r["support"]
                            new = pdf_map[name]
                            if abs(old - new) >= 0.5:
                                r["support"] = new
                                fixed += 1
                                print(f"   ✅ {name}: {old}% → {new}% 교정")
                    poll["_corrected"] = True
                    poll["_correctionSource"] = f"PDF 원본 재검증 ({pdf_path.name})"

        if args.limit and checked >= args.limit:
            break

    print(f"\n{'='*60}")
    print(f"검증: {checked}건 (PDF 없음: {no_pdf}건)")
    print(f"불일치: {mismatched}건")
    if args.fix:
        print(f"교정: {fixed}건")
        if fixed > 0:
            POLLS_PATH.write_text(json.dumps(polls_data, ensure_ascii=False, indent=2), encoding="utf-8")
            print("polls.json 저장 완료")

    # --batch 모드: audit_report.json 생성
    if args.batch:
        report = {
            "generated": datetime.now().isoformat(),
            "checked": checked,
            "no_pdf": no_pdf,
            "mismatched": mismatched,
            "mismatches": all_issues,
        }
        report_path = BASE / "data" / "polls" / "audit_report.json"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"audit_report.json 저장: {report_path}")


if __name__ == "__main__":
    main()
