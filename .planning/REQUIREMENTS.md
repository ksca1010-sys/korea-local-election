# Requirements: v1.3 자동화 파이프라인 반복 안정화

> Generated: 2026-04-04

## Milestone Goal

전체 파이프라인 실패 패턴을 전수 진단·제거하고 실패 감지·복구 시스템을 완성하여 5/14 본후보 수집 전 무인 안정 운영을 달성한다

---

## Active Requirements

### 진단 (DIAG)

- [x] **DIAG-01**: 운영자가 전체 15개 GitHub Actions 워크플로우를 체계적으로 분석하여 미처리 실패 패턴을 목록화한 감사 리포트를 생성할 수 있다

### 크래시 방어 (CRASH)

- [ ] **CRASH-01**: API 응답에 필수 필드(name 등)가 없을 때 KeyError로 크래시하지 않고 경고 로그 후 해당 레코드를 스킵한다
- [ ] **CRASH-02**: 빈 name 또는 필수 필드가 누락된 레코드가 data/ JSON 파일에 저장되지 않는다

### 단계 독립성 (INDEP)

- [ ] **INDEP-01**: 각 워크플로우의 개별 단계가 독립적으로 실행되어 앞 단계 실패 시에도 커밋 단계까지 도달한다
- [ ] **INDEP-02**: 스키마 검증(validate_pipeline.py 또는 동급 검증)이 후보 외 주요 파이프라인(여론조사, 재보궐 등)에도 연결된다

### git 안정성 (GIT)

- [ ] **GIT-01**: 여러 워크플로우가 동시 실행될 때 git push 충돌(race condition)이 발생하지 않는다

### 모니터링 (MON)

- [ ] **MON-01**: 15개 전체 워크플로우의 실패가 monitor_failures.py에 의해 감지·기록된다
- [ ] **MON-02**: 연속 실패 시 GitHub Issue 자동 생성, 복구 시 자동 닫기가 모든 감시 대상 워크플로우에 적용된다

### 권한 정규화 (PERM)

- [ ] **PERM-01**: 모든 워크플로우의 permissions 블록이 최소 권한 원칙에 따라 일관되게 설정되어 HTTP 403 등 권한 오류가 발생하지 않는다

---

## Previous Milestone Requirements (v1.2 — 날짜 잠금, 미변경)

### 데이터 수집 (DATA)

- [ ] **DATA-01**: 운영자가 2026-05-14에 `fetch_nec_candidates.py --log-raw`를 실행하여 NEC 본후보 API로부터 실제 후보자 데이터를 수집한다
- [ ] **DATA-02**: 수집된 본후보 데이터가 기존 예비후보 데이터와 병합·검증되어 `data/candidates/` JSON에 반영된다

### 개표 시스템 (ELEC)

- [ ] **ELEC-01**: 운영자가 2026-05-26 이후 Chrome DevTools로 NEC 개표 API URL을 캡처하여 `workers/election-night/index.js`의 `NEC_URL` 상수에 기입한다
- [ ] **ELEC-02**: `parseNECResponse()` 함수 내 TODO 마커 14곳이 실제 API 응답 구조에 맞게 업데이트된다
- [ ] **ELEC-03**: 업데이트된 Worker가 wrangler 배포 후 통합 테스트를 통과한다

### 운영 실행 (OPS)

- [ ] **OPS-01**: 운영자가 2026-05-27에 GitHub Actions `update-polls.yml` 워크플로우를 수동으로 disable한다
- [ ] **OPS-02**: 운영자가 2026-06-01~02에 `workers/DEPLOY-CHECKLIST.md` 27항목을 순서대로 실행하여 선거일 최종 배포를 완료한다
- [ ] **OPS-03**: 운영자가 2026-06-03 선거 당일 개표 실시간 시각화 및 Worker 상태를 모니터링한다
- [ ] **OPS-04**: 2026-06-04 이후 최종 선거 결과 데이터가 정적 파일로 아카이브되어 영구 보존된다

---

## Future Requirements

- 선거 결과 분석 시각화 (득표율 분포 차트, 지역별 색상 강도 등) — 선거 후 별도 마일스톤 검토
- 다음 선거 (2030 또는 재보궐)를 위한 프로젝트 리셋 절차

---

## Out of Scope

- 자동화 테스트 인프라 구축 — 수동 검증으로 충분, 바닐라 JS 스택 유지 원칙
- 신규 UI 기능 추가 — v1.3은 파이프라인 안정화, 기능 개발 없음
- 서버사이드 로직 도입 — Cloudflare Pages 정적 호스팅 제약 유지

---

## Traceability

| REQ-ID | Phase | Plan | Status |
|--------|-------|------|--------|
| DIAG-01 | Phase 12 | 12-01 | Done |
| CRASH-01 | Phase 12 | TBD | Pending |
| CRASH-02 | Phase 12 | TBD | Pending |
| PERM-01 | Phase 12 | TBD | Pending |
| INDEP-01 | Phase 13 | TBD | Pending |
| INDEP-02 | Phase 13 | TBD | Pending |
| GIT-01 | Phase 13 | TBD | Pending |
| MON-01 | Phase 14 | TBD | Pending |
| MON-02 | Phase 14 | TBD | Pending |
