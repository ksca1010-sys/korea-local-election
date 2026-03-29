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

### Active

- [ ] **NEC 개표 API URL 확정** — 2026-05-26 이후 Chrome DevTools로 실제 URL 캡처 후 `workers/election-night/index.js`에 기입
- [ ] **브라우저 UAT 3건** — 지도 시각화·폴백 UI·개표 배너 브라우저 확인 (`04-HUMAN-UAT.md`)

### Out of Scope

- 사용자 계정/로그인 — 정보 조회 전용 서비스, 인증 불필요
- 서버사이드 렌더링/SPA 프레임워크 전환 — 바닐라 JS 유지 원칙
- 후보자 직접 등록 기능 — 선관위 공식 데이터만 표시
- 선거 예측/AI 분석 수치 — 허위 데이터 방지 원칙 (헌법 제2조)
- React/Vue/Svelte 등 프레임워크 도입 — 스택 변경 불필요

## Current State

**v1.0 출시** — 2026-03-29

- 배포: `https://korea-local-eletion.pages.dev`
- JS: 20,460줄 (esbuild 미니파이 번들 `.deploy_dist/`에 별도 산출)
- Cloudflare Worker: `https://election-night.ksca1010.workers.dev` (KV 캐시 60초 폴링)
- 데이터: 광역단체장 100명, 교육감 81명, 기초단체장 851명, 여론조사 208건
- 일정: 본후보 등록 5/14~15, 공표금지 5/28~6/3, 선거일 6.3

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
| NEC_URL stub (2026-05-26 확정) | 개표 URL은 선거일 직전 캡처 필요, 미리 빈 값으로 유지 | — Pending |

---
*Last updated: 2026-03-29 after v1.0 milestone*
