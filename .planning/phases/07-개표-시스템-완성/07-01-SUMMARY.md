---
phase: 07-개표-시스템-완성
plan: 01
subsystem: infra
tags: [cloudflare-worker, regex-parser, nec, election-night, kv-cache]

# Dependency graph
requires:
  - phase: 04-election-night
    provides: workers/election-night/index.js skeleton + KV 인프라
provides:
  - parseNECResponse() regex 파서 skeleton (TODO(5/26) 마커 포함)
  - workers/CAPTURE-GUIDE.md NEC URL 캡처 절차 문서
affects:
  - 07-02-PLAN
  - 07-03-PLAN
  - Phase 8 선거일 대비

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "parseNECResponse 빈 입력 방어: falsy/100자 미만 → stub 반환 (_source: 'stub', _parserVersion: '0.0')"
    - "declared 판정: HTML '당선' 텍스트만 허용, 수학적 추정 절대 금지 (헌법 제2조, D-11)"
    - "TODO(5/26) 마커: 5/26 DevTools 캡처 후 조정 필요 지점 명시"

key-files:
  created:
    - workers/CAPTURE-GUIDE.md
  modified:
    - workers/election-night/index.js

key-decisions:
  - "parseNECResponse() skeleton은 regex/텍스트 파싱만 사용 — Worker 런타임에 DOMParser 없음"
  - "declared 판정은 HTML 셀 '당선' 텍스트 존재 시에만 true — 득표율 추정 절대 금지 (헌법 제2조)"
  - "빈 입력(<100자) 방어 반환: _source: 'stub', _parserVersion: '0.0' — Test 6 호환"
  - "TODO(5/26) 마커 14개 위치 확정 — REGION_MAP/PARTY_MAP/컬럼순서/정당매핑/당선표기"

patterns-established:
  - "Worker 런타임 파싱: DOMParser 없음, 순수 정규식만 사용"
  - "REGION_MAP/PARTY_MAP: 한글→영문 키 변환 테이블 함수 내 정의"

requirements-completed: [ELEC-01]

# Metrics
duration: 8min
completed: 2026-03-30
---

# Phase 07 Plan 01: parseNECResponse() skeleton + NEC URL 캡처 가이드 Summary

**parseNECResponse() regex 파서 skeleton 구현 (17개 지역 REGION_MAP, 헌법 제2조 declared 판정, TODO(5/26) 마커 14개) + CAPTURE-GUIDE.md 5단계 캡처 절차**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-29T23:45:00Z
- **Completed:** 2026-03-29T23:53:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- parseNECResponse()에 regex 기반 HTML 파싱 skeleton 구현 — REGION_MAP(17개), PARTY_MAP, <tr>/<td> 추출 로직 포함
- 빈 입력 방어 로직: falsy/100자 미만이면 stub 메타 반환 (Test 6 통과 보장)
- declared 판정: HTML '당선' 텍스트 존재 시에만 true, 수학적 추정 절대 금지 (헌법 제2조, D-11), 주석 3개 명시
- TODO(5/26) 마커 14개 삽입 — 5/26 DevTools 캡처 후 실제 NEC HTML 구조에 맞게 조정 필요
- workers/CAPTURE-GUIDE.md 생성 — Step 1~5 캡처 절차, 체크리스트 6개, 2022/2026 ID 혼입 방지 경고
- test-parser.cjs 8/8 통과 확인

## Task Commits

1. **Task 1: parseNECResponse() skeleton 구현** - `72d1bb1` (feat)
2. **Task 2: CAPTURE-GUIDE.md 작성** - `aaa965e` (docs)

## Files Created/Modified
- `workers/election-night/index.js` - parseNECResponse() stub → regex 파서 skeleton 교체 (REGION_MAP, PARTY_MAP, declared 헌법 제2조, TODO 마커)
- `workers/CAPTURE-GUIDE.md` - NEC 개표 API URL 캡처 절차 (Step 1~5) + 체크리스트

## Decisions Made
- Worker 런타임에 DOMParser 없으므로 순수 regex/텍스트 파싱만 사용
- 빈 입력 방어 임계값 100자: 실제 NEC HTML은 수 KB이므로 100자 미만이면 유효한 응답이 아님
- declared는 HTML '당선' 텍스트 존재 시에만 true — 헌법 제2조 및 D-11 엄수
- CAPTURE-GUIDE.md를 workers/ 최상위에 생성 (election-night/ 하위 아님) — 여러 Worker에 공용 가능

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. worktree에 workers/ 디렉토리가 없어 `git checkout main -- workers/`로 파일을 가져온 후 진행했음. workers/ 파일이 worktree-agent-a2be60c0 브랜치에 신규 커밋으로 추가됨.

## User Setup Required
None - 외부 서비스 설정 불필요. 실제 NEC URL 캡처는 5/26 이후 수동 작업 (workers/CAPTURE-GUIDE.md 참조).

## Next Phase Readiness
- parseNECResponse() skeleton 구현 완료 — 07-02(브라우저 코드 완성)에서 바로 활용 가능
- 5/26 이후 Chrome DevTools 캡처 → workers/CAPTURE-GUIDE.md Step 4~5 실행 → 07-03(배포/테스트)
- test-parser.cjs 8/8 통과 상태 유지 — 실제 NEC HTML 구조 반영 후 재검증 필요

---
*Phase: 07-개표-시스템-완성*
*Completed: 2026-03-30*
