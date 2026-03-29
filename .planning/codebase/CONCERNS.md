# Codebase Concerns

**Analysis Date:** 2026-03-29

---

## Tech Debt

**Hardcoded poll support numbers in `js/data.js`:**
- Issue: 17 `support:` values (e.g., `support: 38.5`) are embedded inline inside `js/data.js` lines 1529–1545 for superintendent candidates. These are unverified estimates, not NESDC-registered survey results.
- Files: `js/data.js` lines 1529–1545
- Impact: Violates constitutional rule §2 (LLM-generated/unverified numbers must not appear in data). These values are currently displayed in the 교육감 tab.
- Fix approach: Remove `support` fields from the inline object; read support values exclusively from `data/polls/polls.json` keyed by candidate name.

**`candidates_governor_mock.json` still in place:**
- Issue: `data/candidates/candidates_governor_mock.json` is generated data (mode: "research", dated 2026-03-11). Code in `js/data.js:1790` has a `mock fallback` path that loads it if external JSON fails.
- Files: `data/candidates/candidates_governor_mock.json`, `js/data.js` line 1790
- Impact: On data-load failure, mock/research data is silently substituted for real data. Users see stale or unverified candidate lists without any warning.
- Fix approach: Remove the mock fallback path; display an explicit "데이터 로딩 실패" message instead of silently substituting mock data.

**Stale duplicate files committed to repo:**
- Issue: Four ghost files exist alongside their active counterparts: `js/app-state 2.js`, `js/router 2.js`, `js/search 2.js`, `js/sidebar 2.js`. None are referenced by `index.html` but they are untracked and visible in `git status`.
- Files: `js/app-state 2.js`, `js/router 2.js`, `js/search 2.js`, `js/sidebar 2.js`
- Impact: Confuses future editors about which file is canonical; risks accidental edits to the wrong copy.
- Fix approach: Delete or `.gitignore` the " 2." copies.

**CSS cache-buster version mismatch:**
- Issue: `css/style.css` is versioned `v=1774589813` while all JS files use `v=1774711234`. These are different timestamps.
- Files: `index.html` line 42 vs lines 872–905
- Impact: After CSS-only deploys, stale JS cache or vice versa may deliver mismatched assets to users.
- Fix approach: Apply a single unified build-time version stamp across all assets, or use content-hash based cache busting.

**No build/bundle step — all JS served raw:**
- Issue: 20+ unminified JS files (total ~1.1 MB uncompressed) are loaded individually. The largest are `js/data.js` (216 KB), `js/map.js` (196 KB), `js/tabs/news-tab.js` (96 KB).
- Files: `index.html` lines 872–905
- Impact: On slow mobile connections (~1–2 Mbps), initial JS parse time is significant. No tree-shaking or dead-code elimination.
- Fix approach: Add a bundler (esbuild/rollup) step in CI; Cloudflare Pages can serve gzip/brotli compressed bundles automatically.

---

## Security Considerations

**No `_headers` file — missing HTTP security headers:**
- Issue: No `_headers` or `_routes.json` file is present, so Cloudflare Pages serves default headers with no `Content-Security-Policy`, `X-Frame-Options`, or `X-Content-Type-Options`.
- Files: Not present (expected at `/_headers`)
- Impact: Clickjacking risk; also, no CSP means any injected third-party script would execute freely.
- Fix approach: Add a `_headers` file with at minimum `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, and a restrictive `Content-Security-Policy`.

**Analytics endpoint hardcoded without authentication:**
- Issue: `ANALYTICS_ENDPOINT = 'https://election-news-proxy.ksca1010.workers.dev/analytics'` in `js/app.js` line 11 is a public Cloudflare Worker URL. It accepts unauthenticated POST requests.
- Files: `js/app.js` lines 11–21
- Impact: Anyone can spam the analytics endpoint with arbitrary payloads. No rate limiting or validation is visible in client code.
- Fix approach: Add a shared-secret header or Cloudflare Turnstile challenge on the Worker side.

**Microsoft Clarity script injected unconditionally:**
- Issue: `index.html` lines 24–30 load Microsoft Clarity (session recording) without a cookie consent gate.
- Files: `index.html` lines 24–30
- Impact: Possible GDPR/PIPA (개인정보보호법) compliance issue for Korean users. Session recordings may capture PII from search inputs.
- Fix approach: Gate Clarity initialization behind explicit user consent, or add a privacy notice banner.

**Cloudflare beacon token exposed in HTML source:**
- Issue: `data-cf-beacon='{"token": "6cb7b0e87bf1475799a9d177f9d54315"}'` is visible in `index.html` line ~905. While Cloudflare Web Analytics tokens are designed to be public, the token is tied to the account and should be rotated if the repo is made public.
- Files: `index.html` (beacon script line)
- Impact: Low — token can be scraped to inject fake analytics for the account.

---

## Performance Bottlenecks

**9.7 MB `historical_elections_full.json` loaded on history tab:**
- Issue: `data/static/historical_elections_full.json` is 9.7 MB uncompressed. It is fetched when the user opens the history tab via `ElectionData.loadMayorHistory?.()`.
- Files: `data/static/historical_elections_full.json`, `js/data.js`
- Impact: 3–10s delay on mobile. Even with gzip compression (~70% reduction) this is ~3 MB over the wire.
- Fix approach: Split into per-region or per-election-year files and lazy-load only the needed slice. Or paginate / virtualize the history tab table.

**5.4 MB `council_history.json` loaded eagerly:**
- Issue: `data/council_history.json` (5.4 MB) is fetched in the parallel init block alongside other datasets.
- Files: `data/council_history.json`, `js/app.js` lines 80–92
- Impact: Blocks `Promise.allSettled` resolution during app startup, delaying first meaningful interaction.
- Fix approach: Defer to on-demand fetch when the 의원 지역구 tab is first activated.

**All 20+ JS files loaded with `defer` but no lazy-loading:**
- Issue: Every tab renderer (7 files) and utility module is loaded on initial page load regardless of which tab the user visits.
- Files: `index.html` lines 872–905
- Impact: Unnecessary parse time (~400–600 KB of tab renderers the user may never open).
- Fix approach: Convert tab renderers to dynamic `import()` calls triggered on tab activation.

**Debug `console.log` left in production code:**
- Issue: `js/map.js` has at least 2 `console.log` calls including `[BasicCouncil] distGroups:` at line 2571. `js/data.js` has 9 `console.log` calls.
- Files: `js/map.js` line 2571, `js/data.js` (9 occurrences)
- Impact: Minor — pollutes browser console; may log large arrays in production.
- Fix approach: Remove or gate behind a `DEBUG` flag.

---

## Fragile Areas

**`js/data.js` 교육감 inline candidate block (lines 1529–1545):**
- Files: `js/data.js` lines 1529–1545
- Why fragile: Support percentages are hardcoded and will become incorrect as actual polls are published. No source metadata or date is attached.
- Safe modification: Always update via `data/polls/polls.json` and `data/candidates/superintendent.json`. Do not edit the inline block directly.
- Test coverage: None — no automated check verifies inline support values against polls.json.

**Publication ban logic split across two modules:**
- Files: `js/election-calendar.js` line 68, `js/tabs/poll-tab.js` line 486
- Why fragile: `isPublicationBanned()` is defined in `election-calendar.js` but poll-tab guards it with `typeof ElectionCalendar !== 'undefined'`. If script load order breaks, polls render during the ban period.
- Safe modification: Never refactor `ElectionCalendar` export name without verifying all `typeof ElectionCalendar` call sites.

**`window.*` globals for cross-module data sharing:**
- Issue: `window.LocalMediaPool`, `window.LocalMediaRegistry`, `window.REGIONAL_ISSUES`, `window.DerivedIssuesData` are set at runtime in `js/app.js` and read by other modules.
- Files: `js/app.js` lines 116–120, `js/data.js` lines 1846–1856
- Why fragile: Race condition possible if a module reads these globals before `init()` populates them. Currently masked by `defer` attribute ordering, but any reordering breaks silently.
- Fix approach: Pass loaded data through explicit function parameters or a shared state module (`js/app-state.js`).

---

## Data Integrity Risks

**Mock/research candidate data substituted silently on load failure:**
- See Tech Debt section above. The fallback from `data/candidates/candidates_governor_mock.json` violates constitutional rule §2.

**Superintendent `support` values not linked to NESDC registration numbers:**
- Issue: The 17 inline support values in `js/data.js` have no `pollId`, `orgName`, or `registrationNo` fields.
- Files: `js/data.js` lines 1529–1545
- Impact: Violates rule §3 (NESDC-registered surveys only, registration number required).

**`data/polls/gemini_parse_results.json` is a 1-line empty file:**
- Issue: `data/polls/gemini_parse_results.json` has only 1 line of content. If downstream scripts consume it expecting parsed results, they will receive empty/null data.
- Files: `data/polls/gemini_parse_results.json`
- Impact: Possibly stale artifact; if scripts depend on it, PDF-derived poll data is silently missing.

---

## Missing Critical Features

**No `_headers` Cloudflare Pages config for security/CORS:**
- Problem: Security headers (CSP, X-Frame-Options) and any CORS rules must be set via `_headers`. The file does not exist.
- Blocks: Hardening public-facing deployment before election day traffic spike.

**Basic council (기초의원) map shows palette colors, not party colors:**
- Problem: `js/map.js` line 2556 has a `TODO` note: party color for 기초의원 당선자 is not yet connected. A random color palette is used instead.
- Files: `js/map.js` line 2556
- Blocks: Meaningful visual analysis of basic council election results.

**No automated test for `isPublicationBanned()` boundary:**
- Problem: The 5/28 00:00 ~ 6/3 18:00 KST boundary is a legal requirement. There are no unit tests verifying the boundary conditions (23:59:59 allowed, 00:00:00 banned, 18:00:00 exact is allowed).
- Files: `js/election-calendar.js` lines 63–90
- Risk: A one-character off-by-one error causes a legal violation.

---

## Deployment Concerns

**Typo in production domain name:**
- Issue: The deployed URL is `https://korea-local-eletion.pages.dev` (missing 'c' in 'election'). This is baked into `index.html` Open Graph tags (`og:url`) and `package.json` (`name`).
- Files: `index.html` line 15, `package.json` line 2
- Impact: Cannot be changed without migrating the Cloudflare Pages project. Users sharing the URL with the typo will get broken links if the project is ever renamed.

**`deploy.sh` excludes large GeoJSON files but no automated CI verification:**
- Issue: The deploy script manually excludes 6 large files. There is no CI step verifying that the final deployed artifact does not accidentally include them or that total bundle size stays under Cloudflare's 25 MB per-file limit.
- Files: `deploy.sh`
- Impact: Accidental inclusion of a 25 MB+ GeoJSON would cause a deploy failure.

**No staged/preview deploy pipeline:**
- Issue: `package.json` has `deploy:preview` but there is no automated CI workflow file visible in the root. Deploys appear to be manual.
- Files: `package.json` `deploy:preview` script
- Impact: No automated smoke tests run before production changes go live.

---

## Test Coverage Gaps

**No test files found for any JS module:**
- What's not tested: All business logic in `js/election-calendar.js`, `js/data.js`, `js/tabs/*.js`
- Files: Entire `js/` tree
- Risk: Regressions in date boundary logic (publication ban), candidate sort order, and data loading are undetectable until users report them.
- Priority: High — especially for `isPublicationBanned()` and `getCandidateSortMode()` which have legal implications.

**Poll data regression scripts exist but are Node-based, not CI-gated:**
- What's not tested: `npm run check:polls` and `npm run check:all` exist as manual quality gates but no CI config runs them automatically.
- Files: `package.json` scripts section
- Risk: Data regressions slip through between manual runs.
- Priority: Medium.

---

*Concerns audit: 2026-03-29*
