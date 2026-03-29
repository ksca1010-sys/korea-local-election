---
phase: 4
slug: election-night
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | 없음 (Wave 0에서 설치) |
| **Config file** | none — Wave 0 installs |
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

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 04-01 | 0 | FEAT-06 | unit | `node -e "require('./js/election-calendar.js')"` | ❌ Wave 0 | ⬜ pending |
| 04-01-T2 | 04-01 | 1 | FEAT-06 | unit | `node workers/election-night/test-parser.js` | ❌ Wave 0 | ⬜ pending |
| 04-01-T3 | 04-01 | 1 | FEAT-06 | smoke | `npx wrangler dev` 로컬 실행 후 `curl http://localhost:8787/results` | ❌ Wave 0 | ⬜ pending |
| 04-02-T1 | 04-02 | 2 | FEAT-06 | unit | `node -e "getCurrentPhase() === 'election_night'"` 경계값 | ❌ Wave 0 | ⬜ pending |
| 04-02-T2 | 04-02 | 2 | FEAT-06 | manual | 브라우저에서 지도 색상 변화 확인 | manual-only | ⬜ pending |
| 04-02-T3 | 04-02 | 2 | FEAT-06 | manual | Worker 503 시 "수동 업데이트 모드" 메시지 확인 | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `workers/election-night/test-parser.js` — 2022 아카이브 HTML/JSON → 파싱 결과 단위 테스트
- [ ] `workers/election-night/index.js` 기본 골격 — scheduled() + fetch() handler stub
- [ ] NEC 2022 아카이브 Chrome DevTools 캡처 — AJAX URL + 응답 포맷 확정

*Wave 0: 파서 테스트 파일 + Worker 골격이 없으면 Wave 1 작업이 검증 불가*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 지도 색상 변화 (정당색×개표율 채도) | FEAT-06 | DOM + D3 렌더링 결과 | 브라우저에서 `election_night` 페이즈 강제 진입 후 지도 색상 확인 |
| Worker 장애 시 수동 폴백 UI | FEAT-06 | Worker 응답 차단 필요 | DevTools Network에서 Worker URL 차단 후 "수동 업데이트 모드" 메시지 확인 |
| 수동 JSON 입력 경로 작동 | FEAT-06 | 파일 업로드 UX | 수동 JSON 파일 업로드 후 지도 반영 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
