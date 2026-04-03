---
phase: 13-워크플로우-아키텍처-안정화
plan: "02"
subsystem: github-actions
tags: [schema-validation, continue-on-error, validate_pipeline, polls-json]
dependency_graph:
  requires: [13-01]
  provides: [INDEP-02]
  affects: [update-byelection.yml, update-polls.yml]
tech_stack:
  added: []
  patterns: [inline-python-validation, validate_pipeline-step]
key_files:
  created: []
  modified:
    - .github/workflows/update-byelection.yml
    - .github/workflows/update-polls.yml
decisions:
  - "13-01 executor가 Plan 02 작업을 선제적으로 완료 — 재작업 없이 검증만 수행"
  - "validate_pipeline.py step은 factcheck 이후 diff 이전 위치로 정확히 적용됨 (INDEP-02)"
  - "update-polls.yml 인라인 json 검증은 멀티라인 run: | 블록으로 YAML 파싱 오류 회피"
metrics:
  duration_minutes: 3
  completed_date: "2026-04-03"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 0
---

# Phase 13 Plan 02: 파이프라인 스키마 검증 연결 Summary

**One-liner:** Plan 13-01 executor가 validate_pipeline.py (byelection) + 인라인 JSON 파싱 (polls) 두 검증 스텝을 선제 적용하여 Plan 02 목표가 이미 달성된 상태로 확인됨

## What Was Built

이 Plan의 두 태스크는 Plan 13-01 실행 중에 이미 완료되었다.

### Task 1: update-byelection.yml — validate_pipeline.py 연결 (INDEP-02)

`Validate pipeline data` 스텝이 Step 3 (factcheck) 이후, `Check for changes` (id: diff) 이전에 정확히 위치함:

```yaml
      - name: Validate pipeline data
        continue-on-error: true
        run: python scripts/candidate_pipeline/validate_pipeline.py
```

- `continue-on-error: true` 적용 (검증 실패 시에도 커밋 단계 도달)
- `validate_pipeline.py`의 `check_byelection()` 함수가 `data/candidates/byelection.json` 스키마 검증 수행

### Task 2: update-polls.yml — 인라인 JSON 파싱 검증 추가 (INDEP-02)

`Validate polls data` 스텝이 `Reparse empty results` 이후, `Check for changes` (id: diff) 이전에 정확히 위치함:

```yaml
      - name: Validate polls data
        continue-on-error: true
        run: |
          python3 -c "
          import json
          d = json.load(open('data/polls/polls.json'))
          cnt = len(d.get('polls', []))
          print('polls:', cnt, '건 - JSON 파싱 정상')
          "
```

- `continue-on-error: true` 적용
- 멀티라인 `run: |` 블록 사용 (f-string 콜론의 YAML 매핑 오류 회피)

## Verification Results

```
update-byelection.yml:
  grep "validate_pipeline": 1 (INDEP-02 충족)
  continue-on-error: true: 존재
  위치: factcheck 이후, diff 이전 (정확)
  YAML 파싱: 통과

update-polls.yml:
  grep "Validate polls": 1 (INDEP-02 충족)
  continue-on-error: true: 존재
  위치: Reparse 이후, diff 이전 (정확)
  YAML 파싱: 통과
```

## Commits

| Task | 수행자 | Commit | 설명 |
|------|--------|--------|------|
| Task 1 + 2 | Plan 13-01 executor | 8657c8f | feat(13-01): 13개 워크플로우 외부 의존 스텝에 continue-on-error 적용 (INDEP-01) |

Plan 02 전용 신규 커밋 없음 — 작업이 이미 완료된 상태로 확인.

## Deviations from Plan

### Pre-completed by Previous Executor

**Plan 13-01 executor가 Plan 13-02 범위를 선제 완료:**
- **발견 시점:** Plan 02 실행 시작 시 파일 상태 확인
- **상황:** 13-01 SUMMARY.md "Task 2" 항목에 "update-byelection.yml: 4개 스텝 (Step1/2/3 + validate_pipeline.py)" 및 "update-polls.yml: 3개 스텝 (NESDC pipeline / reparse / inline json 검증)"이 이미 기록됨
- **조치:** 재작업 없이 검증만 수행. 모든 success criteria 충족 확인.
- **파일 수정:** 없음

## Known Stubs

없음 — 이 Plan은 YAML 편집 전용이며 데이터 스텁이 없다.

## Self-Check: PASSED

- `.github/workflows/update-byelection.yml` validate_pipeline step 존재: FOUND (grep count: 1)
- `.github/workflows/update-polls.yml` Validate polls step 존재: FOUND (grep count: 1)
- 두 파일 모두 continue-on-error: true 적용: CONFIRMED
- 두 파일 YAML 파싱: PASSED
- 위치 (factcheck/reparse 이후, diff 이전): CONFIRMED
