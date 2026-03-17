#!/usr/bin/env python3
"""
Gemini 왕복 5회 심층 검증 스크립트
UI/UX, 가독성, 수치 팩트체크를 3개 영역으로 나누어
각 영역에서 Gemini와 5회 왕복하며 딥러닝 방식으로 교차 검증
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime
from google import genai

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "scripts" / "gemini_reviews" / "iterative"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

API_KEY = os.environ.get("GEMINI_API_KEY", "")
MODEL = "gemini-2.5-flash"

# ── 프로젝트 데이터 수집 ──
def load_project_context():
    ctx = {}

    # index.html
    p = PROJECT_ROOT / "index.html"
    if p.exists():
        ctx["index_html"] = p.read_text("utf-8")

    # data.js (정당, 지역, 인구 등)
    p = PROJECT_ROOT / "js" / "data.js"
    if p.exists():
        ctx["data_js"] = p.read_text("utf-8")[:12000]

    # app.js (패널, 비례대표 뷰 등)
    p = PROJECT_ROOT / "js" / "app.js"
    if p.exists():
        text = p.read_text("utf-8")
        ctx["app_js_proportional"] = text[text.find("proportionalConfig"):text.find("proportionalConfig") + 3000] if "proportionalConfig" in text else ""
        ctx["app_js_stats"] = text[:3000]

    # style.css (주요 스타일)
    p = PROJECT_ROOT / "css" / "style.css"
    if p.exists():
        text = p.read_text("utf-8")
        ctx["css_key_sections"] = text[:5000]

    # charts.js
    p = PROJECT_ROOT / "js" / "charts.js"
    if p.exists():
        ctx["charts_js"] = p.read_text("utf-8")

    # 비례대표 데이터
    p = PROJECT_ROOT / "data" / "proportional_council.json"
    if p.exists():
        ctx["proportional_council"] = p.read_text("utf-8")[:4000]

    p = PROJECT_ROOT / "data" / "proportional_local_council.json"
    if p.exists():
        ctx["proportional_local_council"] = p.read_text("utf-8")[:4000]

    return ctx


# ── 3개 검증 영역 정의 ──
REVIEW_TRACKS = [
    {
        "id": "ui_ux",
        "title": "UI/UX 인터페이스 검증",
        "system_context": """당신은 한국 정치 정보 시각화 웹 프로젝트의 UI/UX 전문 리뷰어입니다.
이 프로젝트는 2026년 6.3 전국지방선거 인터랙티브 지도입니다.
다크 테마(#0a0e17) 기반, D3.js+TopoJSON 지도, Chart.js 차트를 사용합니다.
모든 답변은 한글로 해주세요.""",
        "round_prompts": [
            # Round 1: 전체 구조 분석
            """아래는 프로젝트의 index.html과 주요 CSS입니다.
전체적인 UI 구조, 레이아웃, 네비게이션 흐름을 분석해주세요.

**분석 요청:**
1. 3컬럼 레이아웃 (좌측 사이드바 + 중앙 지도 + 우측 패널)의 적절성
2. 선거 종류 필터 8개 (광역단체장/교육감/기초단체장/광역의원/기초의원/광역비례/기초비례/재보궐) 배치의 직관성
3. 브레드크럼 네비게이션 (전국→시도→시군구→선거구) 4단계 드릴다운의 UX
4. 다크 테마에서 색상 대비 및 가독성 문제점 (WCAG 2.1 AA 기준)
5. 모바일 반응형 대응 상태

구체적인 문제점을 지적하고, 우선순위별로 개선 제안을 해주세요.

```html
{index_html}
```

```css
{css_key_sections}
```""",
            # Round 2: 이전 라운드 응답 기반 심화 (동적 생성)
            None,
            # Round 3
            None,
            # Round 4
            None,
            # Round 5: 최종 정리
            None
        ]
    },
    {
        "id": "readability",
        "title": "가독성 및 데이터 시각화 검증",
        "system_context": """당신은 데이터 시각화 및 정보 가독성 전문가입니다.
한국 지방선거 인터랙티브 지도 프로젝트를 검토합니다.
다크 테마(#0a0e17), D3.js 지도, Chart.js 차트를 사용합니다.
모든 답변은 한글로 해주세요.""",
        "round_prompts": [
            # Round 1: 차트/시각화 분석
            """아래는 프로젝트의 차트 모듈(charts.js)과 사이드 패널 관련 HTML입니다.
최근 도넛 차트를 제거하고 텍스트 바 리스트로 교체했습니다.

**분석 요청:**
1. 사이드 패널의 정보 위계 (선거 결과 → 현직자 → 핵심 이슈 → 여론조사) 가독성
2. 여론조사 차트 (막대 차트 + 추세 라인 차트 + 연령대별 차트)의 가독성
3. 정당 지지도를 도넛→텍스트 바 리스트로 변경한 것에 대한 평가
4. 지도 위 비례대표 라벨 (다수당 색상 원 + 의석수)의 가독성
5. 수치 표기 일관성 (%, 석, 명 등)
6. 다크 테마에서 텍스트/차트 색상 대비

구체적 개선안을 코드 레벨로 제안해주세요.

```javascript
{charts_js}
```

```html
{panel_html}
```

비례대표 관련 앱 코드:
```javascript
{app_js_proportional}
```""",
            None, None, None, None
        ]
    },
    {
        "id": "factcheck",
        "title": "수치 및 데이터 팩트체크",
        "system_context": """당신은 한국 선거 데이터 및 통계 전문 팩트체커입니다.
2026년 6.3 전국지방선거 인터랙티브 지도 프로젝트의 수치 정확성을 검증합니다.
2026년 3월 현재 시점 기준으로 검증해주세요.
모든 답변은 한글로 해주세요.""",
        "round_prompts": [
            # Round 1: 핵심 수치 검증
            """아래는 프로젝트의 data.js(정당/지역/인구 데이터)와 index.html의 수치들입니다.

**팩트체크 요청:**

1. **선거구 수 검증** (index.html 사이드바에 표시된 수치)
   - 광역단체장: 17
   - 교육감: 17
   - 기초단체장: 226
   - 광역의원: 789
   - 기초의원: 2,927
   - 광역비례: 47 (시도별 총 비례의석)
   - 기초비례: 120 (?)
   - 재보궐: 4
   이 수치들이 2026년 제9회 지방선거 기준으로 정확한가?

2. **17개 시도 인구/유권자 수 검증**
   data.js에 있는 인구·유권자 수가 최신 통계와 비교하여 적절한가?
   특히 세종시(388,000), 경기도(13,560,000)

3. **정당 정보 검증**
   - 현재 등록된 정당 목록과 일치하는가?
   - 당색(HEX 코드)이 공식 색상과 맞는가?
   - 조국혁신당(#0A1747) — 너무 어두운 색이 다크 테마에서 보이는가?

4. **지난 선거 결과(제8회) 검증**
   서울/부산/대구/인천/광주 5개 시도의 prevElection 데이터 검증

5. **선거일 정보**
   - 선거일: 2026.06.03 (수요일) — 맞는가?
   - 사전투표: 5.29~30 — 맞는가?

6. **비례대표 데이터**
   광역의원 비례대표 시도별 의석수와 공식 자료 비교

출처를 반드시 명시해주세요.

```javascript
{data_js}
```

비례대표 데이터:
```json
{proportional_council}
```""",
            None, None, None, None
        ]
    }
]


def call_gemini(messages, system_context):
    """Gemini API 호출 (대화 히스토리 포함)"""
    client = genai.Client(api_key=API_KEY)

    # 시스템 컨텍스트를 첫 메시지에 포함
    full_prompt = f"[시스템 컨텍스트]\n{system_context}\n\n"
    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        if role == "user":
            full_prompt += f"[사용자]\n{content}\n\n"
        else:
            full_prompt += f"[이전 답변]\n{content}\n\n"

    response = client.models.generate_content(
        model=MODEL,
        contents=full_prompt,
    )
    return response.text


def generate_followup(round_num, prev_response, track_id):
    """이전 라운드 응답을 기반으로 후속 질문 생성"""
    followup_templates = {
        2: """이전 분석에서 지적한 문제점들 중 **가장 심각한 3가지**에 대해 심층 분석해주세요.

각 문제에 대해:
1. 현재 상태의 구체적 문제 설명
2. 사용자 경험에 미치는 영향 (심각도 1-5)
3. 구체적 해결 코드/CSS 제안
4. 해결 우선순위

이전 분석:
{prev_response}""",
        3: """이전까지의 분석을 바탕으로, 놓친 부분이 없는지 재검토해주세요.

특히 다음을 확인:
1. 이전 분석에서 사실과 다른 부분이 있는가? (자기 교정)
2. 제안한 해결책이 다른 부분에 부작용을 일으킬 수 있는가?
3. 아직 다루지 않은 중요한 문제가 있는가?
4. 한국 사용자 특성(50대+ 유권자, 정치 정보 탐색 패턴)을 고려한 추가 제안

이전까지의 분석:
{prev_response}""",
        4: """지금까지의 모든 분석을 종합하여 **실행 가능한 액션 아이템**을 정리해주세요.

형식:
- 즉시 수정 (코드 변경 1시간 이내): [목록]
- 단기 개선 (1-3일): [목록]
- 중장기 개선 (1주+): [목록]

각 항목에 대해:
1. 무엇을 어디서 변경하는가 (파일명, 라인 범위)
2. 변경 전/후 코드 또는 디자인
3. 예상 효과

이전까지의 분석:
{prev_response}""",
        5: """최종 라운드입니다.

1. **종합 점수** (100점 만점으로 현재 상태 평가)
   - UI/UX 설계: ?/25
   - 가독성: ?/25
   - 데이터 정확성: ?/25
   - 접근성: ?/25

2. **핵심 요약** (5줄 이내)
   - 가장 잘된 점 2가지
   - 가장 시급한 개선 2가지

3. **최종 크로스체크**
   이전 라운드에서 제안한 수정사항들 중 서로 충돌하는 것은 없는가?
   최종 수정 권고를 우선순위 순으로 정리

이전까지의 전체 분석:
{prev_response}"""
    }

    template = followup_templates.get(round_num, followup_templates[5])
    return template.replace("{prev_response}", prev_response[-6000:])  # 토큰 제한


def run_track(track, project_ctx):
    """단일 트랙 5회 왕복 실행"""
    track_id = track["id"]
    title = track["title"]
    system_ctx = track["system_context"]

    print(f"\n{'='*60}")
    print(f"🔍 트랙: {title}")
    print(f"{'='*60}")

    conversation = []
    all_responses = []

    for round_num in range(1, 6):
        print(f"\n  📨 Round {round_num}/5 전송 중...")

        # 프롬프트 결정
        if round_num == 1:
            prompt = track["round_prompts"][0]
            # 데이터 주입
            prompt = prompt.replace("{index_html}", project_ctx.get("index_html", "N/A")[:8000])
            prompt = prompt.replace("{css_key_sections}", project_ctx.get("css_key_sections", "N/A"))
            prompt = prompt.replace("{charts_js}", project_ctx.get("charts_js", "N/A"))
            prompt = prompt.replace("{data_js}", project_ctx.get("data_js", "N/A"))
            prompt = prompt.replace("{proportional_council}", project_ctx.get("proportional_council", "N/A"))
            prompt = prompt.replace("{app_js_proportional}", project_ctx.get("app_js_proportional", "N/A"))
            # panel HTML은 index.html에서 추출
            idx_html = project_ctx.get("index_html", "")
            panel_start = idx_html.find('<aside id="detail-panel"')
            panel_end = idx_html.find('</aside>', panel_start) + 8 if panel_start >= 0 else 0
            prompt = prompt.replace("{panel_html}", idx_html[panel_start:panel_end] if panel_start >= 0 else "N/A")
        else:
            # 이전 응답 누적으로 후속 질문 생성
            accumulated = "\n\n---\n\n".join(
                f"[Round {i+1} 응답]\n{resp}" for i, resp in enumerate(all_responses)
            )
            prompt = generate_followup(round_num, accumulated, track_id)

        conversation.append({"role": "user", "content": prompt})

        try:
            response = call_gemini(conversation, system_ctx)
            conversation.append({"role": "assistant", "content": response})
            all_responses.append(response)

            # 라운드별 파일 저장
            round_path = OUTPUT_DIR / f"{track_id}_round{round_num}.md"
            round_path.write_text(
                f"# {title} - Round {round_num}/5\n\n"
                f"생성일: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
                f"모델: {MODEL}\n\n---\n\n{response}\n",
                encoding="utf-8"
            )
            print(f"  ✅ Round {round_num} 완료 ({len(response):,}자) → {round_path.name}")

        except Exception as e:
            print(f"  ❌ Round {round_num} 오류: {e}")
            all_responses.append(f"오류: {e}")

        # API 레이트 리밋 방지
        if round_num < 5:
            time.sleep(3)

    # 트랙 통합 결과 저장
    summary_path = OUTPUT_DIR / f"{track_id}_summary.md"
    summary = f"# {title} - 5라운드 통합 결과\n\n"
    summary += f"생성일: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
    summary += f"모델: {MODEL}\n\n"
    for i, resp in enumerate(all_responses):
        summary += f"\n{'='*40}\n## Round {i+1}/5\n{'='*40}\n\n{resp}\n"

    summary_path.write_text(summary, encoding="utf-8")
    print(f"\n  📊 통합 결과: {summary_path.name}")

    return all_responses


def main():
    print("🚀 Gemini 왕복 5회 심층 검증 시작")
    print(f"   출력 디렉토리: {OUTPUT_DIR}")
    print(f"   모델: {MODEL}")
    print(f"   트랙 수: {len(REVIEW_TRACKS)}")
    print(f"   총 API 호출: {len(REVIEW_TRACKS) * 5}회\n")

    print("📋 프로젝트 데이터 수집 중...")
    project_ctx = load_project_context()
    print(f"   수집 완료: {', '.join(project_ctx.keys())}")

    all_track_results = {}
    for track in REVIEW_TRACKS:
        results = run_track(track, project_ctx)
        all_track_results[track["id"]] = results

    # 최종 통합 보고서
    final_path = OUTPUT_DIR / "00_final_report.md"
    final = f"# Gemini 왕복 5회 심층 검증 최종 보고서\n\n"
    final += f"생성일: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
    final += f"모델: {MODEL}\n"
    final += f"총 라운드: {len(REVIEW_TRACKS)} 트랙 × 5 라운드 = {len(REVIEW_TRACKS) * 5}회\n\n"

    for track in REVIEW_TRACKS:
        tid = track["id"]
        final += f"\n{'#'*3} {track['title']}\n\n"
        results = all_track_results.get(tid, [])
        if results:
            # 마지막 라운드(최종 정리)만 포함
            final += f"{results[-1]}\n\n"
        final += f"---\n"

    final_path.write_text(final, encoding="utf-8")
    print(f"\n{'='*60}")
    print(f"🏁 전체 검증 완료!")
    print(f"   최종 보고서: {final_path}")
    print(f"   개별 결과: {OUTPUT_DIR}/")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
