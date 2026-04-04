# Architecture

**Analysis Date:** 2026-03-29

## Pattern Overview

**Overall:** Module Revealing Pattern — single-file SPA, no bundler

All JavaScript modules are IIFEs (Immediately Invoked Function Expressions) assigned to global `const` names. They communicate through a shared `AppState` object and direct function calls. No imports/exports, no build step.

**Key Characteristics:**
- Vanilla HTML + CSS + JavaScript; zero framework overhead
- Script load order in `index.html` defines dependency order (data first, UI last)
- Global module references checked via `typeof ModuleName !== 'undefined'` guards
- All modules loaded with `defer` attribute; `App` bootstraps on `DOMContentLoaded`

## Layers

**Data Layer:**
- Purpose: Static election data store and lazy-loading async fetcher
- Location: `js/data.js`, `js/data-loader.js`, `data/static/*.json`, `data/*.json`
- Contains: Party colors, region definitions, sub-region configs, poll/candidate fetchers, calendar data
- Depends on: None (foundational)
- Used by: All other modules via `ElectionData.*`

**Shared State:**
- Purpose: Single mutable object holding current navigation state
- Location: `js/app-state.js`
- Contains: `currentRegionKey`, `currentTab`, `currentDistrictName`, `currentElectionType`, `regionSelected`
- Depends on: Nothing
- Used by: `App`, `Router`, `ElectionViews`, all Tab renderers

**Map Layer:**
- Purpose: D3.js SVG map rendering, zoom, drilldown (province → district → subdistrict)
- Location: `js/map.js` (4,164 lines)
- Contains: Three map modes (`province`, `district`, `subdistrict`), TopoJSON/GeoJSON loading, color rendering, council boundary overlays
- Depends on: `ElectionData`, D3.js, TopoJSON.js, `App` callbacks
- Used by: `App.init()` calls `MapModule.init()`; map click events call `App.onRegionSelected`, `App.onDistrictSelected`

**View Layer:**
- Purpose: Side-panel rendering when a region or election type is selected
- Location: `js/views/election-views.js`, `js/views/district-map.js`
- Contains: Per-election-type renderers (`renderGovernorView`, `renderMayorView`, `renderSuperintendentView`, etc.)
- Depends on: `ElectionData`, `AppState`, `Sidebar`, `OverviewTab`
- Used by: `App.onRegionSelected`, `App.onDistrictSelected`

**Tab Layer:**
- Purpose: Each tab in the right-hand info panel is a self-contained renderer
- Location: `js/tabs/*.js` (7 files)
- Contains: Independent `render(regionKey, electionType, districtName)` entry points
- Depends on: `ElectionData` only; never calls other tab files
- Used by: `App.switchTab()` dispatches to the correct tab module

**Sidebar / UI Shell:**
- Purpose: Left-panel widgets (D-day counter, filter buttons, national stats, election calendar banner)
- Location: `js/sidebar.js` (861 lines)
- Depends on: `ElectionData`, `ChartsModule`
- Used by: `App.init()` calls all `Sidebar.*` setup functions

**Router:**
- Purpose: URL hash routing; encodes `electionType/regionKey/districtName/tab` in `#/`-prefixed hash
- Location: `js/router.js`
- Depends on: `AppState`
- Used by: `App.init()` calls `Router.init()` and `Router.restoreFromHash()`

**Search:**
- Purpose: Full-text search across regions, districts, candidates
- Location: `js/search.js` (895 lines)
- Depends on: `ElectionData`
- Used by: `App.init()` calls `SearchModule.setupSearch()`

**Analytics Proxy:**
- Purpose: Fire-and-forget event tracking to Cloudflare Worker
- Location: Inline in `js/app.js` (`trackEvent` function)
- Endpoint: `https://election-news-proxy.ksca1010.workers.dev/analytics`

## Data Flow

**Map Click → Panel Render:**

1. User clicks province on SVG map
2. `MapModule` fires `App.onRegionSelected(regionKey, electionType)`
3. `App` updates `AppState`, calls `ElectionViews.renderGovernorView(regionKey)`
4. `ElectionViews` reads data via `ElectionData.*`, renders HTML into `#info-panel`
5. `OverviewTab.render()` called immediately; other tabs lazy-loaded on tab switch
6. `Router.updateHash()` encodes state into URL

**Tab Switch:**

1. User clicks tab button
2. `App.switchTab(tabName)` sets `AppState.currentTab`
3. Dispatches to correct module: `PollTab.render()`, `NewsTab.render()`, etc.
4. Tab reads from `ElectionData` (some fetch async JSON on first call)

**App Bootstrap:**

1. `index.html` loads scripts in dependency order via `defer`
2. `App` registers `DOMContentLoaded` listener (`js/app.js` line 876)
3. `App.init()`: theme, `DataLoader.applyToElectionData()`, Sidebar setup, parallel `ElectionData.load*()` calls, `MapModule.init()`, `Router.init()`

**State Management:**

- `AppState` is a plain mutable object; modules read/write it directly
- No reactive system; explicit function calls propagate state changes
- URL hash is the only persistence mechanism (no localStorage for selection state)

## Key Abstractions

**ElectionData (IIFE):**
- Purpose: Central data store; exposes synchronous getters and async loaders
- Location: `js/data.js`
- Pattern: Lazy-load + cache (`_xxxCache` / `_xxxPromise` pairs); `DataLoader` hot-swaps static fields from JSON on init

**Tab Renderers (7 IIFEs):**
- Purpose: Isolated rendering units for each info-panel tab
- Examples: `js/tabs/poll-tab.js`, `js/tabs/news-tab.js`, `js/tabs/overview-tab.js`
- Pattern: Each exports a single `render(regionKey, electionType, districtName)` function; no cross-tab calls

**MapModule (IIFE):**
- Purpose: Three-level drilldown map (province → municipality → subdistrict)
- Location: `js/map.js`
- Pattern: Mode state machine (`currentMapMode`); separate GeoJSON/TopoJSON caches per level

## Entry Points

**Primary Entry:**
- Location: `js/app.js` line 876 (`DOMContentLoaded` → `init()`)
- Triggers: Browser page load, all scripts `defer`-loaded
- Responsibilities: Data loading, module wiring, map init, router init

**URL Routing:**
- Location: `js/router.js` → `restoreFromHash()`
- Triggers: Page load with existing hash, or `popstate` event
- Responsibilities: Restore `AppState` and re-render panel from URL

## Error Handling

**Strategy:** Non-fatal degradation — failures logged, UI shows partial data or empty state

**Patterns:**
- `Promise.allSettled` for parallel data loads; failures collected and shown as toast notification
- `try/catch` wrapping every `Sidebar.*` and `ElectionData.load*` call in `App.init()`
- Each async loader returns `null` on failure; callers guard with `if (!cache)` checks
- Tab renderers render "데이터 준비 중" placeholder text when data is missing

## Cross-Cutting Concerns

**Logging:** `console.warn`/`console.error` with bracketed module prefixes (e.g., `[init]`, `[Overview]`, `[MayorHistory]`)
**Validation:** Input validation done at data-access layer in `ElectionData` getters
**Authentication:** None — fully public read-only application
**Theme:** CSS custom properties toggled via `light-mode` class on `<html>`; `ChartsModule` and `MapModule` re-read CSS vars on toggle

---

*Architecture analysis: 2026-03-29*
