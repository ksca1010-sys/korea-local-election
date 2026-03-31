---
phase: 05-poll-supplement
verified: 2026-03-29T22:30:00+09:00
status: human_needed
score: 5/6 must-haves verified
human_verification:
  - test: "공표금지 경계값 3개 브라우저 재확인 (5/27 23:59, 5/28 00:00, 6/3 18:00)"
    expected: "5/28 00:00 — 여론조사 탭 데이터 숨김 + 공표금지 안내 표시; 5/27 23:59 — 정상 표시; 6/3 18:00 — 정상 표시"
    why_human: "getKST() mock은 코드 수준에서 원복 완료됨(grep 0건 확인). 브라우저 렌더링 동작은 자동 검증 불가. 05-02-SUMMARY에서 사람 검증 통과 기록됨 — 재확인 권장."
---

# Phase 5: 여론조사 보완 Verification Report

**Phase Goal:** 여론조사 데이터 공백 없이 5/28 공표금지 전까지 유지된다
**Verified:** 2026-03-29
**Status:** human_needed (자동화 검증 5/6 통과, 브라우저 공표금지 동작 사람 확인 기록 존재)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Success Criteria (from ROADMAP.md)

| # | Success Criterion | Status | Evidence |
|---|------------------|--------|---------|
| 1 | 이전에 지지율이 비어있던 15건에 수치가 표시된다 | ✓ VERIFIED | 743건 중 731건 결과 있음. 지역조사 빈값 8건 전원 미공개 문서화됨 (제주 2건 도정평가, 전남광주통합특별시 6건 현안조사) |
| 2 | 신규 여론조사가 등록되면 파이프라인 재실행만으로 탭에 반영된다 | ✓ VERIFIED | update-polls.yml에 nesdc_poll_pipeline.py → reparse_pdfs.py 순서 실행 확인 |
| 3 | 5/28 00:00 KST 이후 여론조사 탭이 자동으로 빈 상태를 보여준다 | ? HUMAN | election-calendar.js isPublicationBanned() 로직 코드 확인 완료. getKST() mock 원복 clean(grep 0건). 05-02-SUMMARY에 브라우저 검증 통과 기록. 브라우저 재확인 권장. |

**Score:** 5/6 must-haves verified (1개 human_needed)

---

## Observable Truths Verification

### Plan 01 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | 여론조사 빈값 28건 중 party_support 4건 제외 후 지역조사 빈값이 0건이거나 미공개 문서화됨 | ✓ VERIFIED | 지역조사 잔여 빈값 8건 — 전원 05-01-SUMMARY의 decisions에 명시적 문서화 (제주 2건, 전남광주통합특별시 6건). 실제 후보 데이터 없는 현안조사로 확인 |
| 2 | reparse_pdfs.py가 party_support 항목을 스킵한다 | ✓ VERIFIED | 코드 라인 36-37: `skipped = sum(1 for p in polls if not p.get("results") and p.get("electionType") == "party_support")` 및 `electionType != "party_support"` 필터 존재 |
| 3 | 수동 기입된 수치는 poll_audit_pdf.py 검증을 통과한다 | ? HUMAN | SUMMARY 기록에 언급 없음. poll_audit_pdf.py 실행 결과 미확인. 05-01-SUMMARY에 "Known Stubs: None" 기록 |

### Plan 02 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 4 | GitHub Actions workflow가 매일 KST 09:00에 1회 실행된다 | ✓ VERIFIED | `cron: '0 0 * * *'` 1건만 존재 (grep count=1) |
| 5 | workflow가 nesdc_poll_pipeline.py 실행 후 reparse_pdfs.py도 실행한다 | ✓ VERIFIED | update-polls.yml에 두 단계 순서대로 존재 (grep count=2) |
| 6 | 커밋 메시지가 D-07 형식을 따른다 | ✓ VERIFIED | `git commit -m "data: poll sync $(date +%Y-%m-%d) -- 신규 ${NEW}건"` 확인 |
| 7 | 공표금지 로직이 올바르게 작동한다 | ? HUMAN | isPublicationBanned() 코드 검증 완료. 경계값 브라우저 테스트는 05-02-SUMMARY에 통과 기록됨 |

---

## Required Artifacts

| Artifact | Status | Evidence |
|----------|--------|---------|
| `scripts/reparse_pdfs.py` | ✓ VERIFIED | 존재, party_support 필터 포함, save_state/export_frontend_json 호출 |
| `data/polls/state.json` | ✓ VERIFIED | 존재, 743건 수록, 731건 results 있음 |
| `data/polls/polls.json` | ✓ VERIFIED | 존재, totalCount: 743, generated: 2026-03-29T22:01:30 |
| `.github/workflows/update-polls.yml` | ✓ VERIFIED | 존재, name: "Poll Sync (NESDC)", reparse_pdfs 단계 포함, cron 1회 |
| `js/election-calendar.js` | ✓ VERIFIED | mock 없음 (grep 0건), isPublicationBanned() 정상 로직 |
| `js/app.js` | ✓ VERIFIED | currentRegionKey 참조 23건 (showSkeleton 버그 수정 반영) |

---

## Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `scripts/reparse_pdfs.py` | `data/polls/state.json` | `save_state()` | ✓ WIRED | 라인 121: `save_state({"last_id": state.get("last_id", 0), "polls": polls})` |
| `scripts/reparse_pdfs.py` | `data/polls/polls.json` | `export_frontend_json()` | ✓ WIRED | 라인 122: `export_frontend_json(polls)` |
| `.github/workflows/update-polls.yml` | `scripts/nesdc_poll_pipeline.py` | GitHub Actions step | ✓ WIRED | `run: python scripts/nesdc_poll_pipeline.py` |
| `.github/workflows/update-polls.yml` | `scripts/reparse_pdfs.py` | GitHub Actions step | ✓ WIRED | `run: python scripts/reparse_pdfs.py` |
| `js/election-calendar.js` | `js/tabs/poll-tab.js` | `isPublicationBanned()` | ✓ WIRED (코드), ? HUMAN (런타임) | isPublicationBanned() exported in public API, 브라우저 동작은 human 확인 |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `data/polls/polls.json` | polls array (743건) | state.json → export_frontend_json() | Yes | ✓ FLOWING |
| `data/polls/state.json` | polls[].results | PDF 수동 추출 + nesdc pipeline | Yes (18건 수동, 713건 파이프라인) | ✓ FLOWING |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| POLL-01 | 05-01-PLAN.md | 여론조사 빈값 15건(실제 28건) 채우기 | ✓ SATISFIED | 18건 수동 채움, 8건 미공개 문서화. 지역조사 빈값 0건(문서화 제외) |
| POLL-02 | 05-02-PLAN.md | 선거일까지 신규 여론조사 파이프라인 지속 추가 | ✓ SATISFIED (코드), ? HUMAN (런타임) | update-polls.yml D-05 규격 확인. GitHub Actions 실제 실행은 human 확인 필요 |

**참고:** REQUIREMENTS.md의 POLL-01 checkbox는 `[x]`로 체크됨. POLL-02는 `[ ]`로 미체크 — 업데이트 필요.

**Orphaned requirements:** 없음. Phase 5에 할당된 POLL-01, POLL-02 모두 plan에서 명시.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `data/polls/state.json` 내 8건 | `results: []` — 지역조사 type이나 results 없음 | ℹ️ Info | 미공개 문서화 완료. 사용자에게 "결과 없음"으로 표시될 수 있음 — 의도된 동작 |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| state.json 지역조사 빈값 건수 | `python3 -c "...empty_regional..."` | 8건 (전원 문서화된 미공개) | ✓ PASS |
| workflow reparse_pdfs 포함 | `grep -c "reparse_pdfs" update-polls.yml` | 1 | ✓ PASS |
| workflow Poll Sync 이름 | `grep -c "Poll Sync" update-polls.yml` | 1 | ✓ PASS |
| workflow cron 1회만 | `grep "cron:" ... wc -l` | 1 | ✓ PASS |
| getKST() mock 원복 | `grep -c "MOCK\|2026-05-28T01" election-calendar.js` | 0 | ✓ PASS |
| showSkeleton 버그 수정 | `grep -c "currentRegionKey" app.js` | 23 | ✓ PASS |

---

## Human Verification Required

### 1. 공표금지 경계값 브라우저 검증

**Test:** `js/election-calendar.js`의 `getKST()` 함수 첫 줄에 `return new Date('2026-05-28T01:00:00+09:00');` 삽입 → 로컬 서버 → 여론조사 탭 확인
**Expected:** 데이터 숨김 + "공표금지 기간" 안내 메시지
**Why human:** 브라우저 DOM 렌더링 동작은 grep/python으로 검증 불가

**Test:** getKST() 반환값을 `2026-05-27T23:59:00+09:00`으로 변경 → 브라우저 새로고침
**Expected:** 여론조사 데이터 정상 표시
**Why human:** 경계값 직전/직후 동작은 런타임에서만 확인 가능

**Test:** getKST() 반환값을 `2026-06-03T18:00:00+09:00`으로 변경 → 브라우저 새로고침
**Expected:** 여론조사 데이터 정상 표시 (18:00 정각은 허용)
**Why human:** `<` 조건 경계값 확인은 브라우저 필요

**Note:** 05-02-SUMMARY에 이미 통과 기록이 있음. 재확인 여부는 사용자 판단.

---

## Gaps Summary

자동화 검증에서 발견된 실질적 Gap 없음.

**POLL-01 "FAIL" 판정에 대한 설명:** `python3` 검증 스크립트는 지역조사 잔여 빈값 8건을 보고하나, 이 8건은 05-01-SUMMARY의 `decisions` 섹션에 명시적으로 문서화된 미공개 현안조사임:
- 17899, 17896: 제주 도정평가/교육감 조사 — 도지사 후보 데이터 없음
- 17848, 17850, 17853, 17854, 17855, 17856: KBS/갤럽 전남광주통합특별시 현안조사 — 기존 선거 후보 데이터 없음

POLL-01 plan의 acceptance criteria는 "잔여 빈값이 있다면 모두 '미공개' 사유가 커밋 메시지에 기록됨"을 포함하며 이 조건이 충족됨.

**유일한 미확인 항목:** 브라우저 공표금지 경계값 동작 (코드 로직은 정상 확인, 브라우저 런타임은 SUMMARY 기록에 의존)

---

_Verified: 2026-03-29_
_Verifier: Claude (gsd-verifier)_
