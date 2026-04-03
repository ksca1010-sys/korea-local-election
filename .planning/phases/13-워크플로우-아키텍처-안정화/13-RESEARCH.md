# Phase 13: 워크플로우 아키텍처 안정화 - Research

**Researched:** 2026-04-04
**Domain:** GitHub Actions YAML — continue-on-error, concurrency, validate_pipeline 연결
**Confidence:** HIGH (모든 14개 워크플로우 YAML + validate_pipeline.py 직접 읽음)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
없음 — 순수 인프라 Phase, 모든 구현 선택은 Claude의 재량

### Claude's Discretion
모든 구현 방식 — continue-on-error 적용 범위, concurrency 그룹 이름, validate 연결 방식

핵심 참조:
- 12-AUDIT-REPORT.md: 패턴 C (continue-on-error 미적용 13개 워크플로우 목록), 패턴 D (git push 경쟁 상태 위험 워크플로우)
- 기존 update-candidates.yml의 validate step에만 continue-on-error: true가 적용된 패턴 참조
- concurrency 그룹: `group: ${{ github.workflow }}`, `cancel-in-progress: false`
- validate_pipeline.py 호출 방식: 기존 update-candidates.yml 패턴 그대로 재사용

### Deferred Ideas (OUT OF SCOPE)
- continue-on-error 일괄 적용 후 모니터링 — Phase 14에서 처리
- 실패 알림 시스템 고도화 — Phase 14 MON-01/MON-02
- Python 스크립트 추가 방어 코드 (Phase 12에서 미처리된 나머지 파일들) — Phase 14 이관
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INDEP-01 | 각 워크플로우의 개별 단계가 독립적으로 실행되어 앞 단계 실패 시에도 커밋 단계까지 도달한다 | update-byelection.yml 3단계 구조 직접 확인 — Step1/2/3 모두 continue-on-error 미적용 상태 |
| INDEP-02 | 스키마 검증(validate_pipeline.py 또는 동급 검증)이 후보 외 주요 파이프라인(여론조사, 재보궐 등)에도 연결된다 | validate_pipeline.py는 data/candidates/ 전용 스키마 검증 — 여론조사/재보궐 직접 검증 불가, 별도 연결 방식 결정 필요 |
| GIT-01 | 여러 워크플로우가 동시 실행될 때 git push 충돌(race condition)이 발생하지 않는다 | 14개 워크플로우 전체 concurrency 블록 없음 — 직접 확인 완료 |
</phase_requirements>

---

## Summary

Phase 13은 14개 GitHub Actions 워크플로우에 세 가지 아키텍처 패턴을 추가하는 순수 YAML 편집 작업이다. 신규 Python 스크립트 작성은 최소화되고 기존 패턴의 복사·적용이 주된 작업이다.

**INDEP-01(continue-on-error):** update-candidates.yml에서 이미 factcheck 계열 스텝에 `continue-on-error: true`가 적용된 패턴이 존재한다. 그러나 update-byelection.yml의 3개 스텝(detect/fetch/factcheck), update-polls.yml의 2개 스텝(NESDC pipeline/reparse)은 모두 continue-on-error 미적용 상태다. 적용 원칙은 "API 호출 또는 외부 의존 스텝에만 적용, 데이터 정합성에 치명적인 스텝은 실패 시 중단이 올바름"이다.

**INDEP-02(validate 연결):** validate_pipeline.py는 `data/candidates/` 전용 스키마 검증 도구다. 여론조사 파이프라인(data/polls/)에는 직접 적용 불가하다. 여론조사 검증은 간단한 인라인 파이썬 명령이나 별도 경량 스크립트로 대응하거나, validate_pipeline.py를 update-byelection.yml에만 연결(재보궐 후보 데이터는 data/candidates/byelection.json으로 동일 디렉토리)하는 절충안이 현실적이다.

**GIT-01(concurrency):** 현재 14개 워크플로우 중 concurrency 블록을 가진 워크플로우는 0개다. `concurrency: { group: "${{ github.workflow }}", cancel-in-progress: false }` 패턴을 전체에 일괄 적용한다. 이 설정은 동일 워크플로우의 중복 실행만 직렬화하며, 서로 다른 워크플로우 간 경쟁은 `git pull --rebase origin main && git push` 패턴(이미 모든 워크플로우에 적용됨)이 처리한다.

**Primary recommendation:** concurrency 일괄 적용(GIT-01) → update-byelection.yml continue-on-error + validate 연결(INDEP-01+02) → update-polls.yml continue-on-error 적용(INDEP-01) 순서로 3개 Plan으로 분리.

---

## Standard Stack

### Core
| 항목 | 현재 값 | 비고 |
|------|---------|------|
| GitHub Actions Runner | ubuntu-latest | 모든 14개 워크플로우 동일 |
| Python | 3.11 | 모든 워크플로우 동일 |
| concurrency 구문 | 미적용 (0개) | Phase 13에서 전체 추가 |
| continue-on-error | step 레벨 | update-candidates.yml의 factcheck 계열 9개 스텝에 적용 중 |

### 기존 참조 패턴 (update-candidates.yml 기준)

```yaml
# GIT-01 패턴 — 워크플로우 최상단 (on: 블록 바로 다음)
concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: false

# INDEP-01 패턴 — 외부 의존 스텝에 개별 적용
- name: Step N - 설명
  continue-on-error: true
  run: python scripts/xxx.py

# INDEP-02 패턴 — validate step (continue-on-error와 함께)
- name: Validate pipeline data
  continue-on-error: true
  run: python scripts/candidate_pipeline/validate_pipeline.py
```

---

## Architecture Patterns

### 패턴 1: concurrency 블록 위치

GitHub Actions에서 `concurrency`는 워크플로우 파일의 최상단 — `on:` 블록과 `jobs:` 블록 사이 — 에 위치한다. job 레벨에도 설정 가능하나, 워크플로우 레벨이 전체 워크플로우를 직렬화하므로 이 Phase의 목적(동일 워크플로우 중복 실행 방지)에 더 적합하다.

```yaml
name: Update By-Election Data

on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:

concurrency:             # ← 여기 추가
  group: ${{ github.workflow }}
  cancel-in-progress: false

jobs:
  update:
    ...
```

**cancel-in-progress: false 이유:** 이미 실행 중인 수집 작업을 취소하면 부분 데이터 저장 위험 있음. 대기 후 순차 실행이 안전.

### 패턴 2: continue-on-error 적용 원칙

**적용해야 할 스텝:** 외부 API 호출, Claude API 호출, 웹 스크래핑 — 일시적 실패 가능, 실패해도 기존 데이터 유지가 올바른 동작.

**적용하면 안 되는 스텝:**
- `Check for changes` (diff 스텝) — 결과가 후속 Commit 스텝의 조건이므로 실패하면 안 됨
- `Commit and push` — 실패 시 알아야 함
- `Install dependencies` — pip 실패는 치명적
- `actions/checkout@v4` / `actions/setup-python@v5` — 환경 설정 실패는 치명적

**update-byelection.yml 적용 대상:**
| 스텝 | 현재 | 변경 후 |
|------|------|---------|
| Step 1 - Detect new districts | 없음 | `continue-on-error: true` |
| Step 2 - Fetch & update candidates | 없음 | `continue-on-error: true` |
| Step 3 - Factcheck candidates | 없음 | `continue-on-error: true` |
| Check for changes | 없음 | 변경 없음 (diff 스텝) |
| Commit and push | 없음 | 변경 없음 |

**update-polls.yml 적용 대상:**
| 스텝 | 현재 | 변경 후 |
|------|------|---------|
| Run NESDC pipeline | 없음 | `continue-on-error: true` |
| Reparse empty results | 없음 | `continue-on-error: true` |
| Check for changes | 없음 | 변경 없음 |
| Commit and push | 없음 | 변경 없음 |

**나머지 12개 워크플로우(단일 스크립트 실행 패턴):**
각 워크플로우는 "단일 Python 스크립트 실행 → diff 체크 → commit/push" 구조다. 단일 스크립트 스텝에 `continue-on-error: true`를 적용하면 스크립트 전체 실패 시에도 commit 스텝까지 도달하나, 변경사항이 없으므로 커밋은 일어나지 않는다. 이 동작은 INDEP-01 요구사항(커밋·푸시 단계까지 도달)을 충족한다.

### 패턴 3: validate_pipeline.py 연결 방식 (INDEP-02)

**핵심 발견:** validate_pipeline.py는 `data/candidates/` 디렉토리만 검증한다. 구체적으로:
- `governor.json`, `superintendent.json`, `mayor_candidates.json`, `byelection.json` — 후보자 데이터
- `governor_status.json`, `superintendent_status.json`, `mayor_status.json` — 상태 데이터 최신성

여론조사 데이터(`data/polls/polls.json`)는 검증 대상이 아니다.

**INDEP-02 구현 방안:**

옵션 A (권장): update-byelection.yml에 validate_pipeline.py 연결
- 재보궐 후보 데이터는 `data/candidates/byelection.json`에 저장됨 — validate_pipeline.py의 `check_byelection()` 함수가 이미 이를 검증함
- byelection.yml의 Step 3(factcheck) 이후, diff 체크 이전에 validate step 추가
- update-polls.yml에는 validate_pipeline.py 연결 불가(polls 데이터 미검증) — 인라인 json 파싱 검증으로 대체

옵션 B: update-polls.yml에 인라인 검증 추가
```yaml
- name: Validate polls data
  continue-on-error: true
  run: python -c "import json; d=json.load(open('data/polls/polls.json')); print(f'polls: {len(d.get(\"polls\", []))}건')"
```

**권장 조합:** update-byelection.yml → validate_pipeline.py 연결 (옵션 A) + update-polls.yml → 인라인 json 파싱 검증 (옵션 B)

### 패턴 4: update-candidates.yml의 현재 문제 (Pitfall 3)

12-AUDIT-REPORT.md가 지적한 "Pitfall 3": validate_pipeline.py 스텝에 `continue-on-error: true`가 적용되어 있어 검증 실패 시에도 커밋이 진행된다. 이는 Phase 13 INDEP-02의 취지(검증 연결)와 일치하나, 검증 실패 = 데이터 오류 → 커밋 차단이 더 안전한 패턴이다.

그러나 CONTEXT.md의 `## Deferred` 참조: Phase 13 범위는 "validate 연결"이지 "validate 실패 시 커밋 차단"이 아니다. 기존 candidates.yml의 `continue-on-error: true` + validate 패턴을 그대로 재사용하는 것이 범위 내 구현이다.

### Anti-Patterns to Avoid

- **모든 스텝에 continue-on-error: true 무분별 적용:** `Check for changes` diff 스텝에 적용하면 diff 실패 시 `changed=true` 출력이 안 돼 커밋 스텝이 실행되지 않는 문제 발생
- **concurrency cancel-in-progress: true:** 실행 중인 수집 취소 → 부분 데이터 저장 위험
- **job 레벨 continue-on-error:** job 전체를 실패해도 성공으로 처리하면 monitor-failures.yml이 실패를 감지 못함 — step 레벨만 사용
- **여론조사 파이프라인에 validate_pipeline.py 직접 호출:** 경로 하드코딩(`data/candidates/`) 문제 발생

---

## Don't Hand-Roll

| 문제 | 만들면 안 됨 | 사용할 것 | 이유 |
|------|------------|----------|------|
| git push 충돌 방지 | 커스텀 락 파일 메커니즘 | GitHub Actions `concurrency` 블록 | 플랫폼 네이티브, 단 한 줄 추가 |
| 여론조사 JSON 파싱 검증 | 별도 validate_polls.py 작성 | 인라인 `python -c "import json; ..."` | 스키마가 단순해 스크립트 불필요 |
| 재보궐 검증 | 별도 스크립트 | 기존 validate_pipeline.py (이미 byelection.json 검증함) | check_byelection() 함수 존재 |

---

## 14개 워크플로우 현황 상세

### continue-on-error 현황

| # | 파일 | 핵심 스텝 수 | continue-on-error | 변경 필요 | 비고 |
|---|------|------------|-------------------|----------|------|
| 1 | update-candidates.yml | 11개 | 9개 적용 (validate + factcheck계열) | 없음 | **이미 완성된 참조 패턴** |
| 2 | update-byelection.yml | 3개 | 0개 | Step1, Step2, Step3 + validate 추가 | INDEP-01+02 우선 대상 |
| 3 | update-polls.yml | 2개 | 0개 | Run NESDC, Reparse + 인라인 validate | INDEP-01+02 대상 |
| 4 | update-overview.yml | 4개 | 0개 | 4개 모두 | 4개 스텝이 독립적 — 적합 |
| 5 | update-gallup.yml | 1개 | 0개 | 1개 | Claude API 없음, 웹스크래핑 |
| 6 | update-election-stats.yml | 1개 | 0개 | 1개 | NEC API 의존 |
| 7 | update-governor-status.yml | 1개 | 0개 | 1개 | Claude + NEC API |
| 8 | update-local-council.yml | 1개 | 0개 | 1개 | Claude + NEC API |
| 9 | update-local-media.yml | 1개 | 0개 | 1개 | 웹스크래핑 |
| 10 | update-mayor-status.yml | 1개 | 0개 | 1개 | Claude + NEC API |
| 11 | update-superintendent-status.yml | 1개 | 0개 | 1개 | Claude + NEC API |
| 12 | data-health-check.yml | 1개 | 0개 | 1개 | gh API 의존 |
| 13 | fetch-disclosures.yml | 1개 | 0개 | 1개 | NEC API |
| 14 | monitor-failures.yml | 1개 | 0개 | **적용 금지** | 실패 감지 자체가 core 동작 |

> monitor-failures.yml: 이 워크플로우의 핵심 스텝(Run failure monitor)이 실패하면 모니터링 자체가 깨진다. continue-on-error 적용 제외.

### concurrency 현황

현재 14개 워크플로우 전부 concurrency 블록 없음 (grep 검색 결과 = 0건).

모든 14개에 동일 패턴 적용:
```yaml
concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: false
```

### cron 스케줄 및 충돌 가능성

| 워크플로우 | cron (UTC) | 충돌 가능 대상 |
|-----------|-----------|--------------|
| update-candidates.yml | 매일 00:00 | update-polls.yml (동일 시간) |
| update-polls.yml | 매일 00:00 | update-candidates.yml (동일 시간) |
| update-byelection.yml | 매일 02:00 | update-mayor-status.yml (수요일 02:00) |
| update-election-stats.yml | 매일 01:00 | 없음 |
| update-overview.yml | 매일 22:00 | 없음 |
| data-health-check.yml | 매일 03:00 | 없음 |

**핵심 충돌:** update-candidates.yml과 update-polls.yml이 동일 cron(00:00)으로 실행된다. 서로 다른 data/ 경로를 건드리나(`data/candidates/` vs `data/polls/`), 동시 git pull --rebase + git push 충돌 가능. `concurrency` 블록은 동일 워크플로우 내 직렬화만 하므로, 이 두 워크플로우 간 충돌은 현재의 `git pull --rebase origin main && git push` 패턴이 1차 방어한다.

---

## Common Pitfalls

### Pitfall 1: update-overview.yml — workflow_call 트리거
**What goes wrong:** update-overview.yml은 `on: workflow_call`을 포함한다. update-gallup.yml의 trigger-overview job이 `gh workflow run update-overview.yml`로 연쇄 호출한다. concurrency 그룹을 `${{ github.workflow }}`로 설정하면 gallup에 의한 연쇄 호출과 cron 실행이 직렬화된다 — 이는 원하는 동작이므로 문제없음.

**Prevention:** concurrency 설정 그대로 적용. cancel-in-progress: false이므로 cron 실행이 대기 후 진행.

### Pitfall 2: monitor-failures.yml — continue-on-error 금지
**What goes wrong:** monitor-failures.yml의 "Run failure monitor" 스텝에 continue-on-error: true를 적용하면 monitor_failures.py 자체가 실패해도 "성공"으로 처리됨 → 실패 기록 누락.
**Prevention:** monitor-failures.yml은 continue-on-error 적용 제외.

### Pitfall 3: diff 스텝에 continue-on-error 적용 금지
**What goes wrong:** diff 스텝(`id: diff`)에 continue-on-error를 적용하면 git diff 명령 실패 시 `changed=true`가 GITHUB_OUTPUT에 기록되지 않아 commit 스텝이 실행되지 않음.
**Prevention:** diff 스텝과 commit/push 스텝에는 절대 continue-on-error: true 적용 금지.

### Pitfall 4: validate_pipeline.py를 update-polls.yml에 직접 호출
**What goes wrong:** validate_pipeline.py의 `DATA = BASE / "data" / "candidates"`로 하드코딩되어 있어 polls 데이터 검증 불가. 호출하면 polls 관련 검증 없이 종료코드 0 반환 (candidates 데이터가 정상이면).
**Prevention:** update-polls.yml에는 인라인 json 파싱 검증 사용.

### Pitfall 5: validate 스텝에서 continue-on-error 빠뜨림
**What goes wrong:** validate_pipeline.py는 오류 발견 시 `sys.exit(1)` 반환. continue-on-error 없이 연결하면 candidates 데이터 문제 발생 시 커밋 단계에 도달 못함 — INDEP-01 요구사항 위반.
**Prevention:** validate step에는 반드시 `continue-on-error: true` 함께 적용.

---

## Code Examples

### 예시 1: update-byelection.yml 변경 후 전체 구조

```yaml
name: Update By-Election Data

on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: pip install anthropic httpx

      - name: Step 1 - Detect new districts (NEC API)
        continue-on-error: true
        env:
          NEC_API_KEY: ${{ secrets.NEC_API_KEY }}
        run: python scripts/candidate_pipeline/detect_byelections.py --apply

      - name: Step 2 - Fetch & update candidates (news + NEC)
        continue-on-error: true
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          NEC_API_KEY: ${{ secrets.NEC_API_KEY }}
        run: python scripts/candidate_pipeline/fetch_byelection.py

      - name: Step 3 - Factcheck candidates
        continue-on-error: true
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          NEC_API_KEY: ${{ secrets.NEC_API_KEY }}
        run: python scripts/candidate_pipeline/factcheck_byelection.py

      - name: Validate pipeline data
        continue-on-error: true
        run: python scripts/candidate_pipeline/validate_pipeline.py

      - name: Check for changes
        id: diff
        run: |
          git diff --quiet data/candidates/byelection.json || echo "changed=true" >> $GITHUB_OUTPUT

      - name: Commit and push
        if: steps.diff.outputs.changed == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/candidates/byelection.json
          git commit -m "chore: auto-update byelection data $(date +%Y-%m-%d)"
          git pull --rebase origin main && git push
```

### 예시 2: update-polls.yml 변경 후 구조

```yaml
name: Poll Sync (NESDC)

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
      - name: Install dependencies
        run: pip install httpx beautifulsoup4 pdfplumber

      - name: Run NESDC pipeline
        continue-on-error: true
        run: python scripts/nesdc_poll_pipeline.py

      - name: Reparse empty results
        continue-on-error: true
        run: python scripts/reparse_pdfs.py

      - name: Validate polls data
        continue-on-error: true
        run: python -c "import json; d=json.load(open('data/polls/polls.json')); print(f'polls: {len(d.get(\"polls\", []))}건 — JSON 파싱 정상')"

      - name: Check for changes
        id: diff
        run: git diff --quiet data/polls/ || echo "changed=true" >> $GITHUB_OUTPUT

      - name: Commit and push
        if: steps.diff.outputs.changed == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/polls/
          NEW=$(git diff --cached data/polls/polls.json | grep '^\+' | grep '"nttId"' | wc -l | tr -d ' ')
          git commit -m "data: poll sync $(date +%Y-%m-%d) -- 신규 ${NEW}건"
          git pull --rebase origin main && git push
```

### 예시 3: 단일 스크립트 워크플로우 패턴 (update-governor-status.yml 등)

```yaml
concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: false

# ... 기존 구조에서 핵심 스크립트 스텝에만 추가:

      - name: Run governor status factcheck
        continue-on-error: true    # ← 이 한 줄 추가
        env:
          ...
        run: |
          KEY=...
          python scripts/candidate_pipeline/fetch_governor_status.py
```

---

## State of the Art

| 현재 상태 | Phase 13 이후 | 영향 |
|----------|--------------|------|
| concurrency 블록 없음 (14개 전체) | 14개 전체에 추가 | 동일 워크플로우 중복 실행 직렬화 |
| continue-on-error: update-candidates.yml만 9개 스텝 적용 | 13개 워크플로우 핵심 스텝에 추가 (monitor 제외) | 일시적 API 장애 시 커밋 단계까지 도달 |
| validate_pipeline.py: update-candidates.yml에만 연결 | update-byelection.yml에도 연결 | 재보궐 후보 스키마 조기 감지 |
| update-polls.yml 검증 없음 | 인라인 json 파싱 검증 추가 | polls.json 파싱 오류 조기 감지 |

---

## Open Questions

1. **update-polls.yml 여론조사 검증 깊이**
   - 현재 파악: polls.json은 단순 인라인 파싱으로 충분한 수준 (schema가 고정적)
   - 불명확: nesdc_poll_pipeline.py가 실패해도 reparse_pdfs.py가 기존 polls.json을 읽으므로 두 스텝 모두 실패해야 데이터 손실 — 이 경우 검증 스텝도 의미없음
   - 권고: 인라인 파싱 검증으로 충분, 별도 스크립트 불필요

2. **update-candidates.yml의 초기 3개 스텝(detect byelection news, detect byelection districts, sync winners)에 continue-on-error 부재**
   - 현재 파악: 감사 리포트(패턴 C)에서 update-candidates.yml은 "validate_pipeline.py에만 적용"으로 기록됨
   - 불명확: 실제 YAML 확인 결과 candidates.yml에는 0.5단계(fetch NEC official candidates) 스텝에 continue-on-error가 없음 — 5/14 이전에는 empty response를 반환하므로 실패 가능성 존재
   - 권고: Phase 13 범위에서 candidates.yml의 0~0.5단계 스텝에도 continue-on-error 추가 검토 가능하나 Phase 12에서 이미 처리된 파일이므로 별도 task로 분리

---

## Environment Availability

Step 2.6: SKIPPED (순수 YAML 편집 작업 — 외부 도구 의존성 없음)

---

## Validation Architecture

> .planning/config.json 없음 — nyquist_validation 기본값 enabled

### Test Framework

Phase 13은 YAML 편집이므로 자동화 테스트 프레임워크가 없다. 검증은 다음 방식으로 수행:

| Property | Value |
|----------|-------|
| Framework | 없음 (YAML linting 수준) |
| Config file | 없음 |
| Quick run command | `python -c "import yaml; yaml.safe_load(open('.github/workflows/update-byelection.yml'))"` |
| Full suite command | 모든 YAML 파싱 확인 스크립트 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | 파일 존재 |
|--------|----------|-----------|-------------------|---------|
| INDEP-01 | 각 스텝에 continue-on-error: true 존재 | grep | `grep -c "continue-on-error" .github/workflows/update-byelection.yml` | ✅ |
| INDEP-01 | YAML 구문 유효 | yaml parse | `python -c "import yaml; yaml.safe_load(open('.github/workflows/update-byelection.yml'))"` | ✅ |
| INDEP-02 | validate_pipeline.py 스텝 존재 (byelection) | grep | `grep -c "validate_pipeline" .github/workflows/update-byelection.yml` | ✅ |
| INDEP-02 | validate 스텝 존재 (polls) | grep | `grep -c "validate" .github/workflows/update-polls.yml` | ✅ |
| GIT-01 | concurrency 블록 존재 | grep | `grep -c "concurrency" .github/workflows/update-byelection.yml` | ✅ |
| GIT-01 | 전체 14개 워크플로우 concurrency | count | `grep -l "concurrency" .github/workflows/*.yml \| wc -l` (결과 = 14) | ✅ |

### Wave 0 Gaps

없음 — 기존 파일 편집만 필요, 신규 파일 생성 없음.

---

## Sources

### Primary (HIGH confidence)
- `.github/workflows/update-candidates.yml` — 직접 읽음 (continue-on-error 패턴 확인)
- `.github/workflows/update-byelection.yml` — 직접 읽음 (변경 대상 현황 확인)
- `.github/workflows/update-polls.yml` — 직접 읽음 (변경 대상 현황 확인)
- `.github/workflows/update-overview.yml` — 직접 읽음 (workflow_call 트리거 확인)
- `.github/workflows/update-gallup.yml` — 직접 읽음 (trigger-overview 연쇄 호출 패턴 확인)
- `.github/workflows/monitor-failures.yml` — 직접 읽음 (continue-on-error 적용 금지 근거)
- `.github/workflows/data-health-check.yml` — 직접 읽음
- `.github/workflows/fetch-disclosures.yml` — 직접 읽음
- `.github/workflows/update-election-stats.yml` — 직접 읽음
- `.github/workflows/update-governor-status.yml` — 직접 읽음
- `.github/workflows/update-local-council.yml` — 직접 읽음
- `.github/workflows/update-mayor-status.yml` — 직접 읽음
- `scripts/candidate_pipeline/validate_pipeline.py` — 직접 읽음 (DATA 경로 = data/candidates/ 확인)
- `.planning/phases/12-전수-진단-긴급-방어-수정/12-AUDIT-REPORT.md` — 직접 읽음 (패턴 C, D 인용)

### Secondary (MEDIUM confidence)
- `grep -r "continue-on-error" .github/workflows/` 실행 결과 — update-candidates.yml만 적용 확인 (직접 실행)
- `grep -r "concurrency" .github/workflows/` 실행 결과 — 0개 확인 (직접 실행)

---

## Metadata

**Confidence breakdown:**
- INDEP-01 (continue-on-error): HIGH — 모든 YAML 직접 읽어 현황 확인
- INDEP-02 (validate 연결): HIGH — validate_pipeline.py 전체 읽어 data/candidates 전용임을 확인, 여론조사는 인라인 검증으로 대응
- GIT-01 (concurrency): HIGH — grep 결과 0개 확인, GitHub Actions concurrency 구문은 안정적 표준
- 구현 코드 예시: HIGH — 기존 update-candidates.yml 패턴 직접 인용

**Research date:** 2026-04-04
**Valid until:** 2026-05-15 (GitHub Actions 구문 안정적, 워크플로우 구조 변경 없으면 유효)
