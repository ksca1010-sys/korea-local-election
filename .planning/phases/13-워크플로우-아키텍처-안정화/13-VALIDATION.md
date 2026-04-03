---
phase: 13
slug: 워크플로우-아키텍처-안정화
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-04-04
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | 없음 (YAML 편집 — grep + yaml parse) |
| **Config file** | 없음 |
| **Quick run command** | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/update-byelection.yml'))"` |
| **Full suite command** | `for f in .github/workflows/*.yml; do python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "OK: $f" || echo "FAIL: $f"; done` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick YAML parse on modified file
- **After every plan wave:** Run full YAML suite + grep checks below
- **Before `/gsd:verify-work`:** All grep checks must pass
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 13-01-T1 | 01 | 1 | GIT-01 | count | `grep -l "concurrency" .github/workflows/*.yml \| wc -l` (= 14) | ⬜ pending |
| 13-01-T1 | 01 | 1 | GIT-01 | grep | `grep -A2 "concurrency:" .github/workflows/update-byelection.yml` | ⬜ pending |
| 13-01-T2 | 01 | 1 | INDEP-01 | grep | `grep -c "continue-on-error" .github/workflows/update-byelection.yml` (≥1) | ⬜ pending |
| 13-01-T2 | 01 | 1 | INDEP-01 | yaml | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/update-byelection.yml'))"` | ⬜ pending |
| 13-02-T1 | 02 | 2 | INDEP-02 | grep | `grep -c "validate_pipeline" .github/workflows/update-byelection.yml` (≥1) | ⬜ pending |
| 13-02-T2 | 02 | 2 | INDEP-02 | grep | `grep -c "validate" .github/workflows/update-polls.yml` (≥1) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

없음 — 신규 파일 생성 없이 기존 YAML 파일 편집만 필요.

---

## Full Suite Check Commands

```bash
# GIT-01: 14개 전체에 concurrency 블록 존재
grep -l "concurrency:" .github/workflows/*.yml | wc -l  # 결과 = 14

# INDEP-01: 모든 비-monitor 워크플로우에 continue-on-error 적용
for f in .github/workflows/*.yml; do
  name=$(basename $f)
  if [[ "$name" != "monitor-failures.yml" ]]; then
    count=$(grep -c "continue-on-error" "$f" 2>/dev/null || echo "0")
    echo "$name: $count continue-on-error"
  fi
done

# INDEP-02: byelection에 validate_pipeline.py 스텝
grep -c "validate_pipeline" .github/workflows/update-byelection.yml

# INDEP-02: polls에 인라인 검증 스텝
grep -c "validate" .github/workflows/update-polls.yml

# YAML 파싱 전체
for f in .github/workflows/*.yml; do
  python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "OK: $f" || echo "FAIL: $f"
done
```
