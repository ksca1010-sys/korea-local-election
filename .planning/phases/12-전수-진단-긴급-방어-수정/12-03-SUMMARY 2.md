---
phase: 12-전수-진단-긴급-방어-수정
plan: "03"
subsystem: github-actions-permissions
tags: [permissions, security, audit, workflow, verification]
dependency_graph:
  requires: [12-01, 12-02]
  provides: [PERM-01, phase-12-final-verification]
  affects: [.github/workflows/data-health-check.yml, .github/workflows/update-gallup.yml]
tech_stack:
  added: []
  patterns: [permissions-annotation, minimum-privilege-principle]
key_files:
  created:
    - .planning/phases/12-전수-진단-긴급-방어-수정/12-03-SUMMARY.md
  modified:
    - .github/workflows/data-health-check.yml
    - .github/workflows/update-gallup.yml
decisions:
  - "data-health-check.yml actions:write는 gh workflow run (trigger_workflow 함수) 실사용 확인 — 유지"
  - "data-health-check.yml 주석을 gh run rerun 대신 gh workflow run으로 정확히 수정 (RESEARCH.md 오기 수정)"
  - "update-gallup.yml trigger-overview job actions:write는 update-overview.yml 연쇄 트리거 목적으로 올바름"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_changed: 2
---

# Phase 12 Plan 03: permissions 주석 정규화 + 최종 검증 Summary

**한 줄 요약:** 2개 워크플로우 permissions 블록에 권한 필요 근거 주석 추가 + Phase 12 성공 기준 4개 항목 전체 PASS 검증 완료

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | permissions 필요성 검증 + 주석 정규화 | 86de4dc | data-health-check.yml, update-gallup.yml |
| 2 | Phase 12 최종 검증 (4개 성공 기준 일괄 확인) | (SUMMARY 커밋) | 12-03-SUMMARY.md |

## What Was Built

### Task 1: permissions 주석 정규화

**코드 분석 결과 (data-health-check.yml):**
- `data_health_check.py`의 `trigger_workflow()` 함수가 `subprocess.run(["gh", "workflow", "run", ...])` 호출 확인
- RESEARCH.md에 "gh run rerun"이라고 기재되어 있었으나 실제로는 `gh workflow run`임 (RESEARCH.md 오기)
- `actions: write` 권한은 실사용이 확인되므로 유지
- `contents: write` 주석도 heal_state 커밋 목적으로 명시

**update-gallup.yml trigger-overview job:**
- `gh workflow run update-overview.yml` 호출로 actions:write 필요성 확인
- job-level permissions 선언은 올바른 패턴 (최소 권한 — update job에는 actions:write 없음)

**적용된 주석:**
```yaml
# data-health-check.yml
permissions:
  contents: write  # git push — heal_state 결과 data/.heal_state.json 커밋
  actions: write   # gh workflow run — 실패 워크플로우 자동 재실행 (trigger_workflow)

# update-gallup.yml trigger-overview
permissions:
  actions: write   # gh workflow run — update-overview.yml 연쇄 트리거
```

### Task 2: Phase 12 최종 검증 결과

| 성공 기준 | 검증 항목 | 결과 |
|----------|----------|------|
| DIAG-01 | 12-AUDIT-REPORT.md 존재 | PASS |
| CRASH-01 | nec_precand_sync.py data["response"]["body"] 직접 접근 0건 | PASS |
| CRASH-01 | data_health_check.py c["name"] 직접 접근 0건 | PASS |
| CRASH-02 | data/candidates/ JSON 빈 name 레코드 0건 | PASS |
| PERM-01 | 14개 워크플로우 전부 permissions 블록 존재 | PASS |

**결론: Phase 12 성공 기준 4개 항목 전체 PASS**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RESEARCH.md 오기 수정 반영**
- **Found during:** Task 1 코드 분석
- **Issue:** PLAN.md/RESEARCH.md에 "gh run rerun"이라고 기재되어 있었으나, 실제 `data_health_check.py`의 `trigger_workflow()` 함수는 `gh workflow run`을 사용
- **Fix:** 주석을 `# gh workflow run` (실제 명령)으로 정확히 작성. PLAN.md의 must_haves artifact `contains: "# gh run rerun"` 는 주석 존재 여부 확인을 위한 예시였으므로 실제 명령 기준으로 수정
- **Files modified:** .github/workflows/data-health-check.yml
- **Commit:** 86de4dc

## Phase 12 전체 완료 요약

| Plan | 내용 | 커밋 |
|------|------|------|
| 12-01 | 14개 워크플로우 전수 감사 리포트 생성 + 중복 파일 삭제 | 390d639 |
| 12-02 | Python 파이프라인 방어 코드 4개 스크립트 적용 | 057966c, f51b39f |
| 12-03 | permissions 주석 정규화 + Phase 12 최종 검증 | 86de4dc |

## Known Stubs

없음 — 이 플랜은 워크플로우 메타데이터 + 검증이며 UI 렌더링 관련 스텁 없음

## Self-Check: PASSED

- [x] data-health-check.yml 수정됨, "# gh workflow run" 주석 존재
- [x] update-gallup.yml 수정됨, "# gh workflow run" 주석 존재
- [x] DIAG-01: 12-AUDIT-REPORT.md 존재 확인
- [x] CRASH-01: nec_precand_sync.py 직접 접근 0건
- [x] CRASH-01: data_health_check.py 직접 접근 0건
- [x] CRASH-02: data/candidates/ 빈 name 레코드 0건
- [x] PERM-01: 14개 워크플로우 전부 permissions 블록 존재
- [x] Task 1 commit: 86de4dc 존재 확인
