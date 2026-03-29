---
phase: "03-performance-features"
plan: "03-02"
subsystem: "poll-tab, app, election-calendar"
tags: [chart, timescale, share, ics, ux]
dependency_graph:
  requires: []
  provides: ["poll-trend-timescale", "url-share", "ics-export"]
  affects: ["js/charts.js", "js/app.js", "js/election-calendar.js", "index.html", "css/style.css"]
tech_stack:
  added: ["chartjs-adapter-date-fns@3.0.0"]
  patterns: ["Chart.js time scale", "navigator.clipboard + execCommand fallback", "RFC 5545 .ics"]
key_files:
  created: []
  modified:
    - "js/charts.js"
    - "js/app.js"
    - "js/election-calendar.js"
    - "index.html"
    - "css/style.css"
decisions:
  - "chart.js dataset data converted to {x,y} objects (ISO date string x) for time scale compatibility"
  - "ICS fallback schedule hardcoded in exportICS() since ElectionData.electionCalendar not guaranteed at runtime"
  - "Share button placed in panel-header next to close button; ICS button placed in panel-welcome"
metrics:
  duration: "~20 min"
  completed: "2026-03-29"
  tasks_completed: 2
  files_modified: 5
---

# Phase 03 Plan 02: 여론조사 트렌드 차트 + URL 공유 + .ics 내보내기 Summary

**One-liner:** Chart.js date-fns 어댑터로 여론조사 time scale 시계열 차트 전환, navigator.clipboard URL 공유 버튼, RFC 5545 .ics 선거 일정 내보내기 구현.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | 여론조사 시계열 차트 (Chart.js time scale) | bc16e6b | js/charts.js, index.html |
| 2 | URL 공유 버튼 + .ics 캘린더 내보내기 | dd406af, 09785bc | js/app.js, js/election-calendar.js, index.html, css/style.css |

## What Was Built

### FEAT-01: Chart.js Time Scale

- Added `chartjs-adapter-date-fns@3.0.0` CDN to `index.html` (after Chart.js)
- Changed `renderPollTrendChart` x-axis from implicit category scale to `type: 'time'` with `unit: 'day'`, `displayFormats: { day: 'M/d' }`, `tooltipFormat: 'yyyy-MM-dd'`
- Converted all dataset `data` arrays from `[support, ...]` to `[{x: dateStr, y: support}, ...]` point objects
- Updated margin-of-error band datasets to use `{x, y}` objects
- Updated tooltip `itemSort` and `label` callbacks to read `.raw.y` instead of `.raw`
- Removed `labels` array from Chart `data` object (not needed with time scale point data)

### FEAT-02: URL Share Button

- Added `<button class="share-btn" onclick="App.copyShareLink()">` to panel header in `index.html`, wrapped alongside close button in `.panel-header-actions`
- Added `copyShareLink()`, `_fallbackCopy()`, `_showCopyToast()` functions inside App IIFE
- Exported `copyShareLink` in App public API
- `.copy-toast` animates with `copyFadeInOut` keyframe, auto-removes after 2 seconds

### FEAT-03: .ics Calendar Export

- Added `exportICS()` to `ElectionCalendar` IIFE (before public API)
- Generates RFC 5545 VCALENDAR with 10 key election events (all-day DATE format)
- DTEND is exclusive (+1 day) per RFC 5545 spec
- Falls back to hardcoded schedule if `ElectionData.electionCalendar` is empty
- Button placed in `panel-welcome` `.welcome-actions` div
- Exported in `ElectionCalendar` public API

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated tooltip callbacks for {x,y} point format**
- **Found during:** Task 1 (chart data format change)
- **Issue:** After converting datasets to `{x,y}` objects, `ctx.raw` in tooltip label was no longer a number
- **Fix:** Changed `ctx.raw` to `ctx.raw?.y ?? ctx.raw` in label callback; updated `itemSort` similarly
- **Files modified:** js/charts.js
- **Commit:** bc16e6b

**2. [Rule 2 - Missing] Added DTEND RFC 5545 exclusive date calculation**
- **Found during:** Task 2 (.ics implementation)
- **Issue:** Plan template used raw `endDate` without accounting for RFC 5545 requiring DTEND to be exclusive (day after last event day)
- **Fix:** Added `d.setDate(d.getDate() + 1)` calculation for DTEND
- **Files modified:** js/election-calendar.js
- **Commit:** 09785bc

**3. [Rule 2 - Missing] Hardcoded fallback schedule in exportICS()**
- **Found during:** Task 2
- **Issue:** `ElectionData.electionCalendar` may not exist — no data file with this property was found
- **Fix:** Hardcoded 10-event schedule array as fallback, used when `ElectionData.electionCalendar` is empty/undefined
- **Files modified:** js/election-calendar.js

## Known Stubs

None — all three features are fully implemented with real data.

## Self-Check: PASSED

- `grep -n "adapter-date-fns" index.html` → line 34 FOUND
- `grep -n "type.*'time'" js/charts.js` → line 329 FOUND
- `grep -n "copyShareLink" js/app.js` → lines 913, 961 FOUND
- `grep -n "navigator.clipboard" js/app.js` → line 915 FOUND
- `grep -n "execCommand.*copy" js/app.js` → line 931 FOUND
- `grep -n "BEGIN:VCALENDAR" js/election-calendar.js` → line 241 FOUND
- `grep -n "exportICS" js/election-calendar.js` → lines 222, 290 FOUND
- `grep -n "ics-export-btn" index.html` → line 306 FOUND
- Commits bc16e6b, dd406af, 09785bc all present in git log
