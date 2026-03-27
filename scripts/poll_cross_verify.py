#!/usr/bin/env python3
"""
여론조사 교차 검증: pdfplumber vs PyMuPDF

두 개의 다른 PDF 엔진으로 같은 PDF를 읽어서 수치를 비교합니다.
두 엔진이 같은 실수를 할 확률은 매우 낮으므로,
불일치가 발생하면 파싱 오류일 가능성이 높습니다.

사용법:
  python scripts/poll_cross_verify.py                    # 전체 검증
  python scripts/poll_cross_verify.py --region chungnam  # 특정 지역
  python scripts/poll_cross_verify.py --fix              # 두 엔진 일치 시 자동 교정
"""

import json
import re
import sys
from pathlib import Path
from typing import List, Dict, Optional, Tuple

try:
    import pdfplumber
    import fitz  # PyMuPDF
except ImportError as e:
    print(f"필요 패키지: pip install pdfplumber PyMuPDF\n{e}")
    sys.exit(1)

BASE = Path(__file__).resolve().parent.parent
POLLS_PATH = BASE / "data" / "polls" / "polls.json"
PDF_DIR = BASE / "data" / "polls" / "pdfs"

NAME_RE = re.compile(r'^[가-힣]{2,4}$')
SUPPORT_RE = re.compile(r'(\d{1,2}(?:\.\d{1,2})?)')


def extract_with_pdfplumber(pdf_path: Path) -> Optional[Dict[str, float]]:
    """pdfplumber로 후보별 지지율 추출. Returns {이름: 지지율} or None."""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    if not table or len(table) < 2:
                        continue
                    for row_idx, row in enumerate(table):
                        row_text = ' '.join(str(c or '') for c in row)
                        if '전체' in row_text or '■' in row_text:
                            header = table[0] if row_idx > 0 else None
                            if not header:
                                continue
                            results = {}
                            for col_idx, cell in enumerate(row):
                                if cell is None:
                                    continue
                                try:
                                    val = float(str(cell).strip())
                                    if 1 <= val <= 90 and header and col_idx < len(header):
                                        name = str(header[col_idx] or '').split('\n')[0].strip()
                                        if NAME_RE.match(name):
                                            results[name] = val
                                except (ValueError, TypeError):
                                    pass
                            if len(results) >= 2:
                                return results
    except Exception:
        pass
    return None


def extract_with_pymupdf(pdf_path: Path) -> Optional[Dict[str, float]]:
    """PyMuPDF로 후보별 지지율 추출. Returns {이름: 지지율} or None."""
    try:
        doc = fitz.open(str(pdf_path))
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()

            # "[표1]" 또는 "후보 지지도" 섹션 찾기
            if '표1' not in text and '후보' not in text and '적합도' not in text:
                continue

            lines = text.split('\n')

            # 헤더 행 찾기: 한글 이름이 2개 이상 연속
            header_names = []
            header_line_idx = -1
            for i, line in enumerate(lines):
                names = [w for w in line.split() if NAME_RE.match(w)]
                if len(names) >= 2:
                    header_names = names
                    header_line_idx = i
                    break

            if not header_names or header_line_idx < 0:
                continue

            # 전체/합계 행 찾기: 헤더 아래에서 "전체" 또는 숫자가 많은 행
            for line in lines[header_line_idx + 1:header_line_idx + 30]:
                if '전체' in line or '■' in line:
                    numbers = SUPPORT_RE.findall(line)
                    nums = [float(n) for n in numbers if 1 <= float(n) <= 90]
                    if len(nums) >= len(header_names):
                        results = {}
                        for j, name in enumerate(header_names):
                            if j < len(nums):
                                results[name] = nums[j]
                        if len(results) >= 2:
                            doc.close()
                            return results
                    break

        doc.close()
    except Exception:
        pass
    return None


def compare_engines(plumber: Dict[str, float], pymupdf: Dict[str, float]) -> Tuple[List, List]:
    """두 엔진 결과 비교. Returns (일치 목록, 불일치 목록)"""
    matches = []
    mismatches = []

    all_names = set(plumber.keys()) | set(pymupdf.keys())

    for name in all_names:
        p_val = plumber.get(name)
        m_val = pymupdf.get(name)

        if p_val is not None and m_val is not None:
            diff = abs(p_val - m_val)
            if diff < 0.5:
                matches.append({"name": name, "value": p_val})
            else:
                mismatches.append({"name": name, "pdfplumber": p_val, "pymupdf": m_val, "diff": diff})
        elif p_val is not None:
            mismatches.append({"name": name, "pdfplumber": p_val, "pymupdf": None, "diff": None})
        elif m_val is not None:
            mismatches.append({"name": name, "pdfplumber": None, "pymupdf": m_val, "diff": None})

    return matches, mismatches


def compare_with_polls_json(verified: Dict[str, float], json_results: list) -> list:
    """교차 검증된 수치와 polls.json 비교. Returns 불일치 목록."""
    diffs = []
    for r in json_results:
        name = r.get("candidateName", "")
        json_val = r.get("support", 0)
        if name in verified and json_val > 0:
            diff = abs(json_val - verified[name])
            if diff >= 0.5:
                diffs.append({"name": name, "json": json_val, "verified": verified[name], "diff": diff})
    return diffs


def main():
    import argparse
    parser = argparse.ArgumentParser(description="PDF 교차 검증 (pdfplumber vs PyMuPDF)")
    parser.add_argument("--region", help="특정 지역만")
    parser.add_argument("--fix", action="store_true", help="두 엔진 일치 + polls.json 불일치 시 자동 교정")
    parser.add_argument("--limit", type=int, default=0, help="최대 검증 건수")
    args = parser.parse_args()

    polls_data = json.loads(POLLS_PATH.read_text(encoding="utf-8"))
    regions = {args.region: polls_data["regions"][args.region]} if args.region else polls_data.get("regions", {})

    checked = 0
    both_extracted = 0
    engine_mismatch = 0
    json_mismatch = 0
    fixed = 0

    for region_key, poll_list in regions.items():
        for poll in poll_list:
            ntt_id = poll.get("nttId")
            results = poll.get("results", [])
            if not ntt_id or len(results) < 2:
                continue

            pdf_path = PDF_DIR / f"{ntt_id}.pdf"
            if not pdf_path.exists():
                continue

            if args.limit and checked >= args.limit:
                break

            checked += 1

            # 두 엔진으로 추출
            plumber = extract_with_pdfplumber(pdf_path)
            pymupdf = extract_with_pymupdf(pdf_path)

            if not plumber or not pymupdf:
                continue

            both_extracted += 1

            # 엔진 간 비교
            matches, engine_diffs = compare_engines(plumber, pymupdf)

            if engine_diffs:
                engine_mismatch += 1
                org = poll.get("pollOrg", "?")
                muni = poll.get("municipality") or region_key
                print(f"\n🔀 [{ntt_id}] {org} — {muni} (엔진 불일치)")
                for d in engine_diffs:
                    print(f"   {d['name']}: pdfplumber={d['pdfplumber']} vs PyMuPDF={d['pymupdf']}")
                continue

            # 두 엔진 일치 → polls.json과 비교
            verified = {m["name"]: m["value"] for m in matches}
            json_diffs = compare_with_polls_json(verified, results)

            if json_diffs:
                json_mismatch += 1
                org = poll.get("pollOrg", "?")
                muni = poll.get("municipality") or region_key
                print(f"\n⚠️  [{ntt_id}] {org} — {muni} (PDF 일치, polls.json 불일치)")
                for d in json_diffs:
                    print(f"   {d['name']}: polls.json={d['json']}% → 검증값={d['verified']}% (차이 {d['diff']:.1f}%p)")

                if args.fix:
                    for r in results:
                        name = r.get("candidateName", "")
                        if name in verified:
                            old = r["support"]
                            new = verified[name]
                            if abs(old - new) >= 0.5:
                                r["support"] = new
                                fixed += 1
                                print(f"   ✅ {name}: {old}% → {new}% 교정")
                    poll["_corrected"] = True
                    poll["_correctionSource"] = "pdfplumber+PyMuPDF 교차검증"

        if args.limit and checked >= args.limit:
            break

    print(f"\n{'='*60}")
    print(f"검증: {checked}건, 두 엔진 모두 추출: {both_extracted}건")
    print(f"엔진 간 불일치: {engine_mismatch}건 (수동 확인 필요)")
    print(f"PDF 일치 + polls.json 불일치: {json_mismatch}건")
    if args.fix and fixed > 0:
        print(f"자동 교정: {fixed}건")
        POLLS_PATH.write_text(json.dumps(polls_data, ensure_ascii=False, indent=2), encoding="utf-8")
        print("polls.json 저장 완료")


if __name__ == "__main__":
    main()
