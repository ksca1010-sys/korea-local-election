#!/usr/bin/env python3
"""
Gemini 2라운드 팩트체크: 사이드바 숫자 + 전국 개황
제9회 전국동시지방선거(2026.6.3) 선거구 수 검증
"""

import json
import os
import time
import urllib.request
import ssl

API_KEY = os.environ.get("GEMINI_API_KEY", "")
MODEL = "gemini-2.5-flash"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "gemini_reviews", "factcheck_numbers")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 현재 사이트에 표시된 숫자들
CURRENT_NUMBERS = """
## 사이드바 선거 종류 필터 숫자
1. 광역단체장: 17
2. 교육감: 17
3. 기초단체장: 226
4. 광역의원 (지역구): 789
5. 기초의원 (지역구): 2,927
6. 광역의원 비례대표: 116
7. 기초의원 비례대표: 325
8. 재보궐선거: 5 (인천 연수구갑, 인천 계양구을, 경기 평택시을, 충남 아산시을, 전북 군산·김제·부안갑)

## 전국 개황 통계
- 투표 종류: 7 (광역단체장, 기초단체장, 교육감, 광역의원, 기초의원, 비례광역, 비례기초)
- 시도: 17
- 시군구: 226

## data.js 내부 nationalSummary.electionTypes 배열 (사이드바와 별도)
- 비례대표 광역의원: 85
- 비례대표 기초의원: 340
(주의: 사이드바에는 116, 325로 표시 — 불일치 존재)
"""

def call_gemini(prompt, temperature=0.2):
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": 16384}
    }).encode()
    req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json"})
    try:
        resp = urllib.request.urlopen(req, context=ssl_ctx, timeout=60)
        data = json.loads(resp.read().decode())
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        return f"[ERROR] {e}"


# ─── Round 1: 초기 팩트체크 ───
print("=" * 60)
print("Round 1: Gemini 초기 팩트체크")
print("=" * 60)

round1_prompt = f"""
당신은 한국 선거 제도 전문가입니다. 아래는 2026년 6월 3일 제9회 전국동시지방선거 인터랙티브 지도 웹사이트에 표시된 숫자들입니다.

{CURRENT_NUMBERS}

각 숫자를 한국 공직선거법, 중앙선거관리위원회 공식 자료, 제8회 지방선거(2022년) 실적 기준으로 팩트체크해주세요.

특히 다음을 정확히 검증해주세요:

1. **광역단체장 17개**: 서울, 부산, 대구, 인천, 광주, 대전, 울산, 세종, 경기, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주 = 17개 맞는지?

2. **교육감 17개**: 17개 시도 교육감 선거가 동시에 치러지는지?

3. **기초단체장 226개**: 제8회 지방선거에서 기초단체장(시장·군수·구청장) 선거구 수가 226개였는지? 세종시와 제주도는 기초자치단체가 없으므로 제외되어 15개 시도의 합이 226인지?

4. **광역의원 지역구 789석**: 제8회 지방선거 기준 시도의회 지역구 의원 정수가 789석인지? 17개 시도별로 breakdown 제공

5. **기초의원 지역구 2,927석**: 제8회 지방선거 기준 시군구의회 지역구 의원 정수. 세종/제주 제외.

6. **비례대표 광역의원**: 올바른 수는 몇 석인지? (사이드바 116 vs data.js 85)
   - 제8회 지방선거에서 시도의회 비례대표 총 의석수

7. **비례대표 기초의원**: 올바른 수는 몇 석인지? (사이드바 325 vs data.js 340)
   - 제8회 지방선거에서 시군구의회 비례대표 총 의석수

8. **재보궐 5곳**: 2026년 6월 3일 동시 실시되는 국회의원 재보궐선거 지역구가 정확한지?

9. **시군구 226개**: 대한민국 기초자치단체 수 (세종/제주 제외)

10. **투표 종류 7**: 유권자가 받는 투표 용지 수 (광역단체장, 기초단체장, 교육감, 광역의원 지역구, 광역의원 비례, 기초의원 지역구, 기초의원 비례 = 7장). 세종/제주는 기초 관련 투표 없으므로 5장.

각 항목에 대해:
- ✅ 정확 / ❌ 오류 / ⚠️ 확인필요 표시
- 오류인 경우 올바른 수치와 근거 제시
- 시도별 상세 breakdown 가능한 경우 제공

JSON 형식 결론 요약도 마지막에 포함:
```json
{{
  "광역단체장": {{"current": 17, "correct": ??, "status": "✅/❌/⚠️"}},
  "교육감": {{"current": 17, "correct": ??, "status": "✅/❌/⚠️"}},
  ...
}}
```
"""

r1 = call_gemini(round1_prompt)
print(r1[:500] + "...\n")

with open(os.path.join(OUTPUT_DIR, "round1_initial.md"), "w") as f:
    f.write("# Round 1: Gemini 초기 팩트체크\n\n")
    f.write(r1)

time.sleep(15)

# ─── Round 2: 교차 검증 + 최종 권고 ───
print("=" * 60)
print("Round 2: 교차 검증 + 최종 권고")
print("=" * 60)

round2_prompt = f"""
당신은 한국 선거 제도 전문가입니다. 1차 팩트체크 결과를 교차 검증하고 최종 권고를 제시해주세요.

## 1차 팩트체크 결과:
{r1}

## 현재 웹사이트 숫자:
{CURRENT_NUMBERS}

## 교차 검증 요청:

1. **1차 결과의 정확성 재검증**: 1차에서 제시된 숫자가 맞는지 다시 확인. 특히:
   - 광역의원 지역구 총 의석수 (시도별 합계 정확한지 재계산)
   - 기초의원 지역구 총 의석수
   - 비례대표 의석수 (광역/기초 각각)

2. **제8회 vs 제9회 변경사항**: 2022→2026 사이 행정구역 변경, 의원정수 변경 가능성 검토
   - 2024년 이후 시군구 신설/통합/분리가 있었는지
   - 의원정수 조정이 예상되는지

3. **data.js와 사이드바 불일치 해소**:
   - 비례광역: 사이드바 116 vs data.js 85 → 어느 것이 맞는지 확정
   - 비례기초: 사이드바 325 vs data.js 340 → 어느 것이 맞는지 확정

4. **재보궐 5곳 최종 확인**:
   - 인천 연수구갑 / 인천 계양구을 / 경기 평택시을 / 충남 아산시을 / 전북 군산·김제·부안갑
   - 각 지역의 궐원 사유와 전임 의원 확인

## 최종 출력 형식:

### 최종 권고 사항
각 숫자에 대해 최종 판정과 수정 필요 여부를 명확히 제시:

```json
{{
  "corrections_needed": [
    {{
      "item": "항목명",
      "location": "파일 위치",
      "current_value": "현재값",
      "correct_value": "올바른 값",
      "source": "근거",
      "priority": "high/medium/low"
    }}
  ],
  "confirmed_correct": [
    {{
      "item": "항목명",
      "value": "값",
      "confidence": "high/medium"
    }}
  ]
}}
```
"""

r2 = call_gemini(round2_prompt, temperature=0.1)
print(r2[:500] + "...\n")

with open(os.path.join(OUTPUT_DIR, "round2_crosscheck.md"), "w") as f:
    f.write("# Round 2: 교차 검증 + 최종 권고\n\n")
    f.write(r2)

# ─── 최종 요약 ───
print("=" * 60)
print("최종 요약 파일 생성 중...")
print("=" * 60)

with open(os.path.join(OUTPUT_DIR, "00_summary.md"), "w") as f:
    f.write("# 선거 숫자 팩트체크 최종 요약\n\n")
    f.write("## 검증 대상\n")
    f.write(CURRENT_NUMBERS)
    f.write("\n\n---\n\n")
    f.write("## Round 1 결과\n")
    f.write(r1)
    f.write("\n\n---\n\n")
    f.write("## Round 2 교차검증 결과\n")
    f.write(r2)

print("\n✅ 팩트체크 완료!")
print(f"결과 저장: {OUTPUT_DIR}/")
