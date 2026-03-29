# Feature Additions Research

**Project:** 선거정보지도 (Korea Local Election Map)
**Researched:** 2026-03-29
**Stack:** Vanilla JS IIFE modules, D3.js v7, Chart.js v4, no build system

---

## 1. Chart.js Time-Series Poll Trend Chart

### Current State
`ChartsModule.renderPollTrendChart()` exists in `js/charts.js` (line 160). It already:
- Sorts polls chronologically by `surveyDate.end || publishDate`
- Builds per-candidate datasets (union across all polls in group)
- Uses `M/D` string labels on the X axis (not a real time scale)

### Recommended Upgrade: Real Date Axis

**Problem with current approach:** String labels cause uneven spacing. A poll on 2/1 and another on 2/28 appear equidistant from a poll on 2/14 even though they are not.

**Fix:** Use Chart.js `type: 'time'` scale with `chartjs-adapter-date-fns` (CDN, ~7KB gzipped). No npm required.

```html
<!-- Add to index.html after Chart.js CDN -->
<script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3/dist/chartjs-adapter-date-fns.bundle.min.js"></script>
```

```js
// In renderPollTrendChart(), replace the labels array with x/y point objects:
const dataset = {
  label: candidateName,
  data: polls.map(p => ({
    x: new Date(p.surveyDate?.end || p.publishDate),
    y: supportValue ?? null  // null = gap in line, not zero
  })),
  spanGaps: false,  // show break when candidate absent from poll
  tension: 0.3,
  borderWidth: 2,
  pointRadius: 4,
  pointHoverRadius: 6
};

// Scale config:
scales: {
  x: {
    type: 'time',
    time: { unit: 'day', displayFormats: { day: 'M/d' } },
    adapters: { date: {} }  // date-fns adapter auto-detected
  },
  y: {
    min: 0, max: 60,
    ticks: { callback: v => v + '%' }
  }
}
```

**Key decisions:**
- `spanGaps: false` — if a candidate didn't appear in one poll, break the line. Don't interpolate support.
- `null` for missing candidates, not `0` — zero implies they polled 0%, which is misleading.
- Keep `aspectRatio: window.innerWidth <= 768 ? 1.2 : 1.8` (already in codebase).
- No separate `chartjs-adapter-luxon` or `moment`; `date-fns` bundle is smallest and tree-shakeable.

**Confidence:** HIGH — official Chart.js docs confirm this pattern.
Source: https://www.chartjs.org/docs/latest/axes/cartesian/time.html

---

## 2. URL State Sharing

### Current State
`Router.updateHash()` already encodes `electionType / regionKey / districtName / tab` into `#/` hash. URL is always shareable. The gap is: no UI affordance to copy it.

### Recommended: Copy-to-Clipboard Button

Add a "링크 복사" button in the info panel header. No library needed.

```js
async function copyShareUrl() {
  const url = window.location.href;  // includes current hash
  try {
    await navigator.clipboard.writeText(url);
    showToast('링크가 복사됐어요');
  } catch {
    // Fallback for non-HTTPS or older Safari
    const el = document.createElement('textarea');
    el.value = url;
    el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(el);
    el.focus(); el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('링크가 복사됐어요');
  }
}
```

**Requirements:**
- Must be triggered by a user gesture (button click) — Clipboard API requires it.
- HTTPS only for `navigator.clipboard` — site is already on HTTPS (pages.dev).
- `execCommand` fallback handles in-app WebView (KakaoTalk browser, etc.).

**Toast pattern** (no library):
```js
function showToast(msg, duration = 2000) {
  const t = document.createElement('div');
  t.className = 'share-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('share-toast--visible'));
  setTimeout(() => { t.classList.remove('share-toast--visible'); setTimeout(() => t.remove(), 300); }, duration);
}
```

**Do not:** encode poll filter state or scroll position in the URL — the existing hash scheme is sufficient and adding more would break `Router.restoreFromHash()`.

**Confidence:** HIGH — MDN Clipboard API, well-established pattern.

---

## 3. Mobile-First Map + Panel Layout

### Current State (confirmed from CSS)
- `@media (max-width: 768px)`: `--panel-width: 100%` — panel covers full screen.
- `@media (max-width: 1024px)`: `.sidebar { display: none }` — left sidebar hidden.
- Mobile bottom chips exist (`mobile-election-chips`), mobile search overlay exists.
- Map is visible below the header; panel slides in from the right as a full-width overlay.

### Gap: Panel Swipe-Down to Dismiss

On mobile, users cannot see the map once the panel opens. Add a drag handle + swipe-down gesture:

```js
// Minimal touch swipe-to-close for info panel
const panel = document.getElementById('info-panel');
let startY = 0;
panel.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
panel.addEventListener('touchmove', e => {
  const dy = e.touches[0].clientY - startY;
  if (dy > 0) panel.style.transform = `translateY(${dy}px)`;  // drag down
}, { passive: true });
panel.addEventListener('touchend', e => {
  const dy = e.changedTouches[0].clientY - startY;
  panel.style.transform = '';
  if (dy > 80) App.closePanel();  // threshold: 80px drag = dismiss
});
```

Add CSS drag handle:
```css
.panel-drag-handle {
  display: none;
  width: 40px; height: 4px;
  background: var(--text-muted);
  border-radius: 2px;
  margin: 8px auto 4px;
}
@media (max-width: 768px) {
  .panel-drag-handle { display: block; }
  #info-panel { border-radius: 16px 16px 0 0; }
}
```

### Chart Aspect Ratio on Mobile
Already handled (`aspectRatio: window.innerWidth <= 768 ? 1.2 : 1.8`) — no change needed.

### Touch Target Minimum
All interactive elements must be >= 44px tall. Audit tab buttons and candidate cards — they are currently `font-size` driven and may undersize on narrow viewports.

**Confidence:** MEDIUM — patterns from MDN touch events docs, CSS confirmed by reading project CSS.

---

## 4. Election Night Real-Time Results (NEC API)

### Critical Finding: No Real-Time Public API

**The NEC `VoteXmntckInfoInqireService2` API (apis.data.go.kr/9760000) does NOT provide live vote counts during election day.** It provides finalized results typically weeks to months after elections. This is confirmed by the official data.go.kr documentation.

Source: https://www.data.go.kr/data/15000900/openapi.do

### Confirmed API Structure (post-election data)
```
GET https://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2/getVoteSttusInfoInqire
Params: ServiceKey, sgId (e.g. 20260603), sgTypecode (11=지방선거), sdName, wiwName, numOfRows, pageNo
Returns: totSunsu (eligible voters), totTusu (votes cast), turnout %, sgId, wiwName
```

### Recommended Approach for Election Night (June 3, 2026)

**Option A — Scraping-free proxy (RECOMMENDED)**
Build a Cloudflare Worker (already in use: `election-news-proxy.ksca1010.workers.dev`) that polls `info.nec.go.kr` HTML every 60 seconds during election night (18:00–04:00 KST). The NEC website at `info.nec.go.kr` displays live results via AJAX to its own backend — the Worker can fetch and parse that data and expose a clean JSON endpoint.

```js
// Polling in the browser (only activate when election day + after 18:00 KST)
let resultsPoller = null;
function startElectionNightPolling() {
  resultsPoller = setInterval(async () => {
    const res = await fetch('/api/results/live');  // Cloudflare Worker endpoint
    const data = await res.json();
    renderLiveResults(data);
  }, 60_000);  // 60s interval — respectful, sufficient for election night drama
}
```

**Option B — Static JSON updates via GitHub Actions**
A GitHub Action running every 5 minutes on election night pushes a `data/live_results.json` to the repo. The frontend polls the CDN URL. Simpler but 5-minute delay and requires maintained credentials.

**Option C — Manual entry**
Staff paste results into a JSON file as they come in. Zero infrastructure. Appropriate if election night staffing is available.

**sgTypecode values for 지방선거:**
- `1` = 시도지사 (governor)
- `2` = 교육감 (superintendent)
- `3` = 구시군장 (mayor/head)
- `4` = 시도의원 (provincial council)
- `5` = 구시군의원 (basic council)
- `11` = 전체 (all types, some endpoints)

**Implementation order:**
1. Build Worker proxy first (Week of 5/26)
2. Test against 2022 election archived data
3. Activate polling only when `ElectionCalendar.getCurrentPhase() === 'election_night'`

**Confidence:** LOW for real-time API (no live public API exists) / HIGH for the architecture recommendation.

---

## 5. Progressive Loading: Skeleton Screens + Lazy Tabs

### Skeleton Screens
Insert a skeleton HTML placeholder before tab content renders. Swap out when data is ready.

```js
function renderSkeletonTab(container) {
  container.innerHTML = `
    <div class="skeleton-block" style="height:24px;width:60%;margin-bottom:12px"></div>
    <div class="skeleton-block" style="height:16px;width:80%;margin-bottom:8px"></div>
    <div class="skeleton-block" style="height:16px;width:70%;margin-bottom:8px"></div>
    <div class="skeleton-block" style="height:200px;margin-top:16px"></div>`;
}
```

```css
.skeleton-block {
  background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s infinite;
  border-radius: 4px;
}
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Tab-Level Lazy Loading
Defer expensive tab renders until the user actually opens that tab. The IIFE pattern already isolates tabs — just guard with a `_rendered` flag:

```js
// Pattern (add to each tab's render entry point):
let _lastRenderedKey = null;
function render(regionData) {
  const key = regionData.regionKey + ':' + regionData.electionType;
  if (key === _lastRenderedKey) return;  // already up to date
  _lastRenderedKey = key;
  _doRender(regionData);
}
```

This prevents duplicate renders when users switch between tabs rapidly (already partially done in some tabs — make it consistent).

**Confidence:** HIGH — standard patterns, confirmed by codebase review.

---

## 6. Google Calendar .ics Export

No library needed. Pure vanilla JS. The ICS format is a simple text standard (RFC 5545).

```js
function generateElectionICS() {
  const events = [
    { summary: '예비후보 등록 마감', dtstart: '20260515T180000', dtend: '20260515T190000', description: '본후보 등록 시작' },
    { summary: '본후보 등록', dtstart: '20260514T090000', dtend: '20260515T180000' },
    { summary: '사전투표', dtstart: '20260529T060000', dtend: '20260530T180000' },
    { summary: '6.3 전국동시지방선거', dtstart: '20260603T060000', dtend: '20260603T200000' },
  ];

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//선거정보지도//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flatMap(e => [
      'BEGIN:VEVENT',
      `DTSTART;TZID=Asia/Seoul:${e.dtstart}`,
      `DTEND;TZID=Asia/Seoul:${e.dtend}`,
      `SUMMARY:${e.summary}`,
      e.description ? `DESCRIPTION:${e.description}` : null,
      `UID:${e.dtstart}-${Math.random().toString(36).slice(2)}@korea-local-election`,
      'END:VEVENT'
    ].filter(Boolean)),
    'END:VCALENDAR'
  ];

  const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '6.3지방선거일정.ics';
  a.click();
  URL.revokeObjectURL(a.href);
}
```

**Notes:**
- Line endings must be `\r\n` per RFC 5545 — use `.join('\r\n')` not `.join('\n')`.
- `TZID=Asia/Seoul` in DTSTART/DTEND avoids UTC conversion issues.
- Google Calendar, Apple Calendar, and Outlook all accept `.ics` file import.
- Do NOT use an external library (ics.js, etc.) — it adds 30KB for functionality achievable in 20 lines.
- Wire to the existing `election-calendar.js` `DATES` constants to avoid duplication.

**Confidence:** HIGH — ICS format is a stable RFC standard.
Source: https://datatracker.ietf.org/doc/html/rfc5545

---

## Implementation Priority

| Feature | Effort | Value | Priority |
|---------|--------|-------|----------|
| Copy URL button | Low | High | P0 — do first |
| .ics export | Low | Medium | P1 |
| Skeleton screens | Low | Medium | P1 |
| Poll trend date axis | Medium | Medium | P2 |
| Mobile swipe-to-close | Medium | High | P2 |
| Election night proxy | High | High | P0 (must start by 5/26) |

---

## Open Questions

1. **Cloudflare Worker proxy for election night**: Does `info.nec.go.kr` block non-browser requests? Need to test with realistic User-Agent headers and confirm whether CORS allows cross-origin fetch from pages.dev during live election.
2. **Poll trend chart date adapter**: Will adding `chartjs-adapter-date-fns` CDN script affect CSP (Content Security Policy) headers? Check Cloudflare Pages config.
3. **ICS timezone**: Korean election dates are fixed KST — but devices in other timezones (Korean diaspora abroad) should still see KST-correct times. The `TZID=Asia/Seoul` approach handles this, but test on iOS Calendar app.
