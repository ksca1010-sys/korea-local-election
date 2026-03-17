#!/usr/bin/env python3
"""
PDF 분류 스크립트: 결과보고서 vs 설문지 분류
- Gemini로 각 PDF를 빠르게 분류
- 결과보고서만 추후 파싱 대상으로 선별
"""

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PDF_DIR = BASE_DIR / "data" / "polls" / "pdfs"
STATE_PATH = BASE_DIR / "data" / "polls" / "state.json"
CLASSIFY_PATH = BASE_DIR / "data" / "polls" / "pdf_classification.json"
ENV_FILE = BASE_DIR / ".env"

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
API_KEY_ENV = "GEMINI_API_KEY"

CLASSIFY_PROMPT = """이 PDF 문서를 분류해줘. 반드시 JSON 객체 하나만 반환:

{
  "type": "result" 또는 "questionnaire" 또는 "other",
  "hasResultTable": true/false,
  "hasCandidateSupport": true/false,
  "pageCount": 숫자,
  "reason": "한줄 설명"
}

분류 기준:
- "result": 후보자별 지지율/적합도 수치가 포함된 결과표가 있는 문서
- "questionnaire": 설문 문항만 있고 결과 수치가 없는 문서
- "other": 위 둘 다 아닌 경우 (정당지지도만 있는 등)

JSON만 출력하고 다른 텍스트는 붙이지 마."""


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def classify_pdf(pdf_bytes, api_key, max_retries=4):
    import re as _re
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=[
                    types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                    CLASSIFY_PROMPT,
                ],
                config=types.GenerateContentConfig(
                    temperature=0,
                    response_mime_type="application/json",
                ),
            )
            text = getattr(response, "text", "") or ""
            text = text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return {"type": "error", "reason": f"JSON parse failed: {text[:200]}"}
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                match = _re.search(r'retry.*?(\d+)', err_str, _re.IGNORECASE)
                wait = int(match.group(1)) + 5 if match else 30 * (attempt + 1)
                wait = min(wait, 120)
                print(f"    [재시도] 쿼터 초과, {wait}초 대기 ({attempt+1}/{max_retries})")
                time.sleep(wait)
            else:
                return {"type": "error", "reason": str(e)[:200]}
    return {"type": "error", "reason": "max retries exceeded"}


def main():
    load_env()
    api_key = os.environ.get(API_KEY_ENV, "")
    if not api_key:
        print(f"[오류] {API_KEY_ENV} 환경변수가 필요합니다.")
        sys.exit(1)

    # 기존 분류 결과 로드
    if CLASSIFY_PATH.exists():
        classified = json.loads(CLASSIFY_PATH.read_text(encoding="utf-8"))
    else:
        classified = {}

    # state.json에서 poll 메타데이터 로드
    state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    polls_by_id = {str(p.get("nttId")): p for p in state.get("polls", [])}

    # PDF 파일 목록 (error 건은 재시도 대상)
    pdf_files = sorted(f for f in os.listdir(PDF_DIR) if f.endswith(".pdf"))
    done = {k for k, v in classified.items() if v.get("type") not in ("error", None)}
    todo = [f for f in pdf_files if f.replace(".pdf", "") not in done]

    print("=" * 55)
    print("PDF 분류 (결과보고서 vs 설문지)")
    print(f"실행 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"모델: {MODEL}")
    print(f"총 PDF: {len(pdf_files)} | 분류 완료: {len(done)} | 남은 것: {len(todo)}")
    print("=" * 55)

    if not todo:
        print("\n모든 PDF가 이미 분류되었습니다.")
        print_summary(classified)
        return

    success = 0
    errors = 0

    for i, filename in enumerate(todo):
        ntt_id = filename.replace(".pdf", "")
        poll_meta = polls_by_id.get(ntt_id, {})
        title = poll_meta.get("title", "")

        print(f"\n[{i+1}/{len(todo)}] {ntt_id} - {title[:50]}")

        pdf_path = PDF_DIR / filename
        try:
            pdf_bytes = pdf_path.read_bytes()
            result = classify_pdf(pdf_bytes, api_key)
            classified[ntt_id] = {
                "title": title,
                **result,
                "classifiedAt": datetime.now().isoformat(),
            }
            print(f"  → {result.get('type', '?')} | {result.get('reason', '')[:60]}")
            success += 1
        except Exception as e:
            print(f"  [오류] {e}")
            classified[ntt_id] = {
                "title": title,
                "type": "error",
                "reason": str(e)[:200],
                "classifiedAt": datetime.now().isoformat(),
            }
            errors += 1

        # 중간 저장 (50건마다)
        if (i + 1) % 50 == 0:
            CLASSIFY_PATH.write_text(
                json.dumps(classified, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            print(f"  [저장] {i+1}건 중간 저장 완료")

        # rate limit
        time.sleep(0.5)

    # 최종 저장
    CLASSIFY_PATH.write_text(
        json.dumps(classified, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"\n{'=' * 55}")
    print(f"분류 완료! 성공: {success}, 오류: {errors}")
    print_summary(classified)
    print(f"저장: {CLASSIFY_PATH}")
    print("=" * 55)


def print_summary(classified):
    counts = {}
    for v in classified.values():
        t = v.get("type", "unknown")
        counts[t] = counts.get(t, 0) + 1

    print(f"\n분류 결과 요약:")
    for t, c in sorted(counts.items(), key=lambda x: -x[1]):
        pct = c / len(classified) * 100 if classified else 0
        label = {
            "result": "결과보고서 (파싱 대상)",
            "questionnaire": "설문지 (스킵)",
            "other": "기타",
            "error": "오류",
        }.get(t, t)
        print(f"  {label}: {c}건 ({pct:.1f}%)")


if __name__ == "__main__":
    main()
