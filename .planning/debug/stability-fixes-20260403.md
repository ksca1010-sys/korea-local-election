---
status: awaiting_human_verify
trigger: "4개 버그 수정: stability-fixes-20260403"
created: 2026-04-03T00:00:00Z
updated: 2026-04-03T00:00:00Z
---

## Current Focus

hypothesis: 4개 버그 순서대로 조사 및 수정
test: 각 파일 직접 읽어 코드 확인
expecting: 각 버그의 정확한 위치와 수정 방법 파악
next_action: BUG-01 detect_byelections.py generate_key 함수 확인

## Symptoms

expected: 4개 버그 모두 수정, 각각 atomic commit
actual: 4개 버그 현재 코드에 존재
errors: |
  BUG-01: generate_key()에서 복합 선거구명 첫 시군구만 추출 후 접미사 제거 → 잘못된 키
  BUG-02: overview-tab.js에서 previousJeonnamSuperintendent 필드 없음
  BUG-03: data.js gallupNationalPoll 하드코딩 ≠ JSON 값
  BUG-04: 전남 언론사 광주 병합 코드가 선거 유형 무관하게 init 시점에 실행
reproduction: 항상 재현 가능
started: 최근 전남광주 통합 기능 추가 및 byelection 데이터 수정

## Eliminated

(없음)

## Evidence

- timestamp: 2026-04-03T00:05:00Z
  checked: detect_byelections.py generate_key() 함수 (103-112줄)
  found: |
    clean = re.sub(r'[갑을병정]$', '', sgg_name) → "군산김제부안갑" → "군산김제부안"
    m = re.match(r'([가-힣]+[시군구])', clean) → "군산" 만 매칭 (첫 번째 시군구)
    name.replace('군','') → "산"
    결과: key = "jeonbuk-산" (잘못된 키)
  implication: --apply 실행 시 이미 존재하는 복합 선거구를 신규로 오인해 중복 등록 위험

- timestamp: 2026-04-03T00:06:00Z
  checked: overview-tab.js 296줄, data.js superintendents gwangju 항목 (1539줄)
  found: |
    overview-tab.js 297줄: supt.previousJeonnamSuperintendent 참조
    data.js gwangju 항목: { currentSuperintendent, candidates } 만 있고 previousJeonnamSuperintendent 필드 없음
    jeonnam 항목: { name: '김대중', stance: '진보', since: 2022 } 존재
  implication: isMergedSupt가 true일 때 prevJn이 undefined → 전남 교육감 미표시

- timestamp: 2026-04-03T00:07:00Z
  checked: data.js gallupNationalPoll (771-789줄) vs data/static/gallup_national_poll.json
  found: |
    data.js: ppp:19, reform:2, newReform:3, surveyDate:'2026년 3월 4주', sampleSize:1000, reportNo:657호
    JSON:    ppp:20, reform:3, newReform:2, surveyDate:'2026년 3월 3주', sampleSize:1004, reportNo:656호
    data-loader.js 확인 필요 - JSON 덮어쓰기 여부
  implication: 화면에 잘못된 갤럽 여론조사 데이터 표시

- timestamp: 2026-04-03T00:08:00Z
  checked: app.js 149-163줄 전남광주 언론사 병합 코드
  found: |
    init() 함수 내 미디어 풀 로드 블록에서 무조건 실행
    선거 유형 체크 없이 jeonnam 언론사를 gwangju에 병합
    이 병합이 LocalMediaRegistry를 직접 수정함
    뉴스탭 렌더링 시 선거 유형별로 필터링하는지 별도 확인 필요
  implication: mayor/council 등 선거 유형에서 gwangju 검색 시 전남 언론사까지 포함될 수 있음

## Resolution

root_cause: |
  BUG-01: generate_key()에서 str.replace('군','')가 "군산"의 '군'도 파괴적으로 제거 → "산" 키 생성.
          또한 re.match로 복합 선거구명("군산김제부안") 전체를 인식 못함.
  BUG-02: data.js superintendents.gwangju 객체에 previousJeonnamSuperintendent 필드 미정의.
  BUG-03: data.js 하드코딩(3월4주/657호)과 JSON(3월3주/656호) 수치 불일치.
          data-loader.js가 JSON으로 덮어쓰므로 화면 표시는 JSON 값. fallback 하드코딩 동기화 필요.
  BUG-04: app.js init()에서 jeonnam→gwangju 언론사 무조건 병합 → 모든 선거 유형 오염.
fix: |
  BUG-01: generate_key() 수정 - re.sub으로 끝 접미사만 strip. 복합명은 앞 4글자.
          key 충돌 방지 체크 추가 (이미 존재하는 키 스킵).
  BUG-02: superintendents.gwangju에 previousJeonnamSuperintendent 필드 추가
          (김대중, 진보, 2022~, 전라남도 현직 교육감).
  BUG-03: data.js 하드코딩을 JSON 값으로 동기화
          (ppp:19→20, reform:2→3, newReform:3→2, surveyDate/reportNo/sampleSize 수정).
  BUG-04: app.js 무조건 병합 코드 제거.
          news-tab.js buildSuperintendentNewsCategories에서 gwangju+superintendent 조건일 때만
          전남 registry 추가 포함.
verification: 4개 커밋 완료 (0272e7a, 338c6dd, 3c00775, 18e28a1)
files_changed:
  - scripts/candidate_pipeline/detect_byelections.py
  - js/data.js
  - js/app.js
  - js/tabs/news-tab.js
