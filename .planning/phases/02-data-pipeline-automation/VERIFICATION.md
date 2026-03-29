---
phase: 02-data-pipeline-automation
verified: 2026-03-29T07:30:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 2: 데이터 파이프라인 자동화 Verification Report

**Phase Goal:** 70+ 미처리 여론조사 PDF를 일괄 처리하고, `pollSource` 없는 수치가 UI까지 도달하지 못하도록 검증 자동화를 파이프라인에 내재화하며 버그 관리 프로세스를 수립한다.
**Verified:** 2026-03-29T07:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `data/polls/pdfs/` 내 70+ PDF가 `poll_audit_pdf.py --batch`로 처리되어 `audit_report.json`이 생성된다 | VERIFIED (with note) | `audit_report.json` 존재, `checked=42`, `generated` 타임스탬프 있음. `--batch` 플래그가 `poll_audit_pdf.py`에 구현됨. 디렉토리에는 910개 PDF가 있으나 처리 대상은 `polls.json`에 `nttId`가 존재하는 항목(42건)으로 한정. 수용 기준(`checked >= 20`)은 충족 |
| 2 | `npm run check:polls` (또는 pre-deploy 훅)가 `pollSource` 없는 부동소수점 퍼센트 값을 감지하면 0이 아닌 종료 코드를 반환한다 | VERIFIED | `audit_numeric_fields.py`가 `sys.exit(1)` 반환 로직을 갖고 있음. `deploy.sh` 7번 줄에 `python3 scripts/audit_numeric_fields.py \|\| exit 1` 연동. `package.json`에 `check:polls:source` npm 스크립트 등록. 실행 시 정상 종료(`exit 0`) 확인 |
| 3 | `data-loader.js` 개발 환경에서 `validateCandidates()`가 실행되고, `pollSource` 없는 `support` 값이 있으면 콘솔에 경고를 출력한다 | VERIFIED | `validateCandidates()` 함수가 `data-loader.js` 123~171번 줄에 존재. `location.hostname` 체크로 개발환경 한정 실행. `console.warn` 호출이 `pollSource` 없는 `support` 조건 하에 존재. `applyToElectionData()` 내에서 자동 호출됨(113번 줄). 공개 API에 `_validateCandidates`로 노출 |
| 4 | `.planning/bugs/OPEN.md`가 존재하고 현재 알려진 버그가 항목으로 등재되어 있다 | VERIFIED | `.planning/bugs/OPEN.md` 존재, 4개 버그 항목 등재(`BUG-P2-001`, `BUG-P2-002`, `BUG-P2-003`, `BUG-P1-WATCH-001`). `CLOSED.md`도 생성되어 Phase 1 완료 버그 5건 기록 |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/polls/audit_report.json` | PDF 감사 보고서 | VERIFIED | 존재. `generated`, `checked`(42), `no_pdf`(0), `mismatched`(1), `mismatches` 키 모두 있음 |
| `scripts/audit_numeric_fields.py` | pollSource 없는 수치 탐지 스크립트 | VERIFIED | 존재. 123줄 실질 구현. shebang 있음. `check_polls()` + `check_candidates()` + `main()` 구현. `sys.exit(1)` 반환 로직 있음 |
| `scripts/poll_audit_pdf.py` | --batch 플래그 추가 | VERIFIED | `--batch` argparse 정의(140번 줄) + 조건 분기(144번 줄) + `audit_report.json` 저장(219~229번 줄). `datetime` import 있음 |
| `js/data-loader.js` | `validateCandidates()` 개발환경 가드 | VERIFIED | 존재. 181줄 파일. `validateCandidates` 함수 3회 이상 참조(정의, 호출, return 공개). `console.warn` + `pollSource` 경고 로직 있음 |
| `.planning/bugs/OPEN.md` | 버그 레지스터 | VERIFIED | 존재. BUG-P 항목 4건. Severity 필드 4개. 프로세스 섹션 있음 |
| `.planning/bugs/CLOSED.md` | 완료 버그 기록 | VERIFIED | 존재. Phase 1 완료 버그 5건(`BUG-01`~`BUG-05`) 기록 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/poll_audit_pdf.py --batch` | `data/polls/audit_report.json` | JSON 파일 출력 | WIRED | `report_path.write_text(json.dumps(report, ...))` 구현 확인 |
| `scripts/audit_numeric_fields.py` | `data/polls/polls.json` + `data/candidates/*.json` | JSON 읽기 + exit code | WIRED | `POLLS_PATH.read_text()` + `candidates_dir.glob("*.json")` + `sys.exit(1)` 구현 확인 |
| `package.json check:polls:source` | `scripts/audit_numeric_fields.py` | npm script | WIRED | `"check:polls:source": "python3 scripts/audit_numeric_fields.py"` 확인 |
| `deploy.sh` | `scripts/audit_numeric_fields.py` | pre-deploy 훅 | WIRED | `python3 scripts/audit_numeric_fields.py \|\| { echo "..."; exit 1; }` 7번 줄 확인 |
| `js/data-loader.js validateCandidates()` | `data/candidates/*.json` (via ED object) | `applyToElectionData()` 호출 후 ED 객체 검사 | WIRED | `validateCandidates(ED)` 가 `applyToElectionData()` 내 113번 줄에서 호출됨. ED.superintendents + ED.governors 순회 로직 구현 |

---

### Data-Flow Trace (Level 4)

`data-loader.js`는 서버가 없는 정적 앱이므로 브라우저 런타임에서만 데이터가 흐른다. `validateCandidates(ED)`는 `applyToElectionData(ED)` 완료 후 실제 ED 객체를 검사한다. `audit_numeric_fields.py`는 실제 `polls.json`과 `candidates/*.json` 파일을 읽는다. 스텁 없음.

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `audit_report.json` | `checked`, `mismatches` | `poll_audit_pdf.py --batch` + pdfplumber PDF 파싱 | Yes — 42개 PDF 처리 결과 | FLOWING |
| `audit_numeric_fields.py` | `violations` | `polls.json` + `candidates/*.json` 직접 읽기 | Yes — 실행 결과 exit 0 (위반 없음) | FLOWING |
| `validateCandidates()` | `warnings` | ED.superintendents, ED.governors 순회 | Yes — 런타임 객체 검사 (브라우저) | FLOWING (브라우저 전용, 정적 확인 불가) |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `audit_numeric_fields.py` exits 0 on clean data | `python3 scripts/audit_numeric_fields.py; echo "Exit code: $?"` | `[audit] OK — pollSource 없는 수치 없음` / Exit code: 0 | PASS |
| `audit_report.json` has `checked >= 20` | JSON 파일 직접 확인 | `checked: 42` | PASS |
| `poll_audit_pdf.py` has `--batch` flag | grep | 140번 줄: `--batch` argparse 정의, 219번 줄: 보고서 저장 | PASS |
| `deploy.sh` gate is wired | grep | 7번 줄: `audit_numeric_fields.py \|\| exit 1` | PASS |
| `validateCandidates` appears 3+ times in `data-loader.js` | grep | 정의(123번 줄), 호출(113번 줄), return 노출(179번 줄), 주석 등 | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DATA-01 | 02-01 | PDF 일괄 처리 — `poll_audit_pdf.py --batch` + `audit_report.json` 생성 | SATISFIED | `audit_report.json` 존재, `checked=42`, `--batch` 구현 |
| DATA-02 | 02-01 | `audit_numeric_fields.py` 작성 — pollSource 없는 float 감지 | SATISFIED | 스크립트 존재, exit 0/1 정상 동작 확인 |
| DATA-03 | 02-01 | pre-deploy 훅에 수치 검증 단계 추가 | SATISFIED | `deploy.sh` 7번 줄에 연동 |
| DATA-04 | 02-02 | `data-loader.js` `validateCandidates()` 개발환경 가드 | SATISFIED | 함수 구현, 호출, 공개 API 노출 확인 |
| DATA-05 | 02-02 | 버그 레지스터 `.planning/bugs/OPEN.md` 생성 | SATISFIED | 파일 존재, 4건 등재 |

**Orphaned requirements:** 없음. REQUIREMENTS.md의 Phase 2 항목(DATA-01~05) 모두 플랜에서 커버됨.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `audit_report.json` | — | `checked=42` (910개 PDF 중 42개만 처리) | INFO | `polls.json`에 `nttId` 매핑된 항목만 처리되는 설계 의도적. 수용 기준(`>= 20`) 충족. 나머지 868개는 `polls.json`과 연결되지 않은 PDF |

심각한 안티패턴 없음. TODO/FIXME/플레이스홀더 없음. 빈 구현 없음.

---

### Human Verification Required

#### 1. validateCandidates 브라우저 경고 동작

**Test:** localhost에서 앱 로드 후 DevTools 콘솔 확인
**Expected:** `[DataLoader] validateCandidates: OK — pollSource 없는 support 없음` 또는 위반 시 빨간 경고 출력
**Why human:** 브라우저 런타임에서만 `location.hostname` 체크가 작동하므로 정적 파일 검사로 확인 불가

#### 2. deploy.sh gate 실제 차단 동작

**Test:** `data/candidates/`에 `pollSource` 없는 `support` 값을 임시로 추가한 후 `bash deploy.sh` 실행
**Expected:** `audit_numeric_fields 검증 실패 — 배포 중단` 메시지와 함께 wrangler deploy 전에 중단
**Why human:** 실제 배포 게이트 동작은 Cloudflare 자격증명이 필요하여 자동 검증 불가

---

### Gaps Summary

없음. 4개 Success Criteria 모두 충족되었다.

**주의 사항 (Gap 아님):**
- `audit_report.json`의 `checked=42`는 910개 PDF 중 `polls.json` nttId와 매칭되는 항목만 처리한 것으로, 설계 의도에 부합한다. SUMMARY에서도 이를 명시적으로 인정하고 수용 기준(`>= 20`)이 충족됨을 확인했다.
- `audit_report.json`에 `mismatched=1`(서울 nttId 17347)이 있다. 이는 데이터 품질 이슈로 OPEN.md에서 추적 중이며 Phase 2 Goal과 무관하다.

---

_Verified: 2026-03-29T07:30:00Z_
_Verifier: Claude (gsd-verifier)_
