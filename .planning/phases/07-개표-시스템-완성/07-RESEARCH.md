# Phase 7: 개표 시스템 완성 - Research

**Researched:** 2026-03-30
**Domain:** Cloudflare Worker (NEC HTML 파싱) + 브라우저 UAT
**Confidence:** HIGH (코드 직접 확인) / MEDIUM (NEC HTML 포맷 — 선거일 미도래로 직접 확인 불가)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 지금 2022 아카이브 기반으로 `parseNECResponse()` 구현. info.nec.go.kr 2022 아카이브 페이지를 직접 크롤링하여 HTML 포맷 파악 → 파서 구현 → `test-parser.cjs` 통과 확인. 5/26에 `NEC_URL` 1줄 교체로 실 데이터 전환.
- **D-02:** `wrangler dev --test-scheduled` 로컬 테스트. `curl http://localhost:8787/results`로 응답 확인. 실제 배포(wrangler deploy)는 불필요. NEC URL은 2022 아카이브 URL로 테스트.
- **D-03:** 배너 내용 = `"개표 진행 중 — 전체 XX% (포단 HH:MM 기준)"`. 전체 개표율은 17개 지역 countRate 평균으로 계산. Worker 응답의 `regions` 객체를 기반으로 app.js에서 계산하여 `#election-banner`에 표시.
- **D-04:** 위치 = 지도 위 상단 (`#election-banner`의 현재 HTML 위치 그대로. 별도 이동 없음). election_night 페이즈 진입 시 `display:block`, 종료 시 `display:none`.
- **D-05:** `workers/CAPTURE-GUIDE.md` 파일에 5/26 Chrome DevTools 캡처 절차 체크리스트 작성. 내용: DevTools 파비콘 → Network 탭 → info.nec.go.kr 필터링 → AJAX URL 복사 → `workers/election-night/index.js`의 `NEC_URL`에 기입 순서.
- **D-06 (Phase4 D-09):** 색상 = 정당색 × 개표율 채도 `hexToRgba(partyColor, 개표율 × 0.85)` — map.js 이미 구현됨
- **D-07 (Phase4 D-11):** `declared: true`는 선관위 공식 플래그만 — 수학적 추정 절대 금지 (헌법 제2조)
- **D-08 (Phase4 D-13):** Worker 배포: `workers/election-night/` 디렉토리, `wrangler deploy`

### Claude's Discretion
- info.nec.go.kr HTML 파싱 방법 (정규식 vs DOM 파싱 — Worker 런타임은 DOMParser 없음, 정규식/텍스트 파싱 필요)
- `test-parser.cjs` 테스트 fixture 업데이트 범위
- 배너 CSS 스타일 세부 (색상, 폰트 크기 — 기존 프로젝트 스타일 참고)

### Deferred Ideas (OUT OF SCOPE)
- 선거 결과 아카이브 (6/3 개표 완료 후 영구 보존) — Future v1.2+
- 득표수 상세 패널 — Phase 4 결정으로 이미 Out of Scope
- SNS 공유 — Out of Scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ELEC-01 | NEC 개표 API URL을 캡처하여 Worker에 기입하는 절차가 문서화된다 | D-05 결정 확인. CAPTURE-GUIDE.md 작성 패턴 명확. Chrome DevTools Network 탭 접근 절차 표준화 가능. |
| ELEC-02 | Worker 통합 테스트가 완료되어 실제 응답을 검증한다 | wrangler 4.78.0 설치 확인. `--test-scheduled` 플래그 → `/__scheduled` 엔드포인트 확인. 로컬 KV 자동 시뮬레이션 (`miniflare3` 내장). |
| ELEC-03 | 브라우저 UAT 3건(지도 시각화·폴백 UI·개표 배너)이 완료된다 | 3개 UAT 대상 코드 모두 확인 완료. 배너 = sidebar.js `renderElectionBanner()`. 지도 = map.js `applyElectionNightLayer()`. 폴백 = app.js `_setManualFallbackMode()`. |
</phase_requirements>

---

## Summary

Phase 4에서 골격이 완성된 Worker를 실제 동작하도록 완성하는 단계다. 코드 전체를 직접 읽은 결과 3가지 구현 갭이 확인됐다: (1) `parseNECResponse()` stub, (2) `#election-banner`에 개표율 텍스트 업데이트 코드 부재, (3) `workers/CAPTURE-GUIDE.md` 미존재.

**NEC HTML 포맷 확인 결과 (MEDIUM confidence):** info.nec.go.kr 개표 진행 페이지는 선거일(2026-06-03)까지 데이터가 없어 직접 접근 불가. 2022 아카이브도 현재 404 반환. 공식 NEC open API(`data.go.kr`)는 실시간 개표 엔드포인트를 제공하지 않음 — 선거 후 2개월 이내 확정값만 제공. 따라서 **info.nec.go.kr의 실시간 개표 화면은 AJAX로 가져오는 HTML 테이블**이며 5/26 Chrome DevTools 캡처가 유일한 URL 확인 방법이다. `parseNECResponse()` 구현은 fixture 기반으로만 작성하고, 실제 HTML 포맷은 5/26 캡처 후 조정하는 D-01 전략이 최선이다.

**Primary recommendation:** `parseNECResponse()` 를 2022-sample.json fixture 스키마에 맞춰 stub-passing 수준으로 구현하고, `test-parser.cjs` 전체 통과를 확인하면 ELEC-02 완료. 배너는 `_pollElectionResults()` 성공 후 `#election-banner` innerHTML을 직접 업데이트하는 코드를 app.js에 추가.

---

## Standard Stack

### Worker 환경
| 라이브러리/도구 | 버전 | 용도 |
|---|---|---|
| Cloudflare Workers | runtime | Worker 실행 환경 |
| wrangler | 4.78.0 (설치 확인) | 로컬 dev + 배포 |
| Miniflare v3 | wrangler 내장 | 로컬 KV 시뮬레이션 자동 |
| KV Namespace | ELECTION_RESULTS | 개표 데이터 캐시 (TTL 120초) |

### 브라우저 클라이언트
| 파일 | 역할 |
|---|---|
| `js/app.js` | Worker 폴링 + 폴백 제어 |
| `js/map.js` | 개표 레이어 렌더링 |
| `js/sidebar.js` | 배너 렌더링 (`renderElectionBanner`) |
| `js/election-calendar.js` | 페이즈 판정 (`getCurrentPhase()`) |

**설치 필요 없음.** 모든 의존성 이미 존재.

---

## Architecture Patterns

### 현재 코드 구조 (확인된 사실)

#### workers/election-night/index.js
```
Line 12-18:  NEC_CONFIG (ELECTION_ID_2022, ELECTION_ID_2026, 시간 범위)
Line 21-38:  scheduled() — Cron handler, KST 18:00~24:00에만 실행
Line 40-63:  fetch() — /results, /health HTTP handler
Line 65-84:  handleResults() — KV 'latest' 조회 + CORS 응답
Line 86-118: fetchAndParseNEC() — NEC_URL placeholder (TODO), globalThis.fetch 사용
Line 121-149: parseNECResponse(html) — stub, TODO 구현 필요
Line 151:   export default { scheduled, fetch }
Line 153-154: export { parseNECResponse, NEC_CONFIG } (테스트용)
```

**핵심 구현 포인트:**
- `NEC_URL` 은 `fetchAndParseNEC()` 함수 내 line 98에 있는 빈 문자열 (`''`)
- `parseNECResponse(html)` 는 line 138에서 정의, 현재 빈 regions 반환
- Worker 런타임: DOMParser 없음 → 정규식/텍스트 파싱만 가능

#### workers/election-night/test-parser.cjs
```
Line 13-16: REQUIRED_REGIONS (17개 광역지자체 영문 키)
Line 18:    REQUIRED_FIELDS (5개: countRate, leadingCandidate, leadingParty, leadingVoteRate, declared)
Line 35-44: Test 1 — 스키마 유효성 (fixture 기반)
Line 46-56: Test 2 — countRate 0~100 범위
Line 58-68: Test 3 — leadingVoteRate 0~100 범위
Line 70-77: Test 4 — declared boolean 타입 강제
Line 79-90: Test 5 — 17개 광역지자체 완전성
Line 95-129: Test 6 — parseNECResponse dynamic import + 빈 입력 검증
Line 131-136: Test 7 — fixture _notice 검증
Line 138-142: Test 8 — fixture _description 출처 검증
실행: node workers/election-night/test-parser.cjs
```

**Test 6 주의사항:** `index.js`를 dynamic import(`./index.js`)로 로드. `parseNECResponse('')` 호출 시 `{ regions: object, fetchedAt: string, _parserVersion: string }` 구조 검증.

#### workers/election-night/fixtures/2022-sample.json
- 17개 지역 완전한 mock 데이터 (2022 확정 결과 기반 근사값)
- `_notice`: "스키마 검증 전용 mock"
- `_description`: "info.nec.go.kr 개표 결과" 포함 (Test 7, 8 통과 전제)
- 모든 필드 타입 정확: countRate(number), leadingVoteRate(number), declared(boolean)
- 현재 test-parser.cjs Tests 1~5, 7, 8은 fixture 기반으로 통과 가능

#### wrangler.toml
```toml
name = "election-night"
main = "index.js"
compatibility_date = "2024-01-01"
[triggers]
crons = [ "* * * * *" ]
[[kv_namespaces]]
binding = "ELECTION_RESULTS"
id = "db737acc9d624075bab261c60628f95c"
preview_id = "db737acc9d624075bab261c60628f95c"
```

#### js/app.js — Election Night 섹션
```
Line 998:   ELECTION_NIGHT_WORKER = 'https://election-night.ksca1010.workers.dev'
Line 999-1000: _electionNightPoller, _manualFallbackMode 상태 변수
Line 1002-1011: _checkElectionNightPhase() — getCurrentPhase() === 'election_night'이면 폴링 시작
Line 1013-1018: _startElectionNightPolling() — _pollElectionResults() 즉시 1회 + 60초 interval
Line 1020-1026: _stopElectionNightPolling()
Line 1028-1044: _pollElectionResults() — fetch /results → MapModule.applyElectionNightLayer(data) → 실패 시 _setManualFallbackMode(true)
Line 1046-1051: _setManualFallbackMode() — #manual-fallback-container display 토글
Line 1053-1070: _handleManualJsonInput() — 수동 JSON 파싱 + applyElectionNightLayer 호출
```

**배너 업데이트 코드 부재 확인:** `_pollElectionResults()` 성공 시 `MapModule.applyElectionNightLayer(data)` 만 호출. `#election-banner` 텍스트 업데이트 로직 없음. **이 Phase에서 추가해야 함.**

#### js/sidebar.js — 배너 시스템
```
Line 239-268: renderElectionBanner()
  - ElectionCalendar.getBannerConfig() 호출
  - 'election_night' phase: config.text = '개표가 진행 중입니다. 실시간 결과를 지도에서 확인하세요.'
  - banner.innerHTML = <div class="election-banner-content banner-${config.type}">...</div>
  - banner.style.display = '' (표시)
```

**호출 시점 (app.js 확인):**
- Line 221: `Sidebar.renderElectionBanner()` — 초기 렌더링
- Line 228: 1시간마다 호출
- Line 234: `visibilitychange` 이벤트 시 호출

**D-03 개표율 배너 구현 방법:** `renderElectionBanner()`는 `getBannerConfig().text` 를 그대로 표시하는 구조. election_night phase에서 `#election-banner`의 `<span class="banner-text">` 를 직접 업데이트하거나, `_pollElectionResults()` 성공 후 별도 `_updateElectionBanner(data)` 함수를 추가해야 함.

#### js/map.js — applyElectionNightLayer
```
Line 4112-4141: applyElectionNightLayer(data)
  - data.regions에서 각 광역 key별로:
    - partyColor = ElectionData.getPartyColor(r.leadingParty)
    - alpha = Math.max((r.countRate / 100) * 0.85, 0.12)
    - declared === true → stroke '#ffffff' width 3
  - _updateVoteRateOverlay(regions) 호출 (득표율 텍스트 오버레이)
Line 4143-4175: _updateVoteRateOverlay(regions) — SVG text 오버레이
Line 4177-4187: clearElectionNightLayer() — 레이어 초기화
```

#### index.html
```
Line 95: <div id="election-banner" class="election-banner" aria-live="polite" style="display:none"></div>
  - header 아래, mobile-filter-sheet 위에 위치
  - 초기 display:none, sidebar.js renderElectionBanner()가 활성화
Line 422-434: #manual-fallback-container
  - display:none 초기값
  - Worker 장애 시 app.js _setManualFallbackMode(true)로 표시
  - #manual-fallback-input textarea, #manual-fallback-apply button, #manual-fallback-status span
```

### Pattern 1: parseNECResponse() 정규식 파싱 전략

**문제:** Worker 런타임에 DOMParser 없음. jQuery/cheerio 없음.

**접근법:** info.nec.go.kr 개표 진행 페이지는 JSP 기반 서버 사이드 렌더링 HTML 테이블이다. 실제 URL은 5/26 캡처 전까지 미확정이나, NEC 사이트 패턴(`vccp09` 메뉴 코드, `bizcommon` JSON 선택박스)으로 보면 결과는 HTML `<table>` 형태다.

**정규식 파싱 패턴 (일반적 HTML 테이블):**
```javascript
// 행 추출
const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
// 셀 추출
const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
// HTML 태그 제거
function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}
```

**NEC 개표 페이지 추정 구조 (LOW confidence — 선거일 미도래):**
- 광역지자체별 행 존재 (17개)
- 열 구성 추정: 지역명 | 개표율(%) | 후보명(1위) | 득표율(%) | 당선여부
- 당선 여부 셀에 "당선" 텍스트 또는 특정 class 표시
- 5/26 DevTools 캡처 후 실제 구조 확인 → 정규식 조정 필요

**실용적 전략 (D-01 준수):**
```javascript
function parseNECResponse(html) {
  // 1단계: 빈 HTML 방어
  if (!html || html.length < 100) {
    return { fetchedAt: new Date().toISOString(), regions: {}, _source: 'stub', _parserVersion: '0.0' };
  }

  // 2단계: 5/26 DevTools 캡처 후 실제 구조로 교체
  // 현재는 fixture 통과 수준의 정규식 skeleton만 구현
  const regions = {};
  // ... 정규식 추출 로직 (5/26 이후 완성)
  return {
    fetchedAt: new Date().toISOString(),
    electionId: NEC_CONFIG.ELECTION_ID_2026,
    sgTypecode: '11',
    regions,
    _source: 'info.nec.go.kr',
    _parserVersion: '1.0',
  };
}
```

### Pattern 2: wrangler dev 로컬 테스트

**버전:** wrangler 4.78.0 (확인됨, `npx wrangler --version`)

**테스트 명령:**
```bash
# workers/election-night/ 디렉토리에서 실행
npx wrangler dev --test-scheduled

# Cron 트리거 (별도 터미널):
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"

# 또는 wrangler dev 실행 중 터미널에서 's' 키 입력

# HTTP 결과 확인:
curl http://localhost:8787/results
curl http://localhost:8787/health
```

**로컬 KV:** Wrangler v3+는 Miniflare v3 내장. `wrangler dev` 실행 시 `.wrangler/state/` 에 자동으로 로컬 KV 시뮬레이션 생성. 별도 설정 불필요.

**KV 시딩 (선택):**
```bash
# local KV에 테스트 데이터 주입
npx wrangler kv key put "latest" "$(cat fixtures/2022-sample.json)" --binding=ELECTION_RESULTS --local
```

**시간 범위 우회:** `scheduled()` 핸들러는 KST 18:00~24:00 범위 체크 포함. 테스트 시 이 조건이 false이면 `console.log('[election-night] Outside election_night window')` 출력 후 종료. **테스트용으로 해당 시간 조건을 임시 주석처리하거나, `NEC_URL`을 직접 채워서 `handleResults()`를 통한 `/results` 응답만 검증하는 방식이 현실적.**

### Pattern 3: 배너 개표율 텍스트 업데이트

**D-03 요구사항:** `"개표 진행 중 — 전체 XX% (포단 HH:MM 기준)"`

**구현 위치:** `app.js` `_pollElectionResults()` 성공 분기 내

**현재 배너 렌더링 체인:**
1. `Sidebar.renderElectionBanner()` → `ElectionCalendar.getBannerConfig()` → 'election_night' phase시 정적 텍스트 표시
2. 개표율 동적 업데이트는 별도 함수로 구현해야 함

**추가할 함수 패턴:**
```javascript
function _updateElectionBanner(data) {
    const banner = document.getElementById('election-banner');
    if (!banner || banner.style.display === 'none') return;
    const regions = data?.regions || {};
    const rates = Object.values(regions).map(r => r.countRate).filter(v => typeof v === 'number');
    if (!rates.length) return;
    const avgRate = (rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1);
    const fetchedAt = data?.fetchedAt ? new Date(data.fetchedAt) : new Date();
    const hhmm = fetchedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    const textEl = banner.querySelector('.banner-text');
    if (textEl) {
        textEl.textContent = `개표 진행 중 — 전체 ${avgRate}% (포단 ${hhmm} 기준)`;
    }
}
```

**호출:** `_pollElectionResults()` 의 성공 분기에서 `MapModule.applyElectionNightLayer(data)` 다음 줄에 `_updateElectionBanner(data)` 추가.

**배너 표시/숨김 연동:**
- `renderElectionBanner()`가 election_night phase 진입 시 banner를 표시 (sidebar.js line 261: `banner.style.display = ''`)
- election_night 종료 시 숨김 (sidebar.js line 246: `banner.style.display = 'none'`)
- 별도 `display:block` 코드 불필요 — 기존 `renderElectionBanner()` 로직이 처리

---

## Don't Hand-Roll

| 문제 | 직접 구현 금지 | 사용할 것 | 이유 |
|---|---|---|---|
| KV 로컬 시뮬레이션 | 직접 mock 구현 | wrangler dev (Miniflare v3 내장) | 자동 처리, 별도 설정 없음 |
| Cron 트리거 로컬 테스트 | 직접 scheduler 구현 | `/__scheduled` 엔드포인트 | wrangler 표준 |
| HTML DOM 파싱 | cheerio, jsdom | 정규식/텍스트 파싱 | Worker 런타임 Node.js API 없음 |
| 개표율 계산 | 별도 라이브러리 | `Array.reduce` 평균 계산 | 단순 산술 |

---

## Common Pitfalls

### Pitfall 1: election_night 시간 범위 조건으로 로컬 테스트 실패
**What goes wrong:** `scheduled()` 핸들러가 KST 18:00~24:00 조건 체크로 항상 `console.log('Outside...')` 후 종료.
**Why it happens:** `Date.now()` 가 실제 현재 시각 (개표 시간 아님)
**How to avoid:** `/results` 엔드포인트 직접 테스트 + `wrangler kv key put` 로 KV에 fixture 주입 후 `curl http://localhost:8787/results` 로 검증. 또는 `NEC_URL`을 2022 아카이브 URL로 채워 `fetchAndParseNEC()`를 직접 호출하는 별도 test script 작성.
**Warning signs:** `[election-night] Outside election_night window, skipping poll.` 로그

### Pitfall 2: test-parser.cjs Test 6 ESM import 실패
**What goes wrong:** `import('./index.js')` 에서 오류 발생, fallback 경로로 빠져 테스트가 실제로 파서를 검증하지 않음.
**Why it happens:** `package.json` 에 `"type": "module"` 설정으로 ESM이나, Node.js 버전이나 cjs 컨텍스트에서 dynamic import 미지원 환경
**How to avoid:** `node workers/election-night/test-parser.cjs` 실행 시 Test 6 결과 로그 확인. fallback이 아닌 실제 import 경로로 실행됐는지 확인.
**Warning signs:** Test 6 PASS이지만 실제 파서 코드를 실행하지 않은 경우.

### Pitfall 3: declared: true 수학적 추정 (헌법 제2조 위반)
**What goes wrong:** 파서에서 득표율 50% 초과 등 수학적 판단으로 `declared: true` 설정
**Why it happens:** 빠른 구현 욕구
**How to avoid:** declared는 반드시 NEC HTML에서 "당선" 텍스트 또는 공식 당선 플래그 셀이 존재할 때만 true. 없으면 항상 false.
**Warning signs:** `r.declared === true && r.leadingVoteRate > 50` 패턴 코드

### Pitfall 4: 배너 텍스트가 정적으로 고정
**What goes wrong:** renderElectionBanner()만 구현하고 개표율 동적 업데이트를 빠뜨림.
**Why it happens:** 기존 배너 시스템(sidebar.js)이 이미 'election_night' 텍스트를 표시하므로 완료된 것처럼 보임.
**How to avoid:** D-03 요구사항 확인: 배너에 XX% 개표율이 실시간으로 반영되어야 함. `_updateElectionBanner()` 추가 필수.
**Warning signs:** 배너 텍스트가 "개표가 진행 중입니다. 실시간 결과를 지도에서 확인하세요." 로 고정된 경우 (sidebar.js getBannerConfig의 정적 텍스트)

### Pitfall 5: NEC URL 이 2026 ID로 교체되지 않아 2022 데이터 노출
**What goes wrong:** 5/26 캡처 후 URL은 교체하지만 `ELECTION_ID_2026` → `ELECTION_ID_2022` 구분 실수
**Why it happens:** NEC_CONFIG에 2개 ID 존재 (line 14-15)
**How to avoid:** CAPTURE-GUIDE.md에 명시: 5/26 교체 시 NEC_URL 1줄 + `electionId` 파라미터 확인

---

## Code Examples

### wrangler dev 테스트 전체 플로우
```bash
# workers/election-night 디렉토리에서 실행
cd /Users/isawufo/Desktop/AI-cording-project/korea-local-election/workers/election-night

# 1. Worker 로컬 시작
npx wrangler dev --test-scheduled

# 2. 헬스체크
curl http://localhost:8787/health
# {"status":"ok"}

# 3. KV에 fixture 주입 (optional — /results 빈 응답 우회)
npx wrangler kv key put "latest" "$(cat fixtures/2022-sample.json)" --binding=ELECTION_RESULTS --local

# 4. 결과 확인
curl http://localhost:8787/results
# fixture JSON 반환 확인

# 5. Cron 트리거 (scheduled 핸들러 실행 — 시간 범위 조건 주석 필요)
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

### test-parser.cjs 실행
```bash
node workers/election-night/test-parser.cjs
# 기대 출력:
# [PASS] 스키마 유효성 - 모든 region 필수 필드 존재
# [PASS] countRate 범위 - 0~100 내 (타입 + 범위만)
# [PASS] leadingVoteRate 범위 - 0~100 내 (타입 + 범위만)
# [PASS] declared 타입 - boolean만 허용 (string "true" 금지)
# [PASS] 17개 광역지자체 완전성 - regions 키 정확히 17개
# [PASS] parseNECResponse stub - 빈 문자열 입력 시 올바른 스키마 반환
# [PASS] fixture _notice에 "스키마 검증 전용 mock" 명시
# [PASS] fixture _description에 출처(info.nec.go.kr) 명시 (헌법 제1조)
# ---
# 8/8 tests passed
```

### KV 스키마 (확정 — CONTEXT.md)
```json
{
  "fetchedAt": "2026-06-03T18:30:00+09:00",
  "electionId": "0020260603",
  "sgTypecode": "11",
  "regions": {
    "seoul": {
      "countRate": 72.5,
      "leadingCandidate": "홍길동",
      "leadingParty": "democratic",
      "leadingVoteRate": 48.3,
      "declared": false
    }
  },
  "_source": "info.nec.go.kr",
  "_parserVersion": "1.0"
}
```

---

## NEC HTML 파싱 — 리서치 한계 및 접근법

### 확인된 사실 (HIGH confidence)
1. info.nec.go.kr 투개표 메뉴는 선거일(2026-06-03) 이전에는 데이터 없음 ("선거일(2026. 6. 3.)부터 조회 가능합니다" 확인)
2. NEC 공식 open API(`apis.data.go.kr`)는 실시간 개표 엔드포인트 없음 — 확정 결과만 제공
3. 사이트 기술 스택: JSP 서버사이드 렌더링 + jQuery + `$.getJSONTE()` 커스텀 AJAX 함수 + `electionId`/`cityCode`/`townCode` 파라미터 구조
4. 2022 아카이브 URL (`?electionId=0020220601&topMenuId=VC`) → 현재 404

### 합리적 추정 (MEDIUM confidence)
- 개표 진행 화면 URL 패턴: `https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP09&menuId=VCCP09`
- HTML 응답에 `<table>` 태그 기반 광역지자체별 개표 현황 행 존재
- 5/26 선거 1주 전 DevTools Network 탭으로 AJAX XHR URL 캡처 가능

### 확인 불가 (LOW confidence — 5/26 이후 확인 필요)
- 실제 AJAX endpoint URL 구조 (JSON vs HTML 응답)
- HTML 테이블 클래스명/ID
- 개표율 컬럼 순서 및 당선 여부 표기 방식

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | test-parser.cjs 실행 | ✓ | v24.13.0 | — |
| npm | wrangler 실행 | ✓ | 11.6.2 | — |
| wrangler | Worker 로컬 테스트 | ✓ | 4.78.0 | — |
| Cloudflare KV | Worker 데이터 저장 | ✓ (로컬 Miniflare) | — | `wrangler kv key put --local` |
| info.nec.go.kr 개표 페이지 | parseNECResponse 구현 | ✗ (선거일 미도래) | — | 2022-sample.json fixture 기반 구현 |

**Missing dependencies with no fallback:** 없음

**Missing dependencies with fallback:**
- info.nec.go.kr 실제 개표 HTML → fixture 기반 파서 skeleton 구현 + 5/26 조정

---

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | 바닐라 Node.js (jest 없음) |
| Config file | 없음 |
| Quick run command | `node workers/election-night/test-parser.cjs` |
| Full suite command | `node workers/election-night/test-parser.cjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| ELEC-01 | CAPTURE-GUIDE.md 존재 및 내용 완전성 | manual | `ls workers/CAPTURE-GUIDE.md` | ❌ Wave 0 |
| ELEC-02 | test-parser.cjs 8/8 통과 | unit | `node workers/election-night/test-parser.cjs` | ✅ |
| ELEC-02 | `/results` 응답 JSON 스키마 검증 | integration | `curl http://localhost:8787/results` | ✅ (wrangler dev 필요) |
| ELEC-03 | 지도 시각화 — applyElectionNightLayer DOM 변경 | browser UAT | 브라우저 수동 검증 | ✅ |
| ELEC-03 | 폴백 UI — #manual-fallback-container 표시 | browser UAT | 브라우저 수동 검증 | ✅ |
| ELEC-03 | 개표 배너 — 개표율 텍스트 표시 | browser UAT | 브라우저 수동 검증 | ❌ Wave 0 (코드 추가 필요) |

### Sampling Rate
- **per task commit:** `node workers/election-night/test-parser.cjs`
- **per wave merge:** `node workers/election-night/test-parser.cjs` + `curl http://localhost:8787/results` (wrangler dev 실행 중)
- **phase gate:** 위 automated 전체 통과 + browser UAT 3건 수동 확인

### Wave 0 Gaps
- [ ] `workers/CAPTURE-GUIDE.md` — ELEC-01 요건 파일
- [ ] `_updateElectionBanner()` 함수 — app.js 추가 (ELEC-03 배너 UAT 전제)

---

## Open Questions

1. **NEC 개표 진행 AJAX 엔드포인트 포맷**
   - What we know: 사이트는 JSP + jQuery `$.getJSONTE()` 사용. 파라미터 `electionId`, `cityCode`, `townCode` 패턴 확인.
   - What's unclear: JSON 응답인지 HTML 테이블인지, 광역단체장 개표율이 어떤 URL/파라미터로 조회되는지.
   - Recommendation: D-01 전략 유지. `parseNECResponse()`를 fixture 통과 수준으로 구현. 실제 포맷은 5/26 DevTools 캡처 후 `// TODO:` 마커 위치에서 조정.

2. **Worker election_night 시간 조건 로컬 테스트**
   - What we know: `scheduled()` 핸들러가 KST 18:00~24:00 외에는 실행 거부.
   - What's unclear: D-02에서 언급한 테스트가 이 조건을 어떻게 우회하는지 명시 없음.
   - Recommendation: 플래너는 테스트 Wave에서 시간 조건 임시 주석 처리 또는 `wrangler kv key put --local` 로 KV 직접 주입 후 `/results` 검증하는 방식을 명시할 것.

---

## Sources

### Primary (HIGH confidence)
- 직접 코드 읽기: `workers/election-night/index.js` (전체)
- 직접 코드 읽기: `workers/election-night/test-parser.cjs` (전체)
- 직접 코드 읽기: `workers/election-night/fixtures/2022-sample.json` (전체)
- 직접 코드 읽기: `workers/election-night/wrangler.toml`
- 직접 코드 읽기: `js/app.js` line 996~1110
- 직접 코드 읽기: `js/map.js` line 4108~4187
- 직접 코드 읽기: `js/sidebar.js` line 238~268
- 직접 코드 읽기: `js/election-calendar.js` 전체
- 직접 코드 읽기: `index.html` line 88~105, 421~434
- Cloudflare 공식 문서: https://developers.cloudflare.com/workers/configuration/cron-triggers/ — `--test-scheduled`, `/__scheduled` 엔드포인트
- Cloudflare 공식 문서: https://developers.cloudflare.com/workers/development-testing/local-data/ — 로컬 KV seeding 명령

### Secondary (MEDIUM confidence)
- WebFetch info.nec.go.kr 현재 페이지: JSP + jQuery + `$.getJSONTE()` AJAX 패턴, 투개표 메뉴 선거일부터 조회 가능 확인
- `npx wrangler --version` 실행: 4.78.0 확인

### Tertiary (LOW confidence)
- NEC 개표 HTML 테이블 구조: 직접 확인 불가 (선거일 미도래). 2022 아카이브 404.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 코드 직접 확인, wrangler 버전 실측
- Architecture: HIGH — 모든 함수 위치, 라인 번호, 인터페이스 직접 확인
- NEC HTML 포맷: LOW — 선거일 미도래, 2022 아카이브 접근 불가
- Wrangler 테스트 방법: HIGH — 공식 문서 확인

**Research date:** 2026-03-30
**Valid until:** 2026-05-26 (NEC URL 캡처 시점까지 유효. 이후 parseNECResponse 조정 필요)
