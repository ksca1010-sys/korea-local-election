---
plan: 03-01
phase: 03-performance-features
subsystem: data-loading, build-tooling, code-quality
tags: [lazy-loading, esbuild, eslint, performance, build]
dependency_graph:
  requires: []
  provides: [DataLoader.loadLazy, esbuild-build, eslint-zero-errors]
  affects: [js/data-loader.js, js/tabs/history-tab.js, js/tabs/council-tab.js, build.js, deploy.sh]
tech_stack:
  added: [esbuild@0.27.4]
  patterns: [lazy-fetch-with-cache, outbase-preserve-paths]
key_files:
  created:
    - build.js
    - eslint.config.mjs
  modified:
    - js/data-loader.js
    - js/data.js
    - js/tabs/history-tab.js
    - js/tabs/council-tab.js
    - js/issue_engine.js
    - package.json
    - deploy.sh
decisions:
  - DataLoader.loadLazy uses ROOT_FILES list for data/ root files vs data/static/ base
  - eslint.config.js renamed to .mjs to avoid MODULE_TYPELESS_PACKAGE_JSON warning
  - esbuild outbase='.' preserves js/ directory prefix in .deploy_dist/
  - ESLint warnings (83) left as-is; only errors suppressed (0 errors achieved)
metrics:
  duration: ~7 minutes
  completed: 2026-03-29
  tasks: 2
  files: 8
---

# Phase 03 Plan 01: 대용량 JSON 지연 로딩 + esbuild 번들 + ESLint 0건 Summary

**One-liner:** `DataLoader.loadLazy()` adds 15MB lazy-load for history/council JSON; esbuild minifies 25 JS files to `.deploy_dist/` (47% smaller app.js); ESLint 0 errors achieved by adding 8 missing globals and fixing 4 regex escape issues.

## What Was Built

### QUAL-03 + QUAL-04: Lazy Loading

- **`js/data-loader.js`**: Added `loadLazy(filename)` async function with cache+fetch pattern. Uses `ROOT_FILES` list to route `council_history.json` (data/ root) vs `data/static/` base path. Exported in return object.
- **`js/data.js`**: Added `ElectionData.historicalElectionsFull: null` placeholder for lazy assignment.
- **`js/tabs/history-tab.js`**: Converted `render()` to `async`. On first call, loads `historical_elections_full.json` (9.7MB) via `DataLoader.loadLazy` and assigns to `ElectionData.historicalElectionsFull`.
- **`js/tabs/council-tab.js`**: Replaced `_historyCache` + direct `fetch('data/council_history.json?v=...')` with `DataLoader.loadLazy('council_history.json')`. Removed the local cache object (DataLoader cache is reused).

**Result:** `historical_elections_full.json` (9.7MB) and `council_history.json` (5.4MB) are NOT fetched at app startup — only on first tab visit.

### QUAL-05: esbuild Build

- **`build.js`**: Node script that minifies all 25 JS files and 1 CSS file using esbuild `bundle: false, minify: true, target: es2020`. Uses `outbase: '.'` to preserve `js/` directory structure in `.deploy_dist/`.
- **`package.json`**: Added `"build": "node build.js"` script and `esbuild@^0.27.4` devDependency.
- **`deploy.sh`**: Added `node build.js` step between rsync and wrangler deploy.

**Result:** `npm run build` succeeds in ~0.1s. `app.js` minified from 40KB to 21KB (47% reduction).

### QUAL-06: ESLint 0 Errors

- **`eslint.config.js` → `eslint.config.mjs`**: Renamed to eliminate `MODULE_TYPELESS_PACKAGE_JSON` Node warning.
- **`eslint.config.mjs`**: Added 8 missing global declarations: `AppState`, `Sidebar`, `Router`, `SearchModule`, `ElectionViews`, `DistrictMapView`, `isMergedGwangjuJeonnam`, `getMergedDisplayName`. Updated `no-unused-vars` varsIgnorePattern to cover all new globals.
- **`js/data.js:2590`**: Added `eslint-disable-next-line no-control-regex` for null-char PDF filter regex (`/\x00/`).
- **`js/issue_engine.js`**: Fixed 3 `no-useless-escape` errors — changed `\-` to `-` in character classes at lines 398, 573, 574, 632.

**Result:** `npm run lint` exits with code 0, 0 errors (83 warnings remain — acceptable).

## Verification Results

```
QUAL-03/04:
✓ grep -n "loadLazy" js/data-loader.js → 3 matches (definition, error log, export)
✓ grep -n "loadLazy.*historical_elections_full" js/tabs/history-tab.js → 1 match
✓ grep -n "loadLazy.*council_history" js/tabs/council-tab.js → 1 match
✓ grep -c "fetch.*council_history" js/tabs/council-tab.js → 0

QUAL-05:
✓ npm run build → exit 0, Done in 0.1s
✓ ls .deploy_dist/js/app.js → exists, 21183 bytes (vs 40755 original)
✓ grep "esbuild" deploy.sh → matches

QUAL-06:
✓ npm run lint → exit 0
✓ 83 problems (0 errors, 83 warnings)
✓ test -f eslint.config.mjs → exists
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1: Lazy Loading | 95a1f25 | feat(03-01): add DataLoader.loadLazy + lazy-load historical_elections_full / council_history |
| 2: Build + ESLint | cb48ef0 | feat(03-01): esbuild minify build + ESLint 0 errors |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] council_history.json path routing in loadLazy**
- **Found during:** Task 1
- **Issue:** `council_history.json` lives in `data/` root, not `data/static/` (DataLoader's BASE). Calling `loadJSON()` directly would construct `data/static/council_history.json` — a 404.
- **Fix:** Updated `loadLazy` to check a `ROOT_FILES` list and use `data/${filename}` URL directly for files not in `data/static/`.
- **Files modified:** `js/data-loader.js`
- **Commit:** 95a1f25

**2. [Rule 2 - Missing functionality] `ElectionData.historicalElectionsFull` property missing**
- **Found during:** Task 1
- **Issue:** `history-tab.js` needed to assign the lazy-loaded data to `ElectionData.historicalElectionsFull`, but this property didn't exist in `data.js`.
- **Fix:** Added `historicalElectionsFull: null` property to ElectionData (logic property, no data values).
- **Files modified:** `js/data.js`
- **Commit:** 95a1f25

**3. [Rule 1 - Bug] eslint.config.js needs .mjs extension**
- **Found during:** Task 2
- **Issue:** `eslint.config.js` with ESM `import` syntax triggered `MODULE_TYPELESS_PACKAGE_JSON` warning and required reparsing.
- **Fix:** Renamed to `eslint.config.mjs` as the plan recommended.
- **Commit:** cb48ef0

## Known Stubs

None — no hardcoded empty values or placeholder text introduced. `ElectionData.historicalElectionsFull: null` is an intentional lazy-load sentinel (null → populated on first tab visit).

## Self-Check: PASSED

- FOUND: js/data-loader.js
- FOUND: build.js
- FOUND: eslint.config.mjs
- FOUND: .deploy_dist/js/app.js
- FOUND: commit 95a1f25
- FOUND: commit cb48ef0
