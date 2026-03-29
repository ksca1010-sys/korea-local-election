# Phase 5: 여론조사 보완 - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

여론조사 빈값(results: []) 32건 채우기 + GitHub Actions daily cron으로 5/28까지 신규 여론조사 자동 수집 + 공표금지 자동 숨김 브라우저 검증.

새로운 UI 기능, 여론조사 탭 디자인 변경, 파이프라인 이외 스크립트 수정은 이 Phase 범위 밖이다.

</domain>

<pre_phase_action>
## Phase 5 시작 전 완료 항목

- **[HOTFIX]** nttId 17347 서울 수치 불일치 교정 (C2 결정)
  - `poll_audit_pdf.py --fix` 실행 → 국민의힘 2.2%→32.3%, 개혁신당 12.9%→2.8%로 PDF 원본값 반영
  - 서울 전체 여론조사 동일 패턴 전수 검증 후 커밋
  - 이 작업은 Phase 5 플래닝/실행과 무관하게 즉시 처리

</pre_phase_action>

<decisions>
## Implementation Decisions

### A. 빈값 32건 채우기 방식 (POLL-01)

- **D-01:** `python scripts/reparse_pdfs.py` 실행 — PDF가 모두 `data/polls/pdfs/{nttId}.pdf`에 존재하므로 자동 파싱 우선
- **D-02:** 파싱 실패 건(pdfplumber 추출 불가)은 NESDC 원본 페이지 수동 확인 후 수치 기입
  - 실패 건 기준: `reparse_pdfs.py` 실행 후 `results: []` 남은 항목
  - 수동 확인 출처: `sourceUrl` 필드의 NESDC 상세 페이지 → PDF 결과표 직접 열람
- **D-03:** Gemini PDF 폴백(`gemini_parse_polls.py`)은 사용하지 않음 (헌법 제2조: LLM 생성 수치 불신)
- **D-04:** 처리 완료 기준: `data/polls/polls.json` 기준 32건 모두 `results` 비어있지 않음

### B. 파이프라인 지속 수집 운영 (POLL-02)

- **D-05:** GitHub Actions daily cron으로 자동화
  - 파일: `.github/workflows/poll-sync.yml`
  - 스케줄: 매일 KST 09:00 (UTC 00:00) — 전날 등록 여론조사 수집
  - 실행 순서: `nesdc_poll_pipeline.py` → `reparse_pdfs.py` → 변경 있으면 `git commit && git push`
  - Cloudflare Pages가 push 감지 → 자동 배포
- **D-06:** GitHub Secrets에 필요한 값:
  - `CLOUDFLARE_API_TOKEN` — Pages 배포 트리거용 (이미 있으면 재사용)
  - GitHub Actions 기본 `GITHUB_TOKEN`으로 commit/push 가능
- **D-07:** 커밋 메시지 형식: `data: poll sync {날짜} — {신규 N건, 업데이트 M건}`
- **D-08:** 5/27 이후(공표금지 직전) 마지막 실행 후 workflow를 수동으로 disable — 공표금지 기간 중 자동 수집 불필요

### C. Audit 오류 처리

- **D-09:** Phase 5 범위 밖 — pre_phase_action으로 즉시 hotfix 처리 (위 참조)
- **D-10:** Phase 5 플래너는 hotfix 완료를 전제로 계획 수립

### D. 공표금지 자동 숨김 검증 (Phase 5 성공 기준 3번)

- **D-11:** 날짜 mock 브라우저 테스트로 검증
  - `js/election-calendar.js`의 `getKST()` 함수를 임시로 `2026-05-28T01:00:00+09:00` 반환하도록 수정
  - 로컬 브라우저에서 여론조사 탭 열어 빈 상태(`공표금지 기간` 메시지) 확인
  - 테스트 후 원복 커밋
- **D-12:** 검증 항목:
  1. 여론조사 탭: 데이터 숨김 + 공표금지 안내 메시지 표시
  2. 경계값: 5/27 23:59 → 정상 표시, 5/28 00:00 → 숨김
  3. 종료 경계: 6/3 17:59 → 숨김, 6/3 18:00 → 정상 표시 (법적 요건)

### Claude's Discretion

- GitHub Actions workflow 세부 구현 (steps, Python 버전, pip cache 등)
- `reparse_pdfs.py` 실패 건 수동 확인 시 어떤 형식으로 수치를 입력할지
- Cloudflare Pages 자동 배포 연동 방식 (webhook vs API 직접 호출)
- `poll-sync.yml` 실패 시 알림 방법 (GitHub Actions 기본 이메일 알림으로 충분)

</decisions>

<codebase_context>
## 관련 파일

- `scripts/nesdc_poll_pipeline.py` — NESDC 크롤링 파이프라인, `state.json` last_id 기반 증분 수집
- `scripts/reparse_pdfs.py` — results 빈 항목 전용 PDF 재파싱 스크립트 (이미 존재)
- `scripts/poll_audit_pdf.py` — PDF vs polls.json 수치 비교 검증 + `--fix` 자동 교정
- `data/polls/polls.json` — 프론트엔드 서빙 데이터 (743건, 32건 빈값)
- `data/polls/state.json` — 파이프라인 작업 상태 (last_id: 17931)
- `data/polls/pdfs/` — PDF 파일 디렉토리 (910개, 32건 빈값 포함)
- `js/election-calendar.js` — `isPublicationBanned()`, `getKST()` — 공표금지 판정 로직
- `js/tabs/poll-tab.js` — 여론조사 탭 렌더러 — 공표금지 시 빈 배열 반환 분기

</codebase_context>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 규칙
- `CLAUDE.md` — 허위 데이터 절대 금지 헌법 제1~5조, 탭별 파일 수정 범위 제한
  - 특히 제2조: LLM 생성 수치 불신 — Gemini 폴백 사용 금지 결정 근거
  - 특히 제3조: 자동화 파이프라인 검증 단계 필수

### Phase 요건
- `.planning/REQUIREMENTS.md` §POLL-01, §POLL-02 — 수용 기준 원문

### 선거 캘린더
- `js/election-calendar.js` — `isPublicationBanned()` 구현 위치, `DATES` 상수
  - D-11 날짜 mock 테스트 시 `getKST()` 수정 위치

### 여론조사 파이프라인
- `scripts/nesdc_poll_pipeline.py` — 전체 파이프라인 진입점
- `scripts/reparse_pdfs.py` — 빈값 재파싱 진입점 (D-01 실행 스크립트)
- `scripts/poll_audit_pdf.py` — audit + fix 스크립트 (pre_phase_action 사용)

</canonical_refs>
