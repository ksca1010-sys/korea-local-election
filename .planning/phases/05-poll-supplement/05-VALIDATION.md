---
phase: 5
slug: poll-supplement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 자동화 테스트 인프라 없음 (Out of Scope). Python CLI 검증 + 브라우저 수동 확인으로 대체.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | 없음 — 바닐라 JS 수동 검증 (REQUIREMENTS.md Out of Scope) |
| **Config file** | none |
| **Quick run command** | `python3 scripts/check_polls.py` (Wave 0 생성) |
| **Full suite command** | `python3 scripts/check_polls.py && python3 scripts/run_quality_gate.js 2>/dev/null \|\| true` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick poll state check
- **After every plan wave:** Run full verification
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| reparse | 01 | 1 | POLL-01 | CLI | `python3 -c "import json; s=json.load(open('data/polls/state.json')); e=[p for p in s['polls'] if not p.get('results') and p.get('electionType')!='party_support']; print('POLL-01:', 'PASS' if not e else f'FAIL {len(e)}건')"` | ⬜ pending |
| github-actions | 02 | 2 | POLL-02 | manual | workflow_dispatch 실행 → Actions 탭 성공 확인 | ⬜ pending |
| pub-ban-test | 02 | 2 | 공표금지 | manual | getKST() mock → 로컬 서버 여론조사 탭 확인 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- 없음 — 기존 `scripts/check_polls.py`가 있거나 Wave 1에서 확인 스크립트 생성

*Existing infrastructure covers all automated checks for this phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub Actions cron 동작 | POLL-02 | CI 환경 — 로컬 실행 불가 | workflow_dispatch 수동 트리거 → Actions 탭 성공 로그 확인 |
| 공표금지 탭 자동 숨김 | 성공 기준 3 | 날짜 의존 — 5/28 전 검증 필요 | `getKST()` 임시 수정 → 로컬 `http://localhost:8000` 여론조사 탭 확인 → 원복 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
