# Roadmap: 선거정보지도 v1.0

## Overview

현재 운영 중인 선거 정보 지도를 6.3 선거일 전까지 안정화하는 마일스톤이다. Phase 1에서 법적 위반 소지가 있는 버그와 보안 헤더를 즉시 수정하고, Phase 2에서 70여 건의 미처리 여론조사 PDF를 자동화 파이프라인으로 처리하며, Phase 3에서 성능·UX를 개선하고 신규 기능을 추가한다. Phase 4는 선거일 당일 실시간 개표 반영으로 마무리된다.

## Phases

- [ ] **Phase 1: 긴급 버그·보안 수정** - LLM 생성 수치 제거, 보안 헤더 추가, PIPA 동의 게이트 — 다음 배포 전 필수
- [x] **Phase 2: 데이터 파이프라인 자동화** - 70+ 여론조사 PDF 일괄 처리, 수치 검증 자동화, 버그 관리 체계 수립 (completed 2026-03-29)
- [x] **Phase 3: 성능 최적화 + 기능 추가** - 지연 로딩, esbuild 번들, 여론조사 트렌드 차트, URL 공유, 모바일 UX (completed 2026-03-29)
- [ ] **Phase 4: 선거일 실시간 개표** - Cloudflare Worker 폴링으로 실시간 개표 결과 지도 반영

## Phase Details

### Phase 1: 긴급 버그·보안 수정
**Goal**: 헌법 제2조 위반 LLM 수치를 제거하고, HTTP 보안 헤더와 PIPA 동의 게이트를 추가하여 다음 배포 전 법적·보안 리스크를 0으로 낮춘다.
**Depends on**: Nothing (first phase)
**Requirements**: BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, QUAL-01, QUAL-02
**Success Criteria** (what must be TRUE):
  1. `data.js:1529-1545` 교육감 `support` 필드가 모두 제거되어 여론조사 탭과 개요 탭에 LLM 생성 수치가 표시되지 않는다
  2. `overview-tab.js`와 `poll-tab.js`에서 `support === undefined`일 때 UI가 빈 값이나 "데이터 없음"을 표시하고 JS 오류가 발생하지 않는다
  3. 배포된 사이트에 `curl -I` 시 `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy` 헤더가 응답에 포함된다
  4. 신규 방문자에게 Clarity 동의 배너가 표시되고, 동의 전에는 Clarity 세션 레코딩이 시작되지 않는다
  5. 유령 파일 4개(`app-state 2.js` 등)가 레포에서 삭제되고 `git status`에 나타나지 않는다
  6. `index.html`의 CSS와 JS 버전 타임스탬프가 동일한 값으로 통일된다
**Plans**: 2 plans

Plans:
- [x] 01-01: `data.js` LLM 수치 제거 + `overview-tab.js`·`poll-tab.js` 방어 처리 + 유령 파일·스테일 주석 정리
- [x] 01-02: `_headers` 보안 헤더 파일 추가 + Microsoft Clarity PIPA 동의 게이트 구현 + CSS/JS 버전 통일

### Phase 2: 데이터 파이프라인 자동화
**Goal**: 70+ 미처리 여론조사 PDF를 일괄 처리하고, `pollSource` 없는 수치가 UI까지 도달하지 못하도록 검증 자동화를 파이프라인에 내재화하며 버그 관리 프로세스를 수립한다.
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. `data/polls/pdfs/` 내 70+ PDF가 `poll_audit_pdf.py --batch`로 처리되어 `audit_report.json`이 생성된다
  2. `npm run check:polls` (또는 pre-deploy 훅)가 `pollSource` 없는 부동소수점 퍼센트 값을 감지하면 0이 아닌 종료 코드를 반환한다
  3. `data-loader.js` 개발 환경에서 `validateCandidates()`가 실행되고, `pollSource` 없는 `support` 값이 있으면 콘솔에 경고를 출력한다
  4. `.planning/bugs/OPEN.md`가 존재하고 현재 알려진 버그가 항목으로 등재되어 있다
**Plans**: 2 plans

Plans:
- [x] 02-01: `poll_audit_pdf.py --batch` 실행 및 `audit_report.json` 생성 + `audit_numeric_fields.py` 작성 + pre-deploy 훅 연동
- [x] 02-02: `data-loader.js` `validateCandidates()` 가드 추가 + `.planning/bugs/OPEN.md` 버그 레지스터 생성

### Phase 3: 성능 최적화 + 기능 추가
**Goal**: 대용량 JSON 지연 로딩과 esbuild 번들로 초기 로드를 개선하고, 여론조사 트렌드 차트·URL 공유·.ics 내보내기·스켈레톤 스크린·모바일 스와이프를 추가하여 선거일 전 UX를 완성한다.
**Depends on**: Phase 2
**Requirements**: QUAL-03, QUAL-04, QUAL-05, QUAL-06, FEAT-01, FEAT-02, FEAT-03, FEAT-04, FEAT-05
**Success Criteria** (what must be TRUE):
  1. 앱 초기 로딩 시 `historical_elections_full.json`(9.7MB)과 `council_history.json`(5.4MB)이 네트워크 탭에 나타나지 않고, 각각 해당 탭을 처음 열 때 한 번만 fetch된다
  2. `npm run build`가 오류 없이 완료되고 배포 산출물 JS 크기가 기존 ~1.1MB 대비 유의미하게 감소한다
  3. `npm run lint`가 ESLint 오류 0건으로 통과한다
  4. 여론조사 탭에서 후보별 지지율 시계열 차트가 실제 날짜 축(time scale)으로 렌더링된다
  5. 정보 패널 상단의 "링크 복사" 버튼을 클릭하면 현재 지역·탭 상태를 담은 URL이 클립보드에 복사된다
  6. 모바일 브라우저에서 사이드 패널을 아래로 스와이프하면 패널이 닫힌다
**Plans**: 3 plans

Plans:
- [x] 03-01: `historical_elections_full.json`·`council_history.json` 지연 로딩 + esbuild 번들 빌드 단계 추가 + ESLint 오류 0건 달성
- [x] 03-02: 여론조사 트렌드 차트 (Chart.js time scale) + URL 공유 버튼 + .ics 캘린더 내보내기
- [x] 03-03: 탭 스켈레톤 스크린 + 모바일 패널 스와이프 닫기
**UI hint**: yes

### Phase 4: 선거일 실시간 개표
**Goal**: Cloudflare Worker가 `info.nec.go.kr`을 60초 간격으로 폴링하여 선거일(6.3) 개표 결과를 지도에 실시간으로 반영하고, Worker 장애 시 수동 JSON 입력 경로로 자동 폴백한다.
**Depends on**: Phase 3
**Requirements**: FEAT-06
**Success Criteria** (what must be TRUE):
  1. `ElectionCalendar.getCurrentPhase() === 'election_night'` 상태에서 브라우저가 60초마다 Worker 엔드포인트를 폴링하고 지도에 개표율이 반영된다
  2. Worker가 응답하지 않을 때 UI에 "수동 업데이트 모드" 메시지가 표시되고 수동 JSON 입력 경로가 작동한다
  3. 2022년 아카이브 데이터로 Worker를 테스트했을 때 개표 진행률이 지도에 올바르게 시각화된다
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md -- Cloudflare Worker 골격 + election_night 페이즈 추가 + 2022 아카이브 파서 테스트
- [ ] 04-02-PLAN.md -- 브라우저 폴링 클라이언트 + 수동 폴백 경로 + 지도 개표 결과 시각화

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. 긴급 버그·보안 수정 | 1/2 | In Progress|  |
| 2. 데이터 파이프라인 자동화 | 2/2 | Complete   | 2026-03-29 |
| 3. 성능 최적화 + 기능 추가 | 3/3 | Complete   | 2026-03-29 |
| 4. 선거일 실시간 개표 | 1/2 | In Progress|  |
