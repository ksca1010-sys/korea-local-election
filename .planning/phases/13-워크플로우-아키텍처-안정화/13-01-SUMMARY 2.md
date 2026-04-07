---
phase: 13-워크플로우-아키텍처-안정화
plan: "01"
subsystem: github-actions
tags: [concurrency, continue-on-error, workflow-resilience, git-push-safety]
dependency_graph:
  requires: []
  provides: [GIT-01, INDEP-01, INDEP-02]
  affects: [all-14-workflows]
tech_stack:
  added: []
  patterns: [github-actions-concurrency, continue-on-error-step-level, inline-yaml-validation]
key_files:
  modified:
    - .github/workflows/update-byelection.yml
    - .github/workflows/update-polls.yml
    - .github/workflows/update-overview.yml
    - .github/workflows/update-gallup.yml
    - .github/workflows/update-election-stats.yml
    - .github/workflows/update-governor-status.yml
    - .github/workflows/update-local-council.yml
    - .github/workflows/update-local-media.yml
    - .github/workflows/update-mayor-status.yml
    - .github/workflows/update-superintendent-status.yml
    - .github/workflows/data-health-check.yml
    - .github/workflows/fetch-disclosures.yml
    - .github/workflows/monitor-failures.yml
    - .github/workflows/update-candidates.yml
decisions:
  - "cancel-in-progress: false 선택 — 실행 중인 수집 작업 취소 시 부분 데이터 저장 위험"
  - "monitor-failures.yml에 continue-on-error 미적용 — 실패 감지 자체가 핵심 동작"
  - "update-polls.yml 인라인 json 검증 사용 — validate_pipeline.py는 data/candidates/ 전용"
  - "update-byelection.yml에 validate_pipeline.py 연결 (INDEP-02) — byelection.json 이미 검증 대상"
  - "update-candidates.yml 0a/0b/0c/0.5 스텝에도 continue-on-error 추가 — 5/14 이전 NEC API empty response 방어"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-03"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 14
---

# Phase 13 Plan 01: 워크플로우 아키텍처 안정화 Summary

**One-liner:** 14개 GitHub Actions 워크플로우 전체에 concurrency 직렬화 + 13개에 step-level continue-on-error 적용으로 git push 경쟁 상태 및 일시적 API 장애로 인한 파이프라인 중단 방지

## What Was Built

### Task 1: 14개 워크플로우 concurrency 블록 추가 (GIT-01)

모든 14개 워크플로우에 동일한 concurrency 블록을 `on:` 블록과 `jobs:` 블록 사이에 추가:

```yaml
concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: false
```

`cancel-in-progress: false`를 선택한 이유: 이미 실행 중인 데이터 수집 작업을 취소하면 부분 저장 위험이 있으며, 대기 후 순차 실행이 안전하다.

### Task 2: 13개 워크플로우 continue-on-error 적용 (INDEP-01 + INDEP-02)

monitor-failures.yml을 제외한 13개 워크플로우의 외부 의존 스텝에 `continue-on-error: true` 적용:

| 워크플로우 | 적용 스텝 수 | 비고 |
|----------|-----------|------|
| update-byelection.yml | 4개 | Step1/2/3 + validate_pipeline.py (INDEP-02) |
| update-polls.yml | 3개 | NESDC pipeline / reparse / inline json 검증 |
| update-overview.yml | 4개 | 4개 독립 스크립트 전체 |
| update-candidates.yml | 13개 | 기존 9개 + 0a/0b/0c/0.5 4개 신규 추가 |
| 단일 스크립트 9개 | 1~2개씩 | 핵심 Python 스텝 |
| monitor-failures.yml | 0개 | **적용 제외 — 실패 감지 핵심 동작 보호** |

**INDEP-02:** update-byelection.yml에 `validate_pipeline.py` 스텝 추가 (재보궐 후보 스키마 조기 감지). update-polls.yml에는 인라인 json 파싱 검증 추가.

**적용 금지 스텝 준수:** diff(`id: diff`), Commit and push 스텝에는 미적용.

## Verification Results

```
concurrency 적용: 14/14
cancel-in-progress: false 적용: 14/14
전체 YAML 파싱 통과 (14개)
monitor-failures.yml: 0개 continue-on-error (정상)
update-byelection.yml: 4개 (3+ 요구사항 충족)
update-polls.yml: 3개 (2+ 요구사항 충족)
update-overview.yml: 4개 (4+ 요구사항 충족)
```

## Commits

| Task | Commit | 설명 |
|------|--------|------|
| Task 1 | b1b25b7 | feat(13-01): 14개 워크플로우 전체에 concurrency 블록 추가 (GIT-01) |
| Task 2 | 8657c8f | feat(13-01): 13개 워크플로우 외부 의존 스텝에 continue-on-error 적용 (INDEP-01) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] update-polls.yml 인라인 Python YAML 파싱 오류**
- **Found during:** Task 2
- **Issue:** `run: python -c "... f'polls: {len(...)}건 — ..."` 에서 콜론(`:`)이 YAML 매핑으로 해석되어 `ScannerError: mapping values are not allowed here` 발생
- **Fix:** `run: |` 멀티라인 블록으로 변환하고 f-string 대신 변수 분리 방식으로 수정
- **Files modified:** `.github/workflows/update-polls.yml`
- **Commit:** 8657c8f (Task 2 커밋에 포함)

### Additional Scope (Plan 허용 범위 내)

**update-candidates.yml 0a/0b/0c/0.5 스텝 continue-on-error 추가:**
- RESEARCH.md Open Question 2에서 명시적으로 언급된 항목
- 5/14 이전 NEC API가 empty response를 반환 시 실패 방지 목적
- plan의 Task 2 action에 "각 스텝을 읽고 외부 API 호출 여부를 확인 후 적용 판단" 지시에 따라 포함

## Known Stubs

없음 — 이 Plan은 YAML 편집 전용이며 데이터 스텁이 없다.

## Self-Check: PASSED

- `.github/workflows/update-byelection.yml` 존재: FOUND
- `.github/workflows/monitor-failures.yml` 존재: FOUND
- commit `b1b25b7` 존재: FOUND
- commit `8657c8f` 존재: FOUND
- 14개 YAML 파싱: 통과
- monitor-failures.yml continue-on-error: 0개 (정상)
