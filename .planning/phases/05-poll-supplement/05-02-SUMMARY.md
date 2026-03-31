---
phase: 05-poll-supplement
plan: 02
subsystem: infra
tags: [github-actions, poll-sync, publication-ban, election-calendar, kst]

# Dependency graph
requires:
  - phase: 05-poll-supplement
    provides: "05-01 빈값 여론조사 수동 보완 완료, reparse_pdfs.py party_support 필터"
provides:
  - "D-05 규격 poll-sync workflow: 1일 1회 KST 09:00 실행, reparse_pdfs.py 포함"
  - "공표금지 경계값 3개 브라우저 검증 통과 (D-12)"
  - "showSkeleton DOM 교체 버그 수정"
affects: [phase-06, phase-07, phase-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GitHub Actions poll-sync: nesdc_poll_pipeline.py → reparse_pdfs.py 순서 실행"
    - "커밋 메시지 D-07 형식: data: poll sync {날짜} -- 신규 {N}건"
    - "getKST() mock 테스트 → 원복 패턴 (경계값 검증)"

key-files:
  created: []
  modified:
    - ".github/workflows/update-polls.yml"
    - "js/app.js"

key-decisions:
  - "workflow 파일명 유지(update-polls.yml) — rename 시 이전 workflow가 GitHub에 잔존하는 문제 방지"
  - "공표금지 workflow 자체에 로직 미포함 — 5/27 이후 수동 disable (D-08)"
  - "getKST() mock 테스트 패턴 확립 — 날짜 의존 로직 검증 표준 방법"

patterns-established:
  - "Poll boundary test: getKST() 첫 줄 mock 삽입 → 테스트 → 원복 → git diff clean 확인"
  - "showSkeleton 호출 전 탭 컨테이너 존재 확인 필수"

requirements-completed: [POLL-02]

# Metrics
duration: 90min
completed: 2026-03-29
---

# Phase 05 Plan 02: Poll Sync Workflow + 공표금지 검증 Summary

**GitHub Actions poll-sync를 D-05 규격으로 업그레이드(1일 1회, reparse 포함)하고 공표금지 경계값 3개 브라우저 검증 완료**

## Performance

- **Duration:** ~90 min (Task 1 자동 + Task 2 사람 검증 포함)
- **Started:** 2026-03-29T13:00:00Z
- **Completed:** 2026-03-29
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `.github/workflows/update-polls.yml` D-05 규격 업그레이드: 하루 1회(KST 09:00), `reparse_pdfs.py` 단계 추가, D-07 커밋 형식, pip cache, git pull --rebase
- 공표금지 자동 숨김 경계값 3개 테스트 통과: 5/28 01:00 공표금지 메시지 표시, 5/27 23:59 정상 표시, 6/3 18:00 정상 표시
- `showSkeleton()` 버그 발견 및 수정: app.js에서 `showSkeleton()`이 탭 DOM을 교체해 `PollTab.render()`가 조기 return되는 문제 해결

## Task Commits

1. **Task 1: update-polls.yml D-05 규격 업그레이드** - `52ebb83` (feat)
2. **Task 2: 공표금지 브라우저 검증 (checkpoint)** - 사람 검증 완료, getKST() 원복 clean
3. **Bug fix: showSkeleton DOM 교체 버그** - `40070e8` (fix)

**Plan metadata:** (이 커밋)

## Files Created/Modified

- `.github/workflows/update-polls.yml` - D-05 규격으로 전면 교체: 스케줄 1회, reparse 단계, D-07 커밋 형식
- `js/app.js` - showSkeleton() 탭 DOM 교체 버그 수정 (PollTab.render() 조기 return 방지)

## Decisions Made

- `update-polls.yml` 파일명 유지 — rename 시 GitHub에 이전 workflow job이 잔존해 혼란 발생 가능
- 공표금지 로직을 workflow에 포함하지 않음 — 5/27 이후 수동 disable로 처리 (D-08)
- `getKST()` mock 패턴을 날짜 의존 로직 검증 표준으로 확립

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] showSkeleton()이 탭 DOM을 교체해 PollTab.render() 조기 return**
- **Found during:** Task 2 (공표금지 브라우저 검증)
- **Issue:** `app.js`의 `showSkeleton()`이 탭 컨테이너 내부 DOM을 초기화해, 이후 `PollTab.render()`가 `.poll-tab-container` 요소를 찾지 못하고 조기 return
- **Fix:** showSkeleton 호출 순서 조정 또는 탭 컨테이너 존재 확인 로직 추가
- **Files modified:** `js/app.js`
- **Verification:** 경계값 3개 테스트 재실행 — 공표금지 메시지 및 정상 표시 모두 정상 동작 확인
- **Committed in:** `40070e8`

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** 공표금지 검증 중 발견된 실질적 버그. 수정 없이는 여론조사 탭이 항상 빈 상태로 표시됨.

## Issues Encountered

- Task 2 브라우저 검증 중 여론조사 탭에 아무것도 표시되지 않는 현상 발견 → showSkeleton DOM 교체 버그로 확인 → 수정 후 재검증으로 해결

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 05 완료: poll-sync workflow 자동화 + 공표금지 검증 완료
- Phase 06 준비 완료: 5/14~15 본후보 등록 기간 대응 (candidate-tab, NEC API)
- 주의사항: 5/27 이후 `update-polls.yml` workflow 수동 disable 필요 (D-08)

---
## Self-Check: PASSED

- FOUND: `.planning/phases/05-poll-supplement/05-02-SUMMARY.md`
- FOUND: commit `52ebb83` (feat: update-polls.yml D-05 upgrade)
- FOUND: commit `40070e8` (fix: showSkeleton DOM bug)
- `git diff js/election-calendar.js` = 0줄 (원복 확인)

---
*Phase: 05-poll-supplement*
*Completed: 2026-03-29*
