# 선거정보지도 (korea-local-election)

## What This Is

2026년 6.3 전국동시지방선거 인터랙티브 선거 정보 지도. 유권자가 광역/기초단체장, 교육감, 의원 후보, 여론조사, 역대 선거 결과를 지도 기반으로 탐색할 수 있는 단일 페이지 웹앱이다. 바닐라 HTML/CSS/JS로 구현되어 Cloudflare Pages에 배포된다. v1.0 MVP가 2026-03-29에 출시되었으며, 선거일(6.3) 실시간 개표 시각화를 포함한다.

## Core Value

**정확한 데이터를 빠르게 탐색** — 허위 데이터 없이, 모든 선거구의 후보·여론조사·역대 결과를 한 화면에서 볼 수 있어야 한다.

## Requirements

### Validated

- ✓ D3.js 기반 광역/기초 드릴다운 지도 — 현재 운영 중
- ✓ 7개 탭 패널 (개요/여론조사/후보/뉴스/역대비교/의원지역구/비례대표) — 현재 운영 중
- ✓ 선관위 NEC API + NESDC 여론조사 데이터 연동 파이프라인 — 운영 중
- ✓ Cloudflare Pages 배포 + Worker API 프록시 — 운영 중
- ✓ LLM 생성 수치 제거 + UI 방어 처리 (BUG-01~04) — v1.0
- ✓ 보안 헤더 (`_headers`) + PIPA Clarity 동의 게이트 (QUAL-01, QUAL-02) — v1.0
- ✓ CSS/JS 버전 타임스탬프 통일 (BUG-05) — v1.0
- ✓ 여론조사 PDF 70+ 일괄 처리 + 수치 검증 자동화 (DATA-01~05) — v1.0
- ✓ 대용량 JSON 지연 로딩 (15MB) + esbuild 번들 47% 감소 (QUAL-03~05) — v1.0
- ✓ ESLint 오류 0건 (QUAL-06) — v1.0
- ✓ 여론조사 트렌드 차트 + URL 공유 + .ics 캘린더 내보내기 (FEAT-01~03) — v1.0
- ✓ 탭 스켈레톤 스크린 + 모바일 스와이프 (FEAT-04~05) — v1.0
- ✓ Cloudflare Worker 실시간 개표 폴링 + 지도 시각화 (FEAT-06) — v1.0

### Active (v1.3)

- [ ] **DIAG-01** 전체 15개 워크플로우 실패 패턴 전수 분석 + 잔존 문제 목록화
- [ ] **CRASH-01** API 응답 방어 코드 미적용 파이프라인 일괄 수정
- [ ] **INDEP-01** continue-on-error 미적용 워크플로우 (byelection 외) 정비
- [ ] **GIT-01** 동시 push 경쟁 상태 제거 (재시도/직렬화 패턴 적용)
- [ ] **MON-01** monitor_failures.py 커버리지 15개 전체로 확장
- [ ] **PERM-01** 전 워크플로우 permissions 정규화

### Active (v1.2 — 날짜 잠금)

- [ ] **CAND-01 본후보 실수집** — 2026-05-14: `python scripts/candidate_pipeline/fetch_nec_candidates.py --log-raw` 실행
- [ ] **NEC 개표 API URL 확정** — 2026-05-26 이후 Chrome DevTools로 실제 URL 캡처 후 `workers/election-night/index.js`에 기입 + parseNECResponse() TODO 14곳 업데이트
- [ ] **선거일 최종 배포** — 2026-06-01~02: `workers/DEPLOY-CHECKLIST.md` 27항목 순서대로 실행
- [ ] **선거 결과 아카이브** — 6/3 개표 완료 후 결과 데이터 영구 보존

### Out of Scope

- 사용자 계정/로그인 — 정보 조회 전용 서비스, 인증 불필요
- 서버사이드 렌더링/SPA 프레임워크 전환 — 바닐라 JS 유지 원칙
- 후보자 직접 등록 기능 — 선관위 공식 데이터만 표시
- 선거 예측/AI 분석 수치 — 허위 데이터 방지 원칙 (헌법 제2조)
- React/Vue/Svelte 등 프레임워크 도입 — 스택 변경 불필요

## Current Milestone: v1.3 자동화 파이프라인 반복 안정화

**Goal:** 전체 파이프라인 실패 패턴을 전수 진단·제거하고 실패 감지·복구 시스템을 완성하여 5/14 본후보 수집 전 무인 안정 운영을 달성한다

**Target features:**
- [DIAG] 15개 워크플로우 전수 분석 — 잔존 실패 패턴 목록화
- [CRASH] API 응답 필드 누락 → KeyError 전 파이프라인 방어 코드 일괄 적용
- [INDEP] continue-on-error 미적용 워크플로우 정비 (byelection, polls 등)
- [GIT] 동시 git push 경쟁 상태 제거
- [MON] monitor_failures.py 커버리지 15개 전체 워크플로우로 확장
- [PERM] permissions 전 워크플로우 일관화

## Previous Milestone: v1.2 선거 실행 (병행 진행 — 날짜 잠금)

**Goal:** 5/14 본후보 실수집 → 5/26 NEC URL 확정 → 6/1~2 최종 배포 → 6/3 선거 당일 무중단 운영 실행

**Target features:**
- 2026-05-14: 본후보 실수집 (CAND-01) — fetch_nec_candidates.py 실행
- 2026-05-26: NEC 개표 API URL 캡처 + parseNECResponse() TODO 14곳 업데이트
- 2026-05-27: GitHub Actions update-polls.yml 수동 disable (D-08)
- 2026-06-01~02: DEPLOY-CHECKLIST.md 27항목 최종 배포 실행
- 2026-06-03: 선거 당일 모니터링 + 개표 실시간 시각화
- 2026-06-04 이후: 선거 결과 아카이브 보존

## Current State

**v1.1 출시** — 2026-03-31

- 배포: `https://korea-local-election.pages.dev`
- JS: ~21,000줄 (v1.1에서 app.js +_updateElectionBanner 등 추가)
- Cloudflare Worker: `https://election-night.ksca1010.workers.dev` (parseNECResponse() skeleton, TODO(5/26) 마커 14개)
- 데이터: 여론조사 743건 (NESDC PDF 18건 수동 채우기 완료)
- 운영 문서: workers/CAPTURE-GUIDE.md + FALLBACK-GUIDE.md + DEPLOY-CHECKLIST.md(27항목)
- 일정: 본후보 실수집 5/14, 공표금지 5/28~6/3, NEC URL 캡처 5/26 이후, 선거일 6.3

## Constraints

- **Tech Stack:** 바닐라 HTML/CSS/JS 유지 — 프레임워크 도입 없음
- **Timeline:** 5/28 공표금지 전 핵심 기능 안정화 필수
- **Data Integrity:** 선관위 API/NESDC 검증 없이 수치 변경 금지 (헌법 제1~5조)
- **Deployment:** Cloudflare Pages 정적 호스팅 — 서버사이드 로직 불가
- **No Tests:** 자동화 테스트 인프라 없음 — 변경 시 수동 검증 필수

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 바닐라 JS (프레임워크 없음) | 배포 단순화, CDN 의존 없음, 경량 | ✓ Good |
| IIFE 모듈 패턴 | import/export 없이 스크립트 순서로 의존성 관리 | ✓ Good |
| Cloudflare Pages 배포 | 무료 정적 호스팅, 글로벌 CDN | ✓ Good |
| 허위 데이터 방지 헌법 | 선거 정보 정확성이 서비스 신뢰의 핵심 | ✓ Good |
| GSD 마일스톤 v1.0 | 버그 수정 + 파이프라인 자동화 + 품질 개선 동시 목표 | ✓ Good — 4 phases 9 plans in 1 day |
| esbuild 번들 | deploy.sh에 빌드 단계 추가, JS 47% 감소 | ✓ Good |
| Cloudflare Worker KV 캐시 | 브라우저 직접 NEC 폴링 대신 Worker 프록시 | ✓ Good — CORS 문제 우회, 서버 부하 분산 |
| NEC_URL stub (2026-05-26 확정) | 개표 URL은 선거일 직전 캡처 필요, 미리 빈 값으로 유지 | — Pending (5/26 이후) |
| 본후보 파이프라인 날짜 게이팅 | GitHub Actions if: 타임존 문제 방지 위해 Python 내 처리 | ✓ Good |
| render() 단일 지점 NOMINATED 필터 | Anti-Pattern(buildModel 각 분기 중복 필터) 회피 | ✓ Good |
| KV fixture 직접 주입 통합 테스트 | wrangler --preview false 필수, scheduled() 시간 조건 우회 | ✓ Good |
| 운영 문서 workers/ 집중 배치 | CAPTURE/FALLBACK/DEPLOY 3종 한 곳에서 관리 | ✓ Good |

---
## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-31 — Milestone v1.1 complete*
