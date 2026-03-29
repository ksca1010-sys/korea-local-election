---
phase: 04-election-night
plan: "02"
subsystem: election-night-client
tags: [election-night, polling, map-visualization, fallback-ui]
dependency_graph:
  requires: [04-01]
  provides: [election-night-browser-client, map-election-layer]
  affects: [js/app.js, js/map.js, index.html]
tech_stack:
  added: []
  patterns: [setInterval-polling, AbortSignal.timeout, D3-fill-update, manual-json-fallback]
key_files:
  created: []
  modified:
    - js/app.js
    - js/map.js
    - index.html
decisions:
  - "Worker URL https://election-night.ksca1010.workers.dev 를 ELECTION_NIGHT_WORKER 상수에 기입"
  - "election_night 페이즈 판정은 ElectionCalendar.getCurrentPhase() 위임 — app.js에서 자체 판정 없음"
  - "r.declared === true 비교만 수행 — 개표율 기반 당선 추정 코드 없음 (D-11, 헌법 제2조)"
metrics:
  duration_minutes: 5
  completed_date: "2026-03-29"
  tasks_completed: 3
  files_modified: 3
---

# Phase 04 Plan 02: 브라우저 폴링 클라이언트 + 개표 지도 레이어 Summary

election_night 페이즈 감지 시 60초 Worker 폴링으로 지도에 정당색 x 개표율 채도를 반영하고, Worker 장애 시 수동 JSON 폴백 UI를 제공하는 클라이언트 레이어 구현.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1a | 브라우저 폴링 클라이언트 + 수동 폴백 경로 | 7999c25 | js/app.js, index.html |
| 1b | 지도 개표 결과 시각화 레이어 | 5c9cd10 | js/map.js |
| 2 | 개표 시각화 + 수동 폴백 브라우저 검증 | (auto-approved) | — |

## What Was Built

### js/app.js — 폴링 클라이언트
- `ELECTION_NIGHT_WORKER` 상수 = `https://election-night.ksca1010.workers.dev`
- `_checkElectionNightPhase()` — ElectionCalendar.getCurrentPhase() 감시, election_night 진입 시 폴링 시작
- `_startElectionNightPolling()` / `_stopElectionNightPolling()` — setInterval 60초 관리
- `_pollElectionResults()` — fetch /results, AbortSignal.timeout(10s), 실패 시 수동 모드 전환
- `_setManualFallbackMode(active)` — #manual-fallback-container 표시/숨김
- `_handleManualJsonInput(jsonString)` — 수동 JSON 파싱 + MapModule.applyElectionNightLayer() 호출
- init()에 `_checkElectionNightPhase()` 호출 + 5분 타이머 추가
- manual-fallback-apply 버튼 이벤트 리스너 등록

### js/map.js — 개표 레이어
- `applyElectionNightLayer(data)` — 각 광역 .region 폴리곤에 정당색 x 개표율 채도 적용 (D-09)
- `_updateVoteRateOverlay(regions)` — leadingVoteRate.toFixed(1)% 텍스트 오버레이 (D-10)
- `r.declared === true` 일 때만 stroke: #ffffff stroke-width: 3 (D-12)
- `clearElectionNightLayer()` — 오버레이 제거 + 기존 정당색 복원
- 공개 API(return 객체)에 applyElectionNightLayer, clearElectionNightLayer 추가

### index.html — 수동 폴백 UI
- `#manual-fallback-container` (display:none) — detail-panel 하단 삽입
- `#manual-fallback-input` textarea — JSON 직접 입력
- `#manual-fallback-apply` 버튼 + `#manual-fallback-status` 상태 텍스트

## Decisions Made

1. **Worker URL**: 04-01-SUMMARY.md에 기록된 `https://election-night.ksca1010.workers.dev` 사용
2. **선관위 당선 플래그 엄수**: `r.declared === true` 비교만 — 개표율 기반 추정 코드 없음 (D-11, 헌법 제2조)
3. **수동 폴백 UI 위치**: `#detail-panel` 내부 하단 (탭 콘텐츠 영역 밖) — 항상 접근 가능
4. **폴링 5분 타이머**: 페이즈 변화를 5분마다 재감지 (자정 지나면 자동 폴링 중단)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — 선거일(6/3) 전까지 election_night 페이즈에 진입하지 않으므로 Worker 폴링은 실제로 실행되지 않지만, 구현 자체는 완결 상태. 5/26 테스트 마감 전 Worker /results 엔드포인트 검증 필요 (04-01 SUMMARY 참조).

## Self-Check: PASSED

- js/app.js: FOUND
- js/map.js: FOUND
- index.html: FOUND
- 04-02-SUMMARY.md: FOUND
- commit 7999c25: FOUND
- commit 5c9cd10: FOUND
