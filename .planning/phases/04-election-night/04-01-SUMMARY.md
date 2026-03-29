---
phase: 04-election-night
plan: "01"
subsystem: election-night-worker
tags: [cloudflare-worker, kv, cron, election-calendar, parser, unit-test]
dependency_graph:
  requires: []
  provides: [election_night-phase, worker-skeleton, nec-parser-stub, 2022-fixture]
  affects: [js/election-calendar.js, app.js]
tech_stack:
  added: [Cloudflare Workers KV, wrangler, ESM Worker]
  patterns: [scheduled-cron-trigger, kv-put-get, cors-headers, stub-tdd]
key_files:
  created:
    - workers/election-night/index.js
    - workers/election-night/wrangler.toml
    - workers/election-night/package.json
    - workers/election-night/fixtures/2022-sample.json
    - workers/election-night/test-parser.cjs
  modified:
    - js/election-calendar.js
decisions:
  - election_night phase covers 2026-06-03 18:00 ~ 06-04 00:00 KST (per D-01~D-03)
  - workers/election-night/ directory structure (not single-file) per Cloudflare Worker standard
  - test-parser.cjs (.cjs extension) to coexist with ESM Worker in same directory
  - fetchAndParseNEC is a stub until NEC AJAX URL confirmed via 2022 archive (deadline 2026-05-26)
  - declared field may only be set from official NEC flag, never mathematical estimation (D-11, 헌법 제2조)
metrics:
  duration: "~25 minutes"
  completed: "2026-03-29"
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 2
worker_url: "https://election-night.ksca1010.workers.dev"
kv_namespace_id: "db737acc9d624075bab261c60628f95c"
---

# Phase 04 Plan 01: Worker 인프라 구축 Summary

**One-liner:** Cloudflare Worker(election-night) 배포 완료 — KV 기반 60초 폴링 스케줄러 + /results+/health 엔드포인트, election_night 페이즈 감지(18:00~24:00 KST), 2022 fixture 파서 테스트 8/8 통과. Worker URL: https://election-night.ksca1010.workers.dev

---

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | election_night 페이즈 추가 + Worker 디렉토리 골격 생성 | 8225107 | js/election-calendar.js, workers/election-night/index.js, workers/election-night/wrangler.toml |
| 2 | 2022 아카이브 fixture 생성 + 파서 단위 테스트 작성 | 6fdd38d | workers/election-night/fixtures/2022-sample.json, workers/election-night/test-parser.cjs, workers/election-night/package.json |
| 3 | Worker 배포 + URL 확정 | 1a152b3 | workers/election-night/wrangler.toml (KV id 확정, Worker 배포 완료) |

---

## What Was Built

### js/election-calendar.js

- `DATES.ELECTION_NIGHT_END = new Date('2026-06-04T00:00:00+09:00')` 추가
- `getCurrentPhase()`에 `if (now < DATES.ELECTION_NIGHT_END) return 'election_night';` 삽입 (POST_ELECTION 바로 위)
- `getBannerConfig()` switch문에 `case 'election_night':` 추가 (개표 진행 중 배너)
- 기존 POST_ELECTION 케이스의 `2026-06-04T06:00:00` 분기 제거 (election_night이 담당하므로 불필요)

### workers/election-night/index.js

- `scheduled(controller, env, ctx)`: KST 범위(18:00~24:00) 체크 → `fetchAndParseNEC(env)` 호출 → `env.ELECTION_RESULTS.put('latest', ..., { expirationTtl: 120 })`. try/catch로 감싸고 console.error 출력.
- `fetch(request, env)`: OPTIONS preflight → `/results` (KV get) → `/health` (200 ok) → 404
- `fetchAndParseNEC(env)`: stub 구현 (NEC_URL placeholder). User-Agent 명시 (D-07).
- `parseNECResponse(html)`: stub 구현 (regions: {} 반환)
- `export { parseNECResponse, NEC_CONFIG }` — 테스트용 named export

### workers/election-night/wrangler.toml

- `name = "election-night"`, `crons = [ "* * * * *" ]`
- `binding = "ELECTION_RESULTS"` (KV), `id = "<KV_NAMESPACE_ID>"` placeholder

### workers/election-night/fixtures/2022-sample.json

- 2022년 8회 지방선거 17개 광역지자체 파서 출력 기대값
- `_notice`: "선관위 확정값 아님, 스키마 검증 전용 mock"
- 수치는 근사값, 정밀 소수점은 NEC 원본 캡처 후 보정 예정

### workers/election-night/test-parser.cjs

- 8개 테스트 (8/8 PASS): 스키마 유효성, countRate/leadingVoteRate 범위, declared 타입, 17지자체 완전성, fixture 메타데이터, parseNECResponse stub 동적 import
- 수치 exact value 비교 없음 — 타입/범위만 검증 (헌법 제1조 긴장 해소)

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] test-parser.js → test-parser.cjs 리네임**
- **Found during:** Task 2
- **Issue:** workers/election-night/package.json을 `"type": "module"`로 추가하니 test-parser.js(require 사용)가 ESM scope 오류 발생
- **Fix:** test-parser.js를 test-parser.cjs로 리네임. `.cjs` 확장자는 `"type": "module"` 환경에서도 CJS로 실행됨. 기능 동일.
- **Files modified:** workers/election-night/test-parser.cjs (renamed from test-parser.js)
- **Commit:** 6fdd38d

**2. [Rule 2 - Missing functionality] workers/election-night/package.json 추가**
- **Found during:** Task 2
- **Issue:** workers/election-night/index.js (ESM)를 테스트에서 `await import()` 시 Node.js가 `MODULE_TYPELESS_PACKAGE_JSON` 경고 발생
- **Fix:** workers/election-night/ 디렉토리에 `{ "type": "module" }` package.json 추가. Cloudflare Worker ESM 패턴과도 일치.
- **Files modified:** workers/election-night/package.json (created)
- **Commit:** 6fdd38d

**3. [Rule 1 - Bug] POST_ELECTION getBannerConfig 분기 제거**
- **Found during:** Task 1
- **Issue:** 기존 POST_ELECTION case에 `if (now < new Date('2026-06-04T06:00:00+09:00'))` 분기가 있었는데, election_night phase(18:00~24:00)가 이 구간을 담당하게 되어 POST_ELECTION case가 자정 이후에만 진입. 따라서 06:00 분기는 불필요한 dead code가 됨.
- **Fix:** POST_ELECTION case를 단순화 (06:00 분기 제거).
- **Files modified:** js/election-calendar.js
- **Commit:** 8225107

---

## Known Stubs

| Stub | File | Description |
|------|------|-------------|
| `NEC_URL = ''` | workers/election-night/index.js | NEC 개표 AJAX 엔드포인트 — 2022 아카이브 Chrome DevTools 캡처 후 기입 (마감: 2026-05-26) |
| `parseNECResponse(html)` | workers/election-night/index.js | NEC HTML 파서 — 현재 빈 regions {} 반환. 엔드포인트 확정 후 구현 |
| `id = "<KV_NAMESPACE_ID>"` | workers/election-night/wrangler.toml | KV namespace ID — 사용자가 `npx wrangler kv:namespace create ELECTION_RESULTS` 실행 후 기입 필요 |

---

## Task 3: Worker 배포 완료

Worker가 Cloudflare에 배포되었습니다:

- **Worker URL:** `https://election-night.ksca1010.workers.dev`
- **KV namespace id:** `db737acc9d624075bab261c60628f95c`
- **Health check:** `curl https://election-night.ksca1010.workers.dev/health` → `{"status":"ok"}` (200)
- **Commit:** `1a152b3`

### 04-02에서 사용할 Worker URL

```javascript
const ELECTION_NIGHT_WORKER = 'https://election-night.ksca1010.workers.dev';
```

---

## Self-Check: PASSED

Files verified:
- js/election-calendar.js: FOUND ✓ (ELECTION_NIGHT_END, election_night, getBannerConfig)
- workers/election-night/index.js: FOUND ✓
- workers/election-night/wrangler.toml: FOUND ✓ (KV id: db737acc9d624075bab261c60628f95c)
- workers/election-night/fixtures/2022-sample.json: FOUND ✓
- workers/election-night/test-parser.cjs: FOUND ✓
- workers/election-night/package.json: FOUND ✓

Tests: 8/8 PASS ✓
Worker health: https://election-night.ksca1010.workers.dev/health → 200 {"status":"ok"} ✓

Commits verified:
- 8225107: feat(04-01): election_night 페이즈 추가 + Worker 골격 생성 ✓
- 6fdd38d: feat(04-01): 2022 아카이브 fixture + 파서 단위 테스트 작성 ✓
- 1a152b3: chore(04-01): Worker 배포 완료 + KV namespace id 확정 ✓
