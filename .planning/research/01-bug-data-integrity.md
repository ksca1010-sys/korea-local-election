# Bug Fixing Systematization & Data Integrity
# Korea Local Election Map — Vanilla JS SPA

**Researched:** 2026-03-29
**Scope:** Detecting and preventing data integrity issues without a test suite

---

## 1. The Two Concrete Bugs to Fix First

### Bug A — Hardcoded `support` values in `js/data.js:1529-1545`

Every `superintendents` entry has inline `support: 38.5`, `support: 35.2`, etc.
These numbers are LLM-generated estimates — no NEC or NESDC source exists for them
because the superintendent election has not happened yet.

**Fix strategy (do not touch other files per CLAUDE.md scope rules):**
- Remove the `support` field entirely from all `candidates[]` entries in lines 1529-1545.
- Update `js/tabs/overview-tab.js` and `js/tabs/poll-tab.js` to handle `support === undefined`
  gracefully (hide the bar / show "여론조사 없음") rather than rendering a fabricated number.
- The `support` field should only ever be populated from `data/candidates/superintendent.json`
  entries that carry a `pollSource` + `pollDate` reference.

**Detection rule going forward:**
Any `support` value that lacks a sibling `pollSource` field is a data integrity violation.
Add a one-line comment above the block: `// WARN: support fields below must have pollSource`.

### Bug B — Comment "mock fallback" in `js/data.js:1790`

Lines 1790-1827 already removed the mock fallback (the comment at 1790 says
"외부 JSON 로드 데이터 우선, 없으면 mock fallback" but the actual code at 1826 says
"no mock fallback — real data comes from loadByElectionData()"). The comment is
misleading, not the code. Fix: update the stale comment to reflect reality. No
behavioral change needed.

---

## 2. Detecting Data Integrity Issues in Static JSON Files

### 2a. Mandatory `_meta` block in every candidate JSON

All `data/candidates/*.json` files already use `_meta.lastUpdated`. Extend this
convention with two additional fields:

```json
"_meta": {
  "lastUpdated": "2026-03-29",
  "source": "NEC API / sgTypecode=4 / VoteXmntckInfoInqireService2",
  "llmReviewedAt": null
}
```

Rule: if `llmReviewedAt` is not null and `source` does not start with `NEC` or `NESDC`,
the file must be flagged in `data_health_check.py` before deployment.

### 2b. Field-level source annotation for numbers

Floating-point fields that represent percentages or vote shares are the highest-risk
category. Adopt this convention inside JSON objects:

```json
{ "name": "정근식", "stance": "진보", "career": "현 교육감 (보궐)" }
```

Omit `support` entirely unless you can also supply:

```json
{ "support": 38.5, "pollSource": "NESDC-17823", "pollDate": "2026-03-10" }
```

This is enforced at read time: `data.js` getter strips `support` before returning
if `pollSource` is absent.

### 2c. Audit script pattern (Python, already fits `scripts/` conventions)

```python
# scripts/audit_numeric_fields.py
# Run: python scripts/audit_numeric_fields.py
import json, pathlib, sys

NUMERIC_FIELDS = ["support", "rate", "winnerRate", "runnerRate"]
REQUIRE_SOURCE = {"support": "pollSource"}
errors = []

for path in pathlib.Path("data").rglob("*.json"):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        continue
    def walk(obj, file):
        if isinstance(obj, dict):
            for field, sibling in REQUIRE_SOURCE.items():
                if field in obj and sibling not in obj:
                    errors.append(f"{file}: {field}={obj[field]} missing {sibling}")
            for v in obj.values():
                walk(v, file)
        elif isinstance(obj, list):
            for item in obj:
                walk(item, file)
    walk(data, str(path))

if errors:
    print("\n".join(errors))
    sys.exit(1)
print("OK")
```

Integrate into `data_health_check.py` as a pre-check step (before freshness checks).

---

## 3. Removing Mock/Fallback Data Safely

### 3a. Audit before delete

Before removing any fallback, verify the primary data path actually works:
1. Run the app locally with network throttle to "offline" — does the UI show an error state
   or silently render the fallback?
2. Check `data-loader.js` for error handling: if `fetch()` fails, does it call a fallback
   function or throw?
3. Only remove fallback after confirming the error state is user-visible (not a blank pane).

### 3b. Replace mock with explicit null guard

Instead of deleting a fallback and hoping for the best:

```js
// BEFORE (implicit fallback)
return cachedData || MOCK_DATA;

// AFTER (explicit null, let the UI handle it)
if (!cachedData) {
    console.warn('[data] byElection cache not loaded — returning null');
    return null;
}
return cachedData;
```

The tab renderer then checks `if (!data) { showEmptyState('데이터를 불러오는 중...'); return; }`.
This is already the pattern in `getByElectionData()` at line 1827 — confirm all other
getters follow the same pattern.

### 3c. Search for remaining mock patterns

```bash
# Run from project root before each release
grep -rn "mock\|fallback\|MOCK\|placeholder\|dummy" js/ --include="*.js" | grep -v "//.*no mock"
```

Any hit that is not preceded by a "no mock" comment should be reviewed.

---

## 4. Systematic Bug Tracking Without a Test Suite

### 4a. Bug register in `.planning/bugs/`

Create `.planning/bugs/OPEN.md` with a table:

```markdown
| ID | File | Lines | Symptom | Root cause | Status |
|----|------|-------|---------|------------|--------|
| B01 | js/data.js | 1529-1545 | LLM support values | No NEC source | OPEN |
| B02 | js/data.js | 1790 | Misleading comment | Stale docs | OPEN |
```

Commit message format when fixing: `fix(B01): remove LLM-generated support values from superintendent data`.

### 4b. Regression guard via console assertions

Since there is no test runner, insert `console.assert` guards in `data.js` getters
that run in development:

```js
// After data is returned, assert invariants in dev
if (location.hostname === 'localhost') {
    candidates.forEach(c => {
        console.assert(!('support' in c) || 'pollSource' in c,
            '[invariant] support field requires pollSource:', c.name);
    });
}
```

These fire in the browser console during local development and cost nothing in production
(they are never reached on `korea-local-election.pages.dev`).

### 4c. Diff-based review before every commit

Before committing any `data/*.json` change, run:

```bash
git diff data/ | grep "^\+" | grep -E '"support"|"rate"|"winnerRate"'
```

If this produces output, manually verify each changed number against its source.
Add this as a note in CLAUDE.md's "수정 시 주의" section.

---

## 5. Data Validation Patterns for Election/Polling Data

### 5a. Range checks that match Korean election law

| Field | Valid range | Why |
|-------|-------------|-----|
| `support` (poll %) | 0–100, sum of candidates ≤ 110 (undecided gap) | Basic sanity |
| `rate` (vote share %) | 0–100 | NEC data |
| `turnout` | 20–80 for Korean local elections | Historical range |
| `election` (회차) | 1–9 | Direct superintendent election 2006–2026 |
| `year` | 2006–2026 | Election cycle years only |
| `pollDate` | Must be >= 2025-10-01, <= 2026-06-03 | 6.3 선거 캠페인 기간 |

Add these to `scripts/audit_numeric_fields.py` as range assertions.

### 5b. Schema validation with no dependencies

Use a small inline validator in `data-loader.js` that runs when JSON is first loaded:

```js
function validateCandidates(arr, source) {
    arr.forEach((c, i) => {
        if (!c.name) console.error(`[schema] ${source}[${i}] missing name`);
        if (!c.status) console.error(`[schema] ${source}[${i}] missing status`);
        if ('support' in c && !('pollSource' in c))
            console.error(`[schema] ${source}[${i}] support without pollSource`);
    });
}
```

Call it once per load, gated on `location.hostname === 'localhost'`. Zero production cost.

### 5c. Poll registration number check

Every `data/polls/*.json` entry must have:

```json
{ "nesdc_id": "17823", "pollOrg": "리서치뷰", "commissionedBy": "..." }
```

The `nesdc_id` field is verifiable at `www.nesdc.go.kr`. Any poll entry without
`nesdc_id` is unverified and should be filtered out by the poll-tab renderer.
The existing `scripts/classify_poll_pdfs.py` already handles this — ensure
`data/polls/` entries without `nesdc_id` are not surfaced in the UI.

---

## 6. Auditing Existing JSON Files for Anomalies

### 6a. One-time LLM-origin scan

The `data/candidates/candidates_governor_mock.json` filename itself signals mock data.
Run a scan for any files with "mock" in the name that are still referenced:

```bash
grep -rn "candidates_governor_mock" js/ --include="*.js"
```

If referenced, replace the reference with the canonical `governor.json`.

### 6b. Duplicate candidate check

A candidate appearing in two regions or twice in the same region's list is a sign
of a bad merge. Add to `data_health_check.py`:

```python
names_seen = {}
for cand in candidates:
    key = (cand['name'], region_key)
    if key in names_seen:
        errors.append(f"Duplicate candidate {cand['name']} in {region_key}")
    names_seen[key] = True
```

### 6c. Cross-file consistency checks

`data/static/superintendents.json` must agree with `data/candidates/superintendent.json`
on `currentSuperintendent.name` for each region. Add a check:

```python
static_sup = load_json("data/static/superintendents.json")
dynamic_sup = load_json("data/candidates/superintendent.json")
for region, entry in static_sup.items():
    dyn = dynamic_sup.get("regions", {}).get(region, {})
    static_name = entry.get("currentSuperintendent", {}).get("name")
    dyn_name = dyn.get("currentSuperintendent", {}).get("name")
    if static_name and dyn_name and static_name != dyn_name:
        errors.append(f"superintendent mismatch {region}: {static_name} vs {dyn_name}")
```

The hardcoded `data.js:1529-1545` block is a third copy of this data — it must be
removed entirely once the above two JSON sources are authoritative.

---

## Summary: Priority Order

1. **Immediate** — Remove `support` fields from `js/data.js:1529-1545` (LLM numbers in prod).
2. **Immediate** — Fix misleading "mock fallback" comment at line 1790.
3. **Before next deploy** — Add `audit_numeric_fields.py` and wire into `data_health_check.py`.
4. **Ongoing** — Enforce `pollSource` sibling rule in `data-loader.js` validator.
5. **Sprint** — Migrate all superintendent data out of `data.js` into `superintendent.json` only.
