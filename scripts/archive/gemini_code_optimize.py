#!/usr/bin/env python3
"""
Gemini 2회 크로스체크 코드 최적화 스크립트
최근 수정된 map.js / app.js / data.js / css/style.css 대상
Round 1: 비효율 및 개선 포인트 식별
Round 2: Round 1 결과를 바탕으로 구체적 수정 코드 생성
"""

import os, time
from pathlib import Path
from datetime import datetime
from google import genai

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "scripts" / "gemini_reviews" / "optimize"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

API_KEY = os.environ.get("GEMINI_API_KEY", "")
MODEL   = "gemini-2.5-flash"

# ── 파일 수집 ──────────────────────────────────────────────────────────────────
def load_files():
    files = {}

    # map.js 핵심 섹션 (최근 수정 부분 위주)
    p = PROJECT_ROOT / "js" / "map.js"
    if p.exists():
        text = p.read_text("utf-8")
        lines = text.splitlines()
        total = len(lines)
        files["map.js_전체길이"] = f"{total}줄"
        # 1~320: 상수/초기화/색상 로직 (세종/제주 비활성 포함)
        files["map.js_1_constants_color"] = "\n".join(lines[0:320])
        # 833~960: handleRegionSelection, selectRegion, updateMapColors (비활성 차단)
        files["map.js_2_selection_logic"] = "\n".join(lines[833:960])
        # 1885~1920: getBasicCouncilSigungu (리팩토링된 핵심 함수)
        files["map.js_3_getBasicCouncilSigungu"] = "\n".join(lines[1885:1925])
        # 680~810: 툴팁 렌더링 (세종/제주 분기 포함)
        files["map.js_4_tooltip_localCouncil"] = "\n".join(lines[680:810])

    # app.js 핵심 섹션
    p = PROJECT_ROOT / "js" / "app.js"
    if p.exists():
        text = p.read_text("utf-8")
        lines = text.splitlines()
        files["app.js_전체길이"] = f"{len(lines)}줄"
        # renderLocalCouncilProvinceView (세종/제주 처리 포함)
        start = next((i for i, l in enumerate(lines) if "renderLocalCouncilProvinceView" in l and "function" in l), 0)
        files["app.js_1_localCouncilView"] = "\n".join(lines[start:start+60])
        # renderCandidatesTab / renderHistoryTab
        start2 = next((i for i, l in enumerate(lines) if "function renderCandidatesTab" in l), 0)
        files["app.js_2_candidatesTab"] = "\n".join(lines[start2:start2+80])
        start3 = next((i for i, l in enumerate(lines) if "function renderHistoryTab" in l), 0)
        files["app.js_3_historyTab"] = "\n".join(lines[start3:start3+120])
        # setupPanelResize + initDeepLink
        start4 = next((i for i, l in enumerate(lines) if "function setupPanelResize" in l), 0)
        files["app.js_4_resize_deeplink"] = "\n".join(lines[start4:start4+100])
        # renderNewsTab (뉴스 점수 알고리즘)
        start5 = next((i for i, l in enumerate(lines) if "function calcTimeScore" in l), 0)
        files["app.js_5_news_scoring"] = "\n".join(lines[start5:start5+120])

    # data.js 핵심
    p = PROJECT_ROOT / "js" / "data.js"
    if p.exists():
        text = p.read_text("utf-8")
        lines = text.splitlines()
        files["data.js_전체길이"] = f"{len(lines)}줄"
        files["data.js_1_parties_historicalNames"] = "\n".join(lines[0:45])
        # historicalElections 첫 번째 지역 (서울)
        start = next((i for i, l in enumerate(lines) if "const historicalElections" in l), 0)
        files["data.js_2_historicalElections_sample"] = "\n".join(lines[start:start+40])
        # public API
        api_start = next((i for i, l in enumerate(lines) if "return {" in l and i > len(lines)//2), 0)
        files["data.js_3_publicAPI"] = "\n".join(lines[api_start:api_start+60])

    # css/style.css 최근 추가 섹션
    p = PROJECT_ROOT / "css" / "style.css"
    if p.exists():
        text = p.read_text("utf-8")
        # region-disabled, panel-resize-handle, news 관련 섹션 추출
        sections = []
        keywords = [".region-disabled", ".panel-resize-handle", ".news-tab-header",
                    ".news-card", ".hpf-", ".ht-table", ".candidate-card-full",
                    ".history-", ".issues-empty"]
        for kw in keywords:
            idx = text.find(kw)
            if idx >= 0:
                sections.append(text[idx:idx+400])
        files["style.css_new_sections"] = "\n\n/* --- */\n\n".join(sections[:8])

    # charts.js
    p = PROJECT_ROOT / "js" / "charts.js"
    if p.exists():
        files["charts.js"] = p.read_text("utf-8")[:4000]

    return files


# ── Round 1 프롬프트 ──────────────────────────────────────────────────────────
ROUND1_PROMPT = """당신은 시니어 프론트엔드 엔지니어이자 JavaScript/CSS 최적화 전문가입니다.
아래는 2026 한국 지방선거 인터랙티브 지도 프로젝트의 최근 수정된 코드입니다.
(Vanilla JS + D3.js v7 + TopoJSON, 빌드 도구 없음)

## 최근 추가/수정된 주요 기능
1. 세종/제주 기초의원 비활성 처리 (map.js, app.js)
2. getBasicCouncilSigungu → MULTI_GU_SINGLE_MAYOR_CITIES 재활용 리팩토링
3. 후보자 탭 / 역대비교 탭 / 뉴스탭 v2 (app.js)
4. 패널 리사이즈 (드래그) + 딥링킹 (URL Hash)
5. 역대 선거 데이터 17개 시도 (data.js)
6. 뉴스 복합 점수 알고리즘 (app.js)

## 분석 대상 코드

{code_sections}

---

## 검토 요청: 효율화 및 최적화 (한글로 답변)

### A. JavaScript 성능/비효율
1. 반복되는 DOM querySelector 호출 → 캐싱 가능한 곳
2. 불필요한 재렌더링 또는 중복 계산
3. 클로저/이벤트 리스너 메모리 누수 가능성
4. 큰 배열/객체 탐색에서 O(n) → O(1) 개선 가능한 곳
5. async/await 또는 Promise 체이닝 개선 여지

### B. 코드 구조/중복 제거
1. 세 곳 이상 반복되는 패턴 → 공통 함수 추출 대상
2. data.js의 regions 객체 내 중복 구조 (candidates 빈 배열 등)
3. `if (el) el.innerHTML = ...` 패턴 반복 → 유틸 함수화
4. 이벤트 위임(delegation)으로 리팩토링 가능한 곳

### C. CSS 최적화
1. 중복 선언 또는 오버라이드로 인한 specificity 문제
2. !important 과다 사용
3. 애니메이션/transition 성능 (transform/opacity vs layout-triggering properties)
4. CSS 변수(custom properties) 추가 활용 가능한 하드코딩 색상

### D. 렌더링 로직
1. renderHistoryTab의 Chart.js 인스턴스 관리 (destroy/create 패턴)
2. 뉴스 점수 알고리즘의 calcTimeScore/calcCredibilityScore 호출 최적화
3. 비례대표 렌더링 시 동일 데이터 중복 fetch 여부

### E. 중요도 분류
각 발견사항을 아래 형식으로 정리:
- [HIGH] 실제 성능/버그 영향 있는 문제
- [MED] 코드 품질/유지보수 개선
- [LOW] 스타일/선호도 이슈

반드시 **파일명과 라인 컨텍스트**를 포함해서 구체적으로 지적해주세요.
"""

# ── Round 2 프롬프트 ──────────────────────────────────────────────────────────
ROUND2_PROMPT = """Round 1에서 식별된 문제점들에 대해 **실제로 적용 가능한 수정 코드**를 제공해주세요.

## Round 1 분석 결과
{round1_result}

---

## 요청사항

### 1. HIGH 우선순위 항목 즉시 수정 코드
각 HIGH 항목에 대해:
```
// 파일명: xxx.js / style.css
// 문제: [설명]
// 수정 전:
[기존 코드]
// 수정 후:
[개선 코드]
// 효과: [설명]
```

### 2. MED 우선순위 - 공통 유틸 함수 제안
반복 패턴을 추출한 유틸리티 함수 코드를 제공해주세요.
기존 코드 구조(IIFE 모듈 패턴, 빌드 도구 없음)에 맞게 작성.

### 3. CSS 개선안
- CSS 변수 추가 정의 (`:root` 블록에 추가할 내용)
- !important 제거 가능한 곳의 specificity 수정

### 4. 적용 우선순위 최종 정리
아래 형식으로 정리:
| 우선순위 | 파일 | 변경 위치 | 내용 | 예상 효과 |
|---------|------|---------|------|---------|

### 5. 크로스체크
Round 1의 제안사항 중:
- 이 프로젝트 구조(빌드 도구 없음, CDN 의존)에서 실제로 적용 불가능한 것
- 다른 부분과 충돌 가능성이 있는 것
- 수정 시 주의사항

반드시 **복사해서 바로 적용 가능한 코드** 수준으로 작성해주세요.
"""


def call_gemini(prompt: str, retries: int = 4) -> str:
    client = genai.Client(api_key=API_KEY)
    for attempt in range(retries):
        try:
            response = client.models.generate_content(model=MODEL, contents=prompt)
            return response.text
        except Exception as e:
            msg = str(e)
            wait = 30 * (attempt + 1)
            if attempt < retries - 1 and ("503" in msg or "429" in msg or "UNAVAILABLE" in msg):
                print(f"   ⚠ API 오류 ({msg[:60]}...) → {wait}초 후 재시도 ({attempt+1}/{retries})")
                time.sleep(wait)
            else:
                raise


def main():
    print("=" * 60)
    print("Gemini 2회 크로스체크 코드 최적화")
    print(f"모델: {MODEL}")
    print("=" * 60)

    print("\n📁 파일 수집 중...")
    files = load_files()
    code_sections = "\n\n".join(
        f"### [{name}]\n```\n{code}\n```" for name, code in files.items()
    )
    print(f"   → {len(files)}개 섹션 ({sum(len(v) for v in files.values()):,}자)")

    # ── Round 1 ──
    print("\n🔍 Round 1: 비효율 및 개선 포인트 식별...")
    r1_prompt = ROUND1_PROMPT.replace("{code_sections}", code_sections)
    print(f"   프롬프트: {len(r1_prompt):,}자 → API 전송")
    r1_result = call_gemini(r1_prompt)
    print(f"   응답: {len(r1_result):,}자")

    r1_path = OUTPUT_DIR / "round1_analysis.md"
    r1_path.write_text(
        f"# Round 1: 비효율 식별\n생성: {datetime.now():%Y-%m-%d %H:%M} | 모델: {MODEL}\n\n---\n\n{r1_result}",
        encoding="utf-8"
    )
    print(f"   💾 저장: {r1_path.name}")

    time.sleep(4)

    # ── Round 2 ──
    print("\n🔧 Round 2: 구체적 수정 코드 생성...")
    r2_prompt = ROUND2_PROMPT.replace("{round1_result}", r1_result)
    print(f"   프롬프트: {len(r2_prompt):,}자 → API 전송")
    r2_result = call_gemini(r2_prompt)
    print(f"   응답: {len(r2_result):,}자")

    r2_path = OUTPUT_DIR / "round2_fixes.md"
    r2_path.write_text(
        f"# Round 2: 수정 코드\n생성: {datetime.now():%Y-%m-%d %H:%M} | 모델: {MODEL}\n\n---\n\n{r2_result}",
        encoding="utf-8"
    )
    print(f"   💾 저장: {r2_path.name}")

    # ── 통합 보고서 ──
    final_path = OUTPUT_DIR / "optimization_report.md"
    final_path.write_text(
        f"# 코드 최적화 크로스체크 보고서\n"
        f"생성: {datetime.now():%Y-%m-%d %H:%M} | 모델: {MODEL}\n\n"
        f"{'='*50}\n## Round 1: 비효율 식별\n{'='*50}\n\n{r1_result}\n\n"
        f"{'='*50}\n## Round 2: 수정 코드\n{'='*50}\n\n{r2_result}\n",
        encoding="utf-8"
    )

    print(f"\n✅ 완료!")
    print(f"   📄 통합 보고서: {final_path}")
    print(f"   📄 Round 1: {r1_path.name}")
    print(f"   📄 Round 2: {r2_path.name}")


if __name__ == "__main__":
    main()
