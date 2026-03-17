#!/usr/bin/env python3
"""
Gemini 심층 교차 검증 스크립트
Claude가 약한 영역을 Gemini에게 검증 요청
"""

import os
import json
from pathlib import Path
from datetime import datetime
from google import genai

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "scripts" / "gemini_reviews"
OUTPUT_DIR.mkdir(exist_ok=True)

API_KEY = os.environ.get("GEMINI_API_KEY", "")

# 프로젝트 데이터 수집
def load_project_data():
    """검증에 필요한 프로젝트 데이터 로드"""
    data = {}

    # data.js에서 인구/정당 데이터 추출
    data_js = PROJECT_ROOT / "js" / "data.js"
    if data_js.exists():
        lines = data_js.read_text(encoding="utf-8").splitlines()
        data["data_js_parties"] = "\n".join(lines[7:60])
        data["data_js_regions_sample"] = "\n".join(lines[60:300])

    # 세종/제주 매핑
    for key in ["sejong", "jeju"]:
        p = PROJECT_ROOT / "data" / "council" / f"district_mapping_{key}.json"
        if p.exists():
            data[f"mapping_{key}"] = p.read_text(encoding="utf-8")

    # 비례대표 데이터
    prop = PROJECT_ROOT / "data" / "proportional_council.json"
    if prop.exists():
        data["proportional_council"] = prop.read_text(encoding="utf-8")[:3000]

    return data


PROMPTS = [
    {
        "id": "01_admin_personnel",
        "title": "현직 단체장 및 권한대행 현황 검증",
        "prompt": """2026년 3월 현재 기준으로 다음 정보를 공식 출처에서 검증해주세요.
한글로 답변해주세요.

1. **세종특별자치시 광역의원 선거구**
   - 우리 데이터: 18개 선거구 (16개 지리적 구역, 조치원읍·고운동은 분구 통합)
   - 2026년 확정된 선거구 구역표와 비교하여 맞는지 확인
   - 특히 제4선거구(해밀동, 연기면, 연동면, 연서면)에서 연서면이 제5로 이동한 변경사항 반영 여부

2. **제주특별자치도 광역의원 선거구**
   - 우리 데이터: 32개 선거구 (2022년 제8회 기준)
   - 2026년 제9회 선거를 위한 선거구 획정이 확정되었는가?
   - 확정되었다면 변경된 선거구 목록
   - 미확정이면 현재 진행 상황

3. **2026년 3월 기준 권한대행 기초단체장**
   - 대선/광역단체장 출마로 인한 사퇴 기초단체장 목록
   - 각 권한대행자 이름과 직책

각 답변에 출처(선관위, 법제처, 시도청 웹사이트)를 명시해주세요.

{sejong_data}
{jeju_data}
"""
    },
    {
        "id": "02_party_verification",
        "title": "2026년 정당 현황 및 당색 검증",
        "prompt": """2026년 3월 현재 한국 정당 현황을 검증해주세요.
한글로 답변해주세요.

우리 프로젝트에서 사용 중인 정당 데이터:

```javascript
{party_data}
```

검증 요청:

1. **등록정당 현황** (중앙선거관리위원회 기준)
   - 더불어민주당, 국민의힘, 조국혁신당, 개혁신당, 정의당, 진보당, 녹색정의당, 새로운미래
   - 각 정당이 2026년 3월 현재 존속하는가?
   - 당명 변경이 있었는가?
   - 합당/해산된 정당이 있는가?

2. **공식 당색(Party Color) 검증**
   우리 사용 색상:
   | 정당 | HEX 코드 |
   |------|----------|
   | 더불어민주당 | #2E8BFF |
   | 국민의힘 | #E61E2B |
   | 조국혁신당 | #0A1747 |
   | 개혁신당 | #FF7210 |
   | 정의당 | #FFCC00 |
   | 진보당 | #D6001C |
   | 녹색정의당 | #1B9E43 |
   | 새로운미래 | #45B97C |

   각 정당의 2026년 공식 색상과 비교하여 차이가 있으면 알려주세요.

3. **2026년 지방선거 비례대표 배분 규칙**
   - 광역의회/기초의회 비례대표 산출 방식에 변경이 있는가?
   - 봉쇄조항(5%) 유지 여부

출처를 반드시 명시해주세요.
"""
    },
    {
        "id": "03_population",
        "title": "2026년 인구 및 유권자 통계 검증",
        "prompt": """2026년 최신 인구 통계를 검증해주세요.
한글로 답변해주세요.

우리 프로젝트의 인구 데이터 (2022년 기준 추정치):

| 시도 | 인구 | 유권자 |
|------|------|--------|
| 서울 | 9,411,000 | 8,234,000 |
| 부산 | 3,350,000 | 2,890,000 |
| 대구 | 2,385,000 | 2,050,000 |
| 인천 | 2,948,000 | 2,520,000 |
| 광주 | 1,441,000 | 1,230,000 |
| 대전 | 1,452,000 | 1,240,000 |
| 울산 | 1,121,000 | 950,000 |
| 세종 | 388,000 | 310,000 |
| 경기 | 13,560,000 | 11,500,000 |
| 강원 | 1,574,000 | 1,330,000 |
| 충북 | 1,631,000 | 1,380,000 |
| 충남 | 2,171,000 | 1,840,000 |
| 전북 | 1,749,000 | 1,485,000 |
| 전남 | 1,810,000 | 1,540,000 |
| 경북 | 2,598,000 | 2,200,000 |
| 경남 | 3,365,000 | 2,850,000 |
| 제주 | 675,000 | 570,000 |

검증 요청:

1. **통계청 2025-2026년 최신 인구 데이터**와 비교
   - 10% 이상 차이나는 지역이 있는가?
   - 세종시 인구 급증 현황 (2022 대비)
   - 수도권 인구 집중 현황

2. **선거구 획정에 영향을 미치는 인구 변화**
   - 의원 정수 변경이 예상되는 시도
   - 인구 감소로 선거구 통합이 필요한 지역

출처: 통계청(KOSTAT), 주민등록인구통계
"""
    },
    {
        "id": "04_boundary_changes",
        "title": "2022-2026 행정구역 변경사항 검증",
        "prompt": """2022년 이후 한국 행정구역 변경사항을 검증해주세요.
한글로 답변해주세요.

우리 프로젝트는 `hangjeongdong_2026.geojson` (2026년 행정동 경계)을 기반으로 합니다.

검증 요청:

1. **2022-2026 행정동 통합/분할 사례**
   - 부천시: 2024년 행정동 대규모 재편 (원미1동→부천동 등)
     우리 대응: DONG_ALIASES 매핑 테이블 사용
     누락된 변경사항이 있는가?

   - 경기도 다른 시의 행정동 재편 사례
   - 충청/전라/경상도의 행정동 변경

2. **군위군 대구 편입** (2023.7.1)
   - 우리 데이터: 경상북도 매핑에 군위군 선거구 포함
   - 대구광역시로 편입 후 선거구 재배정 현황

3. **읍/면 승격 또는 폐합 사례**
   - 2022-2026 기간 읍→동, 면→읍 승격 사례
   - 리 통합/분할 사례

4. **제주도 행정체제 개편**
   - 기초자치단체 설치 논의 현황
   - 2026년 지방선거에 영향 여부

각 변경사항에 대해:
- 변경 전 → 변경 후
- 시행일
- 관련 법령/조례
를 명시해주세요.
"""
    }
]


def run_review(prompt_config, project_data):
    """단일 검증 실행"""
    prompt_text = prompt_config["prompt"]

    # 데이터 주입
    prompt_text = prompt_text.replace("{sejong_data}",
        f"세종 매핑 데이터:\n```json\n{project_data.get('mapping_sejong', 'N/A')}\n```")
    prompt_text = prompt_text.replace("{jeju_data}",
        f"제주 매핑 데이터:\n```json\n{project_data.get('mapping_jeju', 'N/A')}\n```")
    prompt_text = prompt_text.replace("{party_data}",
        project_data.get("data_js_parties", "N/A"))

    client = genai.Client(api_key=API_KEY)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt_text,
    )
    return response.text


def main():
    print("📋 프로젝트 데이터 수집 중...")
    project_data = load_project_data()

    results = {}
    for i, prompt_config in enumerate(PROMPTS):
        pid = prompt_config["id"]
        title = prompt_config["title"]
        print(f"\n🔍 [{i+1}/{len(PROMPTS)}] {title}...")

        try:
            result = run_review(prompt_config, project_data)
            results[pid] = result

            # 개별 파일 저장
            out_path = OUTPUT_DIR / f"{pid}.md"
            out_path.write_text(
                f"# {title}\n\n"
                f"생성일: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
                f"모델: gemini-2.5-flash\n\n---\n\n{result}\n",
                encoding="utf-8"
            )
            print(f"  ✅ 저장: {out_path.name} ({len(result):,}자)")
        except Exception as e:
            print(f"  ❌ 오류: {e}")
            results[pid] = f"오류: {e}"

    # 통합 요약 저장
    summary_path = OUTPUT_DIR / "00_summary.md"
    summary = f"# Gemini 심층 검증 통합 결과\n\n생성일: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n"
    for pid, result in results.items():
        title = next(p["title"] for p in PROMPTS if p["id"] == pid)
        summary += f"\n---\n\n## {title}\n\n{result}\n"

    summary_path.write_text(summary, encoding="utf-8")
    print(f"\n📊 통합 결과: {summary_path}")


if __name__ == "__main__":
    main()
