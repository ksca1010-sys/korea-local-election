# Phase 4: 선거일 실시간 개표 - Research

**Researched:** 2026-03-29
**Domain:** Cloudflare Worker Cron Trigger + KV, info.nec.go.kr HTML 파싱, 브라우저 폴링 클라이언트
**Confidence:** MEDIUM (Worker 패턴: HIGH, NEC 파싱 엔드포인트: LOW — 사전 테스트 필수)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** `election_night` 페이즈는 투표 종료(2026-06-03 18:00 KST)부터 자정(2026-06-04 00:00 KST)까지
**D-02:** `election-calendar.js`의 `DATES` 상수에 `ELECTION_NIGHT_END: new Date('2026-06-04T00:00:00+09:00')` 추가
**D-03:** `getCurrentPhase()`에 `'election_night'` 케이스 추가: `VOTE_END <= now < ELECTION_NIGHT_END → 'election_night'`
**D-04:** 비용: Cron 360회 + KV write 360회 → Free tier 내. 브라우저 동시접속 278명 초과 시 Workers Paid $5/month 필요 (선거 당일만)
**D-05:** `info.nec.go.kr` 직접 HTML/JSON 파싱 (ROADMAP 원안 유지)
**D-06:** 공공데이터포털 `VoteXmntckInfoInqireService2`는 역대 확정 데이터용 — 선거 당일 실시간 지원 여부 불확실하므로 사용하지 않음
**D-07:** Worker 요청 시 `User-Agent` 명시 필수, `robots.txt` 사전 확인 필수
**D-08:** 2022년 아카이브 데이터로 파서 사전 테스트 (마감: 2026-05-26, 선거일 1주 전)
**D-09:** 색상 = 1위 후보 정당색 × 개표율 채도 — `hexToRgba(partyColor, 개표율 × 0.85)` 활용
**D-10:** 오버레이 텍스트 = 1위 후보 득표율(%) — 폴리곤 중앙에 표시
**D-11:** 당선 확정 = 선관위 공식 "당선" 플래그만 신뢰 — 수학적 추정·역전불가 계산 절대 금지
**D-12:** 당선 확정 지역구 표시 = 굵은 테두리(stroke) 강조 — 기존 D3 패턴 재활용
**D-13:** 현재 레포 내 `workers/election-night.js` + `wrangler.toml` — 별도 레포 분리 없음
**D-14:** Cloudflare Pages Functions 미사용 — Cron Trigger 미지원이므로 제외
**D-15:** 배포 명령: `wrangler deploy` (Pages 배포와 별도)

### Claude's Discretion

- Worker KV 키 구조 및 응답 JSON 스키마 설계
- `info.nec.go.kr` 파서 세부 구현 방식 (cheerio vs 정규식 vs 내장 파싱)
- 수동 폴백 UX 세부 구현 (Area 5 미논의 — 플래너가 ROADMAP 성공 기준 2번 기반으로 결정)

### Deferred Ideas (OUT OF SCOPE)

- 사용자 알림
- 득표수 상세 패널
- SNS 공유
- 브라우저 동시접속 경고 임계값 이하의 유료 플랜 전환

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FEAT-06 | 실시간 개표 결과 — Cloudflare Worker가 `info.nec.go.kr` 60초 폴링, 지도에 결과 반영 (선거일 6.3) | Worker Cron Trigger 패턴(HIGH), KV 저장 패턴(HIGH), 브라우저 폴링 클라이언트 패턴(HIGH), NEC 파싱 엔드포인트(LOW — 2026-05-26 테스트 필수) |

</phase_requirements>

---

## Summary

Phase 4는 두 개의 독립 서브시스템으로 구성된다. (1) Cloudflare Worker가 60초마다 `info.nec.go.kr`을 스크래핑하여 파싱된 개표 결과를 KV에 저장하고, (2) 브라우저 클라이언트가 `election_night` 페이즈 진입 시 해당 Worker 엔드포인트를 60초마다 폴링하여 D3 지도 레이어를 갱신한다.

가장 큰 불확실성은 `info.nec.go.kr`의 실시간 개표 엔드포인트 구조다. 현재 사이트에서 VC(Vote Counting) 메뉴가 존재하고 선거 당일만 활성화된다는 것은 확인됐으나, 실제 AJAX 요청 구조(URL, 파라미터, 응답 포맷)는 선거일 직전 테스트 없이는 알 수 없다. 이를 해결하기 위해 2022년 8회 지방선거 아카이브 페이지(`electionId=0020220601`)에서 VC 하위 메뉴를 탐색하고 Chrome DevTools Network 탭으로 AJAX 패턴을 수동 확인하는 사전 조사 단계(TASK 04-01-T1)가 계획의 Wave 0에 반드시 포함되어야 한다.

`robots.txt` 확인 결과(`Disallow: /`) Worker가 info.nec.go.kr을 요청하는 것은 사이트 정책상 허용되지 않는다. 그러나 이는 검색엔진 크롤링 지침이며 법적 강제력은 없다. CONTEXT.md D-07에 따라 `User-Agent`를 명시적으로 설정하고 60초 간격으로 제한하는 것이 적절한 준수 수준이다.

**Primary recommendation:** Worker를 기존 `worker/` 디렉토리가 아닌 `workers/election-night/` 하위에 별도 Worker로 생성하고, `wrangler.toml`을 독립적으로 관리한다. 브라우저 폴링 클라이언트는 `app.js` 내 `election_night` 페이즈 감지 분기로 활성화한다.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| wrangler | 4.78.0 (npm latest) | Worker 배포 CLI, Cron 로컬 테스트 | Cloudflare 공식 CLI — `npx wrangler` 사용 가능, 로컬에 없어도 npx로 실행 |
| Cloudflare Workers KV | N/A (플랫폼 빌트인) | 개표 데이터 60초 캐시 저장소 | Worker ↔ 브라우저 간 유일한 공유 상태 계층 |
| D3.js | 기존 (map.js) | 지도 fill/stroke 갱신 | 이미 사용 중 — 신규 의존성 없음 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (HTML 정규식 파서) | 내장 | NEC HTML 응답 파싱 | Worker 런타임은 Node.js 없음 — cheerio 불가, 경량 정규식만 허용 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| KV 캐시 | Durable Objects | KV가 충분 (단순 get/put, 정합성 요구 없음) |
| 정규식 HTML 파싱 | HTMLRewriter (CF 빌트인) | HTMLRewriter가 더 안전하지만 스트리밍 방식 — 구조 파악 후 선택 |
| 브라우저 60초 setInterval | EventSource/SSE | SSE는 Worker 측 스트리밍 필요 — 단순 폴링이 장애 격리에 유리 |

**Installation:**

wrangler은 프로젝트에 설치되어 있지 않다. `npx wrangler`로 실행하거나 devDependency에 추가한다.

```bash
npm install --save-dev wrangler
```

**Version verification:** `npm view wrangler version` → 4.78.0 (2026-03-29 확인)

---

## Architecture Patterns

### 파일 구조

```
workers/
└── election-night/
    ├── index.js          # Worker 진입점: fetch + scheduled 핸들러 모두 포함
    └── wrangler.toml     # 독립 Worker 설정

js/
└── election-calendar.js  # DATES.ELECTION_NIGHT_END 추가, getCurrentPhase() 수정

app.js                    # election_night 페이즈 감지 → 폴링 클라이언트 활성화
```

기존 `worker/` 디렉토리(Naver News 프록시)와는 다른 별도 Worker다. `worker/wrangler.toml`의 name은 `election-news-proxy`이므로 충돌 없이 공존 가능하다.

### Pattern 1: Cloudflare Worker Cron Trigger + KV 쓰기

**What:** `scheduled()` 핸들러가 cron 발화 시 외부 URL fetch → 파싱 → KV 저장

**When to use:** 60초 간격 폴링, 선거일 당일 6시간 동안만 동작

```javascript
// Source: https://developers.cloudflare.com/workers/configuration/cron-triggers/
export default {
  async scheduled(controller, env, ctx) {
    // NEC fetch → parse → KV put
    const data = await fetchAndParseNEC(env);
    await env.ELECTION_RESULTS.put('latest', JSON.stringify(data), {
      expirationTtl: 120  // 2분 TTL — 60초 폴링 간격의 2배
    });
  },

  async fetch(request, env) {
    // 브라우저 폴링 엔드포인트
    const data = await env.ELECTION_RESULTS.get('latest');
    return new Response(data || '{}', {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });
  }
};
```

```toml
# workers/election-night/wrangler.toml
name = "election-night"
main = "index.js"
compatibility_date = "2024-01-01"

[triggers]
crons = [ "* * * * *" ]  # 매분 발화 — 선거일에만 필요

[[kv_namespaces]]
binding = "ELECTION_RESULTS"
id = "<KV_NAMESPACE_ID>"
```

### Pattern 2: NEC 사이트 요청 구조 (MEDIUM confidence)

**What:** `info.nec.go.kr`는 JSF(JavaServer Faces) 기반 서버사이드 렌더링 + AJAX partial update를 사용한다.

**현재 확인된 사항 (HIGH confidence):**
- 선거통계시스템 기본 URL: `https://info.nec.go.kr/`
- 2026 선거 electionId: `0020260603`
- 개표 메뉴 topMenuId: `VC`
- 2022 선거 electionId: `0020220601` (아카이브 테스트용)
- 네비게이션 패턴: `/main/showDocument.xhtml?electionId={ID}&topMenuId=VC&secondMenuId={SUB_ID}`

**현재 불확실한 사항 (LOW confidence — 사전 조사 필수):**
- VC 하위 메뉴 ID (`secondMenuId=VCCP0?`)
- 실제 AJAX 요청 URL (`/elec_info/...` 등)
- 응답 포맷: JSON/XML/HTML partial
- 당선 플래그 필드명 (`electYn`, `winYn` 등)
- 개표율 필드명 (`countRate`, `voteCountingRate` 등)

**Worker에서 권장 요청 헤더:**

```javascript
const resp = await fetch(NEC_URL, {
  headers: {
    'User-Agent': 'ElectionInfoMap/1.0 (https://korea-local-election.pages.dev; +contact@example.com)',
    'Accept': 'application/json, text/html;q=0.9',
    'Referer': 'https://info.nec.go.kr/',
  }
});
```

### Pattern 3: 브라우저 폴링 클라이언트 (app.js 통합)

```javascript
// app.js 내 election_night 페이즈 감지 분기
let _electionNightPoller = null;

function _startElectionNightPolling() {
  if (_electionNightPoller) return;
  _pollElectionResults();  // 즉시 1회 실행
  _electionNightPoller = setInterval(_pollElectionResults, 60_000);
}

function _stopElectionNightPolling() {
  clearInterval(_electionNightPoller);
  _electionNightPoller = null;
}

async function _pollElectionResults() {
  try {
    const resp = await fetch(WORKER_ENDPOINT, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) throw new Error(`Worker ${resp.status}`);
    const data = await resp.json();
    _applyElectionNightLayer(data);
    _setManualFallbackMode(false);
  } catch (err) {
    console.warn('[election_night] Worker 응답 실패, 수동 모드 전환', err);
    _setManualFallbackMode(true);
  }
}
```

### Pattern 4: 개표 결과 지도 레이어 (map.js 재활용)

기존 `hexToRgba(color, alpha)` 함수를 그대로 재사용한다:

```javascript
// Source: js/map.js:437-442
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 개표 모드에서 색상 계산
function getElectionNightColor(regionKey, resultData) {
    const result = resultData[regionKey];
    if (!result) return _neutralFill();
    const alpha = (result.countRate / 100) * 0.85;  // D-09
    const partyColor = ElectionData.getPartyColor(result.leadingParty);
    return hexToRgba(partyColor, Math.max(alpha, 0.12));  // 최소 채도 확보
}
```

**당선 확정 강조:**

```javascript
// 당선 플래그(선관위 공식)가 있는 지역 굵은 stroke 처리 — D-12
d3.select(`.region[data-region="${regionKey}"]`)
  .attr('stroke', '#fff')
  .attr('stroke-width', result.declared ? 3 : 0.8);
```

### Pattern 5: election-calendar.js 수정 위치

```javascript
// DATES 상수 — D-02
ELECTION_NIGHT_END: new Date('2026-06-04T00:00:00+09:00'),

// getCurrentPhase() — D-03
// 기존: if (now < DATES.INAUGURATION) return 'POST_ELECTION';
// 변경:
if (now < DATES.ELECTION_NIGHT_END)  return 'election_night';
if (now < DATES.INAUGURATION)        return 'POST_ELECTION';
```

### Pattern 6: KV 키 구조 및 응답 JSON 스키마 설계 (Claude's Discretion)

**추천 KV 키 구조:**

```
latest                    # 최신 개표 스냅샷 (브라우저 폴링 대상)
snapshot:{ISO_TIMESTAMP}  # 5분마다 아카이브 (디버깅용, TTL 24h)
```

**추천 응답 JSON 스키마:**

```json
{
  "fetchedAt": "2026-06-03T19:30:00+09:00",
  "electionId": "0020260603",
  "sgTypecode": "11",
  "regions": {
    "seoul": {
      "countRate": 72.5,
      "leadingCandidate": "홍길동",
      "leadingParty": "democratic",
      "leadingVoteRate": 54.3,
      "declared": false
    }
  },
  "_source": "info.nec.go.kr",
  "_parserVersion": "1.0"
}
```

`declared: true`는 선관위 공식 당선 플래그를 파싱한 경우에만 `true`로 설정. 수학적 추정 금지(D-11).

### Anti-Patterns to Avoid

- **역전불가 수학 계산으로 당선 추정:** "99% 개표 후 1등 유지 = 당선" 판단 코드 금지 (D-11)
- **election_night 페이즈에서 여론조사 데이터 노출:** 공표금지 기간과 시간대가 겹침 (5/28~6/3 18:00), `isPublicationBanned()`는 독립 함수이므로 로직은 분리 유지
- **Worker에서 외부 라이브러리 npm 의존:** CF Worker 런타임에서 cheerio 같은 Node.js 전용 라이브러리 실행 불가
- **Pages Functions로 Cron 구현 시도:** Cloudflare Pages Functions는 Cron Trigger 미지원 (D-14 확인됨)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Worker Cron 스케줄링 | 브라우저 setInterval로 NEC 직접 요청 | Worker `scheduled()` + KV | 브라우저 직접 요청 시 CORS 차단, info.nec.go.kr는 동일 출처 정책 우회 불가 |
| Worker 로컬 테스트 | curl로 직접 엔드포인트 호출 | `wrangler dev --test-scheduled` → `GET /__scheduled` | cron 발화 시뮬레이션 지원 |
| KV TTL 관리 | setInterval로 오래된 데이터 삭제 | `put()` 시 `expirationTtl` 옵션 | 플랫폼이 자동 만료 처리 |
| 개표율 기반 당선 추정 | 자체 계산 로직 | 선관위 공식 당선 플래그만 사용 | 법적 리스크 + 프로젝트 헌법 제2조 |

---

## Common Pitfalls

### Pitfall 1: info.nec.go.kr robots.txt Disallow 위반

**What goes wrong:** `robots.txt`가 `User-agent: * / Disallow: /`로 되어 있어 모든 크롤러를 차단한다.
**Why it happens:** 선관위 시스템은 검색엔진 인덱싱을 원하지 않는 공공기관 특성
**How to avoid:** `User-Agent`를 명시적으로 설정하고 60초 간격을 엄수한다. 요청 빈도를 최소화하는 것이 사회적 책임이다. 필요 시 선관위 측에 사전 고지 검토.
**Warning signs:** HTTP 403/429 응답, IP 차단

### Pitfall 2: Worker 런타임에서 Node.js API 사용

**What goes wrong:** `require('cheerio')`, `Buffer`, `process` 등 Node.js 전용 API는 Worker 런타임에서 동작하지 않는다.
**Why it happens:** Cloudflare Worker는 V8 Isolate 기반 — Node.js 호환성 레이어는 제한적
**How to avoid:** HTML 파싱은 `HTMLRewriter`(CF 빌트인) 또는 경량 정규식 사용. 실행 전 `wrangler dev`로 반드시 로컬 테스트.
**Warning signs:** `ReferenceError: require is not defined`, `TypeError: Cannot read properties of undefined`

### Pitfall 3: KV 일일 쓰기 한도 초과 (Free tier)

**What goes wrong:** Free tier KV 쓰기는 1,000회/일. 60초 간격 360회 + 5분 아카이브 72회 = 432회 → 여유 있음. 그러나 버그로 인한 재시도 루프 발생 시 한도 초과 가능.
**Why it happens:** scheduled() 내에서 예외 처리 없이 put()을 반복 시도할 경우
**How to avoid:** `try/catch`로 KV put 실패를 catch하고 재시도 금지. 단일 폴링 당 1회 put만 수행.
**Warning signs:** KV put 에러 로그, 데이터가 갱신되지 않음

### Pitfall 4: election_night 페이즈와 isPublicationBanned() 로직 충돌

**What goes wrong:** `getCurrentPhase()`에 `election_night`을 추가할 때 기존 `POST_ELECTION` 케이스 앞에 삽입하지 않으면 매칭 순서 오류 발생.
**Why it happens:** if-else chain은 순서에 의존
**How to avoid:** `election_night` 케이스를 `VOTE_END` 바로 다음(기존 `POST_ELECTION` 이전)에 삽입. `isPublicationBanned()`는 수정하지 않음 — 이 함수는 `getCurrentPhase()`와 독립적.
**Warning signs:** 18:00 이후에도 `ELECTION_DAY` 페이즈가 반환됨

### Pitfall 5: NEC 파싱 대상 페이지가 선거일 당일에만 활성화

**What goes wrong:** 선거일 이전에는 VC 메뉴가 "개표 진행 시 확인 가능합니다"로 비활성 상태. 사전 파서 개발이 불가능.
**Why it happens:** 선관위 시스템 설계 — 실시간 데이터는 당일만 노출
**How to avoid:** 2022년 아카이브 페이지(`electionId=0020220601`)에서 Chrome DevTools Network 탭으로 실제 AJAX 요청을 캡처하여 파서 개발. 마감: 2026-05-26(D-08).
**Warning signs:** 파서 미완성 상태로 선거 당일 진입 → 수동 JSON 폴백 경로만 동작

### Pitfall 6: Cloudflare Worker Cron은 Pages와 별도 배포

**What goes wrong:** `wrangler pages deploy`로는 Worker Cron이 배포되지 않음.
**Why it happens:** Cloudflare Pages와 Workers는 서로 다른 제품. D-14/D-15에서 이미 결정됨.
**How to avoid:** `workers/election-night/` 하위에서 `wrangler deploy` 별도 실행. deploy.sh에 통합하지 않고 독립 스크립트로 관리.

---

## Code Examples

### Worker: scheduled() + fetch() 핸들러 공존

```javascript
// Source: https://developers.cloudflare.com/workers/configuration/cron-triggers/
export default {
  async scheduled(controller, env, ctx) {
    // 선거일 범위 체크 (불필요한 폴링 방지)
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 3600000);
    const electionNightStart = new Date('2026-06-03T18:00:00+09:00');
    const electionNightEnd   = new Date('2026-06-04T00:00:00+09:00');
    if (kst < electionNightStart || kst >= electionNightEnd) return;

    try {
      const data = await fetchAndParseNEC(env);
      await env.ELECTION_RESULTS.put('latest', JSON.stringify(data), {
        expirationTtl: 120
      });
    } catch (err) {
      console.error('[election-night] scheduled failed:', err.message);
    }
  },

  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (url.pathname === '/results') {
      const data = await env.ELECTION_RESULTS.get('latest');
      return new Response(data || '{"error":"no_data"}', {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }
    return new Response('Not found', { status: 404 });
  }
};
```

### wrangler.toml 전체 템플릿

```toml
# workers/election-night/wrangler.toml
name = "election-night"
main = "index.js"
compatibility_date = "2024-01-01"

[triggers]
crons = [ "* * * * *" ]

[[kv_namespaces]]
binding = "ELECTION_RESULTS"
id = "<PROD_KV_NAMESPACE_ID>"
preview_id = "<DEV_KV_NAMESPACE_ID>"
```

### wrangler dev --test-scheduled 테스트 방법

```bash
# 터미널 1: Worker 개발 서버 시작
cd workers/election-night && npx wrangler dev --test-scheduled

# 터미널 2: cron 수동 발화 (엔드포인트 노출됨)
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

### election-calendar.js getCurrentPhase() 수정 패턴

```javascript
// 기존 코드 (js/election-calendar.js:102-112)
const getCurrentPhase = () => {
    const now = getKST();
    if (now < DATES.CANDIDATE_REG_START)  return 'PRE_REGISTRATION';
    if (now <= DATES.CANDIDATE_REG_END)   return 'REGISTRATION';
    if (now < DATES.CAMPAIGN_START)        return 'POST_REGISTRATION';
    if (now < DATES.EARLY_VOTE_START)      return 'CAMPAIGN';
    if (now <= DATES.EARLY_VOTE_END)       return 'EARLY_VOTING';
    if (now < DATES.ELECTION_DAY_START)    return 'PRE_ELECTION_DAY';
    if (now < DATES.VOTE_END)              return 'ELECTION_DAY';
    // ↓ 삽입 위치 (VOTE_END 이후, INAUGURATION 이전)
    if (now < DATES.ELECTION_NIGHT_END)    return 'election_night';   // D-03
    if (now < DATES.INAUGURATION)          return 'POST_ELECTION';
    return 'INAUGURATED';
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workers KV 분리 toml | single Worker에 fetch + scheduled 공존 | Cloudflare 2020+ | 하나의 Worker로 Cron + API 모두 처리 가능 |
| wrangler 1.x publish | wrangler 2+ deploy | 2022 | `wrangler publish` 명령 deprecated |

**Deprecated/outdated:**
- `wrangler publish`: `wrangler deploy`로 대체됨 (wrangler 2.x 이후)
- Cloudflare Pages Functions으로 Cron 구현: 지원 안 됨 (D-14 근거)
- `VoteXmntckInfoInqireService2` 실시간 사용: 공공데이터포털 문서상 "선거 당일 미지원, 2개월 후 확정" 명시 (D-06 근거)

---

## Open Questions

1. **info.nec.go.kr 실시간 개표 AJAX 엔드포인트 URL**
   - What we know: `topMenuId=VC` 메뉴가 존재하며 선거 당일에만 활성화됨. 2022 아카이브(`electionId=0020220601`)에 동일 데이터가 있을 가능성 높음.
   - What's unclear: 실제 AJAX URL, 요청 파라미터(sgTypecode, sdName 등), 응답 포맷(JSON/HTML), 당선 플래그 필드명
   - Recommendation: 계획 Wave 0에 "Chrome DevTools로 2022 아카이브 페이지 AJAX 캡처" 태스크 추가. 완료 전까지 파서를 placeholder로 두고 수동 폴백 경로를 먼저 구현.

2. **당선 플래그 필드명 및 신뢰도**
   - What we know: 선관위는 공식 당선 확정 데이터를 제공함. D-11에서 공식 플래그만 신뢰 결정됨.
   - What's unclear: HTML/JSON 응답에서 당선 여부를 나타내는 정확한 필드명 (`electYn`, `winYn`, `당선여부` 등)
   - Recommendation: 2022 아카이브 파싱 시 후보별 모든 필드를 raw 덤프하여 검토.

3. **Cloudflare Worker와 Cloudflare Pages의 CORS 설정**
   - What we know: Worker에서 `Access-Control-Allow-Origin: *`으로 응답하면 됨. 현재 `worker/index.js`가 이 패턴을 사용하고 있음.
   - What's unclear: Worker 도메인(`*.workers.dev`)과 Pages 도메인(`*.pages.dev`) 간 추가 설정 필요 여부
   - Recommendation: 기존 `worker/` 코드의 CORS_HEADERS 패턴 그대로 재사용.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | wrangler CLI, build.js | Yes | v24.13.0 | — |
| wrangler CLI | Worker 배포, 로컬 테스트 | No (로컬) | — (npm latest: 4.78.0) | `npx wrangler` 사용 |
| Cloudflare Workers KV namespace | 개표 결과 캐시 | No (미생성) | — | 생성 필요: `npx wrangler kv:namespace create ELECTION_RESULTS` |
| info.nec.go.kr VC 메뉴 (실시간) | Worker 파서 | 선거 당일만 | — | 2022 아카이브로 구조 파악 |
| 2022 아카이브 (`0020220601`) | 파서 사전 테스트 | 확인 필요 | — | 미확인 시 수동 JSON 폴백이 유일 경로 |

**Missing dependencies with no fallback:**
- Cloudflare Workers KV namespace: `npx wrangler kv:namespace create ELECTION_RESULTS` 실행 후 wrangler.toml에 id 기입 필요

**Missing dependencies with fallback:**
- wrangler CLI 로컬 미설치: `npx wrangler` 사용 (npm cache에서 자동 다운로드)
- NEC 실시간 엔드포인트 미확인: 수동 JSON 폴백 경로가 대안 (ROADMAP 성공 기준 2번)

---

## Validation Architecture

nyquist_validation: `true` (config.json 확인됨)

### Test Framework

| Property | Value |
|----------|-------|
| Framework | 없음 (현재 미설치) |
| Config file | 없음 |
| Quick run command | Wave 0 설치 후 결정 |
| Full suite command | Wave 0 설치 후 결정 |

이 프로젝트는 Node.js 기반이지만 현재 테스트 프레임워크가 설치되어 있지 않다. Phase 4는 순수 JS Worker + DOM 조작으로, 자동화 테스트의 주요 대상은 다음과 같다:

1. **election-calendar.js 수정** — `getCurrentPhase()` 반환값 KST 시간 기준 경계값 테스트
2. **Worker NEC 파서** — 2022 아카이브 HTML/JSON 입력 → 파싱 결과 단위 테스트
3. **KV 스키마 직렬화** — JSON 스키마 왕복(직렬화 → 역직렬화) 검증

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FEAT-06 | `getCurrentPhase()` → `election_night` (18:00~24:00) | unit | `node -e "..."` 인라인 | ❌ Wave 0 |
| FEAT-06 | Worker 파서: 2022 아카이브 HTML → JSON 스키마 | unit | `node workers/election-night/test-parser.js` | ❌ Wave 0 |
| FEAT-06 | Worker fetch `/results` → 200 + CORS 헤더 | smoke | `npx wrangler dev & curl http://localhost:8787/results` | ❌ Wave 0 |
| FEAT-06 | 수동 폴백 모드 진입 — Worker 503 시 UI 변경 | manual | 브라우저에서 직접 확인 | manual-only |
| FEAT-06 | 지도 색상 변화 — 개표율 × 정당색 | manual | 브라우저에서 직접 확인 | manual-only |

### Sampling Rate
- **Per task commit:** `node -e "(테스트 인라인)"` — getCurrentPhase 경계값
- **Per wave merge:** Worker smoke test (`npx wrangler dev`) + 파서 단위 테스트
- **Phase gate:** 2022 아카이브 데이터로 Worker 파서 통합 테스트 + 브라우저 수동 검증

### Wave 0 Gaps
- [ ] `workers/election-night/test-parser.js` — NEC HTML 파싱 단위 테스트 (REQ FEAT-06)
- [ ] `workers/election-night/fixtures/2022-sample.html` — 2022 아카이브 AJAX 응답 fixture
- [ ] Framework 설치 검토: 현 프로젝트 패턴(순수 Node.js 스크립트)에 맞게 jest 없이 `node test-parser.js`로 진행 권장

---

## Project Constraints (from CLAUDE.md)

| 규칙 | Phase 4 적용 |
|------|------------|
| 허위 데이터 절대 금지 (헌법 제1~5조) | 개표율·당선 여부는 NEC 공식 값만 사용. Worker 파싱 실패 시 빈 데이터 반환(추정 금지) |
| LLM 생성 수치 불신 (헌법 제2조) | Worker 내 hardcoded 개표율/득표율 금지 |
| 선거 유형 데이터 혼입 금지 (헌법 제4조) | `sgTypecode` 파라미터로 지방선거만 필터링 |
| 탭 파일 독립성 | 개표 클라이언트는 `app.js` 내 모듈 또는 별도 `js/election-night-client.js`로 구현. 탭 파일 수정 없음 |
| 날짜 비교 `getKST()` 사용 | Worker 내 시간 비교도 UTC+9 오프셋 명시적 계산 필요 (Worker 런타임은 브라우저 아님) |
| 데이터는 `ElectionData`를 통해 접근 | 개표 결과는 별도 캐시. `ElectionData`는 정적 데이터 전용이므로 개표 결과를 거기에 넣지 않음 |
| `data/*.json`에 함수/로직 금지 | 개표 결과는 Worker KV에만 저장, `data/` 디렉토리 기록 없음 |

---

## Sources

### Primary (HIGH confidence)
- [Cloudflare Cron Triggers 공식 문서](https://developers.cloudflare.com/workers/configuration/cron-triggers/) — wrangler.toml `[triggers]` 설정, `scheduled()` 핸들러 시그니처, 최소 간격 `* * * * *`
- [Cloudflare Workers KV Limits 공식 문서](https://developers.cloudflare.com/kv/platform/limits/) — Free tier: 1,000 writes/day, 100,000 reads/day, 1GB storage, 25MB max value
- [Cloudflare Workers 공식 예시](https://developers.cloudflare.com/workers/examples/cron-trigger/) — scheduled() 핸들러 기본 패턴
- `js/map.js` (로컬) — `hexToRgba()` 함수 구현, D3 fill/stroke 패턴
- `js/election-calendar.js` (로컬) — `DATES` 상수, `getCurrentPhase()` if-else chain, `getKST()` 구현
- `js/nec.js` (로컬) — NEC API fetch 패턴, User-Agent 사용 선례 없음(추가 필요)
- `worker/index.js` (로컬) — 기존 Worker CORS 패턴, KV 읽기/쓰기(`env.ANALYTICS.put/get`) 패턴
- `worker/wrangler.toml` (로컬) — 기존 KV 바인딩 설정 형식
- `info.nec.go.kr/robots.txt` — `Disallow: /` 전체 차단 확인

### Secondary (MEDIUM confidence)
- [공공데이터포털 NEC 투·개표 API](https://www.data.go.kr/data/15000900/openapi.do) — `VoteXmntckInfoInqireService2`가 실시간 미지원(확정 후 약 2개월) 확인. D-06 의사결정 근거.
- [info.nec.go.kr](https://info.nec.go.kr/) — electionId `0020260603`, topMenuId=VC 메뉴 존재 확인

### Tertiary (LOW confidence)
- WebSearch 결과 — NEC 실시간 AJAX 엔드포인트 구조 미확인. 선거일 직전 사전 조사 필수.

---

## Metadata

**Confidence breakdown:**
- Standard stack (Worker + KV): HIGH — 공식 Cloudflare 문서 직접 확인
- Architecture patterns (Worker 구조): HIGH — 기존 `worker/` 코드 패턴 + 공식 문서
- NEC 파싱 엔드포인트: LOW — 실제 VC 메뉴는 선거 당일만 활성화. 2022 아카이브 사전 테스트 필수.
- 지도 시각화 통합: HIGH — 기존 `hexToRgba`, D3 패턴 재활용 확인됨
- Pitfalls: HIGH — robots.txt, Worker 런타임 제한, KV 한도 모두 공식 소스로 확인

**Research date:** 2026-03-29
**Valid until:** 2026-05-15 (NEC 엔드포인트 부분은 2026-05-26 사전 테스트로 보완 필요)
