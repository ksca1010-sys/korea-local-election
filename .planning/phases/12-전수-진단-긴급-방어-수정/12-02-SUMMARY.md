---
phase: 12-전수-진단-긴급-방어-수정
plan: "02"
subsystem: python-pipeline
tags: [defensive-coding, crash-prevention, pipeline-safety]
dependency_graph:
  requires: []
  provides: [CRASH-01, CRASH-02]
  affects: [nec_precand_sync, fetch_candidate_disclosures, fetch_nec_candidates, data_health_check]
tech_stack:
  added: []
  patterns: [defensive-get, empty-name-filter, dict-comprehension-guard]
key_files:
  created: []
  modified:
    - scripts/candidate_pipeline/nec_precand_sync.py
    - scripts/data_health_check.py
    - scripts/fetch_candidate_disclosures.py
    - scripts/candidate_pipeline/fetch_nec_candidates.py
decisions:
  - "body None 시 loop break 선택 — 페이지 반복이 의미없어지므로 continue 대신 break가 올바름"
  - "dict comprehension에 isinstance 체크 병행 — 리스트 내 비정상 타입(string 등)도 방어"
  - "fetch_nec_candidates.py에서 _convert_nec_item() 수정 대신 comprehension 단 필터 선택 — 최소 침습적 수정"
metrics:
  duration: "10m"
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_changed: 4
---

# Phase 12 Plan 02: Python 파이프라인 방어 코드 적용 Summary

NEC API 응답 body 키 누락 시 KeyError 크래시 방지 + 빈 name 레코드가 data/ JSON에 저장되지 않도록 4개 Python 스크립트에 .get() 방어 패턴 적용

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | nec_precand_sync.py KeyError 방어 + data_health_check.py name 안전 접근 | 057966c | nec_precand_sync.py, data_health_check.py |
| 2 | fetch_candidate_disclosures.py + fetch_nec_candidates.py 빈 name 방어 | f51b39f | fetch_candidate_disclosures.py, fetch_nec_candidates.py |

## What Was Built

### CRASH-01: NEC API body KeyError 방어 (nec_precand_sync.py)

- `data["response"]["body"]` 직접 접근 → `.get("response", {}).get("body")` 체인으로 교체
- body가 None인 경우 WARN 로그 + DEBUG 키 목록 출력 후 break
- 기존 header 체크 로직(`.get()` 사용)은 그대로 유지

### CRASH-01 보조: data_health_check.py name 안전 접근

- 재보궐 중복 체크 루프의 `c["name"]` → `.get("name", "")` + 빈 name 스킵
- 정당 일관성 체크의 `c["name"]` 2곳 → `.get("name", "")` 방어 처리
- 빈 name 발견 시 WARN 로그로 진단 가능

### CRASH-02: 빈 name 레코드 필터링 (fetch_candidate_disclosures.py)

- `result[rkey] = [item_to_disclosure(it) for it in items]` 패턴을
  `raw_records → valid_records` 필터링 패턴으로 교체
- 빈 name 레코드 발견 시 WARN 로그 출력

### CRASH-02: dict comprehension 빈 name 방어 (fetch_nec_candidates.py)

- `{c["name"]: c for c in ...}` 패턴 6곳 전부에 `isinstance(c, dict) and c.get("name", "").strip()` 필터 추가
- 광역단체장(lines 257-263), 기초단체장(lines 325-331), 재보궐(lines 433-435) 함수 모두 적용

## Verification Results

```
=== 검증 1: nec_precand_sync.py 직접 접근 제거 ===
0건 (data["response"]["body"] 직접 접근 없음)

=== 검증 2: fetch_nec_candidates.py name 필터 동반 확인 ===
6개 comprehension 모두 if isinstance(c, dict) and c.get("name", "").strip() 동반

=== 검증 3: fetch_candidate_disclosures.py 빈 name 필터 존재 ===
1건 이상 확인

=== 구문 검증 ===
nec_precand_sync.py: OK
data_health_check.py: OK
fetch_candidate_disclosures.py: OK
fetch_nec_candidates.py: OK
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] data_health_check.py 추가 name 직접 접근 발견**
- **Found during:** Task 1
- **Issue:** 계획에 명시된 line 177, 224 외에도 광역 정당 맵 구성(line 219)과 재보궐 정당 불일치 체크(line 227)에도 `c["name"]` 직접 접근이 있었음
- **Fix:** 4곳 모두 `.get("name", "")` + 빈 name 스킵으로 처리
- **Files modified:** scripts/data_health_check.py
- **Commit:** 057966c

## Known Stubs

없음 — 이 플랜은 데이터 처리 파이프라인 방어 코드이며 UI 렌더링 관련 스텁 없음

## Self-Check: PASSED

- [x] scripts/candidate_pipeline/nec_precand_sync.py — 수정됨, 구문 OK
- [x] scripts/data_health_check.py — 수정됨, 구문 OK
- [x] scripts/fetch_candidate_disclosures.py — 수정됨, 구문 OK
- [x] scripts/candidate_pipeline/fetch_nec_candidates.py — 수정됨, 구문 OK
- [x] Task 1 commit: 057966c
- [x] Task 2 commit: f51b39f
