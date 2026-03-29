# Technology Stack

**Analysis Date:** 2026-03-29

## Languages

**Primary:**
- JavaScript (ES2022) — all frontend logic in `js/`
- HTML5 — single-page app entry point at `index.html`
- CSS3 — single stylesheet at `css/style.css`

**Secondary:**
- Python 3 (3.14.2 local) — data automation pipeline scripts in `scripts/`

## Runtime

**Environment:**
- Browser (no bundler; scripts loaded via `<script defer>` tags in `index.html`)
- Node.js v24 (dev tooling only — linting, formatting, utility scripts)
- Python 3 (data pipeline scripts; not deployed)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- None — vanilla HTML + CSS + JavaScript, no frontend framework

**Visualization:**
- D3.js v7 (CDN: `https://d3js.org/d3.v7.min.js`) — SVG map rendering in `js/map.js`
- TopoJSON v3 (CDN: `https://d3js.org/topojson.v3.min.js`) — map topology in `js/map.js`
- Chart.js v4.4.1 (CDN: `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js`) — charts in `js/charts.js`

**Testing:**
- None detected

**Build/Dev:**
- ESLint v9 — JS linting (`eslint.config.js`, targets `js/`)
- Prettier v3 — formatting for `js/**/*.js` and `css/**/*.css`
- Wrangler (npx) — Cloudflare Pages deploy and Cloudflare Workers deploy

## Key Dependencies

**Critical (CDN, loaded at runtime):**
- `d3` v7 — map drawing, GeoJSON/TopoJSON rendering
- `topojson` v3 — topology compression/decompression for map data
- `Chart.js` v4.4.1 — poll and history charts

**Dev (npm):**
- `eslint` ^9.0.0 — linting
- `@eslint/js` ^9.0.0 — eslint recommended rules
- `globals` ^15.0.0 — browser globals for eslint
- `prettier` ^3.0.0 — code formatting
- `topojson-client` ^3.1.0 — TopoJSON utility (build/scripts use only)

**Python (data pipeline):**
- `httpx==0.27.2` — HTTP client for API calls
- `beautifulsoup4==4.12.3` — HTML scraping (NESDC)
- `pandas==2.2.3` — data manipulation

**Fonts (CDN):**
- Google Fonts: Inter, Noto Sans KR, Public Sans
- Font Awesome 6.5.1 (cdnjs) — icons
- Google Material Symbols Outlined — icons

## Configuration

**Environment:**
- Runtime config injected via `window.*` globals (e.g. `window.NEC_SERVICE_KEY`, `window.NEC_PROXY_BASE`, `window.NEWS_PROXY_BASE`)
- Cloudflare Worker secrets set via `wrangler secret put` (never in source)
- `.env` file excluded from deploy via `deploy.sh`

**Build:**
- `eslint.config.js` — ESLint flat config, ECMAScript 2022, `sourceType: "script"`
- `worker/wrangler.toml` — Cloudflare Worker config (name: `election-news-proxy`)
- `deploy.sh` — rsync + `wrangler pages deploy` to Cloudflare Pages

## Module System

- Frontend: IIFE (Immediately Invoked Function Expression) modules — each `js/*.js` file exports a single global constant (e.g. `App`, `ElectionData`, `MapModule`)
- No ES modules, no bundling, no `import`/`export` in frontend code
- Worker (`worker/index.js`): ES module (`export default`)

## Platform Requirements

**Development:**
- Node.js (npm for dev tools, wrangler for deploy)
- Python 3 + pip (for data pipeline scripts only)
- `serve.sh` provides local HTTP server

**Production:**
- Cloudflare Pages (static hosting): `https://korea-local-eletion.pages.dev`
- Cloudflare Workers (API proxy): `https://election-news-proxy.ksca1010.workers.dev`
- Cloudflare KV (analytics storage): binding `ANALYTICS`, id `9b31e01259d849009422757c8ebaae27`

---

*Stack analysis: 2026-03-29*
