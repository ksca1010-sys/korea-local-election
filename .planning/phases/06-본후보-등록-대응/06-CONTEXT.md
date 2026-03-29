# Phase 6: 본후보 등록 대응 - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

5/14~15 본후보 등록 기간 동안 NEC 공식 API에서 후보 데이터를 자동 수집하여, 5/15 18:00 이후 후보 탭이 공식 후보(NOMINATED)만 기호순으로 표시하도록 전환한다.

범위: 광역단체장, 교육감, 기초단체장(251개). 광역의원/기초의원은 제외.

</domain>

<decisions>
## Implementation Decisions

### 데이터 수집 방식
- **D-01:** GitHub Actions cron 완전 자동화 — 별도 `update-candidates.yml` 워크플로우 생성 (update-polls.yml과 분리)
- **D-02:** 수집 주기 1회/일. 5/14~15 등록 기간 중 수동 dispatch도 지원
- **D-03:** NEC 공식 후보자 API 사용 (공공데이터포털). `fetch_nec_candidates.py`의 TODO 전환 포인트를 이 페이즈에서 구현
- **D-04:** 기존 update-polls.yml 패턴 그대로 준용 (pip cache, git pull --rebase, commit 형식)

### 적용 범위
- **D-05:** 광역단체장(17개), 교육감(17개), 기초단체장(251개) 모두 포함
- **D-06:** 광역의원/기초의원은 제외 (후보 탭 미표시, 별도 페이즈)

### 비공식 후보 처리
- **D-07:** 5/15 18:00 이후 DECLARED / EXPECTED / RUMORED 후보를 탭에서 완전히 숨김 — NOMINATED만 표시
- **D-08:** 기준 판정은 `ElectionCalendar.getCandidateSortMode() === 'ballot_number'` 활용. 별도 함수 추가하지 않음
- **D-09:** 등록 취소·무효 후보는 기존 WITHDRAWN 상태 유지 (이미 숨김 처리됨)

### 기호(ballotNumber) 미배정 시 정렬
- **D-10:** 기호 없는 NOMINATED 후보는 기존 `(a.ballotNumber || 999)` 폴백 유지 — candidate-tab.js 수정 불필요
- **D-11:** NEC API 수집 시 `ballotNumber` 필드 포함하여 저장. 기호 확정 즉시 다음 cron 실행으로 자동 반영

### 선거구 미확정/변경 대응
- **D-12:** NEC API 응답에서 기존 선거구 코드와 매핑이 안 되는 후보는 `data/candidates/unmatched_candidates.json`에 별도 보관 — 누락 방지
- **D-13:** 선거구 확정 시 cron 재실행으로 자동 리맵 (unmatched → 본 파일 이동)
- **D-14:** 미확정 선거구를 가진 지역을 지도에서 클릭하면 후보 탭에 "공식 후보 등록 마감 후 선거구 확정 중입니다" 안내 문구 표시

### Claude's Discretion
- NEC API 엔드포인트 URL 및 파라미터 (연구/플래닝 단계에서 확인)
- `update-candidates.yml` 내부 단계 설계 (fetch → validate → commit 순서 등)
- 각 선거 유형별 JSON 구조 변경 범위 (기존 구조 최대한 유지)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 선거 캘린더 / 기준 판정
- `js/election-calendar.js` — `getCandidateSortMode()` (ballot_number 전환 기준), `CANDIDATE_REG_END` 상수

### 후보 탭 렌더링
- `js/tabs/candidate-tab.js` — 후보 탭 전체 로직. ballot_number/status_priority 정렬(line 273-283), WITHDRAWN 필터 패턴(line 57), getStatusMeta() 함수

### 후보 데이터 파일 (구조 참고 필수)
- `data/candidates/governor.json` — 광역단체장. region-key dict 구조, status/ballotNumber 필드
- `data/candidates/superintendent.json` — 교육감
- `data/candidates/mayor_candidates.json` — 기초단체장
- `data/candidates/status_updates.json` — 상태 변경 이력

### 수집 파이프라인
- `scripts/candidate_pipeline/fetch_nec_candidates.py` — NEC API 전환 TODO 포인트, REGION_MAP, PARTY_MAP, merge_candidates() 로직
- `.github/workflows/update-polls.yml` — Actions 패턴 참고 (pip cache, rebase, commit 형식)

### 요구사항 / 프로젝트 규칙
- `.planning/REQUIREMENTS.md` — CAND-01, CAND-02, CAND-03
- `CLAUDE.md` — 헌법 제1~3조 (NEC API 우선, LLM 생성 수치 불신, 파이프라인 검증 단계 필수)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getCandidateSortMode()` (election-calendar.js): 이미 구현됨. ballot_number 모드 전환 시점 = CANDIDATE_REG_END(5/15 18:00) 이후
- `ballotNumber` 정렬 로직 (candidate-tab.js line 277-278): `(a.ballotNumber || 999) - (b.ballotNumber || 999)` — 변경 불필요
- WITHDRAWN 필터 패턴 (line 57): `.filter(c => c.status !== 'WITHDRAWN')` — NOMINATED 필터 추가 시 참고
- REGION_MAP / PARTY_MAP (fetch_nec_candidates.py): 17개 시도 코드 → 프로젝트 키 매핑 이미 정의

### Established Patterns
- 데이터 파일은 `data/candidates/*.json` (순수 JSON, 로직 없음 — CLAUDE.md 절대 금지 제1조)
- GitHub Actions: update-polls.yml 구조 그대로 준용 (D-04)
- 상태값: NOMINATED / DECLARED / EXPECTED / RUMORED / WITHDRAWN (getStatusMeta 함수 기반)

### Integration Points
- `candidate-tab.js` buildModel() 함수: 각 선거 유형별 분기 처리 — governor, superintendent, mayor 분기에 NOMINATED 필터 추가
- `data/candidates/unmatched_candidates.json`: 신규 생성 파일 (D-12)

</code_context>

<specifics>
## Specific Ideas

- 선거구 미확정 안내 문구: "공식 후보 등록 마감 후 선거구 확정 중입니다" (D-14)
- 기초단체장 251개 시군구 전체 포함 — 데이터 양이 많아 파이프라인 안정성 검증 단계 필수 (CLAUDE.md 제3조)

</specifics>

<deferred>
## Deferred Ideas

- 광역의원/기초의원 후보 데이터 수집 — 후보 탭 미표시, REQUIREMENTS.md Future(v1.2+)로 분류
- 선거구 획정 모니터링 자동화 (변경 감지) — 페이즈 6 이후

</deferred>

---

*Phase: 06-본후보-등록-대응*
*Context gathered: 2026-03-30*
