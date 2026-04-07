# Research: Pre-Deployment Quality & Security

**Project:** 알선거 — korea-local-election.pages.dev
**Researched:** 2026-03-29
**Confidence:** MEDIUM-HIGH (Cloudflare docs verified; PIPA analytics specifics LOW)

---

## 1. Cloudflare Pages `_headers` File

### Syntax

Plain text file placed at the **project root** (same directory as `index.html`). Included in the `rsync` copy to `.deploy_dist` automatically.

```
[url-pattern]
  [header-name]: [header-value]
```

Max 100 rules per file. Max 2,000 chars per line. Wildcards supported.

### Recommended `_headers` for this project

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()

/
  Content-Security-Policy: default-src 'self'; script-src 'self' https://www.clarity.ms https://d3js.org https://cdn.jsdelivr.net https://cdnjs.cloudflare.com 'unsafe-inline'; style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data:; connect-src 'self' https://www.clarity.ms https://apis.data.go.kr https://info.nec.go.kr; frame-ancestors 'none'; object-src 'none'
```

**Why no HSTS in `_headers`:** Cloudflare already manages HSTS at the edge via SSL/TLS settings. Setting it in `_headers` too can cause double-header conflicts. Enable it in Cloudflare dashboard → SSL/TLS → Edge Certificates → HSTS instead. Recommended value: `max-age=31536000; includeSubDomains`.

**CSP notes:**
- `'unsafe-inline'` is required because the Clarity snippet and several inline `<script>` blocks are in `index.html`. If you move Clarity to an external file loaded with `defer`, you can tighten this to a nonce or hash-based CSP later.
- `connect-src` must list `apis.data.go.kr` (NEC API) and `www.clarity.ms` (session recording beacons).
- `frame-ancestors 'none'` supersedes `X-Frame-Options` in modern browsers but keep both for older browsers.

**Source:** [Cloudflare Pages Headers docs](https://developers.cloudflare.com/pages/configuration/headers/)

---

## 2. Cache-Busting for Static Assets

### Current State

`index.html` uses a timestamp query string: `css/style.css?v=1774589813`. This is unreliable — some CDNs and proxies strip or ignore query strings.

### Recommended: Content Hash in Filename

Use esbuild's `[hash]` placeholder in `entryNames` to produce `app-[hash].js`. The hash changes only when file content changes, so:
- Unchanged files → same URL → cached forever
- Changed files → new URL → forced re-fetch
- No manual version bumping required

### Build Script (add to `package.json`)

```js
// scripts/build.mjs
import * as esbuild from 'esbuild';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

const result = await esbuild.build({
  entryPoints: ['js/app.js'],
  bundle: true,
  minify: true,
  sourcemap: false,
  outdir: 'dist',
  entryNames: '[name]-[hash]',
  metafile: true,
});

// Write manifest so index.html can reference the hashed filename
const manifest = {};
for (const [out, meta] of Object.entries(result.metafile.outputs)) {
  if (meta.entryPoint) manifest[meta.entryPoint] = out;
}
writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
```

Then a small `scripts/inject-manifest.mjs` reads `manifest.json` and rewrites `<script src="...">` in `index.html` before deploy.

**For the current no-bundle approach (short-term fix):**
Replace `?v=1774589813` with a build-time hash of the file contents. Add to `deploy.sh`:

```bash
CSS_HASH=$(md5 -q css/style.css | cut -c1-8)
sed -i '' "s/style\.css?v=[^\"']*/style.css?v=${CSS_HASH}/" index.html
```

**Source:** esbuild `entryNames` docs + [cache busting with esbuild](https://www.donburks.com/cache-busting-in-esbuild/)

---

## 3. Lazy Loading `historical_elections_full.json` (9.7 MB)

### Problem

This file is 10.2 MB on disk (likely ~2-3 MB gzip). Loading it on every "역대비교" tab open blocks the network and inflates LCP on mobile.

### Recommended Pattern: Fetch on First Access, Cache in Memory

```js
// In history-tab.js — replace eagerly loaded data with:
let _historyCache = null;

async function getHistoryData() {
  if (_historyCache) return _historyCache;
  const resp = await fetch('data/static/historical_elections_full.json');
  if (!resp.ok) throw new Error(`History fetch failed: ${resp.status}`);
  _historyCache = await resp.json();
  return _historyCache;
}

// In renderHistoryTab():
async function renderHistoryTab(region) {
  showTabSpinner();
  try {
    const data = await getHistoryData();
    // render with data
  } catch (e) {
    showError('역대 선거 데이터를 불러올 수 없습니다.');
  }
}
```

### Additional Optimisation: Split by Region

If the file structure allows, split `historical_elections_full.json` into per-region files (`history_seoul.json`, etc., ~300-400 KB each) and load only the selected region. This is the highest-impact change.

**Cloudflare Pages serves static assets with `Cache-Control: public, max-age=14400`** by default. Override for large immutable data files in `_headers`:

```
/data/static/historical_elections_full.json
  Cache-Control: public, max-age=31536000, immutable
```

Set `immutable` only if the filename or path will change when content changes (i.e., you have cache-busting in the URL). Otherwise use a shorter `max-age`.

---

## 4. Korean PIPA & Microsoft Clarity

### Legal Status

**PIPA (개인정보보호법)** requires **explicit, informed, separate consent** before collecting behavioral data (행태정보). Session recordings capture keystroke patterns, mouse movements, and scroll positions — all qualify as personal information under PIPA Article 2.

Key requirements (confidence: MEDIUM — based on PIPA text and PIPC guidelines, not a legal opinion):

| Requirement | Detail |
|-------------|--------|
| Consent trigger | Before any tracking script executes |
| Scope | Separate consent for analytics distinct from "service operation" |
| Disclosure | Must name Clarity explicitly, state data retention period |
| Opt-out | Must be as easy as opt-in; cannot deny core service |
| Foreign transfer | Clarity sends data to Microsoft US servers — offshore transfer consent required under Article 17 |
| Enforcement | PIPC fines up to 3% of revenue or ₩100M for violations |

### Current State

The Clarity snippet fires unconditionally in `<head>` before the DOM loads. This means tracking begins before the user can consent. This is a compliance risk.

### Recommended Fix: Consent Gate

```js
// Load Clarity only after user consent
function loadClarity() {
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window, document, "clarity", "script", "vxpaked5fs");
}

// Show consent banner on first visit
if (!localStorage.getItem('clarity_consent')) {
  showConsentBanner({
    onAccept: () => { localStorage.setItem('clarity_consent', '1'); loadClarity(); },
    onDecline: () => { localStorage.setItem('clarity_consent', '0'); }
  });
} else if (localStorage.getItem('clarity_consent') === '1') {
  loadClarity();
}
```

Clarity's own Consent API (ConsentV2) also supports `clarity("consent", true/false)` for deferred activation.

**Minimum disclosure text (Korean):**
"이 사이트는 서비스 개선을 위해 Microsoft Clarity를 이용한 화면 녹화 및 히트맵을 수집합니다. 수집 정보는 미국 Microsoft 서버로 전송되며, 동의를 거부해도 서비스 이용에 불이익이 없습니다."

**Sources:** [PIPA full text](https://elaw.klri.re.kr/eng_service/lawView.do?hseq=62389&lang=ENG), [Clarity Consent API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2), [Didomi PIPA guide](https://www.didomi.io/blog/south-korea-pipa-everything-you-need-to-know)

---

## 5. JS Bundling with esbuild for Cloudflare Pages

### Current Situation

20+ unminified JS files (~1.1 MB), loaded via individual `<script>` tags. No tree-shaking. No minification.

### Recommended: esbuild with Cloudflare Pages Build Command

Cloudflare Pages supports a "Build command" in project settings. Set it to `npm run build`. No Workers needed.

```bash
npm install -D esbuild
```

**`package.json` scripts:**

```json
"build": "node scripts/build.mjs",
"build:watch": "node scripts/build.mjs --watch"
```

**Minimal `scripts/build.mjs`:**

```js
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['js/app.js'],  // app.js imports all other modules
  bundle: true,
  minify: true,
  sourcemap: 'external',       // keep sourcemaps separate for debugging
  outdir: 'dist/js',
  entryNames: '[name]-[hash]',
  metafile: true,
  // Externals: D3, Chart.js loaded via CDN — do not bundle them
  external: ['d3', 'chart.js'],
  define: {
    'process.env.NODE_ENV': '"production"'
  }
});
```

**Expected gains:**
- 1.1 MB → ~350-450 KB minified (rough estimate: ~60% reduction)
- Gzip on Cloudflare: ~100-150 KB transferred
- Eliminates 20 HTTP requests for JS files

**Migration note:** The current codebase uses globals (`window.App`, `window.ElectionData`). esbuild bundling works with globals — you do not need to refactor to ES modules first. Set `format: 'iife'` to preserve global scope if needed.

**Source:** [esbuild getting started](https://esbuild.github.io/getting-started/)

---

## 6. Lighthouse / Web Vitals Checklist — Mobile Focus

Target: Korean mobile users, many on LTE/5G with mid-range Android devices.

### Core Web Vitals Targets (2025)

| Metric | Good | Needs Work | Poor |
|--------|------|------------|------|
| LCP (Largest Contentful Paint) | < 2.5s | 2.5–4s | > 4s |
| INP (Interaction to Next Paint) | < 200ms | 200–500ms | > 500ms |
| CLS (Cumulative Layout Shift) | < 0.1 | 0.1–0.25 | > 0.25 |

FID was replaced by INP in March 2024. Test with INP.

### Checklist for This Project

**Critical (do first):**
- [ ] Lazy-load `historical_elections_full.json` — currently blocks tab render
- [ ] Move Clarity to consent-gated load — saves ~30 KB on initial parse
- [ ] Add `_headers` file — zero effort, immediate security win
- [ ] Minify JS via esbuild — largest impact on LCP on slow connections

**High priority:**
- [ ] Serve CSS with content-hash cache-busting — eliminate stale style issues
- [ ] Add `<link rel="preload">` for `data/static/regions.json` and `sub_regions.json` (loaded on every page view)
- [ ] Verify D3 and Chart.js load with `defer` (already present — confirm no render-blocking)
- [ ] Add `loading="lazy"` to any below-fold images

**Medium priority:**
- [ ] Inline critical CSS (above-fold styles) to eliminate render-blocking stylesheet
- [ ] Set explicit `width`/`height` on SVG map container to prevent CLS during load
- [ ] Use `font-display: swap` on Google Fonts (already handled by Google's CSS)
- [ ] Enable Cloudflare Minification (dashboard → Speed → Optimization) as a fallback

**Testing:**
```bash
# Run Lighthouse from CLI against production URL
npx lighthouse https://korea-local-election.pages.dev \
  --preset=mobile \
  --output=html \
  --output-path=./lighthouse-report.html \
  --chrome-flags="--headless"
```

Run after each deploy. Target LCP < 3s on simulated 4G mobile (Lighthouse preset).

**Source:** [Core Web Vitals 2025 guide](https://www.corewebvitals.io/core-web-vitals), [web.dev vitals tools](https://web.dev/articles/vitals-tools)

---

## Summary of Immediate Actions (Ordered by Impact/Effort)

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| P0 | Add `_headers` file with security headers | 30 min | Security baseline |
| P0 | Gate Clarity behind consent banner | 2 hrs | Legal compliance |
| P1 | Lazy-load `historical_elections_full.json` | 2 hrs | LCP, mobile perf |
| P1 | Add esbuild minification to deploy pipeline | 4 hrs | 60% JS size reduction |
| P2 | Content-hash cache busting for CSS/JS | 2 hrs | Cache correctness |
| P2 | Split `historical_elections_full.json` by region | 4 hrs | Further LCP gains |
| P3 | Inline critical CSS | 3 hrs | Render-blocking elimination |

---

## Open Questions / Gaps

- **PIPA legal opinion:** The analytics consent analysis is based on PIPA text and general PIPC guidelines. For a public-facing election information site, consult a Korean privacy lawyer before the 5/28 publication-ban period when traffic will spike.
- **Cloudflare Worker analytics endpoint:** Needs authentication review in a separate research task — not covered here.
- **esbuild + existing globals:** The current codebase relies on `window`-level globals. Bundling without refactoring is possible with `format: 'iife'` but a module audit is needed first.
- **CSP nonce vs unsafe-inline:** Moving away from `'unsafe-inline'` requires refactoring the inline Clarity snippet and any other inline scripts — worthwhile but not P0.
