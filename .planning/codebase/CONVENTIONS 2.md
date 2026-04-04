# Coding Conventions

**Analysis Date:** 2026-03-29

## Module Pattern

All JS modules use the IIFE (Immediately Invoked Function Expression) revealing module pattern. Every module file exports a single `const` that holds the public API.

```javascript
const ModuleName = (() => {
    // private functions and state
    function _privateHelper() { ... }
    function publicMethod() { ... }
    return { publicMethod };
})();
```

Modules are declared globally (no ES module `import/export`). Each module is registered as a global in `eslint.config.js`.

## Naming Patterns

**Files:**
- JS modules: `kebab-case.js` (e.g., `election-calendar.js`, `data-loader.js`)
- Tab renderers: `kebab-case-tab.js` under `js/tabs/` (e.g., `poll-tab.js`, `candidate-tab.js`)
- Python scripts: `snake_case.py` (e.g., `health_check.py`, `data_health_check.py`)
- Node scripts: `snake_case.js` or `kebab-case.js` in `scripts/`
- Data files: `snake_case.json` under `data/` (e.g., `mayor_candidates.json`, `council_seats.json`)

**Functions:**
- Public (exported): `camelCase` (e.g., `render`, `buildSelection`, `getKST`)
- Private (internal): `_camelCase` with leading underscore (e.g., `_normalizeKeyword`, `_calcConsensusTrend`, `_buildEmptyPollView`)
- Event handlers: `setupXxx` or `handleXxx` (e.g., `setupFilterButtons`, `setupMobileFilterSheet`)

**Variables:**
- Regular: `camelCase`
- Constants (module-level): `SCREAMING_SNAKE_CASE` (e.g., `NEWS_PROXY_BASE`, `CACHE_TTL`, `PANEL_STAGES`)
- Date constants: `DATES.CONSTANT_NAME` inside an object (e.g., `DATES.ELECTION_DAY_START`)

**Classes / Constructors:**
- PascalCase (e.g., `HealthCheck`, `ElectionData`)

## Korean vs English in Code

**Korean is used for:**
- All comment text explaining business logic (e.g., `// 세대 카운터: 지역/선거유형 전환 시 이전 비동기 결과를 무시`)
- String literals that are user-visible (election type labels, region names, UI strings)
- JSON data field values
- Docstrings in Python scripts
- Error/warning messages in health checks

**English is used for:**
- All variable names, function names, constant names
- JSON data field keys (e.g., `regionKey`, `electionType`, `candidateName`)
- HTML element IDs and CSS class names
- Module names (`ElectionData`, `MapModule`, `PollTab`)
- Technical comments about code structure (e.g., `// Layer 1: 시간 기준` headers use mixed)

**Mixed pattern in section headers:**
```javascript
// ─── Layer 1: 시간 기준 ───
// ── Analytics ──
```

## Comment Patterns

**File headers** — every JS file starts with a banner:
```javascript
// ============================================
// 6.3 전국지방선거 인터랙티브 선거 정보 지도
// Module Name — Purpose
// ============================================
```

**Section dividers** — used inside modules to separate logical groups:
```javascript
// ── Section Name ──
// ─── Layer Name ───
```

**Inline comments** — Korean business logic explanations directly above relevant lines:
```javascript
// KST 기준 cutoff 계산 (CLAUDE.md: 모든 날짜 비교는 getKST 사용)
const kstNow = ElectionCalendar.getKST().getTime();
```

**JSDoc** — used selectively for shared utility functions in `js/utils.js`:
```javascript
/**
 * 비침투적 토스트 알림 (자동 소멸)
 * @param {string} message - 표시할 메시지
 * @param {'info'|'warn'|'error'} type - 알림 유형
 */
function showToast(message, type = 'info', duration = 4000) { ... }
```

**No JSDoc** on most tab/module functions — inline Korean comments serve as documentation.

**CLAUDE.md references in comments** — when a rule from CLAUDE.md is enforced in code, the comment cites it:
```javascript
// CLAUDE.md: 모든 날짜 비교는 getKST 사용
```

## Data Structure Conventions

**JSON data files** always include a `_meta` (or `meta`) key with `lastUpdated`:
```json
{ "_meta": { "lastUpdated": "2026-03-25" }, ... }
```

**Candidate status** uses uppercase string constants: `NOMINATED`, `DECLARED`, `EXPECTED`, `RUMORED`, `WITHDRAWN`

**Election type keys** use English camelCase strings: `governor`, `mayor`, `superintendent`, `byElection`

**Region keys** use lowercase English: `seoul`, `busan`, `daegu`, `gyeonggi`

**Poll result objects** follow this shape:
```json
{ "candidateName": "...", "support": 42.1 }
```

**Survey method objects**:
```json
{ "sampleSize": 1000, "marginOfError": 3.1 }
```

## Error Handling Pattern

Defensive checks before accessing external modules:
```javascript
if (typeof ElectionData === 'undefined') return;
const module = (typeof SomeModule !== 'undefined' && SomeModule.method)
    ? SomeModule.method() : fallback;
```

Async errors are caught with `console.warn` — not `console.error` — and execution continues:
```javascript
try { await DataLoader.applyToElectionData(ElectionData); }
catch(e) { console.warn('[init] DataLoader error:', e); }
```

## Linting & Formatting

- **ESLint 9** configured in `eslint.config.js` with `@eslint/js` recommended rules
- **Prettier 3** for formatting JS and CSS
- Key rules enforced: `no-undef: error`, `no-var: warn`, `prefer-const: warn`, `eqeqeq: warn`
- `no-unused-vars` is `warn` with ignore patterns for all exported module globals
- `no-redeclare` is `off` (allows re-declaring module globals across files)
- Scripts directory is excluded from ESLint: `ignores: ["scripts/"]`
- Run: `npm run lint` / `npm run lint:fix` / `npm run format`

---

*Convention analysis: 2026-03-29*
