---
plan: 02-02
phase: 02
subsystem: data-loader, planning
tags: [data-validation, bug-register, dev-guard, data-integrity]
dependency_graph:
  requires: []
  provides: [validateCandidates-guard, bug-register]
  affects: [js/data-loader.js, .planning/bugs/]
tech_stack:
  added: []
  patterns: [IIFE-dev-guard, console.warn-validation, bug-register-process]
key_files:
  created:
    - .planning/bugs/OPEN.md
    - .planning/bugs/CLOSED.md
  modified:
    - js/data-loader.js
decisions:
  - validateCandidates 내부 함수로 유지 (IIFE 패턴 준수), _validateCandidates로 디버깅 노출
  - c.support != null loose equality 사용 (undefined + null 모두 스킵)
  - BUG-P1-WATCH-001 high severity 지정 (LLM 수치 재발 리스크)
metrics:
  duration: 4 minutes
  completed: 2026-03-29
  tasks_completed: 2
  files_changed: 3
requirements: [DATA-04, DATA-05]
---

# Phase 02 Plan 02: data-loader.js validateCandidates 가드 + 버그 레지스터 Summary

## One-liner

개발환경 전용 validateCandidates() 가드로 pollSource 없는 support 값을 console.warn 감지, .planning/bugs/ 레지스터로 알려진 버그 4건 체계화.

## What Was Built

### Task 1: validateCandidates() dev guard (DATA-04)

`js/data-loader.js`의 `DataLoader` IIFE 내부에 `validateCandidates()` 함수를 추가했다. 이 함수는:

- `location.hostname` 체크로 localhost/127.0.0.1 환경에서만 실행 (프로덕션 안전)
- `ED.superintendents` (교육감)와 `ED.governors` (광역단체장) candidates를 순회
- `c.support != null && !c.pollSource` 조건으로 LLM 생성 수치 의심 항목 감지
- 위반 항목을 `console.warn`으로 출력 (빨간 강조 스타일 포함)
- `applyToElectionData()` 완료 직전에 자동 호출
- `_validateCandidates`를 공개 API에 노출 (디버깅 편의)

이 가드는 헌법 제2조 (LLM 생성 데이터 불신 원칙)의 런타임 방어선 역할을 한다.

### Task 2: Bug Register (DATA-05)

`.planning/bugs/` 디렉토리를 생성하고 두 파일을 작성했다:

**OPEN.md** — 현재 활성 버그 4건:
- `BUG-P2-001` (medium): PDF 미처리분 잔여 — polls.json nttId 매칭 누락 가능성
- `BUG-P2-002` (low): pollSource 필드 미도입 — Phase 3 스키마 개선 대상
- `BUG-P2-003` (low): PDF 파싱 실패 가능성 — pdfplumber 레이아웃 대응
- `BUG-P1-WATCH-001` (high): LLM 수치 재발 모니터링 — 자동 파이프라인 재삽입 위험

**CLOSED.md** — Phase 1 수정 완료 버그 5건 기록 (BUG-01~05).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 5d20724 | feat(02-02): add validateCandidates() dev guard to DataLoader |
| Task 2 | 8027371 | feat(02-02): create bug register .planning/bugs/OPEN.md and CLOSED.md |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — `validateCandidates()` checks live ED object data; bug register contains real known issues, no placeholders.

## Self-Check: PASSED

- js/data-loader.js — FOUND
- .planning/bugs/OPEN.md — FOUND
- .planning/bugs/CLOSED.md — FOUND
- commit 5d20724 — FOUND
- commit 8027371 — FOUND
