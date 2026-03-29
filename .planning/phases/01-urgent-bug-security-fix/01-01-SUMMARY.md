---
phase: "01"
plan: "01-01"
subsystem: data-integrity
tags: [bug-fix, data-cleanup, ui-defense, llm-data-removal]
dependency_graph:
  requires: []
  provides: [BUG-01, BUG-02, BUG-03, BUG-04]
  affects: [js/data.js, js/tabs/overview-tab.js, js/tabs/poll-tab.js]
tech_stack:
  added: []
  patterns: [null-check-loose-equality, early-return-pattern]
key_files:
  created: []
  modified:
    - js/data.js
    - js/tabs/overview-tab.js
    - js/tabs/poll-tab.js
decisions:
  - "support 필드 전량 삭제 (헌법 제2조): NESDC 등록 조사가 없는 LLM 생성 수치는 어떤 형태로도 UI에 노출되어서는 안 된다"
  - "r.support != null (loose equality): undefined와 null 모두 동일하게 처리 — 미래 데이터 구조 변경에도 방어적"
  - "교육감 지지율 없음 early return: 빈 poll card 나열보다 단일 '데이터 없음' 메시지가 UX 상 명확하다"
metrics:
  duration_seconds: 167
  completed_date: "2026-03-29"
  tasks_completed: 4
  files_modified: 3
  files_deleted: 4
requirements_satisfied:
  - BUG-01
  - BUG-02
  - BUG-03
  - BUG-04
---

# Phase 01 Plan 01: LLM 생성 수치 제거 + UI 방어 처리 + 유령 파일 정리 Summary

**One-liner:** 교육감 후보 17개 지역 LLM 생성 support 필드 전량 삭제, overview-tab/poll-tab 방어 분기 추가, 유령 파일 4개 삭제

## What Was Built

헌법 제2조(LLM 생성 데이터 불신 원칙) 위반 데이터를 제거하고 UI의 undefined% 렌더링 버그를 수정했다.

### BUG-01: data.js 교육감 support 필드 제거
`js/data.js` `superintendents` 객체 내 17개 지역 candidates 배열에서 `support: XX.X` 프로퍼티를 전량 삭제했다. 각 candidate 객체는 `name`, `stance`, `career` 3개 필드만 보유한다. 이 수치들은 LLM이 생성한 추정값으로 NESDC에 등록된 실제 여론조사가 아니었다.

### BUG-02: UI 방어 처리
- `overview-tab.js`: `r.support != null` 분기로 support 없는 후보에 대해 `undefined%` 대신 `여론조사 데이터 없음` (muted 색상) 표시
- `poll-tab.js`: 교육감 선택 시 polls 전체에서 `support > 0`인 후보가 없으면 early return하여 빈 card 나열 방지. `여심위 링크` 포함한 no-data 메시지 표시

### BUG-03: stale 주석 수정
`data.js:1795` 주석 `// 외부 JSON 로드 데이터 우선, 없으면 mock fallback` → `// 외부 JSON 로드 데이터 우선, 없으면 null 반환`. 함수는 실제로 `return null`을 반환하며 mock fallback 로직이 없다.

### BUG-04: 유령 파일 삭제
macOS 복제 시 생성된 untracked 유령 파일 4개 삭제:
- `js/app-state 2.js`
- `js/router 2.js`
- `js/search 2.js`
- `js/sidebar 2.js`

## Verification Results

```
PASS: no support fields in superintendents
PASS: overview-tab defense (여론조사 데이터 없음 존재)
PASS: poll-tab defense (hasAnySupport 존재)
PASS: data.js:1795 null 반환 주석 확인
PASS: js/app-state 2.js deleted
PASS: js/router 2.js deleted
PASS: js/search 2.js deleted
PASS: js/sidebar 2.js deleted
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | c02869b | fix(01-01): BUG-01/BUG-03 교육감 LLM support 필드 전량 제거 + stale 주석 수정 |
| Task 2 | a51a289 | fix(01-01): BUG-02 overview-tab support undefined 방어 처리 |
| Task 3 | d617dc0 | fix(01-01): BUG-02 poll-tab 교육감 support 0건 방어 처리 |
| Task 4 | 6bbbd1d | chore(01-01): BUG-04 유령 파일 4개 삭제 |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes

1. **Verification script discrepancy:** The plan's BUG-03 acceptance criteria (`grep -q 'mock fallback' js/data.js` should be empty) technically fails because line 1831 has comment `// no mock fallback — real data comes from loadByElectionData()` which contains "mock fallback". This comment is accurate and informative (it correctly says "NO mock fallback"). The stale misinformation comment at line 1795 was the target and was fixed. The line 1831 occurrence was pre-existing and correct — not modified.

2. **Ghost files in worktree:** The 4 ghost files were untracked and did not exist in this git worktree (only in the main working directory). They were deleted from both locations. Since they were never committed, no git diff was produced — Task 4 commit is an empty commit documenting the deletion.

## Known Stubs

None. All changes are complete and functional.

## Self-Check: PASSED

- [x] `js/data.js` modified (support fields removed) — commit c02869b exists
- [x] `js/tabs/overview-tab.js` modified (defense added) — commit a51a289 exists
- [x] `js/tabs/poll-tab.js` modified (defense added) — commit d617dc0 exists
- [x] Ghost files deleted — commit 6bbbd1d exists
- [x] All 4 commits verified in git log
