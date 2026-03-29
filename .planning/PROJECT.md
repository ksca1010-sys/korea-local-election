# 선거정보지도 (korea-local-election)

## What This Is

2026년 6.3 전국동시지방선거 인터랙티브 선거 정보 지도. 유권자가 광역/기초단체장, 교육감, 의원 후보, 여론조사, 역대 선거 결과를 지도 기반으로 탐색할 수 있는 단일 페이지 웹앱이다. 바닐라 HTML/CSS/JS로 구현되어 Cloudflare Pages에 배포된다.

## Core Value

**정확한 데이터를 빠르게 탐색** — 허위 데이터 없이, 모든 선거구의 후보·여론조사·역대 결과를 한 화면에서 볼 수 있어야 한다.

## Requirements

### Validated

- ✓ D3.js 기반 광역/기초 드릴다운 지도 — 현재 운영 중
- ✓ 7개 탭 패널 (개요/여론조사/후보/뉴스/역대비교/의원지역구/비례대표) — 현재 운영 중
- ✓ 선관위 NEC API + NESDC 여론조사 데이터 연동 파이프라인 — 운영 중
- ✓ Cloudflare Pages 배포 + Worker API 프록시 — 운영 중

### Active

- [ ] **버그/데이터 오류 수정** — 교육감 support 값 하드코딩, mock fallback 제거, 유령 파일 정리
- [ ] **데이터 파이프라인 자동화** — 여론조사 PDF 자동 수집·검증, 후보 자동 업데이트 체계화
- [ ] **배포 전 품질 개선** — 보안 헤더 추가, CSP, CSS/JS 버전 통일, ESLint 오류 제거
- [ ] **여론조사 트렌드 차트** — 후보별 시계열 지지율 Chart.js 시각화
- [ ] **모바일 UX 최적화** — 지연 로딩(9.7MB JSON 등), 초기 로드 시간 단축
- [ ] **URL 공유 기능** — 현재 지역/탭 상태 공유 링크 생성
- [ ] **실시간 개표 결과** — 6.3 선거일 개표 데이터 지도 반영

### Out of Scope

- 사용자 계정/로그인 — 정보 조회 전용 서비스, 인증 불필요
- 서버사이드 렌더링/SPA 프레임워크 전환 — 바닐라 JS 유지 원칙
- 후보자 직접 등록 기능 — 선관위 공식 데이터만 표시
- 선거 예측/AI 분석 수치 — 허위 데이터 방지 원칙 (헌법 제2조)
- React/Vue/Svelte 등 프레임워크 도입 — 스택 변경 불필요

## Context

- **기존 코드베이스:** 바닐라 JS 21,202줄, data/*.json 15개 정적 데이터 파일
- **배포:** `https://korea-local-eletion.pages.dev` (Cloudflare Pages)
- **헌법:** 허위 데이터 절대 금지 — LLM 생성 수치는 반드시 선관위 API로 교차검증
- **긴급 버그:** `js/data.js:1529–1545` 교육감 support 하드코딩, `data/candidates/candidates_governor_mock.json` mock fallback 경로
- **데이터 현황 (2026-03-25):** 광역단체장 100명, 교육감 81명, 기초단체장 851명, 여론조사 208건
- **일정:** 본후보 등록 5/14~15, 공표금지 5/28~6/3, 선거일 6.3

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
| GSD 마일스톤 v1.0 시작 | 버그 수정 + 파이프라인 자동화 + 품질 개선 동시 목표 | — Pending |

---
*Last updated: 2026-03-29 — GSD v1.0 마일스톤 초기화*
