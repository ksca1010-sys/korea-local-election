# Phase 1: 긴급 버그·보안 수정 - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

LLM 생성 수치 제거(BUG-01/02), stale 주석 수정(BUG-03), 유령 파일 삭제(BUG-04), CSS/JS 버전 타임스탬프 통일(BUG-05), HTTP 보안 헤더 추가(QUAL-01), Microsoft Clarity PIPA 동의 게이트(QUAL-02).

다음 배포 전 필수. 새 기능 추가 없음.

</domain>

<decisions>
## Implementation Decisions

### 교육감 support 없을 때 UI (BUG-01/02)

- **D-01:** BUG-01로 `data.js:1529–1545` 교육감 후보 `support` 필드 전량 제거 후, `overview-tab.js:124`에서 `support`가 없는 후보는 `${r.name} ${r.support}%` 대신 한국어 문자열 메시지 표시. 예: `여론조사 데이터 없음`. muted 색상으로 렌더링.
- **D-02:** `poll-tab.js`에서 교육감 선택 시 support 있는 후보가 0명이면 여론조사 탭 전체를 숨기고 `여론조사 데이터 없음` 메시지 표시 (BUG-02 요건 충족). 빈 poll card 나열 금지.

### Clarity PIPA 동의 게이트 (QUAL-02)

- **D-03:** 동의 배너 위치: **하단 sticky 바** (지도/콘텐츠 열람 방해 최소화).
- **D-04:** 버튼: `동의` / `거부` 두 개. 간결하게. 설명 문구 포함: "사이트 개선을 위해 Microsoft Clarity 세션 기록에 동의하시겠습니까?"
- **D-05:** 동의 만료: **365일** (`localStorage` key: `clarity_consent`, value: `"accepted"` 또는 `"rejected"`, timestamp 포함).
- **D-06:** 동의 전에는 Clarity 스크립트 로드 자체를 막음 (현재 즉시 실행 코드 → 동의 후 동적 삽입으로 전환). ConsentV2 API 사용.
- **D-07:** 거부 시 Clarity 비로드 + 배너 숨김. 재방문 시 배너 재표시 없음 (365일).

### CSP 정책 (QUAL-01)

- **D-08:** Content-Security-Policy: **CDN 신뢰 도메인 허용리스트** 방식. nonce 불사용 (정적 사이트, 효과 제한적).
- **D-09:** 포함할 헤더: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy` (script-src/style-src에 현재 사용 CDN 전체 나열), `Referrer-Policy: strict-origin-when-cross-origin`.
- **D-10:** `report-uri` 포함 안 함.
- **D-11:** CSP에 반드시 포함할 CDN 도메인: `d3js.org`, `cdn.jsdelivr.net`, `fonts.googleapis.com`, `fonts.gstatic.com`, `cdnjs.cloudflare.com`, `www.clarity.ms`, Cloudflare Workers 도메인(`*.workers.dev`).

### 버전 타임스탬프 통일 (BUG-05)

- **D-12:** `index.html`의 CSS `v=1774589813`을 JS 타임스탬프 `v=1774711234`로 수동 수정 (1줄 변경). deploy.sh 자동화는 이번 Phase 범위 외.

### Claude's Discretion

- stale 주석(BUG-03) 수정 내용: `data.js:1790` 해당 라인 직접 확인 후 적절히 수정.
- 유령 파일(BUG-04) 삭제: `git rm "js/app-state 2.js" "js/router 2.js" "js/search 2.js" "js/sidebar 2.js"`.
- `_headers` 파일 위치: 레포 루트 (Cloudflare Pages 표준 위치).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Rules
- `CLAUDE.md` — 허위 데이터 절대 금지 헌법 제1~5조, 탭별 파일 수정 범위 제한 규칙

### Phase Requirements
- `.planning/REQUIREMENTS.md` §BUG-01~BUG-05, §QUAL-01~QUAL-02 — 수용 기준 원문

### Key Source Files
- `js/data.js:1529–1545` — 교육감 candidates 인라인 데이터 (support 필드 제거 대상)
- `js/tabs/overview-tab.js` — support 렌더링 코드 (방어 처리 대상)
- `js/tabs/poll-tab.js` — 여론조사 탭 교육감 표시 로직 (방어 처리 대상)
- `index.html:23–29` — Clarity 즉시 실행 스크립트 (동의 게이트로 교체 대상)

### Cloudflare Pages
- `_headers` 파일은 레포 루트에 위치 (현재 없음, 새로 생성) — Cloudflare Pages 보안 헤더 표준 방식

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ElectionCalendar.isPublicationBanned()` — 공표금지 판정 함수. Clarity 배너 표시 여부 판단에 참고 가능 (선거 기간 중 행동 제약).
- `css/style.css` — `--text-muted`, `--space-8` 등 CSS 변수. 동의 배너 스타일링에 사용.

### Established Patterns
- IIFE 모듈 패턴: 새 consent 모듈도 동일하게 `const ClarityConsent = (() => { ... })();` 구조.
- 에러 핸들링: `console.warn` 사용, 실행 계속. 동의 체크 실패 시 Clarity 로드 안 함이 안전한 기본값.
- 한국어 문자열: 사용자 표시 텍스트는 한국어로.

### Integration Points
- `index.html` `<head>`: Clarity 스크립트 교체 대상 (즉시 실행 → 동의 후 동적 로드).
- `index.html` `<body>`: 동의 배너 HTML 삽입 위치 (body 최하단 또는 JS로 동적 생성).
- `_headers` 파일: 레포 루트에 신규 생성. `deploy.sh`와 무관하게 Pages가 자동 적용.

</code_context>

<specifics>
## Specific Ideas

- 동의 배너: `position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999` sticky 스타일.
- `localStorage` 저장 형식: `{ status: "accepted" | "rejected", timestamp: Date.now() }` JSON.
- 365일 만료 체크: `Date.now() - stored.timestamp > 365 * 24 * 60 * 60 * 1000`.

</specifics>

<deferred>
## Deferred Ideas

- deploy.sh 버전 타임스탬프 자동화 → Phase 3 (빌드 자동화 단계에서 esbuild와 함께 처리).
- CSP `report-uri` 추가 → 운영 안정화 후 필요 시 별도 이슈로.

</deferred>

---

*Phase: 01-urgent-bug-security-fix*
*Context gathered: 2026-03-29*
