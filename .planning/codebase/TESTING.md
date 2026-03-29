# Testing Patterns

**Analysis Date:** 2026-03-29

## Overview

This project has no browser-side unit test framework (no Jest, Vitest, or similar). Testing is split into two layers:

1. **Python unit tests** — `scripts/tests/` — for pipeline logic
2. **Node.js regression runners** — `scripts/run_*.js` — integration/regression tests against real data

There is no `package.json` test script; tests are run via npm scripts named `check:*`.

## Run Commands

```bash
npm run check:all          # Runs all quality gates via run_quality_gate.js
npm run check:news         # News filter regression (node scripts/run_news_regression.js)
npm run check:polls        # Poll selection regression (node scripts/run_poll_regression.js)
npm run check:observations # News observation integrity check
npm run check:poll-observations  # Poll observation integrity check
npm run check:local-media  # Local media registry check
npm run report:health      # Data health report (node scripts/report_data_health.js)
python3 scripts/health_check.py         # Full Python data integrity check
python3 scripts/health_check.py --fix   # Auto-correct fixable issues
python3 scripts/health_check.py --json  # JSON report output
python3 scripts/data_health_check.py    # Data freshness check + auto-heal
python3 scripts/tests/test_verify_changes.py  # Run Python unit tests manually
```

## Python Unit Tests

**Location:** `scripts/tests/test_verify_changes.py`

**Framework:** Plain Python `assert` statements — no pytest, no unittest. Tests are run by invoking the script directly or calling the bundled runner at the bottom of the file.

**What is tested:** The `verify_changes_against_news()` function in `scripts/candidate_pipeline/verify_changes.py` — the news-based candidate change verification guard.

**Test structure:**
```python
def test_news_zero_downgrades_new_candidate():
    """뉴스 0건 → 신규 후보는 RUMORED로 다운그레이드"""
    changes = [{'name': '홍길동', 'changeType': 'new_candidate', 'newStatus': 'DECLARED'}]
    result = verify_changes_against_news(changes, news=[])
    assert result[0]['newStatus'] == 'RUMORED', f"Expected RUMORED, got {result[0]['newStatus']}"
```

**Tests covered (9 cases):**
- Zero news → new candidate downgraded to RUMORED
- Zero news → status change blocked
- Name not in news → candidate excluded
- Name in news without election context → RUMORED downgrade
- Party change without 탈당/입당 keyword → excluded
- Party change with keyword → passes
- WITHDRAWN requires 사퇴 keyword
- Speculative language → RUMORED
- Superintendent stance without evidence → defaults to 중도

**Runner at file bottom (no test framework needed):**
```python
if __name__ == '__main__':
    tests = [test_news_zero_downgrades_new_candidate, ...]
    for t in tests:
        try: t(); print(f'PASS {t.__name__}')
        except AssertionError as e: print(f'FAIL {t.__name__}: {e}')
```

## Node.js Regression Tests

### Poll Regression (`scripts/run_poll_regression.js`)

**Approach:** Runs named test cases from `scripts/poll_regression_cases.json` against the real application's `app.__debug.buildPollSelection()` function loaded via `scripts/news_debug_runtime.js`.

**Case format:**
```json
{
  "name": "seoul-governor-summary-trend",
  "regionKey": "seoul",
  "electionType": "governor",
  "expectedMinCount": 1,
  "expectedChartMode": "trend",
  "expectedChartType": "line",
  "expectedHeaderIncludes": ["서울", "광역단체장"],
  "expectedDatasetCountMin": 2
}
```

**Assertions per case:** poll count range, chart mode, chart type, chart reason, header text, first poll title, first poll municipality, dataset labels, dataset count, municipality count.

**Output:** `PASS`/`FAIL` per case + summary exit code.

### News Regression (`scripts/run_news_regression.js`)

**Approach:** Runs cases from `scripts/news_regression_cases.json` against `app.__debug.evaluateNewsCase()` and `app.__debug.buildNewsQueryPlan()`.

**Assertions per case:** news filter effective result, strict/relaxed filter result, locality score threshold, query plan primary/secondary keywords.

### Quality Gate (`scripts/run_quality_gate.js`)

Orchestrates all Node regression scripts in sequence via `spawnSync`. Returns non-zero exit code if any check fails.

## Data Integrity Checks (Not Unit Tests)

These scripts validate JSON data files, not application logic:

| Script | What it checks |
|--------|---------------|
| `scripts/health_check.py` | Candidate data: duplicates, missing fields, Korean name regex, party consistency |
| `scripts/data_health_check.py` | File freshness via `_meta.lastUpdated`; triggers GitHub Actions workflows if stale |
| `scripts/check_candidates.py` | Candidate JSON schema and cross-file consistency |
| `scripts/check_poll_observations.js` | Poll observation records integrity |
| `scripts/check_news_observations.js` | News observation records integrity |
| `scripts/verify_mayors_dual_source.py` | Dual-source cross-verification for mayor candidates |
| `scripts/poll_cross_verify.py` | Cross-verify poll data across sources |

## Coverage Areas

**Tested:**
- Candidate change verification logic (Python unit tests, 9 cases)
- Poll tab selection algorithm (regression cases via `__debug` hook)
- News filter scoring and query plan generation (regression cases)
- JSON data file integrity and freshness (health check scripts)

**Not tested:**
- `js/map.js` — D3 rendering, no tests
- `js/tabs/*.js` — all tab renderers, no tests
- `js/election-calendar.js` — date logic untested (high-risk: legal publication ban)
- `js/data.js` — data accessor functions, no tests
- `js/app.js` — application orchestration, no tests
- `js/search.js`, `js/router.js`, `js/sidebar.js` — no tests
- CSS rendering / visual regression — none
- Mobile layout — none
- E2E / browser automation — none

## Key Testing Gaps

**High priority:**
- `ElectionCalendar.isPublicationBanned()` — legal requirement, no automated test. A bug here could expose poll data during the legally mandated ban (5/28–6/3).
- `ElectionCalendar.getCandidateSortMode()` — controls candidate ordering post-registration, untested.
- `DataLoader.applyToElectionData()` — JSON hot-swap logic, no tests.

**Medium priority:**
- Tab renderers produce HTML strings — no snapshot or DOM tests.
- `js/utils.js` helper functions (`escapeHtml`, `getMergedRegionKey`) — no unit tests.

---

*Testing analysis: 2026-03-29*
