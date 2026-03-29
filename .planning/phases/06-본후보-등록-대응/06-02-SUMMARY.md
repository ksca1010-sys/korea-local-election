---
phase: 06-본후보-등록-대응
plan: "02"
subsystem: candidate-tab-ui
tags: [candidate-tab, nominated-filter, withdrawn-filter, ballot-number, uat-approved]
dependency_graph:
  requires: [06-01]
  provides: [nominated-filter, withdrawn-filter, ballot-number-sort]
  affects: [js/tabs/candidate-tab.js]
tech_stack:
  added: []
  patterns: [getCandidateSortMode-branch, single-render-filter, status-priority-fallback]
key_files:
  created: []
  modified:
    - js/tabs/candidate-tab.js
decisions:
  - "NOMINATED/WITHDRAWN 필터를 buildModel() 각 분기가 아닌 render() 단일 지점에서 처리 — Anti-Pattern 회피 (중복 필터 방지)"
  - "ballot_number 모드에서 NOMINATED만 표시 (DECLARED/EXPECTED/RUMORED/WITHDRAWN 모두 제거)"
  - "status_priority 모드에서는 WITHDRAWN만 제거 (나머지 상태는 유지)"
  - "mayor 0명 + ballot_number 모드: emptyMessage를 '공식 후보 등록 마감 후 선거구 확정 중입니다'로 교체"
metrics:
  duration_seconds: 1440
  completed_date: "2026-03-30"
  tasks_completed: 2
  files_changed: 1
---

# Phase 06 Plan 02: NOMINATED 필터 + 기호순 정렬 전환 Summary

**한 줄 요약:** candidate-tab.js render() 단일 지점에서 getCandidateSortMode() 기반 NOMINATED 전용 필터 및 WITHDRAWN 제거 구현, governor/superintendent/mayor 전 분기에 ballotNumber 전달

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | buildModel() ballotNumber/status 전달 + render() NOMINATED/WITHDRAWN 필터 추가 | 8de74b2 | js/tabs/candidate-tab.js |
| 2 | 후보 탭 정렬 전환 수동 UAT | (checkpoint approved) | — |

## What Was Built

### Task 1: candidate-tab.js 변경 (5개 변경점)

**변경 1~2: buildModel() governor/superintendent 분기 — ballotNumber 전달**
- 기존 `.map()` 내부 `incumbent` 필드 뒤에 `ballotNumber: candidate.ballotNumber || null` 추가
- governor (line 102), superintendent (line 135) 각 분기에 동일하게 적용

**변경 3: buildModel() mayor 분기 — status + ballotNumber 전달**
- mayor 분기의 `.map()`에 `status`, `statusMeta`, `ballotNumber` 세 필드 추가
- 기존에는 status 필드가 없어 render() 필터가 동작 불가한 상태였음

**변경 4: render() — NOMINATED/WITHDRAWN 필터 (단일 지점)**
```javascript
if (sortMode === 'ballot_number') {
    // 본후보 등록 마감 후 NOMINATED만 표시 (D-07)
    model.candidates = model.candidates.filter(c => c.status === 'NOMINATED');
    model.candidates.sort((a, b) => (a.ballotNumber || 999) - (b.ballotNumber || 999));
} else {
    // status_priority 모드에서 WITHDRAWN 제거 (CAND-03)
    model.candidates = model.candidates.filter(c => c.status !== 'WITHDRAWN');
    const statusOrder = { NOMINATED: 0, DECLARED: 1, EXPECTED: 2, RUMORED: 3 };
    model.candidates.sort((a, b) => (statusOrder[a.status] ?? 2.5) - (statusOrder[b.status] ?? 2.5));
}
```

**변경 5: mayor 선거구 미확정 안내 문구 (D-14)**
```javascript
if (!model.candidates.length && sortMode === 'ballot_number' && electionType === 'mayor') {
    model.emptyMessage = '공식 후보 등록 마감 후 선거구 확정 중입니다';
}
```

### Task 2: 수동 UAT 결과 (approved)

- **테스트 1 (WITHDRAWN 제거):** 승인 — status_priority 모드에서 WITHDRAWN 후보 목록에서 제거 확인
- **테스트 2 (NOMINATED 필터):** 승인 — ballot_number 모드에서 NOMINATED 후보만 표시, 기호순 정렬 확인
- **테스트 3 (기초단체장 0명 안내 문구):** 5/14 이후 실사용 시 자연 검증 예정 — ballot_number 모드는 5/15 18:00 이후 활성화되므로 현재 조건 충족 불가 (의도된 시간 기반 동작)

## Deviations from Plan

없음 — 계획에 명시된 5가지 변경을 정확히 적용.

## Auth Gates

없음.

## Known Stubs

없음. 선거구 미확정 안내 문구(D-14)는 5/15 18:00 이후 실사용 시 자연 검증됨.

## Self-Check: PASSED

- `js/tabs/candidate-tab.js` — FOUND (ballotNumber 4건 이상, NOMINATED 3건 이상, WITHDRAWN 필터 존재)
- commit 8de74b2 — FOUND
- UAT 승인: 테스트 1 + 테스트 2 통과
