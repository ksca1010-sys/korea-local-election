# Pipeline Automation Research
# Domain: Korean Local Election Data Collection & Verification
# Researched: 2026-03-29
# Confidence: MEDIUM (patterns verified via official docs + community sources; election-specific details from project code analysis)

---

## 1. Reliable Election Data Pipelines: Idempotency & Retry

### Idempotency — Most Important Property

An idempotent pipeline produces the same output whether run once or ten times on the same input. For election data this is non-negotiable: rerunning after a crash must not duplicate poll records or double-count candidates.

**Recommended pattern — delete-then-write per partition:**

```python
def save_polls_idempotent(polls: list[dict], region: str, output_path: Path):
    existing = load_json(output_path) or []
    # Remove all records for this region before writing new ones
    cleaned = [p for p in existing if p.get("region") != region]
    cleaned.extend(polls)
    save_json(output_path, cleaned)
```

This means a partial run leaves the store consistent: old data is fully replaced, not appended to.

**State file pattern (already in nesdc_poll_pipeline.py):**
`data/polls/state.json` tracks `last_run`, `last_page`, `processed_ids`.
On restart: read state, skip already-processed IDs, resume from last page.

### Retry Logic

Use `httpx` with a custom retry wrapper rather than a retry library — keeps dependencies minimal and behavior explicit:

```python
import time, httpx

def fetch_with_retry(url: str, *, retries=3, delay=2.0, **kwargs) -> httpx.Response:
    last_exc = None
    for attempt in range(retries):
        try:
            resp = httpx.get(url, timeout=30, **kwargs)
            resp.raise_for_status()
            return resp
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            last_exc = exc
            if attempt < retries - 1:
                time.sleep(delay * (2 ** attempt))  # exponential backoff
    raise last_exc
```

Key rules:
- Retry on 5xx and network errors. Do NOT retry 400/403/404 (bad request, not transient).
- NEC API rate limit: enforce `DELAY = 1.0` between requests minimum.
- NESDC HTML pages: `DELAY = 1.5` to avoid 429.

---

## 2. PDF Poll Data Extraction

### Library Recommendation: pdfplumber (HIGH confidence)

`pdfplumber` is built on `pdfminer.six` and adds table extraction. It is the correct choice for NESDC result PDFs because they use tabular layouts for candidate support numbers.

- Inherits `pdfminer` CJK (Korean) character support
- `page.extract_tables()` handles bordered/borderless tables
- `page.extract_text()` for free-form text fallback

For performance-critical batch processing, `pymupdf` (fitz) is 3-5x faster but has a more complex license (AGPL). Acceptable for internal scripts.

### Batch Processing the 70+ Unprocessed PDFs

Current `scripts/poll_audit_pdf.py` handles single files. For batch:

```python
from pathlib import Path
import pdfplumber, json

PDF_DIR = Path("data/polls/pdfs")
AUDIT_LOG = Path("data/polls/audit_report.json")

def process_all_pdfs(fix: bool = False) -> dict:
    results = {"processed": 0, "failed": [], "mismatches": []}
    for pdf_path in sorted(PDF_DIR.glob("*.pdf")):
        poll_id = pdf_path.stem  # e.g., "17823"
        try:
            candidates = extract_support_from_pdf(pdf_path)
            if candidates:
                results["processed"] += 1
                # compare / store
        except Exception as exc:
            results["failed"].append({"id": poll_id, "error": str(exc)})
    return results
```

### Table Extraction Failure Modes (Korean PDFs)

| Problem | Cause | Fix |
|---------|-------|-----|
| Empty table list | Scanned image PDF | Skip; flag for manual review |
| Wrong column count | Merged cells | Use `extract_text()` fallback, regex parse |
| Garbled Korean | Non-embedded font | Try `pymupdf` as fallback |
| Percentage as integer | PDF stores `45` not `45.2` | Divide by 10 when value > 100 |

Pattern for the "전체" (total) row in NESDC result tables:

```python
TOTAL_ROW_MARKERS = ["전체", "■", "합계"]

def find_total_row(table: list[list]) -> list | None:
    for row in table:
        row_text = " ".join(str(c or "") for c in row)
        if any(m in row_text for m in TOTAL_ROW_MARKERS):
            return row
    return None
```

---

## 3. Pipeline Stages: Collect → Normalize → Validate → Store

```
[NESDC HTML]──┐
[NEC API]─────┼──► COLLECT ──► NORMALIZE ──► VALIDATE ──► STORE ──► AUDIT LOG
[PDF files]───┘
```

### Stage 1: Collect
- HTTP scraping (NESDC), REST API calls (NEC), PDF download
- Output: raw dicts, no transformation yet
- Failure mode: network error → retry with backoff, log and skip

### Stage 2: Normalize
- Standardize field names to match `polls.json` schema
- Region string → region code via `REGION_MAP`
- Date strings → `YYYY-MM-DD`
- Support values → float (handle integer-encoded percentages)
- Registration numbers → string with zero-padding: `f"{reg_no:07d}"`

### Stage 3: Validate
Use a simple schema dict rather than a heavy framework (no Pydantic/Pandera needed for this scale):

```python
REQUIRED_POLL_FIELDS = {
    "id": str,
    "region": str,
    "pollster": str,
    "start_date": str,   # YYYY-MM-DD
    "end_date": str,
    "sample_size": int,
    "candidates": list,
}

def validate_poll(poll: dict) -> list[str]:
    errors = []
    for field, expected_type in REQUIRED_POLL_FIELDS.items():
        if field not in poll:
            errors.append(f"missing:{field}")
        elif not isinstance(poll[field], expected_type):
            errors.append(f"wrong_type:{field}")
    if poll.get("sample_size", 0) < 30:
        errors.append("sample_size:suspiciously_small")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", poll.get("end_date", "")):
        errors.append("end_date:invalid_format")
    return errors
```

Validation criticality levels:
- **FATAL**: missing `id`, missing `region` → skip record, log error
- **WARN**: missing `sample_size`, `margin_of_error` → store with `_incomplete: true` flag
- **INFO**: unexpected extra fields → log only, don't block

### Stage 4: Store
- Only validated records reach storage
- Write via `save_json` with `ensure_ascii=False`
- Never overwrite with fewer records than previous run without explicit `--force` flag

---

## 4. Scheduling and Incremental Updates

### Frequency Recommendation

| Data type | Change frequency | Recommended schedule |
|-----------|-----------------|----------------------|
| NEC candidates | Daily (pre-filing), hourly (filing period 5/14-15) | `cron: 0 */4 * * *` |
| NESDC polls | Multiple times daily | `cron: 0 6,12,18 * * *` |
| PDF results | When new polls appear | Triggered by NESDC scrape |
| News items | Hourly | `cron: 30 * * * *` |

### Incremental Strategy

The `state.json` pattern already in use is correct. Extend it:

```json
{
  "last_run": "2026-03-29T14:00:00",
  "last_poll_id": 17915,
  "processed_ids": [17823, 17825, "..."],
  "pdf_processed": [17823, 17825, "..."],
  "etag_cache": {
    "nesdc_list_page_1": "abc123"
  }
}
```

Use HTTP `ETag`/`Last-Modified` headers for NESDC pages to skip re-parsing unchanged pages:

```python
headers = {}
etag = state.get("etag_cache", {}).get(cache_key)
if etag:
    headers["If-None-Match"] = etag
resp = fetch_with_retry(url, headers=headers)
if resp.status_code == 304:
    return []  # nothing changed
state["etag_cache"][cache_key] = resp.headers.get("ETag", "")
```

### Shell Scheduling (no heavy orchestrator needed)

Use cron + shell scripts (already: `nec_auto_update.sh`, `overnight_runner.sh`):

```bash
# crontab -e
0 6,12,18 * * * /path/to/scripts/overnight_runner.sh >> /tmp/pipeline.log 2>&1
```

For filing period (5/14-15), increase to hourly and set `MAX_PAGES=5` (only check recent pages).

---

## 5. Error Handling and Audit Logging

### Structured Audit Log

Every pipeline run must append to `data/polls/audit_report.json`:

```python
import json
from datetime import datetime
from pathlib import Path

AUDIT_PATH = Path("data/polls/audit_report.json")

def write_audit(run_id: str, results: dict):
    audit = json.loads(AUDIT_PATH.read_text()) if AUDIT_PATH.exists() else []
    audit.append({
        "run_id": run_id,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "source": results.get("source"),
        "collected": results.get("collected", 0),
        "validated": results.get("validated", 0),
        "stored": results.get("stored", 0),
        "skipped": results.get("skipped", 0),
        "errors": results.get("errors", []),
        "warnings": results.get("warnings", []),
    })
    AUDIT_PATH.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n")
```

**`audit_report.json` already exists in the project** — this pattern should match its existing schema.

### Error Categories

| Category | Action | Log level |
|----------|--------|-----------|
| Network timeout | Retry 3x, then skip with `WARN` | WARN |
| HTTP 4xx from NEC | Log URL + status, skip | ERROR |
| Validation failure (FATAL) | Skip record, log field + value | ERROR |
| Validation failure (WARN) | Store with `_incomplete: true` | WARN |
| PDF parse failure | Log PDF path, skip | WARN |
| Data mismatch (PDF vs JSON) | Log both values, flag for review | CRITICAL |

### Mismatch Escalation (헌법 제5조)

When a mismatch is detected between PDF and stored JSON:

1. Log mismatch to `audit_report.json` with both values and source
2. If `--fix` flag: overwrite JSON with PDF value (PDF = primary source per `poll_audit_pdf.py`)
3. Trigger full re-audit of same region: `find_related_polls(region)` → re-verify all

---

## 6. Cross-Validation Strategies: NEC API vs News vs NESDC

### Source Hierarchy (already in CLAUDE.md, reaffirmed here)

```
NEC API (apis.data.go.kr) > NESDC PDF > NESDC HTML > Official news > Named Wikipedia
```

### Cross-Validation Patterns

**Pattern 1: Candidate party affiliation (dual-source)**

`scripts/verify_mayors_dual_source.py` already implements this. The pattern:

```python
def cross_validate_party(candidate_id: str, nec_party: str, news_party: str) -> dict:
    if nec_party == news_party:
        return {"status": "confirmed", "party": nec_party, "confidence": "HIGH"}
    elif nec_party and not news_party:
        return {"status": "unverified", "party": nec_party, "confidence": "MEDIUM"}
    elif nec_party != news_party:
        return {"status": "conflict", "nec": nec_party, "news": news_party, "confidence": "LOW"}
```

**Pattern 2: Poll registration number validation**

Every stored poll must have a NESDC registration number. Validate it exists in NESDC:

```python
VALID_REG_PATTERN = re.compile(r"^\d{7}$")  # 7-digit NESDC reg numbers

def validate_registration_number(reg_no: str, nesdc_ids: set[str]) -> bool:
    if not VALID_REG_PATTERN.match(str(reg_no)):
        return False
    return str(reg_no) in nesdc_ids
```

**Pattern 3: Support percentage plausibility check**

```python
def validate_poll_totals(candidates: list[dict]) -> list[str]:
    warnings = []
    total = sum(c.get("support", 0) for c in candidates)
    if total > 105 or total < 50:
        warnings.append(f"total_support_implausible:{total:.1f}%")
    for c in candidates:
        if c.get("support", 0) > 100:
            warnings.append(f"candidate_support_over_100:{c['name']}")
    return warnings
```

**Pattern 4: Temporal consistency**

Poll `end_date` must not be after today. `start_date` must be before `end_date`. `end_date` before election day (2026-06-03):

```python
from datetime import date

ELECTION_DAY = date(2026, 6, 3)

def validate_poll_dates(poll: dict) -> list[str]:
    errors = []
    try:
        start = date.fromisoformat(poll["start_date"])
        end = date.fromisoformat(poll["end_date"])
        today = date.today()
        if end > today:
            errors.append(f"end_date_in_future:{poll['end_date']}")
        if start > end:
            errors.append("start_after_end")
        if end > ELECTION_DAY:
            errors.append("end_after_election_day")
    except (KeyError, ValueError) as e:
        errors.append(f"date_parse_error:{e}")
    return errors
```

---

## Implementation Priority for 70+ Unprocessed PDFs

1. Run `scripts/classify_poll_pdfs.py` to identify which PDFs are result tables vs other attachments
2. Run `scripts/poll_audit_pdf.py --fix` for all PDFs that match existing polls.json records
3. For PDFs with no matching polls.json entry: run `scripts/reparse_pdfs.py` or create it following batch pattern above
4. Write results to `data/polls/audit_report.json` with `source: "pdf_batch_2026-03-29"`
5. Cross-validate registration numbers against NESDC live list

---

## Sources

- [Building Resilient Data Pipelines: Idempotency (PyCon US 2025)](https://us.pycon.org/2025/schedule/presentation/68/)
- [Idempotency in Data Pipelines — Airbyte](https://airbyte.com/data-engineering-resources/idempotency-in-data-pipelines)
- [ETL Best Practices 2026 — OneUptime](https://oneuptime.com/blog/post/2026-02-13-etl-best-practices/view)
- [pdfplumber GitHub](https://github.com/jsvine/pdfplumber)
- [Comparative Study of PDF Parsing Tools (arxiv 2024)](https://arxiv.org/html/2410.09871v1)
- [Comparing 6 Rule-based PDF Parsing Frameworks](https://www.ai-bites.net/comparing-6-frameworks-for-rule-based-pdf-parsing/)
- [Data Validation Framework in Python — OneUptime](https://oneuptime.com/blog/post/2026-01-25-data-validation-framework-python/view)
- [APScheduler PyPI](https://pypi.org/project/APScheduler/)
- Project source: `scripts/nesdc_poll_pipeline.py`, `scripts/poll_audit_pdf.py`, `scripts/shared.py`
