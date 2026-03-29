# Codebase Structure

**Analysis Date:** 2026-03-29

## Directory Layout

```
korea-local-election/
├── index.html              # Single HTML entry point
├── css/
│   └── style.css           # All styles (single file, ~1 CSS file total)
├── js/
│   ├── app-state.js        # Shared mutable state object (AppState)
│   ├── app.js              # Main orchestrator, bootstraps on DOMContentLoaded
│   ├── data-loader.js      # Loads data/static/*.json and hot-swaps into ElectionData
│   ├── data.js             # ElectionData IIFE — primary data store + async fetchers
│   ├── map.js              # MapModule — D3.js SVG map, 3-level drilldown
│   ├── charts.js           # ChartsModule — Chart.js wrappers
│   ├── sidebar.js          # Sidebar IIFE — left panel, filters, stats, calendar
│   ├── router.js           # Router IIFE — URL hash management
│   ├── search.js           # SearchModule IIFE — full-text search
│   ├── election-calendar.js # ElectionCalendar IIFE — date/phase logic
│   ├── news_filters.js     # NewsFilterConfig — static filter config object
│   ├── nec.js              # NECData IIFE — NEC API helpers
│   ├── derived_issues.js   # Derived issue computation helpers
│   ├── issue_engine.js     # Regional issue scoring engine
│   ├── utils.js            # Shared utility functions
│   ├── tabs/               # 7 tab renderer IIFEs (info panel right side)
│   │   ├── overview-tab.js
│   │   ├── poll-tab.js
│   │   ├── candidate-tab.js
│   │   ├── news-tab.js
│   │   ├── history-tab.js
│   │   ├── council-tab.js
│   │   └── proportional-tab.js
│   └── views/              # Election-type-specific view renderers
│       ├── election-views.js   # Governor/Mayor/Superintendent/ByElection views
│       └── district-map.js     # District list + mini-map view
├── data/
│   ├── static/             # JSON files hot-swapped into ElectionData on init
│   │   ├── regions.json
│   │   ├── sub_regions.json
│   │   ├── parties.json
│   │   ├── historical_elections.json
│   │   ├── historical_elections_full.json
│   │   ├── superintendent_history.json
│   │   ├── superintendents.json
│   │   ├── gallup_national_poll.json
│   │   ├── national_summary.json
│   │   ├── election_type_info.json
│   │   ├── election_meta.json
│   │   ├── election_terms.json
│   │   ├── historical_party_names.json
│   │   ├── council_seats.json
│   │   └── incumbents.json
│   ├── candidates/         # Per-region candidate JSON files
│   ├── polls/              # Poll JSON files + audit PDFs
│   ├── council/            # Council GeoJSON boundary files
│   ├── basic_council/      # Basic council (기초의원) GeoJSON by city
│   ├── news_observations/  # News observation records
│   ├── poll_observations/  # Poll observation records
│   ├── election_overview.json      # Region/election overview text
│   ├── mayor_history.json          # Basic mayor historical results
│   ├── proportional_council.json   # Provincial proportional seats
│   ├── proportional_local_council.json
│   ├── regional_issues.json        # Regional issue keywords
│   ├── local_media_pool.json       # Local media outlet registry
│   ├── local_media_registry.json   # Media filter registry
│   ├── election_stats.json         # District/seat counts
│   ├── nesdc_state.json            # NESDC poll tracker state
│   ├── skorea-provinces-2018-topo.json         # Province TopoJSON
│   ├── skorea-municipalities-2018-topo-changwon.json  # Municipality TopoJSON (patched)
│   └── 서울_행정동_경계_2017_topo.json          # Seoul dong-level TopoJSON
├── scripts/                # Python automation pipeline (data collection, NEC API)
├── worker/                 # Cloudflare Worker source (news proxy / analytics)
├── docs/                   # Project documentation
├── reports/                # Data audit reports
├── prd/                    # Product requirement documents
└── [region]_byulpyo/       # Per-region byeol-pyo (비례 seat allocation) data dirs
```

## Directory Purposes

**`js/`:**
- Purpose: All application JavaScript; no bundler, loaded via `<script defer>`
- Key files: `app.js` (orchestrator), `data.js` (data store), `map.js` (map rendering)

**`js/tabs/`:**
- Purpose: One file per info-panel tab; each is fully isolated
- Pattern: Each exports `render(regionKey, electionType, districtName)` as its primary API
- Key files: `news-tab.js` (1,695 lines, largest), `poll-tab.js` (813 lines)

**`js/views/`:**
- Purpose: Election-type view renderers called when user selects a region on the map
- Key files: `election-views.js` (governor/mayor/superintendent/byelection), `district-map.js` (district list)

**`data/static/`:**
- Purpose: Reference data loaded once at startup via `DataLoader` and hot-swapped into `ElectionData`
- Pattern: Pure JSON, no functions, no computed fields
- These files override in-JS hardcoded defaults in `data.js`

**`data/candidates/`:**
- Purpose: Per-election-type candidate lists, loaded lazily by `ElectionData.loadCandidatesData()`

**`data/polls/`:**
- Purpose: Poll records (JSON) and source PDFs; loaded lazily by `ElectionData.loadPollsData()`

**`data/council/`:**
- Purpose: GeoJSON files for provincial council constituency boundaries, overlaid on map

**`scripts/`:**
- Purpose: Python data pipeline (NEC API scraping, candidate verification, poll ingestion)
- Not served; used by maintainers only

**`worker/`:**
- Purpose: Cloudflare Worker handling news proxy and analytics event ingestion

## Key File Locations

**Entry Points:**
- `index.html`: Single HTML shell; loads all JS via `<script defer>` in dependency order
- `js/app.js` line 876: `DOMContentLoaded` → `App.init()` — actual application boot

**Configuration:**
- `js/app-state.js`: Shared state schema (all current selection fields)
- `js/election-calendar.js`: All date constants (`DATES`), phase logic, poll-ban logic
- `js/news_filters.js`: Static filter configuration for the news tab

**Core Logic:**
- `js/data.js`: `ElectionData` — all data access; add new loaders here
- `js/map.js`: `MapModule` — all map rendering and drilldown logic
- `js/views/election-views.js`: Election-type panel rendering

**Testing:**
- Not detected — no test files or test runner configuration present

## Naming Conventions

**Files:**
- Core modules: `kebab-case.js` (e.g., `data-loader.js`, `election-calendar.js`)
- Tab renderers: `[name]-tab.js` (e.g., `poll-tab.js`, `news-tab.js`)
- View renderers: `[name]-views.js` or `[name]-map.js`
- Duplicate/backup files: `[name] 2.js` — these are stale copies, not active (e.g., `router 2.js`, `sidebar 2.js`)

**JavaScript Modules:**
- All modules use PascalCase IIFE names: `ElectionData`, `MapModule`, `Sidebar`, `SearchModule`, `Router`
- Tab modules: PascalCase + `Tab` suffix: `PollTab`, `NewsTab`, `OverviewTab`

**Data Keys:**
- Region keys: lowercase English slug (`seoul`, `busan`, `gyeonggi`)
- Election types: camelCase (`governor`, `mayor`, `superintendent`, `byElection`, `council`, `localCouncil`, `councilProportional`)
- Party keys: camelCase (`democratic`, `ppp`, `reform`, `independent`)

**JSON Data Files:**
- snake_case filenames: `sub_regions.json`, `historical_elections_full.json`
- GeoJSON/TopoJSON: Korean name or `skorea-[type]-[year]-topo.json`

## Where to Add New Code

**New election-type panel view:**
- Implementation: `js/views/election-views.js` — add a new `render[Type]View()` function
- Wire-up: `js/app.js` `onRegionSelected` dispatch block

**New info-panel tab:**
- Implementation: New file `js/tabs/[name]-tab.js` following the `render(regionKey, electionType, districtName)` pattern
- Registration: Add `<script defer>` in `index.html` before `js/app.js`
- Dispatch: Add case in `App.switchTab()` in `js/app.js`

**New static reference data:**
- Data file: `data/static/[name].json`
- Loader: Add to `DataLoader.loadAll()` file list in `js/data-loader.js`
- Hot-swap: Add mapping in `DataLoader.applyToElectionData()` in `js/data-loader.js`

**New async data (lazy-loaded):**
- Data file: `data/[name].json`
- Loader method: Add `load[Name]()` and `get[Name]()` pair to `ElectionData` in `js/data.js` using the `_cache`/`_promise` pattern
- Call site: Add to `Promise.allSettled` block in `App.init()` in `js/app.js`

**New utility function:**
- Shared helpers: `js/utils.js`

**New map feature:**
- Map rendering: `js/map.js` — all D3/TopoJSON/GeoJSON logic stays here

## Special Directories

**`data/static/`:**
- Purpose: Reference JSON overriding in-code defaults
- Generated: No (manually maintained)
- Committed: Yes

**`data/polls/pdfs/`:**
- Purpose: Source PDFs for poll verification
- Generated: No (downloaded from NESDC)
- Committed: Yes (audit trail)

**`scripts/archive/`:**
- Purpose: Archived/deprecated automation scripts
- Generated: No
- Committed: Yes (history)

**`[region]_byulpyo/` directories (e.g., `seoul_byulpyo/`, `busan_byulpyo/`):**
- Purpose: Per-region proportional seat allocation working data
- Generated: Partially (script output)
- Committed: Yes

**`.planning/`:**
- Purpose: GSD planning documents (this file's directory)
- Generated: Yes (by GSD tooling)
- Committed: Yes

---

*Structure analysis: 2026-03-29*
