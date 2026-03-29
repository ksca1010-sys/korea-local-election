---
phase: 06-본후보-등록-대응
plan: "02"
subsystem: candidate-tab
tags: [candidates, filter, ballot-number, nominated, withdrawn]
dependency_graph:
  requires: []
  provides: [CAND-02, CAND-03]
  affects: [candidate-tab.js]
tech_stack:
  added: []
  patterns: [status-filter, sortMode-branch]
key_files:
  modified:
    - js/tabs/candidate-tab.js
decisions:
  - render()에서 단일 필터 처리 (buildModel 각 분기에 중복 필터 추가하지 않음)
  - ballot_number 모드에서 NOMINATED 이외 전체 제거 (DECLARED/EXPECTED/RUMORED/WITHDRAWN 포함)
metrics:
  duration: "< 5 min"
  completed: "2026-03-30"
  tasks_completed: 1
  tasks_total: 2
  files_changed: 1
---

# Phase 6 Plan 02: 후보 탭 NOMINATED 필터 + 기호순 UI 전환 Summary

## One-liner

`ballot_number` 모드에서 NOMINATED만 기호순으로 표시하고 `status_priority` 모드에서 WITHDRAWN을 전 선거 유형에서 제거하는 필터 로직을 `candidate-tab.js` render()에 추가.

## Status

**Task 1: 완료 (commit 8de74b2)**
**Task 2: 수동 UAT 대기 중** — 브라우저에서 ballot_number 모드 시뮬레이션 검증 필요

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | buildModel() ballotNumber/status 전달 + render() 필터 추가 | 8de74b2 | js/tabs/candidate-tab.js |

## Changes Made

### 변경 1-2: governor/superintendent buildModel() — ballotNumber 전달
- `incumbent` 필드 뒤에 `ballotNumber: candidate.ballotNumber || null` 추가
- Line 102 (governor), Line 135 (superintendent)

### 변경 3: mayor buildModel() — status + ballotNumber 전달
- `status: candidate.status` 추가
- `statusMeta: getStatusMeta(candidate.status)` 추가
- `ballotNumber: candidate.ballotNumber || null` 추가
- Line 174-176

### 변경 4: render() 정렬/필터 분기 교체
- `ballot_number` 모드: NOMINATED만 표시 + ballotNumber 기호순 정렬 (D-07)
- `status_priority` 모드: WITHDRAWN 제거 후 상태 우선순위 정렬 (CAND-03)
- `statusOrder`에서 `WITHDRAWN: 4` 제거 (filter로 이미 제거되므로 불필요)

### 변경 5: 선거구 미확정 안내 문구 (D-14)
- `ballot_number` 모드 + mayor + 후보 0명일 때 `model.emptyMessage` 교체
- "공식 후보 등록 마감 후 선거구 확정 중입니다" 표시

## Deviations from Plan

None — 플랜에 명시된 5가지 변경을 정확히 적용.

## Pending: Task 2 수동 UAT

Task 2(checkpoint:human-verify)는 브라우저 수동 확인이 필요합니다.

**사전 준비:** `python -m http.server 8000` 후 `http://localhost:8000` 접속

**테스트 1 — 현재 상태 (status_priority 모드):**
1. 서울 클릭 → 후보 탭
2. DECLARED/EXPECTED/RUMORED 후보가 상태 우선순위 정렬 확인
3. WITHDRAWN 후보가 목록에서 제거됨 확인 (CAND-03)

**테스트 2 — ballot_number 모드 시뮬레이션:**
```javascript
ElectionCalendar._origGetCandidateSortMode = ElectionCalendar.getCandidateSortMode;
ElectionCalendar.getCandidateSortMode = () => 'ballot_number';
```
1. 서울 클릭 → NOMINATED 후보만 표시되고 나머지 사라짐 (D-07)
2. 후보가 ballotNumber 기호순 정렬 확인

**테스트 3 — 미확정 선거구 안내:**
1. ballot_number 모드 유지 + 기초단체장 후보 0명인 시군구 클릭
2. "공식 후보 등록 마감 후 선거구 확정 중입니다" 표시 확인 (D-14)

**복원:**
```javascript
ElectionCalendar.getCandidateSortMode = ElectionCalendar._origGetCandidateSortMode;
```

## Known Stubs

없음.

## Self-Check: PASSED

- js/tabs/candidate-tab.js: FOUND
- commit 8de74b2: FOUND
