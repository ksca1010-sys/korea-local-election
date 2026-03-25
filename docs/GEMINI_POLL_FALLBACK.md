# Gemini PDF Fallback

`/Users/isawufo/Desktop/AI-cording-project/korea-local-election/scripts/gemini_parse_polls.py`는
로컬 PDF 파서가 실패한 여심위 PDF를 Gemini로 2차 추출하는 스크립트입니다.

## 목적

- 로컬 `pdfplumber` 파서가 놓친 후보 지지율 표를 보조 추출
- 추출 결과를 바로 신뢰하지 않고 검증 후만 `state.json`/`polls.json`에 반영
- 추출/거절 이유를 JSONL 보고서로 남김

## 전제

- `.env` 또는 환경변수에 `GEMINI_API_KEY` 필요
- 기본 모델: `gemini-2.5-flash`
- PDF 원문은 `/Users/isawufo/Desktop/AI-cording-project/korea-local-election/data/polls/pdfs` 아래에 이미 있어야 함

## 기본 명령

- 대상만 확인:
  - `npm run gemini:polls:dry`
- 실제 반영:
  - `npm run gemini:polls`

## 추천 실행 예시

- 특정 지역만:
  - `python3 scripts/gemini_parse_polls.py --region-key gyeongnam`
- 특정 선거만:
  - `python3 scripts/gemini_parse_polls.py --election-type superintendent`
- 특정 PDF만:
  - `python3 scripts/gemini_parse_polls.py --ntt-id 17180 --ntt-id 16828`
- 기존 결과가 있어도 다시 추출:
  - `python3 scripts/gemini_parse_polls.py --force --ntt-id 17180`
- 설문지형 preview라도 강제로 호출:
  - `python3 scripts/gemini_parse_polls.py --allow-questionnaire --ntt-id 17180`

## preview 선별

- 스크립트는 `pdftotext`가 있으면 PDF 앞부분을 먼저 읽고 설문지형 PDF를 로컬에서 거릅니다.
- `npm run gemini:polls:dry` 결과에 `skip=questionnaire_preview`가 붙으면 기본 실행에서 Gemini 호출을 생략합니다.
- 이 단계는 quota 낭비를 줄이기 위한 보수적 필터입니다.
- 정말 확인이 필요할 때만 `--allow-questionnaire`로 우회합니다.

## 검증 규칙

- 후보명은 한글 2-5자만 허용
- `기타후보`, `잘모르겠다`, `교육감`, `정당지지도` 등 오염 토큰 제거
- 지지율은 `0.5-85.0` 범위만 허용
- 후보가 2명 미만이면 거절
- `data/candidates/governor.json`과 기존 poll 결과에서 얻은 후보 힌트와 비교
- 기대 후보명과 겹치는 결과가 2명 이상이면 그 후보군만 채택

## 결과물

- 반영 데이터:
  - `/Users/isawufo/Desktop/AI-cording-project/korea-local-election/data/polls/state.json`
  - `/Users/isawufo/Desktop/AI-cording-project/korea-local-election/data/polls/polls.json`
- 보고서:
  - `/Users/isawufo/Desktop/AI-cording-project/korea-local-election/data/polls/gemini_fallback_report.jsonl`

## 해석 기준

- `accepted`: 검증 통과, 데이터 반영
- `skipped`: 로컬 preview에서 설문지형으로 판단되어 Gemini 호출 생략
- `rejected`: Gemini는 응답했지만 검증 실패
- `error`: API 호출 또는 응답 파싱 실패

## 주의

- Gemini가 PDF를 읽을 수 있어도, 설문지만 있는 PDF는 후보 결과를 만들 수 없음
- 이 스크립트는 자동 추출기이지 진실 판정기가 아님
- 중요한 케이스는 보고서 JSONL을 보고 표본 검토하는 것이 맞음
