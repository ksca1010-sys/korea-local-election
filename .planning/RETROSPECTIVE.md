# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-29
**Phases:** 4 | **Plans:** 9 | **Tasks:** 8+

### What Was Built
- **Phase 1:** LLM 생성 교육감 support 수치 전량 제거, 보안 헤더 4종 + PIPA Clarity 동의 게이트, asset 버전 통일
- **Phase 2:** 여론조사 PDF 70+ 일괄 처리 파이프라인, 수치 검증 pre-deploy 훅, 버그 레지스터 체계
- **Phase 3:** 15MB JSON 지연 로딩, esbuild 번들 47% 감소, 여론조사 트렌드 차트, URL 공유, .ics 캘린더, 스켈레톤 스크린, 모바일 스와이프
- **Phase 4:** Cloudflare Worker KV 60초 폴링 + 지도 개표 레이어, 수동 폴백 UI, 파서 테스트 8/8

### What Worked
- **GSD 워크플로:** discuss → plan → execute → verify 사이클이 선거 도메인에서도 잘 작동함
- **Wave 기반 병렬 실행:** Phase 4에서 Wave 1/2 분리로 Worker 배포 후 클라이언트 구현이 자연스럽게 진행됨
- **인간 체크포인트:** Cloudflare Worker 배포 같은 외부 인프라 작업을 체크포인트로 분리하여 자동화와 수동 작업을 명확히 구분
- **헌법 규칙:** 허위 데이터 방지 5개조가 LLM 생성 수치 혼입을 명확히 차단하는 안전망 역할

### What Was Inefficient
- REQUIREMENTS.md 추적 테이블이 Phase 1 실행 후 자동 업데이트되지 않아 마일스톤 완료 시 수동 교정 필요
- Phase 1 ROADMAP.md 체크박스가 `[ ]`로 남아 있어 진행 상태 불일치 발생
- 일부 SUMMARY.md의 `one_liner` 필드가 비어 있어 summary-extract 도구가 값을 추출하지 못함

### Patterns Established
- **NEC_URL stub 패턴:** 개표 API URL은 선거일 직전 Chrome DevTools로 캡처 — 미리 빈 값으로 유지하고 D-08(2026-05-26) 마감 설정
- **Cloudflare Worker + KV 캐시:** 브라우저 직접 외부 API 폴링 대신 Worker 프록시 — CORS 우회 + 서버 부하 분산
- **4개 보안 헤더 기본값:** `_headers` 파일에 X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy 항상 포함

### Key Lessons
1. **Phase 완료 후 체크박스 즉시 업데이트** — ROADMAP/REQUIREMENTS 불일치는 마일스톤 완료 시 혼란을 유발함
2. **수동 인프라 단계는 명시적 체크포인트로** — Worker 배포, KV 생성 같은 외부 작업은 Plan의 별도 task로 분리하고 checkpoint 타입 지정
3. **wrangler 명령어 버전 주의** — `kv:namespace` → `kv namespace` (콜론 없이 띄어쓰기)
4. **SUMMARY.md one_liner 규칙 준수** — `**One-liner:**` 형식을 일관되게 사용해야 gsd-tools가 파싱 가능

### Cost Observations
- 모든 에이전트: sonnet 모델
- Phase 1~4 하루 완료 — GSD 워크플로 오버헤드 포함
- Checkpoint 패턴이 외부 인프라 작업을 효과적으로 처리

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Days | Key Win |
|-----------|--------|-------|------|---------|
| v1.0 MVP | 4 | 9 | 1 | 선거일 실시간 개표 인프라 완성 |
