#!/usr/bin/env python3
"""
Gemini 교차 검증 스크립트
프로젝트 코드를 수집하여 Gemini에 리뷰 요청 후 결과 저장
"""

import os
import json
from pathlib import Path
from google import genai

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REVIEW_OUTPUT = PROJECT_ROOT / "scripts" / "gemini_review_result.md"

API_KEY = os.environ.get("GEMINI_API_KEY", "")


def collect_project_summary():
    """프로젝트 핵심 코드 수집"""
    snippets = {}

    # map.js 핵심 부분 (상수 + 주요 함수 시그니처)
    map_js = PROJECT_ROOT / "js" / "map.js"
    if map_js.exists():
        lines = map_js.read_text(encoding="utf-8").splitlines()
        snippets["map.js (1-150)"] = "\n".join(lines[:150])
        snippets["map.js (switchToCouncilDistrictMap)"] = "\n".join(lines[1348:1470])
        snippets["map.js (switchToBasicCouncilMap)"] = "\n".join(lines[1745:1820])
        snippets["map.js (tooltips)"] = "\n".join(lines[1960:2080])

    # data.js Public API
    data_js = PROJECT_ROOT / "js" / "data.js"
    if data_js.exists():
        lines = data_js.read_text(encoding="utf-8").splitlines()
        snippets["data.js (regions sample)"] = "\n".join(lines[:80])
        snippets["data.js (public API)"] = "\n".join(lines[1758:1904])

    # app.js 구조
    app_js = PROJECT_ROOT / "js" / "app.js"
    if app_js.exists():
        lines = app_js.read_text(encoding="utf-8").splitlines()
        snippets["app.js (header)"] = "\n".join(lines[:60])
        snippets["app.js (council view)"] = "\n".join(lines[1138:1240])

    # index.html 구조
    index_html = PROJECT_ROOT / "index.html"
    if index_html.exists():
        lines = index_html.read_text(encoding="utf-8").splitlines()
        snippets["index.html (head+scripts)"] = "\n".join(lines[:60]) + "\n...\n" + "\n".join(lines[-30:])

    # CSS 핵심
    style_css = PROJECT_ROOT / "css" / "style.css"
    if style_css.exists():
        lines = style_css.read_text(encoding="utf-8").splitlines()
        snippets["style.css (variables+layout)"] = "\n".join(lines[:80])

    # dissolve 파이프라인
    dissolve = PROJECT_ROOT / "scripts" / "council_pipeline" / "dissolve_districts.py"
    if dissolve.exists():
        lines = dissolve.read_text(encoding="utf-8").splitlines()
        snippets["dissolve_districts.py (core)"] = "\n".join(lines[:120])

    # 매핑 샘플
    sample_mapping = PROJECT_ROOT / "data" / "council" / "district_mapping_seoul.json"
    if sample_mapping.exists():
        data = json.loads(sample_mapping.read_text(encoding="utf-8"))
        snippets["district_mapping_seoul.json (sample)"] = json.dumps({
            "sido": data["sido"],
            "sido_code": data["sido_code"],
            "total_districts": len(data["districts"]),
            "districts_sample": data["districts"][:3]
        }, ensure_ascii=False, indent=2)

    # 파일 통계
    council_files = list((PROJECT_ROOT / "data" / "council").glob("*"))
    basic_files = list((PROJECT_ROOT / "data" / "basic_council").glob("*"))
    js_files = list((PROJECT_ROOT / "js").glob("*.js"))

    snippets["__file_stats__"] = json.dumps({
        "js_files": [f.name for f in js_files],
        "council_data_files": len(council_files),
        "basic_council_data_files": len(basic_files),
        "total_js_lines": sum(
            len(f.read_text(encoding="utf-8").splitlines())
            for f in js_files if f.exists()
        )
    }, ensure_ascii=False, indent=2)

    return snippets


def build_review_prompt(snippets):
    """검증 프롬프트 생성"""
    code_sections = "\n\n".join(
        f"### {name}\n```\n{code}\n```"
        for name, code in snippets.items()
    )

    return f"""당신은 소프트웨어 아키텍처 및 한국 선거 데이터 전문가입니다.
아래 프로젝트의 실제 코드를 검토하고 기획/구현/데이터 측면에서 피드백을 한글로 제공해주세요.

# 프로젝트: 2026 전국지방선거 인터랙티브 선거 정보 지도

## 개요
- 6.3 전국지방선거(제9회) 정보를 인터랙티브 지도로 시각화
- 전국 → 시도 → 시군구 → 선거구 드릴다운 탐색
- Vanilla JS + D3.js v7 + TopoJSON (빌드 도구 없음)
- Python (GeoPandas) 데이터 파이프라인: 조례 파싱 → dissolve → TopoJSON

## 선거 유형 8개
governor(시도지사), mayor(기초단체장), council(광역의원), localCouncil(기초의원),
superintendent(교육감), councilProportional(광역비례), localCouncilProportional(기초비례), byElection(재보궐)

## 커버리지
- 광역의원: 781/781 선거구 (17개 시도 100%)
- 기초의원: 1007/1024 선거구 (15개 시도 98.3%, 세종/제주 제외)
- 비례대표: 실데이터 (2022 제8회 기준)
- 후보/여론조사: Mock 데이터

## 실제 코드

{code_sections}

## 검토 요청사항

### 1. 아키텍처 평가
- Vanilla JS 대형 파일(map.js 2,700줄) 구조의 유지보수성
- map.js / app.js / data.js 3파일 체계 적절성
- 전역 변수 기반 상태 관리 평가

### 2. 데이터 파이프라인 평가
- 조례 텍스트 → JSON 매핑 → GeoJSON dissolve → TopoJSON 흐름
- 행정동 기반 dissolve의 한계점
- DONG_ALIASES, 읍/면 분할 처리 방식

### 3. UX/기획 평가
- 8개 선거 유형 네비게이션 직관성
- 드릴다운 깊이(최대 4단계) 적절성
- 다크 테마 단독 제공의 적합성
- 모바일 대응

### 4. 데이터 정확성
- 2026년 선거구(세종 확정 / 제주 2022 기준) 혼용
- Mock 데이터와 실데이터 혼용 시 사용자 혼란
- 갑/을 분구 통합 표시 방식

### 5. 성능/배포
- 빌드 도구 없는 프로덕션 배포
- TopoJSON 파일 크기 및 lazy loading 전략
- CDN 의존성 관리

각 영역별로 [잘된 점], [개선 권장], [위험 요소]로 구분해서 답변해주세요.
구체적인 코드 수정보다는 방향성 피드백 위주로 해주세요.
"""


def main():
    print("📋 프로젝트 코드 수집 중...")
    snippets = collect_project_summary()
    print(f"  → {len(snippets)}개 코드 섹션 수집 완료")

    print("🔧 검증 프롬프트 생성 중...")
    prompt = build_review_prompt(snippets)
    print(f"  → 프롬프트 길이: {len(prompt):,}자")

    print("🤖 Gemini API 호출 중...")
    client = genai.Client(api_key=API_KEY)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    result = response.text
    print(f"  → 응답 길이: {len(result):,}자")

    # 결과 저장
    REVIEW_OUTPUT.write_text(
        f"# Gemini 교차 검증 결과\n\n"
        f"생성일: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
        f"모델: gemini-2.5-flash\n\n"
        f"---\n\n{result}\n",
        encoding="utf-8"
    )
    print(f"\n✅ 결과 저장: {REVIEW_OUTPUT}")


if __name__ == "__main__":
    main()
