---
phase: 4
slug: election-night
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-29
---

# Phase 4 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | 없음 (Wave 0에서 설치) |
| **Config file** | none -- Wave 0 installs |
| **Quick run command** | `node -e "[getCurrentPhase 경계값 인라인 테스트]"` |
| **Full suite command** | `node workers/election-night/test-parser.js` (Wave 0 생성) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node -e "[getCurrentPhase 경계값 인라인]"`
- **After every plan wave:** Run `node workers/election-night/test-parser.js`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Nyquist Compliance

All code-producing tasks have `<automated>` verify commands:

| Task | Automated Command | Type |
|------|-------------------|------|
| 04-01-T1 | `node -e "[inline assertions]"` | unit (inline) |
| 04-01-T2 | `node workers/election-night/test-parser.js` | unit |
| 04-01-T3 | `curl .../health` (post-deploy) | smoke |
| 04-02-T1a | `node -e "[inline assertions]"` | unit (inline) |
| 04-02-T1b | `node -e "[inline assertions]"` | unit (inline) |
| 04-02-T2 | `echo "checkpoint:human-verify"` | manual (checkpoint) |

Manual-only task (04-02-T2) is a `checkpoint:human-verify` -- not a code-producing task but a visual verification gate. All 5 code-producing tasks have automated verification. No 3 consecutive tasks lack automated verify. Nyquist compliant.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 04-01 | 1 | FEAT-06 | unit | `node -e "[inline assertions on election-calendar.js + worker files]"` | inline | pending |
| 04-01-T2 | 04-01 | 1 | FEAT-06 | unit | `node workers/election-night/test-parser.js` | Wave 0 (created by T2 itself) | pending |
| 04-01-T3 | 04-01 | 1 | FEAT-06 | smoke | `curl -s -o /dev/null -w "%{http_code}" https://<WORKER_URL>/health` | post-deploy | pending |
| 04-02-T1a | 04-02 | 2 | FEAT-06 | unit | `node -e "[inline assertions on app.js + index.html]"` | inline | pending |
| 04-02-T1b | 04-02 | 2 | FEAT-06 | unit | `node -e "[inline assertions on map.js]"` | inline | pending |
| 04-02-T2 | 04-02 | 2 | FEAT-06 | manual | checkpoint:human-verify (browser visual) | manual-only | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `workers/election-night/test-parser.js` -- 2022 아카이브 fixture -> 스키마/타입/범위 단위 테스트
- [ ] `workers/election-night/index.js` 기본 골격 -- scheduled() + fetch() handler stub
- [ ] NEC 2022 아카이브 Chrome DevTools 캡처 -- AJAX URL + 응답 포맷 확정

*Wave 0: 파서 테스트 파일 + Worker 골격이 없으면 Wave 1 작업이 검증 불가*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 지도 색상 변화 (정당색x개표율 채도) | FEAT-06 | DOM + D3 렌더링 결과 | 브라우저에서 `election_night` 페이즈 강제 진입 후 지도 색상 확인 |
| Worker 장애 시 수동 폴백 UI | FEAT-06 | Worker 응답 차단 필요 | DevTools Network에서 Worker URL 차단 후 "수동 업데이트 모드" 메시지 확인 |
| 수동 JSON 입력 경로 작동 | FEAT-06 | 파일 업로드 UX | 수동 JSON textarea 입력 후 "적용" 클릭, 지도 반영 확인 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (all code-producing tasks have automated verify; manual task is checkpoint:human-verify gate)
