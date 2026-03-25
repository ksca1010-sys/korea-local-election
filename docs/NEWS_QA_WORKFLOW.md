# News QA Workflow

## 목적

지역 선택과 선거 종류 선택에 맞는 뉴스만 노출되는지 점검하고, 실제 오탐/누락 기사를 회귀셋으로 편입하기 위한 운영 문서다.

## 사전 검증

아래 3개 명령이 모두 통과해야 수동 QA를 시작한다.

```bash
npm run check:observations
npm run check:local-media
npm run check:news
```

## 수동 QA 우선순위

다음 4개 그룹을 먼저 본다.

1. 광역단체장
   - `서울`, `부산`, `광주`, `제주`
2. 비수도권 광역
   - `강원`, `충북`, `전남`, `경북`
3. 기초단체장
   - `청주`, `포항`, `강화`, `광산구`
4. 뉴스량 적은 지역
   - `고흥`, `담양`, `영양`, `산청`

## 수동 QA 체크리스트

각 화면에서 아래를 확인한다.

- 다른 지역 선거 기사 노출 여부
- 다른 선거 종류 기사 노출 여부
- 총선/당대표/교육감/재보궐 회고 기사 노출 여부
- 스포츠/연예/일반 사회 기사 오탐 여부
- 지역신문/지역방송 기사 비중
- 기사 수가 지나치게 적은지 여부

## 관측 기사 기록 방법

오탐/정탐 기사는 해당 지역 TSV에 넣는다.

- 위치: `/Users/isawufo/Desktop/AI-cording-project/korea-local-election/data/news_observations/queue`
- 예시 템플릿: `/Users/isawufo/Desktop/AI-cording-project/korea-local-election/data/news_observations/queue/_template.tsv`
- 복붙용 예시: `/Users/isawufo/Desktop/AI-cording-project/korea-local-election/data/news_observation_queue.example.tsv`
- 추천 지역 스타터: `/Users/isawufo/Desktop/AI-cording-project/korea-local-election/data/news_observations/starter/recommended.tsv`

추천 스타터 파일은 active queue에 바로 import하지 않는다. 필요한 행만 지역 queue 파일로 복사해서 사용한다.

행 작성 기준:

- `regionKey`: 파일명 지역과 동일하게 입력
- `categoryId`: 보통 `all`, 필요시 `candidate`, `policy`, `poll`
- `electionType`: 광역은 `governor`, 기초는 `mayor`
- `districtName`: 기초단체장이면 필수
- `expectedOk`: 보여야 하면 `true`, 막혀야 하면 `false`
- `note`: 왜 오탐/정탐인지 간단히 기록

## 반영 절차

관측 기사 추가 후 아래 순서로 실행한다.

```bash
npm run check:observations
npm run import:news
npm run check:news
```

필요하면 마지막에 로컬 미디어 매핑도 다시 확인한다.

```bash
npm run check:local-media
```

한 번에 검증할 때는 아래 명령을 사용한다.

```bash
npm run check:all
```

현재 큐 적체와 archive 누적 상태는 아래로 확인한다.

```bash
npm run report:health
```

리포트의 `recommend.newsNextQa`를 다음 수동 QA 시작 지역으로 사용한다.

## 실패 해석

- `check:observations` 실패
  - TSV 형식 오류, 지역 mismatch, 중복 name, 중복 관측 시그니처
- `check:news` 실패
  - 회귀 로직 깨짐, locality/쿼리 포함 조건 깨짐
- `check:local-media` 실패
  - override host가 generated registry 또는 query plan에 반영되지 않음

## 종료 기준

다음 조건이면 한 배치를 종료한다.

- 추가한 관측 기사 import 완료
- `npm run check:news` 통과
- 필요시 `npm run check:local-media` 통과
- 실제 화면에서 대표 지역 4곳 재확인 완료
