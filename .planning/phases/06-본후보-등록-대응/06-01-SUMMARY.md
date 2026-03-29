---
phase: 06-본후보-등록-대응
plan: "01"
subsystem: candidate-pipeline
tags: [nec-api, candidates, automation, github-actions]
dependency_graph:
  requires: []
  provides: [nec-official-fetch-pipeline, unmatched-candidates-store]
  affects: [governor.json, superintendent.json, mayor_candidates.json, update-candidates.yml]
tech_stack:
  added: []
  patterns: [nec_precand_sync-reuse, date-gating, dry-run-flag, log-raw-flag]
key_files:
  created:
    - data/candidates/unmatched_candidates.json
  modified:
    - scripts/candidate_pipeline/fetch_nec_candidates.py
    - .github/workflows/update-candidates.yml
decisions:
  - "nec_precand_sync.fetch_precandidates() 재사용 — 새 HTTP 클라이언트 금지 (Don't Hand-Roll)"
  - "날짜 게이팅을 Python 스크립트 내 처리 — GitHub Actions if: 조건 타임존 문제 방지"
  - "ballotNumber 4개 필드 시도 순서: giho → gihoSn → candidateNo → huboNo (huboCnt 사용 금지)"
  - "validate() 메타항목(_merged) 방어 처리 — jeonnam의 gwangju 참조 항목 name 키 없음 대응"
metrics:
  duration_seconds: 207
  completed_date: "2026-03-30"
  tasks_completed: 2
  files_changed: 3
---

# Phase 06 Plan 01: NEC 본후보 API 파이프라인 구현 Summary

**한 줄 요약:** nec_precand_sync 재사용 패턴으로 PofelcddInfoInqireService(sgTypecode 3/10/4) 본후보 수집 파이프라인 구현, 날짜 게이팅(5/14)+dry-run+log-raw 플래그 포함

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | fetch_nec_preliminary() → fetch_nec_official() 교체 | 0a9ccf7 | fetch_nec_candidates.py, unmatched_candidates.json |
| 2 | update-candidates.yml에 NEC 본후보 수집 단계 삽입 | 283e579 | update-candidates.yml |

## What Was Built

### Task 1: fetch_nec_candidates.py 전면 재작성

**fetch_nec_official(log_raw=False)**
- `nec_precand_sync.fetch_precandidates()` 재사용으로 sgTypecode "3"(광역단체장), "10"(교육감), "4"(기초단체장) 순차 호출
- 날짜 게이팅: `datetime.now() < datetime(2026, 5, 14)` 이면 경고 출력 후 빈 dict 반환
- `--log-raw` 플래그: 각 typecode별 첫 아이템을 `nec_raw_sample.json`에 저장

**_convert_nec_item(item, election_type, unmatched_list)**
- `SIDO_MAP` 재사용 (강원특별자치도/강원도 변형명 처리 포함)
- `_normalize_party()` 재사용
- ballotNumber: giho → gihoSn → candidateNo → huboNo 순서 시도, 없으면 None + WARN 로깅
- SIDO_MAP 미등록 sdName → unmatched_list에 즉시 추가
- status: "NOMINATED" 고정, dataSource: "nec_official"

**3종 병합 함수**
- `merge_governor_candidates()`: 광역단체장용
- `merge_superintendent_candidates()`: 교육감용 — stance 필드 NEC가 없으면 기존 값 보존
- `merge_mayor_candidates()`: 기초단체장용 — 2단계 중첩 구조(candidates["seoul"]["종로구"]) + wiwName 매핑 실패 시 unmatched_list 추가

**unmatched_candidates.json 초기 파일**: `{"_meta": {...}, "candidates": []}` 구조

**validate() 방어 처리**: jeonnam에 `_merged` 메타 항목(name 키 없음)이 있어 `name in c` 필터 추가

**`--dry-run` 플래그**: API 호출 + 변환 + validate() 실행, 파일 저장 건너뜀

### Task 2: update-candidates.yml 단계 삽입

0-c(재보궐 당선 동기화) 이후, 1단계(광역단체장 팩트체크) 이전에 삽입:

```yaml
- name: Fetch NEC official candidates
  env:
    NECDC_CODE / NDCDC_LOCAL / NDCDC_PAPER / NDCDC_PERSON
    PYTHONPATH: scripts:scripts/candidate_pipeline
  run: |
    KEY=...; export NEC_API_KEY="$KEY"
    python scripts/candidate_pipeline/fetch_nec_candidates.py --log-raw
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] validate() KeyError: 'name' 방어 처리**
- **Found during:** Task 1 검증 실행
- **Issue:** governor.json의 jeonnam 배열에 `{"_merged": "gwangju", "_note": "..."}` 메타 항목이 있어 `c['name']` KeyError 발생
- **Fix:** validate() 내 `real_candidates = [c for c in candidates if isinstance(c, dict) and "name" in c]` 필터 추가
- **Files modified:** scripts/candidate_pipeline/fetch_nec_candidates.py
- **Commit:** 0a9ccf7 (동일 커밋에 포함)

## Verification Results

```
[DRY-RUN] 파일 저장을 건너뜁니다
[GATE] 본후보 등록 개시일(2026-05-14) 이전입니다.
[VALIDATE] Total: 123 candidates across 17 regions
[VALIDATE] No issues found ✓
unmatched_candidates.json: valid JSON OK
nec_precand_sync import: OK
update-candidates.yml: Fetch NEC official candidates 단계 존재 확인
```

## Known Stubs

없음. 5/14 이전 실행 시 날짜 게이팅으로 빈 dict를 반환하며, 이는 의도된 동작 (본후보 등록 개시일 이전).

## Self-Check: PASSED

- `scripts/candidate_pipeline/fetch_nec_candidates.py` — FOUND
- `data/candidates/unmatched_candidates.json` — FOUND
- `.github/workflows/update-candidates.yml` — FOUND (Fetch NEC official candidates 단계 포함)
- commit 0a9ccf7 — FOUND
- commit 283e579 — FOUND
