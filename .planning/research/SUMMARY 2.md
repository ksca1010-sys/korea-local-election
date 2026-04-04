# Research Summary — 선거정보지도 (Korea Local Election Map)

**Synthesized:** 2026-03-29
**Sources:** 01-bug-data-integrity.md, 02-pipeline-automation.md, 03-quality-security.md, 04-feature-additions.md

---

## Research Area Summaries (4 bullets)

- **Bug & Data Integrity:** Two concrete bugs exist in prod (`data.js` lines 1529-1545: LLM-generated `support` values without `pollSource`; line 1790: stale misleading comment); the codebase lacks automated guards to prevent future LLM-sourced numbers from reaching the UI.
- **Pipeline Automation:** The NESDC/NEC collection pipeline is structurally sound (state.json, retry logic, audit log) but 70+ PDFs remain unprocessed; the batch PDF audit script and idempotent upsert pattern are the missing pieces.
- **Quality & Security:** No `_headers` file means zero HTTP security headers in prod; Clarity fires before consent (PIPA legal risk); `historical_elections_full.json` (9.7 MB) loads eagerly; 20+ unminified JS files inflate LCP.
- **Feature Additions:** URL sharing, .ics calendar export, and skeleton screens are low-effort/high-value; the poll trend chart needs a real time axis; election-night live results require a Cloudflare Worker proxy (no public NEC live API exists).

---

## Top 5 Cross-Cutting Findings

### 1. Data source trust is the central risk across every area
The LLM-generated `support` fields (bug area), unverified PDFs (pipeline), PIPA consent for behavioral data (quality), and the absence of a real-time NEC API (features) all trace back to the same root issue: the project cannot automatically distinguish authoritative data from estimated or unverified data. The `pollSource` enforcement pattern (bug research) and the `_meta.source` convention (pipeline research) address this at the data layer; both must be adopted project-wide.

### 2. Pre-deployment validation is entirely manual today
No CI step, no schema validator, no `_headers` file, no bundle step. Adding `audit_numeric_fields.py` + `_headers` + esbuild to the deploy pipeline addresses data correctness, security, and performance in a single infra pass. These three are independent and can be parallelized.

### 3. Performance and compliance share the same root cause (Clarity)
The Clarity analytics snippet causes both a PIPA compliance violation (fires before consent) and an unnecessary JS parse cost on initial load. Gating Clarity behind a consent banner solves both simultaneously. This is the single change with the widest benefit-to-effort ratio.

### 4. The pipeline is idempotent in design but incomplete in coverage
`nesdc_poll_pipeline.py` has the correct state.json pattern, but the 70+ unprocessed PDFs represent a gap in coverage — not a design flaw. The batch PDF processing pass is a one-time catch-up, after which the incremental pipeline handles new PDFs automatically. This catch-up is blocking the poll audit tab from showing complete data.

### 5. Election-night features have a hard deadline
The Cloudflare Worker proxy for live results must be built and tested by 2026-05-26 (one week before election day). All other features are date-flexible. If the Worker is deprioritized past 5/26, Option C (manual JSON entry) is the fallback — it should be designed into the UI regardless.

---

## Key Risks / Blockers

| Risk | Severity | Mitigation |
|------|----------|------------|
| LLM `support` values in prod (`data.js:1529-1545`) | CRITICAL | Remove immediately; enforce `pollSource` sibling rule |
| PIPA violation: Clarity fires without consent | HIGH | Consent gate before Clarity loads; launch before traffic spike |
| 70+ unprocessed PDFs — poll data incomplete | HIGH | Batch PDF audit script (`poll_audit_pdf.py --batch`) |
| No security headers (`_headers` missing) | HIGH | 30-min fix; unblock CSP, X-Frame-Options |
| Election-night Worker not built by 5/26 | HIGH | Hard deadline; begin Week of 5/19 at latest |
| `historical_elections_full.json` blocks mobile LCP | MEDIUM | Lazy-load on tab open; long-term: split by region |
| Stale comment at `data.js:1790` creates false trust | LOW | Fix comment; no behavioral change needed |

---

## Recommended Implementation Order

### Phase 1 — Immediate fixes (this week, before next deploy)

1. **Remove LLM support values** from `data.js:1529-1545`; update `overview-tab.js` and `poll-tab.js` to handle `support === undefined` gracefully.
2. **Add `_headers` file** to project root with X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, and CSP.
3. **Gate Clarity behind consent banner** using `localStorage` + Clarity ConsentV2 API.
4. **Fix stale comment** at `data.js:1790`.

Rationale: Items 1 and 3 are legal/compliance risks. Item 2 is 30 minutes. All four are independent.

### Phase 2 — Data completeness (next sprint)

5. **Batch PDF audit**: run `poll_audit_pdf.py --batch` against all 70+ PDFs in `data/polls/pdfs/`; write results to `audit_report.json`.
6. **Add `audit_numeric_fields.py`** and wire into `data_health_check.py` pre-deploy step.
7. **Enforce `pollSource` sibling rule** in `data-loader.js` (dev-only `validateCandidates()` guard).
8. **Add `.planning/bugs/OPEN.md`** bug register with B01/B02 entries; adopt fix commit format.

Rationale: Items 5-7 close the data integrity gap; item 8 systematizes future bug tracking.

### Phase 3 — Performance + low-effort features (rolling)

9. **Lazy-load `historical_elections_full.json`** in `history-tab.js` with in-memory cache.
10. **esbuild minification** in deploy pipeline (`npm run build`; format: iife to preserve globals).
11. **Copy URL button** ("링크 복사") in info panel header — `navigator.clipboard` with execCommand fallback.
12. **Skeleton screens** for tab content — shimmer CSS + `renderSkeletonTab()` helper.
13. **.ics calendar export** — vanilla JS RFC 5545, wired to `election-calendar.js` DATES constants.
14. **Poll trend chart real time axis** — add `chartjs-adapter-date-fns` CDN; switch to `type: 'time'` scale with `spanGaps: false`.
15. **Mobile swipe-to-dismiss panel** — touch event handler + drag handle CSS.

Rationale: Items 11-15 are independent features; order within Phase 3 is by effort (low to high).

### Phase 4 — Election-night (must start by 2026-05-19)

16. **Build Cloudflare Worker proxy** polling `info.nec.go.kr` every 60s during election night window (18:00-04:00 KST).
17. **Test Worker** against 2022 archived data.
18. **Activate browser polling** only when `ElectionCalendar.getCurrentPhase() === 'election_night'`; fallback to manual JSON entry path if Worker fails.

Rationale: Hard deadline June 3. Worker must be live-tested before publication-ban period (5/28).

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Bug locations | HIGH | Specific line numbers confirmed from code review |
| Pipeline architecture | MEDIUM | Patterns verified; NEC/NESDC API behavior confirmed from project code |
| Security headers | HIGH | Cloudflare Pages docs verified |
| PIPA compliance | MEDIUM | Based on PIPA text + PIPC guidelines; not a legal opinion |
| esbuild migration | MEDIUM | Globals pattern needs module audit before bundling |
| Election-night API | HIGH (negative) | Confirmed: no public live NEC API exists |
| Feature implementations | HIGH | MDN + Chart.js official docs; RFC 5545 is stable |

**Overall confidence: MEDIUM-HIGH**

**Gaps requiring validation before implementation:**
- Does `info.nec.go.kr` block non-browser requests from a Worker? (Test with realistic UA headers)
- Does adding `chartjs-adapter-date-fns` CDN URL require CSP update? (Yes — add `cdn.jsdelivr.net` to `script-src` in `_headers`)
- PIPA consent UX: consult Korean privacy lawyer before 5/28 traffic spike
- esbuild + existing window globals: module audit needed before Phase 3 item 10
