# External Integrations

**Analysis Date:** 2026-03-29

## APIs & External Services

**Election Data — NEC (선관위):**
- Service: National Election Commission Open Data API
  - Endpoint: `https://data.nec.go.kr/open-data/api.do`
  - Used for: candidate lookups (especially superintendent/교육감)
  - Client: `js/nec.js` (`NECData` IIFE module)
  - Auth: `window.NEC_SERVICE_KEY` (injected at runtime; not bundled)
  - Proxy path: optional `window.NEC_PROXY_BASE` → `{proxy}/api/nec/superintendents`

- Service: 공공데이터포털 VoteXmntckInfoInqireService2 (historical results)
  - Endpoint: `http://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2/getXmntckSttusInfoInqire`
  - Used for: historical election vote counts
  - Client: Python scripts in `scripts/`
  - Auth: `serviceKey` query parameter

- Service: NEC CommonCodeService (district codes)
  - Endpoint: `http://apis.data.go.kr/9760000/CommonCodeService/getCommonSggCodeList`
  - Used for: regional code lookups in pipeline scripts
  - Client: Python scripts in `scripts/`

**News Search — Naver:**
- Service: Naver Search API (뉴스 검색)
  - Endpoint: `https://openapi.naver.com/v1/search/news.json`
  - Used for: election news search in news tab
  - Client: `worker/index.js` (Cloudflare Worker proxy) → `js/tabs/news-tab.js` via `NEWS_PROXY_BASE`
  - Auth: `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET` (Cloudflare Worker secrets)
  - Proxy URL: `https://election-news-proxy.ksca1010.workers.dev/api/news`

- Service: Naver Web Search API
  - Endpoint: `https://openapi.naver.com/v1/search/webkr.json`
  - Used for: candidate/news discovery in Python pipeline scripts
  - Client: Python scripts in `scripts/`

**News Search — Google News:**
- Service: Google News RSS
  - Endpoint: `https://news.google.com/rss/search?q=...&hl=ko&gl=KR&ceid=KR:ko`
  - Used for: supplemental news search (gnews endpoint)
  - Client: `worker/index.js` (RSS parsed with regex, no external library)
  - Proxy URL: `https://election-news-proxy.ksca1010.workers.dev/api/gnews`

**AI/LLM — Google Gemini:**
- Service: Google Generative Language API
  - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
  - Used for: PDF poll parsing (`scripts/gemini_parse_polls.py`), candidate discovery (`scripts/discover_challengers_gemini.py`), factchecking pipeline scripts
  - Client: `google-genai` Python SDK (`google.genai`, `google.generativeai`)
  - Auth: `GEMINI_API_KEY` or `GOOGLE_API_KEY` env var (scripts only, never deployed to frontend)

## Data Sources (Static/Semi-static)

**NESDC (여심위 — 여론조사심의위원회):**
- Service: National Election Survey Deliberation Commission
  - Base URL: `https://www.nesdc.go.kr/portal/bbs/B0000005/list.do?menuNo=200467`
  - Used for: poll registration lookup, PDF download
  - Client: `scripts/nesdc_poll_pipeline.py`, `scripts/nesdc_scrape.py`
  - Auth: None (public)

**NEC Info (선관위 통계시스템):**
- URL: `http://info.nec.go.kr`
- Used for: historical election data reference (manual/scraping)
- Client: Python pipeline scripts

**Data Files (local JSON, served as static assets):**
- `data/static/*.json` — regions, parties, historical elections, incumbents, etc.
- `data/polls/polls.json` — compiled poll data (aggregated from NESDC)
- `data/candidates/*.json` — per-election-type candidate lists
- `data/*.geojson`, `data/*-topo.json` — map boundary files
- All loaded via `fetch()` in `js/data.js` and `js/data-loader.js`

## Authentication & Identity

**Auth Provider:**
- None — no user login, no session management, no authentication

## Analytics & Monitoring

**Microsoft Clarity:**
- Integration: inline script snippet in `index.html` (tag ID: `vxpaked5fs`)
- Purpose: session recording, heatmaps, user behavior analytics

**Custom Analytics:**
- Endpoint: `https://election-news-proxy.ksca1010.workers.dev/analytics`
- Backed by: Cloudflare KV namespace `ANALYTICS` (binding in `worker/wrangler.toml`)
- Client: `js/app.js` — fires POST on page load
- Dump endpoint: `/analytics/dump` (query by date)

## Hosting & Deployment

**Frontend Hosting:**
- Platform: Cloudflare Pages
- Project name: `korea-local-eletion` (note typo in name)
- Deploy command: `npx wrangler pages deploy` (see `deploy.sh`)
- Production URL: `https://korea-local-election.pages.dev`
- Deployment excludes: large GeoJSON files, `scripts/`, `node_modules/`, `*_byulpyo/` directories

**API Proxy:**
- Platform: Cloudflare Workers
- Worker name: `election-news-proxy`
- Worker file: `worker/index.js`
- Worker config: `worker/wrangler.toml`
- Live URL: `https://election-news-proxy.ksca1010.workers.dev`
- Provides: `/api/news`, `/api/gnews`, `/analytics`, `/analytics/dump`

## CDN Dependencies

- `https://d3js.org` — D3.js v7, TopoJSON v3
- `https://cdn.jsdelivr.net` — Chart.js v4.4.1
- `https://fonts.googleapis.com` — Inter, Noto Sans KR, Public Sans
- `https://fonts.gstatic.com` — Google Fonts assets
- `https://cdnjs.cloudflare.com` — Font Awesome 6.5.1

## Environment Variables Summary

| Variable | Where Used | Purpose |
|---|---|---|
| `NEC_SERVICE_KEY` | `window.*` in browser | NEC Open Data API key |
| `NEC_PROXY_BASE` | `window.*` in browser | Optional NEC proxy base URL |
| `NEWS_PROXY_BASE` | `window.*` in browser | Cloudflare Worker proxy base URL |
| `NEC_API_URL` | `window.*` in browser | Override for NEC API endpoint |
| `NAVER_CLIENT_ID` | Cloudflare Worker secret | Naver API client ID |
| `NAVER_CLIENT_SECRET` | Cloudflare Worker secret | Naver API client secret |
| `GEMINI_API_KEY` | Python script env | Google Gemini API key |

---

*Integration audit: 2026-03-29*
