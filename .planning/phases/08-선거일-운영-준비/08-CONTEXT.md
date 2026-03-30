# Phase 8: 선거일 운영 준비 - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

6/3 선거 당일 무중단 서비스를 위한 모든 점검이 완료된다.
배포 체크리스트 문서화 + 실배포 실행, 공표금지 자동 숨김 브라우저 검증, Worker 장애 시 수동 폴백 절차 검증.
새 기능 구현 없음 — 기존 구현체 검증 + 운영 문서화가 전부.

</domain>

<decisions>
## Implementation Decisions

### Worker 실배포 (D-01)
- **D-01:** Phase 8에 wrangler deploy 실배포까지 포함한다.
- 절차: NEC URL 기입 (`workers/election-night/index.js` `fetchAndParseNEC()` 내 `NEC_URL`) → `wrangler deploy` → `curl /health` 확인.
- 전제: 5/26 DevTools 캡처로 NEC URL 확정 완료 (CAPTURE-GUIDE.md 절차대로).
- Phase 8 타임라인(6/1~2)은 5/26 이후이므로 URL이 준비된 상태.

### 배포 체크리스트 범위 (D-02)
- **D-02:** Cloudflare Pages + Worker 배포 + /health + /results 확인 + 브라우저 스모크 테스트.
- 스모크 테스트: 지도 로딩, 탭 전환, election-banner 요소 존재 확인 (30초 수동).
- 롤백 절차는 체크리스트에 포함하지 않는다 (Cloudflare 대시보드 2클릭으로 충분).
- 모니터링 자동화는 범위 외.
- 산출물: `workers/DEPLOY-CHECKLIST.md`

### 공표금지 검증 방법 (D-03, OPS-02)
- **D-03:** 날짜 mock 브라우저 테스트로 지금 검증한다.
- Console에서 `Date` 생성자를 override하여 5/28 이후 날짜로 조작 후 여론조사 탭이 자동으로 숨겨지는지 확인.
- `isPublicationBanned()`는 이미 구현됨 (`js/election-calendar.js` line 71).
- 별도 단위 테스트 파일 추가 없음 — 브라우저 검증으로 충분.

### 폴백 절차 형태 (D-04, OPS-03)
- **D-04:** 운영 매뉴얼 문서 (`workers/FALLBACK-GUIDE.md`) 작성. JSON 예시 포함.
- 절차: Worker 다운 감지 → `App._setManualFallbackMode(true)` → textarea에 JSON 붙여넣기 → 적용.
- JSON 예시는 `workers/election-night/fixtures/2022-sample.json` 스키마 기반으로 포함.
- 스크립트/북마크릿 없음 — 선거 당일 긴장 상황에서 명확한 문서가 더 신뢰성 있음.
- 5분 내 복구 가능 절차로 구성.

</decisions>

<specifics>
## Specific Ideas

- 배포 체크리스트는 단계별 체크박스 형식 (CAPTURE-GUIDE.md와 동일한 스타일).
- FALLBACK-GUIDE.md는 "Worker 다운 시 이렇게 하세요" — 비기술 운영자도 따라할 수 있는 수준.

</specifics>

<canonical_refs>
## Canonical References

### 배포 절차
- `workers/CAPTURE-GUIDE.md` — NEC URL 캡처 절차 (Phase 7 산출물, DEPLOY-CHECKLIST 전제 문서)
- `workers/election-night/wrangler.toml` — Worker 배포 설정
- `workers/election-night/index.js` `fetchAndParseNEC()` — NEC_URL 기입 위치 (line 98 부근)

### 공표금지
- `js/election-calendar.js` line 71 `isPublicationBanned()` — 공표금지 판정 함수
- `js/election-calendar.js` DATES 상수 — 공표금지 기간 정의 (5/28 00:00 ~ 6/3 18:00 KST)

### 폴백 UI
- `js/app.js` line 1047 `_setManualFallbackMode()` — 폴백 모드 진입 함수
- `index.html` line 422 `#manual-fallback-container` — 폴백 UI DOM
- `workers/election-night/fixtures/2022-sample.json` — 폴백 JSON 예시 스키마

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `isPublicationBanned()` (election-calendar.js:71) — 이미 구현됨, 검증만 필요
- `_setManualFallbackMode()` (app.js:1047) — 이미 구현됨, 절차 문서화만 필요
- `#manual-fallback-container` (index.html:422) — textarea + 적용 버튼 포함된 UI 존재

### Integration Points
- Worker 배포: `cd workers/election-night && npx wrangler deploy`
- Pages 배포: git push → Cloudflare Pages 자동 배포 (또는 `npx wrangler pages deploy`)
- 헬스체크: `curl https://election-night.ksca1010.workers.dev/health`

</code_context>

<deferred>
## Deferred Ideas

- 모니터링 자동화 (/health 주기적 체크) — 범위 외
- 롤백 절차 문서화 — Cloudflare 대시보드로 충분
- Worker 장애 알림 (Slack/이메일) — 범위 외

</deferred>

---

*Phase: 08-선거일-운영-준비*
*Context gathered: 2026-03-30*
