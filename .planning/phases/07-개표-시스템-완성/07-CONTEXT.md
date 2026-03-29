# Phase 7: 개표 시스템 완성 - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4에서 구축된 Worker 골격(`workers/election-night/index.js`) 위에 실제 NEC 파서를 구현하고, Worker 통합 테스트를 완료하며, 브라우저 UAT 3건을 통과한다.

**핵심 전제:** Worker 코드·폴링 클라이언트·지도 렌더 레이어·수동 폴백 UI는 Phase 4에서 이미 구현됨. 이 Phase는 "stub → 실제 동작"으로 완성하는 단계다.

**범위:** parseNECResponse() 구현, NEC URL 캡처 절차 문서화, Worker 통합 테스트, #election-banner 활성화, 브라우저 UAT 3건.

</domain>

<decisions>
## Implementation Decisions

### 파서 구현 시점
- **D-01:** 지금 2022 아카이브 기반으로 `parseNECResponse()` 구현. info.nec.go.kr 2022 아카이브 페이지를 직접 크롤링하여 HTML 포맷 파악 → 파서 구현 → `test-parser.cjs` 통과 확인. 5/26에 `NEC_URL` 1줄 교체로 실 데이터 전환.

### Worker 통합 테스트
- **D-02:** `wrangler dev --test-scheduled` 로컬 테스트. `curl http://localhost:8787/results`로 응답 확인. 실제 배포(wrangler deploy)는 불필요. NEC URL은 2022 아카이브 URL로 테스트.

### 개표 배너
- **D-03:** 배너 내용 = `"개표 진행 중 — 전체 XX% (포단 HH:MM 기준)"`. 전체 개표율은 17개 지역 countRate 평균으로 계산. Worker 응답의 `regions` 객체를 기반으로 app.js에서 계산하여 `#election-banner`에 표시.
- **D-04:** 위치 = 지도 위 상단 (`#election-banner`의 현재 HTML 위치 그대로. 별도 이동 없음). election_night 페이즈 진입 시 `display:block`, 종료 시 `display:none`.

### NEC URL 캡처 절차
- **D-05:** `workers/CAPTURE-GUIDE.md` 파일에 5/26 Chrome DevTools 캡처 절차 체크리스트 작성. 내용: DevTools 파비콘 → Network 탭 → info.nec.go.kr 필터링 → AJAX URL 복사 → `workers/election-night/index.js`의 `NEC_URL`에 기입 순서.

### 이월된 Phase 4 결정사항 (변경 없음)
- **D-06 (Phase4 D-09):** 색상 = 정당색 × 개표율 채도 `hexToRgba(partyColor, 개표율 × 0.85)` — map.js 이미 구현됨
- **D-07 (Phase4 D-11):** `declared: true`는 선관위 공식 플래그만 — 수학적 추정 절대 금지 (헌법 제2조)
- **D-08 (Phase4 D-13):** Worker 배포: `workers/election-night/` 디렉토리, `wrangler deploy`

### Claude's Discretion
- info.nec.go.kr HTML 파싱 방법 (정규식 vs DOM 파싱 — Worker 런타임은 DOMParser 없음, 정규식/텍스트 파싱 필요)
- `test-parser.cjs` 테스트 fixture 업데이트 범위
- 배너 CSS 스타일 세부 (색상, 폰트 크기 — 기존 프로젝트 스타일 참고)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Worker 코드
- `workers/election-night/index.js` — `parseNECResponse()` TODO 위치, `fetchAndParseNEC()`, `NEC_CONFIG`, KV 스키마
- `workers/election-night/wrangler.toml` — KV 바인딩, Cron 설정
- `workers/election-night/test-parser.cjs` — 테스트 하네스 (Node.js CJS, jest 없음)
- `workers/election-night/fixtures/2022-sample.json` — 스키마 검증 mock fixture

### 브라우저 클라이언트
- `js/app.js` line 996~1100 — `_pollElectionResults()`, `_checkElectionNightPhase()`, `_setManualFallbackMode()`, `ELECTION_NIGHT_WORKER` URL
- `js/map.js` line 4112~ — `applyElectionNightLayer(data)` 구현체

### HTML
- `index.html` line 95 — `#election-banner` div (숨김 상태, JS 활성화 필요)
- `index.html` line 422~ — `#manual-fallback-container` (이미 구현됨)

### 프로젝트 규칙
- `CLAUDE.md` §헌법 — 허위 데이터 절대 금지, declared 추정 금지
- `js/election-calendar.js` — `getCurrentPhase()`, `DATES.ELECTION_NIGHT_START/END`

### 요구사항
- `.planning/REQUIREMENTS.md` — ELEC-01, ELEC-02, ELEC-03

</canonical_refs>

<code_context>
## Existing Code Insights

### 이미 구현된 것 (Phase 4)
- `workers/election-night/index.js`:
  - `scheduled()` — Cron handler (60초마다 NEC 폴링 + KV 저장)
  - `fetch()` — HTTP handler (`/results`, `/health`)
  - `handleResults()` — KV 조회 + 응답
  - `fetchAndParseNEC()` — **stub** (NEC_URL = '' placeholder, 이 Phase에서 구현)
  - `parseNECResponse()` — **stub** (TODO comment, 이 Phase에서 구현)
- `app.js` — `_checkElectionNightPhase()` 5분 간격 실행, `_pollElectionResults()` 60초 폴링, Worker 장애 시 `_setManualFallbackMode(true)` 자동 전환
- `map.js` `applyElectionNightLayer(data)` — regions 스키마 기반 색상 레이어 렌더링 완성
- `#manual-fallback-container` — 수동 JSON 입력 UI 완성

### 구현 필요한 것
- `parseNECResponse(html)` — NEC HTML에서 17개 광역지자체 개표 데이터 추출
- `#election-banner` 활성화 코드 — `_checkElectionNightPhase()`에서 배너 표시/숨김
- `workers/CAPTURE-GUIDE.md` — NEC URL 캡처 절차 문서

### KV 응답 스키마 (이미 확정)
```json
{
  "fetchedAt": "ISO8601",
  "regions": {
    "seoul": {
      "countRate": 72.5,
      "leadingCandidate": "홍길동",
      "leadingParty": "democratic",
      "leadingVoteRate": 48.3,
      "declared": false
    }
  }
}
```

### Worker 런타임 제약
- DOMParser 없음 — HTML 파싱은 정규식 또는 텍스트 파싱으로
- Node.js API 없음 — `globalThis.fetch` 사용

</code_context>

<specifics>
## Specific Ideas

- 배너 텍스트: `"개표 진행 중 — 전체 XX% (포단 HH:MM 기준)"` (D-03)
- NEC URL: 5/26 Chrome DevTools Network 탭에서 `info.nec.go.kr` 필터 후 AJAX 요청 URL 확인
- 2022 아카이브 테스트 URL: `https://info.nec.go.kr/` — Network 탭에서 개표 결과 AJAX 요청 패턴 확인
- `wrangler dev --test-scheduled` 명령으로 Cron 핸들러 수동 트리거 가능

</specifics>

<deferred>
## Deferred Ideas

- 선거 결과 아카이브 (6/3 개표 완료 후 영구 보존) — Future v1.2+
- 득표수 상세 패널 — Phase 4 결정으로 이미 Out of Scope
- SNS 공유 — Out of Scope

</deferred>

---

*Phase: 07-개표-시스템-완성*
*Context gathered: 2026-03-30*
