---
phase: 07-개표-시스템-완성
plan: 02
subsystem: infra
tags: [cloudflare-worker, wrangler, kv, election-night, banner, app.js]

# Dependency graph
requires:
  - phase: 07-01
    provides: parseNECResponse() skeleton + workers/election-night/index.js
  - phase: 04-election-night
    provides: _pollElectionResults() 폴링 루프 + Election Night 섹션 in app.js
provides:
  - Worker 통합 테스트 통과 (ELEC-02): wrangler dev /health + /results 17개 지역 확인
  - _updateElectionBanner(data) 함수 — 17개 지역 countRate 평균 → 배너 텍스트 업데이트
affects:
  - 07-03-PLAN (브라우저 UAT — 배너 동작 확인)
  - Phase 8 선거일 대비

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "KV 주입 패턴: wrangler kv key put --local --preview false — scheduled() 시간 범위 조건 우회"
    - "_updateElectionBanner: banner.querySelector('.banner-text').textContent 직접 업데이트 — sidebar.js와 분리"
    - "countRate 평균: Object.values(regions).map(r=>r.countRate).filter(typeof number) → reduce / length"

key-files:
  created: []
  modified:
    - js/app.js

key-decisions:
  - "KV fixture 직접 주입으로 scheduled() 시간 범위 조건 우회 — wrangler dev --test-scheduled 사용"
  - "_updateElectionBanner는 배너 텍스트만 업데이트, display 제어는 sidebar.js renderElectionBanner() 담당 (분리 원칙)"
  - "avgRate 계산: 17개 지역 countRate 단순 평균 (가중치 없음) — 개표 진행률 근사치 표시 목적"

patterns-established:
  - "KV 로컬 테스트: --preview false 플래그 필수 (preview_id 충돌 방지)"

requirements-completed: [ELEC-02]

# Metrics
duration: 15min
completed: 2026-03-30
---

# Phase 07 Plan 02: Worker 통합 테스트 + _updateElectionBanner() 구현 Summary

**wrangler dev KV 주입 방식으로 ELEC-02 통합 테스트 완료 + app.js에 _updateElectionBanner() 추가 (17개 지역 countRate 평균 → 배너 텍스트 실시간 업데이트)**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-29T23:44:00Z
- **Completed:** 2026-03-29T23:59:00Z
- **Tasks:** 2
- **Files modified:** 1 (js/app.js)

## Accomplishments
- ELEC-02 달성: wrangler dev 기동 후 /health=`{"status":"ok"}`, /results=17개 region JSON 반환 확인
- KV 직접 주입 방식 (`npx wrangler kv key put --local --preview false`) 으로 scheduled() 시간 범위 조건 우회
- test-parser.cjs 8/8 통과 재확인
- _updateElectionBanner(data) 함수 구현: 17개 지역 countRate 평균 계산, `개표 진행 중 — 전체 XX.X% (HH:MM 기준)` 형식으로 배너 텍스트 업데이트
- _pollElectionResults() 성공 경로에 _updateElectionBanner(data) 호출 연결
- Public API에 _updateElectionBanner 노출 (디버그용)

## Task Commits

1. **Task 1: Worker 통합 테스트 (ELEC-02)** - `6bc551b` (chore)
2. **Task 2: _updateElectionBanner() 구현** - `0f7bca8` (feat)

## Files Created/Modified
- `js/app.js` - _updateElectionBanner(data) 함수 추가 (15줄), _pollElectionResults() 호출 추가, Public API 노출

## Decisions Made
- KV fixture 직접 주입으로 scheduled() 시간 범위 조건 우회 — `--preview false` 플래그 필수 (preview_id 충돌 방지)
- _updateElectionBanner는 `.banner-text` textContent 만 업데이트 — display/hide는 sidebar.js renderElectionBanner() 담당
- avgRate: 17개 지역 countRate 단순 평균 (가중치 없음) — 개표 진행률 근사치 표시 목적

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- wrangler kv put 실행 시 `preview_id 충돌` 오류 — `--preview false` 플래그 추가로 해결
- worktree에 workers/ 디렉토리와 최신 js/app.js 없음 — `git checkout main -- workers/ js/app.js`로 가져온 후 진행

## User Setup Required
None - 외부 서비스 설정 불필요. 실제 wrangler dev는 로컬 전용 테스트.

## Next Phase Readiness
- ELEC-02 완료 — 07-03(브라우저 UAT)에서 배너 동작 확인 필요
- _updateElectionBanner() 구현 완료 — 폴링 성공 시 배너 텍스트 자동 업데이트
- 5/26 이후 NEC URL 캡처 → workers/CAPTURE-GUIDE.md Step 4~5 → 07-03 배포/테스트

---
*Phase: 07-개표-시스템-완성*
*Completed: 2026-03-30*
