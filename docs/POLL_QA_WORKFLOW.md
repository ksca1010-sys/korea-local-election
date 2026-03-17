# Poll QA Workflow

## 목적

선택한 지역과 선거종류에 맞는 여론조사만 노출되는지 점검하고, 실제 화면에서 확인한 기대값을 회귀셋으로 편입하기 위한 운영 문서다.

## 사전 검증

아래 4개 명령이 모두 통과해야 수동 QA를 시작한다.

```bash
npm run check:poll-observations
npm run check:polls
npm run check:news
npm run check:local-media
```

한 번에 돌릴 때는 아래 명령을 사용한다.

```bash
npm run check:all
```

## 수동 QA 우선순위

다음 4개 그룹을 먼저 본다.

1. 광역단체장
   - `서울`, `부산`, `광주`, `제주`
2. 광역 교육감
   - `경북`, `경기`, `광주`
3. 기초단체장 개별
   - `서울 마포구`, `경기 평택시`, `전남 장성군`, `경북 포항시`
4. 기초단체장 전체
   - `전남`, `경기`, `충남`

## 수동 QA 체크리스트

각 화면에서 아래를 확인한다.

- 헤더가 선택 범위를 정확히 표시하는지
- 기초단체장 시군구 선택 시 다른 시군구 조사가 섞이지 않는지
- 광역단체장/교육감에서 기초단체장 조사가 섞이지 않는지
- 메인 그래프가 적절한 유형으로 보이는지
  - 광역/교육감/개별 시군구: `line`
  - 시군구 미선택 기초단체장: `bar`
- 카드 상단 최신 조사 제목이 선택 조건과 맞는지
- 후보 추이 라인에 엉뚱한 후보명이 섞이지 않는지

## 관측 기록 방법

기대값은 TSV에 넣는다.

- 위치: `/Users/isawufo/Desktop/AI-project/korea-local-eletion/data/poll_observations/queue`
- 공용 큐: `/Users/isawufo/Desktop/AI-project/korea-local-eletion/data/poll_observation_queue.tsv`
- 예시 템플릿: `/Users/isawufo/Desktop/AI-project/korea-local-eletion/data/poll_observations/queue/_template.tsv`
- 복붙용 예시: `/Users/isawufo/Desktop/AI-project/korea-local-eletion/data/poll_observation_queue.example.tsv`
- 추천 지역 스타터: `/Users/isawufo/Desktop/AI-project/korea-local-eletion/data/poll_observations/starter/recommended.tsv`

추천 스타터 파일은 active queue에 바로 import하지 않는다. 필요한 행만 지역 queue 파일로 복사해서 사용한다.

행 작성 기준:

- `regionKey`: 파일명 지역과 동일하게 입력
- `electionType`: `governor`, `mayor`, `superintendent`
- `districtName`: 기초단체장 시군구면 입력
- `expectedMinCount`: 최소 기대 조사 수
- `expectedChartMode`: `trend` 또는 `activity`
- `expectedChartType`: `line` 또는 `bar`
- `expectedFirstMunicipality`: 첫 카드 조사 대상 시군구 기대값
- `expectedHeaderIncludes`: 쉼표 구분 문자열
- `expectedFirstTitleIncludes`: 쉼표 구분 문자열
- `expectedDatasetLabels`: 후보명 쉼표 구분 문자열
- `expectedDatasetCountMin`: 최소 비교선 수
- `note`: 왜 이 기대값이 필요한지 간단히 기록

## 반영 절차

관측 추가 후 아래 순서로 실행한다.

```bash
npm run check:poll-observations
npm run import:polls
npm run check:polls
```

공통 회귀도 같이 본다.

```bash
npm run check:news
npm run check:local-media
```

현재 데이터 상태 요약은 아래로 확인한다.

```bash
npm run report:health
```

이 리포트에는 news/poll observation queue 적체와 archive 누적 상태도 같이 포함된다.
리포트의 `recommend.pollNextQa`를 다음 수동 QA 시작 지역으로 사용한다.

## 등록일 백필

기존 poll 데이터의 `등록일` / `등록번호`는 NESDC 목록 페이지에서만 안정적으로 읽힌다. 전체 수집 없이 메타만 다시 채우려면 아래 명령을 사용한다.

```bash
npm run polls:backfill-registration
```

네트워크 없이 저장된 목록 HTML로만 돌릴 때는 직접 파이프라인을 호출한다.

```bash
python3 scripts/nesdc_poll_pipeline.py \
  --backfill-registration-meta \
  --list-html-dir /path/to/list-html-cache
```

캐시 디렉터리는 `page-1.html`, `page-2.html` 형식을 따른다.

## 실패 해석

- `check:poll-observations` 실패
  - TSV 형식 오류, 지역 mismatch, 중복 name, 중복 selection signature
- `check:polls` 실패
  - 선택 로직, 헤더, 그래프 모드/타입, 후보 추이 기대값이 깨짐
- `check:news` 또는 `check:local-media` 실패
  - 공통 디버그 런타임 변경 영향

## 종료 기준

다음 조건이면 한 배치를 종료한다.

- 추가한 poll observation import 완료
- `npm run check:polls` 통과
- `npm run check:news` 통과
- `npm run check:local-media` 통과
- 실제 화면에서 대표 지역 4곳 재확인 완료
