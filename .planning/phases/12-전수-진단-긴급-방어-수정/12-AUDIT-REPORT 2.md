# Phase 12: GitHub Actions 워크플로우 전수 감사 리포트

**작성일:** 2026-04-04  
**기반 연구:** 12-RESEARCH.md (2026-04-04)  
**감사 대상:** 14개 워크플로우 (.github/workflows/*.yml, 중복 파일 제외)  
**Confidence:** HIGH (모든 워크플로우 직접 읽음, 핵심 Python 스크립트 직접 분석)

---

## 1. 워크플로우 인벤토리 (14개 유효 워크플로우)

| # | 파일명 | name | 트리거 방식 | 핵심 Python 스크립트 | permissions 블록 | 최소권한 준수 |
|---|--------|------|------------|---------------------|----------------|-------------|
| 1 | `data-health-check.yml` | Data Health Check | cron + workflow_dispatch | `data_health_check.py` | `contents: write`, `actions: write` | **검토 필요** — `actions: write`는 `gh run rerun` 호출에 필요. 실사용 확인 완료 (RESEARCH.md §PERM-01). 현재 유지 권고 |
| 2 | `fetch-disclosures.yml` | 공보물 데이터 수집 | cron + workflow_dispatch | `fetch_candidate_disclosures.py` | `contents: write` | 적절 |
| 3 | `monitor-failures.yml` | Monitor Automation Failures | workflow_run | `monitor_failures.py` | `contents: write`, `issues: write`, `actions: read` | 적절 — 3종 모두 기능에 필요 |
| 4 | `update-byelection.yml` | Update By-Election Data | cron + workflow_dispatch | `detect_byelections.py`, `fetch_byelection.py`, `factcheck_byelection.py` | `contents: write` | 적절 |
| 5 | `update-candidates.yml` | Update Candidate Data | cron + workflow_dispatch | `fetch_nec_candidates.py`, `validate_pipeline.py`, `factcheck_candidates.py`, `nec_precand_sync.py` | `contents: write` | 적절 |
| 6 | `update-election-stats.yml` | Update Election Stats | cron (매일 01:00 UTC) + workflow_dispatch | `fetch_election_stats.py` | `contents: write` | 적절 |
| 7 | `update-gallup.yml` | Update Gallup National Poll | cron (매주 금 09:00 UTC) + workflow_dispatch | `update_gallup.py` | `contents: write` (update job), `actions: write` (trigger-overview job) | 적절 — job-level 분리로 최소 권한 원칙 준수 |
| 8 | `update-governor-status.yml` | Update Governor Status | cron (매주 화 01:30 UTC) + workflow_dispatch | `fetch_governor_status.py` | `contents: write` | 적절 |
| 9 | `update-local-council.yml` | Update Local Council Members | cron (매주 금 01:30 UTC) + workflow_dispatch | `fetch_local_council_members.py` | `contents: write` | 적절 |
| 10 | `update-local-media.yml` | Update Local Media Pool | cron (매주 토 16:00 UTC) + workflow_dispatch | `discover_local_media.py` | `contents: write` | 적절 |
| 11 | `update-mayor-status.yml` | Update Mayor Status | cron (매주 수 02:00 UTC) + workflow_dispatch | `fetch_mayor_status.py` | `contents: write` | 적절 |
| 12 | `update-overview.yml` | Update Election Overview | cron (매일 22:00 UTC) + workflow_dispatch | `update_election_overview.py`, `update_mayor_overview.py`, `update_byelection_overview.py` | `contents: write` | 적절 |
| 13 | `update-polls.yml` | Poll Sync (NESDC) | cron (매일 00:00 UTC) + workflow_dispatch | `nesdc_poll_pipeline.py`, `reparse_pdfs.py` | `contents: write` | 적절 |
| 14 | `update-superintendent-status.yml` | Update Superintendent Status | cron (매주 목 01:30 UTC) + workflow_dispatch | `fetch_superintendent_status.py` | `contents: write` | 적절 |

> **참고:** `fetch-disclosures 2.yml`은 git-untracked 중복 복사본으로 Task 2에서 삭제됨. 유효 워크플로우는 14개.

---

## 2. 에러 핸들링 현황 매트릭스

| # | 워크플로우 | 핵심 스크립트 | continue-on-error | .get() 패턴 적용 | 빈 name 저장 방어 | 비고 |
|---|-----------|-------------|------------------|-----------------|-----------------|------|
| 1 | data-health-check.yml | data_health_check.py | 없음 | 부분 | **미구현** — `c["name"]` 직접 접근 (line 177, 224) | 실패 시 전체 중단 |
| 2 | fetch-disclosures.yml | fetch_candidate_disclosures.py | 없음 | 부분 | **미구현** — `item_to_disclosure()` 반환값에 name="" 가능 | 실패 시 전체 중단 |
| 3 | monitor-failures.yml | monitor_failures.py | 없음 | 미확인 | 미확인 | 실패 시 전체 중단 |
| 4 | update-byelection.yml | detect_byelections.py, fetch_byelection.py, factcheck_byelection.py | 없음 | 대부분 구현 | 구현 완료 (`if not name: continue`) | 실패 시 전체 중단 |
| 5 | update-candidates.yml | fetch_nec_candidates.py, nec_precand_sync.py | validate_pipeline.py에만 `continue-on-error: true` | 부분 — nec_precand_sync.py:93 직접 접근 | 부분 — factcheck_candidates.py 구현, nec_precand_sync.py 미구현 | validate 실패해도 커밋 진행됨 (Pitfall 3) |
| 6 | update-election-stats.yml | fetch_election_stats.py | 없음 | 미확인 | 미확인 | 실패 시 전체 중단 |
| 7 | update-gallup.yml | update_gallup.py | 없음 | 미확인 | 해당 없음 (수치 데이터) | 실패 시 전체 중단 |
| 8 | update-governor-status.yml | fetch_governor_status.py | 없음 | 미확인 | 미확인 | 실패 시 전체 중단 |
| 9 | update-local-council.yml | fetch_local_council_members.py | 없음 | 대부분 구현 | 부분 | 실패 시 전체 중단 |
| 10 | update-local-media.yml | discover_local_media.py | 없음 | 미확인 | 해당 없음 | 실패 시 전체 중단 |
| 11 | update-mayor-status.yml | fetch_mayor_status.py | 없음 | 미확인 | 미확인 | 실패 시 전체 중단 |
| 12 | update-overview.yml | update_election_overview.py 등 4개 스텝 각각 독립 | 없음 | 미확인 | 해당 없음 (집계 데이터) | 4개 스텝이 각각 독립 실행 |
| 13 | update-polls.yml | nesdc_poll_pipeline.py, reparse_pdfs.py | 없음 | 미확인 | 해당 없음 (여론조사 수치) | 실패 시 전체 중단 |
| 14 | update-superintendent-status.yml | fetch_superintendent_status.py | 없음 | 미확인 | 미확인 | 실패 시 전체 중단 |

---

## 3. 미처리 실패 패턴 목록 (Phase 13-14 참조용)

### 패턴 A: 직접 딕셔너리 접근 (KeyError 위험)

위험도 **HIGH** — NEC API 응답 구조 변동 시 크래시 유발

| 파일 | 위치 | 위험 코드 | 위험도 |
|------|------|---------|--------|
| `scripts/candidate_pipeline/nec_precand_sync.py` | line 93 | `body = data["response"]["body"]` | **HIGH** |
| `scripts/data_health_check.py` | line 177, 224 | `name = c["name"]` | MEDIUM |
| `scripts/candidate_pipeline/fetch_nec_candidates.py` | line ~257, 325, 433, 434 | `{c["name"]: c for c in ...}` dict comprehension | MEDIUM |

**발생 조건:**
- NEC API가 오류 응답(`{"error": "service unavailable"}`) 반환 시
- `resultCode`는 통과했지만 `body` 키가 없는 비표준 응답 시
- `name` 키 없는 레코드가 리스트에 포함된 경우

**권고 패턴 (CRASH-01):**
```python
# TO-BE — nec_precand_sync.py:93
body = data.get("response", {}).get("body")
if body is None:
    print(f"  [WARN] NEC API body 키 없음 (typecode={sg_typecode}) — 응답: {list(data.keys())}")
    break
```

---

### 패턴 B: 빈 name 저장 위험

위험도 **MEDIUM** — 빈 name 레코드가 JSON에 저장되어 UI 렌더링 오류 또는 dict 키 오염 유발

| 파일 | 위치 | 문제 | 위험도 |
|------|------|------|--------|
| `scripts/fetch_candidate_disclosures.py` | `item_to_disclosure()` 호출 후 결과 저장 | name="" 레코드 그대로 `result[rkey]`에 저장 | MEDIUM |
| `scripts/candidate_pipeline/fetch_nec_candidates.py` | `_convert_nec_item()` → `merge_governor_candidates()` | `{c["name"]: c}` 에서 빈 키 `{"": c}` 생성 | MEDIUM |
| `scripts/data_health_check.py` | line 177, 224 | name 키 없는 레코드 직접 접근 | MEDIUM |

**방어가 이미 구현된 위치 (참고):**
- `factcheck_byelection.py:78`: `if not c.get("name"): continue` — 올바른 패턴
- `factcheck_candidates.py:110`: `if not c.get("name"): print(경고); continue` — 올바른 패턴
- `fetch_byelection.py:300-301`: `name = nc.get("name", "").strip(); if not name: continue` — 올바른 패턴

**권고 패턴 (CRASH-02):**
```python
# TO-BE — fetch_candidate_disclosures.py
raw_records = [item_to_disclosure(it) for it in items]
valid_records = [r for r in raw_records if r.get("name", "").strip()]
result[rkey] = valid_records
```

---

### 패턴 C: continue-on-error 미적용 워크플로우 목록

위험도 **LOW-MEDIUM** — 일시적 API 장애나 데이터 없음 상황에서 전체 워크플로우 실패 처리

`continue-on-error: true`가 전혀 없는 워크플로우 (14개 중 13개):
- `fetch-disclosures.yml` — 공보물 수집
- `monitor-failures.yml` — 장애 모니터링
- `update-byelection.yml` — 재보궐 업데이트
- `update-election-stats.yml` — 선거 통계
- `update-gallup.yml` — 갤럽 여론조사
- `update-governor-status.yml` — 광역단체장 상태
- `update-local-council.yml` — 지방의원
- `update-local-media.yml` — 지역 언론
- `update-mayor-status.yml` — 기초단체장 상태
- `update-overview.yml` — 개요 업데이트
- `update-polls.yml` — 여론조사 동기화
- `update-superintendent-status.yml` — 교육감 상태
- `data-health-check.yml` — 헬스체크

> 참고: `update-candidates.yml`은 `validate_pipeline.py` 스텝에만 `continue-on-error: true` 적용됨. 그러나 이는 검증 실패해도 커밋이 진행되는 Pitfall 3을 유발 (아래 패턴 D 참조).

**Phase 13 권고:** 네트워크 일시 오류 등 비치명적 실패를 유발하는 핵심 스텝에 `continue-on-error: true` 선별 적용. 단, 데이터 정합성에 영향을 주는 스텝은 실패 시 중단이 올바른 동작임 — 무분별한 적용 금지.

---

### 패턴 D: 동시 git push 경쟁 상태 위험

위험도 **LOW** — 현재 스케줄이 겹치지 않도록 설계되어 있으나, workflow_dispatch 수동 실행 시 경쟁 가능

경쟁 가능 조합 (cron 스케줄 기준):
- `update-overview.yml` (매일 22:00 UTC) + `update-polls.yml` (매일 00:00 UTC) — 시간 분리됨, 낮은 위험
- 수동 `workflow_dispatch` 동시 실행 시 다수 워크플로우가 `data/` 폴더에 동시 push 시도 가능

**Phase 13 권고:** GitHub Actions의 `concurrency` 그룹 설정으로 동일 워크플로우 중복 실행 방지 가능. 다수 워크플로우 동시 실행은 현재 스케줄 설계로 회피 중이나 명시적 보호 미구현.

---

## 4. 권장 조치 우선순위

### Phase 12 (이 Phase, Plan 02-03에서 처리)

| 항목 | 우선순위 | 조치 | 대상 파일 |
|------|---------|------|----------|
| CRASH-01 | **P0** | `nec_precand_sync.py:93` `data["response"]["body"]` → `.get("body")` + None 체크 | `scripts/candidate_pipeline/nec_precand_sync.py` |
| CRASH-02 | **P0** | `fetch_candidate_disclosures.py` item_to_disclosure 후 빈 name 필터 추가 | `scripts/fetch_candidate_disclosures.py` |
| CRASH-02 | **P1** | `fetch_nec_candidates.py` dict comprehension 전 빈 name 필터 | `scripts/candidate_pipeline/fetch_nec_candidates.py` |
| PERM-01 | **P2** | `data-health-check.yml` `actions: write` 주석에 사용 근거 명시 | `.github/workflows/data-health-check.yml` |
| 중복파일 | **완료** | `fetch-disclosures 2.yml` 삭제 | `.github/workflows/fetch-disclosures 2.yml` |

### Phase 13으로 이관

| 항목 | 이유 | 대상 |
|------|------|------|
| continue-on-error 선별 적용 | 13개 워크플로우 전체 검토 필요 — 일괄 처리 적합 | 모든 워크플로우 |
| git push 경쟁 상태 concurrency 그룹 | 낮은 위험, 설계 검토 후 적용 | 전체 워크플로우 |
| validate_pipeline.py 검증 실패 시 커밋 차단 | Pitfall 3 — 아키텍처 변경 수반 가능 | `update-candidates.yml` |

### Phase 14으로 이관

| 항목 | 이유 | 대상 |
|------|------|------|
| monitor_failures.py 커버리지 확대 | 현재 특정 워크플로우만 모니터링 — 14개 전체 커버 권고 | `scripts/monitor_failures.py` |
| sync_overview_candidates.py / cross_validate.py name 검증 확인 | 미확인 상태 — 추가 조사 필요 | `scripts/` 내 해당 파일들 |
| update-local-media.yml discover_local_media.py 방어 코드 현황 | 미확인 상태 | `scripts/discover_local_media.py` |

---

## 5. fetch-disclosures 2.yml 처리 기록

**확인 결과:** `diff fetch-disclosures.yml "fetch-disclosures 2.yml"` → **IDENTICAL** (완전 동일)

**삭제 이유:**
- git-untracked 상태의 완전 동일 복사본
- 실수로 `git add`되면 동명 워크플로우(`공보물 데이터 수집`) 2개가 동시 실행되는 사고 유발 (RESEARCH.md Pitfall 4)
- 원본 `fetch-disclosures.yml`이 정상 운영 중이므로 중복 파일 불필요

**삭제 완료:** Task 2에서 `rm ".github/workflows/fetch-disclosures 2.yml"` 실행

---

## 요약

| 항목 | 현황 | 위험도 |
|------|------|--------|
| permissions 블록 존재 여부 | 14개 전체 존재 | 없음 |
| KeyError 직접 접근 (패턴 A) | 3개 스크립트에 존재 | HIGH/MEDIUM |
| 빈 name 저장 위험 (패턴 B) | 3개 스크립트에 미구현 | MEDIUM |
| continue-on-error 부재 (패턴 C) | 13개 워크플로우 | LOW-MEDIUM |
| git push 경쟁 상태 (패턴 D) | 명시적 보호 미구현 | LOW |
| 중복 파일 (fetch-disclosures 2.yml) | **삭제 완료** | 해소 |

**Phase 12 Plan 02-03에서 즉시 처리할 핵심 항목: CRASH-01 + CRASH-02**
