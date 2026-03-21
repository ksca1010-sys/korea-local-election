# 알선거 서비스 전체 팩트체크 1차 감사

기준일: 2026-03-20
대상: 지도/개요/뉴스/여론조사/후보자 노출 전반

## 이번 점검에서 실제로 확인한 것

- 로컬 자동 점검
  - `node scripts/report_data_health.js`
  - `node scripts/run_quality_gate.js`
  - `node scripts/run_news_regression.js`
  - `node scripts/run_poll_regression.js`
- 주요 팩트 노출 경로
  - `js/app.js`
  - `js/data.js`
  - `js/election-calendar.js`
  - `data/election_overview.json`
  - `data/polls/state.json`
  - `data/candidates/*.json`
- 외부 기준 확인
  - 중앙선관위 지방선거 일정 안내
  - 공직선거법 제108조

## 핵심 결론

현재 서비스는 "일정/현직/여론조사 등록 메타" 같은 기초 팩트는 상당 부분 정리되어 있다. 다만 아래 6개 영역은 아직 "전체 팩트체크 완료"라고 보기 어렵다.

## 우선 수정해야 할 항목

### 1. 개요탭 서술이 LLM 생성 문장에 크게 의존한다

- `data/election_overview.json`의 메타에는 아래가 명시되어 있다.
  - `generatedBy: "Claude (claude-haiku-4-5-20251001)"`
  - `lastUpdated: "2026-03-19"`
- `js/app.js`에서 이 파일의 `headline`, `narrative`, `riskFactor`, `trend`를 그대로 개요탭에 렌더링한다.
- 문제:
  - 이 데이터는 "팩트"와 "해석/서사"가 분리되어 있지 않다.
  - 사실 검증이 안 된 문장이 UI에서 사실처럼 보인다.
  - `factcheck` 배열은 내부 메모 수준 문자열이고, 링크/문서 ID/원문 인용 구조가 아니다.
- 판단:
  - 이 영역은 현재 서비스에서 가장 큰 환각 리스크다.

### 2. 광역단체장 뉴스 필터가 교육감/기초단체장 기사를 아직도 통과시킨다

- `node scripts/run_news_regression.js` 결과: 8건 실패
- 대표 실패 케이스:
  - `gwangju-reject-superintendent-race`
  - `starter-busan-governor-reject-superintendent`
  - `starter-daegu-governor-reject-superintendent`
  - `starter-gwangju-governor-reject-district`
  - `starter-gyeongbuk-governor-reject-superintendent`
  - `starter-gyeongnam-governor-reject-superintendent`
  - `starter-jeonbuk-governor-reject-superintendent`
  - `starter-ulsan-governor-reject-district`
- 의미:
  - 광역단체장 탭에 교육감 기사나 구청장/군수 기사가 섞일 수 있다.
  - 사용자는 "지역 선거 뉴스"라고 믿고 클릭하지만 실제로는 다른 선거 기사일 수 있다.
- 원인 후보:
  - `js/app.js`의 `evaluateCategoryMatch()`에서 `excludeAny` 예외 처리 범위가 너무 넓다.

### 3. 여론조사 차트/선택 로직이 여전히 비후보 데이터에 오염된다

- `node scripts/run_poll_regression.js` 결과: 5건 실패
- 대표 실패 케이스:
  - `gyeonggi-pyeongtaek-district-trend`
  - `incheon-superintendent-reference`
  - `daejeon-superintendent-reference`
  - `gyeongnam-superintendent-trend`
  - `starter-jeonbuk-governor`
- 실제 관찰된 오염 예:
  - 경남 교육감 추이 데이터셋에 `민주당`, `더불어`, `개혁신당`이 후보명처럼 섞임
  - 평택시 기초단체장 화면이 "후보 추이 없음"이어야 하는데 라인차트를 만들고 있음
- 의미:
  - 차트가 사실처럼 보여도 실제로는 정당지지율/파싱 노이즈/잘못 분류된 조사일 수 있다.

### 4. 후보자 데이터에 개별 출처와 검증시각이 없다

- 샘플 집계 결과:
  - `data/candidates/governor.json`: 101명, `sourceUrl` 0건
  - `data/candidates/superintendent.json`: 79명, `sourceUrl` 0건
  - `data/candidates/mayor_candidates.json`: 773명, `sourceUrl` 0건
- `js/data.js` 상단 광역단체장 후보도 대부분 `dataSource: 'news'`만 있고 링크/기사일자/검증시각이 없다.
- 의미:
  - "왜 이 후보가 들어갔는지"를 나중에 추적하기 어렵다.
  - 후보 사퇴/불출마/단수공천 변경이 생겼을 때 차이를 감사하기 어렵다.

### 5. 선거 일정이 두 군데에 중복 정의돼 있고 내부 불일치가 있다

- `js/election-calendar.js`
  - `VOTER_LIST_START: 2026-05-12`
  - `VOTER_LIST_END: 2026-05-16`
- `js/data.js`의 `electionCalendar`
  - `voter-roll-and-absentee.startDate: 2026-05-14`
  - `voter-roll-and-absentee.endDate: 2026-05-16`
- 의미:
  - 배너/법적 판정과 캘린더 UI가 서로 다른 날짜를 보여줄 수 있다.
  - 특히 일정성 데이터는 한 곳만 진실원본이어야 한다.

### 6. 여론조사 원천 데이터 메타가 비어 있고 일부 파싱 노이즈가 남아 있다

- `node scripts/report_data_health.js` 결과
  - 전체 812건
  - 등록일 있음: 809/812
  - 등록번호 있음: 794/812
  - 결과값 있음: 660/812
  - `unknown` electionType: 172건
- `data/polls/state.json`의 `meta`는 현재 빈 객체다.
- 샘플에서 확인된 파싱 노이즈:
  - `개혁`, `신당`, `매우`, `좋아질` 같은 조각 토큰이 `candidateName`으로 남아 있음
- 의미:
  - 내부 필터가 막아 주지 못하면 차트/후보 추출을 오염시킬 수 있다.

## 이번 점검에서 "대체로 맞다"고 확인한 항목

아래 일정은 현재 코드의 핵심 날짜와 공식 안내가 대체로 일치한다.

- 선거일: 2026-06-03
- 시·도지사/교육감 예비후보자 등록 시작: 2026-02-03
- 군수/지역구군의원 예비후보자 등록 시작: 2026-03-22
- 딥페이크 이용 선거운동 금지 시작: 2026-03-05
- 후보자 등록: 2026-05-14 ~ 2026-05-15
- 공식 선거운동: 2026-05-21 ~ 2026-06-02
- 사전투표: 2026-05-29 ~ 2026-05-30
- 여론조사 공표 금지: 2026-05-28 00:00 ~ 2026-06-03 18:00

근거:

- 중앙선관위 전북특별자치도선거관리위원회 메인 공지
  - https://jb.nec.go.kr/jb/main/main.do
- 중앙선관위 "한눈에 보는 지방선거 일정"
  - https://us.nec.go.kr/us/bbs/B0000265/view.do?category1=us&category2=usjunggu&deleteCd=0&menuNo=800036&nttId=274671&pageIndex=1
- 국가법령정보센터 공직선거법 제108조
  - https://www.law.go.kr/법령/공직선거법/제108조

주의:

- 위 확인은 "주요 날짜" 기준이다.
- `선거인명부 작성 시작일`은 서비스 내부에서 5월 12일과 5월 14일로 갈려 있으므로 별도 단일화가 필요하다.

## 품질 게이트 상태

- `news-observations`: PASS
- `poll-observations`: PASS
- `local-media`: PASS
- `news-regression`: FAIL
- `poll-regression`: FAIL

즉, "뉴스/여론조사 분류가 사실을 잘못 섞지 않는가"라는 핵심 품질 게이트는 아직 통과하지 못했다.

## 다음 작업 우선순위

1. `election_overview.json`을 "팩트 JSON"과 "해석 문장"으로 분리
2. 뉴스 필터 회귀 8건을 먼저 0건으로 만들기
3. 여론조사 회귀 5건의 원인을 분리
   - 로직 버그
   - 데이터 부족
   - 회귀 케이스 기대값 노후화
4. 후보자 JSON에 최소 필수 메타 추가
   - `sourceUrl`
   - `sourceLabel`
   - `sourcePublishedAt`
   - `lastFactCheck`
5. 일정 원본을 `js/election-calendar.js` 한 곳으로 통일
6. `data/polls/state.json`에 파일 단위 메타 추가
   - `lastUpdated`
   - `lastPipelineRun`
   - `source`
   - `pollCount`
   - `unknownElectionTypeCount`

## 판단 메모

현재 서비스는 "보여줄 데이터가 없는 상태"는 아니다. 하지만 "보이는 문장이 언제든 팩트로 방어 가능한 상태"도 아니다.

특히 아래 두 문장은 아직 하기 어렵다.

- "광역단체장 뉴스는 타 선거 기사 없이 안정적으로 걸러진다"
- "후보자/개요 문장은 출처 링크까지 포함해 언제든 역추적 가능하다"

이 두 조건이 해결되면 그때부터는 "서비스 전체 팩트체크 완료"에 가까워진다.
