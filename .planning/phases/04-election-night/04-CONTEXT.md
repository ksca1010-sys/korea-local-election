# Phase 4: 선거일 실시간 개표 - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

6.3 선거일 당일, Cloudflare Worker가 `info.nec.go.kr`을 60초 간격으로 폴링하여 개표 결과를 KV에 캐싱하고, 브라우저 클라이언트가 이를 폴링하여 지도에 실시간 반영한다. Worker 장애 시 수동 JSON 입력 경로로 자동 폴백한다.

새로운 기능(사용자 알림, 득표수 상세 패널, SNS 공유 등)은 이 Phase 범위 밖이다.

</domain>

<decisions>
## Implementation Decisions

### 1. 개표 페이즈 타이밍
- **D-01:** `election_night` 페이즈는 투표 종료(2026-06-03 18:00 KST)부터 자정(2026-06-04 00:00 KST)까지
- **D-02:** `election-calendar.js`의 `DATES` 상수에 `ELECTION_NIGHT_END: new Date('2026-06-04T00:00:00+09:00')` 추가
- **D-03:** `getCurrentPhase()`에 `'election_night'` 케이스 추가: `VOTE_END <= now < ELECTION_NIGHT_END → 'election_night'`
- **D-04:** 비용: Cron 360회 + KV write 360회 → Free tier 내. 브라우저 동시접속 278명 초과 시 Workers Paid $5/month 필요 (선거 당일만)

### 2. 개표 데이터 소스
- **D-05:** `info.nec.go.kr` 직접 HTML/JSON 파싱 (ROADMAP 원안 유지)
- **D-06:** 공공데이터포털 `VoteXmntckInfoInqireService2`는 역대 확정 데이터용 — 선거 당일 실시간 지원 여부 불확실하므로 사용하지 않음
- **D-07:** Worker 요청 시 `User-Agent` 명시 필수, `robots.txt` 사전 확인 필수
- **D-08:** 2022년 아카이브 데이터로 파서 사전 테스트 (마감: 2026-05-26, 선거일 1주 전)

### 3. 지도 시각화
- **D-09:** 색상 = 1위 후보 정당색 × 개표율 채도 — `hexToRgba(partyColor, 개표율 × 0.85)` 활용
- **D-10:** 오버레이 텍스트 = 1위 후보 득표율(%) — 폴리곤 중앙에 표시
- **D-11:** 당선 확정 = 선관위 공식 "당선" 플래그만 신뢰 — 수학적 추정·역전불가 계산 절대 금지
- **D-12:** 당선 확정 지역구 표시 = 굵은 테두리(stroke) 강조 — 기존 D3 패턴 재활용

### 4. Worker 배포 위치
- **D-13:** 현재 레포 내 `workers/election-night.js` + `wrangler.toml` — 별도 레포 분리 없음
- **D-14:** Cloudflare Pages Functions 미사용 — Cron Trigger 미지원이므로 제외
- **D-15:** 배포 명령: `wrangler deploy` (Pages 배포와 별도)

### Claude's Discretion
- Worker KV 키 구조 및 응답 JSON 스키마 설계
- `info.nec.go.kr` 파서 세부 구현 방식 (cheerio vs 정규식 vs 내장 파싱)
- 수동 폴백 UX 세부 구현 (Area 5 미논의 — 플래너가 ROADMAP 성공 기준 2번 기반으로 결정)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 선거 캘린더
- `js/election-calendar.js` — `DATES` 상수, `getCurrentPhase()`, `getKST()` — `election_night` 페이즈 추가 위치

### 지도 시각화
- `js/map.js` — `getRegionColor()`, `hexToRgba()`, D3 fill/stroke 패턴

### NEC API 패턴
- `js/nec.js` — 기존 NEC fetch 구조 (proxy 패턴, error handling)

### 프로젝트 헌법
- `CLAUDE.md` §헌법 — 허위 데이터 절대 금지, 공식 출처 우선, 추정 수치 금지

### 요구사항
- `.planning/REQUIREMENTS.md` §FEAT-06

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hexToRgba(color, alpha)` in `js/map.js` — 개표율 채도 표현에 직접 활용 가능
- `getPartyColor(partyKey)` in `js/data.js` — 정당색 반환, 개표 모드에서 재사용
- `NECData` module in `js/nec.js` — fetch + proxy 패턴 선례, Worker 구현 참고
- `getCurrentPhase()` in `js/election-calendar.js` — `election_night` 케이스 추가 필요

### Established Patterns
- 모든 날짜 비교: `getKST()` 사용 (문자열 비교 금지)
- 데이터 접근: `ElectionData`를 통해서만
- 탭 파일은 독립적 — 개표 클라이언트는 `app.js` 또는 별도 모듈로

### Integration Points
- `election-calendar.js`: `DATES` + `getCurrentPhase()` 수정
- `map.js`: 개표 모드 진입 시 색상 레이어 교체
- `app.js`: `election_night` 페이즈 감지 → 폴링 클라이언트 활성화

</code_context>

<specifics>
## User-Stated Specifics

- "선거 관련 데이터는 공신력으로 가야해 추정은 절대 금물" — 당선 확정은 선관위 공식 플래그만 사용
- 비용: 선거 당일 하루만 과금, 최대 $10 이하 수용
- Worker 테스트 마감: 2026-05-26 (선거일 1주 전) — STATE.md에 기록됨

</specifics>
