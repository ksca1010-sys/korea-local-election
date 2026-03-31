---
phase: 06-본후보-등록-대응
verified: 2026-03-30T07:35:00+09:00
status: passed
score: 4/4 must-haves verified
gaps: []
human_verification:
  - test: "ballot_number 모드 NOMINATED 전용 필터 + 기호순 정렬"
    expected: "5/15 18:00 이후 후보 탭에 NOMINATED 후보만 기호순으로 표시됨"
    why_human: "getCandidateSortMode()가 현재 시각 기준으로 'status_priority'를 반환하므로 ballot_number 분기는 5/15 18:00 이전 자동 검증 불가. 브라우저 Console에서 ElectionCalendar.getCandidateSortMode 오버라이드 후 확인 필요."
  - test: "NEC 본후보 API 실제 수집 (5/14 이후)"
    expected: "fetch_nec_candidates.py --log-raw 실행 시 sgTypecode 3/10/4 응답을 수집하고 governor.json에 NOMINATED 후보가 반영됨"
    why_human: "날짜 게이팅(5/14 이전 API 미호출)으로 현재 자동 검증 불가. 5/14 00:00 이후 수동 실행 필요."
---

# Phase 6: 본후보 등록 대응 검증 보고서

**Phase Goal:** 5/15 18:00 이후 공식 후보 목록과 기호순 정렬이 정확하게 작동한다
**Verified:** 2026-03-30T07:35:00+09:00
**Status:** passed
**Re-verification:** No — 초기 검증

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                              | Status     | Evidence                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | 후보 탭에서 예비후보(DECLARED/EXPECTED)가 사라지고 공식 후보(NOMINATED)만 표시된다                 | ✓ VERIFIED | candidate-tab.js L284: `model.candidates.filter(c => c.status === 'NOMINATED')` — ballot_number 모드에서 적용          |
| 2   | 5/15 18:00 이후 후보 탭의 정렬 기준이 기호순으로 전환된다                                           | ✓ VERIFIED | election-calendar.js L130: `DATES.CANDIDATE_REG_END` (`2026-05-15T18:00:00+09:00`) 기준 분기; candidate-tab.js L279 연결 |
| 3   | 등록 취소(WITHDRAWN) 후보가 목록에서 제거되어 표시되지 않는다                                       | ✓ VERIFIED | candidate-tab.js L289: status_priority 모드에서도 `filter(c => c.status !== 'WITHDRAWN')` 적용                         |
| 4   | 후보 수가 변경된 선거구를 지도에서 클릭하면 최신 후보 수가 반영된다                                  | ✓ VERIFIED | map.js 수정 불필요 — 지도 클릭 → candidate-tab.js render() 자동 호출, NOMINATED 필터가 동적으로 적용됨 (Plan 02 SC-4) |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact                                                 | Expected                                 | Status     | Details                                                                                      |
| -------------------------------------------------------- | ---------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `scripts/candidate_pipeline/fetch_nec_candidates.py`    | NEC 본후보 API 호출 + 기존 데이터 병합   | ✓ VERIFIED | `fetch_nec_official()` 구현, `nec_precand_sync.fetch_precandidates()` 재사용, 날짜 게이팅 포함 |
| `data/candidates/unmatched_candidates.json`             | 선거구 미매핑 후보 보관                   | ✓ VERIFIED | 유효한 JSON, `_meta` 구조 확인: `{"version":"1.0","lastUpdated":null,"description":"선거구 미매핑 후보 보관"}` |
| `.github/workflows/update-candidates.yml`               | NEC 본후보 수집 단계                      | ✓ VERIFIED | L62: `"Fetch NEC official candidates"` 단계 존재, 0-c 이후 1단계 이전에 삽입됨                |
| `js/tabs/candidate-tab.js`                              | NOMINATED 필터, WITHDRAWN 필터, ballotNumber 전달 | ✓ VERIFIED | ballotNumber: 5회, NOMINATED: 6회, WITHDRAWN: 5회 출현 확인                                 |

---

### Key Link Verification

| From                                      | To                                             | Via                              | Status     | Details                                                                                           |
| ----------------------------------------- | ---------------------------------------------- | -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `fetch_nec_candidates.py`                 | NEC PofelcddInfoInqireService API              | `fetch_precandidates()` 재사용   | ✓ VERIFIED | L25~33: `from nec_precand_sync import fetch_precandidates, SIDO_MAP, _normalize_party`; L199 호출 |
| `fetch_nec_candidates.py`                 | `governor.json`, `superintendent.json`, `mayor_candidates.json` | `merge_governor/superintendent/mayor_candidates()` | ✓ VERIFIED | L267~285, L333~348, L441~456: 각 병합 함수에서 `status="NOMINATED"` + `ballotNumber` 저장 |
| `.github/workflows/update-candidates.yml` | `scripts/candidate_pipeline/fetch_nec_candidates.py` | python 실행 단계         | ✓ VERIFIED | L70~71: `export NEC_API_KEY="$KEY"; python scripts/candidate_pipeline/fetch_nec_candidates.py --log-raw` |
| `candidate-tab.js render()`               | `ElectionCalendar.getCandidateSortMode()`      | `sortMode === 'ballot_number'` 조건 분기 | ✓ VERIFIED | L278~296: `getCandidateSortMode()` 호출 후 ballot_number/status_priority 분기 처리                |
| `candidate-tab.js buildModel()`           | `data/candidates/*.json`                       | `ballotNumber` 필드 전달         | ✓ VERIFIED | L102 (governor), L135 (superintendent), L176 (mayor): `ballotNumber: candidate.ballotNumber \|\| null` |

---

### Data-Flow Trace (Level 4)

| Artifact               | Data Variable          | Source                               | Produces Real Data                  | Status      |
| ---------------------- | ---------------------- | ------------------------------------ | ----------------------------------- | ----------- |
| `candidate-tab.js`     | `model.candidates`     | `ElectionData.getRegion()` 등        | governor.json / superintendent.json / mayor_candidates.json 실 데이터 | ✓ FLOWING |
| `fetch_nec_candidates.py` | `nec_data["3/10/4"]` | `nec_precand_sync.fetch_precandidates()` | NEC API — 날짜 게이팅(5/14 이전 빈 dict), 5/14 이후 실 API 호출 | ✓ FLOWING (시간 기반 게이팅은 의도된 동작) |

---

### Behavioral Spot-Checks

| Behavior                                      | Command                                                                  | Result                                              | Status    |
| --------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------- | --------- |
| `--dry-run` 날짜 게이팅 + validate 정상 작동  | `python fetch_nec_candidates.py --dry-run`                               | `[GATE] 본후보 등록 개시일(2026-05-14) 이전 → validate Total: 123 candidates across 17 regions ✓` | ✓ PASS |
| unmatched_candidates.json 유효한 JSON + _meta | `python -c "import json; d=json.load(open(...))"` | 정상 파싱, `_meta` 구조 확인                        | ✓ PASS    |
| `update-candidates.yml` NEC 수집 단계 존재    | `grep "Fetch NEC official" update-candidates.yml`                        | L62에서 발견                                        | ✓ PASS    |
| `candidate-tab.js` 핵심 패턴 존재              | `grep -c "ballotNumber\|NOMINATED\|WITHDRAWN" candidate-tab.js`          | ballotNumber 5, NOMINATED 6, WITHDRAWN 5            | ✓ PASS    |
| 커밋 해시 실재 확인                            | `git log --oneline 0a9ccf7 283e579 8de74b2`                              | 3개 커밋 모두 존재 확인                              | ✓ PASS    |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                   | Status          | Evidence                                                                              |
| ----------- | ----------- | ------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| CAND-01     | 06-01       | 본후보 등록 후 candidates 데이터가 공식 후보(NOMINATED)로 자동 전환된다 | ✓ SATISFIED (대기) | `fetch_nec_official()` + `merge_*()` 구현 완료. 5/14 실행 시 자동 전환. REQUIREMENTS.md: "Pipeline Ready (5/14 실행 대기)" |
| CAND-02     | 06-02       | 후보 기호가 배정되면 기호순 정렬이 올바르게 적용됨 (5/15 18:00 이후)  | ✓ SATISFIED     | candidate-tab.js L282~286: ballot_number 모드에서 `(a.ballotNumber \|\| 999) - (b.ballotNumber \|\| 999)` |
| CAND-03     | 06-02       | 등록 취소·무효 후보가 목록에서 제거된다                          | ✓ SATISFIED     | candidate-tab.js L289: status_priority + ballot_number 양쪽 분기에서 WITHDRAWN 제거  |

**REQUIREMENTS.md 체크박스 상태:**
- CAND-01: `[ ]` — REQUIREMENTS.md에 체크 미기재이나, 트레이서빌리티 테이블에 "Pipeline Ready (5/14 실행 대기)"로 표시됨. 구현은 완료, 실행은 5/14 대기 중 (의도된 상태).
- CAND-02: `[x]` — 완료
- CAND-03: `[x]` — 완료

**비고:** CAND-01의 체크박스가 REQUIREMENTS.md에 `[ ]`로 남아 있으나, 이는 파이프라인 실행이 5/14까지 불가능한 시간 기반 제약 때문이다 (날짜 게이팅 의도된 동작). 구현 자체는 완료됨.

---

### Anti-Patterns Found

| File                                | Line | Pattern                | Severity | Impact                                                                  |
| ----------------------------------- | ---- | ---------------------- | -------- | ----------------------------------------------------------------------- |
| `fetch_nec_candidates.py`           | 185  | `if now < datetime(2026, 5, 14)` → 빈 dict 반환 | ℹ️ Info  | 날짜 게이팅은 의도된 동작 — 5/14 이전 API 미호출. STUB 아님.             |
| `data/candidates/unmatched_candidates.json` | — | `"candidates": []` | ℹ️ Info | 초기 파일, 매핑 실패 후보 없음 정상 상태.                                |

스텁 없음. 모든 `return {}` / `[]` 패턴은 날짜 게이팅 또는 초기 상태로 의도된 동작.

---

### Human Verification Required

#### 1. ballot_number 모드 NOMINATED 전용 필터 + 기호순 정렬 수동 확인

**테스트:** Chrome DevTools Console에서 `ElectionCalendar.getCandidateSortMode = () => 'ballot_number'` 실행 후 서울 클릭 → 후보 탭 확인
**Expected:** NOMINATED 후보만 표시, 기호순 정렬
**Why human:** 현재 날짜(2026-03-30)가 5/15 이전이므로 `getCandidateSortMode()`가 'status_priority' 반환. ballot_number 분기는 자동 검증 불가. (UAT는 Plan 02 Task 2에서 이미 승인됨 — 2026-03-30)

#### 2. NEC 본후보 API 실제 수집 확인 (5/14 이후)

**테스트:** 2026-05-14 이후 `python scripts/candidate_pipeline/fetch_nec_candidates.py --dry-run --log-raw` 실행
**Expected:** `[NEC] 광역단체장 본후보 조회...` 로그 출력, `data/candidates/nec_raw_sample.json` 생성, 날짜 게이팅 메시지 없음
**Why human:** 현재 날짜(2026-03-30)가 5/14 이전이므로 자동 검증 불가.

---

### Gaps Summary

갭 없음. Phase 6의 4개 Success Criteria 모두 코드 레벨에서 검증됨:

1. **SC-1 (NOMINATED 전용 필터):** candidate-tab.js L284에서 ballot_number 모드 시 `filter(c => c.status === 'NOMINATED')` 적용 — 코드 완전히 존재하며 wired.
2. **SC-2 (기호순 정렬 전환):** election-calendar.js의 `getCandidateSortMode()` → candidate-tab.js L279 호출 체인 완전히 연결됨.
3. **SC-3 (WITHDRAWN 제거):** status_priority 모드에서도 L289 필터 적용.
4. **SC-4 (지도 클릭 → 최신 후보 수 반영):** map.js 수정 없이 render() 필터 자동 적용 — 설계대로 동작.

CAND-01의 실제 실행은 5/14에 의존하지만, 파이프라인 구현 자체는 완료됨. 이는 Phase 6 Goal ("5/15 18:00 이후 공식 후보 목록과 기호순 정렬이 정확하게 작동한다")의 준비 조건 충족.

---

_Verified: 2026-03-30T07:35:00+09:00_
_Verifier: Claude (gsd-verifier)_
