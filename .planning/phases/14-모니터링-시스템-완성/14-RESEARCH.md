# Phase 14: 모니터링 시스템 완성 - Research

**Researched:** 2026-04-04
**Domain:** GitHub Actions workflow_run 트리거 + Python gh CLI 기반 실패 감지/복구 루프
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
없음 — 모든 구현 선택은 Claude 재량

### Claude's Discretion
- GitHub Issue 생성: `gh issue create` CLI 사용 (GH_TOKEN 권한 이미 issues: write로 확보)
- 연속 실패 임계값: 기존 코드의 패턴을 따름 (없으면 N=2 기본값)
- 실패 기록 저장: 기존 data/failures/ 또는 동급 경로 사용
- workflow_run 트리거 확장: 모든 update-*.yml 워크플로우 포함

### Deferred Ideas (OUT OF SCOPE)
- Slack/Discord 알림 연동 — 선거 정보 서비스에 불필요
- 대시보드 UI — Phase 14 범위 밖
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MON-01 | 15개 전체 워크플로우의 실패가 monitor_failures.py에 의해 감지·기록된다 | 현재 10개만 감시 중. 3개 워크플로우 누락 확인됨. monitor-failures.yml의 workflow_run 트리거 확장으로 해결 가능 |
| MON-02 | 연속 실패 시 GitHub Issue 자동 생성, 복구 시 자동 닫기가 모든 감시 대상 워크플로우에 적용된다 | monitor_failures.py에 Issue 생성·닫기 로직이 이미 완전 구현됨. 추가 코드 불필요, 트리거 확장만으로 전체 적용 |
</phase_requirements>

---

## Summary

현재 `monitor-failures.yml`은 14개 유효 워크플로우 중 10개만 workflow_run 트리거로 감시한다. 누락된 3개는 `공보물 데이터 수집 (선관위 API)`, `Update Local Council Members`, `Update Local Media Pool`이다. `monitor_failures.py` 자체는 Issue 생성·연속 실패 카운팅·복구 시 자동 닫기가 모두 완전하게 구현되어 있어 추가 Python 코드 작성이 불필요하다.

Phase 14의 핵심 작업은 두 파일 수정으로 완결된다: (1) `monitor-failures.yml`의 `on.workflow_run.workflows` 리스트에 누락된 3개 워크플로우명 추가, (2) REQUIREMENTS.md 상태 업데이트. monitor_failures.py 코드는 변경 없음.

**Primary recommendation:** monitor-failures.yml의 workflow_run 트리거 리스트에 3개 워크플로우명을 추가하는 단일 파일 수정으로 MON-01, MON-02 모두 충족 가능.

---

## Current State Analysis

### 워크플로우 전체 인벤토리 (14개 유효, monitor-failures.yml 자체 제외 = 감시 대상 13개)

| # | 파일명 | name (워크플로우명) | 현재 모니터링 |
|---|--------|---------------------|--------------|
| 1 | data-health-check.yml | Data Health Check | 포함 |
| 2 | fetch-disclosures.yml | 공보물 데이터 수집 (선관위 API) | **누락** |
| 3 | update-byelection.yml | Update By-Election Data | 포함 |
| 4 | update-candidates.yml | Update Candidate Data | 포함 |
| 5 | update-election-stats.yml | Update Election Stats | 포함 |
| 6 | update-gallup.yml | Update Gallup National Poll | 포함 |
| 7 | update-governor-status.yml | Update Governor Status | 포함 |
| 8 | update-local-council.yml | Update Local Council Members | **누락** |
| 9 | update-local-media.yml | Update Local Media Pool | **누락** |
| 10 | update-mayor-status.yml | Update Mayor Status | 포함 |
| 11 | update-overview.yml | Update Election Overview | 포함 |
| 12 | update-polls.yml | Poll Sync (NESDC) | 포함 |
| 13 | update-superintendent-status.yml | Update Superintendent Status | 포함 |

**현황 요약:** 13개 감시 대상 중 10개 포함, 3개 누락.

### monitor_failures.py 현재 구현 상태

| 기능 | 구현 여부 | 상세 |
|------|----------|------|
| 연속 실패 카운팅 | 완전 구현 | `data/.failure_counts.json`, ALERT_THRESHOLD=2 |
| GitHub Issue 자동 생성 | 완전 구현 | `create_issue()`, `automation-failure` 라벨 |
| 중복 Issue 방지 | 완전 구현 | `find_open_issue()` — 열린 Issue 있으면 댓글만 추가 |
| 복구 시 Issue 자동 닫기 | 완전 구현 | `close_issue()` → `handle_success()` |
| 오류 로그 추출 | 완전 구현 | `get_failed_step_log()` — `gh run view --log-failed` |
| cancelled/skipped 처리 | 구현 | main()에서 "카운트 변경 없음"으로 무시 |

**결론:** monitor_failures.py에 추가 코드 작성 불필요.

### monitor-failures.yml 현재 workflow_run 트리거 (10개)

```yaml
workflows:
  - "Update Candidate Data"
  - "Update Gallup National Poll"
  - "Poll Sync (NESDC)"
  - "Update Election Overview"
  - "Update Election Stats"
  - "Update Governor Status"
  - "Update Mayor Status"
  - "Update Superintendent Status"
  - "Update By-Election Data"
  - "Data Health Check"
```

**추가 필요한 3개:**
```yaml
  - "공보물 데이터 수집 (선관위 API)"
  - "Update Local Council Members"
  - "Update Local Media Pool"
```

> 주의: 워크플로우명은 각 yml 파일의 `name:` 필드와 정확히 일치해야 한다. 공백·괄호 포함 한국어 이름도 그대로 사용.

---

## Architecture Patterns

### workflow_run 트리거 동작 원리

workflow_run 트리거는 다른 워크플로우가 완료(`completed`)될 때 실행된다. `github.event.workflow_run.conclusion`으로 `success`, `failure`, `cancelled`, `skipped` 구분 가능. 트리거 리스트에 없는 워크플로우가 실패해도 monitor-failures.yml은 실행되지 않는다 — 이것이 현재 3개 워크플로우가 감시 사각지대에 있는 직접적 원인이다.

### 현재 실패 처리 흐름

```
워크플로우 완료 (completed)
    ↓
monitor-failures.yml 트리거
    ↓
monitor_failures.py 실행
    ├─ conclusion == "failure" → handle_failure()
    │       ├─ consecutive += 1
    │       ├─ consecutive >= 2 → gh issue create
    │       └─ 기존 Issue 있으면 gh issue comment
    ├─ conclusion == "success" → handle_success()
    │       ├─ consecutive > 0 → find_open_issue()
    │       └─ Issue 있으면 close_issue()
    └─ cancelled/skipped → 카운트 변경 없음
    ↓
data/.failure_counts.json 업데이트 (git commit)
```

### 핵심 확장 포인트

`monitor-failures.yml`의 `on.workflow_run.workflows` 리스트 — 이 리스트가 감시 대상 전체를 결정한다. Python 코드는 워크플로우명을 인자로 받아 범용적으로 동작하므로 리스트 확장만으로 전체 확장 완료.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Issue 중복 방지 | 직접 상태 추적 시스템 | 기존 `find_open_issue()` | 이미 구현됨 |
| 오류 로그 수집 | 직접 API 호출 | 기존 `get_failed_step_log()` | 이미 구현됨 |
| 라벨 관리 | 수동 라벨 생성 | 기존 `ensure_label_exists()` | 멱등 구현 완료 |

---

## Common Pitfalls

### Pitfall 1: 워크플로우명 대소문자/공백 불일치
**What goes wrong:** workflow_run 트리거의 워크플로우명이 `name:` 필드와 정확히 일치하지 않으면 트리거가 발화하지 않는다.
**Why it happens:** `공보물 데이터 수집 (선관위 API)`처럼 한국어·괄호 포함 이름은 오타 위험이 높다.
**How to avoid:** 각 yml 파일의 `name:` 필드를 grep으로 직접 복사해서 사용한다. `grep -n "^name:" .github/workflows/*.yml`
**Warning signs:** 해당 워크플로우가 실패해도 monitor-failures.yml이 실행되지 않음.

### Pitfall 2: monitor-failures.yml 자신을 트리거 목록에 포함
**What goes wrong:** `Monitor Automation Failures`를 workflow_run 목록에 넣으면 모니터가 자기 자신을 모니터링하는 무한 루프 위험.
**How to avoid:** `Monitor Automation Failures`는 트리거 목록에 절대 포함하지 않는다. (CONTEXT.md 명시 사항)

### Pitfall 3: data/.failure_counts.json git 충돌
**What goes wrong:** monitor-failures.yml이 여러 워크플로우 완료 직후 거의 동시에 실행될 때 `data/.failure_counts.json` 커밋이 충돌할 수 있다.
**Why it happens:** monitor-failures.yml 자체에 `concurrency: group: ${{ github.workflow }}, cancel-in-progress: false` 가 이미 설정되어 있어 직렬화됨 — 이미 해결된 상태.
**Warning signs:** `git pull --rebase` 실패 로그가 monitor job에서 발생.

### Pitfall 4: cancelled 결론 처리
**What goes wrong:** 사용자가 워크플로우를 수동 취소하면 `cancelled`가 전달됨. 현재 코드는 카운트를 변경하지 않으므로 이전 실패 카운트가 누적된 상태로 유지됨 — 의도적 설계로 올바른 동작.
**How to avoid:** 변경하지 않는다. cancelled는 실패 복구로 간주하지 않는 것이 올바르다.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | 수동 검증 (바닐라 JS 스택, 자동화 테스트 인프라 없음) |
| Config file | 없음 |
| Quick run command | `python3 -c "import json; json.load(open('data/.failure_counts.json'))"` |
| Full suite command | `python3 --check scripts/monitor_failures.py` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MON-01 | 13개 모든 워크플로우가 트리거 목록에 존재 | 수동 검증 | `grep -c "workflow" .github/workflows/monitor-failures.yml` | ✅ |
| MON-02 | Issue 생성/닫기 로직 동작 | 수동 검증 | `python3 -m py_compile scripts/monitor_failures.py` | ✅ |

### Wave 0 Gaps
없음 — 기존 인프라로 충분. REQUIREMENTS.md 상태 업데이트만 필요.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| gh CLI | monitor_failures.py Issue 생성 | ✓ (GitHub Actions runner) | 내장 | — |
| GH_TOKEN | issues: write | ✓ | github.token | — |
| Python 3.11 | monitor_failures.py | ✓ (actions/setup-python) | 3.11 | — |
| data/.failure_counts.json | 실패 카운트 저장 | ✓ (자동 생성) | — | 없으면 빈 dict로 초기화 |

**Missing dependencies with no fallback:** 없음.

---

## Implementation Plan (Planner 참조용)

Phase 14는 단일 Wave, 2개 Task로 완결된다:

**Task 1:** `.github/workflows/monitor-failures.yml` 수정
- `on.workflow_run.workflows` 리스트에 3개 추가:
  - `"공보물 데이터 수집 (선관위 API)"`
  - `"Update Local Council Members"`
  - `"Update Local Media Pool"`
- Python 스크립트 변경 없음

**Task 2:** REQUIREMENTS.md 상태 업데이트
- MON-01: `[ ]` → `[x]`
- MON-02: `[ ]` → `[x]`
- STATE.md Phase 14 완료 표시

---

## Open Questions

1. **Phase 13 완료 여부 확인**
   - What we know: STATE.md 기준 Phase 13은 "Not started" 상태
   - What's unclear: Phase 14 연구 시점에 Phase 13이 완료되었는지 확인 필요
   - Recommendation: Phase 13 완료 확인 후 Phase 14 실행. 단, Phase 14는 Phase 13과 독립적이므로 병행 가능.

2. **fetch-disclosures.yml 워크플로우명 한국어 확인**
   - What we know: `name: 공보물 데이터 수집 (선관위 API)` (grep으로 직접 확인)
   - What's unclear: GitHub Actions가 한국어 워크플로우명을 workflow_run 트리거에서 정확히 매칭하는지
   - Recommendation: 추가 확인 불필요. GitHub Actions는 `name:` 필드를 UTF-8 문자열로 처리하며 한국어 포함 모든 유니코드를 지원한다 (공식 문서 기준, HIGH confidence).

---

## Sources

### Primary (HIGH confidence)
- `scripts/monitor_failures.py` — 직접 읽음, 전체 구현 상태 확인
- `.github/workflows/monitor-failures.yml` — 직접 읽음, 현재 트리거 목록 확인
- `.planning/phases/12-전수-진단-긴급-방어-수정/12-AUDIT-REPORT.md` — 14개 워크플로우 인벤토리 검증
- `grep -n "^name:" .github/workflows/*.yml` — 전체 워크플로우명 직접 확인

### Secondary (MEDIUM confidence)
- GitHub Actions 공식 문서: workflow_run 트리거는 `name:` 필드와 정확 일치 매칭 (유니코드 지원)

---

## Metadata

**Confidence breakdown:**
- Current state (누락 워크플로우 목록): HIGH — 직접 파일 읽기로 확인
- Architecture (workflow_run 동작): HIGH — 기존 운영 중인 코드 분석
- Implementation scope: HIGH — 단일 파일 수정으로 완결, Python 코드 변경 없음

**Research date:** 2026-04-04
**Valid until:** 2026-05-01 (안정적 도메인, 30일)
