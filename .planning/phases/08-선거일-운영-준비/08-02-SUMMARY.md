---
phase: 08-선거일-운영-준비
plan: 02
subsystem: infra
tags: [election-night, fallback, worker, ops, manual-fallback, json]

# Dependency graph
requires:
  - phase: 07-개표-시스템-완성
    provides: "_setManualFallbackMode, _handleManualJsonInput 구현, #manual-fallback-container UI"
provides:
  - "workers/FALLBACK-GUIDE.md — Worker 장애 시 5분 내 수동 JSON 폴백 전환 운영 매뉴얼"
  - "폴백 코드 경로 6개 시나리오 검증 완료 (OPS-03 CODE PASS)"
affects: [08-선거일-운영-준비]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "체크박스 스타일 운영 매뉴얼 (CAPTURE-GUIDE.md와 동일 패턴)"
    - "Node.js 임시 검증 스크립트로 브라우저 IIFE 로직 재현 검증"

key-files:
  created:
    - workers/FALLBACK-GUIDE.md
  modified: []

key-decisions:
  - "FALLBACK-GUIDE.md를 workers/ 디렉터리에 CAPTURE-GUIDE.md와 함께 배치 — 운영 문서 집중 관리"
  - "검증 스크립트는 /tmp에만 작성 — app.js 수정 없이 로직 재현 검증 (헌법 제2조: 코드 경로 불변 유지)"
  - "declared:true 조건을 주의사항 섹션에 명시 — 헌법 제2조(LLM 생성 데이터 불신) 운영자 교육"

patterns-established:
  - "운영 매뉴얼은 6단계 체크박스 + JSON 예시 + 오류 대처 테이블 구조"

requirements-completed: [OPS-03]

# Metrics
duration: 8min
completed: 2026-03-30
---

# Phase 08 Plan 02: Worker 폴백 운영 매뉴얼 Summary

**Worker 장애 시 5분 내 수동 JSON 입력 복구를 위한 6단계 체크박스 매뉴얼(workers/FALLBACK-GUIDE.md) 작성 및 폴백 코드 경로 6개 시나리오 검증 완료**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-30T04:40:00Z
- **Completed:** 2026-03-30T04:48:00Z
- **Tasks:** 2
- **Files modified:** 1 (created)

## Accomplishments

- `workers/FALLBACK-GUIDE.md` 142줄 작성 — 비기술 운영자도 따라할 수 있는 6단계 체크박스 절차
- 17개 광역 지역 키, JSON 스키마, 오류 대처 테이블 포함
- `declared:true` 조건 주의사항 명시 (헌법 제2조 준수)
- Node.js 검증 스크립트로 `_handleManualJsonInput()` + `_setManualFallbackMode()` 로직 6개 시나리오 전체 통과
- js/app.js 및 index.html 무수정 확인

## Task Commits

각 Task 원자적 커밋:

1. **Task 1: FALLBACK-GUIDE.md 작성** — `55802f1` (docs)
2. **Task 2: 폴백 코드 경로 검증** — 검증 스크립트 /tmp 실행 전용, 별도 커밋 없음 (코드 변경 없음)

## Files Created/Modified

- `workers/FALLBACK-GUIDE.md` — Worker 장애 시 수동 JSON 폴백 전환 6단계 운영 매뉴얼 (142줄)

## Decisions Made

- FALLBACK-GUIDE.md를 `workers/` 디렉터리에 CAPTURE-GUIDE.md와 함께 배치 — 선거 당일 운영 문서 집중 관리
- 검증 스크립트는 `/tmp/test-fallback-code.js`에만 작성 — app.js 수정 없이 로직 재현 검증
- `declared:true` 조건을 주의사항 섹션에 명시 — 운영자 실수 방지 (헌법 제2조)

## Deviations from Plan

없음 — 계획대로 실행됨.

## Issues Encountered

- Task 2 검증 스크립트 최초 실행 시 `passed === 6` 조건이 실제 assert 수(10개)와 불일치하여 exit(1) 반환 — 조건을 `failed === 0`으로 수정 후 OPS-03 CODE PASS 확인

## Known Stubs

없음 — FALLBACK-GUIDE.md는 운영 매뉴얼이며 실제 _setManualFallbackMode / _handleManualJsonInput 코드 경로를 문서화함.

## User Setup Required

없음 — 코드 변경 없음. FALLBACK-GUIDE.md는 선거 당일 운영자용 절차 문서.

## Next Phase Readiness

- Phase 08 Plan 03 (최종 점검 체크리스트) 착수 가능
- workers/FALLBACK-GUIDE.md + workers/CAPTURE-GUIDE.md 두 운영 문서 준비 완료

---
*Phase: 08-선거일-운영-준비*
*Completed: 2026-03-30*
