# CLAUDE.md — 선거정보지도 프로젝트 규칙

> 최종 업데이트: 2026-03-25

## 프로젝트 개요
6.3 전국동시지방선거 인터랙티브 선거 정보 지도
배포: https://korea-local-election.pages.dev
스택: 바닐라 HTML + CSS + JavaScript (프레임워크 없음)

## 파일 구조

```
js/ (21,202줄)
├── data-loader.js    (123줄)   DataLoader — JSON hot-swap
├── data.js           (2,943줄) ElectionData 메인 저장소
├── app.js            (6,184줄) App 컨트롤러
├── map.js            (3,946줄) MapModule (D3.js)
├── charts.js         (379줄)   ChartsModule (Chart.js)
├── election-calendar.js (238줄) 선거 캘린더
├── news_filters.js   (385줄)   뉴스 필터 설정
├── issue_engine.js   (709줄)   지역 이슈 분석
├── derived_issues.js (1,303줄) 파생 이슈
├── nec.js            (247줄)   선관위 API
└── tabs/                       탭별 렌더러 (7개)
    ├── overview-tab.js    (321줄)
    ├── poll-tab.js        (750줄)
    ├── candidate-tab.js   (351줄)
    ├── news-tab.js        (1,487줄)
    ├── history-tab.js     (641줄)
    ├── council-tab.js     (722줄)
    └── proportional-tab.js (473줄)

data/static/ (15개 JSON + xlsx)
  regions.json, sub_regions.json, parties.json,
  historical_elections.json, historical_elections_full.json,
  superintendent_history.json, superintendents.json,
  gallup_national_poll.json, national_summary.json,
  election_type_info.json, election_meta.json, election_terms.json,
  historical_party_names.json, council_seats.json, incumbents.json

scripts/ (26,278줄) — Python 자동화 파이프라인
```

## 수정 규칙

### 데이터 파일 (data/*.json)
- 선거 관련 모든 팩트 데이터는 여기에만 저장
- 수정 시 반드시 출처 확인 후 변경
- 커밋 메시지에 출처 명시

### 탭별 렌더러 (js/tabs/*.js)
- 각 탭 파일은 독립적. 다른 탭 파일을 import하거나 호출하지 않음
- 데이터는 반드시 ElectionData를 통해 접근
- 탭 파일끼리 전역 변수를 공유하지 않음

### 수정 시 영향 범위
| 수정 대상 | 건드려도 되는 파일 | 건드리면 안 되는 파일 |
|----------|-------------------|---------------------|
| 여론조사탭 | data/polls/, js/tabs/poll-tab.js | 다른 모든 파일 |
| 후보자탭 | data/candidates/, js/tabs/candidate-tab.js | 다른 모든 파일 |
| 뉴스탭 | js/tabs/news-tab.js, js/news_filters.js | 다른 모든 파일 |
| 개요탭 | js/tabs/overview-tab.js | 다른 모든 파일 |
| 역대비교탭 | data/*_history.json, js/tabs/history-tab.js | 다른 모든 파일 |
| 의원 지역구탭 | js/tabs/council-tab.js, data/council/ | 다른 모든 파일 |
| 비례대표탭 | js/tabs/proportional-tab.js, data/proportional_*.json | 다른 모든 파일 |
| 지도 | js/map.js | 탭 파일들 |
| 좌측 패널 | app.js의 좌측 패널 관련 코드만 | 우측 탭 파일들 |

---

## 헌법 — 허위 데이터 절대 금지

> 이 프로젝트는 선거 정보를 다룬다. 허위 데이터는 유권자의 판단을 왜곡한다.
> 아래 규칙은 어떤 상황에서도 예외 없이 적용한다.

**제1조 (출처 의무)** 모든 수치 데이터는 반드시 공식 출처로 검증한 뒤 반영한다.
- 1순위: 선관위 공공데이터 API (`apis.data.go.kr/9760000`)
- 2순위: 선관위 통계시스템 (`info.nec.go.kr`), 공공데이터포털 CSV/Excel
- 3순위: 공식 언론사 보도 (통신사, 지역지)
- 나무위키/위키백과는 교차검증 용도로만 사용, 원본 소스로 사용 금지

**제2조 (LLM 생성 데이터 불신 원칙)** AI/LLM이 생성하거나 추정한 수치는 기본적으로 불신한다.
- LLM이 제시한 수치는 반드시 API 또는 공식 소스로 교차검증
- 검증 없이 LLM 출력을 data/*.json에 반영하는 것은 금지

**제3조 (자동화 안전장치)** 자동 수집 파이프라인은 반드시 검증 단계를 포함한다.
- 재보궐: NEC 예비후보 API → 뉴스 Claude 분석 → 당적 교차검증 → 일관성 검증 → 저장
- 역대선거: 선관위 개표결과 API(`VoteXmntckInfoInqireService2`)로만 수치 확정
- 여론조사: NESDC 등록 조사를 기준으로 사용. nttId 확인이 선행 조건
  - nttId 확인 후 → PDF 파싱 실패 시 의뢰사·조사기관·조사기간·표본수가 일치하는 공식 언론 보도 수치로 보완 가능
  - 수치 입력 시 `sourceUrl`에 해당 기사 URL, `dataSource: "news_verified"` 명시
  - nttId null 상태에서 수치 입력 금지 (미확인 조사와 구분 불가)

**제4조 (혼입 방지)** 선거 유형이 다른 데이터의 혼입을 금지한다.
- 총선 비례 ≠ 지방선거 비례 (sgTypecode 구분)
- 선거구 갑 ≠ 을 (sggName 반드시 확인)

**제5조 (발견 시 즉시 교정)** 허위 데이터가 발견되면 해당 데이터 전량을 API로 재검증한다.
- 1건 발견 = 같은 패턴의 전수조사
- 교정 커밋에는 검증 소스와 건수를 명시

**제6조 (단건 수정 후 자체 검증 의무)** 1~3건의 단건 수정 요청 시 수정 완료 후 반드시 1회 자체 검증을 수행하고 결과를 보고한다.
- 검증 방법 (우선순위 순):
  1. `node --check <파일>` — JS 구문 오류 확인
  2. 수정된 로직을 Node.js로 직접 실행하여 기댓값 확인
  3. 관련 데이터 파일은 `python3 -c "import json; json.load(open(...))"` 로 파싱 검증
- 완료 보고 형식:
  ```
  ✔ 검증 통과 — <파일명> 구문 오류 없음 / <핵심 로직 검증 결과>
  ```
- 검증 실패 시 즉시 원인 파악 후 재수정, 통과할 때까지 완료 보고 금지

---

## 절대 금지 사항
1. data/*.json 파일에 함수나 로직을 넣지 않음 (순수 데이터만)
2. 탭 js 파일에서 다른 탭 js 파일의 함수를 호출하지 않음
3. 전역 변수로 탭 간 데이터를 전달하지 않음
4. data.js에 새 데이터를 추가하지 않음 (data/*.json에 추가)
5. 여론조사 수치를 소스 확인 없이 변경하지 않음
6. LLM이 생성한 수치를 검증 없이 커밋하지 않음
7. 선거 유형이 다른 API 데이터를 혼합하지 않음

---

## 선거 캘린더 규칙

### 시간 기준
- 모든 날짜 비교는 js/election-calendar.js의 getKST() 사용
- 문자열 날짜 비교 금지
- Date 객체 + KST 변환만 허용

### 여론조사 공표금지 (법적 필수)
- isPublicationBanned() 함수로만 판정 (getCurrentPhase와 독립)
- 공표금지 시 polls 데이터 자체를 빈 배열로 반환
- 5/28 00:00 ~ 6/3 18:00 (KST), 경계: `<` (18:00 정각은 허용)

### 후보자 정렬
- 5/15 18:00 전: 상태 우선순위 정렬 (NOMINATED > DECLARED > EXPECTED > RUMORED)
- 5/15 18:00 후: 기호순
- getCandidateSortMode() 함수로 판정

### 수정 시 주의
- election-calendar.js의 DATES 상수 변경 시 커밋 메시지에 사유 기재
- isPublicationBanned() 수정은 법적 리스크 수반

---

## 현재 콘텐츠 현황 (2026-03-25)

| 항목 | 수량 |
|------|------|
| 광역단체장 후보 | 100명 |
| 교육감 후보 | 81명 |
| 기초단체장 후보 | 851명 |
| 광역의원 현직 | 777명 |
| 재보궐 후보 | 23명 / 6개 선거구 |
| 여론조사 | 208건 |

## 일정
- 예비후보 등록 진행 중
- 본후보 등록: 5/14~15
- 공표금지 기간: 5/28~6/3
- 선거일: 6/3
