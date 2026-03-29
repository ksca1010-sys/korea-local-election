---
status: partial
phase: 04-election-night
source: [04-VERIFICATION.md]
started: 2026-03-29T00:00:00+09:00
updated: 2026-03-29T00:00:00+09:00
---

## Current Test

[awaiting human testing]

## Tests

### 1. 지도 시각화 확인
expected: 서울(국민의힘 빨간색 100% 채도 + 굵은 테두리 + '59.0%' 오버레이), 경기(민주당 파란색 72% 채도 테두리 없음), 데이터 없는 지역(회색)
result: [pending]

**방법:** 브라우저 콘솔에서 `ElectionCalendar.getCurrentPhase = () => 'election_night'` 오버라이드 후, #manual-fallback-container를 강제 표시하고 아래 JSON을 textarea에 붙여넣고 "적용" 클릭:
```json
{"fetchedAt":"2022-06-01T22:00:00+09:00","regions":{"seoul":{"countRate":100,"leadingCandidate":"오세훈","leadingParty":"ppp","leadingVoteRate":59.0,"declared":true},"gyeonggi":{"countRate":72,"leadingCandidate":"김동연","leadingParty":"democratic","leadingVoteRate":51.5,"declared":false},"gwangju":{"countRate":100,"leadingCandidate":"강기정","leadingParty":"democratic","leadingVoteRate":65.7,"declared":true}}}
```

### 2. Worker 장애 시 수동 폴백 UI 전환 확인
expected: Worker URL을 잘못된 주소로 교체하면 콘솔에 경고가 출력되고 #manual-fallback-container가 표시됨
result: [pending]

### 3. 개표 배너 표시 확인
expected: election_night 페이즈에서 '개표가 진행 중입니다. 실시간 결과를 지도에서 확인하세요.' 배너가 표시됨
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
