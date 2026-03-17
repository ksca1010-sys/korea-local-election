#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data" / "polls"
STATE_JSON = DATA_DIR / "state.json"
POLLS_JSON = DATA_DIR / "polls.json"
PDF_DIR = DATA_DIR / "pdfs"
REPORT_PATH = DATA_DIR / "gemini_fallback_report.jsonl"
GOVERNOR_CANDIDATES_JSON = BASE_DIR / "data" / "candidates" / "governor.json"
ENV_FILE = BASE_DIR / ".env"

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
API_KEY_ENV = "GEMINI_API_KEY"

PARTY_MAP = {
    "더불어민주당": "democratic",
    "민주당": "democratic",
    "국민의힘": "ppp",
    "조국혁신당": "reform",
    "혁신당": "reform",
    "개혁신당": "newReform",
    "새로운미래": "newReform",
    "진보당": "progressive",
    "무소속": "independent",
}

BLOCKED_NAMES = {
    "없다", "없음", "모름", "기타", "합계", "전체", "전체",
    "후보", "지지도", "적합도", "정당", "정당지지도",
    "교육감", "도지사", "시장", "군수", "구청장",
    "가중치", "조사완료", "사례수", "잘모르겠다", "무응답",
    "기타후보", "적합한", "통합교육감", "경북교육감",
    "보수", "중도", "진보", "남성", "여성", "남자", "여자",
}

BLOCKED_SUFFIX = re.compile(r"(당|신문|일보|뉴스|연대|위원회|교육장|대표이사|위원장|상임위원장|총장|포럼)$")

QUESTIONNAIRE_HINTS = (
    "응답자 선정 질문",
    "응답자 선별 문항",
    "조사 중단",
    "면접원",
    "보기 순서는 무작위",
    "보기 순서는",
    "보기 로테이션",
    "무작위 순",
    "랜덤 고정",
    "눌러주세요",
    "문항 수",
    "문 1)",
    "문1.",
    "문 1)",
    "SQ1",
    "SQ 1)",
    "DQ1",
    "귀하께서는",
    "선생님께서는",
    "끝까지 응답해 주셔서 대단히 감사합니다",
)

RESULT_PREVIEW_HINTS = (
    "표본오차",
    "응답률",
    "신뢰수준",
    "사례수",
    "가중값",
    "가중치보정",
    "유효 표본 수",
    "조사의 개요",
    "조사 측정모형",
    "자료처리 및 분석 방법",
    "조사결과",
    "결과 요약",
    "(%)",
)


def load_env() -> None:
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def load_state() -> Dict[str, Any]:
    if not STATE_JSON.exists():
        return {"last_id": 0, "polls": []}
    return json.loads(STATE_JSON.read_text(encoding="utf-8"))


def save_state(state: Dict[str, Any]) -> None:
    STATE_JSON.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def export_polls_json(polls: List[Dict[str, Any]]) -> None:
    sys.path.insert(0, str(Path(__file__).parent))
    from nesdc_poll_pipeline import export_frontend_json

    export_frontend_json(polls)


def normalize_party(text: str) -> Optional[str]:
    normalized = str(text or "").strip()
    if not normalized:
        return None
    for name, key in PARTY_MAP.items():
        if name in normalized:
            return key
    return None


def normalize_name(text: str) -> str:
    return re.sub(r"\s+", "", str(text or "")).strip()


def is_valid_candidate_name(name: str) -> bool:
    if not name or len(name) < 2 or len(name) > 5:
        return False
    if not re.fullmatch(r"[가-힣]+", name):
        return False
    if name in BLOCKED_NAMES:
        return False
    if BLOCKED_SUFFIX.search(name):
        return False
    return True


def load_governor_candidates() -> Dict[str, List[str]]:
    if not GOVERNOR_CANDIDATES_JSON.exists():
        return {}
    data = json.loads(GOVERNOR_CANDIDATES_JSON.read_text(encoding="utf-8"))
    candidates = data.get("candidates") or {}
    return {
        region_key: [item["name"] for item in items if item.get("name")]
        for region_key, items in candidates.items()
    }


def build_neighbor_candidate_names(
    polls: Iterable[Dict[str, Any]],
    *,
    region_key: str,
    election_type: str,
    municipality: Optional[str],
    exclude_ntt_id: Optional[int],
) -> List[str]:
    counts: Counter[str] = Counter()
    for poll in polls:
        if poll.get("nttId") == exclude_ntt_id:
            continue
        if poll.get("regionKey") != region_key:
            continue
        if poll.get("electionType") != election_type:
            continue
        if municipality is not None and poll.get("municipality") != municipality:
            continue
        for result in poll.get("results") or []:
            name = normalize_name(result.get("candidateName"))
            if is_valid_candidate_name(name):
                counts[name] += 1
    return [name for name, _ in counts.most_common(8)]


def build_expected_candidate_names(
    poll: Dict[str, Any],
    all_polls: List[Dict[str, Any]],
    governor_candidates: Dict[str, List[str]],
) -> List[str]:
    region_key = poll.get("regionKey")
    election_type = poll.get("electionType")
    municipality = poll.get("municipality")
    ntt_id = poll.get("nttId")

    expected: List[str] = []
    if election_type == "mayor" and region_key and not municipality:
        expected.extend(governor_candidates.get(region_key, []))

    expected.extend(
        build_neighbor_candidate_names(
            all_polls,
            region_key=region_key,
            election_type=election_type,
            municipality=municipality,
            exclude_ntt_id=ntt_id,
        )
    )

    seen = set()
    deduped = []
    for name in expected:
        normalized = normalize_name(name)
        if not is_valid_candidate_name(normalized) or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped[:10]


def build_prompt(poll: Dict[str, Any], expected_names: List[str]) -> str:
    title = poll.get("title") or ""
    election_type = poll.get("electionType") or ""
    region_key = poll.get("regionKey") or ""
    municipality = poll.get("municipality") or ""
    hint_line = ", ".join(expected_names) if expected_names else "없음"

    return f"""다음 PDF는 한국 중앙선거여론조사심의위원회 등록 여론조사 PDF다.

조사 메타데이터:
- title: {title}
- electionType: {election_type}
- regionKey: {region_key}
- municipality: {municipality or "없음"}
- expectedCandidateNames: {hint_line}

작업:
1. 후보 개인의 전체 지지율/적합도 결과만 추출한다.
2. 정당지지도, 대통령 국정지지, 찬반조사, 세부 교차분석은 제외한다.
3. 설문지만 있고 후보 전체 결과표가 없으면 빈 배열을 반환한다.
4. 후보명이 아니거나 표 머리글, "기타후보", "잘모르겠다", "없다" 같은 항목은 제외한다.
5. 가능한 경우 가장 대표적인 전체 표 1개만 선택한다.

반드시 JSON 배열만 반환:
[
  {{
    "candidateName": "홍길동",
    "partyRaw": "더불어민주당",
    "support": 45.2,
    "questionLabel": "광역단체장 후보 지지도"
  }}
]

결과가 없으면:
[]
"""


def parse_response_json(text: str) -> List[Dict[str, Any]]:
    content = str(text or "").strip()
    if not content:
        return []
    if content.startswith("```"):
        parts = content.split("```")
        if len(parts) >= 2:
            content = parts[1]
            if content.startswith("json"):
                content = content[4:]
    content = content.strip()
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return []
    return payload if isinstance(payload, list) else []


def validate_results(
    raw_results: List[Dict[str, Any]],
    expected_names: List[str],
) -> Tuple[List[Dict[str, Any]], List[str]]:
    reasons: List[str] = []
    by_name: Dict[str, Dict[str, Any]] = {}

    for item in raw_results:
        name = normalize_name(item.get("candidateName"))
        if not is_valid_candidate_name(name):
            continue

        try:
            support = float(item.get("support"))
        except (TypeError, ValueError):
            continue
        if support < 0.5 or support > 85:
            continue

        party = normalize_party(item.get("partyRaw") or item.get("party") or "")
        existing = by_name.get(name)
        if existing and existing["support"] >= support:
            continue
        by_name[name] = {
            "candidateName": name,
            "party": party,
            "partyRaw": str(item.get("partyRaw") or ""),
            "support": round(support, 1),
        }

    validated = sorted(by_name.values(), key=lambda row: (-row["support"], row["candidateName"]))
    if len(validated) < 2:
        reasons.append("too_few_valid_results")
        return [], reasons

    expected_set = {normalize_name(name) for name in expected_names if is_valid_candidate_name(normalize_name(name))}
    overlap = [row for row in validated if row["candidateName"] in expected_set]
    if expected_set and len(overlap) >= 2:
        validated = overlap
    elif expected_set and not overlap:
        reasons.append("no_expected_name_overlap")

    return validated[:7], reasons


def build_report_row(
    *,
    poll: Dict[str, Any],
    status: str,
    model: str,
    expected_names: List[str],
    raw_results: List[Dict[str, Any]],
    validated_results: List[Dict[str, Any]],
    reasons: List[str],
    error: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "status": status,
        "model": model,
        "nttId": poll.get("nttId"),
        "title": poll.get("title"),
        "regionKey": poll.get("regionKey"),
        "municipality": poll.get("municipality"),
        "electionType": poll.get("electionType"),
        "expectedNames": expected_names,
        "rawResults": raw_results,
        "validatedResults": validated_results,
        "reasons": reasons,
        "error": error,
    }


def append_report(rows: List[Dict[str, Any]], report_path: Path) -> None:
    if not rows:
        return
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with report_path.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def extract_pdf_preview_text(pdf_path: Path, *, max_pages: int = 4) -> str:
    pdftotext_path = shutil.which("pdftotext")
    if not pdftotext_path:
        return ""
    try:
        completed = subprocess.run(
            [
                pdftotext_path,
                "-f",
                "1",
                "-l",
                str(max_pages),
                "-layout",
                str(pdf_path),
                "-",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        return ""

    if completed.returncode != 0:
        return ""
    return completed.stdout[:20000]


def classify_pdf_preview(preview_text: str) -> Optional[str]:
    normalized = re.sub(r"\s+", " ", str(preview_text or "")).strip()
    if not normalized:
        return None

    questionnaire_hits = sum(1 for hint in QUESTIONNAIRE_HINTS if hint in normalized)
    result_hits = sum(1 for hint in RESULT_PREVIEW_HINTS if hint in normalized)
    has_numeric_table = bool(
        re.search(r"\(\s*%\s*\)|±\s*\d|\d{1,2}\.\d\s*%|\b\d{1,3},\d{3}\b", normalized)
    )
    repeated_question_tone = len(re.findall(r"(귀하께서는|선생님께서는|모름/무응답|잘 모르시면)", normalized)) >= 4

    if (questionnaire_hits >= 4 or repeated_question_tone) and result_hits == 0 and not has_numeric_table:
        return "questionnaire_preview"
    return None


def generate_with_gemini(prompt: str, pdf_bytes: bytes, api_key: str, model: str) -> str:
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model,
            contents=[
                types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                prompt,
            ],
            config=types.GenerateContentConfig(
                temperature=0,
                response_mime_type="application/json",
            ),
        )
        return getattr(response, "text", "") or ""
    except Exception as primary_error:
        try:
            import google.generativeai as legacy_genai

            legacy_genai.configure(api_key=api_key)
            legacy_model = legacy_genai.GenerativeModel(model)
            response = legacy_model.generate_content(
                [
                    {"mime_type": "application/pdf", "data": pdf_bytes},
                    prompt,
                ],
                generation_config={
                    "temperature": 0,
                    "response_mime_type": "application/json",
                    "max_output_tokens": 2048,
                },
            )
            return getattr(response, "text", "") or ""
        except Exception as fallback_error:
            raise RuntimeError(f"Gemini call failed: {primary_error}; fallback failed: {fallback_error}")


def select_targets(
    polls: List[Dict[str, Any]],
    args: argparse.Namespace,
) -> List[Tuple[Dict[str, Any], Path]]:
    selected: List[Tuple[Dict[str, Any], Path]] = []
    allowed_election_types = {"mayor", "district_mayor", "superintendent"}
    for poll in polls:
        ntt_id = poll.get("nttId")
        pdf_path = PDF_DIR / f"{ntt_id}.pdf"
        if not pdf_path.exists():
            continue
        if not poll.get("regionKey"):
            continue
        if poll.get("electionType") not in allowed_election_types:
            continue
        if args.ntt_id and ntt_id not in args.ntt_id:
            continue
        if args.region_key and poll.get("regionKey") != args.region_key:
            continue
        if args.election_type and poll.get("electionType") != args.election_type:
            continue
        if args.municipality and poll.get("municipality") != args.municipality:
            continue
        if not args.force and poll.get("results"):
            continue
        selected.append((poll, pdf_path))
    return selected[: args.limit] if args.limit else selected


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Gemini fallback extractor for NESDC poll PDFs")
    parser.add_argument("--limit", type=int, default=0, help="최대 처리 건수 (0=전부)")
    parser.add_argument("--dry-run", action="store_true", help="대상만 확인하고 API 호출은 하지 않음")
    parser.add_argument("--force", action="store_true", help="기존 results가 있어도 다시 추출")
    parser.add_argument("--region-key", help="특정 regionKey만 처리")
    parser.add_argument("--election-type", help="특정 electionType만 처리")
    parser.add_argument("--municipality", help="특정 시군구만 처리")
    parser.add_argument("--ntt-id", action="append", type=int, help="특정 nttId만 처리 (여러 번 사용 가능)")
    parser.add_argument("--sleep", type=float, default=2.0, help="API 호출 간 대기 초")
    parser.add_argument("--report", default=str(REPORT_PATH), help="JSONL 보고서 경로")
    parser.add_argument("--allow-questionnaire", action="store_true", help="설문지형 preview라도 강제로 Gemini 호출")
    return parser.parse_args()


def main() -> None:
    load_env()
    args = parse_args()
    api_key = os.environ.get(API_KEY_ENV, "").strip()
    if not args.dry_run and not api_key:
        print(f"❌ {API_KEY_ENV}가 없습니다.")
        print("   .env 또는 환경변수에 GEMINI_API_KEY를 넣고 다시 실행하세요.")
        sys.exit(1)

    state = load_state()
    polls = state.get("polls") or []
    if not polls:
        print("No polls data.")
        return

    governor_candidates = load_governor_candidates()
    targets = select_targets(polls, args)
    print(f"대상 {len(targets)}건")
    if args.dry_run:
        for poll, pdf_path in targets[:20]:
            preview_reason = classify_pdf_preview(extract_pdf_preview_text(pdf_path))
            suffix = f" | skip={preview_reason}" if preview_reason else ""
            print(f"- nttId={poll.get('nttId')} | {poll.get('title')} | {pdf_path.name}{suffix}")
        return

    report_rows: List[Dict[str, Any]] = []
    updated = 0
    accepted = 0

    for index, (poll, pdf_path) in enumerate(targets, start=1):
        expected_names = build_expected_candidate_names(poll, polls, governor_candidates)
        print(f"[{index}/{len(targets)}] nttId={poll.get('nttId')} {pdf_path.name}")
        preview_reason = classify_pdf_preview(extract_pdf_preview_text(pdf_path))
        if preview_reason and not args.allow_questionnaire:
            print("  ⏭ skipped", preview_reason)
            report_rows.append(
                build_report_row(
                    poll=poll,
                    status="skipped",
                    model=MODEL,
                    expected_names=expected_names,
                    raw_results=[],
                    validated_results=[],
                    reasons=[preview_reason],
                )
            )
            continue
        try:
            prompt = build_prompt(poll, expected_names)
            raw_text = generate_with_gemini(prompt, pdf_path.read_bytes(), api_key, MODEL)
            raw_results = parse_response_json(raw_text)
            validated_results, reasons = validate_results(raw_results, expected_names)

            if validated_results:
                poll["results"] = validated_results
                poll["resultsSource"] = "gemini-fallback"
                poll["resultsUpdatedAt"] = datetime.now().isoformat(timespec="seconds")
                updated += 1
                accepted += 1
                print("  ✅", ", ".join(f"{row['candidateName']} {row['support']}%" for row in validated_results[:4]))
                report_rows.append(
                    build_report_row(
                        poll=poll,
                        status="accepted",
                        model=MODEL,
                        expected_names=expected_names,
                        raw_results=raw_results,
                        validated_results=validated_results,
                        reasons=reasons,
                    )
                )
            else:
                print("  ⏭ rejected", ", ".join(reasons) or "no_valid_results")
                report_rows.append(
                    build_report_row(
                        poll=poll,
                        status="rejected",
                        model=MODEL,
                        expected_names=expected_names,
                        raw_results=raw_results,
                        validated_results=[],
                        reasons=reasons or ["no_valid_results"],
                    )
                )
        except Exception as exc:
            print("  ❌", exc)
            report_rows.append(
                build_report_row(
                    poll=poll,
                    status="error",
                    model=MODEL,
                    expected_names=expected_names,
                    raw_results=[],
                    validated_results=[],
                    reasons=[],
                    error=str(exc),
                )
            )

        if args.sleep > 0 and index < len(targets):
            time.sleep(args.sleep)

    append_report(report_rows, Path(args.report))
    if updated:
        save_state(state)
        export_polls_json(state.get("polls") or [])
    print(f"완료: accepted={accepted}, updated={updated}, report={args.report}")


if __name__ == "__main__":
    main()
